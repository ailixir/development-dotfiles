import { loadObservedBuild } from '../compat/runtime-versions.js';
import type { ObservedRunnerSupport } from './runCoordinator.js';
import { X509Certificate } from 'node:crypto';
import { demand } from '../validator/observedReferencePolicy.js';
/**
 * Wiring (AC-11, AC-12). `main.ts` is the thin shell around this; everything testable lives here.
 *
 * The drain sequence, in order, because the order is the criterion:
 *
 * 1. `pool.beginDrain()` — readiness goes **false** immediately and no further slot is handed
 *    out, so `/v2/runs` answers `503` from the next request onward.
 * 2. Wait for the in-flight run to deliver its terminal report, bounded by the drain timeout.
 *    The process does **not** exit here just because `SIGTERM` arrived: an admitted attempt that
 *    is abandoned silently becomes the API's problem to reap.
 * 3. Close the listener.
 * 4. Clear scratch.
 *
 * With guided mode on (STUDIO-OBS-009 AC-1) the guided half joins the same drain, concurrently with
 * step 2 and ahead of step 3: every owned guided session is stopped `CONTEXT_LOST` and its recording
 * is waited for (bounded, `GuidedOwnership.close`). A stop that could not be confirmed is reported
 * as `guidedClosed: false`, which `main.ts` turns into exit code 1; the replay half's result and
 * exit code are unchanged.
 *
 * What this cannot promise, stated plainly: `SIGKILL` skips all four steps, and no test in this
 * package can claim otherwise. Recovering an attempt whose runner vanished is the running
 * reaper's job, and that is story 10.7.
 */
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
import { createConfiguredObjectStore, evidenceBoundsFrom, NODE_EVIDENCE_FILE_SYSTEM } from '../run/objectStoreFactory.js';
import type { RecordingScratch } from '../run/recordingScratch.js';
import { systemOriginSource } from '../run/timeline.js';
import type { ObjectStoreClient } from '../run/objectStore.js';
import type { EvidenceFileSystem } from '../run/evidenceUpload.js';
import { createRunCoordinator } from './runCoordinator.js';
import type { RunCoordinator } from './runCoordinator.js';
import { createFsScratchStore } from './scratch.js';
import { createRunnerServer } from './server.js';
import type { ListenerSettings, RunnerServer } from './server.js';
import { createGuidedBridge, guidedCallback, guidedClaimClient } from '../guided/transport.js';
import type { GuidedBridge, GuidedJwtPolicy } from '../guided/transport.js';
import type { GuidedRuntimeOptions } from '../guided/runtime.js';
import { createGuidedRecorder } from '../guided/evidence.js';
import { createPeerPin } from './identity.js';

/**
 * Guided mode as the application sees it (STUDIO-OBS-009 AC-1): the configuration `main.ts` has already
 * validated and read, plus the browser launcher and the swept recording scratch. Everything else the
 * guided worker used to compose by itself — the object store, the recording geometry, the origin rule,
 * the TLS material and the controller fingerprint — comes from the replay path's own, so there is one
 * set of evidence settings and one trust chain.
 */
export interface GuidedModeDependencies {
  readonly workerId: string;
  readonly journalDirectory: string;
  readonly controllerJwt: GuidedJwtPolicy;
  /** https only; its own key, never derived from the replay callback URL (ruling A2.2). */
  readonly callbackBaseUrl: string;
  /** Re-read on every callback and claim: the issuer refreshes the file well inside the token lifetime. */
  readonly callbackToken: () => Promise<string>;
  readonly launch: GuidedRuntimeOptions['launch'];
  /** The result of the RUNNER-SCRATCH startup sweep (`prepareRecordingScratch`), done by `main`. */
  readonly recordingScratch: RecordingScratch;
  /** Learning sessions this process owns at once (`STUDIO_RUNNER_GUIDED_CAPACITY`, 1..8). */
  readonly capacity: number;
}

export interface ApplicationDependencies {
  /** The TLS material and the pinned controller certificate. There is no application without it. */
  readonly listener: ListenerSettings;
  /** Present exactly when `STUDIO_RUNNER_GUIDED_ENABLED` is true. */
  readonly guided?: GuidedModeDependencies | undefined;
  readonly observed?: ObservedRunnerSupport;
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
  /**
   * The full `SIGTERM` drain: readiness false → finish in-flight (replay) and stop every owned
   * session (guided), concurrently → close → clear scratch.
   *
   * `guidedClosed` is false only when a guided stop could not be confirmed; it is true when guided mode is off.
   */
  drain(): Promise<{ readonly completed: boolean; readonly guidedClosed: boolean }>;
}

