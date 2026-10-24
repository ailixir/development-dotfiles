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
export interface ReportBounds {
    /** Maximum steps in a snapshot. Excess steps are dropped from the end. */
    readonly maxSteps: number;
    /** Maximum retained log entries. Oldest are dropped first. */
    readonly maxLogEntries: number;
    /** Maximum length of one log entry's message. */
    readonly maxLogEntryLength: number;
    /** Maximum serialized body size. A body over this is emitted in a reduced form. */
    readonly maxBodyBytes: number;
}
export declare const DEFAULT_REPORT_BOUNDS: ReportBounds;
export interface LogEntry {
    /**
     * Position on the **run timeline**: the same monotonic clock and origin as
     * `SnapshotStep.startedAtMs` (architecture §6.4), so a log line and a step seek to the same
     * frame. `null` where the runner genuinely holds no reading.
     *
     * `0` is the browser start — a position, not a missing value — and must never be used as one
     * (ADR-002 §INT-1). Held by the "log lines carry timeline positions" block in
     * `test/reporting/reporting.test.ts`, not by this comment.
     */
    readonly atMs: number | null;
    readonly level: 'info' | 'warn' | 'error';
    readonly message: string;
    /**
     * The 0-based position of the step this line is **about**, in the same index space as
     * `SnapshotStep.stepIndex` (ADR-002 §33). Set only by the `step N started` and
     * `step N PASS|FAIL|SKIPPED` producers; run-level lines omit it and are retained as `null`.
     * Never inferred from message text.
     */
    readonly stepIndex?: number | null;
}
/**
 * The **read** half of {@link LogBuffer}, and the only half anything outside the snapshot gets.
 *
 * Splitting the interface is the AC-22 guard (QA-1). A `LogBuffer` handed out whole is a second way
 * into the truncating buffer, one that goes *around* `RunSnapshot.appendLog` and therefore around
 * the run's redactor — and a producer that reached it that way would put a whole value on the
 * report body, or a raw fragment of one past the cut, which matches no variant the outbound
 * redactor can scrub. The guard's own falsification is *route one existing producer around the
 * redactor*, and that mutation has to be **unable to reach the buffer at all** rather than merely
 * watched.
 */
export interface LogView {
    /** Current retained entries, oldest first. */
    entries(): readonly LogEntry[];
    /** True once the cap has been reached and at least one entry has been dropped. */
    readonly truncated: boolean;
    readonly dropped: number;
}
/**
 * The brand. **Deliberately not exported**, so `RedactedLogEntry` cannot be minted anywhere but
 * {@link redactLogEntry} — which is to say, cannot be minted without passing through a redactor.
 * A brand a caller can apply itself is a comment with a type annotation.
 */
declare const REDACTED: unique symbol;
/**
 * A log entry whose message has already been through a redactor (ADR-002 O-16).
 *
 * The brand is present at **run time** as well as in the type, on the precedent story 10.17's
 * AC-22 repair set one level up: `LogBuffer.append` was made unreachable rather than watched, and
 * a producer that tries to go around it *"fails to compile **and** throws"*. A type-only brand
 * would be defeated by one `as`, and this boundary is a redaction boundary.
 */
export interface RedactedLogEntry extends LogEntry {
    readonly [REDACTED]: true;
}
/**
 * The only way to produce a {@link RedactedLogEntry}: apply a redactor to the message.
 *
 * *Which* redactor is the caller's to choose and cannot be checked here — `RunSnapshot.appendLog`
 * passes the run's. What this does close is the ordering: a message reaching
 * {@link LogBuffer.append} has been through a redactor **before** the `slice` below can cut it,
 * so a known value can no longer be split into two fragments that match no variant
 * `createRedactor` produces and that reconstruct the value when concatenated.
 */
export declare function redactLogEntry(entry: LogEntry, redactor: {
    redact(text: string): string;
}): RedactedLogEntry;
export interface LogBuffer extends LogView {
    /**
     * Appends an **already-redacted** entry. Takes {@link RedactedLogEntry} rather than
     * {@link LogEntry}, which is what makes the truncate-before-redact trap below unreachable
     * instead of documented (ADR-002 O-16, story 10.18a). An un-redacted string is a compile error
     * at every import path, deep or surface.
     */
    append(entry: RedactedLogEntry): void;
}
/**
 * Bounded ring of log entries.
 *
 * @param maxEntries retained entries; the oldest is dropped when a new one arrives at the cap.
 * @param maxEntryLength each message is truncated to this length before it is retained, so a
 * single enormous entry cannot defeat the entry count cap.
 */
export declare function createLogBuffer(maxEntries: number, maxEntryLength: number): LogBuffer;
/** Bounds a step list, keeping the earliest steps so the sequence stays readable. */
export declare function boundSteps<T>(steps: readonly T[], maxSteps: number): readonly T[];
/** UTF-8 byte length of an already-serialized body. */
export declare function byteLength(serialized: string): number;
export {};
