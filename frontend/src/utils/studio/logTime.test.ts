import { describe, expect, it } from 'vitest';
import type { ExecutionLogEntry } from '@/types/studio/studioTypes';
import { displayLogMessage, formatLogTime, logEntryTime, toStudioLogLines } from './logTime';

/**
 * Studio v1 gaps: the live log panel read `new Date(entry.timestamp)` off API entries that carry
 * `at`, so every line rendered "Invalid Date"; and the runner's closing line has `at: null`.
 */
describe('formatLogTime', () => {
  it('renders a parseable instant as a local time', () => {
    const at = '2026-09-18T06:00:05Z';
    expect(formatLogTime(at)).toBe(new Date(at).toLocaleTimeString());
    expect(formatLogTime(at)).not.toBe('');
  });

  it.each([null, undefined, '', 'not-a-time'])('renders %s as an empty column', (at) => {
    expect(formatLogTime(at)).toBe('');
  });
});

describe('toStudioLogLines', () => {
  const logs: ExecutionLogEntry[] = [
    { at: '2026-09-18T06:00:00Z', level: 'INFO', message: 'browser started' },
    { at: '2026-09-18T06:00:03Z', level: 'WARN', message: 'slow step' },
    { at: '2026-09-18T06:00:04Z', level: 'ERROR', message: 'assertion failed' },
    { at: null, level: 'INFO', message: 'run finished' },
  ];

  it('carries the API `at` into the time column the panel formats, with no Invalid Date or null', () => {
    const rendered = toStudioLogLines(logs).map((line) => formatLogTime(line.timestamp));
    expect(rendered.slice(0, 3)).toEqual(
      logs.slice(0, 3).map((entry) => new Date(entry.at as string).toLocaleTimeString()),
    );
    expect(rendered[3]).toBe('');
    expect(rendered.join(' ')).not.toMatch(/Invalid Date|null/u);
  });

  it('maps the API levels onto the panel levels, so an ERROR line is an error', () => {
    expect(toStudioLogLines(logs).map((line) => line.level)).toEqual([
      'info',
      'warning',
      'error',
      'info',
    ]);
  });
});

describe('displayLogMessage (AC-08: the runner counts steps from 0, the step list from 1)', () => {
  it.each([
    [0, 'step 0 started', 'step 1 started'],
    [2, 'step 2 PASS', 'step 3 PASS'],
    [4, 'step 4', 'step 5'],
  ])('rewrites the exact prefix at step index %s', (stepIndex, message, expected) => {
    expect(displayLogMessage({ stepIndex, message })).toBe(expected);
  });

  it.each([
    ['a mismatching index', 1, 'step 0 started'],
    ['a longer number sharing the prefix', 1, 'step 10 started'],
    ['"step 0" later in the text', 0, 'retry of step 0 started'],
    ['no stepIndex on the entry', undefined, 'step 0 started'],
    ['a null stepIndex', null, 'step 0 started'],
  ])('leaves a message unchanged for %s', (_label, stepIndex, message) => {
    expect(displayLogMessage({ stepIndex, message })).toBe(message);
  });
});

describe('logEntryTime (AC-08: the closing line borrows the run end time)', () => {
  const ENDED = '2026-09-18T06:00:09Z';

  it('gives an untimed closing line the end time, with or without a null stepIndex', () => {
    expect(logEntryTime({ at: null, message: 'run PASSED' }, ENDED)).toBe(ENDED);
    expect(logEntryTime({ at: null, message: 'run FAILED', stepIndex: null }, ENDED)).toBe(ENDED);
  });

  it('leaves a closing line untimed without a parseable end time', () => {
    expect(logEntryTime({ at: null, message: 'run PASSED' })).toBeNull();
    expect(logEntryTime({ at: null, message: 'run PASSED' }, null)).toBeNull();
    expect(logEntryTime({ at: null, message: 'run PASSED' }, 'not-a-time')).toBeNull();
  });

  it('never changes another line: a timed line, a step line, or a line that is not a closing line', () => {
    expect(logEntryTime({ at: '2026-09-18T06:00:01Z', message: 'run PASSED' }, ENDED)).toBe(
      '2026-09-18T06:00:01Z',
    );
    expect(logEntryTime({ at: null, message: 'run PASSED', stepIndex: 0 }, ENDED)).toBeNull();
    expect(logEntryTime({ at: null, message: 'step 0 started', stepIndex: 0 }, ENDED)).toBeNull();
    expect(logEntryTime({ at: null, message: 'browser heartbeat' }, ENDED)).toBeNull();
  });
});

describe('toStudioLogLines with 1-based steps and the closing time', () => {
  const ENDED = '2026-09-18T06:00:09Z';
  const logs: ExecutionLogEntry[] = [
    { at: '2026-09-18T06:00:01Z', level: 'INFO', message: 'step 0 started', stepIndex: 0 },
    { at: null, level: 'INFO', message: 'step 1 slow', stepIndex: 1 },
    { at: null, level: 'INFO', message: 'run PASSED' },
  ];

  it('rewrites the step text, carries stepIndex, and times only the closing line', () => {
    expect(toStudioLogLines(logs, ENDED)).toEqual([
      { timestamp: '2026-09-18T06:00:01Z', level: 'info', message: 'step 1 started', stepIndex: 0 },
      { timestamp: '', level: 'info', message: 'step 2 slow', stepIndex: 1 },
      { timestamp: ENDED, level: 'info', message: 'run PASSED' },
    ]);
  });

  it('behaves as before for a one-argument call: the closing line stays untimed', () => {
    expect(toStudioLogLines(logs)[2]).toEqual({ timestamp: '', level: 'info', message: 'run PASSED' });
  });
});
