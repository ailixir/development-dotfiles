import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  GuidedLatestAttempt,
  PublicExplanation,
  PublicExplanationStep,
} from '@/types/studio/studioGuidedTypes';
import type { TestReadiness } from '@/types/studio/studioTypes';
import { formatRelativeTime } from '@/utils/time';
import {
  LAST_LEARNING_ATTEMPT_COPY,
  LastLearningAttemptNote,
  lastLearningAttemptLine,
} from './LastLearningAttemptNote';

/**
 * STUDIO-UNIFY-001.6 AC-04 (with the @po additions): the line shows for `UNLEARNED` and
 * `NEEDS_RELEARN` with a `FAILED` latest attempt; ", at step N" only when the attempt's
 * `explanation.sourceRevision` equals the test's `sourceRevision` and `stoppedStepOf` proves a step.
 */

const TEST_ID = '11111111-1111-1111-1111-111111111112';
const STARTED_AT = '2026-10-02T09:30:00Z';
const DATE = formatRelativeTime(STARTED_AT);

function step(number: number, completed: boolean): PublicExplanationStep {
  return {
    stepId: `00000000-0000-4000-8000-00000000000${number}`,
    number,
    completed,
    learnedFromThisRun: completed,
    reusedFrom: null,
    relearnedAfterDrift: false,
    actions: [
      {
        admissionId: `admission-${number}`,
        ordinal: 0,
        attemptOrdinal: 0,
        outcome: completed ? 'SUCCEEDED' : 'FAILED',
        referenceIds: [],
      },
    ],
  };
}

function explanation(sourceRevision: string, steps = [step(1, true), step(2, false)]): PublicExplanation {
  return { sessionId: 's-1', sourceRevision, configurationRevision: '1', steps, referenceFlows: [] };
}

function attempt(overrides: Partial<GuidedLatestAttempt> = {}): GuidedLatestAttempt {
  return {
    testId: TEST_ID,
    sessionId: 's-1',
    state: 'FAILED',
    startedAt: STARTED_AT,
    errorCode: 'TARGET_MISMATCH',
    explanation: explanation('5'),
    ...overrides,
  };
}

function show(readiness: TestReadiness, sourceRevision: number | string, value: GuidedLatestAttempt | null | undefined) {
  return render(
    <LastLearningAttemptNote testId={TEST_ID} readiness={readiness} sourceRevision={sourceRevision} attempt={value} />,
  );
}

const STEP_LINE = `Last learning attempt failed (${DATE}, at step 2)`;
const PLAIN_LINE = `Last learning attempt failed (${DATE})`;

describe('LastLearningAttemptNote', () => {
  it.each<TestReadiness>(['UNLEARNED', 'NEEDS_RELEARN'])(
    'shows the line with the stopped step for %s and a FAILED attempt of the same revision',
    (readiness) => {
      show(readiness, 5, attempt());
      expect(screen.getByTestId('last-learning-attempt')).toHaveTextContent(STEP_LINE);
    },
  );

  it('compares the revision as text: the test number 5 matches the explanation "5"', () => {
    show('UNLEARNED', '5', attempt());
    expect(screen.getByTestId('last-learning-attempt')).toHaveTextContent(STEP_LINE);
  });

  it('leaves the step out when the test was edited since (the revisions differ)', () => {
    show('UNLEARNED', 6, attempt());
    const note = screen.getByTestId('last-learning-attempt');
    expect(note.textContent).toBe(PLAIN_LINE);
  });

  it('leaves the step out when no step is proven (an explanation with no action)', () => {
    const bare = explanation('5', [step(1, false), step(2, false)].map((row) => ({ ...row, actions: [] })));
    show('UNLEARNED', 5, attempt({ explanation: bare }));
    expect(screen.getByTestId('last-learning-attempt').textContent).toBe(PLAIN_LINE);
  });

  it('shows the line without a step when the attempt carries no explanation', () => {
    show('NEEDS_RELEARN', 5, attempt({ explanation: null }));
    expect(screen.getByTestId('last-learning-attempt').textContent).toBe(PLAIN_LINE);
  });

  it.each<TestReadiness>(['READY', 'LEARNING'])('is absent for %s', (readiness) => {
    show(readiness, 5, attempt());
    expect(screen.queryByTestId('last-learning-attempt')).toBeNull();
  });

  it.each(['SUCCEEDED', 'CANCELLED', 'EXPIRED', 'UNKNOWN_OUTCOME', 'PUBLICATION_CONFLICT'] as const)(
    'is absent when the latest attempt is %s',
    (state) => {
      show('UNLEARNED', 5, attempt({ state, explanation: null }));
      expect(screen.queryByTestId('last-learning-attempt')).toBeNull();
    },
  );

  it.each([undefined, null])('is absent with no attempt (%s), as while the read loads or after it failed', (none) => {
    show('UNLEARNED', 5, none);
    expect(screen.queryByTestId('last-learning-attempt')).toBeNull();
  });

  it('is absent for an attempt that belongs to another test', () => {
    show('UNLEARNED', 5, attempt({ testId: 'a0000000-0000-4000-8000-000000000009' }));
    expect(screen.queryByTestId('last-learning-attempt')).toBeNull();
  });

  it('puts the exact instant in the title and names the test it is for', () => {
    show('UNLEARNED', 5, attempt());
    const note = screen.getByTestId('last-learning-attempt');
    expect(note.getAttribute('title')).toMatch(/2026/);
    expect(note).toHaveAttribute('data-learning-test-id', TEST_ID);
  });

  it('the line text comes from the exported copy, with the date and step filled in', () => {
    expect(LAST_LEARNING_ATTEMPT_COPY.failedAtStep).toContain('{date}');
    expect(LAST_LEARNING_ATTEMPT_COPY.failedAtStep).toContain('{n}');
    const line = lastLearningAttemptLine({ testId: TEST_ID, readiness: 'UNLEARNED', sourceRevision: 5, attempt: attempt() });
    expect(line).toEqual({ text: STEP_LINE, startedAt: STARTED_AT });
    expect(lastLearningAttemptLine({ testId: TEST_ID, readiness: 'READY', sourceRevision: 5, attempt: attempt() })).toBeNull();
  });
});
