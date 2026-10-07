/** An instant the server sent, or `null` when it is absent or unparseable. Never "Invalid Date". */
export type InstantInput = string | number | Date | null | undefined;

export function parseInstant(value: InstantInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** What every formatter in this folder renders for a missing or unparseable value. */
export const EMPTY_TIME_PLACEHOLDER = '—';
