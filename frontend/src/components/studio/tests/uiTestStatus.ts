import type { TestDto, TestReadiness } from '@/types/studio/studioTypes';

/**
 * The shared status mapping for a UI test shown beside checks (spec §9.3, DC-08): readiness and last
 * run become one chip label, one chip colour and one status filter value. The detail header (story
 * .2) and the All Checks catalog rows (story .3) both read it, so the two never disagree.
 *
 * Checks use four status filter values: PASSING, FAILING, WARNING and PENDING. A READY test with a
 * last run joins the group of the matching check status. A readiness state other than READY is
 * selected only by its own filter value and is never counted in Warning or Pending (DC-08).
 */

/** The chip colours the MUI chips of the checks use. */
export type UiTestStatusColor = 'success' | 'error' | 'warning' | 'info';

/** The status filter values the checks already offer. */
export type CheckStatusFilterValue = 'PASSING' | 'FAILING' | 'WARNING' | 'PENDING';

/** The filter values that only UI tests have: one per readiness state other than READY. */
export type ReadinessStatusFilterValue = Exclude<TestReadiness, 'READY'>;

export type UiTestStatusFilterValue = CheckStatusFilterValue | ReadinessStatusFilterValue;

export interface UiTestStatus {
  readonly label: string;
  readonly color: UiTestStatusColor;
  /** `null` only for a readiness the client does not know: no filter value selects it. */
  readonly filterValue: UiTestStatusFilterValue | null;
}

/** The fields of a test the mapping reads; a `TestDto` satisfies it. */
export type UiTestStatusInput = Pick<TestDto, 'readiness' | 'lastRunStatus'>;

const READINESS_STATUS: Readonly<Record<Exclude<TestReadiness, 'READY'>, UiTestStatus>> = {
  UNLEARNED: { label: 'Not learned', color: 'warning', filterValue: 'UNLEARNED' },
  LEARNING: { label: 'Learning', color: 'info', filterValue: 'LEARNING' },
  NEEDS_RELEARN: { label: 'Needs re-learn', color: 'warning', filterValue: 'NEEDS_RELEARN' },
};

const READY_STATUS = {
  PASSED: { label: 'Passing', color: 'success', filterValue: 'PASSING' },
  FAILED: { label: 'Failing', color: 'error', filterValue: 'FAILING' },
  ERROR: { label: 'Error', color: 'warning', filterValue: 'WARNING' },
  NONE: { label: 'Not run', color: 'info', filterValue: 'PENDING' },
} as const satisfies Record<string, UiTestStatus>;

/**
 * Maps a test to its chip. Readiness other than READY wins over the last run (the "any" rows of
 * §9.3); a READY test is described by its last run.
 */
export function uiTestStatus(test: UiTestStatusInput): UiTestStatus {
  if (test.readiness !== 'READY') {
    const status = (READINESS_STATUS as Record<string, UiTestStatus | undefined>)[test.readiness];
    if (status) return status;
    // A readiness the client does not know: shown as sent, selected by no filter value.
    return { label: String(test.readiness), color: 'info', filterValue: null };
  }
  return READY_STATUS[test.lastRunStatus ?? 'NONE'];
}
