import {currentReference} from './helpers/currentWorlds.js';
import type {ValidationBasis} from '../src/executor/observedOperations.js';
import type {TestDocument} from './helpers/publicationFixture.js';
import controlFixture from '../fixtures/observed-reference/control-value-reference.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/observed-reference/fresh-order-reference.json' with { type: 'json' };
import { deriveObservedArtifact, validateReplayArtifact, validateObservedRequest } from '../src/validator/observedReplay.js';
import { OBSERVED_LIMITS, OBSERVED_PROFILE, OBSERVED_SCHEMA_BUNDLE_HASH, hashObserved, validateObserved } from '../src/validator/observedReferencePolicy.js';
const build = { profileHash: hashObserved(OBSERVED_PROFILE), schemaBundleHash: OBSERVED_SCHEMA_BUNDLE_HASH, referenceBundleHash: 'a'.repeat(64), executableImageDigest: 'b'.repeat(64), chromiumBuild: 'fixture-123' };
const request = () => { expect(deriveObservedArtifact(fixture.basis)).toEqual({artifact:fixture.artifact,hashes:fixture.hashes}); return { schemaVersion: 3, attemptId: '00000000-0000-4000-8000-000000000900', claimId: '00000000-0000-4000-8000-000000000901', snapshotHash: 'c'.repeat(64), basisHash: hashObserved(fixture.basis), requiredProfile: OBSERVED_PROFILE, requiredBuild: build, artifact: structuredClone(fixture.artifact), validationBasis: structuredClone(fixture.basis) }; };
describe('independent packaged observed validator', () => {
    it('derives fixed manual graph, original guard facts, source recipes and every hash', () => {
        expect(deriveObservedArtifact(fixture.basis)).toEqual({ artifact: fixture.artifact, hashes: fixture.hashes });
        expect(validateReplayArtifact(fixture.artifact)).toEqual(fixture.artifact);
        expect(validateObservedRequest(request(), build).ok).toBe(true);
    });
    it('accepts truthful absent historical full prompt/model labels, requires output pin', () => {
        expect(fixture.basis.learningProvenance.guidedPromptHash).toBeNull();
        const b: Record<string, unknown> = structuredClone(fixture.basis.learningProvenance);
        delete b.outputContractHash;
        expect(() => validateObserved('replay-profile#/definitions/LearningProvenance', b)).toThrow();
    });
    it('rejects a coherent self-hashed artifact guard origin substitution against original evidence', () => {
        const r = request();
        required(r.artifact.guards[1]).origin = 'https://other.example.test';
        expect(validateObservedRequest(r, build)).toMatchObject({ ok: false });
    });
});
const BASIS_JOIN_MUTATIONS=['scope', 'allocation', 'producer', 'consumer', 'source-reference', 'prepared-evidence', 'observation-node', 'observation-hash', 'proof-fence', 'ledger-count', 'ledger-state', 'operation-hash', 'extra-observation', 'missing-preparation', 'translation-id', 'bootstrap-origin', 'input-span', 'config-map'] as const;
function mutateBasisJoin(name:typeof BASIS_JOIN_MUTATIONS[number],b:TestDocument<ValidationBasis>):void {
        if (name === 'scope')
            b.scope.principalId = 'different';
        if (name === 'allocation')
            required(b.allocations[0]).bindingId = 'substitute';
        if (name === 'producer')
            required(b.producers[0]).producerAdmissionId = 'other';
        if (name === 'consumer')
            required(b.consumerEdges[0]).coordinate.ordinal = 1;
        if (name === 'source-reference')
            required(b.translationPlan.sourceReferences[0]).stepId = required(b.sourceSteps[1]).stepId;
        if (name === 'prepared-evidence')
            required(b.preparations[1]).proposal.executionEvidence.generation = 999;
        if (name === 'observation-node')
            required(Object.values(required(b.observations[0]).observation.facts)[0]).name = 'tampered fact';
        if (name === 'observation-hash')
            required(b.observations[0]).observationHash = 'a'.repeat(64);
        if (name === 'proof-fence')
            required(b.preparations[0]).proof.ownerFence++;
        if (name === 'ledger-count')
            required(b.actions[0]).ledger.dispatchCount = 2;
        if (name === 'ledger-state')
            required(b.actions[0]).ledger.state = 'ADMITTED';
        if (name === 'operation-hash')
            required(b.actions[0]).ledger.operationHash = 'b'.repeat(64);
        if (name === 'extra-observation')
            b.observations.push(required(b.observations[0]));
        if (name === 'missing-preparation')
            b.preparations.pop();
        if (name === 'translation-id')
            required(b.translationPlan.needs[0]).bindingId = 'forged';
        if (name === 'bootstrap-origin')
            (b.bootstrap.initialEvidence as {
                origin: unknown;
            }).origin = 'https://orders.example.test';
        if (name === 'input-span')
            required(b.inputs[1]).provenance.endUtf16 = 999;
        if (name === 'config-map')
            required<TestDocument<ValidationBasis['configurationReferences'][number]>>(b.configurationReferences[0]).inputId = 'wrong';
}
describe('original evidence bidirectional joins', () => {
    it('derives authorized control-value read independently', () => { expect(deriveObservedArtifact(controlFixture.basis)).toEqual({ artifact: controlFixture.artifact, hashes: controlFixture.hashes }); });
    it.each(BASIS_JOIN_MUTATIONS)('refuses %s mutation', name => {
        const reference=name==='config-map'?currentReference('configuration'):fixture;
        expect(deriveObservedArtifact(reference.basis)).toEqual({artifact:reference.artifact,hashes:reference.hashes});
        const b:TestDocument<ValidationBasis> = structuredClone(reference.basis);
        mutateBasisJoin(name,b);
        b.translationHash = hashObserved(b.translationPlan);
        expect(() => deriveObservedArtifact(b)).toThrow();
    });
    it.each(BASIS_JOIN_MUTATIONS)('preserves control-value subtype while refusing %s basis mutation',name=>{
        const reference=currentReference(name==='config-map'?'configuration':'control');
        expect(deriveObservedArtifact(reference.basis)).toEqual({artifact:reference.artifact,hashes:reference.hashes});
        const b=structuredClone(validateObserved<ValidationBasis>('replay-validation#/definitions/ValidationBasis',reference.basis,OBSERVED_LIMITS.basis)) as TestDocument<ValidationBasis>;
        mutateBasisJoin(name,b);b.translationHash=hashObserved(b.translationPlan);expect(()=>deriveObservedArtifact(b)).toThrow();
    });
    it.each(['click', 'fill', 'read', 'press', 'navigate', 'assert'])('refuses a retired operation kind (%s): the exercised first step is a step record', kind => {
        const r = request();
        (required(required(r.artifact.steps[0]).operations[0]) as { operation: unknown }).operation = { kind };
        expect(() => validateReplayArtifact(r.artifact)).toThrow();
    });
    it('binds output-contract provenance to the evidence hash, without current model defaults', () => {
        const r = request();
        r.validationBasis.learningProvenance.outputContractHash = 'd'.repeat(64);
        r.basisHash = hashObserved(r.validationBasis);
        expect(validateObservedRequest(r, build).ok).toBe(false);
    });
});
// These mutations preserve artifact-local hashes; only original admission authority distinguishes them.
it.each(['policy-decision', 'proof-expiry'])('refuses original admission %s even with coherent local artifact hashes', kind => {
    const b = structuredClone(fixture.basis);
    if (kind === 'policy-decision')
        required(b.actions[0]).ledger.admission.policyDecisionHash = 'd'.repeat(64);
    else
        required(b.preparations[0]).proof.expiresAt = '2026-10-08T03:00:26Z';
    expect(() => deriveObservedArtifact(b)).toThrow('EVIDENCE_MISMATCH');
});
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}
