import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'node:fs';
import path from 'node:path';
import type {
  GuidedActiveStep,
  GuidedChoice,
  GuidedClarification as GuidedClarificationQuestion,
  GuidedResult,
  GuidedStartRefusal,
  PublicSession,
} from '@/types/studio/studioGuidedTypes';
import type { TestDetailDto } from '@/types/studio/studioTypes';
import { EXECUTION_ERROR_NARRATIVES } from '@/components/studio/run/executionErrorNarratives';
import {
  EXECUTE_CONFLICT_NARRATIVES,
  EXECUTE_FORBIDDEN_NARRATIVE,
  UNDECLARED_EXECUTE_REFUSAL,
} from '@/components/studio/run/executeRefusals';
import { LEARNED_READY_LABEL } from '@/components/studio/run/runEnablement';
import {
  GUIDED_COPY,
  copyTokens,
  fillCopy,
  guidedCopy,
  type GuidedCopy,
} from './guidedNarratives';
import { GuidedRunStatus, guidedRunStatusLines } from './GuidedRunStatus';
import { ReadinessChip, readinessChipLabel } from './ReadinessChip';
import {
  GuidedCompletion,
  GuidedStartFeedback,
  guidedCompletionView,
  guidedStartFeedbackView,
} from './GuidedCompletion';
import { GuidedClarification } from './GuidedClarification';
import { PlanExplanation } from './PlanExplanation';
import { VideoEvidencePanel } from '@/components/studio/evidence/VideoEvidencePanel';
import { GuidedSeekControls } from '@/components/studio/evidence/GuidedSeekControls';

/**
 * STUDIO-OBS-008 lane L5a: the copy table, the Run status, the readiness chip, the completion
 * narratives and the start feedback (AC-3, AC-4, AC-6; D-3, D-4, D-5, D-11; rulings A2, A3; P4).
 *
 * Payloads are the landed v3 contract documents (`contracts/v3/fixtures.json`,
 * `publication-fixtures.json`), read from disk and varied field by field.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const V3 = path.join(REPO_ROOT, 'docs/specs/studio-observed-authoring/contracts/v3');
const fixtures = JSON.parse(fs.readFileSync(path.join(V3, 'fixtures.json'), 'utf8'));
const publicationFixtures = JSON.parse(fs.readFileSync(path.join(V3, 'publication-fixtures.json'), 'utf8'));

const clone = <T,>(value: T): T => structuredClone(value);

/** `publication-fixtures.json` positive[0]: SUCCEEDED, PUBLISHED, currentReadiness HEAD_CHANGED. */
const publishedResult = (): GuidedResult => clone(publicationFixtures.positive[0].value) as GuidedResult;
/** `fixtures.json` documents.loginResult: FAILED, errorCode LOGIN_REQUIRED, top-level detail. */
const loginResult = (): GuidedResult => clone(fixtures.documents.loginResult) as GuidedResult;
/** `fixtures.json` documents.publicSessionPreparing. */
const preparingSession = (): PublicSession => clone(fixtures.documents.publicSessionPreparing) as PublicSession;
/** Incremental result case by name (`publication-fixtures.json` incrementalContracts.resultCases). */
const incrementalCase = (name: string): GuidedResult => {
  const found = publicationFixtures.incrementalContracts.resultCases.find(
    (entry: { name: string }) => entry.name === name,
  );
  if (!found) throw new Error(`no incremental case ${name}`);
  return clone(found.value) as GuidedResult;
};

const STEP = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const DRAFT = [STEP(1), STEP(2), STEP(3), STEP(4)];

const STRUCK_SECRET_FILL_COPY = 'Secrets can only be typed into a password box.';

/** A failed result with the given code on the typed carrier (and the matching errorCode). */
function failedWith(code: string): GuidedResult {
  const result = loginResult();
  delete result.detail;
  result.errorCode = code;
  result.failure = { code } as GuidedResult['failure'];
  return result;
}

const noop = () => undefined;

function renderCompletion(result: GuidedResult, extra: Partial<{ firstLearnStepId: string }> = {}) {
  return render(
    <GuidedCompletion
      input={{ kind: 'guided', result, firstLearnStepId: extra.firstLearnStepId ?? null }}
      draftStepIds={DRAFT}
      onGoToStep={noop}
      onOpenVariables={noop}
    />,
  );
}

// ---------------------------------------------------------------------------------------------
// Copy table
// ---------------------------------------------------------------------------------------------

/** Every string value anywhere in a parsed JSON document. */
function jsonStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => jsonStrings(item, out));
  else if (value !== null && typeof value === 'object') Object.values(value).forEach((item) => jsonStrings(item, out));
  return out;
}

function sourceContains(file: string, quote: string): boolean {
  const text = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
  if (file.endsWith('.json')) {
    return jsonStrings(JSON.parse(text)).some((value) => value.includes(quote));
  }
  return text.includes(quote);
}

const ENTRIES = Object.entries(GUIDED_COPY) as Array<[string, GuidedCopy]>;

