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
import { seedScheduleOccurrences } from '@/services/mocks/studio/schedulingHandlers';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
import studioApi from '@/services/api/studioApi';
import { studioSchedulesApi } from '@/services/api/studioSchedulesApi';
import type { ScheduleOccurrence } from '@/types/studio/studioScheduling';
import type { TestDetailDto } from '@/types/studio/studioTypes';
import { executionStatusLabel } from '@/components/studio/run/executionStatus';
import { LEARNED_READY_LABEL } from '@/components/studio/run/runEnablement';
import { uiTestEditorPath, uiTestPath, uiTestRunPath, uiTestRunsPath } from '@/components/studio/uiTestPaths';
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
import { UiTestOverviewTab } from './UiTestOverviewTab';
import { UiTestRunsTab } from './UiTestRunsTab';

/**
 * STUDIO-UNIFY-001.2, task 2.17 (detail-page half): the shell, the header and the Overview tab.
 *
 * AC-10 header and its actions, AC-11 Overview, AC-14 Run in Studio from the detail page, AC-23
 * availability gating on the detail routes, AC-24 the read gate and its error states, plus the
 * Learning half of AC-25 as far as the header chip and the Overview go. Where an AC says that no
 * request is sent, the count is taken at the mock server, not from a callback.
 *
 * The routes mirror `App.tsx`: the shell is the layout route of `ui-tests/:id`, with the Overview as
 * its index child and the Runs tab under `runs` and `runs/:executionId`. The Runs tab is mounted for
 * real so the cases that say "nothing from its runs renders" can see its requests.
 */

const STUDIO_BASE = '*/api/v1/studio';
/** A request path under the Studio API, built from segments. */
const studioPath = (...segments: string[]) => ['/api/v1', 'studio', ...segments].join('/');
const API_BASE = '*/api/v1';
const WAIT = { timeout: 15_000 } as const;
const TEST_TIMEOUT_MS = 60_000;

