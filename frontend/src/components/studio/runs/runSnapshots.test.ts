import { describe, expect, it } from 'vitest';
import { passedExecution } from '@/services/mocks/studio/executionFixtures';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { applyRunSnapshot, mergeRunsByRevision, newerSnapshot } from './runSnapshots';
import { runDurationText, runQueueWaitMs, runTestLabel } from './runPresentation';

const snap = (id: string, revision: number, overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot => ({
  ...passedExecution,
  executionId: id,
  revision,
  testName: 'Checkout',
  ...overrides,
});

describe('run snapshot merging (story 10.46, AC-2/AC-3)', () => {
  it('never replaces a newer revision with an older one', () => {
    const newer = snap('a', 5, { status: 'PASSED' });
    const older = snap('a', 2, { status: 'RUNNING' });
    expect(newerSnapshot(newer, older)).toBe(newer);
    expect(newerSnapshot(older, newer)).toBe(newer);
    expect(mergeRunsByRevision([newer], [older, snap('b', 1)]).map((run) => [run.executionId, run.revision])).toEqual([
      ['a', 5],
      ['b', 1],
    ]);
  });

  it('dedupes the incoming page by id and keeps its order', () => {
    const merged = mergeRunsByRevision([], [snap('a', 1), snap('b', 1), snap('a', 1)]);
    expect(merged.map((run) => run.executionId)).toEqual(['a', 'b']);
  });

  it('keeps a known test name when the live snapshot carries none, but honours a deleted test', () => {
    const live = snap('a', 3, { testName: undefined });
    expect(newerSnapshot(snap('a', 1), live)?.testName).toBe('Checkout');
    expect(newerSnapshot(snap('a', 1), snap('a', 3, { testName: null }))?.testName).toBeNull();
  });

  it('applies a snapshot only to its own row and only when newer', () => {
    const rows = [snap('a', 2), snap('b', 2)];
    expect(applyRunSnapshot(rows, snap('a', 1))).toBe(rows);
    expect(applyRunSnapshot(rows, snap('c', 9))).toBe(rows);
    expect(applyRunSnapshot(rows, snap('b', 4)).map((run) => run.revision)).toEqual([2, 4]);
  });
});

describe('run presentation', () => {
  it('names deleted and unnamed tests', () => {
    expect(runTestLabel({ testName: null })).toEqual({ text: 'Deleted test', deleted: true });
    expect(runTestLabel({ testName: undefined })).toEqual({ text: 'UI test', deleted: false });
    expect(runTestLabel({ testName: 'Login' })).toEqual({ text: 'Login', deleted: false });
  });

  it('formats duration and queue wait from server facts', () => {
    expect(runDurationText({ durationMs: 850, status: 'PASSED', startedAt: null })).toBe('850 ms');
    expect(runDurationText({ durationMs: 125_000, status: 'PASSED', startedAt: null })).toBe('2m 05s');
    expect(runDurationText({ durationMs: null, status: 'PENDING', startedAt: null })).toBe('Queued');
    expect(runDurationText({ durationMs: null, status: 'ERROR', startedAt: null })).toBe('Not recorded');
    expect(runQueueWaitMs({ acceptedAt: '2026-09-14T10:00:00Z', startedAt: '2026-09-14T10:00:02.500Z' })).toBe(2_500);
    expect(runQueueWaitMs({ acceptedAt: '2026-09-14T10:00:00Z', startedAt: null })).toBeNull();
  });
});
