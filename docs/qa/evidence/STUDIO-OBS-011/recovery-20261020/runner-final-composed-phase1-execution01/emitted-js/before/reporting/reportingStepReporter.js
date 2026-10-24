export function createRunReporter(options) {
    const { snapshot, client } = options;
    const built = [];
    /**
     * Detached but **serialized**: each delivery waits for the previous one to settle.
     *
     * Detached, because `stepStarted`/`stepFinished` must return immediately — a slow callback may
     * not delay a step (AC-15). Serialized, because two deliveries in flight at once would let a
     * second report leave *after* the API has already answered `409` to the first, and "stops
     * reporting immediately" (AC-18) would become "stops reporting, give or take whatever was
     * already in the air". Serializing also keeps deliveries in sequence order on the wire, which
     * costs nothing here: the queue depth is bounded by the step count.
     */
    let tail = Promise.resolve();
    /**
     * Named rather than declared inline inside the `then` call. An inline async arrow passed
     * straight to a function emits a shape that `test/no-dynamic-evaluation.test.ts` scans for:
     * an async IIFE is one of the forms generated source could be evaluated through (architecture
     * §4.5), so that scan is deliberately blunt, and writing around it costs one named constant
     * where loosening it would cost a guard.
     */
    const deliver = async (body) => {
        // A rejection here must never surface as an unhandled rejection mid-run.
        await client.deliverProgress(body).catch(() => undefined);
    };
    const dispatch = (body) => {
        built.push(body);
        tail = tail.then(() => deliver(body));
    };
    return {
        built,
        browserStarted(origin) {
            if (snapshot.browserStarted)
                return;
            snapshot.markBrowserStarted(origin.browserStartedAt);
            // A reading that happens to be `0`, not a constant `0` (AC-10).
            snapshot.appendLog({ atMs: origin.startedAtMs, level: 'info', message: 'browser started' });
            dispatch(snapshot.build('STARTED'));
        },
        stepStarted(event) {
            snapshot.stepStarted(event.stepIndex, event.startedAtMs);
            snapshot.appendLog({
                atMs: event.startedAtMs,
                level: 'info',
                message: `step ${String(event.stepIndex)} started`,
                stepIndex: event.stepIndex,
            });
            dispatch(snapshot.build('PROGRESS'));
        },
        stepFinished(event) {
            // The executor's outcome reaches the wire unchanged, null timings included (AC-15).
            snapshot.stepFinished({
                stepIndex: event.stepIndex,
                status: event.status,
                startedAtMs: event.startedAtMs,
                finishedAtMs: event.finishedAtMs,
                durationMs: event.durationMs,
                failure: event.failure,
            });
            // The bounded retained log the API shows the user (architecture §5.3, §5.5). The failure
            // text is the executor's already-redacted `safeMessage`, and the whole body passes through
            // the outbound redactor again before it leaves (AC-20).
            snapshot.appendLog({
                // A skipped step has neither reading, and `0` would file it at the browser start rather
                // than say "no reading" (ADR-002 §INT-1).
                atMs: event.finishedAtMs ?? event.startedAtMs,
                level: event.status === 'FAIL' ? 'error' : 'info',
                message: event.failure === null
                    ? `step ${String(event.stepIndex)} ${event.status}`
                    : `step ${String(event.stepIndex)} ${event.status}: ${event.failure}`,
                stepIndex: event.stepIndex,
            });
            dispatch(snapshot.build('PROGRESS'));
        },
        async sendFinal(outcome, evidence) {
            snapshot.appendLog({
                // The run result is not a reading: nothing on the monotonic clock was sampled to produce
                // it, and `0` would place the terminal line at the browser start — the beginning of the
                // video (ADR-002 §INT-1, §7.2). The browser-start line's `0` above is the origin itself.
                atMs: null,
                level: outcome.result === 'PASSED' ? 'info' : 'error',
                message: outcome.errorCode === null
                    ? `run ${outcome.result}`
                    : `run ${outcome.result}: ${outcome.errorCode}`,
            });
            const body = snapshot.build('FINAL', outcome, evidence);
            built.push(body);
            await client.deliverTerminal(body);
        },
        async settled() {
            // The chain may grow while we await it, so follow it until it stops moving.
            let previous = null;
            while (previous !== tail) {
                previous = tail;
                await tail.catch(() => undefined);
            }
        },
    };
}
//# sourceMappingURL=reportingStepReporter.js.map