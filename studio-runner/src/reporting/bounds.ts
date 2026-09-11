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

export interface LogBuffer extends LogView {
  append(entry: LogEntry): void;
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
    append(entry: LogEntry): void {
      // **Truncation precedes redaction in this buffer, and that is on purpose.** Bounding is this
      // module's job; scrubbing is not, and a second redactor here would be a second copy of a
      // fact that already has an owner. The requirement that follows is real and is stated rather
      // than left implicit: **callers are required to redact first**, because a known value cut by
      // the `slice` below becomes two fragments, and a fragment matches no variant `createRedactor`
      // produces — so both halves would survive the redaction that happens later on the assembled
      // body, and concatenating them reconstructs the value.
      //
      // `RunSnapshot.appendLog` is the guard: it is the only caller reachable from a run and it
      // applies the run's redactor before delegating here. A test enforces that requirement with a
      // planted canary observed on the emitted entry rather than by scanning call sites, because a
      // producer that built the same string through an innocently named local would pass a scan
      // (AC-22, AC-23).
      const message =
        entry.message.length <= maxEntryLength
          ? entry.message
          : `${entry.message.slice(0, Math.max(0, maxEntryLength - 1))}…`;
      entries.push({ ...entry, message });
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
