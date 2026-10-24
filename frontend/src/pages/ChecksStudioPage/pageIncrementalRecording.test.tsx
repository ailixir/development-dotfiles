import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { http, HttpResponse } from 'msw';
import type { TestDetailDto, TestDto } from '@/types/studio/studioTypes';
import type { GuidedResult } from '@/types/studio/studioGuidedTypes';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail, fixtureStepId } from '@/services/mocks/studio/authoringState';
import { unlearnedDraft } from '@/services/mocks/studio/readinessFixtures';
import { setGuidedScenario } from '@/services/mocks/studio/guidedHandlers';
import {
  learnWithSettlingVideo,
  receiptFor,
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
 * STUDIO-OBS-009 round 065 (case436): a FULL guided learn, then an INCREMENTAL relearn on the same
 * mounted page, must end with the incremental recording's player on screen and its step seek
 * control usable.
 *
 * Case436 on the real stack showed, for the incremental session only, three page result reads
 * (the recording was still `PROCESSING` on the first two), a single page video request, and then a
 * harness expectation on the player that timed out. These tests pin what the page owns on that path,
 * with the same sequence in MSW: the poll re-reads while `PROCESSING`, mounts the player from the
 * incremental session's own id (not the FULL one), keeps no recording length from the FULL player,
 * and offers the seek for the step the relearn started from, whether or not the replayed prefix
 * steps carry stamps.
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

describe('FULL learn, then an incremental relearn on the same page', () => {
  it('re-reads the PROCESSING recording, mounts the incremental session\'s own player and offers the edited step\'s seek', async () => {
    const draft = unlearnedDraft;
    // Both sessions: the recording is still `PROCESSING` for the first two result reads.
    setGuidedScenario(learnWithSettlingVideo(2), draft.id);

    let phase: 'unlearned' | 'edited' = 'unlearned';
    /** The test as the server reads it: unlearned, then (after the FULL publication) with step 2 changed. */
    const current = (): TestDto => {
      if (phase === 'unlearned') return draft;
      const followed = store.getState().studio.guidedSessionByTestId[draft.id];
      const receipt = followed ? store.getState().studio.guidedResultById[followed]?.publication.receipt : null;
      return {
        ...draft,
        readiness: 'NEEDS_RELEARN',
        firstChangedStepId: fixtureStepId(1),
        confirmedRevisionId: receipt?.revisionId ?? null,
      };
    };
    studioMockServer.use(
      http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
      http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
      http.get(`${STUDIO_BASE}/tests`, () =>
        HttpResponse.json({ data: [current()], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
      ),
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixtureDetail(current()))),
      // A Save answers with the test as the server now reads it.
      http.put(`${STUDIO_BASE}/tests/:id`, async ({ request }) => {
        const body = (await request.json()) as { steps: TestDetailDto['steps'] };
        return HttpResponse.json({ ...fixtureDetail(current()), steps: body.steps });
      }),
    );
    renderStudioAt(draft.id, <ChecksStudioPage guidedOptions={GUIDED_OPTIONS} />, { wrapper: StoreProvider });
    const runButton = async () => {
      const run = await screen.findByRole('button', { name: 'Run Test' }, WAIT);
      await waitFor(() => expect(run.getAttribute('data-run-mode')).not.toBe('loading'), WAIT);
      await waitFor(() => expect(run).not.toBeDisabled(), WAIT);
      return run;
    };

    // FULL: its player is on screen, and its recording is short.
    await userEvent.setup({ delay: null }).click(await runButton());
    await waitFor(
      () => expect(screen.getByTestId('guided-completion')).toHaveTextContent('Completed — learned from this run.'),
      WAIT,
    );
    const fullPlayer = await screen.findByTestId('video-evidence-player', {}, WAIT);
    const fullSessionId = store.getState().studio.guidedSessionByTestId[draft.id] as string;
    expect(fullPlayer.getAttribute('src')).toBe(studioGuidedApi.videoPath(fullSessionId));
    const fullRevisionId = store.getState().studio.guidedResultById[fullSessionId]?.publication.receipt?.revisionId;
    expect(fullRevisionId).toBeTruthy();
    mediaDuration = 2;
    fireEvent(fullPlayer, new Event('loadedmetadata'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Seek to step 3' })).toBeDisabled(), WAIT);

    // The edit: the server now reads NEEDS_RELEARN from step 2, on the FULL revision.
    phase = 'edited';
    mediaDuration = Number.NaN; // a new element has no metadata yet
    const editor = userEvent.setup({ delay: null });
    await editor.type(screen.getByPlaceholderText('Add new test step...'), 'Click "Continue"{Control>}{Enter}{/Control}');
    await editor.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByTestId('guided-readiness-chip')).toHaveTextContent('Steps changed'), WAIT);
    // Round 067 D3: "Steps as learned" follows the server's readiness instead of saying the steps are
    // still ready to repeat, flags the changed step, and keeps the history fact.
    await waitFor(
      () =>
        expect(screen.getByTestId('plan-explanation-current')).toHaveTextContent(
          'Steps changed — next Run learns from step 2',
        ),
      WAIT,
    );
    expect(screen.getByTestId('plan-step-2')).toHaveTextContent('Changed since this run');
    expect(screen.getAllByTestId('plan-step-changed')).toHaveLength(1);
    expect(screen.getByTestId('plan-explanation')).not.toHaveTextContent('Learned · ready to repeat');
    expect(screen.getByTestId('plan-explanation-history')).toHaveTextContent('Completed — learned from this run.');
    observed.length = 0;

    // INCREMENTAL.
    await userEvent.setup({ delay: null }).click(await runButton());
    await waitFor(
      () => expect(screen.getByTestId('guided-completion')).toHaveTextContent('learned again.'),
      WAIT,
    );
    const incrementalSessionId = store.getState().studio.guidedSessionByTestId[draft.id] as string;
    expect(incrementalSessionId).not.toBe(fullSessionId);
    const start = observed.find((entry) => entry.method === 'POST' && entry.path.endsWith('/guided-sessions'));
    expect(start?.body).toMatchObject({
      baseRevisionId: fullRevisionId,
      firstLearnStepId: fixtureStepId(1),
    });

    // The player is the incremental session's, mounted once the recording settled.
    const player = await screen.findByTestId('video-evidence-player', {}, WAIT);
    expect(player.getAttribute('src')).toBe(studioGuidedApi.videoPath(incrementalSessionId));
    expect(player.getAttribute('src')).not.toBe(studioGuidedApi.videoPath(fullSessionId));
    expect(screen.getByTestId('video-evidence')).toHaveAttribute('data-evidence-kind', 'guided');
    expect(screen.getByTestId('video-evidence')).toHaveAttribute('data-video-status', 'AVAILABLE');

    // Two `PROCESSING` reads and the settled one; the poll then stops.
    expect(resultReads(incrementalSessionId)).toHaveLength(3);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(resultReads(incrementalSessionId)).toHaveLength(3);

    // The FULL player's 2 s length is not carried over: before the new element has metadata the
    // edited step's seek is enabled, and it stays enabled once the new recording's length is known.
    const stepSeek = await screen.findByRole('button', { name: 'Seek to step 2' }, WAIT);
    expect(stepSeek).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Seek to step 3' })).toBeEnabled();
    mediaDuration = 330;
    fireEvent(player, new Event('loadedmetadata'));
    expect(screen.getByRole('button', { name: 'Seek to step 3' })).toBeEnabled();
    await userEvent.setup({ delay: null }).click(stepSeek);
    expect((player as HTMLVideoElement).currentTime).toBe(1.12);
  }, 90_000);
});

describe('an incremental result whose replayed prefix steps carry no stamps', () => {
  const SESSION = 'incremental-session';
  const steps: GuidedStepRef[] = Array.from({ length: 6 }, (_, index) => ({
    stepId: fixtureStepId(index),
    text: `Step ${index + 1}`,
  }));
  const BASE_REVISION = '22222222-2222-4222-8222-222222222222';

  /** Six steps; 1-4 reused from the base revision, 5-6 learned; stamps only for what ran in this recording. */
  function incrementalResult(): GuidedResult {
    const result = resultFor({
      sessionId: SESSION,
      executionId: SESSION,
      outcome: 'SUCCEEDED',
      publication: { status: 'PUBLISHED', receipt: receiptFor(SESSION, 2, { stepId: fixtureStepId(4) }) },
      steps,
      sourceRevision: '5',
      configurationRevision: '1',
      explanation: { completed: 6, reusedBefore: 4, baseRevisionId: BASE_REVISION, failedIndex: null },
      errorCode: null,
      failure: null,
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
    const { videoRef, seekToOffset, recordingDurationMs } = useVideoSeek();
    return (
      <>
        <VideoEvidencePanel ref={videoRef} guided={{ sessionId: SESSION, result }} />
        <GuidedSeekControls result={result} recording={{ durationMs: recordingDurationMs }} onSeek={seekToOffset} />
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
    expect(screen.getByRole('button', { name: 'Seek to step 6' })).toBeEnabled();
    for (const number of [1, 2, 3, 4]) {
      expect(screen.queryByRole('button', { name: `Seek to step ${number}` })).toBeNull();
    }
    expect(screen.getAllByRole('button', { name: /^Seek to action: / })).toHaveLength(2);

    // The recording is long enough for step 5: the seek lands on its stamp.
    mediaDuration = 330;
    fireEvent(player, new Event('loadedmetadata'));
    await userEvent.setup({ delay: null }).click(stepFive);
    expect(player.currentTime).toBe(203.12);
  });

  it('keeps the step-5 seek enabled while the recording length is still unknown (live WebM, duration Infinity)', () => {
    mediaDuration = Number.POSITIVE_INFINITY;
    render(<Surface result={incrementalResult()} />);
    const player = screen.getByTestId('video-evidence-player');
    fireEvent(player, new Event('loadedmetadata'));
    expect(screen.getByRole('button', { name: 'Seek to step 5' })).toBeEnabled();
  });
});
