import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CompileDiagnostic, CompileStepDiagnostics } from '@/types/studio/studioTypes';
import { refusalNarrative } from './compileDiagnosticNarratives';
import { StepReviewList } from './StepReviewList';

/**
 * VAL-009 — the translator's own refusals (`UNSUPPORTED_CAPABILITY`, `AMBIGUOUS_INTENT`) read as
 * instructions to the author, beside the step they are about, with the model's words as plain text.
 */

function diagnostic(overrides: Partial<CompileDiagnostic>): CompileDiagnostic {
  return { code: 'UNSUPPORTED_CAPABILITY', stepIndex: 1, message: '', node: null, excerpt: null, ...overrides };
}

function entry(stepIndex: number, diagnostics: CompileDiagnostic[]): CompileStepDiagnostics {
  return { stepIndex, ok: diagnostics.length === 0, diagnostics, truncated: false };
}

describe('refusalNarrative', () => {
  it('words UNSUPPORTED_CAPABILITY with the 1-based step and the model message', () => {
    expect(
      refusalNarrative(diagnostic({ stepIndex: 1, message: 'Server CPU is not visible to a browser.' })),
    ).toBe("Step 2 can't be done in a browser test: Server CPU is not visible to a browser. Rewrite or remove it.");
  });

  it('words AMBIGUOUS_INTENT with the 1-based step and the model message', () => {
    expect(
      refusalNarrative(diagnostic({ code: 'AMBIGUOUS_INTENT', stepIndex: 0, message: 'Which "button"?' })),
    ).toBe('Step 1 is ambiguous: Which "button"? Say exactly which element or value you mean.');
  });

  it('keeps a truncation marker and drops an empty message cleanly', () => {
    expect(refusalNarrative(diagnostic({ message: 'Too long…[truncated]' }))).toBe(
      "Step 2 can't be done in a browser test: Too long…[truncated]. Rewrite or remove it.",
    );
    expect(refusalNarrative(diagnostic({ code: 'AMBIGUOUS_INTENT', message: '  ' }))).toBe(
      'Step 2 is ambiguous. Say exactly which element or value you mean.',
    );
  });

  it('leaves validator codes and step-less diagnostics alone', () => {
    expect(refusalNarrative(diagnostic({ code: 'UNKNOWN_TARGET', message: 'x' }))).toBeNull();
    expect(refusalNarrative(diagnostic({ stepIndex: null, message: 'x' }))).toBeNull();
  });
});

describe('CODE tab review list', () => {
  it('renders each refusal in the row of the step it is about, described by that row', () => {
    render(
      <StepReviewList
        steps={['Open the home page', 'Check the server CPU is below 50%', 'Click the button']}
        stepDiagnostics={[
          entry(0, []),
          entry(1, [diagnostic({ stepIndex: 1, message: 'Server CPU is not observable from a page.' })]),
          entry(2, [diagnostic({ code: 'AMBIGUOUS_INTENT', stepIndex: 2, message: 'There are several buttons.' })]),
        ]}
      />,
    );

    const row = screen.getByTestId('step-review-row-1');
    expect(row).toHaveAttribute('aria-describedby', 'step-1-diagnostics');
    expect(within(row).getByTestId('step-refusal-1')).toHaveTextContent(
      "Step 2 can't be done in a browser test: Server CPU is not observable from a page. Rewrite or remove it.",
    );
    expect(within(screen.getByTestId('step-review-row-2')).getByTestId('step-refusal-2')).toHaveTextContent(
      'Step 3 is ambiguous: There are several buttons. Say exactly which element or value you mean.',
    );
    expect(within(screen.getByTestId('step-review-row-0')).queryByTestId('step-refusal-0')).toBeNull();
  });

  it('renders the model message as text, never as markup', () => {
    const { container } = render(
      <StepReviewList
        steps={['Do the thing']}
        stepDiagnostics={[
          entry(0, [diagnostic({ stepIndex: 0, message: '<img src=x onerror="alert(1)"><b>bold</b>' })]),
        ]}
      />,
    );

    expect(screen.getByTestId('step-refusal-0')).toHaveTextContent('<img src=x onerror="alert(1)"><b>bold</b>');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('keeps the server message for a validator code', () => {
    render(
      <StepReviewList
        steps={['Click Sign On']}
        stepDiagnostics={[entry(0, [diagnostic({ code: 'UNKNOWN_TARGET', stepIndex: 0, message: 'Nothing matches this description.' })])]}
      />,
    );

    expect(screen.getByTestId('step-diagnostics-0')).toHaveTextContent('Nothing matches this description.');
    expect(screen.queryByTestId('step-refusal-0')).toBeNull();
  });
});
