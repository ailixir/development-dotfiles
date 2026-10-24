import { describe, expect, it } from 'vitest';
import type { CheckEntity } from '@/types/checks/checkTypes';
import { defaultConfiguration, type TestDto, type TestReadiness } from '@/types/studio/studioTypes';
import {
  buildCatalogRows,
  catalogKindForType,
  catalogRowId,
  catalogRowLastExecution,
  catalogRowMatchesStatus,
  catalogRowMatchesType,
  catalogRowStatus,
  checkRowIds,
  compareCatalogRows,
  filterCatalogRows,
  formatLastExecution,
  isUiCatalogRow,
  type CatalogRow,
} from './catalogRows';

function makeCheck(overrides: Partial<CheckEntity> = {}): CheckEntity {
  return {
    id: 'check-1',
    name: 'Check one',
    type: 'HTTP',
    csiId: '100',
    csiName: 'Payments',
    status: 'PASSING',
    lastExecution: null,
    nextExecution: null,
    configuration: {},
    schedule: {} as CheckEntity['schedule'],
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    createdBy: 'tester',
    tags: [],
    ...overrides,
  };
}

function makeTest(overrides: Partial<TestDto> = {}): TestDto {
  return {
    id: 'test-1',
    name: 'Test one',
    description: null,
    csiId: '100',
    environment: 'Production',
    steps: [],
    variables: [],
    configuration: defaultConfiguration(),
    status: null,
    schedule: null,
    createdBy: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    lastRunAt: null,
    lastRunStatus: null,
    sourceRevision: 1,
    configurationRevision: 1,
    readiness: 'READY',
    firstChangedStepId: null,
    confirmedRevisionId: null,
    ...overrides,
  };
}

const csiNames: Record<string, string> = { '100': 'Payments' };
const csiNameOf = (id: string) => csiNames[id];

const build = (checks: CheckEntity[], tests: TestDto[]) => buildCatalogRows({ checks, tests, csiNameOf });
const ids = (rows: readonly CatalogRow[]) => rows.map(catalogRowId);

describe('catalog row kind (spec §9.2)', () => {
  it('derives the kind from the type', () => {
    expect(catalogKindForType('UI_TEST')).toBe('uiTest');
    expect(catalogKindForType('HTTP')).toBe('check');
    expect(catalogKindForType('TCP')).toBe('check');
  });

  it('tags rows by the list they came from', () => {
    const rows = build([makeCheck()], [makeTest()]);
    expect(rows.map((row) => row.kind).sort()).toEqual(['check', 'uiTest']);
  });
});

describe('merge and dedupe (EC-09)', () => {
  it('renders a check and a UI test with the same id as one UI test row', () => {
    const rows = build([makeCheck({ id: 'same', name: 'Check twin' })], [makeTest({ id: 'same', name: 'Test twin' })]);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(isUiCatalogRow(row)).toBe(true);
    expect(isUiCatalogRow(row) && row.test.name).toBe('Test twin');
  });

  it('keeps one row when the same id repeats inside a list', () => {
    const rows = build([makeCheck({ id: 'a' }), makeCheck({ id: 'a' })], [makeTest({ id: 'b' }), makeTest({ id: 'b' })]);
    expect(ids(rows).sort()).toEqual(['a', 'b']);
  });

  it('does not change its inputs', () => {
    const checks = [makeCheck({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }), makeCheck({ id: 'b' })];
    const tests = [makeTest({ id: 'c' })];
    build(checks, tests);
    expect(checks.map((check) => check.id)).toEqual(['a', 'b']);
    expect(tests).toHaveLength(1);
  });
});

