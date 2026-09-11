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
import type { EvidenceState, RunOutcome } from '../reporting/snapshot.js';
import { createRunReporter } from '../reporting/reportingStepReporter.js';
import type {
  BrowserLauncher,
  BrowserSession,
  ScratchStore,
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
  readonly now: () => number;
  readonly wallClock: () => Date;
  readonly sleep: (ms: number) => Promise<void>;
  readonly random: () => number;
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

    let outcome: RunOutcome = {
      result: 'ERROR',
      errorCode: RUNNER_ERROR_CODES.RUN_ERROR,
      errorMessage: null,
    };
    const evidenceKeys = { videoKey: job.videoKey, manifestKey: job.manifestKey };
    // Echoed from the job's server-derived keys, never invented, derived or accepted from
    // anywhere else (§6.2, AC-9).
    let evidence: EvidenceState = { ...evidenceKeys, state: 'UNAVAILABLE' };

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
          totalRuntimeMs: job.deadlines.totalRuntimeMs,
          scratchPath: runScratch.path,
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

      let result: SessionRunResult;
      try {
        result = session.run
          ? await session.run.execute({
              steps,
              variables: job.resolvedVars,
              secrets: job.resolvedSecrets,
              reporter,
            })
          : await executeInProcess(session, steps, resolver, reporter, origin);
      } finally {
        await session.close();
      }

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
      // other (§6.1, AC-8). A recording failure is a diagnostic on the report, never a result.
      evidence = { ...evidenceKeys, state: result.recording.state };
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
      // Progress deliveries settle before the terminal report is built, so FINAL always carries
      // the highest sequence number of the attempt.
      await reporter.settled();
      await reporter.sendFinal(outcome, evidence);
      resolver.wipe();
      await runScratch.clear();
    }
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
      // No browser, no recorder: nothing was attempted, so nothing failed (AC-9).
      recording: { path: null, bytes: null, error: null, state: 'UNAVAILABLE' },
      observedHosts: [],
    };
  }

  return {
    get inFlight(): number {
      return inFlight.size;
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
