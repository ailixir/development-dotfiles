import type { StepResult } from '@/types/studio/studioTypes';

/**
 * Whether a step can be sought, and to what `currentTime` (story 10.16a, AC-8, AC-9, AC-10).
 *
 * This is the single source for both questions.
 *
 *  - **The target is the step's recorded start, `offsetMs`, and nothing else.** No rounding beyond
 *    the millisecond-to-second conversion, no re-basing against the first reading, and no client
 *    calibration: `StepResult.offsetMs` says the API *"performs no calibration of its own — in
 *    particular it never re-bases readings against the first one it sees"* (`openapi.yaml`,
 *    ADR-002 §INT-5). A wait or assertion step seeks to its start too (architecture §6.4), never to
 *    its finish or its duration.
 *  - **A null `offsetMs` is not seekable.** Never-attempted steps, `SKIPPED` ones included, carry
 *    null timings (§8.2), and §6.4 gives them a disabled seek. A `?? 0` here would send the reader
 *    to the start of the recording for a step that never ran. The one `SKIPPED` step with a start
 *    is the one a cancel interrupted (ADR-002 §29.5); it did run, so it is seekable like any other.
 */
export type SeekEligibility =
  | { readonly seekable: true; readonly offsetMs: number }
  | { readonly seekable: false };

export function seekEligibility(step: Pick<StepResult, 'offsetMs'>): SeekEligibility {
  return step.offsetMs === null ? { seekable: false } : { seekable: true, offsetMs: step.offsetMs };
}

/** `HTMLMediaElement.currentTime` is in seconds; `offsetMs` is in milliseconds. That is the whole conversion. */
export function currentTimeForOffset(offsetMs: number): number {
  return offsetMs / 1000;
}
