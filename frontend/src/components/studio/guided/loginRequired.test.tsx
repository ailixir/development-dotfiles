import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'node:fs';
import path from 'node:path';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import type { GuidedResult } from '@/types/studio/studioGuidedTypes';
import { mockExecutions } from '@/services/mocks/studio/fixtures';
import {
  LoginRequiredNotice,
  guidedLoginNotice,
  loginNoticeFrom,
  loginNoticeSentences,
  replayLoginNotice,
  type LoginNotice,
} from './LoginRequiredNotice';

/**
 * STUDIO-OBS-008 lane L5a: "Blocked by login" (AC-4) and the one adapter of T0 ruling A1.6.
 *
 * The guided payload is the landed `contracts/v3/fixtures.json` `loginResult`. The replay payload is
 * an existing execution fixture with `replayFailure` set, because the replay field is keyed on
 * `replayFailure` and nothing else (A1.1).
 */

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const fixtures = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'docs/specs/studio-observed-authoring/contracts/v3/fixtures.json'), 'utf8'),
);
const loginResult = (): GuidedResult => structuredClone(fixtures.documents.loginResult) as GuidedResult;

/** The landed fixture's login step, placed third in a four-step draft. */
const PROTECTED = 'protected-step';
const DRAFT = ['s-1', 's-2', PROTECTED, 's-4'];

const replaySnapshot = (replayFailure: ExecutionSnapshot['replayFailure']): ExecutionSnapshot => ({
  ...structuredClone(mockExecutions[0]),
  replayFailure,
});

function renderNotice(notice: LoginNotice, draftStepIds: readonly string[] = DRAFT) {
  const onGoToStep = vi.fn();
  const onOpenVariables = vi.fn();
  render(
    <LoginRequiredNotice
      notice={notice}
      draftStepIds={draftStepIds}
      onGoToStep={onGoToStep}
      onOpenVariables={onOpenVariables}
    />,
  );
  return { onGoToStep, onOpenVariables, notice: screen.getByTestId('login-required-notice') };
}

describe('A1.6: one adapter, two sources', () => {
  it('loginNoticeFrom copies stepId and loginStepsPresent and nothing else', () => {
    const extra = { stepId: 'x', loginStepsPresent: true, stepIndex: 4, code: 'LOGIN_REQUIRED' };
    expect(loginNoticeFrom(extra)).toEqual({ stepId: 'x', loginStepsPresent: true });
  });

  it('guided: errorCode LOGIN_REQUIRED with its top-level detail (landed loginResult)', () => {
    expect(guidedLoginNotice(loginResult())).toEqual({ stepId: PROTECTED, loginStepsPresent: true });
  });

  it('guided: the typed failure carrier', () => {
    const result = loginResult();
    delete result.detail;
    result.failure = { code: 'LOGIN_REQUIRED', detail: { stepId: 's-2', loginStepsPresent: false } };
    expect(guidedLoginNotice(result)).toEqual({ stepId: 's-2', loginStepsPresent: false });
  });

  it('guided: any other result has no login notice', () => {
    const result = loginResult();
    delete result.detail;
    result.errorCode = 'ASSERTION_FAILED';
    result.failure = { code: 'ASSERTION_FAILED' };
    expect(guidedLoginNotice(result)).toBeNull();
  });

  it('replay: replayFailure LOGIN_REQUIRED, the same notice as guided', () => {
    const snapshot = replaySnapshot({ code: 'LOGIN_REQUIRED', stepId: PROTECTED, stepIndex: 2, loginStepsPresent: true });
    expect(replayLoginNotice(snapshot)).toEqual(guidedLoginNotice(loginResult()));
  });

  it('replay: TARGET_DRIFT, null and absent replayFailure give no login notice', () => {
    expect(replayLoginNotice(replaySnapshot({ code: 'TARGET_DRIFT', stepId: PROTECTED, stepIndex: 2 }))).toBeNull();
    expect(replayLoginNotice(replaySnapshot(null))).toBeNull();
    expect(replayLoginNotice(replaySnapshot(undefined))).toBeNull();
  });

  it('replay negative control: login words in status, errorCode, messages or logs are never parsed', () => {
    const snapshot = replaySnapshot(null);
    snapshot.status = 'FAILED';
    snapshot.stepResults = snapshot.stepResults.map((step) => ({ ...step, message: 'LOGIN_REQUIRED' }));
    snapshot.logs = [{ at: null, level: 'ERROR', message: 'runnerErrorCode=LOGIN_REQUIRED' }];
    expect(replayLoginNotice(snapshot)).toBeNull();
  });
});

