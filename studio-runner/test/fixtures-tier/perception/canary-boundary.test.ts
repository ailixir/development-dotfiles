import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser, Page } from 'playwright';

import { CLOSED_ACTION_CODES } from '../../../src/run/closedError.js';
import { guardDist, launchChromium } from './harness.js';
import { html, invoke, open, prepare, rejection, serve, TestControl, type Opened, type Operation, type Served } from './cutover-support.js';

/**
 * ADR-SC-007 WI-4 D-15 / AC9: no Playwright error text reaches any output. A page carries canaries in an overlay (text and
 * attributes), in a prefilled value attribute, in a data attribute and in the typed literal. Playwright's own errors for the
 * same page state DO carry them (the control: the test can see a leak); the error that leaves the boundary is a bare closed
 * code, with no message text, cause or stack text from the page.
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
  readonly role: string;
  readonly label: string;
  readonly operation: Operation;
  readonly value: string | null;
  readonly authored: string | null;
  /** Post-fence failures are UNKNOWN_OUTCOME; read and assert end before the fence. */
  readonly fenced: boolean;
}
const rows: readonly Row[] = [
  { name: 'click', role: 'button', label: 'Pay now', operation: { kind: 'click' }, value: null, authored: null, fenced: true },
  { name: 'fill', role: 'textbox', label: 'Account', operation: { kind: 'fill', value: { kind: 'authoredLiteral', sourceInputId: 'x' } }, value: TYPED, authored: null, fenced: true },
  { name: 'selectOption', role: 'combobox', label: 'Plan', operation: { kind: 'selectOption', value: { kind: 'authoredLiteral', sourceInputId: 'x' } }, value: 'Beta', authored: 'Beta', fenced: true },
  { name: 'press', role: 'textbox', label: `Search ${TEXT}`, operation: { kind: 'press', key: 'Enter' }, value: null, authored: null, fenced: true },
  { name: 'check', role: 'checkbox', label: 'Agree', operation: { kind: 'check' }, value: null, authored: null, fenced: true },
  { name: 'read', role: 'cell', label: 'Readable cell', operation: { kind: 'read', bindingId: 'b', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: 'replaced-below' } }, value: null, authored: null, fenced: false },
  { name: 'assert', role: 'heading', label: `Heading ${TEXT}`, operation: { kind: 'assert', predicate: 'visible', expected: null }, value: null, authored: null, fenced: false },
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

    // The boundary: the same state through the production session.
    const created = await open(browser, served, '/canary');
    opened.push(created);
    const exported = await created.session.observe(undefined, false);
    const rule = exported.observation.readRuleId ?? '';
    const operation: Operation = row.operation.kind === 'read' ? { ...row.operation, recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: rule } } : row.operation;
    const prepared = await prepare(created, row.role, row.label, operation, row.authored, exported);
    const fence = new TestControl(row.fenced ? () => mutate(created.page, row.name) : () => undefined);
    if (!row.fenced) await mutate(created.page, row.name);
    const error = await rejection(invoke(created, prepared, operation, { value: row.value, readRuleId: row.name === 'read' ? rule : null, control: fence }));
    expect(error, `the ${row.name} must fail on the mutated page`).not.toBeNull();
    const thrown = error as Error & { code?: unknown };
    expect(thrown.name).toBe('ClosedActionError');
    expect(thrown.message).toBe(thrown.code);
    expect(CLOSED_ACTION_CODES as readonly string[]).toContain(thrown.message);
    expect(thrown.cause).toBeUndefined();
    const everything = [thrown.message, thrown.stack ?? '', JSON.stringify(thrown, Object.getOwnPropertyNames(thrown)), String(thrown)].join('\n');
    for (const canary of CANARIES) expect(everything, `the ${row.name} error leaks ${canary}`).not.toContain(canary);
    if (row.fenced) {
      expect(fence.fenced).toBe(1);
      expect(thrown.message).toBe('UNKNOWN_OUTCOME');
    } else {
      expect(fence.fenced).toBe(0);
      expect(thrown.message).toBe('TARGET_CHANGED');
    }
  }, 60_000);
});
