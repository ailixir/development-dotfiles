import { describe, expect, it } from 'vitest';
import type { TestReadiness } from '@/types/studio/studioTypes';
import { uiTestStatus, type UiTestStatusInput } from './uiTestStatus';

type LastRun = UiTestStatusInput['lastRunStatus'];

const status = (readiness: TestReadiness, lastRunStatus: LastRun) =>
  uiTestStatus({ readiness, lastRunStatus });

describe('uiTestStatus (spec §9.3)', () => {
  it.each<[TestReadiness, LastRun, string, string, string]>([
    ['READY', 'PASSED', 'Passing', 'success', 'PASSING'],
    ['READY', 'FAILED', 'Failing', 'error', 'FAILING'],
    ['READY', 'ERROR', 'Error', 'warning', 'WARNING'],
    ['READY', null, 'Not run', 'info', 'PENDING'],
  ])('%s with last run %s reads %s', (readiness, last, label, color, filterValue) => {
    expect(status(readiness, last)).toEqual({ label, color, filterValue });
  });

  it.each<[TestReadiness, string, string, string]>([
    ['UNLEARNED', 'Not learned', 'warning', 'UNLEARNED'],
    ['LEARNING', 'Learning', 'info', 'LEARNING'],
    ['NEEDS_RELEARN', 'Needs re-learn', 'warning', 'NEEDS_RELEARN'],
  ])('%s reads %s for every last run', (readiness, label, color, filterValue) => {
    const lastRuns: LastRun[] = [null, 'PASSED', 'FAILED', 'ERROR'];
    for (const last of lastRuns) {
      expect(status(readiness, last)).toEqual({ label, color, filterValue });
    }
  });

  it('never puts a readiness state in the Warning or Pending group (DC-08)', () => {
    const readiness: TestReadiness[] = ['UNLEARNED', 'LEARNING', 'NEEDS_RELEARN'];
    const lastRuns: LastRun[] = [null, 'PASSED', 'FAILED', 'ERROR'];
    for (const r of readiness) {
      for (const last of lastRuns) {
        expect(['WARNING', 'PENDING', 'PASSING', 'FAILING']).not.toContain(status(r, last).filterValue);
      }
    }
  });

  it('gives each of the seven cases a distinct chip label', () => {
    const labels = new Set([
      status('UNLEARNED', null).label,
      status('LEARNING', null).label,
      status('NEEDS_RELEARN', null).label,
      status('READY', 'PASSED').label,
      status('READY', 'FAILED').label,
      status('READY', 'ERROR').label,
      status('READY', null).label,
    ]);
    expect(labels.size).toBe(7);
  });

  it('shows an unknown readiness as sent and selects it by no filter value', () => {
    const unknown = uiTestStatus({ readiness: 'ARCHIVED' as TestReadiness, lastRunStatus: 'PASSED' });
    expect(unknown).toEqual({ label: 'ARCHIVED', color: 'info', filterValue: null });
  });
});
