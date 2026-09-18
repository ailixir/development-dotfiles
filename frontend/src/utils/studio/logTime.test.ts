import { describe, expect, it } from 'vitest';
import type { ExecutionLogEntry } from '@/types/studio/studioTypes';
import { formatLogTime, toStudioLogLines } from './logTime';

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
