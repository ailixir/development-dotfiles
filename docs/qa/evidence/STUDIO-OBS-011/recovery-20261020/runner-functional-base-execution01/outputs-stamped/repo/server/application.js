import { loadObservedBuild } from '../compat/runtime-versions.js';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { demand, projectMountedPolicy, parseObservedBytes } from '../validator/observedReferencePolicy.js';
import { createFetchHttpClient } from '../reporting/httpClient.js';
import { createCapacityPool } from './capacity.js';
import { createIdentityChecker } from './identity.js';
import { createLogger, createStdoutSink } from './logging.js';
import { createConfiguredObjectStore, evidenceBoundsFrom, NODE_EVIDENCE_FILE_SYSTEM } from '../run/objectStoreFactory.js';
import { systemOriginSource } from '../run/timeline.js';
import { createRunCoordinator } from './runCoordinator.js';
import { createFsScratchStore } from './scratch.js';
import { createRunnerServer } from './server.js';
import { createGuidedBridge, guidedCallback, guidedClaimClient } from '../guided/transport.js';
import { createGuidedRecorder } from '../guided/evidence.js';
import { createPeerPin } from './identity.js';
function boundsFrom(config) {
    return {
        maxSteps: config.maxReportSteps,
        maxLogEntries: config.maxReportLogEntries,
        maxLogEntryLength: config.maxReportLogEntryLength,
        maxBodyBytes: config.maxReportBodyBytes,
    };
}
const defaultSleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
export function createApplication(config, dependencies) {
    const logger = createLogger({ sink: dependencies.logSink ?? createStdoutSink() });
    const pool = dependencies.pool ?? createCapacityPool(config.poolSize);
    const http = dependencies.http ?? createFetchHttpClient();
    const scratch = dependencies.scratch ?? createFsScratchStore(config.scratchDir);
    // One composition shared with the guided worker (`run/objectStoreFactory.ts`, STUDIO-OBS-013).
    // An injected test store is never closed by the application; a configured one is, on drain.
    const configured = dependencies.objectStore === undefined
        ? createConfiguredObjectStore(config)
        : { store: dependencies.objectStore, close: () => undefined };
    const objectStore = configured.store;
    const evidenceFileSystem = dependencies.evidenceFileSystem ?? NODE_EVIDENCE_FILE_SYSTEM;
    const bounds = boundsFrom(config);
    const now = dependencies.now ?? (() => performance.now());
    const observed = dependencies.observed ?? loadObservedRunnerSupport({ STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED: String(config.observedValidationEnabled), STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED: String(config.observedReplayEnabled), STUDIO_RUNNER_OBSERVED_CATALOG_FILE: config.observedCatalogFile, STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST: config.observedImageDigest, STUDIO_RUNNER_OBSERVED_POLICY_FILE: config.observedPolicyFile, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH });
    const coordinator = createRunCoordinator({
        ...(observed ? { observed } : {}),
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
        now,
        wallClock: dependencies.wallClock ?? (() => new Date()),
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
    const bridge = guidedMode === undefined
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
        async start() {
            // A pod that was killed mid-run leaves scratch behind; the next run must not inherit it.
            await scratch.clearAll();
            const port = await server.listen(config.port, config.host);
            logger.info('runner.started', {
                port,
                poolSize: pool.size,
                runnerInstanceId: config.runnerInstanceId,
                guided: bridge !== undefined,
            });
            return port;
        },
        async drain() {
            pool.beginDrain();
            logger.info('runner.draining', { inFlight: coordinator.inFlight });
            // The guided half starts now, beside the replay half and not after it: a stopped session
            // frees the one guided slot and settles its recording while a replay run is still reporting.
            const guided = bridge === undefined
                ? Promise.resolve(true)
                : bridge.closeSessions().then(() => true, () => {
                    logger.record('error', 'runner.guided_close_unconfirmed', 'runner.guided.close.unconfirmed');
                    return false;
                });
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
            if (bridge !== undefined)
                server.closeAllConnections();
            await server.close();
            await scratch.clearAll();
            configured.close();
            logger.info('runner.drained', { completed, guidedClosed });
            return { completed, guidedClosed };
        },
    };
}
/**
 * Composes the guided bridge from the replay path's own pieces: the same TLS pair that serves the
 * listener is the runner's client identity on the guided callbacks and claims, the same controller
 * fingerprint pins both directions, and the recorder uses the replay object store, bounds and
 * recording geometry (STUDIO-OBS-013 AC-3).
 */
function guidedBridgeOptions(guided, wiring) {
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
        launch: guided.launch,
        recorder,
        claim: guidedClaimClient(callbacks),
        callback: guidedCallback(callbacks),
    };
}
export function loadObservedRunnerSupport(env = process.env) {
    const validationEnabled = env.STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED === 'true', replayEnabled = env.STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED === 'true';
    for (const flag of [env.STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED, env.STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED])
        demand(flag === undefined || flag === 'true' || flag === 'false', 'INVALID_CONTRACT');
    if (!validationEnabled && !replayEnabled)
        return undefined;
    const build = loadObservedBuild(env);
    demand(build, 'PROFILE_MISMATCH');
    const raw = env.STUDIO_RUNNER_OBSERVED_POLICY_FILE ? parseObservedBytes(readFileSync(env.STUDIO_RUNNER_OBSERVED_POLICY_FILE), 2097152) : [];
    demand(Array.isArray(raw) && raw.length <= 32, 'POLICY_REFUSED');
    const policies = raw.map(projectMountedPolicy);
    demand(new Set(policies.map(p => p.policyId + ':' + p.policyVersion)).size === policies.length, 'POLICY_REFUSED');
    return { build, policies, validationEnabled, replayEnabled };
}
//# sourceMappingURL=application.js.map