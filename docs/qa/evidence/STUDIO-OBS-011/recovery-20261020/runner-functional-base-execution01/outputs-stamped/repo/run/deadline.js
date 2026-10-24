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
/** The real timers, as a value, so the coordinator can inject a deterministic pair in tests. */
export const SYSTEM_DEADLINE_TIMERS = {
    set(callback, ms) {
        return setTimeout(callback, ms);
    },
    clear(timer) {
        clearTimeout(timer);
    },
};
export function createRuntimeDeadline(options) {
    const { capMs, now, timers, onExpire } = options;
    let timer = null;
    let armedAtMs = null;
    let expired = false;
    return {
        capMs,
        get armed() {
            return armedAtMs !== null;
        },
        get armedAtMs() {
            return armedAtMs;
        },
        get expired() {
            return expired;
        },
        arm() {
            // Once. The absence of a re-arm is the enforcement, not a comment asking for one (AC-4).
            if (armedAtMs !== null)
                return;
            armedAtMs = now();
            timer = timers.set(() => {
                expired = true;
                timer = null;
                onExpire();
            }, capMs);
        },
        cancel() {
            if (timer === null)
                return;
            timers.clear(timer);
            timer = null;
        },
    };
}
/**
 * `min(requested, maximum)`.
 *
 * A job asking for less gets less; a job asking for more gets the server's value. Stated as one
 * function used by both clamps so the direction cannot drift between them — a `max` here would
 * turn the job envelope into a way to buy browser time, which is precisely what §5.2's "within
 * server limits" denies.
 */
function clamp(requestedMs, maximumMs) {
    if (!Number.isFinite(requestedMs) || requestedMs <= 0)
        return maximumMs;
    return Math.min(requestedMs, maximumMs);
}
/** The effective total browser runtime for a job (AC-6). */
export function effectiveRuntimeCapMs(requestedMs, maxima) {
    return clamp(requestedMs, maxima.totalRuntimeMs);
}
/**
 * The effective per-step timeout for a job (AC-6).
 *
 * `job.configuration.timeoutSeconds` is validated by the envelope and was then ignored by the run,
 * so "configurable within server limits" was neither configurable nor limited. This is where it
 * starts being honoured — in seconds on the wire, milliseconds everywhere else.
 */
export function effectiveStepTimeoutMs(requestedSeconds, maxima) {
    return clamp(requestedSeconds * 1_000, maxima.stepTimeoutMs);
}
//# sourceMappingURL=deadline.js.map