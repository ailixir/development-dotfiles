import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { readyDraft, staleDraft, draftsByCompileStatus } from '@/services/mocks/studio/compileFixtures';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import ChecksStudioPage from './ChecksStudioPage';

/**
 * Story 10.11a — the **page's** Run affordance, and the retirement observed where a user meets it
 * (AC-2, AC-3a).
 *
 * `runGate.test.tsx` asserts the same properties against `RunControl`. This file exists because
 * that is not sufficient on its own and the criterion says why: a guard on the control cannot see
 * *"a gate reconstructed through a differently-named local"* one level up, in the page that
 * previously held its own `disabled` expression beside its own `handleRunTest` guard. So the
 * assertions here are made against the real page, with the real store, the real router and the
 * real editor — and counted, as everywhere else in this story, on the requests the mock server
 * observed.
 *
 * It is the most expensive test this half owns. @po named expensive delivery tests as the first
 * thing to be cut under pressure; it is kept for the reason it was written.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';

const SPEC_DIR = path.resolve(__dirname, '../../../../docs/specs/studio');
const openapi = parseYaml(fs.readFileSync(path.join(SPEC_DIR, 'openapi.yaml'), 'utf8'));
const TIMEOUT_BOUND = openapi.components.schemas.TestConfiguration.properties.timeoutSeconds;

/*
 * ENV-TIMING-1 (10.11a's gate, repeated as REL-001 on 10.16a's): the waits in this file are bounded
 * explicitly, not by Testing Library's 1 s and Vitest's 5 s defaults.
 *
 * The page renders in full before Run is enabled. Run alone, the AC-2 test takes about 1.1 s. In the full suite, @qa measured
 * 2.2–2.7 s on 10.16a's base and 3.7–4.2 s on its head at load 12–16. At load 40 the 1 s wait
 * ran out, even though the page it dumped was fully rendered. The bounds below are sized
 * from those numbers: each wait gets more than twice the slowest whole-test duration measured, and
 * each test gets room for every wait it makes.
 *
 * Only the time allowed changes. Every assertion is still made. These waits end on the first
 * success, so a green run takes no longer than before. A longer bound only delays the report of a
 * real failure.
 */
const PAGE_WAIT_MS = 10_000;
const pageWait = { timeout: PAGE_WAIT_MS } as const;
/** The most bounded waits any test below makes is four, plus clicks and typing. */
const PAGE_TEST_TIMEOUT_MS = 5 * PAGE_WAIT_MS;
/**
 * TEST-005: AC-2 waits for the run it started to end (about 5 s after acceptance when run alone,
 * set by the transport's own poll interval and give-up rule, so load stretches it only a little).
 * Four times that is the bound.
 */
const RUN_END_WAIT_MS = 20_000;
const runEndWait = { timeout: RUN_END_WAIT_MS } as const;
/** AC-2 makes four bounded page waits plus the run-end wait. */
const AC2_TEST_TIMEOUT_MS = 4 * PAGE_WAIT_MS + RUN_END_WAIT_MS;

const observed: { method: string; url: string }[] = [];
function record({ request }: { request: Request }) {
  observed.push({ method: request.method, url: request.url });
}
const executeRequests = () =>
  observed.filter((entry) => entry.method === 'POST' && entry.url.includes('/execute'));

/** The application's own bootstrap reads these two at import time; both fail open. */
const bootstrapHandlers = [
  http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
  http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
];

beforeAll(() => {
  // jsdom implements no layout, so it has no `scrollIntoView`. The onboarding coach calls one.
  // Stubbed here rather than in the shared setup: it is this file's need, not the suite's.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
  studioMockServer.listen({ onUnhandledRequest: 'error' });
  studioMockServer.events.on('request:start', record);
});
beforeEach(() => {
  observed.length = 0;
  window.localStorage.clear();
  studioMockServer.use(...bootstrapHandlers);
  /*
   * The store fetches sources and features at import time, before any test server is listening,
   * and both selectors are fail-open. Settling them explicitly here keeps this file's subject the
   * run gate rather than the application's bootstrap: a page that failed to render for an
   * unrelated reason would make every assertion below vacuous.
   */
  store.dispatch(
    fetchSources.fulfilled(
      [{ type: 'UI_TEST', enabled: true, label: 'UI Test (Checks Studio)' }],
      'test',
      undefined,
    ),
  );
  store.dispatch(
    fetchFeatures.fulfilled(
      { sources: [], features: [{ key: 'STUDIO', enabled: true, label: 'Checks Studio' }] },
      'test',
      undefined,
    ),
  );
});
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => {
  studioMockServer.events.removeListener('request:start', record);
  studioMockServer.close();
});

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ChecksStudioPage />
      </MemoryRouter>
    </Provider>,
  );
}

