import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { readyDraft, draftsByCompileStatus } from '@/services/mocks/studio/compileFixtures';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import ChecksStudioPage from './ChecksStudioPage';

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';

/* Bounded waits sized as in pageRunGate.test.tsx (ENV-TIMING-1). */
const PAGE_WAIT_MS = 10_000;
const pageWait = { timeout: PAGE_WAIT_MS } as const;
/** The most bounded waits any test below makes is four, plus clicks and typing. */
const PAGE_TEST_TIMEOUT_MS = 5 * PAGE_WAIT_MS;
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

/**
 * VAL-036 – VAL-039, from the live walkthrough of the Studio page: the add-step field, the unsaved
 * notice, where Run's outcome alerts render, and one execute per Run action.
 */

const PENDING = 'Check the server CPU is below 50%';

function capturePuts() {
  const saved: Array<Record<string, unknown>> = [];
  studioMockServer.use(
    http.put(`${STUDIO_BASE}/tests/:id`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      saved.push(body);
      return HttpResponse.json({ ...readyDraft, ...body });
    }),
  );
  return saved;
}

async function readyPage() {
  serveList(readyDraft);
  renderPage();
  const run = await screen.findByRole('button', { name: 'Run Test' }, pageWait);
  await waitFor(() => expect(run).not.toBeDisabled(), pageWait);
  return run;
}

describe('VAL-036: the add-step field', () => {
  it('Enter adds the step and Shift+Enter starts a new line instead', async () => {
    await readyPage();
    const user = userEvent.setup({ delay: null });
    const field = screen.getByRole('textbox', { name: 'Add a test step' });
    const before = readyDraft.steps.length;

    await user.type(field, 'Click "Continue"{Shift>}{Enter}{/Shift}and wait');
    expect(field).toHaveValue('Click "Continue"\nand wait');
    expect(screen.queryByRole('textbox', { name: `Step ${before + 1}` })).toBeNull();

    await user.type(field, '{Enter}');
    expect(screen.getByRole('textbox', { name: `Step ${before + 1}` })).toHaveValue('Click "Continue"\nand wait');
    expect(field).toHaveValue('');
    expect(screen.getByText('Press Enter to add the step. Shift+Enter starts a new line.')).toBeInTheDocument();
  }, PAGE_TEST_TIMEOUT_MS);

  it('Save adds pending add-step text as a step before saving', async () => {
    const saved = capturePuts();
    await readyPage();
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByRole('textbox', { name: 'Add a test step' }), PENDING);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saved).toHaveLength(1), pageWait);
    expect(saved[0].steps).toEqual([...readyDraft.steps, PENDING]);
    expect(screen.getByRole('textbox', { name: 'Add a test step' })).toHaveValue('');
  }, PAGE_TEST_TIMEOUT_MS);
});

describe('VAL-036 + VAL-039: Run with pending text in a focused add-step field', () => {
  it('adds and saves the step first, then sends exactly one execute', async () => {
    const saved = capturePuts();
    const run = await readyPage();
    const user = userEvent.setup({ delay: null });
    const field = screen.getByRole('textbox', { name: 'Add a test step' });
    await user.type(field, PENDING);
    expect(field).toHaveFocus();

    await user.click(run);
    await screen.findByRole('button', { name: 'Stop' }, pageWait);
    expect(saved).toHaveLength(1);
    expect(saved[0].steps).toEqual([...readyDraft.steps, PENDING]);
    // Settle on the end of the run, so a late duplicate would be counted too.
    await screen.findByRole('button', { name: 'Run Test' }, runEndWait);
    expect(executeRequests()).toHaveLength(1);
  }, AC2_TEST_TIMEOUT_MS);
});

describe('VAL-037: the unsaved notice matches what Run does', () => {
  it('says Run saves first, and Run stays available', async () => {
    const run = await readyPage();
    await userEvent.type(screen.getByRole('textbox', { name: 'Step 1' }), ' now');

    const notice = screen.getByTestId('run-unsaved-notice');
    expect(notice).toHaveTextContent('Unsaved changes');
    expect(notice).toHaveTextContent('Run will save them first');
    expect(screen.queryByText(/Save before running/)).toBeNull();
    expect(screen.queryByText(/to make Run available/)).toBeNull();
    expect(run).not.toBeDisabled();
  }, PAGE_TEST_TIMEOUT_MS);
});

describe('VAL-038: the refusal alert renders below the header, not inside it', () => {
  it('keeps the title and actions in the header and links the step', async () => {
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
              ? [{ code: 'UNSUPPORTED_CAPABILITY', stepIndex, message: 'Not visible.', node: null, excerpt: null }]
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
    const run = await screen.findByRole('button', { name: 'Run Test' }, pageWait);
    await waitFor(() => expect(run).not.toBeDisabled(), pageWait);
    await user.click(run);

    const outcome = await screen.findByTestId('run-compile-outcome', {}, pageWait);
    const header = screen.getByRole('heading', { level: 1 }).closest('.MuiPaper-root') as HTMLElement;
    expect(header).toContainElement(run);
    expect(header).not.toContainElement(outcome);
    expect(screen.getByTestId('run-alerts-slot')).toContainElement(outcome);
    expect(within(outcome).getByText('Some steps need attention')).toBeInTheDocument();

    await user.click(within(outcome).getByRole('button', { name: 'Go to step 2' }));
    expect(screen.getByRole('textbox', { name: 'Step 2' })).toHaveFocus();
  }, PAGE_TEST_TIMEOUT_MS);
});
