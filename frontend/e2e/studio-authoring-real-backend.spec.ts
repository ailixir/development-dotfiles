import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * D5: a local real-backend AUTHORING smoke (STUDIO-OBS-008 PO scope decision 2026-10-17, item 2;
 * implementation plan B15/D5).
 *
 * WHAT THIS IS. The Studio page, in Chromium, creating a draft, editing it, adding a step,
 * reordering and saving it against a real `./gradlew bootRun` (local profile; `LocalDevAuthFilter`
 * injects a fixed developer identity, so no header or login is needed). It reads the stored draft
 * back through the API to prove the stable step IDs survive an edit and a reorder, and reads the
 * capabilities route once. It is the proof that the MSW mirror is not masking v1/v2 drift in the
 * authoring contract.
 *
 * WHAT THIS IS NOT. It is NOT live integration (that is STUDIO-OBS-009) and MSW remains the basis
 * of AC-9. It is non-gating local evidence. It starts no guided session: that needs the
 * studio-runner and a model gateway, neither of which a plain `bootRun` has.
 *
 * It runs in the `real-backend` project only (the file name ends `-real-backend.spec.ts`):
 *
 *   CHECKS_E2E_REAL_BACKEND=1 pnpm exec playwright test --project=real-backend \
 *     e2e/studio-authoring-real-backend.spec.ts
 *
 * Playwright starts only the Vite app (e2e/start-servers.mjs); its `/api/v1` proxy forwards to
 * `CHECKS_E2E_BACKEND_URL` (default http://127.0.0.1:8080). The caller starts the backend. What the
 * backend needs, none of which this file can arrange:
 *
 *   - profile `local` (embedded Postgres; the dev identity is `bb12345` with role `checks-admin`,
 *     which may write on any registered CSI);
 *   - `CHECKS_SOURCE_UI_TEST=true`, otherwise the Studio page renders "not available";
 *   - at least one registered CSI, because a draft's CSI must be registered
 *     (`ck_ui_tests_csi_registered`). The repeatable seed `db/seed/R__sample_data.sql` registers
 *     178672, 285614 and 396705; it is loaded by adding `classpath:db/seed` to `FLYWAY_LOCATIONS`.
 *
 * The first test checks those preconditions and fails with a message that says which one is
 * missing; the rest are serial and are skipped when it fails. Nothing here prints a secret: the
 * drafts hold plain step text only.
 *
 * Selectors are roles and labels. Accessibility is out of scope (ADR-SC-006).
 */

const BACKEND = process.env.CHECKS_E2E_BACKEND_URL ?? 'http://127.0.0.1:8080';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DraftStep {
  id: string;
  text: string;
}

interface Draft {
  id: string;
  name: string;
  csiId: string;
  steps: DraftStep[];
  sourceRevision: number;
  configurationRevision: number;
}

test.describe.configure({ mode: 'serial' });

/** The draft this run created, kept so the last hook can delete it. */
let createdId: string | null = null;

async function readDraft(request: APIRequestContext, id: string): Promise<Draft> {
  const response = await request.get(`/api/v1/studio/tests/${id}`);
  expect(response.status(), `GET /api/v1/studio/tests/${id}`).toBe(200);
  return (await response.json()) as Draft;
}

const stepEditor = (page: Page, n: number) => page.getByRole('textbox', { name: `Step ${n}`, exact: true });

async function save(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // The save-state chip reads "Saved" once the PUT has answered; it has no role, so its existing test id is used.
  await expect(page.getByTestId('studio-save-state')).toHaveText('Saved');
}

async function addStep(page: Page, text: string, expectedNumber: number): Promise<void> {
  await page.getByRole('textbox', { name: 'Add a test step' }).fill(text);
  await page.getByRole('button', { name: 'Add step', exact: true }).click();
  await expect(stepEditor(page, expectedNumber)).toHaveValue(text);
}

test('preconditions: the backend answers, Studio is on, and a CSI is registered', async ({ request }) => {
  let health;
  try {
    health = await request.get(`${BACKEND}/actuator/health`);
  } catch (failure) {
    throw new Error(
      `No backend answered at ${BACKEND}. Start it first (cd backend && ./gradlew bootRun, local profile) ` +
        `or set CHECKS_E2E_BACKEND_URL. ${String(failure)}`,
    );
  }
  expect(health.status(), `GET ${BACKEND}/actuator/health`).toBeLessThan(500);

  // Through the app origin, i.e. Vite's /api/v1 proxy, which is the path the page uses.
  const features = await request.get('/api/v1/features');
  expect(features.status(), 'GET /api/v1/features through the Vite proxy').toBe(200);
  const body = (await features.json()) as {
    sources: Array<{ type: string; enabled: boolean }>;
    features: Array<{ key: string; enabled: boolean }>;
  };
  expect(
    body.sources.find((source) => source.type === 'UI_TEST')?.enabled,
    'UI_TEST source is off; start bootRun with CHECKS_SOURCE_UI_TEST=true',
  ).toBe(true);
  const studio = body.features.find((feature) => feature.key === 'STUDIO');
  if (studio) expect(studio.enabled, 'the STUDIO feature is off').toBe(true);

  const csis = await request.get('/api/v1/csi', { params: { page: 0, size: 5 } });
  expect(csis.status(), 'GET /api/v1/csi').toBe(200);
  const page = (await csis.json()) as unknown;
  const list = Array.isArray(page)
    ? page
    : ((page as { data?: unknown[]; content?: unknown[] }).data ??
      (page as { content?: unknown[] }).content ??
      []);
  expect(
    list.length,
    'no CSI is registered; add classpath:db/seed to FLYWAY_LOCATIONS (R__sample_data.sql registers 178672, 285614, 396705)',
  ).toBeGreaterThan(0);
});

test('create a draft, then add, edit and reorder steps and save: step IDs stay stable', async ({ page, request }) => {
  test.setTimeout(120_000);
  const name = `E2E D5 authoring smoke ${new Date().toISOString().replace(/[:.]/g, '-')}`;

  await test.step('create the draft from the tests list', async () => {
    await page.goto('/checks/studio/tests');
    // An empty list shows "Create Test" twice (header and empty state); either opens the dialog.
    await page.getByRole('button', { name: 'Create Test' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'New UI Test' })).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Name' }).fill(name);

    // Wait for the registry to load, then make sure a system is chosen.
    const system = dialog.getByRole('combobox', { name: /System \(CSI\)/ });
    await expect(dialog.getByText('Loading available systems…')).toHaveCount(0);
    await expect(
      dialog.getByText('No systems are available for new tests.'),
      'the CSI registry is empty; see the preconditions test',
    ).toHaveCount(0);
    const chosen = (await system.innerText()).replace(/[\u200b\s]/g, '');
    if (chosen === '') {
      await system.click();
      await page.getByRole('option').first().click();
    }
    await expect(dialog.getByText('The test will be saved under this system.')).toBeVisible();

    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForURL(/\/checks\/studio\/[0-9a-f-]{36}$/i);
    createdId = new URL(page.url()).pathname.split('/').pop() ?? null;
    expect(createdId).toMatch(UUID);
    await expect(page.getByText('Add your first step')).toBeVisible();
  });
  const id = createdId!;

  const stepA = 'Go to "https://example.com"';
  const stepB = 'Click the "More information" link';
  const stepC = 'Check that the URL contains "iana.org"';

  const first = await test.step('add three steps and save', async () => {
    await addStep(page, stepA, 1);
    await addStep(page, stepB, 2);
    await addStep(page, stepC, 3);
    await save(page);

    const draft = await readDraft(request, id);
    expect(draft.name).toBe(name);
    expect(draft.steps.map((step) => step.text)).toEqual([stepA, stepB, stepC]);
    draft.steps.forEach((step) => expect(step.id, `id of "${step.text}"`).toMatch(UUID));
    expect(new Set(draft.steps.map((step) => step.id)).size).toBe(3);
    return draft;
  });

  const second = await test.step('edit step 2, add a fourth step, move it up, save', async () => {
    const editedB = 'Click the "Learn more" link';
    const stepD = 'Check that the heading "Example Domain" is visible';
    await stepEditor(page, 2).fill(editedB);
    await addStep(page, stepD, 4);
    await page.getByRole('button', { name: 'Move step 4 up' }).click();
    await expect(stepEditor(page, 3)).toHaveValue(stepD);
    await expect(stepEditor(page, 4)).toHaveValue(stepC);
    await save(page);

    const draft = await readDraft(request, id);
    expect(draft.steps.map((step) => step.text)).toEqual([stepA, editedB, stepD, stepC]);
    const [a, b, d, c] = draft.steps;
    // Edit and reorder keep a step's ID; only the inserted step is new.
    expect([a.id, b.id, c.id]).toEqual(first.steps.map((step) => step.id));
    expect(d.id).toMatch(UUID);
    expect(first.steps.map((step) => step.id)).not.toContain(d.id);
    expect(draft.sourceRevision).toBeGreaterThan(first.sourceRevision);
    return draft;
  });

  await test.step('reload: the saved order and IDs come back unchanged', async () => {
    await page.reload();
    await expect(stepEditor(page, 1)).toBeVisible();
    const expected = second.steps.map((step) => step.text);
    for (const [index, text] of expected.entries()) {
      await expect(stepEditor(page, index + 1)).toHaveValue(text);
    }
    const again = await readDraft(request, id);
    expect(again.steps).toEqual(second.steps);
  });

  await test.step('capabilities answer for the saved draft', async () => {
    const response = await request.get(`/api/v1/studio/tests/${id}/capabilities`);
    expect(response.status(), 'GET /api/v1/studio/tests/{id}/capabilities').toBe(200);
    const capabilities = (await response.json()) as {
      vaultSecrets: unknown;
      guidedStart: { available: unknown };
    };
    // Only the shape: whether a guided start is available depends on a runner and a model gateway.
    expect(typeof capabilities.vaultSecrets).toBe('boolean');
    expect(typeof capabilities.guidedStart.available).toBe('boolean');
  });
});

test.afterAll(async ({ playwright }) => {
  if (createdId === null) return;
  // Best effort: the smoke leaves the local database as it found it, but a cleanup failure is not a smoke failure.
  const context = await playwright.request.newContext({
    baseURL: `http://127.0.0.1:${Number(process.env.CHECKS_E2E_APP_PORT ?? 4177)}`,
  });
  try {
    await context.delete(`/api/v1/studio/tests/${createdId}`);
  } finally {
    await context.dispose();
  }
});
