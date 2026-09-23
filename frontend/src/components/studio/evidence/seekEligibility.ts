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
 *  - **A start past the recording's end is not seekable either, once the end is known.** A stopped
 *    run (`TIMEOUT`, `CANCELLED`) flushes a recording that ends where the run was stopped, and a
 *    truncated `partial` file ends earlier still; a step that started after that point has no
 *    footage. `HTMLMediaElement.duration` is `NaN` until `loadedmetadata`, and until then the
 *    question has no answer, so `recording.durationMs: null` means *unknown* and refuses nothing.
 *    With the end known, a start past it is `BEYOND_RECORDING`, so the control can be disabled and
 *    named rather than jumping to the last frame as if that were the step. `useVideoSeek` still
 *    clamps as the last line of defence, because a control the page has not disabled can still be
 *    pressed. The end itself is in the recording (it is the last frame), so it is not past it.
 */
export type SeekRefusal = 'NOT_ATTEMPTED' | 'BEYOND_RECORDING';

export type SeekEligibility =
  | { readonly seekable: true; readonly offsetMs: number }
  | { readonly seekable: false; readonly reason: SeekRefusal };

/** What is known of the mounted recording's length. `null` while the media has no metadata yet. */
export interface RecordingExtent {
  readonly durationMs: number | null;
}

export const UNKNOWN_RECORDING_EXTENT: RecordingExtent = { durationMs: null };

export function seekEligibility(
  step: Pick<StepResult, 'offsetMs'>,
  recording: RecordingExtent = UNKNOWN_RECORDING_EXTENT,
): SeekEligibility {
  if (step.offsetMs === null) {
    return { seekable: false, reason: 'NOT_ATTEMPTED' };
  }
  const endKnown = recording.durationMs !== null && Number.isFinite(recording.durationMs);
  if (endKnown && step.offsetMs > (recording.durationMs as number)) {
    return { seekable: false, reason: 'BEYOND_RECORDING' };
  }
  return { seekable: true, offsetMs: step.offsetMs };
}

/** `HTMLMediaElement.currentTime` is in seconds; `offsetMs` is in milliseconds. That is the whole conversion. */
export function currentTimeForOffset(offsetMs: number): number {
  return offsetMs / 1000;
}

/**
 * The `currentTime` a seek may set once the media's duration is known: never past its end. With
 * the end unknown (`null`, or `duration` still `NaN`) or not an end at all (`Infinity`, a stream),
 * nothing is clamped, because there is nothing to clamp against.
 */
export function clampCurrentTimeToRecording(
  currentTime: number,
  mediaDurationSeconds: number | null,
): number {
  if (mediaDurationSeconds === null || !Number.isFinite(mediaDurationSeconds)) {
    return currentTime;
  }
  return Math.min(currentTime, mediaDurationSeconds);
}
