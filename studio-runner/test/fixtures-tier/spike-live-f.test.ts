/* eslint-disable -- dynamic imports of untyped SPK-07 .mjs modules; harness test, not shipped (moved from test/evaluation/grounding-f-gt.test.ts, ADR-SC-007 WI-4 D-12) */
/**
 * SPK-07 workstream F, live block moved unchanged from test/evaluation/grounding-f-gt.test.ts so that no file outside the fixtures tier
 * launches Chromium (confinement AC-25). The gate is unchanged: it runs only with SPK07_LIVE set.
 */
import { describe, expect, it } from 'vitest';

const load = async (rel: string): Promise<any> => import(new URL(rel, import.meta.url).href);
const gt = await load('../../evaluation/grounding/lib/gt.mjs');

describe('D-3: click equivalence', () => {
  it.skipIf(!process.env.SPK07_LIVE)('live page: descendant yes, interactive in between no, ancestor no, sibling no', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(new URL('../../package.json', import.meta.url));
    const { chromium } = require('playwright');
    const cdpmod = await load('../../evaluation/grounding/lib/cdp.mjs');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<main id="m"><button id="gt"><span id="span">Menu</span><svg id="icon"><path id="p"/></svg></button><button id="outer"><a href="#x" id="link"><b id="inner">x</b></a></button><div role="button" id="rb"><i id="ri">r</i></div><p id="sib">s</p></main>');
      const cdp = await cdpmod.session(page);
      const id = async (css: string) => (await cdpmod.locatorIds(page, cdp, page.locator(css)))[0];
      const eq = async (pick: string, target: string) => (await gt.clickEquivalent(cdp, await id(pick), await id(target))).equivalent;
      const before = await page.content();
      expect(await eq('#span', '#gt')).toBe(true);
      expect(await eq('#p', '#gt')).toBe(true);
      expect(await eq('#inner', '#outer')).toBe(false); // an <a href> lies between
      expect(await eq('#link', '#outer')).toBe(false);  // the picked control is itself interactive
      expect(await eq('#ri', '#rb')).toBe(true);
      expect(await eq('#gt', '#span')).toBe(false);     // ancestors never
      expect(await eq('#sib', '#gt')).toBe(false);
      expect(await page.content()).toBe(before);
    } finally { await browser.close(); }
  });
});
