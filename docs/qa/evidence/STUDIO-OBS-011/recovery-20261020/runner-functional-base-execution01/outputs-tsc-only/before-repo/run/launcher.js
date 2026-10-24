import { provenSecretUseAfterLoss, mergeSecretUseEvidence } from './secretUse.js';
import { ObservedPreReadyFailure } from './errors.js';
import { demand, equalObserved, hashObserved, isRecord, OBSERVED_LIMITS, validateObserved } from '../validator/observedReferencePolicy.js';
import { validateObservedExecute } from '../executor/observedReplay.js';
import { fork } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCRATCH_SUBDIRECTORIES, secureScratchDirectory } from './scratchLayout.js';
import { signalProcessTree } from './tree.js';
import { descendantsOf, isAlive, canEnumerateProcessTree, readProcessTableAsync } from './tree.js';
import { createAppVideoRegistry, sealAppVideoOwner, observeOwnedAppRecording } from './appVideoOwnership.js';
/**
 * Environment variables the child may inherit, by name.
 *
 * `PLAYWRIGHT_BROWSERS_PATH` is how the pinned image tells the library where its browsers live
 * (ADR-001 §4.2); the rest is what a Node process needs to run at all. Nothing in the runner's own
 * `STUDIO_RUNNER_*` namespace is on this list — the browser process holds no runner configuration
 * and no service identity, which is the same posture §9.2 takes toward credentials.
 *
 * **Nothing on this list may load code.** `NODE_OPTIONS` was on it and is not any more: Node reads
 * `--require`, `--import` and `--experimental-loader` out of that variable, so a single Deployment
 * environment entry plus a readable file ran arbitrary code inside the browser child *before*
 * `child.js`, which is enough to rewrite `chromiumSandbox: true` on its way to the library and add
 * a disabling flag — with no diff anywhere in this repository for a lint rule or a scan to catch.
 * §9.3 forbids the sandbox being disabled silently to make something run; that was the pathway.
 *
 * The allowlist is the shape that holds here, so the guard below is stated over the whole class of
 * code-loading variables rather than over the one name that was found. `assertNoCodeLoadingKeys`
 * re-checks the *constructed* environment on every launch, so a future addition to this list fails
 * the launch loudly instead of quietly widening the browser process's trust boundary.
 */
export const INHERITED_ENV_KEYS = [
    'PATH',
    'HOME',
    'LANG',
    'LC_ALL',
    'PLAYWRIGHT_BROWSERS_PATH',
    'DISPLAY',
    'XDG_RUNTIME_DIR',
];
/**
 * Namespaces whose variables can make a process load code it was not asked to load.
 *
 * Prefixes, not names. A denylist of the specific variables anyone happened to think of is what
 * failed — `NODE_OPTIONS` was reviewed onto the allowlist by people who knew what it did — so the
 * rule is stated over the families instead, and a variable Node or a loader adds later is covered
 * by the family it is born into rather than by a later amendment here.
 *
 * - `NODE_*` — the interpreter's own namespace: `NODE_OPTIONS` carries `--require` / `--import` /
 *   `--experimental-loader`, `NODE_PATH` redirects module resolution, `NODE_REPL_EXTERNAL_MODULE`
 *   names a module to load.
 * - `LD_*` — the glibc dynamic linker in the image: `LD_PRELOAD`, `LD_AUDIT`, `LD_LIBRARY_PATH`.
 *   This one reaches the *browser* binary, not just Node.
 * - `DYLD_*` — the same thing on macOS, where the fixtures tier runs.
 * - `OPENSSL_*` — `OPENSSL_CONF` loads providers and engines, which are shared objects.
 */
export const CODE_LOADING_ENV_PREFIXES = ['NODE_', 'LD_', 'DYLD_', 'OPENSSL_'];
/** True when a variable name belongs to one of the code-loading families above. */
export function isCodeLoadingEnvKey(key) {
    const upper = key.toUpperCase();
    return CODE_LOADING_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix));
}
/**
 * Refuses to hand the operating system an environment that could load code into the child.
 *
 * A launch failure is the right outcome: the alternative is a browser process that starts with
 * something else's code in it, and §9.3's instruction is to report rather than to proceed.
 */
