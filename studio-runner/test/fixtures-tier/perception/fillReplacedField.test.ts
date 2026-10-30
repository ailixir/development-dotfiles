import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObservedInvocationControl, ReplayAcquisitionBudget } from '../../../src/executor/observedReplay.js';
import type { Guard, ReplayAction, Scope } from '../../../src/executor/observedOperations.js';
import { createObservedReplayAdapter } from '../../../src/run/observedReplayAdapter.js';
import { TEST_DOMAINS } from '../../helpers/allowedDomains.js';
import { playwrightBrowserFactory } from '../preparedBrowser.js';
import { guardDist } from './harness.js';
import { html, serve, type Served } from './cutover-support.js';

/**
 * Replay of a fill into a search box that the page replaces with a new input while it is used (Wikipedia's autocomplete component swaps
 * it shortly after it takes focus, keeping the value and the focus, under another role). The fill must land in the successor; a field that
 * is merely gone, or replaced by an input with another name, is still an unknown outcome.
 */

guardDist();

const SCOPE: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', capabilities: ['navigate', 'fill'], initialContext: { kind: 'initialBlank' } };
const STEP = '00000000-0000-4000-8000-000000000001';
const VALUE = 'Brendan Eich';

/** The legacy input is swapped for a new combobox on `focus` or on the first `input`; `next` decides what the successor looks like. */
const page = (trigger: 'focus' | 'input', next: 'same-name' | 'other-name' | 'none'): string => `<main><form action="/result"><input type="search" name="q" aria-label="Find items" id="legacy"></form></main>
<script>
const swap = () => {
  const old = document.getElementById('legacy'); if (!old) return;
  const value = old.value; old.remove();
  if ('${next}' === 'none') return;
  const successor = document.createElement('input'); successor.type = 'search'; successor.name = 'q'; successor.setAttribute('role', 'combobox');
  successor.setAttribute('aria-label', '${next === 'same-name' ? 'Find items' : 'Something else'}'); successor.value = value;
  document.querySelector('form').append(successor); successor.focus();
};
document.getElementById('legacy').addEventListener('${trigger}', () => { setTimeout(swap, 0); }, { once: true });
</script>`;

let served: Served;
beforeAll(async () => {
  served = await serve({
    '/focus-swap': html(page('focus', 'same-name')),
    '/input-swap': html(page('input', 'same-name')),
    '/other-name': html(page('input', 'other-name')),
    '/gone': html(page('input', 'none')),
  });
});
afterAll(async () => { await served.close(); });

async function fillOn(path: string): Promise<{ outcome: unknown; focusedValue: string | null }> {
  const dir = await mkdtemp(join(tmpdir(), 'fill-replaced-'));
  const handle = await playwrightBrowserFactory.launch({ allowedDomains: TEST_DOMAINS, browser: 'chromium', viewport: { width: 1280, height: 720 }, recording: { width: 640, height: 480 }, scratchPath: dir, observedScope: SCOPE });
  try {
    const adapter = createObservedReplayAdapter(handle, SCOPE, TEST_DOMAINS, 'fill-replaced', () => undefined);
    const budget = new ReplayAcquisitionBudget();
    let ordinal = 0;
    const perform = (operation: ReplayAction['operation'], guard: Guard, value: string | null): Promise<unknown> => {
      const control = new ObservedInvocationControl({ now: () => performance.now() }, performance.now() + 60_000, new AbortController().signal, budget, { extra: 0 });
      const action: ReplayAction = { coordinate: { stepId: STEP, ordinal: ordinal++ }, guardId: guard.guardId, operation };
      return control.run(() => adapter.perform(action, guard, value, control));
    };
    const origin = served.origin;
    await perform({ kind: 'navigate', destinationInputId: 'destination' }, { guardId: 'g0', origin: null, target: { kind: 'initialBlank' } }, `${origin}${path}`);
    const field: Guard = { guardId: 'g1', origin, target: { kind: 'element', tier: 'role', locator: [{ by: 'role', role: 'searchbox', name: 'Find items', exact: true }], identity: { role: 'searchbox', name: 'Find items' }, readRuleId: null } };
    let outcome: unknown;
    try { outcome = await perform({ kind: 'fill', value: { kind: 'authoredLiteral', sourceInputId: 'x' } }, field, VALUE); }
    catch (error) { outcome = error instanceof Error ? error.message : String(error); }
    const live = (handle as unknown as { page: { evaluate<T>(f: () => T): Promise<T> } }).page;
    return { outcome, focusedValue: await live.evaluate(() => (document.activeElement instanceof HTMLInputElement ? document.activeElement.value : null)) };
  } finally {
    await handle.dispose();
    await rm(dir, { recursive: true, force: true });
  }
}

describe('fill into a search box the page replaces', () => {
  it.each(['/focus-swap', '/input-swap'])('fills the focused successor (%s)', async path => {
    const result = await fillOn(path);
    expect(result).toEqual({ outcome: {}, focusedValue: VALUE });
  });

  it('still reports an unknown outcome when the field is gone', async () => {
    expect((await fillOn('/gone')).outcome).toBe('OUTCOME_UNKNOWN');
  });

  it('still reports an unknown outcome when the replacement has another name', async () => {
    expect((await fillOn('/other-name')).outcome).toBe('OUTCOME_UNKNOWN');
  });
});
