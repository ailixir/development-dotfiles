import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { http, HttpResponse } from 'msw';
import type { ExecutionSnapshot, TestDto, TestUpdateRequest } from '@/types/studio/studioTypes';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail, fixtureStepId } from '@/services/mocks/studio/authoringState';
import { readyDraft, unlearnedDraft } from '@/services/mocks/studio/readinessFixtures';
import { setVaultSecrets } from '@/services/mocks/studio/capabilityHandlers';
import { seedSecretNames } from '@/services/mocks/studio/secretsHandlers';
import { failGuidedRequests, guidedRequestCount, setGuidedScenario } from '@/services/mocks/studio/guidedHandlers';
import { guidedError, loginRequired } from '@/services/mocks/studio/guidedFixtures';
import { guidedCopy } from '@/components/studio/guided/guidedNarratives';
import { guidedSessionStorageKey } from '@/types/studio/studioGuidedTypes';
import {
  DEV_TRANSPORT_SCENARIO,
  REPLAY_FAILURE_SCENARIOS,
  createScriptedTransport,
} from '@/services/mocks/studio/executionScenarios';
import {
  resetExecutionTransportSeam,
  setExecutionTransportSeam,
} from '@/services/api/studioTransportWiring';
import { resetGuidedSessionRuntime } from '@/components/studio/guided/useGuidedSession';
import { availableQuickStartTemplates } from '@/components/studio/templates';
import { renderStudioAt } from '@/test/renderStudioAt';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import { clearGuidedSession, setExecuting } from '@/store/slices/studioSlice';
import ChecksStudioPage, { RELOAD_TEST_LABEL, SAVE_CONFLICT_TITLE } from './ChecksStudioPage';

/**
 * STUDIO-OBS-008 AC-9 — the replay half and the editor wiring, on the real page (lane L5b).
 *
 *  - **Later replay** (AC-2/AC-3): a `READY` test replays through the one execute and says
 *    "Completed — saved steps replayed."; nothing guided starts.
 *  - **T0 ruling A1.6 on the page**: the replay's named cause from `ExecutionSnapshot.replayFailure`,
 *    delivered through the production transport seam (scripted frames, the document examples): the
 *    login notice with "Go to step N" (focus) and "Open Variables", and the drift sentence whose
 *    "Learn again from step N" starts exactly that guided session. The component-level cases (deleted
 *    step, superseded revision, the negative control) are in `run/replayFailure.test.tsx`.
 *  - **AC-5 editor wiring**: the server capability (off and on), the reference insert menu for
 *    `<var>` and `<secret>`, and ruling D-8 for every `secretRef` the page writes.
 *  - **AC-8 a / AC-9 narrow layout**: the page at 375×812.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';
const WAIT = { timeout: 20_000 } as const;
const TEST_TIMEOUT_MS = 60_000;
const GUIDED_OPTIONS = { pollIntervalMs: 5, retryDelayMs: 5 } as const;

const bootstrapHandlers = [
  http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
  http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
];

const observed: Array<{ method: string; path: string; key: string | null; body: unknown }> = [];
function record({ request }: { request: Request }) {
  const entry = {
    method: request.method,
    path: new URL(request.url).pathname,
    key: request.headers.get('Idempotency-Key'),
    body: undefined as unknown,
  };
  observed.push(entry);
  if (request.method === 'POST' || request.method === 'PUT') {
    void request
      .clone()
      .text()
      .then((text) => {
        entry.body = text ? JSON.parse(text) : null;
      })
      .catch(() => undefined);
  }
}
const requests = (method: string, pattern: RegExp) =>
  observed.filter((entry) => entry.method === method && pattern.test(entry.path));
const STARTS = /\/studio\/guided-sessions$/u;
const EXECUTES = /\/studio\/tests\/[^/]+\/execute$/u;
const SAVES = /\/studio\/tests\/[^/]+$/u;

const NARROW = { width: 375, height: 812 } as const;
const original = { width: window.innerWidth, height: window.innerHeight };

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
  studioMockServer.use(...bootstrapHandlers);
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
  for (const draft of [readyDraft, unlearnedDraft]) {
    store.dispatch(clearGuidedSession({ testId: draft.id }));
  }
  store.dispatch(setExecuting(false));
  window.sessionStorage.clear();
  Object.assign(window, { innerWidth: original.width, innerHeight: original.height });
});
afterAll(() => {
  studioMockServer.events.removeListener('request:start', record);
  studioMockServer.close();
});

/** Serves one draft as the list and its single read; saves are answered with the saved body. */
function serveDraft(draft: TestDto) {
  studioMockServer.use(
    ...bootstrapHandlers,
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [draft], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixtureDetail(draft))),
    http.put(`${STUDIO_BASE}/tests/:id`, async ({ request }) =>
      HttpResponse.json({ ...fixtureDetail(draft), ...((await request.json()) as Record<string, unknown>) }),
    ),
  );
}

