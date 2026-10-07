import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { readyDraft } from '@/services/mocks/studio/compileFixtures';
import {
  createPollTransport,
  resetExecutionTransportSeam,
  setExecutionTransportSeam,
} from '@/services/api/studioTransportWiring';
import {
  CANCELLED_ERROR_CODE,
  type ExecutionSnapshot,
  type TestDto,
  type TestRequest,
} from '@/types/studio/studioTypes';
import { CANCELLED_LABEL, STOPPING_LABEL } from '@/components/studio/run';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import { setExecuting } from '@/store/slices/studioSlice';
import ChecksStudioPage, { RELOAD_TEST_LABEL, SAVE_CONFLICT_TITLE } from './ChecksStudioPage';
import { GENERIC_SAVE_ERROR } from './saveErrorMessage';

/**
 * Studio v1, WP5: the page's Save and Stop do what they say.
 *
 *  - Save is one `PUT /tests/{id}` carrying the draft's revisions, never a `POST /tests`, and never a
 *    made-up CSI.
 *  - A `409` on that PUT is shown, with a Reload that puts the server's version in the editor.
 *  - Variables are saved in the test and come back from the test's DTO.
 *  - No draft content is written to `localStorage`.
 *  - Stop calls cancel and keeps following the run until its terminal snapshot arrives.
 *
 * Every request is counted at the mock server, not inferred from the component.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';

const WAIT = { timeout: 10_000 } as const;
const TEST_TIMEOUT_MS = 40_000;

const observed: { method: string; path: string }[] = [];
function record({ request }: { request: Request }) {
  observed.push({ method: request.method, path: new URL(request.url).pathname });
}
const requests = (method: string, pathPattern: RegExp) =>
  observed.filter((entry) => entry.method === method && pathPattern.test(entry.path));

const bootstrapHandlers = [
  http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
  http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
];

/** Serves one draft. `current` is what the list and the single read return right now. */
function serveDraft(initial: TestDto) {
  const state = { current: initial };
  studioMockServer.use(
    ...bootstrapHandlers,
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [state.current], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(state.current)),
  );
  return state;
}

/** A PUT handler that accepts at the current revisions and records every body. */
function acceptSaves(state: { current: TestDto }) {
  const bodies: TestRequest[] = [];
  studioMockServer.use(
    http.put(`${STUDIO_BASE}/tests/:id`, async ({ request }) => {
      const body = (await request.json()) as TestRequest;
      bodies.push(body);
      state.current = {
        ...state.current,
        steps: body.steps,
        variables: body.variables,
        sourceRevision: state.current.sourceRevision + 1,
      };
      return HttpResponse.json(state.current);
    }),
  );
  return bodies;
}

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ChecksStudioPage />
      </MemoryRouter>
    </Provider>,
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
  studioMockServer.use(...bootstrapHandlers);
  store.dispatch(setExecuting(false));
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
  vi.restoreAllMocks();
  resetExecutionTransportSeam();
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => {
  studioMockServer.events.removeListener('request:start', record);
  studioMockServer.close();
});

