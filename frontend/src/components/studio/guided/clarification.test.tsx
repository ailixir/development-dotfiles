import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'node:fs';
import path from 'node:path';
import type {
  GuidedActiveStep,
  GuidedChoice,
  GuidedClarification as GuidedClarificationQuestion,
} from '@/types/studio/studioGuidedTypes';
import { GUIDED_COPY } from './guidedNarratives';
import { GuidedClarification, expiryWarning } from './GuidedClarification';

/**
 * STUDIO-OBS-008 lane L5a: the guided question (AC-3; inherited OBS-014 item b; T0 ruling A3).
 *
 * The base question is the landed `contracts/v3/fixtures.json` `labelledQuestion` (two PAGE
 * choices), varied field by field. What is asserted: the AC-3 wording, page-derived labels rendered
 * as untrusted text with role and region, "None of these" calling back instead of answering, and
 * expiry warnings measured from `expiresAt`.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const fixtures = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'docs/specs/studio-observed-authoring/contracts/v3/fixtures.json'), 'utf8'),
);

const question = (overrides: Partial<GuidedClarificationQuestion> = {}): GuidedClarificationQuestion => ({
  ...(structuredClone(fixtures.documents.labelledQuestion) as GuidedClarificationQuestion),
  ...overrides,
});

const STEP_1 = '00000000-0000-4000-8000-000000000001';
const step: GuidedActiveStep = { stepId: STEP_1, number: 1, text: 'Type the order number into the reference box' };

const FAR_FUTURE = '2999-01-01T00:00:00Z';

function renderQuestion(
  clarification: GuidedClarificationQuestion,
  handlers: Partial<{ onAnswer: (id: string) => void; onNoneOfThese: (id: string) => void }> = {},
  activeStep: GuidedActiveStep | null = step,
) {
  const onAnswer = vi.fn((id: string) => handlers.onAnswer?.(id));
  const onNoneOfThese = vi.fn((id: string) => handlers.onNoneOfThese?.(id));
  const view = render(
    <GuidedClarification clarification={clarification} step={activeStep} onAnswer={onAnswer} onNoneOfThese={onNoneOfThese} />,
  );
  return { ...view, onAnswer, onNoneOfThese };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('disambiguation: the AC-3 question, a radio group, then "None of these" last', () => {
  it('asks "Step N says: \'<step text>\'. Which one did you mean?" from the session\'s active step', () => {
    renderQuestion(question({ expiresAt: FAR_FUTURE }));
    expect(screen.getByTestId('guided-question')).toHaveTextContent(
      "Step 1 says: 'Type the order number into the reference box'. Which one did you mean?",
    );
    const radios = within(screen.getByTestId('guided-choices')).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[radios.length - 1].closest('label')).toHaveTextContent("None of these — I'll edit step 1");
  });

  it('choosing a label and pressing Continue answers with that server choiceId', async () => {
    const { onAnswer, onNoneOfThese } = renderQuestion(question({ expiresAt: FAR_FUTURE }));
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();
    await userEvent.click(screen.getAllByRole('radio')[1]);
    await userEvent.click(continueButton);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith('choice-2');
    expect(onNoneOfThese).not.toHaveBeenCalled();
  });

  it('A3: "None of these" never answers; it hands the step ID back so the page can cancel, then focus', async () => {
    const { onAnswer, onNoneOfThese } = renderQuestion(question({ expiresAt: FAR_FUTURE }));
    await userEvent.click(screen.getByLabelText("None of these — I'll edit step 1"));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onNoneOfThese).toHaveBeenCalledTimes(1);
    expect(onNoneOfThese).toHaveBeenCalledWith(STEP_1);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('a question with no choices still offers "None of these"', () => {
    renderQuestion(question({ expiresAt: FAR_FUTURE, choices: [] }));
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });

  it('shows no question when the active step is unknown or is not the question\'s step (P2)', () => {
    const { container, unmount } = renderQuestion(question({ expiresAt: FAR_FUTURE }), {}, null);
    expect(container).toBeEmptyDOMElement();
    unmount();
    const other = renderQuestion(question({ expiresAt: FAR_FUTURE }), {}, { ...step, stepId: 'another-step' });
    expect(other.container).toBeEmptyDOMElement();
  });
});

describe('page-derived labels are untrusted text (AC-3, security)', () => {
  const hostile: GuidedChoice = {
    choiceId: 'choice-x',
    safeLabel: '<img src=x onerror="alert(1)"> ‮evil',
    labelSource: 'PAGE',
    role: '<b>button</b>',
    region: '<script>alert(2)</script>',
    bindingId: null,
  };

  it('markup in a PAGE label, role or region is rendered as text, never as elements', () => {
    const { container } = renderQuestion(question({ expiresAt: FAR_FUTURE, choices: [hostile] }));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    const label = screen.getByTestId('page-derived-label');
    expect(label.textContent).toBe(hostile.safeLabel);
    expect(container).toHaveTextContent('role: <b>button</b>');
    expect(container).toHaveTextContent('region: <script>alert(2)</script>');
  });

  it('a PAGE label is isolated in <bdi>, marked "Page-derived", styled apart, with its role and region', () => {
    renderQuestion(question({ expiresAt: FAR_FUTURE }));
    const [first] = screen.getAllByTestId('page-derived-label');
    expect(first.tagName).toBe('BDI');
    expect(first).toHaveTextContent('Reference');
    expect(getComputedStyle(first).borderStyle).toBe('dashed');
    const option = first.closest('[data-label-source="PAGE"]') as HTMLElement;
    expect(option).toHaveTextContent(GUIDED_COPY.pageDerived.template);
    expect(option).toHaveTextContent('role: textbox');
    expect(option).toHaveTextContent('region: region-main');
  });

  it('a PAGE choice with region null shows its role and no region', () => {
    renderQuestion(question({ expiresAt: FAR_FUTURE }));
    const second = screen.getAllByTestId('page-derived-label')[1].closest('[data-label-source="PAGE"]') as HTMLElement;
    expect(second).toHaveTextContent('role: textbox');
    expect(second).not.toHaveTextContent('region:');
  });

  it('AUTHORED and SAVED_INPUT labels are never decorated as page-derived', () => {
    const plain: GuidedChoice[] = [
      { choiceId: 'a', safeLabel: 'Order number', labelSource: 'AUTHORED', bindingId: null },
      { choiceId: 's', safeLabel: 'ORDER_REF', labelSource: 'SAVED_INPUT', bindingId: 'b-1' },
    ];
    const { container } = renderQuestion(question({ expiresAt: FAR_FUTURE, choices: plain }));
    expect(screen.queryByTestId('page-derived-label')).toBeNull();
    expect(container).not.toHaveTextContent(GUIDED_COPY.pageDerived.template);
    expect(container.querySelector('[data-label-source="AUTHORED"]')).toHaveTextContent('Order number');
    expect(container.querySelector('[data-label-source="SAVED_INPUT"]')).toHaveTextContent('ORDER_REF');
  });
});

describe('expiry warnings at 60 s and 20 s are visible text, timed from expiresAt (AC-3)', () => {
  const EXPIRES = '2026-10-17T12:00:00Z';
  const at = (secondsBefore: number) => Date.parse(EXPIRES) - secondsBefore * 1000;

  it('thresholds', () => {
    expect(expiryWarning(EXPIRES, at(61))).toBeNull();
    expect(expiryWarning(EXPIRES, at(60))).toBe(GUIDED_COPY.expiresIn60.template);
    expect(expiryWarning(EXPIRES, at(21))).toBe(GUIDED_COPY.expiresIn60.template);
    expect(expiryWarning(EXPIRES, at(20))).toBe(GUIDED_COPY.expiresIn20.template);
    expect(expiryWarning(EXPIRES, at(1))).toBe(GUIDED_COPY.expiresIn20.template);
    expect(expiryWarning(EXPIRES, at(0))).toBeNull();
    expect(expiryWarning('not a time', at(30))).toBeNull();
  });

  it('a question mounted 45 s before expiry warns at once: the clock is expiresAt, not mount time', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(at(45));
    renderQuestion(question({ expiresAt: EXPIRES }));
    expect(screen.getByTestId('guided-expiry-warning')).toHaveTextContent(
      'This question expires within a minute. If it expires, this run will stop and you will need to Run again.',
    );
  });

  it('at 25 s left the warning does not claim 60 seconds (W5 UX-06)', () => {
    const warning = expiryWarning(EXPIRES, at(25));
    expect(warning).not.toContain('60 seconds');
    expect(warning).toBe(GUIDED_COPY.expiresIn60.template);
  });

  it('the warning appears at 60 s and changes at 20 s as time passes', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(at(90));
    renderQuestion(question({ expiresAt: EXPIRES }));
    expect(screen.queryByTestId('guided-expiry-warning')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId('guided-expiry-warning')).toHaveTextContent('expires within a minute');
    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    expect(screen.getByTestId('guided-expiry-warning')).toHaveTextContent(
      'This question expires within 20 seconds. If it expires, this run will stop and you will need to Run again.',
    );
  });
});

describe('narrow layout (AC-8 a)', () => {
  it('the question actions stack and fill the width at the base (narrow) breakpoint', () => {
    renderQuestion(question({ expiresAt: FAR_FUTURE }));
    const actions = screen.getByTestId('guided-question-actions');
    expect(getComputedStyle(actions).flexDirection).toBe('column');
    expect(getComputedStyle(screen.getByRole('button', { name: 'Continue' })).width).toBe('100%');
  });
});