function boundsFrom(config: RunnerConfig): ReportBounds {
  return {
    maxSteps: config.maxReportSteps,
    maxLogEntries: config.maxReportLogEntries,
    maxLogEntryLength: config.maxReportLogEntryLength,
    maxBodyBytes: config.maxReportBodyBytes,
  };
}

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
  // One composition shared with the guided worker (`run/objectStoreFactory.ts`, STUDIO-OBS-013).
  // An injected test store is never closed by the application; a configured one is, on drain.
  const configured = dependencies.objectStore === undefined
    ? createConfiguredObjectStore(config)
    : { store: dependencies.objectStore, close: (): void => undefined };
  const objectStore = configured.store;
  const evidenceFileSystem = dependencies.evidenceFileSystem ?? NODE_EVIDENCE_FILE_SYSTEM;
  const bounds = boundsFrom(config);

  const now = dependencies.now ?? ((): number => performance.now());

  const observed = dependencies.observed ?? loadObservedRunnerSupport({STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED:String(config.observedValidationEnabled),STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED:String(config.observedReplayEnabled),STUDIO_RUNNER_OBSERVED_CATALOG_FILE:config.observedCatalogFile,STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST:config.observedImageDigest,PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH});
  const coordinator = createRunCoordinator({
    ...(observed ? {observed} : {}),
    pool,
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
    evidence: evidenceBoundsFrom(config),
    allowedDomains: config.allowedDomains,
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
  });

  const controllerFingerprint = dependencies.listener.controllerCertificateFingerprint256;
  const ownFingerprint = new X509Certificate(dependencies.listener.tls.cert).fingerprint256;
  const guidedMode = dependencies.guided;
  const bridge: GuidedBridge | undefined =
    guidedMode === undefined
      ? undefined
      : createGuidedBridge(guidedBridgeOptions(guidedMode, {
          listener: dependencies.listener,
          store: objectStore,
          fileSystem: evidenceFileSystem,
          bounds: evidenceBoundsFrom(config),
          config,
          now,
          sleep: dependencies.sleep ?? defaultSleep,
        }));

  const server = createRunnerServer({
    listener: dependencies.listener,
    peer: createPeerPin(controllerFingerprint, ownFingerprint),
    guided: bridge,
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
        guided: bridge !== undefined,
        // The navigation whitelist, comma-joined so a misconfigured (empty) list is visible in the log.
        allowedDomains: config.allowedDomains.join(','),
      });
      return port;
    },

    async drain(): Promise<{ completed: boolean; guidedClosed: boolean }> {
      pool.beginDrain();
      logger.info('runner.draining', { inFlight: coordinator.inFlight });
      // The guided half starts now, beside the replay half and not after it: a stopped session
      // frees the one guided slot and settles its recording while a replay run is still reporting.
      const guided: Promise<boolean> =
        bridge === undefined
          ? Promise.resolve(true)
          : bridge.closeSessions().then(
              () => true,
              () => {
                logger.record('error', 'runner.guided_close_unconfirmed', 'runner.guided.close.unconfirmed');
                return false;
              },
            );
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
      const guidedClosed = await guided;
      // Guided requests still in flight would hold the close open; the sessions they address are
      // already stopped, so they are ended rather than waited for.
      if (bridge !== undefined) server.closeAllConnections();
      await server.close();
      await scratch.clearAll();
      configured.close();
      logger.info('runner.drained', { completed, guidedClosed });
      return { completed, guidedClosed };
    },
  };
}

interface GuidedWiring {
  readonly listener: ListenerSettings;
  readonly store: ObjectStoreClient;
  readonly fileSystem: EvidenceFileSystem;
  readonly bounds: ReturnType<typeof evidenceBoundsFrom>;
  readonly config: RunnerConfig;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
}

/**
 * Composes the guided bridge from the replay path's own pieces: the same TLS pair that serves the
 * listener is the runner's client identity on the guided callbacks and claims, the same controller
 * fingerprint pins both directions, and the recorder uses the replay object store, bounds and
 * recording geometry (STUDIO-OBS-013 AC-3).
 */
function guidedBridgeOptions(guided: GuidedModeDependencies, wiring: GuidedWiring): Parameters<typeof createGuidedBridge>[0] {
  const fingerprint = wiring.listener.controllerCertificateFingerprint256;
  const callbacks = { baseUrl: guided.callbackBaseUrl, tls: wiring.listener.tls, controllerCertificateFingerprint256: fingerprint, token: guided.callbackToken };
  const recorder = createGuidedRecorder({
    recordingScratch: guided.recordingScratch,
    store: wiring.store,
    fileSystem: wiring.fileSystem,
    bounds: wiring.bounds,
    size: { width: wiring.config.recordingWidth, height: wiring.config.recordingHeight },
    calibrationOffsetMs: wiring.config.seekOriginCalibrationMs,
    originSource: systemOriginSource,
    now: wiring.now,
    sleep: wiring.sleep,
  });
  return {
    workerId: guided.workerId,
    journalDirectory: guided.journalDirectory,
    controllerJwt: guided.controllerJwt,
    controllerCertificateFingerprint256: fingerprint,
    capacity: guided.capacity,
    allowedDomains: wiring.config.allowedDomains,
    launch: guided.launch,
    recorder,
    claim: guidedClaimClient(callbacks),
    callback: guidedCallback(callbacks),
  };
}

export function loadObservedRunnerSupport(env:Readonly<Record<string,string|undefined>>=process.env):ObservedRunnerSupport|undefined {
  const validationEnabled=env.STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED==='true',replayEnabled=env.STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED==='true';
  for(const flag of [env.STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED,env.STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED])demand(flag===undefined||flag==='true'||flag==='false','INVALID_CONTRACT');
  if(!validationEnabled&&!replayEnabled)return undefined;
  const build=loadObservedBuild(env);demand(build,'PROFILE_MISMATCH');
  return {build,validationEnabled,replayEnabled};
}