describe('order (spec §9.2, PC-01)', () => {
  it('orders both kinds by createdAt descending', () => {
    const rows = build(
      [
        makeCheck({ id: 'old-check', createdAt: '2026-09-01T00:00:00.000Z' }),
        makeCheck({ id: 'new-check', createdAt: '2026-10-03T00:00:00.000Z' }),
      ],
      [
        makeTest({ id: 'mid-test', createdAt: '2026-09-15T00:00:00.000Z' }),
        makeTest({ id: 'newest-test', createdAt: '2026-10-04T00:00:00.000Z' }),
      ],
    );
    expect(ids(rows)).toEqual(['newest-test', 'new-check', 'mid-test', 'old-check']);
  });

  it('breaks a createdAt tie by id, whichever list each row came from', () => {
    const at = '2026-10-01T10:00:00.000Z';
    const rows = build(
      [makeCheck({ id: 'c', createdAt: at }), makeCheck({ id: 'a', createdAt: at })],
      [makeTest({ id: 'b', createdAt: at })],
    );
    expect(ids(rows)).toEqual(['a', 'b', 'c']);
  });

  it('compares instants, not strings', () => {
    const early = { kind: 'check', check: makeCheck({ id: 'x', createdAt: '2026-10-01T10:00:00+02:00' }) } as const;
    const late = { kind: 'check', check: makeCheck({ id: 'y', createdAt: '2026-10-01T09:00:00Z' }) } as const;
    // 08:00Z is earlier than 09:00Z, although its text sorts after it.
    expect(compareCatalogRows(early, late)).toBe(1);
    expect(compareCatalogRows(late, early)).toBe(-1);
  });

  it('puts a row with no createdAt last', () => {
    const rows = build([makeCheck({ id: 'dated' })], [makeTest({ id: 'undated', createdAt: null })]);
    expect(ids(rows)).toEqual(['dated', 'undated']);
  });
});

describe('CSI name (DC-16)', () => {
  it('uses the store name when the store has the CSI', () => {
    const [row] = build([], [makeTest({ csiId: '100' })]);
    expect(isUiCatalogRow(row) && row.csiName).toBe('Payments');
  });

  it('falls back to the CSI id when the store has no entry', () => {
    const [row] = build([], [makeTest({ csiId: '999' })]);
    expect(isUiCatalogRow(row) && row.csiName).toBe('999');
  });

  it('has no name for a test without a CSI', () => {
    const [row] = build([], [makeTest({ csiId: null })]);
    expect(isUiCatalogRow(row) && row.csiName).toBeNull();
  });
});

describe('status mapping (spec §9.3, DC-08)', () => {
  const row = (readiness: TestReadiness, lastRunStatus: TestDto['lastRunStatus']): CatalogRow => ({
    kind: 'uiTest',
    test: makeTest({ readiness, lastRunStatus }),
    csiName: null,
  });

  it.each<[TestReadiness, TestDto['lastRunStatus'], string, string]>([
    ['UNLEARNED', null, 'Not learned', 'UNLEARNED'],
    ['LEARNING', null, 'Learning', 'LEARNING'],
    ['NEEDS_RELEARN', 'PASSED', 'Needs re-learn', 'NEEDS_RELEARN'],
    ['READY', 'PASSED', 'Passing', 'PASSING'],
    ['READY', 'FAILED', 'Failing', 'FAILING'],
    ['READY', 'ERROR', 'Error', 'WARNING'],
    ['READY', null, 'Not run', 'PENDING'],
  ])('%s with last run %s reads %s and is selected by %s', (readiness, last, label, filterValue) => {
    const status = catalogRowStatus(row(readiness, last));
    expect(status.label).toBe(label);
    expect(status.filterValue).toBe(filterValue);
  });

  it('keeps the checks own chip and filter value', () => {
    const check: CatalogRow = { kind: 'check', check: makeCheck({ status: 'WARNING' }) };
    expect(catalogRowStatus(check)).toEqual({ label: 'Warning', color: 'warning', filterValue: 'WARNING' });
  });

  it('puts the Error test in Warning and the Not run test in Pending, and no readiness-state test in either', () => {
    const makeUiRow = (id: string, readiness: TestReadiness, lastRunStatus: TestDto['lastRunStatus']): CatalogRow => ({
      kind: 'uiTest',
      test: makeTest({ id, readiness, lastRunStatus }),
      csiName: null,
    });
    const rows: CatalogRow[] = [
      makeUiRow('t0', 'READY', 'ERROR'),
      makeUiRow('t1', 'READY', null),
      makeUiRow('t2', 'UNLEARNED', 'ERROR'),
      makeUiRow('t3', 'LEARNING', null),
      makeUiRow('t4', 'NEEDS_RELEARN', 'ERROR'),
    ];

    const select = (value: string) => rows.filter((candidate) => catalogRowMatchesStatus(candidate, value)).map(catalogRowId);
    expect(select('WARNING')).toEqual(['t0']);
    expect(select('PENDING')).toEqual(['t1']);
    expect(select('UNLEARNED')).toEqual(['t2']);
    expect(select('LEARNING')).toEqual(['t3']);
    expect(select('NEEDS_RELEARN')).toEqual(['t4']);
  });

  it('is selected by no filter value for a readiness the client does not know', () => {
    const unknown: CatalogRow = {
      kind: 'uiTest',
      test: makeTest({ readiness: 'ARCHIVED' as TestReadiness }),
      csiName: null,
    };
    expect(catalogRowStatus(unknown).filterValue).toBeNull();
    for (const value of ['PASSING', 'FAILING', 'WARNING', 'PENDING', 'UNLEARNED', 'LEARNING', 'NEEDS_RELEARN']) {
      expect(catalogRowMatchesStatus(unknown, value)).toBe(false);
    }
    expect(catalogRowMatchesStatus(unknown, '')).toBe(true);
  });
});

