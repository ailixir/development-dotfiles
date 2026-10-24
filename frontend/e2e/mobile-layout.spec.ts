import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * Mobile layout of the UI-tests-as-checks surfaces (STUDIO-UNIFY-001.5, task 5.14).
 * Covers AC-04 (editor Environment row), AC-05 (editor opens at the top), AC-06 (All Checks table on
 * a phone) and AC-12 (Create form reachable on a phone) at 390x844.
 *
 * WHAT THIS PROVES. It runs in the `msw` project only (the file name has no `-real-backend` suffix):
 * the real Vite app in Chromium, answered by the MSW handlers in the Node proxy `e2e/mswProxy.ts`.
 * It proves the layout against the mocks, with real pixels. Vitest cannot: jsdom has no layout and no
 * media queries (story risk R3). Nothing here is evidence of live integration.
 *
 * Accessibility is out of scope (ADR-SC-006): no axe, no screen-reader, no keyboard assertions.
 */

test.use({ viewport: { width: 390, height: 844 } });

const apiPort = Number(process.env.CHECKS_E2E_API_PORT ?? 4178);
const PROXY = `http://127.0.0.1:${apiPort}`;

const VIEWPORT_WIDTH = 390;

/** Seeded `default` draft with 3 steps and no revision ('Password reset email'); also used by studio-guided.spec.ts. */
const UI_TEST_WITH_STEPS_ID = 'd0000000-0000-4000-8000-000000000003';

/** Thresholds, straight from the acceptance criteria. */
const MAX_SCROLL_Y = 16; // AC-05
const MAX_ENV_TO_VARIABLES_GAP = 24; // AC-04
const MAX_NAME_FIELD_TOP = 700; // AC-12

test.beforeEach(async ({ request }) => {
  await selectDefaultScenario(request);
});

async function selectDefaultScenario(request: APIRequestContext): Promise<void> {
  const reset = await request.post(`${PROXY}/__test/scenario`, { data: { name: 'default' } });
  expect(reset.status()).toBe(200);
}

/** The bounding box of a locator that must be rendered; fails the test with the locator's name otherwise. */
async function box(locator: Locator, what: string) {
  const found = await locator.boundingBox();
  expect(found, `${what} has a bounding box (it is rendered)`).not.toBeNull();
  return found!;
}

/** Asserts that a locator's whole box lies inside the 390 px wide viewport, and returns the box. */
async function expectInsideViewportWidth(locator: Locator, what: string) {
  const found = await box(locator, what);
  expect.soft(found.x, `${what}: left edge ${found.x} >= 0`).toBeGreaterThanOrEqual(0);
  expect.soft(
    found.x + found.width,
    `${what}: right edge ${found.x + found.width} <= ${VIEWPORT_WIDTH}`,
  ).toBeLessThanOrEqual(VIEWPORT_WIDTH);
  return found;
}

/**
 * The harness answers `GET /api/v1/checks` with an empty page (`e2e/previewBootstrapHandlers.ts`), so the
 * msw data holds UI test rows only. AC-06 needs a regular check row beside them, so the browser request
 * for the check list is answered here with one synthetic check. It is placed first by `createdAt`
 * (the list sorts newest first), so it is on page 1 whatever the number of seeded UI tests.
 * This is a browser-level route inside this spec; the proxy, the handlers and the app are untouched.
 */
async function serveOneRegularCheck(page: Page): Promise<void> {
  const check = {
    id: 'c0000000-0000-4000-8000-0000000000aa',
    name: 'Payments gateway HTTP health',
    type: 'HTTP',
    description: 'Synthetic check for the mobile layout spec',
    csiId: '60406',
    csiName: 'Studio demo system 60406',
    status: 'PASSING',
    configuration: { type: 'HTTP', method: 'GET', url: 'https://example.test/health', expectedStatusCode: 200 },
    environment: 'Production',
    createdBy: 'e2e@example.test',
    createdAt: '2099-01-01T00:00:00Z',
    updatedAt: '2099-01-01T00:00:00Z',
    lastExecutionAt: '2026-10-24T08:30:00Z',
    schedule: null,
    tags: [],
  };
  await page.route(
    (url) => url.pathname === '/api/v1/checks',
    (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: [check], page: 0, size: 100, totalElements: 1, totalPages: 1 }),
          })
        : route.fallback(),
  );
}

async function openEditor(page: Page): Promise<void> {
  await page.goto(`/checks/ui-tests/${UI_TEST_WITH_STEPS_ID}/studio`);
  // The editor is built from the single read, so a step row and the Test setup controls mean it settled.
  await expect(page.getByRole('textbox', { name: 'Step 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Variables', exact: true })).toBeEnabled();
}

test.describe('Studio editor at 390x844', () => {
  test('AC-05: the editor opens at the top and keeps Save and Run in the viewport', async ({ page }) => {
    await openEditor(page);

    // Smooth scrolling is delayed; wait so a late scroll (the coach's scrollIntoView) would be caught.
    await page.waitForTimeout(1_000);

    const scrollY = await page.evaluate(() => window.scrollY);
    console.log(`AC-05 measured window.scrollY = ${scrollY} (limit ${MAX_SCROLL_Y})`);
    expect(scrollY).toBeLessThanOrEqual(MAX_SCROLL_Y);

    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Run Test', exact: true })).toBeInViewport();
  });

  test('AC-04: the Environment field and the Variables button are at most 24 px apart', async ({ page }) => {
    await openEditor(page);
    await page.waitForTimeout(1_000);

    const environment = page
      .locator('.MuiFormControl-root')
      .filter({ has: page.getByRole('combobox', { name: 'Environment' }) });
    const variables = page.getByRole('button', { name: 'Variables', exact: true });

    const environmentBox = await box(environment, 'the Environment field');
    const variablesBox = await box(variables, 'the Variables button');
    const gap = variablesBox.y - (environmentBox.y + environmentBox.height);
    console.log(
      `AC-04 measured gap = ${gap} px (Environment bottom ${environmentBox.y + environmentBox.height}, ` +
        `Variables top ${variablesBox.y}; limit ${MAX_ENV_TO_VARIABLES_GAP})`,
    );

    // Stacked, not side by side: the button sits below the field.
    expect(variablesBox.y).toBeGreaterThanOrEqual(environmentBox.y + environmentBox.height);
    expect(gap).toBeLessThanOrEqual(MAX_ENV_TO_VARIABLES_GAP);
  });
});

