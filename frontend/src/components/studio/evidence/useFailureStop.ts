import { useEffect, useState } from 'react';
import type { ExecutionSnapshot, StepResult } from '@/types/studio/studioTypes';

/** The first step that failed and has a place on the recording's timeline. */
export function failedStepOf(snapshot: ExecutionSnapshot): StepResult | null {
  return snapshot.stepResults.find((step) => step.status === 'FAIL' && step.offsetMs !== null) ?? null;
}

/** Where the failed step ends on the recording, in seconds (offsets are video time, uncalibrated). */
export function failureSecondsOf(step: StepResult | null): number | null {
  return step === null || step.offsetMs === null ? null : (step.offsetMs + (step.durationMs ?? 0)) / 1000;
}

/**
 * Pauses the video once when playback first reaches the failure, and reports whether the playhead is
 * at or past it (so the caller can show why the step failed). Later seeks do not pause again, and
 * seeking back before the failure clears `reached`. A recording that ends before the failure time
 * counts as reached at its end.
 */
export function useFailureStop(video: HTMLVideoElement | null, failureSeconds: number | null): boolean {
  const [reached, setReached] = useState(false);

  useEffect(() => {
    setReached(false);
    if (video === null || failureSeconds === null) {
      return undefined;
    }
    let paused = false;
    const check = () => {
      const end = Number.isFinite(video.duration) ? Math.min(failureSeconds, video.duration) : failureSeconds;
      const past = video.ended || video.currentTime >= end;
      setReached(past);
      if (past && !paused) {
        paused = true;
        video.pause();
      }
    };
    const events = ['timeupdate', 'seeked', 'ended'] as const;
    for (const type of events) {
      video.addEventListener(type, check);
    }
    return () => {
      for (const type of events) {
        video.removeEventListener(type, check);
      }
    };
  }, [video, failureSeconds]);

  return reached;
}
