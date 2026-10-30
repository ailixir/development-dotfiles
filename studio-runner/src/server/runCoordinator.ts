import type { AdmissionReceipt, AdmissionRequest, BuildIdentity, ObservedJob, ValidationVerdict } from '../executor/observedOperations.js';
import { validateObservedJob, validateObservedRequest } from '../validator/observedReplay.js';
import { demand, ObservedRefusal, validateObserved } from '../validator/observedReferencePolicy.js';
import { admitObserved } from '../reporting/admissionClient.js';
/**
 * `POST /v2/runs`: order of operations, admission and the run itself (AC-6..AC-10, AC-12..AC-21).
 *
 * ## The order, and why it is this order
 *
 * ```
 * validate the closed observed job  →  reserve a capacity slot  →  observed admission  →  202
 * ```
 *
 * Nothing observable happens before the CAS returns success: **no browser, no child process, no
 * scratch directory, no evidence key.** Validation comes first so an invalid job never consumes
 * capacity and never reaches the API. The slot comes before the admission call so the runner
 * cannot promise the API work it has no room for. The `202` comes after the CAS, never before,
 * because a `202` the API did not grant is a run nobody owns.
 *
 * ## The three refusals, which are not interchangeable
 *
 * | Situation | Answer | Readiness | Admission request issued? |
 * |---|---|---|---|
 * | Pool saturated | `429` + `Retry-After` | stays **true** | **no** — decided before the API is contacted |
 * | Draining | `503` | **false** | no |
 * | API refused or ambiguous (any non-`200`, timeout, transport, redirect, malformed receipt) | `503` | true | one, and only one — **never resent** |
 *
 * `429` is a *definite non-acceptance*: no slot held, no admission issued, no scratch, no browser,
 * nothing durable anywhere. It is decidable before the runner talks to the API at all, which is
 * why the capacity check is the first thing after validation and not a consequence of the API
 * saying no.
 *
 * Saturation and draining are different conditions with different answers. A busy pod is healthy
 * and stays in its Service; a draining pod is leaving. Conflating them makes Kubernetes evict a
 * pod for being busy.
 *
 * ## Everything after `202`
 *
 * The run executes detached from the request. Scratch is created, the browser is launched,
 * `STARTED` is reported *after* the launch resolves, steps flow through the `StepReporter`
 * seam, and the terminal report is delivered with byte-identical bounded retry. Every exit path —
 * success, failure, throw, drain, cancel — clears scratch, wipes the resolved values and releases
 * the slot.
 *
 * ## Cancel (`DELETE /v2/runs/{id}`, Studio v1 WP4)
 *
 * A cancel is the deadline's stop for a different reason: the parent orders the stop, the child
 * gets `browserStopTimeoutMs` (default 5 s) to close its context and finalize the recording, and
 * then the process tree is killed. The outcome is `ERROR` / `CANCELLED` and the evidence is
 * whatever the recorder achieved. A run cancelled before its browser started never starts one.
 *
 * | The run is | `DELETE` answers | What happens |
 * |---|---|---|
 * | admitted, browser not yet running | `202 CANCELLING` | no browser is launched, or the launch in progress is aborted before any step |
 * | running | `202 CANCELLING` | ordered stop, bounded grace, process tree |
 * | already stopping for a cancel | `202 CANCELLING` | nothing new is ordered |
 * | past its outcome (evidence, delivery) or recently finished | `409 RUN_FINISHED` | nothing |
 * | unknown to this runner | `404 RUN_NOT_FOUND` | nothing |
 *
 * **The `DELETE` is only the fast path.** It goes through the runner Service, and with more than
 * one pod it can land on one that does not hold the run. So the pod that does hold it also *pulls*
 * the cancel (ADR-002 §29): it reads `GET /internal/studio/executions/{id}/control` every
 * {@link CONTROL_POLL_INTERVAL_MS} from admission until the outcome is known, and it honours
 * `cancelRequested` on every progress acknowledgement. All three signals take the same path.
 */
import { createRedactor } from '../executor/redaction.js';
import type { StepReporter } from '../executor/stepReporter.js';
import {
  ObservedPreReadyFailure,
  RUNNER_ERROR_CODES,
  OBSERVED_RUNNER_ERROR_CODES,
  RUN_FAILURE_KINDS,
  errorCodeFor,
  resultFor,
} from '../run/errors.js';
import type { RunFailureKind } from '../run/errors.js';
import {
  SYSTEM_DEADLINE_TIMERS,
  createRuntimeDeadline,
  effectiveRuntimeCapMs,
  effectiveStepTimeoutMs,
} from '../run/deadline.js';
import type { DeadlineTimers, ServerDeadlineMaxima } from '../run/deadline.js';
import {
  openEvidenceWindow,
  uploadRecording,
  writeResultManifest,
} from '../run/evidenceUpload.js';
import type { EvidenceFileSystem, EvidenceUploadBounds } from '../run/evidenceUpload.js';
import { buildResultManifest, serializeResultManifest } from '../run/manifest.js';
import { RESULT_MANIFEST_CONTENT_TYPE } from '../run/manifest.js';
import type { ObjectStoreClient } from '../run/objectStore.js';
import { newAdmissionIdentity } from '../reporting/admissionClient.js';
import type { HttpClient, HttpOutcome } from '../reporting/httpClient.js';
import type { JobEnvelope } from '../reporting/envelope.js';
import type { ReportBounds } from '../reporting/bounds.js';
import { ackRequestsCancel, validSecretControl, createReportClient } from '../reporting/reportClient.js';
import { createRunSnapshot } from '../reporting/snapshot.js';
import {frozenSecretConsumers} from '../run/secretUse.js';
import type { EvidenceState, RunOutcome, RunSnapshot } from '../reporting/snapshot.js';
import { createRunReporter } from '../reporting/reportingStepReporter.js';
import type {
  BrowserLauncher,
  BrowserSession,
  SessionRecording,
  ScratchStore,
  SessionKillOutcome,
  SessionKillReason,
  SessionRunResult,
} from './adapters.js';
import type { CapacityPool } from './capacity.js';
import type { Logger } from './logging.js';

export interface RunDecision {
  readonly status: 202 | 400 | 409 | 429 | 503;
  readonly code: string;
  readonly retryAfterSeconds?: number;
}

/** The answer to `DELETE /v2/runs/{id}` (ADR-002 §29). */
export interface CancelDecision {
  readonly status: 202 | 404 | 409;
  readonly code: 'CANCELLING' | 'RUN_NOT_FOUND' | 'RUN_FINISHED';
}

