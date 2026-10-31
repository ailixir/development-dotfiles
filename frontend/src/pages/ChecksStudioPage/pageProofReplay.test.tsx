import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { http, HttpResponse } from 'msw';
import type { ExecutionSnapshot, TestDto } from '@/types/studio/studioTypes';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail } from '@/services/mocks/studio/authoringState';
import { unlearnedDraft } from '@/services/mocks/studio/readinessFixtures';
import { passedExecution } from '@/services/mocks/studio/executionFixtures';
import { createScriptedTransport } from '@/services/mocks/studio/executionScenarios';
import { setGuidedLatency, setGuidedScenario } from '@/services/mocks/studio/guidedHandlers';
import { LEARN_PROOF_REFUSED_SCENARIO, LEARN_SCENARIO, endsIn } from '@/services/mocks/studio/guidedFixtures';
import {
  resetExecutionTransportSeam,
  setExecutionTransportSeam,
} from '@/services/api/studioTransportWiring';
import type { TransportHost } from '@/services/api/studioExecutionTransport';
import { resetGuidedSessionRuntime } from '@/components/studio/guided/useGuidedSession';
import { renderStudioAt } from '@/test/renderStudioAt';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import { clearGuidedSession, setExecuting } from '@/store/slices/studioSlice';
import ChecksStudioPage from './ChecksStudioPage';

/**
 * "Proof = replay of the published revision" on the real page.
 *
 * A learn that published names its proof in `result.proof`: the replay of the revision it just
 * published, accepted by the backend inside the publication commit (trigger source `AFTER_LEARN`).
 * The page follows that execution through the ordinary subscription (`beginRun`), once, and never
 * calls execute for it. The mock server is the guided MSW mirror (its finalize creates the
 * `AFTER_LEARN` execution); the execution transport is a scripted one that records every
 * subscription, so "subscribed once" is counted at the transport, never at a spy on the page.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';
const WAIT = { timeout: 20_000 } as const;
const TEST_TIMEOUT_MS = 60_000;
const QUIET_MS = 250;
const GUIDED_OPTIONS = { pollIntervalMs: 5, retryDelayMs: 5 } as const;

const bootstrapHandlers = [
  http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
  http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
];

const observed: Array<{ method: string; path: string }> = [];
function record({ request }: { request: Request }) {
  observed.push({ method: request.method, path: new URL(request.url).pathname });
}
const requests = (method: string, pattern: RegExp) =>
  observed.filter((entry) => entry.method === method && pattern.test(entry.path));
const STARTS = /\/studio\/guided-sessions$/u;
const EXECUTES = /\/studio\/tests\/[^/]+\/execute$/u;
const GUIDED_VIDEO = /\/studio\/guided-sessions\/[^/]+\/video$/u;

/** Every execution id the page subscribed to, in order. */
const subscribed: string[] = [];

/**
 * The proof's snapshots: `never` ends (still running), `later` runs then passes, `now` is already
 * passed on the first snapshot (a proof read again long after it ended).
 */
type ProofEnds = 'never' | 'later' | 'now';

function proofFrames(executionId: string, ends: ProofEnds): ExecutionSnapshot[] {
  const base: ExecutionSnapshot = {
    ...passedExecution,
    executionId,
    testId: unlearnedDraft.id,
    triggerSource: 'AFTER_LEARN',
  };
  const running: ExecutionSnapshot = {
    ...base,
    status: 'RUNNING',
    endedAt: null,
    durationMs: null,
    revision: 1,
    streamComplete: false,
    video: { status: 'PROCESSING', error: null, expiresAt: null, partial: false },
    videoPath: null,
    stepResults: base.stepResults.map((step, index) => ({
      ...step,
      status: index === 0 ? ('RUNNING' as const) : ('PENDING' as const),
      offsetMs: null,
      durationMs: null,
    })),
  };
  // A recording's path must be the execution's own route (the transport's rule).
  const passed: ExecutionSnapshot = {
    ...base,
    revision: 2,
    videoPath: `/api/v1/studio/executions/${executionId}/video`,
  };
  return ends === 'now' ? [passed] : ends === 'later' ? [running, passed] : [running];
}

