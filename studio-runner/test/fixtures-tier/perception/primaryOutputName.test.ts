import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Native grounding/locator conformance in the real-browser perception tier.
import type { Browser, Locator } from 'playwright';

import { buildPublicLocator, synthesize, type LocatorRoot } from '../../../src/run/locatorSynth.js';
import { internalsOf, perceive } from '../../../src/run/perceive.js';
import { collectPage, type CollectedPage } from '../../../src/run/perceptionInPage.js';
import { runOnEngine } from '../../../src/run/playwrightEngine.js';
import { PrivateInventory } from '../../../src/run/privateInventory.js';
import { backendIdsOfLocator, cdpOf, domHash, guardDist, launchChromium, openPage } from './harness.js';

guardDist();
const VALUE = 'Zephyr Quartz Ninefold 7341';
const NAME = 'Order reference';
const output = (attrs = '', text = VALUE): string => `<output aria-label="${NAME}" ${attrs}>${text}</output>`;

describe('native primary output name provenance', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchChromium(); });
  afterAll(async () => { await browser.close(); });

  async function scenario(html: string, values = [VALUE]) {
    const page = await openPage(browser, `<main aria-label="Operations">${html}<button>Keep</button></main>`);
    const cdp = await cdpOf(page);
    const inventory = new PrivateInventory();
    const before = await domHash(cdp);
    const perception = await perceive({ cdp, inventory, privateValues: values });
    const serialized = JSON.stringify(perception);
    const native = async (): Promise<CollectedPage> => await runOnEngine(perception.engine, collectPage) as CollectedPage;
    return { page, cdp, inventory, perception, serialized, native, before, close: () => page.context().close() };
  }

  it('native primary aria label wins over a different associated output label on the same element', async () => {
    const s = await scenario(`<label for="order">Different native label</label>${output('id="order"')}`, []);
    try {
      expect(await s.page.getByRole('status', { name: NAME, exact: true }).ariaSnapshot()).toContain(`status "${NAME}"`);
      expect(Object.values(s.perception.facts).find((f) => f.role === 'status')?.name).toBe(NAME);
      const collected = await s.native();
      const facts = Object.values(collected.facts).filter((f) => f.tag === 'output');
      expect(facts).toHaveLength(1);
      expect(facts[0]?.primaryNameSource).toBe('PRIMARY_ARIA_LABEL');
      expect(await domHash(s.cdp)).toBe(s.before);
    } finally { await s.close(); }
  });

  it('retains only the public output name after production inventory withholding with unique native identity', async () => {
    const s = await scenario(output());
    try {
      const refs = Object.entries(s.perception.facts).filter(([, f]) => f.role === 'status' && f.name === NAME);
      expect(refs).toHaveLength(1);
      const ref = refs[0]?.[0];
      if (!ref) throw new Error('missing named source');
      expect(refs[0]?.[1]).not.toHaveProperty('text');
      expect(internalsOf(s.perception)?.byRef.get(ref)).toMatchObject({ primaryName: true, withheld: true, cleared: true, ownText: '' });
      const result = await synthesize({ perception: s.perception, inventory: s.inventory, ref });
      expect(result).toMatchObject({ ok: true, tier: 'role', identity: { role: 'status', name: NAME } });
      if (!result.ok) throw new Error('missing exact locator');
      const publicLocator = buildPublicLocator(s.page as unknown as LocatorRoot, result.locator) as Locator;
      expect(await publicLocator.count()).toBe(1);
      expect(await backendIdsOfLocator(s.cdp, s.page.getByRole('status', { name: NAME, exact: true }))).toEqual([s.perception.backendNodeIds[ref]]);
      expect(s.serialized + JSON.stringify(result)).not.toContain(VALUE);
      expect(await domHash(s.cdp)).toBe(s.before);
    } finally { await s.close(); }
  });

  it('declines labelledby absence mismatch override focusability and spoofed provenance', async () => {
    for (const html of [
      output('aria-labelledby="label"') + '<span id="label">Order reference</span>', output('aria-labelledby="missing"'), output('aria-labelledby=""'),
      `<output>${VALUE}</output>`, `<output aria-label="">${VALUE}</output>`, `<output aria-label="Order\u200breference">${VALUE}</output>`,
      output('role="status"'), output('role="region"'), output('tabindex="0"'), output('autofocus'), output('style="cursor:pointer"'), output('onclick="void 0"'),
      output('placeholder="Public prompt"'), output('href="/public"'),
      `<div role="status" aria-label="${NAME}" data-primary-name-source="PRIMARY_ARIA_LABEL">${VALUE}</div>`, `<output data-primary-name-source="PRIMARY_ARIA_LABEL">${VALUE}</output>`,
    ]) {
      const s = await scenario(html);
      try {
        expect(Object.values((await s.native()).facts).some((f) => f.primaryNameSource !== undefined)).toBe(false);
        expect(s.serialized).not.toContain(VALUE);
      } finally { await s.close(); }
    }
  });

  it('declines sensitive editable password and value control contexts without reading output value', async () => {
    for (const html of [output('data-sensitive'), output('contenteditable="true"'), output('aria-valuetext="classified"'), output('aria-valuenow="7"'),
      `<div data-sensitive>${output()}</div>`, `<div contenteditable="true">${output()}</div>`, `<button>${output()}</button>`, `<div role="textbox">${output()}</div>`,
      `<input type="password" aria-label="${NAME}" value="${VALUE}">`, `<input aria-label="${NAME}" value="${VALUE}">`, `<textarea aria-label="${NAME}">${VALUE}</textarea>`,
      `<select aria-label="${NAME}"><option selected>${VALUE}</option></select>`, output('hidden'),
    ]) {
      const s = await scenario(html);
      try {
        const collected = await s.native();
        expect(Object.values(collected.facts).some((f) => f.primaryNameSource !== undefined)).toBe(false);
        expect(s.serialized).not.toContain(VALUE);
      } finally { await s.close(); }
    }
    // Page-world property interception is not a source of naming/value proof in the isolated collector.
    const s = await scenario(output() + '<script>Object.defineProperty(HTMLOutputElement.prototype,"value",{get(){throw Error("OUTPUT_VALUE_READ");}})</script>');
    try { expect(Object.values(s.perception.facts).some((f) => f.name === NAME)).toBe(true); } finally { await s.close(); }
  });

  it('requires full bounded Unicode names including literal ellipsis without truncation recovery', async () => {
    for (const [label, retained] of [['x'.repeat(255), true], ['😀'.repeat(256), true], ['x'.repeat(257), false], ['Literal…', true], ['  Order   reference  ', true], ['Order\u200breference', false], ['bad\uD800', false]] as const) {
      const s = await scenario(`<output aria-label="${label}">${VALUE}</output>`);
      try {
        const collected = await s.native();
        expect(Object.values(collected.facts).some((f) => f.primaryNameSource === 'PRIMARY_ARIA_LABEL')).toBe(retained);
        expect(s.serialized).not.toContain(VALUE);
      } finally { await s.close(); }
    }
  });

  it('withholds direct aliases split fragments and ghost joins from every public serialization sink', async () => {
    const aliases = [VALUE, VALUE.toUpperCase(), encodeURIComponent(VALUE), VALUE.replaceAll(' ', '+'), encodeURIComponent(encodeURIComponent(VALUE)), 'Ｚephyr Quartz Ninefold 7341'];
    for (const label of aliases) {
      const s = await scenario(`<output aria-label="${label}">${VALUE}</output>`);
      try {
        expect(s.serialized).not.toContain(label);
        for (const ref of Object.keys(s.perception.facts)) expect(JSON.stringify(await synthesize({ perception: s.perception, inventory: s.inventory, ref }))).not.toContain(label);
      } finally { await s.close(); }
    }
    for (const html of [
      `<output aria-label="Quartz"><span>Zephyr </span><span> Ninefold 7341</span></output>`,
      `<p>Marsh</p><output aria-label="Quillon">${VALUE}</output>`,
      output('', '<span>Zephyr </span><span>Quartz </span><span>Ninefold </span><span>7341</span>'),
    ]) {
      const s = await scenario(html, [VALUE, 'Marsh Quillon']);
      try {
        expect(s.serialized).not.toContain(VALUE);
        if (html.includes('Quillon')) expect(s.serialized).not.toContain('Quillon');
        if (html.includes('aria-label="Quartz"')) expect(s.serialized).not.toContain('Quartz');
      } finally { await s.close(); }
    }
  });

  it('duplicate public output names never become a false unique match', async () => {
    const s = await scenario(output() + output());
    try {
      expect(await s.page.getByRole('status', { name: NAME, exact: true }).count()).toBe(2);
      for (const [ref, fact] of Object.entries(s.perception.facts).filter(([, f]) => f.role === 'status')) {
        expect(fact.name).toBe(NAME);
        const result = await synthesize({ perception: s.perception, inventory: s.inventory, ref });
        if (result.ok) {
          expect(result.tier).not.toBe('role');
          expect(await (buildPublicLocator(s.page as unknown as LocatorRoot, result.locator) as Locator).count()).toBe(1);
        }
      }
    } finally { await s.close(); }
  });

  it('content derived private story title remains blank with no output provenance', async () => {
    const s = await scenario(`<a href="/item">${VALUE}</a>`);
    try {
      expect(Object.values(s.perception.facts).filter((f) => f.role === 'link').every((f) => f.name === '')).toBe(true);
      expect(s.serialized).not.toContain(VALUE);
    } finally { await s.close(); }
  });
});
