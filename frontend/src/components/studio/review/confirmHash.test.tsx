import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import {
  awaitingDraft,
  compileReviewDrafts,
  noCandidateArtifactDraft,
} from '@/services/mocks/studio/compileFixtures';
import type { TestDto } from '@/types/studio/studioTypes';
import { CompileReviewPanel, CONFIRM_LABEL } from './CompileReviewPanel';
import { STUDIO_BASE, renderPanel } from './reviewTestHarness';
import { ARTIFACT_HASH_UNAVAILABLE_REASON, readArtifactHash } from './artifactHash';

/**
 * Story 10.11c AC-27 (story 10.10 AC-11b, unblocked by ADR-002 §21) — the confirmation body's
 * four fields come from **one read**, and a hash is never invented.
 *
 * This file replaces `blockedConfirm.test.tsx`, which asserted the production behaviour while the
 * escalation stood: one accessor implementation, answering *unavailable* for every fixture, and a
 * confirm control blocked with the blocker named. That state is gone, and a test asserting it
 * would now be asserting the absence of the thing this story landed.
 *
 * Nothing is mocked here. The accessor is the shipped one.
 */

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

const DECLARED_BODY_FIELDS = [
  'revisionId',
  'artifactHash',
  'sourceRevision',
  'configurationRevision',
] as const;

describe('AC-27: the accessor reads the declared field and derives nothing', () => {
  it('answers from currentCandidateArtifactHash alone, across the whole corpus', () => {
    // Both directions over every fixture: available exactly where the field is a non-empty string,
    // unavailable exactly where it is not. A one-directional "it returns a value" check would pass
    // against an accessor that returned a constant.
    let available = 0;
    let unavailable = 0;
    for (const fixture of compileReviewDrafts) {
      const declared = fixture.currentCandidateArtifactHash;
      const result = readArtifactHash(fixture);
      if (typeof declared === 'string' && declared.length > 0) {
        available += 1;
        expect(result).toEqual({ available: true, value: declared });
      } else {
        unavailable += 1;
        expect(result).toEqual({ available: false, reason: ARTIFACT_HASH_UNAVAILABLE_REASON });
      }
    }
    // The corpus reaches both branches. Without this the loop above is satisfied by a corpus that
    // is entirely one or entirely the other.
    expect(available, 'no fixture carries a hash').toBeGreaterThan(0);
    expect(unavailable, 'no fixture is missing one').toBeGreaterThan(0);
  });

  it('never fabricates, recomputes or defaults a hash [FX-ARTIFACT-ABSENT]', () => {
    // Story 10.10's prohibition, carried verbatim and not relaxed — and now strictly harder to
    // satisfy, because the body carries the artifact a client would be tempted to hash.
    // A draft with a candidate, a full artifact and no hash gets the same refusal as an empty one.
    const empty: TestDto = {
      ...noCandidateArtifactDraft,
      steps: [],
      currentCandidateArtifact: null,
    };
    expect(readArtifactHash(noCandidateArtifactDraft)).toEqual(readArtifactHash(empty));
    expect(readArtifactHash(noCandidateArtifactDraft).available).toBe(false);

    // And a value that merely *looks* like a hash somewhere else on the body is not picked up.
    const decoy: TestDto = {
      ...noCandidateArtifactDraft,
      currentCandidateRevisionId: 'f'.repeat(64),
      steps: ['0123456789abcdef'.repeat(4)],
    };
    expect(readArtifactHash(decoy).available).toBe(false);
  });
});

