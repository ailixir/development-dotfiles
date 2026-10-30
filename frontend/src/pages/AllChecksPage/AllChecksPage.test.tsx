import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type Location } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
import {
  SEEDED_FAILED_ATTEMPT_SOURCE_REVISION,
  SEEDED_FAILED_ATTEMPT_STARTED_AT,
  SEEDED_FAILED_ATTEMPT_TEST_ID,
  failGuidedRequests,
  guidedRequestCount,
} from '@/services/mocks/studio/guidedHandlers';
import { formatRelativeTime } from '@/utils/time';
import studioApi from '@/services/api/studioApi';
import { schedulesApi } from '@/services/api/schedulesApi';
import type { BackendCheckDto } from '@/services/api/mappers/checkMapper';
import { defaultConfiguration, type TestDto } from '@/types/studio/studioTypes';
import type { CSI } from '@/types/csi/csiTypes';
import { uiTestEditorPath, uiTestPath } from '@/components/studio/uiTestPaths';
import checksSlice from '@/store/slices/checksSlice';
import csiSlice, { fetchCSIs, setSelectedTags } from '@/store/slices/csiSlice';
import studioSlice from '@/store/slices/studioSlice';
import reportsSlice from '@/store/slices/reportsSlice';
import uiSlice from '@/store/slices/uiSlice';
import dashboardSlice, { setSearchContext, setSearchFilters } from '@/store/slices/dashboardSlice';
import sourcesSlice, { fetchSources } from '@/store/slices/sourcesSlice';
import featuresSlice, { fetchFeatures } from '@/store/slices/featuresSlice';
import AllChecksPage from './AllChecksPage';

/**
 * STUDIO-UNIFY-001.3, task 3.9: the All Checks page with UI tests merged in.
 *
 * AC-04 (All Checks half) and AC-14 (All Checks half), AC-15 to AC-23. The page is mounted for real
 * with the real slices. `GET /checks`, the CSI list and the tag list are served inline (no shared MSW
 * handler exists for them); the Studio list is served by an override of the shared Node MSW server, so
 * every "a request was sent" and "no request was sent" claim is counted at the server, not at a spy.
 * The one spy (`studioApi.listTests`) only reads the abort signal, because MSW does not report a
 * client-side abort to the handler.
 */

vi.setConfig({ testTimeout: 60_000 });

const API_BASE = '*/api/v1';
const WAIT = { timeout: 15_000 } as const;
const PREFS_KEY = 'checks:catalog:prefs';

/** The Studio list, built from segments so no old route shape appears as a literal. */
const STUDIO_TESTS_MATCH = [API_BASE, 'studio', 'tests'].join('/');
const STUDIO_TESTS_PATH = ['/api/v1', 'studio', 'tests'].join('/');

const UI_TEST_SOURCE = (enabled: boolean) => ({ type: 'UI_TEST', enabled, label: 'UI Test (Checks Studio)' });
const STUDIO_FEATURE = (enabled: boolean) => ({ key: 'STUDIO', enabled, label: 'Checks Studio' });

/* ------------------------------------------------------------------------------------------------
 * Data
 * ---------------------------------------------------------------------------------------------- */

function checkDto(id: string, overrides: Partial<BackendCheckDto> = {}): BackendCheckDto {
  return {
    id,
    name: `Check ${id}`,
    type: 'HTTP',
    description: null,
    csiId: '60406',
    csiName: 'Retail Banking Portal',
    status: 'PASSING',
    configuration: {},
    environment: 'UAT',
    createdBy: 'author@citi.com',
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-01T09:00:00Z',
    lastExecutionAt: null,
    tags: [],
    ...overrides,
  };
}

function uiTest(id: string, overrides: Partial<TestDto> = {}): TestDto {
  return {
    id,
    name: `Test ${id}`,
    description: null,
    csiId: '60406',
    environment: 'UAT',
    steps: [],
    variables: [],
    configuration: defaultConfiguration(),
    status: null,
    schedule: null,
    createdBy: 'author@citi.com',
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-01T09:00:00Z',
    lastRunAt: null,
    lastRunStatus: null,
    sourceRevision: 1,
    configurationRevision: 1,
    readiness: 'READY',
    firstChangedStepId: null,
    confirmedRevisionId: null,
    ...overrides,
  };
}

