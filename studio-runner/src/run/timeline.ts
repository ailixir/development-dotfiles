/**
 * The run timeline (AC-10, AC-11 — ADR-002 §11, open item **O-8**).
 *
 * ## One clock, one origin, taken once
 *
 * ADR-002 §4.1 fixes `atMs` as a fractional offset on the run timeline, sharing the step
 * readings' monotonic clock and origin, `null` where no reading exists, `0` meaning the browser
 * start. Before this story that invariant did not hold in running code: `executeSteps` fell back
 * to `performance.now()`, whose origin is **process start**, while the browser-start log line
 * carried a literal `0`. Two origins on one timeline, and the 500 ms step-seek target of §6.4
 * depends on there being one.
 *
 * {@link takeRunOrigin} is where the origin is taken, and it is the **only** place. It is called
 * at recording-context readiness — not at the launch call, not at admission — and it takes the
 * wall clock and the monotonic clock **adjacently**, from one sample each, so that
 * `browserStartedAt + atMs` names an instant on the recording timeline rather than approximating
 * one.
 *
 * ## Why there is no calibration constant on the wire
 *
 * ADR-002 §11.2 rejected `recordingOriginMs`. Subtracting two readings of one monotonic clock is
 * exact wherever the subtraction happens, so a wire constant conveys nothing the runner could not
 * have applied itself, and it makes correctness depend on every consumer remembering to apply it.
 * Zeroing here fixes each entry's value at the instant it is observed, which is what makes an
 * entry identical across cumulative reports and across byte-identical terminal retries.
 *
 * If AC-12c's staging measurement later shows the readiness-to-first-frame gap is a material
 * fraction of the budget, the correction is folded into {@link takeRunOrigin} — runner-side,
 * beside the other pins — and still needs no contract change. Nothing is folded in today: a
 * laptop cannot measure it (AC-12c is explicitly a staging number).
 */

import type { Clock } from '../executor/adapters/StepReporter.js';

/**
 * The two time sources, injected so a test can drive the origin without sleeping — and so the
 * scale assertion of AC-11.3 can replace the run clock with a process-origin one and watch the
 * assertion go red.
 */
export interface OriginSource {
  /** Monotonic milliseconds. Never wall clock: wall-clock adjustments must not move a reading. */
  monotonicNow(): number;
  /** The single wall-clock instant the runner holds for a run. */
  wallNow(): Date;
}

/**
 * The process-default source.
 *
 * `performance.now()` appears **here and nowhere else on the production path**: it is monotonic,
 * which is the property the run clock needs, and its process-start origin is irrelevant because
 * {@link takeRunOrigin} subtracts it away. The defect AC-11.1 closes was the opposite arrangement
 * — a `performance.now()` clock whose origin was *not* subtracted away, reached by defaulting.
 */
export const systemOriginSource: OriginSource = {
  monotonicNow: () => performance.now(),
  wallNow: () => new Date(),
};

/** One instant, observed twice, plus the clock zeroed at it. */
export interface RunOrigin {
  /** The wall-clock read. Goes on the wire as `browserStartedAt`. */
  readonly browserStartedAt: Date;
  /** The monotonic read, in the source's own scale. Kept so the pairing is inspectable. */
  readonly monotonicZero: number;
  /**
   * The first reading of {@link clock}, computed from the same monotonic sample as the zero.
   *
   * It is exactly `0` — and it is a **reading**, not a literal: the browser-start log entry
   * carries this value, so the `0` on the wire is the result of subtracting the origin from the
   * sample that defined it, which is what AC-10 asks for.
   */
  readonly startedAtMs: number;
  /** The run-scoped monotonic clock. Its zero is the browser start. */
  readonly clock: Clock;
}

/**
 * Takes the run origin: **one call, two adjacent reads, at recording-context readiness.**
 *
 * The monotonic sample is read once and used for both the clock's zero and the first reading, so
 * the pairing cannot drift by the cost of a second read. `test/run/timeline.test.ts` asserts
 * `monotonicNow` is called exactly once here, which is how "adjacent" is made falsifiable rather
 * than described.
 */
export function takeRunOrigin(source: OriginSource = systemOriginSource): RunOrigin {
  const monotonicZero = source.monotonicNow();
  const browserStartedAt = source.wallNow();
  return {
    browserStartedAt,
    monotonicZero,
    startedAtMs: monotonicZero - monotonicZero,
    clock: { now: () => source.monotonicNow() - monotonicZero },
  };
}

/**
 * Takes an origin on the **process** clock — the exact defect AC-11 exists to close.
 *
 * Nothing on the production path can reach it: the production path calls {@link takeRunOrigin},
 * and `executeSteps` no longer has a `clock` default to fall back to (AC-11.1). It is exported,
 * and named for what it is, so the scale assertion can substitute it deliberately and watch the
 * bound go red — a guard nobody has seen fail is not a guard.
 *
 * @internal Falsification instrument. Never wire this into a run.
 */
export function takeProcessOriginForFalsification(
  source: OriginSource = systemOriginSource,
): RunOrigin {
  const browserStartedAt = source.wallNow();
  return {
    browserStartedAt,
    monotonicZero: 0,
    startedAtMs: source.monotonicNow(),
    clock: { now: () => source.monotonicNow() },
  };
}