function serveList(draft: typeof readyDraft) {
  studioMockServer.use(
    ...bootstrapHandlers,
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [draft], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(draft)),
    http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
      HttpResponse.json(
        { executionId: '88888888-8888-8888-8888-888888888888', status: 'PENDING' },
        { status: 202 },
      ),
    ),
    http.get(`${STUDIO_BASE}/executions/:id`, () => HttpResponse.json({}, { status: 404 })),
  );
}

describe('AC-2: the page’s own Run control is governed by the server and not by the editor', () => {
  it('a READY draft produces exactly one POST /execute from the page, with no step grammar check', async () => {
    serveList(readyDraft);
    renderPage();

    const control = await screen.findByRole('button', { name: 'Run Test' }, pageWait);
    await waitFor(() => expect(control).not.toBeDisabled(), pageWait);
    // Plain English is never marked as wrong: the page asks no server for a step verdict and
    // shows none.
    expect(observed.filter((entry) => entry.url.includes('/validate-steps'))).toEqual([]);
    expect(screen.queryByText(/need attention/i)).toBeNull();

    await userEvent.click(control);
    /*
     * TEST-005: "exactly one" is counted only after everything this one activation causes has
     * played out. Counting at the first moment the list holds one entry proves only "one by the
     * first poll": a second POST 300 ms after acceptance used to leave this test green and redden
     * the next one instead.
     *
     * The settle point is the whole run, as the page shows it. First the page acts on the
     * acceptance: the control becomes Stop. Then that run ends: this file serves 404 on the
     * snapshot route, so the transport reconnects, falls back to polling, and gives up, and the
     * control reads Run Test again. Run alone, that end came about 5 s after acceptance, after three
     * snapshot reads about 1 s apart. That window is far longer than a 300 ms retry or the 700 ms
     * poller 10.11b removed. A duplicate issued anywhere inside it is in the list below.
     */
    await screen.findByRole('button', { name: 'Stop' }, pageWait);
    await screen.findByRole('button', { name: 'Run Test' }, runEndWait);
    expect(executeRequests()).toHaveLength(1);
  }, AC2_TEST_TIMEOUT_MS);

  it('shows only Save and Run while a saved test becomes runnable automatically', async () => {
    const preparing = draftsByCompileStatus.COMPILING;
    let reads = 0;
    serveList(preparing);
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => {
        reads += 1;
        return HttpResponse.json(reads > 1 ? readyDraft : preparing);
      }),
    );
    renderPage();

    const preparingControl = await screen.findByRole('button', { name: 'Run Test' }, pageWait);
    expect(preparingControl).toHaveTextContent('Getting ready…');
    expect(preparingControl).toBeDisabled();
    expect(screen.queryByTestId('compile-review-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Code' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm|translation/i })).not.toBeInTheDocument();
    expect(executeRequests()).toHaveLength(0);

    const control = await screen.findByRole('button', { name: 'Run Test' }, pageWait);
    await waitFor(() => expect(control).not.toBeDisabled(), pageWait);
    await userEvent.click(control);
    await waitFor(() => expect(executeRequests()).toHaveLength(1), pageWait);
  }, PAGE_TEST_TIMEOUT_MS);
});

