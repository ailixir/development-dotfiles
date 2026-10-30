import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser } from 'playwright';

import { guardDist, launchChromium } from './harness.js';
import { factOf, hasFact, html, invoke, open, prepare, serve, type Operation, type Opened, type Served } from './cutover-support.js';

/**
 * ADR-SC-007 WI-4, WI-5 rehearsal rehearsal-20261027-1 root causes R1, R2, R3 and R5 (`lean/work/WI-5/rehearsal-rootcause.md`,
 * rulings in `architect-rehearsal-rulings.md`), each on a fixture modelled on the real page that failed:
 *
 * - R1 the datatracker search filters: a checkbox whose `value` attribute equals its label (`value="slides"` beside
 *   `Slides`) used to be withheld by the private inventory, so the control the step names had no name and no ref.
 * - R2 the debian releases table: the code name is a link inside a cell, and the intent evidence stopped at the node itself,
 *   so the link never carried the column header "Code Name".
 * - R3 the wikipedia infobox: the focus projection kept the label link and its row header but dropped the value cell beside it.
 * - R5 the datatracker search button: enabled by a handler bound to `change click keyup`, which `locator.fill` alone
 *   (an `input` event) never fires, so the learned fill left the button disabled.
 *
 * Real Chromium over the production observation session, no dist. These tests are red on the pre-rehearsal runner and green
 * on the fixed one.
 */

guardDist();

const literal = { kind: 'authoredLiteral', sourceInputId: 'input' } as const;
const FILL: Operation = { kind: 'fill', value: literal };

const DATATRACKER_FILTERS = html(`<main aria-label="Search documents">
  <form>
    <fieldset>
      <legend>Document Type</legend>
      <div class="form-check"><input class="form-check-input" type="checkbox" name="doctypes" value="agenda" id="id_doctypes_0"><label class="form-check-label" for="id_doctypes_0">Agenda</label></div>
      <div class="form-check"><input class="form-check-input" type="checkbox" name="doctypes" value="minutes" id="id_doctypes_1"><label class="form-check-label" for="id_doctypes_1">Minutes</label></div>
      <div class="form-check"><input class="form-check-input" type="checkbox" name="doctypes" value="slides" id="id_doctypes_2"><label class="form-check-label" for="id_doctypes_2">Slides</label></div>
      <div class="form-check"><input class="form-check-input" type="checkbox" name="doctypes" value="procmaterials" id="id_doctypes_3"><label class="form-check-label" for="id_doctypes_3">Proceedings materials</label></div>
    </fieldset>
  </form>
</main>`);

const DEBIAN_RELEASES = html(`<main aria-label="Debian releases">
  <table>
    <caption>Index of releases</caption>
    <thead><tr><th>Version</th><th>Code Name</th><th>Released</th></tr></thead>
    <tbody>
      <tr><td>Debian 13</td><td><a href="#trixie">Trixie</a></td><td>2025</td></tr>
      <tr><td>Debian 12</td><td><a href="#bookworm">Bookworm</a></td><td>2023</td></tr>
      <tr><td>Debian 11</td><td><a href="#bullseye">Bullseye</a></td><td>2021</td></tr>
    </tbody>
  </table>
</main>`);

/** Past the 600 node / 32 KB projection budget, so the plain outline is a projection and only a focus keeps a row. */
function wikipediaInfobox(): string {
  const bulk = Array.from({ length: 1500 }, (_, index) => `<p>Section text ${String(index)} of the article body.</p>`).join('');
  const rows = [
    ['Paradigm', 'Multi-paradigm'],
    ['Designed by', 'Guido van Rossum'],
    ['Developer', 'Python Software Foundation'],
    ['First appeared', '20 February 1991'],
  ]
    .map(([label, value]) => `<tr><th scope="row"><a href="#${(label ?? '').replace(/\s/gu, '-')}">${label ?? ''}</a></th><td>${value ?? ''}</td></tr>`)
    .join('');
  return html(`<main aria-label="Article">${bulk}<table class="infobox"><caption>Python</caption><tbody>${rows}</tbody></table>${bulk}</main>`);
}

/** The datatracker search form: the submit button stays disabled until a `change`, `click` or `keyup` handler sees text. */
const KEYUP_GATED_SEARCH = html(
  `<main aria-label="Search">
  <form class="search_field" onsubmit="return false">
    <label for="id_name">Name/number/title</label><input id="id_name" type="text" autocomplete="off">
    <button id="search" type="submit" disabled>Search</button>
  </form>
</main>`,
  `<script>
  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('id_name');
    const button = document.getElementById('search');
    const gate = () => { button.disabled = input.value.trim() === ''; };
    for (const type of ['change', 'click', 'keyup']) input.addEventListener(type, gate);
  });
</script>`,
);

