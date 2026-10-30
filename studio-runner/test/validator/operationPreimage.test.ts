import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hash } from '../../src/guided/contracts.js';
import { hashObserved } from '../../src/validator/observedReferencePolicy.js';
import { operationPreimage } from '../../src/validator/operationPreimage.js';

interface VectorAction { coordinate: { stepId: string; ordinal: number }; origin: string | null; target: Parameters<typeof operationPreimage>[2]; operation: Parameters<typeof operationPreimage>[3]; operationHash: string }
const VECTORS = JSON.parse(readFileSync(join(__dirname, '../../../docs/specs/studio-observed-authoring/contracts/v3/publication-canonical-vectors.json'), 'utf8')) as unknown;

const actionsIn = (node: unknown, found: VectorAction[] = []): VectorAction[] => {
  if (Array.isArray(node)) node.forEach(item => actionsIn(item, found));
  else if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if ('operationHash' in record && 'operation' in record && 'coordinate' in record && 'origin' in record && 'target' in record) found.push(record as unknown as VectorAction);
    Object.values(record).forEach(value => actionsIn(value, found));
  }
  return found;
};

describe('operationPreimage', () => {
  it('the preimage equals the WI-3 publication-canonical-vectors entries', () => {
    const actions = actionsIn(VECTORS);
    expect(actions.length).toBeGreaterThanOrEqual(10);
    expect(actions.some(a => a.target === null)).toBe(true); // the null-target (navigate) entries
    expect(actions.some(a => a.target !== null)).toBe(true); // the node-target entries
    for (const action of actions) {
      const preimage = operationPreimage(action.coordinate, action.origin, action.target, action.operation);
      expect(hash(preimage)).toBe(action.operationHash);
      expect(hashObserved(preimage)).toBe(action.operationHash);
    }
  });

  it('keeps exactly the four preimage members and copies the coordinate', () => {
    const coordinate = { stepId: 's', ordinal: 2, extra: 1 } as { stepId: string; ordinal: number };
    const preimage = operationPreimage(coordinate, null, null, { kind: 'navigate', destinationInputId: 'd' } as never);
    expect(Object.keys(preimage).sort()).toEqual(['coordinate', 'operation', 'origin', 'target']);
    expect(preimage.coordinate).toEqual({ stepId: 's', ordinal: 2 });
    expect(preimage.coordinate).not.toBe(coordinate);
  });
});
