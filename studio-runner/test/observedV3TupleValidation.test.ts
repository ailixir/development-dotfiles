import { describe, expect, it } from 'vitest';
import fixtureJson from '../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json' with { type: 'json' };
import type {PublicationDocument,TestDocument} from './helpers/publicationFixture.js';
import { deriveObservedArtifact, validateObservedRequest, validateReplayArtifact } from '../src/validator/observedReplay.js';
import { hashObserved, OBSERVED_PROFILE, OBSERVED_SCHEMA_BUNDLE_HASH } from '../src/validator/observedReferencePolicy.js';
// Typed view of the static JSON import: the file exceeds tsserver's 4 MiB non-TS limit, so ESLint's projectService types it as `error`.
const fixture=fixtureJson as unknown as TestDocument<PublicationDocument>;

const build = { ...fixture.build, schemaBundleHash: OBSERVED_SCHEMA_BUNDLE_HASH };
const versions = { contract: 3 };
// The nine-pin tuple and 17-key profile collapsed to {contract:3} (STUDIO-OBS-012A, tuple-spec).
const retiredPins = {
  learnedPlan: 3, observation: 3, guidedPolicy: 3, referencePolicy: 4, lowering: 2, artifact: 3,
  language: 'observed-3', executor: 'observed-4',
};

describe('active observed v3 admission and publication tuple', () => {
  it('accepts the full admitted v3 proof through derivation, artifact validation and request validation', () => {
    expect(fixture.basis.preparations.length).toBeGreaterThan(0);
    for (const preparation of fixture.basis.preparations) expect(preparation.proof.versions).toEqual(versions);
    const derived = deriveObservedArtifact(fixture.basis);
    expect(derived.artifact).toEqual(fixture.artifact);
    expect(derived.artifact.profile).toEqual(OBSERVED_PROFILE);
    expect(derived.artifact.learnedPlan.versions).toEqual(versions);
    expect(validateReplayArtifact(derived.artifact)).toEqual(derived.artifact);
    expect(validateObservedRequest({ ...fixture.validationRequest, requiredBuild: build }, build)).toMatchObject({
      ok: true, errorCode: null, artifactHash: hashObserved(fixture.artifact),
    });
  });

  it('refuses an old v2 proof tuple instead of activating a fallback', () => {
    const basis = structuredClone(fixture.basis);
    const proof = basis.preparations[0]?.proof;
    if (!proof) throw new Error('Missing admitted proof fixture');
    (proof as { versions: unknown }).versions = { contract: 2, learnedPlan: 2, observation: 2, guidedPolicy: 2,
      referencePolicy: 3, lowering: 1, artifact: 2, language: 'observed-2', executor: 'observed-2' };
    expect(() => deriveObservedArtifact(basis)).toThrow('INVALID_CONTRACT');
  });
  it('rejects a retired executor pin on the proof tuple and a retired catalog on the profile; the profile is {contract:3}',()=>{
    const basis=structuredClone(fixture.basis);const proof=basis.preparations[0]?.proof;if(!proof)throw new Error('PROOF');
    (proof.versions as Record<string, unknown>).executor='observed-4';expect(()=>deriveObservedArtifact(basis)).toThrow('INVALID_CONTRACT');
    const artifact=structuredClone(fixture.artifact);(artifact.profile as Record<string, unknown>).catalog='observed-replay-3';expect(()=>validateReplayArtifact(artifact)).toThrow();
    expect(OBSERVED_PROFILE).toEqual({ contract: 3 });expect(fixture.build.profileHash).toBe(hashObserved({ contract: 3 }));
  });

  it.each(Object.keys(versions) as (keyof typeof versions)[])('refuses a single mutated %s proof pin', key => {
    const basis = structuredClone(fixture.basis);
    const proof = basis.preparations[0]?.proof;
    if (!proof) throw new Error('Missing admitted proof fixture');
    const pins: Record<string, string | number> = proof.versions;
    const current = pins[key];
    pins[key] = typeof current === 'number' ? current + 1 : 'observed-invalid';
    expect(() => deriveObservedArtifact(basis)).toThrow('INVALID_CONTRACT');
  });

  it.each(Object.keys(retiredPins) as (keyof typeof retiredPins)[])('refuses a retired %s proof pin', key => {
    const basis = structuredClone(fixture.basis);
    const proof = basis.preparations[0]?.proof;
    if (!proof) throw new Error('Missing admitted proof fixture');
    (proof.versions as Record<string, unknown>)[key] = retiredPins[key];
    expect(() => deriveObservedArtifact(basis)).toThrow('INVALID_CONTRACT');
  });
});
