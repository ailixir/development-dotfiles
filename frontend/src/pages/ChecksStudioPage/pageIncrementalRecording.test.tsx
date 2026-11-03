import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { http, HttpResponse } from 'msw';
import type { VideoEvidence } from '@/types/studio/studioTypes';
import type { GuidedResult } from '@/types/studio/studioGuidedTypes';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail, fixtureStepId } from '@/services/mocks/studio/authoringState';
import { unlearnedDraft } from '@/services/mocks/studio/readinessFixtures';
import { setGuidedScenario } from '@/services/mocks/studio/guidedHandlers';
import {
  endsIn,
  resultFor,
  timingsFor,
  type GuidedStepRef,
} from '@/services/mocks/studio/guidedFixtures';
import { resetGuidedSessionRuntime } from '@/components/studio/guided/useGuidedSession';
import { VideoEvidencePanel } from '@/components/studio/evidence/VideoEvidencePanel';
import { GuidedSeekControls } from '@/components/studio/evidence/GuidedSeekControls';
import { useVideoSeek } from '@/components/studio/evidence/useVideoSeek';
import { studioGuidedApi } from '@/services/api/studioGuidedApi';
import { renderStudioAt } from '@/test/renderStudioAt';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import { clearGuidedSession, setExecuting } from '@/store/slices/studioSlice';
import ChecksStudioPage from './ChecksStudioPage';

/**
 * STUDIO-OBS-009 round 065 (case436), re-pointed by "proof = replay of the published revision": the
 * recording the guided player shows is the recording of a learning attempt that did NOT publish. A
 * published learn has none (its proof is the replay, `pageProofReplay.test.tsx`).
 *
 * Case436 on the real stack showed, for the second session only, three page result reads (the
 * recording was still `PROCESSING` on the first two), a single page video request, and then a
 * harness expectation on the player that timed out. These tests pin what the page owns on that path,
 * with the same sequence in MSW: the poll re-reads while `PROCESSING`, labels the recording "Learning
 * attempt", mounts the player from the second session's own id (not the first one's), keeps no
 * recording length from the first player, and offers the seek for the steps the recording stamps,
 * whether or not replayed prefix steps carry stamps.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';
const WAIT = { timeout: 20_000 } as const;
const GUIDED_OPTIONS = { pollIntervalMs: 5, retryDelayMs: 5 } as const;

/** What `HTMLMediaElement.duration` answers in jsdom (which has no media pipeline). */
let mediaDuration = Number.NaN;
Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => mediaDuration });

