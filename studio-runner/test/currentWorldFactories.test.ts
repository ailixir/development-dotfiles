import {describe,expect,it} from 'vitest';
import {currentReference,currentJob,mutableCurrentJob} from './helpers/currentWorlds.js';
import {publicationFixture} from './helpers/publicationFixture.js';
import {deriveObservedArtifact,validateObservedJob} from '../src/validator/observedReplay.js';
import {hashObserved,OBSERVED_SCHEMA_BUNDLE_HASH} from '../src/validator/observedReferencePolicy.js';
import type {TrustedPolicy} from '../src/executor/observedOperations.js';
const build={...publicationFixture.build,schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH};
describe('exact permanent current-world factories before adversarial mutations',()=>{
  it.each(['choice','control','configuration']as const)('constructs %s from declared source preimages and preserves raw3/effective2',kind=>{
    const parent=currentReference(kind);expect(deriveObservedArtifact(parent.basis)).toEqual({artifact:parent.artifact,hashes:parent.hashes});expect(parent.basis.materializationEvidence.entries).toHaveLength(3);expect(parent.basis.inputs).toHaveLength(2);expect(parent.artifact.inputRecipes).toHaveLength(2);expect(parent.basis.bootstrap.contextRevision).toBe(1);expect(parent.basis.bootstrap.inputsHash).toBe(parent.basis.materializationEvidence.versions[0]?.authoredInputsHash);
  });
  it('uses saved-label configuration in the actual label fill, retaining the unused source label only in history',()=>{
    const parent=currentReference('configuration');expect(parent.basis.preparations[3]?.proposal.operation).toEqual({kind:'fill',value:{kind:'authoredLiteral',sourceInputId:'input-config'}});expect(parent.basis.translationPlan.obligations[3]?.referenceIndex).toBe(2);expect(parent.basis.configurationReferences).toHaveLength(1);expect(parent.basis.inputs.map(input=>input.inputId)).toEqual(['input-destination','input-config']);expect(parent.basis.materializationEvidence.entries.map(input=>input.inputId)).toContain('input-label');
  });
  it('never reseals or heals a malicious capture when creating a later independent parent',()=>{
    const canonicalBefore=JSON.stringify(publicationFixture.observedChoice),parent=currentReference('choice'),witness=parent.basis.preparations[3]?.observedChoice;if(!witness)throw new Error('CHOICE');witness.context.questionCapture.authoredInputsHash='a'.repeat(64);const mutant=JSON.stringify(parent.basis);expect(()=>deriveObservedArtifact(parent.basis)).toThrow();const later=currentReference('choice');expect(later.basis).not.toBe(parent.basis);expect(JSON.stringify(parent.basis)).toBe(mutant);expect(JSON.stringify(publicationFixture.observedChoice)).toBe(canonicalBefore);
  });
  it('emits coherent current jobs under fresh synthetic grant identity before any mutation',()=>{
    const now=Date.now(),parent=currentJob(build,{now,executionId:'00000000-0000-4000-8000-00000000d001',attemptId:'00000000-0000-4000-8000-00000000d002'});expect(validateObservedJob(parent,build,publicationFixture.trustedPolicy as TrustedPolicy,now)).toBe(parent);expect(parent.inputs).toHaveLength(2);expect(parent.binding.replayGrant.executionId).toBe(parent.binding.executionId);expect(parent.binding.replayGrant.attemptId).toBe(parent.binding.attemptId);expect(parent.binding.replayGrant.buildHash).toBe(hashObserved(build));
  });
  it('keeps an extra-input mutation invalid instead of normalizing it out of the payload',()=>{
    const now=Date.now(),parent=mutableCurrentJob(build,now);parent.inputs.push({inputId:'extra',value:'explicit-invalid-input'});expect(()=>validateObservedJob(parent,build,publicationFixture.trustedPolicy as TrustedPolicy,now)).toThrow('REFERENCE_MISMATCH');expect(parent.inputs).toHaveLength(3);expect(currentJob(build,{now}).inputs).toHaveLength(2);
  });
});
