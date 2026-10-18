import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExecutionSnapshot, TestDetailDto } from '@/types/studio/studioTypes';
import {
  loginRequiredLoginStepsFailedExecution,
  loginRequiredNoLoginStepsExecution,
  targetDriftExecution,
} from '@/services/mocks/studio/executionFixtures';
import { fixtureStepId } from '@/services/mocks/studio/authoringState';
import { GUIDED_COPY } from '@/components/studio/guided/guidedNarratives';
import { ExecutionProgressView, UNNAMED_ERROR_STATEMENT, type ReplayFailureContext } from './ExecutionProgressView';
import { learnAgainOffered, replayFailureNarrative } from './executionErrorNarratives';

/**
 * STUDIO-OBS-008 T0 ruling A1.6, the replay half of AC-3 and AC-4, at the component the Studio page
 * renders every replay snapshot with (`ExecutionProgressView`).
 *
 * The snapshots are the three landed document examples (`executionFixtures.ts`, equal field for field
 * to the `getExecution` examples in `openapi.yaml`), varied one field at a time. The draft is the
 * fixture draft whose stable IDs are `fixtureStepId(0..3)`, so `replayFailure.stepId` (`…0002`,
 * `…0003`) lands at a known position.
 *
 * The seven A1.6 cases: (1) login, both variants, both actions; (2) a deleted step, so no "Go to
 * step"; (3) drift on READY with the matching revision offers "Learn again" and hands back exactly
 * that step and revision; (4) a superseded revision or NEEDS_RELEARN offers no action; (5) the
 * negative control: TARGET_DRIFT in a step message with `replayFailure: null` shows no drift copy;
 * (6) a snapshot without the field shows the generic narrative; (7) "Seek to step N" uses the existing
 * replay seek. The page-level flows (the start body and key, focus) are in
 * `pages/ChecksStudioPage/pageReplayFailure.test.tsx`.
 */

const DRAFT_STEP_IDS = [fixtureStepId(0), fixtureStepId(1), fixtureStepId(2), fixtureStepId(3)];
const CONFIRMED = '22222222-2222-2222-2222-222222222222';
const READY_TEST: Pick<TestDetailDto, 'readiness' | 'confirmedRevisionId'> = {
  readiness: 'READY',
  confirmedRevisionId: CONFIRMED,
};

function context(overrides: Partial<ReplayFailureContext> = {}): ReplayFailureContext {
  return {
    draftStepIds: DRAFT_STEP_IDS,
    test: READY_TEST,
    onGoToStep: vi.fn(),
    onOpenVariables: vi.fn(),
    onLearnAgain: vi.fn(),
    ...overrides,
  };
}

function renderSnapshot(
  snapshot: ExecutionSnapshot,
  replayContext?: ReplayFailureContext,
  onSeekStep?: (offsetMs: number) => void,
) {
  return render(
    <ExecutionProgressView
      snapshot={snapshot}
      showLogs={false}
      replayContext={replayContext}
      onSeekStep={onSeekStep}
    />,
  );
}

describe('A1.6 precedence: replayFailure selects the narrative before status and errorCode', () => {
  it('reads one field: a named cause wins, null and absent give no replay narrative', () => {
    expect(replayFailureNarrative(targetDriftExecution)?.kind).toBe('drift');
    expect(replayFailureNarrative(loginRequiredNoLoginStepsExecution)?.kind).toBe('login');
    expect(replayFailureNarrative({ replayFailure: null })).toBeNull();
    expect(replayFailureNarrative({})).toBeNull();
  });

  it('drift arrives as status ERROR with no errorCode, and still reads as drift, never as the unnamed error', () => {
    renderSnapshot(targetDriftExecution, context());
    expect(screen.getByTestId('replay-drift')).toHaveTextContent('Step 2 no longer matches the page…');
    expect(screen.queryByText(UNNAMED_ERROR_STATEMENT)).toBeNull();
    expect(screen.queryByTestId('execution-error-unnamed')).toBeNull();
  });
});