describe('the simple Save and Run workflow', () => {
  it('marks edits unsaved, keeps Run available because Run saves first, and protects navigation until the user decides', async () => {
    serveList(readyDraft);
    renderPage();

    const run = await screen.findByRole('button', { name: 'Run Test' }, pageWait);
    await waitFor(() => expect(run).not.toBeDisabled(), pageWait);
    const firstStep = screen.getByDisplayValue(readyDraft.steps[0]);
    await userEvent.clear(firstStep);
    await userEvent.type(firstStep, 'Go to "https://www.citi.com/health"');

    expect(screen.getByTestId('studio-save-state')).toHaveTextContent('Unsaved changes');
    // Run is no longer refused for a dirty draft: it saves the edits, prepares the saved
    // revision and then dispatches it. Telling the author to save and press the same button
    // again was a state the one-button flow removes, so the caption is gone too.
    expect(run).not.toBeDisabled();
    expect(screen.queryByText('Save your changes before running.')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'UI Tests' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save changes before continuing?' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save and continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeInTheDocument();
  }, PAGE_TEST_TIMEOUT_MS);
});

describe('the Code tab', () => {
  it('shows saved source without restoring translation controls', async () => {
    serveList(readyDraft);
    renderPage();
    await screen.findByRole('button', { name: 'Run Test' }, pageWait);

    const editor = await screen.findByPlaceholderText('Add new test step...', {}, pageWait);
    const NEW_STEP = 'Click "Continue"';
    await userEvent.type(editor, NEW_STEP);
    // The add affordance is an icon button with no accessible name of its own; this is the page
    // as it stands, and naming it is 10.19's accessibility work rather than this story's.
    const addButton = screen.getByTestId('AddIcon').closest('button');
    expect(addButton).not.toBeNull();
    await userEvent.click(addButton as HTMLButtonElement);
    // Steps render as editable inputs, so the added step is a value rather than text.
    await waitFor(
      () => expect(screen.getAllByDisplayValue(NEW_STEP).length).toBeGreaterThan(0),
      pageWait,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Code' }));
    const codeView = await screen.findByTestId('confirmed-playwright-source', {}, pageWait);
    expect(codeView.textContent).not.toContain(NEW_STEP);
    expect(screen.queryByTestId('compile-review-panel')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/translation|candidate|confirm this exact/i);
  }, PAGE_TEST_TIMEOUT_MS);
});

describe('the draft the page sends carries a timeout the contract would accept', () => {
  it('Save sends a timeoutSeconds inside the declared bound, observed at the mock server', async () => {
    /*
     * @qa's finding, and it is the guard the fix did not have: `timeoutSeconds` appeared in **zero**
     * test files, and the value this page sent was `30000` for the whole life of the code — the
     * legacy `TestIR` recorded milliseconds and `toConfiguration` carried the number straight into a
     * field the contract declares in seconds and caps at 120. The backend does not clamp it; its
     * dispatcher multiplies by 1000, so `30000` is an 8h20m runtime budget.
     *
     * Retiring the legacy IR from this page's save path fixed it as a side effect. This asserts the
     * fix over the **bytes that leave the client**, because that is where the defect lived: a unit
     * assertion on `defaultConfiguration()` would stay green if the page went back to building its
     * own configuration, which is exactly what it used to do.
     *
     * The bound is read from the document, never transcribed.
     */
    expect(typeof TIMEOUT_BOUND.minimum).toBe('number');
    expect(typeof TIMEOUT_BOUND.maximum).toBe('number');
    // The negative control: a bound wide enough to admit the old value would guard nothing.
    expect(TIMEOUT_BOUND.maximum).toBeLessThan(30000);

    // Studio v1 (D9): Save is `PUT /tests/{id}` on the open draft, never a create.
    const saved: Array<Record<string, any>> = [];
    serveList(readyDraft);
    studioMockServer.use(
      http.put(`${STUDIO_BASE}/tests/:id`, async ({ request }) => {
        const body = (await request.json()) as Record<string, any>;
        saved.push(body);
        return HttpResponse.json({ ...readyDraft, ...body });
      }),
    );

    renderPage();
    await screen.findByRole('button', { name: 'Run Test' }, pageWait);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saved.length).toBe(1), pageWait);
    const configuration = saved[0].configuration;
    expect(configuration, 'the save request carried no configuration at all').toBeDefined();
    expect(typeof configuration.timeoutSeconds).toBe('number');
    expect(configuration.timeoutSeconds).toBeGreaterThanOrEqual(TIMEOUT_BOUND.minimum);
    expect(configuration.timeoutSeconds).toBeLessThanOrEqual(TIMEOUT_BOUND.maximum);
  }, PAGE_TEST_TIMEOUT_MS);

  it('VAL-009: a refused step in the Run outcome links to that step in the editor', async () => {
    const base = draftsByCompileStatus.NEEDS_REVISION;
    const refused = {
      ...base,
      compileDiagnostics: {
        validatorSchemaVersion: '1.0.0',
        artifact: [],
        steps: base.steps.map((_, stepIndex) => ({
          stepIndex,
          ok: stepIndex !== 1,
          truncated: false,
          diagnostics:
            stepIndex === 1
              ? [{ code: 'UNSUPPORTED_CAPABILITY', stepIndex, message: 'Server CPU is not visible to a browser.', node: null, excerpt: null }]
              : [],
        })),
        truncated: false,
        attempts: 1,
        exhausted: false,
      },
    };
    serveList(refused);
    studioMockServer.use(
      http.post(`${STUDIO_BASE}/tests/:id/compile`, () =>
        HttpResponse.json({ compileRequestId: 'r', compileStatus: 'COMPILING' }, { status: 202 }),
      ),
    );
    renderPage();
    const user = userEvent.setup({ delay: null });

    const control = await screen.findByRole('button', { name: 'Run Test' }, pageWait);
    await waitFor(() => expect(control).not.toBeDisabled(), pageWait);
    await user.click(control);

    expect(await screen.findByTestId('run-compile-refusal-1', {}, pageWait)).toHaveTextContent(
      "Step 2 can't be done in a browser test: Server CPU is not visible to a browser. Rewrite or remove it.",
    );
    await user.click(screen.getByRole('button', { name: 'Go to step 2' }));
    expect(screen.getByRole('textbox', { name: 'Step 2' })).toHaveFocus();
    expect(executeRequests()).toHaveLength(0);
  }, PAGE_TEST_TIMEOUT_MS);
});

