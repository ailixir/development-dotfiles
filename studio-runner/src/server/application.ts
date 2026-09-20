/**
 * Wiring (AC-11, AC-12). `main.ts` is the thin shell around this; everything testable lives here.
 *
 * The drain sequence, in order, because the order is the criterion:
 *
 * 1. `pool.beginDrain()` — readiness goes **false** immediately and no further slot is handed
 *    out, so `/v1/runs` answers `503` from the next request onward.
 * 2. Wait for the in-flight run to deliver its terminal report, bounded by the drain timeout.
 *    The process does **not** exit here just because `SIGTERM` arrived: an admitted attempt that
 *    is abandoned silently becomes the API's problem to reap.
 * 3. Close the listener.
 * 4. Clear scratch.
 *
 * What this cannot promise, stated plainly: `SIGKILL` skips all four steps, and no test in this
 * package can claim otherwise. Recovering an attempt whose runner vanished is the running
 * reaper's job, and that is story 10.7.
 */
import { createAdmissionClient } from '../reporting/admissionClient.js';
import type { HttpClient } from '../reporting/httpClient.js';
import { createFetchHttpClient } from '../reporting/httpClient.js';
import type { ReportBounds } from '../reporting/bounds.js';
import type { BrowserLauncher, ScratchStore } from './adapters.js';
import { createCapacityPool } from './capacity.js';
import type { CapacityPool } from './capacity.js';
import type { RunnerConfig } from './config.js';
import { createIdentityChecker } from './identity.js';
import type { LogSink, Logger } from './logging.js';
import { createLogger, createStdoutSink } from './logging.js';
import type { DeadlineTimers } from '../run/deadline.js';
import type { RunOrigin } from '../run/timeline.js';
import { readFile, stat } from 'node:fs/promises';

import { createLocalObjectStore } from '../run/objectStore.js';
import { createS3ObjectStore } from '../run/s3ObjectStore.js';
import type { ObjectStoreClient } from '../run/objectStore.js';
import type { EvidenceFileSystem } from '../run/evidenceUpload.js';
import { createRunCoordinator } from './runCoordinator.js';
import type { RunCoordinator } from './runCoordinator.js';
import { createFsScratchStore } from './scratch.js';
import { createRunnerServer } from './server.js';
import type { RunnerServer } from './server.js';

export interface ApplicationDependencies {
  readonly launcher: BrowserLauncher;
  readonly runtimeVersions: Readonly<Record<string, unknown>>;
  readonly http?: HttpClient | undefined;
  readonly scratch?: ScratchStore | undefined;
  readonly logSink?: LogSink | undefined;
  readonly now?: (() => number) | undefined;
  readonly wallClock?: (() => Date) | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  readonly random?: (() => number) | undefined;
  /**
   * Test seam: the timer the runtime deadline arms on (10.13 AC-1, AC-2).
   *
   * Alongside `now` and `sleep`, and for the same reason: the behavioural suite drives an exact
   * schedule instead of sleeping, so the kill's timing is asserted rather than raced. Production
   * supplies none and gets `SYSTEM_DEADLINE_TIMERS`.
   */
  readonly timers?: DeadlineTimers | undefined;
  /**
   * Test seam: the timer the control read is scheduled on (ADR-002 §29). Production supplies none
   * and gets real timers; the harness gives it a scheduler of its own.
   */
  readonly controlTimers?: DeadlineTimers | undefined;
  /** Test seam: an alternative pool, used to falsify the atomic-acquire guard (AC-23). */
  readonly pool?: CapacityPool | undefined;
  /**
   * Test seam: how the run origin is taken for an **in-process** session (10.12 AC-11.3).
   *
   * A real session takes it in the child at recording-context readiness. This exists so the scale
   * assertion can substitute a process-origin clock and watch the bound go red — a guard nobody
   * has seen fail is not a guard.
   */
  readonly takeOrigin?: (() => RunOrigin) | undefined;
  /** Substituted by the tests that assert the terminal ordering and the storage failure paths. */
  readonly objectStore?: ObjectStoreClient | undefined;
  readonly evidenceFileSystem?: EvidenceFileSystem | undefined;
}

export interface RunnerApplication {
  readonly server: RunnerServer;
  readonly pool: CapacityPool;
  readonly coordinator: RunCoordinator;
  readonly logger: Logger;
  readonly config: RunnerConfig;
  /** Clears scratch and starts listening. Returns the bound port. */
  start(): Promise<number>;
  /** The full `SIGTERM` drain: readiness false → finish in-flight → close → clear scratch. */
  drain(): Promise<{ readonly completed: boolean }>;
}

function boundsFrom(config: RunnerConfig): ReportBounds {
  return {
    maxSteps: config.maxReportSteps,
    maxLogEntries: config.maxReportLogEntries,
    maxLogEntryLength: config.maxReportLogEntryLength,
    maxBodyBytes: config.maxReportBodyBytes,
  };
}

/**
 * The production filesystem port for the uploader.
 *
 * `readFile` is wired and never called — the uploader streams from a path and the store client
 * opens it. Declaring the capability is what makes "zero whole-file reads at any recording size" a
 * counted fact rather than a claim (story 10.14 AC-5).
 */
