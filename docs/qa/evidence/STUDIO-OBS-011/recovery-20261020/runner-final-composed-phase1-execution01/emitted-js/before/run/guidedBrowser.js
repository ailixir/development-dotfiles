/**
 * The whole guided start is bounded by one budget (STUDIO-OBS-015 REL-001/D4, architect ruling
 * `aria-d4-launch-deadline-ruling01`). The backend gives up on a runner call after 15 s
 * (`GuidedRunnerClient.transportDeadline`, hard-coded; `delayed-state-design.md:108`: "a 15-second
 * HTTP ceiling"). The runner keeps a 3 s reserve inside it for teardown, the lifecycle callback and
 * the reply, so a start that cannot finish is refused with a closed `CONTEXT_LOST` while the backend
 * is still listening, instead of holding the single worker slot for Playwright's 180 s launch
 * timeout or forever. A constant, not a knob: a configurable value could drift above the backend's.
 */
export const GUIDED_START_TRANSPORT_CEILING_MS = 15_000;
export const GUIDED_START_RESERVE_MS = 3_000;
export const GUIDED_START_BUDGET_MS = GUIDED_START_TRANSPORT_CEILING_MS - GUIDED_START_RESERVE_MS;
/**
 * The graceful stage of the two-stage close of a guided browser whose start completed (KL-015-D5, W1.5 ruling part 1
 * section 2.2, rule D5-1). `context.close()` is raced against this, then the hard teardown always runs.
 *
 * 3 s is the largest round value that keeps the worst-case stop reply inside the backend's 15 s per send: the grace, plus the
 * hard teardown (at most about 1.5 s on a readable process table), plus the lifecycle callback (at most 10 s, `transport.ts`)
 * is 14.5 s; 5 s would be 16.5 s. It stays far below Playwright's own 30 s close bound and the runner's 30 s socket timeout,
 * neither of which is relied on. A constant, not a knob, for the same reason as the start budget above: a configured value
 * could drift above the backend's ceiling. A healthy recorded close must finish well inside it (fixtures case H measures it).
 */
export const GUIDED_CLOSE_GRACE_MS = 3_000;
/**
 * The cause a failed launch reports when its own wait ended (REL-001/D4). A wait that the start signal
 * ended rejects `CANCELLED` whoever aborted it, so the abort reason says which it was: the runtime aborts
 * with its `TIMEOUT` error when the budget ran out and with `CANCELLED` on a stop. Only those two closed
 * reasons are taken; anything else (a bare `abort()`, a foreign reason) leaves the caught error as it is.
 */
export function launchFailureCause(error, signal) {
    if (!(error instanceof Error) || error.message !== 'CANCELLED' || signal?.aborted !== true)
        return error;
    const reason = signal.reason;
    return reason instanceof Error && (reason.message === 'TIMEOUT' || reason.message === 'CANCELLED') ? reason : error;
}
/**
 * The two-stage close of one guided launch as a pure helper (KL-015-D5 rule D5-1), so the clock arithmetic is proven in the
 * unit tier and `launchGuidedBrowser` (which the unit tier may not import) only supplies the two stages.
 *
 * `close()` races `graceful` against `graceMs`, records whether it resolved in time, then always awaits `terminate()`.
 * `terminate()` is the hard stage on its own, memoised, and shared with `close()`. Both memoise their promise, so a repeat call
 * returns the same settlement and a rejection (a survivor) is never retried.
 */
export function guidedCloseStages(ports, graceMs = GUIDED_CLOSE_GRACE_MS) {
    let orderly = false;
    let terminating = null;
    let closing = null;
    const terminate = () => {
        ports.onClosing?.();
        return terminating ??= ports.hard();
    };
    const close = () => {
        ports.onClosing?.();
        const closeOnce = async () => {
            let timer;
            const resolvedInTime = ports.graceful().then(() => true, () => false);
            const expired = new Promise((resolve) => { timer = setTimeout(() => { resolve(false); }, Math.max(1, graceMs)); });
            try {
                // Only a close that resolved inside the grace is orderly. One that resolves later cannot change the verdict.
                const verdict = await Promise.race([resolvedInTime, expired]);
                if (terminating === null)
                    orderly = verdict;
            }
            finally {
                if (timer)
                    clearTimeout(timer);
            }
            await terminate();
        };
        closing ??= closeOnce();
        return closing;
    };
    return { close, terminate, orderlyClosed: () => orderly };
}
/**
 * A launch that failed. The wire code stays `CONTEXT_LOST`, but the original error is kept as `cause`
 * and the step that failed as `phase`, so the worker can say why it refused (REL-001).
 * A partially created browser still needs confirmed cleanup before capacity can be released.
 */
export class GuidedLaunchFailure extends Error {
    close;
    phase;
    constructor(close, cause, phase = null) {
        super('CONTEXT_LOST', cause === undefined ? undefined : { cause });
        this.close = close;
        this.phase = phase;
        this.name = 'GuidedLaunchFailure';
    }
}
//# sourceMappingURL=guidedBrowser.js.map