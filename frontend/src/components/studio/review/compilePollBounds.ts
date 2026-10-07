import type { CompileStatus } from '@/types/studio/studioTypes';

/**
 * The bound on the `COMPILING` watch (story 10.10, AC-23).
 *
 * There is no compile-progress channel in any source — SSE is scoped to executions (§5.5) — so
 * the surface polls `GET /tests/{id}`, which is the only declared read carrying `compileStatus`.
 * What this module may **not** do is invent a bound. The watch window is the server's own
 * abandoned-compile sweep: `studio.compile.abandonment.threshold` plus one
 * `studio.compile.abandonment.interval-ms` (story 10.9; shortened by Studio v1 WP9). A stuck
 * `COMPILING` row becomes sweepable at the threshold and is swept by the next pass, which is at
 * most one interval later — so by the end of that window the server has moved it to `STALE`, and
 * this surface shows the interrupted-translation narrative and its recompile control. Watching
 * longer watches for a transition that has happened; stopping at the threshold alone could give
 * up moments before the sweep that would have answered.
 *
 * Both values are pinned to the deployed defaults by `compilePollBounds.test.ts`, which reads
 * `backend/src/main/resources/application.yml` and fails if they drift. It is a derivation with a
 * guard, not a number somebody liked.
 *
 * BRD §6 — *"Studio must not exhaust capacity reserved for ordinary checks/REST"* — is why the
 * bound is a criterion at all. The cadence is **not** asserted to be right; boundedness,
 * stopping, and the honesty of the terminal message are.
 */

/** `studio.compile.abandonment.threshold` default, in milliseconds. Pinned, not chosen. */
export const COMPILE_SWEEP_THRESHOLD_MS = 300_000;

/** `studio.compile.abandonment.interval-ms` default. Pinned, not chosen. */
export const COMPILE_SWEEP_INTERVAL_MS = 15_000;

/** The whole watch window: the threshold plus the one pass that acts on it. No other margin. */
export const COMPILE_WATCH_WINDOW_MS = COMPILE_SWEEP_THRESHOLD_MS + COMPILE_SWEEP_INTERVAL_MS;

/** The shape of a backoff: the first delay, the growth factor, and the ceiling. */
export interface CompilePollShape {
  readonly firstDelayMs: number;
  readonly backoffFactor: number;
  readonly maxDelayMs: number;
}

/**
 * The Code tab's watch. It observes a compile the author may not be waiting on, so it can afford
 * to back off far.
 */
export const CODE_TAB_POLL_SHAPE: CompilePollShape = {
  firstDelayMs: 2_000,
  backoffFactor: 1.6,
  maxDelayMs: 30_000,
};

/**
 * Run's wait (VAL-007 G3). The author pressed Run and is watching a spinner, so the first reads
 * stay close together — a three-second compile is noticed within about a second of settling — and
 * the ceiling is low enough that a slow compile is noticed at most five seconds late. Over the
 * whole window that is under seventy reads, against the 525 a flat 600ms poll could make.
 */
export const RUN_POLL_SHAPE: CompilePollShape = {
  firstDelayMs: 600,
  backoffFactor: 1.6,
  maxDelayMs: 5_000,
};

/**
 * The delays between reads, derived from the window rather than counted out by hand. Backoff
 * keeps the early transitions responsive without holding a request slot open for ten minutes at
 * two-second intervals.
 */
export function compilePollSchedule(
  windowMs: number = COMPILE_WATCH_WINDOW_MS,
  shape: CompilePollShape = CODE_TAB_POLL_SHAPE,
): number[] {
  const delays: number[] = [];
  let elapsed = 0;
  let delay = shape.firstDelayMs;
  while (elapsed + delay <= windowMs) {
    delays.push(delay);
    elapsed += delay;
    delay = Math.min(Math.round(delay * shape.backoffFactor), shape.maxDelayMs);
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
  'We stopped watching for the result. This does not mean anything went wrong. Reload the page to see where the translation got to.';
