import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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
import { GUIDED_ERROR_CODES } from '@/types/studio/studioGuidedTypes';
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
  learnedReceiptLines,
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
/** The replay that is a published learn's proof (`result.proof`); the fixture itself carries none. */
const PROOF = { executionId: '7d2f5c1e-3b4a-4e8d-9f10-2a6b8c9d0e11' } as const;
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
  it('SUCCEEDED + PUBLISHED is only recorded, never "learned", until the proof has passed', () => {
    renderCompletion(publishedResult());
    const completion = screen.getByTestId('guided-completion');
    expect(completion).toHaveTextContent('Recorded from this run. The steps count as learned once the replay passes.');
    expect(completion).not.toHaveTextContent('learned from this run');
    // The learned receipt is what the page shows once the proof snapshot PASSED.
    expect(learnedReceiptLines(publishedResult(), null)).toEqual(['Completed — learned from this run.']);
  });

  it('partial: "Completed — steps k–n learned again." from relearnedFrom (BOUNDARY), as the learned receipt after the proof', () => {
    const result = publishedResult();
    result.relearnedFrom = { stepId: STEP(2) };
    // W5 UX-09: a range of one step is worded as one step, not "steps 2–2".
    expect(learnedReceiptLines(result, null)).toEqual(['Completed — step 2 learned again.']);
    renderCompletion(result);
    expect(screen.getByTestId('guided-completion')).toHaveTextContent('Recorded from this run. The steps count as learned once the replay passes.');
  });

  it('after a prefix drift: the learned range, then "steps j… were re-learned because the page changed"', () => {
    // publication-fixtures `source-plan-failure-after-drift-retains-j`: initial k = step 3, drift at j = step 2.
    const drifted = incrementalCase('source-plan-failure-after-drift-retains-j');
    const result = publishedResult();
    result.explanation = drifted.explanation;
    result.progress = drifted.progress;
    result.relearnedFrom = drifted.relearnedFrom;
    result.proof = { ...PROOF };
    expect(result.relearnedFrom).toEqual({ stepId: STEP(2), driftSwitchStepId: STEP(2) });

    const n = result.progress.stepCount;
    expect(guidedCompletionView(result, STEP(3))).toEqual({
      kind: 'succeeded',
      lines: [GUIDED_COPY.recordedReceipt.template, GUIDED_COPY.proofReplaying.template],
    });
    // The receipt kept above the proof replay is the same learned lines without the proof line.
    expect(learnedReceiptLines(result, STEP(3))).toEqual([
      `Completed — steps 2–${n} learned again.`,
      'Step 2 was re-learned because the page changed.',
    ]);
    // Without the session's original k, "j…" is filled as the AC writes it.
    expect(learnedReceiptLines(result, null)).toEqual([
      `Completed — steps 2–${n} learned again.`,
      'Steps 2… were re-learned because the page changed.',
    ]);
  });

  it('proof replay: the recorded line is followed by "Replaying the saved steps to record proof…" while result.proof names it', () => {
    const result = publishedResult();
    result.proof = { ...PROOF };
    renderCompletion(result);
    const completion = screen.getByTestId('guided-completion');
    expect(completion).toHaveTextContent('Recorded from this run. The steps count as learned once the replay passes.');
    expect(completion).toHaveTextContent('Replaying the saved steps to record proof…');
    expect(completion).not.toHaveTextContent(GUIDED_COPY.proofNotStarted.template);
  });

  it('published with proof null: "Studio could not start the proof replay. Run the test to record proof."', () => {
    const result = publishedResult();
    expect(result.proof).toBeNull();
    renderCompletion(result);
    const completion = screen.getByTestId('guided-completion');
    expect(completion).toHaveTextContent('Recorded from this run. The steps count as learned once the replay passes.');
    expect(completion).toHaveTextContent('Studio could not start the proof replay. Run the test to record proof.');
    expect(completion).not.toHaveTextContent('Replaying the saved steps');
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

  it('user decision 2026-11-01: a CANCELLED end after "None of these" says learning paused to edit step N, not the Stop text', () => {
    const result = failedWith('CANCELLED');
    result.outcome = 'CANCELLED';
    render(
      <GuidedCompletion
        input={{ kind: 'guided', result, pausedForEditStep: 3 }}
        draftStepIds={DRAFT}
        onGoToStep={noop}
        onOpenVariables={noop}
      />,
    );
    const completion = screen.getByTestId('guided-completion');
    expect(completion).toHaveTextContent('Learning paused so you can edit step 3');
    expect(completion).toHaveTextContent(
      'Nothing was saved. Edit step 3, naming the exact control (for example, where it is on the page), then press Run. Studio learns the test again from step 1.',
    );
    expect(completion).not.toHaveTextContent(/Someone pressed Stop/u);
    expect(completion).not.toHaveTextContent(EXECUTION_ERROR_NARRATIVES.CANCELLED.title);
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
    ['ORIGIN_NOT_ALLOWED', GUIDED_COPY.originLeft.template],
  ])('FAILED %s has its own narrative', (code, text) => {
    renderCompletion(failedWith(code));
    expect(screen.getByTestId('guided-completion')).toHaveTextContent(text);
  });

  it('BUDGET_EXCEEDED says nothing starts again on its own', () => {
    renderCompletion(failedWith('BUDGET_EXCEEDED'));
    expect(screen.getByTestId('guided-completion')).toHaveTextContent('Nothing starts again on its own.');
  });

  describe('model failures (compliance-model latency hardening)', () => {
    const error = JSON.parse(fs.readFileSync(path.join(V3, 'error.schema.json'), 'utf8'));
    const errorCodes: string[] = error.properties.code.enum;

    it('UNSUPPORTED_STEP names the step Studio cannot do yet instead of "runtime incompatible"', () => {
      const view = guidedCompletionView(headingShape('UNSUPPORTED_STEP'));
      expect(view).toEqual({
        kind: 'failed',
        code: 'UNSUPPORTED_STEP',
        lines: ["Studio can't do this step yet, so this run stopped.", 'Studio stopped at step 2.', 'Try rewording the step, or split it into smaller steps.'],
      });
      renderCompletion(failedWith('UNSUPPORTED_STEP'));
      const completion = screen.getByTestId('guided-completion');
      expect(completion).toHaveTextContent(GUIDED_COPY.unsupportedStep.template);
      expect(completion).toHaveTextContent(GUIDED_COPY.unsupportedStepRemedy.template);
      expect(completion).not.toHaveTextContent(GUIDED_COPY.failedUnnamed.template);
      expect(completion).not.toHaveTextContent('RUNTIME_INCOMPATIBLE');
    });

    it.each(['MODEL_UNAVAILABLE', 'MODEL_REFUSED'])('%s is in the contract and in GUIDED_ERROR_CODES', (code) => {
      expect(errorCodes).toContain(code);
      expect(GUIDED_ERROR_CODES as readonly string[]).toContain(code);
    });

    it('MODEL_UNAVAILABLE: did not answer in time or busy, stopped, try again in a few minutes; no contract-defect text', () => {
      const view = guidedCompletionView(headingShape('MODEL_UNAVAILABLE'));
      expect(view).toEqual({
        kind: 'failed',
        code: 'MODEL_UNAVAILABLE',
        lines: [
          'The model service did not answer in time or is busy, so Studio stopped learning.',
          'Studio stopped at step 2.',
          'Trying again in a few minutes can help.',
        ],
      });
      renderCompletion(failedWith('MODEL_UNAVAILABLE'));
      const completion = screen.getByTestId('guided-completion');
      expect(completion).toHaveAttribute('data-kind', 'failed');
      expect(completion).toHaveTextContent(GUIDED_COPY.modelUnavailable.template);
      expect(completion).toHaveTextContent(GUIDED_COPY.modelUnavailableRetry.template);
      expect(completion).not.toHaveTextContent(GUIDED_COPY.failedUnnamed.template);
      expect(screen.queryByTestId('guided-completion-code')).not.toBeInTheDocument();
    });

    it('MODEL_REFUSED: the service refused, stopped, a retry is unlikely to help, contact the Studio team; no contract-defect text', () => {
      const view = guidedCompletionView(headingShape('MODEL_REFUSED'));
      expect(view).toEqual({
        kind: 'failed',
        code: 'MODEL_REFUSED',
        lines: [
          'The model service refused the request, so Studio stopped learning.',
          'Studio stopped at step 2.',
          'Trying again unchanged is unlikely to help. Contact the Studio team.',
        ],
      });
      renderCompletion(failedWith('MODEL_REFUSED'));
      const completion = screen.getByTestId('guided-completion');
      expect(completion).toHaveTextContent(GUIDED_COPY.modelRefused.template);
      expect(completion).toHaveTextContent(GUIDED_COPY.modelRefusedRemedy.template);
      expect(completion).not.toHaveTextContent(GUIDED_COPY.failedUnnamed.template);
      expect(screen.queryByTestId('guided-completion-code')).not.toBeInTheDocument();
    });

    it.each(['MODEL_UNAVAILABLE', 'MODEL_REFUSED'])('%s is named when only errorCode carries it (no typed failure)', (code) => {
      const result = failedWith(code);
      result.failure = null;
      const view = guidedCompletionView(result);
      expect(view?.kind).toBe('failed');
      expect(view !== null && 'code' in view && view.code).toBe(code);
    });

    it('neither message offers a new action: no buttons', () => {
      for (const code of ['MODEL_UNAVAILABLE', 'MODEL_REFUSED']) {
        const { unmount } = renderCompletion(failedWith(code));
        expect(screen.queryAllByRole('button')).toHaveLength(0);
        unmount();
      }
    });
  });

  it('LOGIN_REQUIRED hands over to the login notice (landed loginResult fixture)', () => {
    const result = loginResult();
    renderCompletion(result, {});
    expect(screen.getByTestId('guided-completion')).toHaveAttribute('data-kind', 'login');
    expect(screen.getByTestId('login-required-notice')).toBeInTheDocument();
  });

  it('inherited 014-a: an action-guard POLICY_DENIED has its own narrative, names no cause, and is not the secret copy', () => {
    const result = loginResult();
    delete result.detail;
    result.errorCode = 'POLICY_DENIED';
    result.failure = null;
    renderCompletion(result);
    const completion = screen.getByTestId('guided-completion');
    expect(completion).toHaveTextContent('This action could not be run.');
    expect(completion).toHaveTextContent(GUIDED_COPY.guardDeniedBody.template);
    expect(completion).toHaveTextContent(GUIDED_COPY.guardDeniedRemedy.template);
    expect(completion).not.toHaveTextContent(STRUCK_SECRET_FILL_COPY);
    for (const hidden of ['UNGROUNDED_TARGET', 'DESTRUCTIVE_VERB']) {
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

  it('SC008-FIX-20: LEARNING_CONTEXT_LOST gets its own cause-neutral text and shows the code', () => {
    const result = failedWith('LEARNING_CONTEXT_LOST');
    result.failure = null;
    renderCompletion(result);
    const completion = screen.getByTestId('guided-completion');
    expect(completion).toHaveTextContent(GUIDED_COPY.contextLost.template);
    expect(completion).not.toHaveTextContent(GUIDED_COPY.failedUnnamed.template);
    expect(completion).not.toHaveTextContent(GUIDED_COPY.failedNoReason.template);
    expect(completion).not.toHaveTextContent(/browser/iu);
    expect(screen.getByTestId('guided-completion-code')).toHaveTextContent('LEARNING_CONTEXT_LOST');
  });

  it('SC008-FIX-24: a step the author answered gets one "reword it" line each; none when none was answered', () => {
    const view = (answeredSteps?: readonly number[]) =>
      render(
        <GuidedCompletion
          input={{ kind: 'guided', result: publishedResult(), answeredSteps }}
          draftStepIds={DRAFT}
          onGoToStep={noop}
          onOpenVariables={noop}
        />,
      );
    const first = view();
    expect(screen.queryByTestId('guided-clarified-steps')).toBeNull();
    first.unmount();
    view([]);
    expect(screen.queryByTestId('guided-clarified-steps')).toBeNull();
    cleanup();
    view([2, 4]);
    const note = screen.getByTestId('guided-clarified-steps');
    expect(note).toHaveTextContent(
      'Step 2 needed your answer. Reword it to name the target exactly so it learns without asking.',
    );
    expect(note).toHaveTextContent(
      'Step 4 needed your answer. Reword it to name the target exactly so it learns without asking.',
    );
  });

  it('FAILED with no failure and no errorCode says the server gave no reason, with no code line (W5 UX-12)', () => {
    const result = loginResult();
    delete result.detail;
    result.errorCode = null;
    result.failure = null;
    // The landed loginResult explanation proves a stopped step (STUDIO-UNIFY-001.6); this case is about the reason line.
    result.explanation = { ...result.explanation, steps: [] };
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
// A failed learn names the step it stopped at (STUDIO-UNIFY-001.6 AC-01; @po D2)
// ---------------------------------------------------------------------------------------------

type ExplanationStep = GuidedResult['explanation']['steps'][number];
type ExplanationOutcome = ExplanationStep['actions'][number]['outcome'];

/** One explanation step: `completed` as given, one action per outcome (none = nothing retained). */
function explStep(number: number, completed: boolean, ...outcomes: ExplanationOutcome[]): ExplanationStep {
  return {
    stepId: STEP(number),
    number,
    completed,
    learnedFromThisRun: completed,
    reusedFrom: null,
    relearnedAfterDrift: false,
    actions: outcomes.map((outcome, index) => ({
      admissionId: `a-${number}-${index}`,
      ordinal: 0,
      attemptOrdinal: index,
      outcome,
      referenceIds: [],
    })),
  };
}

/** A failed result (code on the typed carrier) over the given explanation steps, source revision 2. */
function failedOver(code: string, ...steps: ExplanationStep[]): GuidedResult {
  const result = failedWith(code);
  result.explanation = { ...result.explanation, sourceRevision: '2', steps, referenceFlows: [] };
  return result;
}

/** The heading-test shape (visual-recheck-001.5 R6): step 1 done, step 2 never acted on. */
const headingShape = (code: string) => failedOver(code, explStep(1, true, 'SUCCEEDED'), explStep(2, false));

const draftOver = (over: Partial<NonNullable<React.ComponentProps<typeof GuidedCompletion>['test']>> = {}) => ({
  sourceRevision: 2,
  readiness: 'UNLEARNED' as const,
  firstChangedStepId: null,
  confirmedRevisionId: null,
  steps: [1, 2, 3, 4].map((n) => ({ id: STEP(n), text: `Authored sentence ${n}` })),
  ...over,
});

describe('GuidedCompletion: a failed learn names the step it stopped at (STUDIO-UNIFY-001.6 AC-01)', () => {
  it('BUDGET_EXCEEDED: the existing sentence, the step, the hedged next step, then "Nothing starts again on its own."', () => {
    const view = guidedCompletionView(headingShape('BUDGET_EXCEEDED'));
    expect(view).toEqual({
      kind: 'failed',
      code: 'BUDGET_EXCEEDED',
      lines: [
        GUIDED_COPY.budgetExceeded.template,
        'Studio stopped at step 2.',
        'Studio most likely could not find what step 2 describes. Check the page or reword the step, then press Run again.',
        GUIDED_COPY.nothingStartsOnItsOwn.template,
      ],
    });
  });

  it('the authored sentence follows only where planStepTexts provides it (same sourceRevision)', () => {
    const view = guidedCompletionView(headingShape('BUDGET_EXCEEDED'), null, draftOver());
    expect(view?.kind === 'failed' && view.lines).toContain('Studio stopped at step 2: "Authored sentence 2"');
    expect(view?.kind === 'failed' && view.lines).not.toContain('Studio stopped at step 2.');
  });

  it('a draft edited since the run (other sourceRevision, not the published one) gives the number and no sentence', () => {
    const view = guidedCompletionView(headingShape('BUDGET_EXCEEDED'), null, draftOver({ sourceRevision: 3 }));
    expect(view?.kind === 'failed' && view.lines).toContain('Studio stopped at step 2.');
    expect(JSON.stringify(view)).not.toContain('Authored sentence');
  });

  it('ASSERTION_FAILED: its existing sentence, then the step, and no budget sentence', () => {
    expect(guidedCompletionView(headingShape('ASSERTION_FAILED'))).toEqual({
      kind: 'failed',
      code: 'ASSERTION_FAILED',
      lines: [GUIDED_COPY.assertionFailed.template, 'Studio stopped at step 2.'],
    });
  });

  it("UNSUPPORTED_SURFACE tells the author to use the control's visible text", () => {
    // ADR-SC-007: the sentence is unchanged (it is also the code for an observation deadline), the step
    // line follows, then the remedy; no budget sentence.
    expect(guidedCompletionView(headingShape('UNSUPPORTED_SURFACE'))).toEqual({
      kind: 'failed',
      code: 'UNSUPPORTED_SURFACE',
      lines: [
        GUIDED_COPY.unsupportedSurface.template,
        'Studio stopped at step 2.',
        "If the step names a control, use the control's visible text (the label or button text shown on the page).",
      ],
    });
    renderCompletion(failedWith('UNSUPPORTED_SURFACE'));
    const completion = screen.getByTestId('guided-completion');
    expect(completion).toHaveTextContent(GUIDED_COPY.unsupportedSurface.template);
    expect(completion).toHaveTextContent(GUIDED_COPY.unsupportedSurfaceRemedy.template);
    expect(completion).not.toHaveTextContent('learning budget');
  });

  it('an unnamed failure gets the step statement only, and keeps its code line', () => {
    const result = headingShape('INVALID_CONTRACT');
    expect(guidedCompletionView(result)).toEqual({
      kind: 'failedUnnamed',
      code: 'INVALID_CONTRACT',
      lines: [GUIDED_COPY.failedUnnamed.template, 'Studio stopped at step 2.'],
    });
    renderCompletion(result);
    expect(screen.getByTestId('guided-completion')).toHaveTextContent('Studio stopped at step 2.');
    expect(screen.getByTestId('guided-completion-code')).toHaveTextContent('INVALID_CONTRACT');
  });

  it('FAILED with no reason still names the step', () => {
    const result = headingShape('X');
    result.errorCode = null;
    result.failure = null;
    expect(guidedCompletionView(result)).toEqual({
      kind: 'failedUnnamed',
      code: null,
      lines: [GUIDED_COPY.failedNoReason.template, 'Studio stopped at step 2.'],
    });
  });

  it('names the first step that is not completed, whatever later steps hold', () => {
    const result = failedOver(
      'ASSERTION_FAILED',
      explStep(1, true, 'SUCCEEDED'),
      explStep(2, false, 'UNKNOWN_OUTCOME'),
      explStep(3, false, 'FAILED'),
    );
    expect(guidedCompletionView(result)).toMatchObject({ lines: [expect.any(String), 'Studio stopped at step 2.'] });
  });

  it('never names a completed step that holds an excluded FAILED attempt (D2)', () => {
    const result = failedOver(
      'ASSERTION_FAILED',
      explStep(1, true, 'SUCCEEDED'),
      explStep(2, true, 'FAILED', 'SUCCEEDED'),
      explStep(3, false, 'FAILED'),
    );
    const view = guidedCompletionView(result);
    expect(view?.kind === 'failed' && view.lines).toContain('Studio stopped at step 3.');
    expect(view?.kind === 'failed' && view.lines).not.toContain('Studio stopped at step 2.');
  });

  it.each([
    ['no step has an action', [explStep(1, false), explStep(2, false)]],
    ['every step is completed', [explStep(1, true, 'SUCCEEDED'), explStep(2, true, 'SUCCEEDED')]],
    ['there are no steps', []],
  ])('%s: no step is named and the text is unchanged', (_name, steps) => {
    for (const [code, expected] of [
      ['BUDGET_EXCEEDED', [GUIDED_COPY.budgetExceeded.template, GUIDED_COPY.nothingStartsOnItsOwn.template]],
      ['ASSERTION_FAILED', [GUIDED_COPY.assertionFailed.template]],
      ['INVALID_CONTRACT', [GUIDED_COPY.failedUnnamed.template]],
    ] as const) {
      const view = guidedCompletionView(failedOver(code, ...steps), null, draftOver());
      expect(view !== null && 'lines' in view && view.lines, `${code}`).toEqual(expected);
    }
  });

  it('LOGIN_REQUIRED, POLICY_DENIED, CANCELLED, EXPIRED and UNKNOWN_OUTCOME read the same over a stopped explanation', () => {
    const stopped = [explStep(1, true, 'SUCCEEDED'), explStep(2, false, 'FAILED')];
    const login = loginResult();
    const policy = loginResult();
    delete policy.detail;
    policy.errorCode = 'POLICY_DENIED';
    policy.failure = null;
    const withOutcome = (outcome: GuidedResult['outcome']) => {
      const r = failedWith(outcome);
      r.outcome = outcome;
      return r;
    };
    const cases = [login, policy, withOutcome('CANCELLED'), withOutcome('EXPIRED'), withOutcome('UNKNOWN_OUTCOME')];
    for (const base of cases) {
      const marked = { ...base, explanation: { ...base.explanation, steps: stopped } };
      const plain = { ...base, explanation: { ...base.explanation, steps: [] } };
      expect(guidedCompletionView(marked, null, draftOver()), `${base.outcome} ${base.errorCode}`).toEqual(
        guidedCompletionView(plain, null, draftOver()),
      );
    }
  });

  it('a succeeded result is unaffected', () => {
    const result = publishedResult();
    result.explanation = { ...result.explanation, steps: [explStep(1, false, 'FAILED')] };
    expect(JSON.stringify(guidedCompletionView(result))).not.toContain('stopped at step');
  });

  it('renders the step lines in the alert, the authored sentence as escaped text', () => {
    const { container } = render(
      <GuidedCompletion
        input={{ kind: 'guided', result: headingShape('BUDGET_EXCEEDED'), firstLearnStepId: null }}
        draftStepIds={DRAFT}
        test={draftOver({ steps: [{ id: STEP(2), text: '<img src=x onerror=alert(1)> Check the heading' }] })}
        onGoToStep={noop}
        onOpenVariables={noop}
      />,
    );
    const completion = screen.getByTestId('guided-completion');
    expect(container.querySelector('img')).toBeNull();
    expect(completion).toHaveTextContent('Studio stopped at step 2: "<img src=x onerror=alert(1)> Check the heading"');
    expect(completion).toHaveTextContent('Studio most likely could not find what step 2 describes.');
    expect(completion).toHaveTextContent(GUIDED_COPY.budgetExceeded.template);
    expect(completion).toHaveTextContent('Nothing starts again on its own.');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Start feedback (P4; D-3, D-4, D-11)
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

  it('MISSING_SOURCE offers "Open Variables"; ORIGIN_NOT_ALLOWED says the page is not in the environment\'s allowed domains', () => {
    expect(
      guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(409, { code: 'MISSING_SOURCE', messageCode: 'AUTHORING_REFERENCE_MISSING' }) }),
    ).toMatchObject({ lines: [GUIDED_COPY.referenceMissing.template], action: 'openVariables' });
    expect(
      guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(403, { code: 'ORIGIN_NOT_ALLOWED', messageCode: 'ORIGIN_NOT_ALLOWED' }) }),
    ).toMatchObject({ lines: [GUIDED_COPY.originNotAllowed.template], action: null });
    expect(GUIDED_COPY.originNotAllowed.template).toContain("not in this environment's allowed domains");
    // Plain text: no test-URL-origin or approved-access wording, no origin, no list, no action.
    expect(GUIDED_COPY.originNotAllowed.template).not.toMatch(/origin|approved access|approved/iu);
  });

  it('SECRET_IN_TEXT names the secret rule and starts nothing; any other INVALID_CONTRACT keeps the generic refusal', () => {
    expect(
      guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(422, { code: 'INVALID_CONTRACT', messageCode: 'SECRET_IN_TEXT' }) }),
    ).toEqual({ title: null, lines: [GUIDED_COPY.secretInText.template], code: null, action: null, unavailable: false });
    expect(GUIDED_COPY.secretInText.template).toContain('A secret can only be the whole value of a step.');
    expect(
      guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(422, { code: 'INVALID_CONTRACT', messageCode: 'INVALID_CONTRACT' }) }).lines,
    ).not.toContain(GUIDED_COPY.secretInText.template);
  });

  it('NO_APPLICATION_URL asks for a step that opens the application URL and starts nothing', () => {
    expect(
      guidedStartFeedbackView({ kind: 'refusal', refusal: refusal(422, { code: 'NO_APPLICATION_URL', messageCode: 'NO_APPLICATION_URL' }) }),
    ).toMatchObject({ lines: ["Add a step that opens the application's URL."], action: null, unavailable: false });
    expect(GUIDED_COPY.applicationUrlMissing.template).toBe("Add a step that opens the application's URL.");
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

  it('LEARNING_CAPACITY_EXHAUSTED says every learning slot is busy, states the Retry-After wait, and never starts on its own', () => {
    const view = guidedStartFeedbackView({
      kind: 'refusal',
      refusal: refusal(429, { code: 'BUDGET_EXCEEDED', messageCode: 'LEARNING_CAPACITY_EXHAUSTED', retryable: true }, { retryAfterSeconds: 30 }),
    });
    expect(view.lines).toEqual([
      GUIDED_COPY.learningCapacityBusy.template,
      'You can Run again in 30 s.',
      'Nothing starts again on its own.',
    ]);
    expect(view.lines.join(' ')).toContain('All learning slots are busy');
    // Not the per-CSI budget sentence: a busy slot is not a used-up budget.
    expect(view.lines).not.toContain(GUIDED_COPY.budgetCsi.template);
    expect(view.action).toBeNull();
  });

  it('LEARNING_CAPACITY_EXHAUSTED without a Retry-After header says to try again in a moment', () => {
    const view = guidedStartFeedbackView({
      kind: 'refusal',
      refusal: refusal(429, { code: 'BUDGET_EXCEEDED', messageCode: 'LEARNING_CAPACITY_EXHAUSTED', retryable: true }),
    });
    expect(view.lines).toEqual([
      GUIDED_COPY.learningCapacityBusy.template,
      GUIDED_COPY.learningCapacityTryAgain.template,
      'Nothing starts again on its own.',
    ]);
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
      { choiceId: 'saved-input', safeLabel: VARIABLE_ID, labelSource: 'SAVED_INPUT', bindingId: 'binding-order' } satisfies GuidedChoice,
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
      { bindingId: VARIABLE_ID, producerStepId: first.stepId, consumerStepId: second.stepId },
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
          <VideoEvidencePanel
            guided={{
              sessionId: explained.sessionId,
              result: { executionId: explained.executionId, evidence: { video: explained.evidence.video! } },
            }}
          />
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
      expect(screen.getByTestId('plan-reference-flows')).toHaveTextContent(`${VARIABLE_ID} from step 1 → step 2`);
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