/** A replay whose snapshots arrive through the production transport seam. */
function serveReplay(frames: readonly ExecutionSnapshot[]) {
  setExecutionTransportSeam({ primary: createScriptedTransport(frames, 0), fallback: null });
  studioMockServer.use(
    http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
      HttpResponse.json({ executionId: frames[frames.length - 1].executionId, status: 'PENDING' }, { status: 202 }),
    ),
  );
}

const StoreProvider = ({ children }: { children?: ReactNode }) => <Provider store={store}>{children}</Provider>;

/** Mounts the editor on the id of the draft the test just served. */
function renderPage(id: string) {
  return renderStudioAt(id, <ChecksStudioPage guidedOptions={GUIDED_OPTIONS} />, { wrapper: StoreProvider });
}

async function runButton(): Promise<HTMLElement> {
  const control = await screen.findByRole('button', { name: 'Run Test' }, WAIT);
  await waitFor(() => expect(control.getAttribute('data-run-mode')).not.toBe('loading'), WAIT);
  await waitFor(() => expect(control).not.toBeDisabled(), WAIT);
  return control;
}

/** Waits until the page has the capability answer (no "checking" sentence any more). */
async function capabilityLoaded(): Promise<void> {
  await waitFor(
    () => expect(document.body.textContent).not.toMatch(/Checking whether secrets are available/),
    WAIT,
  );
}

/**
 * The value of `property` the browser would apply to `element` at a viewport `width` pixels wide.
 *
 * jsdom has no layout engine and its `getComputedStyle` ignores `@media` rules, while MUI emits even
 * its `xs` styles inside `@media (min-width:0px)`. So the cascade is evaluated here from the CSSOM the
 * page's own styles produced: plain rules always apply, a media rule applies when its
 * `min-width`/`max-width` conditions hold at `width`, and a later matching rule wins (MUI's emotion
 * classes are single-class selectors, so source order is the cascade). Inline styles win last.
 */
function styleAtWidth(element: Element, width: number, property: string): string {
  const holds = (media: string): boolean => {
    const min = /min-width:\s*([\d.]+)px/u.exec(media);
    const max = /max-width:\s*([\d.]+)px/u.exec(media);
    if (!min && !max) return false;
    return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
  };
  let value = '';
  const visit = (rules: CSSRuleList, active: boolean) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        visit(rule.cssRules, active && holds(rule.media.mediaText));
      } else if (rule instanceof CSSStyleRule && active) {
        let matches = false;
        try {
          matches = element.matches(rule.selectorText);
        } catch {
          matches = false;
        }
        const declared = rule.style.getPropertyValue(property);
        if (matches && declared) value = declared;
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules, true);
  return (element as HTMLElement).style.getPropertyValue(property) || value;
}

async function settle(ms = 60): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const user = () => userEvent.setup({ delay: null });

/**
 * A pointer to a session this tab already started for `draft` (a Run already started here). The read
 * of that session is refused, so the page holds a stored session it cannot read (`unreadable`).
 */
function storePointer(draft: TestDto, sessionId: string) {
  window.sessionStorage.setItem(
    guidedSessionStorageKey(draft.id),
    JSON.stringify({
      testId: draft.id,
      sessionId,
      startKey: 'start-key-probe',
      finalizeKey: 'finalize-key-probe',
      startRequest: {
        schemaVersion: 3,
        testId: draft.id,
        sourceRevision: String(draft.sourceRevision),
        configurationRevision: String(draft.configurationRevision),
        environmentId: draft.environment,
        versions: { contract: 3 },
      },
    }),
  );
}
const storedPointer = (draft: TestDto): string | null => window.sessionStorage.getItem(guidedSessionStorageKey(draft.id));
const CAPABILITIES = /\/studio\/tests\/[^/]+\/capabilities$/u;

