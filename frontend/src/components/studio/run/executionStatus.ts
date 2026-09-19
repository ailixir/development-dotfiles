import { CANCELLED_ERROR_CODE, type ExecutionStatus } from '@/types/studio/studioTypes';

/**
 * How an execution outcome is named on every Studio surface: the Studio page, the Tests page and
 * the Runs page.
 *
 * The vocabulary is the backend's own, `PENDING | RUNNING | PASSED | FAILED | ERROR`. The terminal
 * set comes from `TERMINAL_EXECUTION_STATUSES` in the contract types. The one refinement is a
 * cancelled run: it arrives as `ERROR` with `errorCode: CANCELLED`, and it is named "Cancelled"
 * because the person who pressed Stop caused it. It is not an unexplained error.
 */
export const EXECUTION_STATUS_LABELS: Readonly<Record<ExecutionStatus, string>> = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  PASSED: 'Passed',
  FAILED: 'Failed',
  ERROR: 'Error',
};

export const CANCELLED_LABEL = 'Cancelled';

export type ExecutionStatusTone = 'success' | 'error' | 'info' | 'default';

export function isCancelledOutcome(status: string, errorCode: string | null | undefined): boolean {
  return status === 'ERROR' && errorCode === CANCELLED_ERROR_CODE;
}

/**
 * The label for a status the server sent. A status outside the vocabulary is shown as sent rather
 * than renamed, so a server change is visible instead of being hidden by a label.
 */
export function executionStatusLabel(status: string, errorCode?: string | null): string {
  if (isCancelledOutcome(status, errorCode)) {
    return CANCELLED_LABEL;
  }
  return (EXECUTION_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

export function executionStatusTone(status: string, errorCode?: string | null): ExecutionStatusTone {
  if (isCancelledOutcome(status, errorCode)) {
    return 'default';
  }
  switch (status) {
    case 'PASSED':
      return 'success';
    case 'FAILED':
    case 'ERROR':
      return 'error';
    case 'PENDING':
    case 'RUNNING':
      return 'info';
    default:
      return 'default';
  }
}
