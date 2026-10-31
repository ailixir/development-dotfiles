import {describe,expect,it} from 'vitest';
import mutations from '../fixtures/observed-reference/operation-mutations.json' with {type:'json'};
import {publicationFixture} from './helpers/publicationFixture.js';
import {currentReference} from './helpers/currentWorlds.js';
import {deriveObservedArtifact,validateObservedRequest} from '../src/validator/observedReplay.js';
import {hashObserved,OBSERVED_PROFILE,OBSERVED_SCHEMA_BUNDLE_HASH} from '../src/validator/observedReferencePolicy.js';
function reference(usedConfiguration=false){return currentReference(usedConfiguration?'configuration':'control');}
function required<T>(value:T|null|undefined):T {if(value===undefined||value===null)throw new Error('MISSING_DECLARED_CONTROL_FACT');return value;}
describe('sealed current world preserves every step-contract mutation',()=>{
  it('requires both complete positive worlds and keeps the captured step that reads the reference',()=>{
    for(const configured of [false,true]){const value=reference(configured);expect(deriveObservedArtifact(value.basis)).toEqual({artifact:value.artifact,hashes:value.hashes});const read=required(value.artifact.learnedPlan.actions.find(a=>a.operation.captures.includes('binding-reference')));expect(read.operation.kind).toBe('step');expect(read.operation.sourceHash).toBe(hashObserved(read.operation.code));expect(value.artifact.steps.flatMap(s=>s.operations)).toHaveLength(5);}
  });
  it.each(mutations.mutations)('rejects declared mutation %s only after its current positive parent accepts',name=>{
    const value=reference(name==='configuration-reference');expect(deriveObservedArtifact(value.basis)).toEqual({artifact:value.artifact,hashes:value.hashes});
    const basis=structuredClone(value.basis),artifact=structuredClone(value.artifact);
    const rehash=(action:(typeof artifact.learnedPlan.actions)[number])=>{action.operationHash=hashObserved({coordinate:action.coordinate,origin:action.origin,operation:action.operation});};
    const read=required(artifact.learnedPlan.actions.find(a=>a.operation.captures.includes('binding-reference')));
    const stepOf=(action:typeof read)=>required(artifact.steps.flatMap(s=>s.operations).find(o=>o.coordinate.stepId===action.coordinate.stepId&&o.coordinate.ordinal===action.coordinate.ordinal));
    if(name==='guard-origin'){required(artifact.guards[1]).origin='https://other.example.test';}
    if(name==='step-code'){read.operation.code+=' ';stepOf(read).operation.code+=' ';rehash(read);}
    if(name==='step-captures'){read.operation.captures=[];stepOf(read).operation.captures=[];rehash(read);}
    if(name==='step-uses'){read.operation.uses=[{kind:'input',id:'input-destination'}];stepOf(read).operation.uses=[{kind:'input',id:'input-destination'}];rehash(read);}
    if(name==='transfer-binding')for(const transfer of artifact.replayPolicy.transfers)transfer.bindingId='wrong-binding';
    if(name==='binding-producer')for(const binding of [...artifact.learnedPlan.bindings,...artifact.replayPolicy.bindings])binding.producer.ordinal=7;
    if(name==='binding-consumer')for(const binding of [...artifact.learnedPlan.bindings,...artifact.replayPolicy.bindings])required(binding.consumers[0]).coordinate.ordinal=7;
    if(name==='source-provenance')required(basis.inputs[0]).provenance.endUtf16=999;
    if(name==='configuration-reference')required(basis.configurationReferences[0]).inputId='wrong-configuration-input';
    if(name==='original-evidence')required(basis.preparations[1]).proof.evidenceHash='f'.repeat(64);
    if(name==='allocated-binding')required(basis.allocations[0]).bindingId='wrong-binding';
    // Candidate-local commitments follow the deliberate IR changes; the original basis stays authoritative.
    artifact.learnedPlanHash=hashObserved(artifact.learnedPlan);artifact.replayPolicy.learnedPlanHash=artifact.learnedPlanHash;
    const build={...publicationFixture.build,schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH};
    const request={...publicationFixture.validationRequest,validationBasis:basis,basisHash:hashObserved(basis),artifact,requiredBuild:build,requiredProfile:name==='profile'?{contract:2}:OBSERVED_PROFILE};
    let rejected=false;try{rejected=!validateObservedRequest(request,build).ok;}catch{rejected=true;}expect(rejected).toBe(true);
  });
});
