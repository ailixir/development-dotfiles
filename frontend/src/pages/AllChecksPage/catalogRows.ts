import type { CheckEntity, CheckStatus } from '@/types/checks/checkTypes';
import type { TestDto } from '@/types/studio/studioTypes';
import { uiTestStatus, type UiTestStatusColor } from '@/components/studio/tests/uiTestStatus';
import { parseInstant } from '@/utils/time';

/**
 * The All Checks row union (spec §9.2, §9.3, §9.4). Check rows and UI test rows are merged, deduplicated,
 * ordered, and filtered by pure functions here, so the page only renders. Nothing in this module
 * touches the store, the network or the DOM.
 */

/** The Type filter value that selects UI test rows. */
export const UI_TEST_TYPE = 'UI_TEST';

/** Shown in Last Execution when a row has never run (as for check rows). */
export const NEVER_RUN_LABEL = 'Never';

export interface CheckCatalogRow {
  readonly kind: 'check';
  readonly check: CheckEntity;
}

export interface UiTestCatalogRowData {
  readonly kind: 'uiTest';
  readonly test: TestDto;
  /** The CSI name from the store, the CSI id when the store has no entry, `null` for a test without a CSI. */
  readonly csiName: string | null;
}

export type CatalogRow = CheckCatalogRow | UiTestCatalogRowData;

export type CatalogRowKind = CatalogRow['kind'];

/**
 * The row kind a catalog type value stands for. The kind is derived from the type, never from which
 * list a row came from, so a later backend link (Flow 2) changes the source, not this rule.
 */
export function catalogKindForType(type: string): CatalogRowKind {
  return type === UI_TEST_TYPE ? 'uiTest' : 'check';
}

export function isUiCatalogRow(row: CatalogRow): row is UiTestCatalogRowData {
  return row.kind === 'uiTest';
}

export function isCheckRow(row: CatalogRow): row is CheckCatalogRow {
  return row.kind === 'check';
}

export function catalogRowId(row: CatalogRow): string {
  return isUiCatalogRow(row) ? row.test.id : row.check.id;
}

/** The catalog type of a row: `UI_TEST` for a UI test row, the check's own type otherwise. */
export function catalogRowType(row: CatalogRow): string {
  return isUiCatalogRow(row) ? UI_TEST_TYPE : row.check.type;
}

/** The instant the row was created, as the order key. Missing or unparseable sorts last. */
function createdAtMillis(row: CatalogRow): number {
  const created = parseInstant(isUiCatalogRow(row) ? row.test.createdAt : row.check.createdAt);
  return created ? created.getTime() : Number.NEGATIVE_INFINITY;
}

/** `createdAt` descending, then id ascending (spec §9.2). */
export function compareCatalogRows(a: CatalogRow, b: CatalogRow): number {
  const left = createdAtMillis(a);
  const right = createdAtMillis(b);
  if (left !== right) return left > right ? -1 : 1;
  const leftId = catalogRowId(a);
  const rightId = catalogRowId(b);
  if (leftId === rightId) return 0;
  return leftId < rightId ? -1 : 1;
}

export interface BuildCatalogRowsInput {
  readonly checks: readonly CheckEntity[];
  readonly tests: readonly TestDto[];
  /** The CSI name from the store, or `undefined` when the store has no entry for the id. */
  readonly csiNameOf: (csiId: string) => string | undefined;
}

/**
 * Merges the two lists into one. A check and a UI test with the same id become one UI test row
 * (EC-09), and the result is ordered by {@link compareCatalogRows}. Inputs are not modified.
 */