/**
 * How many finished runs are remembered so a late cancel can answer `409` rather than `404`.
 * Bounded: a runner serves one browser at a time, and the API relays a cancel within seconds.
 */
export const FINISHED_RUNS_REMEMBERED = 256;

/**
 * How often an active run reads its control state (ADR-002 §29). Two seconds keeps a cancel
 * observed within about three whatever pod holds the run, at one primary-key read per active run.
 * A constant, like `MAX_CHILD_OUTPUT_LINES`: it is a latency promise, not a deployment knob.
 */
export const CONTROL_POLL_INTERVAL_MS = 2_000;

/**
 * How far before a secret-bearing control window closes the runner acts on it. Timers only ever
 * fire late, so a stop scheduled exactly at the window end lands after it; acting this much earlier
 * keeps the stop inside the bound. It never extends a window.
 */
export const CONTROL_WINDOW_MARGIN_MS = 25;

/**
 * What a step the cancel interrupted says about itself (Studio v1 decision D1).
 *
 * Fixed and value-free: it names no step text, no URL, no locator and no Playwright error. It is
 * written on the `FINAL` only for a step that started and was never reported finished because the
 * child was killed before it could say anything about it (the cancel's grace ran out).
 */
export const STOPPED_STEP_MESSAGE = 'The run was stopped before this step finished.';

/**
 * The step reporter that remembers which steps started and have not finished (ADR-002 §29.2).
 *
 * `open()` lists them for the cancel's kill path, where the child was signalled before it reported
 * the step it was in. Every event is forwarded unchanged: the observed child reports the step a
 * stop interrupted itself, with its own closed error code, and that report is never rewritten here.
 *
 * Scoped to `cancel` by its caller: a deadline or a drain kill is a different condition with its
 * own rules (§18.1 has the API name a `TIMEOUT` step still `RUNNING`).
 */
function openStepTracker(
  reporter: StepReporter,
): StepReporter & {
  open(): readonly { readonly stepIndex: number; readonly startedAtMs: number }[];
  interrupted(): readonly { readonly stepIndex: number; readonly startedAtMs: number }[];
} {
  const open = new Map<number, number>();
  // Steps the child itself ended for the stop's reason (`FAIL` / `CANCELLED`, its closed code). Remembered only so that
  // a self-stop the API never recorded can say what the kill path says (R10c); the event itself is forwarded unchanged.
  const stoppedByChild = new Map<number, number>();
  return {
    stepStarted(event): void {
      open.set(event.stepIndex, event.startedAtMs);
      reporter.stepStarted(event);
    },
    stepFinished(event): void {
      const startedAtMs = open.get(event.stepIndex);
      open.delete(event.stepIndex);
      if (event.status === 'FAIL' && event.failure === RUNNER_ERROR_CODES.CANCELLED && startedAtMs !== undefined) stoppedByChild.set(event.stepIndex, startedAtMs);
      reporter.stepFinished(event);
    },
    open(): readonly { readonly stepIndex: number; readonly startedAtMs: number }[] {
      return [...open].map(([stepIndex, startedAtMs]) => ({ stepIndex, startedAtMs }));
    },
    interrupted(): readonly { readonly stepIndex: number; readonly startedAtMs: number }[] {
      return [...stoppedByChild].map(([stepIndex, startedAtMs]) => ({ stepIndex, startedAtMs }));
    },
  };
}

/**
 * Who asked for a stop. `control-window` is the secret-bearing fail-closed self-stop (the control
 * read missed its window or was not a valid secret control body); every other source is backed by a
 * fact the API recorded (012A ruling R8.1).
 */
type StopSource = 'delete' | 'progress-ack' | 'control' | 'control-window';

/**
 * Which branch of the secret-bearing control tick ended the run on its own (STUDIO-OBS-009 AC-11 i, R10-OBS-2).
 *
 * A closed label and two integers, nothing else: no value, no URL, no text. `latenessMs` is how long after its window
 * opened the tick began; `durationMs` is how long the tick had been running when it decided.
 */
export type ControlWindowBranch = 'noRequestBudget' | 'noTimerBudget' | 'windowPassed' | 'invalidControlBody';
interface ControlWindowAttribution {
  readonly branch: ControlWindowBranch;
  readonly latenessMs: number;
  readonly durationMs: number;
}

/** One admitted run's cancel handle. Registered at admission, dropped when its outcome is known. */
interface RunControl {
  /** A stop was ordered, for any reason. The first stop wins; a second is never ordered. */
  cancelled: boolean;
  /**
   * The stop is backed by a fact the API recorded: the `DELETE` relay, or a progress or control
   * acknowledgement carrying `cancelRequested` or `revoked` (012A ruling R8.1). Only this makes a
   * pre-Ready stop the runner's `CANCELLED`; a control-window loss the runner decided alone is not
   * a cancel anyone requested and is reported as a run fault with the launcher's fixed reason.
   */
  recorded: boolean;
  /** Present while a started session can be stopped; the same `endRun` the deadline uses. */
  end: ((reason: SessionKillReason) => void) | null;
}

export interface ObservedRunnerSupport { readonly build:BuildIdentity; readonly validationEnabled:boolean; readonly replayEnabled:boolean; }
export interface RunCoordinatorOptions {
  readonly observed?: ObservedRunnerSupport;
  /** The runner's navigation whitelist (`STUDIO_RUNNER_ALLOWED_DOMAINS`); a job's destinations must be on it. */
  readonly allowedDomains: readonly string[];
  readonly pool: CapacityPool;
  readonly launcher: BrowserLauncher;
  readonly scratch: ScratchStore;
  readonly http: HttpClient;
  readonly logger: Logger;
  readonly bounds: ReportBounds;
  readonly runtimeVersions: Readonly<Record<string, unknown>>;
  readonly runnerInstanceId: string;
  readonly callbackBaseUrl: string;
  readonly callbackIdentityToken: string;
  readonly retryAfterSeconds: number;
  readonly reportTimeoutMs: number;
  readonly terminal: {
    readonly windowMs: number;
    readonly maxAttempts: number;
    readonly backoffMs: number;
  };
  /**
   * Where the terminal evidence goes (story 10.14 AC-1, AC-2).
   *
   * Write-only by construction: the type has one operation and no read. The runner holds no Get
   * and no List permission (§6.2), and this is the same fact stated where the code can enforce it.
   */
  readonly objectStore: ObjectStoreClient;
  /** Bounds for the evidence phase — attempts, window and backoff (AC-5). */
  readonly evidence: EvidenceUploadBounds;
  /**
   * The filesystem the uploader may touch.
   *
   * Injected so AC-5's "zero whole-file reads, at any recording size" is a **counted** fact: the
   * port declares a whole-file read the uploader never performs, and a test counts it.
   */
  readonly evidenceFileSystem: EvidenceFileSystem;
  readonly now: () => number;
  readonly wallClock: () => Date;
  readonly sleep: (ms: number) => Promise<void>;
  readonly random: () => number;
  /**
   * The enumerated server limits a job's deadlines are clamped to (AC-6, §5.2).
   *
   * Read from configuration by `createApplication`, so a job cannot enlarge them and there is no
   * key outside `KEY_SPECS` that can either.
   */
  readonly maxima: ServerDeadlineMaxima;
  /**
   * The timer facility the runtime deadline arms on.
   *
   * Injected alongside `now` and `sleep`, and for the same reason those already are: the
   * behavioural suite drives an exact schedule rather than sleeping, so "the kill was ordered
   * `totalRuntimeMs` after the browser start" is an assertion rather than a race.
   */
  readonly timers?: DeadlineTimers | undefined;
  /**
   * The timer facility the control read is scheduled on (ADR-002 §29). Separate from `timers` so a
   * test that drives the runtime deadline exactly is not also driving the poll, and the reverse.
   */
  readonly controlTimers?: DeadlineTimers | undefined;
}

