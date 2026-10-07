/**
 * VAL-040 — visible-only resolution of the action operations (executor 2.1.0), in real Chromium.
 *
 * The unit tier proves the counting rules against a fake locator. This proves that Chromium's
 * visibility filter treats the live failures the way the rule assumes: Wikipedia's search input
 * has a hidden twin sharing its placeholder (`getByPlaceholder('Search Wikipedia')` matched 2),
 * and Google's `getByLabel('Search')` matched 6, most of them hidden. The adapter is driven
 * in-process, as `text-entry-equivalence.test.ts` does, so no child process is needed.
 */
// eslint-disable-next-line no-restricted-imports -- Test-only browser, never shipped.
import { chromium } from 'playwright';
// eslint-disable-next-line no-restricted-imports -- Test-only types.
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPlaywrightAdapter } from '../../src/run/playwrightAdapter.js';
import type { PageLike } from '../../src/run/playwrightAdapter.js';
import type { LocatorChain } from '../../src/executor/operations.js';

/** The visible search input, and a twin hidden two ways (the `hidden` attribute, display:none). */
const WIKIPEDIA_TWIN = `<title>Wiki</title>
  <form id="visible"><input type="search" name="search" placeholder="Search Wikipedia"></form>
  <form hidden><input type="search" name="search" placeholder="Search Wikipedia"></form>
  <div style="display:none"><input type="search" placeholder="Search Wikipedia"></div>
  <output id="sent"></output>
  <script>
    document.querySelector('#visible input').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      document.getElementById('sent').textContent = 'sent';
    });
  </script>`;
/** One visible `Search` control among several hidden ones, as on the live Google page. */
const GOOGLE_LABELS = `<title>Search</title>
  <textarea role="combobox" aria-label="Search" name="q"></textarea>
  <input aria-label="Search" style="visibility:hidden">
  <div style="display:none"><input aria-label="Search"><input aria-label="Search by voice"></div>
  <button aria-label="Search by image" hidden>img</button>`;
const TWO_VISIBLE = `<title>Two</title>
  <input placeholder="Search Wikipedia"><input placeholder="Search Wikipedia">
  <input placeholder="Search Wikipedia" hidden>`;
const ONLY_HIDDEN = `<title>Hidden</title><input placeholder="Search Wikipedia" hidden>`;
/** A hidden `searchbox` and one visible combobox: VAL-031's fallback sees past the hidden match. */
const HIDDEN_SEARCHBOX = `<title>Mixed</title>
  <input type="search" aria-label="Search" hidden>
  <textarea role="combobox" aria-label="Search"></textarea>`;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: [] });
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

function adapterWith(totals: number[], equivalences: [string, string][] = []) {
  return createPlaywrightAdapter({
    page: page as unknown as PageLike,
    defaultTimeoutMs: 2_000,
    onVisibleOnlyResolution: (total) => totals.push(total),
    onTextEntryEquivalence: (authored, resolved) => equivalences.push([authored, resolved]),
  });
}

const placeholder = (text: string): LocatorChain => ({
  segments: [{ kind: 'getByPlaceholder', text: { kind: 'literal', value: text } }],
});

describe('VAL-040 — visible-only resolution in real Chromium', () => {
  it('fills and submits the visible Wikipedia input past its hidden twins (getByPlaceholder)', async () => {
    await page.setContent(WIKIPEDIA_TWIN);
    expect(await page.getByPlaceholder('Search Wikipedia').count()).toBe(3);
    const totals: number[] = [];
    const adapter = adapterWith(totals);
    const handle = await adapter.locate(placeholder('Search Wikipedia'));
    await adapter.fill(handle, 'Alan Turing');
    await adapter.press(handle, 'Enter');

    expect(await page.locator('#visible input').inputValue()).toBe('Alan Turing');
    expect(await page.locator('#sent').textContent()).toBe('sent');
    expect(totals).toEqual([3, 3]);
  });

  it('fills the one visible Google-like Search control (getByLabel matching hidden elements)', async () => {
    await page.setContent(GOOGLE_LABELS);
    const total = await page.getByLabel('Search').count();
    expect(total).toBeGreaterThan(1);
    const totals: number[] = [];
    const adapter = adapterWith(totals);
    await adapter.fill(
      await adapter.locate({
        segments: [{ kind: 'getByLabel', text: { kind: 'literal', value: 'Search' } }],
      }),
      'hosting',
    );
    expect(await page.locator('textarea').inputValue()).toBe('hosting');
    expect(totals).toEqual([total]);
  });

  it('keeps the strict-mode failure when two matches are visible, counting visible ones only', async () => {
    await page.setContent(TWO_VISIBLE);
    const totals: number[] = [];
    const adapter = adapterWith(totals);
    await expect(
      adapter.fill(await adapter.locate(placeholder('Search Wikipedia')), 'x'),
    ).rejects.toThrow('fill failed: the locator matched 2 elements; make the step more specific.');
    expect(await page.locator('input').first().inputValue()).toBe('');
    expect(totals).toEqual([]);
  });

  it('times out as "not visible" when the only match is hidden', async () => {
    await page.setContent(ONLY_HIDDEN);
    const adapter = adapterWith([]);
    await expect(
      adapter.click(await adapter.locate(placeholder('Search Wikipedia')), { timeout: 300 }),
    ).rejects.toThrow('click failed: the element was not visible within 300ms.');
  });

  it('leaves the assertions unchanged: a hidden twin still makes toBeVisible ambiguous', async () => {
    await page.setContent(WIKIPEDIA_TWIN);
    const adapter = adapterWith([]);
    await expect(
      adapter.expectVisible(await adapter.locate(placeholder('Search Wikipedia')), { timeout: 300 }),
    ).rejects.toThrow(/^AssertionFailed: expected the locator to be visible within 300ms/u);
  });

  it('composes with the text-entry fallback: a hidden searchbox yields to the one visible combobox', async () => {
    await page.setContent(HIDDEN_SEARCHBOX);
    const equivalences: [string, string][] = [];
    const adapter = adapterWith([], equivalences);
    await adapter.fill(
      await adapter.locate({
        segments: [
          {
            kind: 'getByRole',
            role: 'searchbox',
            options: { name: { kind: 'literal', value: 'Search' } },
          },
        ],
      }),
      'hosting',
    );
    expect(await page.locator('textarea').inputValue()).toBe('hosting');
    expect(equivalences).toEqual([['searchbox', 'combobox']]);
  });
});