describe('copy table: every guided string traces to a quoted source', () => {
  it.each(ENTRIES)('%s: its quote is in the cited file', (_key, entry) => {
    expect(sourceContains(entry.source.file, entry.source.quote), `${entry.source.file}: ${entry.source.quote}`).toBe(true);
  });

  it.each(ENTRIES.filter(([, entry]) => entry.basis === 'verbatim'))(
    '%s: verbatim, so the template without its braces is the quote',
    (_key, entry) => {
      expect(entry.template.replace(/\{([^{}]+)\}/gu, '$1')).toBe(entry.source.quote);
    },
  );

  it.each(ENTRIES.filter(([, entry]) => entry.basis !== 'verbatim'))(
    '%s: adapted or delegated, so the change or the delegation is stated',
    (_key, entry) => {
      expect(entry.note ?? '').not.toBe('');
    },
  );

  it.each(ENTRIES.filter(([, entry]) => entry.basis === 'delegated'))(
    '%s: delegated, so the fact it states is quoted from its own source',
    (_key, entry) => {
      expect(entry.facts).toBeDefined();
      expect(sourceContains(entry.facts!.file, entry.facts!.quote), `${entry.facts!.file}: ${entry.facts!.quote}`).toBe(true);
    },
  );

  it('A2: the struck secret-fill copy is absent from guidedNarratives.ts and from every entry', () => {
    const source = fs.readFileSync(path.join(__dirname, 'guidedNarratives.ts'), 'utf8');
    expect(source).not.toContain(STRUCK_SECRET_FILL_COPY);
    expect(source.toLowerCase()).not.toContain('password box');
    for (const [, entry] of ENTRIES) {
      expect(entry.template).not.toContain(STRUCK_SECRET_FILL_COPY);
    }
  });

  it('no entry offers sign-in, account choice, selectors, capture tokens or DOM upload (AC-3)', () => {
    for (const [key, entry] of ENTRIES) {
      expect(entry.template, key).not.toMatch(/\b(sign in with|account|selector|capture token|upload|DOM)\b/iu);
    }
  });

  it('a token without a value throws instead of rendering a hole', () => {
    expect(copyTokens(GUIDED_COPY.running.template)).toEqual(['N', 'M']);
    expect(() => fillCopy(GUIDED_COPY.running.template, { N: 2 })).toThrow(/\{M\}/u);
    expect(fillCopy(GUIDED_COPY.running.template, { N: 2, M: 5 })).toBe('Running step 2 of 5.');
  });
});

// ---------------------------------------------------------------------------------------------
// Run status (AC-3, P2)
// ---------------------------------------------------------------------------------------------

function session(overrides: Partial<PublicSession>): PublicSession {
  return { ...preparingSession(), ...overrides };
}

