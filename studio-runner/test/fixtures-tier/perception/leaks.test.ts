import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser, Page } from 'playwright';

import { perceive, type Perception } from '../../../src/run/perceive.js';
import { synthesize, toEngineSelector } from '../../../src/run/locatorSynth.js';
import { loadInjectedSourceFrom, type CdpSession } from '../../../src/run/playwrightEngine.js';
import { DEFAULT_WORK_BUDGET_UNITS, PrivateInventory } from '../../../src/run/privateInventory.js';
import { cdpOf, domHash, guardDist, launchChromium, openPage } from './harness.js';

/**
 * AC2 (ADR-SC-007 D6): canaries for leak D1 (values split across pieces) and leak D2 (URL forms), in a real browser.
 * Nothing page-derived that leaves the perception modules may contain a canary, or a fragment of one: not the outline, the
 * facts, the evidence segments, the backend ids, the counters, any synthesized locator (grammar values and engine selector),
 * the identity, or the text of an error.
 */

guardDist();

const CANARY = 'Zephyr-Quartz-Ninefold-7341';
/** The canary in every spelling a page or URL could carry, plus the fragments (5 or more characters). */
function forms(canary: string, fragments: string[] = []): string[] {
  const encoded = encodeURIComponent(canary);
  return [
    canary, canary.toUpperCase(), encoded, encoded.toLowerCase(), encoded.replaceAll('%20', '+'), canary.replaceAll(' ', '+'),
    encodeURIComponent(encoded), canary.replace(/[\s-]+/gu, ''), canary.normalize('NFKD'), ...fragments,
  ].filter((form) => form.length >= 5);
}
function leaked(haystack: string, spelled: string[]): string[] {
  const lower = haystack.toLowerCase();
  return spelled.filter((form) => lower.includes(form.toLowerCase()));
}

interface Scenario {
  perception: Perception;
  everything: string;
  locators: string;
}

async function scenario(browser: Browser, html: string, privateValues: string[], options: { synth?: boolean; inventory?: PrivateInventory; setup?: (page: Page) => Promise<void> } = {}): Promise<Scenario & { page: Page; cdp: CdpSession; inventory: PrivateInventory }> {
  const page = await openPage(browser, html);
  if (options.setup) await options.setup(page);
  const cdp = await cdpOf(page);
  const inventory = options.inventory ?? new PrivateInventory();
  const perception = await perceive({ cdp, inventory, privateValues });
  const everything = JSON.stringify({
    outline: perception.outline, facts: perception.facts, segments: perception.evidenceSegments, ids: perception.backendNodeIds, counters: perception.counters, origin: perception.origin, viewport: perception.viewport,
  });
  let locators = '';
  if (options.synth !== false) {
    for (const ref of Object.keys(perception.facts).slice(0, 60)) {
      const result = await synthesize({ perception, ref, inventory });
      locators += JSON.stringify(result);
      if (result.ok) locators += toEngineSelector(result.locator);
    }
  }
  if (options.synth !== false) expect(locators.length, 'the locator scan must not be vacuous').toBeGreaterThan(50);
  return { perception, everything, locators, page, cdp, inventory };
}

