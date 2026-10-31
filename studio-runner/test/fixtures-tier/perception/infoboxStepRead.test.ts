import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser, Page } from 'playwright';

import { guardDist, launchChromium } from './harness.js';
import { html, launchStepRun, open, serve, type Opened, type Served } from './cutover-support.js';

/**
 * SC008-E7, the A11 regression (clearfix and infobox values through read, compare and replay), on real Chromium over loopback pages and the step
 * runner: an infobox sits under empty `::before`/`::after` clearfix ancestors and holds a plain value, a link-only value and a mixed link-and-text
 * value. Step code reads the three into `vars`, a later step compares one against the live cell, and the same frozen code runs again on a freshly
 * loaded page. The observation names the rows and shows nothing for the empty generated boxes.
 */
guardDist();

const CLEARFIX = '<style>.wrap::before,.wrap::after{content:"";display:table}.box::before,.box::after{content:"";display:table;clear:both}.cell::after{content:"";display:table}</style>';
const infobox = (designer: string): string => `<main aria-label="Article"><div class="wrap"><table class="box">
  <tr><th colspan="2" class="cell">Python</th></tr>
  <tr><th class="cell">Designed by</th><td class="cell" id="designer">${designer}</td></tr>
  <tr><th class="cell">Developer</th><td class="cell" id="developer"><a href="#psf">Python Software Foundation</a></td></tr>
  <tr><th class="cell">Website</th><td class="cell" id="website"><a href="#home">python.org</a> (official)</td></tr>
</table></div></main>`;

const READ = [
  "vars['designer'] = await page.locator('#designer').innerText();",
  "vars['developer'] = await page.locator('#developer').innerText();",
  "vars['website'] = await page.locator('#website').innerText();",
].join('\n');
const CAPTURES = ['designer', 'developer', 'website'];
const COMPARE = "await expect(page.locator('#designer')).toHaveText(vars['designer']);";

describe('A11: clearfix and infobox values through read, compare and replay', () => {
  let browser: Browser;
  let served: Served;
  const opened: Opened[] = [];
  beforeAll(async () => {
    browser = await launchChromium();
    served = await serve({ '/first': html(infobox('Guido van Rossum'), CLEARFIX), '/second': html(infobox('Another Designer'), CLEARFIX) });
  });
  afterAll(async () => {
    for (const created of opened.splice(0)) await created.close();
    await browser.close();
    await served.close();
  });

  const onPage = async (path: string) => {
    const run = await launchStepRun();
    const live = run.handle.stepApi?.page as Page | undefined;
    if (!live) throw new Error('PAGE');
    await live.goto(`${served.origin}${path}`);
    return { run, live };
  };

  it('reads the plain, the link-only and the mixed value exactly, under empty clearfix ancestors', async () => {
    const { run } = await onPage('/first');
    try {
      const outcome = await run.step(READ, { captures: CAPTURES });
      expect(outcome.receipt.closedCode).toBeNull();
      expect(outcome.captured).toEqual({ designer: 'Guido van Rossum', developer: 'Python Software Foundation', website: 'python.org (official)' });
    } finally { await run.dispose(); }
  });

  it('compares a captured value against the live cell: it passes, and the same code fails ASSERTION_FAILED once the cell changed', async () => {
    const { run, live } = await onPage('/first');
    try {
      const uses = [{ kind: 'binding', id: 'designer' }] as const;
      expect((await run.step(COMPARE, { vars: { designer: 'Guido van Rossum' }, uses })).receipt.closedCode).toBeNull();
      await live.evaluate(() => { const cell = document.querySelector('#designer'); if (cell) cell.textContent = 'Somebody Else'; });
      expect((await run.step(COMPARE, { vars: { designer: 'Guido van Rossum' }, uses, remainingMs: 3000 })).receipt.closedCode).toBe('ASSERTION_FAILED');
    } finally { await run.dispose(); }
  });

  it('replays the frozen read on a freshly loaded page and delivers the new value; the first value is in no record of the second run', async () => {
    const first = await onPage('/first');
    let firstValue = '';
    try { firstValue = (await first.run.step(READ, { captures: CAPTURES })).captured.designer ?? ''; } finally { await first.run.dispose(); }
    expect(firstValue).toBe('Guido van Rossum');
    const second = await onPage('/second');
    try {
      const outcome = await second.run.step(READ, { captures: CAPTURES });
      expect(outcome.captured.designer).toBe('Another Designer');
      expect(JSON.stringify(outcome)).not.toContain(firstValue);
    } finally { await second.run.dispose(); }
  });

  it('observes the infobox rows by name; the empty generated boxes add no text', async () => {
    const created = await open(browser, served, '/first');
    opened.push(created);
    const exported = await created.session.observe(undefined, false);
    expect(Object.values(exported.observation.facts).some((fact) => fact.name === 'Designed by')).toBe(true);
    expect(Object.values(exported.observation.facts).some((fact) => fact.name === 'Developer')).toBe(true);
    expect(exported.observation.outline).not.toMatch(/""/u);
  });
});