describe('GuidedRunStatus: N, M and k come only from the server (AC-3, P2)', () => {
  it('PREPARING says "Preparing your steps."', () => {
    render(<GuidedRunStatus session={preparingSession()} draftStepIds={DRAFT} />);
    expect(screen.getByTestId('guided-run-status-line')).toHaveTextContent('Preparing your steps.');
  });

  it.each(['OBSERVING', 'PROPOSING'] as const)('%s is the merged "Understanding this page — step N of M."', (state) => {
    const s = session({ state, progress: { stepCount: 4, activeStep: { stepId: STEP(2), number: 2, text: 'Open the cart' } } });
    render(<GuidedRunStatus session={s} draftStepIds={DRAFT} />);
    expect(screen.getByTestId('guided-run-status-line')).toHaveTextContent('Understanding this page — step 2 of 4.');
  });

  it('ACTING says "Running step N of M." from progress, not from the editor', () => {
    // The draft has 4 steps; the server's frozen source has 7. M is the server's.
    const s = session({ state: 'ACTING', progress: { stepCount: 7, activeStep: { stepId: STEP(3), number: 3, text: 'x' } } });
    render(<GuidedRunStatus session={s} draftStepIds={DRAFT} />);
    expect(screen.getByTestId('guided-run-status-line')).toHaveTextContent('Running step 3 of 7.');
  });

  it('without an active step, observing says "Understanding this page." and acting names no step', () => {
    expect(guidedRunStatusLines(session({ state: 'OBSERVING', progress: { stepCount: 3, activeStep: null } }), DRAFT).primary).toBe(
      'Understanding this page.',
    );
    expect(guidedRunStatusLines(session({ state: 'ACTING', progress: { stepCount: 3, activeStep: null } }), DRAFT).primary).toBeNull();
  });

  it('REPLAYING_PREFIX says "Repeating saved steps 1–(k-1)…", then learning says "Learning from step k"', () => {
    const prefix = session({
      state: 'REPLAYING_PREFIX',
      baseRevisionId: '00000000-0000-4000-8000-000000000901',
      firstLearnStepId: STEP(3),
      progress: { stepCount: 4, activeStep: { stepId: STEP(1), number: 1, text: 'x' } },
    });
    const { rerender } = render(<GuidedRunStatus session={prefix} draftStepIds={DRAFT} />);
    expect(screen.getByTestId('guided-run-status-line')).toHaveTextContent('Repeating saved steps 1–2…');
    expect(screen.queryByTestId('guided-run-status-learning-from')).toBeNull();

    const learning = { ...prefix, state: 'OBSERVING' as const, progress: { stepCount: 4, activeStep: { stepId: STEP(3), number: 3, text: 'x' } } };
    rerender(<GuidedRunStatus session={learning} draftStepIds={DRAFT} />);
    expect(screen.getByTestId('guided-run-status-line')).toHaveTextContent('Understanding this page — step 3 of 4.');
    expect(screen.getByTestId('guided-run-status-learning-from')).toHaveTextContent('Learning from step 3');
  });

  it('a learning step before k (a drift switch) does not claim "Learning from step k"', () => {
    const drifted = session({
      state: 'OBSERVING',
      firstLearnStepId: STEP(3),
      progress: { stepCount: 4, activeStep: { stepId: STEP(2), number: 2, text: 'x' } },
    });
    expect(guidedRunStatusLines(drifted, DRAFT).learningFrom).toBeNull();
  });

  it('a first-learn step missing from the draft drops the range rather than guessing it', () => {
    const s = session({ state: 'REPLAYING_PREFIX', firstLearnStepId: 'not-in-draft', progress: { stepCount: 4, activeStep: null } });
    expect(guidedRunStatusLines(s, DRAFT).primary).toBe('Repeating saved steps…');
  });

  it('FINALIZING says "Saving what this run learned…"; clarification and terminal states render nothing here', () => {
    expect(guidedRunStatusLines(session({ state: 'FINALIZING', progress: { stepCount: 2, activeStep: null } }), DRAFT).primary).toBe(
      'Saving what this run learned…',
    );
    for (const state of ['AWAITING_CLARIFICATION', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'UNKNOWN_OUTCOME', 'PUBLICATION_CONFLICT'] as const) {
      const { container, unmount } = render(
        <GuidedRunStatus session={session({ state, progress: { stepCount: 2, activeStep: null } })} draftStepIds={DRAFT} />,
      );
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Readiness chip (AC-3, D-4)
// ---------------------------------------------------------------------------------------------

type ChipTest = Pick<TestDetailDto, 'readiness' | 'firstChangedStepId' | 'readinessReason'>;

describe('ReadinessChip (AC-3, D-4)', () => {
  it('READY reuses "Learned · ready to repeat"', () => {
    render(<ReadinessChip test={{ readiness: 'READY', firstChangedStepId: null }} draftStepIds={DRAFT} />);
    expect(screen.getByTestId('guided-readiness-chip')).toHaveTextContent(LEARNED_READY_LABEL);
  });

  it('NEEDS_RELEARN says "Steps changed — next Run learns from step k" with k from firstChangedStepId', () => {
    render(<ReadinessChip test={{ readiness: 'NEEDS_RELEARN', firstChangedStepId: STEP(4) }} draftStepIds={DRAFT} />);
    expect(screen.getByTestId('guided-readiness-chip')).toHaveTextContent('Steps changed — next Run learns from step 4');
  });

  it('BASE_IDENTITY_INCOMPLETE learns from step 1 and never says the author changed steps', () => {
    const test: ChipTest = { readiness: 'NEEDS_RELEARN', firstChangedStepId: STEP(3), readinessReason: 'BASE_IDENTITY_INCOMPLETE' };
    const label = readinessChipLabel(test, DRAFT);
    expect(label).toBe('Saved learning cannot be reused — next Run learns from step 1');
    expect(label).not.toMatch(/changed/iu);
  });

  it('UNLEARNED and LEARNING have no chip; an unknown boundary drops the k clause', () => {
    expect(readinessChipLabel({ readiness: 'UNLEARNED', firstChangedStepId: null }, DRAFT)).toBeNull();
    expect(readinessChipLabel({ readiness: 'LEARNING', firstChangedStepId: null }, DRAFT)).toBeNull();
    expect(readinessChipLabel({ readiness: 'NEEDS_RELEARN', firstChangedStepId: 'gone' }, DRAFT)).toBe('Steps changed');
  });
});

// ---------------------------------------------------------------------------------------------
// Completion (AC-3, AC-4, AC-6; A2, A3; inherited 014-a)
// ---------------------------------------------------------------------------------------------

describe('GuidedCompletion: success comes from the learned receipt (AC-3, AC-6)', () => {
  it('SUCCEEDED + PUBLISHED with no relearnedFrom: "Completed — learned from this run."', () => {
    renderCompletion(publishedResult());
    expect(screen.getByTestId('guided-completion')).toHaveTextContent('Completed — learned from this run.');
  });

  it('partial: "Completed — steps k–n learned again." from relearnedFrom (BOUNDARY)', () => {
    const result = publishedResult();
    result.relearnedFrom = { stepId: STEP(2) };
    renderCompletion(result);
    // W5 UX-09: a range of one step is worded as one step, not "steps 2–2".
    expect(screen.getByTestId('guided-completion')).toHaveTextContent('Completed — step 2 learned again.');
    expect(screen.getByTestId('guided-completion')).not.toHaveTextContent('2–2');
  });

  it('after a prefix drift: the learned range, then "steps j… were re-learned because the page changed"', () => {
    // publication-fixtures `source-plan-failure-after-drift-retains-j`: initial k = step 3, drift at j = step 2.
    const drifted = incrementalCase('source-plan-failure-after-drift-retains-j');
    const result = publishedResult();
    result.explanation = drifted.explanation;
    result.progress = drifted.progress;
    result.relearnedFrom = drifted.relearnedFrom;
    expect(result.relearnedFrom).toEqual({ stepId: STEP(2), driftSwitchStepId: STEP(2) });

    const n = result.progress.stepCount;
    expect(guidedCompletionView(result, STEP(3))).toEqual({
      kind: 'succeeded',
      lines: [`Completed — steps 2–${n} learned again.`, 'Step 2 was re-learned because the page changed.'],
    });
    // Without the session's original k, "j…" is filled as the AC writes it.
    expect(guidedCompletionView(result, null)).toEqual({
      kind: 'succeeded',
      lines: [`Completed — steps 2–${n} learned again.`, 'Steps 2… were re-learned because the page changed.'],
    });
  });

  it('SUCCEEDED but publication PENDING is never shown as success', () => {
    const result = publishedResult();
    result.publication = { status: 'PENDING', receipt: null };
    renderCompletion(result);
    const completion = screen.getByTestId('guided-completion');
    expect(completion).toHaveTextContent('Saving what this run learned…');
    expect(completion).not.toHaveTextContent('Completed');
  });

  it('PUBLICATION_CONFLICT, and SUCCEEDED with a refused publication: "Run completed; steps not ready to repeat."', () => {
    const conflict = loginResult();
    delete conflict.detail;
    conflict.errorCode = null;
    conflict.outcome = 'PUBLICATION_CONFLICT';
    expect(guidedCompletionView(conflict)).toEqual({ kind: 'notReady', lines: ['Run completed; steps not ready to repeat.'] });
    const refused = publishedResult();
    refused.publication = { status: 'REFUSED', receipt: null };
    expect(guidedCompletionView(refused)).toEqual({ kind: 'notReady', lines: ['Run completed; steps not ready to repeat.'] });
  });

  it('UNKNOWN_OUTCOME: "Stopped — submission outcome unknown.", then what that means (W5 UX-05), and no Run-again control', () => {
    const result = failedWith('UNKNOWN_OUTCOME');
    result.outcome = 'UNKNOWN_OUTCOME';
    expect(guidedCompletionView(result)).toEqual({
      kind: 'unknownOutcome',
      lines: [GUIDED_COPY.unknownOutcome.template, GUIDED_COPY.unknownOutcomeConsequence.template],
    });
    renderCompletion(result);
    const completion = screen.getByTestId('guided-completion');
    expect(completion).toHaveTextContent('Stopped — submission outcome unknown.');
    expect(completion).toHaveTextContent(
      'Studio could not confirm whether its last action on the page took effect, and it will not repeat that action on its own. Check the application before you Run again.',
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('no outcome renders a Run-again control', () => {
    for (const outcome of ['SUCCEEDED', 'PUBLICATION_CONFLICT', 'FAILED', 'UNKNOWN_OUTCOME', 'CANCELLED', 'EXPIRED'] as const) {
      const result = failedWith('ASSERTION_FAILED');
      result.outcome = outcome;
      const { unmount } = renderCompletion(result);
      expect(screen.queryByRole('button', { name: /run again/iu }), outcome).toBeNull();
      unmount();
    }
  });

  it('A3: CANCELLED shows the existing CANCELLED narrative, unchanged and with no user-initiated variant', () => {
    const result = failedWith('CANCELLED');
    result.outcome = 'CANCELLED';
    renderCompletion(result);
    const completion = screen.getByTestId('guided-completion');
    const existing = EXECUTION_ERROR_NARRATIVES.CANCELLED;
    expect(completion).toHaveTextContent(existing.title);
    expect(completion).toHaveTextContent(existing.browserClaim);
    expect(completion).toHaveTextContent(existing.remedyOwner);
    expect(completion).not.toHaveTextContent(/so you can edit/iu);
  });

  it('EXPIRED states that the run stopped and what to do', () => {
    const result = failedWith('EXPIRED');
    result.outcome = 'EXPIRED';
    renderCompletion(result);
    expect(screen.getByTestId('guided-completion')).toHaveTextContent(GUIDED_COPY.expired.template);
  });

  it.each([
    ['ASSERTION_FAILED', GUIDED_COPY.assertionFailed.template],
    ['UNSUPPORTED_SURFACE', GUIDED_COPY.unsupportedSurface.template],
    ['BUDGET_EXCEEDED', GUIDED_COPY.budgetExceeded.template],
  ])('FAILED %s has its own narrative', (code, text) => {
    renderCompletion(failedWith(code));
    expect(screen.getByTestId('guided-completion')).toHaveTextContent(text);
  });

  it('BUDGET_EXCEEDED says nothing starts again on its own', () => {
    renderCompletion(failedWith('BUDGET_EXCEEDED'));
    expect(screen.getByTestId('guided-completion')).toHaveTextContent('Nothing starts again on its own.');
  });

  it('LOGIN_REQUIRED hands over to the login notice (landed loginResult fixture)', () => {
    const result = loginResult();
    renderCompletion(result, {});
    expect(screen.getByTestId('guided-completion')).toHaveAttribute('data-kind', 'login');
    expect(screen.getByTestId('login-required-notice')).toBeInTheDocument();
  });

  it('inherited 014-a: a governed POLICY_DENIED has its own narrative, names no cause, and is not the secret copy', () => {
    const result = loginResult();
    delete result.detail;
    result.errorCode = 'POLICY_DENIED';
    result.failure = null;
    renderCompletion(result);
    const completion = screen.getByTestId('guided-completion');
    expect(completion).toHaveTextContent('This action could not be run.');
    expect(completion).toHaveTextContent(GUIDED_COPY.governedPolicyDeniedBody.template);
    expect(completion).toHaveTextContent(GUIDED_COPY.governedPolicyDeniedRemedy.template);
    expect(completion).not.toHaveTextContent(STRUCK_SECRET_FILL_COPY);
    for (const hidden of ['UNGROUNDED_TARGET', 'DESTRUCTIVE_VERB', 'SIDE_EFFECT_DENIED']) {
      expect(completion).not.toHaveTextContent(hidden);
    }
  });

  it('A2 negative: an INVALID_CONTRACT result never renders the secret-fill copy; it gets the generic narrative', () => {
    renderCompletion(failedWith('INVALID_CONTRACT'));
    const completion = screen.getByTestId('guided-completion');
    expect(completion).not.toHaveTextContent(STRUCK_SECRET_FILL_COPY);
    expect(completion).toHaveTextContent(GUIDED_COPY.failedUnnamed.template);
    expect(screen.getByTestId('guided-completion-code')).toHaveTextContent('INVALID_CONTRACT');
  });

  it('FAILED with no failure and no errorCode says the server gave no reason, with no code line (W5 UX-12)', () => {
    const result = loginResult();
    delete result.detail;
    result.errorCode = null;
    result.failure = null;
    expect(guidedCompletionView(result)).toEqual({
      kind: 'failedUnnamed',
      code: null,
      lines: [GUIDED_COPY.failedNoReason.template],
    });
    renderCompletion(result);
    const completion = screen.getByTestId('guided-completion');
    expect(completion).toHaveTextContent('This run stopped, and the server gave no reason for it, so there is nothing here to explain it.');
    expect(completion).not.toHaveTextContent('shown below');
    expect(screen.queryByTestId('guided-completion-code')).toBeNull();
  });

  it('non-terminal outcomes render nothing here', () => {
    const result = publishedResult();
    for (const outcome of ['PREPARING', 'ACTING', 'AWAITING_CLARIFICATION', 'FINALIZING'] as const) {
      result.outcome = outcome;
      expect(guidedCompletionView(result)).toBeNull();
    }
  });

  it('a replay PASSED snapshot says "Completed — saved steps replayed."; other replay states are not worded here', () => {
    const { unmount } = render(
      <GuidedCompletion input={{ kind: 'replay', snapshot: { status: 'PASSED' } }} draftStepIds={DRAFT} onGoToStep={noop} onOpenVariables={noop} />,
    );
    expect(screen.getByTestId('guided-completion')).toHaveTextContent('Completed — saved steps replayed.');
    unmount();
    const { container } = render(
      <GuidedCompletion input={{ kind: 'replay', snapshot: { status: 'FAILED' } }} draftStepIds={DRAFT} onGoToStep={noop} onOpenVariables={noop} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

// ---------------------------------------------------------------------------------------------
// Start feedback (P4; D-3, D-4, D-11; inherited POLICY_NOT_APPROVED)
// ---------------------------------------------------------------------------------------------

function refusal(httpStatus: number, error: Partial<NonNullable<GuidedStartRefusal['error']>> | null, extra: Partial<GuidedStartRefusal> = {}): GuidedStartRefusal {
  return {
    httpStatus,
    error:
      error === null
        ? null
        : { schemaVersion: 3, requestId: 'sample-request', retryable: false, messageCode: 'X', code: 'INVALID_CONTRACT', ...error },
    platformCode: null,
    retryAfterSeconds: null,
    ...extra,
  };
}

describe('GuidedStartFeedback: a refused start is inline feedback, not a session (P4)', () => {
  it.each([
    ['GUIDED_POLICY_ABSENT', GUIDED_COPY.policyAbsent.template],
    ['GUIDED_POLICY_UNAPPROVED', GUIDED_COPY.policyUnapproved.template],
    ['GUIDED_POLICY_PENDING_VERSION', GUIDED_COPY.policyPendingVersion.template],
  ])('POLICY_NOT_APPROVED %s: approval needed, plus the message-specific line', (messageCode, line) => {
    const view = guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(409, { code: 'POLICY_NOT_APPROVED', messageCode }) });
    expect(view.lines).toEqual([GUIDED_COPY.policyNotApproved.template, line]);
    expect(view.action).toBeNull();
    expect(view.lines.join(' ')).not.toContain(STRUCK_SECRET_FILL_COPY);
  });

  it('BASE_IDENTITY_INCOMPLETE offers "Learn again from step 1" and calls back only when pressed (D-4)', async () => {
    const onLearn = vi.fn();
    render(
      <GuidedStartFeedback
        input={{ kind: 'refusal', refusal: refusal(409, { code: 'REVISION_CONFLICT', messageCode: 'BASE_IDENTITY_INCOMPLETE' }) }}
        onLearnFromFirstStep={onLearn}
        onOpenVariables={noop}
      />,
    );
    expect(screen.getByTestId('guided-start-feedback')).toHaveTextContent(GUIDED_COPY.baseIdentityIncompleteStart.template);
    expect(onLearn).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Learn again from step 1' }));
    expect(onLearn).toHaveBeenCalledTimes(1);
  });

  it.each(['FIRST_LEARN_STEP_NARROWED', 'FIRST_LEARN_STEP_UNKNOWN', 'BASE_REVISION_MISMATCH'])(
    'D-3 %s is not-ready start feedback with no action',
    (messageCode) => {
      const view = guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(409, { code: 'REVISION_CONFLICT', messageCode }) });
      expect(view).toEqual({
        title: null,
        lines: [GUIDED_COPY.revisionNotReady.template],
        code: null,
        action: null,
        unavailable: false,
      });
    },
  );

  it('MISSING_SOURCE offers "Open Variables"; ORIGIN_NOT_ALLOWED names approved access', () => {
    expect(
      guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(409, { code: 'MISSING_SOURCE', messageCode: 'AUTHORING_REFERENCE_MISSING' }) }),
    ).toMatchObject({ lines: [GUIDED_COPY.referenceMissing.template], action: 'openVariables' });
    expect(
      guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(403, { code: 'ORIGIN_NOT_ALLOWED', messageCode: 'PREFIX_ORIGIN_NOT_GOVERNED' }) }),
    ).toMatchObject({ lines: [GUIDED_COPY.originNotAllowed.template], action: null });
  });

  it('RUNTIME_INCOMPATIBLE, refused or unavailable, says learning could not start and shows the code; no cause, no "save again" (D-11, W5 UX-01)', () => {
    const runtime = EXECUTE_CONFLICT_NARRATIVES.RUNTIME_INCOMPATIBLE;
    const expected = {
      title: null,
      lines: [GUIDED_COPY.guidedStartUnavailable.template],
      code: 'RUNTIME_INCOMPATIBLE',
      action: null,
      unavailable: true,
    };
    const refused = guidedStartFeedbackView({
      kind: 'refusal',
      refusal: refusal(409, { code: 'RUNTIME_INCOMPATIBLE', messageCode: 'RUNTIME_INCOMPATIBLE' }),
    });
    const unavailable = guidedStartFeedbackView({ kind: 'unavailable', code: 'RUNTIME_INCOMPATIBLE' });
    expect(refused).toEqual(expected);
    expect(unavailable).toEqual(expected);
    // The replay narrative is not reused: its "Save the test again" is no remedy for guided learning.
    for (const view of [refused, unavailable]) {
      const text = JSON.stringify(view);
      expect(text).not.toContain(runtime.title);
      expect(text).not.toContain(runtime.explanation);
      expect(text).not.toContain(runtime.whoClearsIt);
      expect(text).not.toContain('Save the test again');
    }
    // A different messageCode is shown with the code, exactly as it arrived.
    expect(
      guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(409, { code: 'RUNTIME_INCOMPATIBLE', messageCode: 'WORKER_STALE' }) }).code,
    ).toBe('RUNTIME_INCOMPATIBLE WORKER_STALE');
  });

  it('FORBIDDEN reuses the existing refusal, which names no cause (D-11)', () => {
    expect(guidedStartFeedbackView({ kind: 'unavailable', code: 'FORBIDDEN_SCOPE' })).toMatchObject({
      title: EXECUTE_FORBIDDEN_NARRATIVE.title,
    });
    expect(guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(403, null) })).toMatchObject({
      title: EXECUTE_FORBIDDEN_NARRATIVE.title,
    });
  });

  it('BUDGET_EXCEEDED per CSI states the wait from Retry-After and never starts on its own', () => {
    const view = guidedStartFeedbackView({
      kind: 'refusal',
      refusal: refusal(429, { code: 'BUDGET_EXCEEDED', messageCode: 'CSI_DAILY_TOKENS_EXHAUSTED', retryable: true }, { retryAfterSeconds: 125 }),
    });
    expect(view.lines).toEqual([
      GUIDED_COPY.budgetCsi.template,
      'You can Run again in 2m 05s.',
      'Nothing starts again on its own.',
    ]);
    expect(view.action).toBeNull();
  });

  it('BUDGET_EXCEEDED per session says waiting will not help, and gives no wait', () => {
    const view = guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(429, { code: 'BUDGET_EXCEEDED', retryable: false }) });
    expect(view.lines).toEqual([GUIDED_COPY.budgetSession.template]);
  });

  it('a refusal this page has no wording for shows the existing undeclared wording and the code as it arrived', () => {
    render(
      <GuidedStartFeedback
        input={{ kind: 'refusal', refusal: refusal(429, null, { platformCode: 'RATE_LIMITED', retryAfterSeconds: 3 }) }}
        onLearnFromFirstStep={noop}
        onOpenVariables={noop}
      />,
    );
    expect(screen.getByTestId('guided-start-feedback')).toHaveTextContent(UNDECLARED_EXECUTE_REFUSAL.title);
    expect(screen.getByTestId('guided-start-feedback-code')).toHaveTextContent('RATE_LIMITED');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the code is a secondary "Reference:" line, and only RUNTIME_INCOMPATIBLE marks the start unavailable (STUDIO-UNIFY-001.5 AC-01)', () => {
    render(
      <GuidedStartFeedback
        input={{ kind: 'unavailable', code: 'RUNTIME_INCOMPATIBLE' }}
        onLearnFromFirstStep={noop}
        onOpenVariables={noop}
      />,
    );
    const code = screen.getByTestId('guided-start-feedback-code');
    expect(code).toHaveTextContent('Reference: RUNTIME_INCOMPATIBLE');
    expect(screen.getByTestId('guided-start-feedback')).toHaveTextContent(GUIDED_COPY.guidedStartUnavailable.template);
    expect(screen.getByTestId('guided-start-feedback')).not.toHaveTextContent('shown below exactly as it arrived');

    expect(guidedStartFeedbackView({ kind: 'unavailable', code: 'FORBIDDEN_SCOPE' }).unavailable).toBe(false);
    expect(guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(403, null) }).unavailable).toBe(false);
    expect(
      guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(409, { code: 'RUNTIME_INCOMPATIBLE', messageCode: 'WORKER_STALE' }) })
        .unavailable,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Narrow layout (AC-8 a)
