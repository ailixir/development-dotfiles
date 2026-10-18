import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { passedExecution, failedWithSkippedTailExecution } from '@/services/mocks/studio/executionFixtures';
import { createScriptedTransport } from '@/services/mocks/studio/executionScenarios';
import {
  resetExecutionTransportSeam,
  setExecutionTransportSeam,
} from '@/services/api/studioTransportWiring';
import { VIDEO_EVIDENCE_NARRATIVES } from '@/components/studio/evidence';
import { RUN_NOT_FOUND_MESSAGE, RUN_LOAD_ERROR_MESSAGE } from '@/components/studio/runs/RunDetailsDrawer';
import { CANCELLED_ERROR_CODE, type ExecutionSnapshot } from '@/types/studio/studioTypes';
import { store } from '@/store';
import StudioRunsPage from './StudioRunsPage';

/**
 * Story 10.46, Track D — the Runs page pages, filters and sorts on the server, keeps that state in
 * the URL, and opens run details in a deep-linked, live drawer at `studio/runs/:executionId`.
 */

const STUDIO_BASE = '*/api/v1/studio';
const WAIT = { timeout: 10_000 } as const;
const LIST = '/checks/studio/runs';

function run(id: string, overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot {
  const executionId = `e0000000-0000-0000-0000-0000000000${id}`;
  return {
    ...passedExecution,
    executionId,
    testName: 'Checkout journey',
    videoPath: `/api/v1/studio/executions/${executionId}/video`,
    ...overrides,
  };
}

const noVideo = { video: { status: 'UNAVAILABLE' as const, error: null, expiresAt: null, partial: false }, videoPath: null };
const available = run('a1');
const noRecording = run('a2', { status: 'FAILED', ...noVideo, testName: 'Login journey' });
const cancelled = run('a3', { status: 'ERROR', errorCode: CANCELLED_ERROR_CODE, durationMs: null, ...noVideo, testName: 'Search journey' });

interface ListCall {
  q: string | null;
  status: string | null;
  csiId: string | null;
  sort: string | null;
  page: string | null;
  size: string | null;
}

interface ServeOptions {
  runs?: ExecutionSnapshot[] | ((call: ListCall) => ExecutionSnapshot[]);
  total?: number;
  running?: number;
  detail?: (id: string) => ExecutionSnapshot | Response;
}

/** Serves the list, the "N running" count and the single read; returns the recorded list calls. */
function serve({ runs = [available], total, running = 0, detail }: ServeOptions = {}) {
  const listCalls: ListCall[] = [];
  const detailCalls: string[] = [];
  studioMockServer.use(
    http.get(`${STUDIO_BASE}/executions`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const call: ListCall = {
        q: params.get('q'),
        status: params.get('status'),
        csiId: params.get('csiId'),
        sort: params.get('sort'),
        page: params.get('page'),
        size: params.get('size'),
      };
      if (call.status === 'RUNNING' && call.size === '1') {
        return HttpResponse.json({ data: [], page: 0, size: 1, totalElements: running, totalPages: running });
      }
      listCalls.push(call);
      const data = typeof runs === 'function' ? runs(call) : runs;
      return HttpResponse.json({ data, page: Number(call.page ?? 0), size: 20, totalElements: total ?? data.length, totalPages: 1 });
    }),
    http.get(`${STUDIO_BASE}/executions/:id`, ({ params }) => {
      const id = String(params.id);
      detailCalls.push(id);
      const result = detail?.(id);
      if (result instanceof Response) return result;
      return HttpResponse.json(result ?? { message: 'Not found' }, { status: result ? 200 : 404 });
    }),
  );
  return { listCalls, detailCalls };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(entry = LIST) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/checks/studio/runs" element={<StudioRunsPage />} />
          <Route path="/checks/studio/runs/:executionId" element={<StudioRunsPage />} />
          <Route path="/checks/studio/:id" element={<div data-testid="studio-editor" />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </Provider>,
  );
}

const location = () => screen.getByTestId('location').textContent;
const drawer = () => within(screen.getByTestId('run-details'));

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  store.dispatch({ type: 'dashboard/setSearchContext', payload: { csiId: null } });
});
afterEach(() => {
  vi.useRealTimers();
  studioMockServer.resetHandlers();
  resetStudioMocks();
  resetExecutionTransportSeam();
});
afterAll(() => studioMockServer.close());

