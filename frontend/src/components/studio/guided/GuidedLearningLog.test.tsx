import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type {
  GuidedActionOutcome,
  GuidedResult,
  GuidedSessionState,
  PublicSession,
} from '@/types/studio/studioGuidedTypes';
import { publicSessionFor, receiptFor, resultFor, type GuidedStepRef } from '@/services/mocks/studio/guidedFixtures';
import { CANCELLED_NARRATIVE, guidedCopy } from './guidedNarratives';
import {
  GUIDED_ACTION_OUTCOME_WORDS,
  GUIDED_LEARNING_LOG_COPY,
  GuidedLearningLog,
  guidedLearningLogLines,
} from './GuidedLearningLog';

/**
 * STUDIO-UNIFY-001.6, task 6.3 (AC-03): the Logs tab for a learning run. A learning session has no
 * log stream, so the lines come from the poll's `counters` while it runs and from the result's
 * `explanation` actions after it ends. The replay console is the page's and is covered with the page
 * (`pageFraming.test.tsx`).
 */

const STEPS: GuidedStepRef[] = [
  { stepId: '00000000-0000-4000-8000-000000000001', text: 'Go to "https://shop.example.test/orders"' },
  { stepId: '00000000-0000-4000-8000-000000000002', text: 'Type "ada" in the "Name" field' },
  { stepId: '00000000-0000-4000-8000-000000000003', text: 'Check that the URL contains "orders"' },
];
const SESSION_ID = 'learning-log-session';
const TEST_ID = 'a0000000-0000-0000-0000-0000000000f1';

function session(
  state: GuidedSessionState,
  counters: Partial<PublicSession['counters']> = {},
): PublicSession {
  const base = publicSessionFor({
    sessionId: SESSION_ID,
    testId: TEST_ID,
    state,
    steps: STEPS,
    activeIndex: state === 'ACTING' ? 1 : null,
    reads: 1,
  });
  return { ...base, counters: { ...base.counters, ...counters } };
}

function result(
  outcome: GuidedSessionState,
  options: {
    completed?: number;
    failedIndex?: number | null;
    errorCode?: string | null;
    published?: boolean;
  } = {},
): GuidedResult {
  return resultFor({
    sessionId: SESSION_ID,
    executionId: SESSION_ID,
    outcome,
    publication: options.published
      ? { status: 'PUBLISHED', receipt: receiptFor(SESSION_ID, 1, null) }
      : { status: 'REFUSED', receipt: null },
    steps: STEPS,
    sourceRevision: '4',
    configurationRevision: '1',
    explanation: {
      completed: options.completed ?? 1,
      reusedBefore: 0,
      baseRevisionId: null,
      failedIndex: options.failedIndex === undefined ? 1 : options.failedIndex,
    },
    errorCode: options.errorCode ?? null,
    failure: null,
    detail: null,
    relearnedFrom: null,
    video: 'UNAVAILABLE',
    timedSteps: 0,
  });
}

const lineTexts = () =>
  within(screen.getByTestId('guided-learning-log'))
    .getAllByTestId('guided-learning-log-line')
    .map((line) => line.textContent);

describe('a session in progress (AC-03)', () => {
  it('says there is no live log and states the latest poll\'s counters, in one line each', () => {
    render(<GuidedLearningLog session={session('ACTING', { observations: 3, actions: 2 })} result={null} />);

    expect(lineTexts()).toEqual([
      'Learning has no live log. Progress is on the Proof tab.',
      'Studio has looked at the page 3 times and tried 2 actions so far.',
    ]);
    expect(screen.queryByText('No logs are available.')).toBeNull();
  });

  it('follows each poll: the counters line is rebuilt from the session it is given', () => {
    const view = render(<GuidedLearningLog session={session('ACTING', { observations: 1, actions: 0 })} result={null} />);
    expect(lineTexts()[1]).toBe('Studio has looked at the page 1 time and tried 0 actions so far.');

    view.rerender(<GuidedLearningLog session={session('ACTING', { observations: 4, actions: 1 })} result={null} />);
    expect(lineTexts()[1]).toBe('Studio has looked at the page 4 times and tried 1 action so far.');
  });

  it('a session that has ended but whose result is not read yet still reads as in progress, never as empty', () => {
    render(<GuidedLearningLog session={session('FAILED', { observations: 2, actions: 2 })} result={null} />);

    expect(lineTexts()).toEqual([
      GUIDED_LEARNING_LOG_COPY.noLiveLog,
      'Studio has looked at the page 2 times and tried 2 actions so far.',
    ]);
  });
});

