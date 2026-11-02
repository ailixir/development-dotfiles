import type { ExecutionLogEntry } from '@/types/studio/studioTypes';

/** The runner captures only console errors and warnings and uncaught page errors, marked by this message prefix. */
const CONSOLE_LINE = /^(console\.(warn|error)|page error): /;

/** The browser console lines of a run's logs, in order. */
export function consoleLinesOf(logs: readonly ExecutionLogEntry[]): ExecutionLogEntry[] {
  return logs.filter((entry) => CONSOLE_LINE.test(entry.message));
}

/** Console lines at level ERROR only (warnings do not count). */
export function consoleErrorsOf(logs: readonly ExecutionLogEntry[]): ExecutionLogEntry[] {
  return consoleLinesOf(logs).filter((entry) => entry.level === 'ERROR');
}

/** Console error count per 0-based step index; lines without a step index are not counted here. */
export function consoleErrorCountByStep(logs: readonly ExecutionLogEntry[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const entry of consoleErrorsOf(logs)) {
    if (typeof entry.stepIndex === 'number') {
      counts.set(entry.stepIndex, (counts.get(entry.stepIndex) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The notice for a PASSED run whose page reported console errors, or null when there is nothing to say.
 * K is the 1-based step of the first error that names a step.
 */
export function passedWithPageErrorsNotice(logs: readonly ExecutionLogEntry[]): string | null {
  const errors = consoleErrorsOf(logs);
  if (errors.length === 0) return null;
  const first = errors.find((entry) => typeof entry.stepIndex === 'number');
  const after = first && typeof first.stepIndex === 'number' ? ` after step ${first.stepIndex + 1}` : '';
  return (
    `Passed, but the page reported ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}${after}. ` +
    `Steps pass on what they do and check, so add a check${after}, for example: Check that the URL contains "…".`
  );
}