describe('Runs page — server list and URL state', () => {
  it('sends paging, sort and the global CSI to the server and shows the running count', async () => {
    store.dispatch({ type: 'dashboard/setSearchContext', payload: { csiId: '60406' } });
    const { listCalls } = serve({ running: 3 });
    renderPage();

    await screen.findByTestId(`run-${available.executionId}`, {}, WAIT);
    expect(listCalls[0]).toEqual({ q: null, status: null, csiId: '60406', sort: 'acceptedAt,desc', page: '0', size: '25' });
    expect(await screen.findByTestId('runs-running-count')).toHaveTextContent('3 running');
  });

  it('commits search and result filter to the URL and the request', async () => {
    const { listCalls } = serve({ runs: [available, cancelled] });
    renderPage();
    await screen.findByTestId(`run-${available.executionId}`, {}, WAIT);

    await userEvent.type(screen.getByRole('textbox', { name: 'Search runs' }), 'Checkout');
    await waitFor(() => expect(location()).toBe(`${LIST}?q=Checkout`));
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(screen.getByRole('option', { name: 'Cancelled' }));

    await waitFor(() => expect(location()).toBe(`${LIST}?q=Checkout&status=CANCELLED`));
    await waitFor(() => expect(listCalls.at(-1)).toMatchObject({ q: 'Checkout', status: 'CANCELLED', page: '0' }));
  });

  it('restores list state from the URL', async () => {
    const { listCalls } = serve({ total: 45 });
    renderPage(`${LIST}?q=checkout&status=FAILED&sort=durationMs,asc&page=2`);

    await screen.findByTestId(`run-${available.executionId}`, {}, WAIT);
    expect(listCalls[0]).toEqual({ q: 'checkout', status: 'FAILED', csiId: null, sort: 'durationMs,asc', page: '1', size: '25' });
    expect(screen.getByRole('textbox', { name: 'Search runs' })).toHaveValue('checkout');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Failed');
  });

  it('falls back from a page past the end without leaving a history entry Back would bounce on (QA 10.46)', async () => {
    serve({ runs: (call) => (call.page === '0' ? [available] : []), total: 1 });
    function Back() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate(-1)}>history-back</button>;
    }
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/checks/elsewhere', `${LIST}?page=3`]} initialIndex={1}>
          <Routes>
            <Route path="/checks/studio/runs" element={<StudioRunsPage />} />
            <Route path="/checks/elsewhere" element={<div data-testid="elsewhere" />} />
          </Routes>
          <LocationProbe />
          <Back />
        </MemoryRouter>
      </Provider>,
    );

    await screen.findByTestId(`run-${available.executionId}`, {}, WAIT);
    expect(location()).toBe(LIST);
    await userEvent.click(screen.getByRole('button', { name: 'history-back' }));
    await screen.findByTestId('elsewhere', {}, WAIT);
    expect(location()).toBe('/checks/elsewhere');
  });

  it('sorts by duration and requested time on the server', async () => {
    const { listCalls } = serve();
    renderPage();
    await screen.findByTestId(`run-${available.executionId}`, {}, WAIT);

    await userEvent.click(screen.getByRole('button', { name: 'Duration' }));
    await waitFor(() => expect(location()).toBe(`${LIST}?sort=durationMs%2Cdesc`));
    await waitFor(() => expect(listCalls.at(-1)?.sort).toBe('durationMs,desc'));

    await userEvent.click(screen.getByRole('button', { name: 'Duration' }));
    await waitFor(() => expect(listCalls.at(-1)?.sort).toBe('durationMs,asc'));

    await userEvent.click(screen.getByRole('button', { name: 'Requested' }));
    await waitFor(() => expect(location()).toBe(LIST));
    await waitFor(() => expect(listCalls.at(-1)?.sort).toBe('acceptedAt,desc'));
  });

  it('offers retry when run history fails to load', async () => {
    serve();
    studioMockServer.use(http.get(`${STUDIO_BASE}/executions`, () => HttpResponse.json({ message: 'Forbidden' }, { status: 403 })));
    renderPage();

    expect(await screen.findByRole('alert', {}, WAIT)).toHaveTextContent('Runs could not be loaded. Please try again.');
    serve();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId(`run-${available.executionId}`, {}, WAIT)).toBeInTheDocument();
  });

  it('offers "Create Test" when there are no runs and no filters, but not with a filter', async () => {
    serve({ runs: [] });
    renderPage(`${LIST}?status=PASSED`);
    expect(await screen.findByText('No matching runs', {}, WAIT)).toBeInTheDocument();
    // Only the header's Create Test; the empty state offers Clear Filters instead.
    expect(screen.getAllByRole('button', { name: 'Create Test' })).toHaveLength(1);

    await userEvent.click(screen.getAllByRole('button', { name: 'Clear Filters' })[0]);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Create Test' })).toHaveLength(2), WAIT);
    await userEvent.click(screen.getAllByRole('button', { name: 'Create Test' })[1]);
    expect(await screen.findByRole('dialog', {}, WAIT)).toBeInTheDocument();
  });
});

