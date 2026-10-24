import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
import { defaultConfiguration, type TestRequest } from '@/types/studio/studioTypes';
import type { CheckConfiguration } from '@/types/checks/checkTypes';
import { CREATE_ERRORS } from '@/components/studio/tests/testErrors';
import checksReducer from '@/store/slices/checksSlice';
import csiReducer from '@/store/slices/csiSlice';
import studioReducer from '@/store/slices/studioSlice';
import reportsReducer from '@/store/slices/reportsSlice';
import uiReducer from '@/store/slices/uiSlice';
import dashboardReducer from '@/store/slices/dashboardSlice';
import sourcesReducer, { fetchSources } from '@/store/slices/sourcesSlice';
import featuresReducer, { fetchFeatures } from '@/store/slices/featuresSlice';
import type { CheckSource } from '@/services/api/sourcesApi';
import type { FeatureFlag } from '@/services/api/featuresApi';
import CreateCheckPage from './CreateCheckPage';

/**
 * STUDIO-UNIFY-001.1, task 1.30: Create Check -> UI Test. The one form, the environment precedence,
 * `?type` preselect, the derived switch-off (including late sources), create and its inline errors, and
 * the removal of the legacy Studio-test picker. Each test gets its own store, so the sources/features
 * `fetched` flags (the `'pending'` state) can start unfetched.
 */

const API_BASE = '*/api/v1';
const DRAFT_KEY = 'checks:create:draft';
const WAIT = { timeout: 10_000 } as const;
const UI_TEST_CARD = 'UI Test (Checks Studio)';

const registeredCsis = [
  { id: '178672', name: 'Payments', description: '', businessUnit: 'Operations', criticality: 'HIGH', owner: 'owner@example.com', tags: [], environment: 'Development', status: 'OPERATIONAL', createdAt: '2026-09-20T12:00:00Z', updatedAt: '2026-09-20T12:00:00Z' },
  { id: '200001', name: 'Customer Portal', description: '', businessUnit: 'Digital', criticality: 'HIGH', owner: 'owner@example.com', tags: [], environment: 'Development', status: 'OPERATIONAL', createdAt: '2026-09-20T12:00:00Z', updatedAt: '2026-09-20T12:00:00Z' },
];

const source = (type: string, enabled: boolean): CheckSource => ({ type, enabled, label: type });
const studioFeature = (enabled: boolean): FeatureFlag => ({ key: 'STUDIO', enabled, label: 'Checks Studio' });

type Store = ReturnType<typeof makeStore>;

function makeStore() {
  return configureStore({
    reducer: {
      checks: checksReducer,
      csi: csiReducer,
      studio: studioReducer,
      reports: reportsReducer,
      ui: uiReducer,
      dashboard: dashboardReducer,
      sources: sourcesReducer,
      features: featuresReducer,
    },
  });
}

const answerSources = (store: Store, sources: CheckSource[]) =>
  act(() => { store.dispatch(fetchSources.fulfilled(sources, '')); });
const answerFeatures = (store: Store, features: FeatureFlag[]) =>
  act(() => { store.dispatch(fetchFeatures.fulfilled({ sources: [], features }, '')); });

/** Availability 'on': an empty sources list and an empty features list count as enabled (fail-open). */
function answerOn(store: Store) {
  answerSources(store, []);
  answerFeatures(store, []);
}

let user: ReturnType<typeof userEvent.setup>;
let createCalls: TestRequest[];
let studioRequests: string[];

function serveCsi() {
  studioMockServer.use(
    http.get(`${API_BASE}/csi`, () =>
      HttpResponse.json({ data: registeredCsis, page: 0, size: 20, totalElements: registeredCsis.length, totalPages: 1 }),
    ),
  );
}

/** Records any Studio request. Registered first in each test, so a test's own handler wins over it. */
function recordStudioRequests() {
  studioMockServer.use(
    http.all(`${API_BASE}/studio/*`, ({ request }) => {
      studioRequests.push(`${request.method} ${new URL(request.url).pathname}`);
      return HttpResponse.json({}, { status: 500 });
    }),
  );
}

function serveCreate(status: number, body: object = {}) {
  studioMockServer.use(http.post(`${API_BASE}/studio/tests`, async ({ request }) => {
    createCalls.push(await request.json() as TestRequest);
    if (status === 201) return HttpResponse.json({ ...readyDraft, ...createCalls[createCalls.length - 1], id: 'new-id' }, { status });
    return HttpResponse.json(body, { status });
  }));
}

