import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail } from '@/services/mocks/studio/authoringState';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
import type { TestDto } from '@/types/studio/studioTypes';
import { renderStudioAt } from '@/test/renderStudioAt';
import { uiTestEditorPath, uiTestPath } from '@/components/studio/uiTestPaths';
import checksSlice from '@/store/slices/checksSlice';
import csiSlice from '@/store/slices/csiSlice';
import studioSlice from '@/store/slices/studioSlice';
import reportsSlice from '@/store/slices/reportsSlice';
import uiSlice from '@/store/slices/uiSlice';
import dashboardSlice from '@/store/slices/dashboardSlice';
import sourcesSlice, { fetchSources } from '@/store/slices/sourcesSlice';
import featuresSlice, { fetchFeatures } from '@/store/slices/featuresSlice';
import ChecksStudioPage from './ChecksStudioPage';
import { TEST_NOT_AVAILABLE_MESSAGE } from '@/components/studio/StudioUnavailable';
import { DEV_TRANSPORT_SCENARIO, createScriptedTransport } from '@/services/mocks/studio/executionScenarios';
import { resetExecutionTransportSeam, setExecutionTransportSeam } from '@/services/api/studioTransportWiring';
import { setGuidedStartCapability } from '@/services/mocks/studio/capabilityHandlers';
import {
  SEEDED_FAILED_ATTEMPT_TEST_ID,
  failGuidedRequests,
  guidedRequestCount,
} from '@/services/mocks/studio/guidedHandlers';
import { unlearnedDraft, needsRelearnDraft } from '@/services/mocks/studio/readinessFixtures';
import { RUN_IN_PROGRESS_EVIDENCE_MESSAGE } from '@/components/studio/evidence';
import { STEP_WAITING_WORD } from '@/components/studio/run/ExecutionProgressView';

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
  resetExecutionTransportSeam();
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
  it('shows "All Checks › {name} › Studio", linking All Checks to /checks/all and the name to the test\'s detail page', async () => {
    serve();
    renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByRole('heading', { level: 1, name: draft.name }, WAIT);
    const crumbs = screen.getByRole('navigation');
    const link = within(crumbs).getByRole('link', { name: 'All Checks' });
    expect(link).toHaveAttribute('href', '/checks/all');
    expect(within(crumbs).getByRole('link', { name: draft.name })).toHaveAttribute('href', uiTestPath(draft.id));
    // "Studio" is the current item: text, not a link.
    expect(within(crumbs).getByTestId('studio-breadcrumb-current')).toHaveTextContent('Studio');
    expect(within(crumbs).queryByRole('link', { name: 'Studio' })).toBeNull();
    expect(crumbs.textContent).toBe(`All Checks›${draft.name}›Studio`);
    // The separate "UI Tests" button is gone.
    expect(screen.queryByRole('button', { name: 'UI Tests' })).toBeNull();
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

  it('the test-name crumb goes to the test\'s detail page when nothing is unsaved', async () => {
    serve();
    const view = renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByRole('heading', { level: 1, name: draft.name }, WAIT);
    await user().click(within(screen.getByRole('navigation')).getByRole('link', { name: draft.name }));
    expect(view.getLocation().pathname).toBe(uiTestPath(draft.id));
  }, TEST_TIMEOUT_MS);

  it('with unsaved edits the test-name crumb opens the leave dialog first, and Discard then leaves', async () => {
    serve();
    const view = renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    const step = await screen.findByRole('textbox', { name: 'Step 1' }, WAIT);
    const u = user();
    await u.type(step, ' changed');
    await u.click(within(screen.getByRole('navigation')).getByRole('link', { name: draft.name }));

    const dialog = await screen.findByRole('dialog', {}, WAIT);
    expect(within(dialog).getByText('Save changes before continuing?')).toBeInTheDocument();
    expect(view.getLocation().pathname).toBe(uiTestEditorPath(draft.id));

    await u.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
    expect(view.getLocation().pathname).toBe(uiTestPath(draft.id));
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

  it.each([403, 400] as const)(
    'a route test that answers %s shows only the shared not-available state, and its back button goes to /checks/all',
    async (status) => {
      serve();
      studioMockServer.use(
        http.get(`${STUDIO_BASE}/tests/:id`, () =>
          HttpResponse.json({ error: 'STUDIO_FORBIDDEN', message: 'No' }, { status }),
        ),
      );
      const view = renderStudioAt('c0000000-0000-0000-0000-00000000ffff', <ChecksStudioPage />, {
        wrapper: providerFor(settledStore()),
      });

      expect(await screen.findByText(TEST_NOT_AVAILABLE_MESSAGE, {}, WAIT)).toBeInTheDocument();
      expect(screen.getByTestId('studio-test-unavailable')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'UI test not available' })).toBeInTheDocument();
      // None of the editor: title, save state, coach, step guidance, add-a-step, and every header control.
      expect(screen.queryByRole('heading', { name: 'Checks Studio' })).toBeNull();
      expect(screen.queryByTestId('studio-save-state')).toBeNull();
      expect(screen.queryByText('Write your steps')).toBeNull();
      expect(screen.queryByText('Test setup')).toBeNull();
      expect(screen.queryByText(/Add a test step/i)).toBeNull();
      for (const name of ['Templates', 'Save', 'Run Test', 'Variables']) {
        expect(screen.queryByRole('button', { name }), name).toBeNull();
      }
      // Nothing is requested for the check behind the test.
      expect(observed.filter((entry) => /\/api\/v1\/checks\/(?!sources$)/.test(entry.path))).toEqual([]);

      await user().click(screen.getByRole('button', { name: 'Back to All Checks' }));
      expect(view.getLocation().pathname).toBe('/checks/all');
    },
    TEST_TIMEOUT_MS,
  );

  it('a route test that answers 500 keeps the editor and shows no not-available state', async () => {
    serve();
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json({ error: 'INTERNAL', message: 'x' }, { status: 500 })),
    );
    renderStudioAt('c0000000-0000-0000-0000-00000000ffff', <ChecksStudioPage />, {
      wrapper: providerFor(settledStore()),
    });

    expect(await screen.findByText('Test setup', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByTestId('studio-test-unavailable')).toBeNull();
    expect(screen.queryByText(TEST_NOT_AVAILABLE_MESSAGE)).toBeNull();
  }, TEST_TIMEOUT_MS);
});

