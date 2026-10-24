import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { qualifiedCandidates, qualifiedLocator, regionNameOf } from '../src/validator/qualifiedLabel.js';
import type { QualifiedObservation } from '../src/validator/qualifiedLabel.js';
import { ObservedRefusal } from '../src/validator/observedReferencePolicy.js';

/**
 * Round 057: the same region-qualified label vectors the backend GuidedQualifiedLabelVectorsTest
 * reads. One observation, positive and negative cases; the Java and Node validators must agree on
 * every one.
 */
interface Vector { name: string; targetIntent: string; scopeIntent: string; candidates: string[]; target: { nodeId: string; locator: unknown }; expected: 'ACCEPT' | 'REFUSE' }
const vectors = JSON.parse(readFileSync(new URL('../../docs/specs/studio-observed-authoring/contracts/v3/qualified-label-vectors.json', import.meta.url), 'utf8')) as { observation: QualifiedObservation; cases: Vector[] };
describe('region-qualified labels, shared vectors', () => {
    for (const vector of vectors.cases) {
        it(vector.name, () => {
            expect(qualifiedCandidates(vectors.observation, vector.targetIntent, vector.scopeIntent).map(n => n.nodeId)).toEqual(vector.candidates);
            const run = () => qualifiedLocator(vectors.observation, { targetIntent: vector.targetIntent, scopeIntent: vector.scopeIntent }, vector.target);
            if (vector.expected === 'ACCEPT')
                expect(run()).toEqual(vector.target.locator);
            else
                expect(run).toThrow(ObservedRefusal);
        });
    }
    it('a null scopeIntent is never qualified', () => {
        const first = vectors.cases[0];
        expect(() => qualifiedLocator(vectors.observation, { targetIntent: 'Open', scopeIntent: null }, first?.target ?? {})).toThrow(ObservedRefusal);
    });
    it('a region of another document or generation is absent', () => {
        const node = vectors.observation.nodes.find(n => n.nodeId === 'open-primary');
        if (!node)
            throw new Error('fixture node');
        expect(regionNameOf(vectors.observation, node)).toBe('Primary workspace');
        expect(regionNameOf({ ...vectors.observation, documentId: 'other' }, node)).toBeNull();
        expect(regionNameOf({ ...vectors.observation, generation: 4 }, node)).toBeNull();
    });
});