const seedDraft = (draft: Record<string, unknown>) => {
  const raw = JSON.stringify(draft);
  localStorage.setItem(DRAFT_KEY, raw);
  return raw;
};
const storedDraft = () => JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Record<string, unknown> | null;

const httpDraft = { name: 'Draft name', description: 'Draft description', checkType: 'HTTP', csiId: '178672', environment: 'Staging' };
const uiTestDraft = { ...httpDraft, checkType: 'UI_TEST' };

/** Renders the create route (or edit/:id) with one earlier history entry, so Back can be observed. */
function renderPage(options: { url?: string; store?: Store; availability?: 'on' | 'pending' } = {}) {
  const { url = '/checks/create', store = makeStore(), availability = 'on' } = options;
  if (availability === 'on') answerOn(store);
  serveCsi();
  const router = createMemoryRouter(
    [
      { path: '/checks', element: <output>checks home</output> },
      { path: '/checks/create', element: <CreateCheckPage /> },
      { path: '/checks/edit/:id', element: <CreateCheckPage /> },
      { path: '/checks/ui-tests/:id/studio', element: <output>studio editor</output> },
    ],
    { initialEntries: ['/checks', url], initialIndex: 1 },
  );
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { store, router };
}

const nameField = () => screen.getByRole('textbox', { name: /name/i });
const environmentField = () => screen.getByRole('combobox', { name: /environment/i });
// The regular Basic Information step labels its Environment select without linking the label, so find it by its label text.
const regularEnvironmentField = () =>
  within(screen.getAllByText(/^Environment/)[0].closest('.MuiFormControl-root') as HTMLElement).getByRole('combobox');
const createButton = () => screen.getByRole('button', { name: 'Create and open Studio' });

const cardRoot = () => screen.getByText(UI_TEST_CARD).closest('.MuiCard-root') as HTMLElement;
const selectUiTestCard = () => user.click(screen.getByText(UI_TEST_CARD));

async function waitForCsis() {
  // The page fetches the CSI registry on mount; the select is usable once it has answered.
  await waitFor(() => expect(screen.getByRole('combobox', { name: /System \(CSI\)/i })).not.toHaveAttribute('aria-disabled', 'true'), WAIT);
}

async function chooseSystem() {
  await waitForCsis();
  await user.click(screen.getByRole('combobox', { name: /System \(CSI\)/i }));
  await user.click(await screen.findByRole('option', { name: '178672: Payments' }, WAIT));
}

async function chooseRegularSystem() {
  await user.click(await screen.findByRole('combobox', { name: /csi entity/i }, WAIT));
  await user.click(await screen.findByRole('option', { name: '178672 - Payments' }, WAIT));
}

async function chooseEnvironment(environment: string) {
  await user.click(environmentField());
  await user.click(await screen.findByRole('option', { name: environment }, WAIT));
}

async function typeName(value: string) {
  await user.click(nameField());
  await user.paste(value);
}

async function openUiTestForm(store?: Store) {
  const rendered = renderPage({ store });
  await selectUiTestCard();
  await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
  return rendered;
}

/** Autosave debounces 400 ms; this is longer, so a write that was going to happen has happened. */
const afterAutosaveWindow = () => new Promise((resolve) => setTimeout(resolve, 900));

beforeAll(() => {
  studioMockServer.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  user = userEvent.setup({ delay: null });
  createCalls = [];
  studioRequests = [];
  localStorage.clear();
  recordStudioRequests();
});
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
  localStorage.clear();
});
afterAll(() => {
  studioMockServer.close();
});

describe('AC-05 (type model): the frontend check type model has no uiTest configuration field', () => {
  it('rejects a uiTest configuration at compile time', () => {
    // Type-check is the assertion: if `uiTest` returns to CheckConfiguration, this directive is unused and tsc fails.
    // @ts-expect-error uiTest was removed from CheckConfiguration (FR-04)
    const withLegacyField: CheckConfiguration = { uiTest: { testId: 'x' } };
    expect(withLegacyField).toBeDefined();
  });
});

