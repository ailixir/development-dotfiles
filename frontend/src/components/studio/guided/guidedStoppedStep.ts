import type { GuidedResult } from '@/types/studio/studioGuidedTypes';

/**
 * Where a failed learn stopped (STUDIO-UNIFY-001.6 AC-01, AC-02, AC-04; @po ruling D2, 2026-10-24).
 *
 * No public field names the failed step: `result.failure` is `{code}` only and `progress.activeStep`
 * is `null` in every terminal state. The one thing the contract does prove is the explanation's
 * per-step `completed` flag ("true only when the step has actions and every effective one
 * succeeded"; `GuidedPublicPresentationProjector`). So the stopped step is a best reading, not a
 * stated cause:
 *
 *  - only an outcome of `FAILED` names a step;
 *  - the step is the first one, in `number` order, whose `completed` is `false`;
 *  - and only when at least one step of the explanation has an action. Without any action the
 *    retained facts prove nothing ("the actions are empty and no claim is made"), and every step
 *    reads `completed: false`, so naming step 1 would be a guess;
 *  - a `completed` step is never named, whatever its actions say: an excluded drift attempt
 *    (`FAILED`, `TARGET_CHANGED`, attempt 0) can sit inside a step that was learned again and
 *    counts as completed.
 *
 * Pure: no React, no clock, no I/O. The editor's result and a latest learning attempt
 * (`{outcome: attempt.state, explanation: attempt.explanation}`) read through the same function.
 */

export interface StoppedStep {
  readonly stepId: string;
  /** 1-based, the explanation's own numbering. */
  readonly number: number;
}

export function stoppedStepOf(input: Pick<GuidedResult, 'outcome' | 'explanation'>): StoppedStep | null {
  if (input.outcome !== 'FAILED') return null;
  const steps = input.explanation.steps;
  if (steps.length === 0 || !steps.some((step) => step.actions.length > 0)) return null;
  let stopped: StoppedStep | null = null;
  for (const step of steps) {
    if (step.completed) continue;
    if (stopped === null || step.number < stopped.number) {
      stopped = { stepId: step.stepId, number: step.number };
    }
  }
  return stopped;
}