describe('AC-27: the four fields are byte-identical to the one body they came from', () => {
  it('byte-compares the request against the single GET body, and that body is read once', async () => {
    const reads: string[] = [];
    const bodies: unknown[] = [];

    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => {
        // Every read answers with a **different** draft, so a client assembling the body from two
        // reads cannot accidentally agree with itself. This is ADR-002 §21.3's argument made
        // executable: under candidate B the fourth field would come from a second request and the
        // draft could have recompiled in between.
        const serialized = JSON.stringify({
          ...awaitingDraft,
          sourceRevision: awaitingDraft.sourceRevision + reads.length,
          configurationRevision: awaitingDraft.configurationRevision + reads.length,
          currentCandidateArtifactHash:
            reads.length === 0 ? awaitingDraft.currentCandidateArtifactHash : 'd'.repeat(64),
        });
        reads.push(serialized);
        return new HttpResponse(serialized, {
          headers: { 'Content-Type': 'application/json' },
        });
      }),
      http.post(`${STUDIO_BASE}/tests/:id/confirm-compile`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ ...awaitingDraft, compileStatus: 'READY' });
      }),
    );

    render(<CompileReviewPanel testId={awaitingDraft.id} />);
    await userEvent.click(await screen.findByRole('button', { name: CONFIRM_LABEL }));
    await waitFor(() => expect(bodies).toHaveLength(1));

    const body = bodies[0] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([...DECLARED_BODY_FIELDS].sort());

    // The byte comparison. Every field is checked against the **parsed bytes of one response**,
    // not against the fixture object the test happens to hold — a fixture comparison would be
    // satisfied by a client that re-read and got lucky.
    const served = JSON.parse(reads[0] as string) as TestDto;
    expect(body.revisionId).toBe(served.currentCandidateRevisionId);
    expect(body.artifactHash).toBe(served.currentCandidateArtifactHash);
    expect(body.sourceRevision).toBe(served.sourceRevision);
    expect(body.configurationRevision).toBe(served.configurationRevision);

    // And the four did not come from four reads.
    expect(reads).toHaveLength(1);
  });

  it('assembling the hash from a second read is visible here, which is the discriminating half', async () => {
    // The falsification, run as a live case rather than only recorded: a *second* read is served
    // with a different hash and different revisions, and the assertion is that none of the four
    // fields carries the second read's values. An implementation that refetched before confirming
    // — the natural shape of candidate B — lands here and nowhere else in this file.
    let reads = 0;
    const bodies: Record<string, unknown>[] = [];
    const second = {
      ...awaitingDraft,
      sourceRevision: 99,
      configurationRevision: 98,
      currentCandidateRevisionId: '22222222-2222-2222-2222-2222222222aa',
      currentCandidateArtifactHash: 'b'.repeat(64),
    };

    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => {
        reads += 1;
        return HttpResponse.json(reads === 1 ? awaitingDraft : second);
      }),
      http.post(`${STUDIO_BASE}/tests/:id/confirm-compile`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ ...awaitingDraft, compileStatus: 'READY' });
      }),
    );

    render(<CompileReviewPanel testId={awaitingDraft.id} />);
    await userEvent.click(await screen.findByRole('button', { name: CONFIRM_LABEL }));
    await waitFor(() => expect(bodies).toHaveLength(1));

    const body = bodies[0] as Record<string, unknown>;
    expect(body.artifactHash).not.toBe(second.currentCandidateArtifactHash);
    expect(body.revisionId).not.toBe(second.currentCandidateRevisionId);
    expect(body.sourceRevision).not.toBe(99);
    expect(body.configurationRevision).not.toBe(98);
  });
});

describe('AC-27: no hash, no request — never a computed one', () => {
  it('sends nothing at all when the body came back without a hash [FX-ARTIFACT-ABSENT]', async () => {
    let confirmRequests = 0;
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(noCandidateArtifactDraft)),
      http.post(`${STUDIO_BASE}/tests/:id/confirm-compile`, () => {
        confirmRequests += 1;
        return HttpResponse.json(noCandidateArtifactDraft);
      }),
    );

    render(<CompileReviewPanel testId={noCandidateArtifactDraft.id} />);
    const control = await screen.findByRole('button', { name: CONFIRM_LABEL });
    expect(control).toBeDisabled();

    // The attribute is not the guard. Defeat it and activate programmatically: still nothing.
    control.removeAttribute('disabled');
    control.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((settle) => setTimeout(settle, 50));
    expect(confirmRequests).toBe(0);

    const blocked = await screen.findByTestId('confirm-blocked');
    expect(blocked.textContent).toContain(ARTIFACT_HASH_UNAVAILABLE_REASON);
  });

  it('confirms normally when the hash is there [FX-ARTIFACT-AGREEING-CONTROL]', async () => {
    // The control for the case above: the same surface, the same activation, one request. Without
    // it, "sends nothing" is satisfied by a confirm control that never works at all.
    let confirmRequests = 0;
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(awaitingDraft)),
      http.post(`${STUDIO_BASE}/tests/:id/confirm-compile`, () => {
        confirmRequests += 1;
        return HttpResponse.json({ ...awaitingDraft, compileStatus: 'READY' });
      }),
    );

    renderPanel(awaitingDraft);
    await userEvent.click(await screen.findByRole('button', { name: CONFIRM_LABEL }));
    await waitFor(() => expect(confirmRequests).toBe(1));
    expect(screen.queryByTestId('confirm-blocked')).toBeNull();
  });
});
