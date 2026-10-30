import { describe, expect, it } from 'vitest';

import { internalsOf, perceive } from '../../src/run/perceive.js';
import { synthesize, toEngineSelector } from '../../src/run/locatorSynth.js';
import { PrivateInventory } from '../../src/run/privateInventory.js';
import { ScriptedCdp, elementFacts, n, page } from './perceptionFakes.js';

const VALUE = 'Zephyr Quartz Ninefold 7341';
async function scenario(name = 'Order reference', proved = true, values = [VALUE]) {
  const inventory = new PrivateInventory();
  const facts = { ...elementFacts('output'), ...(proved ? { primaryNameSource: 'PRIMARY_ARIA_LABEL' as const } : {}) };
  const cdp = new ScriptedCdp({
    collected: page([n('status', { ref: 'e1', name }, VALUE)], { e1: facts }), backendIds: { e1: 71 },
    candidateFacts: () => ({ tag: 'output', id: 'raw-id', name: 'raw-name', type: null, ariaLabel: name, title: 'raw-title', placeholder: 'raw-prompt', testId: 'raw-testid', levels: [], generated: null }),
    check: (_ref, selectors) => selectors.map((selector) => selector.includes('status') && selector.includes(name) ? { count: 1, index: 0 } : { count: 0, index: -1 }),
  });
  const perception = await perceive({ cdp, inventory, privateValues: values });
  return { inventory, perception };
}

describe('primary output identity synthesis', () => {
  it('synthesizes the exact public status name and current identity without raw attribute candidates', async () => {
    const s = await scenario();
    const result = await synthesize({ ...s, ref: 'e1' });
    expect(result).toMatchObject({ ok: true, tier: 'role', locator: [{ by: 'role', role: 'status', name: 'Order reference', exact: true }], identity: { role: 'status', name: 'Order reference' } });
    expect(JSON.stringify(result)).not.toMatch(/raw-id|raw-name|raw-title|raw-prompt|raw-testid|Zephyr/u);
  });

  it('keeps identity names null for revoked or unproved withheld nodes', async () => {
    for (const proved of [true, false]) {
      const s = await scenario(VALUE, proved);
      const node = internalsOf(s.perception)?.byRef.get('e1');
      expect(node?.rawName).toBe('');
      const result = await synthesize({ ...s, ref: 'e1' });
      if (result.ok) expect(result.identity.name).toBeNull();
    }
  });

  it('rejects a private joined locator and never recovers a raw primary label', async () => {
    const s = await scenario('Quillon', true, [VALUE, 'Quillon Marsh']);
    const result = await synthesize({ ...s, ref: 'e1' });
    if (result.ok) {
      expect(toEngineSelector(result.locator)).not.toContain('Quillon Marsh');
      expect(result.locator.every((step) => !['attr', 'label', 'placeholder', 'testId'].includes(step.by))).toBe(true);
    }
    expect(JSON.stringify(result)).not.toContain(VALUE);
  });
});
