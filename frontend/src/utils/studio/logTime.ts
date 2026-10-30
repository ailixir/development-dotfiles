import type { ExecutionLogEntry } from '@/types/studio/studioTypes';

/**
 * The time column of a Studio log line.
 *
 * `ExecutionLogEntry.at` is nullable by contract (openapi `ExecutionLogEntry`: "`at` is null where
 * the runner held no reading"), and the runner's closing lines carry no reading. `new Date(null)`
 * would render the epoch and `new Date(undefined)` "Invalid Date", so anything that is not a
 * parseable instant renders as an empty column rather than as a wrong or broken time.
 */
export function formatLogTime(at: string | null | undefined): string {
  if (at === null || at === undefined || at === '') {
    return '';
  }
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleTimeString();
}

/**
 * A log line's message as the step list numbers it. The runner writes `step {i} ...` with its own
 * 0-based step index in the text (`reportingStepReporter.ts`) and the same index, structured, in
 * `stepIndex`; the step list counts from 1. Only the exact prefix `step {stepIndex}` followed by a
 * space or the end of the text is rewritten; any other message is returned unchanged. Display only.
 */
export function displayLogMessage(entry: Pick<ExecutionLogEntry, 'message' | 'stepIndex'>): string {
  const { message, stepIndex } = entry;
  if (typeof stepIndex !== 'number') {
    return message;
  }
  const prefix = `step ${stepIndex}`;
  if (!message.startsWith(prefix)) {
    return message;
  }
  const rest = message.slice(prefix.length);
  return rest === '' || rest.startsWith(' ') ? `step ${stepIndex + 1}${rest}` : message;
}

/**
 * The time of a log line, where the closing line (`run PASSED`) borrows the run's end time. The
 * runner leaves that line's `at` null on purpose (it holds no recording-timeline reading), so the
 * run's real `endedAt` fills the column for a finished run. This is the one place the rule lives:
 * the entry's own `at` wins; otherwise only a line with no `stepIndex` whose message starts with
 * `run ` takes `endedAt`, and only when `endedAt` is a parseable instant. Everything else stays
 * untimed (null).
 */
export function logEntryTime(
  entry: Pick<ExecutionLogEntry, 'at' | 'message' | 'stepIndex'>,
  endedAt?: string | null,
): string | null {
  if (entry.at !== null) {
    return entry.at;
  }
  const isClosingLine =
    (entry.stepIndex === null || entry.stepIndex === undefined) && entry.message.startsWith('run ');
  if (!isClosingLine || endedAt === null || endedAt === undefined || endedAt === '') {
    return null;
  }
  return Number.isNaN(new Date(endedAt).getTime()) ? null : endedAt;
}

/** The Studio page's live-log store shape. */
export interface StudioLogLine {
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  stepIndex?: number;
}

/**
 * API log entries in the store's shape. The page used to put the API entries into the store as they
 * were and then read `timestamp` (which they do not have — they have `at`) and a lower-case
 * `error` level (the API's is `ERROR`), so every line read "Invalid Date" and no line was ever an
 * error. Messages are shown with 1-based steps ({@link displayLogMessage}); `endedAt`, when the run
 * has finished, gives the closing line its time ({@link logEntryTime}).
 */
export function toStudioLogLines(
  logs: readonly ExecutionLogEntry[],
  endedAt?: string | null,
): StudioLogLine[] {
  return logs.map((entry) => ({
    timestamp: logEntryTime(entry, endedAt) ?? '',
    level: entry.level === 'ERROR' ? 'error' : entry.level === 'WARN' ? 'warning' : 'info',
    message: displayLogMessage(entry),
    ...(typeof entry.stepIndex === 'number' ? { stepIndex: entry.stepIndex } : {}),
  }));
}
