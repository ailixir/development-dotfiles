import { EMPTY_TIME_PLACEHOLDER, parseInstant, type InstantInput } from './parseInstant';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface RelativeTimeOptions {
  /** The reference "now", in epoch ms. Defaults to `Date.now()`. */
  now?: number;
  /** Ages of this many days or more render as a date instead. Default `7`. */
  dateAfterDays?: number;
  /** BCP 47 locale for the date form. Defaults to the reader's locale. */
  locale?: string;
  /** IANA time zone for the date form. Defaults to the reader's zone. */
  timeZone?: string;
  /** Rendered for a missing or unparseable instant. Default `—`. */
  fallback?: string;
}

/**
 * A past instant as a short age (story 10.46, AC-4): `just now` (under a minute, or in the
 * future through clock skew), `12m ago`, `3h ago`, `2d ago`, then a medium date such as
 * `Sep 10, 2026`. Units are truncated. Pair it with {@link formatAbsoluteTime} in a tooltip or
 * `<time title>` so the exact instant stays available.
 */
export function formatRelativeTime(value: InstantInput, options: RelativeTimeOptions = {}): string {
  const { now = Date.now(), dateAfterDays = 7, locale, timeZone, fallback = EMPTY_TIME_PLACEHOLDER } = options;
  const at = parseInstant(value);
  if (!at) return fallback;
  const age = now - at.getTime();
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h ago`;
  if (age < dateAfterDays * DAY) return `${Math.floor(age / DAY)}d ago`;
  return at.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone });
}

export interface AbsoluteTimeOptions {
  locale?: string;
  /** IANA time zone. Defaults to the reader's zone; the zone name is always printed. */
  timeZone?: string;
  /** Include seconds. Default `true`. */
  seconds?: boolean;
  /** Rendered for a missing or unparseable instant. Default `—`. */
  fallback?: string;
}

/**
 * The exact instant with its time zone, e.g. `Sep 10, 2026, 10:00:39 AM UTC`, for tooltips and
 * `<time title>` next to {@link formatRelativeTime}. Null/invalid-safe.
 */
export function formatAbsoluteTime(value: InstantInput, options: AbsoluteTimeOptions = {}): string {
  const { locale, timeZone, seconds = true, fallback = EMPTY_TIME_PLACEHOLDER } = options;
  const at = parseInstant(value);
  if (!at) return fallback;
  return at.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' as const } : {}),
    timeZoneName: 'short',
    timeZone,
  });
}

/** The ISO form for `<time dateTime>`, or `undefined` when the instant is missing/invalid. */
export function toIsoDateTime(value: InstantInput): string | undefined {
  return parseInstant(value)?.toISOString();
}