describe('Create Check -> UI Test: the one form (AC-01)', { timeout: 20_000 }, () => {
  it('replaces the stepper with one form: Name, System, Environment (Development), Description, no tags', async () => {
    await openUiTestForm();
    await waitForCsis();

    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /System \(CSI\)/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /description/i })).toBeInTheDocument();
    expect(environmentField()).toHaveTextContent('Development');
    expect(screen.queryByLabelText(/tags/i)).toBeNull();
    expect(screen.getByText('0/255')).toBeInTheDocument();
  });

  it('offers exactly Development, Staging, UAT and Production, and lists registered systems only', async () => {
    await openUiTestForm();
    await waitForCsis();

    await user.click(environmentField());
    const environments = within(await screen.findByRole('listbox')).getAllByRole('option').map((option) => option.textContent);
    expect(environments).toEqual(['Development', 'Staging', 'UAT', 'Production']);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('combobox', { name: /System \(CSI\)/i }));
    const systems = within(await screen.findByRole('listbox')).getAllByRole('option').map((option) => option.textContent);
    expect(systems).toEqual(['178672: Payments', '200001: Customer Portal']);
  });

  it('hides the stepper, the other steps, Back/Next, Test Now and Create Check; Create and open Studio is the only submit', async () => {
    await openUiTestForm();
    await waitForCsis();

    for (const label of ['Check Configuration', 'Scheduling', 'Review']) {
      expect(screen.queryByText(label), label).toBeNull();
    }
    for (const name of ['Back', 'Next', 'Test Now', 'Create Check', 'Update Check']) {
      expect(screen.queryByRole('button', { name }), name).toBeNull();
    }
    expect(createButton()).toBeInTheDocument();
    // The type cards stay, so the user can switch type again.
    expect(screen.getByText(UI_TEST_CARD)).toBeInTheDocument();
    expect(screen.getByText('HTTP/HTTPS Check')).toBeInTheDocument();
  });

  it('rejects a name over 255 characters: the counter shows n/255 and Create stays disabled', async () => {
    await openUiTestForm();
    await chooseSystem();
    await typeName('a'.repeat(255));
    expect(screen.getByText('255/255')).toBeInTheDocument();
    expect(createButton()).toBeEnabled();

    await user.type(nameField(), 'b');
    expect(screen.getByText('256/255')).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
    expect(createCalls).toHaveLength(0);
  });

  it('requires a registered system: with none chosen Create stays disabled and no request is sent', async () => {
    serveCreate(201);
    await openUiTestForm();
    await waitForCsis();
    await typeName('Checkout journey');

    expect(screen.getByText('Choose the system this test belongs to.')).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
    // A disabled button cannot be pressed; the click is dispatched anyway to prove that no request follows.
    fireEvent.click(createButton());
    expect(createCalls).toHaveLength(0);
  });

  it('does not accept a stored system that the registry did not return', async () => {
    seedDraft({ ...uiTestDraft, csiId: '999999' });
    renderPage();
    await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
    await waitForCsis();

    expect(nameField()).toHaveValue('Draft name');
    expect(createButton()).toBeDisabled();
  });
});

