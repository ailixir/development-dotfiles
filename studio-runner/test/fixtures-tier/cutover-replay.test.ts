// eslint-disable-next-line no-restricted-imports -- Real Chromium fixture types only.
import type { Page } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ObservedInvocationControl, ReplayAcquisitionBudget } from '../../src/executor/observedReplay.js';
import type { Guard, ReplayAction, Scope } from '../../src/executor/observedOperations.js';
import type { ResolvedTarget } from '../../src/guided/types.js';
import { OBSERVATION_DEADLINE_MS } from '../../src/run/observationDeadline.js';
import { observationReadProfile } from '../../src/run/observationReadProfile.js';
import type { ObservationSession } from '../../src/run/observationTypes.js';
import { createObservedReplayAdapter } from '../../src/run/observedReplayAdapter.js';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { html, serve } from './perception/cutover-support.js';
import type { Served } from './perception/cutover-support.js';
import { runawayFormPage } from './perception/harness.js';
import { playwrightBrowserFactory } from './preparedBrowser.js';

/**
 * ADR-SC-007 WI-4 AC3 on the real replay adapter: the frozen locator is re-resolved through the public API at replay. Zero or several
 * matches, an identity that moved, and a page the runner cannot observe within the collection deadline all end TARGET_DRIFT, and the
 * action is never performed. Every case drives `createObservedReplayAdapter(...).perform` on a real Chromium page, the replay of a published run.
 */
const SCOPE: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', capabilities: ['navigate', 'click', 'selectOption', 'assert'], initialContext: { kind: 'initialBlank' } };
const STEP = '00000000-0000-4000-8000-000000000001';

let served: Served;
const cleanups: (() => Promise<void>)[] = [];

