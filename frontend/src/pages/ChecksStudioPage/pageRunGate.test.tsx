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
import { readyDraft, draftsByCompileStatus } from '@/services/mocks/studio/compileFixtures';
import { generatePythonFromIR } from '@/utils/studio/codegen/pythonGenerator';
import { buildDefaultTestIR } from '@/utils/studio/ir/parseSteps';
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
 * The editor's verdict arrives after a 250 ms debounce, then `POST /validate-steps`, then a render
 * of the whole page. Run alone, the AC-2 test takes about 1.1 s. In the full suite, @qa measured
 * 2.2–2.7 s on 10.16a's base and 3.7–4.2 s on its head at load 12–16. At load 40 the 1 s wait for
 * the verdict ran out, even though the page it dumped was fully rendered. The bounds below are sized
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
    http.post(`${STUDIO_BASE}/validate-steps`, () =>
      HttpResponse.json({
        // Forced to refuse everything, for every test in this file.
        isValid: false,
        results: draft.steps.map((_, stepIndex) => ({
          stepIndex,
          isValid: false,
          suggestion: 'this editor does not recognise this line',
        })),
      }),
    ),
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
  it('a READY draft the editor calls invalid produces exactly one POST /execute from the page', async () => {
    serveList(readyDraft);
    renderPage();

    const control = await screen.findByRole('button', { name: 'Run Test' }, pageWait);
    // The editor's own verdict is on screen and says the steps are not recognised …
    const verdicts = await screen.findAllByText(/this editor does not recognise/i, {}, pageWait);
    expect(verdicts.length).toBeGreaterThan(0);
    await waitFor(() => expect(control).not.toBeDisabled(), pageWait);

    await userEvent.click(control);
    await waitFor(() => expect(executeRequests()).toHaveLength(1), pageWait);
    expect(executeRequests()).toHaveLength(1);
  }, PAGE_TEST_TIMEOUT_MS);

  it('an unconfirmed draft the editor is silent about produces none', async () => {
    serveList(draftsByCompileStatus.AWAITING_CONFIRMATION);
    renderPage();

    const control = await screen.findByRole('button', { name: 'Run Test' }, pageWait);
    await screen.findByTestId('run-blocked-reason', {}, pageWait);
    await userEvent.click(control, { pointerEventsCheck: 0 });

    expect(control).toBeDisabled();
    expect(executeRequests()).toHaveLength(0);
  }, PAGE_TEST_TIMEOUT_MS);
});

describe('AC-3(a): editing a step regenerates nothing', () => {
  it('adding a step leaves the Code view showing its unavailable state, not generated source', async () => {
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

    // Observed by rendering, not by reading the effect: the Code tab is opened and looked at.
    await userEvent.click(screen.getByRole('tab', { name: 'Code' }));
    const codeView = await screen.findByTestId('code-view-unavailable-title', {}, pageWait);
    expect(codeView).toBeInTheDocument();

    const generated = generatePythonFromIR(
      buildDefaultTestIR(readyDraft.name, [...readyDraft.steps, NEW_STEP]),
    );
    const distinctive = generated
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 12 && !line.startsWith('#'));
    expect(distinctive.length, 'the generator produced nothing distinctive to look for').toBeGreaterThan(2);

    const rendered = document.body.textContent ?? '';
    for (const line of distinctive) {
      expect(rendered, `the page rendered generated source after an edit: ${line}`).not.toContain(
        line,
      );
    }
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

    const created: Array<Record<string, any>> = [];
    serveList(readyDraft);
    studioMockServer.use(
      http.post(`${STUDIO_BASE}/tests`, async ({ request }) => {
        const body = (await request.json()) as Record<string, any>;
        created.push(body);
        return HttpResponse.json({ ...readyDraft, ...body }, { status: 201 });
      }),
    );

    renderPage();
    await screen.findByRole('button', { name: 'Run Test' }, pageWait);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(created.length).toBe(1), pageWait);
    const configuration = created[0].configuration;
    expect(configuration, 'the save request carried no configuration at all').toBeDefined();
    expect(typeof configuration.timeoutSeconds).toBe('number');
    expect(configuration.timeoutSeconds).toBeGreaterThanOrEqual(TIMEOUT_BOUND.minimum);
    expect(configuration.timeoutSeconds).toBeLessThanOrEqual(TIMEOUT_BOUND.maximum);
  }, PAGE_TEST_TIMEOUT_MS);
});
