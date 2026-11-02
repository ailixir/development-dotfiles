import type { TestDetailDto } from '@/types/studio/studioTypes';
import type { GuidedResult } from '@/types/studio/studioGuidedTypes';

/** The server's own view of the test, read from `GET`/`PUT /tests/{id}` (never the unsaved editor). */
export type PlanTest = Pick<
  TestDetailDto,
  'sourceRevision' | 'steps' | 'readiness' | 'readinessReason' | 'firstChangedStepId' | 'confirmedRevisionId'
>;

export type PlanResult = Pick<GuidedResult, 'outcome' | 'explanation' | 'publication' | 'currentReadiness'>;

/**
 * Round 067 D1a: the authored sentence per step, only where it provably equals what the run used.
 * Same `sourceRevision`: all steps. Otherwise, for the revision this run published and a
 * NEEDS_RELEARN draft: the steps before `firstChangedStepId`, which are unchanged by definition.
 */
export function planStepTexts(result: PlanResult, test?: PlanTest | null): ReadonlyMap<string, string> {
  const texts = new Map<string, string>();
  if (test === null || test === undefined) return texts;
  let eligible: PlanTest['steps'] = [];
  if (String(test.sourceRevision) === result.explanation.sourceRevision) {
    eligible = test.steps;
  } else if (
    result.publication.status === 'PUBLISHED' &&
    result.publication.receipt.revisionId === test.confirmedRevisionId &&
    test.readiness === 'NEEDS_RELEARN' &&
    test.firstChangedStepId !== null
  ) {
    const boundary = test.steps.findIndex((step) => step.id === test.firstChangedStepId);
    if (boundary >= 0) eligible = test.steps.slice(0, boundary);
  }
  for (const step of eligible) {
    if (step.text.trim() !== '') texts.set(step.id, step.text);
  }
  return texts;
}