// ---------------------------------------------------------------------------------------------

describe('narrow layout (AC-8 a): mobile-first, so the base styles are the narrow ones', () => {
  it('start-feedback actions stack and fill the width; long text wraps', () => {
    render(
      <GuidedStartFeedback
        input={{ kind: 'refusal', refusal: refusal(409, { code: 'MISSING_SOURCE', messageCode: 'AUTHORING_REFERENCE_MISSING' }) }}
        onLearnFromFirstStep={noop}
        onOpenVariables={noop}
      />,
    );
    const button = screen.getByRole('button', { name: 'Open Variables' });
    expect(getComputedStyle(button.parentElement!).flexDirection).toBe('column');
    expect(getComputedStyle(button).width).toBe('100%');
  });

  it('the readiness chip label wraps instead of overflowing', () => {
    render(
      <ReadinessChip
        test={{ readiness: 'NEEDS_RELEARN', firstChangedStepId: STEP(3), readinessReason: 'BASE_IDENTITY_INCOMPLETE' }}
        draftStepIds={DRAFT}
      />,
    );
    const chip = screen.getByTestId('guided-readiness-chip');
    expect(getComputedStyle(chip).maxWidth).toBe('100%');
    const label = within(chip).getByText(GUIDED_COPY.baseIdentityIncomplete.template);
    expect(getComputedStyle(label).whiteSpace).toBe('normal');
  });
});