describe('AC-9: later replay (AC-2, AC-3)', () => {
  it('later replay: a READY test replays through one execute, starts no guided session, and says "Completed — saved steps replayed."', async () => {
    serveDraft(readyDraft);
    serveReplay(DEV_TRANSPORT_SCENARIO);
    renderPage(readyDraft.id);
    expect(await screen.findByTestId('guided-readiness-chip', {}, WAIT)).toHaveTextContent('Learned · ready to repeat');
    await user().click(await runButton());

    const completion = await screen.findByTestId('guided-completion', {}, WAIT);
    expect(completion).toHaveAttribute('data-kind', 'replayed');
    expect(completion).toHaveTextContent('Completed — saved steps replayed.');
    await settle();
    expect(requests('POST', EXECUTES)).toHaveLength(1);
    expect(requests('POST', STARTS)).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/learned from this run/);
  }, TEST_TIMEOUT_MS);
});

describe('W5-1: an unreadable stored session never blocks a replay (ruling w5-unreadable-and-alias section 2)', () => {
  async function serveUnreadableReady(frames: Parameters<typeof serveReplay>[0]) {
    failGuidedRequests('read', { status: 409, body: guidedError('REVISION_CONFLICT') }, { times: 50 });
    storePointer(readyDraft, 'guided-session-probe');
    serveDraft(readyDraft);
    serveReplay(frames);
    renderPage(readyDraft.id);
    // The stored session was read and refused, so the page is in the `unreadable` state.
    await waitFor(() => expect(guidedRequestCount('read')).toBeGreaterThan(0), WAIT);
  }

  it('W5-1 T1: a READY test with an unreadable stored session replays: Run is enabled, no caption, one execute, no start, pointer kept', async () => {
    await serveUnreadableReady(DEV_TRANSPORT_SCENARIO);
    const pointerBefore = storedPointer(readyDraft);
    expect(pointerBefore).not.toBeNull();

    const control = await runButton();
    expect(control.getAttribute('data-run-mode')).toBe('replay');
    expect(control).not.toBeDisabled();
    expect(screen.queryByTestId('run-session-unreadable')).toBeNull();

    await user().click(control);
    await waitFor(() => expect(requests('POST', EXECUTES)).toHaveLength(1), WAIT);
    await settle(100);
    expect(requests('POST', EXECUTES)).toHaveLength(1);
    expect(requests('POST', STARTS)).toHaveLength(0);
    expect(storedPointer(readyDraft)).toBe(pointerBefore);
    const pointer = JSON.parse(storedPointer(readyDraft) ?? 'null');
    expect(pointer?.sessionId).toBe('guided-session-probe');
    expect(pointer?.startKey).toBe('start-key-probe');
  }, TEST_TIMEOUT_MS);

  it('W5-1 T5 / W5-11: READY + unreadable: "Learn again from step 2" starts nothing and says why', async () => {
    await serveUnreadableReady(REPLAY_FAILURE_SCENARIOS.targetDrift);

    await user().click(await runButton());
    expect(await screen.findByTestId('replay-drift', {}, WAIT)).toHaveTextContent('Step 2 no longer matches the page…');
    // Nothing said under Run while the replay is the thing that can run.
    expect(screen.queryByTestId('run-session-unreadable')).toBeNull();

    const seen = observed.length;
    await user().click(screen.getByRole('button', { name: 'Learn again from step 2' }));
    const notice = await screen.findByTestId('run-session-unreadable', {}, WAIT);
    expect(notice).toHaveTextContent(guidedCopy('sessionUnreadable'));
    await settle(150);
    expect(requests('POST', STARTS)).toHaveLength(0);
    expect(observed.slice(seen).filter((entry) => entry.method === 'GET' && CAPABILITIES.test(entry.path))).toHaveLength(0);
    expect(storedPointer(readyDraft)).not.toBeNull();
  }, TEST_TIMEOUT_MS);
});

