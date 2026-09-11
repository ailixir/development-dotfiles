/**
 * `POST /v1/runs`: order of operations, admission and the run itself (AC-6..AC-10, AC-12..AC-21).
 *
 * ## The order, and why it is this order
 *
 * ```
 * validate envelope + artifact  →  reserve a capacity slot  →  admission CAS  →  202
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
 * | API refused (`409`/`401`/`403`) | `409` / `503` | true | one, and only one |
 * | API ambiguous (timeout, transport, 5xx, redirect) | `503` | true | one, and only one — **never resent** |
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
 * `STARTED` is reported *after* the launch resolves, steps flow through the 10.2 `StepReporter`
 * seam, and the terminal report is delivered with byte-identical bounded retry. Every exit path —
 * success, failure, throw, drain — clears scratch, wipes the resolved values and releases the
 * slot.
 */
import { createRedactor } from '../executor/redaction.js';
import type { ExecutableStep, ValueResolver } from '../executor/index.js';
import { executeSteps } from '../executor/index.js';
import { RUNNER_VERSIONS, isCompatible } from '../compat/index.js';
import type { ArtifactProvenance, RuntimeVersions } from '../compat/index.js';
import { RUNNER_ERROR_CODES, RUN_FAILURE_KINDS, errorCodeFor, resultFor } from '../run/errors.js';
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
import { takeRunOrigin } from '../run/timeline.js';
import type { OriginSource, RunOrigin } from '../run/timeline.js';
import { validateArtifact } from '../validator/index.js';
import type { Diagnostic } from '../validator/index.js';
import type { AdmissionClient } from '../reporting/admissionClient.js';
import { newAdmissionIdentity } from '../reporting/admissionClient.js';
import type { HttpClient } from '../reporting/httpClient.js';
import type { JobEnvelope } from '../reporting/envelope.js';
import { knownValuesOf, validateEnvelope } from '../reporting/envelope.js';
import type { ReportBounds } from '../reporting/bounds.js';
import { createReportClient } from '../reporting/reportClient.js';
import { createRunSnapshot } from '../reporting/snapshot.js';
import type { EvidenceState, RunOutcome, RunSnapshot } from '../reporting/snapshot.js';
import { createRunReporter } from '../reporting/reportingStepReporter.js';
import type {
  BrowserLauncher,
  BrowserSession,
  ScratchStore,
  SessionKillOutcome,
  SessionKillReason,
  SessionOrigin,
  SessionRunResult,
} from './adapters.js';
import type { CapacityPool } from './capacity.js';
import type { Logger } from './logging.js';

export interface RunDecision {
  readonly status: 202 | 400 | 409 | 429 | 503;
  readonly code: string;
  readonly retryAfterSeconds?: number;
  /** Key names and codes only; never a job value (AC-20). */
  readonly detail?: readonly { readonly code: string; readonly field: string }[];
}

export interface RunCoordinatorOptions {
  readonly pool: CapacityPool;
  readonly admission: AdmissionClient;
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
   * How the run origin is taken when the session does **not** run in its own process.
   *
   * A real session takes it in the child, at recording-context readiness, and hands back the
   * readings (AC-10). An in-process session — 10.6's fakes — has no such moment to observe, so
   * the coordinator takes the origin at the instant the launch resolves, which is that session's
   * browser start. Injected so AC-11.3 can substitute a **process-origin** clock and watch the
   * scale assertion go red; nothing on the production path substitutes anything.
   */
  readonly takeOrigin?: (() => RunOrigin) | undefined;
  readonly originSource?: OriginSource | undefined;
}

export interface RunCoordinator {
  /**
   * The whole of `POST /v1/runs` after the body has been read and parsed.
   *
   * Synchronous up to and including the slot acquire: there is no `await` between observing free
   * capacity and holding the slot, which is the falsifiable half of AC-10.
   */
  submit(body: unknown): Promise<RunDecision>;
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
   * Returns how many runs were actually ended. A run still inside `launcher.launch` has no session
   * to stop and is not counted: it holds no browser the drain could orphan, and it is already
   * bounded by `launchTimeoutMs`.
   */
  terminateInFlight(): number;
  readonly inFlight: number;
}

/** Diagnostics leaving the process are bounded and carry no artifact text (AC-5, AC-20). */
function boundedCodes(diagnostics: readonly Diagnostic[]): readonly { code: string; field: string }[] {
  return diagnostics
    .slice(0, 10)
    .map((diagnostic) => ({ code: diagnostic.code, field: 'artifact' }));
}

