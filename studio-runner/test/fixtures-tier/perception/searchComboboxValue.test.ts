import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser } from 'playwright';

import { guardDist, launchChromium } from './harness.js';
import { html, open, serve, type Opened, type Served } from './cutover-support.js';

/**
 * A site search box that a script turns into role="combobox" once it is used (Wikipedia's autocomplete) still has, as its only own
 * text, the stripped direct value of a native input: its facts stay complete, so a following "Press Enter" can inherit the filled field.
 */

guardDist();

const SCRIPT = `<script>document.addEventListener('input', (e) => { if (e.target.dataset.upgrade === '1') { e.target.setAttribute('role', 'combobox'); e.target.setAttribute('aria-expanded', 'true'); } });</script>`;

describe('a script-upgraded search combobox keeps complete own text', () => {
  let browser: Browser;
  let served: Served;
  const opened: Opened[] = [];
  beforeAll(async () => {
    browser = await launchChromium();
    served = await serve({
      '/search': html(`<main><form role="search"><input type="search" aria-label="Search site" data-upgrade="1"><button type="button">Go</button></form></main>${SCRIPT}`),
      '/custom-textbox': html(`<main><input type="search" aria-label="Search site" role="textbox"></main>`),
      '/div-combobox': html(`<main><div role="combobox" aria-label="Search site" aria-expanded="false" tabindex="0">typed</div></main>`),
    });
  });
  afterAll(async () => {
    for (const created of opened.splice(0)) await created.close();
    await browser.close();
    await served.close();
  });

  const factOf = async (created: Opened) => {
    const exported = await created.session.observe(undefined, false);
    const found = Object.values(exported.observation.facts).filter((fact) => fact.name === 'Search site');
    expect(found).toHaveLength(1);
    return found[0];
  };

  it('keeps ownTextComplete after the field is filled and the script made it a combobox', async () => {
    const created = await open(browser, served, '/search');
    opened.push(created);
    expect((await factOf(created))?.role).toBe('searchbox');
    await created.page.getByRole('searchbox', { name: 'Search site' }).fill('Guido van Rossum');
    const after = await factOf(created);
    expect(after?.role).toBe('combobox');
    expect(after?.ownTextComplete).toBe(true);
    expect(after?.nameComplete).toBe(true);
  });

  it('does not certify a role the page author set to something else, or a non-input combobox', async () => {
    const custom = await open(browser, served, '/custom-textbox');
    opened.push(custom);
    await custom.page.getByRole('textbox', { name: 'Search site' }).fill('typed value');
    expect((await factOf(custom))?.ownTextComplete).toBe(false);
    const div = await open(browser, served, '/div-combobox');
    opened.push(div);
    expect((await factOf(div))?.ownTextComplete).toBe(false);
  });
});
