import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { awaitingDraft } from '@/services/mocks/studio/compileFixtures';
import { renderPanel } from './reviewTestHarness';

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

describe('compact translation review', () => {
  it('keeps the duplicate authored-step list hidden until the user asks to inspect translation details', async () => {
    renderPanel(awaitingDraft, false);

    const control = await screen.findByRole('button', { name: 'Review translation details' });
    expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(control).toHaveAttribute('aria-controls', 'translation-review-details');
    expect(screen.queryByTestId('step-review-list')).toBeNull();
    expect(screen.queryByText(awaitingDraft.steps[0] as string)).toBeNull();

    await userEvent.click(control);

    expect(await screen.findByTestId('step-review-list')).toBeInTheDocument();
    expect((await screen.findByTestId('step-review-row-0')).textContent).toContain(
      awaitingDraft.steps[0],
    );
    expect(screen.getByRole('button', { name: 'Hide translation details' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
