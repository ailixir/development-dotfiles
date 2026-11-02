import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, type Location } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { failedNavigationHttpErrorExecution, passedExecution } from '@/services/mocks/studio/executionFixtures';
import { studioVideoUrl } from '@/components/studio/evidence/studioVideoUrl';
import { RUNS_LOAD_ERROR } from '@/components/studio/runs/useStudioRuns';
import { uiTestPath, uiTestRunPath } from '@/components/studio/uiTestPaths';
import { formatRunTime } from '@/components/studio/runs/runPresentation';
import { CANCELLED_ERROR_CODE, type ExecutionSnapshot } from '@/types/studio/studioTypes';
import {
  UI_TEST_LATEST_RUN_EARLIER_VERSION_MESSAGE,
  UI_TEST_LATEST_RUN_EMPTY_MESSAGE,
  UiTestLatestRunCard,
} from './UiTestLatestRunCard';

/**
 * STUDIO-UNIFY-001.7, task 7.1 (AC-06, AC-07, AC-08): the Latest run card alone. It is mounted under
 * the page's route (`ui-tests/:id`), served by the Node MSW server and asserted at it. The card does not
 * read the test, so no test read or store is needed here; the page-level gate is the shell's (7.3).
 */

const STUDIO_BASE = '*/api/v1/studio';
const WAIT = { timeout: 15_000 } as const;
const TEST_TIMEOUT_MS = 60_000;
// The longest wait a poll needs: the first re-read comes after 2 s, the next one 3 s after that.
const NEXT_POLL_GRACE_MS = 3_600;

const TEST_ID = 'c0000000-0000-0000-0000-00000000f301';
const OTHER_TEST_ID = 'c0000000-0000-0000-0000-00000000f302';

/** Run `n`: a distinct 8-character short id, accepted `n` minutes after the first. */
const runIdOf = (n: number) => `e${n.toString(16).padStart(7, '0')}-0000-4000-8000-000000000000`;
const shortOf = (n: number) => runIdOf(n).slice(0, 8);
const videoPathOf = (executionId: string) => `/api/v1/studio/executions/${executionId}/video`;

function runOf(n: number, overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot {
  const minute = String(n % 60).padStart(2, '0');
  const hour = String(Math.floor(n / 60)).padStart(2, '0');
  return {
    ...passedExecution,
    executionId: runIdOf(n),
    testId: TEST_ID,
    testName: 'Checkout journey',
    triggerSource: 'MANUAL',
    acceptedAt: `2026-09-14T${hour}:${minute}:00Z`,
    videoPath: videoPathOf(runIdOf(n)),
    ...overrides,
  };
}

const runningOf = (n: number, overrides: Partial<ExecutionSnapshot> = {}) =>
  runOf(n, {
    status: 'RUNNING',
    durationMs: null,
    endedAt: null,
    revision: 3,
    streamComplete: false,
    video: { status: 'PROCESSING', error: null, expiresAt: null, partial: false },
    videoPath: null,
    ...overrides,
  });

interface ListCall {
  testId: string | null;
  status: string | null;
  sort: string | null;
  page: number;
  size: number;
}

interface Served {
  /** The runs the list endpoint holds, in any order; it sorts by the request's `sort`. */
  runs: ExecutionSnapshot[];
  listCalls: ListCall[];
  /** True: every list request answers 500. */
  failList: boolean;
  /** True: the list ignores the `testId` filter (a server that returned another test's run). */
  ignoreTestId: boolean;
}

/** The list calls that read the run itself; the hook's secondary running-count request is `status=RUNNING`. */
const runReads = (served: Served) => served.listCalls.filter((call) => call.status === null);

function serve(runs: ExecutionSnapshot[] = []): Served {
  const state: Served = { runs, listCalls: [], failList: false, ignoreTestId: false };
  studioMockServer.use(
    http.get(`${STUDIO_BASE}/executions`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const call: ListCall = {
        testId: params.get('testId'),
        status: params.get('status'),
        sort: params.get('sort'),
        page: Number(params.get('page') ?? 0),
        size: Number(params.get('size') ?? 20),
      };
      state.listCalls.push(call);
      if (state.failList) return HttpResponse.json({ error: 'BOOM', message: 'Failed' }, { status: 500 });
      let items = state.runs.filter((run) => state.ignoreTestId || call.testId === null || run.testId === call.testId);
      if (call.status) items = items.filter((run) => run.status === call.status);
      const direction = (call.sort ?? 'acceptedAt,desc').endsWith(',asc') ? 1 : -1;
      items = [...items].sort((a, b) => direction * a.acceptedAt.localeCompare(b.acceptedAt));
      return HttpResponse.json({
        data: items.slice(call.page * call.size, (call.page + 1) * call.size),
        page: call.page,
        size: call.size,
        totalElements: items.length,
        totalPages: Math.max(1, Math.ceil(items.length / call.size)),
      });
    }),
  );
  return state;
}