export function assertNoCodeLoadingKeys(env) {
    const offenders = Object.keys(env).filter((key) => isCodeLoadingEnvKey(key));
    if (offenders.length > 0) {
        throw new Error(`The browser child environment carries code-loading variables (${offenders.sort().join(', ')}). ` +
            'Node and the dynamic linkers execute what these name before the child runs, which is a ' +
            'path to an unsandboxed browser with no source diff (§9.3). Remove them from ' +
            'INHERITED_ENV_KEYS.');
    }
}
/** Where the compiled child entry sits, relative to this module, once built. */
export const DEFAULT_CHILD_MODULE_PATH = fileURLToPath(new URL('./child.js', import.meta.url));
/** The default spawner: `fork`, no arguments, an enumerated environment, an IPC channel. */
export function createForkSpawner() {
    return {
        spawn(request) {
            const child = fork(request.modulePath, [...request.args], {
                env: { ...request.env },
                // The *other* half of the environment allowlist. `fork` defaults `execArgv` to the
                // parent's, so interpreter flags the runner itself was started with — `node --import x
                // dist/main.js` — would be replayed into the browser child even though its environment is
                // fully enumerated. The child is compiled ESM and needs no interpreter flags, so it gets
                // none, and neither channel can carry code into the process that opens untrusted pages.
                execArgv: [],
                // **Piped, not inherited.** 10.12 inherited both so the child's diagnostics reached the
                // pod log; §9.2 requires scrubbing every outbound diagnostic *before persistence*, and a
                // pod log is persistence. Capturing them is what puts the run's redactor and 10.6's
                // length cap in front of output this package did not format — a Playwright exception or a
                // Chromium warning (AC-8).
                stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
                // The child leads its **own process group**, so one signal reaches Chromium and every
                // process below it. Without this, `kill` reaches Node and orphans the browser (AC-11a).
                // Deliberately not `unref`ed: the parent still waits on this child and still reaps it.
                detached: true,
                serialization: 'json',
            });
            // Descendant tracking for observed recovery. Sampling is **asynchronous and never
            // overlapping**: the synchronous reader blocks the event loop for the length of a `ps` call,
            // and at a 25 ms cadence that starved every runner timer — the secret-bearing control stop
            // included — by up to ~50 ms (STUDIO-OBS-012A). A tick that finds a sample still in flight
            // is skipped rather than queued, so a slow `ps` stretches the cadence instead of stacking
            // readers. Each sample stays bounded by the same 100 ms `ps` timeout as before.
            const remembered = new Set();
            let tracking, sampling;
            // The most recent asynchronous reading that actually showed processes (an unreadable `ps` answers `[]`, which is not a table).
            // `kill()` signals from it, so the kill path never blocks the event loop on a synchronous `ps` (AC-11 j, R10-OBS-1).
            let latest = null;
            const absorb = (table) => { if (table.length > 0)
                latest = table; if (child.pid)
                for (const pid of descendantsOf(child.pid, table))
                    remembered.add(pid); };
            const sample = () => { if (sampling || !child.pid)
                return; sampling = readProcessTableAsync(100).then(absorb).finally(() => { sampling = undefined; }); };
            const remaining = (end) => Math.max(1, Math.min(100, end - Date.now()));
            return {
                trackTree() { if (!tracking) {
                    sample();
                    tracking = setInterval(sample, 25);
                } },
                async quiesce(remainingMs) {
                    const end = Date.now() + Math.max(1, remainingMs);
                    if (tracking) {
                        clearInterval(tracking);
                        tracking = undefined;
                    }
                    // A sample already in flight may hold the only reading of a descendant that has since
                    // been re-parented away from the exited leader, so it is awaited, never discarded —
                    // but only within this cleanup window.
                    const inFlight = sampling;
                    if (inFlight) {
                        let timer;
                        await Promise.race([inFlight, new Promise(r => { timer = setTimeout(r, Math.max(1, end - Date.now())); })]);
                        clearTimeout(timer);
                    }
                    absorb(await readProcessTableAsync(remaining(end)));
                    const pid = child.pid;
                    if (!pid)
                        return false;
                    const table = await readProcessTableAsync(remaining(end)), enumerated = canEnumerateProcessTree(table);
                    // Known browser/encoder groups survive an exited Node leader. Signal retained trees,
                    // then poll the exact observed pids within the existing cleanup window.
                    const pids = [...remembered, pid];
                    for (const member of pids)
                        if (isAlive(member))
                            signalProcessTree(member, 'SIGKILL', undefined, table);
                    while (pids.some(member => isAlive(member))) {
                        if (Date.now() >= end)
                            return false;
                        await new Promise(r => { setTimeout(r, Math.max(1, Math.min(5, end - Date.now()))); });
                    }
                    return enumerated;
                },
                send(message) {
                    if (child.connected)
                        child.send(message, () => { });
                },
                onMessage(listener) {
                    child.on('message', listener);
                },
                onExit(listener) {
                    child.on('exit', listener);
                },
                onOutput(listener) {
                    child.stdout?.setEncoding('utf8');
                    child.stderr?.setEncoding('utf8');
                    child.stdout?.on('data', (chunk) => {
                        listener('stdout', chunk);
                    });
                    child.stderr?.on('data', (chunk) => {
                        listener('stderr', chunk);
                    });
                    // A pipe nobody reads eventually blocks the writer, and a blocked browser child is a
                    // hang this story exists to prevent. An `error` listener keeps a closed pipe from
                    // becoming an uncaught exception in the parent.
                    child.stdout?.on('error', () => undefined);
                    child.stderr?.on('error', () => undefined);
                },
                kill() {
                    const pid = child.pid;
                    if (pid === undefined)
                        return;
                    if (child.exitCode !== null || child.signalCode !== null)
                        return;
                    // AC-11 j (R10-OBS-1): never `signalProcessTree`'s default table, which is the synchronous `ps` (up to 5 s of a
                    // blocked event loop, reachable on an IPC violation and on stop-grace exhaustion while the secret control poll is
                    // live). The signals are unchanged: the group of every process of the tree, deepest first, then the leader's.
                    // What changes is where the tree comes from. Two sources, both asynchronous: the latest sample, and every process
                    // any earlier sample showed. `quiesce()` re-enumerates asynchronously after every kill that matters, so a process
                    // spawned since the last sample is still reached.
                    const sweep = (table) => {
                        // The group, never the pid alone. `src/run/tree.ts` falls back to the single pid only
                        // if the group signal is refused, and says which it did.
                        signalProcessTree(pid, 'SIGKILL', undefined, table);
                        for (const member of remembered)
                            if (member !== pid && isAlive(member))
                                signalProcessTree(member, 'SIGKILL', undefined, table);
                    };
                    if (latest !== null) {
                        sweep(latest);
                        return;
                    }
                    // No reading has landed yet (spawned a moment ago, or never tracked). Enumerate before signalling, always (tree.ts): read
                    // one table asynchronously, then signal. An unreadable `ps` still signals the leader's group and pid.
                    void readProcessTableAsync(100).then((table) => {
                        if (child.exitCode !== null || child.signalCode !== null)
                            return;
                        absorb(table);
                        sweep(table);
                    }, () => undefined);
                },
                get pid() {
                    return child.pid ?? null;
                },
            };
        },
    };
}
function childEnvironment(parentEnv, scratchPath) {
    const env = {};
    for (const key of INHERITED_ENV_KEYS) {
        const value = parentEnv[key];
        if (value !== undefined && value !== '')
            env[key] = value;
    }
    // Chromium's temporary output follows `TMPDIR` into the per-run scratch directory (AC-22).
    env.TMPDIR = join(scratchPath, SCRATCH_SUBDIRECTORIES.temp);
    // The browsers come from the image; a child must never fetch one at run time (ADR-001 §4.2).
    env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1';
    // Stated over what is actually handed to the operating system, so it covers the allowlist and
    // the two literals above alike.
    assertNoCodeLoadingKeys(env);
    return env;
}
/**
 * Builds the real launcher.
 *
 * @param options recording geometry, timeouts and the two test seams (spawner, child module).
 */