test.describe('All Checks at 390x844', () => {
  test('AC-06: the table fits, the row actions and pager arrows are inside the viewport, the captions show', async ({
    page,
  }) => {
    await serveOneRegularCheck(page);
    await page.goto('/checks/all');

    const container = page.getByTestId('all-checks-table-container');
    await expect(container).toBeVisible();

    // Both row kinds must be present, otherwise the assertions below would pass on half the table.
    const uiTestRun = page.locator('[data-testid^="ui-test-run-"]').first();
    const checkExecute = page.locator('[data-testid^="check-execute-"]').first();
    await expect(uiTestRun, 'the msw data gives a UI test row').toBeVisible();
    await expect(checkExecute, 'the msw data gives a regular check row').toBeVisible();

    // No horizontal overflow of the table container.
    const sizes = await container.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    console.log(
      `AC-06 measured table container scrollWidth = ${sizes.scrollWidth}, clientWidth = ${sizes.clientWidth}`,
    );
    if (sizes.scrollWidth > sizes.clientWidth) {
      // Name the cells that stick out, so a failure points at the column and not just at a number.
      const offenders = await container.evaluate((element) => {
        const limit = element.getBoundingClientRect().right;
        return Array.from(element.querySelectorAll('th, td'))
          .map((cell) => ({
            text: (cell.textContent ?? '').trim().slice(0, 40),
            right: Math.round(cell.getBoundingClientRect().right),
            width: Math.round(cell.getBoundingClientRect().width),
            hidden: getComputedStyle(cell).display === 'none',
          }))
          .filter((cell) => !cell.hidden && cell.right > limit + 0.5)
          .slice(0, 3);
      });
      console.log(`AC-06 cells past the container edge: ${JSON.stringify(offenders)}`);
    }
    expect.soft(sizes.scrollWidth, 'table container has no horizontal overflow').toBeLessThanOrEqual(sizes.clientWidth);

    // Row actions: every rendered one, of both row kinds, fully inside the viewport width, and also
    // inside the table container (a button past the container's edge is clipped by its scroll area, so
    // it is not "fully visible" even when it is inside the window).
    const containerBox = await box(container, 'the table container');
    const containerRight = containerBox.x + containerBox.width;
    const actionSelectors = [
      '[data-testid^="ui-test-run-"]',
      '[data-testid^="ui-test-more-"]',
      '[data-testid^="check-execute-"]',
      '[data-testid^="check-more-"]',
    ];
    for (const selector of actionSelectors) {
      const actions = page.locator(selector);
      const count = await actions.count();
      expect(count, `at least one ${selector} is rendered`).toBeGreaterThan(0);
      let maxRight = 0;
      for (let index = 0; index < count; index += 1) {
        const action = actions.nth(index);
        const testId = await action.getAttribute('data-testid');
        const found = await expectInsideViewportWidth(action, `${testId}`);
        maxRight = Math.max(maxRight, found.x + found.width);
      }
      expect
        .soft(maxRight, `${selector}: widest right edge ${maxRight} inside the table container (right edge ${containerRight})`)
        .toBeLessThanOrEqual(containerRight + 0.5);
      console.log(
        `AC-06 ${selector}: ${count} rendered, widest right edge ${maxRight} ` +
          `(viewport ${VIEWPORT_WIDTH}, table container right edge ${containerRight})`,
      );
    }

    // Pager arrows.
    const arrows = page.locator('[data-testid="all-checks-pagination"] .MuiTablePagination-actions button');
    expect(await arrows.count(), 'the pager has its previous and next arrows').toBe(2);
    for (let index = 0; index < 2; index += 1) {
      const found = await expectInsideViewportWidth(arrows.nth(index), `pager arrow ${index + 1}`);
      console.log(`AC-06 pager arrow ${index + 1}: right edge ${found.x + found.width} (viewport ${VIEWPORT_WIDTH})`);
    }

    // The last-execution value is still shown below md, as a caption under the name, for both row kinds.
    await expect(page.locator('[data-testid^="ui-test-last-run-caption-"]').first()).toBeVisible();
    await expect(page.locator('[data-testid^="check-last-run-caption-"]').first()).toBeVisible();
  });
});

test.describe('Create check at 390x844', () => {
  test('AC-12: the Name field is reachable, and the type cards open only on request', async ({ page }) => {
    await page.goto('/checks/create?type=UI_TEST');

    const name = page.getByTestId('ui-test-create-name');
    await expect(name).toBeVisible();

    const nameBox = await box(name, 'the Name field');
    console.log(`AC-12 measured Name field top = ${nameBox.y} px (limit ${MAX_NAME_FIELD_TOP})`);
    expect(nameBox.y).toBeLessThanOrEqual(MAX_NAME_FIELD_TOP);

    const summary = page.getByTestId('create-type-summary');
    const toggle = page.getByTestId('create-type-toggle');
    const cards = page.getByTestId('create-type-cards');
    await expect(summary).toBeVisible();
    await expect(toggle).toBeVisible();
    await expect(cards).toBeHidden();

    await toggle.click();
    await expect(cards).toBeVisible();
  });
});