describe('guidedCopy', () => {
  it('fills the AC tokens with server values', () => {
    expect(guidedCopy('completedPartial', { k: 4, n: 10 })).toBe('Completed — steps 4–10 learned again.');
    expect(guidedCopy('needsRelearn', { k: 4 })).toBe('Steps changed — next Run learns from step 4');
  });

  it('W5-1 (T9): sessionUnreadable states the state and its consequence for learning, and never claims a reload clears it', () => {
    const text = guidedCopy('sessionUnreadable');
    expect(text).toBe(
      'Studio could not read the learning Run already started for this test, so it starts no new learning Run here. Press Refresh test information to check again.',
    );
    expect(text).not.toMatch(/reload/iu);
  });

  it('W5-2 (T9): secretNameTaken names the ID, says nothing was inserted, and says to rename the variable in Variables', () => {
    expect(guidedCopy('secretNameTaken', { ID: 'USER_ID' })).toBe(
      'The secret USER_ID was not inserted, because this test already has a variable named USER_ID. Rename that variable in Variables, then insert the secret again.',
    );
  });

  it('W5 UX-04 / UX-06 / UX-09: the changed sentences are the specified ones', () => {
    expect(guidedCopy('learningElsewhere')).toBe(
      'Another Run is learning this test, so Run is off. It stays off until that Run ends and this page reads the test again: press Refresh test information, or reload the page.',
    );
    expect(guidedCopy('expiresIn60')).toBe(
      'This question expires within a minute. If it expires, this run will stop and you will need to Run again.',
    );
    expect(guidedCopy('expiresIn20')).toBe(
      'This question expires within 20 seconds. If it expires, this run will stop and you will need to Run again.',
    );
    expect(guidedCopy('completedPartialOne', { k: 5 })).toBe('Completed — step 5 learned again.');
    expect(guidedCopy('relearnedAfterPrefixDriftOne', { j: 2 })).toBe('Step 2 was re-learned because the page changed.');
  });
});

