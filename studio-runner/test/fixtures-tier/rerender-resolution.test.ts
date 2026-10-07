/**
 * VAL-041 — actions survive a control that the page re-renders, in real Chromium.
 *
 * Live, Wikipedia replaces its server-rendered `<input type="search">` (role `searchbox`) with a
 * Codex typeahead `<input role="combobox">` of the same name ~50 ms after the first keystroke. A
 * `press` whose authored `searchbox` had been counted just before the swap then waited out its
 * whole timeout, reported as "detached". The unit tier proves the gate is built; this proves
 * Chromium resolves it the way the rule assumes. The adapter is driven in-process, as
 * `visible-only-resolution.test.ts` does, so no child process is needed.
 */
// eslint-disable-next-line no-restricted-imports -- Test-only browser, never shipped.
import { chromium } from 'playwright';
// eslint-disable-next-line no-restricted-imports -- Test-only types.
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPlaywrightAdapter } from '../../src/run/playwrightAdapter.js';
import type { PageLike } from '../../src/run/playwrightAdapter.js';
import type { LocatorChain } from '../../src/executor/operations.js';

/** Enter on whichever search control is current reports the value it held. */
const SENT_ON_ENTER = `<output id="sent"></output>
  <script>
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
      event.preventDefault();
      document.getElementById('sent').textContent = 'sent:' + event.target.value;
    });
  </script>`;

/** The input is replaced by a new, identical node on its first `input` event (a re-render). */
const REPLACED_ON_INPUT = `<title>Rerender</title>
  <form><input type="search" aria-label="Search Wikipedia" name="search"></form>
  ${SENT_ON_ENTER}
  <script>
    const original = document.querySelector('input');
    original.addEventListener('input', () => {
      const next = original.cloneNode(false);
      next.value = original.value;
      next.dataset.generation = '2';
      original.replaceWith(next);
      next.focus();
    }, { once: true });
  </script>`;

/** `window.swap()` replaces the searchbox with a same-name combobox, as Codex does. */
const ROLE_SWAP = `<title>Codex</title>
  <form><input type="search" aria-label="Search Wikipedia" name="search"></form>
  ${SENT_ON_ENTER}
  <script>
    window.swap = () => {
      const original = document.querySelector('form input');
      const next = document.createElement('input');
      next.setAttribute('role', 'combobox');
      next.setAttribute('aria-label', 'Search Wikipedia');
      next.value = original.value;
      original.replaceWith(next);
    };
  </script>`;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: [] });
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

const searchbox: LocatorChain = {
  segments: [
    {
      kind: 'getByRole',
      role: 'searchbox',
      options: { name: { kind: 'literal', value: 'Search Wikipedia' } },
    },
  ],
};

/** The real Playwright object behind each wrapper, so wrappers never reach Playwright itself. */
const unwrapped = new WeakMap<object, object>();

function unwrapArg(arg: unknown): unknown {
  if (typeof arg !== 'object' || arg === null) return arg;
  const real = unwrapped.get(arg);
  if (real !== undefined) return real;
  if ('hasNot' in arg) return { ...arg, hasNot: unwrapArg(arg.hasNot) };
  return arg;
}

/**
 * The page, with `before()` awaited right before every locator `press` reaches Playwright — i.e.
 * after the adapter has counted its target and chosen the locator to act on. That is exactly the
 * window the live re-render fell into, made deterministic.
 */
function withBeforePress<T extends object>(target: T, before: () => Promise<void>): T {
  const proxy = new Proxy(target, {
    get(real, property) {
      const value: unknown = Reflect.get(real, property, real);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const realArgs = args.map(unwrapArg);
        if (property === 'press') {
          return before().then(() => Reflect.apply(value, real, realArgs) as unknown);
        }
        const result: unknown = Reflect.apply(value, real, realArgs);
        const isLocator =
          typeof result === 'object' &&
          result !== null &&
          !(result instanceof Promise) &&
          typeof (result as { press?: unknown }).press === 'function';
        return isLocator ? withBeforePress(result, before) : result;
      };
    },
  });
  unwrapped.set(proxy, target);
  return proxy;
}

function adapterFor(target: object, totals: number[] = []) {
  return createPlaywrightAdapter({
    page: target as unknown as PageLike,
    defaultTimeoutMs: 2_000,
    onVisibleOnlyResolution: (total) => totals.push(total),
  });
}

describe('VAL-041 — actions on a re-rendered control in real Chromium', () => {
  it('fills, then presses Enter on an input replaced by an identical node while typing', async () => {
    await page.setContent(REPLACED_ON_INPUT);
    const adapter = adapterFor(page);
    const handle = await adapter.locate(searchbox);
    await adapter.fill(handle, 'Alan Turing');
    // The node typed into is gone; the press must act on its replacement.
    expect(await page.locator('input[data-generation="2"]').count()).toBe(1);
    await adapter.press(handle, 'Enter');

    expect(await page.locator('#sent').textContent()).toBe('sent:Alan Turing');
  });

  it('presses Enter on the combobox that replaced the counted searchbox (Wikipedia/Codex)', async () => {
    await page.setContent(ROLE_SWAP);
    let swaps = 0;
    const racing = withBeforePress(page, async () => {
      swaps += 1;
      if (swaps === 1) await page.evaluate('window.swap()');
    });
    const totals: number[] = [];
    const adapter = adapterFor(racing, totals);
    const handle = await adapter.locate(searchbox);
    await adapter.fill(handle, 'Alan Turing');
    const started = performance.now();
    await adapter.press(handle, 'Enter');

    expect(swaps).toBe(1);
    // The swap happened: no searchbox is left in the accessibility tree, only the combobox.
    expect(await page.getByRole('searchbox', { name: 'Search Wikipedia' }).count()).toBe(0);
    expect(await page.getByRole('combobox', { name: 'Search Wikipedia' }).count()).toBe(1);
    expect(await page.locator('#sent').textContent()).toBe('sent:Alan Turing');
    // Acted on the next retry, not after waiting out the timeout.
    expect(performance.now() - started).toBeLessThan(1_500);
    // One match each time: visible-only resolution changed nothing, so nothing is logged.
    expect(totals).toEqual([]);
  });

  it('keeps the authored searchbox when a same-name combobox is also visible (no new ambiguity)', async () => {
    await page.setContent(
      `<input type="search" aria-label="Search Wikipedia"><input role="combobox" aria-label="Search Wikipedia">${SENT_ON_ENTER}`,
    );
    const adapter = adapterFor(page);
    const handle = await adapter.locate(searchbox);
    await adapter.fill(handle, 'Alan Turing');
    await adapter.press(handle, 'Enter');

    expect(await page.locator('input[type="search"]').inputValue()).toBe('Alan Turing');
    expect(await page.locator('input[role="combobox"]').inputValue()).toBe('');
    expect(await page.locator('#sent').textContent()).toBe('sent:Alan Turing');
  });
});