describe('VAL-042: the first Run press on a freshly opened saved test acts', () => {
  const requestsTo = (method: string, suffix: RegExp) =>
    observed.filter((entry) => entry.method === method && suffix.test(new URL(entry.url).pathname));

  it('READY: one press, with nothing touched first, starts exactly one execute and no save', async () => {
    serveList(readyDraft);
    const user = userEvent.setup({ delay: null });
    renderPage();

    const control = await screen.findByRole('button', { name: 'Run Test' }, pageWait);
    await waitFor(() => expect(control).not.toBeDisabled(), pageWait);
    await user.click(control);

    await screen.findByRole('button', { name: 'Stop' }, pageWait);
    expect(executeRequests()).toHaveLength(1);
    expect(requestsTo('PUT', /\/studio\/tests\/[^/]+$/u)).toHaveLength(0);
  }, PAGE_TEST_TIMEOUT_MS);

  it('STALE: one press, with nothing touched first, compiles once and then executes once', async () => {
    let compiled = false;
    serveList(staleDraft);
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () =>
        HttpResponse.json(compiled ? { ...staleDraft, compileStatus: 'READY' } : staleDraft),
      ),
      http.post(`${STUDIO_BASE}/tests/:id/compile`, () => {
        compiled = true;
        return HttpResponse.json({ compileRequestId: 'c1', compileStatus: 'COMPILING' }, { status: 202 });
      }),
    );
    const user = userEvent.setup({ delay: null });
    renderPage();

    const control = await screen.findByRole('button', { name: 'Run Test' }, pageWait);
    await waitFor(() => expect(control).not.toBeDisabled(), pageWait);
    await user.click(control);

    await screen.findByRole('button', { name: 'Stop' }, pageWait);
    expect(requestsTo('POST', /\/compile$/u)).toHaveLength(1);
    expect(executeRequests()).toHaveLength(1);
    expect(requestsTo('PUT', /\/studio\/tests\/[^/]+$/u)).toHaveLength(0);
  }, PAGE_TEST_TIMEOUT_MS);
});