/** A fixture draft the schedule handlers also know, so the Schedule dialog works end to end. */
const TEST_ID = readyDraft.id;
/** A fixture test that has runs, so a runs tab that did mount would have data to show. */
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
            <Route index element={<UiTestOverviewTab />} />
            <Route path="runs" element={<UiTestRunsTab />} />
            <Route path="runs/:executionId" element={<UiTestRunsTab />} />
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

  it('Schedule opens the existing Studio schedule dialog, and closing it re-reads the test once', async () => {
    serveDetail(detailOf());
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    const u = user();
    await u.click(screen.getByRole('button', { name: 'Schedule' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    expect(within(dialog).getByText('Manage schedule · Checkout smoke')).toBeInTheDocument();
    // The dialog loads its own copy of the test; wait until that read and its capability read are done.
    await within(dialog).findByRole('button', { name: 'Close' }, WAIT);
    await waitFor(() => expect(testReads(TEST_ID).length).toBe(2), WAIT);
    await sleep(150);

    const beforeClose = testReads(TEST_ID).length;
    await u.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    await waitFor(() => expect(testReads(TEST_ID).length).toBe(beforeClose + 1), WAIT);
    await sleep(150);
    expect(testReads(TEST_ID).length).toBe(beforeClose + 1);
  }, TEST_TIMEOUT_MS);

  it('the schedule dialog opened here links a run to ui-tests/{id}/runs/{executionId}', async () => {
    serveDetail(detailOf());
    const schedule = await studioSchedulesApi.create(TEST_ID, {
      cronExpression: '0 */5 * * * *',
      timeZone: 'UTC',
      executionPrincipal: 'studio-local',
    });
    const row: ScheduleOccurrence = {
      id: 'occ-0', scheduleId: schedule.id, scheduleVersion: 2, testId: TEST_ID, csiId: readyDraft.csiId!,
      environment: readyDraft.environment, executionPrincipal: 'studio-local', activationId: 'activation-1',
      activatedRevisionId: readyDraft.confirmedRevisionId, activatedBy: 'earlier.operator@citi.com',
      activatedAt: '2026-09-30T12:00:00Z', scheduledAt: '2026-10-05T12:00:00.000Z', localScheduledAt: '2026-10-05T12:00:00',
      timeZone: 'UTC', offsetSeconds: 0, decision: 'ACCEPTED', code: 'ACCEPTED', executionId: 'real-run',
      acceptedAt: '2026-10-05T12:00:00Z', retryAt: null, graceExpiresAt: '2026-10-05T13:00:00Z',
      createdAt: '2026-10-05T12:00:00Z', updatedAt: '2026-10-05T12:00:00Z', missedFrom: null, missedUntil: null, missedCount: null,
    };
    seedScheduleOccurrences(TEST_ID, [row]);
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    await user().click(screen.getByRole('button', { name: 'Schedule' }));
    const table = await screen.findByRole('table', { name: 'Schedule occurrences' }, WAIT);
    expect(within(table).getByRole('link', { name: 'View run' })).toHaveAttribute('href', uiTestRunPath(TEST_ID, 'real-run'));
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
    // Let the Overview's own reads (CSI registry, schedule summary) finish, so only the click is measured.
    await waitFor(() => expect(screen.getByTestId(`schedule-summary-${TEST_ID}`)).toHaveTextContent(/^Schedule: /), WAIT);
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

describe('AC-11: the Overview tab', () => {
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

  it('shows the schedule summary, from the schedule the test has', async () => {
    serveDetail(detailOf());
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    const summary = screen.getByTestId(`schedule-summary-${TEST_ID}`);
    await waitFor(() => expect(summary).toHaveTextContent('Schedule: No schedule'), WAIT);
    expect(within(screen.getByTestId('ui-test-overview-schedule')).getByText('Schedule')).toBeInTheDocument();
  }, TEST_TIMEOUT_MS);

  it('shows a saved schedule in the summary', async () => {
    serveDetail(detailOf());
    await studioSchedulesApi.create(TEST_ID, {
      cronExpression: '0 */5 * * * *',
      timeZone: 'UTC',
      executionPrincipal: 'studio-local',
    });
    observed.length = 0;
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    await waitFor(() => expect(screen.getByTestId(`schedule-summary-${TEST_ID}`)).toHaveTextContent('Schedule: Paused'), WAIT);
  }, TEST_TIMEOUT_MS);

  it('reads the test only, never writing, and never probing /checks/{id}', async () => {
    serveDetail(detailOf());
    mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    await waitFor(() => expect(screen.getByTestId(`schedule-summary-${TEST_ID}`)).toHaveTextContent(/^Schedule: /), WAIT);
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

describe('the shell: tabs follow the route', () => {
  it('links Overview to ui-tests/{id} and Runs to ui-tests/{id}/runs, and the Runs tab opens the runs route', async () => {
    serveDetail(detailOf());
    const view = mountAt(uiTestPath(TEST_ID), settledStore());

    await heading('Checkout smoke');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('href', uiTestPath(TEST_ID));
    const runsTab = screen.getByRole('tab', { name: 'Runs' });
    expect(runsTab).toHaveAttribute('href', uiTestRunsPath(TEST_ID));

    await user().click(runsTab);
    expect(view.getLocation().pathname).toBe(uiTestRunsPath(TEST_ID));
    expect(screen.queryByTestId('ui-test-overview')).toBeNull();
    // The header and the tab strip stay while the tab content changes.
    expect(screen.getByRole('heading', { level: 1, name: 'Checkout smoke' })).toBeInTheDocument();
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

/** The three detail routes: the Overview, the Runs list and a run opened by its URL. */
const DETAIL_ROUTES: ReadonlyArray<[string, (id: string) => string]> = [
  ['detail', (id) => uiTestPath(id)],
  ['runs', (id) => uiTestRunsPath(id)],
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
    'GET answering %s on ui-tests/{id}, a runs route or a run URL shows only the not-available message',
    async (status) => {
      for (const [name, pathOf] of DETAIL_ROUTES) {
        observed.length = 0;
        failRead(status);
        mountAt(pathOf(TEST_WITH_RUNS_ID), settledStore());

        expect(await screen.findByText(NOT_AVAILABLE, {}, WAIT), name).toBeInTheDocument();
        // The shared state and nothing else: no header, tabs, table, drawer, Retry or error alert.
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
