import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { http, HttpResponse } from 'msw';
import type { TestDetailDto, TestDto } from '@/types/studio/studioTypes';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail, fixtureStepId, storeAuthoring } from '@/services/mocks/studio/authoringState';
import { learningDraft, needsRelearnDraft, unlearnedDraft } from '@/services/mocks/studio/readinessFixtures';
import { guidedCopy } from '@/components/studio/guided/guidedNarratives';
import {
  UNAUTHENTICATED_REFUSAL,
  failGuidedRequests,
  guidedRequestCount,
  setGuidedLatency,
  setGuidedScenario,
} from '@/services/mocks/studio/guidedHandlers';
import {
  GUIDED_START_REFUSALS,
  PUBLICATION_CONFLICT_SCENARIO,
  guidedError,
  LEARN_SCENARIO,
  endsIn,
  learnWithQuestion,
  loginRequired,
  publicSessionFor,
  refusesStart,
  resultFor,
} from '@/services/mocks/studio/guidedFixtures';
import { resetGuidedSessionRuntime } from '@/components/studio/guided/useGuidedSession';
import { EXECUTION_ERROR_NARRATIVES } from '@/components/studio/run/executionErrorNarratives';
import { guidedSessionStorageKey } from '@/types/studio/studioGuidedTypes';
import { renderStudioAt, type StudioNavHandle } from '@/test/renderStudioAt';
import { uiTestEditorPath } from '@/components/studio/uiTestPaths';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import { clearGuidedSession, setExecuting } from '@/store/slices/studioSlice';
import ChecksStudioPage from './ChecksStudioPage';

/**
 * STUDIO-OBS-008 AC-9 — the guided Run on the real page (lane L5b).
 *
 * Real page, real store, real router, the real `useGuidedSession`, and the MSW guided mirror
 * (`guidedHandlers.ts`, composed into `handlers.ts` at F1), which walks a scenario one session read
 * at a time. Requests are counted at the mock server, never at a spy. The drafts are the readiness
 * fixtures, whose stable step IDs are `fixtureStepId(0..3)` both in `GET /tests/{id}` and in the
 * mirror's session, so "step N" means the same step on both sides.
 *
 * The poll interval is 5 ms here (the page's optional `guidedOptions`), so a whole learning
 * session takes a few hundred milliseconds. Transient states are observed with a mutation recorder
 * rather than by racing the poll.
 *
 * Accessibility follows ADR-SC-006: only flow focus moves (A3, "Go to step N") and visible text are
 * asserted. Nothing here tests a live region, keyboard handling or ARIA beyond MUI defaults.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';
const WAIT = { timeout: 20_000 } as const;
const TEST_TIMEOUT_MS = 60_000;
const GUIDED_OPTIONS = { pollIntervalMs: 5, retryDelayMs: 5 } as const;

const STEP_TEXTS = unlearnedDraft.steps;

const bootstrapHandlers = [
  http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
  http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
];

/** Every request the server saw, in order, with the body of every guided command. */
const observed: Array<{ method: string; path: string; key: string | null; body: unknown }> = [];
function record({ request }: { request: Request }) {
  const entry = {
    method: request.method,
    path: new URL(request.url).pathname,
    key: request.headers.get('Idempotency-Key'),
    body: undefined as unknown,
  };
  observed.push(entry);
  if (request.method === 'POST') {
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
const CANCELS = /\/studio\/guided-sessions\/[^/]+\/cancel$/u;
const CLARIFIES = /\/studio\/guided-sessions\/[^/]+\/clarify$/u;
const EXECUTES = /\/studio\/tests\/[^/]+\/execute$/u;

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
  studioMockServer.resetHandlers();
  resetStudioMocks();
  resetGuidedSessionRuntime();
  for (const draft of [unlearnedDraft, needsRelearnDraft, learningDraft]) {
    store.dispatch(clearGuidedSession({ testId: draft.id }));
  }
  store.dispatch(setExecuting(false));
  window.sessionStorage.clear();
});
afterAll(() => {
  studioMockServer.events.removeListener('request:start', record);
  studioMockServer.close();
});

/** The id of the draft `serveDraft` served last: the first (only) entry of that list, and the route id the editor mounts on. */
let servedId: string = unlearnedDraft.id;

/** Serves one draft as the list and as its single read (optionally with fields the read adds). */
function serveDraft(draft: TestDto, detail: Partial<TestDetailDto> = {}) {
  servedId = draft.id;
  studioMockServer.use(
    ...bootstrapHandlers,
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [draft], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json({ ...fixtureDetail(draft), ...detail })),
  );
}

const StoreProvider = ({ children }: { children?: ReactNode }) => <Provider store={store}>{children}</Provider>;

/** Mounts the editor on the id of the draft the test just served. */
function renderPage(id: string = servedId) {
  return renderStudioAt(id, <ChecksStudioPage guidedOptions={GUIDED_OPTIONS} />, { wrapper: StoreProvider });
}

/** The Run button, once the gate has read the test (its mode is known). */
async function runButton(): Promise<HTMLElement> {
  const control = await screen.findByRole('button', { name: 'Run Test' }, WAIT);
  await waitFor(() => expect(control.getAttribute('data-run-mode')).not.toBe('loading'), WAIT);
  await waitFor(() => expect(control).not.toBeDisabled(), WAIT);
  return control;
}

/** Records every text a guided status line shows, however briefly. */
function recordStatusLines(): { seen: Set<string>; stop: () => void } {
  const seen = new Set<string>();
  const capture = () => {
    for (const node of document.querySelectorAll(
      '[data-testid="guided-run-status-line"], [data-testid="guided-run-status-learning-from"]',
    )) {
      if (node.textContent) seen.add(node.textContent);
    }
  };
  const observer = new MutationObserver(capture);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  capture();
  return { seen, stop: () => observer.disconnect() };
}

async function settle(ms = 60): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const COMPLETED_LEARNED = 'Completed — learned from this run.';

/**
 * The learned receipt above the proof replay (the plan explanation repeats it as history). A published
 * learn hands the screen to its proof replay, so the receipt is the stable end state, not the
 * completion alert (which shows for one render).
 */
async function expectCompletedLearned(): Promise<void> {
  await waitFor(() => {
    // Recorded until the proof snapshot passes, learned after (ADR-SC-008 D5): either is the end state here.
    expect(screen.getByTestId('guided-proof-receipt')).toHaveTextContent(/Recorded from this run|Completed — learned from this run\./u);
  }, WAIT);
}
const user = () => userEvent.setup({ delay: null });