describe('A1.6 case 1: replay login, both variants, both actions', () => {
  it('loginStepsPresent false: the no-login-steps sentence at step N, "Go to step N" hands back the step ID, "Open Variables" opens the dialog', async () => {
    const ctx = context();
    renderSnapshot(loginRequiredNoLoginStepsExecution, ctx);
    const notice = screen.getByTestId('login-required-notice');
    expect(notice).toHaveAttribute('data-variant', 'no-login-steps');
    expect(notice.textContent).toContain(
      'This page asks you to sign in. Add login steps before step 2 using your secrets (<secret NAME>), then Run again',
    );
    await userEvent.click(within(notice).getByRole('button', { name: 'Go to step 2' }));
    await userEvent.click(within(notice).getByRole('button', { name: 'Open Variables' }));
    expect(ctx.onGoToStep).toHaveBeenCalledWith(fixtureStepId(1));
    expect(ctx.onOpenVariables).toHaveBeenCalledTimes(1);
  });

  it('loginStepsPresent true: the login-steps-failed sentence at step N, with the same two actions', async () => {
    const ctx = context();
    renderSnapshot(loginRequiredLoginStepsFailedExecution, ctx);
    const notice = screen.getByTestId('login-required-notice');
    expect(notice).toHaveAttribute('data-variant', 'login-steps-failed');
    expect(notice.textContent).toContain(
      'Your login steps did not sign you in; check the secret and the steps before step 3',
    );
    await userEvent.click(within(notice).getByRole('button', { name: 'Go to step 3' }));
    await userEvent.click(within(notice).getByRole('button', { name: 'Open Variables' }));
    expect(ctx.onGoToStep).toHaveBeenCalledWith(fixtureStepId(2));
    expect(ctx.onOpenVariables).toHaveBeenCalledTimes(1);
  });
});

describe('A1.6 case 2: a login step no longer in the draft', () => {
  it('omits "Go to step N", keeps "Open Variables", and uses the step-less wording', () => {
    renderSnapshot(
      loginRequiredNoLoginStepsExecution,
      context({ draftStepIds: [fixtureStepId(0), fixtureStepId(2), fixtureStepId(3)] }),
    );
    const notice = screen.getByTestId('login-required-notice');
    expect(within(notice).queryByRole('button', { name: /Go to step/ })).toBeNull();
    expect(within(notice).getByRole('button', { name: 'Open Variables' })).toBeInTheDocument();
    expect(notice.textContent).toContain('The step where this happened is no longer in your steps.');
  });
});

describe('A1.6 case 3: drift on READY with the matching revision offers "Learn again from step N"', () => {
  it('offers it, and hands back exactly the drifted step and the replayed revision', async () => {
    const ctx = context();
    renderSnapshot(targetDriftExecution, ctx);
    await userEvent.click(screen.getByRole('button', { name: 'Learn again from step 2' }));
    expect(ctx.onLearnAgain).toHaveBeenCalledTimes(1);
    expect(ctx.onLearnAgain).toHaveBeenCalledWith(fixtureStepId(1), CONFIRMED);
  });
});