describe('Save', () => {
  it('issues exactly one PUT /tests/{id} with the draft revisions and zero POST /tests', async () => {
    const state = serveDraft(readyDraft);
    const bodies = acceptSaves(state);
    renderPage();
    await screen.findByRole('button', { name: 'Run Test' }, WAIT);

    const NEW_STEP = 'Click "Continue"';
    await userEvent.type(
      screen.getByPlaceholderText('Add new test step...'),
      `${NEW_STEP}{Control>}{Enter}{/Control}`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Test saved', {}, WAIT);

    expect(requests('PUT', /\/studio\/tests\/[^/]+$/)).toHaveLength(1);
    expect(requests('POST', /\/studio\/tests$/)).toHaveLength(0);
    expect(requests('PUT', /\/studio\/tests\/[^/]+$/)[0].path).toMatch(new RegExp(`${readyDraft.id}$`));

    const body = bodies[0];
    expect(body.steps).toEqual([...readyDraft.steps, NEW_STEP]);
    expect(body.sourceRevision).toBe(readyDraft.sourceRevision);
    expect(body.configurationRevision).toBe(readyDraft.configurationRevision);
    // The draft's own CSI, never a fallback.
    expect(body.csiId).toBe(readyDraft.csiId);
    expect(JSON.stringify(body)).not.toContain('CSI-00000');
    expect(body.configuration.browser).toBe('chromium');
  }, TEST_TIMEOUT_MS);

  it('a second Save sends the revisions the first one returned', async () => {
    const state = serveDraft(readyDraft);
    const bodies = acceptSaves(state);
    renderPage();
    await screen.findByRole('button', { name: 'Run Test' }, WAIT);

    const save = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(save);
    await waitFor(() => expect(bodies).toHaveLength(1), WAIT);
    await waitFor(() => expect(save).not.toBeDisabled(), WAIT);
    await userEvent.click(save);
    await waitFor(() => expect(bodies).toHaveLength(2), WAIT);

    expect(bodies[1].sourceRevision).toBe(readyDraft.sourceRevision + 1);
    expect(requests('POST', /\/studio\/tests$/)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('a 409 STALE_REVISION renders the conflict, and Reload puts the server version in the editor', async () => {
    const state = serveDraft(readyDraft);
    studioMockServer.use(
      http.put(`${STUDIO_BASE}/tests/:id`, () =>
        HttpResponse.json(
          { error: 'STALE_REVISION', message: 'Test is at sourceRevision 5/configurationRevision 1; reload before saving' },
          { status: 409 },
        ),
      ),
    );
    renderPage();
    await screen.findByRole('button', { name: 'Run Test' }, WAIT);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const conflict = await screen.findByTestId('save-conflict', {}, WAIT);
    expect(within(conflict).getByText(SAVE_CONFLICT_TITLE)).toBeInTheDocument();
    expect(screen.queryByText('Test saved')).toBeNull();

    // Someone else's save is what the server now holds.
    const THEIR_STEP = 'Wait for "Their change"';
    state.current = {
      ...readyDraft,
      steps: [...readyDraft.steps, THEIR_STEP],
      sourceRevision: readyDraft.sourceRevision + 1,
    };
    await userEvent.click(within(conflict).getByRole('button', { name: RELOAD_TEST_LABEL }));

    await waitFor(() => expect(screen.getAllByDisplayValue(THEIR_STEP)).toHaveLength(1), WAIT);
    await waitFor(() => expect(screen.queryByTestId('save-conflict')).toBeNull(), WAIT);
    expect(requests('POST', /\/studio\/tests$/)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('VAL-027: a 400 INVALID_STEPS shows the server message; a 500 keeps the generic text', async () => {
    serveDraft(readyDraft);
    const BLANK_STEP = 'Step 2 is blank. Write what the step should do, or remove it.';
    let status = 400;
    studioMockServer.use(
      http.put(`${STUDIO_BASE}/tests/:id`, () =>
        status === 400
          ? HttpResponse.json({ error: 'INVALID_STEPS', message: BLANK_STEP }, { status: 400 })
          : HttpResponse.json({ error: 'INTERNAL_ERROR', message: 'NullPointerException at Foo.java:12' }, { status: 500 }),
      ),
    );
    renderPage();
    await screen.findByRole('button', { name: 'Run Test' }, WAIT);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(BLANK_STEP, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText('INVALID_STEPS')).toBeNull();

    status = 500;
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled(), WAIT);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(GENERIC_SAVE_ERROR, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(/NullPointerException/)).toBeNull();
  }, TEST_TIMEOUT_MS);
});

describe('Variables', () => {
  it('are saved in the test through the same PUT and restored from the DTO on reload', async () => {
    const state = serveDraft(readyDraft);
    const bodies = acceptSaves(state);
    const first = renderPage();
    await screen.findByRole('button', { name: 'Run Test' }, WAIT);

    await userEvent.click(screen.getByRole('button', { name: 'Variables' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    expect(within(dialog).queryByRole('option', { name: 'Secret' })).toBeNull();
    expect(within(dialog).getByText('Vault secrets are unavailable in this alpha.')).toBeVisible();
    // Loaded from the DTO, not from the browser.
    const plainValue = within(dialog).getByDisplayValue('pilot-user');
    await userEvent.clear(plainValue);
    await userEvent.type(plainValue, 'other-user');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(bodies).toHaveLength(1), WAIT);
    expect(bodies[0].variables).toEqual([
      { name: 'USER_ID', kind: 'plain', value: 'other-user' },
      { name: 'LOGIN_PW', kind: 'secretRef', secretId: 'vault://studio/pilot-pw' },
    ]);
    expect(requests('POST', /\/studio\/tests$/)).toHaveLength(0);

    // A reload is a new page reading the test again: the variable comes back from the DTO.
    first.unmount();
    window.localStorage.clear();
    renderPage();
    const run = await screen.findByRole('button', { name: 'Run Test' }, WAIT);
    expect(screen.getByTestId('studio-save-state')).toHaveTextContent('Saved');
    expect(run).not.toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Variables' }));
    const reopened = await screen.findByRole('dialog', {}, WAIT);
    expect(within(reopened).getByDisplayValue('other-user')).toBeInTheDocument();
  }, TEST_TIMEOUT_MS);
});

describe('localStorage', () => {
  it('receives no draft content and no secret metadata while editing and saving', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const state = serveDraft(readyDraft);
    const bodies = acceptSaves(state);
    renderPage();
    await screen.findByRole('button', { name: 'Run Test' }, WAIT);

    // Every path that used to write: a step edit (`studio:steps`), the Variables save
    // (`studio:variables`) and the secret picker (`checks:secrets`).
    await userEvent.type(
      screen.getByPlaceholderText('Add new test step...'),
      'Click "Next"{Control>}{Enter}{/Control}',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Variables' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(bodies).toHaveLength(1), WAIT);

    const keys = setItem.mock.calls.map(([key]) => String(key));
    // The onboarding coach's position is UI state, not test content, and is the one key allowed.
    const offending = keys.filter(
      (key) => (key.startsWith('studio:') && key !== 'studio:coachStep') || key === 'checks:secrets',
    );
    expect(offending).toEqual([]);
    for (const key of Object.keys(window.localStorage)) {
      expect(key === 'studio:coachStep' || !key.startsWith('studio:')).toBe(true);
      expect(key).not.toBe('checks:secrets');
    }
  }, TEST_TIMEOUT_MS);
});

describe('Stop', () => {
  it('calls cancel, shows Stopping…, and keeps following the run until the terminal snapshot', async () => {
    const EXECUTION_ID = '77777777-7777-7777-7777-777777777777';
    // Poll only: jsdom has no EventSource, and the fallback is the same subscription contract.
    setExecutionTransportSeam({ primary: createPollTransport, fallback: null });
    serveDraft(readyDraft);

    const running: ExecutionSnapshot = {
      executionId: EXECUTION_ID,
      testId: readyDraft.id,
      csiId: readyDraft.csiId,
      revisionId: readyDraft.confirmedRevisionId,
      status: 'RUNNING',
      errorCode: null,
      acceptedAt: '2026-09-18T10:00:00Z',
      startedAt: '2026-09-18T10:00:01Z',
      endedAt: null,
      durationMs: null,
      stepResults: readyDraft.steps.map((originalText, stepIndex) => ({
        stepIndex,
        originalText,
        status: stepIndex === 0 ? 'RUNNING' : 'PENDING',
        offsetMs: null,
        durationMs: null,
        message: null,
      })),
      logs: [],
      logsTruncated: false,
      video: { status: 'PROCESSING', error: null, expiresAt: null, partial: false },
      videoPath: null,
      runtime: { playwright: null, chromium: null, validator: null, executor: null, image: null },
      revision: 1,
      streamComplete: false,
    };
    const cancelled: ExecutionSnapshot = {
      ...running,
      status: 'ERROR',
      errorCode: CANCELLED_ERROR_CODE,
      endedAt: '2026-09-18T10:00:05Z',
      stepResults: running.stepResults.map((step) => ({ ...step, status: 'SKIPPED' })),
      video: { status: 'UNAVAILABLE', error: null, expiresAt: null, partial: false },
      revision: 2,
      streamComplete: true,
    };
    let cancelRequested = false;
    // Held by the test, so the Stopping window is observed deterministically rather than raced.
    let terminalReleased = false;
    studioMockServer.use(
      http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
        HttpResponse.json({ executionId: EXECUTION_ID, status: 'PENDING' }, { status: 202 }),
      ),
      http.post(`${STUDIO_BASE}/executions/:id/cancel`, () => {
        cancelRequested = true;
        // Accepted, not ended: the snapshot is still RUNNING.
        return HttpResponse.json(running, { status: 202 });
      }),
      http.get(`${STUDIO_BASE}/executions/:id`, () =>
        HttpResponse.json(cancelRequested && terminalReleased ? cancelled : running),
      ),
    );

    renderPage();
    const run = await screen.findByRole('button', { name: 'Run Test' }, WAIT);
    await waitFor(() => expect(run).not.toBeDisabled(), WAIT);
    await userEvent.click(run);
    // The run is on screen before Stop is pressed.
    await waitFor(() => expect(requests('GET', /\/executions\/[^/]+$/).length).toBeGreaterThan(0), WAIT);
    const stop = await screen.findByRole('button', { name: 'Stop' }, WAIT);
    await userEvent.click(stop);

    const stopping = await screen.findByRole('button', { name: STOPPING_LABEL }, WAIT);
    expect(stopping).toBeDisabled();
    const cancelCalls = requests('POST', /\/executions\/[^/]+\/cancel$/);
    expect(cancelCalls).toHaveLength(1);
    expect(cancelCalls[0].path).toMatch(new RegExp(`/executions/${EXECUTION_ID}/cancel$`));
    // The transport was not closed by Stop: it keeps reading while the run is stopping.
    const readsAtStop = requests('GET', /\/executions\/[^/]+$/).length;
    await waitFor(
      () => expect(requests('GET', /\/executions\/[^/]+$/).length).toBeGreaterThan(readsAtStop),
      WAIT,
    );
    expect(screen.getByRole('button', { name: STOPPING_LABEL })).toBeDisabled();

    // The server ends the run; the next read delivers the terminal snapshot.
    terminalReleased = true;
    await screen.findByTestId('execution-cancelled', {}, WAIT);
    expect(screen.getByTestId('execution-status').textContent).toBe(CANCELLED_LABEL);
    await screen.findByRole('button', { name: 'Run Test' }, WAIT);
    // Exactly one cancel, however long the stop took.
    expect(requests('POST', /\/executions\/[^/]+\/cancel$/)).toHaveLength(1);
  }, TEST_TIMEOUT_MS);
});

describe('Live logs', () => {
  it('show each line at its local time, and a line with no reading without one', async () => {
    const EXECUTION_ID = '88888888-8888-8888-8888-888888888888';
    setExecutionTransportSeam({ primary: createPollTransport, fallback: null });
    serveDraft(readyDraft);
    const at = '2026-09-18T10:00:02Z';
    const finished: ExecutionSnapshot = {
      executionId: EXECUTION_ID,
      testId: readyDraft.id,
      csiId: readyDraft.csiId,
      revisionId: readyDraft.confirmedRevisionId,
      status: 'PASSED',
      errorCode: null,
      acceptedAt: '2026-09-18T10:00:00Z',
      startedAt: '2026-09-18T10:00:01Z',
      endedAt: '2026-09-18T10:00:05Z',
      durationMs: 4000,
      stepResults: readyDraft.steps.map((originalText, stepIndex) => ({
        stepIndex,
        originalText,
        status: 'PASS',
        offsetMs: null,
        durationMs: null,
        message: null,
      })),
      // The runner's closing line carries no reading, so the API publishes `at: null`.
      logs: [
        { at, level: 'INFO', message: 'browser started' },
        { at: null, level: 'INFO', message: 'run finished' },
      ],
      logsTruncated: false,
      video: { status: 'UNAVAILABLE', error: null, expiresAt: null, partial: false },
      videoPath: null,
      runtime: { playwright: null, chromium: null, validator: null, executor: null, image: null },
      revision: 1,
      streamComplete: true,
    };
    studioMockServer.use(
      http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
        HttpResponse.json({ executionId: EXECUTION_ID, status: 'PENDING' }, { status: 202 }),
      ),
      http.get(`${STUDIO_BASE}/executions/:id`, () => HttpResponse.json(finished)),
    );

    renderPage();
    const run = await screen.findByRole('button', { name: 'Run Test' }, WAIT);
    await waitFor(() => expect(run).not.toBeDisabled(), WAIT);
    await userEvent.click(run);

    await screen.findByText(new Date(at).toLocaleTimeString(), {}, WAIT);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('Invalid Date');
    expect(text).not.toMatch(/null INFO/u);
    expect(screen.getAllByText('run finished').length).toBeGreaterThan(0);
  }, TEST_TIMEOUT_MS);
});
