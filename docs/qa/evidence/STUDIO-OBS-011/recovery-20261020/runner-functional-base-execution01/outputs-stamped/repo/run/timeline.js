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
 * beside the other pins — and still needs no contract change. Story 10.32 added the place to fold
 * it in (ADR-002 §26.3 items 2-3): `takeRunOrigin`'s `calibrationOffsetMs`, fed from the runner
 * setting `STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS`, whose default is `0`. Nothing is folded in
 * today: a laptop cannot measure the gap (AC-12c is explicitly a staging number), and the fixtures
 * tier always runs at `0` (§26.3 item 5).
 */
/**
 * The process-default source.
 *
 * `performance.now()` appears **here and nowhere else on the production path**: it is monotonic,
 * which is the property the run clock needs, and its process-start origin is irrelevant because
 * {@link takeRunOrigin} subtracts it away. The defect AC-11.1 closes was the opposite arrangement
 * — a `performance.now()` clock whose origin was *not* subtracted away, reached by defaulting.
 */
export const systemOriginSource = {
    monotonicNow: () => performance.now(),
    wallNow: () => new Date(),
};
/**
 * Takes the run origin: **one call, two adjacent reads, at recording-context readiness.**
 *
 * The monotonic sample is read once and used for both the clock's zero and the first reading, so
 * the pairing cannot drift by the cost of a second read. `test/run/timeline.test.ts` asserts
 * `monotonicNow` is called exactly once here, which is how "adjacent" is made falsifiable rather
 * than described.
 *
 * **The calibration moves the zero, never a reading** (ADR-002 §26.3 item 2, story 10.32 AC-2).
 * `calibrationOffsetMs` is added to the monotonic sample, so every later `clock.now()` is exactly
 * that many milliseconds *smaller* than it would be uncalibrated. `startedAtMs` stays `0` under any
 * value, because it is the zero minus itself. At `0` the result is identical to an uncalibrated
 * origin. What a non-zero value means for early readings and for `browserStartedAt` is ESC-3, open
 * with @architect. Until it is ruled, no non-zero value is configured anywhere.
 */
export function takeRunOrigin(source = systemOriginSource, calibrationOffsetMs = 0) {
    const monotonicZero = source.monotonicNow() + calibrationOffsetMs;
    const browserStartedAt = source.wallNow();
    return {
        browserStartedAt,
        monotonicZero,
        calibrationOffsetMs,
        startedAtMs: monotonicZero - monotonicZero,
        clock: { now: () => source.monotonicNow() - monotonicZero },
    };
}
//# sourceMappingURL=timeline.js.map