describe('WI-4 rehearsal pages: R1, R2, R3 and R5 on real Chromium', () => {
  let browser: Browser;
  let served: Served;
  const opened: Opened[] = [];
  const page = async (path: string): Promise<Opened> => {
    const created = await open(browser, served, path);
    opened.push(created);
    return created;
  };

  beforeAll(async () => {
    browser = await launchChromium();
    served = await serve({
      '/filters': DATATRACKER_FILTERS,
      '/releases': DEBIAN_RELEASES,
      '/infobox': wikipediaInfobox(),
      '/search': KEYUP_GATED_SEARCH,
    });
  });
  afterAll(async () => {
    for (const created of opened.splice(0)) await created.close();
    await browser.close();
    await served.close();
  });

  it('R1: a checkbox with value slides shows its label Slides with a ref', async () => {
    const created = await page('/filters');
    const exported = await created.session.observe(undefined, false);
    // The control the step "Check Slides" names has its name, so it has a fact and therefore a ref the model can pick.
    const [ref, fact] = factOf(exported, 'checkbox', 'Slides');
    expect(ref).toMatch(/^e\d+$/u);
    expect(fact.name).toBe('Slides');
    expect(exported.observation.outline).toContain(`[${ref}]`);
    expect(exported.observation.outline).toContain('Slides');
    // The siblings whose value equals their label are in the same state, and the value attribute is never rendered.
    expect(hasFact(exported, 'checkbox', 'Agenda')).toBe(true);
    expect(hasFact(exported, 'checkbox', 'Minutes')).toBe(true);
    expect(exported.observation.outline).not.toContain('{value withheld}');
    // Learning the click on it prepares a target for the one checkbox.
    const prepared = await prepare(created, 'checkbox', 'Slides', { kind: 'check' }, null, exported);
    expect(prepared.resolved.identity.role).toBe('checkbox');
  });

  it('R2: a code-name link in a table cell carries the column header', async () => {
    const created = await page('/releases');
    const exported = await created.session.observe(undefined, false);
    const [, trixie] = factOf(exported, 'link', 'Trixie');
    // The evidence of a link inside a cell includes the header of its column, so the step "Code Name" can be grounded on it.
    expect(trixie.evidence).toContain('Code Name');
    expect(trixie.evidenceSegments.some((segment) => segment.field === 'header')).toBe(true);
    // The header is the link's own column: another row's link carries it too, and the Version header is not the code name's.
    const [, bookworm] = factOf(exported, 'link', 'Bookworm');
    expect(bookworm.evidence).toContain('Code Name');
  });

  it('R3: an infobox row keeps the value cell beside the matched label', async () => {
    const created = await page('/infobox');
    const plain = await created.session.observe(undefined, false);
    // The premise: the page is a projection, and the plain outline does not reach the infobox.
    expect(plain.observation.projection.projected).toBe(true);
    const focused = await created.session.observe(undefined, false, { stepText: 'Read the "Designed by" value of the infobox', targetIntents: ['Designed by'] });
    expect(hasFact(focused, 'link', 'Designed by')).toBe(true);
    // The value cell of the matched row is shown beside the label, so the model can name the value and not the label.
    expect(focused.observation.outline).toContain('Guido van Rossum');
    expect(focused.observation.outline.length).toBeLessThanOrEqual(40_000);
  });

  it('R5: a button enabled only on keyup is enabled after a fill', async () => {
    const created = await page('/search');
    const before = await created.session.observe(undefined, false);
    // The premise: before the fill the page's Search button is disabled (it still has a fact, so the page is the only witness).
    expect(await created.page.locator('#search').isDisabled()).toBe(true);
    const prepared = await prepare(created, 'textbox', 'Name/number/title', FILL, 'draft-ietf-quic', before);
    await invoke(created, prepared, FILL, { value: 'draft-ietf-quic' });
    // What a person typing leaves behind: the keyup handler has run, so the button is enabled.
    expect(await created.page.locator('#search').isDisabled()).toBe(false);
    const after = await created.session.observe(undefined, false);
    expect(hasFact(after, 'button', 'Search')).toBe(true);
    expect(await created.page.locator('#search').isDisabled()).toBe(false);
    // The written value is the authored one, and the neutral key moved nothing.
    expect(await created.page.locator('#id_name').inputValue()).toBe('draft-ietf-quic');
  });
});