describe('AC-9 / T0 ruling A1.6 on the page: the replay names its cause', () => {
  it.each([
    ['loginRequiredNoLoginSteps', 2, 'This page asks you to sign in. Add login steps before step 2 using your secrets (<secret NAME>), then Run again'],
    ['loginRequiredLoginStepsFailed', 3, 'Your login steps did not sign you in; check the secret and the steps before step 3'],
  ] as const)(
    'A1.6 replay login (%s): the guided login notice, "Go to step N" focuses that row, "Open Variables" opens the dialog',
    async (scenario, stepNumber, sentence) => {
      serveDraft(readyDraft);
      serveReplay(REPLAY_FAILURE_SCENARIOS[scenario]);
      renderPage(readyDraft.id);
      await user().click(await runButton());

      const notice = await screen.findByTestId('login-required-notice', {}, WAIT);
      expect(notice.textContent).toContain(sentence);
      // The narrative was chosen before status and errorCode: no unnamed or code narrative beside it.
      expect(screen.queryByTestId('execution-error-unnamed')).toBeNull();
      expect(screen.queryByTestId('execution-error')).toBeNull();

      await user().click(within(notice).getByRole('button', { name: `Go to step ${stepNumber}` }));
      await waitFor(
        () => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: `Step ${stepNumber}` })),
        WAIT,
      );
      await user().click(within(notice).getByRole('button', { name: 'Open Variables' }));
      expect(await screen.findByRole('dialog', {}, WAIT)).toBeInTheDocument();
      expect(requests('POST', STARTS)).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  it('replay drift → Learn again from step N: the drift sentence, a seek on the existing replay path, and exactly that guided start (base, step, fresh key)', async () => {
    serveDraft(readyDraft);
    serveReplay(REPLAY_FAILURE_SCENARIOS.targetDrift);
    renderPage(readyDraft.id);
    await user().click(await runButton());

    expect(await screen.findByTestId('replay-drift', {}, WAIT)).toHaveTextContent('Step 2 no longer matches the page…');
    expect(screen.queryByTestId('execution-error-unnamed')).toBeNull();

    // A1.6 case 7: "Seek to step N" seeks the replay recording to that step's own offset.
    await user().click(screen.getByRole('button', { name: 'Seek to step 2' }));
    const video = document.querySelector('video') as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.currentTime).toBeCloseTo(1.61, 5);

    await user().click(screen.getByRole('button', { name: 'Learn again from step 2' }));
    await waitFor(() => expect(requests('POST', STARTS)).toHaveLength(1), WAIT);
    await waitFor(() => expect(requests('POST', STARTS)[0].body).toBeTruthy(), WAIT);
    const [start] = requests('POST', STARTS);
    expect(start.body).toEqual({
      schemaVersion: 3,
      testId: readyDraft.id,
      sourceRevision: String(readyDraft.sourceRevision),
      configurationRevision: String(readyDraft.configurationRevision),
      environmentId: readyDraft.environment,
      versions: { contract: 3 },
      firstLearnStepId: fixtureStepId(1),
    });
    expect(start.key).toBeTruthy();
    // The guided session it started re-learns from step 2 and ends from the recorded receipt (learned once its
    // proof passes), which stays above the proof replay of the new revision.
    await waitFor(
      () => expect(screen.getByTestId('guided-proof-receipt')).toHaveTextContent(/Recorded from this run|Completed — steps 2–4 learned again\./u),
      WAIT,
    );
    // Never repaired automatically: one replay, one explicit learn.
    expect(requests('POST', EXECUTES)).toHaveLength(1);
    expect(requests('POST', STARTS)).toHaveLength(1);
  }, TEST_TIMEOUT_MS);
});

