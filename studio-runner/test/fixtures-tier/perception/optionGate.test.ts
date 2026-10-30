import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser, Page } from 'playwright';

import { perceive, type Perception } from '../../../src/run/perceive.js';
import { checkLiveOptions } from '../../../src/run/playwrightEngine.js';
import { PrivateInventory } from '../../../src/run/privateInventory.js';
import { cdpOf, domHash, guardDist, launchChromium, openPage } from './harness.js';

/**
 * AC5 (ADR-SC-007 D3, G1): a literal that is absent from the LIVE options of the target is refused OPTION_NOT_PRESENT; a literal
 * equal to the currently selected option of a native select passes (the outline strips that option on purpose, so G1 cannot
 * be decided on the outline); matching is NFKC and case-insensitive.
 */

guardDist();

const HTML = `<body>
  <label>Plan <select id="plan"><option value="a">Alpha</option><option value="b" selected>Beta Plus</option><option value="g">Gamma</option></select></label>
  <label>Many <select id="many">${Array.from({ length: 6 }, (_, i) => `<option>Choice ${String(i)}</option>`).join('')}</select></label>
  <div role="listbox" aria-label="Languages"><div role="option">English</div><div role="option" aria-label="Français">FR</div></div>
  <div role="radiogroup" aria-label="Size"><label><input type="radio" name="s" value="s"> Small</label><label><input type="radio" name="s" value="m"> Medium</label></div>
  <label>Name <input id="name"></label><button>Go</button></body>`;

describe('AC5: G1 against the live option list', () => {
  let browser: Browser;
  let page: Page;
  let perception: Perception;
  const refOf = (role: string, name: string): string => {
    const found = Object.entries(perception.facts).find(([, fact]) => fact.role === role && fact.name === name);
    if (!found) throw new Error(`no ${role} ${name} in ${perception.outline.text}`);
    return found[0];
  };
  const check = (ref: string, literal: string): ReturnType<typeof checkLiveOptions> => checkLiveOptions({ engine: perception.engine, ref, literal });

  beforeAll(async () => {
    browser = await launchChromium();
    page = await openPage(browser, HTML);
    perception = await perceive({ cdp: await cdpOf(page), inventory: new PrivateInventory() });
  });
  afterAll(async () => {
    await page.context().close();
    await browser.close();
  });

  it('the outline hides the selected option of a native select, which is why G1 reads the live list', () => {
    expect(perception.outline.text).not.toContain('Beta Plus');
    expect(perception.outline.text).toContain('option "Alpha"');
  });

  it('refuses a literal that is not among the live options', async () => {
    expect(await check(refOf('combobox', 'Plan'), 'Delta')).toEqual({ kind: 'refuse', code: 'OPTION_NOT_PRESENT' });
    expect(await check(refOf('combobox', 'Many'), 'Choice 99')).toEqual({ kind: 'refuse', code: 'OPTION_NOT_PRESENT' });
  });

  it('passes a literal equal to the currently selected option of a native select, and any other option', async () => {
    const plan = refOf('combobox', 'Plan');
    expect(await check(plan, 'Beta Plus')).toEqual({ kind: 'pass' });
    expect(await check(plan, 'Alpha')).toEqual({ kind: 'pass' });
    expect(await check(plan, 'Gamma')).toEqual({ kind: 'pass' });
  });

  it('matches NFKC, case-insensitively, ignoring surrounding whitespace, and also an option value', async () => {
    const plan = refOf('combobox', 'Plan');
    expect(await check(plan, 'beta plus')).toEqual({ kind: 'pass' });
    expect(await check(plan, 'BETA PLUS')).toEqual({ kind: 'pass' });
    expect(await check(plan, 'Ｂｅｔａ Ｐｌｕｓ')).toEqual({ kind: 'pass' });
    expect(await check(plan, '  Beta   Plus ')).toEqual({ kind: 'pass' });
    expect(await check(plan, 'g')).toEqual({ kind: 'pass' });
    expect(await check(plan, 'Beta')).toEqual({ kind: 'refuse', code: 'OPTION_NOT_PRESENT' });
  });

  it('reads the options of an ARIA listbox (text or aria-label)', async () => {
    const listbox = refOf('listbox', 'Languages');
    expect(await check(listbox, 'english')).toEqual({ kind: 'pass' });
    expect(await check(listbox, 'Français')).toEqual({ kind: 'pass' });
    expect(await check(listbox, 'Klingon')).toEqual({ kind: 'refuse', code: 'OPTION_NOT_PRESENT' });
  });

  it('is not a verdict on a radio group, a text box or a button', async () => {
    expect(await check(refOf('radiogroup', 'Size'), 'Small')).toEqual({ kind: 'notApplicable', reason: 'NOT_A_LIST' });
    expect(await check(refOf('textbox', 'Name'), 'x')).toEqual({ kind: 'notApplicable', reason: 'NOT_A_LIST' });
    expect(await check(refOf('button', 'Go'), 'x')).toEqual({ kind: 'notApplicable', reason: 'NOT_A_LIST' });
  });

  it('is not a verdict on a ref that no longer resolves, and does not change the page', async () => {
    const cdp = await cdpOf(page);
    const before = await domHash(cdp);
    expect(await check('e9999', 'x')).toEqual({ kind: 'notApplicable', reason: 'OPTIONS_UNAVAILABLE' });
    expect(await domHash(cdp)).toBe(before);
  });
});
