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

export const DEFAULT_REPORT_BOUNDS: ReportBounds = {
  maxSteps: 100,
  maxLogEntries: 200,
  maxLogEntryLength: 400,
  maxBodyBytes: 512 * 1024,
};

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
   * `step N PASS|FAIL|SKIPPED` producers and by browser console lines (the step running when the page
   * emitted them); run-level lines omit it and are retained as `null`.
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
const REDACTED: unique symbol = Symbol('reporting.redacted');

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
export function redactLogEntry(
  entry: LogEntry,
  redactor: { redact(text: string): string },
): RedactedLogEntry {
  return { ...entry, message: redactor.redact(entry.message), [REDACTED]: true };
}

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
export function createLogBuffer(maxEntries: number, maxEntryLength: number): LogBuffer {
  const entries: LogEntry[] = [];
  let dropped = 0;

  return {
    get truncated(): boolean {
      return dropped > 0;
    },
    get dropped(): number {
      return dropped;
    },
    append(entry: RedactedLogEntry): void {
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
      if ((entry as Partial<RedactedLogEntry>)[REDACTED] !== true) {
        throw new TypeError(
          'LogBuffer.append requires an entry produced by redactLogEntry (ADR-002 O-16)',
        );
      }
      const message =
        entry.message.length <= maxEntryLength
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
    entries(): readonly LogEntry[] {
      return entries;
    },
  };
}

/** Bounds a step list, keeping the earliest steps so the sequence stays readable. */
export function boundSteps<T>(steps: readonly T[], maxSteps: number): readonly T[] {
  return steps.length <= maxSteps ? steps : steps.slice(0, maxSteps);
}

/** UTF-8 byte length of an already-serialized body. */
export function byteLength(serialized: string): number {
  return Buffer.byteLength(serialized, 'utf8');
}
