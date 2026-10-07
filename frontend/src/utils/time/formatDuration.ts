import { EMPTY_TIME_PLACEHOLDER } from './parseInstant';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const pad2 = (value: number) => String(value).padStart(2, '0');

/**
 * A duration in milliseconds, compact and unit-explicit (story 10.46, AC-4):
 *
 * | input        | output     |
 * |--------------|------------|
 * | `850`        | `850 ms`   |
 * | `42_300`     | `42 s`     |
 * | `125_000`    | `2m 05s`   |
 * | `3_720_000`  | `1h 02m`   |
 *
 * Units are truncated, never rounded up, so `59_999` reads `59 s` rather than `60 s`.
 * `null`, `undefined`, `NaN`, infinities and negative values render `fallback`.
 */
export function formatDuration(
  ms: number | null | undefined,
  fallback: string = EMPTY_TIME_PLACEHOLDER,
): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return fallback;
  if (ms < SECOND) return `${Math.floor(ms)} ms`;
  if (ms < MINUTE) return `${Math.floor(ms / SECOND)} s`;
  if (ms < HOUR) {
    const minutes = Math.floor(ms / MINUTE);
    const seconds = Math.floor((ms % MINUTE) / SECOND);
    return `${minutes}m ${pad2(seconds)}s`;
  }
  const hours = Math.floor(ms / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  return `${hours}h ${pad2(minutes)}m`;
}
