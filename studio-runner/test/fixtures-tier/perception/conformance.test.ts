import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser, Page } from 'playwright';

import { perceive, type Perception } from '../../../src/run/perceive.js';
import { buildPublicLocator, synthesize, toEngineSelector, validateLocator, type Locator, type LocatorRoot } from '../../../src/run/locatorSynth.js';
import { backendIdsForSelector, openEngine, type CdpSession, type PerceptionEngine } from '../../../src/run/playwrightEngine.js';
import { PrivateInventory } from '../../../src/run/privateInventory.js';
import { backendIdsOfLocator, cdpOf, guardDist, launchChromium, openPage } from './harness.js';

/**
 * AC3 (engine side) and AC4 (ADR-SC-007 D4): for every grammar step type, the pinned engine and the public Playwright API
 * match the same element set; synthesis yields a locator that resolves to exactly one element, the element of the ref, for
 * named, duplicate-named, icon-only and table-cell targets; and values that stress quoting resolve identically on both paths.
 */

guardDist();

const NBSP = ' ';
const HTML = `<body><main>
  <form aria-label="Login">
    <label for="u">Email</label><input id="u" name="email" type="email" placeholder="you@example.test" data-testid="email-input" title="Your email">
    <button type="submit">Sign in</button>
    <button type="button" aria-label="Help"><svg width="8" height="8" aria-hidden="true"></svg></button>
  </form>
  <section aria-label="People">
    <table aria-label="Team"><thead><tr><th>Name</th><th>Action</th></tr></thead><tbody>
      <tr><td>Alice</td><td><button>Edit</button></td></tr><tr><td>Bob</td><td><button>Edit</button></td></tr><tr><td>Carol</td><td><button>Edit</button></td></tr></tbody></table>
    <ul><li><a href="#a">Docs</a></li><li><a href="#b">Docs</a></li></ul>
  </section>
  <p>Plain text</p>
</main></body>`;

