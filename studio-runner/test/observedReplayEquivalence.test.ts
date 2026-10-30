import { describe, it, expect } from 'vitest';
import vectors from '../../docs/specs/studio-observed-authoring/contracts/v3/publication-canonical-vectors.json' with { type: 'json' };
import { canonicalObserved, hashObserved, parseObservedBytes, OBSERVED_LIMITS } from '../src/validator/observedReferencePolicy.js';

describe('packaged canonical contracts', () => {
    it.each(vectors.positive)('matches independent canonical-v1 $name', v => { expect(Buffer.from(canonicalObserved(v.input)).toString('hex')).toBe(v.canonicalUtf8Hex); expect(hashObserved(v.input)).toBe(v.sha256); });
    it.each(vectors.negative)('refuses raw $name', v => { expect(() => parseObservedBytes(Buffer.from(v.utf8Hex, 'hex'), OBSERVED_LIMITS.validation)).toThrow(); });
});
import { sortInputRecipes } from '../src/validator/observedReplay.js';
import type { InputRecipe } from '../src/executor/observedOperations.js';
it('implements the complete source-position/span/slot/config total order', () => {
    const steps = ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001'];
    const span = (inputId: string, start: number, end: number, slot: 'fill.value' | 'assert.expected' = 'fill.value', stepId = required(steps[0])): InputRecipe => ({ inputId, stepId, kind: 'nonsecretText', intendedSlot: slot, provenance: { kind: 'sourceSpan', start, end, sourceHash: 'a'.repeat(64) } });
    const cfg = (inputId: string, referenceId: string): InputRecipe => ({ inputId, stepId: required(steps[0]), kind: 'nonsecretText', intendedSlot: 'fill.value', provenance: { kind: 'configuration', referenceId, referenceName: referenceId } });
    const unordered = [span('b', 2, 5), span('a', 2, 4), span('c', 2, 5, 'assert.expected'), cfg('d', 'cfg-b'), cfg('e', 'cfg-a'), span('f', 0, 1, 'fill.value', required(steps[1]))];
    expect(sortInputRecipes(unordered, steps).map(i => i.inputId)).toEqual(vectors.inputRecipeOrder);
});
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}
