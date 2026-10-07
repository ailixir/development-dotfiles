import { describe, expect, it } from 'vitest';
import { formatDuration } from './formatDuration';

describe('formatDuration', () => {
  it.each([
    [0, '0 ms'],
    [1, '1 ms'],
    [850, '850 ms'],
    [999.9, '999 ms'],
    [1_000, '1 s'],
    [42_300, '42 s'],
    [59_999, '59 s'],
    [60_000, '1m 00s'],
    [125_000, '2m 05s'],
    [3_599_999, '59m 59s'],
    [3_600_000, '1h 00m'],
    [3_720_000, '1h 02m'],
    [26 * 3_600_000 + 5 * 60_000, '26h 05m'],
  ])('%d ms -> %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'renders the placeholder for %s',
    (ms) => {
      expect(formatDuration(ms)).toBe('—');
    },
  );

  it('accepts a custom fallback', () => {
    expect(formatDuration(null, 'Not started')).toBe('Not started');
  });
});
