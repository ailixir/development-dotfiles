import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type Location } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail, fixtureStepId } from '@/services/mocks/studio/authoringState';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
import {
  SEEDED_FAILED_ATTEMPT_SOURCE_REVISION,
  SEEDED_FAILED_ATTEMPT_STARTED_AT,
  SEEDED_FAILED_ATTEMPT_TEST_ID,
  failGuidedRequests,
  guidedRequestCount,
} from '@/services/mocks/studio/guidedHandlers';
import studioApi from '@/services/api/studioApi';
import { schedulesApi } from '@/services/api/schedulesApi';
import { CANCELLED_ERROR_CODE, type ExecutionSnapshot, type TestDetailDto } from '@/types/studio/studioTypes';
import { passedExecution } from '@/services/mocks/studio/executionFixtures';
import { executionStatusLabel } from '@/components/studio/run/executionStatus';
import { LEARNED_READY_LABEL } from '@/components/studio/run/runEnablement';
import { uiTestEditorPath, uiTestPath, uiTestRunPath } from '@/components/studio/uiTestPaths';
import { formatRelativeTime } from '@/utils/time';
import checksSlice from '@/store/slices/checksSlice';
import csiSlice from '@/store/slices/csiSlice';
import studioSlice from '@/store/slices/studioSlice';
import reportsSlice from '@/store/slices/reportsSlice';
import uiSlice from '@/store/slices/uiSlice';
import dashboardSlice from '@/store/slices/dashboardSlice';
import sourcesSlice, { fetchSources } from '@/store/slices/sourcesSlice';
import featuresSlice, { fetchFeatures } from '@/store/slices/featuresSlice';
import UiTestDetailsPage from './UiTestDetailsPage';

/**
 * STUDIO-UNIFY-001.2, task 2.17 (detail-page half): the shell, the header and the Overview, moved to the
 * single-page layout by STUDIO-UNIFY-001.7 (header card, Overview, Recent Runs and Latest run cards).
 *
 * AC-10 header and its actions, AC-11 Overview, AC-14 Run in Studio from the detail page, AC-23
 * availability gating on the detail routes, AC-24 the read gate and its error states, plus the
 * Learning half of AC-25 as far as the header chip and the Overview go. Where an AC says that no
 * request is sent, the count is taken at the mock server, not from a callback.
 *
 * The routes mirror `App.tsx`: the page is the element of `ui-tests/:id`, with the element-less child
 * `runs/:executionId` that only lets the drawer URL match. The three cards are mounted for real so the
 * cases that say "nothing from its runs renders" can see their requests.
 */

const STUDIO_BASE = '*/api/v1/studio';
/** A request path under the Studio API, built from segments. */
const studioPath = (...segments: string[]) => ['/api/v1', 'studio', ...segments].join('/');
const API_BASE = '*/api/v1';
const WAIT = { timeout: 15_000 } as const;
const TEST_TIMEOUT_MS = 60_000;

/** A fixture draft the schedule handlers also know, so the Schedule dialog works end to end. */
const TEST_ID = readyDraft.id;
/** A fixture test that has runs, so a runs card that did mount would have data to show. */
const TEST_WITH_RUNS_ID = '11111111-1111-1111-1111-111111111111';
const EXECUTION_ID = '44444444-4444-4444-4444-444444444440';

const NOT_AVAILABLE = "This UI test doesn't exist or you don't have access";
const NOT_AVAILABLE_HEADING = 'UI test not available';
const BACK_TO_ALL_CHECKS = 'Back to All Checks';
/** Everything the shared not-available state renders: heading, message, back button, and nothing else. */
const NOT_AVAILABLE_TEXT = `${NOT_AVAILABLE_HEADING}${NOT_AVAILABLE}${BACK_TO_ALL_CHECKS}`;
const FEATURE_UNAVAILABLE = 'Checks Studio is not available in this environment.';
const PLAIN_VALUE = 'plain-value-that-must-not-render-7c1e';
const STRAY_SECRET_VALUE = 'resolved-secret-that-must-not-render-4d92';
const SECRET_REFERENCE = 'vault/checkout/card-password';
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

const STEP_TEXTS = [
  'Go to "https://shop.example.test"',
  'Click "Add to basket"',
  'Check that the page contains "Basket (1)"',
];