describe('AC-05: the editor opens without scrolling itself', () => {
  it('no element is scrolled into view while the editor loads', async () => {
    serve();
    const spy = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy as unknown as typeof Element.prototype.scrollIntoView;
    try {
      renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });
      await screen.findByRole('textbox', { name: 'Step 1' }, WAIT);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
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

/** STUDIO-UNIFY-001.6 AC-04 (editor part): the last failed learn, read from the server. */
describe('AC-04 (editor part): the last learning attempt that failed', () => {
  /** The seeded failed attempt (source revision 5, stopped at step 1) belongs to this test id. */
  const seeded = (overrides: Partial<TestDto>): TestDto => ({
    ...unlearnedDraft,
    id: SEEDED_FAILED_ATTEMPT_TEST_ID,
    name: 'Statements download',
    sourceRevision: 5,
    ...overrides,
  });
  const NOTE = 'last-learning-attempt';

  it.each(['UNLEARNED', 'NEEDS_RELEARN'] as const)(
    '%s test: shows "Last learning attempt failed (date, at step N)" in the Test setup summary',
    async (readiness) => {
      const served = seeded({
        readiness,
        ...(readiness === 'NEEDS_RELEARN' ? { firstChangedStepId: needsRelearnDraft.firstChangedStepId } : {}),
      });
      serve(served);
      renderStudioAt(served.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

      const note = await screen.findByTestId(NOTE, {}, WAIT);
      expect(note.textContent).toMatch(/^Last learning attempt failed \(.+, at step 1\)$/u);
      // It sits in the Test setup summary, with the other facts about the test.
      expect(within(screen.getByText('Test setup').closest('.MuiCard-root') as HTMLElement).getByTestId(NOTE)).toBe(note);
      expect(guidedRequestCount('latest')).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it('leaves the step out when the steps were edited since the attempt (its source revision differs)', async () => {
    const served = seeded({ sourceRevision: 6 });
    serve(served);
    renderStudioAt(served.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    const note = await screen.findByTestId(NOTE, {}, WAIT);
    expect(note.textContent).toMatch(/^Last learning attempt failed \(.+\)$/u);
    expect(note.textContent).not.toContain('at step');
  }, TEST_TIMEOUT_MS);

  it('is hidden for a READY test, whatever its latest attempt was', async () => {
    const served = seeded({ readiness: 'READY', confirmedRevisionId: readyDraft.confirmedRevisionId });
    serve(served);
    renderStudioAt(served.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByRole('heading', { level: 1, name: served.name }, WAIT);
    await waitFor(() => expect(guidedRequestCount('latest')).toBe(1), WAIT);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(screen.queryByTestId(NOTE)).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('is hidden when the latest attempt is not FAILED', async () => {
    const served = seeded({});
    serve(served);
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/guided-sessions/latest`, () =>
        HttpResponse.json({
          schemaVersion: 3,
          attempts: [
            {
              testId: served.id,
              sessionId: 'succeeded-attempt',
              state: 'SUCCEEDED',
              startedAt: '2026-10-02T09:30:00Z',
              errorCode: null,
              explanation: null,
            },
          ],
        }),
      ),
    );
    renderStudioAt(served.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByRole('heading', { level: 1, name: served.name }, WAIT);
    await waitFor(() => expect(observed.some((entry) => entry.path.endsWith('/guided-sessions/latest'))).toBe(true), WAIT);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(screen.queryByTestId(NOTE)).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('is hidden when the test has no attempt', async () => {
    const served = { ...unlearnedDraft, id: 'c0000000-0000-0000-0000-00000000f002', name: 'No attempts' };
    serve(served);
    renderStudioAt(served.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByRole('heading', { level: 1, name: served.name }, WAIT);
    await waitFor(() => expect(guidedRequestCount('latest')).toBe(1), WAIT);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(screen.queryByTestId(NOTE)).toBeNull();
  }, TEST_TIMEOUT_MS);

  it.each([
    ['a server error', { status: 500, body: { error: { code: 'BOOM', message: 'Boom' } } }],
    ['a lost connection', 'network'],
  ] as const)('a failed read (%s) shows nothing and no error', async (_name, fault) => {
    failGuidedRequests('latest', fault);
    const served = seeded({});
    serve(served);
    renderStudioAt(served.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByRole('heading', { level: 1, name: served.name }, WAIT);
    await waitFor(() => expect(guidedRequestCount('latest')).toBe(1), WAIT);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(screen.queryByTestId(NOTE)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('keeps nothing in the browser: no localStorage or sessionStorage key mentions the attempt', async () => {
    const served = seeded({});
    serve(served);
    renderStudioAt(served.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByTestId(NOTE, {}, WAIT);
    const keys = [...Object.keys(window.localStorage), ...Object.keys(window.sessionStorage)];
    expect(keys.filter((key) => /attempt|latest/iu.test(key))).toEqual([]);
  }, TEST_TIMEOUT_MS);
});

/** STUDIO-UNIFY-001.6 AC-05 (page part). The pixel claims are asserted in the Playwright spec (task 6.11). */
describe('AC-05 (editor part): the Run caption renders in the header, under the actions', () => {
  it('the caption renders in the slot under the action row, inside the header and not in the title column', async () => {
    const served = { ...unlearnedDraft, name: 'A test name of thirty-eight characters' };
    expect(served.name).toHaveLength(38);
    setGuidedStartCapability(served.id, { available: false, code: 'RUNTIME_INCOMPATIBLE' });
    serve(served);
    renderStudioAt(served.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    const title = await screen.findByRole('heading', { level: 1, name: served.name }, WAIT);
    const control = await screen.findByRole('button', { name: 'Run Test' }, WAIT);
    await waitFor(() => expect(control).toBeEnabled(), WAIT);
    await user().click(control);
    const caption = await screen.findByTestId('run-start-unavailable', {}, WAIT);

    const header = title.closest('.MuiPaper-root') as HTMLElement;
    const slot = screen.getByTestId('run-caption-slot');
    expect(slot.contains(caption)).toBe(true);
    // In the header, under the action row: the slot is the next sibling of the row holding Run.
    expect(header.contains(slot)).toBe(true);
    expect(header.contains(caption)).toBe(true);
    const actionRow = control.closest('.MuiStack-root') as HTMLElement;
    expect(actionRow.nextElementSibling).toBe(slot);
    // The Run button is in the header, with its name.
    expect(header.contains(control)).toBe(true);
    // The title column may shrink below its content, so it gives way instead of pushing the actions;
    // neither the caption nor the slot is in it.
    const titleColumn = title.parentElement?.parentElement as HTMLElement;
    expect(titleColumn.contains(control)).toBe(false);
    expect(titleColumn.contains(slot)).toBe(false);
    expect(titleColumn).toHaveStyle({ minWidth: '0' });
    // That the breadcrumb stays on one line, and the header and caption sizes, are layout facts (jsdom
    // has no layout and no cascade by specificity); the Playwright spec measures them (task 6.11).
  }, TEST_TIMEOUT_MS);

  it('with no caption the slot is empty', async () => {
    serve(draft);
    renderStudioAt(draft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });

    await screen.findByRole('heading', { level: 1, name: draft.name }, WAIT);
    expect(screen.getByTestId('run-caption-slot')).toBeEmptyDOMElement();
  }, TEST_TIMEOUT_MS);
});

/**
 * STUDIO-UNIFY-001.6 AC-07 (page part), task 6.6.
 *
 * **Reproduction, recorded before the fix** (this page at the commit after lanes A, C, D, E; run 1 a
 * `PASSED` execution, run 2 accepted and held at its first `PENDING` frame, `startedAt: null`):
 *  - nothing from run 1 was on screen: `snapshot` is cleared by `beginRun`, and `setExecuting(true)`
 *    clears the Redux step results, current step and logs. The "previous run's time" the re-check
 *    reported was not carried-over state;
 *  - the Execution row showed a "Time" chip that counted from `acceptedAt` (`Time 56420:53.4` for the
 *    fixture's September `acceptedAt`; about a second in the real stack), although `durationMs` is
 *    browser time only;
 *  - the evidence area said "The recording is still being produced / The run's outcome may already be
 *    final, but its recording is not ready yet" for a run that had not started;
 *  - each pending step showed two "not attempted" slots (already replaced by lane E).
 * The cases below assert the corrected screen and that a started or ended run is unchanged.
 */
describe('AC-07 (page part): a replay that was accepted and has not started', () => {
  const pending = DEV_TRANSPORT_SCENARIO[0];
  const running = DEV_TRANSPORT_SCENARIO[1];
  const passed = DEV_TRANSPORT_SCENARIO[5];
  const withHistory: TestDto = { ...readyDraft, lastRunStatus: 'PASSED', lastRunAt: '2026-09-30T12:00:00Z' };

  async function openAndRun(secondRun: typeof pending[]) {
    let run = 0;
    setExecutionTransportSeam({
      primary: (host) => createScriptedTransport(run++ === 0 ? [passed] : secondRun, 0)(host),
      fallback: null,
    });
    serve(withHistory);
    studioMockServer.use(
      http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
        HttpResponse.json({ executionId: pending.executionId, status: 'PENDING' }, { status: 202 }),
      ),
    );
    renderStudioAt(withHistory.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });
    const u = user();
    const first = await screen.findByRole('button', { name: 'Run Test' }, WAIT);
    await waitFor(() => expect(first).toBeEnabled(), WAIT);
    await u.click(first);
    // Run 1 ends: its time and recording are on screen.
    expect(await screen.findByTestId('execution-time', {}, WAIT)).toHaveTextContent('Time 3.0s');
    expect(await screen.findByTestId('video-evidence', {}, WAIT)).toHaveAttribute('data-video-status', 'AVAILABLE');
    const again = await screen.findByRole('button', { name: 'Run Test' }, WAIT);
    await waitFor(() => expect(again).toBeEnabled(), WAIT);
    await u.click(again);
  }

  it('shows no time, the run-in-progress evidence message and one waiting word per step, with nothing of the previous run', async () => {
    await openAndRun([pending]);

    await waitFor(() => expect(screen.getByTestId('step-status-0')).toHaveTextContent('PENDING'), WAIT);
    expect(screen.queryByTestId('execution-time')).toBeNull();
    expect(screen.queryByText(/^Time /u)).toBeNull();
    expect(screen.getByTestId('video-evidence-pending-run')).toHaveTextContent(RUN_IN_PROGRESS_EVIDENCE_MESSAGE);
    expect(screen.queryByTestId('video-evidence')).toBeNull();
    expect(screen.queryByText(/outcome may already be final/u)).toBeNull();
    for (const index of [0, 1, 2]) {
      expect(screen.getByTestId(`step-waiting-${index}`)).toHaveTextContent(STEP_WAITING_WORD);
      expect(screen.queryByTestId(`step-offset-${index}`)).toBeNull();
      expect(screen.queryByTestId(`step-duration-${index}`)).toBeNull();
    }
    expect(document.body.textContent).not.toContain('not attempted');
  }, TEST_TIMEOUT_MS);

  it('once the run has started the time chip appears, counted from its start', async () => {
    await openAndRun([pending, running]);

    const chip = await screen.findByTestId('execution-time', {}, WAIT);
    await waitFor(() => expect(screen.getByTestId('step-status-0')).toHaveTextContent('RUNNING'), WAIT);
    // From `startedAt`, not from `acceptedAt` nine seconds earlier... and not run 1's "Time 3.0s".
    expect(chip.textContent).toMatch(/^Time /u);
    expect(chip).not.toHaveTextContent('Time 3.0s');
    expect(screen.getByTestId('step-waiting-0')).toHaveTextContent('Running');
  }, TEST_TIMEOUT_MS);

  it('an ended run is unchanged: its duration, its steps\' readings and its recording', async () => {
    await openAndRun([passed]);

    await waitFor(() => expect(screen.getByTestId('execution-time')).toHaveTextContent('Time 3.0s'), WAIT);
    expect(screen.getByTestId('step-offset-1')).toHaveTextContent('starts at 1510ms');
    expect(screen.getByTestId('step-duration-1')).toHaveTextContent('took 900ms');
    expect(screen.getByTestId('video-evidence')).toHaveAttribute('data-video-status', 'AVAILABLE');
    expect(screen.queryByTestId('video-evidence-pending-run')).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('a run that ended before it started still reads as ended: its recording state is described', async () => {
    const processing = DEV_TRANSPORT_SCENARIO[4];
    await openAndRun([{ ...processing, startedAt: null, durationMs: null }]);

    await waitFor(() => expect(screen.getByTestId('video-evidence')).toHaveAttribute('data-video-status', 'PROCESSING'), WAIT);
    expect(screen.queryByTestId('execution-time')).toBeNull();
  }, TEST_TIMEOUT_MS);
});

/** STUDIO-UNIFY-001.6 AC-08 (page part): the Logs tab of a replay reads like the step list. */
describe('AC-08 (page part): the Logs tab of a replay', () => {
  it('is the console, with 1-based steps and the end time on the closing line', async () => {
    const base = DEV_TRANSPORT_SCENARIO[5];
    const frame = {
      ...base,
      logs: [
        { at: '2026-09-15T10:00:02Z', level: 'INFO' as const, message: 'step 0 started: Go to "https://x"', stepIndex: 0 },
        { at: '2026-09-15T10:00:04Z', level: 'INFO' as const, message: 'step 1 passed', stepIndex: 1 },
        { at: null, level: 'INFO' as const, message: 'run PASSED', stepIndex: null },
      ],
    };
    setExecutionTransportSeam({ primary: createScriptedTransport([frame], 0), fallback: null });
    serve(readyDraft);
    studioMockServer.use(
      http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
        HttpResponse.json({ executionId: frame.executionId, status: 'PENDING' }, { status: 202 }),
      ),
    );
    renderStudioAt(readyDraft.id, <ChecksStudioPage />, { wrapper: providerFor(settledStore()) });
    const control = await screen.findByRole('button', { name: 'Run Test' }, WAIT);
    await waitFor(() => expect(control).toBeEnabled(), WAIT);
    const u = user();
    await u.click(control);
    await screen.findByTestId('execution-time', {}, WAIT);

    await u.click(screen.getByRole('tab', { name: 'Logs' }));
    const panel = screen.getByRole('tabpanel', { name: 'Logs' });
    expect(within(panel).queryByTestId('guided-learning-log')).toBeNull();
    const text = panel.textContent ?? '';
    expect(text).toContain('step 1 started: Go to "https://x"');
    expect(text).toContain('step 2 passed');
    expect(text).not.toContain('step 0 started');
    const endTime = new Date(frame.endedAt as string).toLocaleTimeString();
    expect(text).toContain(`${endTime}run PASSED`);
    expect(text).not.toContain('No logs are available.');
  }, TEST_TIMEOUT_MS);
});