export interface RunCoordinator {
  validateObserved?(body:unknown): ValidationVerdict;
  /**
   * The whole of `POST /v2/runs` after the body has been read and parsed.
   *
   * Synchronous up to and including the slot acquire: there is no `await` between observing free
   * capacity and holding the slot, which is the falsifiable half of AC-10.
   */
  submitObserved?(body:unknown): Promise<RunDecision>;
  /** Resolves when every admitted run has delivered its terminal report or run out of time. */
  awaitInFlight(timeoutMs: number): Promise<boolean>;
  /**
   * Ends every run still in flight: ordered stop, bounded grace, process-group kill (AC-15).
   *
   * The drain's last resort. §9.3 requires admitted work to be drained on `SIGTERM` and §5.4
   * requires the runner not to be the thing a reaper has to guess at — a runner that exits holding
   * a browser is exactly that. A run ended this way still delivers a terminal report, because the
   * kill makes its awaited result resolve rather than abandoning it.
   *
   * Returns how many runs were actually ended. A run still inside `launcher.launch` is counted too:
   * its launch is aborted on the same path, so no browser it was starting can outlive the drain.
   */
  terminateInFlight(): number;
  /**
   * `DELETE /v2/runs/{id}` (Studio v1 WP4, ADR-002 §29). Synchronous: it records the request and
   * orders the stop if a session exists; the run's own path delivers the `FINAL` report.
   */
  cancel(executionId: string): CancelDecision;
  readonly inFlight: number;
}

/**
 * A refusal with a name from `src/run/errors.ts`.
 *
 * Carrying the *kind* rather than the code keeps the mapping in one exhaustive switch: a new
 * failure condition fails the type-check instead of inventing a string here (AC-17).
 */
class RunFailure extends Error {
  readonly kind: RunFailureKind;

  constructor(kind: RunFailureKind, message: string) {
    super(message);
    this.name = 'RunFailure';
    this.kind = kind;
  }
}

/** Narrows the session's string back to a kind; anything unrecognised is a run fault. */
function readFailureKind(value: string | null): RunFailureKind | null {
  if (value === null) return null;
  return (RUN_FAILURE_KINDS as readonly string[]).includes(value)
    ? (value as RunFailureKind)
    : 'run-fault';
}

