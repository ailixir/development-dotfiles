import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObservedInvocationControl, ReplayAcquisitionBudget } from '../../../src/executor/observedReplay.js';
import type { Guard, ReplayAction, Scope } from '../../../src/executor/observedOperations.js';
import { readGrantId } from '../../../src/run/observationReadProfile.js';
import { createObservedReplayAdapter } from '../../../src/run/observedReplayAdapter.js';
import { LOCAL_DOMAIN, TEST_DOMAINS } from '../../helpers/allowedDomains.js';
import { playwrightBrowserFactory } from '../preparedBrowser.js';
import { guardDist } from './harness.js';
import { html, serve, type Served } from './cutover-support.js';

/**
 * Replay of a published run through the real adapter: a titled-table read of a link-only cell (five-step chain, ends at the cell), a
 * page step that observes and then navigates, and a titled-table read of one link in a mixed cell (six-step chain, ends at the link).
 * The page step leaves a held observation of the old document behind; the next table read must not reuse its destroyed engine.
 */

guardDist();

const SCOPE: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', capabilities: ['navigate', 'read'], initialContext: { kind: 'initialBlank' } };
const STEP = '00000000-0000-4000-8000-000000000001';
const RULE = readGrantId(LOCAL_DOMAIN);

const table = (title: string, value: string): string => `<main><table><tbody><tr><th colspan="2">${title}</th></tr>
<tr><th scope="row"><a href="#designed">Designed by</a></th><td>${value}</td></tr></tbody></table></main>`;

let served: Served;
beforeAll(async () => {
  served = await serve({
    '/python': html(table('Python', '<a href="#guido">Guido van Rossum</a>')),
    '/settling': html('<main><h1>Settling</h1></main><script>let n = 0; const id = setInterval(() => { document.documentElement.classList.toggle("settling"); if (++n > 24) clearInterval(id); }, 25);</script>').replace('<title>Operations</title>', '<title>Settling page</title>'),
    '/javascript': html(table('JavaScript', '<a href="#eich">Brendan Eich</a> of <a href="#netscape">Netscape</a> first, then others contributed')),
  });
});
afterAll(async () => { await served.close(); });

type ElementLocator = Extract<Guard['target'], { kind: 'element' }>['locator'];
const chain = (title: string): ElementLocator => [
  { by: 'tag', tag: 'table' }, { by: 'filterHas', has: [{ by: 'role', role: 'columnheader', name: title, exact: true }] },
  { by: 'tag', tag: 'tr' }, { by: 'filterHas', has: [{ by: 'role', role: 'link', name: 'Designed by', exact: true }] }, { by: 'tag', tag: 'td' },
];
const READ: ReplayAction['operation'] = { kind: 'read', bindingId: 'binding', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: RULE } };

describe('replay of titled-table reads (five-step cell and six-step link chains)', () => {
  it('reads the cell, navigates, then reads the link of the mixed cell', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'titled-read-replay-'));
    const handle = await playwrightBrowserFactory.launch({ allowedDomains: TEST_DOMAINS, browser: 'chromium', viewport: { width: 1280, height: 720 }, recording: { width: 640, height: 480 }, scratchPath: dir, observedScope: SCOPE });
    try {
      const adapter = createObservedReplayAdapter(handle, SCOPE, TEST_DOMAINS, 'titled-read-replay', () => undefined);
      const budget = new ReplayAcquisitionBudget();
      let ordinal = 0;
      const perform = (operation: ReplayAction['operation'], guard: Guard, value: string | null = null): Promise<unknown> => {
        const control = new ObservedInvocationControl({ now: () => performance.now() }, performance.now() + 60_000, new AbortController().signal, budget, { extra: 0 });
        const action: ReplayAction = { coordinate: { stepId: STEP, ordinal: ordinal++ }, guardId: guard.guardId, operation };
        return control.run(() => adapter.perform(action, guard, value, control));
      };
      const origin = served.origin;
      const navigate: ReplayAction['operation'] = { kind: 'navigate', destinationInputId: 'destination' };
      await perform(navigate, { guardId: 'g0', origin: null, target: { kind: 'initialBlank' } }, `${origin}/python`);
      const cell: Guard = { guardId: 'g1', origin, target: { kind: 'element', tier: 'filterHas', locator: chain('Python'), identity: { role: 'cell', name: null }, readRuleId: RULE } };
      expect(await perform(READ, cell)).toEqual({ value: 'Guido van Rossum' });
      // The sole link of the link-only cell is a scoped read target too (six-step chain).
      const soleLink: Guard = { guardId: 'g1b', origin, target: { kind: 'element', tier: 'filterHas', identity: { role: 'link', name: 'Guido van Rossum' }, readRuleId: RULE,
        locator: [...chain('Python'), { by: 'role', role: 'link', name: 'Guido van Rossum', exact: true }] } };
      expect(await perform({ ...READ, bindingId: 'sole-link' }, soleLink)).toEqual({ value: 'Guido van Rossum' });
      adapter.captureRead?.('binding');
      await perform(navigate, { guardId: 'g2', origin, target: { kind: 'page' } }, `${origin}/javascript`);
      const link: Guard = { guardId: 'g3', origin, target: { kind: 'element', tier: 'filterHas', identity: { role: 'link', name: 'Brendan Eich' }, readRuleId: RULE,
        locator: [...chain('JavaScript'), { by: 'role', role: 'link', name: 'Brendan Eich', exact: true }] } };
      expect(await perform({ ...READ, bindingId: 'second' }, link)).toEqual({ value: 'Brendan Eich' });
    } finally {
      await handle.dispose();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('takes a page step observation again when a site script is still mutating the page right after the navigation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'settling-page-replay-'));
    const handle = await playwrightBrowserFactory.launch({ allowedDomains: TEST_DOMAINS, browser: 'chromium', viewport: { width: 1280, height: 720 }, recording: { width: 640, height: 480 }, scratchPath: dir, observedScope: SCOPE });
    try {
      const adapter = createObservedReplayAdapter(handle, SCOPE, TEST_DOMAINS, 'settling-page-replay', () => undefined);
      const budget = new ReplayAcquisitionBudget();
      let ordinal = 0;
      const perform = (operation: ReplayAction['operation'], guard: Guard, value: string | null = null): Promise<unknown> => {
        const control = new ObservedInvocationControl({ now: () => performance.now() }, performance.now() + 60_000, new AbortController().signal, budget, { extra: 0 });
        const action: ReplayAction = { coordinate: { stepId: STEP, ordinal: ordinal++ }, guardId: guard.guardId, operation };
        return control.run(() => adapter.perform(action, guard, value, control));
      };
      const origin = served.origin;
      await perform({ kind: 'navigate', destinationInputId: 'destination' }, { guardId: 'g0', origin: null, target: { kind: 'initialBlank' } }, `${origin}/settling`);
      const title: ReplayAction['operation'] = { kind: 'assert', predicate: 'title', expected: { kind: 'authoredLiteral', sourceInputId: 'expected' } };
      expect(await perform(title, { guardId: 'g1', origin, target: { kind: 'page' } }, 'Settling page')).toEqual({ assertionPassed: true });
    } finally {
      await handle.dispose();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
