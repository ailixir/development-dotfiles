import type { GuidedResult } from '@/types/studio/studioGuidedTypes';
import { guidedCopy } from '@/components/studio/guided/guidedNarratives';

/**
 * The seek points of a guided Run's recording (STUDIO-OBS-008 AC-7; architect P3 "joins"; D-10).
 *
 *  - **Only server stamps.** A step's seek is its `kind: step` timing; an action's seek is the
 *    `kind: action` timing with the same `stepId`, `admissionId` and `ordinal` as the explanation's
 *    action. `prefixReplay` and `clarificationWait` readings are never seek points. A step or action
 *    without a stamp gets no seek at all: nothing is synthesized (D-10, OBS-015 row-85 decision).
 *  - **Only an `AVAILABLE` recording.** The contract keeps `actionTimings` empty for every other
 *    video status; this returns nothing for them either way, so an absent or partial recording
 *    never offers a seek it cannot honour (KL-015-R1).
 *  - **The server clock, unchanged.** `startMs` is the offset on the recording timeline; it is not
 *    re-based, rounded or calibrated here, exactly like the replay `offsetMs`.
 */

export interface GuidedActionSeekTarget {
  readonly admissionId: string;
  readonly ordinal: number;
  /** The fixed phrase for a recorded action, never page text. */
  readonly safeLabel: string;
  readonly offsetMs: number;
}

export interface GuidedStepSeekTarget {
  readonly stepId: string;
  /** The explanation's own 1-based step number. */
  readonly stepNumber: number;
  /** The `kind: step` start, or `null` when the server stamped none (then there is no step seek). */
  readonly stepOffsetMs: number | null;
  readonly actions: readonly GuidedActionSeekTarget[];
}

export function guidedSeekTargets(
  result: Pick<GuidedResult, 'evidence' | 'actionTimings' | 'explanation'>,
): GuidedStepSeekTarget[] {
  if (result.evidence.video === null || result.evidence.video.status !== 'AVAILABLE') {
    return [];
  }
  const timings = result.actionTimings;
  const targets: GuidedStepSeekTarget[] = [];
  const steps = [...result.explanation.steps].sort((a, b) => a.number - b.number);
  for (const step of steps) {
    const stepTiming = timings.find((timing) => timing.kind === 'step' && timing.stepId === step.stepId);
    const actions: GuidedActionSeekTarget[] = [];
    for (const action of step.actions) {
      const timing = timings.find(
        (candidate) =>
          candidate.kind === 'action' &&
          candidate.stepId === step.stepId &&
          candidate.admissionId === action.admissionId &&
          candidate.ordinal === action.ordinal,
      );
      if (timing !== undefined) {
        actions.push({
          admissionId: action.admissionId,
          ordinal: action.ordinal,
          safeLabel: guidedCopy('actionRan'),
          offsetMs: timing.startMs,
        });
      }
    }
    if (stepTiming === undefined && actions.length === 0) continue;
    targets.push({
      stepId: step.stepId,
      stepNumber: step.number,
      stepOffsetMs: stepTiming?.startMs ?? null,
      actions,
    });
  }
  return targets;
}
