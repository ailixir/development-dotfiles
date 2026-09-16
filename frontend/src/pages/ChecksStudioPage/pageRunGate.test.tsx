import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
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

    const control = await screen.findByRole('button', { name: 'Run Test' });
    // The editor's own verdict is on screen and says the steps are not recognised …
    const verdicts = await screen.findAllByText(/this editor does not recognise/i);
    expect(verdicts.length).toBeGreaterThan(0);
    await waitFor(() => expect(control).not.toBeDisabled());

    await userEvent.click(control);
    await waitFor(() => expect(executeRequests()).toHaveLength(1));
    expect(executeRequests()).toHaveLength(1);
  });

  it('an unconfirmed draft the editor is silent about produces none', async () => {
    serveList(draftsByCompileStatus.AWAITING_CONFIRMATION);
    renderPage();

    const control = await screen.findByRole('button', { name: 'Run Test' });
    await screen.findByTestId('run-blocked-reason');
    await userEvent.click(control, { pointerEventsCheck: 0 });

    expect(control).toBeDisabled();
    expect(executeRequests()).toHaveLength(0);
  });
});

describe('AC-3(a): editing a step regenerates nothing', () => {
  it('adding a step leaves the Code view showing its unavailable state, not generated source', async () => {
    serveList(readyDraft);
    renderPage();
    await screen.findByRole('button', { name: 'Run Test' });

    const editor = await screen.findByPlaceholderText('Add new test step...');
    const NEW_STEP = 'Click "Continue"';
    await userEvent.type(editor, NEW_STEP);
    // The add affordance is an icon button with no accessible name of its own; this is the page
    // as it stands, and naming it is 10.19's accessibility work rather than this story's.
    const addButton = screen.getByTestId('AddIcon').closest('button');
    expect(addButton).not.toBeNull();
    await userEvent.click(addButton as HTMLButtonElement);
    // Steps render as editable inputs, so the added step is a value rather than text.
    await waitFor(() => expect(screen.getAllByDisplayValue(NEW_STEP).length).toBeGreaterThan(0));

    // Observed by rendering, not by reading the effect: the Code tab is opened and looked at.
    await userEvent.click(screen.getByRole('tab', { name: 'Code' }));
    const codeView = await screen.findByTestId('code-view-unavailable-title');
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
  });
});