describe('AC3 / AC4: the pinned engine and the public API agree', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchChromium();
  });
  afterAll(async () => {
    await browser.close();
  });

  async function open(html: string): Promise<{ page: Page; cdp: CdpSession; engine: PerceptionEngine }> {
    const page = await openPage(browser, html);
    const cdp = await cdpOf(page);
    return { page, cdp, engine: await openEngine(cdp) };
  }
  /** Element sets of both paths, as backend node ids in document order. */
  async function bothSets(page: Page, cdp: CdpSession, engine: PerceptionEngine, locator: Locator): Promise<{ engine: number[]; publicApi: number[] }> {
    validateLocator(locator);
    return {
      engine: await backendIdsForSelector(engine, toEngineSelector(locator)),
      publicApi: await backendIdsOfLocator(cdp, buildPublicLocator(page as unknown as LocatorRoot, locator) as never),
    };
  }

  describe('every grammar step type', () => {
    const cases: [string, Locator, number][] = [
      ['testId', [{ by: 'testId', value: 'email-input' }], 1],
      ['role with a name', [{ by: 'role', role: 'button', name: 'Sign in', exact: true }], 1],
      ['role with a name, several matches', [{ by: 'role', role: 'button', name: 'Edit', exact: true }], 3],
      ['role without a name', [{ by: 'role', role: 'link' }], 2],
      ['label', [{ by: 'label', value: 'Email', exact: true }], 1],
      ['label from aria-label', [{ by: 'label', value: 'Help', exact: true }], 1],
      ['placeholder', [{ by: 'placeholder', value: 'you@example.test', exact: true }], 1],
      ['text', [{ by: 'text', value: 'Plain text', exact: true }], 1],
      ['text is exact, not a substring', [{ by: 'text', value: 'Plain', exact: true }], 0],
      ['role name is exact, not a substring', [{ by: 'role', role: 'button', name: 'Sign', exact: true }], 0],
      ['scope then role', [{ by: 'scope', role: 'form', name: 'Login', exact: true }, { by: 'role', role: 'button' }], 2],
      ['tag then role', [{ by: 'tag', tag: 'ul' }, { by: 'role', role: 'link' }], 2],
      ['filterHas', [{ by: 'tag', tag: 'tr' }, { by: 'filterHas', has: [{ by: 'text', value: 'Bob', exact: true }] }, { by: 'role', role: 'button', name: 'Edit', exact: true }], 1],
      ['attr (name)', [{ by: 'attr', tag: 'input', attrs: [{ name: 'name', value: 'email' }] }], 1],
      ['attr (id and type)', [{ by: 'attr', tag: 'input', attrs: [{ name: 'id', value: 'u' }, { name: 'type', value: 'email' }] }], 1],
      ['attr (aria-label)', [{ by: 'attr', tag: 'button', attrs: [{ name: 'aria-label', value: 'Help' }] }], 1],
      ['attr (title)', [{ by: 'attr', tag: 'input', attrs: [{ name: 'title', value: 'Your email' }] }], 1],
      ['nth last', [{ by: 'role', role: 'link', name: 'Docs', exact: true }, { by: 'nth', index: 1 }], 1],
      ['nth beyond the matches', [{ by: 'role', role: 'link', name: 'Docs', exact: true }, { by: 'nth', index: 7 }], 0],
    ];
    it.each(cases)('%s: both paths match the same element set', async (_label, locator, expectedCount) => {
      const { page, cdp, engine } = await open(HTML);
      try {
        const sets = await bothSets(page, cdp, engine, locator);
        expect(sets.publicApi).toEqual(sets.engine);
        expect(sets.engine).toHaveLength(expectedCount);
      } finally {
        await page.context().close();
      }
    });
  });

  describe('values that stress quoting', () => {
    const values: [string, string][] = [
      ['a quote', 'say "hi" now'],
      ['a backslash', 'back\\slash'],
      ['>>', 'a >> b'],
      ['a closing bracket', 'item [2] ]'],
      ['a percent sign', '100% done'],
      ['an emoji', 'launch 🚀 now'],
      ['a non-breaking space', `New${NBSP}York`],
      ['200 characters', `${'w'.repeat(190)} end 1234`.slice(0, 200)],
    ];
    const escapeHtml = (text: string): string => text.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;');

    it.each(values)('%s resolves to the same elements on both paths for every value-carrying step', async (_label, value) => {
      const html = `<body><button>${escapeHtml(value)}</button><label>${escapeHtml(value)}<input></label><input placeholder="${escapeHtml(value)}" title="${escapeHtml(value)}" name="${escapeHtml(value)}" data-testid="${escapeHtml(value)}"><p>${escapeHtml(value)}</p></body>`;
      const { page, cdp, engine } = await open(html);
      try {
        const locators: Locator[] = [
          [{ by: 'role', role: 'button', name: value, exact: true }],
          [{ by: 'label', value, exact: true }],
          [{ by: 'placeholder', value, exact: true }],
          [{ by: 'text', value, exact: true }],
          [{ by: 'testId', value }],
          [{ by: 'attr', tag: 'input', attrs: [{ name: 'title', value }] }],
          [{ by: 'attr', tag: 'input', attrs: [{ name: 'name', value }, { name: 'title', value }] }],
          [{ by: 'scope', role: 'button', name: value, exact: true }],
        ];
        let matched = 0;
        for (const locator of locators) {
          const sets = await bothSets(page, cdp, engine, locator);
          expect(sets.publicApi, JSON.stringify(locator)).toEqual(sets.engine);
          matched += sets.engine.length;
        }
        expect(matched, 'the stressed value must find elements, or the comparison is vacuous').toBeGreaterThanOrEqual(6);
      } finally {
        await page.context().close();
      }
    });

    it('refuses a 201-character value before either path runs', () => {
      const tooLong: Locator = [{ by: 'text', value: 'w'.repeat(201), exact: true }];
      expect(() => { validateLocator(tooLong); }).toThrow('GRAMMAR_INVALID:TEXT_VALUE');
      expect(() => toEngineSelector(tooLong)).toThrow('GRAMMAR_INVALID:TEXT_VALUE');
      expect(() => buildPublicLocator({} as LocatorRoot, tooLong)).toThrow('GRAMMAR_INVALID:TEXT_VALUE');
    });
  });

  describe('synthesis: one element, the same element as the ref', () => {
    let perceptionPage: Page;
    let perception: Perception;
    let cdp: CdpSession;
    const inventory = new PrivateInventory();

    beforeAll(async () => {
      perceptionPage = await openPage(browser, HTML);
      cdp = await cdpOf(perceptionPage);
      perception = await perceive({ cdp, inventory });
    });
    afterAll(async () => {
      await perceptionPage.context().close();
    });

    const refs = (predicate: (fact: { role: string; name: string }) => boolean): string[] => Object.entries(perception.facts).filter(([, fact]) => predicate(fact)).map(([ref]) => ref);

    async function resolvesToTheRef(ref: string): Promise<{ tier: string; names: string | null }> {
      const result = await synthesize({ perception, ref, inventory });
      expect(result.ok, `${ref}: ${JSON.stringify(result)}`).toBe(true);
      if (!result.ok) throw new Error('unreachable');
      validateLocator(result.locator);
      const found = await backendIdsOfLocator(cdp, buildPublicLocator(perceptionPage as unknown as LocatorRoot, result.locator) as never);
      expect(found, `${ref} ${JSON.stringify(result.locator)}`).toEqual([perception.backendNodeIds[ref]]);
      // and the pinned engine says the same
      expect(await backendIdsForSelector(perception.engine, toEngineSelector(result.locator))).toEqual([perception.backendNodeIds[ref]]);
      return { tier: result.tier, names: result.identity.name };
    }

    it('a named control', async () => {
      const [signIn] = refs((fact) => fact.role === 'button' && fact.name === 'Sign in');
      expect(signIn).toBeDefined();
      expect(await resolvesToTheRef(signIn ?? '')).toEqual({ tier: 'role', names: 'Sign in' });
    });

    it('a test id wins over everything else', async () => {
      const [email] = refs((fact) => fact.role === 'textbox' && fact.name === 'Email');
      expect(await resolvesToTheRef(email ?? '')).toMatchObject({ tier: 'testId' });
    });

    it('duplicate-named controls each resolve to their own element', async () => {
      const edits = refs((fact) => fact.role === 'button' && fact.name === 'Edit');
      expect(edits).toHaveLength(3);
      const seen = new Set<string>();
      for (const ref of edits) {
        const outcome = await resolvesToTheRef(ref);
        expect(['scoped', 'filterHas', 'nth', 'attribute']).toContain(outcome.tier);
        seen.add(String(perception.backendNodeIds[ref]));
      }
      expect(seen.size).toBe(3);
      const docs = refs((fact) => fact.role === 'link' && fact.name === 'Docs');
      expect(docs).toHaveLength(2);
      for (const ref of docs) await resolvesToTheRef(ref);
    });

    it('an icon-only control (no visible text) is found through its aria-label', async () => {
      const [help] = refs((fact) => fact.role === 'button' && fact.name === 'Help');
      expect(await resolvesToTheRef(help ?? '')).toMatchObject({ names: 'Help' });
    });

    it('a table cell', async () => {
      const cells = refs((fact) => fact.role === 'cell');
      expect(cells.length).toBeGreaterThanOrEqual(3);
      for (const ref of cells) await resolvesToTheRef(ref);
    });

    it('every shown ref that synthesis can resolve resolves to exactly its own element', async () => {
      let ok = 0;
      for (const ref of Object.keys(perception.facts)) {
        const result = await synthesize({ perception, ref, inventory });
        if (!result.ok) {
          expect(['NO_VERIFIED_LOCATOR', 'LOCATOR_GENERATED_ONLY', 'REF_UNRESOLVED']).toContain(result.reason);
          continue;
        }
        ok++;
        const found = await backendIdsOfLocator(cdp, buildPublicLocator(perceptionPage as unknown as LocatorRoot, result.locator) as never);
        expect(found).toEqual([perception.backendNodeIds[ref]]);
      }
      expect(ok).toBeGreaterThan(8);
    });

    it('never returns the engine-generated selector as an executable locator', async () => {
      for (const ref of Object.keys(perception.facts)) {
        const result = await synthesize({ perception, ref, inventory });
        const text = JSON.stringify(result);
        expect(text).not.toContain('internal:');
        if (result.ok) validateLocator(result.locator);
        else expect(result).not.toHaveProperty('locator');
      }
    });
  });
});
