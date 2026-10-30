import { describe, expect, it } from 'vitest';
import type {
  GuidedActionOutcome,
  GuidedSessionState,
  PublicExplanation,
  PublicExplanationAction,
  PublicExplanationStep,
} from '@/types/studio/studioGuidedTypes';
import { stoppedStepOf } from './guidedStoppedStep';

/**
 * STUDIO-UNIFY-001.6 task 6.1 (AC-01, AC-02, AC-04; @po D2): the stopped step is the first step, in
 * number order, whose `completed` is false, and only when some step has an action.
 */

const STEP = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function action(outcome: GuidedActionOutcome, attemptOrdinal = 0): PublicExplanationAction {
  return {
    admissionId: `a-${outcome}-${attemptOrdinal}`,
    ordinal: 0,
    attemptOrdinal,
    operationKind: 'click',
    safeLabel: 'Click control',
    outcome,
    referenceIds: [],
  };
}

function step(number: number, completed: boolean, actions: PublicExplanationAction[]): PublicExplanationStep {
  return {
    stepId: STEP(number),
    number,
    completed,
    learnedFromThisRun: completed,
    reusedFrom: null,
    relearnedAfterDrift: false,
    actions,
  };
}

function explanation(steps: PublicExplanationStep[]): PublicExplanation {
  return { sessionId: 'sample-session', sourceRevision: '2', configurationRevision: '1', steps, referenceFlows: [] };
}

const failed = (steps: PublicExplanationStep[]) => ({ outcome: 'FAILED' as const, explanation: explanation(steps) });

describe('stoppedStepOf: the first step that is not completed, when something is proven', () => {
  it('names a step with a FAILED action that is not completed', () => {
    expect(stoppedStepOf(failed([step(1, true, [action('SUCCEEDED')]), step(2, false, [action('FAILED')])]))).toEqual({
      stepId: STEP(2),
      number: 2,
    });
  });

  it('names a step with an UNKNOWN_OUTCOME action that is not completed', () => {
    expect(stoppedStepOf(failed([step(1, true, [action('SUCCEEDED')]), step(2, false, [action('UNKNOWN_OUTCOME')])]))).toEqual({
      stepId: STEP(2),
      number: 2,
    });
  });

  it('the heading-test shape: step 1 completed, step 2 has no actions and is not completed, so step 2', () => {
    expect(stoppedStepOf(failed([step(1, true, [action('SUCCEEDED')]), step(2, false, [])]))).toEqual({
      stepId: STEP(2),
      number: 2,
    });
  });

  it('a completed step holding an excluded FAILED attempt-0 action is never named; the later uncompleted step is', () => {
    const drifted = step(2, true, [action('FAILED', 0), action('SUCCEEDED', 1)]);
    expect(stoppedStepOf(failed([step(1, true, [action('SUCCEEDED')]), drifted, step(3, false, [action('FAILED')])]))).toEqual({
      stepId: STEP(3),
      number: 3,
    });
  });

  it('the first uncompleted step wins over later ones, whatever their actions', () => {
    expect(
      stoppedStepOf(failed([step(1, true, [action('SUCCEEDED')]), step(2, false, []), step(3, false, [action('FAILED')])])),
    ).toEqual({ stepId: STEP(2), number: 2 });
  });

  it('reads in number order, not array order', () => {
    expect(
      stoppedStepOf(failed([step(3, false, [action('FAILED')]), step(1, true, [action('SUCCEEDED')]), step(2, false, [])])),
    ).toEqual({ stepId: STEP(2), number: 2 });
  });

  it('does not mutate the explanation it reads', () => {
    const input = failed([step(3, false, []), step(1, true, [action('SUCCEEDED')]), step(2, false, [])]);
    const before = structuredClone(input);
    stoppedStepOf(input);
    expect(input).toEqual(before);
  });
});

describe('stoppedStepOf: names nothing when nothing is proven', () => {
  it('every step is completed', () => {
    expect(stoppedStepOf(failed([step(1, true, [action('SUCCEEDED')]), step(2, true, [action('SUCCEEDED')])]))).toBeNull();
  });

  it('a completed step with a FAILED action is still not named', () => {
    expect(stoppedStepOf(failed([step(1, true, [action('FAILED', 0), action('SUCCEEDED', 1)])]))).toBeNull();
  });

  it('no steps', () => {
    expect(stoppedStepOf(failed([]))).toBeNull();
  });

  it('no step has an action: every step reads completed false, so step 1 would be a guess', () => {
    expect(stoppedStepOf(failed([step(1, false, []), step(2, false, []), step(3, false, [])]))).toBeNull();
  });
});

describe('stoppedStepOf: only a FAILED outcome names a step', () => {
  it.each([
    'SUCCEEDED',
    'PUBLICATION_CONFLICT',
    'UNKNOWN_OUTCOME',
    'CANCELLED',
    'EXPIRED',
    'PREPARING',
    'ACTING',
  ] as GuidedSessionState[])('%s names none even over a stopped-looking explanation', (outcome) => {
    expect(
      stoppedStepOf({
        outcome,
        explanation: explanation([step(1, true, [action('SUCCEEDED')]), step(2, false, [action('FAILED')])]),
      }),
    ).toBeNull();
  });
});
