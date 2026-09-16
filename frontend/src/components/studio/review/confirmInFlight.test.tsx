import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { awaitingDraft } from '@/services/mocks/studio/compileFixtures';
import { CompileReviewPanel, CONFIRM_LABEL } from './CompileReviewPanel';
import { STUDIO_BASE, deferred } from './reviewTestHarness';

/**
 * Story 10.11c AC-29 (AD2-1, ruled by @po at story 10.11's wave-6 validation) — the affordance
 * gets its own guard.
 *
 * **Why this file exists at all.** @qa measured that deleting `aria-busy` from the confirm control
 * *and* the in-flight line from the panel left the whole studio suite green: an affordance
 * asserted by nothing. AD2-1 rules that three obligations are separable and that none substitutes
 * for another —
 *
 *  1. the **request-level guard** stays and stays independently falsifiable, which
 *     `confirmFlow.test.tsx` asserts with the `disabled` attribute deliberately defeated;
 *  2. the control is **additionally unavailable** while a confirm is in flight, because a confirm
 *     is an irreversible conditional transaction over four fields from one read (ADR-002 §21.3)
 *     and a second activation either duplicates a request the server will refuse with
 *     `STALE_CANDIDATE` or races it;
 *  3. the affordance has a guard — this file.
 *
 * `aria-busy` tells a screen-reader user that a region is updating. It tells nobody that the
 * control must not be pressed again. That is the whole of why 2 and 3 are not one obligation.
 *
 * **Each obligation gets its own named test**, so a deletion shows up as exactly one red rather
 * than as a diffuse failure, which is what makes the falsification table in the story readable.
 */

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

/**
 * Renders the panel and holds one confirm request open, returning the control and the gate.
 *
 * The window is **constructed**, not hoped for: the handler is entered and then blocks, so every
 * assertion below lands while the request is genuinely open. A `setTimeout`-shaped "probably still
 * in flight" is the mutation-outside-the-measurement-window shape this epic has catalogued.
 */
async function openConfirm() {
  const gate = deferred<void>();
  let requests = 0;

  studioMockServer.use(
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(awaitingDraft)),
    http.post(`${STUDIO_BASE}/tests/:id/confirm-compile`, async () => {
      requests += 1;
      await gate.promise;
      return HttpResponse.json({
        ...awaitingDraft,
        compileStatus: 'READY',
        confirmedRevisionId: awaitingDraft.currentCandidateRevisionId,
      });
    }),
  );

  render(<CompileReviewPanel testId={awaitingDraft.id} />);
  const control = await screen.findByRole('button', { name: CONFIRM_LABEL });
  return { control, gate, requests: () => requests };
}

describe('AD2-1 obligation 2: the confirm control is unavailable while a confirm is in flight', () => {
  it('the confirm control becomes unavailable for the duration of the request and comes back after', async () => {
    const { control, gate, requests } = await openConfirm();

    // Before: available. Without this the assertion below is satisfied by a control that is never
    // available at all, which is the failure mode of every "is disabled" test.
    expect(control).toBeEnabled();

    await userEvent.click(control);
    await waitFor(() => expect(requests()).toBe(1));

    // During: unavailable, measured inside the open window.
    expect(control, 'a second activation would race an irreversible conditional transaction')
      .toBeDisabled();

    gate.resolve();
    // After: the draft is READY, so the control is correctly unavailable again — for the other
    // reason. Asserted by the state that appeared rather than by the attribute, so this case
    // cannot be read as evidence about the in-flight rule.
    await waitFor(() => expect(screen.queryByTestId('confirmed-identity')).not.toBeNull());
    expect(screen.queryByTestId('confirm-in-flight')).toBeNull();
  });
});

describe('AD2-1 obligation 3: the in-flight state is announced, and that is a separate thing', () => {
  it('the confirm control carries aria-busy while the request is open and drops it afterwards', async () => {
    const { control, gate, requests } = await openConfirm();

    expect(control.getAttribute('aria-busy')).toBe('false');

    await userEvent.click(control);
    await waitFor(() => expect(requests()).toBe(1));

    expect(control.getAttribute('aria-busy'), 'a screen-reader user is told the region is updating')
      .toBe('true');
    // And the sighted equivalent, which is a different element and a different failure.
    expect(screen.queryByTestId('confirm-in-flight')).not.toBeNull();

    gate.resolve();
    await waitFor(() => expect(control.getAttribute('aria-busy')).toBe('false'));
  });
});