function detailOf(overrides: Partial<TestDetailDto> = {}): TestDetailDto {
  return {
    ...fixtureDetail(readyDraft),
    id: TEST_ID,
    name: 'Checkout smoke',
    csiId: '60406',
    environment: 'UAT',
    steps: STEP_TEXTS.map((text, index) => ({ id: fixtureStepId(index), text })),
    variables: [
      { name: 'CUSTOMER_EMAIL', kind: 'plain', value: PLAIN_VALUE },
      { name: 'CARD_PASSWORD', kind: 'secretRef', secretId: SECRET_REFERENCE },
    ],
    lastRunStatus: 'PASSED',
    lastRunAt: new Date(Date.now() - THREE_HOURS_MS).toISOString(),
    ...overrides,
  };
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
type TestStore = ReturnType<typeof makeStore>;

const UI_TEST_SOURCE = (enabled: boolean) => ({ type: 'UI_TEST', enabled, label: 'UI Test (Checks Studio)' });
const STUDIO_FEATURE = (enabled: boolean) => ({ key: 'STUDIO', enabled, label: 'Checks Studio' });

/** A store whose bootstrap reads have settled: the UI_TEST source and the STUDIO feature as given. */
function settledStore({ source = true, studio = true }: { source?: boolean; studio?: boolean } = {}): TestStore {
  const store = makeStore();
  store.dispatch(fetchSources.fulfilled([UI_TEST_SOURCE(source)], 'test', undefined));
  store.dispatch(fetchFeatures.fulfilled({ sources: [], features: [STUDIO_FEATURE(studio)] }, 'test', undefined));
  return store;
}

interface Observed {
  method: string;
  path: string;
}
const observed: Observed[] = [];
function record({ request }: { request: Request }) {
  observed.push({ method: request.method, path: new URL(request.url).pathname });
}
const studioRequests = () => observed.filter((entry) => entry.path.includes('/studio'));
/** `GET /checks/{id}` and anything else under /checks except the sources list. */
const checksIdRequests = () => observed.filter((entry) => /\/api\/v1\/checks\/(?!sources$)/.test(entry.path));
const executionRequests = () => observed.filter((entry) => entry.path.includes('/executions'));
const testReads = (id: string) =>
  observed.filter((entry) => entry.method === 'GET' && entry.path.endsWith(studioPath('tests', id)));

/** The CSI registry the header reads its name from (backend DTO shape, paged). */
let registeredCsis: Array<{ id: string; name: string }> = [];
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

/** Serves `detail` for its own id and a 403 for any other id, like the server does for an unreadable test. */
function serveDetail(detail: TestDetailDto) {
  studioMockServer.use(
    http.get(`${STUDIO_BASE}/tests/:id`, ({ params }) =>
      params.id === detail.id
        ? HttpResponse.json(detail)
        : HttpResponse.json({ error: 'STUDIO_FORBIDDEN', message: 'No' }, { status: 403 }),
    ),
  );
}

type ReadFailure = 403 | 400 | 500 | 'network';
function failRead(failure: ReadFailure) {
  studioMockServer.use(
    http.get(`${STUDIO_BASE}/tests/:id`, () =>
      failure === 'network'
        ? HttpResponse.error()
        : HttpResponse.json({ error: failure === 500 ? 'INTERNAL' : 'STUDIO_FORBIDDEN', message: 'No' }, { status: failure }),
    ),
  );
}

beforeAll(() => {
  studioMockServer.listen({ onUnhandledRequest: 'error' });
  studioMockServer.events.on('request:start', record);
});
beforeEach(() => {
  observed.length = 0;
  registeredCsis = [{ id: '60406', name: 'Retail Banking Portal' }];
  window.localStorage.clear();
  window.sessionStorage.clear();
  studioMockServer.use(
    http.get(`${API_BASE}/csi`, () =>
      HttpResponse.json({
        content: registeredCsis.map(csiDto),
        number: 0,
        size: 20,
        totalElements: registeredCsis.length,
        totalPages: 1,
      }),
    ),
  );
});
afterEach(() => {
  cleanup();
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => {
  studioMockServer.events.removeListener('request:start', record);
  studioMockServer.close();
});

const user = () => userEvent.setup({ delay: null });
const sleep = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

interface Mounted {
  getLocation: () => Location;
  go: (to: string) => void;
}

/** Mounts the detail routes as `App.tsx` nests them, with stand-ins for the routes the page links to. */
function mountAt(path: string, store: TestStore): Mounted {
  const location: { current: Location | null } = { current: null };
  const nav: { go: ((to: string) => void) | null } = { go: null };
  const Probe = (): ReactNode => {
    location.current = useLocation();
    nav.go = useNavigate();
    return null;
  };
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <Routes>
          <Route path="/checks/ui-tests/:id/studio" element={<div data-testid="editor-route" />} />
          <Route path="/checks/ui-tests/:id" element={<UiTestDetailsPage />}>
            <Route path="runs/:executionId" element={null} />
          </Route>
          <Route path="/checks/all" element={<div data-testid="all-checks-route" />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return {
    getLocation: () => {
      if (!location.current) throw new Error('the router is not mounted');
      return location.current;
    },
    go: (to) => act(() => nav.go?.(to)),
  };
}

const heading = (name: string) => screen.findByRole('heading', { level: 1, name }, WAIT);

describe('AC-10: the header', () => {
  it('shows name, status chip, UI Test chip, CSI name, environment and last run', async () => {
    serveDetail(detailOf());
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    expect(screen.getByTestId('ui-test-status')).toHaveTextContent('Passing');
    expect(screen.getByTestId('ui-test-type')).toHaveTextContent('UI Test');
    // The CSI shows its registered name once the registry has been read.
    await waitFor(() => expect(screen.getByTestId('ui-test-csi')).toHaveTextContent('CSI: Retail Banking Portal'), WAIT);
    expect(screen.getByTestId('ui-test-environment')).toHaveTextContent('Environment: UAT');
    const lastRun = screen.getByTestId('ui-test-last-run');
    expect(lastRun).toHaveTextContent(executionStatusLabel('PASSED'));
    expect(lastRun).toHaveTextContent(formatRelativeTime(detailOf().lastRunAt!));
  }, TEST_TIMEOUT_MS);

  it('shows "Never run" for a test without a run, and the CSI id when the registry does not know it', async () => {
    registeredCsis = [];
    serveDetail(detailOf({ lastRunStatus: null, lastRunAt: null }));
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    expect(screen.getByTestId('ui-test-last-run')).toHaveTextContent('Last run: Never run');
    expect(screen.getByTestId('ui-test-status')).toHaveTextContent('Not run');
    await waitFor(() => expect(observed.some((entry) => entry.path.endsWith('/api/v1/csi'))).toBe(true), WAIT);
    await sleep(100);
    expect(screen.getByTestId('ui-test-csi')).toHaveTextContent('CSI: 60406');
  }, TEST_TIMEOUT_MS);

  it('Edit in Studio goes to ui-tests/{id}/studio', async () => {
    serveDetail(detailOf());
    const view = mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    await user().click(screen.getByRole('button', { name: 'Edit in Studio' }));
    expect(view.getLocation().pathname).toBe(uiTestEditorPath(TEST_ID));
    expect(view.getLocation().search).toBe('');
    expect(screen.getByTestId('editor-route')).toBeInTheDocument();
  }, TEST_TIMEOUT_MS);

  it('Schedule opens the same schedule dialog a check opens, and closing it does not re-read the test', async () => {
    serveDetail(detailOf());
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    const u = user();
    await u.click(screen.getByRole('button', { name: 'Schedule' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    expect(within(dialog).getByText('Schedule Configuration')).toBeInTheDocument();
    expect(within(dialog).getByText('Checkout smoke')).toBeInTheDocument();
    expect(within(dialog).getByText('UI test is paused')).toBeInTheDocument();
    await sleep(150);

    const beforeClose = testReads(TEST_ID).length;
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    await sleep(150);
    expect(testReads(TEST_ID).length).toBe(beforeClose);
  }, TEST_TIMEOUT_MS);

  it('saving from the dialog creates the schedule and the Overview shows it, with Enable, Disable and Delete working', async () => {
    serveDetail(detailOf());
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    const overview = screen.getByTestId('ui-test-overview-schedule');
    await waitFor(() => expect(overview).toHaveTextContent('Schedule: Disabled'), WAIT);
    const u = user();

    await u.click(screen.getByRole('button', { name: 'Schedule' }));
    let dialog = await screen.findByRole('dialog', {}, WAIT);
    await u.click(within(dialog).getByRole('checkbox'));
    await u.click(within(dialog).getByRole('button', { name: 'Save Schedule' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    await waitFor(() => expect(overview).toHaveTextContent('Cron: 0 */5 * * * *'), WAIT);
    const created = (await schedulesApi.list({ uiTestId: TEST_ID })).data;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ uiTestId: TEST_ID, enabled: true });

    // The dialog now opens on the saved schedule; switching it off and saving disables it.
    await u.click(screen.getByRole('button', { name: 'Schedule' }));
    dialog = await screen.findByRole('dialog', {}, WAIT);
    expect(within(dialog).getByText('UI test will run automatically')).toBeInTheDocument();
    await u.click(within(dialog).getByRole('checkbox'));
    await u.click(within(dialog).getByRole('button', { name: 'Save Schedule' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    await waitFor(() => expect(overview).toHaveTextContent('Schedule: Disabled'), WAIT);
    expect((await schedulesApi.list({ uiTestId: TEST_ID })).data[0]).toMatchObject({ enabled: false });

    await schedulesApi.delete(created[0].id);
    expect((await schedulesApi.list({ uiTestId: TEST_ID })).data).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('Delete is in the overflow menu, confirms in the existing dialog, then goes to /checks/all', async () => {
    serveDetail(detailOf());
    const view = mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    const u = user();
    await u.click(screen.getByRole('button', { name: 'More actions for Checkout smoke' }));
    await u.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog', {}, WAIT);
    expect(within(dialog).getByText('Delete UI test?')).toBeInTheDocument();
    // Nothing is deleted, and the page has not moved, until the dialog is confirmed.
    expect(observed.filter((entry) => entry.method === 'DELETE')).toEqual([]);
    expect(view.getLocation().pathname).toBe(uiTestPath(TEST_ID));

    await u.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(view.getLocation().pathname).toBe('/checks/all'), WAIT);
    expect(screen.getByTestId('all-checks-route')).toBeInTheDocument();
    expect(observed.filter((entry) => entry.method === 'DELETE')).toEqual([
      { method: 'DELETE', path: studioPath('tests', TEST_ID) },
    ]);
  }, TEST_TIMEOUT_MS);

  it('cancelling the delete dialog sends no delete and stays on the detail page', async () => {
    serveDetail(detailOf());
    const view = mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    const u = user();
    await u.click(screen.getByRole('button', { name: 'More actions for Checkout smoke' }));
    await u.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    expect(observed.filter((entry) => entry.method === 'DELETE')).toEqual([]);
    expect(view.getLocation().pathname).toBe(uiTestPath(TEST_ID));
    expect(screen.getByRole('heading', { level: 1, name: 'Checkout smoke' })).toBeInTheDocument();
  }, TEST_TIMEOUT_MS);
});

describe('AC-14 (detail page): Run in Studio', () => {
  it('navigates to ui-tests/{id}/studio?autorun=1 and sends no request, so no execute', async () => {
    serveDetail(detailOf());
    const view = mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    // Let the cards' own reads (CSI registry, schedule summary, the runs lists) finish, so only the click is measured.
    await waitFor(() => expect(screen.getByTestId('ui-test-overview-schedule')).toHaveTextContent(/Schedule: /), WAIT);
    await waitFor(() => expect(screen.queryByTestId('ui-test-latest-run-loading')).toBeNull(), WAIT);
    await waitFor(() => expect(screen.queryByTestId('ui-test-runs-loading')).toBeNull(), WAIT);
    await sleep(150);
    const before = observed.length;

    await user().click(screen.getByRole('button', { name: 'Run in Studio' }));
    expect(view.getLocation().pathname).toBe(uiTestEditorPath(TEST_ID));
    expect(view.getLocation().search).toBe('?autorun=1');
    expect(`${view.getLocation().pathname}${view.getLocation().search}`).toBe(uiTestEditorPath(TEST_ID, { autorun: true }));
    expect(screen.getByTestId('editor-route')).toBeInTheDocument();

    await sleep(300);
    expect(observed.slice(before)).toEqual([]);
    expect(observed.filter((entry) => entry.method === 'POST' || entry.path.includes('/execute'))).toEqual([]);
  }, TEST_TIMEOUT_MS);

  it('Edit in Studio carries no autorun flag, so only Run in Studio asks for a run', async () => {
    serveDetail(detailOf());
    const view = mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    await user().click(screen.getByRole('button', { name: 'Edit in Studio' }));
    expect(view.getLocation().search).not.toContain('autorun');
  }, TEST_TIMEOUT_MS);
});

describe('AC-11: the Overview card', () => {
  it('numbers the steps in order, read-only, and shows nothing that edits', async () => {
    serveDetail(detailOf());
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    const steps = within(screen.getByTestId('ui-test-overview-steps'));
    const list = steps.getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(steps.getAllByRole('listitem').map((item) => item.textContent)).toEqual(STEP_TEXTS);

    const overview = within(screen.getByTestId('ui-test-overview'));
    for (const role of ['textbox', 'combobox', 'checkbox', 'switch', 'radio', 'button', 'link'] as const) {
      expect(overview.queryAllByRole(role)).toEqual([]);
    }
  }, TEST_TIMEOUT_MS);

  it('shows each variable by name and kind, and a secret only by its vault reference name', async () => {
    serveDetail(
      detailOf({
        variables: [
          { name: 'CUSTOMER_EMAIL', kind: 'plain', value: PLAIN_VALUE },
          // A secret that (wrongly) also carried a value on the wire: the page must still not render it.
          { name: 'CARD_PASSWORD', kind: 'secretRef', secretId: SECRET_REFERENCE, value: STRAY_SECRET_VALUE },
        ],
      }),
    );
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    const rows = screen.getAllByTestId('ui-test-overview-variable');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('CUSTOMER_EMAIL');
    expect(rows[0]).toHaveTextContent('Plain');
    expect(rows[0]).not.toHaveTextContent('Vault reference');
    expect(rows[1]).toHaveTextContent('CARD_PASSWORD');
    expect(rows[1]).toHaveTextContent('Secret');
    expect(rows[1]).toHaveTextContent(`Vault reference: ${SECRET_REFERENCE}`);

    expect(document.body.textContent).not.toContain(PLAIN_VALUE);
    expect(document.body.textContent).not.toContain(STRAY_SECRET_VALUE);
    expect(document.querySelector('input')).toBeNull();
  }, TEST_TIMEOUT_MS);

  it.each([
    ['READY', {}, LEARNED_READY_LABEL],
    [
      'NEEDS_RELEARN',
      { readiness: 'NEEDS_RELEARN' as const, firstChangedStepId: fixtureStepId(1) },
      'Steps changed — next Run learns from step 2',
    ],
    ['UNLEARNED', { readiness: 'UNLEARNED' as const }, 'Not learned yet'],
  ])('shows readiness for a %s test', async (_state, overrides, label) => {
    serveDetail(detailOf(overrides));
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    expect(within(screen.getByTestId('ui-test-overview-readiness')).getByText(label)).toBeInTheDocument();
  }, TEST_TIMEOUT_MS);

  it('shows no schedule when the test has none', async () => {
    serveDetail(detailOf());
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    const overview = screen.getByTestId('ui-test-overview-schedule');
    await waitFor(() => expect(overview).toHaveTextContent('Schedule: Disabled'), WAIT);
    expect(overview).toHaveTextContent('Next run: —');
    expect(within(overview).getByText('Schedule')).toBeInTheDocument();
  }, TEST_TIMEOUT_MS);

  it('shows the saved schedule: Schedule, Cron and Next run, as a check does', async () => {
    serveDetail(detailOf());
    await schedulesApi.create({
      uiTestId: TEST_ID,
      frequency: 'custom',
      cronExpression: '0 */5 * * * *',
      timezone: 'UTC',
      enabled: true,
    });
    observed.length = 0;
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    const overview = screen.getByTestId('ui-test-overview-schedule');
    await waitFor(() => expect(overview).toHaveTextContent('Schedule: Custom'), WAIT);
    expect(overview).toHaveTextContent('Cron: 0 */5 * * * *');
    expect(overview).not.toHaveTextContent('Next run: —');
  }, TEST_TIMEOUT_MS);

  it('reads the test only, never writing, and never probing /checks/{id}', async () => {
    serveDetail(detailOf());
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    await waitFor(() => expect(screen.getByTestId('ui-test-overview-schedule')).toHaveTextContent(/Schedule: /), WAIT);
    await sleep(150);
    expect(observed.filter((entry) => entry.method !== 'GET')).toEqual([]);
    expect(checksIdRequests()).toEqual([]);
  }, TEST_TIMEOUT_MS);
});

describe('AC-25 (Learning half): a learn in progress reads "Learning" on the page', () => {
  it('the status chip and the Overview readiness both read Learning', async () => {
    serveDetail(detailOf({ readiness: 'LEARNING', lastRunStatus: null, lastRunAt: null }));
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    expect(screen.getByTestId('ui-test-status')).toHaveTextContent('Learning');
    expect(within(screen.getByTestId('ui-test-overview-readiness')).getByText('Learning')).toBeInTheDocument();
  }, TEST_TIMEOUT_MS);
});

describe('AC-04 (STUDIO-UNIFY-001.6): the last learning attempt on the header', () => {
  const NOTE = 'last-learning-attempt';
  /** The seeded UNLEARNED test with a FAILED attempt that stopped at step 1, at its own source revision. */
  const failedAttemptDetail = (overrides: Partial<TestDetailDto> = {}) =>
    detailOf({
      id: SEEDED_FAILED_ATTEMPT_TEST_ID,
      readiness: 'UNLEARNED',
      sourceRevision: Number(SEEDED_FAILED_ATTEMPT_SOURCE_REVISION),
      lastRunStatus: null,
      lastRunAt: null,
      ...overrides,
    });
  const attemptDate = formatRelativeTime(SEEDED_FAILED_ATTEMPT_STARTED_AT);

  it('shows "Last learning attempt failed (date, at step N)" beside "Last run" for an UNLEARNED test, from exactly one read', async () => {
    serveDetail(failedAttemptDetail());
    mountAt(uiTestPath(SEEDED_FAILED_ATTEMPT_TEST_ID), settledStore());

    await heading('Checkout smoke');
    const note = await screen.findByTestId(NOTE, {}, WAIT);
    expect(note).toHaveTextContent(`Last learning attempt failed (${attemptDate}, at step 1)`);
    expect(screen.getByTestId('ui-test-last-run')).toHaveTextContent('Last run: Never run');
    expect(within(screen.getByTestId('ui-test-detail-header')).getByTestId(NOTE)).toBe(note);
    await sleep(150);
    expect(guidedRequestCount('latest')).toBe(1);
  }, TEST_TIMEOUT_MS);

  it('shows the line for NEEDS_RELEARN too', async () => {
    serveDetail(failedAttemptDetail({ readiness: 'NEEDS_RELEARN' }));
    mountAt(uiTestPath(SEEDED_FAILED_ATTEMPT_TEST_ID), settledStore());

    await heading('Checkout smoke');
    expect(await screen.findByTestId(NOTE, {}, WAIT)).toHaveTextContent(
      `Last learning attempt failed (${attemptDate}, at step 1)`,
    );
  }, TEST_TIMEOUT_MS);

  it('leaves the step out when the steps were edited since the attempt (source revision differs)', async () => {
    serveDetail(failedAttemptDetail({ sourceRevision: Number(SEEDED_FAILED_ATTEMPT_SOURCE_REVISION) + 1 }));
    mountAt(uiTestPath(SEEDED_FAILED_ATTEMPT_TEST_ID), settledStore());

    await heading('Checkout smoke');
    const note = await screen.findByTestId(NOTE, {}, WAIT);
    expect(note).toHaveTextContent(`Last learning attempt failed (${attemptDate})`);
    expect(note).not.toHaveTextContent('at step');
  }, TEST_TIMEOUT_MS);

  it('is absent for a READY test, which sends no read at all', async () => {
    serveDetail(failedAttemptDetail({ readiness: 'READY' }));
    mountAt(uiTestPath(SEEDED_FAILED_ATTEMPT_TEST_ID), settledStore());

    await heading('Checkout smoke');
    await sleep(200);
    expect(screen.queryByTestId(NOTE)).toBeNull();
    expect(guidedRequestCount('latest')).toBe(0);
  }, TEST_TIMEOUT_MS);

  it('is absent for a LEARNING test', async () => {
    serveDetail(failedAttemptDetail({ readiness: 'LEARNING' }));
    mountAt(uiTestPath(SEEDED_FAILED_ATTEMPT_TEST_ID), settledStore());

    await heading('Checkout smoke');
    await sleep(200);
    expect(screen.queryByTestId(NOTE)).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('is absent for an UNLEARNED test with no attempt: the read is made and answers none', async () => {
    serveDetail(detailOf({ readiness: 'UNLEARNED', lastRunStatus: null, lastRunAt: null }));
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    await waitFor(() => expect(guidedRequestCount('latest')).toBe(1), WAIT);
    await sleep(150);
    expect(screen.queryByTestId(NOTE)).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('shows nothing and no error when the read fails', async () => {
    failGuidedRequests('latest', 'network');
    serveDetail(failedAttemptDetail());
    mountAt(uiTestPath(SEEDED_FAILED_ATTEMPT_TEST_ID), settledStore());

    await heading('Checkout smoke');
    await waitFor(() => expect(guidedRequestCount('latest')).toBe(1), WAIT);
    await sleep(150);
    expect(screen.queryByTestId(NOTE)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('ui-test-last-run')).toHaveTextContent('Last run: Never run');
  }, TEST_TIMEOUT_MS);
});

/** Serves `runs` on both execution reads (the list sorts newest first and honours `testId`, `status` and paging). */
function serveRuns(runs: ExecutionSnapshot[]) {
  studioMockServer.use(
    http.get(`${STUDIO_BASE}/executions`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const testId = params.get('testId');
      const status = params.get('status');
      const page = Number(params.get('page') ?? 0);
      const size = Number(params.get('size') ?? 20);
      let items = runs.filter((run) => testId === null || run.testId === testId);
      if (status) items = items.filter((run) => run.status === status);
      items = [...items].sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
      return HttpResponse.json({
        data: items.slice(page * size, (page + 1) * size),
        page,
        size,
        totalElements: items.length,
        totalPages: Math.max(1, Math.ceil(items.length / size)),
      });
    }),
    http.get(`${STUDIO_BASE}/executions/:id`, ({ params }) => {
      const found = runs.find((run) => run.executionId === params.id);
      return found
        ? HttpResponse.json(found)
        : HttpResponse.json({ error: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
    }),
  );
}

const runOf = (n: number, overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot => ({
  ...passedExecution,
  executionId: `e${n.toString(16).padStart(7, '0')}-0000-4000-8000-000000000000`,
  testId: TEST_ID,
  testName: 'Checkout smoke',
  triggerSource: 'MANUAL',
  acceptedAt: `2026-09-14T00:${String(n % 60).padStart(2, '0')}:00Z`,
  ...overrides,
});

describe('the shell: one page of cards, no tabs (STUDIO-UNIFY-001.7 AC-01)', () => {
  it('lays out the header, then the Overview, Recent Runs and Latest run cards, with no tab or tab link', async () => {
    serveDetail(detailOf());
    serveRuns([runOf(1), runOf(2)]);
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    expect(screen.queryAllByRole('tab')).toEqual([]);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Runs' })).toBeNull();

    const grid = screen.getByTestId('ui-test-detail-grid');
    const header = screen.getByTestId('ui-test-detail-header');
    const overview = within(grid).getByTestId('ui-test-overview');
    const recent = within(grid).getByTestId('ui-test-recent-runs');
    const latest = within(grid).getByTestId('ui-test-latest-run');
    const before = (first: Element, second: Element) =>
      Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
    // DOM order is the stacked order below 1200 px: header, Overview, Recent Runs, Latest run.
    expect(before(header, grid)).toBe(true);
    expect(before(overview, recent)).toBe(true);
    expect(before(recent, latest)).toBe(true);
    // Two columns: Overview and Recent Runs share the left one, the Latest run card is alone on the right.
    expect(overview.closest('[data-testid="ui-test-recent-runs"]')).toBeNull();
    expect(recent.parentElement).toBe(overview.closest('.MuiCard-root')?.parentElement);
    expect(latest.parentElement).not.toBe(recent.parentElement);
    expect(grid.children).toHaveLength(2);
    // The header is a card.
    expect(header).toHaveClass('MuiCard-root');
    expect(within(grid).getAllByText('Overview').length).toBeGreaterThan(0);
    expect(within(grid).getByText('Recent Runs')).toBeInTheDocument();
    expect(within(grid).getByText('Latest run')).toBeInTheDocument();
  }, TEST_TIMEOUT_MS);

  it('tells the Latest run card the test\'s confirmed revision: the "earlier version" line shows only when the newest run is of another revision', async () => {
    const CONFIRMED = '22222222-2222-4222-8222-222222222222';
    const EARLIER = '11111111-1111-4111-8111-111111111111';
    serveDetail(detailOf({ confirmedRevisionId: CONFIRMED }));
    serveRuns([runOf(1, { revisionId: EARLIER })]);
    mountAt(uiTestPath(TEST_ID), settledStore());

    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    expect(screen.getByTestId('ui-test-latest-run-earlier-version')).toBeInTheDocument();
    cleanup();

    // Later handlers take precedence over the first pair.
    serveDetail(detailOf({ confirmedRevisionId: CONFIRMED }));
    serveRuns([runOf(1, { revisionId: CONFIRMED })]);
    mountAt(uiTestPath(TEST_ID), settledStore());

    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    expect(screen.queryByTestId('ui-test-latest-run-earlier-version')).toBeNull();
  });

  it('opens a run URL as the same page with the drawer over it, and Close returns to the page without re-reading the test or remounting the cards', async () => {
    serveDetail(detailOf());
    serveRuns([runOf(1), runOf(2)]);
    const view = mountAt(uiTestRunPath(TEST_ID, runOf(1).executionId), settledStore());

    const drawer = await screen.findByTestId('run-details', {}, WAIT);
    expect(drawer).toHaveAttribute('data-execution-id', runOf(1).executionId);
    expect(await screen.findByTestId('ui-test-detail-header', {}, WAIT)).toHaveTextContent('Checkout smoke');
    const overview = screen.getByTestId('ui-test-overview');
    const recent = screen.getByTestId('ui-test-recent-runs');
    const latest = screen.getByTestId('ui-test-latest-run');
    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    expect(testReads(TEST_ID)).toHaveLength(1);

    await user().click(within(drawer).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(view.getLocation().pathname).toBe(uiTestPath(TEST_ID)), WAIT);
    await waitFor(() => expect(screen.queryByTestId('run-details')).toBeNull(), WAIT);
    await sleep(150);
    // The same page: the same card nodes, and the test was read once.
    expect(screen.getByTestId('ui-test-overview')).toBe(overview);
    expect(screen.getByTestId('ui-test-recent-runs')).toBe(recent);
    expect(screen.getByTestId('ui-test-latest-run')).toBe(latest);
    expect(testReads(TEST_ID)).toHaveLength(1);

    // "Open run details" on the Latest run card opens the newest run at its URL.
    await user().click(screen.getByRole('button', { name: 'Open run details' }));
    expect(view.getLocation().pathname).toBe(uiTestRunPath(TEST_ID, runOf(2).executionId));
    expect(await screen.findByTestId('run-details', {}, WAIT)).toHaveAttribute('data-execution-id', runOf(2).executionId);
    expect(screen.getByTestId('ui-test-overview')).toBe(overview);
    expect(testReads(TEST_ID)).toHaveLength(1);
  }, TEST_TIMEOUT_MS);

  it('renders no card, no run request and no drawer before the test read succeeds', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const detail = detailOf();
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, async () => {
        await gate;
        return HttpResponse.json(detail);
      }),
    );
    serveRuns([runOf(1)]);
    mountAt(uiTestRunPath(TEST_ID, runOf(1).executionId), settledStore());

    expect(await screen.findByTestId('ui-test-detail-loading')).toBeInTheDocument();
    await sleep(400);
    expect(testReads(TEST_ID)).toHaveLength(1);
    for (const testId of ['ui-test-detail', 'ui-test-detail-header', 'ui-test-detail-grid', 'ui-test-overview', 'ui-test-recent-runs', 'ui-test-latest-run', 'run-details']) {
      expect(screen.queryByTestId(testId), testId).toBeNull();
    }
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Checkout smoke')).toBeNull();
    expect(executionRequests()).toEqual([]);

    release();
    expect(await screen.findByTestId('ui-test-detail-header', {}, WAIT)).toHaveTextContent('Checkout smoke');
    expect(await screen.findByTestId(`run-${runOf(1).executionId}`, {}, WAIT)).toBeInTheDocument();
    expect(await screen.findByTestId('run-details-title', {}, WAIT)).toBeInTheDocument();
    expect(await screen.findByTestId('ui-test-latest-run-status', {}, WAIT)).toBeInTheDocument();
    expect(executionRequests().length).toBeGreaterThan(0);
  }, TEST_TIMEOUT_MS);

  it('a different id shows no content of the previous test: loading first, then its own answer', async () => {
    const otherId = 'c0000000-0000-0000-0000-00000000f0f0';
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, async ({ params }) => {
        if (params.id === TEST_ID) return HttpResponse.json(detailOf());
        await held;
        return HttpResponse.json({ error: 'STUDIO_FORBIDDEN', message: 'No' }, { status: 403 });
      }),
    );
    const view = mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    view.go(uiTestPath(otherId));
    expect(await screen.findByTestId('ui-test-detail-loading', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText('Checkout smoke')).toBeNull();
    expect(screen.queryByTestId('ui-test-overview')).toBeNull();

    release();
    expect(await screen.findByText(NOT_AVAILABLE, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText('Checkout smoke')).toBeNull();
  }, TEST_TIMEOUT_MS);
});

describe('STUDIO-UNIFY-001.8 AC-03..AC-05: the header follows a run watched on the page', () => {
  const LONG_WAIT = { timeout: 25_000 } as const;
  const headerStatus = () => screen.getByTestId('ui-test-status');
  const lastRun = () => screen.getByTestId('ui-test-last-run');

  /** A replay the page can watch: live (recording still processing, so the Latest run card polls). */
  const liveRun = (n: number) =>
    runOf(n, {
      status: 'RUNNING',
      durationMs: null,
      endedAt: null,
      revision: 3,
      streamComplete: false,
      video: { status: 'PROCESSING', error: null, expiresAt: null, partial: false },
      videoPath: null,
    });

  /** Serves the test from `current.detail`, so a test can change what the next read returns. */
  function serveChangingDetail(current: { detail: TestDetailDto }) {
    studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(current.detail)));
  }

  it('re-reads the test once when the watched run ends, shows what that read returned, and remounts nothing', async () => {
    const current = { detail: detailOf({ lastRunStatus: null, lastRunAt: null }) };
    serveChangingDetail(current);
    const runs = [liveRun(1)];
    serveRuns(runs);
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    expect(await screen.findByTestId('ui-test-latest-run-status', {}, WAIT)).toHaveTextContent('Running');
    expect(headerStatus()).toHaveTextContent('Not run');
    expect(lastRun()).toHaveTextContent('Last run: Never run');
    const nodes = ['ui-test-detail-header', 'ui-test-overview', 'ui-test-recent-runs', 'ui-test-latest-run'].map(
      (id) => [id, screen.getByTestId(id)] as const,
    );

    // The poll ticks while the run is live add no test read.
    await sleep(2_600);
    expect(testReads(TEST_ID)).toHaveLength(1);

    // The run ends and the backend has written its projection.
    const endedAt = new Date().toISOString();
    current.detail = detailOf({ lastRunStatus: 'PASSED', lastRunAt: endedAt });
    runs[0] = runOf(1, { revision: 9 });
    await waitFor(() => expect(testReads(TEST_ID)).toHaveLength(2), LONG_WAIT);
    await waitFor(() => expect(headerStatus()).toHaveTextContent('Passing'), WAIT);
    expect(lastRun()).toHaveTextContent('Passed');
    expect(lastRun()).toHaveTextContent(formatRelativeTime(endedAt));
    expect(screen.getByTestId('ui-test-latest-run-status')).toHaveTextContent('Passed');

    // No further read, and the same DOM nodes: nothing was remounted.
    await sleep(3_800);
    expect(testReads(TEST_ID)).toHaveLength(2);
    for (const [id, node] of nodes) expect(screen.getByTestId(id), id).toBe(node);

    // Opening and closing the drawer adds no test read either.
    await user().click(screen.getByRole('button', { name: 'Open run details' }));
    const drawer = await screen.findByTestId('run-details', {}, WAIT);
    await user().click(within(drawer).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('run-details')).toBeNull(), WAIT);
    await sleep(150);
    expect(testReads(TEST_ID)).toHaveLength(2);
    for (const [id, node] of nodes) expect(screen.getByTestId(id), id).toBe(node);
  }, 90_000);

  it('sends exactly one test read for a page whose newest run is already terminal, also across the drawer', async () => {
    serveDetail(detailOf());
    serveRuns([runOf(1)]);
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    expect(await screen.findByTestId('ui-test-latest-run-status', {}, WAIT)).toHaveTextContent('Passed');
    await sleep(300);
    expect(testReads(TEST_ID)).toHaveLength(1);

    await user().click(screen.getByRole('button', { name: 'Open run details' }));
    const drawer = await screen.findByTestId('run-details', {}, WAIT);
    await user().click(within(drawer).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('run-details')).toBeNull(), WAIT);
    await sleep(300);
    expect(testReads(TEST_ID)).toHaveLength(1);
  }, TEST_TIMEOUT_MS);

  it('a second watched run ends: one more test read', async () => {
    const current = { detail: detailOf({ lastRunStatus: null, lastRunAt: null }) };
    serveChangingDetail(current);
    const runs = [liveRun(1)];
    serveRuns(runs);
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    expect(await screen.findByTestId('ui-test-latest-run-status', {}, WAIT)).toHaveTextContent('Running');

    // Run 1 ends with its recording still processing, so the card keeps polling.
    current.detail = detailOf({ lastRunStatus: 'FAILED', lastRunAt: new Date().toISOString() });
    runs[0] = runOf(1, { status: 'FAILED', streamComplete: false, revision: 9, video: { status: 'PROCESSING', error: null, expiresAt: null, partial: false }, videoPath: null });
    await waitFor(() => expect(testReads(TEST_ID)).toHaveLength(2), LONG_WAIT);
    await waitFor(() => expect(headerStatus()).toHaveTextContent('Failing'), WAIT);

    // A newer replay starts and ends.
    runs.unshift(liveRun(2));
    await waitFor(() => expect(screen.getByTestId('ui-test-latest-run-status')).toHaveTextContent('Running'), LONG_WAIT);
    expect(testReads(TEST_ID)).toHaveLength(2);
    current.detail = detailOf({ lastRunStatus: 'PASSED', lastRunAt: new Date().toISOString() });
    runs[0] = runOf(2, { revision: 9 });
    await waitFor(() => expect(testReads(TEST_ID)).toHaveLength(3), LONG_WAIT);
    await waitFor(() => expect(headerStatus()).toHaveTextContent('Passing'), WAIT);
    await sleep(3_800);
    expect(testReads(TEST_ID)).toHaveLength(3);
  }, 120_000);

  it('a Cancelled ending causes the same single re-read, and the header shows what that read returned (Error)', async () => {
    const current = { detail: detailOf({ lastRunStatus: null, lastRunAt: null }) };
    serveChangingDetail(current);
    const runs = [liveRun(1)];
    serveRuns(runs);
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);

    // The backend stores a cancel as ERROR (TestDto has no errorCode), so the projection reads ERROR.
    current.detail = detailOf({ lastRunStatus: 'ERROR', lastRunAt: new Date().toISOString() });
    runs[0] = runOf(1, { status: 'ERROR', errorCode: CANCELLED_ERROR_CODE, revision: 9 });
    await waitFor(() => expect(testReads(TEST_ID)).toHaveLength(2), LONG_WAIT);
    expect(screen.getByTestId('ui-test-latest-run-status')).toHaveTextContent('Cancelled');
    await waitFor(() => expect(headerStatus()).toHaveTextContent('Error'), WAIT);
    expect(lastRun()).toHaveTextContent('Error');
    expect(lastRun()).not.toHaveTextContent('Cancelled');
    await sleep(3_800);
    expect(testReads(TEST_ID)).toHaveLength(2);
  }, 90_000);

  it('a Cancelled ending with an unchanged projection keeps the header as the second read returned it: the client derives nothing', async () => {
    const earlier = detailOf({ lastRunStatus: 'PASSED', lastRunAt: new Date(Date.now() - THREE_HOURS_MS).toISOString() });
    const current = { detail: earlier };
    serveChangingDetail(current);
    const runs = [liveRun(1)];
    serveRuns(runs);
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);
    expect(headerStatus()).toHaveTextContent('Passing');

    // The cancel is not a runner FINAL report, so the projection did not move: the re-read returns the same test.
    runs[0] = runOf(1, { status: 'ERROR', errorCode: CANCELLED_ERROR_CODE, revision: 9 });
    await waitFor(() => expect(testReads(TEST_ID)).toHaveLength(2), LONG_WAIT);
    expect(screen.getByTestId('ui-test-latest-run-status')).toHaveTextContent('Cancelled');
    await sleep(300);
    expect(headerStatus()).toHaveTextContent('Passing');
    expect(lastRun()).toHaveTextContent(formatRelativeTime(earlier.lastRunAt!));
    await sleep(3_800);
    expect(testReads(TEST_ID)).toHaveLength(2);
  }, 90_000);

  it('a failed re-read keeps the header as it was', async () => {
    const current = { detail: detailOf({ lastRunStatus: null, lastRunAt: null }) };
    let failing = false;
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () =>
        failing ? HttpResponse.json({ error: 'INTERNAL', message: 'x' }, { status: 500 }) : HttpResponse.json(current.detail),
      ),
    );
    const runs = [liveRun(1)];
    serveRuns(runs);
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    await screen.findByTestId('ui-test-latest-run-status', {}, WAIT);

    failing = true;
    runs[0] = runOf(1, { revision: 9 });
    // One re-read, which the API client's GET retry (2 retries on a 5xx) sends three times; wait for all of
    // them so none leaks into the next test.
    await waitFor(() => expect(testReads(TEST_ID)).toHaveLength(4), LONG_WAIT);
    await sleep(300);
    expect(testReads(TEST_ID)).toHaveLength(4);
    expect(headerStatus()).toHaveTextContent('Not run');
    expect(screen.getByTestId('ui-test-detail-header')).toBeInTheDocument();
    expect(screen.queryByTestId('ui-test-detail-error')).toBeNull();
  }, 90_000);
});

/** The two detail routes: the page and a run opened by its URL (the drawer over the page). */
const DETAIL_ROUTES: ReadonlyArray<[string, (id: string) => string]> = [
  ['detail', (id) => uiTestPath(id)],
  ['run drawer', (id) => uiTestRunPath(id, EXECUTION_ID)],
];

describe("AC-23: the detail routes follow derived availability", () => {
  it.each(DETAIL_ROUTES)("'pending' on the %s route: a loading state, and no Studio request", async (_name, pathOf) => {
    serveDetail(detailOf({ id: TEST_WITH_RUNS_ID }));
    // Nothing has been fetched yet: neither the sources nor the features.
    mountAt(pathOf(TEST_WITH_RUNS_ID), makeStore());

    expect(await screen.findByTestId('ui-test-detail-loading')).toHaveTextContent('Loading UI test…');
    expect(screen.queryByText(FEATURE_UNAVAILABLE)).toBeNull();
    expect(screen.queryByText('Checkout smoke')).toBeNull();
    await sleep(300);
    expect(studioRequests()).toEqual([]);
    expect(checksIdRequests()).toEqual([]);
  }, TEST_TIMEOUT_MS);

  it("'pending' while only one of sources and features has been fetched: still loading, still no Studio request", async () => {
    serveDetail(detailOf());
    const store = makeStore();
    store.dispatch(fetchSources.fulfilled([UI_TEST_SOURCE(true)], 'test', undefined));
    mountAt(uiTestPath(TEST_ID), store);

    expect(await screen.findByTestId('ui-test-detail-loading')).toBeInTheDocument();
    await sleep(300);
    expect(studioRequests()).toEqual([]);
  }, TEST_TIMEOUT_MS);

  it("'pending' ends when both answers arrive: only then is the test read, and the page renders", async () => {
    serveDetail(detailOf());
    const store = makeStore();
    mountAt(uiTestPath(TEST_ID), store);

    expect(await screen.findByTestId('ui-test-detail-loading')).toBeInTheDocument();
    await sleep(200);
    expect(studioRequests()).toEqual([]);

    act(() => {
      store.dispatch(fetchSources.fulfilled([UI_TEST_SOURCE(true)], 'test', undefined));
      store.dispatch(fetchFeatures.fulfilled({ sources: [], features: [STUDIO_FEATURE(true)] }, 'test', undefined));
    });
    await heading('Checkout smoke');
    expect(testReads(TEST_ID).length).toBeGreaterThan(0);
  }, TEST_TIMEOUT_MS);

  describe.each([
    ['the UI_TEST source is disabled', { source: false }],
    ['the STUDIO feature is disabled', { studio: false }],
  ])('when %s', (_reason, switches) => {
    it.each(DETAIL_ROUTES)('the %s route shows the feature-unavailable state and sends no Studio request', async (_name, pathOf) => {
      serveDetail(detailOf({ id: TEST_WITH_RUNS_ID }));
      mountAt(pathOf(TEST_WITH_RUNS_ID), settledStore(switches));

      expect(await screen.findByText(FEATURE_UNAVAILABLE)).toBeInTheDocument();
      expect(screen.queryByTestId('ui-test-detail-loading')).toBeNull();
      expect(screen.queryByText('Checkout smoke')).toBeNull();
      expect(screen.queryByTestId('ui-test-detail')).toBeNull();
      await sleep(300);
      expect(studioRequests()).toEqual([]);
      expect(checksIdRequests()).toEqual([]);
    }, TEST_TIMEOUT_MS);
  });
});

describe('AC-24: a test the caller cannot read', () => {
  it.each([403, 400] as const)(
    'GET answering %s on ui-tests/{id} or a run URL shows only the not-available message',
    async (status) => {
      for (const [name, pathOf] of DETAIL_ROUTES) {
        observed.length = 0;
        failRead(status);
        mountAt(pathOf(TEST_WITH_RUNS_ID), settledStore());

        expect(await screen.findByText(NOT_AVAILABLE, {}, WAIT), name).toBeInTheDocument();
        // The shared state and nothing else: no header, cards, table, drawer, Retry or error alert.
        expect(document.body.textContent, name).toBe(NOT_AVAILABLE_TEXT);
        expect(screen.getByRole('heading', { name: NOT_AVAILABLE_HEADING }), name).toBeInTheDocument();
        expect(screen.getByRole('button', { name: BACK_TO_ALL_CHECKS }), name).toBeInTheDocument();
        expect(screen.getByTestId('ui-test-detail-unavailable'), name).toBeInTheDocument();
        expect(screen.queryByTestId('ui-test-detail'), name).toBeNull();
        expect(screen.queryByRole('tablist'), name).toBeNull();
        expect(screen.queryByRole('button', { name: 'Retry' }), name).toBeNull();
        await sleep(300);
        // The read is the only Studio request: no runs list, no run read, no schedule, nothing for the run URL.
        expect(studioRequests().map((entry) => `${entry.method} ${entry.path}`), name).toEqual([
          `GET ${studioPath('tests', TEST_WITH_RUNS_ID)}`,
        ]);
        expect(checksIdRequests(), name).toEqual([]);
        cleanup();
        studioMockServer.resetHandlers();
        studioMockServer.use(
          http.get(`${API_BASE}/csi`, () => HttpResponse.json({ content: [], number: 0, size: 20, totalElements: 0, totalPages: 1 })),
        );
      }
    },
    TEST_TIMEOUT_MS,
  );

  it('a 403 test with a 200 execution (a soft-deleted parent) shows the message only, and the run is never read', async () => {
    failRead(403);
    // Precondition: the same server answers 200 for the execution, so the run content was available.
    await expect(studioApi.getExecution(EXECUTION_ID)).resolves.toMatchObject({ executionId: EXECUTION_ID });
    observed.length = 0;
    mountAt(uiTestRunPath(TEST_WITH_RUNS_ID, EXECUTION_ID), settledStore());

    expect(await screen.findByText(NOT_AVAILABLE, {}, WAIT)).toBeInTheDocument();
    expect(document.body.textContent).toBe(NOT_AVAILABLE_TEXT);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    await sleep(300);
    expect(executionRequests()).toEqual([]);
    expect(checksIdRequests()).toEqual([]);
  }, TEST_TIMEOUT_MS);
});

describe('AC-08: the not-available state is the shared component', () => {
  it('shows a heading and a Back to All Checks button that goes to /checks/all', async () => {
    failRead(403);
    const view = mountAt(uiTestPath(TEST_WITH_RUNS_ID), settledStore());

    expect(await screen.findByRole('heading', { name: NOT_AVAILABLE_HEADING }, WAIT)).toBeInTheDocument();
    expect(screen.getByText(NOT_AVAILABLE)).toBeInTheDocument();
    await user().click(screen.getByRole('button', { name: BACK_TO_ALL_CHECKS }));

    expect(await screen.findByTestId('all-checks-route')).toBeInTheDocument();
    expect(view.getLocation().pathname).toBe('/checks/all');
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
  }, TEST_TIMEOUT_MS);
});

describe('AC-24: a read that fails', () => {
  it.each(DETAIL_ROUTES)('500 on the %s route shows a load error with Retry, and nothing of the test or its runs', async (_name, pathOf) => {
    failRead(500);
    mountAt(pathOf(TEST_WITH_RUNS_ID), settledStore());

    const error = await screen.findByTestId('ui-test-detail-error', {}, WAIT);
    expect(error).toHaveTextContent('Failed to load this UI test.');
    expect(within(error).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
    expect(screen.queryByTestId('ui-test-detail')).toBeNull();
    expect(screen.queryByTestId('ui-test-detail-header')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    await sleep(200);
    expect(executionRequests()).toEqual([]);
    expect(checksIdRequests()).toEqual([]);
  }, TEST_TIMEOUT_MS);

  it('no response shows the same load error with Retry', async () => {
    failRead('network');
    mountAt(uiTestPath(TEST_ID), settledStore());

    const error = await screen.findByTestId('ui-test-detail-error', {}, WAIT);
    expect(within(error).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
    expect(screen.queryByTestId('ui-test-detail')).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('Retry repeats the read: loading meanwhile, the error again while it still fails, the page once it works', async () => {
    let mode: 'fail' | 'ok' = 'fail';
    const detail = detailOf();
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () =>
        mode === 'fail' ? HttpResponse.json({ error: 'INTERNAL', message: 'x' }, { status: 500 }) : HttpResponse.json(detail),
      ),
    );
    mountAt(uiTestPath(TEST_ID), settledStore());
    const u = user();

    await screen.findByTestId('ui-test-detail-error', {}, WAIT);
    const afterFirst = testReads(TEST_ID).length;
    expect(afterFirst).toBeGreaterThan(0);

    // Still failing: Retry sends the read again, shows loading while it is out, and the error returns.
    await u.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByTestId('ui-test-detail-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('ui-test-detail-error')).toBeNull();
    await screen.findByTestId('ui-test-detail-error', {}, WAIT);
    const afterSecond = testReads(TEST_ID).length;
    expect(afterSecond).toBeGreaterThan(afterFirst);

    // Working again: the next Retry reads once more and the page appears.
    mode = 'ok';
    await u.click(screen.getByRole('button', { name: 'Retry' }));
    await heading('Checkout smoke');
    expect(testReads(TEST_ID).length).toBeGreaterThan(afterSecond);
    expect(screen.queryByTestId('ui-test-detail-error')).toBeNull();
    expect(screen.getByTestId('ui-test-overview')).toBeInTheDocument();
  }, TEST_TIMEOUT_MS);
});
