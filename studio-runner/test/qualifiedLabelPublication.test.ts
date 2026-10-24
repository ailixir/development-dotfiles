import { describe, expect, it } from 'vitest';
import fresh from '../fixtures/observed-reference/fresh-order-reference.json' with { type: 'json' };
import accepted from '../fixtures/observed-reference/accepted-observed-choice.json' with { type: 'json' };
import { deriveObservedArtifact } from '../src/validator/observedReplay.js';
import { ObservedRefusal } from '../src/validator/observedReferencePolicy.js';
import type { ValidationBasis } from '../src/executor/observedOperations.js';
import type { TestDocument } from './helpers/publicationFixture.js';
import { resealBasis } from './helpers/resealBasis.js';

/**
 * Round 057 publication re-check: a qualified obligation (non-null scopeIntent) with no human
 * choice resolves exactly as admission did. The base session is the fresh-order reference: step 3
 * fills Destination (testId `destination`), observed in observation 6fc94371. Edits add two named
 * landmarks and a same-named decoy in the other one; the content-addressed chain is re-sealed with
 * the independent serializer, so only the qualified rule can accept or refuse.
 */
type Basis = TestDocument<ValidationBasis>;
type Observation = Basis['observations'][number]['observation'];
type Node = Observation['nodes'][number];
type Locator = Node['locatorHints'][number];
const basisOf = (value: unknown): Basis => structuredClone(value) as Basis;
function need<T>(value: T | undefined): T {
    if (value === undefined)
        throw new Error('fixture fact missing');
    return value;
}
const fillObligation = (basis: Basis) => need(basis.translationPlan.obligations.find(o => o.operationKind === 'fill' && o.targetIntent === 'destination'));
const preparation = (basis: Basis, id: string) => need(basis.preparations.find(p => p.preparationId === id));
function observationOf(basis: Basis, id: string): Observation {
    const hash = preparation(basis, id).observationHash;
    return need(basis.observations.find(o => o.observationHash === hash)).observation;
}
const testId = (value: string): Locator => ({ kind: 'testId', value, exact: true });
function region(template: Node, nodeId: string, name: string): Node {
    return { ...structuredClone(template), nodeId, role: 'region', name, elementType: 'other', controlType: 'none', actionable: false,
        classification: 'structuralOnly', regionId: null, locatorHints: [{ kind: 'role', role: 'region', name, exact: true }] };
}
interface Options { decoyHints?: Locator[]; scope?: string | null; hideSecondary?: boolean }
/** Places `destination` in region "Primary workspace" and adds a decoy "Destination" in "Secondary workspace". */
function withTwoRegions(basis: Basis, options: Options = {}): void {
    const observation = observationOf(basis, 'preparation-2');
    const target = need(observation.nodes.find(n => n.nodeId === 'destination'));
    const primary = region(target, 'region-primary', 'Primary workspace'), secondary = region(target, 'region-secondary', 'Secondary workspace');
    if (options.hideSecondary)
        secondary.classification = 'withheld';
    const decoy: Node = { ...structuredClone(target), nodeId: 'destination-b', regionId: 'region-secondary', locatorHints: options.decoyHints ?? [testId('destination-b')] };
    target.regionId = 'region-primary';
    observation.nodes.push(primary, secondary, decoy);
    fillObligation(basis).scopeIntent = options.scope === undefined ? 'Primary workspace' : options.scope;
}
const run = (mutate: (copy: Basis) => void) => deriveObservedArtifact(resealBasis(basisOf(fresh.basis), mutate));
function refusedWith(attempt: () => unknown, code: string): void {
    let caught: unknown;
    try {
        attempt();
    }
    catch (error) {
        caught = error;
    }
    expect(caught).toBeInstanceOf(ObservedRefusal);
    expect((caught as ObservedRefusal).code).toBe(code);
}
function proposalTarget(basis: Basis, id: string): { nodeId: string; locator: Locator } {
    const target = preparation(basis, id).proposal.target;
    if (!('nodeId' in target))
        throw new Error('element target expected');
    return target as { nodeId: string; locator: Locator };
}