/**
 * Value resolver over the job's ephemeral values.
 *
 * `wipe` drops every reference on the way out. JavaScript cannot zero a string, so this is the
 * achievable and testable property: after the run, nothing in the process holds a path to the
 * values, and nothing ever wrote them to scratch or to a queued report body (AC-21).
 */
interface WipeableResolver extends ValueResolver {
  wipe(): void;
}

function createJobResolver(job: JobEnvelope): WipeableResolver {
  const variables = new Map(Object.entries(job.resolvedVars));
  const secrets = new Map(Object.entries(job.resolvedSecrets));
  return {
    variable(name: string): string {
      const value = variables.get(name);
      if (value === undefined) throw new Error(`Variable "${name}" was not resolved for this run.`);
      return value;
    },
    secret(id: string): string {
      const value = secrets.get(id);
      if (value === undefined) throw new Error(`Secret "${id}" was not resolved for this run.`);
      return value;
    },
    knownValues(): readonly string[] {
      return [...variables.values(), ...secrets.values()];
    },
    wipe(): void {
      variables.clear();
      secrets.clear();
    },
  };
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

/** Launch failures the launcher classified; anything else is the generic launch code (AC-6a). */
function launchFailureKind(error: unknown): RunFailureKind {
  const kind = (error as { failureKind?: unknown }).failureKind;
  return kind === 'sandbox-unavailable' ? 'sandbox-unavailable' : 'browser-launch';
}

/** Narrows the session's string back to a kind; anything unrecognised is a run fault. */
function readFailureKind(value: string | null): RunFailureKind | null {
  if (value === null) return null;
  return (RUN_FAILURE_KINDS as readonly string[]).includes(value)
    ? (value as RunFailureKind)
    : 'run-fault';
}

/**
 * The versions the image **recorded** when it was built (`runtime-versions.json`).
 *
 * This is the provenance side of the §4.6 comparison the runner can make without a database: the
 * job envelope is closed and carries no provenance, so what is checked here is that the runtime
 * this process is running has not drifted from the runtime the image recorded. A stale `dist/`, a
 * half-applied upgrade or a mixed image fails before a browser starts rather than reinterpreting
 * the same source under a different language policy (AC-2, §4.6).
 */
function recordedProvenance(recorded: Readonly<Record<string, unknown>>): ArtifactProvenance {
  const read = (field: string): string =>
    typeof recorded[field] === 'string' ? recorded[field] : '';
  return {
    validatorSchema: read('validatorSchema'),
    syntaxReference: read('syntaxReference'),
    executor: read('executor'),
    playwright: read('playwright'),
  };
}

/**
 * What this build actually **is**, from the compiled-in constants.
 *
 * The Playwright pin is carried across from the record rather than re-derived, because it is the
 * one field the runner cannot observe from its own source: `npm run check:pins` compares the
 * declared, locked, image-tag and recorded copies and fails the build on any disagreement
 * (ADR-001 §4.2). Re-checking it here would either repeat that comparison with less information
 * or invent a second source of truth for it.
 */
function runningVersions(provenance: ArtifactProvenance): RuntimeVersions {
  return { ...RUNNER_VERSIONS, playwright: provenance.playwright };
}

/** Turns the run-scoped origin into the session shape the reporter and executor consume. */
function asSessionOrigin(origin: RunOrigin): SessionOrigin {
  return {
    browserStartedAt: origin.browserStartedAt,
    startedAtMs: origin.startedAtMs,
    clock: origin.clock,
  };
}

export function createRunCoordinator(options: RunCoordinatorOptions): RunCoordinator {
  const { pool, admission, launcher, scratch, logger } = options;
  const inFlight = new Set<Promise<void>>();
  /** One entry per run that has a killable session; removed when the run leaves (AC-15). */
  const terminators = new Set<(reason: SessionKillReason) => void>();

  async function execute(
    job: JobEnvelope,
    steps: readonly ExecutableStep[],
    admissionId: string,
    admittedAtMs: number,
  ): Promise<void> {
    const identity = {
      executionId: job.executionId,
      attemptId: job.attemptId,
      admissionId,
      runnerInstanceId: options.runnerInstanceId,
    };
    const resolver = createJobResolver(job);
    const redactor = createRedactor(knownValuesOf(job));
    const snapshot = createRunSnapshot({
      identity,
      bounds: options.bounds,
      runtimeVersions: options.runtimeVersions,
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
    });
    const reporter = createRunReporter({ snapshot, client });

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

    try {
      // ── Before any browser process exists (AC-2). ───────────────────────────────────────────
      //
      // Revalidation is deliberately here rather than in the child: "no Chromium process is
      // created" is only true if the refusal happens before the spawn seam is touched, and the
      // child cannot refuse a spawn that has already happened. It is also what keeps AC-3 easy —
      // the artifact source never leaves this process at all.
      const revalidation = validateArtifact(job.artifact, job.source, job.references);
      if (!revalidation.ok) {
        throw new RunFailure(
          'artifact-revalidation',
          'The confirmed artifact did not revalidate under this runtime\'s default-deny policy.',
        );
      }

      const recorded = recordedProvenance(options.runtimeVersions);
      const compatibility = isCompatible(recorded, runningVersions(recorded));
      if (!compatibility.ok) {
        throw new RunFailure('runtime-incompatible', compatibility.reason ?? 'Runtime incompatible.');
      }

      // ── The start deadline is a refusal, not a race (AC-4, §5.2). ──────────────────────────
      const elapsedSinceAdmission = options.now() - admittedAtMs;
      if (elapsedSinceAdmission >= job.deadlines.admittedStartMs) {
        throw new RunFailure(
          'start-deadline',
          `The admitted-start deadline of ${String(job.deadlines.admittedStartMs)}ms elapsed ` +
            'before the run reached the launch point; no browser was started.',
        );
      }

      let session: BrowserSession;
      try {
        session = await launcher.launch({
          browser: job.configuration.browser,
          viewport: job.configuration.viewport,
          // ── Clamped to the server's limits. A job asks; the deployment decides (AC-6). ─────
          totalRuntimeMs: runtimeCapMs,
          stepTimeoutMs: effectiveStepTimeoutMs(job.configuration.timeoutSeconds, options.maxima),
          scratchPath: runScratch.path,
          diagnostics,
        });
      } catch (error) {
        throw new RunFailure(
          launchFailureKind(error),
          error instanceof Error ? error.message : 'The browser did not start.',
        );
      }

      // ── The origin: one instant, observed twice, at the browser start (AC-10, AC-11.2). ────
      const origin: SessionOrigin =
        session.run?.origin ?? asSessionOrigin(options.takeOrigin?.() ?? takeRunOrigin(options.originSource));
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
      if (runSession !== undefined) {
        /**
         * One path for both reasons a parent ends a run it started (AC-3, AC-15).
         *
         * Idempotent: the drain can arrive while the deadline is already killing, and the second
         * caller must not order a second stop or reclassify the first one's reason.
         */
        const endRun = (reason: SessionKillReason): void => {
          if (kills.length > 0) return;
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
                : 'The runner drained while this run was still in flight; the browser process ' +
                  'tree is being stopped.',
          });
          kills.push(runSession.kill(reason));
        };
        terminate = endRun;
        terminators.add(endRun);

        deadline = createRuntimeDeadline({
          capMs: runtimeCapMs,
          now: options.now,
          timers: options.timers ?? SYSTEM_DEADLINE_TIMERS,
          onExpire: () => {
            endRun('total-runtime');
          },
        });
        deadline.arm();
      }

      let result: SessionRunResult;
      try {
        result = runSession
          ? await runSession.execute({
              steps,
              variables: job.resolvedVars,
              secrets: job.resolvedSecrets,
              reporter,
            })
          : await executeInProcess(session, steps, resolver, reporter, origin);
      } finally {
        deadline?.cancel();
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
      // Every exit path reaches here — success, step failure, launch failure, start-deadline
      // refusal, **runtime-deadline kill**, run fault and drain — which is why the kill is made to
      // resolve `execute` rather than to abandon it. A kill that left the awaited promise pending
      // would skip this block entirely and leak the slot, the scratch directory and the values.
      deadline?.cancel();

      // Progress deliveries settle before the terminal report is built, so FINAL always carries
      // the highest sequence number of the attempt.
      await reporter.settled();

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
        job,
        admissionId,
        outcome,
        evidence,
        recordingPath,
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
      resolver.wipe();
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
    job: JobEnvelope;
    admissionId: string;
    outcome: RunOutcome;
    evidence: EvidenceState;
    recordingPath: string | null;
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
        runtimeVersions: options.runtimeVersions,
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

  /**
   * The in-process path: a session that exposes an adapter but does not run the job itself.
   *
   * This is 10.6's fake launcher, and it is the reason the coordinator takes an origin of its own
   * — so that **no** path can reach `executeSteps` without an explicitly chosen clock (AC-11.1).
   */
  async function executeInProcess(
    session: BrowserSession,
    steps: readonly ExecutableStep[],
    resolver: ValueResolver,
    reporter: ReturnType<typeof createRunReporter>,
    origin: SessionOrigin,
  ): Promise<SessionRunResult> {
    if (origin.clock === null) {
      throw new Error('An in-process session must carry the run clock it was zeroed with.');
    }
    const run = await executeSteps({
      steps,
      adapter: session.adapter,
      reporter,
      resolver,
      clock: origin.clock,
    });
    return {
      ok: run.ok,
      failureKind: run.ok ? null : 'step',
      failureMessage: null,
      // No browser, no recorder: nothing was attempted, so nothing failed (AC-9), and a
      // recording that does not exist is not a partial one (ADR-002 §17.3).
      recording: { path: null, bytes: null, error: null, state: 'UNAVAILABLE', partial: false },
      observedHosts: [],
    };
  }

  return {
    get inFlight(): number {
      return inFlight.size;
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

    async submit(body: unknown): Promise<RunDecision> {
      // ── 1. Envelope. An invalid job consumes no capacity and reaches no API. ───────────────
      const envelope = validateEnvelope(body);
      if (!envelope.ok) {
        return { status: 400, code: 'JOB_INVALID', detail: envelope.problems };
      }
      const job = envelope.job;

      // ── 2. Artifact. Pure, browser-free, bounded; still before the slot. ──────────────────
      const validation = validateArtifact(job.artifact, job.source, job.references);
      if (!validation.ok) {
        const all = [...validation.diagnostics, ...validation.steps.flatMap((step) => step.diagnostics)];
        return { status: 400, code: 'ARTIFACT_INVALID', detail: boundedCodes(all) };
      }
      const steps: ExecutableStep[] = validation.steps
        .filter((step) => step.operations !== null)
        .map((step) => ({ stepIndex: step.stepIndex, operations: step.operations ?? [] }));

      // ── 3. Draining and capacity. Different conditions, different answers (AC-10, AC-11). ──
      if (pool.draining) {
        return { status: 503, code: 'RUNNER_DRAINING' };
      }

      // One atomic acquire. Nothing awaits between observing free capacity and holding the slot.
      const slot = pool.tryAcquire();
      if (slot === null) {
        // Definite non-acceptance: no slot, no admission request, no scratch, no browser.
        logger.record('info', 'runs.saturated', 'runner.runs.saturated', {
          executionId: job.executionId,
          attemptId: job.attemptId,
        });
        return {
          status: 429,
          code: 'CAPACITY_SATURATED',
          retryAfterSeconds: options.retryAfterSeconds,
        };
      }

      // ── 4. Admission CAS. Exactly one request, whatever it answers. ───────────────────────
      const identity = newAdmissionIdentity(options.runnerInstanceId);
      const outcome = await admission.admit({
        executionId: job.executionId,
        attemptId: job.attemptId,
        identity,
        runtimeVersions: options.runtimeVersions,
      });

      if (outcome.kind === 'REFUSED') {
        // Definite. Stop, release, and never re-attempt under any identity (AC-8).
        slot.release();
        return outcome.status === 409
          ? { status: 409, code: outcome.code }
          : { status: 503, code: 'ADMISSION_REJECTED' };
      }

      if (outcome.kind === 'AMBIGUOUS') {
        // Not permission to replay. The admission may already have been granted on the API side,
        // and a second request risks a second browser for one attempt (AC-9).
        slot.release();
        return { status: 503, code: `ADMISSION_AMBIGUOUS_${outcome.reason}` };
      }

      // ── 5. Admitted. Only now does anything start. ────────────────────────────────────────
      //
      // The admitted-start deadline is measured from here: the instant the API granted the
      // admission, which is the instant §5.2's "the runner refuses to launch after the
      // server-issued admission/start deadline" starts counting from.
      const admittedAtMs = options.now();
      const task = execute(job, steps, identity.admissionId, admittedAtMs)
        .catch((error: unknown) => {
          logger.error('run.failed', {
            executionId: job.executionId,
            attemptId: job.attemptId,
            admissionId: identity.admissionId,
            reason: error instanceof Error ? error.name : 'unknown',
          });
        })
        .finally(() => {
          slot.release();
          inFlight.delete(task);
        });
      inFlight.add(task);

      return { status: 202, code: 'ADMITTED' };
    },
  };
}
