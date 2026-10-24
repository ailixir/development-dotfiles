/**
 * Capacity pool (AC-10, AC-11, architecture §5.2, §8.4).
 *
 * **The guard is intrinsic to the acquire, not a check placed before it.** `tryAcquire` observes
 * free capacity and takes the slot in one synchronous statement: there is no `await`, no clock
 * read, no body parse and no logging between the two, because every `await` in a single-threaded
 * server is a window in which a second request observes the same free slot and both proceed.
 * Story 10.4's QA round established this for a row lock; the translation to a component with no
 * database is that the counter increment *is* the decision.
 *
 * The obvious wrong shape, kept here as the thing this file exists to prevent:
 *
 * ```ts
 * if (pool.free() > 0) {      // observe
 *   await somethingInnocent();  // ← a second request runs here and also observes free > 0
 *   pool.acquire();             // hold
 * }
 * ```
 *
 * Saturation and draining are **different conditions with different answers** (§8.4): a saturated
 * pool returns `429` and keeps readiness *true*, because the pod is healthy and will accept work
 * again shortly; a draining pod returns `503` and sets readiness *false*, because it is leaving.
 * Conflating them makes Kubernetes remove a busy pod from its Service, which is the opposite of
 * what backpressure is for.
 */
export function createCapacityPool(size) {
    if (!Number.isInteger(size) || size < 1) {
        throw new RangeError(`Pool size must be a positive integer; got ${String(size)}.`);
    }
    let inUse = 0;
    let draining = false;
    let nextId = 0;
    return {
        get size() {
            return size;
        },
        get inUse() {
            return inUse;
        },
        get draining() {
            return draining;
        },
        beginDrain() {
            draining = true;
        },
        tryAcquire() {
            // ── The whole guard. Observe and hold, one synchronous step, nothing in between. ────────
            if (draining || inUse >= size)
                return null;
            inUse += 1;
            nextId += 1;
            // ────────────────────────────────────────────────────────────────────────────────────────
            const id = nextId;
            let released = false;
            return {
                id,
                get released() {
                    return released;
                },
                release() {
                    if (released)
                        return;
                    released = true;
                    inUse -= 1;
                },
            };
        },
    };
}
//# sourceMappingURL=capacity.js.map