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

/** The Studio page's live-log store shape. */
export interface StudioLogLine {
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
}

/**
 * API log entries in the store's shape. The page used to put the API entries into the store as they
 * were and then read `timestamp` (which they do not have — they have `at`) and a lower-case
 * `error` level (the API's is `ERROR`), so every line read "Invalid Date" and no line was ever an
 * error.
 */
export function toStudioLogLines(logs: readonly ExecutionLogEntry[]): StudioLogLine[] {
  return logs.map((entry) => ({
    timestamp: entry.at ?? '',
    level: entry.level === 'ERROR' ? 'error' : entry.level === 'WARN' ? 'warning' : 'info',
    message: entry.message,
  }));
}