describe('Create Check -> UI Test: environment precedence (AC-30)', { timeout: 20_000 }, () => {
  it('the card sets Development over a stored HTTP/Staging draft; UAT is kept; switching back keeps the fields', async () => {
    seedDraft(httpDraft);
    renderPage();
    // The stored draft is restored: the four-step stepper is on screen with its name.
    expect(await screen.findByDisplayValue('Draft name')).toBeInTheDocument();
    expect(screen.getByText('Check Configuration')).toBeInTheDocument();

    await selectUiTestCard();
    await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
    expect(environmentField()).toHaveTextContent('Development');

    await chooseEnvironment('UAT');
    expect(environmentField()).toHaveTextContent('UAT');

    await user.click(screen.getByText('HTTP/HTTPS Check'));
    // The stepper returns at Basic Information with name, description, CSI and UAT kept.
    expect(await screen.findByText('Check Configuration')).toBeInTheDocument();
    expect(screen.getByText('Scheduling')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /check name/i })).toHaveValue('Draft name');
    expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('Draft description');
    expect(screen.getByRole('combobox', { name: /csi entity/i })).toHaveValue('178672 - Payments');
    expect(regularEnvironmentField()).toHaveTextContent('UAT');
    expect(screen.queryByRole('button', { name: 'Create and open Studio' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();

    // Re-selecting the card after UAT was picked keeps UAT.
    await selectUiTestCard();
    await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
    expect(environmentField()).toHaveTextContent('UAT');
    expect(nameField()).toHaveValue('Draft name');
  });

  it('create?type=UI_TEST sets Development over a stored HTTP/Staging draft', async () => {
    seedDraft(httpDraft);
    renderPage({ url: '/checks/create?type=UI_TEST' });

    await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
    expect(environmentField()).toHaveTextContent('Development');
    expect(nameField()).toHaveValue('Draft name');
  });

  it('with no stored draft the card overrides the Production mount default', async () => {
    renderPage({ url: '/checks/create?type=UI_TEST' });

    await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
    expect(environmentField()).toHaveTextContent('Development');
  });

  it('a stored UI_TEST draft keeps its Staging environment when the page restores it', async () => {
    seedDraft(uiTestDraft);
    renderPage();

    await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
    expect(environmentField()).toHaveTextContent('Staging');
  });

  it('a stored UI_TEST draft keeps Staging when create?type=UI_TEST is opened as well', async () => {
    seedDraft(uiTestDraft);
    renderPage({ url: '/checks/create?type=UI_TEST' });

    await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
    expect(environmentField()).toHaveTextContent('Staging');
  });

  it('an environment picked on the form is kept when the card is re-selected after another type', async () => {
    await openUiTestForm();
    await chooseEnvironment('Staging');
    await user.click(screen.getByText('TCP Port Check'));
    await screen.findByText('Check Configuration');

    await selectUiTestCard();
    await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
    expect(environmentField()).toHaveTextContent('Staging');
  });
});

describe('Create Check -> UI Test: create and open Studio (AC-02, AC-03)', { timeout: 20_000 }, () => {
  async function fillForm(name = 'Checkout journey', description = 'Buys one item') {
    await chooseSystem();
    await typeName(name);
    await user.click(screen.getByRole('textbox', { name: /description/i }));
    await user.paste(description);
  }

  it('sends one POST with the builder body, removes the stored draft and replaces the route', async () => {
    serveCreate(201);
    seedDraft({ name: 'stale', checkType: 'HTTP' });
    const { router } = renderPage({ url: '/checks/create?type=UI_TEST' });
    await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
    // The stored draft was restored, so start from a clean name for the body.
    await user.clear(nameField());
    await fillForm();
    await chooseEnvironment('UAT');

    await user.click(createButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/checks/ui-tests/new-id/studio'), WAIT);
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toEqual({
      authoringSchemaVersion: 2,
      name: 'Checkout journey',
      csiId: '178672',
      description: 'Buys one item',
      environment: 'UAT',
      steps: [],
      variables: [],
      configuration: defaultConfiguration(),
    });
    // No autorun, and the history entry was replaced.
    expect(router.state.location.search).toBe('');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.getByText('studio editor')).toBeInTheDocument();

    // The draft is gone and stays gone: the unmounted form cannot write it back.
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    await afterAutosaveWindow();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

    // Browser Back does not return to the filled create form.
    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.pathname).toBe('/checks');
    expect(createCalls).toHaveLength(1);
  });

  it('sends the trimmed name and keeps Development when the environment was not changed', async () => {
    serveCreate(201);
    const { router } = await openUiTestForm();
    await chooseSystem();
    await typeName('  Padded name  ');

    await user.click(createButton());

    await waitFor(() => expect(createCalls).toHaveLength(1), WAIT);
    expect(createCalls[0]).toMatchObject({ name: 'Padded name', environment: 'Development', description: '' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/checks/ui-tests/new-id/studio'), WAIT);
  });

  it.each<[string, number, object, string]>([
    ['400 with detail', 400, { error: 'BAD_REQUEST', message: 'Name must not be blank' }, 'Name must not be blank'],
    ['400 without detail', 400, {}, CREATE_ERRORS.validation],
    ['403', 403, { message: 'denied' }, CREATE_ERRORS.forbidden],
    ['409', 409, { message: 'conflict' }, CREATE_ERRORS.conflict],
    ['500', 500, { message: 'boom' }, CREATE_ERRORS.generic],
  ])('shows a %s refusal inline, keeps the route and the entered fields', async (_case, status, body, message) => {
    serveCreate(status, body);
    const { router } = await openUiTestForm();
    await fillForm();

    await user.click(createButton());

    expect(await screen.findByText(message, {}, WAIT)).toBeInTheDocument();
    expect(createCalls).toHaveLength(1);
    expect(router.state.location.pathname).toBe('/checks/create');
    expect(nameField()).toHaveValue('Checkout journey');
    expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('Buys one item');
    expect(screen.getByRole('combobox', { name: /System \(CSI\)/i })).toHaveTextContent('178672: Payments');
    expect(createButton()).toBeEnabled();
    // The stored draft survives a failed create.
    await waitFor(() => expect(storedDraft()?.name).toBe('Checkout journey'), WAIT);
  });
});

describe('Create Check -> UI Test: the type card and ?type (AC-04, AC-23)', { timeout: 20_000 }, () => {
  it('preselects the card from ?type=UI_TEST over a stored draft of another type', async () => {
    seedDraft({ ...httpDraft, checkType: 'SPLUNK' });
    renderPage({ url: '/checks/create?type=UI_TEST' });

    await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
    expect(screen.queryByText('Check Configuration')).toBeNull();
  });

  it('keeps the card unselectable on edit/:id, and ignores ?type=UI_TEST there', async () => {
    studioMockServer.use(http.get(`${API_BASE}/checks/:id`, () => HttpResponse.json({ message: 'not found' }, { status: 404 })));
    renderPage({ url: '/checks/edit/check-1?type=UI_TEST' });
    await screen.findByText(/Edit Check/);

    expect(cardRoot()).toHaveStyle({ opacity: '0.5' });
    await selectUiTestCard();
    expect(screen.queryByRole('button', { name: 'Create and open Studio' })).toBeNull();
    expect(screen.getByText('Check Configuration')).toBeInTheDocument();
    // Other cards stay selectable on the edit page.
    expect(screen.getByText('HTTP/HTTPS Check').closest('.MuiCard-root')).toHaveStyle({ opacity: '1' });
  });

  it('a UI Test card is selectable (not dimmed) when UI tests are available', async () => {
    renderPage();
    expect(cardRoot()).toHaveStyle({ opacity: '1' });
  });

  it.each<[string, (store: Store) => void]>([
    ['the UI_TEST source is disabled', (store) => { answerSources(store, [source('UI_TEST', false)]); answerFeatures(store, [studioFeature(true)]); }],
    ['the STUDIO feature is off', (store) => { answerSources(store, []); answerFeatures(store, [studioFeature(false)]); }],
  ])('dims the card and preselects nothing when %s', async (_case, answer) => {
    const store = makeStore();
    answer(store);
    seedDraft(uiTestDraft);
    renderPage({ url: '/checks/create?type=UI_TEST', store, availability: 'pending' });

    await screen.findByText(UI_TEST_CARD);
    expect(cardRoot()).toHaveStyle({ opacity: '0.5' });
    await selectUiTestCard();
    expect(screen.queryByRole('button', { name: 'Create and open Studio' })).toBeNull();
    expect(screen.getByText('Check Configuration')).toBeInTheDocument();

    // The held type is dropped and never written.
    await waitFor(() => expect(storedDraft()?.checkType).not.toBe('UI_TEST'), WAIT);
    await afterAutosaveWindow();
    expect(storedDraft()?.checkType).not.toBe('UI_TEST');
    expect(studioRequests).toEqual([]);
  });

  it('treats an empty sources list with the STUDIO feature on as enabled', async () => {
    const store = makeStore();
    answerSources(store, []);
    answerFeatures(store, [studioFeature(true)]);
    renderPage({ url: '/checks/create?type=UI_TEST', store, availability: 'pending' });

    await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
  });

  it('holds a ?type=UI_TEST and a stored UI_TEST draft while pending: not applied, not written, not dropped', async () => {
    const store = makeStore();
    const raw = seedDraft(uiTestDraft);
    renderPage({ url: '/checks/create?type=UI_TEST', store, availability: 'pending' });

    await screen.findByText(UI_TEST_CARD);
    await afterAutosaveWindow();
    expect(screen.queryByRole('button', { name: 'Create and open Studio' })).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBe(raw);
    expect(studioRequests).toEqual([]);

    // Applied once both answers arrive and UI tests are on; the stored environment is kept.
    answerSources(store, []);
    expect(screen.queryByRole('button', { name: 'Create and open Studio' })).toBeNull();
    answerFeatures(store, []);
    await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
    expect(environmentField()).toHaveTextContent('Staging');
    expect(studioRequests).toEqual([]);
  });

  it('applies a held ?type=UI_TEST over a stored HTTP draft once availability turns on', async () => {
    const store = makeStore();
    const raw = seedDraft(httpDraft);
    renderPage({ url: '/checks/create?type=UI_TEST', store, availability: 'pending' });

    await screen.findByText(UI_TEST_CARD);
    await afterAutosaveWindow();
    expect(screen.queryByRole('button', { name: 'Create and open Studio' })).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBe(raw);

    answerOn(store);
    await screen.findByRole('button', { name: 'Create and open Studio' }, WAIT);
    expect(environmentField()).toHaveTextContent('Development');
  });

  it('when sources arrive with UI_TEST disabled after the first render, the held type is dropped and no form is shown', async () => {
    const store = makeStore();
    seedDraft(uiTestDraft);
    renderPage({ url: '/checks/create?type=UI_TEST', store, availability: 'pending' });
    await screen.findByText(UI_TEST_CARD);

    answerSources(store, [source('UI_TEST', false)]);
    answerFeatures(store, [studioFeature(true)]);

    await waitFor(() => expect(cardRoot()).toHaveStyle({ opacity: '0.5' }));
    expect(screen.queryByRole('button', { name: 'Create and open Studio' })).toBeNull();
    expect(screen.getByText('Check Configuration')).toBeInTheDocument();
    await waitFor(() => expect(storedDraft()?.checkType).not.toBe('UI_TEST'), WAIT);
    await afterAutosaveWindow();
    expect(storedDraft()?.checkType).not.toBe('UI_TEST');
    expect(studioRequests).toEqual([]);
  });

  it('resets a selected UI Test type when UI tests switch off, and shows the stepper again', async () => {
    const store = makeStore();
    await openUiTestForm(store);

    answerSources(store, [source('UI_TEST', false)]);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Create and open Studio' })).toBeNull(), WAIT);
    expect(screen.getByText('Check Configuration')).toBeInTheDocument();
    expect(cardRoot()).toHaveStyle({ opacity: '0.5' });
    await afterAutosaveWindow();
    expect(storedDraft()?.checkType).not.toBe('UI_TEST');
  });

  it('never writes UI_TEST to the draft while it is off, even for other edits', async () => {
    const store = makeStore();
    answerSources(store, [source('UI_TEST', false)]);
    answerFeatures(store, []);
    renderPage({ store, availability: 'pending' });
    await screen.findByText(UI_TEST_CARD);

    await user.click(screen.getByText('HTTP/HTTPS Check'));
    await user.click(await screen.findByRole('textbox', { name: /check name/i }));
    await user.paste('Plain check');

    await waitFor(() => expect(storedDraft()?.name).toBe('Plain check'), WAIT);
    expect(storedDraft()?.checkType).toBe('HTTP');
  });
});

describe('Create Check: no Studio test picker on any type (AC-05)', { timeout: 30_000 }, () => {
  it.each(['HTTP/HTTPS Check', 'TCP Port Check', 'Splunk Query', 'Grafana Metrics', 'ITRS Geneos', 'AppDynamics APM'])(
    'offers no Studio test picker after choosing %s',
    async (card) => {
      renderPage();
      await user.click(screen.getByText(card));
      await chooseRegularSystem();
      await user.click(await screen.findByRole('textbox', { name: /check name/i }));
      await user.paste('Some check');

      expect(screen.queryByLabelText('Studio Test')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Next' }));
      // The configuration step of the chosen regular type.
      expect(await screen.findByText('Check Configuration')).toBeInTheDocument();
      expect(screen.queryByLabelText('Studio Test')).toBeNull();
      expect(screen.queryByText(/studio test/i)).toBeNull();
    },
  );

  it('the Review step has no UI-test-picker section', async () => {
    renderPage();
    await user.click(screen.getByText('HTTP/HTTPS Check'));
    await chooseRegularSystem();
    await user.click(await screen.findByRole('textbox', { name: /check name/i }));
    await user.paste('Some check');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByLabelText(/endpoint url/i));
    await user.paste('https://example.test/health');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('button', { name: 'Create Check' }, WAIT)).toBeInTheDocument();
    expect(screen.getByText('Some check')).toBeInTheDocument();
    expect(screen.queryByText('Studio Test')).toBeNull();
    expect(screen.queryByText(/variable\(s\)/i)).toBeNull();
  });

  it('selecting UI Test shows no configuration step at all', async () => {
    await openUiTestForm();
    await waitForCsis();

    expect(screen.queryByLabelText('Studio Test')).toBeNull();
    expect(screen.queryByText('Check Configuration')).toBeNull();
    expect(screen.queryByText(/studio test/i)).toBeNull();
  });
});