const here: { current: Location | null } = { current: null };
function LocationProbe() {
  here.current = useLocation();
  return null;
}
const pathname = () => here.current?.pathname;

const cardTree = (onRunTerminal?: () => void, confirmedRevisionId?: string | null) => (
  <MemoryRouter initialEntries={[uiTestPath(TEST_ID)]}>
    <LocationProbe />
    <Routes>
      <Route
        path="/checks/ui-tests/:id"
        element={
          <UiTestLatestRunCard testId={TEST_ID} onRunTerminal={onRunTerminal} confirmedRevisionId={confirmedRevisionId} />
        }
      />
      <Route path="/checks/ui-tests/:id/runs/:executionId" element={<div data-testid="run-drawer-route" />} />
    </Routes>
  </MemoryRouter>
);

function renderCard(onRunTerminal?: () => void, confirmedRevisionId?: string | null) {
  return render(cardTree(onRunTerminal, confirmedRevisionId));
}

const card = () => within(screen.getByTestId('ui-test-latest-run'));
const idText = () => screen.getByTestId('ui-test-latest-run-id').textContent;

/** Nothing of a run: no chip, recording, steps or logs. */
function expectNoRunContent() {
  expect(screen.queryByTestId('ui-test-latest-run-status')).toBeNull();
  expect(screen.queryByTestId('ui-test-latest-run-open')).toBeNull();
  expect(screen.queryByTestId('video-evidence')).toBeNull();
  expect(screen.queryByTestId('video-evidence-player')).toBeNull();
  expect(screen.queryByTestId('execution-progress')).toBeNull();
  expect(screen.queryByTestId('step-text-0')).toBeNull();
  expect(screen.queryByTestId('execution-logs')).toBeNull();
}

