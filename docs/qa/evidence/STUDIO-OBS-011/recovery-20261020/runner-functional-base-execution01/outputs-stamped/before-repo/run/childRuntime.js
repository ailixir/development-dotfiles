import { SecretUseEvidence } from './secretUse.js';
import { assertBuild, assertProfile, demand, equalObserved, hashObserved, OBSERVED_LIMITS, validateObserved, validateTrustedPolicy } from '../validator/observedReferencePolicy.js';
import { executeObservedReplay, replayError, validateObservedExecute } from '../executor/observedReplay.js';
import { createObservedReplayAdapter } from './observedReplayAdapter.js';
import { BrowserStartupCleanupFailure } from './browserFactory.js';
import { evidenceFor, inspectRecordingFile } from './recording.js';
import { takeRunOrigin } from './timeline.js';
import { publishAppVideoOwner } from './appVideoOwnership.js';
import { boundedStartup } from './observedBootstrap.js';
/**
 * How long the recorder runs on past the last operation before the ordinary close.
 *
 * The replay resolves the instant the last operation's promise does, and a click that triggered a
 * navigation resolves when the navigation *commits* — not when the new document paints. Closing
 * the context right there stops the recorder before the final action's result has composited, so
 * the recording would end on the state *before* the last step. The hold is a few frame quanta (the
 * recorder samples at 25 fps, 40 ms apart), never longer than the run deadline that remains, and
 * an out-of-band `stop` is never delayed by it.
 */
