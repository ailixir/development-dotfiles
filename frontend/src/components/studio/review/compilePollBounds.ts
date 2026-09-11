import type { CompileStatus } from '@/types/studio/studioTypes';

/**
 * The bound on the `COMPILING` watch (story 10.10, AC-23).
 *
 * There is no compile-progress channel in any source — SSE is scoped to executions (§5.5) — so
 * the surface polls `GET /tests/{id}`, which is the only declared read carrying `compileStatus`.
 * What this module may **not** do is invent a bound. The watch window is the server's own
 * abandoned-compile sweep threshold, `studio.compile.sweep.threshold` (story 10.9): past it the
 * server has already moved a stuck `COMPILING` row to `STALE`, so watching longer watches for a
 * transition that has happened, and stopping earlier reports a timeout the server does not agree
 * with.
 *
 * The value below is pinned to the deployed default by `compilePollBounds.test.ts`, which reads
 * `backend/src/main/resources/application.yml` and fails if the two drift. It is a derivation
 * with a guard, not a number somebody liked.
 *
 * BRD §6 — *"Studio must not exhaust capacity reserved for ordinary checks/REST"* — is why the
 * bound is a criterion at all. The cadence is **not** asserted to be right; boundedness,
 * stopping, and the honesty of the terminal message are.
 */

/** `studio.compile.sweep.threshold` default, in milliseconds. Pinned, not chosen. */
export const COMPILE_SWEEP_THRESHOLD_MS = 600_000;

/** The whole watch window. One sweep threshold, no margin invented on top of it. */
export const COMPILE_WATCH_WINDOW_MS = COMPILE_SWEEP_THRESHOLD_MS;

const FIRST_DELAY_MS = 2_000;
const BACKOFF_FACTOR = 1.6;
const MAX_DELAY_MS = 30_000;

/**
 * The delays between reads, derived from the window rather than counted out by hand. Backoff
 * keeps the early transitions responsive without holding a request slot open for ten minutes at
 * two-second intervals.
 */
export function compilePollSchedule(windowMs: number = COMPILE_WATCH_WINDOW_MS): number[] {
  const delays: number[] = [];
  let elapsed = 0;
  let delay = FIRST_DELAY_MS;
  while (elapsed + delay <= windowMs) {
    delays.push(delay);
    elapsed += delay;
    delay = Math.min(Math.round(delay * BACKOFF_FACTOR), MAX_DELAY_MS);
  }
  return delays;
}

/**
 * The four states in which a compile is over. Reaching any of them stops the watch; so does
 * unmounting, and so does a refused read.
 */
export const TERMINAL_COMPILE_STATUSES: readonly CompileStatus[] = [
  'AWAITING_CONFIRMATION',
  'READY',
  'NEEDS_REVISION',
  'STALE',
];

export function isTerminalCompileStatus(status: string): boolean {
  return (TERMINAL_COMPILE_STATUSES as readonly string[]).includes(status);
}

/**
 * What the surface says when the window closes with the draft still `COMPILING`.
 *
 * It reports a give-up, never a failure, a timeout or a compile error: the translation may well
 * have finished and this page simply stopped looking. Reporting a client-side give-up as a
 * server-side outcome is the same class of untruth AC-7 exists to prevent.
 */
export const WATCH_GAVE_UP_MESSAGE =
  'We stopped watching for the result. This does not mean anything went wrong — reload the page to see where the translation got to.';
