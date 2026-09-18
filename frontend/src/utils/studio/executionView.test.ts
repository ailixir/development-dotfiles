import { describe, expect, it } from 'vitest';
import { normalizeExecutionLogs, normalizeStepResults } from './executionView';

describe('execution view normalization', () => {
  it('preserves backend success log types', () => {
    expect(normalizeExecutionLogs([{ timestamp: '2026-01-01T00:00:00Z', type: 'success', message: 'Passed' }]))
      .toEqual([{ timestamp: '2026-01-01T00:00:00Z', level: 'success', message: 'Passed', stepIndex: undefined }]);
  });

  it('maps backend FAILED step results to the UI FAIL status', () => {
    expect(normalizeStepResults([{ stepIndex: 2, status: 'FAILED' }]))
      .toEqual([{ stepIndex: 2, status: 'FAIL', message: undefined }]);
  });
});
