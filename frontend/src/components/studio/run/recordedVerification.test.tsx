import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail, fixtureStepId } from '@/services/mocks/studio/authoringState';
import { needsRelearnDraft, readyDraft, recordedDraft, recordedFailedDraft } from '@/services/mocks/studio/readinessFixtures';
import type { TestDetailDto, TestDto } from '@/types/studio/studioTypes';
import type { GuidedStartRequest } from '@/types/studio/studioGuidedTypes';
import { guidedCopy } from '@/components/studio/guided/guidedNarratives';
import { RunControl, RUN_LABEL } from './RunControl';
import { LEARNED_LIMITS_CAPTION, LEARNED_READY_LABEL } from './runEnablement';

/**
 * ADR-SC-008 D5 on the Studio side: a RECORDED draft says it is not verified, names the first step
 * without a PASSED receipt, offers "Verify again" only after a proof that did not finish and
 * "Re-learn from step N" only after a FAILED one, runs as a diagnostic, and never sends a base
 * revision to a learn.
 */

const STUDIO_BASE = '*/api/v1/studio';
const observed: { method: string; url: string }[] = [];
const record = ({ request }: { request: Request }) => {
  observed.push({ method: request.method, url: request.url });
};
const postsTo = (suffix: string) =>
  observed.filter((entry) => entry.method === 'POST' && entry.url.endsWith(suffix));

beforeAll(() => {
  studioMockServer.listen({ onUnhandledRequest: 'error' });
  studioMockServer.events.on('request:start', record);
});
beforeEach(() => {
  observed.length = 0;
});
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => {
  studioMockServer.events.removeListener('request:start', record);
  studioMockServer.close();
});

const startLearnSpy = () => vi.fn(async (_request: GuidedStartRequest) => undefined);

function serve(test: TestDto | TestDetailDto, startLearn = startLearnSpy()) {
  studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(test)));
  render(<RunControl testId={test.id} startLearn={startLearn} />);
  return startLearn;
}

async function settled(): Promise<HTMLElement> {
  const control = await screen.findByRole('button', { name: RUN_LABEL });
  await waitFor(() => expect(control.getAttribute('data-run-mode')).not.toBe('loading'));
  return control;
}

describe('a RECORDED draft', () => {
  it('says "Recorded, not verified (step N)" with N the first unverified step, and is not the learned chip', async () => {
    serve(fixtureDetail(recordedDraft));
    await settled();
    const chip = await screen.findByTestId('guided-readiness-chip');
    expect(chip).toHaveTextContent('Recorded, not verified (step 2)');
    expect(chip.textContent).not.toContain(LEARNED_READY_LABEL);
    expect(chip.textContent).not.toMatch(/learned from this run/u);
    expect(screen.queryByTestId('learned-limits')).toBeNull();
  });

  it('INCOMPLETE offers Verify again and not Re-learn; pressing it posts to /verify once and never starts a learn', async () => {
    const startLearn = serve(fixtureDetail(recordedDraft));
    await settled();
    expect(screen.queryByTestId('relearn-from-step')).toBeNull();
    await userEvent.click(await screen.findByTestId('verify-again'));
    await waitFor(() => expect(postsTo('/verify')).toHaveLength(1));
    expect(postsTo('/execute')).toHaveLength(0);
    expect(startLearn).not.toHaveBeenCalled();
  });

  it('FAILED offers "Re-learn from step N" and not Verify again; it starts a learn from that step with no base revision', async () => {
    const startLearn = serve(fixtureDetail(recordedFailedDraft));
    await settled();
    expect(screen.queryByTestId('verify-again')).toBeNull();
    const button = await screen.findByTestId('relearn-from-step');
    expect(button).toHaveTextContent('Re-learn from step 2');
    await userEvent.click(button);
    await waitFor(() => expect(startLearn).toHaveBeenCalledTimes(1));
    expect(startLearn.mock.calls[0][0]).toMatchObject({ firstLearnStepId: fixtureStepId(1) });
    expect(startLearn.mock.calls[0][0]).not.toHaveProperty('baseRevisionId');
    expect(postsTo('/verify')).toHaveLength(0);
  });

  it('PENDING offers neither action', async () => {
    serve(fixtureDetail({ ...recordedDraft, verification: { state: 'PENDING', firstUnverifiedStepId: fixtureStepId(0) } }));
    await settled();
    expect(screen.queryByTestId('verify-again')).toBeNull();
    expect(screen.queryByTestId('relearn-from-step')).toBeNull();
    expect(screen.getByTestId('recorded-diagnostic-note')).toHaveTextContent(guidedCopy('recordedDiagnosticNote'));
  });

  it('Run executes the recorded revision through the ordinary route (a diagnostic), and starts no learn', async () => {
    const startLearn = serve(fixtureDetail(recordedDraft));
    await userEvent.click(await settled());
    await waitFor(() => expect(postsTo('/execute')).toHaveLength(1));
    expect(startLearn).not.toHaveBeenCalled();
  });
});

describe('the learned state', () => {
  it('READY shows the learned chip with the limits caption (L-1, L-16)', async () => {
    serve(fixtureDetail(readyDraft));
    await settled();
    expect(await screen.findByTestId('guided-readiness-chip')).toHaveTextContent(LEARNED_READY_LABEL);
    expect(screen.getByTestId('learned-limits')).toHaveTextContent(LEARNED_LIMITS_CAPTION);
    expect(LEARNED_LIMITS_CAPTION).toMatch(/side effects/u);
    expect(LEARNED_LIMITS_CAPTION).toMatch(/wrong/u);
  });

  it('a recorded revision plus an edit (NEEDS_RELEARN with a confirmed revision) starts a learn that sends no base revision', async () => {
    const startLearn = serve(fixtureDetail(needsRelearnDraft));
    expect(needsRelearnDraft.confirmedRevisionId).not.toBeNull();
    await userEvent.click(await settled());
    await waitFor(() => expect(startLearn).toHaveBeenCalledTimes(1));
    expect(startLearn.mock.calls[0][0]).not.toHaveProperty('baseRevisionId');
    expect(startLearn.mock.calls[0][0]).toMatchObject({ firstLearnStepId: needsRelearnDraft.firstChangedStepId });
  });
});
