import { parseInstant } from '@/utils/time/parseInstant';

/**
 * An evidence expiry instant in the reader's locale (VAL-035), e.g. "Nov 4, 2026, 3:48 AM". The
 * app formats instants with the browser locale (`toLocaleString`); an unparseable value is shown
 * as the server sent it rather than as "Invalid Date".
 *
 * For list surfaces that need the time zone printed, use `formatAbsoluteTime` from
 * `@/utils/time`, which shares the same parsing.
 */
export function formatEvidenceInstant(at: string): string {
  const parsed = parseInstant(at);
  if (!parsed) return at;
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
