import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser } from 'playwright';

import { packageRoot } from '../../helpers/corpus.js';
import { PrivateInventory } from '../../../src/run/privateInventory.js';
import { perceive } from '../../../src/run/perceive.js';
import { OBSERVATION_DEADLINE_MS, unitsFor } from '../../../src/run/observationDeadline.js';
import { budgetPage, busyPage, cdpOf, guardDist, launchChromium, openPage, R4_PAGE, runawayFormPage } from './harness.js';
import { codeOf, factOf, hasFact, html, invoke, open, prepare, serve, type Opened, type Served } from './cutover-support.js';

/**
 * ADR-SC-007 WI-4, observation side (AC2, AC7): the production observation session over a real Chromium page.
 *
 * - AC2 R4: an unnamed empty button beside a named one does not stop the named one from being learned and replayed.
 * - AC2 budget: a page above 600 nodes and 32 KB observes non-empty, the outline within 40,000 bytes, the target present.
 * - AC7: the collection deadline fails the observation closed (OBSERVATION_DEADLINE, no observation returned), on the
 *   tripwire (limits.milliseconds = 1), on the real constant with a page far beyond it, and on a busy main thread.
 * - Staleness, the password coverage count, the privacy scan of the wire observation, the settle loop and the release of
 *   the previous engine's isolated world.
 */

guardDist();

const MEASUREMENTS = join(packageRoot, '..', 'docs', 'qa', 'evidence', 'adr-sc-007', 'wi-4', 'perception-tier-measurements.json');
const measured: Record<string, unknown> = {};
function record(key: string, value: unknown): void {
  measured[key] = value;
  mkdirSync(dirname(MEASUREMENTS), { recursive: true });
  writeFileSync(MEASUREMENTS, `${JSON.stringify({ file: 'cutover-observe.test.ts', measured }, null, 1)}\n`);
}

