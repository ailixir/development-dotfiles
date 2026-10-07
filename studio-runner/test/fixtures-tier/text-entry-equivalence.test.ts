/**
 * VAL-031 ruling §6 — text-entry role equivalence (executor 2.1.0) against real Chromium.
 *
 * The unit tier proves the resolution order against a fake locator. This proves that Chromium's
 * accessibility roles behave the way the rule assumes: a Google-like `textarea[role=combobox]`
 * is not a `searchbox`, a Wikipedia-like `input[type=search]` is, and a page with two text-entry
 * controls has no single answer. The adapter is driven in-process, as
 * `assertion-semantics.test.ts` does, so no child process is needed.
 */
// eslint-disable-next-line no-restricted-imports -- Test-only browser, never shipped.
import { chromium } from 'playwright';
// eslint-disable-next-line no-restricted-imports -- Test-only types.
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPlaywrightAdapter } from '../../src/run/playwrightAdapter.js';
import type { PageLike } from '../../src/run/playwrightAdapter.js';
import type { LocatorSegment } from '../../src/executor/operations.js';

const GOOGLE_LIKE = `<title>Search</title>
  <form><textarea role="combobox" aria-label="Search" name="q"></textarea></form>
  <output id="sent"></output>
  <script>
    document.querySelector('textarea').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      document.getElementById('sent').textContent = 'sent';
    });
  </script>`;
const WIKIPEDIA_LIKE = `<title>Wiki</title>
  <input type="search" aria-label="Search Wikipedia" name="search">`;
const TWO_FIELDS = `<title>Two</title>
  <input type="text" aria-label="First name"><textarea aria-label="Notes"></textarea>`;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: [] });
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

function adapterWith(log: [string, string][]) {
  return createPlaywrightAdapter({
    page: page as unknown as PageLike,
    defaultTimeoutMs: 2_000,
    onTextEntryEquivalence: (authored, resolved) => log.push([authored, resolved]),
  });
}

function byRole(role: string, name?: string): LocatorSegment {
  return name === undefined
    ? { kind: 'getByRole', role }
    : { kind: 'getByRole', role, options: { name: { kind: 'literal', value: name } } };
}

describe('VAL-031 — text-entry role equivalence in real Chromium', () => {
  it('fills and submits a combobox textarea authored as a nameless searchbox (benchmark C07)', async () => {
    await page.setContent(GOOGLE_LIKE);
    const log: [string, string][] = [];
    const adapter = adapterWith(log);
    const handle = await adapter.locate({ segments: [byRole('searchbox')] });
    await adapter.fill(handle, 'hosting');
    await adapter.press(handle, 'Enter');

    expect(await page.locator('textarea').inputValue()).toBe('hosting');
    expect(await page.locator('#sent').textContent()).toBe('sent');
    expect(log).toEqual([
      ['searchbox', 'combobox'],
      ['searchbox', 'combobox'],
    ]);
  });

  it('fills the same control authored as textbox with its accessible name', async () => {
    await page.setContent(GOOGLE_LIKE);
    const log: [string, string][] = [];
    const adapter = adapterWith(log);
    await adapter.fill(await adapter.locate({ segments: [byRole('textbox', 'Search')] }), 'cats');
    expect(await page.locator('textarea').inputValue()).toBe('cats');
    expect(log).toEqual([['textbox', 'combobox']]);
  });

  it('leaves an exact searchbox match untouched', async () => {
    await page.setContent(WIKIPEDIA_LIKE);
    const log: [string, string][] = [];
    const adapter = adapterWith(log);
    await adapter.fill(await adapter.locate({ segments: [byRole('searchbox')] }), 'hosting');
    expect(await page.locator('input').inputValue()).toBe('hosting');
    expect(log).toEqual([]);
  });

  it('refuses to choose between two text-entry controls for a nameless searchbox', async () => {
    await page.setContent(TWO_FIELDS);
    const log: [string, string][] = [];
    const adapter = adapterWith(log);
    const handle = await adapter.locate({ segments: [byRole('searchbox')] });
    await expect(adapter.fill(handle, 'x')).rejects.toThrow(
      'fill failed: no searchbox matched; 2 other text-entry controls did — refusing to choose.',
    );
    expect(await page.locator('input').inputValue()).toBe('');
    expect(await page.locator('textarea').inputValue()).toBe('');
    expect(log).toEqual([]);
  });

  it('does not apply to click: a nameless searchbox click still times out', async () => {
    await page.setContent(GOOGLE_LIKE);
    const adapter = adapterWith([]);
    const handle = await adapter.locate({ segments: [byRole('searchbox')] });
    await expect(adapter.click(handle, { timeout: 300 })).rejects.toThrow(
      'click failed: no element matched the locator within 300ms.',
    );
  });
});
