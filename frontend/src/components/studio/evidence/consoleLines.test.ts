import { describe, expect, it } from 'vitest';
import type { ExecutionLogEntry } from '@/types/studio/studioTypes';
import {
  consoleErrorCountByStep,
  consoleLinesOf,
  passedWithPageErrorsNotice,
} from './consoleLines';

const at = '2026-09-14T10:00:33Z';
const logs: ExecutionLogEntry[] = [
  { at, level: 'INFO', message: 'Run started', stepIndex: null },
  { at, level: 'WARN', message: 'console.warn: deprecated', stepIndex: 1 },
  { at, level: 'ERROR', message: 'console.error: Failed to load resource: 403', stepIndex: 4 },
  { at, level: 'ERROR', message: 'console.error: Failed to load resource: 404', stepIndex: 4 },
  { at, level: 'ERROR', message: 'page error: ReferenceError: foo', stepIndex: 2 },
  { at, level: 'ERROR', message: 'Step 3 failed', stepIndex: 2 },
];

describe('console line helpers', () => {
  it('picks only console and page-error lines', () => {
    expect(consoleLinesOf(logs)).toHaveLength(4);
  });

  it('counts level ERROR console lines per step and ignores warnings and other errors', () => {
    expect(consoleErrorCountByStep(logs)).toEqual(
      new Map([
        [4, 2],
        [2, 1],
      ]),
    );
  });

  it('words the notice with the first stepped error, or without a step when none has one', () => {
    expect(passedWithPageErrorsNotice(logs)).toBe(
      'Passed, but the page reported 3 errors after step 5. Steps pass on what they do and check, so add a check after step 5, for example: Check that the URL contains "…".',
    );
    expect(
      passedWithPageErrorsNotice([{ at, level: 'ERROR', message: 'console.error: x', stepIndex: null }]),
    ).toBe(
      'Passed, but the page reported 1 error. Steps pass on what they do and check, so add a check, for example: Check that the URL contains "…".',
    );
    expect(passedWithPageErrorsNotice(logs.slice(0, 2))).toBeNull();
  });
});