// ---------------------------------------------------------------------------------------------
// Never-echo canaries (AC-5(c); design R3 I-B6/I-C11; gate finding F-L5a-1)
// ---------------------------------------------------------------------------------------------

/**
 * The clarification, result and explanation views render IDs and never values. Canary values are
 * planted wherever a payload could plausibly carry one:
 *  - value-bearing keys the closed contract never has (`value`, `secretValue`, `resolvedValue`),
 *    on the question, each choice, the active step, the result, its login `detail`, its `failure`,
 *    its `evidence`, each explanation step, action and reference flow (cast through `unknown`);
 *  - contract fields these components do not display (`documentId`, `evidence.ref`).
 * Then the canaries must be absent from the DOM, every accessible name, the callbacks' arguments,
 * storage and the console, while the IDs (`LOGIN_PW`, `ORDER_REF`) are shown.
 *
 * Not planted, because they are rendered verbatim by design and their value-freedom is a server
 * guarantee: `progress.activeStep.text` (the authored sentence, P2), a PAGE `safeLabel` (sanitized
 * page text), `video.error` (the existing story 10.16a rule) and an unnamed `errorCode` (shown as
 * the code that arrived).
 */
const CANARY_SECRET = 'Canary-L5a-secret-6c1f0b37-value';
const CANARY_VARIABLE = 'Canary-L5a-variable-2a9d44e1-value';
const CANARIES = [CANARY_SECRET, CANARY_VARIABLE] as const;
const SECRET_ID = 'LOGIN_PW';
const VARIABLE_ID = 'ORDER_REF';