describe('Runs page — rows', () => {
  it('formats durations and queue wait, and falls back for a deleted test', async () => {
    const quick = run('b1', { durationMs: 850, startedAt: '2026-09-14T10:00:02Z' });
    const medium = run('b2', { durationMs: 42_000, startedAt: null });
    const long = run('b3', { durationMs: 125_000, testName: null });
    serve({ runs: [quick, medium, long] });
    renderPage();

    const quickRow = await screen.findByTestId(`run-${quick.executionId}`, {}, WAIT);
    expect(within(quickRow).getByTestId('run-duration')).toHaveTextContent('850 ms');
    expect(within(quickRow).getByTestId('run-queue-wait')).toHaveTextContent('Queued 2 s');
    const mediumRow = screen.getByTestId(`run-${medium.executionId}`);
    expect(within(mediumRow).getByTestId('run-duration')).toHaveTextContent('42 s');
    expect(within(mediumRow).queryByTestId('run-queue-wait')).toBeNull();
    const deletedRow = screen.getByTestId(`run-${long.executionId}`);
    expect(within(deletedRow).getByTestId('run-duration')).toHaveTextContent('2m 05s');
    expect(within(deletedRow).getByTestId('run-link')).toHaveTextContent('Deleted test');

    // One link per row; the menu offers Open test only while the test exists.
    expect(within(deletedRow).getAllByRole('link')).toHaveLength(1);
    await userEvent.click(within(deletedRow).getByRole('button', { name: 'More actions for Deleted test' }));
    expect(screen.getByRole('menuitem', { name: 'Open run' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy link' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Open test' })).toBeNull();
  });

  it('labels outcomes with text, including cancelled', async () => {
    serve({ runs: [available, noRecording, cancelled] });
    renderPage();
    const row = await screen.findByTestId(`run-${cancelled.executionId}`, {}, WAIT);
    expect(within(row).getByTestId('run-status')).toHaveTextContent('Cancelled');
    expect(within(screen.getByTestId(`run-${noRecording.executionId}`)).getByTestId('run-status')).toHaveTextContent('Failed');
    expect(within(screen.getByTestId(`run-${available.executionId}`)).getByTestId('run-status')).toHaveTextContent('Passed');
  });

  it('opens the test from the row menu', async () => {
    serve();
    renderPage();
    const row = await screen.findByTestId(`run-${available.executionId}`, {}, WAIT);
    await userEvent.click(within(row).getByRole('button', { name: 'More actions for Checkout journey' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open test' }));
    expect(location()).toBe(`/checks/studio/${available.testId}`);
  });
});

describe('Runs page — run details drawer', () => {
  it('opens from the row link with the list query kept, without reloading the list', async () => {
    const { listCalls, detailCalls } = serve({ runs: [available, noRecording] });
    renderPage(`${LIST}?status=PASSED`);
    const row = await screen.findByTestId(`run-${available.executionId}`, {}, WAIT);
    const callsBefore = listCalls.length;

    await userEvent.click(within(row).getByRole('link', { name: 'Checkout journey' }));
    expect(location()).toBe(`${LIST}/${available.executionId}?status=PASSED`);
    expect(drawer().getByTestId('run-details-title')).toHaveTextContent('Checkout journey');
    const video = drawer().getByTestId('video-evidence-player');
    expect(video.getAttribute('src')).toMatch(new RegExp(`/api/v1/studio/executions/${available.executionId}/video$`));
    expect(detailCalls).toEqual([]);
    expect(listCalls.length).toBe(callsBefore);
  });

  it('opens from a deep link and closing restores the list URL', async () => {
    serve({ runs: [available] });
    renderPage(`${LIST}/${available.executionId}?q=Checkout&sort=durationMs,asc`);

    expect(await screen.findByTestId('run-details', {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(drawer().getByTestId('run-details-title')).toHaveTextContent('Checkout journey'));
    await userEvent.click(drawer().getByRole('button', { name: 'Close' }));
    expect(location()).toBe(`${LIST}?q=Checkout&sort=durationMs,asc`);
    await waitFor(() => expect(screen.queryByTestId('run-details')).toBeNull());
  });

  it('loads a run that is not on the current page', async () => {
    const offPage = run('c1', { testName: 'Archived journey', status: 'FAILED', ...noVideo });
    const { detailCalls } = serve({ runs: [available], detail: (id) => (id === offPage.executionId ? offPage : new Response(null, { status: 404 })) });
    renderPage(`${LIST}/${offPage.executionId}`);

    await waitFor(() => expect(drawer().getByTestId('run-details-title')).toHaveTextContent('Archived journey'), WAIT);
    expect(detailCalls).toEqual([offPage.executionId]);
    expect(drawer().getByText(VIDEO_EVIDENCE_NARRATIVES.UNAVAILABLE.title)).toBeInTheDocument();
    // Prev/Next only walk the current page.
    expect(drawer().getByRole('button', { name: 'Previous run' })).toBeDisabled();
    expect(drawer().getByRole('button', { name: 'Next run' })).toBeDisabled();
  });

  it('says when a linked run does not exist', async () => {
    serve({ runs: [available] });
    renderPage(`${LIST}/missing-run`);
    const notFound = await screen.findByTestId('run-details-not-found', {}, WAIT);
    expect(notFound).toHaveTextContent('Run not found');
    expect(notFound).toHaveTextContent(RUN_NOT_FOUND_MESSAGE);
    expect(within(notFound).queryByRole('button', { name: 'Retry' })).toBeNull();
    // No shimmering placeholders once the load has failed.
    expect(screen.getByTestId('run-details').querySelectorAll('.MuiSkeleton-root')).toHaveLength(0);
    await userEvent.click(within(notFound).getByRole('button', { name: 'Back to runs' }));
    expect(location()).toBe(LIST);
  });

  it('treats a forbidden run as not found, since the backend hides ids outside the caller scope', async () => {
    serve({ runs: [available], detail: () => new Response(null, { status: 403 }) });
    renderPage(`${LIST}/other-scope-run`);
    const notFound = await screen.findByTestId('run-details-not-found', {}, WAIT);
    expect(notFound).toHaveTextContent('Run not found');
    expect(within(notFound).queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('offers retry when a linked run fails to load', async () => {
    const offPage = run('c2', { testName: 'Retry journey' });
    let fail = true;
    serve({ runs: [available], detail: () => (fail ? new Response(null, { status: 500 }) : offPage) });
    renderPage(`${LIST}/${offPage.executionId}`);

    const error = await screen.findByTestId('run-details-error', {}, WAIT);
    expect(error).toHaveTextContent(RUN_LOAD_ERROR_MESSAGE);
    expect(screen.getByTestId('run-details').querySelectorAll('.MuiSkeleton-root')).toHaveLength(0);
    fail = false;
    await userEvent.click(within(error).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(drawer().getByTestId('run-details-title')).toHaveTextContent('Retry journey'), WAIT);
  });

  it('moves through the current page with Prev/Next', async () => {
    serve({ runs: [available, noRecording, cancelled] });
    renderPage(`${LIST}/${available.executionId}?q=journey`);

    await waitFor(() => expect(drawer().getByTestId('run-details-title')).toHaveTextContent('Checkout journey'), WAIT);
    expect(drawer().getByRole('button', { name: 'Previous run' })).toBeDisabled();
    await userEvent.click(drawer().getByRole('button', { name: 'Next run' }));
    expect(location()).toBe(`${LIST}/${noRecording.executionId}?q=journey`);
    await waitFor(() => expect(drawer().getByTestId('run-details-title')).toHaveTextContent('Login journey'));
    await userEvent.click(drawer().getByRole('button', { name: 'Next run' }));
    await waitFor(() => expect(drawer().getByTestId('run-details-status')).toHaveTextContent('Cancelled'));
    expect(drawer().getByRole('button', { name: 'Next run' })).toBeDisabled();
    await userEvent.click(drawer().getByRole('button', { name: 'Previous run' }));
    expect(location()).toBe(`${LIST}/${noRecording.executionId}?q=journey`);
  });

  it('shows failed steps, the failing step summary and collapsible logs', async () => {
    const history = { ...failedWithSkippedTailExecution, testName: 'Login journey', ...noVideo };
    serve({ runs: [history] });
    renderPage(`${LIST}/${history.executionId}`);

    await waitFor(() => expect(drawer().getByTestId('run-failed-step')).toHaveTextContent('Failed at step 3'), WAIT);
    for (const step of history.stepResults) {
      expect(drawer().getByTestId(`step-text-${step.stepIndex}`)).toHaveTextContent(step.originalText);
    }
    expect(drawer().queryByTestId('run-logs')).toBeNull();
    await userEvent.click(drawer().getByRole('button', { name: 'Show logs (1)' }));
    expect(drawer().getByTestId('run-logs')).toHaveTextContent('Step 3 failed');
  });

  it('follows a moving run live and merges by revision into the list', async () => {
    const moving = run('d1', { status: 'RUNNING', durationMs: null, endedAt: null, ...noVideo, revision: 3, streamComplete: false, stepResults: [] });
    const finished = { ...available, executionId: moving.executionId, testName: undefined, videoPath: `/api/v1/studio/executions/${moving.executionId}/video`, revision: 9, streamComplete: true };
    setExecutionTransportSeam({ primary: createScriptedTransport([finished], 30), fallback: null });
    const { listCalls } = serve({ runs: [moving] });
    renderPage(`${LIST}/${moving.executionId}`);

    await waitFor(() => expect(drawer().getByTestId('run-details-status')).toHaveTextContent('Passed'), WAIT);
    const row = screen.getByTestId(`run-${moving.executionId}`);
    expect(within(row).getByTestId('run-status')).toHaveTextContent('Passed');
    // The name the list knew is kept when the live snapshot does not carry one.
    expect(within(row).getByTestId('run-link')).toHaveTextContent('Checkout journey');

    // A refresh that still returns the older revision does not roll the row back.
    await userEvent.click(drawer().getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('run-details')).toBeNull());
    const before = listCalls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Refresh runs' }));
    await waitFor(() => expect(listCalls.length).toBe(before + 1));
    await waitFor(() => expect(screen.queryByTestId('studio-list-refreshing')).toBeNull());
    expect(within(screen.getByTestId(`run-${moving.executionId}`)).getByTestId('run-status')).toHaveTextContent('Passed');
  });
});

describe('Runs page — live list refresh', () => {
  it('re-polls with backoff only while a visible run is active, and pauses while hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const pending = run('f1', { status: 'PENDING', durationMs: null, startedAt: null, endedAt: null, ...noVideo, revision: 1, streamComplete: false, stepResults: [] });
    let current: ExecutionSnapshot[] = [pending];
    const { listCalls } = serve({ runs: () => current });
    renderPage();
    await screen.findByTestId(`run-${pending.executionId}`, {}, WAIT);
    expect(listCalls).toHaveLength(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    await waitFor(() => expect(listCalls).toHaveLength(2));

    // Hidden tab: no reads, however long.
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(listCalls).toHaveLength(2);

    // Back: one read straight away; the run has finished, so the watch stops.
    current = [{ ...pending, status: 'PASSED', durationMs: 42_000, revision: 2, streamComplete: true }];
    visibility.mockReturnValue('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(listCalls).toHaveLength(3));
    await waitFor(() => expect(within(screen.getByTestId(`run-${pending.executionId}`)).getByTestId('run-status')).toHaveTextContent('Passed'));

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(listCalls).toHaveLength(3);
    visibility.mockRestore();
  });

  it('does not poll a list with no active run', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { listCalls } = serve({ runs: [available, noRecording] });
    renderPage();
    await screen.findByTestId(`run-${available.executionId}`, {}, WAIT);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(listCalls).toHaveLength(1);
  });
});

describe('Runs page — copy link', () => {
  it('copies the run URL from the row menu', async () => {
    const user = userEvent.setup();
    serve();
    renderPage(`${LIST}?q=Checkout`);
    const row = await screen.findByTestId(`run-${available.executionId}`, {}, WAIT);
    await user.click(within(row).getByRole('button', { name: 'More actions for Checkout journey' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}${LIST}/${available.executionId}?q=Checkout`);
  });
});
