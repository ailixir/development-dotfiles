import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser, Page } from 'playwright';

import { guardDist, launchChromium } from './harness.js';
import { html, launchStepRun, open, serve, type Opened, type Served } from './cutover-support.js';

/**
 * ADR-SC-007 WI-4 D-15 / AC9: no Playwright error text reaches any output of a step. A page carries canaries in an overlay (text and
 * attributes), in a prefilled value attribute, in a data attribute and in the typed literal. Playwright's own errors for the
 * same page state DO carry them (the control: the test can see a leak); the step that leaves the runner carries a bare closed
 * code and method names, with no message text, cause or stack text from the page.
 */

guardDist();

const ATTR = 'CANARY-ATTR-5520';
const VALUE = 'CANARY-VALUE-3317';
const TEXT = 'CANARY-OVERLAY-TEXT-8841';
const TYPED = 'CANARY-TYPED-LITERAL-7702';
const CANARIES = [ATTR, VALUE, TEXT, TYPED];

const PAGE = html(`<main aria-label="Operations">
  <button type="button" id="click" data-canary="${ATTR}">Pay now</button>
  <label>Account <input id="fill" value="${VALUE}" data-canary="${ATTR}"></label>
  <label>Plan <select id="select" data-canary="${ATTR}"><option>Alpha</option><option>Beta</option></select></label>
  <label>Search ${TEXT} <input id="press" value="${VALUE}" data-canary="${ATTR}"></label>
  <label>Agree <input id="check" type="checkbox" data-canary="${ATTR}"></label>
  <table aria-label="Facts"><tbody><tr><td id="read" aria-label="Readable cell" data-canary="${ATTR}">Cell ${TEXT}</td></tr></tbody></table>
  <h1 id="assert" data-canary="${ATTR}">Heading ${TEXT}</h1>
</main>`);

type Name = 'click' | 'fill' | 'selectOption' | 'press' | 'check' | 'read' | 'assert';

/** The mutation that makes the action fail: cover, make read-only, disable, remove or hide. */
function mutate(page: Page, name: Name): Promise<void> {
  return page.evaluate(
    ([which, attr, text]) => {
      const byId = (id: string): HTMLElement => {
        const element = document.getElementById(id);
        if (element === null) throw new Error(id);
        return element;
      };
      switch (which) {
        case 'click':
          document.body.insertAdjacentHTML('beforeend', `<div id="overlay" class="cover" data-canary="${attr}" style="position:fixed;inset:0;background:rgba(0,0,0,.2)">${text}</div>`);
          break;
        case 'fill':
          (byId('fill') as HTMLInputElement).readOnly = true;
          break;
        case 'selectOption':
          (byId('select') as HTMLSelectElement).disabled = true;
          break;
        case 'press':
          byId('press').remove();
          break;
        case 'check':
          (byId('check') as HTMLInputElement).disabled = true;
          break;
        case 'read':
          byId('read').style.display = 'none';
          break;
        case 'assert':
          byId('assert').style.display = 'none';
          break;
      }
    },
    [name, ATTR, TEXT] as const,
  );
}

/** Playwright's own action on the same mutated page state: its error is the leak the boundary must close. */
async function rawError(page: Page, name: Name): Promise<Error> {
  const timeout = 700;
  try {
    switch (name) {
      case 'click': await page.locator('#click').click({ timeout }); break;
      case 'fill': await page.locator('#fill').fill(TYPED, { timeout }); break;
      case 'selectOption': await page.locator('#select').selectOption({ index: 1 }, { timeout }); break;
      // Playwright's press never prints the element: its call log names the locator, whose accessible name is page text.
      case 'press': await page.getByRole('textbox', { name: `Search ${TEXT}`, exact: true }).press('Enter', { timeout }); break;
      case 'check': await page.locator('#check').check({ timeout }); break;
      case 'read': await page.locator('#read').waitFor({ state: 'visible', timeout }); break;
      case 'assert': await page.locator('#assert').waitFor({ state: 'visible', timeout }); break;
    }
  } catch (error) {
    return error as Error;
  }
  throw new Error(`the raw ${name} did not fail on the mutated page`);
}

interface Row {
  readonly name: Name;
  /** The step code a model would write for this action. */
  readonly code: string;
  /** What the step ends with on the mutated page (a closed code, never page text). */
  readonly closedCode: string;
  /** Post-fence failures are OUTCOME_UNKNOWN; a missing target, a hidden read and a failed assert end before the fence or as an assertion. */
  readonly fenced: boolean;
}
const rows: readonly Row[] = [
  { name: 'click', code: "await page.locator('#click').click();", closedCode: 'OUTCOME_UNKNOWN', fenced: true },
  { name: 'fill', code: `await page.locator('#fill').fill('${TYPED}');`, closedCode: 'OUTCOME_UNKNOWN', fenced: true },
  { name: 'selectOption', code: "await page.locator('#select').selectOption({ index: 1 });", closedCode: 'OUTCOME_UNKNOWN', fenced: true },
  { name: 'press', code: `await page.getByRole('textbox', { name: 'Search ${TEXT}', exact: true }).press('Enter');`, closedCode: 'TARGET_DRIFT', fenced: false },
  { name: 'check', code: "await page.locator('#check').check();", closedCode: 'OUTCOME_UNKNOWN', fenced: true },
  { name: 'read', code: "await page.locator('#read').waitFor({ state: 'visible' });", closedCode: 'TARGET_DRIFT', fenced: false },
  { name: 'assert', code: "await expect(page.locator('#assert')).toBeVisible();", closedCode: 'ASSERTION_FAILED', fenced: false },
];

describe('WI-4 canary matrix: Playwright error text stays behind the closed boundary', () => {
  let browser: Browser;
  let served: Served;
  const opened: Opened[] = [];

  beforeAll(async () => {
    browser = await launchChromium();
    served = await serve({ '/canary': PAGE });
  });
  afterAll(async () => {
    for (const created of opened.splice(0)) await created.close();
    await browser.close();
    await served.close();
  });

  it.each(rows.map((row) => [row.name, row] as const))('canary matrix: %s', async (_name, row) => {
    // The control: Playwright's own error for the same page state carries a canary.
    const control = await open(browser, served, '/canary');
    opened.push(control);
    await mutate(control.page, row.name);
    const raw = await rawError(control.page, row.name);
    expect(CANARIES.some((canary) => raw.message.includes(canary)), `the raw ${row.name} error must show a canary or this test cannot see a leak: ${raw.message.slice(0, 200)}`).toBe(true);

    // The boundary: the same page state through the step runner. The step ends with a closed code and a receipt of method names only.
    const run = await launchStepRun();
    try {
      const target = run.handle.stepApi?.page as Page | undefined;
      if (!target) throw new Error('PAGE');
      await target.goto(`${served.origin}/canary`);
      await mutate(target, row.name);
      const outcome = await run.step(row.code, { remainingMs: 3000 });
      expect(outcome.receipt.closedCode, `the ${row.name} must fail on the mutated page`).toBe(row.closedCode);
      expect(outcome.receipt.fenceCrossed).toBe(row.fenced);
      const everything = JSON.stringify(outcome);
      for (const canary of CANARIES) expect(everything, `the ${row.name} outcome leaks ${canary}`).not.toContain(canary);
    } finally { await run.dispose(); }
  }, 60_000);
});