describe('type filter', () => {
  const rows = build(
    [makeCheck({ id: 'http', type: 'HTTP' }), makeCheck({ id: 'tcp', type: 'TCP' })],
    [makeTest({ id: 'ui' })],
  );

  it('selects UI test rows with UI_TEST', () => {
    expect(ids(rows.filter((row) => catalogRowMatchesType(row, 'UI_TEST')))).toEqual(['ui']);
  });

  it('selects check rows by their own type', () => {
    expect(ids(rows.filter((row) => catalogRowMatchesType(row, 'HTTP')))).toEqual(['http']);
  });

  it('passes every row with All Types', () => {
    expect(rows.every((row) => catalogRowMatchesType(row, ''))).toBe(true);
  });
});

describe('filterCatalogRows', () => {
  const rows = build(
    [makeCheck({ id: 'pass', status: 'PASSING', createdAt: '2026-10-02T00:00:00.000Z' })],
    [makeTest({ id: 'ui-pass', readiness: 'READY', lastRunStatus: 'PASSED', createdAt: '2026-10-01T00:00:00.000Z' })],
  );
  const none = { statusFilter: '', typeFilter: '', tagFilterActive: false };

  it('keeps every row without filters', () => {
    expect(ids(filterCatalogRows(rows, none))).toEqual(['pass', 'ui-pass']);
  });

  it('hides UI test rows while a tag filter is active and shows them again when it clears', () => {
    expect(ids(filterCatalogRows(rows, { ...none, tagFilterActive: true }))).toEqual(['pass']);
    expect(ids(filterCatalogRows(rows, { ...none, tagFilterActive: false }))).toEqual(['pass', 'ui-pass']);
  });

  it('hides UI test rows under an active tag filter even when Type = UI Test', () => {
    expect(filterCatalogRows(rows, { ...none, typeFilter: 'UI_TEST', tagFilterActive: true })).toEqual([]);
  });

  it('applies status and type together', () => {
    expect(ids(filterCatalogRows(rows, { ...none, statusFilter: 'PASSING' }))).toEqual(['pass', 'ui-pass']);
    expect(ids(filterCatalogRows(rows, { ...none, statusFilter: 'PASSING', typeFilter: 'UI_TEST' }))).toEqual(['ui-pass']);
    expect(filterCatalogRows(rows, { ...none, statusFilter: 'FAILING' })).toEqual([]);
  });

  it('does not change its input', () => {
    const before = [...rows];
    filterCatalogRows(rows, { ...none, typeFilter: 'UI_TEST' });
    expect(rows).toEqual(before);
  });
});

describe('bulk ids (FR-17)', () => {
  it('lists check ids only', () => {
    const rows = build([makeCheck({ id: 'a' }), makeCheck({ id: 'b' })], [makeTest({ id: 'ui' })]);
    expect(checkRowIds(rows).sort()).toEqual(['a', 'b']);
  });
});

describe('last execution', () => {
  it('reads lastExecution for a check and lastRunAt for a UI test', () => {
    const check: CatalogRow = { kind: 'check', check: makeCheck({ lastExecution: '2026-10-02T00:00:00.000Z' }) };
    const test: CatalogRow = { kind: 'uiTest', test: makeTest({ lastRunAt: '2026-10-03T00:00:00.000Z' }), csiName: null };
    expect(catalogRowLastExecution(check)).toBe('2026-10-02T00:00:00.000Z');
    expect(catalogRowLastExecution(test)).toBe('2026-10-03T00:00:00.000Z');
  });

  it('formats a run time, and reads Never for none or an unreadable value', () => {
    expect(formatLastExecution('2026-10-03T00:00:00.000Z')).toBe(new Date('2026-10-03T00:00:00.000Z').toLocaleString());
    expect(formatLastExecution(null)).toBe('Never');
    expect(formatLastExecution(undefined)).toBe('Never');
    expect(formatLastExecution('not a date')).toBe('Never');
  });
});
