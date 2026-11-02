import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useParams, type Location } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { passedExecution } from '@/services/mocks/studio/executionFixtures';
import { createScriptedTransport } from '@/services/mocks/studio/executionScenarios';
import { resetExecutionTransportSeam, setExecutionTransportSeam } from '@/services/api/studioTransportWiring';
import { uiTestPath, uiTestRunPath } from '@/components/studio/uiTestPaths';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { formatRunTime } from '@/components/studio/runs/runPresentation';
import { UiTestRecentRunsCard } from './UiTestRecentRunsCard';

/**
 * STUDIO-UNIFY-001.2 task 2.17 (AC-12, AC-13, AC-25) as moved by STUDIO-UNIFY-001.7 task 7.2: the Recent
 * Runs card is mounted alone, under the page's route shape (`ui-tests/:id` with an element-less
 * `runs/:executionId` child), so it reads `executionId` the way it does on the page. The shell's test-read
 * gate, the header chip and the Overview are the page's own and are tested in `UiTestDetailsPage.test.tsx`.
 * Everything is served by the Node MSW server and asserted at it.
 */

const STUDIO_BASE = '*/api/v1/studio';
// The drawer's not-found wording (RunDetailsDrawer), spelled out so a silent copy change is caught.
const RUN_NOT_FOUND_MESSAGE = 'This run was not found. It may have been removed, or you may not have access to it.';
const WAIT = { timeout: 15_000 } as const;
const TEST_TIMEOUT_MS = 60_000;

const TEST_ID = 'c0000000-0000-0000-0000-00000000f201';
const OTHER_TEST_ID = 'c0000000-0000-0000-0000-00000000f202';

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
  runOf(n, { status: 'RUNNING', durationMs: null, endedAt: null, revision: 3, streamComplete: false, ...overrides });

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
  /** Runs readable by id that the list does not hold (other tests, off-page). */
  readable: ExecutionSnapshot[];
  listCalls: ListCall[];
  readCalls: string[];
}

interface ServeOptions {
  runs?: ExecutionSnapshot[];
  readable?: ExecutionSnapshot[];
}

