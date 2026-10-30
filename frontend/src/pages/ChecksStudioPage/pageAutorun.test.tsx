import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail } from '@/services/mocks/studio/authoringState';
import { learningDraft, readyDraft, unlearnedDraft } from '@/services/mocks/studio/readinessFixtures';
import { errorCodeExecutions, passedExecution } from '@/services/mocks/studio/executionFixtures';
import { createScriptedTransport } from '@/services/mocks/studio/executionScenarios';
import { resetExecutionTransportSeam, setExecutionTransportSeam } from '@/services/api/studioTransportWiring';
import { resetGuidedSessionRuntime } from '@/components/studio/guided/useGuidedSession';
import { EXECUTE_FORBIDDEN_NARRATIVE } from '@/components/studio/run/executeRefusals';
import { RERUN_LABEL } from '@/components/studio/run';
import { clearGuidedSession, setExecuting } from '@/store/slices/studioSlice';
import { renderStudioAt } from '@/test/renderStudioAt';
import { uiTestEditorPath } from '@/components/studio/uiTestPaths';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import type { TestDto } from '@/types/studio/studioTypes';
import ChecksStudioPage from './ChecksStudioPage';

/**
 * STUDIO-UNIFY-001.1, tasks 1.12 and 1.13 (AC-29, DC-01): `?autorun=1` is consumed once.
 *
 * The editor removes `autorun` from the history entry (a replace navigation) before it asks for
 * anything, arms one request once the route id's draft is in the editor, and `RunControl` serves or
 * drops that request exactly once, when the gate's own test read has settled. Everything that counts is counted at the mock server (the `POST /execute` and the
 * `POST /guided-sessions` requests), never at a spy.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';
const WAIT = { timeout: 15_000 } as const;
const TEST_TIMEOUT_MS = 60_000;
/** How long "nothing is sent" is observed for after the page has settled. */
const QUIET_MS = 300;
const GUIDED_OPTIONS = { pollIntervalMs: 5, retryDelayMs: 5 } as const;

const bootstrapHandlers = [
  http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
  http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
];

const observed: { method: string; path: string }[] = [];
function record({ request }: { request: Request }) {
  observed.push({ method: request.method, path: new URL(request.url).pathname });
}
const executes = () =>
  observed.filter((entry) => entry.method === 'POST' && /\/studio\/tests\/[^/]+\/execute$/u.test(entry.path));
const guidedStarts = () =>
  observed.filter((entry) => entry.method === 'POST' && /\/studio\/guided-sessions$/u.test(entry.path));
const runStarts = () => [...executes(), ...guidedStarts()];

interface Served {
  /** Resolves the held gate read (only when `holdGateRead` was set). */
  release: () => void;
  /** The draft the test read and the list currently serve; replace it to change what a reload reads. */
  state: { current: TestDto };
}

/**
 * Serves one draft as the list and as its single read. The page reads the test first and the run gate
 * reads it a second time; `holdGateRead` holds that second read, so the editor is usable while the gate
 * has not settled.
 */
function serve(
  draft: TestDto,
  {
    holdGateRead = false,
    testRead = 'ok',
    executeAnswer = 'accepted',
  }: {
    holdGateRead?: boolean;
    testRead?: 'ok' | 'missing';
    executeAnswer?: 'accepted' | 'forbidden';
  } = {},
): Served {
  const state = { current: draft };
  let reads = 0;
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  studioMockServer.use(
    ...bootstrapHandlers,
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [state.current], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, async () => {
      reads += 1;
      if (holdGateRead && reads === 2) await held;
      return testRead === 'missing'
        ? HttpResponse.json({ error: 'NOT_FOUND', message: 'Gone' }, { status: 404 })
        : HttpResponse.json(fixtureDetail(state.current));
    }),
    http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
      executeAnswer === 'forbidden'
        ? HttpResponse.json({ error: 'STUDIO_FORBIDDEN', message: 'Not an owner' }, { status: 403 })
        : HttpResponse.json({ executionId: passedExecution.executionId, status: 'PENDING' }, { status: 202 }),
    ),
  );
  return { release, state };
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
  setExecutionTransportSeam({ primary: createScriptedTransport([passedExecution], 0), fallback: null });
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
});
afterEach(() => {
  cleanup();
  resetExecutionTransportSeam();
  studioMockServer.resetHandlers();
  resetStudioMocks();
  resetGuidedSessionRuntime();
  for (const draft of [unlearnedDraft, learningDraft, readyDraft]) {
    store.dispatch(clearGuidedSession({ testId: draft.id }));
  }
  store.dispatch(setExecuting(false));
});
afterAll(() => {
  studioMockServer.events.removeListener('request:start', record);
  studioMockServer.close();
});

