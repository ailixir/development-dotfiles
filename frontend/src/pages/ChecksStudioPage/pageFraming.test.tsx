import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail } from '@/services/mocks/studio/authoringState';
import { seedScheduleOccurrences } from '@/services/mocks/studio/schedulingHandlers';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
import { studioSchedulesApi } from '@/services/api/studioSchedulesApi';
import type { ScheduleOccurrence } from '@/types/studio/studioScheduling';
import type { TestDto } from '@/types/studio/studioTypes';
import { renderStudioAt } from '@/test/renderStudioAt';
import { uiTestEditorPath } from '@/components/studio/uiTestPaths';
import checksSlice from '@/store/slices/checksSlice';
import csiSlice from '@/store/slices/csiSlice';
import studioSlice from '@/store/slices/studioSlice';
import reportsSlice from '@/store/slices/reportsSlice';
import uiSlice from '@/store/slices/uiSlice';
import dashboardSlice from '@/store/slices/dashboardSlice';
import sourcesSlice, { fetchSources } from '@/store/slices/sourcesSlice';
import featuresSlice, { fetchFeatures } from '@/store/slices/featuresSlice';
import ChecksStudioPage, { TEST_NOT_AVAILABLE_MESSAGE } from './ChecksStudioPage';

/**
 * STUDIO-UNIFY-001.1, task 1.15 (AC-08, AC-09, AC-01 UAT, AC-23 editor gate): how the editor is
 * framed. The availability cases build their own store so `'pending'` can be held; the framing cases
 * use a store whose sources and features are settled and enabled.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';
const WAIT = { timeout: 15_000 } as const;
const TEST_TIMEOUT_MS = 60_000;

const draft: TestDto = { ...readyDraft, id: 'c0000000-0000-0000-0000-00000000f001', name: 'Framed test', environment: 'UAT' };

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

function providerFor(store: TestStore) {
  const Wrapper = ({ children }: { children?: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return Wrapper;
}

/** A store whose bootstrap reads have already settled, with both switches on. */
function settledStore(): TestStore {
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

const observed: { method: string; path: string }[] = [];
function record({ request }: { request: Request }) {
  observed.push({ method: request.method, path: new URL(request.url).pathname });
}
const studioRequests = () => observed.filter((entry) => entry.path.includes('/studio'));

function serve(served: TestDto = draft) {
  studioMockServer.use(
    http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
    http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [served], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, ({ params }) =>
      params.id === served.id
        ? HttpResponse.json(fixtureDetail(served))
        : HttpResponse.json({ error: 'STUDIO_FORBIDDEN', message: 'No' }, { status: 403 }),
    ),
  );
}

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
  studioMockServer.listen({ onUnhandledRequest: 'error' });
  studioMockServer.events.on('request:start', record);
});
beforeEach(() => {
  observed.length = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
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

describe('AC-23: the editor follows derived availability', () => {
  it("'pending': shows the Loading test… text, mounts no editor and sends no Studio request until the sources answer", async () => {
    serve();
    let releaseSources: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      releaseSources = resolve;
    });
    studioMockServer.use(
      http.get(`${API_BASE}/checks/sources`, async () => {
        await held;
        return HttpResponse.json({ sources: [{ type: 'UI_TEST', enabled: true, label: 'UI Test (Checks Studio)' }] });
      }),
    );
    const store = makeStore();
    void store.dispatch(fetchSources());
    await store.dispatch(fetchFeatures());
    renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(store) });

    expect(await screen.findByText('Loading test…')).toBeInTheDocument();
    expect(screen.queryByText('Checks Studio is not available in this environment.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run Test' })).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(studioRequests()).toEqual([]);

    // The answer arrives: availability is 'on', and only now does the editor mount and read the test.
    releaseSources();
    await screen.findByRole('heading', { level: 1, name: draft.name }, WAIT);
    expect(studioRequests().length).toBeGreaterThan(0);
  }, TEST_TIMEOUT_MS);

  it("'off' (UI_TEST source disabled): shows the unavailable state and sends no Studio request", async () => {
    serve();
    const store = makeStore();
    store.dispatch(
      fetchSources.fulfilled([{ type: 'UI_TEST', enabled: false, label: 'UI Test (Checks Studio)' }], 'test', undefined),
    );
    store.dispatch(
      fetchFeatures.fulfilled(
        { sources: [], features: [{ key: 'STUDIO', enabled: true, label: 'Checks Studio' }] },
        'test',
        undefined,
      ),
    );
    renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(store) });

    expect(await screen.findByText('Checks Studio is not available in this environment.')).toBeInTheDocument();
    expect(screen.queryByText('Loading test…')).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(studioRequests()).toEqual([]);
  }, TEST_TIMEOUT_MS);

  it("'off' (STUDIO feature disabled): shows the unavailable state and sends no Studio request", async () => {
    serve();
    const store = makeStore();
    store.dispatch(fetchSources.fulfilled([], 'test', undefined));
    store.dispatch(
      fetchFeatures.fulfilled(
        { sources: [], features: [{ key: 'STUDIO', enabled: false, label: 'Checks Studio' }] },
        'test',
        undefined,
      ),
    );
    renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(store) });

    expect(await screen.findByText('Checks Studio is not available in this environment.')).toBeInTheDocument();
    expect(studioRequests()).toEqual([]);
  }, TEST_TIMEOUT_MS);

  it('a failed sources fetch fails open: the editor mounts once the fetch has ended', async () => {
    serve();
    studioMockServer.use(http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ error: 'x' }, { status: 404 })));
    const store = makeStore();
    await Promise.all([store.dispatch(fetchSources()), store.dispatch(fetchFeatures())]);
    renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(store) });

    await screen.findByRole('heading', { level: 1, name: draft.name }, WAIT);
    expect(screen.queryByText('Checks Studio is not available in this environment.')).toBeNull();
  }, TEST_TIMEOUT_MS);
});

