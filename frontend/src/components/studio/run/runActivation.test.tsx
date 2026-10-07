import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import studioApi from '@/services/api/studioApi';
import { needsRevisionDraft, readyDraft } from '@/services/mocks/studio/compileFixtures';
import type { TestDto } from '@/types/studio/studioTypes';
import { RunControl } from './RunControl';

/**
 * VAL-039 — one Run action is one execute, under one idempotency key; and VAL-038 — the Run
 * outcome alerts render in the slot the page gives them rather than inside the header.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ACCEPTED = { executionId: '99999999-9999-9999-9999-999999999999', status: 'PENDING' } as const;

afterEach(() => {
  vi.restoreAllMocks();
});

function stubReady(test: TestDto = readyDraft) {
  // Same cast as compileWait.test.tsx: the gate reads only the fields a TestDto carries.
  vi.spyOn(studioApi, 'getTest').mockImplementation(
    (async () => test) as unknown as typeof studioApi.getTest,
  );
}

describe('VAL-039: one Run action dispatches one execute', () => {
  it('a second activation right after acceptance, before the run is shown, sends nothing', async () => {
    stubReady();
    const executeTest = vi.spyOn(studioApi, 'executeTest').mockResolvedValue(ACCEPTED);
    const onAccepted = vi.fn();
    const user = userEvent.setup({ delay: null });
    const { rerender } = render(
      <RunControl testId={readyDraft.id} onAccepted={onAccepted} isRunning={false} />,
    );

    const run = await screen.findByRole('button', { name: 'Run Test' });
    await waitFor(() => expect(run).not.toBeDisabled());
    await user.click(run);
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));

    // The caller has not re-rendered with the run yet; the button still reads Run Test.
    await user.click(screen.getByRole('button', { name: 'Run Test' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(executeTest).toHaveBeenCalledTimes(1);
    const [, key] = executeTest.mock.calls[0];
    expect(key).toMatch(UUID);

    // Once the caller has shown that run and seen it end, Run is a new action with a new key.
    rerender(<RunControl testId={readyDraft.id} onAccepted={onAccepted} isRunning />);
    rerender(<RunControl testId={readyDraft.id} onAccepted={onAccepted} isRunning={false} />);
    await user.click(screen.getByRole('button', { name: 'Run Test' }));
    await waitFor(() => expect(executeTest).toHaveBeenCalledTimes(2));
    expect(executeTest.mock.calls[1][1]).toMatch(UUID);
    expect(executeTest.mock.calls[1][1]).not.toBe(key);
  });

  it('keeps the 409 COMPILE_REQUIRED retry: compile, then one retry under a key of its own', async () => {
    stubReady();
    vi.spyOn(studioApi, 'compileTest').mockResolvedValue({
      compileRequestId: 'r1',
      compileStatus: 'COMPILING',
    });
    const executeTest = vi
      .spyOn(studioApi, 'executeTest')
      .mockRejectedValueOnce({
        response: { status: 409, data: { error: 'COMPILE_REQUIRED', message: 'stale' } },
      })
      .mockResolvedValueOnce(ACCEPTED);
    const onAccepted = vi.fn();
    const user = userEvent.setup({ delay: null });
    render(<RunControl testId={readyDraft.id} onAccepted={onAccepted} isRunning={false} />);

    const run = await screen.findByRole('button', { name: 'Run Test' });
    await waitFor(() => expect(run).not.toBeDisabled());
    await user.click(run);

    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(executeTest).toHaveBeenCalledTimes(2);
    const [first, retry] = executeTest.mock.calls.map((call) => call[1]);
    expect(first).toMatch(UUID);
    expect(retry).toMatch(UUID);
    expect(retry).not.toBe(first);
  });
});

describe('VAL-038: Run outcome alerts render in the slot the page provides', () => {
  it('puts "Some steps need attention" in the container, outside the control, and keeps "Go to step N"', async () => {
    const refused: TestDto = {
      ...needsRevisionDraft,
      compileDiagnostics: {
        validatorSchemaVersion: '1.0.0',
        artifact: [],
        steps: needsRevisionDraft.steps.map((_, stepIndex) => ({
          stepIndex,
          ok: stepIndex !== 1,
          truncated: false,
          diagnostics:
            stepIndex === 1
              ? [{ code: 'UNSUPPORTED_CAPABILITY', stepIndex, message: 'Not visible.', node: null, excerpt: null }]
              : [],
        })),
        truncated: false,
        attempts: 1,
        exhausted: false,
      },
    };
    stubReady(refused);
    vi.spyOn(studioApi, 'compileTest').mockResolvedValue({
      compileRequestId: 'r',
      compileStatus: 'COMPILING',
    });
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    const onShowStep = vi.fn();

    const { container } = render(
      <RunControl testId={refused.id} runRequest={1} onShowStep={onShowStep} alertsContainer={slot} />,
    );

    const outcome = await screen.findByTestId('run-compile-outcome', {}, { timeout: 10_000 });
    expect(slot).toContainElement(outcome);
    expect(container).not.toContainElement(outcome);
    expect(within(outcome).getByTestId('run-compile-outcome-title')).toHaveTextContent(
      'Some steps need attention',
    );
    await userEvent.setup({ delay: null }).click(within(outcome).getByRole('button', { name: 'Go to step 2' }));
    expect(onShowStep).toHaveBeenCalledWith(1);
    slot.remove();
  });
});
