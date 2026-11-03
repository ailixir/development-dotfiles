import type { GuidedResult } from '@/types/studio/studioGuidedTypes';
import type { StepResult } from '@/types/studio/studioTypes';
import { ExecutionStepList } from '@/components/studio/run/ExecutionProgressView';
import { stoppedStepOf } from '@/components/studio/guided/guidedStoppedStep';
import { planStepTexts, type PlanTest } from '@/components/studio/guided/planStepTexts';

/**
 * The step list of a learning attempt's recording on Proof (STUDIO-OBS-008 AC-7, D-10).
 *
 * User decision 2026-11-03: a failed learn shows the same "Steps" list a successful run shows
 * (`ExecutionStepList`): a status icon, "N. step text", its duration and "Seek to step N", and for the
 * step where Studio stopped, "Watch the recording at this step". The list is mapped from the result:
 *  - a `completed` step is PASS; the stopped step ({@link stoppedStepOf}) is FAIL; later steps were
 *    never reached;
 *  - a step's seek point is its own start stamp, else its first action's stamp; the stopped step
 *    without a stamp of its own points at the end of the last stamp, the moment the run stopped;
 *  - no stamp, no seek: a step the server did not stamp is "not attempted". Only an AVAILABLE
 *    recording offers seeks. The text is the authored sentence where `planStepTexts` proves it.
 */

export interface GuidedSeekControlsProps {
  readonly result: Pick<
    GuidedResult,
    'outcome' | 'explanation' | 'publication' | 'currentReadiness' | 'evidence' | 'actionTimings' | 'executionId'
  >;
  readonly onSeek: (offsetMs: number) => void;
  /** The page's server draft: the only source of the authored step sentences. */
  readonly test?: PlanTest | null;
}

export function guidedStepResults(
  result: GuidedSeekControlsProps['result'],
  test: PlanTest | null = null,
): StepResult[] {
  const texts = planStepTexts(result, test);
  const stopped = stoppedStepOf(result);
  const timings = result.actionTimings ?? [];
  const stamped = timings.filter((timing) => timing.kind === 'step' || timing.kind === 'action');
  const lastEnd = stamped.reduce<number | null>(
    (latest, timing) => Math.max(latest ?? 0, timing.endMs ?? timing.startMs),
    null,
  );
  return result.explanation.steps.map((step) => {
    const own = timings.find((timing) => timing.kind === 'step' && timing.stepId === step.stepId);
    const action = timings.find((timing) => timing.kind === 'action' && timing.stepId === step.stepId);
    const isStopped = stopped !== null && stopped.stepId === step.stepId;
    const start = own?.startMs ?? action?.startMs ?? (isStopped ? lastEnd : null);
    const end = own?.endMs ?? action?.endMs ?? null;
    return {
      stepIndex: step.number - 1,
      originalText: texts.get(step.stepId) ?? `Step ${step.number}`,
      status: step.completed ? 'PASS' : isStopped ? 'FAIL' : 'SKIPPED',
      offsetMs: start,
      durationMs: own !== undefined && start !== null && end !== null ? end - start : null,
      message: null,
    };
  });
}

export function GuidedSeekControls({ result, onSeek, test = null }: GuidedSeekControlsProps) {
  const steps = guidedStepResults(result, test);
  if (steps.length === 0) return null;
  const available = result.evidence.video?.status === 'AVAILABLE';
  return (
    <ExecutionStepList
      executionId={result.executionId}
      stepResults={steps}
      runEnded
      videoAvailable={available}
      onSeekStep={available ? onSeek : undefined}
    />
  );
}

export default GuidedSeekControls;