function useProofTransport(ends: ProofEnds): void {
  setExecutionTransportSeam({
    primary: (host: TransportHost) => {
      subscribed.push(host.executionId);
      return createScriptedTransport(proofFrames(host.executionId, ends), 0)(host);
    },
    fallback: null,
  });
}

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function scrollIntoView() {};
  studioMockServer.listen({ onUnhandledRequest: 'error' });
  studioMockServer.events.on('request:start', record);
});
beforeEach(() => {
  observed.length = 0;
  subscribed.length = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
  setGuidedScenario(LEARN_SCENARIO, unlearnedDraft.id);
  store.dispatch(
    fetchSources.fulfilled([{ type: 'UI_TEST', enabled: true, label: 'UI Test (Checks Studio)' }], 'test', undefined),
  );
  store.dispatch(
    fetchFeatures.fulfilled(
      { sources: [], features: [{ key: 'STUDIO', enabled: true, label: 'Checks Studio' }] },
      'test',
      undefined,
    ),
  );
});
afterEach(() => {
  cleanup();
  resetExecutionTransportSeam();
  studioMockServer.resetHandlers();
  resetStudioMocks();
  resetGuidedSessionRuntime();
  store.dispatch(clearGuidedSession({ testId: unlearnedDraft.id }));
  store.dispatch(setExecuting(false));
  window.sessionStorage.clear();
});
afterAll(() => {
  studioMockServer.events.removeListener('request:start', record);
  studioMockServer.close();
});

function serveDraft(draft: TestDto) {
  studioMockServer.use(
    ...bootstrapHandlers,
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [draft], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixtureDetail(draft))),
  );
}

const StoreProvider = ({ children }: { children?: ReactNode }) => <Provider store={store}>{children}</Provider>;
const user = () => userEvent.setup({ delay: null });

function renderPage(search = '') {
  return renderStudioAt(unlearnedDraft.id, <ChecksStudioPage guidedOptions={GUIDED_OPTIONS} />, {
    search,
    wrapper: StoreProvider,
  });
}

async function runButton(): Promise<HTMLElement> {
  const control = await screen.findByRole('button', { name: 'Run Test' }, WAIT);
  await waitFor(() => expect(control.getAttribute('data-run-mode')).not.toBe('loading'), WAIT);
  await waitFor(() => expect(control).not.toBeDisabled(), WAIT);
  return control;
}

async function quiet(ms = QUIET_MS): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

const sessionId = () => store.getState().studio.guidedSessionByTestId[unlearnedDraft.id] as string;
const proofId = () => store.getState().studio.guidedResultById[sessionId()]?.proof?.executionId as string;

