import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier only.
import type { Browser } from 'playwright';

import type { ObservationExport } from '../../../src/run/observationTypes.js';
import { guardDist, launchChromium } from './harness.js';
import { codeOf, factOf, html, invoke, open, prepare, serve, TestControl, type Opened, type Served } from './cutover-support.js';

// Retained privacy and no-effect properties from the removed collector fixture. These tests use
// real controls/isolated observation and do not seed their automatically discovered private values.
guardDist();
const CLICK = { kind: 'click' } as const;

async function exportedWithLocators(created: Opened, exported: ObservationExport): Promise<string> {
  const locators: unknown[] = [];
  let preparedTargets = 0;
  for (const ref of Object.keys(exported.observation.facts)) {
    try {
      locators.push(await created.session.prepareTarget({
        ref, documentId: exported.observation.documentId, generation: exported.observation.generation,
        origin: exported.observation.origin, operation: CLICK, authoredLiteral: null,
      }));
      preparedTargets++;
    } catch (error) {
      locators.push({ closed: error instanceof Error ? error.message : 'UNKNOWN' });
    }
  }
  expect(locators.length).toBeGreaterThan(0);
  expect(preparedTargets, 'the durable locator scan must include a successful ordinary target').toBeGreaterThan(0);
  return JSON.stringify({ wire: exported, locators });
}

