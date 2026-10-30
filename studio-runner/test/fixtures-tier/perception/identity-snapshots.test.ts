import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser, Locator, Page } from 'playwright';

import { packageRoot } from '../../helpers/corpus.js';
import { parseAriaIdentity } from '../../../src/run/targetIdentity.js';
import { guardDist, launchChromium } from './harness.js';

/**
 * ADR-SC-007 WI-4 D-3, the identity check of attribute, filterHas, nth and nameless scoped locators reads the FIRST line of
 * `locator.ariaSnapshot()`. The goldens in `test/fixtures/target-identity/aria-snapshots.json` were captured on the build
 * recorded in the file; a different build that prints the line differently fails here (never skips), and the parser that
 * reads the line is held to the same goldens in the unit tier (`targetIdentity.test.ts`).
 */

guardDist();

interface Golden {
  readonly playwright: string;
  readonly chromium: string;
  readonly page: string;
  readonly cases: Readonly<Record<string, { readonly count: number; readonly snapshot?: string }>>;
}
const golden = JSON.parse(readFileSync(join(packageRoot, 'test', 'fixtures', 'target-identity', 'aria-snapshots.json'), 'utf8')) as Golden;

/** The locators the goldens were captured with (the probe that wrote the file, kept here so a change is a visible diff). */
const probes: Readonly<Record<string, (page: Page) => Locator>> = {
  attrInput: (page) => page.locator('input[name="u"]'),
  namedButton: (page) => page.getByRole('button', { name: 'Search', exact: true }),
  quoteButton: (page) => page.getByRole('button', { name: 'Say "hi" \\ there', exact: true }),
  imgLink: (page) => page.getByRole('link').first(),
  plainLink: (page) => page.getByRole('link', { name: 'Plain link', exact: true }),
  unnamedLink: (page) => page.getByRole('link').nth(2),
  textboxLabel: (page) => page.getByLabel('User', { exact: true }),
  passwordBox: (page) => page.getByLabel('Secret pw', { exact: true }),
  checkbox: (page) => page.getByRole('checkbox'),
  select: (page) => page.getByRole('combobox'),
  cellV1: (page) => page.getByRole('cell', { name: 'V1', exact: true }),
  heading: (page) => page.getByRole('heading'),
  buyInG2: (page) => page.getByRole('group', { name: 'G2', exact: true }).getByRole('button'),
  filterHas: (page) => page.locator('main').filter({ has: page.getByRole('group', { name: 'G2', exact: true }) }),
  disabled: (page) => page.getByRole('button', { name: 'Off', exact: true }),
  spaced: (page) => page.getByRole('button', { name: 'spaced name', exact: true }),
  li: (page) => page.getByRole('listitem').nth(1),
  nthButton: (page) => page.getByRole('button').nth(1),
};

describe('WI-4 identity: live ariaSnapshot goldens', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchChromium();
    page = await (await browser.newContext()).newPage();
    await page.setContent(`<body>${golden.page}</body>`);
  });
  afterAll(async () => {
    await browser.close();
  });

  it('live ariaSnapshot goldens equal the recorded ones on this Chromium build', async () => {
    expect(Object.keys(probes).sort()).toEqual(Object.keys(golden.cases).sort());
    const mismatches: string[] = [];
    for (const [name, locatorOf] of Object.entries(probes)) {
      const expected = golden.cases[name];
      const locator = locatorOf(page);
      const count = await locator.count();
      if (count !== expected?.count) {
        mismatches.push(`${name}: count ${String(count)} (recorded ${String(expected?.count)})`);
        continue;
      }
      const snapshot = await locator.ariaSnapshot({ timeout: 2000 });
      if (snapshot !== expected.snapshot) mismatches.push(`${name}: ${JSON.stringify(snapshot)} (recorded ${JSON.stringify(expected.snapshot)})`);
    }
    expect(mismatches, `recorded on Chromium ${golden.chromium} / Playwright ${golden.playwright}; this run is Chromium ${browser.version()}`).toEqual([]);
  });

  it('the parser reads role and name from every live first line', async () => {
    for (const [name, locatorOf] of Object.entries(probes)) {
      const snapshot = await locatorOf(page).ariaSnapshot({ timeout: 2000 });
      const identity = parseAriaIdentity(snapshot);
      expect(identity, name).not.toBeNull();
      expect(typeof identity?.role, name).toBe('string');
    }
    expect(parseAriaIdentity(await probes.namedButton?.(page).ariaSnapshot({ timeout: 2000 }) ?? '')).toEqual({ role: 'button', name: 'Search' });
    expect(parseAriaIdentity(await probes.spaced?.(page).ariaSnapshot({ timeout: 2000 }) ?? '')).toEqual({ role: 'button', name: 'spaced name' });
  });

  it('canary value in a textbox does not reach any return or error', async () => {
    const canary = 'CANARY-FIELD-VALUE-5521';
    const context = await browser.newContext();
    const local = await context.newPage();
    try {
      await local.setContent('<label>Account <input id="a"></label>');
      await local.locator('#a').fill(canary);
      const snapshot = await local.getByLabel('Account', { exact: true }).ariaSnapshot({ timeout: 2000 });
      // The raw snapshot of Playwright carries the value after the colon: that is why the parser is the only reader.
      expect(snapshot).toContain(canary);
      const identity = parseAriaIdentity(snapshot);
      expect(JSON.stringify(identity)).not.toContain(canary);
      expect(identity).toEqual({ role: 'textbox', name: 'Account' });
      for (const hostile of [`- textbox "${canary}`, `\u0000${canary}`, snapshot.replace('"Account"', `"${canary}`)]) {
        let leaked = false;
        try {
          leaked = JSON.stringify(parseAriaIdentity(hostile)).includes(canary);
        } catch (error) {
          leaked = String(error instanceof Error ? error.message : error).includes(canary);
        }
        expect(leaked).toBe(false);
      }
    } finally {
      await context.close();
    }
  });
});
