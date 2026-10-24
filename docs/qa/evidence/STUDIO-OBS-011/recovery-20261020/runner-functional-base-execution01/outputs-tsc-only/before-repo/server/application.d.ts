import type { ObservedRunnerSupport } from './runCoordinator.js';
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
import type { BrowserLauncher, ScratchStore } from './adapters.js';
import type { CapacityPool } from './capacity.js';
import type { RunnerConfig } from './config.js';
import type { LogSink, Logger } from './logging.js';
import type { DeadlineTimers } from '../run/deadline.js';
import type { RecordingScratch } from '../run/recordingScratch.js';
import type { ObjectStoreClient } from '../run/objectStore.js';
import type { EvidenceFileSystem } from '../run/evidenceUpload.js';
import type { RunCoordinator } from './runCoordinator.js';
import type { ListenerSettings, RunnerServer } from './server.js';
import type { GuidedJwtPolicy } from '../guided/transport.js';
import type { GuidedRuntimeOptions } from '../guided/runtime.js';
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
    drain(): Promise<{
        readonly completed: boolean;
        readonly guidedClosed: boolean;
    }>;
}
export declare function createApplication(config: RunnerConfig, dependencies: ApplicationDependencies): RunnerApplication;
export declare function loadObservedRunnerSupport(env?: Readonly<Record<string, string | undefined>>): ObservedRunnerSupport | undefined;
