import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import {
  awaitingDraft,
  divergentCandidateDraft,
  noCandidateArtifactDraft,
  translatedTargetDraft,
} from '@/services/mocks/studio/compileFixtures';
import { renderPanel } from './reviewTestHarness';
import { SOURCE_UNAVAILABLE, SUMMARY_UNAVAILABLE } from './StepReviewList';

/**
 * Story 10.11c AC-28 (story 10.10 AC-16b, unblocked by ADR-002 §21) — the summary and the
 * expandable source are rendered from the **artifact**, never from `steps`.
 *
 * **The whole criterion rests on one fixture.** Every other draft in the corpus was authored in
 * English that already reads like the operation the compiler produced — *Click "Sign On"* against
 * a button named `Sign On` — so a rendering derived from `steps` would look near enough right to
 * stay green everywhere. `translatedTargetDraft` is the fixture where the sentence and the
 * validated operation **share no words**: the author asked to *"Sign in with the pilot account"*
 * and the compiler resolved that to a button named `Log On`. A `steps`-derived summary shows
 * "pilot account" and never "Log On"; an artifact-derived one does the reverse. That is the only
 * place on this surface where the defect is visible, and the agreeing corpus is recorded below as
 * the negative control rather than left implicit.
 *
 * The assertions are scoped to the summary slot rather than to the panel, because the authored
 * sentence is rendered a few pixels above it: a panel-wide `toContain` would be satisfied by the
 * author's own line and would prove nothing.
 */

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

describe('AC-28: the summary is the validator’s reading, not the client’s', () => {
  it('renders the compiled target, and never the sentence it was compiled from [FX-ARTIFACT-TRANSLATED-TARGET]', async () => {
    renderPanel(translatedTargetDraft);
    await screen.findByTestId('step-review-list');

    const summary = await screen.findByTestId('step-summary-1');
    // What the validator produced.
    expect(summary.textContent).toContain('Log On');
    expect(summary.textContent).toMatch(/click/i);
    // What the author wrote, which is on screen one element up and must not be in this slot.
    expect(summary.textContent).not.toMatch(/pilot account/i);
    expect(summary.textContent).not.toBe(translatedTargetDraft.steps[1]);

    // And the authored line really is on screen, so "not in the summary" is a statement about
    // where the text is rather than about the text being absent from the page.
    const row = await screen.findByTestId('step-review-row-1');
    expect(row.textContent).toContain('Sign in with the pilot account');
  });

  it('renders the compiled navigation target rather than the author’s description of it [FX-ARTIFACT-TRANSLATED-TARGET]', async () => {
    renderPanel(translatedTargetDraft);
    const summary = await screen.findByTestId('step-summary-0');
    expect(summary.textContent).toContain('https://www.citi.com/personal');
    expect(summary.textContent).not.toMatch(/home page/i);
  });

  it('renders the compiled assertion’s target rather than the sentence [FX-ARTIFACT-TRANSLATED-TARGET]', async () => {
    renderPanel(translatedTargetDraft);
    const summary = await screen.findByTestId('step-summary-2');
    expect(summary.textContent).toContain('account-summary');
    expect(summary.textContent).toMatch(/visible/i);
    expect(summary.textContent).not.toMatch(/loaded/i);
  });

  it('is green on a corpus whose sentences already read like their operations — the negative control [FX-ARTIFACT-AGREEING-CONTROL]', async () => {
    // Recorded as the control, not as coverage. Both a `steps`-derived and an artifact-derived
    // rendering satisfy this, which is exactly the point: a suite made only of fixtures like this
    // one is green with no guard present at all.
    renderPanel(awaitingDraft);
    const summary = await screen.findByTestId('step-summary-1');
    expect(summary.textContent).toContain('Sign On');
  });
});

describe('AC-28: the expandable source is the artifact’s code, verbatim', () => {
  it('expands to the executable source the server produced [FX-ARTIFACT-TRANSLATED-TARGET]', async () => {
    renderPanel(translatedTargetDraft);
    const row = await screen.findByTestId('step-review-row-1');
    await userEvent.click(within(row).getByRole('button', { name: /Show the code for step 2/u }));

    const source = await screen.findByTestId('step-source-1');
    expect(source.textContent).toBe(
      "await page.getByRole('button', { name: 'Log On' }).click();",
    );
    expect(source.textContent).not.toContain(SOURCE_UNAVAILABLE);
  });
});

describe('AC-28: no artifact, no summary — and it says so', () => {
  it('keeps both slots unavailable when the draft carries no candidate artifact [FX-ARTIFACT-ABSENT]', async () => {
    renderPanel(noCandidateArtifactDraft);
    const summary = await screen.findByTestId('step-summary-0');
    expect(summary.textContent).toBe(SUMMARY_UNAVAILABLE);

    const row = await screen.findByTestId('step-review-row-0');
    await userEvent.click(within(row).getByRole('button', { name: /Show the code for step 1/u }));
    const source = await screen.findByTestId('step-source-0');
    expect(source.textContent).toBe(SOURCE_UNAVAILABLE);
    // Nothing is reconstructed from the author's sentence in its place.
    expect(summary.textContent).not.toContain(noCandidateArtifactDraft.steps[0] as string);
  });
});

describe('ADR-002 §21.7: an artifact that disagrees with the draft says so rather than being reconciled', () => {
  it('states the divergence and still renders what was validated [FX-ARTIFACT-DIVERGENT]', async () => {
    // **Defensive, not live.** The merged backend cannot produce this body — `publishInvalid` nulls
    // the candidate on every transition to NEEDS_REVISION, and while a candidate does exist its
    // `originalText` is the draft's current `steps` by `publishCandidate`'s conditional UPDATE. The
    // story records that as a finding against §21.7's premise. The rendering is kept and asserted
    // so the surface cannot silently show a stale summary if the premise ever becomes true.
    renderPanel(divergentCandidateDraft);

    const divergence = await screen.findByTestId('artifact-divergence');
    expect(divergence.textContent).toMatch(/has changed since it was translated/i);

    const summary = await screen.findByTestId('step-summary-1');
    expect(summary.textContent).toContain('Log On');
    expect(summary.textContent).not.toMatch(/sign out/i);
  });

  it('says nothing about divergence when the artifact and the steps agree [FX-ARTIFACT-AGREEING-CONTROL]', async () => {
    renderPanel(awaitingDraft);
    await screen.findByTestId('step-review-list');
    expect(screen.queryByTestId('artifact-divergence')).toBeNull();
  });
});
