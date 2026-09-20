import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import fs from 'node:fs';
import path from 'node:path';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { readyDraft } from '@/services/mocks/studio/compileFixtures';
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

function serveDraft() {
  studioMockServer.use(
    ...bootstrapHandlers,
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [readyDraft], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(readyDraft)),
    http.post(`${STUDIO_BASE}/validate-steps`, () => HttpResponse.json({ isValid: true, results: [] })),
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
beforeEach(() => {
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
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ChecksStudioPage />
      </MemoryRouter>
    </Provider>,
  );
  const control = await screen.findByRole('button', { name: 'Run Test' });
  await waitFor(() => expect(control).not.toBeDisabled());
  await userEvent.click(control);
}

describe('AC-21: the page has exactly one playback path', () => {
  it('before any run, the page mounts no <video> at all', async () => {
    serveDraft();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <ChecksStudioPage />
        </MemoryRouter>
      </Provider>,
    );
    await screen.findByRole('button', { name: 'Run Test' });
    // The legacy region rendered a fallback player whenever the store held a source.
    expect(document.querySelectorAll('video')).toHaveLength(0);
    expect(screen.getByTestId('video-evidence-empty')).toBeInTheDocument();
  });

  it('an AVAILABLE snapshot mounts exactly one <video>, and step index 1 seeks to 1.51, not 10', async () => {
    const step = TERMINAL_EVIDENCE_SETTLED.stepResults[1];
    expect(step.stepIndex).toBe(1);
    expect(step.offsetMs).toBe(1510);
    expect(step.offsetMs).not.toBe(step.stepIndex * 10 * 1000);

    await runWithFrames([TERMINAL_EVIDENCE_SETTLED]);
    const seek = await screen.findByTestId('step-seek-1');

    const videos = document.querySelectorAll('video');
    expect(videos).toHaveLength(1);
    expect(videos[0].getAttribute('src')).toBe(
      `${window.location.origin}${TERMINAL_EVIDENCE_SETTLED.videoPath}`,
    );
    expect(videos[0].getAttribute('src')).not.toMatch(/\.mp4/u);

    await userEvent.click(seek);
    expect((document.querySelector('video') as HTMLVideoElement).currentTime).toBe(1.51);
    // The seek also brings the player's tab forward.
    expect(screen.getByRole('tab', { name: 'Proof' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a terminal run whose evidence is still PROCESSING mounts no <video> and offers no seek', async () => {
    await runWithFrames([TERMINAL_EVIDENCE_PROCESSING]);
    await screen.findByText(executionStatusLabel(TERMINAL_EVIDENCE_PROCESSING.status), { selector: '[data-testid="execution-status"] *' });
    await userEvent.click(screen.getByRole('tab', { name: 'Proof' }));
    await screen.findByRole('region', { name: VIDEO_EVIDENCE_NARRATIVES.PROCESSING.title });
    expect(document.querySelectorAll('video')).toHaveLength(0);
    expect(screen.queryByTestId('step-seek-1')).toBeNull();
  });

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