function serve({ runs = [], readable = [] }: ServeOptions = {}): Served {
  const state: Served = { runs, readable, listCalls: [], readCalls: [] };
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
      let items = state.runs.filter((run) => call.testId === null || run.testId === call.testId);
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
    http.get(`${STUDIO_BASE}/executions/:id`, ({ params }) => {
      const id = String(params.id);
      state.readCalls.push(id);
      const found = [...state.runs, ...state.readable].find((run) => run.executionId === id);
      return found
        ? HttpResponse.json(found)
        : HttpResponse.json({ error: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
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

/** Stands in for the page shell: reads the route id and hands it to the card as its prop. */
function CardHost() {
  const { id } = useParams<{ id: string }>();
  return <UiTestRecentRunsCard testId={id ?? ''} />;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route path="/checks/ui-tests/:id" element={<CardHost />}>
          <Route path="runs/:executionId" element={null} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const rowOf = (n: number) => screen.getByTestId(`run-${runIdOf(n)}`);
const drawer = () => within(screen.getByTestId('run-details'));

/** Nothing of a run's content: no title, steps, logs, status or video. */
function expectNoRunContent() {
  expect(screen.queryByTestId('run-details-title')).toBeNull();
  expect(screen.queryByTestId('step-text-0')).toBeNull();
  expect(screen.queryByTestId('video-evidence-player')).toBeNull();
  expect(screen.queryByRole('button', { name: /logs/i })).toBeNull();
  expect(screen.queryByTestId('run-details-status')).toBeNull();
}

beforeAll(() => {
  studioMockServer.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  here.current = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  studioMockServer.resetHandlers();
  resetStudioMocks();
  resetExecutionTransportSeam();
});
afterAll(() => studioMockServer.close());

describe('AC-04: the Recent Runs card lists this test\'s replays', { timeout: TEST_TIMEOUT_MS }, () => {
  it('sends testId = the route id on the list and running-count requests, and lists rows newest first', async () => {
    // Served oldest first and mixed with another test's run: only the request can fix the result.
    const served = serve({
      runs: [runOf(1), runOf(3), runOf(2), runOf(9, { testId: OTHER_TEST_ID, testName: 'Another test' })],
    });
    renderAt(uiTestPath(TEST_ID));

    await screen.findByTestId(`run-${runIdOf(3)}`, {}, WAIT);
    const rows = screen.getAllByTestId(/^run-e/);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      `run-${runIdOf(3)}`,
      `run-${runIdOf(2)}`,
      `run-${runIdOf(1)}`,
    ]);
    expect(screen.queryByTestId(`run-${runIdOf(9)}`)).toBeNull();

    await waitFor(() => expect(served.listCalls.length).toBeGreaterThanOrEqual(2), WAIT);
    expect(served.listCalls.every((call) => call.testId === TEST_ID)).toBe(true);
    expect(served.listCalls.map((call) => call.status).sort()).toEqual(['RUNNING', null]);
    const list = served.listCalls.find((call) => call.status === null);
    expect(list).toMatchObject({ sort: 'acceptedAt,desc', page: 0 });
  });

  it('lists Time, Status, Duration, Actions: the time first with its short id beneath, "View details" last, no note or origin', async () => {
    serve({ runs: [runOf(1, { triggerSource: 'SCHEDULED' }), runOf(2), runOf(3, { triggerSource: 'AFTER_LEARN' })] });
    const user = userEvent.setup({ delay: null });
    renderAt(uiTestPath(TEST_ID));

    await screen.findByTestId(`run-${runIdOf(2)}`, {}, WAIT);
    expect(within(screen.getByTestId('ui-test-recent-runs')).getByText('Recent Runs')).toBeInTheDocument();
    expect(screen.queryByTestId('ui-test-runs-note')).toBeNull();

    // The columns mirror the HTTP check table: Time first, Actions last; no Run, Requested, Test or System.
    const table = screen.getByRole('table', { name: 'Runs of this UI test' });
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Time', 'Status', 'Duration', 'Actions']);

    // The first cell is the absolute run time with the short id as a plain caption (not a link).
    const row = within(rowOf(2));
    const cells = within(rowOf(2)).getAllByRole('cell');
    expect(cells).toHaveLength(4);
    expect(cells[0]).toHaveTextContent(formatRunTime(runOf(2).acceptedAt));
    expect(row.getByTestId('run-time')).toHaveTextContent(formatRunTime(runOf(2).acceptedAt));
    expect(row.getByTestId('run-id')).toHaveTextContent(`#${shortOf(2)}`);
    expect(within(cells[0]).queryByRole('link')).toBeNull();
    expect(row.queryAllByRole('link')).toHaveLength(0);
    expect(within(cells[3]).getByRole('button', { name: 'View details' })).toBeInTheDocument();

    // The test name, the origin and the queue wait are not repeated in the row; there is no row menu.
    expect(rowOf(2)).not.toHaveTextContent('Checkout journey');
    expect(within(rowOf(1)).queryByText('Scheduled')).toBeNull();
    expect(within(rowOf(3)).queryByText('After learning')).toBeNull();
    expect(row.queryByText('Manual')).toBeNull();
    expect(row.queryByTestId('run-queue-wait')).toBeNull();
    expect(row.queryByRole('button', { name: /more actions/i })).toBeNull();

    // "View details" opens the drawer and does not open it twice (the row click is stopped).
    await user.click(within(cells[3]).getByRole('button', { name: 'View details' }));
    expect(pathname()).toBe(uiTestRunPath(TEST_ID, runIdOf(2)));
  });

  it('reaches the next page through the existing paging', async () => {
    const runs = Array.from({ length: 30 }, (_, index) => runOf(index + 1));
    const served = serve({ runs });
    const user = userEvent.setup({ delay: null });
    renderAt(uiTestPath(TEST_ID));

    await screen.findByTestId(`run-${runIdOf(30)}`, {}, WAIT);
    expect(screen.getAllByTestId(/^run-e/)).toHaveLength(10);
    expect(screen.getByTestId(`run-${runIdOf(21)}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`run-${runIdOf(20)}`)).toBeNull();
    expect(screen.getByText('1–10 of 30')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next page/i }));

    await screen.findByTestId(`run-${runIdOf(20)}`, {}, WAIT);
    await waitFor(() => expect(screen.getAllByTestId(/^run-e/)).toHaveLength(10), WAIT);
    expect(screen.queryByTestId(`run-${runIdOf(30)}`)).toBeNull();
    expect(screen.getByText('11–20 of 30')).toBeInTheDocument();
    const second = served.listCalls.find((call) => call.status === null && call.page === 1);
    expect(second).toMatchObject({ testId: TEST_ID, sort: 'acceptedAt,desc', size: 10 });
  });

  it('keeps the pager structure the phone layout relies on (STUDIO-UNIFY-001.6 AC-06; pixels in e2e)', async () => {
    serve({ runs: Array.from({ length: 30 }, (_, index) => runOf(index + 1)) });
    renderAt(uiTestPath(TEST_ID));

    await screen.findByTestId(`run-${runIdOf(30)}`, {}, WAIT);
    const pager = screen.getByTestId('ui-test-runs-pagination');
    expect(within(pager).getByText('1–10 of 30')).toBeInTheDocument();
    expect(within(pager).getByRole('button', { name: /previous page/i })).toBeInTheDocument();
    expect(within(pager).getByRole('button', { name: /next page/i })).toBeInTheDocument();
    // The rows-per-page selector is still rendered (hidden below `xl` by CSS, which jsdom does not apply).
    expect(pager.querySelector('.MuiTablePagination-input')).not.toBeNull();
  });

  it('opens the drawer at ui-tests/{id}/runs/{executionId} from a row, titled with the run time, with copy-link on the ui-tests URL', async () => {
    serve({ runs: [runOf(1), runOf(2)] });
    const user = userEvent.setup({ delay: null });
    renderAt(uiTestPath(TEST_ID));

    await screen.findByTestId(`run-${runIdOf(2)}`, {}, WAIT);
    expect(screen.queryByTestId('run-details')).toBeNull();

    await user.click(within(rowOf(2)).getByTestId('run-time'));

    expect(pathname()).toBe(uiTestRunPath(TEST_ID, runIdOf(2)));
    const title = await screen.findByTestId('run-details-title', {}, WAIT);
    expect(title).toHaveTextContent(formatRunTime(runOf(2).acceptedAt));
    expect(screen.getByTestId('run-details')).toHaveAttribute('data-execution-id', runIdOf(2));

    await user.click(drawer().getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}${uiTestRunPath(TEST_ID, runIdOf(2))}`,
    );

    // Closing returns to the detail page URL.
    await user.click(drawer().getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(pathname()).toBe(uiTestPath(TEST_ID)), WAIT);
  });

  it('opens the same drawer when the run URL is opened directly, including a run off the first page', async () => {
    const runs = Array.from({ length: 30 }, (_, index) => runOf(index + 1));
    const served = serve({ runs });
    renderAt(uiTestRunPath(TEST_ID, runIdOf(1)));

    // Run 1 is the oldest, so it is on page two: the drawer reads it by id.
    const title = await screen.findByTestId('run-details-title', {}, WAIT);
    expect(title).toHaveTextContent(formatRunTime(runOf(1).acceptedAt));
    expect(screen.getByTestId('run-details')).toHaveAttribute('data-execution-id', runIdOf(1));
    expect(drawer().getByTestId('step-text-0')).toBeInTheDocument();
    expect(served.readCalls).toEqual([runIdOf(1)]);
    expect(served.listCalls.every((call) => call.testId === TEST_ID)).toBe(true);
  });

  it('updates a running execution live in the drawer and in its row', async () => {
    serve({ runs: [runningOf(1)] });
    const finished = runOf(1, { revision: 9 });
    setExecutionTransportSeam({ primary: createScriptedTransport([finished], 30), fallback: null });
    renderAt(uiTestRunPath(TEST_ID, runIdOf(1)));

    await screen.findByTestId(`run-${runIdOf(1)}`, {}, WAIT);
    await waitFor(() => expect(drawer().getByTestId('run-details-status')).toHaveTextContent('Passed'), WAIT);
    await waitFor(() => expect(within(rowOf(1)).getByTestId('run-status')).toHaveTextContent('Passed'), WAIT);
    expect(screen.queryByTestId('run-details-not-found')).toBeNull();
  });
});

describe('AC-13: a run is shown only under its own test', { timeout: TEST_TIMEOUT_MS }, () => {
  it('shows not-found, and none of the run, for a run URL that belongs to another test', async () => {
    const foreign = runOf(7, { testId: OTHER_TEST_ID, testName: 'Another test' });
    const served = serve({ runs: [runOf(1)], readable: [foreign] });
    renderAt(uiTestRunPath(TEST_ID, foreign.executionId));

    const notFound = await screen.findByTestId('run-details-not-found', {}, WAIT);
    expect(notFound).toHaveTextContent(RUN_NOT_FOUND_MESSAGE);
    expect(served.readCalls).toEqual([foreign.executionId]);
    expectNoRunContent();
    expect(screen.queryByText('Another test')).toBeNull();
    expect(screen.queryByTestId('run-details-loading')).toBeNull();
    // The list is still this test's own.
    expect(await screen.findByTestId(`run-${runIdOf(1)}`, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByTestId(`run-${foreign.executionId}`)).toBeNull();
  });

  it('switches the open drawer to not-found, and keeps the snapshot out of the list, when a live snapshot belongs to another test', async () => {
    const own = runningOf(1);
    serve({ runs: [own] });
    const foreignLive = runOf(1, { testId: OTHER_TEST_ID, testName: 'Another test', revision: 9 });
    setExecutionTransportSeam({ primary: createScriptedTransport([foreignLive], 30), fallback: null });
    renderAt(uiTestRunPath(TEST_ID, own.executionId));

    // First paint is the list row of this test; then the foreign frame arrives.
    expect(await screen.findByTestId('run-details-not-found', {}, WAIT)).toHaveTextContent(RUN_NOT_FOUND_MESSAGE);
    expectNoRunContent();
    expect(screen.queryByText('Another test')).toBeNull();
    // The foreign frame never reached the row, which still reads as this test's running replay.
    expect(within(rowOf(1)).getByTestId('run-status')).toHaveTextContent('Running');
    expect(within(rowOf(1)).getByTestId('run-status')).not.toHaveTextContent('Passed');
  });
});

describe('AC-25: replays and learns in the Recent Runs card', { timeout: TEST_TIMEOUT_MS }, () => {
  it('shows a replay in progress and updates it to its terminal state', async () => {
    const served = serve({ runs: [runningOf(1)] });
    renderAt(uiTestPath(TEST_ID));

    const row = await screen.findByTestId(`run-${runIdOf(1)}`, {}, WAIT);
    expect(within(row).getByTestId('run-status')).toHaveTextContent('Running');

    // The server finishes the replay; the list's live refresh picks it up without any user action.
    served.runs = [runOf(1, { revision: 9 })];
    await waitFor(() => expect(within(rowOf(1)).getByTestId('run-status')).toHaveTextContent('Passed'), { timeout: 20_000 });
    expect(within(rowOf(1)).getByTestId('run-status')).not.toHaveTextContent('Running');
    expect(served.listCalls.filter((call) => call.status === null).length).toBeGreaterThanOrEqual(2);
    expect(served.listCalls.every((call) => call.testId === TEST_ID)).toBe(true);
  });

  it('lists no entry for a learn: a LEARNING test has no replay, so the card shows its empty text and no row', async () => {
    // The server does not return learns from /executions; this test has no replay.
    const served = serve({ runs: [] });
    renderAt(uiTestPath(TEST_ID));

    expect(await screen.findByTestId('ui-test-runs-empty', {}, WAIT)).toHaveTextContent(
      'No replays yet. Run the test from Studio and its result appears here.',
    );
    expect(screen.queryAllByTestId(/^run-e/)).toHaveLength(0);
    expect(screen.queryByTestId('run-time')).toBeNull();
    expect(screen.queryByTestId('ui-test-runs-pagination')).toBeNull();
    expect(served.listCalls.every((call) => call.testId === TEST_ID)).toBe(true);
  });
});