const StoreProvider = ({ children }: { children?: ReactNode }) => <Provider store={store}>{children}</Provider>;
const user = () => userEvent.setup({ delay: null });

function renderAutorun(id: string, search = '?autorun=1') {
  return renderStudioAt(id, <ChecksStudioPage guidedOptions={GUIDED_OPTIONS} />, { search, wrapper: StoreProvider });
}

async function quiet(ms = QUIET_MS): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** Waits until the editor has the draft and the gate has read the test (its mode is known). */
async function settledControl(): Promise<HTMLElement> {
  const control = await screen.findByRole('button', { name: /^(Run Test|Stop|Saving…|Starting…)$/u }, WAIT);
  await waitFor(() => expect(control.getAttribute('data-run-mode')).not.toBe('loading'), WAIT);
  return control;
}

describe('AC-29: ui-tests/{id}/studio?autorun=1 runs at most once, at the gate settle', () => {
  it('a READY test with steps and canManage true sends exactly one execute, and the history entry loses autorun', async () => {
    serve(readyDraft);
    const view = renderAutorun(readyDraft.id);

    await waitFor(() => expect(executes()).toHaveLength(1), WAIT);
    expect(view.getLocation().search).toBe('');
    expect(view.getLocation().pathname).toBe(uiTestEditorPath(readyDraft.id));
    // The run played out (the scripted transport delivers a terminal snapshot): still one request.
    await screen.findByRole('button', { name: 'Run Test' }, WAIT);
    await quiet();
    expect(executes()).toHaveLength(1);
    expect(guidedStarts()).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('a reload, or Back to that entry, sends no further execute', async () => {
    serve(readyDraft);
    const first = renderAutorun(readyDraft.id);
    await waitFor(() => expect(executes()).toHaveLength(1), WAIT);
    await screen.findByRole('button', { name: 'Run Test' }, WAIT);
    // What a reload (or Back) opens is the entry the replace left behind: the same path, no autorun.
    const reopened = `${first.getLocation().search}`;
    expect(reopened).not.toContain('autorun');
    first.unmount();

    renderAutorun(readyDraft.id, reopened);
    await settledControl();
    await quiet();
    expect(executes()).toHaveLength(1);
    expect(guidedStarts()).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('keeps the other query parameters when it removes autorun', async () => {
    serve(readyDraft);
    const view = renderAutorun(readyDraft.id, '?autorun=1&from=catalog');
    await waitFor(() => expect(executes()).toHaveLength(1), WAIT);
    expect(view.getLocation().search).toBe('?from=catalog');
  }, TEST_TIMEOUT_MS);

  it('an UNLEARNED test with steps sends exactly one guided start and no execute', async () => {
    serve(unlearnedDraft);
    renderAutorun(unlearnedDraft.id);

    await waitFor(() => expect(guidedStarts()).toHaveLength(1), WAIT);
    await screen.findByTestId('guided-run', {}, WAIT);
    await quiet();
    expect(guidedStarts()).toHaveLength(1);
    expect(executes()).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('a refused execute shows the forbidden narrative after exactly one request', async () => {
    serve(readyDraft, { executeAnswer: 'forbidden' });
    renderAutorun(readyDraft.id);

    await waitFor(() => expect(executes()).toHaveLength(1), WAIT);
    const refusal = await screen.findByTestId('run-refusal', {}, WAIT);
    expect(within(refusal).getByTestId('run-refusal-title')).toHaveTextContent(EXECUTE_FORBIDDEN_NARRATIVE.title);
    await quiet();
    expect(executes()).toHaveLength(1);
  }, TEST_TIMEOUT_MS);

  it('a LEARNING test sends nothing at settle or later, not after the learn ends or a refresh, and says why', async () => {
    const served = serve(learningDraft);
    renderAutorun(learningDraft.id);

    const control = await settledControl();
    expect(control.getAttribute('data-run-mode')).toBe('busy');
    expect(await screen.findByTestId('run-learning-elsewhere', {}, WAIT)).toBeInTheDocument();
    await quiet();
    expect(runStarts()).toHaveLength(0);

    // The learn ends: the server now reads READY, and "Refresh test information" brings it in.
    served.state.current = { ...readyDraft, id: learningDraft.id, name: learningDraft.name };
    await user().click(screen.getByRole('button', { name: 'Refresh test information' }));
    await waitFor(() => {
      const run = screen.getByRole('button', { name: 'Run Test' });
      expect(run.getAttribute('data-run-mode')).toBe('replay');
      expect(run).not.toBeDisabled();
    }, WAIT);
    await quiet();
    expect(runStarts()).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('a test with no steps sends nothing, not even on the first typed step, and keeps the existing caption', async () => {
    serve({ ...readyDraft, steps: [] });
    renderAutorun(readyDraft.id);

    await settledControl();
    expect(await screen.findByTestId('run-blocked-reason', {}, WAIT)).toHaveTextContent('Add a step to run this test.');
    await quiet();
    expect(runStarts()).toHaveLength(0);

    const u = user();
    await u.type(screen.getByRole('textbox', { name: 'Add a test step' }), 'Go to "https://example.invalid"{Enter}');
    await screen.findByRole('textbox', { name: 'Step 1' }, WAIT);
    await quiet();
    expect(runStarts()).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('a failed test read requests no run', async () => {
    serve(readyDraft, { testRead: 'missing' });
    renderAutorun(readyDraft.id);

    await screen.findByText('No test selected.', {}, WAIT);
    await quiet();
    expect(runStarts()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Run Test' })).toBeDisabled();
  }, TEST_TIMEOUT_MS);

  it('requests no run before the gate has read the test, then exactly one when it has', async () => {
    const served = serve(readyDraft, { holdGateRead: true });
    renderAutorun(readyDraft.id);

    // The editor has the draft; the gate's own read is held, so the control is still loading.
    await screen.findByRole('textbox', { name: 'Step 1' }, WAIT);
    expect((await screen.findByRole('button', { name: 'Run Test' }, WAIT)).getAttribute('data-run-mode')).toBe('loading');
    await quiet();
    expect(runStarts()).toHaveLength(0);

    served.release();
    await waitFor(() => expect(executes()).toHaveLength(1), WAIT);
    await quiet();
    expect(executes()).toHaveLength(1);
  }, TEST_TIMEOUT_MS);
});

describe('AC-29: author activity or a route change before the gate settles drops the request', () => {
  it('editing a step before the read completes sends nothing when it later completes', async () => {
    const served = serve(readyDraft, { holdGateRead: true });
    renderAutorun(readyDraft.id);

    const step = await screen.findByRole('textbox', { name: 'Step 1' }, WAIT);
    await user().type(step, ' extra');
    served.release();
    await settledControl();
    await quiet();
    expect(runStarts()).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('changing the environment before the read completes sends nothing when it later completes', async () => {
    const served = serve(readyDraft, { holdGateRead: true });
    renderAutorun(readyDraft.id);

    await screen.findByRole('textbox', { name: 'Step 1' }, WAIT);
    const u = user();
    await u.click(screen.getByRole('combobox', { name: 'Environment' }));
    await u.click(await screen.findByRole('option', { name: 'UAT' }, WAIT));
    served.release();
    await settledControl();
    await quiet();
    expect(runStarts()).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('editing a variable before the read completes sends nothing when it later completes', async () => {
    const served = serve(readyDraft, { holdGateRead: true });
    renderAutorun(readyDraft.id);

    await screen.findByRole('textbox', { name: 'Step 1' }, WAIT);
    const u = user();
    await u.click(screen.getByRole('button', { name: 'Variables' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    await u.click(within(dialog).getByRole('button', { name: 'Add variable' }));
    const rows = within(dialog).getAllByRole('textbox', { name: /Variable \d+ name/ });
    await u.type(rows[rows.length - 1], 'NEW_VAR');
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    served.release();
    await settledControl();
    await quiet();
    expect(runStarts()).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('changing the route id before the read completes sends nothing, for either test', async () => {
    const served = serve(readyDraft, { holdGateRead: true });
    const nav = { go: null as ((to: string) => void) | null };
    renderStudioAt(readyDraft.id, <ChecksStudioPage guidedOptions={GUIDED_OPTIONS} />, {
      search: '?autorun=1',
      wrapper: StoreProvider,
      navHandle: nav,
    });

    await screen.findByRole('textbox', { name: 'Step 1' }, WAIT);
    await act(async () => {
      nav.go?.(uiTestEditorPath(unlearnedDraft.id));
    });
    // The new id is read too; whatever it answers, no run is requested.
    served.state.current = unlearnedDraft;
    served.release();
    await quiet(600);
    expect(runStarts()).toHaveLength(0);
  }, TEST_TIMEOUT_MS);
});

describe('AC-29: "Run again" is unchanged', () => {
  it('an autorun that ends in STALE offers Run again, and pressing it runs exactly once more', async () => {
    const stale = { ...errorCodeExecutions.STALE, executionId: passedExecution.executionId };
    setExecutionTransportSeam({ primary: createScriptedTransport([stale], 0), fallback: null });
    serve(readyDraft);
    renderAutorun(readyDraft.id);

    await waitFor(() => expect(executes()).toHaveLength(1), WAIT);
    const rerun = await screen.findByRole('button', { name: RERUN_LABEL }, WAIT);
    await user().click(rerun);
    await waitFor(() => expect(executes()).toHaveLength(2), WAIT);
    await quiet();
    expect(executes()).toHaveLength(2);
  }, TEST_TIMEOUT_MS);
});