describe('AC-4: both variants, both actions', () => {
  it('loginStepsPresent false: "This page asks you to sign in. Add login steps before step N …"', () => {
    const { notice } = renderNotice({ stepId: PROTECTED, loginStepsPresent: false });
    expect(notice).toHaveAttribute('data-variant', 'no-login-steps');
    expect(notice).toHaveTextContent(
      'This page asks you to sign in. Add login steps before step 3 using your secrets (<secret NAME>), then Run again',
    );
    // The reference syntax is shown as code, as the AC writes it, and not as markup.
    expect(notice.querySelector('code')).toHaveTextContent('<secret NAME>');
  });

  it('loginStepsPresent true: "Your login steps did not sign you in; check the secret and the steps before step N"', () => {
    const { notice } = renderNotice({ stepId: PROTECTED, loginStepsPresent: true });
    expect(notice).toHaveAttribute('data-variant', 'login-steps-failed');
    expect(notice).toHaveTextContent('Your login steps did not sign you in; check the secret and the steps before step 3');
  });

  it('"Go to step N" hands back the stable step ID; "Open Variables" opens the dialog', async () => {
    const { onGoToStep, onOpenVariables } = renderNotice({ stepId: PROTECTED, loginStepsPresent: false });
    await userEvent.click(screen.getByRole('button', { name: 'Go to step 3' }));
    expect(onGoToStep).toHaveBeenCalledTimes(1);
    expect(onGoToStep).toHaveBeenCalledWith(PROTECTED);
    await userEvent.click(screen.getByRole('button', { name: 'Open Variables' }));
    expect(onOpenVariables).toHaveBeenCalledTimes(1);
  });

  it('N is the position in the current draft, so a reorder moves it', () => {
    renderNotice({ stepId: PROTECTED, loginStepsPresent: true }, [PROTECTED, 's-1']);
    expect(screen.getByRole('button', { name: 'Go to step 1' })).toBeInTheDocument();
  });
});

describe('A1.6: the step-less variant, for a step no longer in the draft', () => {
  it.each([false, true])('loginStepsPresent %s: no "Go to step", "Open Variables" stays, and the reason is stated', async (present) => {
    const { onOpenVariables, notice } = renderNotice({ stepId: 'deleted-step', loginStepsPresent: present }, DRAFT);
    expect(notice).toHaveAttribute('data-step-number', 'none');
    expect(screen.queryByRole('button', { name: /go to step/iu })).toBeNull();
    expect(notice).not.toHaveTextContent(/before step/iu);
    expect(notice).toHaveTextContent('The step where this happened is no longer in your steps.');
    await userEvent.click(screen.getByRole('button', { name: 'Open Variables' }));
    expect(onOpenVariables).toHaveBeenCalledTimes(1);
  });

  it('the step-less sentences', () => {
    expect(loginNoticeSentences({ stepId: 'x', loginStepsPresent: false }, null)[0]).toBe(
      'This page asks you to sign in. Add login steps using your secrets (`<secret NAME>`), then Run again',
    );
    expect(loginNoticeSentences({ stepId: 'x', loginStepsPresent: true }, null)[0]).toBe(
      'Your login steps did not sign you in; check the secret and your login steps',
    );
  });
});

describe('narrow layout (AC-8 a)', () => {
  it('the two actions stack and fill the width at the base (narrow) breakpoint', () => {
    renderNotice({ stepId: PROTECTED, loginStepsPresent: false });
    const actions = screen.getByTestId('login-required-actions');
    expect(getComputedStyle(actions).flexDirection).toBe('column');
    expect(getComputedStyle(screen.getByRole('button', { name: 'Open Variables' })).width).toBe('100%');
  });
});
