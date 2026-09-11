import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { awaitingDraft, draftsByCompileStatus } from '@/services/mocks/studio/compileFixtures';
import { renderPanel, STUDIO_BASE } from './reviewTestHarness';
import { CONFIRM_LABEL } from './CompileReviewPanel';
import { ARTIFACT_HASH_BLOCKED_REASON, readArtifactHash } from './artifactHash';

/**
 * Story 10.10 AC-11b — production behaviour of the confirm control while AC-15 is unruled.
 *
 * Nothing is mocked in this file. This is what ships today: the accessor has exactly one
 * implementation, it answers *unavailable*, and the control is blocked with the blocker named.
 * Recorded **skipped, never passed** in the story; asserted here so "blocked" is a state the
 * suite can see rather than a sentence in a document.
 */

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

describe('AC-11b: the hash the confirmation body requires cannot be obtained', () => {
  it('the accessor has one implementation and it returns unavailable for every fixture', () => {
    for (const fixture of Object.values(draftsByCompileStatus)) {
      const result = readArtifactHash(fixture);
      expect(result.available).toBe(false);
      expect(result.available === false && result.reason).toBe(ARTIFACT_HASH_BLOCKED_REASON);
    }
  });

  it('blocks the confirm control in AWAITING_CONFIRMATION and says why', async () => {
    renderPanel(awaitingDraft);
    const control = await screen.findByRole('button', { name: CONFIRM_LABEL });
    expect(control).toBeDisabled();

    const blocked = await screen.findByTestId('confirm-blocked');
    expect(blocked.textContent).toContain(ARTIFACT_HASH_BLOCKED_REASON);
    expect(blocked.textContent).toMatch(/AC-15/);
  });

  it('sends no confirmation request at all while the hash is unavailable', async () => {
    let confirmRequests = 0;
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(awaitingDraft)),
      http.post(`${STUDIO_BASE}/tests/:id/confirm-compile`, () => {
        confirmRequests += 1;
        return HttpResponse.json(awaitingDraft);
      }),
    );

    renderPanel(awaitingDraft);
    const control = await screen.findByRole('button', { name: CONFIRM_LABEL });
    // The control is inert, so the click cannot reach the handler; the hook refuses as well.
    control.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((settle) => setTimeout(settle, 50));
    expect(confirmRequests).toBe(0);
  });

  it('never fabricates, recomputes or defaults a hash', () => {
    // Behavioural, not a source grep: a draft carrying something that looks like a hash, and a
    // draft carrying nothing at all, get the same refusal. A client-computed `artifactHash` would
    // be the client asserting what the server canonicalized, which is the one thing the
    // conditional transaction exists to check — so the accessor is constant in its input.
    const looksLikeAHash = {
      ...awaitingDraft,
      currentCandidateRevisionId: 'f'.repeat(64),
      steps: ['0123456789abcdef'.repeat(4)],
    };
    const empty = { ...awaitingDraft, steps: [], variables: [], currentCandidateRevisionId: null };

    expect(readArtifactHash(looksLikeAHash)).toEqual(readArtifactHash(empty));
    expect(readArtifactHash(looksLikeAHash)).toEqual({
      available: false,
      reason: ARTIFACT_HASH_BLOCKED_REASON,
    });
  });
});
