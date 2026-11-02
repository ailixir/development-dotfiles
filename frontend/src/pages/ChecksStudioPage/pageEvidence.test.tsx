import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { http, HttpResponse } from 'msw';
import fs from 'node:fs';
import path from 'node:path';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail } from '@/services/mocks/studio/authoringState';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
import {
  TERMINAL_EVIDENCE_PROCESSING,
  TERMINAL_EVIDENCE_SETTLED,
  createScriptedTransport,
} from '@/services/mocks/studio/executionScenarios';
import {
  resetExecutionTransportSeam,
  setExecutionTransportSeam,
} from '@/services/api/studioTransportWiring';
import { VIDEO_EVIDENCE_NARRATIVES } from '@/components/studio/evidence';
import { executionStatusLabel } from '@/components/studio/run';
import { renderStudioAt } from '@/test/renderStudioAt';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import ChecksStudioPage from './ChecksStudioPage';

/**
 * Story 10.16a — **AC-21**, and AC-4 where the page mounts the panel.
 *
 * The page has exactly one playback path after this story. It is observed on the real page, with the
 * real store and router, and with the run's snapshots delivered through the production transport
 * abstraction by the scripted implementation 10.11b installs at the same seam.
 *
 * The seek target is **step index 1**, whose `offsetMs` is `1510`. The retired handler sought to
 * `stepIndex * 10`, which is `10` for that step, so the two cannot agree by accident.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';

const bootstrapHandlers = [
  http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
  http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
];

const StoreProvider = ({ children }: { children?: ReactNode }) => <Provider store={store}>{children}</Provider>;

/** Mounts the editor on readyDraft's id, the one test serveDraft lists. */
function renderPage() {
  return renderStudioAt(readyDraft.id, <ChecksStudioPage />, { wrapper: StoreProvider });
}

