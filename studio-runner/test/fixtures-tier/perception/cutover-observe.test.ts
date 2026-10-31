import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser } from 'playwright';

import { packageRoot } from '../../helpers/corpus.js';
import { PrivateInventory } from '../../../src/run/privateInventory.js';
import { perceive } from '../../../src/run/perceive.js';
import { OBSERVATION_DEADLINE_MS, unitsFor } from '../../../src/run/observationDeadline.js';
import { budgetPage, busyPage, cdpOf, guardDist, launchChromium, openPage, R4_PAGE, runawayFormPage } from './harness.js';
import { codeOf, factOf, hasFact, html, launchStepRun, open, serve, type Opened, type Served } from './cutover-support.js';

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

  it('R4: an unnamed empty button beside Save is still observed by name, and the step that clicks it runs twice (learn, then replay)', async () => {
    const created = await page('/r4');
    const exported = await created.session.observe(undefined, false);
    expect(hasFact(exported, 'button', 'Save')).toBe(true);
    const run = await launchStepRun();
    try {
      const target = run.handle.stepApi?.page as { goto(url: string): Promise<unknown>; evaluate<T>(fn: () => T): Promise<T> } | undefined;
      if (!target) throw new Error('PAGE');
      await target.goto(`${served.origin}/r4`);
      const click = "await page.getByRole('button', { name: 'Save', exact: true }).click();";
      expect((await run.step(click)).receipt.closedCode).toBeNull();
      expect(await target.evaluate(() => document.body.dataset.saved)).toBe('yes');
      // Replay: the same frozen code acts again on the same single element.
      await target.evaluate(() => { delete document.body.dataset.saved; });
      expect((await run.step(click)).receipt.closedCode).toBeNull();
      expect(await target.evaluate(() => document.body.dataset.saved)).toBe('yes');
    } finally { await run.dispose(); }
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
    const stampOf = (observation: { documentId: string; generation: number }) => ({ documentId: observation.documentId, generation: observation.generation });
    expect(created.session.documentCurrent(stampOf(first.observation), first.observation.origin)).toBe(false);
    expect(created.session.documentCurrent(stampOf(second.observation), second.observation.origin)).toBe(true);
    void ref;
    await created.page.goto(`${served.origin}/second`);
    const third = await created.session.observe(undefined, false);
    expect(third.observation.documentId).not.toBe(second.observation.documentId);
    expect(created.session.documentCurrent(stampOf(second.observation), second.observation.origin)).toBe(false);
    expect(created.session.documentCurrent(stampOf(third.observation), third.observation.origin)).toBe(true);
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
    // The 12,000-row page demands three times the work budget of the real deadline twice (the raised-budget proof, then the real run), so the case
    // is CPU-bound: 107 s measured on an idle-ish host (load about 4). It gets its own larger bound; no other test's timeout moves.
  }, 300_000);

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

/**
 * Session privacy over observe, withhold and dispose (ported from the retired guided-targets file, SC008-E7): what the session was told or found
 * private stays out of every later observation, and a failed or exhausted session fails closed.
 */