describe('AC-08: the breadcrumb, the read-only CSI and the leave guard', () => {
  it('shows "All Checks › {name}", with All Checks going to /checks/all', async () => {
    serve();
    renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByRole('heading', { level: 1, name: draft.name }, WAIT);
    const crumbs = screen.getByRole('navigation');
    const link = within(crumbs).getByRole('link', { name: 'All Checks' });
    expect(link).toHaveAttribute('href', '/checks/all');
    expect(within(crumbs).getByText(draft.name)).toBeInTheDocument();
    expect(crumbs.textContent).toBe(`All Checks›${draft.name}`);
  }, TEST_TIMEOUT_MS);

  it('shows the CSI as a read-only chip, with no control that edits it', async () => {
    serve();
    renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByRole('heading', { level: 1, name: draft.name }, WAIT);
    const chip = screen.getByTestId('studio-csi');
    expect(chip).toHaveTextContent(`CSI ${draft.csiId}`);
    expect(within(chip).queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox', { name: /CSI|System/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /CSI|System/ })).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('the in-page back goes to /checks/studio/tests when nothing is unsaved', async () => {
    serve();
    const view = renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByRole('heading', { level: 1, name: draft.name }, WAIT);
    await user().click(screen.getByRole('button', { name: 'UI Tests' }));
    expect(view.getLocation().pathname).toBe('/checks/studio/tests');
  }, TEST_TIMEOUT_MS);

  it('with unsaved edits the in-page back opens the leave dialog first, and Discard then leaves', async () => {
    serve();
    const view = renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    const step = await screen.findByRole('textbox', { name: 'Step 1' }, WAIT);
    const u = user();
    await u.type(step, ' changed');
    await u.click(screen.getByRole('button', { name: 'UI Tests' }));

    const dialog = await screen.findByRole('dialog', {}, WAIT);
    expect(within(dialog).getByText('Save changes before continuing?')).toBeInTheDocument();
    expect(view.getLocation().pathname).toBe(uiTestEditorPath(draft.id));

    await u.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
    expect(view.getLocation().pathname).toBe('/checks/studio/tests');
  }, TEST_TIMEOUT_MS);

  it('with unsaved edits the All Checks crumb asks first too, and Keep editing stays', async () => {
    serve();
    const view = renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    const step = await screen.findByRole('textbox', { name: 'Step 1' }, WAIT);
    const u = user();
    await u.type(step, ' changed');
    await u.click(screen.getByRole('link', { name: 'All Checks' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    expect(view.getLocation().pathname).toBe(uiTestEditorPath(draft.id));
    await u.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    expect(view.getLocation().pathname).toBe(uiTestEditorPath(draft.id));
  }, TEST_TIMEOUT_MS);

  it('the All Checks crumb navigates straight away when nothing is unsaved', async () => {
    serve();
    const view = renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByRole('heading', { level: 1, name: draft.name }, WAIT);
    await user().click(screen.getByRole('link', { name: 'All Checks' }));
    expect(view.getLocation().pathname).toBe('/checks/all');
  }, TEST_TIMEOUT_MS);

  it('beforeunload still warns with unsaved edits, and only then', async () => {
    serve();
    renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    const step = await screen.findByRole('textbox', { name: 'Step 1' }, WAIT);
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await user().type(step, ' changed');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  }, TEST_TIMEOUT_MS);

  it('"Open Tests" (shown when the route test cannot be read) goes to /checks/studio/tests', async () => {
    serve();
    const view = renderStudioAt('c0000000-0000-0000-0000-00000000ffff', <ChecksStudioPage />, {
      wrapper: providerFor(settledStore()),
    });

    expect(await screen.findByText(TEST_NOT_AVAILABLE_MESSAGE, {}, WAIT)).toBeInTheDocument();
    await user().click(screen.getByRole('button', { name: 'Open Tests' }));
    expect(view.getLocation().pathname).toBe('/checks/studio/tests');
  }, TEST_TIMEOUT_MS);
});

describe('AC-01 (editor part): the environment select offers UAT', () => {
  it('shows UAT for a UAT test and lists Development, Staging, UAT and Production', async () => {
    serve();
    renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByRole('heading', { level: 1, name: draft.name }, WAIT);
    const select = screen.getByRole('combobox', { name: 'Environment' });
    expect(select).toHaveTextContent('UAT');
    await user().click(select);
    const options = await screen.findAllByRole('option', {}, WAIT);
    expect(options.map((option) => option.textContent)).toEqual(['Development', 'Staging', 'UAT', 'Production']);
  }, TEST_TIMEOUT_MS);
});

describe('AC-09 (editor part): the schedule dialog opened from the editor links to the Runs page run', () => {
  it('"View run" resolves to /checks/studio/runs/{executionId}', async () => {
    serve(readyDraft);
    const schedule = await studioSchedulesApi.create(readyDraft.id, {
      cronExpression: '0 */5 * * * *',
      timeZone: 'UTC',
      executionPrincipal: 'studio-local',
    });
    const row: ScheduleOccurrence = {
      id: 'occ-0', scheduleId: schedule.id, scheduleVersion: 2, testId: readyDraft.id, csiId: readyDraft.csiId!,
      environment: readyDraft.environment, executionPrincipal: 'studio-local', activationId: 'activation-1',
      activatedRevisionId: readyDraft.confirmedRevisionId, activatedBy: 'earlier.operator@citi.com',
      activatedAt: '2026-09-30T12:00:00Z', scheduledAt: '2026-10-05T12:00:00.000Z', localScheduledAt: '2026-10-05T12:00:00',
      timeZone: 'UTC', offsetSeconds: 0, decision: 'ACCEPTED', code: 'ACCEPTED', executionId: 'real-run',
      acceptedAt: '2026-10-05T12:00:00Z', retryAt: null, graceExpiresAt: '2026-10-05T13:00:00Z',
      createdAt: '2026-10-05T12:00:00Z', updatedAt: '2026-10-05T12:00:00Z', missedFrom: null, missedUntil: null, missedCount: null,
    };
    seedScheduleOccurrences(readyDraft.id, [row]);
    renderStudioAt(readyDraft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByRole('heading', { level: 1, name: readyDraft.name }, WAIT);
    await user().click(await screen.findByRole('button', { name: 'Manage schedule' }, WAIT));
    const table = await screen.findByRole('table', { name: 'Schedule occurrences' }, WAIT);
    expect(within(table).getByRole('link', { name: 'View run' })).toHaveAttribute('href', '/checks/studio/runs/real-run');
  }, TEST_TIMEOUT_MS);
});