export const TAIL_SETTLE_HOLD_MS = 300;
function defaultSleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
/** The single recorded browser creation seam. */
function launchRecordedBrowser(browsers, request) { return browsers.launch(request); }
/** Binds the observed child runtime to its channel. The first frame must be a valid `Launch3`. */
export function attachChildRuntime(dependencies) {
    attachObservedChildRuntime(dependencies);
}
function attachObservedChildRuntime(dependencies) {
    const { channel } = dependencies;
    const abort = new AbortController();
    let launch = null, handle = null, clock = null;
    let opening = null, cleanupUnconfirmed = false;
    let runDeadlineMs = 0, admittedRuntimeDeadlineEpochMs = 0;
    let execution = null;
    let usageEvidence = new SecretUseEvidence([]);
    let detail;
    const startedSteps = new Map(), completedSteps = new Set();
    let phase = 'NEW', finished = false, closing = null, deadline = null;
    let queue = Promise.resolve();
    const finish = async (errorCode) => {
        if (finished)
            return;
        finished = true;
        phase = 'DONE';
        abort.abort();
        if (deadline)
            clearTimeout(deadline);
        let current = handle;
        if (!current && opening) {
            try {
                current = await opening;
            }
            catch (error) {
                cleanupUnconfirmed = error instanceof BrowserStartupCleanupFailure;
            }
        }
        handle = null;
        let recording = { path: null, bytes: null, errorCode: null, state: 'UNAVAILABLE', partial: false };
        if (current) {
            let path = null, orderly = true;
            try {
                path = await current.close();
            }
            catch {
                orderly = false;
                try {
                    await current.dispose();
                }
                catch {
                    cleanupUnconfirmed = true;
                }
            }
            const inspected = await (dependencies.inspectRecording ?? inspectRecordingFile)(path, orderly);
            const e = evidenceFor(inspected);
            recording = { path: e.path, bytes: e.bytes, errorCode: e.error === null ? null : 'RECORDING_FAILED', state: e.state, partial: e.partial };
        }
        if (execution && launch) {
            for (const step of execution.steps) {
                if (completedSteps.has(step.stepIndex))
                    continue;
                const start = startedSteps.get(step.stepIndex), end = start === undefined ? null : clock?.now() ?? start;
                channel.send({ kind: 'step-finished', protocolVersion: 3, mode: 'observed', runId: launch.runId, attemptId: launch.attemptId, stepIndex: step.stepIndex, stepId: step.stepId, status: start === undefined ? 'SKIPPED' : 'FAIL', startedAtMs: start ?? null, finishedAtMs: end, durationMs: start === undefined || end === null ? null : end - start, errorCode: start === undefined ? null : errorCode ?? 'INTERNAL_ERROR' });
                completedSteps.add(step.stepIndex);
            }
        }
        if (launch)
            channel.send({ kind: 'result', protocolVersion: 3, mode: 'observed', runId: launch.runId, attemptId: launch.attemptId, admissionId: launch.admission.admissionId, profileHash: hashObserved(launch.profile), build: launch.build, ok: errorCode === null, errorCode, recording, secretUse: usageEvidence.snapshot(), ...(detail ? { detail } : {}) });
        if (execution) {
            for (const key of Object.keys(execution.secrets))
                execution.secrets[key] = '';
            for (const input of execution.inputs)
                if (input.kind !== 'secretRef')
                    input.value = '';
        }
        execution = null;
        launch = null;
        if (!cleanupUnconfirmed)
            channel.exit(0);
    };
    const stop = (code) => { abort.abort(); closing ??= finish(code); };
    const live = () => { demand(!abort.signal.aborted && !finished, 'CANCELLED'); };
    const dispatch = async (value) => {
        if (finished)
            return;
        try {
            if (phase === 'NEW') {
                const m = structuredClone(validateObserved('replay-ipc#/definitions/Launch3', value, OBSERVED_LIMITS.launch));
                // Retain a private immutable launch snapshot; channel callers cannot mutate accepted authority.
                const freeze = (item) => { if (item && typeof item === 'object') {
                    for (const child of Object.values(item))
                        freeze(child);
                    Object.freeze(item);
                } };
                freeze(m);
                launch = m;
                demand(dependencies.observedBuild, 'PROFILE_MISMATCH');
                assertProfile(m.profile);
                assertBuild(m.build, dependencies.observedBuild);
                const r = m.admission.request;
                demand(m.admission.admissionId === r.admissionId && m.runId === r.executionId && m.attemptId === r.attemptId && m.scopeHash === r.scopeHash && m.configurationHash === r.configurationHash && equalObserved(m.profile, r.profile) && equalObserved(m.build, r.build), 'INVALID_CONTRACT');
                const scope = m.scope;
                demand(equalObserved(validateTrustedPolicy(m.policy, scope), m.policy), 'POLICY_REFUSED');
                demand(hashObserved(m.policy) === r.currentPolicyHash && hashObserved(scope) === m.scopeHash, 'POLICY_REFUSED');
                demand(Date.parse(m.admission.startDeadlineAt) > Date.now() && Date.parse(m.admission.runDeadlineAt) > Date.now(), 'AUTHORIZATION_EXPIRED');
                admittedRuntimeDeadlineEpochMs = Math.min(Date.now() + m.totalRuntimeMs, Date.parse(m.admission.runDeadlineAt));
                const startupDeadline = Math.min(Date.parse(m.admission.startDeadlineAt), admittedRuntimeDeadlineEpochMs);
                deadline = setTimeout(() => { stop('TIMEOUT'); }, Math.max(1, startupDeadline - Date.now()));
                live();
                opening = launchRecordedBrowser(dependencies.browsers, { browser: m.browser, viewport: m.viewport, recording: m.recording, scratchPath: m.scratchPath, observedScope: scope, startup: { signal: abort.signal, deadlineEpochMs: startupDeadline } });
                const opened = await opening;
                if (abort.signal.aborted) {
                    await opened.dispose();
                    return;
                }
                handle = opened;
                opened.onExtraPage(() => { stop('TARGET_DRIFT'); });
                live();
                demand(opened.observedStartupReady?.() ?? true, 'TARGET_DRIFT');
                demand(typeof opened.observedAppVideoPath === 'function', 'INVALID_CONTRACT');
                const nativePath = await boundedStartup(() => opened.observedAppVideoPath ? opened.observedAppVideoPath() : Promise.reject(new Error('RECORDING_FAILED')), startupDeadline, abort.signal);
                live();
                demand(opened.observedStartupReady?.() ?? true, 'TARGET_DRIFT');
                (dependencies.publishAppVideoOwner ?? publishAppVideoOwner)(m, nativePath, () => { live(); demand(Date.now() < startupDeadline, 'TIMEOUT'); });
                live();
                demand(opened.observedStartupReady?.() ?? true, 'TARGET_DRIFT');
                const origin = takeRunOrigin(dependencies.originSource, m.seekOriginCalibrationMs);
                clock = origin.clock;
                clearTimeout(deadline);
                demand(admittedRuntimeDeadlineEpochMs > Date.now(), 'TIMEOUT');
                runDeadlineMs = clock.now() + admittedRuntimeDeadlineEpochMs - Date.now();
                deadline = setTimeout(() => { stop('TIMEOUT'); }, Math.max(1, runDeadlineMs - clock.now()));
                live();
                demand(await opened.observedInitialContextMatches?.(), 'TARGET_DRIFT');
                live();
                phase = 'READY';
                channel.send({ kind: 'ready', protocolVersion: 3, mode: 'observed', runId: m.runId, attemptId: m.attemptId, profileHash: hashObserved(m.profile), build: m.build, admissionId: m.admission.admissionId, browserStartedAt: origin.browserStartedAt.toISOString(), startedAtMs: origin.startedAtMs, calibrationOffsetMs: origin.calibrationOffsetMs });
                return;
            }
            demand(phase === 'READY' && launch && handle && clock, 'INVALID_CONTRACT');
            const m = validateObservedExecute(value, launch.scope, launch);
            demand(m.runId === launch.runId && m.attemptId === launch.attemptId && m.configurationHash === launch.configurationHash && m.profileHash === hashObserved(launch.profile), 'INVALID_CONTRACT');
            demand(hashObserved({ browser: launch.browser, viewport: launch.viewport, timeoutSeconds: m.stepTimeoutMs / 1000, waitStrategy: m.waitStrategy, environment: launch.scope.environment }) === launch.configurationHash, 'INVALID_CONTRACT');
            phase = 'EXECUTING';
            // Execution now owns the same run ceiling through its invocation-aware control.
            // Keep the independent timer for launch/Ready waiting only.
            if (deadline)
                clearTimeout(deadline);
            deadline = null;
            execution = m;
            usageEvidence = new SecretUseEvidence(Object.keys(m.secrets));
            const fixed = launch, steps = m.steps;
            const reporter = { stepStarted(e) {
                    if (finished)
                        return;
                    startedSteps.set(e.stepIndex, e.startedAtMs);
                    const step = steps[e.stepIndex];
                    demand(step);
                    channel.send({ kind: 'step-started', protocolVersion: 3, mode: 'observed', runId: fixed.runId, attemptId: fixed.attemptId, stepIndex: e.stepIndex, stepId: step.stepId, startedAtMs: e.startedAtMs });
                }, stepFinished(e) {
                    if (finished)
                        return;
                    completedSteps.add(e.stepIndex);
                    const step = steps[e.stepIndex];
                    demand(step);
                    channel.send({ kind: 'step-finished', protocolVersion: 3, mode: 'observed', runId: fixed.runId, attemptId: fixed.attemptId, stepIndex: e.stepIndex, stepId: step.stepId, status: e.status, startedAtMs: e.startedAtMs, finishedAtMs: e.finishedAtMs, durationMs: e.durationMs, errorCode: e.failure, ...(e.detail ? { detail: e.detail } : {}) });
                } };
            const adapter = createObservedReplayAdapter(handle, launch.scope, launch.policy, launch.runId, live, m.waitStrategy, m.stepTimeoutMs);
            const result = await executeObservedReplay(m, adapter, launch.scope, clock, reporter, abort.signal, runDeadlineMs, usageEvidence, fixed);
            detail = result.detail;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Stop can finish the run while execution awaits native browser input.
            if (!finished) {
                await (dependencies.sleep ?? defaultSleep)(Math.max(0, Math.min(TAIL_SETTLE_HOLD_MS, runDeadlineMs - clock.now())));
                closing ??= finish(result.errorCode);
                await closing;
            }
        }
        catch (error) {
            closing ??= finish(replayError(error));
            await closing;
        }
    };
    channel.onMessage(value => {
        if (typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'stop') {
            try {
                validateObserved('replay-ipc#/definitions/Stop', value, 128);
                stop('CANCELLED');
            }
            catch {
                stop('INVALID_CONTRACT');
            }
            return;
        }
        queue = queue.then(() => dispatch(value));
    });
}
//# sourceMappingURL=childRuntime.js.map