export function buildCatalogRows({ checks, tests, csiNameOf }: BuildCatalogRowsInput): CatalogRow[] {
  const uiTestIds = new Set<string>();
  const uiCatalogRows: UiTestCatalogRowData[] = [];
  for (const test of tests) {
    if (uiTestIds.has(test.id)) continue;
    uiTestIds.add(test.id);
    uiCatalogRows.push({
      kind: 'uiTest',
      test,
      csiName: test.csiId ? (csiNameOf(test.csiId) ?? test.csiId) : null,
    });
  }

  const checkRows: CheckCatalogRow[] = [];
  const checkIds = new Set<string>();
  for (const check of checks) {
    if (uiTestIds.has(check.id) || checkIds.has(check.id)) continue;
    checkIds.add(check.id);
    checkRows.push({ kind: 'check', check });
  }

  return [...checkRows, ...uiCatalogRows].sort(compareCatalogRows);
}

/** The ids bulk actions may take: check rows only (FR-17). A UI test id never appears here. */
export function checkRowIds(rows: readonly CatalogRow[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (isCheckRow(row)) ids.push(row.check.id);
  }
  return ids;
}

export interface CatalogRowStatus {
  readonly label: string;
  readonly color: UiTestStatusColor | 'default';
  /**
   * The Status filter value that selects the row: the check's own status, or the UI test's mapping
   * (spec §9.3). `null` only for a readiness the client does not know.
   */
  readonly filterValue: string | null;
}

const CHECK_STATUS: Readonly<Record<CheckStatus, CatalogRowStatus>> = {
  PASSING: { label: 'Passing', color: 'success', filterValue: 'PASSING' },
  FAILING: { label: 'Failing', color: 'error', filterValue: 'FAILING' },
  WARNING: { label: 'Warning', color: 'warning', filterValue: 'WARNING' },
  PENDING: { label: 'Pending', color: 'info', filterValue: 'PENDING' },
  UNKNOWN: { label: 'Unknown', color: 'default', filterValue: 'UNKNOWN' },
};

/** The chip a row shows in Status. UI test rows read the shared mapping; a check keeps its own chip. */
export function catalogRowStatus(row: CatalogRow): CatalogRowStatus {
  if (isUiCatalogRow(row)) return uiTestStatus(row.test);
  return CHECK_STATUS[row.check.status] ?? CHECK_STATUS.UNKNOWN;
}

/** Whether a row passes the Status filter. An empty filter passes every row. */
export function catalogRowMatchesStatus(row: CatalogRow, statusFilter: string): boolean {
  if (!statusFilter) return true;
  return catalogRowStatus(row).filterValue === statusFilter;
}

/** Whether a row passes the Type filter. An empty filter passes every row. */
export function catalogRowMatchesType(row: CatalogRow, typeFilter: string): boolean {
  if (!typeFilter) return true;
  return catalogRowType(row) === typeFilter;
}

export interface CatalogRowFilters {
  /** The Status filter value, `''` for All Status. */
  readonly statusFilter: string;
  /** The Type filter value, `''` for All Types. */
  readonly typeFilter: string;
  /** True while a global or page tag filter is active: UI tests have no tags, so their rows hide (FR-18). */
  readonly tagFilterActive: boolean;
}

/**
 * Applies the filters the two row kinds share. Check rows are expected to have been narrowed by the
 * page's own check-only filters (scope, tags, search) first; UI test rows were narrowed by the
 * server (system, environment, search), so no search filter appears here.
 */
export function filterCatalogRows(
  rows: readonly CatalogRow[],
  { statusFilter, typeFilter, tagFilterActive }: CatalogRowFilters,
): CatalogRow[] {
  return rows.filter((row) => {
    if (tagFilterActive && isUiCatalogRow(row)) return false;
    return catalogRowMatchesStatus(row, statusFilter) && catalogRowMatchesType(row, typeFilter);
  });
}

/** The Last Execution text: the row's last run time as for checks, or {@link NEVER_RUN_LABEL}. */
export function formatLastExecution(value: string | null | undefined): string {
  const instant = parseInstant(value);
  return instant ? instant.toLocaleString() : NEVER_RUN_LABEL;
}

/** The instant a row last ran, for the Last Execution column. */
export function catalogRowLastExecution(row: CatalogRow): string | null {
  return isUiCatalogRow(row) ? row.test.lastRunAt : row.check.lastExecution;
}
