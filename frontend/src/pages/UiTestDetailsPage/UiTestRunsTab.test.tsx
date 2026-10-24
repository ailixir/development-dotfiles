import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, type Location } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { passedExecution } from '@/services/mocks/studio/executionFixtures';
import { createScriptedTransport } from '@/services/mocks/studio/executionScenarios';
import { fixtureDetail } from '@/services/mocks/studio/authoringState';
import { readyDraft, learningDraft } from '@/services/mocks/studio/readinessFixtures';
import { resetExecutionTransportSeam, setExecutionTransportSeam } from '@/services/api/studioTransportWiring';
import { TEST_NOT_AVAILABLE_MESSAGE } from '@/components/studio/StudioUnavailable';
import { uiTestEditorPath, uiTestPath, uiTestRunPath, uiTestRunsPath } from '@/components/studio/uiTestPaths';
import type { ExecutionSnapshot, TestDto } from '@/types/studio/studioTypes';
import checksSlice from '@/store/slices/checksSlice';
import csiSlice from '@/store/slices/csiSlice';
import studioSlice from '@/store/slices/studioSlice';
import reportsSlice from '@/store/slices/reportsSlice';
import uiSlice from '@/store/slices/uiSlice';
import dashboardSlice from '@/store/slices/dashboardSlice';
import sourcesSlice, { fetchSources } from '@/store/slices/sourcesSlice';
import featuresSlice, { fetchFeatures } from '@/store/slices/featuresSlice';
import UiTestDetailsPage from './UiTestDetailsPage';
import { UiTestOverviewTab } from './UiTestOverviewTab';
import { UiTestRunsTab } from './UiTestRunsTab';

/**
 * STUDIO-UNIFY-001.2, task 2.17, the Runs-tab half (AC-12, AC-13, AC-25): the tab is mounted through
 * the real nested routes (`ui-tests/:id` with `runs` and `runs/:executionId`) so the shell's test-read
 * gate applies. Everything is served by the Node MSW server and asserted at it.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';
// The drawer's not-found wording (RunDetailsDrawer), spelled out so a silent copy change is caught.
const RUN_NOT_FOUND_MESSAGE = 'This run was not found. It may have been removed, or you may not have access to it.';
const WAIT = { timeout: 15_000 } as const;
const TEST_TIMEOUT_MS = 60_000;

const TEST_ID = 'c0000000-0000-0000-0000-00000000f201';
const OTHER_TEST_ID = 'c0000000-0000-0000-0000-00000000f202';
const test: TestDto = { ...readyDraft, id: TEST_ID, name: 'Checkout journey', environment: 'UAT' };

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
  testReads: string[];
}

interface ServeOptions {
  test?: TestDto;
  /** Status of the test read; 200 serves the test. */
  testStatus?: number;
  /** Holds the test read until released. */
  testGate?: Promise<void>;
  runs?: ExecutionSnapshot[];
  readable?: ExecutionSnapshot[];
}

