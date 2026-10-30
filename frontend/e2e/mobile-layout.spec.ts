import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * Layout of the UI-tests-as-checks surfaces.
 * STUDIO-UNIFY-001.5 task 5.14, at 390x844: AC-04 (editor Environment row), AC-05 (editor opens at
 * the top), AC-06 (All Checks table on a phone) and AC-12 (Create form reachable on a phone).
 * STUDIO-UNIFY-001.6 task 6.11: AC-06 (Runs pager fits at 390x844; since .7 the Recent Runs card of the
 * detail page), AC-05 (editor header holds its
 * layout with the Run caption at 1440x900), and the AC-04 visibility of the failed learning attempt
 * line on an All Checks row at 390x844.
 * STUDIO-UNIFY-001.7 task 7.4: AC-01 and AC-05 (detail page cards stacked at 390, side by side from 1200;
 * no sideways scroll; Recent Runs table and pager fit).
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

/** A seeded UI test (`demoFixtures.ts`, index 1) with several runs in the `default` scenario. */
const UI_TEST_WITH_RUNS_ID = 'd0000000-0000-4000-8000-000000000002';

test.describe('UI test detail page at 390x844', () => {
  test('STUDIO-UNIFY-001.7 AC-05: the cards stack, and the Recent Runs pager and table fit the viewport', async ({
    page,
  }) => {
    await page.goto(`/checks/ui-tests/${UI_TEST_WITH_RUNS_ID}`);

    const card = page.getByTestId('ui-test-recent-runs');
    await expect(card.locator('tbody tr').first(), 'the seeded test has runs').toBeVisible();
    await expect(page.getByTestId('ui-test-latest-run')).toBeVisible();

    const container = card.locator('.MuiTableContainer-root');
    const sizes = await container.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    const rows = await card.locator('tbody tr').count();
    console.log(
      `7.4 390: ${rows} rows; table container scrollWidth = ${sizes.scrollWidth}, clientWidth = ${sizes.clientWidth}`,
    );
    if (sizes.scrollWidth > sizes.clientWidth) {
      console.log(`7.4 390 Recent Runs columns: ${JSON.stringify(await columnWidths(container))}`);
    }
    expect.soft(sizes.scrollWidth, 'Recent Runs table container has no horizontal overflow').toBeLessThanOrEqual(sizes.clientWidth);

    const document = await documentWidths(page);
    console.log(`7.4 390: document scrollWidth = ${document.scrollWidth}, clientWidth = ${document.clientWidth}`);
    expect.soft(document.scrollWidth, 'the page has no sideways scroll').toBeLessThanOrEqual(document.clientWidth);

    const pager = page.getByTestId('ui-test-runs-pagination');
    await expectInsideViewportWidth(pager, 'the Recent Runs pager');
    const arrows = pager.locator('.MuiTablePagination-actions button');
    expect(await arrows.count(), 'the pager has its previous and next arrows').toBe(2);
    for (let index = 0; index < 2; index += 1) {
      const found = await expectInsideViewportWidth(arrows.nth(index), `Recent Runs pager arrow ${index + 1}`);
      console.log(`7.4 390 pager arrow ${index + 1}: right edge ${found.x + found.width} (viewport ${VIEWPORT_WIDTH})`);
    }
    await expect(
      pager.locator('.MuiTablePagination-input'),
      'the rows-per-page selector is hidden below sm',
    ).toBeHidden();

    const recent = await box(card, 'the Recent Runs card');
    const latest = await box(page.getByTestId('ui-test-latest-run'), 'the Latest run card');
    console.log(`7.4 390: Recent Runs bottom = ${recent.y + recent.height}, Latest run top = ${latest.y}`);
    expect(latest.y, 'the Latest run card is stacked below the Recent Runs card').toBeGreaterThanOrEqual(
      recent.y + recent.height,
    );
  });

  /**
   * STUDIO-UNIFY-001.8 AC-01 and AC-02. The three seeded tests of `demoFixtures.ts` between them show all
   * six status chips (no fixture edit): a Running row is the widest (the only chip with a spinner).
   */
  const CHIP_PAGES: ReadonlyArray<{ id: string; chips: readonly string[]; alignment: boolean }> = [
    { id: 'd0000000-0000-4000-8000-000000000001', chips: ['Running', 'Passed'], alignment: true },
    { id: 'd0000000-0000-4000-8000-000000000007', chips: ['Pending', 'Cancelled', 'Error'], alignment: false },
    { id: UI_TEST_WITH_RUNS_ID, chips: ['Failed', 'Passed'], alignment: false },
  ];

  for (const { id, chips, alignment } of CHIP_PAGES) {
    test(`STUDIO-UNIFY-001.8 AC-01: the Recent Runs table fits with ${chips.join(', ')} rows (${id.slice(-4)})`, async ({
      page,
    }) => {
      await page.goto(`/checks/ui-tests/${id}`);

      const card = page.getByTestId('ui-test-recent-runs');
      await expect(card.locator('tbody tr').first(), 'the seeded test has runs').toBeVisible();
      await expect(page.getByTestId('ui-test-latest-run')).toBeVisible();

      // A fixture drift must fail loudly, not pass on a page without the chip under test.
      const labels = await card.getByTestId('run-status').allTextContents();
      for (const chip of chips) {
        expect(labels, `the page shows a ${chip} chip (shown: ${labels.join(', ')})`).toContain(chip);
      }

      const container = card.locator('.MuiTableContainer-root');
      const sizes = await container.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));
      const document = await documentWidths(page);
      const containerBox = await box(container, 'the table container');
      const containerRight = containerBox.x + containerBox.width;

      // Width the table needs (min-content), to see how much room is left; restored right after.
      const needed = await container.evaluate((element) => {
        const table = element.querySelector('table') as HTMLElement;
        const before = table.style.width;
        table.style.width = 'min-content';
        const width = table.getBoundingClientRect().width;
        table.style.width = before;
        return width;
      });

      // Every visible header cell (a `display: none` one is skipped); "Actions" must read in full.
      const headers = await container.evaluate((element) =>
        Array.from(element.querySelectorAll('thead th'))
          .filter((cell) => getComputedStyle(cell).display !== 'none')
          .map((cell) => ({
            column: (cell.textContent ?? '').trim(),
            right: cell.getBoundingClientRect().right,
            width: Math.round(cell.getBoundingClientRect().width),
          })),
      );
      const widestChip = await card.getByTestId('run-status').evaluateAll((chipsOnPage) =>
        Math.max(...chipsOnPage.map((chip) => Math.round(chip.getBoundingClientRect().width))),
      );
      console.log(
        `8.1 390 ${id.slice(-4)} [${labels.join(', ')}]: container scrollWidth = ${sizes.scrollWidth}, clientWidth = ${sizes.clientWidth}; ` +
          `document scrollWidth = ${document.scrollWidth}, clientWidth = ${document.clientWidth}; ` +
          `min-content table = ${Math.round(needed)} (spare ${Math.round(sizes.clientWidth - needed)}); widest chip = ${widestChip}; ` +
          `visible headers (right edge, width) = ${headers.map((h) => `${h.column} ${Math.round(h.right)}/${h.width}`).join(', ')}; ` +
          `container right = ${containerRight}`,
      );
      if (sizes.scrollWidth > sizes.clientWidth) {
        console.log(`8.1 390 ${id.slice(-4)} columns: ${JSON.stringify(await columnWidths(container))}`);
      }

      expect.soft(sizes.scrollWidth, 'Recent Runs table container has no horizontal overflow').toBeLessThanOrEqual(sizes.clientWidth);
      expect.soft(document.scrollWidth, 'the page has no sideways scroll').toBeLessThanOrEqual(document.clientWidth);
      for (const header of headers) {
        expect
          .soft(header.right, `header "${header.column}" right edge ${header.right} inside the container (right edge ${containerRight})`)
          .toBeLessThanOrEqual(containerRight + 0.5);
      }

      const rows = card.locator('tbody tr');
      const rowCount = await rows.count();
      for (let index = 0; index < rowCount; index += 1) {
        const row = rows.nth(index);
        const status = (await row.getByTestId('run-status').textContent()) ?? '';
        const parts = [
          ['Run link', row.getByTestId('run-link')],
          ['Status chip', row.getByTestId('run-status')],
          ['row menu button', row.getByRole('button')],
        ] as const;
        for (const [what, locator] of parts) {
          const found = await box(locator, `row ${index + 1} (${status}) ${what}`);
          expect
            .soft(found.x, `row ${index + 1} (${status}) ${what}: left edge ${found.x} >= container left ${containerBox.x}`)
            .toBeGreaterThanOrEqual(containerBox.x - 0.5);
          expect
            .soft(
              found.x + found.width,
              `row ${index + 1} (${status}) ${what}: right edge ${found.x + found.width} <= container right ${containerRight}`,
            )
            .toBeLessThanOrEqual(containerRight + 0.5);
        }
      }

      if (alignment) {
        // AC-02: the note and the table line up with the card title (D7: the note and the container, not
        // the first cell's text, which keeps its cell padding).
        const titleBox = await box(card.locator('.MuiCardHeader-title'), 'the card title');
        const noteBox = await box(card.getByTestId('ui-test-runs-note'), 'the runs note');
        console.log(
          `8.2 390 alignment: title x = ${titleBox.x}, note x = ${noteBox.x}, table container x = ${containerBox.x}`,
        );
        expect.soft(Math.abs(noteBox.x - titleBox.x), `the note (x ${noteBox.x}) lines up with the title (x ${titleBox.x})`).toBeLessThanOrEqual(1);
        expect
          .soft(Math.abs(containerBox.x - titleBox.x), `the table container (x ${containerBox.x}) lines up with the title (x ${titleBox.x})`)
          .toBeLessThanOrEqual(1);
      }
    });
  }
});

