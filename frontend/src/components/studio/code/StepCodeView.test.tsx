import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StepCodeView, type StepCodeViewTest } from './StepCodeView';
import { STEP_CODE_COPY } from './stepCodeCopy';

const op = (code: string) => ({
  coordinate: { stepId: 's', ordinal: 0 },
  guardId: 'g0',
  operation: { kind: 'step', code, captures: [], uses: [], sourceHash: 'x' },
});

const ARTIFACT = {
  steps: [
    { stepIndex: 0, stepId: 'id-1', operations: [op('await page.goto(inputs["input-destination"]);')] },
    { stepIndex: 1, stepId: 'id-2', operations: [op("await page.getByRole('button').click();"), op('await page.waitForLoadState();')] },
    { stepIndex: 2, stepId: 'id-3', operations: [op('expect(page.url()).toContain("dashboard");')] },
  ],
};

function testWith(overrides: Partial<StepCodeViewTest> = {}): StepCodeViewTest {
  return {
    steps: [
      { id: 'id-1', text: 'Go to "https://www.citi.com"' },
      { id: 'id-2', text: 'Click "Sign On"' },
      { id: 'id-3', text: 'Check that the URL contains "dashboard"' },
    ],
    readiness: 'READY',
    firstChangedStepId: null,
    confirmedRevisionArtifact: ARTIFACT,
    ...overrides,
  };
}

describe('StepCodeView', () => {
  it('shows each step heading, its authored text and its code', () => {
    render(<StepCodeView test={testWith()} />);
    const blocks = screen.getAllByTestId('step-code-block');
    expect(blocks).toHaveLength(3);
    expect(within(blocks[0]).getByRole('heading', { name: 'Step 1' })).toBeInTheDocument();
    expect(within(blocks[0]).getByText('Go to "https://www.citi.com"')).toBeInTheDocument();
    expect(within(blocks[0]).getByTestId('step-code')).toHaveTextContent('await page.goto(inputs["input-destination"]);');
    // Both operations of step 2 render, in order.
    const codes = within(blocks[1]).getAllByTestId('step-code').map((node) => node.textContent);
    expect(codes).toEqual(["await page.getByRole('button').click();", 'await page.waitForLoadState();']);
    expect(screen.queryByTestId('step-code-changed')).toBeNull();
  });

  it('captions a step that is not in the current draft', () => {
    render(<StepCodeView test={testWith({ steps: [{ id: 'id-1', text: 'Go to "https://www.citi.com"' }] })} />);
    const blocks = screen.getAllByTestId('step-code-block');
    expect(within(blocks[1]).getByRole('heading', { name: 'Step 2' })).toBeInTheDocument();
    expect(within(blocks[1]).getByText(STEP_CODE_COPY.notInDraft)).toBeInTheDocument();
  });

  it('marks the steps at and after firstChangedStepId when NEEDS_RELEARN', () => {
    render(<StepCodeView test={testWith({ readiness: 'NEEDS_RELEARN', firstChangedStepId: 'id-2' })} />);
    const blocks = screen.getAllByTestId('step-code-block');
    expect(within(blocks[0]).queryByTestId('step-code-changed')).toBeNull();
    expect(within(blocks[1]).getByTestId('step-code-changed')).toHaveTextContent(STEP_CODE_COPY.changed);
    expect(within(blocks[2]).getByTestId('step-code-changed')).toBeInTheDocument();
    expect(screen.queryByTestId('step-code-base-note')).toBeNull();
  });

  it('notes that saved learning cannot be reused when the base identity is incomplete', () => {
    render(
      <StepCodeView
        test={testWith({ readiness: 'NEEDS_RELEARN', firstChangedStepId: null, readinessReason: 'BASE_IDENTITY_INCOMPLETE' })}
      />,
    );
    expect(screen.getByTestId('step-code-base-note')).toHaveTextContent(STEP_CODE_COPY.baseIdentityIncomplete);
    expect(screen.getAllByTestId('step-code-block')).toHaveLength(3);
  });

  it.each([
    ['RECORDED', STEP_CODE_COPY.emptyRecorded],
    ['UNLEARNED', STEP_CODE_COPY.emptyOther],
    ['NEEDS_RELEARN', STEP_CODE_COPY.emptyOther],
    ['LEARNING', STEP_CODE_COPY.emptyLearning],
  ] as const)('shows the %s empty state without an artifact', (readiness, copy) => {
    render(<StepCodeView test={testWith({ readiness, confirmedRevisionArtifact: null })} />);
    expect(screen.getByTestId('step-code-empty')).toHaveTextContent(copy);
    expect(screen.queryByTestId('step-code-view')).toBeNull();
  });

  it('renders code with markup as literal text', () => {
    const artifact = { steps: [{ stepIndex: 0, stepId: 'id-1', operations: [op('await page.getByText("<b>bold</b>").click();')] }] };
    const { container } = render(<StepCodeView test={testWith({ confirmedRevisionArtifact: artifact })} />);
    expect(screen.getByTestId('step-code').textContent).toBe('await page.getByText("<b>bold</b>").click();');
    expect(container.querySelector('b')).toBeNull();
  });

  it('copies the code of a block', async () => {
    // userEvent.setup() installs its own clipboard stub, so spy on it after setup.
    const user = userEvent.setup({ delay: null });
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<StepCodeView test={testWith()} />);
    await user.click(screen.getByRole('button', { name: 'Copy code for step 1' }));
    expect(writeText).toHaveBeenCalledWith('await page.goto(inputs["input-destination"]);');
  });
});