async function pause(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

beforeAll(() => {
  studioMockServer.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  cleanup();
  here.current = null;
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

describe('the newest run of an earlier version of the test', { timeout: TEST_TIMEOUT_MS }, () => {
  const CONFIRMED = '22222222-2222-4222-8222-222222222222';
  const EARLIER = '11111111-1111-4111-8111-111111111111';

  it('says so when the newest run\'s revision is not the test\'s confirmed revision (the replay after a re-learn was refused)', async () => {
    serve([runOf(5, { revisionId: EARLIER })]);
    renderCard(undefined, CONFIRMED);

    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    expect(screen.getByTestId('ui-test-latest-run-earlier-version')).toHaveTextContent(
      UI_TEST_LATEST_RUN_EARLIER_VERSION_MESSAGE,
    );
  });

  it('says nothing when the revisions match, when the run has none (legacy history), or when the test has none yet', async () => {
    serve([runOf(5, { revisionId: CONFIRMED })]);
    const first = renderCard(undefined, CONFIRMED);
    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    expect(screen.queryByTestId('ui-test-latest-run-earlier-version')).toBeNull();
    first.unmount();

    studioMockServer.resetHandlers();
    serve([runOf(5, { revisionId: null })]);
    const second = renderCard(undefined, CONFIRMED);
    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    expect(screen.queryByTestId('ui-test-latest-run-earlier-version')).toBeNull();
    second.unmount();

    studioMockServer.resetHandlers();
    serve([runOf(5, { revisionId: EARLIER })]);
    renderCard(undefined, null);
    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    expect(screen.queryByTestId('ui-test-latest-run-earlier-version')).toBeNull();
  });
});

describe('AC-06: the newest replay of this test', { timeout: TEST_TIMEOUT_MS }, () => {
  it('asks for this test\'s newest replay only (testId, size 1, newest first) and shows the newest of a mixed list', async () => {
    // Served oldest first and mixed with another test's newer run: only the request can fix the result.
    const served = serve([
      runOf(1),
      runOf(3),
      runOf(2),
      runOf(9, { testId: OTHER_TEST_ID, testName: 'Another test' }),
    ]);
    renderCard();

    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    expect(idText()).toBe(`#${shortOf(3)}`);
    expect(screen.getByTestId('ui-test-latest-run-time')).not.toHaveTextContent(shortOf(9));

    await waitFor(() => expect(served.listCalls.length).toBeGreaterThanOrEqual(2), WAIT);
    expect(served.listCalls.every((call) => call.testId === TEST_ID)).toBe(true);
    expect(served.listCalls.map((call) => call.status).sort()).toEqual(['RUNNING', null]);
    expect(runReads(served)[0]).toMatchObject({ sort: 'acceptedAt,desc', page: 0, size: 1 });
  });

  it('shows a terminal run as a summary: chip, absolute time, duration, short id and the recording, with no steps, logs or grey status chip', async () => {
    const run = runOf(4, {
      logs: [
        { at: '2026-09-14T00:04:01Z', level: 'INFO', message: 'step 0 started', stepIndex: 0 },
        { at: null, level: 'INFO', message: 'run PASSED', stepIndex: null },
      ],
    });
    serve([run]);
    renderCard();

    expect(await screen.findByText('Latest run')).toBeInTheDocument();
    expect(await screen.findByTestId('ui-test-latest-run-status', {}, WAIT)).toHaveTextContent('Passed');
    expect(screen.getByTestId('ui-test-latest-run-duration')).toHaveTextContent(/^38 s$/);
    const time = screen.getByTestId('ui-test-latest-run-time');
    expect(time).toHaveTextContent(formatRunTime(run.acceptedAt));
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2026-09-14T00:04:00.000Z');
    expect(idText()).toBe(`#${shortOf(4)}`);
    // One meta row, in order: status chip, time, duration, short id.
    expect(screen.getByTestId('ui-test-latest-run-meta').textContent).toBe(
      `Passed${formatRunTime(run.acceptedAt)}\u00b738 s\u00b7#${shortOf(4)}`,
    );
    expect(screen.queryByText(/Requested/)).toBeNull();

    // The recording, through the existing panel, compact: no title or statement.
    expect(card().getByTestId('video-evidence')).toHaveAttribute('data-video-status', 'AVAILABLE');
    expect(card().getByTestId('video-evidence-player')).toHaveAttribute('src', studioVideoUrl(videoPathOf(runIdOf(4))));
    expect(card().queryByTestId('video-evidence-title')).toBeNull();
    expect(card().queryByTestId('video-evidence-statement')).toBeNull();
    // Steps, logs and the grey status chip are in the run's drawer, not here.
    expect(screen.queryByTestId('execution-status')).toBeNull();
    expect(screen.queryByTestId('execution-steps')).toBeNull();
    expect(screen.queryByTestId('step-text-0')).toBeNull();
    expect(screen.queryByTestId('execution-logs')).toBeNull();
    expect(screen.queryByTestId('log-line-0')).toBeNull();
    expect(screen.queryByTestId('ui-test-latest-run-in-progress')).toBeNull();
    expect(screen.queryByRole('button', { name: /run again/i })).toBeNull();
  });

  it('explains a failed run with the failing step, in plain words, and keeps the video', async () => {
    serve([
      runOf(5, {
        status: 'FAILED',
        errorCode: null,
        durationMs: failedNavigationHttpErrorExecution.durationMs,
        stepResults: failedNavigationHttpErrorExecution.stepResults,
        logs: failedNavigationHttpErrorExecution.logs,
      }),
    ]);
    renderCard();

    expect(await screen.findByTestId('ui-test-latest-run-status', {}, WAIT)).toHaveTextContent('Failed');
    expect(card().getByTestId('run-failed-step')).toHaveTextContent('Failed at step 3');
    expect(card().getByTestId('run-failed-step-sentence')).toHaveTextContent(/returned an HTTP error/);
    expect(card().getByTestId('run-failed-step-message')).toHaveTextContent('NAVIGATION_HTTP_ERROR');
    expect(card().getByTestId('video-evidence-player')).toBeInTheDocument();
    // Exactly one "Failed" chip in the card, and no step list or logs.
    expect(screen.queryByTestId('execution-status')).toBeNull();
    expect(screen.queryByTestId('step-status-2')).toBeNull();
    expect(screen.queryByTestId('log-line-0')).toBeNull();
  });

  it('shows the named cause of a run that ended in an error, still without steps or logs', async () => {
    serve([runOf(5, { status: 'ERROR', errorCode: 'DISPATCH_FAILED', durationMs: null, video: { status: 'UNAVAILABLE', error: null, expiresAt: null, partial: false }, videoPath: null })]);
    renderCard();

    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    expect(card().getByTestId('execution-error')).toBeInTheDocument();
    expect(screen.queryByTestId('execution-status')).toBeNull();
    expect(screen.queryByTestId('execution-steps')).toBeNull();
  });

  it('keeps each evidence state\'s own narrative for a terminal run', async () => {
    serve([runOf(6, { video: { status: 'EXPIRED', error: null, expiresAt: '2026-09-15T00:06:00Z', partial: false } })]);
    renderCard();

    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    expect(card().getByTestId('video-evidence')).toHaveAttribute('data-video-status', 'EXPIRED');
    expect(card().queryByTestId('video-evidence-player')).toBeNull();
  });

  it('opens the run in the drawer route with "View details"', async () => {
    serve([runOf(1), runOf(2)]);
    const user = userEvent.setup({ delay: null });
    renderCard();

    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    await user.click(screen.getByRole('button', { name: 'View details' }));

    expect(pathname()).toBe(uiTestRunPath(TEST_ID, runIdOf(2)));
    expect(screen.getByTestId('run-drawer-route')).toBeInTheDocument();
  });

  it('never renders a run of another test, even if the list returns one', async () => {
    const served = serve([runOf(9, { testId: OTHER_TEST_ID, testName: 'Another test' })]);
    served.ignoreTestId = true;
    renderCard();

    expect(await screen.findByTestId('ui-test-latest-run-empty', {}, WAIT)).toBeInTheDocument();
    expectNoRunContent();
    expect(screen.queryByText('Another test')).toBeNull();
    expect(screen.queryByText(`#${shortOf(9)}`)).toBeNull();
  });
});

describe('AC-07: the latest run stays current until it is settled', { timeout: TEST_TIMEOUT_MS }, () => {
  it('shows the in-progress message and no video while running, then updates in place and stops polling', async () => {
    const served = serve([runningOf(1)]);
    renderCard();

    expect(await screen.findByTestId('ui-test-latest-run-status', {}, WAIT)).toHaveTextContent('Running');
    expect(screen.getByTestId('ui-test-latest-run-in-progress')).toHaveTextContent(
      'The browser is running this test. Steps update here as they finish.',
    );
    expect(screen.queryByTestId('video-evidence')).toBeNull();
    expect(screen.queryByTestId('video-evidence-player')).toBeNull();
    // While the run is live the steps still show here (without the grey chip or logs).
    expect(card().getByTestId('execution-steps')).toBeInTheDocument();
    expect(screen.queryByTestId('execution-status')).toBeNull();
    expect(screen.queryByTestId('execution-logs')).toBeNull();

    // The server finishes the replay; the card's background re-read picks it up without any user action.
    served.runs = [runOf(1, { revision: 9 })];
    await waitFor(() => expect(screen.getByTestId('ui-test-latest-run-status')).toHaveTextContent('Passed'), {
      timeout: 20_000,
    });
    expect(await screen.findByTestId('video-evidence-player', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByTestId('ui-test-latest-run-in-progress')).toBeNull();
    expect(screen.getByTestId('ui-test-latest-run-duration')).toHaveTextContent(/^38 s$/);
    // Once terminal it collapses to the summary.
    expect(screen.queryByTestId('execution-steps')).toBeNull();
    expect(runReads(served).length).toBeGreaterThanOrEqual(2);

    // Settled: no further read.
    const settledReads = served.listCalls.length;
    await pause(NEXT_POLL_GRACE_MS);
    expect(served.listCalls).toHaveLength(settledReads);
  });

  it('says the run is waiting for a browser while it is pending', async () => {
    serve([runningOf(1, { status: 'PENDING', startedAt: null })]);
    renderCard();

    expect(await screen.findByTestId('ui-test-latest-run-in-progress', {}, WAIT)).toHaveTextContent(
      'Waiting for a browser. This view updates by itself.',
    );
    expect(screen.getByTestId('ui-test-latest-run-duration')).toHaveTextContent(/^Queued$/);
    expect(screen.queryByTestId('video-evidence')).toBeNull();
  });

  it('keeps polling a terminal run whose recording is still processing, until it settles', async () => {
    const processing = runOf(1, {
      streamComplete: false,
      revision: 5,
      video: { status: 'PROCESSING', error: null, expiresAt: null, partial: false },
      videoPath: null,
    });
    const served = serve([processing]);
    renderCard();

    expect(await screen.findByTestId('ui-test-latest-run-status', {}, WAIT)).toHaveTextContent('Passed');
    expect(screen.getByTestId('video-evidence')).toHaveAttribute('data-video-status', 'PROCESSING');
    expect(screen.queryByTestId('video-evidence-player')).toBeNull();
    // Terminal, so the run is not "in progress": the notice is for a run that has not finished.
    expect(screen.queryByTestId('ui-test-latest-run-in-progress')).toBeNull();

    await waitFor(() => expect(runReads(served).length).toBeGreaterThanOrEqual(2), { timeout: 20_000 });
    served.runs = [runOf(1, { revision: 9 })];
    expect(await screen.findByTestId('video-evidence-player', {}, { timeout: 20_000 })).toHaveAttribute(
      'src',
      studioVideoUrl(videoPathOf(runIdOf(1))),
    );
    expect(screen.getByTestId('video-evidence')).toHaveAttribute('data-video-status', 'AVAILABLE');

    const settledReads = served.listCalls.length;
    await pause(NEXT_POLL_GRACE_MS);
    expect(served.listCalls).toHaveLength(settledReads);
  });

  it('replaces the run with a newer replay started later, on a read', async () => {
    const served = serve([runningOf(1)]);
    renderCard();

    await waitFor(() => expect(idText()).toBe(`#${shortOf(1)}`), WAIT);
    served.runs = [runOf(1, { status: 'ERROR', revision: 9 }), runOf(2)];
    await waitFor(() => expect(idText()).toBe(`#${shortOf(2)}`), { timeout: 20_000 });
    expect(screen.getByTestId('ui-test-latest-run-status')).toHaveTextContent('Passed');
    expect(screen.queryByTestId('ui-test-latest-run-in-progress')).toBeNull();
  });
});

describe('AC-08: no replay, loading and a failed read', { timeout: TEST_TIMEOUT_MS }, () => {
  it('shows a loading indicator on the first read', async () => {
    serve([runOf(1)]);
    renderCard();

    expect(screen.getByTestId('ui-test-latest-run-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('ui-test-latest-run-empty')).toBeNull();
    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    expect(screen.queryByTestId('ui-test-latest-run-loading')).toBeNull();
  });

  it('states there are no replays yet, and that learning happens in Studio, with no video, steps or logs', async () => {
    // Also what a LEARNING or never-run test reads: the list holds no replay (learns are never listed).
    const served = serve([]);
    renderCard();

    const empty = await screen.findByTestId('ui-test-latest-run-empty', {}, WAIT);
    expect(empty).toHaveTextContent(UI_TEST_LATEST_RUN_EMPTY_MESSAGE);
    expect(empty).toHaveTextContent(/no replays yet/i);
    expect(empty).toHaveTextContent(/learning happens in studio/i);
    expect(screen.queryByTestId('ui-test-latest-run-loading')).toBeNull();
    expect(screen.queryByTestId('ui-test-latest-run-error')).toBeNull();
    expectNoRunContent();

    // Nothing to watch: no background read follows.
    const reads = served.listCalls.length;
    await pause(NEXT_POLL_GRACE_MS - 1_000);
    expect(served.listCalls).toHaveLength(reads);
  });

  it('shows the list error with Retry and nothing of a run, and Retry reads again', async () => {
    const served = serve([runOf(1)]);
    served.failList = true;
    const user = userEvent.setup({ delay: null });
    renderCard();

    const alert = await screen.findByTestId('ui-test-latest-run-error', {}, WAIT);
    expect(alert).toHaveTextContent(RUNS_LOAD_ERROR);
    expect(screen.queryByTestId('ui-test-latest-run-empty')).toBeNull();
    expect(screen.queryByTestId('ui-test-latest-run-loading')).toBeNull();
    expectNoRunContent();

    const readsBefore = runReads(served).length;
    served.failList = false;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('ui-test-latest-run-status', {}, WAIT)).toHaveTextContent('Passed');
    expect(runReads(served).length).toBeGreaterThan(readsBefore);
    expect(screen.queryByTestId('ui-test-latest-run-error')).toBeNull();
  });
});

/** A terminal run whose recording is still processing: the card keeps polling until it settles. */
const processingOf = (n: number, overrides: Partial<ExecutionSnapshot> = {}) =>
  runOf(n, {
    streamComplete: false,
    revision: 5,
    video: { status: 'PROCESSING', error: null, expiresAt: null, partial: false },
    videoPath: null,
    ...overrides,
  });

const LONG_WAIT = { timeout: 25_000 } as const;

describe('STUDIO-UNIFY-001.8 AC-03..AC-05: onRunTerminal fires once when a watched run ends', { timeout: TEST_TIMEOUT_MS }, () => {
  it('calls it once for a Running run that the next read returns as Passed, not on later ticks or when the recording settles', async () => {
    const onRunTerminal = vi.fn();
    const served = serve([runningOf(1)]);
    renderCard(onRunTerminal);

    expect(await screen.findByTestId('ui-test-latest-run-status', {}, WAIT)).toHaveTextContent('Running');
    expect(onRunTerminal).not.toHaveBeenCalled();

    // Passed, recording still processing: the transition is seen here, and the card keeps polling.
    served.runs = [processingOf(1, { revision: 9 })];
    await waitFor(() => expect(onRunTerminal).toHaveBeenCalledTimes(1), LONG_WAIT);
    expect(screen.getByTestId('ui-test-latest-run-status')).toHaveTextContent('Passed');

    // The recording settles (streamComplete flips): the same terminal run, no second call.
    const readsAtTerminal = runReads(served).length;
    served.runs = [runOf(1, { revision: 11 })];
    expect(await screen.findByTestId('video-evidence-player', {}, LONG_WAIT)).toBeInTheDocument();
    expect(runReads(served).length).toBeGreaterThan(readsAtTerminal);

    await pause(NEXT_POLL_GRACE_MS);
    expect(onRunTerminal).toHaveBeenCalledTimes(1);
  });

  it('calls it once for a run that goes Pending, Running, then Failed', async () => {
    const onRunTerminal = vi.fn();
    const served = serve([runningOf(1, { status: 'PENDING', startedAt: null })]);
    renderCard(onRunTerminal);

    expect(await screen.findByTestId('ui-test-latest-run-status', {}, WAIT)).toHaveTextContent('Pending');

    served.runs = [runningOf(1, { revision: 4 })];
    await waitFor(() => expect(screen.getByTestId('ui-test-latest-run-status')).toHaveTextContent('Running'), LONG_WAIT);
    expect(onRunTerminal).not.toHaveBeenCalled();

    served.runs = [runOf(1, { status: 'FAILED', revision: 9 })];
    await waitFor(() => expect(onRunTerminal).toHaveBeenCalledTimes(1), LONG_WAIT);
    expect(screen.getByTestId('ui-test-latest-run-status')).toHaveTextContent('Failed');

    await pause(NEXT_POLL_GRACE_MS);
    expect(onRunTerminal).toHaveBeenCalledTimes(1);
  });

  it('calls it once for a run that ends Cancelled (ERROR with errorCode CANCELLED)', async () => {
    const onRunTerminal = vi.fn();
    const served = serve([runningOf(1)]);
    renderCard(onRunTerminal);

    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    served.runs = [runOf(1, { status: 'ERROR', errorCode: CANCELLED_ERROR_CODE, revision: 9 })];
    await waitFor(() => expect(onRunTerminal).toHaveBeenCalledTimes(1), LONG_WAIT);
    expect(screen.getByTestId('ui-test-latest-run-status')).toHaveTextContent('Cancelled');

    await pause(NEXT_POLL_GRACE_MS);
    expect(onRunTerminal).toHaveBeenCalledTimes(1);
  });

  it('never calls it for a run whose first read is already terminal, including while its recording settles', async () => {
    const onRunTerminal = vi.fn();
    const served = serve([processingOf(1)]);
    renderCard(onRunTerminal);

    expect(await screen.findByTestId('ui-test-latest-run-status', {}, WAIT)).toHaveTextContent('Passed');
    await waitFor(() => expect(runReads(served).length).toBeGreaterThanOrEqual(2), LONG_WAIT);
    served.runs = [runOf(1, { revision: 9 })];
    expect(await screen.findByTestId('video-evidence-player', {}, LONG_WAIT)).toBeInTheDocument();

    await pause(NEXT_POLL_GRACE_MS);
    expect(onRunTerminal).not.toHaveBeenCalled();
  });

  it('calls it a second time when a second, newer run is watched from live to terminal', async () => {
    const onRunTerminal = vi.fn();
    const served = serve([runningOf(1)]);
    renderCard(onRunTerminal);

    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    served.runs = [processingOf(1, { revision: 9 })];
    await waitFor(() => expect(onRunTerminal).toHaveBeenCalledTimes(1), LONG_WAIT);

    // A newer replay starts (the card is still polling run 1's recording), and then ends.
    served.runs = [runOf(1, { revision: 11 }), runningOf(2)];
    await waitFor(() => expect(idText()).toBe(`#${shortOf(2)}`), LONG_WAIT);
    expect(screen.getByTestId('ui-test-latest-run-status')).toHaveTextContent('Running');
    expect(onRunTerminal).toHaveBeenCalledTimes(1);

    served.runs = [runOf(1, { revision: 11 }), runOf(2, { revision: 9 })];
    await waitFor(() => expect(onRunTerminal).toHaveBeenCalledTimes(2), LONG_WAIT);
    expect(screen.getByTestId('ui-test-latest-run-status')).toHaveTextContent('Passed');

    await pause(NEXT_POLL_GRACE_MS);
    expect(onRunTerminal).toHaveBeenCalledTimes(2);
  });

  it('calls the latest callback, and a new function identity neither re-fires nor drops the transition', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const served = serve([runningOf(1)]);
    const view = renderCard(first);

    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    view.rerender(cardTree(second));
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(screen.getByTestId('ui-test-latest-run-status')).toHaveTextContent('Running');

    served.runs = [runOf(1, { revision: 9 })];
    await waitFor(() => expect(second).toHaveBeenCalledTimes(1), LONG_WAIT);
    expect(first).not.toHaveBeenCalled();
  });
});