describe('AC-9: first guided Run, through the automatic finalize (AC-2, AC-3, AC-6)', () => {
  it('first guided Run through auto-finalize: one start, one finalize, no execute, "Completed — learned from this run." and the plan as learned', async () => {
    serveDraft(unlearnedDraft);
    renderPage();
    const status = recordStatusLines();
    await user().click(await runButton());

    await expectCompletedLearned();
    status.stop();
    await settle();

    // The start is the capability's exact context, with no hints for an unlearned draft.
    const starts = requests('POST', STARTS);
    expect(starts).toHaveLength(1);
    expect(starts[0].body).toEqual({
      schemaVersion: 3,
      testId: unlearnedDraft.id,
      sourceRevision: String(unlearnedDraft.sourceRevision),
      configurationRevision: String(unlearnedDraft.configurationRevision),
      environmentId: unlearnedDraft.environment,
      versions: { contract: 3 },
    });
    expect(starts[0].key).toBeTruthy();
    // Finalize is a continuation of the Run: exactly once, no confirmation, its own key.
    expect(guidedRequestCount('finalize', { executedOnly: true })).toBe(1);
    const finalizes = requests('POST', /\/finalize$/u);
    expect(finalizes).toHaveLength(1);
    expect(finalizes[0].key).toBeTruthy();
    expect(finalizes[0].key).not.toBe(starts[0].key);
    expect(requests('POST', EXECUTES)).toHaveLength(0);

    // The live copy came from the server's progress, and the finalize said what it was doing.
    expect(status.seen).toContain('Preparing your steps.');
    expect(status.seen).toContain(`Running step 4 of 4.`);
    expect(status.seen).toContain('Saving what this run learned…');

    // The "Steps as learned" card was removed (user decision 2026-11-01): the step list says it.
    expect(screen.queryByTestId('plan-explanation')).toBeNull();
    // Proof = replay of the published revision: the page follows the AFTER_LEARN execution the result
    // names, never executes for it, and shows no learning recording (a published learn has none).
    const sessionId = store.getState().studio.guidedSessionByTestId[unlearnedDraft.id] as string;
    const proofId = store.getState().studio.guidedResultById[sessionId]?.proof?.executionId as string;
    expect(proofId).toBeTruthy();
    expect(requests('GET', /\/guided-sessions\/[^/]+\/video$/u)).toHaveLength(0);
    expect(screen.queryByTestId('guided-attempt')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Seek to step 1' })).toBeNull();
    expect(screen.queryByTestId('video-evidence-player')).toBeNull();
    expect(screen.queryByText(/Secrets can only be typed into a password box/)).toBeNull();
  }, TEST_TIMEOUT_MS);
});

describe('AC-9: NEEDS_RELEARN starts a mixed-mode session (AC-2, AC-3, D-3, D-4)', () => {
  it('NEEDS_RELEARN mixed-mode start: the start names the base and step k, then "Repeating saved steps 1–(k-1)…" and "Learning from step k"', async () => {
    serveDraft(needsRelearnDraft);
    renderPage();
    expect(await screen.findByTestId('guided-readiness-chip', {}, WAIT)).toHaveTextContent(
      'Steps changed — next Run learns from step 2',
    );
    const status = recordStatusLines();
    await user().click(await runButton());
    await waitFor(
      () => expect(screen.getByTestId('guided-proof-receipt')).toHaveTextContent('Completed — steps 2–4 learned again.'),
      WAIT,
    );
    status.stop();

    const starts = requests('POST', STARTS);
    expect(starts).toHaveLength(1);
    expect(starts[0].body).toMatchObject({
      firstLearnStepId: needsRelearnDraft.firstChangedStepId,
    });
    expect(status.seen).toContain('Repeating saved steps 1–1…');
    expect(status.seen).toContain('Learning from step 2');
    expect(requests('POST', EXECUTES)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('D-4 BASE_IDENTITY_INCOMPLETE: the chip says saved learning cannot be reused, Run starts from step 1, and the 409 offers an explicit "Learn again from step 1"', async () => {
    setGuidedScenario(refusesStart('BASE_IDENTITY_INCOMPLETE'), needsRelearnDraft.id);
    serveDraft(needsRelearnDraft, { readinessReason: 'BASE_IDENTITY_INCOMPLETE' });
    renderPage();
    const chip = await screen.findByTestId('guided-readiness-chip', {}, WAIT);
    expect(chip).toHaveTextContent('Saved learning cannot be reused — next Run learns from step 1');
    expect(chip.textContent).not.toMatch(/changed/i);

    await user().click(await runButton());
    const feedback = await screen.findByTestId('guided-start-feedback', {}, WAIT);
    expect(feedback).toHaveTextContent('Saved learning cannot be reused, so this Run has to learn from step 1. Nothing was started.');
    await settle();
    // A refusal is not a session: nothing polls, nothing finalizes, nothing retries on its own.
    expect(requests('POST', STARTS)).toHaveLength(1);
    expect(guidedRequestCount('read')).toBe(0);
    expect(requests('POST', STARTS)[0].body).toMatchObject({
      firstLearnStepId: fixtureStepId(0),
    });

    await user().click(within(feedback).getByRole('button', { name: 'Learn again from step 1' }));
    await waitFor(() => expect(requests('POST', STARTS)).toHaveLength(2), WAIT);
    const [first, second] = requests('POST', STARTS);
    expect(second.body).toEqual(first.body);
    expect(second.key).not.toBe(first.key);
  }, TEST_TIMEOUT_MS);
});

describe('AC-9: one clarification, with an untrusted page-derived label (AC-3)', () => {
  it('one focused clarification incl. an untrusted page-derived label: answered once, then the Run continues to completion', async () => {
    setGuidedScenario(learnWithQuestion('PAGE_CHOICE', 1), unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());

    const question = await screen.findByTestId('guided-clarification', {}, WAIT);
    expect(within(question).getByTestId('guided-question')).toHaveTextContent(
      `Step 2 says: '${STEP_TEXTS[1]}'. Which one did you mean?`,
    );
    const pageLabels = within(question).getAllByTestId('page-derived-label');
    expect(pageLabels.map((label) => label.textContent)).toEqual(['Reference', 'Backup reference']);
    expect(within(question).getAllByText('Page-derived')).toHaveLength(2);
    expect(question.textContent).toContain('role: textbox · region: region-main');

    await user().click(within(question).getAllByRole('radio')[0]);
    await user().click(within(question).getByRole('button', { name: 'Continue' }));
    await expectCompletedLearned();
    await settle();

    const clarifies = requests('POST', CLARIFIES);
    expect(clarifies).toHaveLength(1);
    expect(clarifies[0].body).toMatchObject({ schemaVersion: 3, clarificationId: 'question-1', choiceId: 'choice-1' });
    expect(requests('POST', CANCELS)).toHaveLength(0);
    expect(requests('POST', STARTS)).toHaveLength(1);
  }, TEST_TIMEOUT_MS);
});

describe('AC-9: T0 ruling A3, "None of these" cancels, then focuses step N', () => {
  it('A3 "None of these": exactly one cancel with reason userRequested and no clarify, the existing CANCELLED narrative, then focus on step N', async () => {
    setGuidedScenario(learnWithQuestion('PAGE_CHOICE', 1), unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());

    const question = await screen.findByTestId('guided-clarification', {}, WAIT);
    await user().click(within(question).getByRole('radio', { name: "None of these — I'll edit step 2" }));
    await user().click(within(question).getByRole('button', { name: 'Continue' }));

    // User decision 2026-11-01: this end is "paused to edit", not the Stop text.
    expect(await screen.findByText(guidedCopy('pausedForEditTitle', { N: 2 }), {}, WAIT)).toBeInTheDocument();
    expect(screen.getByTestId('guided-completion')).toHaveTextContent(guidedCopy('pausedForEditBody', { N: 2 }));
    expect(screen.queryByText(EXECUTION_ERROR_NARRATIVES.CANCELLED.title)).toBeNull();
    expect(screen.queryByText(/Someone pressed Stop/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Step 2' })), WAIT);
    await settle();
    const cancels = requests('POST', CANCELS);
    expect(cancels).toHaveLength(1);
    expect(cancels[0].body).toEqual({ schemaVersion: 3, reason: 'userRequested' });
    expect(cancels[0].key).toBeTruthy();
    expect(requests('POST', CLARIFIES)).toHaveLength(0);
    // Never a new session on its own.
    expect(requests('POST', STARTS)).toHaveLength(1);
  }, TEST_TIMEOUT_MS);

  it('the Stop button during the same question still shows the existing CANCELLED text, not the paused-for-edit text', async () => {
    setGuidedScenario(learnWithQuestion('PAGE_CHOICE', 1), unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());

    await screen.findByTestId('guided-clarification', {}, WAIT);
    await user().click(await screen.findByRole('button', { name: 'Stop' }, WAIT));

    expect(await screen.findByText(EXECUTION_ERROR_NARRATIVES.CANCELLED.title, {}, WAIT)).toBeInTheDocument();
    expect(screen.getByTestId('guided-completion')).toHaveTextContent('Someone pressed Stop');
    expect(screen.queryByText(guidedCopy('pausedForEditTitle', { N: 2 }))).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('A3 cancel/expiry race: the server answers with the session already EXPIRED; the page shows that, sends no second cancel, and still moves focus', async () => {
    setGuidedScenario(learnWithQuestion('PAGE_CHOICE', 1), unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    // The race: by the time the cancel arrives the session has expired. The server answers with the
    // session as it is, and every later read says the same.
    const steps = fixtureDetail(unlearnedDraft).steps.map((step) => ({ stepId: step.id, text: step.text }));
    let expiredSession: string | null = null;
    const expired = (sessionId: string) =>
      publicSessionFor({ sessionId, testId: unlearnedDraft.id, state: 'EXPIRED', steps, activeIndex: null, reads: 9 });
    studioMockServer.use(
      http.post(`${STUDIO_BASE}/guided-sessions/:id/cancel`, ({ params }) => {
        expiredSession = String(params.id);
        return HttpResponse.json(expired(expiredSession), { status: 202 });
      }),
      http.get(`${STUDIO_BASE}/guided-sessions/:id`, ({ params }) => {
        if (String(params.id) !== expiredSession) return undefined;
        return HttpResponse.json({ schemaVersion: 3, session: expired(expiredSession), result: null });
      }),
      http.get(`${STUDIO_BASE}/guided-sessions/:id/result`, ({ params }) => {
        if (String(params.id) !== expiredSession) return undefined;
        return HttpResponse.json(
          resultFor({
            sessionId: expiredSession,
            executionId: expiredSession,
            outcome: 'EXPIRED',
            publication: { status: 'REFUSED', receipt: null },
            steps,
            sourceRevision: String(unlearnedDraft.sourceRevision),
            configurationRevision: String(unlearnedDraft.configurationRevision),
            explanation: { completed: 1, reusedBefore: 0, baseRevisionId: null, failedIndex: null },
            errorCode: 'EXPIRED',
            failure: { code: 'EXPIRED' },
            detail: null,
            relearnedFrom: null,
            video: 'UNAVAILABLE',
            timedSteps: 0,
          }),
        );
      }),
    );
    renderPage();
    await user().click(await runButton());

    const question = await screen.findByTestId('guided-clarification', {}, WAIT);
    await user().click(within(question).getByRole('radio', { name: "None of these — I'll edit step 2" }));
    await user().click(within(question).getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText('This run expired before it finished, so it stopped. You will need to Run again.', {}, WAIT),
    ).toBeInTheDocument();
    expect(screen.queryByText(EXECUTION_ERROR_NARRATIVES.CANCELLED.title)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Step 2' })), WAIT);
    await settle(100);
    expect(requests('POST', CANCELS)).toHaveLength(1);
    expect(requests('POST', CLARIFIES)).toHaveLength(0);
    expect(requests('POST', STARTS)).toHaveLength(1);
  }, TEST_TIMEOUT_MS);
});

describe('AC-9: T0 ruling A3 when the cancel does not end the session at once (tech gate L5b, item 1)', () => {
  // The real backend ends the session inside the cancel call and answers with the terminal view
  // (`GuidedSessionService.cancel`, read at the tech gate), so these two cases are the contract's
  // other branches: a 202 whose session is not terminal yet, and a refusal while the session carries
  // on. In both the editor stays locked (its rows are disabled), so focus cannot land yet; it must
  // neither land early nor be lost. It waits for the session's own end, with no second cancel.
  it.each([
    ['answers with a session that is not terminal yet', 'accepted'],
    ['is refused (409) while the session carries on', 'refused'],
  ] as const)(
    'A3 the cancel %s: focus on step N waits for the session to end, then lands; one cancel, no clarify, no new start',
    async (_case, mode) => {
      setGuidedScenario(learnWithQuestion('PAGE_CHOICE', 1), unlearnedDraft.id);
      serveDraft(unlearnedDraft);
      const steps = fixtureDetail(unlearnedDraft).steps.map((step) => ({ stepId: step.id, text: step.text }));
      let cancelledSession: string | null = null;
      let sessionEnded = false;
      const session = (sessionId: string) =>
        publicSessionFor({
          sessionId,
          testId: unlearnedDraft.id,
          state: sessionEnded ? 'CANCELLED' : 'ACTING',
          steps,
          activeIndex: sessionEnded ? null : 1,
          reads: 9,
        });
      studioMockServer.use(
        http.post(`${STUDIO_BASE}/guided-sessions/:id/cancel`, ({ params }) => {
          cancelledSession = String(params.id);
          return mode === 'accepted'
            ? HttpResponse.json(session(cancelledSession), { status: 202 })
            : HttpResponse.json(guidedError('REVISION_CONFLICT'), { status: 409 });
        }),
        http.get(`${STUDIO_BASE}/guided-sessions/:id`, ({ params }) => {
          if (String(params.id) !== cancelledSession) return undefined;
          return HttpResponse.json({ schemaVersion: 3, session: session(cancelledSession), result: null });
        }),
        http.get(`${STUDIO_BASE}/guided-sessions/:id/result`, ({ params }) => {
          if (String(params.id) !== cancelledSession || !sessionEnded) return undefined;
          return HttpResponse.json(
            resultFor({
              sessionId: cancelledSession,
              executionId: cancelledSession,
              outcome: 'CANCELLED',
              publication: { status: 'REFUSED', receipt: null },
              steps,
              sourceRevision: String(unlearnedDraft.sourceRevision),
              configurationRevision: String(unlearnedDraft.configurationRevision),
              explanation: { completed: 1, reusedBefore: 0, baseRevisionId: null, failedIndex: null },
              errorCode: 'CANCELLED',
              failure: { code: 'CANCELLED' },
              detail: null,
              relearnedFrom: null,
              video: 'UNAVAILABLE',
              timedSteps: 0,
            }),
          );
        }),
      );
      renderPage();
      await user().click(await runButton());

      const question = await screen.findByTestId('guided-clarification', {}, WAIT);
      await user().click(within(question).getByRole('radio', { name: "None of these — I'll edit step 2" }));
      await user().click(within(question).getByRole('button', { name: 'Continue' }));
      await waitFor(() => expect(requests('POST', CANCELS)).toHaveLength(1), WAIT);

      // While the session is not over the editor row is locked, and the request has not landed.
      await settle(150);
      const row = screen.getByRole('textbox', { name: 'Step 2' });
      expect(row).toBeDisabled();
      expect(document.activeElement).not.toBe(row);

      // The session ends on its own: the existing CANCELLED narrative, then the focus, once.
      sessionEnded = true;
      expect(await screen.findByText(guidedCopy('pausedForEditTitle', { N: 2 }), {}, WAIT)).toBeInTheDocument();
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Step 2' })), WAIT);
      await settle(100);
      expect(requests('POST', CANCELS)).toHaveLength(1);
      expect(requests('POST', CLARIFIES)).toHaveLength(0);
      expect(requests('POST', STARTS)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );
});

describe('AC-9: blocked by login, both variants, both actions (AC-4)', () => {
  it.each([
    [false, 'This page asks you to sign in. Add login steps before step 1 using your secrets (<secret NAME>), then Run again'],
    [true, 'Your login steps did not sign you in; check the secret and the steps before step 1'],
  ] as const)(
    'blocked-by-login (loginStepsPresent %s): the sentence names step N, "Go to step N" focuses its editor row, "Open Variables" opens the dialog',
    async (loginStepsPresent, sentence) => {
      setGuidedScenario(loginRequired(loginStepsPresent), unlearnedDraft.id);
      serveDraft(unlearnedDraft);
      renderPage();
      await user().click(await runButton());

      const notice = await screen.findByTestId('login-required-notice', {}, WAIT);
      expect(notice.textContent).toContain(sentence);
      await user().click(within(notice).getByRole('button', { name: 'Go to step 1' }));
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Step 1' })), WAIT);

      await user().click(within(notice).getByRole('button', { name: 'Open Variables' }));
      const dialog = await screen.findByRole('dialog', {}, WAIT);
      expect(within(dialog).getByText('Variables')).toBeInTheDocument();
      // No state offers sign-in, account choice, selectors or capture tokens (AC-3).
      expect(document.body.textContent).not.toMatch(/sign in with|choose an account|selector|capture token/i);
      expect(requests('POST', STARTS)).toHaveLength(1);
      expect(guidedRequestCount('finalize')).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});

describe('AC-9: terminal outcomes that are not a success (AC-3)', () => {
  it('unknown outcome (no Run-again): "Stopped — submission outcome unknown." and no Run-again control anywhere', async () => {
    setGuidedScenario(endsIn('UNKNOWN_OUTCOME'), unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());

    const completion = await screen.findByTestId('guided-completion', {}, WAIT);
    expect(completion).toHaveTextContent('Stopped — submission outcome unknown.');
    // W5 UX-05: what the stop means, said once, with no Run-again control.
    expect(completion).toHaveTextContent(guidedCopy('unknownOutcomeConsequence'));
    expect(screen.queryByRole('button', { name: /run again/i })).toBeNull();
    expect(screen.queryByText(COMPLETED_LEARNED)).toBeNull();
    await settle();
    expect(requests('POST', STARTS)).toHaveLength(1);
  }, TEST_TIMEOUT_MS);

  it('publication conflict: "Run completed; steps not ready to repeat.", one finalize and no retry, never shown as learned', async () => {
    setGuidedScenario(PUBLICATION_CONFLICT_SCENARIO, unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());

    expect(await screen.findByText('Run completed; steps not ready to repeat.', {}, WAIT)).toBeInTheDocument();
    await settle(100);
    expect(guidedRequestCount('finalize')).toBe(1);
    expect(screen.queryByText(COMPLETED_LEARNED)).toBeNull();
    expect(requests('POST', EXECUTES)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('BUDGET_EXCEEDED: the session ends with the budget narrative, and nothing starts again on its own', async () => {
    setGuidedScenario(endsIn('FAILED', { failureCode: 'BUDGET_EXCEEDED' }), unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());

    const completion = await screen.findByTestId('guided-completion', {}, WAIT);
    expect(completion).toHaveTextContent('This run reached its learning budget, so Studio stopped it.');
    expect(completion).toHaveTextContent('Nothing starts again on its own.');
    await settle(100);
    expect(requests('POST', STARTS)).toHaveLength(1);
  }, TEST_TIMEOUT_MS);

  it('BUDGET_EXCEEDED start refusal (per CSI): inline feedback with the wait from Retry-After, no session, no poll, no retry', async () => {
    setGuidedScenario(refusesStart('CSI_DAILY_TOKENS_EXHAUSTED'), unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());

    const feedback = await screen.findByTestId('guided-start-feedback', {}, WAIT);
    expect(feedback).toHaveTextContent('The learning budget for this CSI is used up for now, so nothing was started.');
    expect(feedback).toHaveTextContent(/You can Run again in /);
    expect(feedback).toHaveTextContent('Nothing starts again on its own.');
    await settle(100);
    expect(requests('POST', STARTS)).toHaveLength(1);
    expect(guidedRequestCount('read')).toBe(0);
  }, TEST_TIMEOUT_MS);

  it('inherited OBS-014 a: an action-guard POLICY_DENIED gets its own narrative, never the struck secret-fill copy', async () => {
    setGuidedScenario(endsIn('FAILED', { failureCode: 'INVALID_CONTRACT' }), unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    const steps = fixtureDetail(unlearnedDraft).steps.map((step) => ({ stepId: step.id, text: step.text }));
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/guided-sessions/:id/result`, ({ params }) =>
        HttpResponse.json(
          resultFor({
            sessionId: String(params.id),
            executionId: String(params.id),
            outcome: 'FAILED',
            publication: { status: 'REFUSED', receipt: null },
            steps,
            sourceRevision: String(unlearnedDraft.sourceRevision),
            configurationRevision: String(unlearnedDraft.configurationRevision),
            explanation: { completed: 1, reusedBefore: 0, baseRevisionId: null, failedIndex: 1 },
            errorCode: 'POLICY_DENIED',
            failure: null,
            detail: null,
            relearnedFrom: null,
            video: 'UNAVAILABLE',
            timedSteps: 0,
          }),
        ),
      ),
    );
    renderPage();
    await user().click(await runButton());

    const completion = await screen.findByTestId('guided-completion', {}, WAIT);
    expect(completion).toHaveAttribute('data-kind', 'policyDenied');
    expect(completion).toHaveTextContent('This action could not be run.');
    expect(completion).toHaveTextContent('Studio stopped this run because an action did not match the step wording.');
    expect(document.body.textContent).not.toMatch(/Secrets can only be typed into a password box/);
  }, TEST_TIMEOUT_MS);

  it('ruling A2 negative: an INVALID_CONTRACT result at a known step gets the FIX-38 narrative and never "Secrets can only be typed into a password box."', async () => {
    setGuidedScenario(endsIn('FAILED', { failureCode: 'INVALID_CONTRACT' }), unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());

    const completion = await screen.findByTestId('guided-completion', {}, WAIT);
    expect(completion).toHaveAttribute('data-kind', 'stepNotResolved');
    expect(completion).toHaveTextContent(/Studio couldn't work out step \d+/);
    expect(within(completion).getByTestId('guided-completion-code')).toHaveTextContent('INVALID_CONTRACT');
    expect(document.body.textContent).not.toMatch(/Secrets can only be typed into a password box/);
  }, TEST_TIMEOUT_MS);
});

describe('AC-9: terminal failures on a step with authored text', () => {
  /** A draft whose second step asserts an authored literal, known to the page and to the mirror alike. */
  const LITERAL_STEPS = [
    { id: fixtureStepId(0), text: 'Go to "https://shop.example.test/orders"' },
    { id: fixtureStepId(1), text: 'Check the heading says Order confirmed' },
  ];
  function serveLiteralDraft() {
    storeAuthoring(unlearnedDraft.id, { authoringSchemaVersion: 2, steps: LITERAL_STEPS });
    serveDraft(unlearnedDraft, { steps: LITERAL_STEPS });
  }
  /**
   * STUDIO-UNIFY-001.6 AC-01. The mirror's explanation proves step 2 (step 1 completed, step 2 has the
   * failed action), and the page passes its draft, whose `sourceRevision` is the result's, so the
   * authored sentence of step 2 is quoted too.
   */
  const STOPPED_AT_STEP_2 = guidedCopy('stoppedAtStepWithText', { N: 2, text: LITERAL_STEPS[1].text });

  it('a target-not-found outcome shows the generic failure and the returned code', async () => {
    setGuidedScenario(endsIn('FAILED', { atStepIndex: 1, failureCode: 'TARGET_MISMATCH' }), unlearnedDraft.id);
    serveLiteralDraft();
    renderPage();
    await user().click(await runButton());

    const completion = await screen.findByTestId('guided-completion', {}, WAIT);
    expect(completion).toHaveAttribute('data-kind', 'failedUnnamed');
    expect(within(completion).getByTestId('guided-completion-code')).toHaveTextContent('TARGET_MISMATCH');
    expect(completion.textContent).toBe(
      `${guidedCopy('failedUnnamed')}${STOPPED_AT_STEP_2}TARGET_MISMATCH`,
    );
  }, TEST_TIMEOUT_MS);

  it.each([
    {
      failureCode: 'AMBIGUOUS_TARGET',
      kind: 'failedUnnamed',
      message: () => `${guidedCopy('failedUnnamed')}${STOPPED_AT_STEP_2}AMBIGUOUS_TARGET`,
    },
    {
      failureCode: 'ASSERTION_FAILED',
      kind: 'failed',
      message: () => `${guidedCopy('assertionFailed')}${STOPPED_AT_STEP_2}`,
    },
  ] as const)(
    '$failureCode keeps its appropriate failure narrative',
    async ({ failureCode, kind, message }) => {
      setGuidedScenario(endsIn('FAILED', { atStepIndex: 1, failureCode }), unlearnedDraft.id);
      serveLiteralDraft();
      renderPage();
      await user().click(await runButton());

      const completion = await screen.findByTestId('guided-completion', {}, WAIT);
      expect(completion).toHaveAttribute('data-kind', kind);
      expect(completion.textContent).toBe(message());
    },
    TEST_TIMEOUT_MS,
  );
});

describe('STUDIO-UNIFY-001.6: a failed learn is marked in the editor, told in Logs, and left as a trace (AC-02, AC-03, AC-04)', () => {
  const LITERAL_STEPS = [
    { id: fixtureStepId(0), text: 'Go to "https://shop.example.test/orders"' },
    { id: fixtureStepId(1), text: 'Check the heading says Order confirmed' },
  ];
  function serveLiteralDraft() {
    storeAuthoring(unlearnedDraft.id, { authoringSchemaVersion: 2, steps: LITERAL_STEPS });
    serveDraft(unlearnedDraft, { steps: LITERAL_STEPS });
  }
  const rowOf = (n: number) => screen.getByRole('textbox', { name: `Step ${n}` }).closest('li') as HTMLElement;
  const marker = 'ErrorIcon';

  /** Runs the literal draft to an ASSERTION_FAILED stop at step 2 and waits for the outcome. */
  async function runToFailure() {
    setGuidedScenario(endsIn('FAILED', { atStepIndex: 1, failureCode: 'ASSERTION_FAILED' }), unlearnedDraft.id);
    serveLiteralDraft();
    renderPage();
    await user().click(await runButton());
    await waitFor(() => expect(screen.getByTestId('guided-completion')).toHaveAttribute('data-kind', 'failed'), WAIT);
  }

  it('marks only the stopped step in the editor, and no step before it', async () => {
    await runToFailure();

    expect(within(rowOf(2)).getByTestId(marker)).toBeInTheDocument();
    expect(within(rowOf(1)).queryByTestId(marker)).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('the marker belongs to the step, not to its position: moving the step moves the marker', async () => {
    await runToFailure();

    await user().click(screen.getByRole('button', { name: 'Actions for step 2' }));
    await user().click(await screen.findByRole('menuitem', { name: 'Move up' }));
    expect(within(rowOf(1)).getByTestId(marker)).toBeInTheDocument();
    expect(within(rowOf(2)).queryByTestId(marker)).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('a step removed from the editor leaves nothing marked', async () => {
    await runToFailure();

    await user().click(screen.getByRole('button', { name: 'Actions for step 2' }));
    await user().click(await screen.findByRole('menuitem', { name: 'Delete step' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Step 2' })).toBeNull(), WAIT);
    // The editor rows only: Proof's step list keeps the run's own record of the failed step.
    for (const field of screen.getAllByRole('textbox', { name: /^Step \d+$/ })) {
      expect(within(field.closest('li') as HTMLElement).queryByTestId(marker)).toBeNull();
    }
  }, TEST_TIMEOUT_MS);

  it('the marker is gone when the next Run learns the test', async () => {
    await runToFailure();
    expect(within(rowOf(2)).getByTestId(marker)).toBeInTheDocument();

    setGuidedScenario(LEARN_SCENARIO, unlearnedDraft.id);
    await user().click(await runButton());
    await expectCompletedLearned();
    expect(screen.queryByTestId(marker)).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('the Logs tab lists each action by step with its outcome, then how learning ended', async () => {
    await runToFailure();

    await user().click(screen.getByRole('tab', { name: 'Logs' }));
    const log = screen.getByTestId('guided-learning-log');
    expect(within(log).getAllByTestId('guided-learning-log-line').map((line) => line.textContent)).toEqual([
      'Step 1: Ran the step — done',
      'Step 2: Ran the step — failed',
      `Learning ended: ${guidedCopy('assertionFailed')}`,
    ]);
    expect(screen.queryByText('No logs are available.')).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('a learn that succeeds reads in the Logs tab too, and ends with the learned sentence', async () => {
    setGuidedScenario(LEARN_SCENARIO, unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());
    await expectCompletedLearned();

    await user().click(screen.getByRole('tab', { name: 'Logs' }));
    const lines = within(screen.getByTestId('guided-learning-log'))
      .getAllByTestId('guided-learning-log-line')
      .map((line) => line.textContent);
    expect(lines[lines.length - 1]).toBe('Learning ended: Recorded from this run.');
  }, TEST_TIMEOUT_MS);

  it('leaves a trace after the learn: "Last learning attempt failed (…, at step 2)", read once more when the session ends', async () => {
    await runToFailure();

    const note = await screen.findByTestId('last-learning-attempt', {}, WAIT);
    expect(note.textContent).toMatch(/^Last learning attempt failed \(.+, at step 2\)$/u);
    // One read when the editor opened (nothing yet) and one when the session ended; no polling.
    expect(guidedRequestCount('latest')).toBe(2);
    await settle(150);
    expect(guidedRequestCount('latest')).toBe(2);
  }, TEST_TIMEOUT_MS);

  it('the line is gone after a later learn that succeeds', async () => {
    await runToFailure();
    await screen.findByTestId('last-learning-attempt', {}, WAIT);

    setGuidedScenario(LEARN_SCENARIO, unlearnedDraft.id);
    await user().click(await runButton());
    await expectCompletedLearned();
    await waitFor(() => expect(screen.queryByTestId('last-learning-attempt')).toBeNull(), WAIT);
  }, TEST_TIMEOUT_MS);
});

describe('AC-9: terminal failures before an action is admitted', () => {
  const BUDGET_SENTENCE = 'This run reached its learning budget, so Studio stopped it.';
  const LITERAL_STEPS = [
    { id: fixtureStepId(0), text: 'Go to "https://shop.example.test/orders"' },
    { id: fixtureStepId(1), text: 'Check the heading says Order confirmed' },
  ];

  /**
   * The session ends by the mirror (any FAILED), and the result is the one the backend sends: the
   * `errorCode` alone, `failure` and `detail` null, and step 2 with no admitted action (`failedIndex: null`).
   * `endsIn` is not used for the result because it adds `failure` and a FAILED action.
   */
  function serveBackendShapedFailure(errorCode: string, steps: ReadonlyArray<{ id: string; text: string }>) {
    storeAuthoring(unlearnedDraft.id, { authoringSchemaVersion: 2, steps: [...steps] });
    setGuidedScenario(endsIn('FAILED', { failureCode: 'INVALID_CONTRACT' }), unlearnedDraft.id);
    serveDraft(unlearnedDraft, { steps: [...steps] });
    const refs = steps.map((step) => ({ stepId: step.id, text: step.text }));
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/guided-sessions/:id/result`, ({ params }) =>
        HttpResponse.json(
          resultFor({
            sessionId: String(params.id),
            executionId: String(params.id),
            outcome: 'FAILED',
            publication: { status: 'REFUSED', receipt: null },
            steps: refs,
            sourceRevision: String(unlearnedDraft.sourceRevision),
            configurationRevision: String(unlearnedDraft.configurationRevision),
            explanation: { completed: 1, reusedBefore: 0, baseRevisionId: null, failedIndex: null },
            errorCode,
            failure: null,
            detail: null,
            relearnedFrom: null,
            video: 'UNAVAILABLE',
            timedSteps: 0,
          }),
        ),
      ),
    );
  }

  it('a BUDGET_EXCEEDED stop shows the budget sentence and states that nothing restarts automatically', async () => {
    serveBackendShapedFailure('BUDGET_EXCEEDED', LITERAL_STEPS);
    renderPage();
    await user().click(await runButton());

    const completion = await screen.findByTestId('guided-completion', {}, WAIT);
    expect(completion).toHaveAttribute('data-kind', 'failed');
    // Step 1 completed and step 2 has no admitted action: the explanation proves the stop at step 2
    // (STUDIO-UNIFY-001.6 AC-01), with its authored sentence and the hedged next step, before the
    // "nothing starts again" line.
    expect(completion.textContent).toBe(
      `${BUDGET_SENTENCE}${guidedCopy('stoppedAtStepWithText', { N: 2, text: LITERAL_STEPS[1].text })}${guidedCopy('budgetNextStep', { N: 2 })}${guidedCopy('nothingStartsOnItsOwn')}`,
    );
  }, TEST_TIMEOUT_MS);

  it('RUNTIME_INCOMPATIBLE shows the generic failure and the returned code', async () => {
    serveBackendShapedFailure('RUNTIME_INCOMPATIBLE', LITERAL_STEPS);
    renderPage();
    await user().click(await runButton());

    const completion = await screen.findByTestId('guided-completion', {}, WAIT);
    expect(completion).toHaveAttribute('data-kind', 'failedUnnamed');
    expect(within(completion).getByTestId('guided-completion-code')).toHaveTextContent('RUNTIME_INCOMPATIBLE');
    expect(completion.textContent).toBe(
      `${guidedCopy('failedUnnamed')}${guidedCopy('stoppedAtStepWithText', { N: 2, text: LITERAL_STEPS[1].text })}RUNTIME_INCOMPATIBLE`,
    );
  }, TEST_TIMEOUT_MS);
});

describe('AC-2 / ADR-SC-006: the server says LEARNING but this page follows no session (L5b-F1)', () => {
  it('LEARNING elsewhere: Run is disabled and the state and its consequence are stated beside it; nothing is sent', async () => {
    serveDraft(learningDraft);
    renderPage();
    const control = await screen.findByRole('button', { name: 'Run Test' }, WAIT);
    await waitFor(() => expect(control.getAttribute('data-run-mode')).toBe('busy'), WAIT);
    expect(control).toBeDisabled();
    expect(await screen.findByTestId('run-learning-elsewhere', {}, WAIT)).toHaveTextContent(
      guidedCopy('learningElsewhere'),
    );
    await settle(100);
    expect(requests('POST', STARTS)).toHaveLength(0);
    expect(requests('POST', EXECUTES)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);
});

describe('AC-2 / ADR-SC-006: a stored session whose read is refused (tech gate L5b F-L5b-3, L5b-F2; W5-1)', () => {
  /**
   * Dex's probe: the tab holds a pointer to a session (a Run already started here), and reading that
   * session is refused with 400 or 409. W5-1 (ruling `w5-unreadable-and-alias.md` section 2): the
   * pointer is kept and nothing starts while readiness cannot prove the session dead; a fresh
   * `GET /tests/{id}`, sent after the refusal, that answers `UNLEARNED` or `NEEDS_RELEARN` proves it,
   * and only then is the pointer dropped. Nothing starts on its own either way.
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

  /** One `GET /tests/{id}` the server answered for the draft under test. */
  interface ReadEntry {
    readonly afterRefusal: boolean;
    readonly pointerKept: boolean;
  }
  interface FlipHarness {
    /** Set when the refused session read has been answered: every later readiness read is "after". */
    refusedAnswered: boolean;
    /** What a readiness read answers once the refusal was answered: `null` is the draft's own readiness. */
    after: TestDto['readiness'] | 'unavailable' | null;
    readonly reads: ReadEntry[];
  }

  /**
   * The readiness flip: a refused session read that answers after 300 ms, and a `GET /tests/{id}`
   * that says `LEARNING` (or the draft's own readiness, `before: 'own'`) until the refusal was
   * answered, and the draft's own readiness after. So "decided after the refusal" is observable: a
   * client that decided from the gate's mount read, or from the list, would decide differently.
   * The list (`GET /tests`) stays as `serveDraft` serves it.
   */
  function serveFlip(
    draft: TestDto,
    refusal: { status: number; body: unknown },
    options: { before?: 'learning' | 'own'; checkDelayMs?: number } = {},
  ): FlipHarness {
    const harness: FlipHarness = { refusedAnswered: false, after: null, reads: [] };
    serveDraft(draft);
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/guided-sessions/:id`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        harness.refusedAnswered = true;
        return HttpResponse.json(refusal.body as Record<string, unknown>, { status: refusal.status });
      }),
      http.get(`${STUDIO_BASE}/tests/:id`, async ({ params }) => {
        if (String(params.id) !== draft.id) return undefined;
        harness.reads.push({ afterRefusal: harness.refusedAnswered, pointerKept: storedPointer(draft) !== null });
        if (!harness.refusedAnswered) {
          const readiness = options.before === 'own' ? draft.readiness : 'LEARNING';
          return HttpResponse.json({ ...fixtureDetail(draft), readiness });
        }
        if (options.checkDelayMs) await new Promise((resolve) => setTimeout(resolve, options.checkDelayMs));
        if (harness.after === 'unavailable') {
          return HttpResponse.json({ error: 'UNAVAILABLE', message: 'down' }, { status: 503 });
        }
        return HttpResponse.json({ ...fixtureDetail(draft), readiness: harness.after ?? draft.readiness });
      }),
    );
    return harness;
  }
  const readsAfterRefusal = (harness: FlipHarness) => harness.reads.filter((entry) => entry.afterRefusal);

  it.each([
    ['400', 'unlearnedDraft', { status: 400, body: guidedError('INVALID_CONTRACT') }, unlearnedDraft, 'learn'],
    ['409', 'unlearnedDraft', { status: 409, body: guidedError('REVISION_CONFLICT') }, unlearnedDraft, 'learn'],
    ['400', 'needsRelearnDraft', { status: 400, body: guidedError('INVALID_CONTRACT') }, needsRelearnDraft, 'relearn'],
    ['409', 'needsRelearnDraft', { status: 409, body: guidedError('REVISION_CONFLICT') }, needsRelearnDraft, 'relearn'],
  ] as const)(
    'W5-1 T2: read refused with %s on %s: the readiness read after the refusal drops the pointer; Run learns on press with a new key',
    async (_status, _name, refusal, draft, mode) => {
      const harness = serveFlip(draft, refusal);
      storePointer(draft, 'guided-session-probe');
      renderPage();

      // The pointer is dropped by the readiness read made after the refusal, not before it.
      await waitFor(() => expect(storedPointer(draft)).toBeNull(), WAIT);
      expect(readsAfterRefusal(harness).length).toBeGreaterThanOrEqual(1);
      expect(readsAfterRefusal(harness)[0].pointerKept).toBe(true);
      const control = await runButton();
      expect(control.getAttribute('data-run-mode')).toBe(mode);
      expect(screen.queryByTestId('run-session-unreadable')).toBeNull();
      // Nothing starts on its own.
      await settle(100);
      expect(requests('POST', STARTS)).toHaveLength(0);

      await user().click(control);
      await waitFor(() => expect(requests('POST', STARTS)).toHaveLength(1), WAIT);
      const [start] = requests('POST', STARTS);
      expect(start.key).toBeTruthy();
      expect(start.key).not.toBe('start-key-probe');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'W5-1 T3: LEARNING keeps the pointer, Run off and the caption; Refresh re-checks once and drops it when readiness has moved',
    async () => {
      const harness = serveFlip(learningDraft, { status: 409, body: guidedError('REVISION_CONFLICT') });
      storePointer(learningDraft, 'guided-session-probe');
      renderPage();

      const notice = await screen.findByTestId('run-session-unreadable', {}, WAIT);
      expect(notice).toHaveTextContent(guidedCopy('sessionUnreadable'));
      await waitFor(() => expect(readsAfterRefusal(harness)).toHaveLength(1), WAIT);
      await settle(150);
      // LEARNING does not prove the session dead: the pointer is kept, Run is off, nothing starts.
      expect(storedPointer(learningDraft)).not.toBeNull();
      const control = screen.getByRole('button', { name: 'Run Test' });
      expect(control.getAttribute('data-run-mode')).toBe('busy');
      expect(control).toBeDisabled();
      expect(requests('POST', STARTS)).toHaveLength(0);
      // One check on the transition to unreadable, no timer and no poll.
      expect(readsAfterRefusal(harness)).toHaveLength(1);

      // Readiness moves on (the list stays LEARNING): Refresh re-checks once.
      harness.after = 'UNLEARNED';
      const before = harness.reads.length;
      await user().click(screen.getByRole('button', { name: 'Refresh test information' }));
      await waitFor(() => expect(storedPointer(learningDraft)).toBeNull(), WAIT);
      // Exactly one readiness check before the pointer dropped, then the gate's one re-read.
      await waitFor(() => expect(harness.reads.length - before).toBe(2), WAIT);
      expect(harness.reads.slice(before).map((entry) => entry.pointerKept)).toEqual([true, false]);
      await settle(300);
      expect(harness.reads.length - before).toBe(2);

      const after = await runButton();
      expect(after.getAttribute('data-run-mode')).toBe('learn');
      expect(screen.queryByTestId('run-session-unreadable')).toBeNull();
      expect(requests('POST', STARTS)).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'W5-1 T4: a readiness read that fails (503) keeps the pointer, Run off and the caption; one check, no retry of its own',
    async () => {
      const harness = serveFlip(unlearnedDraft, { status: 409, body: guidedError('REVISION_CONFLICT') }, { before: 'own' });
      harness.after = 'unavailable';
      storePointer(unlearnedDraft, 'guided-session-probe');
      renderPage();

      await screen.findByTestId('run-session-unreadable', {}, WAIT);
      // One `getTest` call; `apiClient` retries a 5xx GET twice (`apiClient.ts:97-108`), so 3 attempts.
      await waitFor(() => expect(readsAfterRefusal(harness)).toHaveLength(3), WAIT);
      await settle(1500);
      expect(readsAfterRefusal(harness)).toHaveLength(3);
      expect(storedPointer(unlearnedDraft)).not.toBeNull();
      const control = screen.getByRole('button', { name: 'Run Test' });
      expect(control.getAttribute('data-run-mode')).toBe('learn');
      expect(control).toBeDisabled();
      expect(screen.getByTestId('run-session-unreadable')).toHaveTextContent(guidedCopy('sessionUnreadable'));
      expect(requests('POST', STARTS)).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'W5-1 T6: a readiness answer that arrives after the author switched tests changes nothing',
    async () => {
      let refusedAnswered = false;
      let checks = 0;
      studioMockServer.use(
        ...bootstrapHandlers,
        http.get(`${STUDIO_BASE}/tests`, () =>
          HttpResponse.json({ data: [unlearnedDraft, needsRelearnDraft], page: 0, size: 20, totalElements: 2, totalPages: 1 }),
        ),
        http.get(`${STUDIO_BASE}/guided-sessions/:id`, async () => {
          // Answers after the page's own first reads of the test, so every later read is "after".
          await new Promise((resolve) => setTimeout(resolve, 300));
          refusedAnswered = true;
          return HttpResponse.json(guidedError('REVISION_CONFLICT'), { status: 409 });
        }),
        http.get(`${STUDIO_BASE}/tests/:id`, async ({ params }) => {
          const id = String(params.id);
          const draft = id === needsRelearnDraft.id ? needsRelearnDraft : unlearnedDraft;
          if (id === unlearnedDraft.id && refusedAnswered) {
            // The readiness check for the followed session: it answers UNLEARNED, but late.
            checks += 1;
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          return HttpResponse.json(fixtureDetail(draft));
        }),
      );
      storePointer(unlearnedDraft, 'guided-session-probe');
      const pointerBefore = storedPointer(unlearnedDraft);
      expect(pointerBefore).not.toBeNull();

      const nav: StudioNavHandle = { go: null };
      renderStudioAt(unlearnedDraft.id, <ChecksStudioPage guidedOptions={GUIDED_OPTIONS} />, {
        navHandle: nav,
        wrapper: StoreProvider,
      });

      // The check is in flight (it was sent after the refusal); the author switches tests before it answers.
      await waitFor(() => expect(checks).toBe(1), WAIT);
      await act(async () => {
        nav.go?.(uiTestEditorPath(needsRelearnDraft.id));
      });
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'Step 2' })).toBeInTheDocument(), WAIT);
      await settle(800);
      // The late UNLEARNED answer belongs to a test that is no longer selected: nothing changed.
      expect(storedPointer(unlearnedDraft)).toBe(pointerBefore);
      expect(checks).toBe(1);
      expect(requests('POST', STARTS)).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );
});

describe('W5 UX-02: a guided Run is shown on the Proof tab', () => {
  const tab = (name: 'Proof' | 'Logs') => screen.getByRole('tab', { name });

  it('a guided start selects the Proof tab when Logs was open', async () => {
    serveDraft(unlearnedDraft);
    renderPage();
    const control = await runButton();
    await user().click(tab('Logs'));
    expect(tab('Logs')).toHaveAttribute('aria-selected', 'true');

    await user().click(control);
    await screen.findByTestId('guided-run', {}, WAIT);
    expect(tab('Proof')).toHaveAttribute('aria-selected', 'true');
    expect(document.getElementById('studio-panel-proof')).not.toHaveAttribute('hidden');
    await expectCompletedLearned();
  }, TEST_TIMEOUT_MS);

  it('a question that arrives while Logs is open selects the Proof tab', async () => {
    setGuidedLatency('clarification', 1500);
    setGuidedScenario(learnWithQuestion('PAGE_CHOICE', 2), unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());
    await screen.findByTestId('guided-run', {}, WAIT);

    // The author looks at the logs while Studio works; the question has not arrived yet.
    await user().click(tab('Logs'));
    expect(tab('Logs')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('guided-clarification')).toBeNull();

    await screen.findByTestId('guided-clarification', {}, WAIT);
    await waitFor(() => expect(tab('Proof')).toHaveAttribute('aria-selected', 'true'), WAIT);
    expect(document.getElementById('studio-panel-proof')).not.toHaveAttribute('hidden');
  }, TEST_TIMEOUT_MS);
});

describe('AC-2: a finalize the server does not accept is not ready, never published', () => {
  it.each([
    ['rejected validation (409)', () => ({ status: 409, body: guidedError('REVISION_CONFLICT') }), 1, 'NOT_READY'],
    ['unavailable Core (503)', () => GUIDED_START_REFUSALS.UNAVAILABLE(), 3, 'NOT_READY'],
    // Tech gate L5b: a persistent 401 is sent once, not once per poll (each 401 asks the platform to
    // sign the person in again). E2E-012: its sentence says the sign-in ended; Try again resends.
    ['an expired sign-in (401)', () => UNAUTHENTICATED_REFUSAL(), 1, 'REAUTHENTICATION_REQUIRED'],
  ] as const)(
    'finalize refused by %s: the Run says it is held, never "Completed", and finalize is not sent again on its own',
    async (_case, refusal, attempts, pendingKind) => {
      failGuidedRequests('finalize', refusal(), { times: 10 });
      serveDraft(unlearnedDraft);
      renderPage();
      await user().click(await runButton());

      const pending = await screen.findByTestId('guided-pending', {}, WAIT);
      expect(pending).toHaveTextContent(
        pendingKind === 'REAUTHENTICATION_REQUIRED'
          ? guidedCopy('signInToFinish')
          : 'Steps not ready to repeat.',
      );
      expect(pending).toHaveAttribute('data-pending', pendingKind);
      expect(within(pending).getByTestId('guided-finalize-retry')).toHaveTextContent('Try again');
      await waitFor(() => expect(guidedRequestCount('finalize')).toBe(attempts), WAIT);
      await settle(150);
      expect(guidedRequestCount('finalize')).toBe(attempts);
      expect(screen.queryByText(COMPLETED_LEARNED)).toBeNull();
      expect(screen.queryByTestId('guided-completion')).toBeNull();
      // W5 UX-16: a held finalize says "Steps not ready to repeat." and no longer "Saving…" beside it.
      expect(screen.queryByText(guidedCopy('finalizing'))).toBeNull();
      expect(requests('POST', STARTS)).toHaveLength(1);
      // Every finalize attempt reuses the one stable key.
      expect(new Set(requests('POST', /\/finalize$/u).map((entry) => entry.key)).size).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );
});

describe('E2E-012: a finalize held by an ended sign-in can be sent again', () => {
  it('a single 401 on finalize says to sign in again; Try again sends finalize under the same key and the Run completes', async () => {
    failGuidedRequests('finalize', UNAUTHENTICATED_REFUSAL(), { times: 1 });
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());

    const pending = await screen.findByTestId('guided-pending', {}, WAIT);
    expect(pending).toHaveTextContent(guidedCopy('signInToFinish'));
    await waitFor(() => expect(guidedRequestCount('finalize')).toBe(1), WAIT);

    await user().click(within(pending).getByTestId('guided-finalize-retry'));

    await expectCompletedLearned();
    expect(screen.queryByTestId('guided-pending')).toBeNull();
    expect(guidedRequestCount('finalize')).toBe(2);
    expect(new Set(requests('POST', /\/finalize$/u).map((entry) => entry.key)).size).toBe(1);
  }, TEST_TIMEOUT_MS);
});

describe('AC-9: reconnect without double-submit (AC-2)', () => {
  it('reconnect without double-submit: a reload mid-session resumes by GET only, then finalizes once', async () => {
    setGuidedScenario(learnWithQuestion('PAGE_CHOICE', 1), unlearnedDraft.id);
    serveDraft(unlearnedDraft);
    const first = renderPage();
    await user().click(await runButton());
    await screen.findByTestId('guided-clarification', {}, WAIT);
    expect(requests('POST', STARTS)).toHaveLength(1);

    // A reload: the page and its memory are gone; only the sessionStorage pointer survives.
    first.unmount();
    resetGuidedSessionRuntime();
    store.dispatch(clearGuidedSession({ testId: unlearnedDraft.id }));
    const pointer = JSON.parse(window.sessionStorage.getItem(guidedSessionStorageKey(unlearnedDraft.id)) ?? 'null');
    expect(pointer?.sessionId).toBeTruthy();

    renderPage();
    const question = await screen.findByTestId('guided-clarification', {}, WAIT);
    await user().click(within(question).getAllByRole('radio')[0]);
    await user().click(within(question).getByRole('button', { name: 'Continue' }));
    await expectCompletedLearned();
    await settle(100);

    expect(requests('POST', STARTS)).toHaveLength(1);
    expect(requests('POST', CLARIFIES)).toHaveLength(1);
    expect(guidedRequestCount('finalize')).toBe(1);
    expect(requests('POST', EXECUTES)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('never-echo canary (P6 pointer): the only browser-held guided state is IDs, keys and the closed start body', async () => {
    serveDraft(unlearnedDraft);
    renderPage();
    await user().click(await runButton());
    await expectCompletedLearned();

    const raw = window.sessionStorage.getItem(guidedSessionStorageKey(unlearnedDraft.id)) ?? '';
    const pointer = JSON.parse(raw);
    expect(Object.keys(pointer).sort()).toEqual(['finalizeKey', 'sessionId', 'startKey', 'startRequest', 'testId']);
    // No authored text, variable value or secret reference value is held in the browser.
    for (const text of STEP_TEXTS) expect(raw).not.toContain(text);
    expect(raw).not.toContain('pilot-user');
    expect(raw).not.toContain('LOGIN_PW');
    expect(Object.keys(window.localStorage).filter((key) => key !== 'studio:coachStep')).toEqual([]);
  }, TEST_TIMEOUT_MS);
});