describe('a learn that published: its proof is the replay of the published revision', () => {
  it('follows the AFTER_LEARN execution once, never executes for it, and shows the receipt above the replay (no learning video)', async () => {
    useProofTransport('never');
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());

    const receipt = await screen.findByTestId('guided-proof-receipt', {}, WAIT);
    // Only recorded while the proof runs: "learned" is said once the proof snapshot has PASSED.
    expect(receipt).toHaveTextContent('Recorded from this run. The steps count as learned once the replay passes.');
    expect(screen.queryByText('Completed — learned from this run.')).toBeNull();
    // The recorded line is shown once: the "Steps as learned" card below does not repeat it.
    expect(await screen.findByTestId('plan-explanation', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByTestId('plan-explanation-history')).toBeNull();
    expect(screen.getAllByText('Recorded from this run. The steps count as learned once the replay passes.')).toHaveLength(1);
    expect(proofId()).toBeTruthy();
    await waitFor(() => expect(subscribed).toEqual([proofId()]), WAIT);
    await quiet();
    // Subscribed once, however many renders and polls happened; the page started nothing for it.
    expect(subscribed).toEqual([proofId()]);
    expect(requests('POST', EXECUTES)).toHaveLength(0);
    expect(requests('POST', STARTS)).toHaveLength(1);

    // The existing replay view is the proof: its progress, not a learning recording.
    expect(await screen.findByText(/Running step 1 of/u, {}, WAIT)).toBeInTheDocument();
    expect(requests('GET', GUIDED_VIDEO)).toHaveLength(0);
    expect(screen.queryByTestId('guided-attempt')).toBeNull();
    expect(screen.queryByTestId('guided-proof-notice')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Seek to step/u })).toBeNull();
    // Run is off while the proof runs.
    expect(screen.queryByRole('button', { name: 'Run Test' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  }, TEST_TIMEOUT_MS);

  it('when the proof ends, Run is back and the replay (not a learning recording) is the evidence', async () => {
    useProofTransport('later');
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());

    await waitFor(() => expect(screen.getByTestId('video-evidence')).toHaveAttribute('data-evidence-kind', 'replay'), WAIT);
    await runButton();
    expect(screen.getByTestId('guided-proof-receipt')).toHaveTextContent('Completed — learned from this run.');
    expect(subscribed).toEqual([proofId()]);
    expect(requests('POST', EXECUTES)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('while it learns: status only, no video, and one line that Studio replays the learned steps once to record proof (steps run twice)', async () => {
    useProofTransport('never');
    // Slow reads keep the session in its learning states long enough to look at them.
    setGuidedLatency('read', 120);
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());
    const notice = await screen.findByTestId('guided-proof-notice', {}, WAIT);
    expect(notice).toHaveTextContent(
      'When learning ends, Studio replays the learned steps once to record proof, so your steps run twice.',
    );
    expect(screen.queryByTestId('video-evidence')).toBeNull();
    expect(screen.queryByTestId('guided-attempt')).toBeNull();
    expect(subscribed).toEqual([]);
    // Once the learn has published and the page follows its proof, the line is gone.
    await screen.findByTestId('guided-proof-receipt', {}, WAIT);
    expect(screen.queryByTestId('guided-proof-notice')).toBeNull();
    expect(screen.queryByTestId('video-evidence-player')).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('a reload during the proof re-reads the result and subscribes to the same execution again, without a new learn or execute', async () => {
    useProofTransport('never');
    serveDraft(unlearnedDraft);
    const first = renderPage();
    await user().click(await runButton());
    await screen.findByTestId('guided-proof-receipt', {}, WAIT);
    const id = proofId();
    await waitFor(() => expect(subscribed).toEqual([id]), WAIT);

    // Reload: the page and the client store go; the session pointer in session storage stays.
    first.unmount();
    store.dispatch(clearGuidedSession({ testId: unlearnedDraft.id }));
    store.dispatch(setExecuting(false));
    resetGuidedSessionRuntime();
    renderPage();

    await waitFor(() => expect(subscribed).toEqual([id, id]), WAIT);
    expect(await screen.findByTestId('guided-proof-receipt', {}, WAIT)).toHaveTextContent('Recorded from this run');
    await quiet();
    expect(subscribed).toEqual([id, id]);
    expect(requests('POST', STARTS)).toHaveLength(1);
    expect(requests('POST', EXECUTES)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('proof null (the replay was refused): "could not start" line, Run enabled, nothing retries and nothing is subscribed', async () => {
    setGuidedScenario(LEARN_PROOF_REFUSED_SCENARIO, unlearnedDraft.id);
    useProofTransport('never');
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());

    const completion = await screen.findByTestId('guided-completion', {}, WAIT);
    await waitFor(
      () =>
        expect(completion).toHaveTextContent(
          'Studio could not start the proof replay. Run the test to record proof.',
        ),
      WAIT,
    );
    expect(completion).toHaveTextContent('Recorded from this run');
    expect(completion).not.toHaveTextContent('Replaying the saved steps');
    expect(store.getState().studio.guidedResultById[sessionId()]?.proof).toBeNull();
    // Run is the action, and it is enabled.
    await runButton();
    await quiet();
    expect(subscribed).toEqual([]);
    expect(screen.queryByTestId('guided-proof-receipt')).toBeNull();
    expect(requests('POST', EXECUTES)).toHaveLength(0);
    expect(requests('POST', STARTS)).toHaveLength(1);
    expect(requests('GET', GUIDED_VIDEO)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);
});

describe('a learn that did not publish keeps its recording as the learning attempt', () => {
  it('keeps learning recording and seek in Logs, no receipt or proof, and Run enabled', async () => {
    setGuidedScenario(
      endsIn('FAILED', { atStepIndex: 1, failureCode: 'ASSERTION_FAILED', video: 'AVAILABLE' }),
      unlearnedDraft.id,
    );
    useProofTransport('never');
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());

    await screen.findByTestId('learning-recording-in-logs', {}, WAIT);
    expect(document.querySelector('video')).toBeNull();
    expect(screen.getByTestId('guided-completion')).toHaveAttribute('data-kind', 'failed');
    await user().click(screen.getByRole('tab', { name: 'Logs' }));
    expect(await screen.findByTestId('guided-attempt-title', {}, WAIT)).toHaveTextContent('Learning attempt');
    expect(screen.getByTestId('guided-attempt-note')).toHaveTextContent('It is not a proof');
    expect(await screen.findByTestId('video-evidence-player', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByTestId('video-evidence')).toHaveAttribute('data-evidence-kind', 'guided');
    expect(screen.getByRole('button', { name: 'Seek to step 1' })).toBeInTheDocument();
    expect(screen.getByTestId('guided-completion')).toHaveAttribute('data-kind', 'failed');
    expect(screen.queryByTestId('guided-proof-receipt')).toBeNull();
    await runButton();
    expect(subscribed).toEqual([]);
    expect(requests('POST', EXECUTES)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);
});

describe('?autorun=1 and a proof', () => {
  it.each([
    ['refuses access (403)', 'denied'],
    ['is gone (the stream ends with no snapshot)', 'exhausted'],
  ] as const)('a stale learn whose proof execution %s does not swallow the autorun: it runs exactly once', async (_label, ending) => {
    // The first page follows the proof normally; the pointer then outlives the execution.
    useProofTransport('never');
    serveDraft(unlearnedDraft);
    const first = renderPage();
    await user().click(await runButton());
    await screen.findByTestId('guided-proof-receipt', {}, WAIT);
    const id = proofId();
    await waitFor(() => expect(subscribed).toEqual([id]), WAIT);

    first.unmount();
    store.dispatch(clearGuidedSession({ testId: unlearnedDraft.id }));
    store.dispatch(setExecuting(false));
    resetGuidedSessionRuntime();
    resetExecutionTransportSeam();
    // Read again: the subscription ends without ever delivering a frame.
    setExecutionTransportSeam({
      primary: (host: TransportHost) => {
        subscribed.push(host.executionId);
        return {
          kind: 'sse',
          start() {
            setTimeout(() => (ending === 'denied' ? host.denied(403) : host.exhausted()), 0);
          },
          close() {},
        };
      },
      fallback: null,
    });
    renderPage('?autorun=1');

    await waitFor(() => expect(subscribed).toEqual([id, id]), WAIT);
    // The draft is still unlearned in this fixture, so the autorun is a learn: one more start, once.
    await waitFor(() => expect(requests('POST', STARTS)).toHaveLength(2), WAIT);
    await quiet(400);
    expect(requests('POST', STARTS)).toHaveLength(2);
    expect(requests('POST', EXECUTES)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('arriving while the proof still runs starts no second run', async () => {
    useProofTransport('never');
    serveDraft(unlearnedDraft);
    const first = renderPage();
    await user().click(await runButton());
    await screen.findByTestId('guided-proof-receipt', {}, WAIT);
    const id = proofId();
    await waitFor(() => expect(subscribed).toEqual([id]), WAIT);

    // The editor opens again on this test with ?autorun=1 while the proof is still running.
    first.unmount();
    store.dispatch(clearGuidedSession({ testId: unlearnedDraft.id }));
    store.dispatch(setExecuting(false));
    resetGuidedSessionRuntime();
    renderPage('?autorun=1');

    await waitFor(() => expect(subscribed).toEqual([id, id]), WAIT);
    await quiet(400);
    expect(requests('POST', STARTS)).toHaveLength(1);
    expect(requests('POST', EXECUTES)).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Run Test' })).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('arriving after the proof has ended runs as usual', async () => {
    useProofTransport('later');
    serveDraft(unlearnedDraft);
    const first = renderPage();
    await user().click(await runButton());
    await screen.findByTestId('guided-proof-receipt', {}, WAIT);
    await runButton();

    first.unmount();
    store.dispatch(clearGuidedSession({ testId: unlearnedDraft.id }));
    store.dispatch(setExecuting(false));
    resetGuidedSessionRuntime();
    // Read again after it ended: its first snapshot is already terminal.
    resetExecutionTransportSeam();
    useProofTransport('now');
    renderPage('?autorun=1');

    // The draft is still unlearned in this fixture, so the autorun is a learn: one more start.
    await waitFor(() => expect(requests('POST', STARTS)).toHaveLength(2), WAIT);
    expect(requests('POST', EXECUTES)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);
});