describe('AC-9: references and capability (AC-5 editor wiring)', () => {
  it('reference insert for <var> and <secret>: tokens land at the caret, and an inserted secret is declared by its Vault name (D-8)', async () => {
    seedSecretNames(readyDraft.id, ['API_TOKEN']);
    serveDraft(readyDraft);
    renderPage(readyDraft.id);
    await runButton();
    await capabilityLoaded();
    const u = user();

    // Into the step being edited: the caret is at the end of step 1.
    const stepOne = screen.getByRole('textbox', { name: 'Step 1' });
    await u.click(stepOne);
    (stepOne as HTMLTextAreaElement).setSelectionRange(stepOne.textContent!.length, stepOne.textContent!.length);
    fireEvent.select(stepOne);
    await u.click(screen.getByRole('button', { name: 'Insert reference' }));
    await u.click(await screen.findByRole('menuitem', { name: /USER_ID/ }, WAIT));
    expect((stepOne as HTMLTextAreaElement).value).toBe(`${readyDraft.steps[0]}<var USER_ID>`);

    // Into the "Add a test step" field.
    const addField = screen.getByRole('textbox', { name: 'Add a test step' });
    await u.click(addField);
    await u.type(addField, 'Type ');
    await u.click(screen.getByRole('button', { name: 'Insert reference' }));
    await u.click(await screen.findByRole('menuitem', { name: /API_TOKEN/ }, WAIT));
    expect((addField as HTMLTextAreaElement).value).toBe('Type <secret API_TOKEN>');

    await u.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requests('PUT', SAVES)).toHaveLength(1), WAIT);
    await waitFor(() => expect(requests('PUT', SAVES)[0].body).toBeTruthy(), WAIT);
    const body = requests('PUT', SAVES)[0].body as {
      steps: Array<{ id: string; text: string }>;
      variables: Array<Record<string, unknown>>;
    };
    expect(body.steps[0]).toEqual({ id: fixtureStepId(0), text: `${readyDraft.steps[0]}<var USER_ID>` });
    expect(body.steps[body.steps.length - 1].text).toBe('Type <secret API_TOKEN>');
    expect(body.variables).toContainEqual({ name: 'API_TOKEN', kind: 'secretRef', secretId: 'API_TOKEN' });
  }, TEST_TIMEOUT_MS);

  it('W5-2: inserting <secret USER_ID> when a variable named USER_ID exists is refused: no token, no row, and the sentence says why', async () => {
    // readyDraft declares a plain USER_ID; the Vault also holds a secret named USER_ID. The backend
    // refuses such a set at start (IncrementalAuthoringIdentity.java:83-90), so nothing is inserted.
    seedSecretNames(readyDraft.id, ['USER_ID']);
    serveDraft(readyDraft);
    renderPage(readyDraft.id);
    await runButton();
    await capabilityLoaded();
    const u = user();

    const addField = screen.getByRole('textbox', { name: 'Add a test step' });
    await u.click(addField);
    await u.type(addField, 'Type ');
    await u.click(screen.getByRole('button', { name: 'Insert reference' }));
    const menu = await screen.findByRole('menu', {}, WAIT);
    // The Secrets section's item, not the Variables one: both are named USER_ID.
    const secretItem = (await within(menu).findAllByRole('menuitem', { name: /USER_ID/ }, WAIT)).find((item) =>
      item.textContent?.includes('<secret USER_ID>'),
    );
    expect(secretItem).toBeDefined();
    await u.click(secretItem!);

    // No token was put into the step text, and the sentence names the ID and what to do.
    expect((addField as HTMLTextAreaElement).value).toBe('Type ');
    expect(await screen.findByTestId('reference-insert-refused', {}, WAIT)).toHaveTextContent(
      guidedCopy('secretNameTaken', { ID: 'USER_ID' }),
    );

    await u.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requests('PUT', SAVES)).toHaveLength(1), WAIT);
    await waitFor(() => expect(requests('PUT', SAVES)[0].body).toBeTruthy(), WAIT);
    const { variables } = requests('PUT', SAVES)[0].body as { variables: Array<Record<string, unknown>> };
    // No row was added or changed: the saved variables are the draft's own, and no alias exists.
    expect(variables).toEqual(readyDraft.variables);
    expect(variables.filter((variable) => variable.kind === 'secretRef' && variable.secretId === 'USER_ID')).toHaveLength(0);
    expect(variables.some((variable) => variable.name === 'USER_ID_2')).toBe(false);
  }, TEST_TIMEOUT_MS);

  it('D-8: a secret row with no chosen secret is not written, and a template secret is written under its Vault name', async () => {
    serveDraft(readyDraft);
    renderPage(readyDraft.id);
    await runButton();
    await capabilityLoaded();
    const u = user();

    await u.click(screen.getByRole('button', { name: 'Templates' }));
    const templates = await screen.findByRole('dialog', {}, WAIT);
    expect(within(templates).getByText('Daily sign-on check')).toBeInTheDocument();
    await u.click(within(templates).getAllByRole('button', { name: 'Use this template' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);

    await u.click(screen.getByRole('button', { name: 'Variables' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    await u.click(within(dialog).getByRole('button', { name: 'Add variable' }));
    const rows = within(dialog).getAllByRole('textbox', { name: /Variable \d+ name/ });
    const last = rows[rows.length - 1];
    await u.type(last, 'NEW_SECRET');
    const types = within(dialog).getAllByRole('combobox', { name: /Variable \d+ type/ });
    await u.click(types[types.length - 1]);
    await u.click(await screen.findByRole('option', { name: 'Secret' }, WAIT));
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(requests('PUT', SAVES)).toHaveLength(1), WAIT);
    await waitFor(() => expect(requests('PUT', SAVES)[0].body).toBeTruthy(), WAIT);
    const { variables } = requests('PUT', SAVES)[0].body as { variables: Array<Record<string, unknown>> };
    expect(variables).toContainEqual({ name: 'PASSWORD', kind: 'secretRef', secretId: 'PASSWORD' });
    expect(variables.find((variable) => variable.name === 'NEW_SECRET')).toBeUndefined();
    for (const variable of variables.filter((candidate) => candidate.kind === 'secretRef')) {
      expect(typeof variable.secretId).toBe('string');
      expect((variable.secretId as string).length).toBeGreaterThan(0);
    }
  }, TEST_TIMEOUT_MS);

  it('capability off: secrets are unavailable, said in text; no secret template, no secret in the insert menu', async () => {
    setVaultSecrets(false);
    serveDraft(readyDraft);
    renderPage(readyDraft.id);
    await runButton();
    await capabilityLoaded();
    const u = user();

    expect(screen.getByTestId('secrets-availability')).toHaveTextContent('Vault is not connected for this environment.');
    await u.click(screen.getByRole('button', { name: 'Insert reference' }));
    const menu = await screen.findByRole('menu', {}, WAIT);
    expect(within(menu).getByText('Vault is not connected for this environment.')).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'New secret…' })).toBeNull();
    await u.keyboard('{Escape}');

    await u.click(screen.getByRole('button', { name: 'Templates' }));
    const templates = await screen.findByRole('dialog', {}, WAIT);
    expect(within(templates).queryByText('Daily sign-on check')).toBeNull();
    expect(within(templates).getAllByRole('button', { name: 'Use this template' })).toHaveLength(
      availableQuickStartTemplates(false).length,
    );
    expect(document.body.textContent).not.toMatch(/alpha/i);
  }, TEST_TIMEOUT_MS);

  it('capability on: no unavailability sentence, the secret template is offered, and the insert menu offers "New secret…"', async () => {
    setVaultSecrets(true);
    serveDraft(readyDraft);
    renderPage(readyDraft.id);
    await runButton();
    await capabilityLoaded();
    const u = user();

    expect(screen.queryByTestId('secrets-availability')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Insert reference' }));
    expect(await screen.findByRole('menuitem', { name: 'New secret…' }, WAIT)).toBeInTheDocument();
    await u.keyboard('{Escape}');

    await u.click(screen.getByRole('button', { name: 'Templates' }));
    const templates = await screen.findByRole('dialog', {}, WAIT);
    expect(within(templates).getByText('Daily sign-on check')).toBeInTheDocument();
    expect(within(templates).getAllByRole('button', { name: 'Use this template' })).toHaveLength(
      availableQuickStartTemplates(true).length,
    );
  }, TEST_TIMEOUT_MS);
});

