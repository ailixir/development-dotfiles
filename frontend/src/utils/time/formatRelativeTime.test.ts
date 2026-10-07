import { describe, expect, it } from 'vitest';
import { formatAbsoluteTime, formatRelativeTime, toIsoDateTime } from './formatRelativeTime';
import { parseInstant } from './parseInstant';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it.each([
    [0, 'just now'],
    [59_999, 'just now'],
    [MIN, '1m ago'],
    [12 * MIN + 30_000, '12m ago'],
    [59 * MIN, '59m ago'],
    [HOUR, '1h ago'],
    [3 * HOUR + 59 * MIN, '3h ago'],
    [DAY, '1d ago'],
    [2 * DAY + 5 * HOUR, '2d ago'],
    [7 * DAY - 1, '6d ago'],
  ])('%d ms old -> %s', (age, expected) => {
    expect(formatRelativeTime(ago(age), { now: NOW })).toBe(expected);
  });

  it('treats a future instant (clock skew) as just now', () => {
    expect(formatRelativeTime(ago(-5 * MIN), { now: NOW })).toBe('just now');
  });

  it('switches to a date after the threshold', () => {
    expect(
      formatRelativeTime('2026-09-10T10:00:39Z', { now: NOW, locale: 'en-US', timeZone: 'UTC' }),
    ).toBe('Sep 10, 2026');
    expect(formatRelativeTime(ago(8 * DAY), { now: NOW, dateAfterDays: 30 })).toBe('8d ago');
  });

  it.each([null, undefined, '', 'not-a-date'])('renders the placeholder for %s', (value) => {
    expect(formatRelativeTime(value, { now: NOW })).toBe('—');
    expect(formatRelativeTime(value, { now: NOW, fallback: 'Never' })).toBe('Never');
  });

  it('accepts Date and epoch inputs', () => {
    expect(formatRelativeTime(new Date(NOW - 2 * HOUR), { now: NOW })).toBe('2h ago');
    expect(formatRelativeTime(NOW - 3 * MIN, { now: NOW })).toBe('3m ago');
  });
});

describe('formatAbsoluteTime', () => {
  it('prints the date, time with seconds and the zone name', () => {
    expect(formatAbsoluteTime('2026-09-10T10:00:39Z', { locale: 'en-US', timeZone: 'UTC' })).toBe(
      'Sep 10, 2026, 10:00:39 AM UTC',
    );
  });

  it('can omit seconds', () => {
    expect(
      formatAbsoluteTime('2026-09-10T10:00:39Z', { locale: 'en-US', timeZone: 'UTC', seconds: false }),
    ).toBe('Sep 10, 2026, 10:00 AM UTC');
  });

  it('always includes a zone name in the reader zone', () => {
    const text = formatAbsoluteTime('2026-09-10T10:00:39Z', { locale: 'en-US' });
    expect(text).toMatch(/\d{4}, \d{1,2}:\d{2}:\d{2} [AP]M \S+/);
  });

  it.each([null, undefined, '', 'nope'])('renders the placeholder for %s', (value) => {
    expect(formatAbsoluteTime(value)).toBe('—');
  });
});

describe('toIsoDateTime / parseInstant', () => {
  it('normalizes a valid instant and rejects garbage', () => {
    expect(toIsoDateTime('2026-09-10T10:00:39Z')).toBe('2026-09-10T10:00:39.000Z');
    expect(toIsoDateTime('garbage')).toBeUndefined();
    expect(parseInstant(null)).toBeNull();
    expect(parseInstant('garbage')).toBeNull();
  });
});