describe('retained observation privacy and CSSOM guards on real Chromium', () => {
  let browser: Browser;
  let served: Served;
  const opened: Opened[] = [];
  beforeAll(async () => {
    browser = await launchChromium();
    served = await serve({
      '/sensitive': html('<section data-sensitive><span id="outer-private">OUTER_PRIVATE_CANARY</span></section><div id="safe-host"></div><div data-sensitive id="private-host"></div><div id="slot-host"><span id="slotted-private">SLOT_PRIVATE_CANARY</span></div><input aria-labelledby="slotted-private"><div id="label-host" data-sensitive><span id="sensitive-label">LABEL_PRIVATE_CANARY</span></div><input aria-labelledby="sensitive-label"><label data-sensitive for="sensitive-native">NATIVE_PRIVATE_CANARY</label><input id="sensitive-native"><button>Public <span data-sensitive>INLINE_PRIVATE_CANARY</span></button><button>Continue</button>'),
      '/shadow-value': html('<div id="host"></div><button>Continue</button><button>Proceed</button>'),
      '/hostile': html('<button>Continue</button><button>RETAINED_VAULT_PRIVATE_CANARY</button><input value="RETAINED_INPUT_PRIVATE_CANARY"><button>RETAINED_INPUT_PRIVATE_CANARY</button>'),
      '/identity': html('<button onclick="window.clicks=(window.clicks||0)+1">Continue</button>'),
      '/cssom': html('<button onclick="window.clicks=(window.clicks||0)+1">Continue</button>', '<style>button { display:block }</style>'),
    });
  });
  afterAll(async () => {
    for (const created of opened) await created.close();
    await served.close();
    await browser.close();
  });
  const page = async (path: string, knownSecrets: string[] = []): Promise<Opened> => {
    const created = await open(browser, served, path, { knownSecrets });
    opened.push(created);
    return created;
  };

  it('withholds data-sensitive shadow hosts, assigned slots, label aliases and inline fragments', async () => {
    const created = await page('/sensitive');
    await created.page.evaluate(() => {
      document.getElementById('safe-host')?.attachShadow({ mode: 'open' }).append(document.createElement('input'));
      document.getElementById('safe-host')?.shadowRoot?.querySelector('input')?.setAttribute('aria-labelledby', 'outer-private');
      const host = document.getElementById('private-host');
      if (host) host.attachShadow({ mode: 'open' }).innerHTML = '<button>SHADOW_PRIVATE_CANARY</button>';
      const slotHost = document.getElementById('slot-host');
      if (slotHost) slotHost.attachShadow({ mode: 'open' }).innerHTML = '<section data-sensitive><slot></slot></section>';
    });
    const exported = await created.session.observe(undefined, false);
    const bytes = await exportedWithLocators(created, exported);
    for (const canary of ['OUTER_PRIVATE_CANARY', 'SHADOW_PRIVATE_CANARY', 'SLOT_PRIVATE_CANARY', 'LABEL_PRIVATE_CANARY', 'NATIVE_PRIVATE_CANARY', 'INLINE_PRIVATE_CANARY']) {
      expect(bytes.includes(canary), `private channel ${canary}`).toBe(false);
    }
    expect(factOf(exported, 'button', 'Continue')[0]).toMatch(/^e\d+$/u);
  });

  it('an automatically discovered shadow control value withholds a matching action caption', async () => {
    const created = await page('/shadow-value');
    await created.page.evaluate(() => {
      const host = document.getElementById('host');
      if (host) host.attachShadow({ mode: 'open' }).innerHTML = '<input value="Continue">';
    });
    const exported = await created.session.observe(undefined, false);
    const bytes = await exportedWithLocators(created, exported);
    expect(bytes.includes('Continue')).toBe(false);
    expect(factOf(exported, 'button', 'Proceed')[0]).toMatch(/^e\d+$/u);
  });

  it('hostile main-world prototypes cannot intercept caller secrets or forge control inventory', async () => {
    const created = await page('/hostile', ['RETAINED_VAULT_PRIVATE_CANARY']);
    await created.page.evaluate(() => {
      const state = window as unknown as { intercepted: string[]; forgedValueReads: number };
      state.intercepted = [];
      state.forgedValueReads = 0;
      const intercept = (values: unknown[]) => {
        // eslint-disable-next-line @typescript-eslint/prefer-for-of -- The iterator is the hostile hook under test.
        for (let index = 0; index < values.length; index++) {
          const value = values[index];
          if (typeof value === 'string' && value.includes('RETAINED_VAULT_')) state.intercepted.push(value);
        }
      };
      const iterator = Array.prototype[Symbol.iterator];
      const filter = Array.prototype.filter;
      Object.defineProperty(Array.prototype, Symbol.iterator, { value: function(this: unknown[]) { intercept(this); return iterator.call(this); }, configurable: true });
      Object.defineProperty(Array.prototype, 'filter', { get(this: unknown[]) { intercept(this); return filter; }, configurable: true });
      Object.defineProperty(Element.prototype, 'getAttribute', { value: () => 'FORGED_ATTRIBUTE', configurable: true });
      Object.defineProperty(HTMLInputElement.prototype, 'value', { get: () => { state.forgedValueReads++; return 'FORGED_VALUE'; }, configurable: true });
      Object.defineProperty(window, 'getComputedStyle', { value: () => ({ display: 'none', visibility: 'hidden' }), configurable: true });
      Object.defineProperty(window, 'MutationObserver', { value: class { observe() { return undefined; } disconnect() { return undefined; } takeRecords() { return []; } }, configurable: true });
    });
    const exported = await created.session.observe(undefined, false);
    const bytes = await exportedWithLocators(created, exported);
    for (const canary of ['RETAINED_VAULT_PRIVATE_CANARY', 'RETAINED_INPUT_PRIVATE_CANARY', 'FORGED']) expect(bytes.includes(canary)).toBe(false);
    expect(await created.page.evaluate(() => (window as unknown as { intercepted: string[] }).intercepted)).toEqual([]);
    expect(await created.page.evaluate(() => (window as unknown as { forgedValueReads: number }).forgedValueReads)).toBe(0);
    const prepared = await prepare(created, 'button', 'Continue', CLICK, null, exported);
    const control = new TestControl();
    await created.page.locator('button').first().evaluate(element => { element.replaceWith(element.cloneNode(true)); });
    expect(await codeOf(invoke(created, prepared, CLICK, { control }))).toBe('TARGET_CHANGED');
    expect(control.fenced).toBe(0);
  });

  it('a same-document hash change preserves document identity and advances observation generation', async () => {
    const created = await page('/identity');
    const first = await created.session.observe(undefined, false);
    const [ref] = factOf(first, 'button', 'Continue');
    await created.page.evaluate(() => { location.hash = 'same-document'; });
    await created.page.waitForURL('**#same-document');
    const next = await created.session.observe(undefined, false);
    expect(next.observation.documentId).toBe(first.observation.documentId);
    expect(next.observation.generation).toBeGreaterThan(first.observation.generation);
    expect(await codeOf(created.session.prepareTarget({ ref, documentId: first.observation.documentId,
      generation: first.observation.generation, origin: first.observation.origin,
      operation: CLICK, authoredLiteral: null }))).toBe('TARGET_CHANGED');
  });

  it('document.open replacement changes document identity and never acts on the replaced prepared node', async () => {
    const created = await page('/identity');
    const prepared = await prepare(created, 'button', 'Continue', CLICK);
    const originalUrl = created.page.url();
    await created.page.evaluate(() => {
      document.open();
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- Exercise actual document.open/write replacement without a URL navigation.
      document.write('<!doctype html><html><body><button onclick="window.clicks=(window.clicks||0)+1">Continue</button></body></html>');
      document.close();
    });
    expect(created.page.url()).toBe(originalUrl);
    const control = new TestControl();
    expect(await codeOf(invoke(created, prepared, CLICK, { control }))).toBe('TARGET_CHANGED');
    expect(control.fenced).toBe(0);
    expect(await created.page.evaluate(() => (window as unknown as { clicks?: number }).clicks ?? 0)).toBe(0);
    const next = await created.session.observe(undefined, false);
    expect(next.observation.documentId).not.toBe(prepared.exported.observation.documentId);
    expect(next.observation.generation).toBeGreaterThan(prepared.exported.observation.generation);
    expect(factOf(next, 'button', 'Continue')[0]).toMatch(/^e\d+$/u);
  });

  it('CSSOM hiding without a DOM mutation refuses the prepared action before any click', async () => {
    const created = await page('/cssom');
    await created.page.evaluate(() => {
      const state = window as unknown as { mutationCount: number; clicks: number };
      state.mutationCount = 0; state.clicks = 0;
      new MutationObserver(records => { state.mutationCount += records.length; }).observe(document, { subtree: true, attributes: true, childList: true, characterData: true });
    });
    const prepared = await prepare(created, 'button', 'Continue', CLICK);
    expect((await created.session.resolveTarget({ resolved: prepared.resolved, origin: created.origin, operation: CLICK, readRuleId: null })).kind).toBe('READY');
    await created.page.evaluate(async () => {
      const sheet = document.styleSheets[0];
      if (!sheet) throw new Error('stylesheet missing');
      sheet.insertRule('button { display:none }', sheet.cssRules.length);
      await new Promise(resolve => { setTimeout(resolve, 0); });
    });
    expect(await created.page.evaluate(() => (window as unknown as { mutationCount: number }).mutationCount)).toBe(0);
    expect(await created.page.getByRole('button', { name: 'Continue', exact: true }).count()).toBe(0);
    const control = new TestControl();
    expect(await codeOf(invoke(created, prepared, CLICK, { control }))).toBe('TARGET_CHANGED');
    expect(control.fenced).toBe(0);
    expect(await created.page.evaluate(() => (window as unknown as { clicks: number }).clicks)).toBe(0);
  });
});
