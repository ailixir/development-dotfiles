/**
 * Outbound payload bounds and the retained-log buffer (AC-19, architecture §5.5, §8.5).
 *
 * One configuration source, applied on the outbound path: the runner never emits a body the API
 * would have to reject for size. Bounding at the sender is not a courtesy — a rejected oversized
 * terminal report is a lost result, and the runner has no durable store to replay it from.
 *
 * The log buffer's **drop policy is asserted, not implied**: when the cap is reached the oldest
 * entries are dropped and the newest retained, and `logsTruncated` becomes `true` and stays true.
 * Newest-wins is the right choice for a failing run — the entries next to the failure are the ones
 * worth having — and it is the opposite of the default a naive `slice` would give, which is why
 * it has a test rather than a comment.
 */
export const DEFAULT_REPORT_BOUNDS = {
    maxSteps: 100,
    maxLogEntries: 200,
    maxLogEntryLength: 400,
    maxBodyBytes: 512 * 1024,
};
/**
 * The brand. **Deliberately not exported**, so `RedactedLogEntry` cannot be minted anywhere but
 * {@link redactLogEntry} — which is to say, cannot be minted without passing through a redactor.
 * A brand a caller can apply itself is a comment with a type annotation.
 */
const REDACTED = Symbol('reporting.redacted');
/**
 * The only way to produce a {@link RedactedLogEntry}: apply a redactor to the message.
 *
 * *Which* redactor is the caller's to choose and cannot be checked here — `RunSnapshot.appendLog`
 * passes the run's. What this does close is the ordering: a message reaching
 * {@link LogBuffer.append} has been through a redactor **before** the `slice` below can cut it,
 * so a known value can no longer be split into two fragments that match no variant
 * `createRedactor` produces and that reconstruct the value when concatenated.
 */
export function redactLogEntry(entry, redactor) {
    return { ...entry, message: redactor.redact(entry.message), [REDACTED]: true };
}
/**
 * Bounded ring of log entries.
 *
 * @param maxEntries retained entries; the oldest is dropped when a new one arrives at the cap.
 * @param maxEntryLength each message is truncated to this length before it is retained, so a
 * single enormous entry cannot defeat the entry count cap.
 */
export function createLogBuffer(maxEntries, maxEntryLength) {
    const entries = [];
    let dropped = 0;
    return {
        get truncated() {
            return dropped > 0;
        },
        get dropped() {
            return dropped;
        },
        append(entry) {
            // **Truncation precedes redaction in this buffer, and that is still on purpose.** Bounding
            // is this module's job; scrubbing is not, and a second redactor here would be a second copy
            // of a fact that already has an owner.
            //
            // What changed with ADR-002 O-16 is that *"callers are required to redact first"* is no
            // longer a sentence this module cannot enforce. It was a real trap — a known value cut by
            // the `slice` below becomes two fragments, neither matching any variant `createRedactor`
            // produces, both surviving the later redaction of the assembled body, and concatenating them
            // reconstructs the value. It was **latent rather than live**: one production caller existed
            // and it redacted first. But `createLogBuffer` sat on the package's module surface, so a
            // second producer was one import away, and *a header comment is not a guard* (PIN-1).
            //
            // The parameter type is now {@link RedactedLogEntry}, which only {@link redactLogEntry} can
            // produce, so the un-redacted call does not compile from any import path. The run-time check
            // below covers the JavaScript caller and the `as` cast, on the same reasoning story 10.17's
            // AC-22 repair used: fails to compile **and** throws.
            // Read through `Partial` on purpose: to the type system the brand is always present, which
            // is exactly the caller this check is *not* for. It is for the JavaScript caller and the one
            // who writes `as unknown as RedactedLogEntry` — the compile error is the guard, and this is
            // the guard for a caller who has already defeated it.
            if (entry[REDACTED] !== true) {
                throw new TypeError('LogBuffer.append requires an entry produced by redactLogEntry (ADR-002 O-16)');
            }
            const message = entry.message.length <= maxEntryLength
                ? entry.message
                : `${entry.message.slice(0, Math.max(0, maxEntryLength - 1))}…`;
            // The brand is dropped on retention rather than carried: it states how the entry arrived,
            // it is not a field, and rebuilding the entry field by field keeps `entries()` a plain
            // `LogEntry[]` so nothing downstream can launder a brand back out of the buffer.
            entries.push({
                atMs: entry.atMs,
                level: entry.level,
                message,
                stepIndex: entry.stepIndex ?? null,
            });
            while (entries.length > maxEntries) {
                entries.shift();
                dropped += 1;
            }
        },
        entries() {
            return entries;
        },
    };
}
/** Bounds a step list, keeping the earliest steps so the sequence stays readable. */
export function boundSteps(steps, maxSteps) {
    return steps.length <= maxSteps ? steps : steps.slice(0, maxSteps);
}
/** UTF-8 byte length of an already-serialized body. */
export function byteLength(serialized) {
    return Buffer.byteLength(serialized, 'utf8');
}
//# sourceMappingURL=bounds.js.map