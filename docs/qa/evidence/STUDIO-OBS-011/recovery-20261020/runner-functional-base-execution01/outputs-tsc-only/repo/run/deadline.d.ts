/**
 * The runtime budget: one timer, armed once, extendable by nothing (AC-1, AC-2, AC-4, AC-6).
 *
 * ## Two budgets, not one
 *
 * Architecture §8.5 is explicit — *"queue time and browser runtime are separate budgets"*. The
 * **queue** budget is the admitted-start deadline, measured from `admittedAtMs`, the instant the
 * admission CAS returned; `runCoordinator` already holds it and already refuses a launch after it.
 * The **runtime** budget is this module, and it is measured from the **browser start** and from
 * nothing else: not from `admittedAtMs`, not from the `POST /v2/runs` arriving, not from the spawn
 * call, not from the scratch directory being created. A run that spent nine-tenths of its queue
 * budget waiting still gets the whole of its browser time, because a slow queue is not the job's
 * fault and a run that dies before it has done anything wrong is a lie about the test.
 *
 * ## The clock is the parent's, and it is never re-based
 *
 * The child owns the run clock whose zero is the recording origin (ADR-002 §11.2); the parent
 * cannot read it and must not try. {@link createRuntimeDeadline} is armed on the parent's own
 * monotonic source — the same `now` the coordinator uses for the start deadline — at the instant
 * the parent **observes the `ready` handshake**.
 *
 * The consequence is stated rather than hidden: the parent's arming instant is at or after the
 * child's origin by the inter-process handshake latency, so the enforced cap is never *shorter*
 * than the configured one. A run is never truncated below its budget, and the surplus is bounded
 * by `launchTimeoutMs`, which is a separate bound. The parent does **not** convert its own elapsed
 * time into a reading on the run timeline: the log entry the expiry writes carries `atMs: null`,
 * because `null` is the contract's encoding for "no reading" (ADR-002 §INT-1, §11.2) and a
 * wall-derived number would be the second origin §11.5 forbids.
 *
 * ## Nothing extends it
 *
 * §5.4: *"heartbeats never extend the maximum run deadline indefinitely"*. That property is
 * structural here rather than a rule someone has to remember: there is no `extend`, no `reset`, no
 * `postpone` and no `refresh` on {@link RuntimeDeadline}, and {@link RuntimeDeadline.arm} is
 * once-only — a second call is a no-op, not a re-arm. A step event, a log line, a protocol
 * keepalive or a configuration key therefore has nothing to call. The other half of the property
 * is the clamp below: a job asking for more browser time than the deployment permits does not get
 * it.
 */
/** Whatever the host's timer facility hands back. Opaque on purpose. */
export type DeadlineTimer = unknown;
export interface DeadlineTimers {
    /**
     * Function-typed properties rather than methods, deliberately.
     *
     * Both are passed around as **values** — the coordinator hands them to `createRuntimeDeadline`,
     * which calls them detached from whatever object they came from. Declaring them as methods
     * would let an implementation depend on `this`, which is a bug that only shows up once
     * somebody destructures the object.
     */
    readonly set: (callback: () => void, ms: number) => DeadlineTimer;
    readonly clear: (timer: DeadlineTimer) => void;
}
/** The real timers, as a value, so the coordinator can inject a deterministic pair in tests. */
export declare const SYSTEM_DEADLINE_TIMERS: DeadlineTimers;
export interface RuntimeDeadlineOptions {
    /** The effective cap, already clamped to the server maximum (AC-6). */
    readonly capMs: number;
    /** The parent's monotonic source. The same one the start deadline is measured on (AC-2). */
    readonly now: () => number;
    readonly timers: DeadlineTimers;
    /**
     * Runs when the budget is spent.
     *
     * Invoked synchronously from the timer callback, so whatever it does first is done **before**
     * anything else can observe the expiry — which is what lets the kill path record *why* it is
     * killing before it signals (AC-3, AC-16).
     */
    readonly onExpire: () => void;
}
export interface RuntimeDeadline {
    /**
     * Starts the budget, once.
     *
     * A second call is deliberately a no-op rather than a re-arm: this is the single place a
     * heartbeat could have extended the maximum deadline, and it does not exist here to be called.
     */
    arm(): void;
    /** Stops the timer. Idempotent, and safe before arming and after expiry. */
    cancel(): void;
    /** The parent-clock reading taken at arming; `null` until then. Never a run-timeline value. */
    readonly armedAtMs: number | null;
    readonly armed: boolean;
    readonly expired: boolean;
    /** The effective cap being enforced, in milliseconds. */
    readonly capMs: number;
}
export declare function createRuntimeDeadline(options: RuntimeDeadlineOptions): RuntimeDeadline;
/**
 * The server limits a job is clamped to (§5.2 "configurable within server limits", AC-6).
 *
 * Read from the enumerated configuration keys, so the fail-closed loader still owns the surface:
 * there is no way to raise a maximum that is not a `STUDIO_RUNNER_*` key on `KEY_SPECS`.
 */
export interface ServerDeadlineMaxima {
    readonly totalRuntimeMs: number;
    readonly stepTimeoutMs: number;
}
/** The effective total browser runtime for a job (AC-6). */
export declare function effectiveRuntimeCapMs(requestedMs: number, maxima: ServerDeadlineMaxima): number;
/**
 * The effective per-step timeout for a job (AC-6).
 *
 * `job.configuration.timeoutSeconds` is validated by the envelope and was then ignored by the run,
 * so "configurable within server limits" was neither configurable nor limited. This is where it
 * starts being honoured — in seconds on the wire, milliseconds everywhere else.
 */
export declare function effectiveStepTimeoutMs(requestedSeconds: number, maxima: ServerDeadlineMaxima): number;
