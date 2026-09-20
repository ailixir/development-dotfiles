import { useCallback, useRef, type MutableRefObject } from 'react';
import { currentTimeForOffset } from './seekEligibility';

/**
 * The bridge between a step's seek control and the one `<video>` on the page.
 *
 * The page and the tests use this same hook, so the tests exercise the code the page runs.
 */
export function useVideoSeek(): {
  readonly videoRef: MutableRefObject<HTMLVideoElement | null>;
  readonly seekToOffset: (offsetMs: number) => void;
} {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const seekToOffset = useCallback((offsetMs: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = currentTimeForOffset(offsetMs);
    }
  }, []);
  return { videoRef, seekToOffset };
}