export function createChildBrowserLauncher(options) {
    const spawner = options.spawner ?? createForkSpawner();
    const modulePath = options.childModulePath ?? DEFAULT_CHILD_MODULE_PATH;
    const stopTimeoutMs = options.stopTimeoutMs ?? 5_000;
    const parentEnv = options.parentEnv ?? process.env;
    return {
        launch(launchOptions) {
            // The observed family is the only one (STUDIO-OBS-012A AC-3).
            return launchObservedChild(options, launchOptions, spawner, modulePath, parentEnv, stopTimeoutMs);
        },
    };
}
/**
 * The failure kind each kill reason produces.
 *
 * `total-timeout` is §8.2's by-hand ruling and is the one value the runner's code set shares with
 * the API's `ExecutionErrorCode`. `run-fault` → `RUN_ERROR` is the documented residual, and the
 * right answer for a drain: the run did not exceed its budget, the pod is leaving.
 */
const KILL_FAILURE_KINDS = {
    'total-runtime': 'total-timeout',
    drain: 'run-fault',
    cancel: 'cancelled',
};
/** What a killed run says about itself. Bounded and value-free, so it is safe to report. */
const KILL_MESSAGES = {
    'total-runtime': 'The total browser runtime deadline was reached and the browser process tree was stopped.',
    drain: 'The runner drained while this run was still in flight; the browser process tree was stopped.',
    cancel: 'The run was cancelled and the browser process tree was stopped.',
};
/** Exported for the tests that assert the exact text on the serialized `FINAL` body. */
export const TOTAL_TIMEOUT_MESSAGE = KILL_MESSAGES['total-runtime'];
/** Exported for the tests that assert the cancel's text on the serialized `FINAL` body. */
export const CANCELLED_MESSAGE = KILL_MESSAGES.cancel;
/** Observed family uses the same confined spawner, recorded child and bounded process-group stop. */
async function launchObservedChild(options, launchOptions, spawner, modulePath, parentEnv, stopTimeoutMs) {
    const observed = launchOptions.observed;
    demand(observed);
    const { job, admission, policy } = observed, b = job.binding;
    const launch = structuredClone({ kind: 'launch', protocolVersion: 3, mode: 'observed', runId: b.executionId, attemptId: b.attemptId, admission, profile: b.requiredProfile, build: b.requiredBuild, scopeHash: b.scopeHash, configurationHash: b.configurationHash, browser: 'chromium', viewport: job.configuration.viewport, recording: job.recording, seekOriginCalibrationMs: options.seekOriginCalibrationMs, scratchPath: launchOptions.scratchPath, totalRuntimeMs: launchOptions.totalRuntimeMs, scope: b.scope, policy });
    validateObserved('replay-ipc#/definitions/Launch3', launch, OBSERVED_LIMITS.launch);
    const freezeLaunch = (value) => { if (value && typeof value === 'object') {
        for (const child of Object.values(value))
            freezeLaunch(child);
        Object.freeze(value);
    } };
    freezeLaunch(launch);
    const execute = structuredClone({ kind: 'execute', protocolVersion: 3, mode: 'observed', runId: b.executionId, attemptId: b.attemptId, profileHash: hashObserved(b.requiredProfile), configurationHash: b.configurationHash, waitStrategy: job.configuration.waitStrategy, stepTimeoutMs: launchOptions.stepTimeoutMs ?? job.runtime.stepTimeoutMs, steps: job.artifact.steps, guards: job.artifact.guards, bindings: job.artifact.replayPolicy.bindings.map(x => ({ bindingId: x.bindingId, producer: x.producer, recipe: x.recipe, origin: x.sourceOrigin })), transfers: job.artifact.replayPolicy.transfers, inputs: job.artifact.inputRecipes.map(i => { if (i.kind === 'secretRef') {
            demand(i.provenance.kind === 'configuration');
            return { inputId: i.inputId, stepId: i.stepId, kind: 'secretRef', intendedSlot: 'fill.value', referenceName: i.provenance.referenceName };
        } const v = job.inputs.find(x => x.inputId === i.inputId); demand(v); return { inputId: i.inputId, stepId: i.stepId, kind: i.kind === 'destination' ? 'destination' : 'nonsecretText', intendedSlot: i.intendedSlot, value: v.value }; }), secrets: job.secrets, secretOrigins: job.secretOrigins, ...(job.artifact.learnedPlan.bindings.some(binding => binding.consumers.length === 0) ? { retainedArtifact: job.artifact } : {}) });
    validateObservedExecute(execute, b.scope, launch);
    mkdirSync(join(launchOptions.scratchPath, SCRATCH_SUBDIRECTORIES.temp), { recursive: true });
    secureScratchDirectory(launchOptions.scratchPath);
    const videoRegistry = createAppVideoRegistry(launchOptions.scratchPath);
    const env = childEnvironment(parentEnv, launchOptions.scratchPath);
    for (const key of ['STUDIO_RUNNER_OBSERVED_CATALOG_FILE', 'STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST'])
        if (parentEnv[key])
            env[key] = parentEnv[key] ?? '';
    demand(!launchOptions.signal?.aborted, 'CANCELLED');
    const runtimeDeadlineEpochMs = Math.min(Date.now() + launchOptions.totalRuntimeMs, Date.parse(admission.runDeadlineAt));
    const child = spawner.spawn({ modulePath, args: [], env });
    child.trackTree?.();
    // Drain and discard all raw output from BEFORE the first launch message.
    child.onOutput(() => undefined);
    let result = null, ready = null, exited = false, violation = false, executed = false, reporter = null, killReason = null;
    const startedSteps = new Map(), completedSteps = new Map();
    const waiters = new Set();
    const wake = () => {
        for (const f of waiters)
            f();
    };
    let videoOwner, quiescent = false;
    const sealVideo = () => { videoOwner ??= sealAppVideoOwner(videoRegistry, launch, child.pid); };
    const sealedVideo = () => videoOwner ?? { kind: 'absent' };
    child.onExit(() => { sealVideo(); exited = true; wake(); });
    child.onMessage(raw => {
        try {
            const kind = isRecord(raw) && typeof raw.kind === 'string' ? raw.kind : '';
            const names = { ready: 'Ready3', result: 'Result3', 'step-started': 'StepStarted3', 'step-finished': 'StepFinished3' };
            const name = names[kind];
            demand(name);
            const m = validateObserved('replay-ipc#/definitions/' + name, raw, OBSERVED_LIMITS.result);
            demand(m.runId === b.executionId && m.attemptId === b.attemptId);
            if (m.kind === 'ready' || m.kind === 'result')
                demand(m.admissionId === admission.admissionId && m.profileHash === hashObserved(b.requiredProfile) && equalObserved(m.build, b.requiredBuild), 'PROFILE_MISMATCH');
            if (m.kind === 'ready') {
                demand(!ready && !result);
                validateObserved('replay-ipc#/definitions/Ready3', m, OBSERVED_LIMITS.ready);
                ready = m;
            }
            else if (m.kind === 'result') {
                demand(!result && (m.ok ? m.errorCode === null : m.errorCode !== null));
                if (executed)
                    demand(completedSteps.size === execute.steps.length && (!m.ok || execute.steps.every(s => completedSteps.get(s.stepIndex) === 'PASS')));
                const receipts = provenSecretUseAfterLoss(Object.keys(job.secrets), job.artifact.inputRecipes, job.artifact.steps, executed, completedSteps);
                demand(!mergeSecretUseEvidence(receipts, m.secretUse, Object.keys(job.secrets)).contradictory);
                result = m;
            }
            else {
                validateObserved(m.kind === 'step-started' ? 'replay-ipc#/definitions/StepStarted3' : 'replay-ipc#/definitions/StepFinished3', m, OBSERVED_LIMITS.step);
                demand(executed && reporter && job.artifact.steps[m.stepIndex]?.stepId === m.stepId && !result);
                if (m.kind === 'step-started') {
                    demand(!startedSteps.has(m.stepIndex) && !completedSteps.has(m.stepIndex) && m.stepIndex === completedSteps.size);
                    startedSteps.set(m.stepIndex, m.startedAtMs);
                    reporter.stepStarted({ stepIndex: m.stepIndex, startedAtMs: m.startedAtMs });
                }
                else {
                    demand(!completedSteps.has(m.stepIndex) && m.stepIndex === completedSteps.size);
                    demand(m.status === 'SKIPPED' ? !startedSteps.has(m.stepIndex) : startedSteps.get(m.stepIndex) === m.startedAtMs);
                    demand(m.status === 'SKIPPED' ? m.startedAtMs === null && m.finishedAtMs === null && m.durationMs === null && m.errorCode === null : m.startedAtMs !== null && m.finishedAtMs !== null && m.durationMs !== null && [m.startedAtMs, m.finishedAtMs, m.durationMs].every(n => Number.isFinite(n) && n >= 0) && m.finishedAtMs >= m.startedAtMs && Math.abs(m.durationMs - (m.finishedAtMs - m.startedAtMs)) < 0.001 && (m.status === 'PASS' ? m.errorCode === null : m.errorCode !== null));
                    completedSteps.set(m.stepIndex, m.status);
                    reporter.stepFinished({ stepIndex: m.stepIndex, status: m.status, startedAtMs: m.startedAtMs, finishedAtMs: m.finishedAtMs, durationMs: m.durationMs, failure: m.errorCode });
                }
            }
            wake();
        }
        catch {
            violation = true;
            sealVideo();
            child.kill();
            wake();
        }
    });
    const wait = async (predicate, timeoutMs) => {
        if (predicate())
            return true;
        return new Promise(resolve => {
            const check = () => {
                if (predicate()) {
                    clearTimeout(timer);
                    waiters.delete(check);
                    resolve(true);
                }
            };
            const timer = setTimeout(() => { waiters.delete(check); resolve(false); }, Math.max(1, timeoutMs));
            waiters.add(check);
            check();
        });
    };
    let stopping = null, ordered = false;
    const wasOrderly = (final) => quiescent && final !== null && final.recording.state === 'PENDING' && !final.recording.partial;
    const performStop = async () => {
        sealVideo();
        const end = Date.now() + stopTimeoutMs, requestedWhileLive = !exited;
        if (requestedWhileLive)
            child.send({ kind: 'stop' });
        const withinGrace = requestedWhileLive && await wait(() => exited, Math.max(1, end - Date.now()));
        if (!withinGrace)
            child.kill();
        // stopTimeoutMs is the ordered-close grace; the same existing cleanup bound caps
        // a separate post-signal reaping wait. It grants no action/runtime/admission time.
        quiescent = await child.quiesce?.(stopTimeoutMs) ?? false;
        ordered = withinGrace && wasOrderly(result);
    };
    const stop = () => { stopping ??= performStop(); return stopping; };
    const cancelLaunch = () => { killReason ??= 'cancel'; void stop(); };
    launchOptions.signal?.addEventListener('abort', cancelLaunch, { once: true });
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Cancellation can arrive after the pre-spawn check.
    if (launchOptions.signal?.aborted)
        cancelLaunch();
    else
        child.send(launch);
    // Read before stop(): performStop kills the child, so `exited` is true on every path after it.
    // false means the wait timer expired with no ready, result, exit or violation (012A R8-ADJ-2).
    const settled = await wait(() => ready !== null || result !== null || exited || violation, Math.min(options.launchTimeoutMs, Date.parse(admission.startDeadlineAt) - Date.now(), runtimeDeadlineEpochMs - Date.now()));
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- IPC callbacks and stop may change this state while the parent awaits.
    if (!ready || violation || launchOptions.signal?.aborted) {
        await stop();
        launchOptions.signal?.removeEventListener('abort', cancelLaunch);
        const final = result;
        const recording = observeOwnedAppRecording(sealedVideo(), final?.recording.path, wasOrderly(final), quiescent);
        // A reason the child sent wins. Otherwise: an abort is CANCELLED, an expired pre-Ready wait is
        // TIMEOUT, and an exit or protocol violation before Ready is INTERNAL_ERROR (R8-ADJ-2).
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Abort/IPC callbacks settle independently of the launch await.
        throw new ObservedPreReadyFailure(final?.errorCode ?? (launchOptions.signal?.aborted ? 'CANCELLED' : !settled ? 'TIMEOUT' : 'INTERNAL_ERROR'), recording);
    }
    launchOptions.signal?.removeEventListener('abort', cancelLaunch);
    const origin = ready;
    return { close: stop, run: { origin: { browserStartedAt: new Date(origin.browserStartedAt), startedAtMs: origin.startedAtMs, ...(origin.calibrationOffsetMs === null ? {} : { calibrationOffsetMs: origin.calibrationOffsetMs }) }, async kill(reason) { killReason ??= reason; await stop(); return { orderedStopCompleted: ordered }; }, async execute(request) {
                demand(!executed && !result && !violation);
                // A void/backpressured/disconnected send cannot prove non-delivery. Mark the
                // private attempt before entering transport; missing child receipts stay unknown.
                executed = true;
                reporter = request.reporter;
                child.send(execute);
                await wait(() => result !== null || exited || violation, runtimeDeadlineEpochMs - Date.now());
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- IPC callbacks and stop may change this state while the parent awaits.
                if (!result && !exited && !violation) {
                    killReason ??= 'total-runtime';
                    await stop();
                }
                else
                    await stop();
                const final = result;
                const usage = mergeSecretUseEvidence(provenSecretUseAfterLoss(Object.keys(job.secrets), job.artifact.inputRecipes, job.artifact.steps, executed, completedSteps), final?.secretUse, Object.keys(job.secrets));
                const recording = observeOwnedAppRecording(sealedVideo(), final?.recording.path, wasOrderly(final), quiescent);
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- IPC callbacks and stop may change this state while the parent awaits.
                return { ok: killReason === null && !violation && final?.ok === true, failureKind: killReason ? KILL_FAILURE_KINDS[killReason] : final?.errorCode === 'ASSERTION_FAILED' ? 'step' : final?.ok ? null : 'run-fault', failureMessage: killReason ? KILL_MESSAGES[killReason] : final?.errorCode ?? (violation ? 'INVALID_CONTRACT' : null), recording, observedHosts: [], secretUse: usage.facts, ...(final?.detail ? { detail: final.detail } : {}) };
            } } };
}
/** A child-supplied path is never an unrestricted file-upload capability. */
//# sourceMappingURL=launcher.js.map