/** Adds value-bearing keys the contract never carries. */
function withCanaryKeys<T extends object>(target: T): T {
  Object.assign(target as unknown as Record<string, unknown>, {
    value: CANARY_SECRET,
    secretValue: CANARY_SECRET,
    resolvedValue: CANARY_VARIABLE,
  });
  return target;
}

const CANARY_ROLES = [
  'alert', 'button', 'group', 'heading', 'img', 'list', 'listitem', 'progressbar', 'radio',
  'radiogroup', 'region', 'status',
] as const;

function accessibleNames(): string[] {
  const names: string[] = [];
  for (const role of CANARY_ROLES) {
    screen.queryAllByRole(role, {
      hidden: true,
      name: (name) => {
        names.push(name);
        return true;
      },
    });
  }
  return names;
}

function storageText(): string {
  const dump = (storage: Storage) =>
    Object.keys(storage).map((key) => `${key}=${storage.getItem(key) ?? ''}`).join('\n');
  return `${dump(window.localStorage)}\n${dump(window.sessionStorage)}`;
}

/** Callback and console arguments, serialized; DOM nodes and cycles are cut rather than thrown on. */
function serialized(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'object' && item !== null) {
      if (item instanceof Node) return `[${item.nodeName}]`;
      if (seen.has(item)) return '[circular]';
      seen.add(item);
      if (item instanceof Error) return { message: item.message, stack: item.stack };
    }
    return item;
  });
}

function expectNoCanary(where: string, text: string) {
  for (const canary of CANARIES) {
    expect(text, `${where} carries ${canary}`).not.toContain(canary);
  }
}