async function documentWidths(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

async function columnWidths(container: Locator) {
  return container.evaluate((element) =>
    Array.from(element.querySelectorAll('thead th')).map((cell) => ({
      column: (cell.textContent ?? '').trim(),
      width: Math.round(cell.getBoundingClientRect().width),
      hidden: getComputedStyle(cell).display === 'none',
    })),
  );
}

/** The two-column layout from `lg` (1200 px): Overview and Recent Runs on the left, Latest run on the right. */
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1200, height: 800 },
]) {
  test.describe(`UI test detail page at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('STUDIO-UNIFY-001.7 AC-05: columns sit side by side and the Recent Runs table fits its card', async ({
      page,
    }) => {
      await page.goto(`/checks/ui-tests/${UI_TEST_WITH_RUNS_ID}`);

      const card = page.getByTestId('ui-test-recent-runs');
      await expect(card.locator('tbody tr').first(), 'the seeded test has runs').toBeVisible();
      const latestCard = page.getByTestId('ui-test-latest-run');
      await expect(latestCard).toBeVisible();

      const container = card.locator('.MuiTableContainer-root');
      const sizes = await container.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));
      const document = await documentWidths(page);
      const recent = await box(card, 'the Recent Runs card');
      const latest = await box(latestCard, 'the Latest run card');
      const ratio = recent.width / latest.width;
      console.log(
        `7.4 ${viewport.width}: table container scrollWidth = ${sizes.scrollWidth}, clientWidth = ${sizes.clientWidth}; ` +
          `document scrollWidth = ${document.scrollWidth}, clientWidth = ${document.clientWidth}; ` +
          `Recent Runs card x = ${recent.x}, width = ${recent.width}, right = ${recent.x + recent.width}; ` +
          `Latest run card x = ${latest.x}, width = ${latest.width}; width ratio = ${ratio.toFixed(3)} (5/7 = ${(5 / 7).toFixed(3)})`,
      );
      if (sizes.scrollWidth > sizes.clientWidth) {
        console.log(`7.4 ${viewport.width} Recent Runs columns: ${JSON.stringify(await columnWidths(container))}`);
      }

      expect.soft(sizes.scrollWidth, 'Recent Runs table container has no horizontal overflow').toBeLessThanOrEqual(sizes.clientWidth);
      expect.soft(document.scrollWidth, 'the page has no sideways scroll').toBeLessThanOrEqual(document.clientWidth);
      expect.soft(latest.x, 'the Latest run card sits to the right of the Recent Runs card').toBeGreaterThan(
        recent.x + recent.width,
      );
      expect.soft(ratio, 'the column width ratio is 5:7 within 10 percent').toBeGreaterThanOrEqual((5 / 7) * 0.9);
      expect.soft(ratio, 'the column width ratio is 5:7 within 10 percent').toBeLessThanOrEqual((5 / 7) * 1.1);
    });
  });
}

test.describe('Editor header with the Run caption at 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const TITLE = 'Quarterly statements download flow'; // padded below to 38 characters
  const LONG_NAME = `${TITLE}`.padEnd(38, '!').slice(0, 38);
  const MAX_CAPTION_WIDTH = 280; // 6.0 AC-05
  const MAX_BREADCRUMB_HEIGHT = 24;
  const MAX_HEADER_HEIGHT = 130;

  test('STUDIO-UNIFY-001.6 AC-05: a refusal caption wraps inside 280 px and the title is not truncated', async ({
    page,
  }) => {
    expect(LONG_NAME).toHaveLength(38);

    // The capabilities read, answered in the browser with the shape the mocks serve
    // (capabilityHandlers.ts): a refusal of the guided start.
    await page.route(
      (url) => /^\/api\/v1\/studio\/tests\/[^/]+\/capabilities$/u.test(url.pathname),
      (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({
              status: 200,
              contentType: 'application/json',
              headers: { 'Cache-Control': 'no-store' },
              body: JSON.stringify({ vaultSecrets: true, guidedStart: { available: false, code: 'RUNTIME_INCOMPATIBLE' } }),
            })
          : route.fallback(),
    );
    // The test read and the list read, renamed to 38 characters (the page shows the list's copy once
    // it arrives); everything else is the mock's answer.
    await page.route(
      (url) => url.pathname === `/api/v1/studio/tests/${UI_TEST_WITH_STEPS_ID}`,
      async (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        const response = await route.fetch();
        const body = (await response.json()) as { name: string };
        return route.fulfill({ response, json: { ...body, name: LONG_NAME } });
      },
    );
    await page.route(
      (url) => url.pathname === '/api/v1/studio/tests',
      async (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        const response = await route.fetch();
        const body = (await response.json()) as { data: Array<{ id: string; name: string }> };
        const data = body.data.map((item) => (item.id === UI_TEST_WITH_STEPS_ID ? { ...item, name: LONG_NAME } : item));
        return route.fulfill({ response, json: { ...body, data } });
      },
    );

    await openEditor(page);
    const run = page.getByRole('button', { name: 'Run Test', exact: true });
    await expect(run, 'the Run button name is unchanged').toBeVisible();
    await run.click();

    const caption = page.getByTestId('run-start-unavailable');
    await expect(caption, 'the refusal caption shows').toBeVisible();

    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toHaveText(LONG_NAME);
    const header = page.locator('.MuiPaper-outlined').filter({ has: title }).first();
    const breadcrumb = header.locator('nav').first();

    const captionBox = await box(caption, 'the Run caption');
    const breadcrumbBox = await box(breadcrumb, 'the breadcrumb');
    const headerBox = await box(header, 'the header');
    const titleSizes = await title.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    console.log(
      `N3 caption width = ${captionBox.width} (limit ${MAX_CAPTION_WIDTH}); breadcrumb height = ${breadcrumbBox.height} ` +
        `(logged; ${MAX_BREADCRUMB_HEIGHT} px is one text line); title scrollWidth = ${titleSizes.scrollWidth}, clientWidth = ${titleSizes.clientWidth}; ` +
        `header height = ${headerBox.height} (limit ${MAX_HEADER_HEIGHT})`,
    );

    const layout = await header.evaluate((element, viewportWidth) => ({
      viewportWidth,
      headerWidth: Math.round(element.getBoundingClientRect().width),
      headerLeft: Math.round(element.getBoundingClientRect().left),
      columns: Array.from(element.children).map((child) => ({
        width: Math.round(child.getBoundingClientRect().width),
        height: Math.round(child.getBoundingClientRect().height),
      })),
      actionsColumnChildren: Array.from(element.children[1]?.children ?? []).map((child) => ({
        tag: child.tagName.toLowerCase(),
        width: Math.round(child.getBoundingClientRect().width),
        height: Math.round(child.getBoundingClientRect().height),
        text: (child.textContent ?? '').trim().slice(0, 30),
      })),
      breadcrumbOneLine:
        new Set(Array.from(element.querySelectorAll('nav li')).map((li) => Math.round(li.getBoundingClientRect().top + li.getBoundingClientRect().height / 2))).size === 1,
      breadcrumbCrumbs: Array.from(element.querySelectorAll('nav li')).map((li) => ({
        text: (li.textContent ?? '').trim().slice(0, 40),
        width: Math.round(li.getBoundingClientRect().width),
        height: Math.round(li.getBoundingClientRect().height),
      })),
    }), page.viewportSize()?.width);
    console.log(`N3 layout: ${JSON.stringify(layout)}`);
    expect.soft(captionBox.width, 'caption width').toBeLessThanOrEqual(MAX_CAPTION_WIDTH);
    // AC-05 asks for one line; the height is logged only (MUI separators are 26 px tall on a single line).
    expect.soft(layout.breadcrumbOneLine, 'breadcrumb is on one line (every crumb shares one vertical centre)').toBe(true);
    expect.soft(titleSizes.scrollWidth, 'title is not truncated').toBeLessThanOrEqual(titleSizes.clientWidth);
    expect.soft(headerBox.height, 'header height').toBeLessThanOrEqual(MAX_HEADER_HEIGHT);
  });
});

test.describe('Failed learning attempt on an All Checks row at 390x844', () => {
  /** Seeded in `fixtures.ts` ("Statements download") with a failed attempt in `guidedHandlers.ts`. */
  const FAILED_ATTEMPT_TEST_ID = '11111111-1111-1111-1111-111111111112';

  test('STUDIO-UNIFY-001.6 AC-04: the attempt line shows in the name cell and the table still fits', async ({
    page,
  }) => {
    await serveOneRegularCheck(page);
    await page.goto('/checks/all');
    await expect(page.getByTestId('all-checks-table-container')).toBeVisible();
    await expect(page.locator('[data-testid^="ui-test-run-"]').first()).toBeVisible();

    const row = page.getByTestId(`ui-test-row-${FAILED_ATTEMPT_TEST_ID}`);
    const onPageOne = (await row.count()) > 0;
    const rowsOnPageOne = await page.locator('[data-testid^="ui-test-row-"]').count();
    // Where the list puts it: newest `createdAt` first, one synthetic check above, 25 rows a page.
    const listed = (await (await page.request.get(`${PROXY}/api/v1/studio/tests`, { params: { size: '100' } })).json()) as {
      data: Array<{ id: string; createdAt: string }>;
    };
    const newestFirst = [...listed.data].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? -1 : 1));
    const position = newestFirst.findIndex((item) => item.id === FAILED_ATTEMPT_TEST_ID) + 2; // +1 one-based, +1 the check
    const whereItIs =
      `the 'Statements download' row (${FAILED_ATTEMPT_TEST_ID}) is not on page 1 of /checks/all in the seeded data: ` +
      `it is row ${position} of ${listed.data.length + 1} (newest first), and page 1 shows ${rowsOnPageOne} UI test rows plus the synthetic check`;
    if (!onPageOne) {
      // Seeded data puts the row past page 1: page forward with the pager's next arrow until it shows.
      console.log(`AC-04 (.6): ${whereItIs}; paging forward`);
      const next = page.getByTestId('all-checks-pagination').locator('.MuiTablePagination-actions button').last();
      for (let pageNo = 2; pageNo <= 5 && (await row.count()) === 0; pageNo += 1) {
        await next.click();
        await page.waitForTimeout(300);
      }
    }
    await expect(row, 'the Statements download row is listed').toBeVisible();

    const note = row.locator('td').nth(1).getByTestId('last-learning-attempt');
    await expect(note, 'the failed attempt line shows in the name cell').toBeVisible();

    const container = page.getByTestId('all-checks-table-container');
    const sizes = await container.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    console.log(
      `AC-04 (.6) attempt line: "${(await note.textContent())?.trim()}"; table container scrollWidth = ${sizes.scrollWidth}, ` +
        `clientWidth = ${sizes.clientWidth}`,
    );
    expect.soft(sizes.scrollWidth, 'table container has no horizontal overflow').toBeLessThanOrEqual(sizes.clientWidth);
  });
});