describe('AC2: leak canaries in a real browser', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchChromium();
  });
  afterAll(async () => {
    await browser.close();
  });

  const closeAfter = async (s: { page: Page }): Promise<void> => {
    await s.page.context().close();
  };

  describe('D1: a value split across pieces', () => {
    it.each([
      ['two spans', ['Zephyr-Quart', 'z-Ninefold-7341']],
      ['three spans', ['Zephyr-', 'Quartz-Nine', 'fold-7341']],
      ['four spans', ['Zeph', 'yr-Quartz', '-Ninefo', 'ld-7341']],
    ])('withholds a value split across %s of a paragraph and keeps what is around it', async (_label, pieces) => {
      const html = `<body><h1>Account</h1><p>${pieces.map((piece) => `<span>${piece}</span>`).join('')}</p><p>Other note</p><button>Save</button></body>`;
      const s = await scenario(browser, html, [CANARY]);
      try {
        const spelled = forms(CANARY, pieces);
        expect(leaked(s.everything, spelled)).toEqual([]);
        expect(leaked(s.locators, spelled)).toEqual([]);
        expect(s.perception.outline.text).toContain('button "Save"');
        expect(s.perception.outline.text).toContain('heading "Account"');
        expect(s.perception.outline.text).toContain('Other note');
        expect(s.perception.outline.text).toContain('{value withheld}');
      } finally {
        await closeAfter(s);
      }
    });

    it('withholds a value split inside a link, and a link whose aria-label is harmless while its visible text is split', async () => {
      const html = `<body><nav><a href="/u/1"><span>Zephyr-Quart</span><span>z-Ninefold-7341</span></a>
        <a href="/u/2" aria-label="Profile"><span>Zephyr-</span><span>Quartz-Ninefold-7341</span></a>
        <a href="/home">Home</a></nav></body>`;
      const s = await scenario(browser, html, [CANARY]);
      try {
        expect(leaked(s.everything + s.locators, forms(CANARY, ['Zephyr-Quart', 'z-Ninefold-7341', 'Zephyr-', 'Quartz-Ninefold-7341']))).toEqual([]);
        expect(s.perception.outline.text).toContain('link "Home"');
        expect(s.perception.outline.text).toMatch(/link \[e\d+\] \{ordinal=[12]\/2\} \{value withheld\}/u);
        const privateLinks = Object.values(s.perception.facts).filter(f => f.role === 'link' && f.name === '');
        expect(privateLinks).toHaveLength(2);
        expect(privateLinks.map(f => f.ordinal)).toEqual([{ index: 1, count: 2 }, { index: 2, count: 2 }]);
      } finally {
        await closeAfter(s);
      }
    });

    it('withholds a value split across table cells and leaves the other cells of the row', async () => {
      const html = `<body><table aria-label="People"><thead><tr><th>Name</th><th>Role</th><th>Team</th></tr></thead>
        <tbody><tr><td>Zephyr-Quartz</td><td>-Ninefold-7341</td><td>platform</td></tr><tr><td>Ann</td><td>admin</td><td>core</td></tr></tbody></table></body>`;
      const s = await scenario(browser, html, [CANARY]);
      try {
        expect(leaked(s.everything + s.locators, forms(CANARY, ['Zephyr-Quartz', '-Ninefold-7341']))).toEqual([]);
        expect(s.perception.outline.text).toContain('platform');
        expect(s.perception.outline.text).toContain('cell "Ann"');
        expect(s.perception.outline.text).toContain('cell "admin"');
      } finally {
        await closeAfter(s);
      }
    });

    it('withholds a value carried by an aria-label while the visible text is different, and keeps the visible text of other controls', async () => {
      const html = `<body><button aria-label="${CANARY}">Open</button><button>Close</button><input aria-label="${CANARY} field"><p>${CANARY}</p></body>`;
      const s = await scenario(browser, html, [CANARY]);
      try {
        expect(leaked(s.everything + s.locators, forms(CANARY))).toEqual([]);
        expect(s.perception.outline.text).toContain('button "Close"');
      } finally {
        await closeAfter(s);
      }
    });

    it('prints no row label in {in=} and no row or section name in a locator when the row text spells the value', async () => {
      const html = `<body><table aria-label="Users"><tr><td>Zephyr-Quartz</td><td>-Ninefold-7341</td><td><input aria-label=""><button>Edit</button></td></tr><tr><td>Bob</td><td><input><button>Edit</button></td></tr></table>
        <section aria-label="${CANARY} notes"><button>Notes</button></section></body>`;
      const s = await scenario(browser, html, [CANARY]);
      try {
        expect(leaked(s.everything + s.locators, forms(CANARY, ['Zephyr-Quartz', '-Ninefold-7341']))).toEqual([]);
        expect(s.perception.outline.text).toMatch(/\{in="row[^"]*"\}/u);
      } finally {
        await closeAfter(s);
      }
    });

    it('leaves a heading above a withheld link without its name, but keeps author-named landmarks', async () => {
      const html = `<body><main aria-label="Account"><h2><a href="/p"><span>Zephyr-</span><span>Quartz-Ninefold-7341</span></a></h2><button>Close</button></main></body>`;
      const s = await scenario(browser, html, [CANARY]);
      try {
        expect(leaked(s.everything + s.locators, forms(CANARY, ['Zephyr-', 'Quartz-Ninefold-7341']))).toEqual([]);
        expect(s.perception.outline.text).toContain('main "Account"');
        expect(s.perception.outline.text).toContain('button "Close"');
      } finally {
        await closeAfter(s);
      }
    });
  });

  describe('D1: a node\'s own strings have no order among themselves (F1)', () => {
    const QM = 'Quillon Marsh';
    const FRAGMENTS = ['Quillon', 'Marsh'];
    const spelled = forms(QM, FRAGMENTS);

    const expectHidden = async (html: string, values: string[], fragments: string[], extra?: (outline: string) => void): Promise<void> => {
      const s = await scenario(browser, html, values);
      try {
        expect(leaked(s.everything + s.locators, forms(values[0] ?? QM, fragments))).toEqual([]);
        extra?.(s.perception.outline.text);
      } finally {
        await closeAfter(s);
      }
    };

    it.each([
      ['aria-label Marsh, text Quillon', `<body><button aria-label="Marsh">Quillon</button><button>Other</button></body>`],
      ['aria-label Quillon, text Marsh', `<body><button aria-label="Quillon">Marsh</button><button>Other</button></body>`],
      ['aria-label Marsh, text Quillon in a span', `<body><a href="/x" aria-label="Marsh"><span>Quillon</span></a><button>Other</button></body>`],
      ['aria-label Quillon, text Marsh in a span', `<body><a href="/x" aria-label="Quillon"><span>Marsh</span></a><button>Other</button></body>`],
    ])('name against text: %s', async (_label, html) => {
      await expectHidden(html, [QM], FRAGMENTS, (outline) => {
        expect(outline).toContain('button "Other"');
        expect(outline).toContain('{value withheld}');
      });
    });

    it.each([
      ['placeholder Quillon, aria-label Marsh', `<body><input placeholder="Quillon" aria-label="Marsh"><button>Other</button></body>`],
      ['placeholder Marsh, aria-label Quillon', `<body><input placeholder="Marsh" aria-label="Quillon"><button>Other</button></body>`],
    ])('name against placeholder: %s', async (_label, html) => {
      await expectHidden(html, [QM], FRAGMENTS, (outline) => { expect(outline).toContain('button "Other"'); });
    });

    // The label text stays on the page as a text line of its own (it is a sibling of the field, not part of it), so only
    // the field's own strings (name and placeholder, whose join spells the value) must go.
    it.each([
      ['a label text Marsh and the placeholder Quillon', `<body><label>Marsh <input placeholder="Quillon"></label><button>Other</button></body>`, ['Quillon']],
      ['a label text Quillon and the placeholder Marsh', `<body><label>Quillon <input placeholder="Marsh"></label><button>Other</button></body>`, ['Marsh']],
      ['a placeholder Quillon and the label text Marsh after the input', `<body><label><input placeholder="Quillon"> Marsh</label><button>Other</button></body>`, ['Quillon']],
    ])('placeholder against the text that names the field: %s', async (_label, html, fragments) => {
      await expectHidden(html, [QM], fragments, (outline) => {
        expect(outline).toContain('button "Other"');
        expect(outline).toMatch(/textbox \[e\d+\] \{value withheld\}/u);
      });
    });

    it('three parts: Quillon, then the aria-label Marsh, then Smith in the same link', async () => {
      await expectHidden(
        `<body><a href="/x" aria-label="Marsh"><span>Quillon</span> <span>Smith</span></a><button>Other</button></body>`,
        ['Quillon Marsh Smith'], ['Quillon', 'Marsh', 'Smith'], (outline) => { expect(outline).toContain('button "Other"'); },
      );
    });

    it('three parts: the placeholder, the label text and a text line of the same field', async () => {
      await expectHidden(
        `<body><label>Marsh <input placeholder="Quillon"> Smith</label><button>Other</button></body>`,
        ['Quillon Marsh Smith'], ['Quillon'], (outline) => { expect(outline).toMatch(/textbox \[e\d+\] \{value withheld\}/u); },
      );
    });

    it('withholds a link whose aria-label is the whole value while one of its text lines is a fragment of it (F2)', async () => {
      await expectHidden(
        `<body><a href="/x" aria-label="Quillon Marsh">Quillon</a><a href="/y" aria-label="Other link">Other text</a></body>`,
        [QM], FRAGMENTS, (outline) => {
          expect(outline).toContain('link "Other link"');
          expect(outline).toContain('text "Other text"');
        },
      );
    });

    it('offers no locator that carries a fragment of the value taken from an attribute of the stubbed node (F3)', async () => {
      const html = `<body><form aria-label="Account"><button id="Quillon" title="Quillon" data-testid="q-Quillon" aria-label="Quillon">Marsh</button></form></body>`;
      const s = await scenario(browser, html, [QM]);
      try {
        expect(leaked(s.everything + s.locators, forms(QM, FRAGMENTS))).toEqual([]);
        const ref = Object.keys(s.perception.facts).find((r) => s.perception.facts[r]?.role === 'button');
        expect(ref, 'the stub keeps a ref').toBeDefined();
        const result = await synthesize({ perception: s.perception, ref: ref ?? '', inventory: s.inventory });
        expect(JSON.stringify(result)).not.toMatch(/quillon|marsh/iu);
        expect(spelled.length).toBeGreaterThan(0);
      } finally {
        await closeAfter(s);
      }
    });
  });

  describe('long values are inventoried completely (F4)', () => {
    /** Deterministic pseudo-random text: every 12-character window is distinctive. */
    const noise = (length: number, seed: number): string => {
      let state = seed;
      const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let out = '';
      for (let i = 0; i < length; i++) {
        state = (Math.imul(state, 1103515245) + 12345) >>> 0;
        out += alphabet[(state >>> 16) % alphabet.length] ?? 'a';
      }
      return out;
    };

    it('observes a page with a hidden 12,000-character __VIEWSTATE and withholds a 12-character echo from deep inside it', async () => {
      const viewstate = noise(12_000, 7);
      const echo = viewstate.slice(8_203, 8_203 + 12);
      const html = `<body><form aria-label="Order"><input type="hidden" name="__VIEWSTATE" value="${viewstate}"><p>Reference ${echo} ok</p><p>Kept note</p><button>Save</button></form></body>`;
      const s = await scenario(browser, html, []);
      try {
        expect(leaked(s.everything + s.locators, [echo, viewstate.slice(0, 40)])).toEqual([]);
        expect(s.perception.outline.text).toContain('button "Save"');
        expect(s.perception.outline.text).toContain('Kept note');
        expect(s.perception.outline.text).not.toContain('Reference');
        expect(s.inventory.size).toBeGreaterThan(0);
      } finally {
        await closeAfter(s);
      }
    });

    it('observes a page with a 20,000-character textarea and withholds echoes of it, whole or in part, wherever they sit', async () => {
      const body = noise(20_000, 11);
      const echoes = [body.slice(15_013, 15_013 + 12), body.slice(3, 3 + 12), body.slice(19_988), body.slice(9_000, 9_060)];
      const html = `<body><label>Notes <textarea id="t"></textarea></label>${echoes.map((echo, i) => `<p>Echo ${String(i)} ${echo} end</p>`).join('')}<p>Kept note</p><button>Save</button></body>`;
      const s = await scenario(browser, html, [], { setup: async (page) => { await page.fill('#t', body); } });
      try {
        expect(leaked(s.everything + s.locators, echoes)).toEqual([]);
        expect(s.perception.outline.text).toContain('button "Save"');
        expect(s.perception.outline.text).toContain('Kept note');
        expect(s.perception.outline.text).not.toContain('Echo ');
        expect(s.perception.outline.text).toContain('textbox "Notes"');
      } finally {
        await closeAfter(s);
      }
    });

    it('observes a page with a long contenteditable and withholds a window of it', async () => {
      const body = noise(9_000, 3);
      const echo = body.slice(6_001, 6_001 + 14);
      const html = `<body><div contenteditable="true" aria-label="Editor">${body}</div><p>Seen ${echo}</p><p>Kept note</p><button>Save</button></body>`;
      const s = await scenario(browser, html, []);
      try {
        expect(leaked(s.everything + s.locators, [echo, body.slice(0, 30)])).toEqual([]);
        expect(s.perception.outline.text).toContain('button "Save"');
        expect(s.perception.outline.text).toContain('Kept note');
      } finally {
        await closeAfter(s);
      }
    });

    it('fails closed with PRIVATE_INVENTORY_LIMIT only when the 1 MiB or the 4,096-entry cap is exceeded', async () => {
      const many = await openPage(browser, `<body>${Array.from({ length: 4100 }, (_, i) => `<input name="n${String(i)}" value="v${String(i)}x">`).join('')}</body>`);
      try {
        const inventory = new PrivateInventory();
        const message = await perceive({ cdp: await cdpOf(many), inventory }).catch((error: unknown) => (error as Error).message);
        expect(message).toBe('PRIVATE_INVENTORY_LIMIT');
        expect(() => inventory.matcher()).toThrow('CONTEXT_LOST');
      } finally {
        await many.context().close();
      }
    });
  });

  describe('what hidden means (F8)', () => {
    it('renders aria-hidden content as the spike does, and leaves out [hidden], display:none, visibility:hidden and type=hidden', async () => {
      const html = `<body>
        <div aria-hidden="true"><p>ARIAHIDDEN text</p><button>Aria button</button></div>
        <div hidden><p>HIDDENATTR text</p></div>
        <div style="display:none"><p>DISPLAYNONE text</p></div>
        <div style="visibility:hidden"><p>VISIBILITYHIDDEN text</p></div>
        <input type="hidden" name="h" value="HIDDENINPUT"><p>Visible text</p></body>`;
      const s = await scenario(browser, html, [], { synth: false });
      try {
        const outline = s.perception.outline.text;
        expect(outline).toContain('ARIAHIDDEN text');
        expect(outline).toContain('text "Aria button"');
        expect(outline).toContain('Visible text');
        for (const absent of ['HIDDENATTR', 'DISPLAYNONE', 'VISIBILITYHIDDEN', 'HIDDENINPUT']) expect(s.everything, absent).not.toContain(absent);
      } finally {
        await closeAfter(s);
      }
    });
  });

  describe('D2: URL forms', () => {
    const value = 'Renée Q Roe-4417';
    it('keeps the link and drops its url when the url carries the value as %20, +, double-encoded or mixed-case hex', async () => {
      const urls = [
        '/people/Ren%C3%A9e%20Q%20Roe-4417/home',
        '/search?q=Ren%c3%a9e+Q+Roe-4417&x=1',
        '/r?u=Ren%25C3%25A9e%2520Q%2520Roe-4417',
        '/m/Ren%C3%a9e%20Q%20Roe-4417',
        `/p/${encodeURIComponent(value)}`,
        `/p/${encodeURIComponent(value).toLowerCase()}`,
      ];
      const html = `<body>${urls.map((url, i) => `<a href="${url}">Open ${String(i + 1)}</a>`).join('')}<a href="/safe/path">Safe</a></body>`;
      const s = await scenario(browser, html, [value]);
      try {
        expect(leaked(s.everything + s.locators, [...forms(value), 'C3%A9', 'c3%a9', '%25C3'])).toEqual([]);
        for (let i = 1; i <= urls.length; i++) expect(s.perception.outline.text).toMatch(new RegExp(`link "Open ${String(i)}" \\[e\\d+\\]\\s*(\\n|$)`, 'u'));
        expect(s.perception.outline.text).toMatch(/link "Safe" \[e\d+\] \{url="\/safe\/path"\}/u);
      } finally {
        await closeAfter(s);
      }
    });

    it('withholds a name or placeholder that carries the value in an encoded spelling', async () => {
      const html = `<body><a href="/x" aria-label="see%20Ren%C3%A9e%20Q%20Roe-4417">Link</a><input placeholder="Ren%C3%a9e+Q+Roe-4417" aria-label="Field"><button>Fine</button></body>`;
      const s = await scenario(browser, html, [value]);
      try {
        expect(leaked(s.everything + s.locators, [...forms(value), 'C3%A9', 'c3%a9'])).toEqual([]);
        expect(s.perception.outline.text).toContain('button "Fine"');
      } finally {
        await closeAfter(s);
      }
    });
  });

  describe('what the page holds in controls and sensitive regions', () => {
    const pageWith = `<body>
      <label>Name <input id="n"></label><label>Notes <textarea id="t"></textarea></label>
      <label>Country <select id="s"><option>Alpha</option><option>CANARY_SELECT</option></select></label>
      <label>Range <input id="r" type="range" min="0" max="100"></label><label>Qty <input id="q" type="number"></label>
      <label>Secret <input id="p" type="password"></label><input id="h" type="hidden" value="CANARY_HIDDEN" aria-label="Hid">
      <label>Auto <input id="a" autocomplete="current-password"></label>
      <div id="c" contenteditable="true" aria-label="Editor">CANARY_EDITABLE</div>
      <div data-sensitive><span>CANARY_SENSITIVE</span><button>Reveal</button></div>
      <div role="slider" tabindex="0" aria-label="Volume" aria-valuenow="3" aria-valuetext="CANARY_VALUETEXT">CANARY_SLIDERTEXT</div>
      <button>Save</button><p>Echo CANARY_TYPED here and CANARY_AREA</p></body>`;

    it('never renders a current value, a password, hidden, contenteditable or data-sensitive content', async () => {
      const s = await scenario(browser, pageWith, [], {
        setup: async (page) => {
          await page.fill('#n', 'CANARY_TYPED');
          await page.fill('#t', 'CANARY_AREA');
          await page.selectOption('#s', { label: 'CANARY_SELECT' });
          await page.fill('#r', '77');
          await page.fill('#q', '424242');
          await page.fill('#p', 'CANARY_PASSWORD');
          await page.fill('#a', 'CANARY_AUTOPASS');
        },
      });
      try {
        const spelled = ['CANARY_TYPED', 'CANARY_AREA', 'CANARY_SELECT', '424242', 'CANARY_PASSWORD', 'CANARY_AUTOPASS', 'CANARY_HIDDEN', 'CANARY_EDITABLE', 'CANARY_SENSITIVE', 'CANARY_VALUETEXT', 'CANARY_SLIDERTEXT', 'Reveal'];
        expect(leaked(s.everything + s.locators, spelled)).toEqual([]);
        const text = s.perception.outline.text;
        expect(text).toContain('- passwordControl');
        expect(text).toContain('- withheld {sensitive}');
        expect(text).toContain('{editable}');
        expect(text).toContain('textbox "Name"');
        expect(text).toContain('button "Save"');
        expect(s.perception.counters.passwordControls).toBeGreaterThanOrEqual(2);
        // a password control is never a ref: no backend id of a password input is exported
        const passwordIds = await s.cdp.send('Runtime.evaluate', { expression: 'document.querySelectorAll("input[type=password]").length', returnByValue: true });
        expect((passwordIds as { result: { value: number } }).result.value).toBe(1);
        expect(Object.values(s.perception.backendNodeIds)).not.toContain(0);
      } finally {
        await closeAfter(s);
      }
    });
  });

  describe('everything else that leaves the modules', () => {
    it('does not mutate or mark the page', async () => {
      const page = await openPage(browser, `<body><button>Save</button><p>${CANARY}</p><input value="x"></body>`);
      try {
        const cdp = await cdpOf(page);
        const before = await domHash(cdp);
        const inventory = new PrivateInventory();
        const perception = await perceive({ cdp, inventory, privateValues: [CANARY] });
        for (const ref of Object.keys(perception.facts)) await synthesize({ perception, ref, inventory });
        expect(await domHash(cdp)).toBe(before);
      } finally {
        await page.context().close();
      }
    });

    it('errors carry a closed code and never page text: a closed page, a value that cannot be held, a changed engine', async () => {
      const gone = await openPage(browser, `<body><p>${CANARY}</p></body>`);
      const goneCdp = await cdpOf(gone);
      await gone.context().close();
      const closed = await perceive({ cdp: goneCdp, inventory: new PrivateInventory() }).catch((error: unknown) => (error as Error).message);
      expect(closed).toBe('PERCEPTION_UNAVAILABLE');

      const big = await openPage(browser, `<body><textarea id="t"></textarea><p>${CANARY}</p></body>`);
      try {
        await big.fill('#t', `${CANARY} ${'x'.repeat(1_100_000)}`);
        const inventory = new PrivateInventory();
        const message = await perceive({ cdp: await cdpOf(big), inventory }).catch((error: unknown) => (error as Error).message);
        expect(message).toBe('PRIVATE_INVENTORY_LIMIT');
        expect(() => inventory.matcher()).toThrow('CONTEXT_LOST');
      } finally {
        await big.context().close();
      }

      const pin = (() => {
        try {
          loadInjectedSourceFrom({ bundlePath: new URL(import.meta.url).pathname, version: '1.63.0', expected: { playwright: '1.63.0', coreBundleSha256: 'f'.repeat(64) } });
        } catch (error) {
          return (error as Error).message;
        }
        return '';
      })();
      expect(pin).toMatch(/^ENGINE_PIN_MISMATCH playwright-core 1\.63\.0 sha256 [0-9a-f]{64}$/u);
    });

    describe('the work budget (F10): large pages with large inventories perceive with headroom', () => {
      /** The largest measured page (24,307 nodes, 1,002 entries, 12,000 + 20,000 characters of long values) used 4.91G units. */
      const WORST_MEASURED = 4_910_000_000;
      const noise = (length: number, seed: number): string => {
        let state = seed;
        let out = '';
        for (let i = 0; i < length; i++) {
          state = (Math.imul(state, 1103515245) + 12345) >>> 0;
          out += 'abcdefghijklmnopqrstuvwxyz0123456789'[(state >>> 16) % 36] ?? 'a';
        }
        return out;
      };
      const formPage = (rows: number, filled: number, extra: string): string => {
        const parts = Array.from({ length: rows }, (_, i) => {
          const value = i < filled ? ` value="customer value number ${String(i)} ${noise(12, i)}"` : '';
          return `<div class="row"><div><span>Field ${String(i)}</span></div><div><label for="a${String(i)}">Name ${String(i)}<span>*</span></label></div><div><input id="a${String(i)}" name="a${String(i)}"${value}></div><div><p>Hint <b>one</b> <i>two</i> text ${String(i)}</p></div><ul><li>a</li><li>b</li><li>c</li></ul><button>Edit ${String(i)}</button><a href="#r${String(i)}">Link ${String(i)}</a></div>`;
        });
        return `<body><main aria-label="Orders"><form aria-label="Order form">${parts.join('')}</form></main>${extra}</body>`;
      };

      it('keeps at least 4x headroom over the largest page measured', () => {
        expect(DEFAULT_WORK_BUDGET_UNITS).toBeGreaterThanOrEqual(4 * WORST_MEASURED);
      });

      it.each(['large-catalog.html', 'large-form.html'])('perceives %s with 1,000 inventory entries inside half of the default budget', async (name) => {
        const html = readFileSync(new URL(`../../fixtures/perception-parity/pages/${name}`, import.meta.url), 'utf8');
        const page = await openPage(browser, html);
        try {
          const inventory = new PrivateInventory();
          for (let i = 0; i < 1000; i++) inventory.add(`private value number ${String(i)} of the inventory`, true);
          const perception = await perceive({ cdp: await cdpOf(page), inventory, resolveBackendIds: false, workBudgetUnits: DEFAULT_WORK_BUDGET_UNITS / 2 });
          expect(perception.outline.bytes).toBeLessThanOrEqual(40_000);
        } finally {
          await page.context().close();
        }
      });

      it('perceives a 24,000-node form page with 1,000 filled controls and long values inside half of the default budget', async () => {
        const extra = `<input type="hidden" name="__VIEWSTATE" value="${noise(12_000, 5)}"><textarea id="t"></textarea>`;
        const page = await openPage(browser, formPage(1350, 1000, extra));
        try {
          await page.fill('#t', noise(20_000, 9));
          const inventory = new PrivateInventory();
          const perception = await perceive({ cdp: await cdpOf(page), inventory, resolveBackendIds: false, workBudgetUnits: DEFAULT_WORK_BUDGET_UNITS / 2 });
          expect(perception.outline.bytes).toBeLessThanOrEqual(40_000);
          expect(perception.outline.totalNodes).toBeGreaterThan(5_000);
          expect(inventory.size).toBeGreaterThan(1000);
        } finally {
          await page.context().close();
        }
      });

      it('still fails closed, with no outline, when a page exhausts the budget', async () => {
        const page = await openPage(browser, formPage(200, 200, ''));
        try {
          const inventory = new PrivateInventory();
          const message = await perceive({ cdp: await cdpOf(page), inventory, resolveBackendIds: false, workBudgetUnits: 1_000_000 }).catch((error: unknown) => (error as Error).message);
          expect(message).toBe('PERCEPTION_UNAVAILABLE');
        } finally {
          await page.context().close();
        }
      });
    });

    it('the whole thing stays within a sane time on a page with a thousand controls and a large inventory', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => `<div><label>Field ${String(i)} label text <input name="f${String(i)}"></label></div>`).join('');
      const page = await openPage(browser, `<body><main>${rows}</main></body>`);
      try {
        const inventory = new PrivateInventory();
        for (let i = 0; i < 300; i++) inventory.add(`private value number ${String(i)} of the inventory`, true);
        const started = performance.now();
        const perception = await perceive({ cdp: await cdpOf(page), inventory, stepText: 'Type in the Field 500 label', resolveBackendIds: false });
        expect(performance.now() - started).toBeLessThan(15_000);
        expect(perception.outline.bytes).toBeLessThanOrEqual(40_000);
      } finally {
        await page.context().close();
      }
    });
  });
});