export function createRunCoordinator(options: RunCoordinatorOptions): RunCoordinator {
  const { pool, launcher, scratch, logger } = options;
  const inFlight = new Set<Promise<void>>();
  /** One entry per run that has a killable session; removed when the run leaves (AC-15). */
  const terminators = new Set<(reason: SessionKillReason) => void>();
  /** Admitted runs whose outcome is not yet known, by execution id (ADR-002 §29). */
  const controls = new Map<string, RunControl>();
  /** Recently finished execution ids, oldest first, bounded by {@link FINISHED_RUNS_REMEMBERED}. */
  const finished = new Set<string>();

  function rememberFinished(executionId: string): void {
    finished.delete(executionId);
    finished.add(executionId);
    while (finished.size > FINISHED_RUNS_REMEMBERED) {
      const oldest = finished.values().next().value;
      if (oldest === undefined) break;
      finished.delete(oldest);
    }
  }

  /**
   * Records a stop and orders it if a session exists. Idempotent; one path for all signals.
   *
   * `recorded` is noted before the idempotent return, so a recorded cancel arriving after the
   * runner already stopped itself still upgrades the fact while the pre-Ready failure kind is open
   * (012A ruling R8.1). It never orders a second stop.
   */
  function requestStop(executionId: string, control: RunControl, source: StopSource, attribution?: ControlWindowAttribution): void {
    const recorded = source !== 'control-window';
    if (recorded) control.recorded = true;
    if (control.cancelled) return;
    control.cancelled = true;
    logger.info('run.cancel_requested', { executionId, source, recorded: control.recorded, ...(attribution ?? {}) });
    control.end?.('cancel');
  }

  function controlUrl(executionId: string): string {
    const base = options.callbackBaseUrl.endsWith('/')
      ? options.callbackBaseUrl.slice(0, -1)
      : options.callbackBaseUrl;
    return `${base}/internal/studio/executions/${encodeURIComponent(executionId)}/control`;
  }

  /**
   * Reads the run's control state every {@link CONTROL_POLL_INTERVAL_MS} until stopped (ADR-002
   * §29). One request at a time: the next read is scheduled only after the previous one settled.
   * A failed read changes nothing and the next one tries again; the API's reaper is the backstop.
   */
  function startControlPoll(executionId: string, control: RunControl, secretBearing: boolean): () => void {
    const timers = options.controlTimers ?? SYSTEM_DEADLINE_TIMERS;
    // An object, not a `let`: the flag is flipped by the returned closure while a read is awaited.
    const poll = { stopped: false };
    const isStopped = (): boolean => poll.stopped;
    let timer: unknown = null;
    let nextPoll = options.now() + (secretBearing ? 1000 : CONTROL_POLL_INTERVAL_MS);
    const schedule = (): void => {
      if (isStopped()) return;
      timer = timers.set(() => {
        timer = null;
        void tick();
      }, secretBearing ? Math.max(0, nextPoll - options.now()) : CONTROL_POLL_INTERVAL_MS);
    };
    const tick = async (): Promise<void> => {
      if (isStopped() || control.cancelled) return;
      let deadlineTimer: unknown = null;
      const tickStartedAt = options.now();
      const windowStart = nextPoll;
      // Integers only (R10-OBS-2): never a fraction, never negative, never a non-number.
      const whole = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);
      const selfStop = (branch: ControlWindowBranch): void => {
        requestStop(executionId, control, 'control-window', { branch, latenessMs: whole(tickStartedAt - windowStart), durationMs: whole(options.now() - tickStartedAt) });
      };
      const windowEnd = secretBearing ? nextPoll + 1000 - CONTROL_WINDOW_MARGIN_MS : null;
      const requestBudget = windowEnd === null ? options.reportTimeoutMs : Math.min(1000, windowEnd - options.now());
      if (secretBearing && !(requestBudget > 0)) { selfStop('noRequestBudget'); return; }
      const sent = options.http.send({
        url: controlUrl(executionId),
        method: 'GET',
        headers: { authorization: `Bearer ${options.callbackIdentityToken}` },
        body: '',
        timeoutMs: requestBudget,
      });
      const request = secretBearing ? sent.catch(() => ({kind: 'timeout' as const})) : sent;
      const timerBudget = windowEnd === null ? null : Math.min(1000, windowEnd - options.now());
      if (timerBudget !== null && !(timerBudget > 0)) { selfStop('noTimerBudget'); return; }
      const outcome = await (timerBudget !== null ? Promise.race([request, new Promise<HttpOutcome>(resolve => { deadlineTimer = timers.set(() => { resolve({kind: 'timeout'}); }, timerBudget); })]) : request);
      if (deadlineTimer !== null) timers.clear(deadlineTimer);
      if (isStopped()) return;
      if (windowEnd !== null && options.now() >= windowEnd) {
        // Too late to authorize anything, but a valid answer still says what the API recorded. A revocation or cancel it carries is a
        // recorded fact (R10c, ruling A12: the R8 `recorded` upgrade covers revocation facts), so the run keeps outer CANCELLED.
        if (outcome.kind === 'response' && outcome.status === 200 && validSecretControl(outcome.body, executionId) && ackRequestsCancel(outcome.body)) control.recorded = true;
        selfStop('windowPassed');
        return;
      }
      if (secretBearing && !(outcome.kind === 'response' && outcome.status === 200 && validSecretControl(outcome.body, executionId))) { selfStop('invalidControlBody'); return; }
      nextPoll += secretBearing ? 1000 : CONTROL_POLL_INTERVAL_MS;
      if (outcome.kind === 'response' && outcome.status === 200 && ackRequestsCancel(outcome.body)) {
        requestStop(executionId, control, 'control');
        return;
      }
      schedule();
    };
    schedule();
    return () => {
      poll.stopped = true;
      if (timer !== null) timers.clear(timer);
      timer = null;
    };
  }

  /** Throws the cancel's failure when the run was cancelled before it had a session to stop. */
  function refuseIfCancelled(control: RunControl, stage: string): void {
    if (control.cancelled) {
      throw new RunFailure('cancelled', `The run was cancelled ${stage}; no browser step ran.`);
    }
  }

  async function execute(
    job: JobEnvelope,
    admissionId: string,
    admittedAtMs: number,
    control: RunControl,
    observed: {job:ObservedJob;admission:AdmissionReceipt},
  ): Promise<void> {
    const identity = {
      executionId: job.executionId,
      attemptId: job.attemptId,
      admissionId,
      runnerInstanceId: options.runnerInstanceId,
    };
    // Observed producers are closed/data-free before serialization; raw child output is discarded.
    // Scrubbing arbitrary input substrings here would corrupt protocol keys/statuses such as PASS.
    const redactor = createRedactor([]);
    const reportRuntimeVersions = {...options.runtimeVersions,observedProfile:JSON.stringify(observed.job.binding.requiredProfile),observedBuild:JSON.stringify(observed.job.binding.requiredBuild)};
    const snapshot = createRunSnapshot({
      allowUnstartedSkippedSteps:true,observedSecretConsumers:frozenSecretConsumers(observed.job.artifact.inputRecipes,observed.job.artifact.steps),
      identity,
      bounds: options.bounds,
      runtimeVersions: reportRuntimeVersions,
      wallClock: options.wallClock,
      // The call-site guard over the truncating log buffer (AC-22). Every producer reachable from
      // this run reaches `logs.append` through `snapshot.appendLog`, and this is what makes
      // "callers redact first" a property of the code rather than of today's callers.
      redactor,
    });
    const client = createReportClient({
      http: options.http,
      baseUrl: options.callbackBaseUrl,
      identityToken: options.callbackIdentityToken,
      bounds: options.bounds,
      logger: logger.withRedactor(redactor),
      redactor,
      timeoutMs: options.reportTimeoutMs,
      terminal: options.terminal,
      now: options.now,
      sleep: options.sleep,
      random: options.random,
      onCancelRequested: () => {
        requestStop(job.executionId, control, 'progress-ack');
      },
    });
    const reporter = createRunReporter({ snapshot, client });
    /**
     * Why the parent ended this run, once it did; the first reason wins, as in the launcher. An
     * object rather than a `let`, for the reason `kills` is a list: it is written inside `endRun`,
     * and a closure assignment is invisible to the type-checker's narrowing at the read below.
     */
    const stopped: { reason: SessionKillReason | null } = { reason: null };
    const stepReporter = openStepTracker(reporter);

    /**
     * The child's stdout and stderr, redacted by **this run's** redactor (AC-8).
     *
     * `logger.withRedactor` serializes the line and then redacts the finished JSON string, so the
     * relay's own redaction is not the only one on the path — but it is the one that happens
     * before the length cap, which is the order that holds. Nothing here is a field of the log
     * line except the bounded text and the AC-13 identity fields.
     */
    const childLogger = logger.withRedactor(redactor);
    const diagnostics = {
      redact: (text: string): string => redactor.redact(text),
      write: (stream: 'stdout' | 'stderr', line: string): void => {
        childLogger.log(stream === 'stderr' ? 'warn' : 'info', 'run.child_output', {
          executionId: job.executionId,
          attemptId: job.attemptId,
          admissionId,
          stream,
          output: line,
        });
      },
    };

    let outcome: RunOutcome = {
      result: 'ERROR',
      errorCode: RUNNER_ERROR_CODES.RUN_ERROR,
      errorMessage: null,
    };
    const evidenceKeys = { videoKey: job.videoKey, manifestKey: job.manifestKey };
    // Echoed from the job's server-derived keys, never invented, derived or accepted from
    // anywhere else (§6.2, AC-9).
    // `partial` is explicit from the start: "absent" is never a value this runner emits
    // (ADR-002 §17.7 item 2).
    let evidence: EvidenceState = { ...evidenceKeys, state: 'UNAVAILABLE', partial: false };

    // ── The runtime budget, clamped before anything is launched (AC-6, §5.2). ────────────────
    //
    // A job asking for less gets less; a job asking for ten minutes of browser time gets the
    // deployment's value. This is computed here rather than inside the launcher because it is the
    // coordinator that holds both budgets and has to keep them apart.
    const runtimeCapMs = effectiveRuntimeCapMs(job.deadlines.totalRuntimeMs, options.maxima);

    /**
     * The parent-clock reading taken when the `ready` handshake is observed (AC-1, AC-2).
     *
     * A **different read** from `admittedAtMs`, which was taken at the CAS. The two are separate
     * fields precisely so nothing can quietly measure the browser's budget from the queue's start.
     */
    let browserReadyAtMs: number | null = null;
    /** The recording the session left in scratch, or null. Read in the terminal path (AC-3). */
    let recordingPath: string | null = null;
    let verifiedFile:SessionRecording['verifiedFile'];
    /** ISO instant of the browser start, for the manifest's timings (§5.3). */
    let browserStartedAtIso: string | null = null;
    let deadline: ReturnType<typeof createRuntimeDeadline> | null = null;
    /**
     * The kill, once ordered. A list rather than a nullable, so "already killing" is a length
     * check that a closure assignment cannot hide from the type-checker.
     */
    const kills: Promise<SessionKillOutcome>[] = [];
    let terminate: ((reason: SessionKillReason) => void) | null = null;

    // Scratch is created here — after the CAS succeeded, never before it (AC-6).
    const runScratch = await scratch.create(admissionId);

    // The pull half of cancel starts with the run and ends, in the `finally` below, when its
    // outcome is known (ADR-002 §29).
    const stopControlPoll = startControlPoll(job.executionId, control, job.references.secrets.length > 0);

    try {
      // ── Before any browser process exists (AC-2). ───────────────────────────────────────────
      //
      // Revalidation is deliberately here rather than in the child: "no Chromium process is
      // created" is only true if the refusal happens before the spawn seam is touched, and the
      // child cannot refuse a spawn that has already happened.
      const support=options.observed;demand(support?.replayEnabled,'PROFILE_MISMATCH');
      // Grant freshness was established at admission; no renewal/regrant is made after it.
      validateObservedJob(observed.job,support.build,options.allowedDomains,Date.parse(observed.admission.admittedAt));
      // ── The start deadline is a refusal, not a race (AC-4, §5.2). ──────────────────────────
      const elapsedSinceAdmission = options.now() - admittedAtMs;
      if (elapsedSinceAdmission >= job.deadlines.admittedStartMs) {
        throw new RunFailure(
          'start-deadline',
          `The admitted-start deadline of ${String(job.deadlines.admittedStartMs)}ms elapsed ` +
            'before the run reached the launch point; no browser was started.',
        );
      }

      // The last point at which a cancel costs nothing: no browser exists yet (ADR-002 §29).
      refuseIfCancelled(control, 'before its browser was launched');

      let session: BrowserSession;
      const launchAbort=new AbortController();
      const stopLaunch=():void=>{launchAbort.abort();};
      control.end=stopLaunch;terminators.add(stopLaunch);
      try {
        session = await launcher.launch({
          browser: job.configuration.browser,
          viewport: job.configuration.viewport,
          // ── Clamped to the server's limits. A job asks; the deployment decides (AC-6). ─────
          totalRuntimeMs: runtimeCapMs,
          stepTimeoutMs: effectiveStepTimeoutMs(job.configuration.timeoutSeconds, options.maxima),
          scratchPath: runScratch.path,
          diagnostics,
          observed,
          signal: launchAbort.signal,
        });
      } catch (error) {
        if(error instanceof ObservedPreReadyFailure){
          recordingPath=error.recording.path;verifiedFile=error.recording.verifiedFile;evidence={...evidenceKeys,state:error.recording.state,partial:error.recording.partial};
          // ADMITTED ownership permits FINAL, but not PROGRESS before a real STARTED.
          // Record unexecuted coordinates locally; sendFinal delivers the cumulative snapshot.
          for(const step of observed.job.artifact.steps)snapshot.stepFinished({stepIndex:step.stepIndex,status:'SKIPPED',startedAtMs:null,finishedAtMs:null,durationMs:null,failure:null});
          // Outer CANCELLED only for a stop the API recorded; a self-stop is a run fault (R8.1).
          throw new RunFailure(control.cancelled&&control.recorded?'cancelled':'run-fault',error.code);
        }
        throw new RunFailure(
          'browser-launch',
          error instanceof Error ? error.message : 'The browser did not start.',
        );
      } finally {terminators.delete(stopLaunch);if(control.end===stopLaunch)control.end=null;}

      // ── The origin: one instant, observed twice, at the browser start (AC-10, AC-11.2). ────
      const origin = session.run.origin;
      // Only now. Not on admission, not when the launch call began (AC-14a, AC-20).
      reporter.browserStarted(origin);
      browserStartedAtIso = origin.browserStartedAt.toISOString();

      // ── The second budget starts **here** (AC-1, AC-2, §8.5). ─────────────────────────────
      //
      // `browserReadyAtMs` is a separate read of the parent's monotonic clock from
      // `admittedAtMs`, which was taken at the CAS. That is the whole of "queue time and browser
      // runtime are separate budgets": a run that spent nine-tenths of its queue budget waiting
      // still gets the whole of its browser time, because the timer is armed from this instant
      // and the arithmetic never subtracts one budget from the other.
      //
      // The clock is the parent's, and the reading is never converted into a run-timeline
      // position: the child owns that scale and the parent must not re-base onto it (§11.5).
      browserReadyAtMs = options.now();
      // Both instants, on one line, so "they are not the same read" is observable rather than
      // argued (AC-1). `runtimeCapMs` is beside them because the interesting property is that it
      // does **not** shrink as `browserReadyAtMs - admittedAtMs` grows.
      childLogger.info('run.browser_started', {
        executionId: job.executionId,
        attemptId: job.attemptId,
        admissionId,
        admittedAtMs,
        browserReadyAtMs,
        runtimeCapMs,
      });

      const runSession = session.run;
      /**
       * One path for both reasons a parent ends a run it started (AC-3, AC-15).
       *
       * Idempotent: the drain can arrive while the deadline is already killing, and the second
       * caller must not order a second stop or reclassify the first one's reason.
       */
      const endRun = (reason: SessionKillReason): void => {
        if (kills.length > 0) return;
        stopped.reason = reason;
        // The entry is written before the signal, so a report built from a snapshot taken
        // mid-kill already names the cause (AC-3, ADR-002 §17.7 item 1).
        snapshot.appendLog({
          // `null`, not `0` and not a computed elapsed time: the parent holds no reading on the
          // run timeline, and `null` is what the contract provides for exactly this (ADR-002
          // §INT-1, §11.2). A wall-derived number would be the second origin §11.5 forbids.
          // Bounded by `maxLogEntryLength` like every other entry (AC-10).
          atMs: null,
          level: 'error',
          message:
            reason === 'total-runtime'
              ? `The total browser runtime deadline of ${String(runtimeCapMs)}ms was reached; ` +
                'the browser process tree is being stopped.'
              : reason === 'cancel'
                ? 'The run was cancelled; the browser process tree is being stopped.'
                : 'The runner drained while this run was still in flight; the browser process ' +
                  'tree is being stopped.',
        });
        kills.push(runSession.kill(reason));
      };
      terminate = endRun;
      terminators.add(endRun);
      control.end = endRun;

      deadline = createRuntimeDeadline({
        capMs: runtimeCapMs,
        now: options.now,
        timers: options.timers ?? SYSTEM_DEADLINE_TIMERS,
        onExpire: () => {
          endRun('total-runtime');
        },
      });
      deadline.arm();

      // A cancel that arrived while the browser was launching: stop it before a step is sent. The
      // session is closed by the `finally` below exactly as on every other path.
      if (control.cancelled) {
        await session.close();
        throw new RunFailure(
          'cancelled',
          'The run was cancelled while its browser was starting; no browser step ran.',
        );
      }

      let result: SessionRunResult;
      try {
        result = await runSession.execute({ reporter: stepReporter });
      } finally {
        deadline.cancel();
        await session.close();
      }

      // The kill, if one was ordered, is settled by the time `execute` resolves — but its promise
      // is awaited here anyway, so nothing is still in flight when scratch is cleared (AC-5a).
      await Promise.all(kills);

      const failureKind = readFailureKind(result.failureKind);
      outcome =
        failureKind === null
          ? { result: 'PASSED', errorCode: null, errorMessage: null }
          : {
              result: resultFor(failureKind),
              errorCode: errorCodeFor(failureKind),
              errorMessage:
                result.failureMessage === null ? null : redactor.redact(result.failureMessage),
            };

      outcome = { ...outcome, secretUse: result.secretUse ?? {} };
      if (result.failureMessage === 'LOGIN_REQUIRED' && result.detail) outcome = { ...outcome, result: 'FAILED', errorCode: OBSERVED_RUNNER_ERROR_CODES.LOGIN_REQUIRED, errorMessage: null, detail: result.detail };
      else if (result.failureMessage === 'REFERENCE_MISMATCH') outcome = { ...outcome, result: 'ERROR', errorCode: OBSERVED_RUNNER_ERROR_CODES.REFERENCE_MISMATCH, errorMessage: null };
      else if (result.failureMessage === 'PASSWORD_CONTROL_READ_REFUSED') outcome = { ...outcome, result: 'FAILED', errorCode: OBSERVED_RUNNER_ERROR_CODES.PASSWORD_CONTROL_READ_REFUSED, errorMessage: null };
      // Evidence and outcome are settled independently, in that order, and neither reads the
      // other (§6.1, AC-8, ADR-002 §17.4). `partial` comes from the session's observation of how
      // the **recorder** ended — never from `outcome`, `errorCode` or any step status. There is
      // deliberately no expression below in which `outcome` appears.
      evidence = {
        ...evidenceKeys,
        state: result.recording.state,
        partial: result.recording.partial,
      };
      recordingPath = result.recording.path;
      verifiedFile=result.recording.verifiedFile;
      if (result.recording.error !== null) {
        snapshot.appendLog({
          atMs: null,
          level: 'error',
          message: `recording failed: ${redactor.redact(result.recording.error)}`,
        });
      }
    } catch (error) {
      const failureKind = error instanceof RunFailure ? error.kind : 'run-fault';
      outcome = {
        result: resultFor(failureKind),
        errorCode: errorCodeFor(failureKind),
        errorMessage: redactor.redact(
          error instanceof RunFailure
            ? error.message
            : error instanceof Error
              ? error.name
              : 'unknown',
        ),
      };
    } finally {
      if (terminate !== null) terminators.delete(terminate);
      // The outcome is known from here on: a cancel arriving now is answered `409`, never obeyed,
      // and the control read stops.
      stopControlPoll();
      control.end = null;
      controls.delete(job.executionId);
      rememberFinished(job.executionId);
      // Every exit path reaches here — success, step failure, launch failure, start-deadline
      // refusal, **runtime-deadline kill**, run fault and drain — which is why the kill is made to
      // resolve `execute` rather than to abandon it. A kill that left the awaited promise pending
      // would skip this block entirely and leak the slot, the scratch directory and the values.
      deadline?.cancel();

      // Progress deliveries settle before the terminal report is built, so FINAL always carries
      // the highest sequence number of the attempt.
      await reporter.settled();

      // R10c (STUDIO-OBS-009 AC-11 f-h, T0 ruling A12; 012A R8-OBS-1). After Ready, a stop the API never recorded (the
      // secret control window the runner decided alone, source `control-window`) is a run fault, not a cancel anyone asked
      // for: outer RUN_ERROR with the closed reason CANCELLED, exactly as R8.1 does before Ready. It is decided HERE, after
      // the progress deliveries have settled, because an acknowledgement is where a revocation or cancel the API did record
      // reaches a run whose control read was lost, and that fact (`control.recorded`) keeps the outer CANCELLED the API maps
      // to AUTHORIZATION_REVOKED. No new vocabulary: both values exist; no window, deadline, TTL or margin moves.
      const selfStopped = outcome.errorCode === RUNNER_ERROR_CODES.CANCELLED && control.cancelled && !control.recorded && browserStartedAtIso !== null;
      if (selfStopped) {
        outcome = { ...outcome, result: 'ERROR', errorCode: RUNNER_ERROR_CODES.RUN_ERROR, errorMessage: RUNNER_ERROR_CODES.CANCELLED };
        // The step the stop interrupted says what the kill path already says (below): stopped, not judged. A child that
        // honoured the stop reported it `FAIL` with its own closed code; that code is not a verdict on the step either.
        for (const step of stepReporter.interrupted()) {
          snapshot.stepFinished({ stepIndex: step.stepIndex, status: 'SKIPPED', startedAtMs: step.startedAtMs, finishedAtMs: null, durationMs: null, failure: STOPPED_STEP_MESSAGE });
          snapshot.appendLog({ atMs: null, level: 'info', message: `step ${String(step.stepIndex)} SKIPPED: ${STOPPED_STEP_MESSAGE}` });
        }
      }

      // D1, the kill half: a cancel whose grace ran out left the child no chance to report the
      // step it was in, so the step is still `RUNNING`. It was stopped, not judged — say so on the
      // FINAL, with the start reading it has and no finish it does not.
      if (stopped.reason === 'cancel') {
        for (const step of stepReporter.open()) {
          snapshot.stepFinished({
            stepIndex: step.stepIndex,
            status: 'SKIPPED',
            startedAtMs: step.startedAtMs,
            finishedAtMs: null,
            durationMs: null,
            failure: STOPPED_STEP_MESSAGE,
          });
          snapshot.appendLog({
            atMs: null,
            level: 'info',
            message: `step ${String(step.stepIndex)} SKIPPED: ${STOPPED_STEP_MESSAGE}`,
          });
        }
      }

      // ── The evidence phase, and it is **before** the scratch clear (story 10.14 AC-3). ─────
      //
      // The order is: upload the video → settle the evidence → write the manifest → *then* clear
      // scratch, wipe the values and deliver. `runScratch.clear()` — not `sendFinal` — is the
      // normative boundary, because 10.13 moved the clear ahead of the delivery window and the
      // video lives in scratch. "Before delivery" would be satisfied by an implementation that
      // uploads after the file has been deleted: green on every run, evidence `FAILED` on every
      // run, and unable to ever work.
      //
      // The whole phase shares one deadline, taken here. A slow bucket cannot push the run past
      // the API's recovery deadline because it cannot outlive this window.
      //
      // `resolver.wipe()` still runs after the manifest is written, which is what keeps the
      // redactor and the resolved values in scope at the moment the manifest bytes are produced —
      // exactly where §9.2's "never persist them in manifests" has to be enforced.
      evidence = await settleEvidence({
        runtimeVersions: reportRuntimeVersions,
        job,
        admissionId,
        outcome,
        evidence,
        recordingPath,
        ...(verifiedFile?{verifiedFile}:{}),
        browserStartedAtIso,
        redactor,
        logger: childLogger,
        snapshot,
      });

      // ── Released **before** the delivery window opens, not after it closes (AC-5a, AC-9). ──
      //
      // Terminal delivery is a bounded retry loop that can run for `terminalDeliveryWindowMs`.
      // Clearing scratch and wiping the values afterwards would mean a pod holding a browser
      // profile, a video file and a set of resolved secrets for the whole of it, on top of the
      // one report body the retry legitimately needs. The child process is gone and the browser
      // is gone by this point, so there is nothing left that the directory or the values are for,
      // and the epic's "retry delivery must not retain unlimited resources" becomes "retry
      // delivery retains one bounded body".
      //
      // The **redactor** is deliberately not released here: it is what scrubs the outbound body
      // on every attempt, and releasing it early would send an unredacted retry. It dies with
      // this closure when the run returns, which is the same instant the report client does.
      await runScratch.clear();
      // The resolved values live only in the admitted job (the envelope projection shares its
      // `secrets` object), so blanking them there leaves nothing in the process holding them.
      for(const input of observed.job.inputs)(input as {value:string}).value='';for(const key of Object.keys(observed.job.secrets))(observed.job.secrets as Record<string,string>)[key]='';
      // The wipe is observable, so AC-3's asserted sequence is read off captured runtime output
      // rather than off the order of statements in this file (AC-23).
      childLogger.info('run.values_wiped', {
        executionId: job.executionId,
        attemptId: job.attemptId,
        admissionId,
      });

      await reporter.sendFinal(outcome, evidence);
    }
  }

  /**
   * Uploads the recording, settles the evidence and writes the terminal manifest.
   *
   * Three properties, each a criterion:
   *
   * - **`STORED` is earned** — only after the store acknowledges the object write (AC-8);
   * - **`partial` is carried, never recomputed** — nothing here reads the uploaded object's size
   *   or duration, and nothing reads `outcome` (AC-9, ADR-002 §17.4);
   * - **nothing throws** — a storage failure is evidence `FAILED` with a redacted diagnostic and
   *   the result is delivered regardless, including when the store is entirely unreachable (AC-4).
   *
   * The manifest write failing is a diagnostic and not an outcome: the video's disposition already
   * reflects what happened to the video, and a run whose result was delivered lost nothing but its
   * recovery path.
   */
  async function settleEvidence(input: {
    runtimeVersions:Readonly<Record<string,unknown>>;
    job: JobEnvelope;
    admissionId: string;
    outcome: RunOutcome;
    evidence: EvidenceState;
    recordingPath: string | null;
    verifiedFile?:SessionRecording['verifiedFile'];
    browserStartedAtIso: string | null;
    redactor: ReturnType<typeof createRedactor>;
    logger: Logger;
    snapshot: RunSnapshot;
  }): Promise<EvidenceState> {
    const ports = {
      store: options.objectStore,
      fileSystem: options.evidenceFileSystem,
      bounds: options.evidence,
      now: options.now,
      sleep: options.sleep,
      redactor: input.redactor,
    };
    const window = openEvidenceWindow(ports);

    let settled: EvidenceState = input.evidence;
    try {
      const uploaded = await uploadRecording(ports, window, {
        videoKey: input.job.videoKey,
        path: input.recordingPath,
        ...(input.verifiedFile?{verifiedFile:input.verifiedFile}:{}),
        state: input.evidence.state,
        partial: input.evidence.partial,
      });
      settled = {
        videoKey: input.job.videoKey,
        manifestKey: input.job.manifestKey,
        state: uploaded.state,
        // Verbatim. A successful upload does not make a truncated recording whole.
        partial: uploaded.partial,
      };
      if (uploaded.error !== null) {
        input.snapshot.appendLog({ atMs: null, level: 'error', message: uploaded.error });
      }
      input.logger.info('run.evidence_settled', {
        executionId: input.job.executionId,
        attemptId: input.job.attemptId,
        admissionId: input.admissionId,
        evidenceState: settled.state,
        evidencePartial: settled.partial,
        uploadAttempts: uploaded.attempts,
      });

      const manifest = buildResultManifest({
        executionId: input.job.executionId,
        attemptId: input.job.attemptId,
        revisionId: input.job.revisionId,
        artifactHash: input.job.artifactHash,
        runnerInstanceId: options.runnerInstanceId,
        outcome: input.outcome,
        browserStartedAt: input.browserStartedAtIso,
        endedAt: options.wallClock().toISOString(),
        runtimeVersions: input.runtimeVersions,
        videoKey: settled.videoKey ?? input.job.videoKey,
        manifestKey: settled.manifestKey ?? input.job.manifestKey,
        evidenceState: settled.state,
        evidencePartial: settled.partial,
      });
      // Serialized **once**, redacted, and the same bytes are handed to every retry attempt.
      const bytes = serializeResultManifest(manifest, input.redactor);
      const written = await writeResultManifest(
        ports,
        window,
        input.job.manifestKey,
        bytes,
        RESULT_MANIFEST_CONTENT_TYPE,
      );
      if (!written.ok && written.error !== null) {
        input.snapshot.appendLog({ atMs: null, level: 'error', message: written.error });
      }
    } catch (error) {
      // Belt and braces: nothing above is expected to throw, and a terminal path that can throw
      // is a result nobody receives. The run is delivered with honest evidence either way.
      input.snapshot.appendLog({
        atMs: null,
        level: 'error',
        message: input.redactor.redact(
          `evidence settlement failed: ${error instanceof Error ? error.name : 'unknown'}`,
        ),
      });
      settled = { ...settled, state: 'FAILED' };
    }
    return settled;
  }

  return {
    get inFlight(): number {
      return inFlight.size;
    },

    cancel(executionId: string): CancelDecision {
      const control = controls.get(executionId);
      if (control === undefined) {
        return finished.has(executionId)
          ? { status: 409, code: 'RUN_FINISHED' }
          : { status: 404, code: 'RUN_NOT_FOUND' };
      }
      // Idempotent on the run's side too: `endRun` orders one stop, whoever asks.
      requestStop(executionId, control, 'delete');
      return { status: 202, code: 'CANCELLING' };
    },

    terminateInFlight(): number {
      const pending = [...terminators];
      for (const end of pending) end('drain');
      return pending.length;
    },

    async awaitInFlight(timeoutMs: number): Promise<boolean> {
      if (inFlight.size === 0) return true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expiry = new Promise<'timeout'>((resolveTimeout) => {
        timer = setTimeout(() => {
          resolveTimeout('timeout');
        }, timeoutMs);
      });
      try {
        const settled = await Promise.race([
          Promise.allSettled([...inFlight]).then(() => 'settled' as const),
          expiry,
        ]);
        return settled === 'settled';
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },

    ...(options.observed?.validationEnabled ? {validateObserved(body:unknown):ValidationVerdict {
      const support=options.observed;demand(support?.validationEnabled,'PROFILE_MISMATCH');return validateObservedRequest(body,support.build);
    }} : {}),
    async submitObserved(body:unknown):Promise<RunDecision>{
      const support=options.observed;if(!support?.replayEnabled)return {status:503,code:'OBSERVED_REPLAY_DISABLED'};
      let observedJob:ObservedJob;
      try{
        observedJob=validateObserved<ObservedJob>('replay-job',body,4194304);
        validateObservedJob(observedJob,support.build,options.allowedDomains);demand(observedJob.runtime.stepTimeoutMs<=options.maxima.stepTimeoutMs,'LIMIT_EXCEEDED');
        demand(/^[A-Za-z0-9_-]{1,20}$/u.test(observedJob.binding.csiId),'INVALID_CONTRACT');
      }catch(error){const code=error instanceof ObservedRefusal?error.code:'INVALID_CONTRACT';return {status:['PROFILE_MISMATCH','AUTHORIZATION_EXPIRED','POLICY_REFUSED','REFERENCE_REFUSED'].includes(code)?409:400,code};}
      if(pool.draining)return {status:503,code:'RUNNER_DRAINING'};
      const slot=pool.tryAcquire();if(!slot)return {status:429,code:'CAPACITY_SATURATED',retryAfterSeconds:options.retryAfterSeconds};
      const b=observedJob.binding,identity=newAdmissionIdentity(options.runnerInstanceId);
      const request:AdmissionRequest={schemaVersion:3,kind:'observed',executionId:b.executionId,startedAt:b.startedAt,attemptId:b.attemptId,runnerInstanceId:identity.runnerInstanceId,admissionId:identity.admissionId,revisionId:b.revisionId,revisionDigest:b.revisionDigest,artifactHash:b.artifactHash,configurationHash:b.configurationHash,learnedPlanHash:b.learnedPlanHash,referencePolicyHash:b.referencePolicyHash,publicationEvidenceHash:b.publicationEvidenceHash,scopeHash:b.scopeHash,grantId:b.replayGrant.grantId,profile:b.requiredProfile,build:b.requiredBuild};
      let receipt:AdmissionReceipt;
      try{receipt=await admitObserved({http:options.http,baseUrl:options.callbackBaseUrl,identityToken:options.callbackIdentityToken,timeoutMs:options.reportTimeoutMs,logger},request);}catch{slot.release();return {status:503,code:'ADMISSION_NOT_ACKNOWLEDGED'};}
      const prefix=`studio/${b.csiId}/${b.testId}/${b.executionId}/${b.attemptId}`;
      // Internal evidence metadata only: no artifact source travels in this projection.
      const job:JobEnvelope={executionId:b.executionId,attemptId:b.attemptId,revisionId:b.revisionId,artifactHash:b.artifactHash,configuration:observedJob.configuration,csi:b.csiId,references:{variables:[],secrets:Object.keys(observedJob.secrets)},resolvedSecrets:observedJob.secrets,deadlines:{admittedStartMs:Math.max(0,Date.parse(receipt.startDeadlineAt)-Date.now()),totalRuntimeMs:observedJob.runtime.totalRuntimeMs},videoKey:prefix+'.webm',manifestKey:prefix+'.result.json'};
      const control:RunControl={cancelled:false,recorded:false,end:null};controls.set(b.executionId,control);
      const task=execute(job,identity.admissionId,options.now(),control,{job:observedJob,admission:receipt}).catch(()=>{logger.error('observed.run.failed',{code:'INTERNAL_ERROR'});}).finally(()=>{slot.release();inFlight.delete(task);});inFlight.add(task);
      return {status:202,code:'ADMITTED'};
    },
  };
}