function serve({ test: served = test, testStatus = 200, testGate, runs = [], readable = [] }: ServeOptions = {}): Served {
  const state: Served = { runs, readable, listCalls: [], readCalls: [], testReads: [] };
  studioMockServer.use(
    http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
    http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
    http.get(`${API_BASE}/csi`, () =>
      HttpResponse.json({ data: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, async ({ params }) => {
      state.testReads.push(String(params.id));
      if (testGate) await testGate;
      if (testStatus !== 200) {
        return HttpResponse.json({ error: 'STUDIO_FORBIDDEN', message: 'No' }, { status: testStatus });
      }
      return params.id === served.id
        ? HttpResponse.json(fixtureDetail(served))
        : HttpResponse.json({ error: 'STUDIO_FORBIDDEN', message: 'No' }, { status: 403 });
    }),
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

function makeStore() {
  return configureStore({
    reducer: {
      checks: checksSlice,
      csi: csiSlice,
      studio: studioSlice,
      reports: reportsSlice,
      ui: uiSlice,
      dashboard: dashboardSlice,
      sources: sourcesSlice,
      features: featuresSlice,
    },
  });
}

/** A store whose bootstrap reads have settled with both switches on. */
function settledStore() {
  const store = makeStore();
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
  return store;
}

const here: { current: Location | null } = { current: null };
function LocationProbe() {
  here.current = useLocation();
  return null;
}
const pathname = () => here.current?.pathname;

function renderAt(path: string) {
  const store = settledStore();
  const Wrapper = ({ children }: { children?: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route path="/checks/ui-tests/:id" element={<UiTestDetailsPage />}>
          <Route index element={<UiTestOverviewTab />} />
          <Route path="runs" element={<UiTestRunsTab />} />
          <Route path="runs/:executionId" element={<UiTestRunsTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
    { wrapper: Wrapper },
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

describe('AC-12: the Runs tab lists this test\'s replays', { timeout: TEST_TIMEOUT_MS }, () => {
  it('sends testId = the route id on the list and running-count requests, and lists rows newest first', async () => {
    // Served oldest first and mixed with another test's run: only the request can fix the result.
    const served = serve({
      runs: [runOf(1), runOf(3), runOf(2), runOf(9, { testId: OTHER_TEST_ID, testName: 'Another test' })],
    });
    renderAt(uiTestRunsPath(TEST_ID));

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

  it('gates every row and the drawer on the successful test read', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const served = serve({ testGate: gate, runs: [runOf(1)] });
    renderAt(uiTestRunPath(TEST_ID, runIdOf(1)));

    expect(await screen.findByTestId('ui-test-detail-loading')).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(served.testReads).toEqual([TEST_ID]);
    expect(screen.queryByTestId('ui-test-runs-tab')).toBeNull();
    expect(screen.queryByTestId(`run-${runIdOf(1)}`)).toBeNull();
    expect(screen.queryByTestId('run-details')).toBeNull();
    expectNoRunContent();
    expect(served.listCalls).toEqual([]);
    expect(served.readCalls).toEqual([]);

    release();
    expect(await screen.findByTestId(`run-${runIdOf(1)}`, {}, WAIT)).toBeInTheDocument();
    expect(await screen.findByTestId('run-details-title', {}, WAIT)).toBeInTheDocument();
    expect(served.listCalls.every((call) => call.testId === TEST_ID)).toBe(true);
  });

  it('puts the note and the tab\'s own header above rows that link by short id, with no Open test', async () => {
    serve({ runs: [runOf(1, { triggerSource: 'SCHEDULED' }), runOf(2)] });
    const user = userEvent.setup({ delay: null });
    renderAt(uiTestRunsPath(TEST_ID));

    await screen.findByTestId(`run-${runIdOf(2)}`, {}, WAIT);
    expect(screen.getByTestId('ui-test-runs-note')).toHaveTextContent(
      'Runs lists replays of this test. Learning happens in Studio.',
    );

    // The tab's own header: a Run column and no Test column.
    const table = screen.getByRole('table', { name: 'Runs of this UI test' });
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Run', 'Status', 'System', 'Requested', 'Duration', 'Actions']);
    expect(headers).not.toContain('Test');

    // The short id is the row's only link, and the test's name is not repeated in the row.
    const row = within(rowOf(2));
    const link = row.getByTestId('run-link');
    expect(link).toHaveTextContent(`#${shortOf(2)}`);
    expect(link).toHaveAttribute('href', uiTestRunPath(TEST_ID, runIdOf(2)));
    expect(row.getAllByRole('link')).toHaveLength(1);
    expect(rowOf(2)).not.toHaveTextContent('Checkout journey');
    expect(within(rowOf(1)).getByText('Scheduled')).toBeInTheDocument();
    expect(row.getByText('Manual')).toBeInTheDocument();

    // The row menu offers no 'Open test'.
    await user.click(row.getByRole('button', { name: `More actions for run #${shortOf(2)}` }));
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(items).toEqual(['Open run', 'Copy link']);
    expect(screen.queryByText(/open test/i)).toBeNull();
  });

  it('reaches the next page through the existing paging', async () => {
    const runs = Array.from({ length: 30 }, (_, index) => runOf(index + 1));
    const served = serve({ runs });
    const user = userEvent.setup({ delay: null });
    renderAt(uiTestRunsPath(TEST_ID));

    await screen.findByTestId(`run-${runIdOf(30)}`, {}, WAIT);
    expect(screen.getAllByTestId(/^run-e/)).toHaveLength(25);
    expect(screen.getByTestId(`run-${runIdOf(6)}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`run-${runIdOf(5)}`)).toBeNull();
    expect(screen.getByText('1–25 of 30')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next page/i }));

    await screen.findByTestId(`run-${runIdOf(5)}`, {}, WAIT);
    await waitFor(() => expect(screen.getAllByTestId(/^run-e/)).toHaveLength(5), WAIT);
    expect(screen.queryByTestId(`run-${runIdOf(30)}`)).toBeNull();
    expect(screen.getByText('26–30 of 30')).toBeInTheDocument();
    const second = served.listCalls.find((call) => call.status === null && call.page === 1);
    expect(second).toMatchObject({ testId: TEST_ID, sort: 'acceptedAt,desc', size: 25 });
  });

  it('opens the drawer at ui-tests/{id}/runs/{executionId} from a row, with the test link and copy-link on the ui-tests URLs', async () => {
    serve({ runs: [runOf(1), runOf(2)] });
    const user = userEvent.setup({ delay: null });
    renderAt(uiTestRunsPath(TEST_ID));

    await screen.findByTestId(`run-${runIdOf(2)}`, {}, WAIT);
    expect(screen.queryByTestId('run-details')).toBeNull();

    await user.click(within(rowOf(2)).getByTestId('run-link'));

    expect(pathname()).toBe(uiTestRunPath(TEST_ID, runIdOf(2)));
    const title = await screen.findByTestId('run-details-title', {}, WAIT);
    expect(title).toHaveTextContent('Checkout journey');
    expect(screen.getByTestId('run-details')).toHaveAttribute('data-execution-id', runIdOf(2));
    expect(within(title).getByRole('link')).toHaveAttribute('href', uiTestEditorPath(TEST_ID));

    await user.click(drawer().getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}${uiTestRunPath(TEST_ID, runIdOf(2))}`,
    );

    // Closing returns to the runs list URL.
    await user.click(drawer().getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(pathname()).toBe(uiTestRunsPath(TEST_ID)), WAIT);
  });

  it('opens the same drawer when the run URL is opened directly, including a run off the first page', async () => {
    const runs = Array.from({ length: 30 }, (_, index) => runOf(index + 1));
    const served = serve({ runs });
    renderAt(uiTestRunPath(TEST_ID, runIdOf(1)));

    // Run 1 is the oldest, so it is on page two: the drawer reads it by id.
    const title = await screen.findByTestId('run-details-title', {}, WAIT);
    expect(title).toHaveTextContent('Checkout journey');
    expect(screen.getByTestId('run-details')).toHaveAttribute('data-execution-id', runIdOf(1));
    expect(within(title).getByRole('link')).toHaveAttribute('href', uiTestEditorPath(TEST_ID));
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

  it('shows only the not-available message when the test read answers 403 and the execution read would answer 200', async () => {
    const own = runOf(1);
    const served = serve({ testStatus: 403, runs: [own] });
    renderAt(uiTestRunPath(TEST_ID, own.executionId));

    expect(await screen.findByText(TEST_NOT_AVAILABLE_MESSAGE, {}, WAIT)).toBeInTheDocument();
    expect(screen.getByTestId('ui-test-detail-unavailable')).toHaveTextContent(TEST_NOT_AVAILABLE_MESSAGE);
    // Give a stray request time to arrive, then check that none did and nothing of the run rendered.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(served.testReads).toEqual([TEST_ID]);
    expect(served.readCalls).toEqual([]);
    expect(served.listCalls).toEqual([]);
    expect(screen.queryByTestId('ui-test-runs-tab')).toBeNull();
    expect(screen.queryByTestId('run-details')).toBeNull();
    expect(screen.queryByTestId(`run-${own.executionId}`)).toBeNull();
    expectNoRunContent();
    expect(screen.queryByText('Checkout journey')).toBeNull();
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

describe('AC-25: replays and learns in the Runs tab', { timeout: TEST_TIMEOUT_MS }, () => {
  it('shows a replay in progress and updates it to its terminal state', async () => {
    const served = serve({ runs: [runningOf(1)] });
    renderAt(uiTestRunsPath(TEST_ID));

    const row = await screen.findByTestId(`run-${runIdOf(1)}`, {}, WAIT);
    expect(within(row).getByTestId('run-status')).toHaveTextContent('Running');

    // The server finishes the replay; the list's live refresh picks it up without any user action.
    served.runs = [runOf(1, { revision: 9 })];
    await waitFor(() => expect(within(rowOf(1)).getByTestId('run-status')).toHaveTextContent('Passed'), { timeout: 20_000 });
    expect(within(rowOf(1)).getByTestId('run-status')).not.toHaveTextContent('Running');
    expect(served.listCalls.filter((call) => call.status === null).length).toBeGreaterThanOrEqual(2);
    expect(served.listCalls.every((call) => call.testId === TEST_ID)).toBe(true);
  });

  it('lists no entry for a learn: a LEARNING test shows no row, and the chip and Overview read Learning', async () => {
    const learning: TestDto = { ...learningDraft, id: TEST_ID, name: 'Checkout journey', environment: 'UAT' };
    // The server does not return learns from /executions; this test has no replay.
    const served = serve({ test: learning, runs: [] });
    const user = userEvent.setup({ delay: null });
    renderAt(uiTestRunsPath(TEST_ID));

    expect(await screen.findByTestId('ui-test-runs-empty', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^run-e/)).toHaveLength(0);
    expect(screen.queryByTestId('run-link')).toBeNull();
    expect(served.listCalls.every((call) => call.testId === TEST_ID)).toBe(true);
    expect(screen.getByTestId('ui-test-status')).toHaveTextContent('Learning');

    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    await waitFor(() => expect(pathname()).toBe(uiTestPath(TEST_ID)), WAIT);
    expect(await screen.findByTestId('ui-test-overview-readiness', {}, WAIT)).toHaveTextContent('Learning');
    expect(screen.getByTestId('ui-test-status')).toHaveTextContent('Learning');
  });
});