describe('AC-9 / AC-8 a: narrow layout', () => {
  it('narrow layout (375×812): header, panels, the guided login notice and its actions stack at full width; Run stays reachable', async () => {
    Object.assign(window, { innerWidth: NARROW.width, innerHeight: NARROW.height });
    window.dispatchEvent(new Event('resize'));
    setGuidedScenario(loginRequired(false), unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    renderPage(unlearnedDraft.id);
    const run = await runButton();
    await user().click(run);
    const notice = await screen.findByTestId('login-required-notice', {}, WAIT);

    /*
     * jsdom has no layout engine, so the cascade at 375 px is evaluated from the page's own CSS rules
     * (`styleAtWidth`). Each narrow assertion has a 1440 px control, so the check can tell the two
     * layouts apart. A real-browser check at 375×812 is the Playwright lane's, not this one.
     */
    expect(window.innerWidth).toBe(375);
    expect(window.innerHeight).toBe(812);
    const at = (element: Element, property: string) => ({
      narrow: styleAtWidth(element, NARROW.width, property),
      wide: styleAtWidth(element, 1440, property),
    });
    const header = screen.getByRole('heading', { level: 1 }).closest('.MuiPaper-root') as HTMLElement;
    expect(at(header, 'flex-direction')).toEqual({ narrow: 'column', wide: 'row' });
    const panels = (Array.from(document.querySelectorAll('.MuiGrid-item')) as HTMLElement[]).slice(0, 2);
    expect(panels).toHaveLength(2);
    for (const panel of panels) {
      expect(at(panel, 'max-width')).toEqual({ narrow: '100%', wide: '50%' });
    }
    const actions = within(notice).getByTestId('login-required-actions');
    expect(at(actions, 'flex-direction')).toEqual({ narrow: 'column', wide: 'row' });
    for (const name of ['Go to step 1', 'Open Variables']) {
      expect(at(within(notice).getByRole('button', { name }), 'width')).toEqual({ narrow: '100%', wide: 'auto' });
    }
    // Long text wraps instead of widening the page.
    const sentence = within(notice).getAllByText(/This page asks you to sign in/)[0];
    expect(styleAtWidth(sentence, NARROW.width, 'overflow-wrap')).toBe('anywhere');
    // The page's own controls are still there and labelled at this width.
    expect(screen.getByRole('button', { name: 'Run Test' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Insert reference' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Step 1' })).toBeInTheDocument();
  }, TEST_TIMEOUT_MS);
});


describe('C-OBS008-4: manual Variables-save ambiguity preflight', () => {
  const collisionCopy = 'A variable name conflicts with a secret reference. Rename it or select the matching secret.';

  it('refuses a distinct plain-name/secret-ID collision without consuming any draft, then correction sends one whole-draft PUT', async () => {
    seedSecretNames(readyDraft.id, ['LOGIN_PW', 'USER_ID']);
    serveDraft(readyDraft);
    renderPage(readyDraft.id);
    await runButton(); await capabilityLoaded();
    const u = user();
    const step = screen.getByRole('textbox', { name: 'Step 1' });
    const pending = screen.getByRole('textbox', { name: 'Add a test step' });
    fireEvent.change(step, { target: { value: 'Click the edited public step' } });
    fireEvent.change(pending, { target: { value: 'Check the pending public step' } });
    await u.click(screen.getByRole('combobox', { name: 'Environment' }));
    await u.click(await screen.findByRole('option', { name: 'Development' }, WAIT));
    await u.click(screen.getByRole('button', { name: 'Variables' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    const alias = within(dialog).getByRole('textbox', { name: 'Variable 2 name' });
    await u.clear(alias); await u.type(alias, 'LOGIN');
    await u.click(within(dialog).getByRole('combobox', { name: 'Select secret' }));
    await u.click(await screen.findByRole('option', { name: 'USER_ID' }, WAIT));
    const value = within(dialog).getByRole('textbox', { name: 'Variable 1 value' });
    await u.clear(value); await u.type(value, '  public typed value  ');
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByTestId('variables-save-issue', {}, WAIT)).toHaveTextContent(collisionCopy);
    expect(requests('PUT', SAVES)).toHaveLength(0);
    expect(requests('POST', STARTS)).toHaveLength(0);
    expect(step).toHaveValue('Click the edited public step');
    expect(pending).toHaveValue('Check the pending public step');
    expect(screen.queryByRole('textbox', { name: 'Step 5', hidden: true })).toBeNull();
    expect(value).toHaveValue('  public typed value  ');
    expect(alias).toHaveValue('LOGIN');
    expect(within(dialog).getByRole('combobox', { name: 'Select secret' })).toHaveTextContent('USER_ID');
    const name = within(dialog).getByRole('textbox', { name: 'Variable 1 name' });
    await u.clear(name); await u.type(name, 'USER_ALIAS');
    expect(screen.queryByTestId('variables-save-issue')).toBeNull();
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requests('PUT', SAVES)[0]?.body).toBeTruthy(), WAIT);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    expect(requests('PUT', SAVES)).toHaveLength(1);
    const body = requests('PUT', SAVES)[0].body as TestUpdateRequest;
    expect(body.variables).toEqual([{ name: 'USER_ALIAS', kind: 'plain', value: '  public typed value  ' }, { name: 'LOGIN', kind: 'secretRef', secretId: 'USER_ID' }]);
    expect(body.steps[0]).toEqual({ id: fixtureStepId(0), text: 'Click the edited public step' });
    expect(body.steps.map((row) => row.text)).toEqual(['Click the edited public step', ...readyDraft.steps.slice(1), 'Check the pending public step']);
    expect(body).toMatchObject({ environment: 'Development', sourceRevision: readyDraft.sourceRevision, configurationRevision: readyDraft.configurationRevision, csiId: readyDraft.csiId });
  }, TEST_TIMEOUT_MS);

  it('refuses a secret alias naming another secretId and accepts two aliases after selecting the matching secret', async () => {
    const draft: TestDto = { ...readyDraft, variables: [{ name: 'TOKEN', kind: 'secretRef', secretId: 'OTHER' }, { name: 'LOGIN', kind: 'secretRef', secretId: 'OTHER' }] };
    seedSecretNames(draft.id, ['OTHER', 'TOKEN']); serveDraft(draft); renderPage(draft.id);
    await runButton(); await capabilityLoaded(); const u = user();
    await u.click(screen.getByRole('button', { name: 'Variables' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    await u.click(within(dialog).getAllByRole('combobox', { name: 'Select secret' })[1]);
    await u.click(await screen.findByRole('option', { name: 'TOKEN' }, WAIT));
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByTestId('variables-save-issue', {}, WAIT)).toHaveTextContent(collisionCopy);
    expect(requests('PUT', SAVES)).toHaveLength(0);
    await u.click(within(dialog).getAllByRole('combobox', { name: 'Select secret' })[0]);
    await u.click(await screen.findByRole('option', { name: 'TOKEN' }, WAIT));
    expect(screen.queryByTestId('variables-save-issue')).toBeNull();
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requests('PUT', SAVES)[0]?.body).toBeTruthy(), WAIT);
    expect(requests('PUT', SAVES)).toHaveLength(1);
    expect((requests('PUT', SAVES)[0].body as TestUpdateRequest).variables).toEqual([{ name: 'TOKEN', kind: 'secretRef', secretId: 'TOKEN' }, { name: 'LOGIN', kind: 'secretRef', secretId: 'TOKEN' }]);
  }, TEST_TIMEOUT_MS);

  it('blocks duplicate-after-trim in dialog and toolbar Save, clearing the generic issue when corrected', async () => {
    serveDraft(readyDraft); renderPage(readyDraft.id); await runButton(); await capabilityLoaded(); const u = user();
    await u.click(screen.getByRole('button', { name: 'Variables' }));
    let dialog = await screen.findByRole('dialog', {}, WAIT);
    const name = within(dialog).getByRole('textbox', { name: 'Variable 2 name' });
    await u.clear(name); await u.type(name, ' USER_ID ');
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByTestId('variables-save-issue', {}, WAIT)).toHaveTextContent('Variable names must be unique. Rename or remove the duplicate.');
    expect(requests('PUT', SAVES)).toHaveLength(0);
    expect(name).toHaveValue(' USER_ID ');
    await u.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    await u.click(screen.getByRole('button', { name: 'Save' }));
    dialog = await screen.findByRole('dialog', {}, WAIT);
    expect(within(dialog).getByTestId('variables-save-issue')).toHaveTextContent('Variable names must be unique.');
    expect(requests('PUT', SAVES)).toHaveLength(0);
    const corrected = within(dialog).getByRole('textbox', { name: 'Variable 2 name' });
    await u.clear(corrected); await u.type(corrected, 'LOGIN_PW');
    expect(screen.queryByTestId('variables-save-issue')).toBeNull();
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requests('PUT', SAVES)[0]?.body).toBeTruthy(), WAIT);
    expect(requests('PUT', SAVES)).toHaveLength(1);
    expect((requests('PUT', SAVES)[0].body as TestUpdateRequest).variables).toEqual(readyDraft.variables);
  }, TEST_TIMEOUT_MS);

  it('preserves capability-off secret declarations and original409 conflict/reload behavior for valid saves', async () => {
    setVaultSecrets(false); serveDraft(readyDraft); let current = readyDraft;
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixtureDetail(current))),
      http.put(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json({ error: 'STALE_REVISION', message: 'Reload the newer draft' }, { status: 409 })),
    );
    renderPage(readyDraft.id); await runButton(); await capabilityLoaded(); const u = user();
    await u.click(screen.getByRole('button', { name: 'Variables' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    await u.click(within(dialog).getByRole('button', { name: 'Save' }));
    const conflict = await screen.findByTestId('save-conflict', {}, WAIT);
    expect(conflict).toHaveTextContent(SAVE_CONFLICT_TITLE);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), WAIT);
    await waitFor(() => expect(requests('PUT', SAVES)[0]?.body).toBeTruthy(), WAIT);
    expect((requests('PUT', SAVES)[0].body as TestUpdateRequest).variables).toEqual(readyDraft.variables);
    current = { ...readyDraft, steps: [...readyDraft.steps, 'Wait for the newer public draft'], sourceRevision: readyDraft.sourceRevision + 1 };
    await u.click(within(conflict).getByRole('button', { name: RELOAD_TEST_LABEL }));
    expect(await screen.findByDisplayValue('Wait for the newer public draft', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByTestId('save-conflict')).toBeNull();
    expect(requests('PUT', SAVES)).toHaveLength(1);
    expect(requests('POST', STARTS)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);
});