describe('never-echo (AC-5(c); I-B6/I-C11): clarification, result and explanation render IDs, never values', () => {
  const step: GuidedActiveStep = withCanaryKeys({
    stepId: STEP(1),
    number: 1,
    text: `Sign in with <secret ${SECRET_ID}> and type <var ${VARIABLE_ID}>`,
  });

  function canaryQuestion(): GuidedClarificationQuestion {
    const question = clone(fixtures.documents.labelledQuestion) as GuidedClarificationQuestion;
    question.documentId = CANARY_VARIABLE;
    question.expiresAt = '2999-01-01T00:00:00Z';
    question.choices = [
      ...question.choices,
      { choiceId: 'saved-input', safeLabel: VARIABLE_ID, labelSource: 'SAVED_INPUT', nodeId: null, bindingId: 'binding-order' } satisfies GuidedChoice,
    ].map((choice) => withCanaryKeys(choice));
    return withCanaryKeys(question);
  }

  function canaryLoginResult(): GuidedResult {
    const result = withCanaryKeys(loginResult());
    withCanaryKeys(result.detail!);
    result.evidence.ref = CANARY_SECRET;
    withCanaryKeys(result.evidence);
    return result;
  }

  function canarySecretUnavailable(): GuidedResult {
    const result = withCanaryKeys(failedWith('SECRET_UNAVAILABLE'));
    withCanaryKeys(result.failure!);
    return result;
  }

  /** The landed recordingResult, with reference IDs and a flow, every object planted. */
  function canaryExplainedResult(): GuidedResult {
    const result = withCanaryKeys(clone(fixtures.documents.recordingResult) as GuidedResult);
    const [first, second] = result.explanation.steps;
    first.actions[0].referenceIds = [SECRET_ID];
    second.actions[0].referenceIds = [VARIABLE_ID];
    result.explanation.referenceFlows = [
      { bindingId: VARIABLE_ID, producerStepId: first.stepId, consumerStepId: second.stepId, argumentSlot: 'fill.value' },
    ];
    for (const explained of result.explanation.steps) {
      withCanaryKeys(explained);
      explained.actions.forEach((action) => withCanaryKeys(action));
    }
    result.explanation.referenceFlows.forEach((flow) => withCanaryKeys(flow));
    withCanaryKeys(result.explanation);
    result.evidence.ref = CANARY_VARIABLE;
    return result;
  }

  it('the value is in no DOM, accessible name, callback, storage or console output; the IDs are shown', async () => {
    const consoleSpies = (['log', 'error', 'warn', 'info', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const onAnswer = vi.fn();
    const onNoneOfThese = vi.fn();
    const onGoToStep = vi.fn();
    const onOpenVariables = vi.fn();
    const explained = canaryExplainedResult();
    try {
      render(
        <>
          <GuidedRunStatus
            session={session({ state: 'OBSERVING', progress: { stepCount: 2, activeStep: step } })}
            draftStepIds={DRAFT}
          />
          <GuidedClarification clarification={canaryQuestion()} step={step} onAnswer={onAnswer} onNoneOfThese={onNoneOfThese} />
          <GuidedCompletion
            input={{ kind: 'guided', result: canaryLoginResult() }}
            draftStepIds={[...DRAFT, 'protected-step']}
            onGoToStep={onGoToStep}
            onOpenVariables={onOpenVariables}
          />
          <GuidedCompletion
            input={{ kind: 'guided', result: canarySecretUnavailable() }}
            draftStepIds={DRAFT}
            onGoToStep={onGoToStep}
            onOpenVariables={onOpenVariables}
          />
          <PlanExplanation result={explained} />
          <VideoEvidencePanel guided={{ sessionId: explained.sessionId, result: explained }} />
          <GuidedSeekControls result={explained} onSeek={() => undefined} />
        </>,
      );

      // Use the controls, so the callbacks' arguments are checked too.
      await userEvent.click(screen.getByLabelText(VARIABLE_ID));
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await userEvent.click(screen.getByRole('button', { name: 'Go to step 5' }));
      await userEvent.click(screen.getByRole('button', { name: 'Open Variables' }));

      expectNoCanary('DOM text', document.body.textContent ?? '');
      expectNoCanary('DOM markup', document.body.innerHTML);
      expectNoCanary('accessible names', accessibleNames().join('\n'));
      expectNoCanary('callbacks', serialized([onAnswer.mock.calls, onNoneOfThese.mock.calls, onGoToStep.mock.calls, onOpenVariables.mock.calls]));
      // The callbacks get IDs or nothing, never an event or a payload.
      expect(onOpenVariables.mock.calls).toEqual([[]]);
      expectNoCanary('storage', storageText());
      for (const spy of consoleSpies) {
        expectNoCanary(`console.${spy.getMockName()}`, serialized(spy.mock.calls));
      }

      // The callbacks carried IDs only.
      expect(onAnswer).toHaveBeenCalledWith('saved-input');
      expect(onGoToStep).toHaveBeenCalledWith('protected-step');

      // The IDs are present.
      const body = document.body.textContent ?? '';
      expect(screen.getByTestId('guided-question')).toHaveTextContent(`<secret ${SECRET_ID}>`);
      expect(document.querySelector('[data-label-source="SAVED_INPUT"]')).toHaveTextContent(VARIABLE_ID);
      expect(screen.getAllByTestId('plan-reference-id').map((id) => id.textContent)).toEqual([SECRET_ID, VARIABLE_ID]);
      expect(screen.getByTestId('plan-reference-flows')).toHaveTextContent(`${VARIABLE_ID} from step 1 → Fill field in step 2`);
      expect(body).toContain('SECRET_UNAVAILABLE');
      expect(screen.getByTestId('login-required-notice')).toBeInTheDocument();
    } finally {
      consoleSpies.forEach((spy) => spy.mockRestore());
    }
  });

  it('"None of these" hands back the step ID only', async () => {
    const onNoneOfThese = vi.fn();
    render(<GuidedClarification clarification={canaryQuestion()} step={step} onAnswer={() => undefined} onNoneOfThese={onNoneOfThese} />);
    await userEvent.click(screen.getByLabelText("None of these — I'll edit step 1"));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onNoneOfThese.mock.calls).toEqual([[STEP(1)]]);
    expectNoCanary('DOM markup', document.body.innerHTML);
  });

  it('the view functions carry no canary into what they return', () => {
    expectNoCanary('completion view', JSON.stringify(guidedCompletionView(canaryLoginResult())));
    expectNoCanary('completion view', JSON.stringify(guidedCompletionView(canarySecretUnavailable())));
    expectNoCanary('run status', JSON.stringify(guidedRunStatusLines(session({ state: 'ACTING', progress: { stepCount: 2, activeStep: step } }), DRAFT)));
  });
});