describe('session privacy: withheld and uncaptured bytes, overflow, collector errors, disposal', () => {
  let browser: Browser;
  let served: Served;
  let current = '';
  const opened: Opened[] = [];
  beforeAll(async () => {
    browser = await launchChromium();
    served = await serve({
      '/case': (_request, response) => { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(current); },
      '/next': html('<p>next</p>'),
    });
  });
  afterEach(async () => { for (const created of opened.splice(0)) await created.close(); vi.restoreAllMocks(); });
  afterAll(async () => { await browser.close(); await served.close(); });
  const ready = async (markup: string): Promise<Opened> => {
    current = html(markup);
    const created = await open(browser, served, '/case');
    opened.push(created);
    return created;
  };

  it('erases the private masking inventory and refuses late repopulation after disposal', async () => {
    const inventories = new Set<PrivateInventory>();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the original is invoked with .call(this, ...) in the wrapper below.
    const original = PrivateInventory.prototype.withhold;
    vi.spyOn(PrivateInventory.prototype, 'withhold').mockImplementation(function (this: PrivateInventory, values: readonly string[]) {
      inventories.add(this);
      original.call(this, values);
    });
    const h = await ready('<main aria-label="Operations"><button>Other</button></main>');
    await h.session.withhold?.(['PRIVATE-CAPTURE-CANARY']);
    expect([...inventories].some((inventory) => inventory.snapshot().some(([value]) => value === 'PRIVATE-CAPTURE-CANARY'))).toBe(true);
    await h.session.observe(undefined, false);
    await h.session.dispose();
    const erased = (): boolean => [...inventories].every((inventory) => { try { return inventory.snapshot().length === 0; } catch { return true; } });
    expect(erased()).toBe(true);
    await expect(h.session.withhold?.(['LATE-CANARY'])).rejects.toThrow('CONTEXT_LOST');
    expect(erased()).toBe(true);
  });
  it.each(['password', 'text'])('withholds uncaptured %s bytes and aliases after removal and navigation', async (type) => {
    const secret = 'QA_PRIOR_  private\u200b\n token';
    const alias = 'QA_PRIOR_ private token';
    const h = await ready('<input aria-label="Approved field" type="text"><button>Continue</button>');
    await h.page.locator('input').evaluate((e, args) => {
      e.setAttribute('type', args.type);
      (e as HTMLInputElement).value = args.secret;
    }, { secret, type });
    // The control value must be discovered automatically; an explicit withhold seed would defeat this uncaptured-value retention oracle.
    expect(JSON.stringify(await h.session.observe(undefined, false))).not.toContain('QA_PRIOR_');
    await h.page.setContent(`<button>${alias}</button>`);
    expect(JSON.stringify(await h.session.observe(undefined, false))).not.toContain('QA_PRIOR_');
    await h.page.goto(`${h.origin}/next`);
    await h.page.setContent(`<button>${alias}</button>`);
    expect(JSON.stringify(await h.session.observe(undefined, false))).not.toContain('QA_PRIOR_');
    await h.session.dispose();
    await expect(h.session.observe(undefined, false)).rejects.toThrow();
    await expect(h.session.withhold?.(['LATE_PRIVATE'])).rejects.toThrow();
  });
  it('fails closed persistently on private inventory count/byte overflow instead of evicting earlier bytes', async () => {
    for (const values of [Array.from({ length: 4097 }, (_, i) => `secret-${String(i)}`), Array.from({ length: 260 }, (_, i) => `${String(i)}-${'x'.repeat(4096)}`)]) {
      const h = await ready('<input aria-label="Approved field" value="EARLIER_SECRET">');
      await expect(h.session.withhold?.(values)).rejects.toThrow('CONTEXT_LOST');
      await h.page.goto(`${h.origin}/next`);
      await h.page.setContent('<button>EARLIER_SECRET</button>');
      await expect(h.session.observe(undefined, false)).rejects.toThrow();
      await expect(h.session.withhold?.(['new'])).rejects.toThrow();
    }
  });
  it('poisons later observation after an unexpected collector error instead of forgetting prior inventory', async () => {
    const h = await ready('<button aria-label="Approved field">Seed</button>');
    await h.session.withhold?.(['PRIVATE_BEFORE_ERROR']);
    await h.page.locator('button').evaluate((e) => { e.textContent = '\ud800'; });
    await expect(h.session.observe(undefined, false)).rejects.toThrow('INVALID_UNICODE');
    await h.page.goto(`${h.origin}/next`);
    await h.page.setContent('<button>PRIVATE_BEFORE_ERROR</button>');
    await expect(h.session.observe(undefined, false)).rejects.toThrow();
  });
  it('keeps explicit sensitive-region text private after the region is gone', async () => {
    const h = await ready('<section data-sensitive><span>PRIVATE_REGION_004</span></section><input aria-label="Approved field">');
    expect(JSON.stringify(await h.session.observe(undefined, false))).not.toContain('PRIVATE_REGION_004');
    await h.page.goto(`${h.origin}/next`);
    await h.page.setContent('<button>PRIVATE_REGION_004</button>');
    expect(JSON.stringify(await h.session.observe(undefined, false))).not.toContain('PRIVATE_REGION_004');
  });
});
