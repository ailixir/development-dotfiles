import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';
import type { RecordedRequest } from './mswProxy';

/**
 * The first browser E2E of the guided authoring flow (STUDIO-OBS-008 AC-9, GA plan H-2).
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT. It runs in the `msw` project only (the file name has no
 * `-real-backend` suffix): the real Vite app in Chromium, calling `/api/v1/**` through the real
 * `apiClient`, answered by the MSW handlers in the Node proxy `e2e/mswProxy.ts`. It proves the page
 * against the mocks. It is NOT evidence of live integration, and nothing here may be cited as such:
 * live proof is STUDIO-OBS-009. The recorded request counts are the proxy's, i.e. the mocks' view
 * of what the page sent.
 *
 * Accessibility is out of scope (ADR-SC-006): no axe, no screen-reader or keyboard-shortcut
 * assertions. The only focus assertions are the ones the flow itself requires ("None of these" and
 * "Go to step N" move focus to that step's editor row).
 *
 * PROXY SCENARIOS. `default` is a plain full-learn script (no question, no login failure). The flows
 * below that need a different guided script select a named scenario that `e2e/mswProxy.ts`
 * registers (each one sets the process-global guided script right after the mock reset):
 *
 *   guided-clarification-page                 learnWithQuestion('PAGE_CHOICE', 1)
 *   guided-login-required-no-login-steps      loginRequired(false)
 *   guided-login-required-login-steps-failed  loginRequired(true)
 *
 * `selectScenario` still fails a test, naming the scenario, if the proxy does not know it; it never skips.
 *
 * Selectors use roles, labels and the visible copy from `guidedNarratives.ts`. A handful depend on
 * the page as lane L5b integrates it; they were reconciled in W4 against the running page (the lane L6
 * receipt lists them) and keep their `RECONCILE(W4)` markers so a later page change finds them.
 * No fixed sleeps: Playwright auto-waiting and `expect.poll` only. The mock session advances one
 * script step per poll read and the hook polls once a second, so a full learn takes about ten to
 * twenty seconds; the tests that run one set their own timeout.
 */

const apiPort = Number(process.env.CHECKS_E2E_API_PORT ?? 4178);
const PROXY = `http://127.0.0.1:${apiPort}`;

const GUIDED = '/api/v1/studio/guided-sessions';
const STUDIO = '/api/v1/studio/';

/** Fixture drafts of the `default` scenario (`demoFixtures.ts`, `readinessFixtures.ts`). */
const UNLEARNED_ID = 'd0000000-0000-4000-8000-000000000003'; // 'Password reset email', 3 steps, no revision
const READY_ID = 'd0000000-0000-4000-8000-000000000001'; // 'Login – happy path', READY
const NEEDS_RELEARN_ID = 'a0000000-0000-0000-0000-000000000004'; // 4 steps, firstChangedStepId = step 2

const UNLEARNED_STEPS = [
  'Go to "https://www.citi.com/reset"',
  'Fill "Email" with "pilot@example.com"',
  'Click "Send"',
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Visible copy, from frontend/src/components/studio/guided/guidedNarratives.ts (L5a, source-cited).
const EM = '—';
const EN = '–';
const ELLIPSIS = '…';
const COPY = {
  preparing: 'Preparing your steps.',
  understanding: (n: number, m: number) => `Understanding this page ${EM} step ${n} of ${m}.`,
  running: (n: number, m: number) => `Running step ${n} of ${m}.`,
  repeatingPrefix: (last: number) => `Repeating saved steps 1${EN}${last}${ELLIPSIS}`,
  learningFrom: (k: number) => `Learning from step ${k}`,
  finalizing: `Saving what this run learned${ELLIPSIS}`,
  completedLearned: `Completed ${EM} learned from this run.`,
  completedPartial: (k: number, n: number) => `Completed ${EM} steps ${k}${EN}${n} learned again.`,
  question: (n: number, text: string) => `Step ${n} says: '${text}'. Which one did you mean?`,
  noneOfThese: /^None of these/,
  needsRelearnChip: (k: number) => `Steps changed ${EM} next Run learns from step ${k}`,
  readyChip: 'Learned · ready to repeat',
  loginNoSteps: /This page asks you to sign in\. Add login steps before step 1 using your secrets/,
  loginStepsFailed: /Your login steps did not sign you in; check the secret and the steps before step 1/,
  cancelledTitle: 'The run was stopped on request',
} as const;

// ---------------------------------------------------------------------------------------------
// Proxy controls (see e2e/mswProxy.ts and the L3H receipt)
// ---------------------------------------------------------------------------------------------

/** Selects a proxy scenario, which also resets the mock state and the request log. */
async function selectScenario(request: APIRequestContext, name: string): Promise<void> {
  const response = await request.post(`${PROXY}/__test/scenario`, { data: { name } });
  if (response.status() === 400) {
    const known = ((await response.json()) as { known?: string[] }).known ?? [];
    throw new Error(
      `The MSW proxy has no scenario '${name}' (known: ${known.join(', ')}). ` +
        `Register it in e2e/mswProxy.ts; see the L6-author receipt, "Requirements for W4".`,
    );
  }
  expect(response.status()).toBe(200);
}

async function recorded(request: APIRequestContext, path: string): Promise<RecordedRequest[]> {
  const response = await request.get(`${PROXY}/__test/requests`, { params: { path } });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { requests: RecordedRequest[] }).requests;
}