describe('publication re-check of a region-qualified label', () => {
    it('derives the same learned operations as the unqualified plan, with the qualifier committed in the plan hash', () => {
        const plain = deriveObservedArtifact(fresh.basis);
        const qualified = run(copy => { withTwoRegions(copy); });
        expect(qualified.artifact.learnedPlan).toEqual(plain.artifact.learnedPlan);
        expect(qualified.artifact.guards).toEqual(plain.artifact.guards);
        // The plan commits scopeIntent, so the evidence preimage and everything above it differ.
        expect(qualified.hashes.publicationEvidenceHash).not.toBe(plain.hashes.publicationEvidenceHash);
        expect(qualified.hashes.operationEquivalenceHash).toBe(plain.hashes.operationEquivalenceHash);
    });
    it('replaces the bare label by the locator name or value, so a testId that differs from the label is accepted only when qualified', () => {
        const rename = (copy: Basis, scope: string | null) => {
            withTwoRegions(copy, { scope });
            const node = need(observationOf(copy, 'preparation-2').nodes.find(n => n.nodeId === 'destination'));
            node.locatorHints = [testId('dest-primary')];
            proposalTarget(copy, 'preparation-2').locator = testId('dest-primary');
            fillObligation(copy).targetIntent = 'Destination';
        };
        refusedWith(() => run(copy => { rename(copy, null); }), 'OPERATION_MISMATCH');
        expect(() => run(copy => { rename(copy, 'Primary workspace'); })).not.toThrow();
    });
    it('a null scopeIntent changes nothing about the unqualified decision (two same-named nodes)', () => {
        expect(() => run(copy => { withTwoRegions(copy, { scope: null }); })).not.toThrow();
    });
    it('refuses a region the target is not in (the selection would be the other region)', () => {
        refusedWith(() => run(copy => { withTwoRegions(copy, { scope: 'Secondary workspace' }); }), 'OPERATION_MISMATCH');
    });
    it('refuses a region that does not exist or is withheld, with no fallback to the unqualified match', () => {
        refusedWith(() => run(copy => { withTwoRegions(copy, { scope: 'Tertiary workspace' }); }), 'OPERATION_MISMATCH');
        refusedWith(() => run(copy => { withTwoRegions(copy, { scope: 'Secondary workspace', hideSecondary: true }); }), 'OPERATION_MISMATCH');
    });
    it('refuses a swapped nodeId (the proposal names the decoy with the primary locator)', () => {
        refusedWith(() => run(copy => {
            withTwoRegions(copy);
            proposalTarget(copy, 'preparation-2').nodeId = 'destination-b';
        }), 'OPERATION_MISMATCH');
    });
    it('refuses a locator that another node also carries', () => {
        refusedWith(() => run(copy => { withTwoRegions(copy, { decoyHints: [testId('destination')] }); }), 'OPERATION_MISMATCH');
    });
    it('refuses an altered scopeIntent that is not committed by the plan hash', () => {
        const copy = resealBasis(basisOf(fresh.basis), c => { withTwoRegions(c); });
        fillObligation(copy).scopeIntent = 'Secondary workspace';
        refusedWith(() => deriveObservedArtifact(copy), 'EVIDENCE_MISMATCH');
    });
    it('refuses a qualified obligation whose target is not an element (page target)', () => {
        expect(() => run(copy => {
            need(copy.translationPlan.obligations.find(o => o.operationKind === 'navigate')).scopeIntent = 'Primary workspace';
        })).toThrow(ObservedRefusal);
    });
    it('an accepted observed choice takes precedence: the qualified rule never runs for that obligation', () => {
        const basis = basisOf(accepted.basis);
        const witnessed = need(basis.preparations.find(p => p.observedChoice));
        const id = need(witnessed.observedChoice).receipt.obligationId;
        const plain = deriveObservedArtifact(accepted.basis);
        const qualified = deriveObservedArtifact(resealBasis(basis, copy => {
            const choice = need(need(copy.preparations.find(p => p.observedChoice)).observedChoice);
            for (const plan of [copy.translationPlan, choice.questionPlan.plan])
                need(plan.obligations.find(o => o.obligationId === id)).scopeIntent = 'Nowhere workspace';
        }));
        expect(qualified.artifact.learnedPlan).toEqual(plain.artifact.learnedPlan);
    });
});