const NODE_EVIDENCE_FILE_SYSTEM: EvidenceFileSystem = {
  stat: async (path: string): Promise<{ readonly size: number }> => ({
    size: (await stat(path)).size,
  }),
  readFile: (path: string): Promise<Uint8Array> => readFile(path),
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export function createApplication(
  config: RunnerConfig,
  dependencies: ApplicationDependencies,
): RunnerApplication {
  const logger = createLogger({ sink: dependencies.logSink ?? createStdoutSink() });
  const pool = dependencies.pool ?? createCapacityPool(config.poolSize);
  const http = dependencies.http ?? createFetchHttpClient();
  const scratch = dependencies.scratch ?? createFsScratchStore(config.scratchDir);
  const s3 = dependencies.objectStore === undefined && config.objectStoreProvider === 's3'
    ? createS3ObjectStore({
      bucket: config.objectStoreBucket,
      region: config.objectStoreRegion,
      credentialsDirectory: config.objectStoreCredentialsDirectory,
      requestTimeoutMs: config.objectStoreWindowMs,
    }) : undefined;
  const objectStore = dependencies.objectStore ?? s3?.store
    ?? createLocalObjectStore({ root: config.objectStoreDir });
  const evidenceFileSystem = dependencies.evidenceFileSystem ?? NODE_EVIDENCE_FILE_SYSTEM;
  const bounds = boundsFrom(config);

  const admission = createAdmissionClient({
    http,
    baseUrl: config.callbackBaseUrl,
    identityToken: config.callbackIdentityToken,
    timeoutMs: config.admissionTimeoutMs,
    logger,
  });

  const now = dependencies.now ?? ((): number => performance.now());

  const coordinator = createRunCoordinator({
    pool,
    admission,
    launcher: dependencies.launcher,
    scratch,
    http,
    logger,
    bounds,
    runtimeVersions: dependencies.runtimeVersions,
    runnerInstanceId: config.runnerInstanceId,
    callbackBaseUrl: config.callbackBaseUrl,
    callbackIdentityToken: config.callbackIdentityToken,
    retryAfterSeconds: config.retryAfterSeconds,
    reportTimeoutMs: config.admissionTimeoutMs,
    terminal: {
      windowMs: config.terminalDeliveryWindowMs,
      maxAttempts: config.terminalDeliveryMaxAttempts,
      backoffMs: config.terminalDeliveryBackoffMs,
    },
    objectStore,
    evidenceFileSystem,
    evidence: {
      maxAttempts: config.objectStoreMaxAttempts,
      windowMs: config.objectStoreWindowMs,
      backoffMs: config.objectStoreBackoffMs,
    },
    now,
    wallClock: dependencies.wallClock ?? ((): Date => new Date()),
    sleep: dependencies.sleep ?? defaultSleep,
    random: dependencies.random ?? Math.random,
    // The server limits a job's deadlines are clamped to (10.13 AC-6, §5.2 "configurable within
    // server limits"). Enumerated configuration keys, so the fail-closed loader owns them.
    maxima: {
      totalRuntimeMs: config.maxTotalRuntimeMs,
      stepTimeoutMs: config.maxStepTimeoutMs,
    },
    timers: dependencies.timers,
    controlTimers: dependencies.controlTimers,
    takeOrigin: dependencies.takeOrigin,
  });

  const server = createRunnerServer({
    identity: createIdentityChecker(config.serviceIdentityToken),
    pool,
    coordinator,
    logger,
    maxRequestBodyBytes: config.maxRequestBodyBytes,
    validateTimeoutMs: config.validateTimeoutMs,
    now,
  });

  return {
    server,
    pool,
    coordinator,
    logger,
    config,

    async start(): Promise<number> {
      // A pod that was killed mid-run leaves scratch behind; the next run must not inherit it.
      await scratch.clearAll();
      const port = await server.listen(config.port, config.host);
      logger.info('runner.started', {
        port,
        poolSize: pool.size,
        runnerInstanceId: config.runnerInstanceId,
      });
      return port;
    },

    async drain(): Promise<{ completed: boolean }> {
      pool.beginDrain();
      logger.info('runner.draining', { inFlight: coordinator.inFlight });
      const completed = await coordinator.awaitInFlight(config.drainTimeoutMs);
      if (!completed) {
        logger.record('error', 'runner.drain_deadline', 'runner.drain.deadline_exceeded', {
          inFlight: coordinator.inFlight,
        });
        // ── Ended, not abandoned (10.13 AC-15, §9.3, §5.4). ────────────────────────────────
        //
        // A run still hung when the drain deadline expires is killed — ordered stop, bounded
        // grace, process group — and then reports. Exiting here instead would leave a browser
        // running with nobody to answer for it, which is precisely the state §5.4's running
        // reaper has to guess at. The kill makes each run's awaited result resolve, so every one
        // of them still reaches its own `finally`: terminal report, values wiped, scratch cleared.
        const ended = coordinator.terminateInFlight();
        if (ended > 0) {
          logger.record('warn', 'runner.drain_killed', 'runner.drain.killed', { runs: ended });
          // Bounded by the ordered stop's own grace plus the same again for the terminal report:
          // a second wait, not a second unbounded one. Skipped when nothing was killable, because
          // a run still inside `launcher.launch` holds no browser and is bounded by its own
          // launch timeout — waiting on it here would turn the drain into the hang it prevents.
          await coordinator.awaitInFlight(config.browserStopTimeoutMs * 2);
        }
      }
      await server.close();
      await scratch.clearAll();
      s3?.close();
      logger.info('runner.drained', { completed });
      return { completed };
    },
  };
}
