import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import studioApi from '@/services/api/studioApi';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
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
  // The gate reads only the fields a TestDto carries.
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

  it('a 409 LEARN_REQUIRED is not retried: one execute, one key, and the refusal is shown', async () => {
    stubReady();
    const executeTest = vi.spyOn(studioApi, 'executeTest').mockRejectedValue({
      response: { status: 409, data: { error: 'LEARN_REQUIRED', message: 'not learned' } },
    });
    const onAccepted = vi.fn();
    const user = userEvent.setup({ delay: null });
    render(<RunControl testId={readyDraft.id} onAccepted={onAccepted} isRunning={false} />);

    const run = await screen.findByRole('button', { name: 'Run Test' });
    await waitFor(() => expect(run).not.toBeDisabled());
    await user.click(run);

    await screen.findByTestId('run-refusal');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(executeTest).toHaveBeenCalledTimes(1);
    expect(executeTest.mock.calls[0][1]).toMatch(UUID);
    expect(onAccepted).not.toHaveBeenCalled();
  });
});

describe('VAL-038: Run outcome alerts render in the slot the page provides', () => {
  it('puts the refusal alert in the container, outside the control', async () => {
    stubReady();
    vi.spyOn(studioApi, 'executeTest').mockRejectedValue({
      response: { status: 409, data: { error: 'LEARN_REQUIRED', message: 'not learned' } },
    });
    const slot = document.createElement('div');
    document.body.appendChild(slot);

    const { container } = render(
      <RunControl testId={readyDraft.id} runRequest={1} alertsContainer={slot} />,
    );

    const refusal = await screen.findByTestId('run-refusal', {}, { timeout: 10_000 });
    expect(slot).toContainElement(refusal);
    expect(container).not.toContainElement(refusal);
    expect(within(refusal).getByTestId('run-refusal-title')).toHaveTextContent(
      'This test has not learned its current steps',
    );
    slot.remove();
  });
});