const csi = (id: string, name: string): CSI => ({
  id,
  name,
  description: '',
  businessUnit: 'Retail',
  criticality: 'HIGH',
  owner: 'owner@citi.com',
  tags: [],
  environment: 'Production',
  status: 'OPERATIONAL',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

/** One test per readiness / last-run case of spec 9.3, with last runs that would misclassify a wrong mapping. */
const CHIP_CASES: ReadonlyArray<{ id: string; label: string; test: Partial<TestDto> }> = [
  { id: 'u-unlearned', label: 'Not learned', test: { readiness: 'UNLEARNED', lastRunStatus: null } },
  { id: 'u-learning', label: 'Learning', test: { readiness: 'LEARNING', lastRunStatus: 'ERROR' } },
  { id: 'u-relearn', label: 'Needs re-learn', test: { readiness: 'NEEDS_RELEARN', lastRunStatus: 'PASSED' } },
  { id: 'u-pass', label: 'Passing', test: { readiness: 'READY', lastRunStatus: 'PASSED' } },
  { id: 'u-fail', label: 'Failing', test: { readiness: 'READY', lastRunStatus: 'FAILED' } },
  { id: 'u-error', label: 'Error', test: { readiness: 'READY', lastRunStatus: 'ERROR' } },
  { id: 'u-none', label: 'Not run', test: { readiness: 'READY', lastRunStatus: null } },
];

const chipTests = () => CHIP_CASES.map(({ id, test }) => uiTest(id, { name: id, ...test }));
const statusChecks = () => [
  checkDto('c-pass', { name: 'c-pass', status: 'PASSING' }),
  checkDto('c-fail', { name: 'c-fail', status: 'FAILING' }),
  checkDto('c-warn', { name: 'c-warn', status: 'WARNING' }),
  checkDto('c-pend', { name: 'c-pend', status: 'PENDING' }),
];

/* ------------------------------------------------------------------------------------------------
 * The mock world
 * ---------------------------------------------------------------------------------------------- */

type ListAnswer = { tests: TestDto[]; total?: number } | { status: number };

interface ListCall {
  params: Record<string, string>;
  /** 0-based position among the Studio list requests of this test. */
  index: number;
}

interface World {
  checks: BackendCheckDto[];
  uiTests: TestDto[];
  /** The `totalElements` the Studio list reports; defaults to the number of tests it returns. */
  uiTotal: number | null;
  csis: Array<{ id: string; name: string }>;
  /** Overrides the default answer of the Studio list, per request. */
  respond: ((call: ListCall) => Promise<ListAnswer> | ListAnswer) | null;
  bulkBodies: Array<{ operations: Array<{ op: string; id: string }> }>;
  deletedUiTests: string[];
}

const world: World = {
  checks: [],
  uiTests: [],
  uiTotal: null,
  csis: [],
  respond: null,
  bulkBodies: [],
  deletedUiTests: [],
};

interface Observed {
  method: string;
  path: string;
  params: Record<string, string>;
  /** Every `testId` value of the request, repeats included (`params` keeps only the last). */
  testIds: string[];
}
const observed: Observed[] = [];
function record({ request }: { request: Request }) {
  const url = new URL(request.url);
  observed.push({
    method: request.method,
    path: url.pathname,
    params: Object.fromEntries(url.searchParams),
    testIds: url.searchParams.getAll('testId'),
  });
}

const studioRequests = () => observed.filter((entry) => entry.path.split('/').includes('studio'));
const studioListRequests = () =>
  observed.filter((entry) => entry.method === 'GET' && entry.path === STUDIO_TESTS_PATH);
const checksListRequests = () =>
  observed.filter((entry) => entry.method === 'GET' && entry.path === '/api/v1/checks');
const csiRequests = () => observed.filter((entry) => entry.method === 'GET' && entry.path === '/api/v1/csi');
/** `GET /studio/guided-sessions/latest`, the one read behind the failed-learn line (STUDIO-UNIFY-001.6 AC-04). */
const latestAttemptRequests = () =>
  observed.filter((entry) => entry.method === 'GET' && entry.path.endsWith('/studio/guided-sessions/latest'));
const writes = () => observed.filter((entry) => entry.method !== 'GET');

const csiDto = ({ id, name }: { id: string; name: string }) => ({
  id,
  name,
  description: null,
  businessUnit: 'Retail',
  criticality: 'HIGH',
  ownerEmail: 'owner@citi.com',
  environment: 'PROD',
  status: 'ACTIVE',
  metadata: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

function installHandlers() {
  studioMockServer.use(
    http.get(`${API_BASE}/checks`, () =>
      HttpResponse.json({
        content: world.checks,
        number: 0,
        size: 100,
        totalElements: world.checks.length,
        totalPages: 1,
      }),
    ),
    http.get(`${API_BASE}/csi`, () =>
      HttpResponse.json({
        content: world.csis.map(csiDto),
        number: 0,
        size: 20,
        totalElements: world.csis.length,
        totalPages: 1,
      }),
    ),
    http.get(`${API_BASE}/tags`, () => HttpResponse.json({ data: [], total: 0 })),
    http.post(`${API_BASE}/checks/_bulk`, async ({ request }) => {
      const body = (await request.json()) as World['bulkBodies'][number];
      world.bulkBodies.push(body);
      return HttpResponse.json({ results: body.operations.map((operation) => ({ id: operation.id, status: 'ok' })) });
    }),
    http.get(STUDIO_TESTS_MATCH, async ({ request }) => {
      const params = Object.fromEntries(new URL(request.url).searchParams);
      const index = studioListRequests().length - 1;
      const answer: ListAnswer = world.respond
        ? await world.respond({ params, index })
        : { tests: world.uiTests, total: world.uiTotal ?? undefined };
      if ('status' in answer) {
        return HttpResponse.json({ error: 'STUDIO_FORBIDDEN', message: 'No' }, { status: answer.status });
      }
      return HttpResponse.json({
        data: answer.tests,
        page: 0,
        size: 100,
        totalElements: answer.total ?? answer.tests.length,
        totalPages: 1,
      });
    }),
    http.delete(`${STUDIO_TESTS_MATCH}/:id`, ({ params }) => {
      world.deletedUiTests.push(String(params.id));
      world.uiTests = world.uiTests.filter((test) => test.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

/** A promise a test settles by hand, to hold a Studio list request open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/* ------------------------------------------------------------------------------------------------
 * Store, availability and mounting
 * ---------------------------------------------------------------------------------------------- */

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
type TestStore = ReturnType<typeof makeStore>;

const answerSources = (store: TestStore, sources: Array<{ type: string; enabled: boolean; label: string }>) =>
  act(() => { store.dispatch(fetchSources.fulfilled(sources, 'test', undefined)); });
const answerFeatures = (store: TestStore, features: Array<{ key: string; enabled: boolean; label: string }>) =>
  act(() => { store.dispatch(fetchFeatures.fulfilled({ sources: [], features }, 'test', undefined)); });

/** A store whose bootstrap reads have settled: the UI_TEST source and the STUDIO feature as given. */
function settledStore({ source = true, studio = true }: { source?: boolean; studio?: boolean } = {}): TestStore {
  const store = makeStore();
  store.dispatch(fetchSources.fulfilled([UI_TEST_SOURCE(source)], 'test', undefined));
  store.dispatch(fetchFeatures.fulfilled({ sources: [], features: [STUDIO_FEATURE(studio)] }, 'test', undefined));
  return store;
}

/** A store whose bootstrap reads have not settled: availability is 'pending'. */
const pendingStore = (): TestStore => makeStore();

const preloadCsis = (store: TestStore, csis: CSI[]) =>
  store.dispatch(fetchCSIs.fulfilled({ data: csis }, 'test', undefined));

const Probe = ({ view }: { view: { location: Location | null; go: ((to: string) => void) | null } }) => {
  view.location = useLocation();
  view.go = useNavigate();
  return null;
};

const Marker = ({ name }: { name: string }) => <div data-testid={`route-${name}`} />;

interface Mounted {
  store: TestStore;
  getLocation: () => Location;
  go: (to: string) => void;
}

function mountAt(url: string, store: TestStore): Mounted {
  const view: { location: Location | null; go: ((to: string) => void) | null } = { location: null, go: null };
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Probe view={view} />
        <Routes>
          <Route path="/checks/all" element={<AllChecksPage />} />
          <Route path="/checks/ui-tests/:id/studio" element={<Marker name="editor" />} />
          <Route path="/checks/ui-tests/:id" element={<Marker name="detail" />} />
          <Route path="/checks/create" element={<Marker name="create" />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return {
    store,
    getLocation: () => {
      if (!view.location) throw new Error('the router is not mounted');
      return view.location;
    },
    go: (to) => act(() => view.go?.(to)),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Queries and helpers
 * ---------------------------------------------------------------------------------------------- */

const user = () => userEvent.setup({ delay: null });
const sleep = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

const uiRow = (id: string) => screen.getByTestId(`ui-test-row-${id}`);
const findUiRow = (id: string) => screen.findByTestId(`ui-test-row-${id}`, {}, WAIT);
const uiRowIds = () =>
  Array.from(document.querySelectorAll('[data-testid^="ui-test-row-"]')).map((row) =>
    String(row.getAttribute('data-testid')).replace('ui-test-row-', ''),
  );
const statusChip = (id: string) => screen.getByTestId(`ui-test-status-${id}`);

/** The names in the table body, in row order (each row has exactly one name link). */
const rowNames = () =>
  Array.from(document.querySelectorAll('tbody tr a')).map((link) => link.textContent ?? '');

const statusSelect = () => screen.getAllByRole('combobox')[0];
const typeSelect = () => screen.getAllByRole('combobox')[1];

/**
 * The Type filter reads "All Types": MUI shows an empty selection (the "All Types" item has the value '')
 * as a zero-width placeholder, so the check is on the control's value and on the absence of any type label.
 */
function expectAllTypes() {
  const input = typeSelect().parentElement?.querySelector('input');
  expect(input?.value).toBe('');
  expect((typeSelect().textContent ?? '').replace(/\u200B/g, '')).toBe('');
}

async function choose(select: HTMLElement, option: string) {
  const u = user();
  await u.click(select);
  await u.click(await screen.findByRole('option', { name: option }));
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull(), WAIT);
}

async function optionLabels(select: HTMLElement): Promise<string[]> {
  await user().click(select);
  const labels = (await screen.findAllByRole('option')).map((option) => option.textContent ?? '');
  await user().keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull(), WAIT);
  return labels;
}

const storedPrefs = () => {
  const raw = window.localStorage.getItem(PREFS_KEY);
  return raw ? (JSON.parse(raw) as { typeFilter?: string; statusFilter?: string }) : null;
};
const seedPrefs = (prefs: object) => window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

/** Waits until the check rows are on screen (the page's own list has loaded). */
const checksLoaded = (name: string) => screen.findByText(name, {}, WAIT);

/* ------------------------------------------------------------------------------------------------
 * Lifecycle
 * ---------------------------------------------------------------------------------------------- */

beforeAll(() => {
  studioMockServer.listen({ onUnhandledRequest: 'error' });
  studioMockServer.events.on('request:start', record);
});
beforeEach(() => {
  observed.length = 0;
  world.checks = [];
  world.uiTests = [];
  world.uiTotal = null;
  world.csis = [{ id: '60406', name: 'Retail Banking Portal' }];
  world.respond = null;
  world.bulkBodies = [];
  world.deletedUiTests = [];
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  installHandlers();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => {
  studioMockServer.events.removeListener('request:start', record);
  studioMockServer.close();
});

/* ------------------------------------------------------------------------------------------------
 * AC-15: mixed rows, columns, request parameters, order, cancellation, dedupe
 * ---------------------------------------------------------------------------------------------- */

describe('AC-15: check rows and UI test rows in one table', () => {
  it('renders both kinds in one table, with the UI test columns of spec 9.2', async () => {
    const lastRunAt = '2026-10-20T08:30:00Z';
    world.checks = [checkDto('c-1', { name: 'Payments API', type: 'HTTP' })];
    world.uiTests = [
      uiTest('u-1', {
        name: 'Checkout smoke',
        description: 'Buys one item',
        readiness: 'READY',
        lastRunStatus: 'PASSED',
        lastRunAt,
      }),
      uiTest('u-2', { name: 'Login flow', csiId: '99999', readiness: 'UNLEARNED' }),
    ];
    const store = settledStore();
    preloadCsis(store, [csi('60406', 'Retail Banking Portal')]);
    mountAt('/checks/all', store);

    await findUiRow('u-1');
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(rowNames().sort()).toEqual(['Checkout smoke', 'Login flow', 'Payments API']);
    expect(screen.getByRole('link', { name: 'Payments API' })).toHaveAttribute('href', '/checks/details/c-1');

    const first = within(uiRow('u-1'));
    expect(first.getByRole('link', { name: 'Checkout smoke' })).toHaveAttribute('href', uiTestPath('u-1'));
    expect(first.getByText('UI Test')).toBeInTheDocument();
    expect(statusChip('u-1')).toHaveTextContent('Passing');
    expect(screen.getByTestId('ui-test-last-run-u-1')).toHaveTextContent(new Date(lastRunAt).toLocaleString());
    expect(first.getByText('Buys one item')).toBeInTheDocument();

    // A test that never ran says so.
    expect(screen.getByTestId('ui-test-last-run-u-2')).toHaveTextContent('Never');
  });

  it('keeps the phone layout in the DOM: last run caption under the name, flask beside the name, Type column hidden by CSS', async () => {
    const lastRunAt = '2026-10-20T08:30:00Z';
    const lastExecutionAt = '2026-10-21T09:15:00Z';
    world.checks = [checkDto('c-1', { name: 'Payments API', type: 'HTTP', lastExecutionAt })];
    world.uiTests = [
      uiTest('u-1', { name: 'Checkout smoke', readiness: 'READY', lastRunStatus: 'PASSED', lastRunAt }),
      uiTest('u-2', { name: 'Login flow' }),
    ];
    mountAt('/checks/all', settledStore());
    await findUiRow('u-1');

    // The same columns as before, and no extra column: the caption lives inside the name cell.
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['', 'Check Name', 'Type', 'Status', 'Last Execution', 'Actions']);
    expect(within(uiRow('u-1')).getAllByRole('cell')).toHaveLength(6);

    // The last-execution value stays in its column (once per row) and also shows as a caption under the name.
    expect(document.querySelectorAll('[data-testid="ui-test-last-run-u-1"]')).toHaveLength(1);
    const caption = screen.getByTestId('ui-test-last-run-caption-u-1');
    expect(caption).toHaveTextContent(new Date(lastRunAt).toLocaleString());
    expect(caption.closest('td')).toBe(screen.getByRole('link', { name: 'Checkout smoke' }).closest('td'));
    expect(screen.getByTestId('ui-test-last-run-caption-u-2')).toHaveTextContent('Never');
    expect(screen.getByTestId('check-last-run-caption-c-1')).toHaveTextContent(new Date(lastExecutionAt).toLocaleString());

    // The flask icon sits in the name cell too, so UI test rows stay recognisable without the Type column.
    const nameCell = screen.getByRole('link', { name: 'Checkout smoke' }).closest('td');
    expect(within(nameCell as HTMLElement).getByTestId('ui-test-name-icon-u-1')).toBeInTheDocument();
    expect(within(uiRow('u-1')).getByText('UI Test')).toBeInTheDocument();

    // The pager and the table container carry the testids the pixel assertion uses.
    expect(screen.getByTestId('all-checks-table-container')).toBeInTheDocument();
    expect(screen.getByTestId('all-checks-pagination')).toBeInTheDocument();
    expect(screen.getByTestId('ui-test-run-u-1')).toBeInTheDocument();
    expect(screen.getByTestId('ui-test-more-u-1')).toBeInTheDocument();
    expect(screen.getByTestId('check-execute-c-1')).toBeInTheDocument();
    expect(screen.getByTestId('check-more-c-1')).toBeInTheDocument();
  });

  it('shows the CSI name from the CSI store, and the CSI id when the store has no entry, without a CSI request', async () => {
    world.uiTests = [
      uiTest('u-known', { name: 'Known system', csiId: '60406' }),
      uiTest('u-unknown', { name: 'Unknown system', csiId: '77777' }),
    ];
    const store = settledStore();
    preloadCsis(store, [csi('60406', 'Retail Banking Portal')]);
    mountAt('/checks/all', store);

    await findUiRow('u-known');
    expect(screen.getByTestId('ui-test-csi-u-known')).toHaveTextContent('Retail Banking Portal');
    expect(screen.getByTestId('ui-test-csi-u-unknown')).toHaveTextContent('77777');
    await sleep(100);
    expect(csiRequests()).toHaveLength(0);
  });

  it('fills the CSI store once when nothing has asked for it yet, and then shows the CSI name', async () => {
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke', csiId: '60406' })];
    mountAt('/checks/all', settledStore());

    await findUiRow('u-1');
    await waitFor(() => expect(screen.getByTestId('ui-test-csi-u-1')).toHaveTextContent('Retail Banking Portal'), WAIT);
    expect(csiRequests()).toHaveLength(1);
  });

  it('asks the checks list once and the Studio list once, with the global system and environment', async () => {
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    const store = settledStore();
    store.dispatch(setSearchContext({ csiId: '60406' }));
    store.dispatch(setSearchFilters({ environment: 'UAT' }));
    mountAt('/checks/all', store);

    await findUiRow('u-1');
    await sleep(400);

    expect(checksListRequests()).toHaveLength(1);
    expect(checksListRequests()[0].params).toMatchObject({ page: '0', size: '100' });
    expect(studioListRequests()).toHaveLength(1);
    expect(studioListRequests()[0].params).toEqual({
      csiId: '60406',
      environment: 'UAT',
      sort: 'updatedAt,desc',
      size: '100',
    });
  });

  it('sends the search text as q, once per settled change', async () => {
    world.uiTests = [uiTest('u-1', { name: 'Login flow' })];
    mountAt('/checks/all', settledStore());
    await findUiRow('u-1');
    expect(studioListRequests()).toHaveLength(1);

    await user().type(screen.getByPlaceholderText('Search checks...'), 'login');

    await waitFor(() => expect(studioListRequests()).toHaveLength(2), WAIT);
    await sleep(600);
    expect(studioListRequests()).toHaveLength(2);
    expect(studioListRequests()[1].params).toEqual({
      q: 'login',
      sort: 'updatedAt,desc',
      size: '100',
    });
  });

  it('orders the mixed rows by createdAt descending, then id, whatever order the server answered in', async () => {
    world.checks = [
      checkDto('c-newest', { name: 'Newest check', createdAt: '2026-10-05T09:00:00Z' }),
      checkDto('id-b', { name: 'Tied check', createdAt: '2026-10-03T09:00:00Z' }),
      checkDto('c-oldest', { name: 'Oldest check', createdAt: '2026-09-01T09:00:00Z' }),
    ];
    // Served in updatedAt order, which differs from the createdAt order.
    world.uiTests = [
      uiTest('u-old', { name: 'Old test', createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-22T09:00:00Z' }),
      uiTest('id-a', { name: 'Tied test', createdAt: '2026-10-03T09:00:00Z', updatedAt: '2026-10-10T09:00:00Z' }),
    ];
    mountAt('/checks/all', settledStore());

    await findUiRow('id-a');
    expect(rowNames()).toEqual(['Newest check', 'Tied test', 'Tied check', 'Old test', 'Oldest check']);
  });

  it('renders a check and a UI test with the same id as one UI test row', async () => {
    world.checks = [
      checkDto('same-id', { name: 'Check twin' }),
      checkDto('c-other', { name: 'Other check' }),
    ];
    world.uiTests = [uiTest('same-id', { name: 'UI test twin' })];
    mountAt('/checks/all', settledStore());

    await findUiRow('same-id');
    await checksLoaded('Other check');
    expect(rowNames().sort()).toEqual(['Other check', 'UI test twin']);
    expect(screen.queryByText('Check twin')).toBeNull();
    expect(within(uiRow('same-id')).getByRole('link', { name: 'UI test twin' })).toHaveAttribute(
      'href',
      uiTestPath('same-id'),
    );
  });

  it('cancels the Studio request a newer search supersedes, and ignores its late answer', async () => {
    const listTests = vi.spyOn(studioApi, 'listTests');
    const firstAnswer = deferred<ListAnswer>();
    world.respond = ({ index }) =>
      index === 0 ? firstAnswer.promise : { tests: [uiTest('u-fresh', { name: 'Fresh result' })] };
    mountAt('/checks/all', settledStore());

    await waitFor(() => expect(studioListRequests()).toHaveLength(1), WAIT);
    await user().type(screen.getByPlaceholderText('Search checks...'), 'lo');
    await waitFor(() => expect(studioListRequests()).toHaveLength(2), WAIT);

    const [firstCall, secondCall] = listTests.mock.calls;
    expect(firstCall[1]?.signal?.aborted).toBe(true);
    expect(secondCall[1]?.signal?.aborted).toBe(false);
    await findUiRow('u-fresh');

    // The first answer arrives after the second one and must not replace it.
    await act(async () => { firstAnswer.resolve({ tests: [uiTest('u-stale', { name: 'Stale result' })] }); });
    await sleep(100);
    expect(uiRowIds()).toEqual(['u-fresh']);
    expect(studioListRequests()).toHaveLength(2);
  });

  it('sends a change of the global system at once and cancels the request it supersedes', async () => {
    const listTests = vi.spyOn(studioApi, 'listTests');
    const firstAnswer = deferred<ListAnswer>();
    world.respond = ({ index }) =>
      index === 0 ? firstAnswer.promise : { tests: [uiTest('u-scoped', { name: 'Scoped result' })] };
    const store = settledStore();
    mountAt('/checks/all', store);
    await waitFor(() => expect(studioListRequests()).toHaveLength(1), WAIT);

    act(() => { store.dispatch(setSearchContext({ csiId: '60406' })); });

    await waitFor(() => expect(studioListRequests()).toHaveLength(2), WAIT);
    expect(studioListRequests()[1].params).toMatchObject({ csiId: '60406' });
    expect(listTests.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await findUiRow('u-scoped');
    await act(async () => { firstAnswer.resolve({ tests: [] }); });
  });
});

/* ------------------------------------------------------------------------------------------------
 * AC-16: chips, Warning / Pending groups, readiness filters
 * ---------------------------------------------------------------------------------------------- */

describe('AC-16: status chips and status filters', () => {
  it('reads Not learned, Learning, Needs re-learn, Passing, Failing, Error and Not run', async () => {
    world.uiTests = chipTests();
    mountAt('/checks/all', settledStore());

    await findUiRow('u-none');
    for (const { id, label } of CHIP_CASES) {
      expect(statusChip(id)).toHaveTextContent(new RegExp(`^${label}$`));
    }
  });

  it.each([
    ['Passing', ['c-pass', 'u-pass']],
    ['Failing', ['c-fail', 'u-fail']],
    ['Warning', ['c-warn', 'u-error']],
    ['Pending', ['c-pend', 'u-none']],
    ['Not learned', ['u-unlearned']],
    ['Learning', ['u-learning']],
    ['Needs re-learn', ['u-relearn']],
  ])('the %s filter selects exactly %j', async (option, expected) => {
    world.checks = statusChecks();
    world.uiTests = chipTests();
    mountAt('/checks/all', settledStore());
    await findUiRow('u-none');

    await choose(statusSelect(), option);

    await waitFor(() => expect(rowNames().sort()).toEqual([...expected].sort()), WAIT);
  });

  it('offers the readiness filter values only while UI tests are on', async () => {
    world.uiTests = chipTests();
    mountAt('/checks/all', settledStore());
    await findUiRow('u-none');

    const labels = await optionLabels(statusSelect());

    expect(labels).toEqual([
      'All Status',
      'Passing',
      'Failing',
      'Warning',
      'Pending',
      'Not learned',
      'Learning',
      'Needs re-learn',
    ]);
  });
});

/* ------------------------------------------------------------------------------------------------
 * AC-17: bulk
 * ---------------------------------------------------------------------------------------------- */

describe('AC-17: UI tests cannot be bulk-selected', () => {
  it('disables the UI test checkboxes, and select-all selects check rows only', async () => {
    world.checks = [checkDto('c-1', { name: 'First check' }), checkDto('c-2', { name: 'Second check' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' }), uiTest('u-2', { name: 'Login flow' })];
    mountAt('/checks/all', settledStore());
    await findUiRow('u-1');
    await checksLoaded('First check');

    expect(within(uiRow('u-1')).getByRole('checkbox')).toBeDisabled();
    expect(within(uiRow('u-2')).getByRole('checkbox')).toBeDisabled();

    await user().click(screen.getByRole('checkbox', { name: 'select all visible checks' }));

    expect(await screen.findByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'select First check' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'select Second check' })).toBeChecked();
    expect(within(uiRow('u-1')).getByRole('checkbox')).not.toBeChecked();
    expect(within(uiRow('u-2')).getByRole('checkbox')).not.toBeChecked();
  });

  it('sends only check ids to a bulk action', async () => {
    world.checks = [checkDto('c-1', { name: 'First check' }), checkDto('c-2', { name: 'Second check' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    mountAt('/checks/all', settledStore());
    await findUiRow('u-1');
    await checksLoaded('First check');
    const u = user();

    await u.click(screen.getByRole('checkbox', { name: 'select all visible checks' }));
    await u.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(world.bulkBodies).toHaveLength(1), WAIT);
    expect(world.bulkBodies[0].operations.map((operation) => operation.id).sort()).toEqual(['c-1', 'c-2']);
    expect(world.bulkBodies[0].operations.every((operation) => operation.op === 'delete')).toBe(true);
  });

  it('has nothing to select when only UI test rows are shown', async () => {
    world.checks = [checkDto('c-1', { name: 'First check' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    mountAt('/checks/all?type=UI_TEST', settledStore());
    await findUiRow('u-1');

    expect(screen.getByRole('checkbox', { name: 'select all visible checks' })).toBeDisabled();
    expect(screen.queryByText(/selected$/)).toBeNull();
  });
});

/* ------------------------------------------------------------------------------------------------
 * AC-18: tag filters
 * ---------------------------------------------------------------------------------------------- */

describe('AC-18: an active tag filter hides the UI test rows', () => {
  it('hides them while a global tag filter is active, and shows them again when it is cleared', async () => {
    world.checks = [checkDto('c-1', { name: 'Tagged check', tags: ['prod'] })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    const store = settledStore();
    mountAt('/checks/all', store);
    await findUiRow('u-1');
    await checksLoaded('Tagged check');

    act(() => { store.dispatch(setSearchFilters({ tags: ['prod'] })); });
    await waitFor(() => expect(uiRowIds()).toEqual([]), WAIT);
    expect(screen.getByText('Tagged check')).toBeInTheDocument();

    act(() => { store.dispatch(setSearchFilters({ tags: [] })); });
    await findUiRow('u-1');
  });

  it('hides them while a page tag filter is active, and shows them again when it is cleared', async () => {
    world.checks = [checkDto('c-1', { name: 'Tagged check', tags: ['prod'] })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    const store = settledStore();
    mountAt('/checks/all', store);
    await findUiRow('u-1');
    await checksLoaded('Tagged check');

    act(() => { store.dispatch(setSelectedTags(['prod'])); });
    await waitFor(() => expect(uiRowIds()).toEqual([]), WAIT);
    expect(screen.getByText('Tagged check')).toBeInTheDocument();

    act(() => { store.dispatch(setSelectedTags([])); });
    await findUiRow('u-1');
  });
});

/* ------------------------------------------------------------------------------------------------
 * AC-14 and AC-19: Execute and the row menu
 * ---------------------------------------------------------------------------------------------- */

describe('AC-14 and AC-19: row actions', () => {
  it('Execute shows "Run in Studio" and opens the editor with autorun, sending no execute request', async () => {
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    const store = settledStore();
    const view = mountAt('/checks/all', store);
    await findUiRow('u-1');
    const execute = within(uiRow('u-1')).getByLabelText('Run in Studio');

    await user().hover(execute);
    expect(await screen.findByRole('tooltip', {}, WAIT)).toHaveTextContent('Run in Studio');

    await user().click(execute);

    expect(view.getLocation().pathname).toBe(uiTestEditorPath('u-1'));
    expect(view.getLocation().search).toBe('?autorun=1');
    expect(screen.getByTestId('route-editor')).toBeInTheDocument();
    await sleep(100);
    // Reads only: no write of any kind, and no run or execution path was touched.
    expect(writes()).toEqual([]);
    expect(observed.some((entry) => /execut/.test(entry.path))).toBe(false);
    expect(store.getState().checks.executingChecks).toEqual([]);
  });

  it('offers the same "Run in Studio" action for every readiness', async () => {
    world.uiTests = chipTests();
    mountAt('/checks/all', settledStore());
    await findUiRow('u-none');

    for (const { id } of CHIP_CASES) {
      expect(within(uiRow(id)).getAllByLabelText('Run in Studio')).toHaveLength(1);
    }
  });

  it('lists Open, Edit in Studio, Schedule and Delete in the row menu', async () => {
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    mountAt('/checks/all', settledStore());
    await findUiRow('u-1');

    await user().click(within(uiRow('u-1')).getByRole('button', { name: 'More actions for Checkout smoke' }));

    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Open', 'Edit in Studio', 'Schedule', 'Delete']);
    expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveAttribute('href', uiTestPath('u-1'));
    expect(screen.getByRole('menuitem', { name: 'Edit in Studio' })).toHaveAttribute('href', uiTestEditorPath('u-1'));
  });

  it.each([
    ['Open', uiTestPath('u-1'), 'route-detail'],
    ['Edit in Studio', uiTestEditorPath('u-1'), 'route-editor'],
  ])('%s goes to %s', async (item, pathname, marker) => {
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    const view = mountAt('/checks/all', settledStore());
    await findUiRow('u-1');

    await user().click(within(uiRow('u-1')).getByRole('button', { name: 'More actions for Checkout smoke' }));
    await user().click(await screen.findByRole('menuitem', { name: item }));

    expect(view.getLocation().pathname).toBe(pathname);
    expect(view.getLocation().search).toBe('');
    expect(screen.getByTestId(marker)).toBeInTheDocument();
  });

  it('Schedule opens the same schedule dialog a check opens, for the UI test', async () => {
    world.uiTests = [uiTest(readyDraft.id, { name: 'Checkout smoke' })];
    mountAt('/checks/all', settledStore());
    await findUiRow(readyDraft.id);

    await user().click(within(uiRow(readyDraft.id)).getByRole('button', { name: 'More actions for Checkout smoke' }));
    await user().click(await screen.findByRole('menuitem', { name: 'Schedule' }));

    const dialog = await screen.findByRole('dialog', {}, WAIT);
    expect(within(dialog).getByText('Schedule Configuration')).toBeInTheDocument();
    expect(within(dialog).getByText('Checkout smoke')).toBeInTheDocument();
    expect(within(dialog).getByText('UI test is paused')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save Schedule' })).toBeInTheDocument();
  });

  it('saving from the row creates the UI test\'s schedule through the shared schedules API', async () => {
    world.uiTests = [uiTest(readyDraft.id, { name: 'Checkout smoke' })];
    mountAt('/checks/all', settledStore());
    await findUiRow(readyDraft.id);
    const u = user();

    await u.click(within(uiRow(readyDraft.id)).getByRole('button', { name: 'More actions for Checkout smoke' }));
    await u.click(await screen.findByRole('menuitem', { name: 'Schedule' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    await u.click(within(dialog).getByRole('checkbox'));
    await u.click(within(dialog).getByRole('button', { name: 'Save Schedule' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);

    const saved = await schedulesApi.list({ uiTestId: readyDraft.id });
    expect(saved.data).toHaveLength(1);
    expect(saved.data[0]).toMatchObject({
      uiTestId: readyDraft.id,
      checkId: null,
      enabled: true,
      cronExpression: '0 */5 * * * *',
    });
  });

  it('Delete asks first, deletes nothing on Cancel, and on confirm deletes the test and refreshes the list', async () => {
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' }), uiTest('u-2', { name: 'Login flow' })];
    mountAt('/checks/all', settledStore());
    await findUiRow('u-1');
    const u = user();

    await u.click(within(uiRow('u-1')).getByRole('button', { name: 'More actions for Checkout smoke' }));
    await u.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    let dialog = await screen.findByRole('dialog', {}, WAIT);
    expect(within(dialog).getByText('Delete UI test?')).toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    expect(world.deletedUiTests).toEqual([]);
    expect(studioListRequests()).toHaveLength(1);

    await u.click(within(uiRow('u-1')).getByRole('button', { name: 'More actions for Checkout smoke' }));
    await u.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    dialog = await screen.findByRole('dialog', {}, WAIT);
    await u.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(world.deletedUiTests).toEqual(['u-1']), WAIT);
    await waitFor(() => expect(studioListRequests()).toHaveLength(2), WAIT);
    await waitFor(() => expect(uiRowIds()).toEqual(['u-2']), WAIT);
  });
});

/* ------------------------------------------------------------------------------------------------
 * AC-20, AC-21, AC-22: cap, failure, empty
 * ---------------------------------------------------------------------------------------------- */

describe('AC-20: the cap notice', () => {
  it('says "Showing 100 of 150 UI tests" when the server reports 150', async () => {
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    world.uiTotal = 150;
    mountAt('/checks/all', settledStore());

    expect(
      await screen.findByText('Showing 100 of 150 UI tests — narrow by system or search', {}, WAIT),
    ).toBeInTheDocument();
  });

  it.each([100, 42])('shows no notice when the server reports %i', async (total) => {
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    world.uiTotal = total;
    mountAt('/checks/all', settledStore());

    await findUiRow('u-1');
    expect(screen.queryByText(/UI tests — narrow by system or search/)).toBeNull();
  });
});

describe('AC-21: the Studio list fails', () => {
  it('keeps the check rows, shows "UI tests could not be loaded · Retry", and Retry asks again', async () => {
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    world.respond = () => ({ status: 403 });
    mountAt('/checks/all', settledStore());

    const message = await screen.findByText(/UI tests could not be loaded/, {}, WAIT);
    expect(message.closest('[role="alert"]')).toHaveTextContent('UI tests could not be loaded · Retry');
    expect(screen.getByText('Payments API')).toBeInTheDocument();
    expect(uiRowIds()).toEqual([]);
    expect(studioListRequests()).toHaveLength(1);

    world.respond = null;
    await user().click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(studioListRequests()).toHaveLength(2), WAIT);
    await findUiRow('u-1');
    expect(screen.queryByText(/UI tests could not be loaded/)).toBeNull();
    expect(screen.getByText('Payments API')).toBeInTheDocument();
  });
});

describe('AC-22: no UI tests exist', () => {
  it('shows "No UI tests yet" and "Create UI test", which opens create?type=UI_TEST', async () => {
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    const view = mountAt('/checks/all?type=UI_TEST', settledStore());

    expect(await screen.findByText('No UI tests yet', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText('Payments API')).toBeNull();

    await user().click(screen.getByRole('button', { name: 'Create UI test' }));

    expect(view.getLocation().pathname).toBe('/checks/create');
    expect(view.getLocation().search).toBe('?type=UI_TEST');
    expect(screen.getByTestId('route-create')).toBeInTheDocument();
  });

  it('does not show it when the Type filter is not UI Test', async () => {
    mountAt('/checks/all', settledStore());

    expect(await screen.findByText('No checks match the current filters', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText('No UI tests yet')).toBeNull();
  });
});

/* ------------------------------------------------------------------------------------------------
 * AC-04: ?type=UI_TEST and the stored preferences
 * ---------------------------------------------------------------------------------------------- */

describe('AC-04: ?type=UI_TEST', () => {
  it('shows UI Test in the Type filter even when the stored preferences hold another type, and stores UI_TEST', async () => {
    seedPrefs({ rowsPerPage: 25, searchQuery: '', statusFilter: '', typeFilter: 'HTTP' });
    world.checks = [checkDto('c-1', { name: 'Payments API', type: 'HTTP' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    mountAt('/checks/all?type=UI_TEST', settledStore());

    await findUiRow('u-1');
    expect(typeSelect()).toHaveTextContent('UI Test');
    expect(screen.queryByText('Payments API')).toBeNull();
    await waitFor(() => expect(storedPrefs()?.typeFilter).toBe('UI_TEST'), WAIT);
  });

  it('applies a UI_TEST type from the stored preferences when UI tests are on', async () => {
    seedPrefs({ rowsPerPage: 25, searchQuery: '', statusFilter: '', typeFilter: 'UI_TEST' });
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    mountAt('/checks/all', settledStore());

    await findUiRow('u-1');
    expect(typeSelect()).toHaveTextContent('UI Test');
    expect(screen.queryByText('Payments API')).toBeNull();
    expect(storedPrefs()?.typeFilter).toBe('UI_TEST');
  });

  it('stores the Type the user picks, UI Test included', async () => {
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    mountAt('/checks/all', settledStore());
    await findUiRow('u-1');

    await choose(typeSelect(), 'HTTP');
    await waitFor(() => expect(storedPrefs()?.typeFilter).toBe('HTTP'), WAIT);
    expect(uiRowIds()).toEqual([]);

    await choose(typeSelect(), 'UI Test');
    await waitFor(() => expect(storedPrefs()?.typeFilter).toBe('UI_TEST'), WAIT);
    await findUiRow('u-1');
  });

  it('applies a later ?type=UI_TEST while the page is open', async () => {
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    const view = mountAt('/checks/all', settledStore());
    await findUiRow('u-1');
    await checksLoaded('Payments API');

    view.go('/checks/all?type=UI_TEST');

    await waitFor(() => expect(typeSelect()).toHaveTextContent('UI Test'), WAIT);
    expect(screen.queryByText('Payments API')).toBeNull();
  });
});

/* ------------------------------------------------------------------------------------------------
 * STUDIO-UNIFY-001.6 AC-04: the last learning attempt on the row
 * ---------------------------------------------------------------------------------------------- */

describe('AC-04 (STUDIO-UNIFY-001.6): "Last learning attempt failed" on the UI test row', () => {
  const NOTE = 'last-learning-attempt';
  const SEEDED = SEEDED_FAILED_ATTEMPT_TEST_ID;
  const READY_ID = '11111111-1111-1111-1111-111111111111';
  const RELEARN_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
  const LEARNING_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
  const attemptDate = formatRelativeTime(SEEDED_FAILED_ATTEMPT_STARTED_AT);
  const seededTest = (overrides: Partial<TestDto> = {}) =>
    uiTest(SEEDED, {
      name: 'Statements download',
      readiness: 'UNLEARNED',
      sourceRevision: Number(SEEDED_FAILED_ATTEMPT_SOURCE_REVISION),
      ...overrides,
    });
  const noteIn = (id: string) => within(uiRow(id)).queryByTestId(NOTE);

  it('shows the line under the name of an UNLEARNED row with a failed attempt, and only there, from exactly one read', async () => {
    world.checks = [checkDto('c-1', { name: 'Payments API', status: 'FAILING' })];
    world.uiTests = [
      seededTest(),
      uiTest(READY_ID, { name: 'Checkout smoke', readiness: 'READY', lastRunStatus: 'PASSED' }),
      uiTest(RELEARN_ID, { name: 'Needs new learn', readiness: 'NEEDS_RELEARN' }),
      uiTest(LEARNING_ID, { name: 'Being learned', readiness: 'LEARNING' }),
    ];
    mountAt('/checks/all', settledStore());

    await findUiRow(SEEDED);
    await waitFor(() => expect(noteIn(SEEDED)).not.toBeNull(), WAIT);
    expect(noteIn(SEEDED)).toHaveTextContent(`Last learning attempt failed (${attemptDate}, at step 1)`);
    // The line sits in the name cell, in the slot of the phone "Last run" caption, which keeps its own testid.
    const caption = within(uiRow(SEEDED)).getByTestId(`ui-test-last-run-caption-${SEEDED}`);
    expect(caption.parentElement).toBe(noteIn(SEEDED)!.parentElement);
    expect(within(uiRow(SEEDED)).getAllByRole('cell')[1]).toContainElement(noteIn(SEEDED));

    // READY and LEARNING rows never show it; a NEEDS_RELEARN row with no attempt shows none either.
    for (const id of [READY_ID, RELEARN_ID, LEARNING_ID]) expect(noteIn(id)).toBeNull();

    // One request for the page, asking for the UNLEARNED and NEEDS_RELEARN rows only.
    await sleep(150);
    expect(latestAttemptRequests()).toHaveLength(1);
    expect(guidedRequestCount('latest')).toBe(1);
    expect([...latestAttemptRequests()[0].testIds].sort()).toEqual([RELEARN_ID, SEEDED].sort());
  });

  it('leaves the step out when the test was edited since the attempt', async () => {
    world.uiTests = [seededTest({ sourceRevision: Number(SEEDED_FAILED_ATTEMPT_SOURCE_REVISION) + 1 })];
    mountAt('/checks/all', settledStore());

    await findUiRow(SEEDED);
    await waitFor(() => expect(noteIn(SEEDED)).not.toBeNull(), WAIT);
    expect(noteIn(SEEDED)).toHaveTextContent(`Last learning attempt failed (${attemptDate})`);
    expect(noteIn(SEEDED)).not.toHaveTextContent('at step');
  });

  it('sends no request when no visible UI test is UNLEARNED or NEEDS_RELEARN', async () => {
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    world.uiTests = [
      uiTest(READY_ID, { name: 'Checkout smoke', readiness: 'READY' }),
      uiTest(LEARNING_ID, { name: 'Being learned', readiness: 'LEARNING' }),
    ];
    mountAt('/checks/all', settledStore());

    await findUiRow(READY_ID);
    await checksLoaded('Payments API');
    await sleep(250);
    expect(latestAttemptRequests()).toEqual([]);
    expect(guidedRequestCount('latest')).toBe(0);
  });

  it('sends no request when there are no UI test rows at all', async () => {
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    mountAt('/checks/all', settledStore());

    await checksLoaded('Payments API');
    await sleep(250);
    expect(latestAttemptRequests()).toEqual([]);
  });

  it('asks once per rendered page, for the visible rows only, never per row', async () => {
    seedPrefs({ rowsPerPage: 10, searchQuery: '', statusFilter: '', typeFilter: '' });
    const ids = Array.from({ length: 12 }, (_, index) => `bbbbbbbb-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`);
    // createdAt descending is the row order, so the first ten ids are on page 1.
    world.uiTests = ids.map((id, index) =>
      uiTest(id, { name: `Unlearned ${index}`, readiness: 'UNLEARNED', createdAt: `2026-09-${String(30 - index).padStart(2, '0')}T09:00:00Z` }),
    );
    mountAt('/checks/all', settledStore());

    await findUiRow(ids[0]);
    await waitFor(() => expect(latestAttemptRequests()).toHaveLength(1), WAIT);
    await sleep(150);
    expect(latestAttemptRequests()).toHaveLength(1);
    expect([...latestAttemptRequests()[0].testIds].sort()).toEqual(ids.slice(0, 10).sort());

    await user().click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(latestAttemptRequests()).toHaveLength(2), WAIT);
    await sleep(150);
    expect(latestAttemptRequests()).toHaveLength(2);
    expect([...latestAttemptRequests()[1].testIds].sort()).toEqual(ids.slice(10).sort());
  });

  it('shows no line and no error when the read fails, and the row is otherwise unchanged', async () => {
    failGuidedRequests('latest', 'network');
    world.uiTests = [seededTest()];
    mountAt('/checks/all', settledStore());

    await findUiRow(SEEDED);
    await waitFor(() => expect(latestAttemptRequests()).toHaveLength(1), WAIT);
    await sleep(150);
    expect(noteIn(SEEDED)).toBeNull();
    expect(statusChip(SEEDED)).toHaveTextContent('Not learned');
    expect(screen.getByTestId(`ui-test-last-run-caption-${SEEDED}`)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/* ------------------------------------------------------------------------------------------------
 * AC-23: switch-off, pending, late sources
 * ---------------------------------------------------------------------------------------------- */

describe('AC-23: UI tests switched off', () => {
  const OFF_CASES: ReadonlyArray<[string, { source?: boolean; studio?: boolean }]> = [
    ['the STUDIO feature is off', { studio: false }],
    ['the UI_TEST source is disabled', { source: false }],
  ];

  it.each(OFF_CASES)('sends no Studio request and shows no UI test rows when %s', async (_name, availability) => {
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    mountAt('/checks/all', settledStore(availability));

    await checksLoaded('Payments API');
    await sleep(400);

    expect(studioRequests()).toEqual([]);
    expect(uiRowIds()).toEqual([]);
    expect(screen.queryByText('Checkout smoke')).toBeNull();
    expect(csiRequests()).toHaveLength(0);
  });

  it.each(OFF_CASES)('hides the UI Test option from the Type filter when %s', async (_name, availability) => {
    mountAt('/checks/all', settledStore(availability));
    await screen.findAllByRole('combobox', {}, WAIT);

    const labels = await optionLabels(typeSelect());

    expect(labels).toEqual(['All Types', 'HTTP', 'TCP', 'Splunk', 'Grafana', 'ITRS', 'AppDynamics']);
  });

  it.each(OFF_CASES)('shows All Types for ?type=UI_TEST and stores no UI_TEST when %s', async (_name, availability) => {
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    mountAt('/checks/all?type=UI_TEST', settledStore(availability));

    await checksLoaded('Payments API');
    expectAllTypes();
    await waitFor(() => expect(storedPrefs()).not.toBeNull(), WAIT);
    expect(storedPrefs()?.typeFilter).toBe('');
    expect(window.localStorage.getItem(PREFS_KEY)).not.toContain('UI_TEST');
    expect(studioRequests()).toEqual([]);
  });

  it.each(OFF_CASES)('shows All Types for a stored UI_TEST type and rewrites it without UI_TEST when %s', async (_name, availability) => {
    seedPrefs({ rowsPerPage: 25, searchQuery: '', statusFilter: '', typeFilter: 'UI_TEST' });
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    mountAt('/checks/all', settledStore(availability));

    await checksLoaded('Payments API');
    expectAllTypes();
    await waitFor(() => expect(storedPrefs()?.typeFilter).toBe(''), WAIT);
    expect(window.localStorage.getItem(PREFS_KEY)).not.toContain('UI_TEST');
    expect(studioRequests()).toEqual([]);
  });
});

describe("AC-23: availability 'pending'", () => {
  it('sends no Studio request and holds a UI_TEST type from the URL: neither applied nor written', async () => {
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    mountAt('/checks/all?type=UI_TEST', pendingStore());

    await checksLoaded('Payments API');
    await sleep(400);

    expect(studioRequests()).toEqual([]);
    expectAllTypes();
    expect(uiRowIds()).toEqual([]);
    expect(window.localStorage.getItem(PREFS_KEY)).toBeNull();
  });

  it('holds a stored UI_TEST type: not applied, and the stored preferences are left untouched', async () => {
    const stored = { rowsPerPage: 25, searchQuery: '', statusFilter: '', typeFilter: 'UI_TEST' };
    seedPrefs(stored);
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    mountAt('/checks/all', pendingStore());

    await checksLoaded('Payments API');
    await sleep(400);

    expect(studioRequests()).toEqual([]);
    expectAllTypes();
    expect(window.localStorage.getItem(PREFS_KEY)).toBe(JSON.stringify(stored));
  });

  it('stays pending, and still sends and writes nothing, until both sources and features have arrived', async () => {
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    const store = pendingStore();
    mountAt('/checks/all?type=UI_TEST', store);
    await checksLoaded('Payments API');

    await answerSources(store, [UI_TEST_SOURCE(true)]);
    await sleep(300);

    expect(studioRequests()).toEqual([]);
    expect(window.localStorage.getItem(PREFS_KEY)).toBeNull();
    expectAllTypes();
  });

  it.each([
    ['the UI_TEST source', () => ({ source: false, studio: true })],
    ['the STUDIO feature', () => ({ source: true, studio: false })],
  ])('late sources that disable %s: no Studio request, and UI_TEST is dropped and never written', async (_name, availability) => {
    const { source, studio } = availability();
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    const store = pendingStore();
    mountAt('/checks/all?type=UI_TEST', store);
    await checksLoaded('Payments API');
    expect(studioRequests()).toEqual([]);

    await answerSources(store, [UI_TEST_SOURCE(source)]);
    await answerFeatures(store, [STUDIO_FEATURE(studio)]);
    await sleep(400);

    expect(studioRequests()).toEqual([]);
    expect(uiRowIds()).toEqual([]);
    expectAllTypes();
    await waitFor(() => expect(storedPrefs()).not.toBeNull(), WAIT);
    expect(window.localStorage.getItem(PREFS_KEY)).not.toContain('UI_TEST');
    // The check rows are not narrowed to a type the page dropped.
    expect(screen.getByText('Payments API')).toBeInTheDocument();
  });

  it('late sources that disable UI tests also drop a stored UI_TEST type without ever writing it', async () => {
    const stored = { rowsPerPage: 25, searchQuery: '', statusFilter: '', typeFilter: 'UI_TEST' };
    seedPrefs(stored);
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    const store = pendingStore();
    mountAt('/checks/all', store);
    await checksLoaded('Payments API');

    await answerSources(store, [UI_TEST_SOURCE(false)]);
    await answerFeatures(store, [STUDIO_FEATURE(true)]);

    await waitFor(() => expect(storedPrefs()?.typeFilter).toBe(''), WAIT);
    expect(window.localStorage.getItem(PREFS_KEY)).not.toContain('UI_TEST');
    expect(studioRequests()).toEqual([]);
  });

  it('late sources that leave UI tests on apply the held type, send one Studio request and store UI_TEST', async () => {
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    const store = pendingStore();
    mountAt('/checks/all?type=UI_TEST', store);
    await checksLoaded('Payments API');
    expect(studioRequests()).toEqual([]);

    await answerSources(store, [UI_TEST_SOURCE(true)]);
    await answerFeatures(store, [STUDIO_FEATURE(true)]);

    await findUiRow('u-1');
    expect(typeSelect()).toHaveTextContent('UI Test');
    expect(studioListRequests()).toHaveLength(1);
    await waitFor(() => expect(storedPrefs()?.typeFilter).toBe('UI_TEST'), WAIT);
  });

  it('sources arriving disabled after the UI tests were shown stop the requests and remove the rows', async () => {
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    world.checks = [checkDto('c-1', { name: 'Payments API' })];
    const store = settledStore();
    mountAt('/checks/all?type=UI_TEST', store);
    await findUiRow('u-1');
    expect(studioListRequests()).toHaveLength(1);

    await answerSources(store, [UI_TEST_SOURCE(false)]);

    await waitFor(() => expect(uiRowIds()).toEqual([]), WAIT);
    expectAllTypes();
    await waitFor(() => expect(window.localStorage.getItem(PREFS_KEY)).not.toContain('UI_TEST'), WAIT);
    await sleep(300);
    expect(studioListRequests()).toHaveLength(1);
    expect(screen.getByText('Payments API')).toBeInTheDocument();
  });
});

describe('AC-23: an empty sources list', () => {
  it('treats UI tests as enabled when the STUDIO feature is on', async () => {
    world.uiTests = [uiTest('u-1', { name: 'Checkout smoke' })];
    const store = makeStore();
    store.dispatch(fetchSources.fulfilled([], 'test', undefined));
    store.dispatch(fetchFeatures.fulfilled({ sources: [], features: [STUDIO_FEATURE(true)] }, 'test', undefined));
    mountAt('/checks/all', store);

    await findUiRow('u-1');
    expect(studioListRequests()).toHaveLength(1);
    const labels = await optionLabels(typeSelect());
    expect(labels).toContain('UI Test');
  });
});
