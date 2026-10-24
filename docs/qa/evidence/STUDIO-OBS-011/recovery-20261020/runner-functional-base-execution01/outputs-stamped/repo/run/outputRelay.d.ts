/**
 * The child's stdout and stderr, captured, redacted and bounded (AC-8, AC-9, AC-10).
 *
 * ## The channel this closes
 *
 * Until this story the child was forked `stdio: ['ignore', 'inherit', 'inherit', 'ipc']`, so
 * everything Playwright, Chromium or an uncaught stack trace in the child wrote went straight to
 * the pod log with **nothing in front of it**: unbounded, and with no redactor on the path.
 * Architecture §9.2 requires the runner to scrub *"every outbound diagnostic before persistence"*,
 * and a pod log is persistence. 10.12's comment — "the contract is not a debugging channel" — was
 * accurate about the *wire*; it said nothing about the log.
 *
 * It is also the only redaction that reaches output the runner did not format. A Playwright
 * exception or a Chromium warning is produced by code this package does not own, so no amount of
 * `safeMessage` discipline at the call sites reaches it; capturing the stream is what makes that
 * canary shape assertable at all.
 *
 * ## Four properties, each of which is a way this could have gone wrong
 *
 * 1. **Bounded twice.** Per line, by the same `maxLogEntryLength` 10.6 already applies to a log
 *    entry; and in total, by a line count, because a chatty browser writing megabytes is both a
 *    flooded log and a parent-side memory leak. A partial line is capped too — output with no
 *    newline in it must not be able to grow the buffer without limit.
 * 2. **Drops are visible.** A silent drop is indistinguishable from a quiet browser, so the count
 *    is emitted once at {@link OutputRelay.close}. Losing diagnostics is acceptable; losing them
 *    invisibly is not.
 * 3. **It cannot block or delay anything.** Every method is synchronous and total: no `await`, no
 *    promise, and the sink is called inside a `try`. The relay runs on the parent's event loop —
 *    the one serving `/health`, `/ready` and `/v2/validate-observed` for every other request — and a relay
 *    that awaited a slow sink would be a new way to hang the process this story exists to keep
 *    responsive. It is the same containment 10.12 already applies to step-event forwarding.
 * 4. **It holds no resolved value once the run is over.** {@link OutputRelay.release} drops the
 *    redactor, and a released relay **drops** subsequent output rather than passing it through
 *    unredacted — the child may still be exhaling after the tree was signalled, and raw is never
 *    an acceptable answer (AC-9).
 *
 * `close` and `release` are two different events and the gap between them is deliberate.
 * {@link OutputRelay.close} flushes the trailing partial line and publishes the drop count; output
 * that arrives after it is still **redacted and relayed**, because a child that was signalled a
 * moment ago writes its most useful lines on the way out. {@link OutputRelay.release} is the hard
 * stop: after it the redactor is gone and everything is dropped.
 *
 * ## Redact, then cut — in that order, on **every** path that cuts
 *
 * Cutting first would split a known value in half, and half a value matches no variant the
 * redactor scrubs, so both halves reach the log and concatenating them reconstructs the value.
 * Redacting the assembled text and bounding the result afterwards is the only order that holds.
 *
 * There are **two** places this relay cuts, and the rule applies to both: the per-line bound in
 * `deliver`, and the overflow bound in `write` for a stream that never sends a newline. The second
 * one had the order backwards and shipped that way — QA-1 — because the two guards each covered
 * half the property and the branch that needed both never carried a value. Whenever a cut is added
 * here, the question to ask is *what is this cutting, and has it been redacted yet*.
 *
 * ## What this still cannot do, stated rather than implied
 *
 * A value the relay never sees **whole** cannot be matched, because it matches no variant until it
 * is complete. Two cases:
 *
 * - the child writes a value with a **newline** through the middle of it — two lines, by the
 *   child's own choice, and neither half matches;
 * - the child writes a value with a **newline** through the middle of it — two lines, by the
 *   child's own choice, and neither half matches.
 *
 * The second case this comment used to name — a value longer than `maxLineLength` that also spans a
 * chunk boundary — **is closed**, and the sentence claiming it could not be closed *"without an
 * unbounded buffer"* was wrong. The buffer required was never unbounded: it is bounded by the
 * longest thing the redactor could possibly match, and the run computes that set at admission.
 * `createRedactor` already sorts its variants longest-first, so the number exists; it is published
 * as `Redactor.longestVariantLength` and **read** here rather than recomputed, because two
 * derivations of one bound in two modules is this codebase's most-repeated defect.
 *
 * The bound is the longest **variant**, not the longest known value, and that distinction is
 * load-bearing: base64 of a value is roughly four-thirds of it and double URL-encoding can be
 * longer still, so a tail sized to the raw value would close the case the test was written for and
 * miss the case an attacker gets.
 *
 * **Peak retention per stream is `retentionBound + maxLineLength`**, measured after the trimming
 * loop and asserted against the bound rather than against a number copied into a test. Nothing is
 * emitted from the overflow path until at least `retentionBound` has been seen or the stream has
 * ended, and what is retained afterwards is never less than `retentionBound` — which is the whole
 * property: a value cannot be cut until enough of it is in hand to recognise it.
 *
 * It is a scrubber for known values it can assemble, exactly as `createRedactor` is, and it is not
 * described as more.
 */
/** Just enough of a redactor for this module; `src/executor/redaction.ts` supplies the real one. */
export interface RelayRedactor {
    redact(text: string): string;
    /**
     * The retention bound, read rather than recomputed (AC-21).
     *
     * Optional only so that a caller with a trivial stub need not supply it; absent is treated as 0,
     * which degrades to the previous `maxLineLength` behaviour rather than to an unbounded buffer.
     */
    readonly longestVariantLength?: number;
}
export interface OutputRelayOptions {
    readonly redactor: RelayRedactor;
    /** Per-line cap. 10.6's `ReportBounds.maxLogEntryLength`, used as it is (AC-10). */
    readonly maxLineLength: number;
    /** Total lines this run may relay before the rest are dropped and counted. */
    readonly maxLines: number;
    /** Where a finished, redacted, bounded line goes. Called synchronously, inside a `try`. */
    readonly emit: (stream: OutputStream, line: string) => void;
}
export type OutputStream = 'stdout' | 'stderr';
export interface OutputRelay {
    /** Feeds a raw chunk. Never throws, never blocks, never returns a promise. */
    write(stream: OutputStream, chunk: string): void;
    /**
     * The per-stream retention bound this relay is holding to (AC-21).
     *
     * Published so a test can assert peak retention *against the bound* rather than against a number
     * copied into the test, which would be a third derivation of it.
     */
    readonly retentionBound: number;
    /** Flushes any trailing partial line and emits the drop notice if there was one. */
    close(): void;
    /** Drops the redactor. After this the relay emits nothing at all (AC-9). */
    release(): void;
    /** Largest amount ever held in a single stream's partial buffer. Bounded by `2 x retentionBound`. */
    readonly peakRetained: number;
    readonly emitted: number;
    readonly dropped: number;
    readonly released: boolean;
}
export declare function createOutputRelay(options: OutputRelayOptions): OutputRelay;
