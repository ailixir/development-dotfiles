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
import type { BrowserLauncher, ScratchStore } from './adapters.js';
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

export function createRunCoordinator(options: RunCoordinatorOptions): RunCoordinator {
  const { pool, admission, launcher, scratch, logger } = options;
  const inFlight = new Set<Promise<void>>();

  async function execute(
    job: JobEnvelope,
    steps: readonly ExecutableStep[],
    admissionId: string,
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

    let outcome: RunOutcome = { result: 'ERROR', errorCode: 'RUN_NOT_STARTED', errorMessage: null };
    const evidence: EvidenceState = {
      videoKey: job.videoKey,
      manifestKey: job.manifestKey,
      // Evidence upload is story 10.14; this story reports the state it can honestly claim.
      state: 'UNAVAILABLE',
    };

    // Scratch is created here — after the CAS succeeded, never before it (AC-6).
    const runScratch = await scratch.create(admissionId);

    try {
      const session = await launcher.launch({
        browser: job.configuration.browser,
        viewport: job.configuration.viewport,
        totalRuntimeMs: job.deadlines.totalRuntimeMs,
        scratchPath: runScratch.path,
      });
      // Only now. Not on admission, not when the launch call began (AC-14a).
      reporter.browserStarted();

      try {
        const result = await executeSteps({ steps, adapter: session.adapter, reporter, resolver });
        outcome = result.ok
          ? { result: 'PASSED', errorCode: null, errorMessage: null }
          : { result: 'FAILED', errorCode: 'STEP_FAILED', errorMessage: null };
      } finally {
        await session.close();
      }
    } catch (error) {
      outcome = {
        result: 'ERROR',
        errorCode: 'RUN_ERROR',
        errorMessage: redactor.redact(error instanceof Error ? error.name : 'unknown'),
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
      const task = execute(job, steps, identity.admissionId)
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