describe('A1.6 case 4: no "Learn again" outside the A1 conditions', () => {
  it.each([
    ['the test needs relearning', { readiness: 'NEEDS_RELEARN', confirmedRevisionId: CONFIRMED }, DRAFT_STEP_IDS],
    ['the replayed revision was superseded', { readiness: 'READY', confirmedRevisionId: '33333333-3333-3333-3333-333333333333' }, DRAFT_STEP_IDS],
    ['the drifted step is no longer in the draft', READY_TEST, [fixtureStepId(0), fixtureStepId(2)]],
  ] as const)('%s: the drift sentence stands alone', (_case, test, draftStepIds) => {
    const ctx = context({ test: test as ReplayFailureContext['test'], draftStepIds });
    renderSnapshot(targetDriftExecution, ctx);
    expect(screen.getByTestId('replay-drift')).toHaveTextContent(/no longer matches the page…/);
    expect(screen.queryByRole('button', { name: /Learn again/ })).toBeNull();
    expect(learnAgainOffered(ctx.test, targetDriftExecution, ctx.draftStepIds)).toBe(false);
  });

  it('the drifted step is no longer in the draft: the run\'s numbering is kept and the sentence says the step is gone (W5 UX-07)', () => {
    const gone = [fixtureStepId(0), fixtureStepId(2)];
    const { unmount } = renderSnapshot(targetDriftExecution, context({ draftStepIds: gone }));
    expect(screen.getByTestId('replay-drift')).toHaveTextContent('Step 2 no longer matches the page…');
    expect(screen.getByTestId('replay-drift-step-gone')).toHaveTextContent(GUIDED_COPY.loginStepGone.template);
    unmount();

    // The step is in the draft: the editor's step N is the run's step N, so nothing is added.
    const present = renderSnapshot(targetDriftExecution, context());
    expect(screen.queryByTestId('replay-drift-step-gone')).toBeNull();
    present.unmount();

    // No editor (the runs drawer): the snapshot's numbering is the only one, so nothing is added.
    renderSnapshot(targetDriftExecution);
    expect(screen.queryByTestId('replay-drift-step-gone')).toBeNull();
  });

  it('a surface without an editor (the runs drawer) words the cause with the snapshot numbering and offers no action', () => {
    renderSnapshot(targetDriftExecution);
    expect(screen.getByTestId('replay-drift')).toHaveTextContent('Step 2 no longer matches the page…');
    expect(screen.queryByRole('button', { name: /Learn again|Go to step|Open Variables/ })).toBeNull();
    renderSnapshot(loginRequiredNoLoginStepsExecution);
    expect(screen.getAllByTestId('replay-failure')[1].textContent).toContain('Add login steps before step 2');
  });
});

describe('A1.6 case 5: the negative control, nothing is parsed from text', () => {
  it('an ERROR snapshot whose step message says TARGET_DRIFT, with replayFailure null, shows no drift copy', () => {
    const textOnly: ExecutionSnapshot = { ...targetDriftExecution, replayFailure: null };
    expect(textOnly.stepResults.some((step) => step.message === 'TARGET_DRIFT')).toBe(true);
    renderSnapshot(textOnly, context());
    expect(document.body.textContent).not.toMatch(/no longer matches the page/);
    expect(screen.queryByRole('button', { name: /Learn again/ })).toBeNull();
    expect(screen.getByTestId('execution-error-unnamed')).toHaveTextContent(UNNAMED_ERROR_STATEMENT);
  });

  it('a FAILED snapshot whose step message says LOGIN_REQUIRED, with replayFailure null, shows no login notice', () => {
    renderSnapshot({ ...loginRequiredNoLoginStepsExecution, replayFailure: null }, context());
    expect(screen.queryByTestId('login-required-notice')).toBeNull();
    expect(document.body.textContent).not.toMatch(/asks you to sign in/);
  });
});

describe('A1.6 case 6: a snapshot without the field shows the generic narrative', () => {
  it('no replayFailure key at all: the existing unnamed-error narrative, unchanged', () => {
    const absent: ExecutionSnapshot = { ...targetDriftExecution };
    delete absent.replayFailure;
    renderSnapshot(absent, context());
    expect(screen.getByTestId('execution-error-unnamed')).toHaveTextContent(UNNAMED_ERROR_STATEMENT);
    expect(screen.queryByTestId('replay-failure')).toBeNull();
  });
});

describe('A1.6 case 7: "Seek to step N" uses the existing replay seek', () => {
  it('seeks to the failing step’s own offsetMs through onSeekStep, and only with an available recording', async () => {
    const onSeekStep = vi.fn();
    const view = renderSnapshot(targetDriftExecution, context(), onSeekStep);
    await userEvent.click(screen.getByTestId('replay-failure-seek'));
    expect(screen.getByTestId('replay-failure-seek')).toHaveTextContent('Seek to step 2');
    expect(onSeekStep).toHaveBeenCalledWith(1610);
    view.unmount();

    renderSnapshot(
      { ...targetDriftExecution, video: { status: 'UNAVAILABLE', error: null, expiresAt: null, partial: false }, videoPath: null },
      context(),
      onSeekStep,
    );
    expect(screen.queryByTestId('replay-failure-seek')).toBeNull();
  });
});
