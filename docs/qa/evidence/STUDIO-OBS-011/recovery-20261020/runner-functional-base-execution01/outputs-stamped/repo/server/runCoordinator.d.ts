import type { BuildIdentity, TrustedPolicy, ValidationVerdict } from '../executor/observedOperations.js';
import type { DeadlineTimers, ServerDeadlineMaxima } from '../run/deadline.js';
import type { EvidenceFileSystem, EvidenceUploadBounds } from '../run/evidenceUpload.js';
import type { ObjectStoreClient } from '../run/objectStore.js';
import type { HttpClient } from '../reporting/httpClient.js';
import type { ReportBounds } from '../reporting/bounds.js';
import type { BrowserLauncher, ScratchStore } from './adapters.js';
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
export declare const FINISHED_RUNS_REMEMBERED = 256;
/**
 * How often an active run reads its control state (ADR-002 §29). Two seconds keeps a cancel
 * observed within about three whatever pod holds the run, at one primary-key read per active run.
 * A constant, like `MAX_CHILD_OUTPUT_LINES`: it is a latency promise, not a deployment knob.
 */
export declare const CONTROL_POLL_INTERVAL_MS = 2000;
/**
 * How far before a secret-bearing control window closes the runner acts on it. Timers only ever
 * fire late, so a stop scheduled exactly at the window end lands after it; acting this much earlier
 * keeps the stop inside the bound. It never extends a window.
 */
export declare const CONTROL_WINDOW_MARGIN_MS = 25;
/**
 * What a step the cancel interrupted says about itself (Studio v1 decision D1).
 *
 * Fixed and value-free: it names no step text, no URL, no locator and no Playwright error. It is
 * written on the `FINAL` only for a step that started and was never reported finished because the
 * child was killed before it could say anything about it (the cancel's grace ran out).
 */
export declare const STOPPED_STEP_MESSAGE = "The run was stopped before this step finished.";
/**
 * Which branch of the secret-bearing control tick ended the run on its own (STUDIO-OBS-009 AC-11 i, R10-OBS-2).
 *
 * A closed label and two integers, nothing else: no value, no URL, no text. `latenessMs` is how long after its window
 * opened the tick began; `durationMs` is how long the tick had been running when it decided.
 */
export type ControlWindowBranch = 'noRequestBudget' | 'noTimerBudget' | 'windowPassed' | 'invalidControlBody';
export interface ObservedRunnerSupport {
    readonly build: BuildIdentity;
    readonly policies: readonly TrustedPolicy[];
    readonly validationEnabled: boolean;
    readonly replayEnabled: boolean;
}
export interface RunCoordinatorOptions {
    readonly observed?: ObservedRunnerSupport;
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
    validateObserved?(body: unknown): ValidationVerdict;
    /**
     * The whole of `POST /v2/runs` after the body has been read and parsed.
     *
     * Synchronous up to and including the slot acquire: there is no `await` between observing free
     * capacity and holding the slot, which is the falsifiable half of AC-10.
     */
    submitObserved?(body: unknown): Promise<RunDecision>;
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
export declare function createRunCoordinator(options: RunCoordinatorOptions): RunCoordinator;
