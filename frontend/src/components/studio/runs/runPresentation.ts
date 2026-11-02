import { EMPTY_TIME_PLACEHOLDER, formatDuration, parseInstant, type InstantInput } from '@/utils/time';
import { isTerminalExecutionStatus, type ExecutionSnapshot } from '@/types/studio/studioTypes';

export const DELETED_TEST_LABEL = 'Deleted test';
/** For a snapshot that does not carry `testName` at all (e.g. an older server). */
export const UNNAMED_TEST_LABEL = 'UI test';

export interface RunTestLabel {
  text: string;
  /** True when the server reported the test as deleted (`testName: null`). */
  deleted: boolean;
}

export function runTestLabel(run: Pick<ExecutionSnapshot, 'testName'>): RunTestLabel {
  if (run.testName === null) return { text: DELETED_TEST_LABEL, deleted: true };
  const name = run.testName?.trim();
  return { text: name ? name : UNNAMED_TEST_LABEL, deleted: false };
}

/** Browser time as the server measured it; never reconstructed from timestamps. */
export function runDurationText(run: Pick<ExecutionSnapshot, 'durationMs' | 'status' | 'startedAt'>): string {
  if (run.durationMs !== null) return formatDuration(run.durationMs);
  if (run.status === 'PENDING') return 'Queued';
  if (run.status === 'RUNNING') return run.startedAt ? 'Running' : 'Starting';
  return isTerminalExecutionStatus(run.status) ? 'Not recorded' : formatDuration(null);
}

/** Time in the queue, `startedAt − acceptedAt`, or null when the browser has not started. */
export function runQueueWaitMs(run: Pick<ExecutionSnapshot, 'acceptedAt' | 'startedAt'>): number | null {
  const accepted = parseInstant(run.acceptedAt);
  const started = parseInstant(run.startedAt);
  if (!accepted || !started) return null;
  const wait = started.getTime() - accepted.getTime();
  return wait >= 0 ? wait : null;
}

export function shortRunId(executionId: string): string {
  return executionId.length > 8 ? executionId.slice(0, 8) : executionId;
}

/** A run's time as the page shows it everywhere (table, Latest run, drawer): absolute, local. */
export function formatRunTime(value: InstantInput): string {
  return parseInstant(value)?.toLocaleString() ?? EMPTY_TIME_PLACEHOLDER;
}

export function runOriginLabel(triggerSource: ExecutionSnapshot['triggerSource']): string {
  if (triggerSource === 'SCHEDULED') return 'Scheduled';
  if (triggerSource === 'MANUAL') return 'Manual';
  if (triggerSource === 'AFTER_LEARN') return 'After learning';
  return 'Unknown origin';
}