const observed: Array<{ method: string; path: string; body: unknown }> = [];
function record({ request }: { request: Request }) {
  const entry = { method: request.method, path: new URL(request.url).pathname, body: undefined as unknown };
  observed.push(entry);
  if (request.method === 'POST') {
    void request
      .clone()
      .text()
      .then((text) => {
        entry.body = text ? JSON.parse(text) : null;
      })
      .catch(() => undefined);
  }
}
const resultReads = (sessionId: string) =>
  observed.filter((entry) => entry.method === 'GET' && entry.path.endsWith(`/guided-sessions/${sessionId}/result`));

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function scrollIntoView() {};
  studioMockServer.listen({ onUnhandledRequest: 'error' });
  studioMockServer.events.on('request:start', record);
});
beforeEach(() => {
  observed.length = 0;
  mediaDuration = Number.NaN;
  window.localStorage.clear();
  window.sessionStorage.clear();
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

const StoreProvider = ({ children }: { children?: ReactNode }) => <Provider store={store}>{children}</Provider>;

describe('a learn that does not publish, then another on the same page', () => {
  it('shows the kept recording as the failed run\'s steps and player, re-reads it while PROCESSING, and mounts each session\'s own player and seek', async () => {
    const draft = unlearnedDraft;
    // Both sessions stop at step 2; the recording is still `PROCESSING` for the first two result reads.
    setGuidedScenario(
      endsIn('FAILED', { atStepIndex: 1, failureCode: 'ASSERTION_FAILED', video: 'AVAILABLE', videoProcessingReads: 2 }),
      draft.id,
    );
    studioMockServer.use(
      http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
      http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
      http.get(`${STUDIO_BASE}/tests`, () =>
        HttpResponse.json({ data: [draft], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
      ),
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixtureDetail(draft))),
    );
    renderStudioAt(draft.id, <ChecksStudioPage guidedOptions={GUIDED_OPTIONS} />, { wrapper: StoreProvider });
    const runButton = async () => {
      const run = await screen.findByRole('button', { name: 'Run Test' }, WAIT);
      await waitFor(() => expect(run.getAttribute('data-run-mode')).not.toBe('loading'), WAIT);
      await waitFor(() => expect(run).not.toBeDisabled(), WAIT);
      return run;
    };

    // First attempt: the recording is the learning attempt, not a proof.
    await userEvent.setup({ delay: null }).click(await runButton());
    const firstPlayer = await screen.findByTestId('video-evidence-player', {}, WAIT);
    expect(screen.queryByTestId('learning-recording-in-logs')).toBeNull();
    expect(within(screen.getByRole('tabpanel', { name: 'Proof' })).getByTestId('video-evidence-player')).toBe(firstPlayer);
    const firstSessionId = store.getState().studio.guidedSessionByTestId[draft.id] as string;
    expect(firstPlayer.getAttribute('src')).toBe(studioGuidedApi.videoPath(firstSessionId));
    const attempt = screen.getByTestId('guided-attempt');
    expect(within(attempt).getByTestId('execution-steps')).toBeInTheDocument();
    expect(within(attempt).getByTestId('video-evidence-player')).toBe(firstPlayer);
    expect(screen.queryByText('Learning attempt')).toBeNull();
    expect(screen.queryByTestId('guided-proof-receipt')).toBeNull();
    expect(screen.queryByTestId('guided-proof-notice')).toBeNull();
    expect(screen.getByRole('button', { name: 'Seek to step 1' })).toBeEnabled();
    expect(screen.getByTestId('step-watch-failure-1')).toBeInTheDocument();
    // The poll stopped after the settled read: two PROCESSING reads and the AVAILABLE one.
    expect(resultReads(firstSessionId)).toHaveLength(3);

    // Second attempt, same mounted page.
    mediaDuration = Number.NaN; // a new element has no metadata yet
    observed.length = 0;
    await userEvent.setup({ delay: null }).click(await runButton());
    await waitFor(
      () => {
        const id = store.getState().studio.guidedSessionByTestId[draft.id];
        expect(id).toBeTruthy();
        expect(id).not.toBe(firstSessionId);
        expect(resultReads(id as string)).toHaveLength(3);
      },
      WAIT,
    );
    const secondSessionId = store.getState().studio.guidedSessionByTestId[draft.id] as string;
    const player = await screen.findByTestId('video-evidence-player', {}, WAIT);
    expect(player.getAttribute('src')).toBe(studioGuidedApi.videoPath(secondSessionId));
    expect(player.getAttribute('src')).not.toBe(studioGuidedApi.videoPath(firstSessionId));
    expect(screen.getByTestId('video-evidence')).toHaveAttribute('data-evidence-kind', 'guided');
    expect(resultReads(secondSessionId)).toHaveLength(3);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(resultReads(secondSessionId)).toHaveLength(3);

    // Each session's list seeks its own player: the seek is enabled before the new element has metadata,
    // and stays enabled once the new recording's length is known.
    const stepSeek = await screen.findByRole('button', { name: 'Seek to step 1' }, WAIT);
    expect(stepSeek).toBeEnabled();
    mediaDuration = 330;
    fireEvent(player, new Event('loadedmetadata'));
    expect(screen.getByRole('button', { name: 'Seek to step 1' })).toBeEnabled();
    await userEvent.setup({ delay: null }).click(stepSeek);
    expect((player as HTMLVideoElement).currentTime).toBe(0.12);
    expect(screen.getByRole('tab', { name: 'Proof' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel', { name: 'Proof' })).getByTestId('video-evidence-player')).toBe(player);
    expect(player).toBeInTheDocument();
    // A learning attempt is never followed by a proof replay.
    expect(observed.filter((entry) => /\/studio\/executions\//u.test(entry.path))).toHaveLength(0);
  }, 90_000);
});

describe('an incremental attempt whose replayed prefix steps carry no stamps', () => {
  const SESSION = 'incremental-session';
  const steps: GuidedStepRef[] = Array.from({ length: 6 }, (_, index) => ({
    stepId: fixtureStepId(index),
    text: `Step ${index + 1}`,
  }));
  const BASE_REVISION = '22222222-2222-4222-8222-222222222222';

  /**
   * Six steps; 1-4 reused from the base revision, 5-6 learned and the attempt stopped at step 6, so it
   * did not publish and its recording is kept; stamps only for what ran in this recording.
   */
  function incrementalResult(): GuidedResult {
    const result = resultFor({
      sessionId: SESSION,
      executionId: SESSION,
      outcome: 'FAILED',
      publication: { status: 'REFUSED', receipt: null },
      steps,
      sourceRevision: '5',
      configurationRevision: '1',
      explanation: { completed: 5, reusedBefore: 4, baseRevisionId: BASE_REVISION, failedIndex: 5 },
      errorCode: 'ASSERTION_FAILED',
      failure: { code: 'ASSERTION_FAILED' },
      detail: null,
      relearnedFrom: { stepId: fixtureStepId(4) },
      video: 'AVAILABLE',
      timedSteps: 6,
    });
    const learned = new Set([fixtureStepId(4), fixtureStepId(5)]);
    // A realistic offset: the replayed prefix is not on this timeline, step 5 starts minutes in.
    result.actionTimings = timingsFor(steps, 6)
      .filter((timing) => learned.has(timing.stepId))
      .map((timing) => ({
        ...timing,
        startMs: timing.startMs + 199_000,
        endMs: timing.endMs === null ? null : timing.endMs + 199_000,
      }));
    return result;
  }

  function Surface({ result }: { result: GuidedResult }) {
    const { videoRef, seekToOffset } = useVideoSeek();
    const video = result.evidence.video as VideoEvidence;
    return (
      <>
        <VideoEvidencePanel
          ref={videoRef}
          guided={{ sessionId: SESSION, result: { executionId: result.executionId, evidence: { video } } }}
        />
        <GuidedSeekControls result={result} onSeek={seekToOffset} />
      </>
    );
  }

  it('renders the player from the incremental session and the step-5 seek, and no seek for the unstamped prefix', async () => {
    const result = incrementalResult();
    expect(result.explanation.steps.slice(0, 4).every((step) => step.reusedFrom !== null && !step.learnedFromThisRun)).toBe(true);
    render(<Surface result={result} />);

    const player = screen.getByTestId('video-evidence-player') as HTMLVideoElement;
    expect(player.getAttribute('src')).toBe(studioGuidedApi.videoPath(SESSION));
    expect(screen.getByTestId('video-evidence')).toHaveAttribute('data-evidence-kind', 'guided');

    const stepFive = screen.getByRole('button', { name: 'Seek to step 5' });
    expect(stepFive).toBeEnabled();
    // Step 6 is where the attempt stopped: it offers "Watch the recording at this step", not a plain seek.
    expect(screen.queryByRole('button', { name: 'Seek to step 6' })).toBeNull();
    expect(screen.getByTestId('step-watch-failure-5')).toBeEnabled();
    expect(screen.getByTestId('step-status-5')).toHaveAttribute('data-status', 'FAIL');
    for (const number of [1, 2, 3, 4]) {
      expect(screen.getByRole('button', { name: `Seek to step ${number}: not attempted` })).toBeDisabled();
      expect(screen.queryByRole('button', { name: `Seek to step ${number}` })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: /^Seek to action/ })).toBeNull();

    // The recording is long enough for step 5: the seek lands on its stamp.
    mediaDuration = 330;
    fireEvent(player, new Event('loadedmetadata'));
    await userEvent.setup({ delay: null }).click(stepFive);
    expect(player.currentTime).toBe(203.12);
  });
});