function serveDraft() {
  studioMockServer.use(
    ...bootstrapHandlers,
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [readyDraft], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixtureDetail(readyDraft))),
    http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
      HttpResponse.json(
        { executionId: TERMINAL_EVIDENCE_SETTLED.executionId, status: 'PENDING' },
        { status: 202 },
      ),
    ),
  );
}

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
  studioMockServer.listen({ onUnhandledRequest: 'error' });
  // The store's import-time bootstrap is settled in-process by the shared setup (ENV-2, see
  // `src/test/setup.ts`), so this file no longer waits for it here.
});
// No per-action timer: interaction speed is not under test, and each delayed action cost a
// macrotask, which pushed these full-page runs past the 5s default under full-suite load (VAL-032).
let user: ReturnType<typeof userEvent.setup>;
beforeEach(() => {
  user = userEvent.setup({ delay: null });
  window.localStorage.clear();
  studioMockServer.use(...bootstrapHandlers);
  store.dispatch(
    fetchSources.fulfilled(
      [{ type: 'UI_TEST', enabled: true, label: 'UI Test (Checks Studio)' }],
      'test',
      undefined,
    ),
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
  resetExecutionTransportSeam();
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

async function runWithFrames(frames: readonly ExecutionSnapshot[]) {
  setExecutionTransportSeam({ primary: createScriptedTransport(frames, 0), fallback: null });
  serveDraft();
  renderPage();
  const control = await screen.findByRole('button', { name: 'Run Test' });
  await waitFor(() => expect(control).not.toBeDisabled());
  await user.click(control);
}

describe('AC-21: the page has exactly one playback path', () => {
  it('before any run, the page mounts no <video> at all', async () => {
    serveDraft();
    renderPage();
    await screen.findByRole('button', { name: 'Run Test' });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Proof', 'Logs', 'Code']);
    expect(screen.getByRole('tab', { name: 'Proof' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Run' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change…' })).toBeNull();
    // The legacy region rendered a fallback player whenever the store held a source.
    expect(document.querySelectorAll('video')).toHaveLength(0);
    // With no run on screen the "Run your test" card is the only empty state.
    expect(screen.getByText('Run your test')).toBeInTheDocument();
    expect(screen.queryByTestId('video-evidence-empty')).toBeNull();
    expect(screen.queryByTestId('test-last-run-status')).toBeNull();
    // A full page render with no interaction to trim; bounded like the run tests below.
  }, 15000);

  it('an AVAILABLE snapshot mounts exactly one <video>, and step index 1 seeks to 1.51, not 10', async () => {
    const step = TERMINAL_EVIDENCE_SETTLED.stepResults[1];
    expect(step.stepIndex).toBe(1);
    expect(step.offsetMs).toBe(1510);
    expect(step.offsetMs).not.toBe(step.stepIndex * 10 * 1000);

    await runWithFrames([TERMINAL_EVIDENCE_SETTLED]);
    const seek = await screen.findByTestId('step-watch-failure-1');
    const proof = screen.getByRole('tabpanel', { name: 'Proof' });
    expect(within(proof).getByTestId('execution-progress')).toBeInTheDocument();
    expect(within(proof).getByTestId('video-evidence-player')).toBeInTheDocument();
    expect(screen.getByTestId('execution-time')).toHaveTextContent(
      `Time ${(TERMINAL_EVIDENCE_SETTLED.durationMs! / 1000).toFixed(1)}s`,
    );

    const videos = document.querySelectorAll('video');
    expect(videos).toHaveLength(1);
    expect(videos[0].getAttribute('src')).toBe(
      `${window.location.origin}${TERMINAL_EVIDENCE_SETTLED.videoPath}`,
    );
    expect(videos[0].getAttribute('src')).not.toMatch(/\.mp4/u);

    await user.click(seek);
    expect((document.querySelector('video') as HTMLVideoElement).currentTime).toBe(1.51);
    // The seek also brings the player's tab forward.
    expect(screen.getByRole('tab', { name: 'Proof' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'Logs' }));
    const logs = screen.getByRole('tabpanel', { name: 'Logs' });
    expect(within(logs).getByText('Live execution logs')).toBeInTheDocument();
    expect(within(logs).queryByTestId('execution-progress')).toBeNull();
    expect(within(logs).queryByTestId('execution-time')).toBeNull();
    expect(within(logs).queryByTestId('video-evidence-player')).toBeNull();
    expect(within(logs).queryByRole('button', { name: /recording/i })).toBeNull();
    expect(within(logs).getByText(TERMINAL_EVIDENCE_SETTLED.logs[0].message)).toBeInTheDocument();
  }, 15000);

  it('VAL-025: a failed step links to the recording at that step, on the Proof tab', async () => {
    const failed: ExecutionSnapshot = {
      ...TERMINAL_EVIDENCE_SETTLED,
      status: 'FAILED',
      stepResults: TERMINAL_EVIDENCE_SETTLED.stepResults.map((step) =>
        step.stepIndex === 1 ? { ...step, status: 'FAIL', message: 'fill failed: no element matched.' } : step,
      ),
    };
    expect(failed.video.status).toBe('AVAILABLE');

    await runWithFrames([failed]);
    const watch = await screen.findByTestId('step-watch-failure-1');
    await user.click(watch);

    expect((document.querySelector('video') as HTMLVideoElement).currentTime).toBe(1.51);
    expect(screen.getByRole('tab', { name: 'Proof' })).toHaveAttribute('aria-selected', 'true');
  }, 15000);

  it('a terminal run whose evidence is still PROCESSING mounts no <video> and offers no seek', async () => {
    await runWithFrames([TERMINAL_EVIDENCE_PROCESSING]);
    await screen.findByText(executionStatusLabel(TERMINAL_EVIDENCE_PROCESSING.status), { selector: '[data-testid="execution-status"] *' });
    await user.click(screen.getByRole('tab', { name: 'Proof' }));
    await screen.findByRole('region', { name: VIDEO_EVIDENCE_NARRATIVES.PROCESSING.title });
    expect(document.querySelectorAll('video')).toHaveLength(0);
    expect(screen.queryByTestId('step-seek-1')).toBeNull();
    // A full page render plus a scripted run, the same flow its AVAILABLE sibling bounds at 15s.
  }, 15000);

  it('the page source no longer carries the retired player, its fallback or its store source', () => {
    /*
     * (a)–(c) as text, because a retired path is an absence the rendered page can only show for the
     * inputs a test thinks of. Comments are stripped first so the explanation of what was retired
     * does not count as the thing itself.
     */
    const source = fs
      .readFileSync(path.resolve(__dirname, 'ChecksStudioPage.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');
    expect(source).not.toMatch(/sample-ui-test/u);
    expect(source).not.toMatch(/videoUrl/u);
    expect(source).not.toMatch(/setVideoUrl/u);
    expect(source).not.toMatch(/\bIndex\s*\*\s*\d/u);
    expect(source).not.toMatch(/<video\b/u);
  });
});

describe('round 067 D6: a finished run refreshes the test once', () => {
  it('a terminal run with settled evidence causes exactly one test re-read, and no "Previous run" chip is shown', async () => {
    let executed = false;
    let readsAfterRun = 0;
    setExecutionTransportSeam({ primary: createScriptedTransport([TERMINAL_EVIDENCE_SETTLED], 0), fallback: null });
    serveDraft();
    studioMockServer.use(
      http.post(`${STUDIO_BASE}/tests/:id/execute`, () => {
        executed = true;
        return HttpResponse.json(
          { executionId: TERMINAL_EVIDENCE_SETTLED.executionId, status: 'PENDING' },
          { status: 202 },
        );
      }),
      http.get(`${STUDIO_BASE}/tests/:id`, () => {
        if (executed) readsAfterRun += 1;
        return HttpResponse.json({ ...fixtureDetail(readyDraft), lastRunStatus: executed ? 'PASSED' : null });
      }),
    );
    renderPage();
    const control = await screen.findByRole('button', { name: 'Run Test' });
    await waitFor(() => expect(control).not.toBeDisabled());
    await user.click(control);
    await waitFor(() => expect(readsAfterRun).toBe(1));
    await screen.findByTestId('video-evidence-player');
    expect(readsAfterRun).toBe(1);
    expect(screen.queryByTestId('test-last-run-status')).toBeNull();
    expect(screen.queryByText(/Previous run:/u)).toBeNull();
  }, 15000);
});

describe('round 067 D7: the evidence card during a live run', () => {
  it('a replay Run that has no snapshot yet says the recording appears when the run ends', async () => {
    // A transport that never delivers a frame keeps the run in flight with no snapshot.
    setExecutionTransportSeam({ primary: createScriptedTransport([], 0), fallback: null });
    await runWithFrames([]);
    await waitFor(() => expect(screen.getByTestId('video-evidence-pending-run')).toHaveTextContent(
      'The recording will appear here when this run ends.',
    ));
    expect(screen.queryByTestId('video-evidence-empty')).toBeNull();
  }, 15000);
});