interface GuidedTally {
  start: number;
  clarify: number;
  cancel: number;
  finalize: number;
}

/** The guided calls the proxy served, by operation. Replays of one key are not distinguishable here. */
async function guidedTally(request: APIRequestContext): Promise<GuidedTally> {
  const calls = (await recorded(request, GUIDED)).filter((item) => item.method === 'POST');
  const count = (suffix: string | null) =>
    calls.filter((item) => (suffix === null ? item.path === GUIDED : item.path.endsWith(suffix))).length;
  return {
    start: count(null),
    clarify: count('/clarify'),
    cancel: count('/cancel'),
    finalize: count('/finalize'),
  };
}

/** Studio requests that no handler answered. `/api/v1/csi` and `/api/v1/features` are not Studio routes. */
async function unhandledStudioPaths(request: APIRequestContext): Promise<string[]> {
  return (await recorded(request, STUDIO)).filter((item) => !item.handled).map((item) => `${item.method} ${item.path}`);
}

interface DraftStep {
  id: string;
  text: string;
}

/** A draft as the mock serves it (`TestDetailDto`): the stable step IDs and the readiness. */
async function readDraft(
  request: APIRequestContext,
  id: string,
): Promise<{ steps: DraftStep[]; readiness: string; sourceRevision: number }> {
  const response = await request.get(`${PROXY}/api/v1/studio/tests/${id}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as { steps: DraftStep[]; readiness: string; sourceRevision: number };
}

/**
 * The `NEEDS_RELEARN` fixture draft is reachable by id but is not in the list the page selects
 * from (`readinessFixtures.ts`: "deliberately not folded into the list"). A PUT that changes
 * nothing writes the draft into the mock's store without changing its readiness, which puts it in
 * the list. This uses only the public authoring route, through the proxy.
 * RECONCILE(W4): a proxy scenario that seeds the list would replace this.
 */
async function putIntoList(request: APIRequestContext, id: string): Promise<void> {
  const read = await request.get(`${PROXY}/api/v1/studio/tests/${id}`);
  expect(read.status()).toBe(200);
  const draft = (await read.json()) as Record<string, unknown>;
  const body = {
    authoringSchemaVersion: 2,
    globalContext: draft.globalContext,
    steps: draft.steps,
    name: draft.name,
    description: draft.description,
    csiId: draft.csiId,
    environment: draft.environment,
    variables: draft.variables,
    configuration: draft.configuration,
    sourceRevision: draft.sourceRevision,
    configurationRevision: draft.configurationRevision,
  };
  const write = await request.put(`${PROXY}/api/v1/studio/tests/${id}`, { data: body });
  expect(write.status()).toBe(200);
  expect(((await write.json()) as { readiness: string }).readiness).toBe('NEEDS_RELEARN');
}

// ---------------------------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------------------------

const stepEditor = (page: Page, n: number) => page.getByRole('textbox', { name: `Step ${n}`, exact: true });
/**
 * The completion receipt. The same sentence is also shown, as history, in the plan explanation
 * (`plan-explanation-history`), so a bare text locator is ambiguous; the receipt is scoped by its id.
 */
const completion = (page: Page, text: string) => page.getByTestId('guided-completion').getByText(text);
const runButton = (page: Page) => page.getByRole('button', { name: 'Run Test', exact: true });
const GUIDED_START = (candidate: Request) =>
  candidate.method() === 'POST' && new URL(candidate.url()).pathname === GUIDED;

/** Opens the Studio editor on a draft that the list holds. */
async function openDraft(page: Page, id: string): Promise<void> {
  await page.goto(`/checks/ui-tests/${id}/studio`);
  // The editor is built from the single read, so a step row means the draft is loaded.
  await expect(stepEditor(page, 1)).toBeVisible();
}

/**
 * Records, in order, each status line that newly appears on the page while a guided Run is in
 * flight. The mock moves one script step per poll (about once a second), so a locator would miss
 * short-lived lines; a MutationObserver does not. It reads the page's visible text, not any
 * attribute. Call it after the page has loaded and before pressing Run.
 */
async function watchStatusLines(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __guidedStatusSeen: string[] }).__guidedStatusSeen = seen;
    const pattern =
      /^(Preparing your steps\.|Understanding this page[^\n]*|Running step \d+ of \d+\.|Repeating saved steps[^\n]*|Learning from step \d+|Saving what this run learned.*)$/u;
    let previous = new Set<string>();
    const scan = () => {
      const current = new Set<string>();
      for (const raw of document.body.innerText.split('\n')) {
        const line = raw.trim();
        if (pattern.test(line)) current.add(line);
      }
      current.forEach((line) => {
        if (!previous.has(line)) seen.push(line);
      });
      previous = current;
    };
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true });
    scan();
  });
  return () =>
    page.evaluate(() => (window as unknown as { __guidedStatusSeen: string[] }).__guidedStatusSeen.slice());
}

/** True when `expected` appears in `seen` in that order (other lines may sit between them). */
function inOrder(seen: readonly string[], expected: readonly string[]): boolean {
  let from = 0;
  for (const line of expected) {
    const at = seen.indexOf(line, from);
    if (at < 0) return false;
    from = at + 1;
  }
  return true;
}

test.beforeEach(async ({ request }) => {
  await selectScenario(request, 'default');
});

// ---------------------------------------------------------------------------------------------
// 1. author -> Run -> learn -> auto-finalize
// ---------------------------------------------------------------------------------------------

test('author edits, adds and reorders steps with stable IDs, then a first Run learns and finalizes on its own', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const before = await readDraft(request, UNLEARNED_ID);
  expect(before.readiness).toBe('UNLEARNED');
  expect(before.steps.map((step) => step.text)).toEqual([...UNLEARNED_STEPS]);

  await openDraft(page, UNLEARNED_ID);

  // Author: edit step 3, add a step, move it up one place, save.
  const editedThird = 'Click "Send reset link"';
  const added = 'Check that "Check your inbox" is visible';
  await stepEditor(page, 3).fill(editedThird);
  await page.getByRole('textbox', { name: 'Add a test step' }).fill(added);
  await page.getByRole('button', { name: 'Add step', exact: true }).click();
  await expect(stepEditor(page, 4)).toHaveValue(added);
  await page.getByRole('button', { name: 'Move step 4 up' }).click();
  await expect(stepEditor(page, 3)).toHaveValue(added);
  await expect(stepEditor(page, 4)).toHaveValue(editedThird);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // RECONCILE(W4): the save-state chip is read through its existing test id; it has no role.
  await expect(page.getByTestId('studio-save-state')).toHaveText('Saved');

  // The save reached the mock through the page's own transport, and every surviving step kept its ID.
  const saved = await readDraft(request, UNLEARNED_ID);
  expect(saved.steps.map((step) => step.text)).toEqual([UNLEARNED_STEPS[0], UNLEARNED_STEPS[1], added, editedThird]);
  const [first, second, inserted, edited] = saved.steps;
  expect([first.id, second.id, edited.id]).toEqual([before.steps[0].id, before.steps[1].id, before.steps[2].id]);
  expect(inserted.id).toMatch(UUID);
  expect(before.steps.map((step) => step.id)).not.toContain(inserted.id);

  // Run: the first Run of an unlearned draft is a full learn (no start hint), publishes by itself.
  const seenLines = await watchStatusLines(page);
  const started = page.waitForRequest(GUIDED_START);
  // RECONCILE(W4): the Run control's name after L5b ("Run Test" today).
  await runButton(page).click();
  const start = await started;
  expect(start.postDataJSON()).toMatchObject({ schemaVersion: 3, testId: UNLEARNED_ID });
  expect((start.headers()['idempotency-key'] ?? '').length).toBeGreaterThan(0);

  await expect(completion(page, COPY.completedLearned)).toBeVisible({ timeout: 60_000 });

  // RECONCILE(W4): timing-sensitive; the lines are the ones L5a's GuidedRunStatus renders.
  const lines = await seenLines();
  expect(
    inOrder(lines, [
      COPY.preparing,
      COPY.understanding(1, 4),
      COPY.running(1, 4),
      COPY.running(4, 4),
      COPY.finalizing,
    ]),
    `status lines seen: ${JSON.stringify(lines)}`,
  ).toBe(true);

  // Request counts: one start, one finalize (made by the page, not by a click), no question, no cancel.
  await expect.poll(() => guidedTally(request)).toEqual({ start: 1, clarify: 0, cancel: 0, finalize: 1 });
  expect(await unhandledStudioPaths(request)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// 2. clarification with a page-derived label
// ---------------------------------------------------------------------------------------------

test.describe('a focused clarification (proxy scenario guided-clarification-page)', () => {
  test.beforeEach(async ({ request }) => {
    await selectScenario(request, 'guided-clarification-page');
  });

  test('a page-derived choice is shown as untrusted text, answered once, and the Run completes', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await openDraft(page, UNLEARNED_ID);
    await runButton(page).click();

    // The scenario asks at step index 1, i.e. "Step 2".
    await expect(page.getByText(COPY.question(2, UNLEARNED_STEPS[1]))).toBeVisible({ timeout: 45_000 });

    // The labels come from the page, so they are marked and show their role and region.
    await expect(page.getByText('Reference', { exact: true })).toBeVisible();
    await expect(page.getByText('Backup reference', { exact: true })).toBeVisible();
    await expect(page.getByText('Page-derived', { exact: true })).toHaveCount(2);
    await expect(page.getByText('role: textbox', { exact: true })).toHaveCount(2);
    await expect(page.getByText('region: region-main', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('radio')).toHaveCount(3); // two choices and "None of these"

    // Nothing is sent until the author answers.
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
    await expect(continueButton).toBeDisabled();
    expect((await guidedTally(request)).clarify).toBe(0);

    await page.getByRole('radio', { name: /^Reference/ }).check();
    const answered = page.waitForRequest(
      (candidate) => candidate.method() === 'POST' && candidate.url().endsWith('/clarify'),
    );
    await continueButton.click();
    const answer = await answered;
    expect(answer.postDataJSON()).toMatchObject({ schemaVersion: 3, choiceId: 'choice-1' });
    expect((answer.headers()['idempotency-key'] ?? '').length).toBeGreaterThan(0);

    await expect(completion(page, COPY.completedLearned)).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => guidedTally(request)).toEqual({ start: 1, clarify: 1, cancel: 0, finalize: 1 });
    expect(await unhandledStudioPaths(request)).toEqual([]);
  });

  test('"None of these" cancels once, sends no answer, and moves focus to that step', async ({ page, request }) => {
    test.setTimeout(120_000);
    await openDraft(page, UNLEARNED_ID);
    await runButton(page).click();
    await expect(page.getByText(COPY.question(2, UNLEARNED_STEPS[1]))).toBeVisible({ timeout: 45_000 });

    await page.getByRole('radio', { name: COPY.noneOfThese }).check();
    const cancelled = page.waitForRequest(
      (candidate) => candidate.method() === 'POST' && candidate.url().endsWith('/cancel'),
    );
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const cancel = await cancelled;
    expect(cancel.postDataJSON()).toMatchObject({ schemaVersion: 3, reason: 'userRequested' });

    // The session ends CANCELLED and shows the existing CANCELLED narrative, with no success claim.
    await expect(page.getByText(COPY.cancelledTitle)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(COPY.completedLearned)).toHaveCount(0);
    // Focus moving to the step's editor row is part of the flow (ruling A3; ADR-SC-006 keeps it).
    await expect(stepEditor(page, 2)).toBeFocused();

    expect(await guidedTally(request)).toEqual({ start: 1, clarify: 0, cancel: 1, finalize: 0 });
  });
});

// ---------------------------------------------------------------------------------------------
// 3. blocked by login, both variants, both actions
// ---------------------------------------------------------------------------------------------

const LOGIN_VARIANTS = [
  { scenario: 'guided-login-required-no-login-steps', sentence: COPY.loginNoSteps },
  { scenario: 'guided-login-required-login-steps-failed', sentence: COPY.loginStepsFailed },
] as const;

for (const variant of LOGIN_VARIANTS) {
  test.describe(`blocked by login (proxy scenario ${variant.scenario})`, () => {
    test.beforeEach(async ({ request }) => {
      await selectScenario(request, variant.scenario);
    });

    test('names step 1, offers both actions, finalizes nothing', async ({ page, request }) => {
      test.setTimeout(90_000);
      await openDraft(page, UNLEARNED_ID);
      await runButton(page).click();

      await expect(page.getByText(variant.sentence)).toBeVisible({ timeout: 45_000 });
      const goToStep = page.getByRole('button', { name: 'Go to step 1', exact: true });
      const openVariables = page.getByRole('button', { name: 'Open Variables', exact: true });
      await expect(goToStep).toBeVisible();
      await expect(openVariables).toBeVisible();

      // "Go to step N" moves focus to that step's editor row (a flow behaviour).
      await goToStep.click();
      await expect(stepEditor(page, 1)).toBeFocused();

      // "Open Variables" opens the existing Variables dialog.
      await openVariables.click();
      // RECONCILE(W4): L5b wires the callback to the page's existing Variables dialog.
      await expect(page.getByRole('heading', { name: 'Variables' })).toBeVisible();

      // A blocked-by-login Run is not a success and publishes nothing.
      await expect(page.getByText(COPY.completedLearned)).toHaveCount(0);
      expect(await guidedTally(request)).toEqual({ start: 1, clarify: 0, cancel: 0, finalize: 0 });
    });
  });
}

// ---------------------------------------------------------------------------------------------
// 4. later replay, and mixed mode
// ---------------------------------------------------------------------------------------------

test('a later Run of a READY test replays: one execute, no guided session', async ({ page, request }) => {
  await openDraft(page, READY_ID);
  await expect(page.getByText(COPY.readyChip)).toBeVisible();

  const executed = page.waitForRequest(
    (candidate) => candidate.method() === 'POST' && candidate.url().endsWith(`/studio/tests/${READY_ID}/execute`),
  );
  await runButton(page).click();
  const execute = await executed;
  expect((execute.headers()['idempotency-key'] ?? '').length).toBeGreaterThan(0);

  // The mock accepts the execution and keeps it PENDING (it has no runner), so the counts are the
  // proof here, not an outcome.
  await expect
    .poll(async () =>
      (await recorded(request, `/api/v1/studio/tests/${READY_ID}/execute`)).filter((item) => item.method === 'POST').length,
    )
    .toBe(1);
  expect(await guidedTally(request)).toEqual({ start: 0, clarify: 0, cancel: 0, finalize: 0 });
});

test('mixed mode: a changed draft repeats the saved prefix, learns from the changed step and finalizes', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await putIntoList(request, NEEDS_RELEARN_ID);
  await openDraft(page, NEEDS_RELEARN_ID);
  await expect(page.getByText(COPY.needsRelearnChip(2))).toBeVisible();

  const seenLines = await watchStatusLines(page);
  const started = page.waitForRequest(GUIDED_START);
  await runButton(page).click();
  expect((await started).postDataJSON()).toMatchObject({ schemaVersion: 3, testId: NEEDS_RELEARN_ID });

  await expect(completion(page, COPY.completedPartial(2, 4))).toBeVisible({ timeout: 60_000 });

  // RECONCILE(W4): timing-sensitive, as in the first-Run test.
  const lines = await seenLines();
  expect(
    inOrder(lines, [COPY.preparing, COPY.repeatingPrefix(1), COPY.learningFrom(2), COPY.finalizing]),
    `status lines seen: ${JSON.stringify(lines)}`,
  ).toBe(true);
  await expect.poll(() => guidedTally(request)).toEqual({ start: 1, clarify: 0, cancel: 0, finalize: 1 });
});

// ---------------------------------------------------------------------------------------------
// 5. narrow layout (AC-8 a; AC-9 "narrow layout")
// ---------------------------------------------------------------------------------------------

test.describe('narrow layout, 375x812 (proxy scenario guided-login-required-no-login-steps)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the blocked-by-login actions stay inside the viewport width', async ({ page, request }) => {
    test.setTimeout(90_000);
    await selectScenario(request, 'guided-login-required-no-login-steps');
    await openDraft(page, UNLEARNED_ID);
    await runButton(page).click();
    await expect(page.getByText(COPY.loginNoSteps)).toBeVisible({ timeout: 45_000 });

    for (const name of ['Go to step 1', 'Open Variables']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box, `${name} is laid out`).not.toBeNull();
      expect(box!.x, `${name} starts inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${name} ends inside the viewport`).toBeLessThanOrEqual(375);
    }
  });
});