describe('WI-4 observation: AC2, AC7 and session invariants on real Chromium', () => {
  let browser: Browser;
  let served: Served;
  const opened: Opened[] = [];
  const page = async (path: string, config: Parameters<typeof open>[3] = {}): Promise<Opened> => {
    const created = await open(browser, served, path, config);
    opened.push(created);
    return created;
  };

  beforeAll(async () => {
    browser = await launchChromium();
    served = await serve({
      '/r4': html(R4_PAGE),
      '/budget': html(budgetPage()),
      '/second': html('<main aria-label="Operations"><button type="button">Second page</button></main>'),
      '/runaway': html(runawayFormPage(12_000, 4_000)),
      '/busy': html(busyPage(4_000)),
      '/settle': html('<main aria-label="Operations"><button type="button">First</button></main><script>setTimeout(()=>{const b=document.createElement("button");b.textContent="Late button";document.querySelector("main").append(b);},150)</script>'),
      '/passwords0': html('<main aria-label="Operations"><label>Name <input></label></main>'),
      '/passwords1': html('<main aria-label="Operations"><label>Name <input></label><label>Pass <input type="password" value="PW-CANARY-ONE-7731"></label></main>'),
      '/passwords2': html('<main aria-label="Operations"><label>Pass <input type="password" value="PW-CANARY-ONE-7731"></label><label>Again <input type="password" value="PW-CANARY-TWO-5519"></label></main>'),
      '/privacy': html('<main aria-label="Operations"><label>Account <input id="typed" value="TYPED-CANARY-4417-XYZ"></label><button type="button">TYPED-CANARY-4417-XYZ</button><p>TYPED-CANARY-<b>4417</b>-XYZ</p><p>Reference TYPED-CANARY-4417-XYZ shown twice TYPED-CANARY-4417-XYZ</p></main>'),
      '/worlds': html('<main aria-label="Operations"><button type="button">Go</button><label>Name <input></label></main>'),
    });
  });
  afterAll(async () => {
    for (const created of opened.splice(0)) await created.close();
    await browser.close();
    await served.close();
  });

  it('R4: an unnamed empty button beside Save learns and replays the named one', async () => {
    const created = await page('/r4');
    const exported = await created.session.observe(undefined, false);
    expect(hasFact(exported, 'button', 'Save')).toBe(true);
    const operation = { kind: 'click' } as const;
    const prepared = await prepare(created, 'button', 'Save', operation, null, exported);
    await invoke(created, prepared, operation);
    expect(await created.page.evaluate(() => document.body.dataset.saved)).toBe('yes');
    // Replay: the frozen locator resolves to exactly one element and acts on it again.
    await created.page.evaluate(() => {
      delete document.body.dataset.saved;
    });
    const resolution = await created.session.resolveTarget({ resolved: prepared.resolved, origin: created.origin, operation, readRuleId: null });
    expect(resolution.kind).toBe('READY');
    await invoke(created, prepared, operation, { profile: 'replay', bind: false });
    expect(await created.page.evaluate(() => document.body.dataset.saved)).toBe('yes');
  });

  it('budget: a 1,200 item list with a 700 node table observes non-empty', async () => {
    const created = await page('/budget');
    const exported = await created.session.observe(undefined, false);
    const { observation } = exported;
    expect(Buffer.byteLength(observation.outline, 'utf8')).toBeLessThanOrEqual(40_000);
    expect(Object.keys(observation.facts).length).toBeGreaterThan(0);
    expect(hasFact(exported, 'button', 'Place order')).toBe(true);
    // The page itself is far above the 32 KB the old observation cap allowed.
    expect(await created.page.evaluate(() => document.body.innerText.length)).toBeGreaterThan(32_768);
    expect(observation.projection.totalNodes).toBeGreaterThan(600);
    expect(observation.projection.outlineBytes).toBeLessThanOrEqual(40_000);
  });

  it('projection reports projected and notShown', async () => {
    const created = await page('/budget');
    const { observation } = await created.session.observe(undefined, false);
    expect(observation.projection.projected).toBe(true);
    expect(observation.projection.notShown).toBeGreaterThan(0);
    expect(observation.projection.shownNodes).toBeGreaterThan(0);
    expect(observation.projection.shownNodes + observation.projection.notShown).toBeLessThanOrEqual(observation.projection.totalNodes);
  });

  it('projection keeps a node only named by targetIntent', async () => {
    const links = Array.from({ length: 1500 }, (_, index) => `<li><a href="#l${String(index)}">Catalog link ${String(index)}</a></li>`);
    links.splice(1100, 0, '<li><a href="#hidden-target">Archive the ledger</a></li>');
    const local = await serve({ '/focus': html(`<main aria-label="Operations"><ul>${links.join('')}</ul></main>`) });
    try {
      const created = await open(browser, local, '/focus');
      opened.push(created);
      const plain = await created.session.observe(undefined, false);
      const focused = await created.session.observe(undefined, false, { stepText: 'Complete the current task', targetIntents: ['Archive the ledger'] });
      // Without a focus the 3,000 node page projects to its landmarks; the step text and the target intent are what keep the one link in view.
      expect(plain.observation.projection.projected).toBe(true);
      expect(hasFact(plain, 'link', 'Archive the ledger')).toBe(false);
      expect(hasFact(focused, 'link', 'Archive the ledger')).toBe(true);
    } finally {
      await local.close();
    }
  });

  it('documentId, generation and ref staleness across two observations and a navigation', async () => {
    const created = await page('/r4');
    const first = await created.session.observe(undefined, false);
    const [ref] = factOf(first, 'button', 'Save');
    const second = await created.session.observe(undefined, false);
    expect(second.observation.documentId).toBe(first.observation.documentId);
    expect(second.observation.generation).toBe(first.observation.generation + 1);
    const stale = created.session.prepareTarget({ ref, documentId: first.observation.documentId, generation: first.observation.generation, origin: first.observation.origin, operation: { kind: 'click' }, authoredLiteral: null });
    expect(await codeOf(stale)).toBe('TARGET_CHANGED');
    const current = await created.session.prepareTarget({ ref: factOf(second, 'button', 'Save')[0], documentId: second.observation.documentId, generation: second.observation.generation, origin: second.observation.origin, operation: { kind: 'click' }, authoredLiteral: null });
    expect(current.locator.length).toBeGreaterThan(0);
    await created.page.goto(`${served.origin}/second`);
    const third = await created.session.observe(undefined, false);
    expect(third.observation.documentId).not.toBe(second.observation.documentId);
    expect(await codeOf(created.session.prepareTarget({ ref: factOf(second, 'button', 'Save')[0], documentId: second.observation.documentId, generation: second.observation.generation, origin: second.observation.origin, operation: { kind: 'click' }, authoredLiteral: null }))).toBe('TARGET_CHANGED');
    expect(await codeOf(created.session.prepareTarget({ ref: 'e99999', documentId: third.observation.documentId, generation: third.observation.generation, origin: third.observation.origin, operation: { kind: 'click' }, authoredLiteral: null }))).toBe('TARGET_CHANGED');
  });

  it.each([
    ['/passwords0', 0, []],
    ['/passwords1', 1, ['PW-CANARY-ONE-7731']],
    ['/passwords2', 2, ['PW-CANARY-ONE-7731', 'PW-CANARY-TWO-5519']],
  ] as const)('password page %s: counts %i password controls and no password text appears anywhere in the wire observation', async (path, count, canaries) => {
    const created = await page(path);
    const exported = await created.session.observe(undefined, false);
    expect(exported.observation.coverage.passwordControls).toBe(count);
    for (const canary of canaries) {
      expect(exported.json).not.toContain(canary);
      expect(exported.observation.outline).not.toContain(canary);
    }
  });

  it('privacy scan of the whole wire observation for typed and split canaries', async () => {
    const created = await page('/privacy');
    const exported = await created.session.observe(undefined, false);
    for (const needle of ['TYPED-CANARY-4417-XYZ', 'TYPED-CANARY-', '4417-XYZ']) {
      expect(exported.json, `the wire observation carries ${needle}`).not.toContain(needle);
    }
    // A value typed AFTER the observation started is withheld from the next one as well.
    await created.page.locator('#typed').fill('LATE-TYPED-CANARY-9921');
    await created.page.evaluate(() => {
      const note = document.createElement('p');
      note.textContent = 'echo LATE-TYPED-CANARY-9921 echo';
      document.querySelector('main')?.append(note);
    });
    const again = await created.session.observe(undefined, false);
    expect(again.json).not.toContain('LATE-TYPED-CANARY-9921');
  });

  it('settle loop on a page that mutates once keeps the settled page and counts one generation', async () => {
    const created = await page('/settle');
    const exported = await created.session.observe(undefined, true);
    expect(hasFact(exported, 'button', 'Late button')).toBe(true);
    const next = await created.session.observe(undefined, false);
    expect(next.observation.generation).toBe(exported.observation.generation + 1);
  });

  it('deadline: limits.milliseconds = 1 trips at the first boundary', async () => {
    const created = await page('/budget', { limits: { milliseconds: 1 } });
    const started = Date.now();
    expect(await codeOf(created.session.observe(undefined, false))).toBe('OBSERVATION_DEADLINE');
    expect(Date.now() - started).toBeLessThan(5_000);
    // Nothing was exported: the next call fails the same way, it never answers with an emptied page.
    expect(await codeOf(created.session.observe(undefined, false))).not.toBeNull();
  });

  it('deadline: the real constant ends the 20,000-input page', async () => {
    // Host independence: the page demands more than three times the work budget of the real deadline, so no host is fast enough to
    // collect it inside D. The proof runs the sanitizer itself with that raised budget and requires it to run out.
    const heavy = await openPage(browser, runawayFormPage(12_000, 4_000));
    try {
      const raised = 3 * unitsFor(OBSERVATION_DEADLINE_MS);
      const message = await perceive({ cdp: await cdpOf(heavy), inventory: new PrivateInventory(), resolveBackendIds: false, workBudgetUnits: raised }).catch((error: unknown) => (error as Error).message);
      record('runawayDemand', { rows: 12_000, filled: 4_000, raisedBudgetUnits: raised, outcome: message });
      expect(message, 'the page must demand more than 3x the budget of the real deadline').toBe('PERCEPTION_UNAVAILABLE');
    } finally {
      await heavy.context().close();
    }
    const created = await page('/runaway');
    const started = Date.now();
    const code = await codeOf(created.session.observe(undefined, false));
    const elapsed = Date.now() - started;
    record('runawayPage', { rows: 12_000, filled: 4_000, deadlineMs: OBSERVATION_DEADLINE_MS, code, elapsedMs: elapsed });
    expect(code).toBe('OBSERVATION_DEADLINE');
    // The synchronous sanitizer is bounded by a work budget derived from the deadline; the overrun on this host is recorded above.
    expect(elapsed).toBeLessThan(2 * OBSERVATION_DEADLINE_MS + 5_000);
  }, 120_000);

  it('deadline: a busy main thread ends OBSERVATION_DEADLINE before the loop ends', async () => {
    const created = await page('/busy', { limits: { milliseconds: 600 } });
    const started = Date.now();
    expect(await codeOf(created.session.observe(undefined, false))).toBe('OBSERVATION_DEADLINE');
    const elapsed = Date.now() - started;
    record('busyMainThread', { loopMs: 4_000, deadlineMs: 600, elapsedMs: elapsed });
    expect(elapsed).toBeLessThan(2_500);
    const disposing = Date.now();
    await created.session.dispose();
    expect(Date.now() - disposing).toBeLessThan(10_000);
  }, 60_000);

  it('worlds: 50 observations on one document keep working and the isolated worlds are counted', async () => {
    const created = await page('/worlds');
    const cdp = await created.page.context().newCDPSession(created.page);
    const worlds = new Set<number>();
    cdp.on('Runtime.executionContextCreated', (event) => {
      if (event.context.name.startsWith('checks-observation-')) worlds.add(event.context.id);
    });
    await cdp.send('Runtime.enable');
    let last = 0;
    for (let index = 0; index < 50; index++) {
      const exported = await created.session.observe(undefined, false);
      expect(exported.observation.generation).toBeGreaterThan(last);
      last = exported.observation.generation;
    }
    record('worlds', { observations: 50, observationWorlds: worlds.size });
    expect(hasFact(await created.session.observe(undefined, false), 'button', 'Go')).toBe(true);
    // One world per observation call, none left to grow without bound: never more than one per call.
    expect(worlds.size).toBeLessThanOrEqual(52);
  }, 120_000);
});