beforeAll(async () => {
  served = await serve({
    '/pay': html('<main aria-label="Operations"><button type="button" onclick="window.clicks=(window.clicks||0)+1">Pay now</button></main>'),
    '/lang': html('<main aria-label="Operations"><label>Language <select id="lang"><option>Choose</option><option>Python 3.12</option><option>Ruby 3.3</option></select></label></main>'),
    '/heavy': html(runawayFormPage(12_000, 4_000)),
  });
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
afterAll(async () => {
  await served.close();
});

interface Replay {
  readonly origin: string;
  readonly page: Page;
  readonly probe: ObservationSession;
  navigate(path: string): Promise<void>;
  /** The frozen target the runner derives at prepare for the fact with this name, as a guard. */
  guardFor(name: string, operation: ReplayAction['operation'], literal?: string | null): Promise<Guard>;
  perform(operation: ReplayAction['operation'], guard: Guard, value?: string | null): Promise<unknown>;
}

async function replay(): Promise<Replay> {
  const dir = await mkdtemp(join(tmpdir(), 'cutover-replay-'));
  const handle = await playwrightBrowserFactory.launch({ allowedDomains: TEST_DOMAINS, browser: 'chromium', viewport: { width: 1280, height: 720 }, recording: { width: 640, height: 480 }, scratchPath: dir, observedScope: SCOPE });
  cleanups.push(async () => {
    await handle.dispose();
    await rm(dir, { recursive: true, force: true });
  });
  const adapter = createObservedReplayAdapter(handle, SCOPE, TEST_DOMAINS, 'cutover-replay', () => undefined);
  const probe = handle.createObservationSession?.({ sessionId: 'probe', scopeHash: 'a'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [], readProfile: observationReadProfile(TEST_DOMAINS) });
  if (probe === undefined) throw new Error('SESSION');
  const budget = new ReplayAcquisitionBudget();
  let ordinal = 0;
  const perform = (operation: ReplayAction['operation'], guard: Guard, value: string | null = null): Promise<unknown> => {
    const control = new ObservedInvocationControl({ now: () => performance.now() }, performance.now() + 60_000, new AbortController().signal, budget, { extra: 0 });
    const action: ReplayAction = { coordinate: { stepId: STEP, ordinal: ordinal++ }, guardId: guard.guardId, operation };
    return control.run(() => adapter.perform(action, guard, value, control));
  };
  const origin = served.origin;
  return {
    origin,
    page: handle.page as unknown as Page,
    probe,
    navigate: async (path) => {
      await perform({ kind: 'navigate', destinationInputId: 'destination' }, { guardId: 'g-nav', origin: null, target: { kind: 'initialBlank' } }, `${origin}${path}`);
    },
    guardFor: async (name, operation, literal = null) => {
      const seen = await probe.observe(undefined, false);
      const found = Object.entries(seen.observation.facts).find(([, fact]) => fact.name === name);
      if (found === undefined) throw new Error(`no fact "${name}" in:\n${seen.observation.outline}`);
      const resolved = await probe.prepareTarget({ ref: found[0], documentId: seen.observation.documentId, generation: seen.observation.generation, origin: seen.observation.origin, operation: operation as never, authoredLiteral: literal });
      return { guardId: 'g-step', origin, target: { kind: 'element', locator: resolved.locator, tier: resolved.tier, identity: resolved.identity, readRuleId: null } };
    },
    perform,
  };
}

const CLICK: ReplayAction['operation'] = { kind: 'click' };
const clicksOf = (page: Page): Promise<number> => page.evaluate(() => ((window as unknown as { clicks?: number }).clicks ?? 0));
const refusal = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
    return 'NO_ERROR';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

describe('replay re-resolution through the real adapter (ADR-SC-007 AC3)', () => {
  it('zero matches ends TARGET_DRIFT with the click never performed', async () => {
    const r = await replay();
    await r.navigate('/pay');
    const guard = await r.guardFor('Pay now', CLICK);
    await r.page.locator('button').evaluate((element) => {
      element.remove();
    });
    expect(await refusal(r.perform(CLICK, guard))).toBe('TARGET_DRIFT');
    expect(await clicksOf(r.page)).toBe(0);
  });

  it('two identical buttons end TARGET_DRIFT', async () => {
    const r = await replay();
    await r.navigate('/pay');
    const guard = await r.guardFor('Pay now', CLICK);
    await r.page.locator('main').evaluate((element) => {
      const twin = document.createElement('button');
      twin.type = 'button';
      twin.textContent = 'Pay now';
      twin.setAttribute('onclick', 'window.clicks=(window.clicks||0)+1');
      element.append(twin);
    });
    expect(await refusal(r.perform(CLICK, guard))).toBe('TARGET_DRIFT');
    expect(await clicksOf(r.page)).toBe(0);
  });

  it('an identity mismatch ends TARGET_DRIFT for every tier', async () => {
    const r = await replay();
    await r.navigate('/pay');
    const body = `<main aria-label="Operations">
      <input name="q" aria-label="Query">
      <div id="card"><h2>Orders</h2><a href="#x" id="card-link" onclick="window.clicks=(window.clicks||0)+1">Open</a></div>
      <ul><li><button type="button" onclick="window.clicks=(window.clicks||0)+1">Remove</button></li><li><button type="button" onclick="window.clicks=(window.clicks||0)+1">Remove</button></li></ul>
      <section aria-label="Panel"><button type="button" id="inner" onclick="window.clicks=(window.clicks||0)+1">Run</button></section>
    </main>`;
    await r.page.setContent(html(body));
    const cases: [string, ResolvedTarget, () => Promise<void>][] = [
      ['attribute', { locator: [{ by: 'attr', tag: 'input', attrs: [{ name: 'name', value: 'q' }] }], tier: 'attribute', identity: { role: 'textbox', name: 'Query' } },
        async () => { await r.page.locator('input[name="q"]').evaluate((el) => { el.setAttribute('aria-label', 'Other name'); }); }],
      ['filterHas', { locator: [{ by: 'tag', tag: 'div' }, { by: 'filterHas', has: [{ by: 'role', role: 'heading', name: 'Orders', exact: true }] }, { by: 'role', role: 'link' }], tier: 'filterHas', identity: { role: 'link', name: 'Open' } },
        async () => { await r.page.locator('#card-link').evaluate((el) => { el.textContent = 'Close'; }); }],
      ['nth', { locator: [{ by: 'role', role: 'button' }, { by: 'nth', index: 1 }], tier: 'nth', identity: { role: 'button', name: 'Remove' } },
        async () => { await r.page.locator('li:nth-child(2) button').evaluate((el) => { el.textContent = 'Delete'; el.setAttribute('aria-label', 'Delete'); }); }],
      ['scoped nameless role', { locator: [{ by: 'scope', role: 'region', name: 'Panel', exact: true }, { by: 'role', role: 'button' }], tier: 'scoped', identity: { role: 'button', name: 'Run' } },
        async () => { await r.page.locator('#inner').evaluate((el) => { el.textContent = 'Stop'; }); }],
    ];
    for (const [label, target, mutate] of cases) {
      await mutate();
      const guard: Guard = { guardId: 'g-tier', origin: r.origin, target: { kind: 'element', locator: target.locator, tier: target.tier, identity: target.identity, readRuleId: null } };
      expect(await refusal(r.perform(CLICK, guard)), `${label}: the locator still matches one element whose role or name moved`).toBe('TARGET_DRIFT');
    }
    expect(await clicksOf(r.page)).toBe(0);
  });

  it('a frozen select variant literal selects the option at replay', async () => {
    const r = await replay();
    await r.navigate('/lang');
    const variant = 'python 3.12';
    const operation: ReplayAction['operation'] = { kind: 'selectOption', value: { kind: 'authoredLiteral', sourceInputId: 'choice' } };
    const guard = await r.guardFor('Language', operation, variant);
    await r.perform(operation, guard, variant);
    expect(await r.page.locator('#lang').evaluate((select: HTMLSelectElement) => select.selectedOptions[0]?.text)).toBe('Python 3.12');
  });

  it('a page-level step on a page heavier than the deadline ends TARGET_DRIFT', async () => {
    const r = await replay();
    await r.navigate('/heavy');
    const operation: ReplayAction['operation'] = { kind: 'assert', predicate: 'url', expected: { kind: 'authoredLiteral', sourceInputId: 'url' } };
    const guard: Guard = { guardId: 'g-page', origin: r.origin, target: { kind: 'page' } };
    const started = Date.now();
    expect(await refusal(r.perform(operation, guard, `${r.origin}/heavy`))).toBe('TARGET_DRIFT');
    // The refusal comes from the collection deadline, with the margin the browser and the machine need to give up a runaway page.
    expect(Date.now() - started).toBeLessThan(OBSERVATION_DEADLINE_MS * 3);
  });
});
