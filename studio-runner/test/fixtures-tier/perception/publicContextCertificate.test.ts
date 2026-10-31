// eslint-disable-next-line no-restricted-imports -- Native relation conformance requires a real browser.
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { perceive } from '../../../src/run/perceive.js';
import { unsafePublicRoots, untrackedObservationChannel } from '../../../src/run/playwrightEngine.js';
import { PrivateInventory } from '../../../src/run/privateInventory.js';
import { cdpOf, guardDist, launchChromium, openPage } from './harness.js';

guardDist();

/**
 * Wikipedia infoboxes sit inside clearfix ancestors (`::before, ::after { content: ""; display: table }`).
 * An empty generated box is structural only for the CDP topology guard; emptiness is certified by the in-page
 * computed-content policy, which keeps refusing non-empty, attr(), counter(), list-item and animated generated content.
 */
describe('generated ::before/::after on certified public sources', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchChromium(); });
  afterAll(async () => { await browser.close(); });

  const INFOBOX = '<div class="wrap" data-x="attr-value"><table class="box"><tr><th colspan="2" class="cell">Python</th></tr><tr><th class="cell"><a href="#designer">Designed by</a></th><td class="cell">Guido van Rossum</td></tr></table></div>';
  const page = async (css: string) => {
    const opened = await openPage(browser, `<main aria-label="Article"><style>${css}</style>${INFOBOX}</main>`);
    const p = await perceive({ cdp: untrackedObservationChannel(await cdpOf(opened)), inventory: new PrivateInventory() });
    return { opened, p };
  };
  const refsOf = (p: Awaited<ReturnType<typeof page>>['p']): { all: string[]; value: string; title: string; label: string } => {
    const entries = Object.entries(p.facts);
    const find = (name: string): string => entries.find(([, fact]) => fact.name === name)?.[0] ?? '';
    const [value, title, label] = [find('Guido van Rossum'), find('Python'), find('Designed by')];
    return { all: [value, title, label], value, title, label };
  };

  it.each([
    ['clearfix on the wrapper ancestor', '.wrap::before,.wrap::after{content:"";display:table}'],
    ['clearfix on the table ancestor', '.box::before,.box::after{content:"";display:table;clear:both}'],
    ['empty ::after on the source cells themselves', '.cell::after{content:"";display:table}'],
    ['empty ::before and ::after on every host', '.wrap::before,.wrap::after,.box::before,.box::after,.cell::before,.cell::after{content:"";display:table}'],
  ])('empty generated content is not quarantined: %s', async (_name, css) => {
    const { opened, p } = await page(css);
    try {
      const refs = refsOf(p);
      expect(refs.all.every(ref => ref !== '')).toBe(true);
      expect([...await unsafePublicRoots(p.engine, refs.all)]).toEqual([]);
    } finally { await opened.context().close(); }
  });

  it.each([
    ['non-empty content', '.box::before{content:"x"}'],
    ['non-empty content on a source cell', '.cell::after{content:"x"}'],
    ['attr() content', '.wrap::after{content:attr(data-x)}'],
    ['counter() content', '.box::before{content:counter(c)}'],
    ['empty ::before displayed as list-item (nested marker)', '.box::before{content:"";display:list-item;list-style:disc inside}'],
    ['empty ::after displayed as list-item (nested marker)', '.wrap::after{content:"";display:list-item;list-style:"- " inside}'],
    ['animated ::before', '@keyframes k{from{opacity:1}to{opacity:.5}} .wrap::before{content:"";display:table;animation:k 100s linear infinite}'],
    ['animated ::after', '@keyframes k{from{opacity:1}to{opacity:.5}} .box::after{content:"";display:table;animation:k 100s linear infinite}'],
  ])('still quarantined: %s', async (_name, css) => {
    const { opened, p } = await page(css);
    try {
      const refs = refsOf(p);
      const unsafe = await unsafePublicRoots(p.engine, refs.all.filter(ref => ref !== ''));
      // Every ref sits below the styled host except nothing: the whole certified family is opaque.
      expect(unsafe.size).toBeGreaterThan(0);
    } finally { await opened.context().close(); }
  });

  it('an animation elsewhere on the page does not quarantine the sources', async () => {
    const { opened, p } = await page('@keyframes k{from{opacity:1}to{opacity:.5}} .other{animation:k 100s linear infinite} .other::before{content:"";animation:k 100s linear infinite} .wrap::before{content:"";display:table}');
    try {
      await opened.evaluate(() => { const other = document.createElement('div'); other.className = 'other'; other.textContent = 'Unrelated'; document.body.append(other); });
      const refs = refsOf(p);
      expect([...await unsafePublicRoots(p.engine, refs.all)]).toEqual([]);
    } finally { await opened.context().close(); }
  });

  it('an open shadow root on a source ancestor is still quarantined', async () => {
    const { opened, p } = await page('');
    try {
      const refs = refsOf(p);
      await opened.evaluate(() => { document.querySelector('.wrap')?.attachShadow({ mode: 'open' }); });
      expect((await unsafePublicRoots(p.engine, [refs.value])).has(refs.value)).toBe(true);
    } finally { await opened.context().close(); }
  });
});