describe('a session that has ended (AC-03)', () => {
  it('lists one line per action in step order, then how learning ended', () => {
    render(
      <GuidedLearningLog
        session={session('FAILED')}
        result={result('FAILED', { completed: 1, failedIndex: 1, errorCode: 'ASSERTION_FAILED' })}
      />,
    );

    expect(lineTexts()).toEqual([
      'Step 1: Ran the step — done',
      'Step 2: Ran the step — failed',
      `Learning ended: ${guidedCopy('assertionFailed')}`,
    ]);
  });

  it('a failure the narratives do not word gets the first sentence of the generic one, with no "shown below"', () => {
    render(
      <GuidedLearningLog
        session={session('FAILED')}
        result={result('FAILED', { completed: 1, failedIndex: 1, errorCode: 'TARGET_MISMATCH' })}
      />,
    );

    const generic = guidedCopy('failedUnnamed');
    expect(lineTexts().at(-1)).toBe(`Learning ended: ${generic.slice(0, generic.indexOf('. ') + 1)}`);
    expect(lineTexts().at(-1)).toBe('Learning ended: This run stopped.');
    expect(lineTexts().join(' ')).not.toContain('shown below');
  });

  it('puts the steps in number order whatever order the explanation arrives in', () => {
    const shuffled = result('FAILED', { completed: 2, failedIndex: 2 });
    shuffled.explanation.steps = [...shuffled.explanation.steps].reverse();
    render(<GuidedLearningLog session={session('FAILED')} result={shuffled} />);

    expect(lineTexts().slice(0, 3).map((line) => line?.slice(0, 7))).toEqual(['Step 1:', 'Step 2:', 'Step 3:']);
  });

  it('puts the attempts of one step in action order', () => {
    const twice = result('FAILED', { completed: 2, failedIndex: 2 });
    const [first] = twice.explanation.steps[0].actions;
    twice.explanation.steps[0].actions = [
      { ...first, ordinal: 1, attemptOrdinal: 0, admissionId: 'third' },
      { ...first, ordinal: 0, attemptOrdinal: 1, admissionId: 'second' },
      { ...first, ordinal: 0, attemptOrdinal: 0, admissionId: 'first' },
    ];
    render(<GuidedLearningLog session={session('FAILED')} result={twice} />);

    // The explanation names no operation, so the order shows only in the attempts of one step.
    expect(lineTexts().slice(0, 3).map((line) => line?.replace(/ — .*/u, ''))).toEqual([
      'Step 1: Ran the step',
      'Step 1: Ran the step',
      'Step 1: Ran the step',
    ]);
  });

  it.each(
    Object.entries(GUIDED_ACTION_OUTCOME_WORDS) as Array<[GuidedActionOutcome, string]>,
  )('says an action that is %s as "%s"', (outcome, word) => {
    const one = result('FAILED', { completed: 1, failedIndex: 1 });
    one.explanation.steps[0].actions[0].outcome = outcome;
    render(<GuidedLearningLog session={session('FAILED')} result={one} />);

    expect(lineTexts()[0]).toBe(`Step 1: Ran the step — ${word}`);
  });

  it('maps every action outcome of the contract to one of the four words', () => {
    expect(new Set(Object.values(GUIDED_ACTION_OUTCOME_WORDS))).toEqual(
      new Set(['done', 'failed', 'outcome unknown', 'not run']),
    );
    expect(Object.keys(GUIDED_ACTION_OUTCOME_WORDS).sort()).toEqual(
      ['ADMITTED', 'DISPATCHING', 'FAILED', 'REVOKED', 'SUCCEEDED', 'UNKNOWN_OUTCOME'],
    );
  });

  it('a result that proves no action has only the closing line', () => {
    render(
      <GuidedLearningLog
        session={session('FAILED')}
        result={result('FAILED', { completed: 0, failedIndex: null, errorCode: 'BUDGET_EXCEEDED' })}
      />,
    );

    expect(lineTexts()).toEqual([`Learning ended: ${guidedCopy('budgetExceeded')}`]);
  });

  it('a learn that succeeded ends with the learned sentence', () => {
    render(
      <GuidedLearningLog
        session={session('SUCCEEDED')}
        result={result('SUCCEEDED', { completed: 3, failedIndex: null, published: true })}
      />,
    );

    const lines = lineTexts();
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe(`Learning ended: ${guidedCopy('recordedReceipt').slice(0, guidedCopy('recordedReceipt').indexOf('. ') + 1)}`);
  });

  it('a stopped learn ends with the stop narrative\'s title', () => {
    render(
      <GuidedLearningLog
        session={session('CANCELLED')}
        result={result('CANCELLED', { completed: 1, failedIndex: null })}
      />,
    );

    expect(lineTexts().at(-1)).toBe(`Learning ended: ${CANCELLED_NARRATIVE.title}`);
  });

  it('a learn paused by "None of these" ends with the paused-for-edit title', () => {
    render(
      <GuidedLearningLog
        session={session('CANCELLED')}
        result={result('CANCELLED', { completed: 1, failedIndex: null })}
        pausedForEditStep={2}
      />,
    );

    expect(lineTexts().at(-1)).toBe(`Learning ended: ${guidedCopy('pausedForEditTitle', { N: 2 })}`);
  });

  it('carries no time: a line is its text and nothing else', () => {
    render(
      <GuidedLearningLog session={session('FAILED')} result={result('FAILED', { completed: 1, failedIndex: 1 })} />,
    );

    for (const line of within(screen.getByTestId('guided-learning-log')).getAllByTestId('guided-learning-log-line')) {
      expect(line.children).toHaveLength(1);
      expect(line.textContent).not.toMatch(/\d{1,2}:\d{2}/u);
    }
  });
});

describe('guidedLearningLogLines', () => {
  it('is the same list the component renders', () => {
    const ended = result('FAILED', { completed: 1, failedIndex: 1 });
    render(<GuidedLearningLog session={session('FAILED')} result={ended} />);

    expect(lineTexts()).toEqual(guidedLearningLogLines(session('FAILED'), ended));
  });
});
