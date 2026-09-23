import { useCallback, useRef, useState, type RefCallback } from 'react';
import { clampCurrentTimeToRecording, currentTimeForOffset } from './seekEligibility';

/**
 * The bridge between a step's seek control and the one `<video>` on the page.
 *
 * The page and the tests use this same hook, so the tests exercise the code the page runs.
 *
 *  - **`videoRef` is a callback ref**, so the hook sees the element mount and unmount. The panel
 *    remounts its `<video>` per recording (`key={playbackUrl}`), and each mount starts with the
 *    recording's end unknown.
 *  - **`recordingDurationMs` is the media's own `duration`, in milliseconds**: read on
 *    `loadedmetadata` and `durationchange`, forgotten on `emptied` and on unmount, and `null` until
 *    the media has said. It exists so a caller can hand it to `seekEligibility` as the recording's
 *    extent and disable the steps the recording does not reach, which is the preferred answer to an
 *    out-of-range seek: a named, disabled control rather than a jump to the wrong place.
 *  - **A seek never lands past the recording's end.** Once `duration` is finite, `seekToOffset`
 *    clamps to it. Browsers clamp `currentTime` on their own, but silently and only after the
 *    assignment, and jsdom not at all; the hook does it before, so the element is only ever told a
 *    position that exists. The duration is read from the element at seek time, not from the state,
 *    so a seek between `loadedmetadata` and the re-render it schedules is still clamped.
 */
export function useVideoSeek(): {
  readonly videoRef: RefCallback<HTMLVideoElement>;
  readonly seekToOffset: (offsetMs: number) => void;
  readonly recordingDurationMs: number | null;
} {
  const elementRef = useRef<HTMLVideoElement | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const [recordingDurationMs, setRecordingDurationMs] = useState<number | null>(null);

  const videoRef = useCallback<RefCallback<HTMLVideoElement>>((element) => {
    detachRef.current?.();
    detachRef.current = null;
    elementRef.current = element;
    if (element === null) {
      setRecordingDurationMs(null);
      return;
    }
    const read = () => setRecordingDurationMs(recordingDurationMsOf(element));
    for (const type of RECORDING_EXTENT_EVENTS) {
      element.addEventListener(type, read);
    }
    detachRef.current = () => {
      for (const type of RECORDING_EXTENT_EVENTS) {
        element.removeEventListener(type, read);
      }
    };
    // The metadata may already be there when the element arrives (a source the browser had cached).
    read();
  }, []);

  const seekToOffset = useCallback((offsetMs: number) => {
    const video = elementRef.current;
    if (video) {
      video.currentTime = clampCurrentTimeToRecording(
        currentTimeForOffset(offsetMs),
        knownDurationSeconds(video),
      );
    }
  }, []);

  return { videoRef, seekToOffset, recordingDurationMs };
}

/** The events after which `duration` may have changed, `emptied` included: it goes back to `NaN`. */
const RECORDING_EXTENT_EVENTS = ['loadedmetadata', 'durationchange', 'emptied'] as const;

/** `duration` is `NaN` before `loadedmetadata`, and `Infinity` for a stream; neither is an end. */
function knownDurationSeconds(video: HTMLVideoElement): number | null {
  return Number.isFinite(video.duration) ? video.duration : null;
}

function recordingDurationMsOf(video: HTMLVideoElement): number | null {
  const seconds = knownDurationSeconds(video);
  return seconds === null ? null : seconds * 1000;
}
