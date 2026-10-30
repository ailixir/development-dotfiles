import {describe,expect,it} from 'vitest';
import mutations from '../fixtures/observed-reference/operation-mutations.json' with {type:'json'};
import {publicationFixture} from './helpers/publicationFixture.js';
import {currentReference} from './helpers/currentWorlds.js';
import {deriveObservedArtifact,validateObservedRequest} from '../src/validator/observedReplay.js';
import {operationPreimage} from '../src/validator/operationPreimage.js';
import {hashObserved,OBSERVED_PROFILE,OBSERVED_SCHEMA_BUNDLE_HASH} from '../src/validator/observedReferencePolicy.js';
function reference(usedConfiguration=false){return currentReference(usedConfiguration?'configuration':'control');}
function required<T>(value:T|null|undefined):T {if(value===undefined||value===null)throw new Error('MISSING_DECLARED_CONTROL_FACT');return value;}
describe('declared current textarea world preserves every original mutation',()=>{
  it('requires both complete declared positive worlds and keeps controlValue textarea semantics',()=>{
    for(const configured of [false,true]){const value=reference(configured);expect(deriveObservedArtifact(value.basis)).toEqual({artifact:value.artifact,hashes:value.hashes});const read=required(value.artifact.learnedPlan.actions.find(a=>a.operation.kind==='read'));if(!('recipe'in read.operation))throw new Error('CONTROL_READ_RECIPE');expect(read.operation.recipe).toMatchObject({kind:'controlValue',controlType:'textarea',classification:'nonsecretApproved',policyRuleId:'business-reference'});expect(value.artifact.steps.flatMap(s=>s.operations)).toHaveLength(5);}
  });
  it.each(mutations.mutations)('rejects declared mutation %s only after its current positive parent accepts',name=>{
    const value=reference(name==='configuration-reference');expect(deriveObservedArtifact(value.basis)).toEqual({artifact:value.artifact,hashes:value.hashes});
    const basis=structuredClone(value.basis),artifact=structuredClone(value.artifact);
    if(name==='guard-role'||name==='guard-control-type'||name==='guard-locator'){const guard=required(artifact.guards[1]);if(guard.target.kind!=='element')throw new Error('CONTROL_TARGET');if(name==='guard-role')required(guard.target.identity).role='button';if(name==='guard-control-type')guard.target.tier='role';if(name==='guard-locator'){const step=required(required(guard.target.locator)[0]);if(step.by==='role')step.name='different-control';else if('value'in step)step.value='different-control';}}
    if(name==='read-recipe'){for(const action of artifact.learnedPlan.actions)if(action.operation.kind==='read'&&'recipe'in action.operation)required(action.operation.recipe).policyRuleId='different-rule';for(const action of artifact.steps.flatMap(s=>s.operations))if(action.operation.kind==='read'&&'recipe'in action.operation)required(action.operation.recipe).policyRuleId='different-rule';}
    if(name==='argument-slot'){required(artifact.inputRecipes[1]).intendedSlot='assert.expected';required(artifact.replayPolicy.inputs[1]).intendedSlot='assert.expected';}
    if(name==='binding-producer')for(const binding of [...artifact.learnedPlan.bindings,...artifact.replayPolicy.bindings])binding.producer.ordinal=7;
    if(name==='binding-consumer')for(const binding of [...artifact.learnedPlan.bindings,...artifact.replayPolicy.bindings])required(binding.consumers[0]).coordinate.ordinal=7;
    if(name==='source-provenance')required(basis.inputs[0]).provenance.endUtf16=999;
    if(name==='configuration-reference')required(basis.configurationReferences[0]).inputId='wrong-configuration-input';
    if(name==='original-evidence')required(basis.preparations[1]).proof.evidenceHash='f'.repeat(64);
    if(name==='allocated-binding')required(basis.allocations[0]).bindingId='wrong-binding';
    // Candidate-local commitments follow the deliberate IR changes; original basis stays authoritative.
    if(name==='read-recipe')for(const action of artifact.learnedPlan.actions)action.operationHash=hashObserved(operationPreimage(action.coordinate,action.origin as string|null,action.target as Parameters<typeof operationPreimage>[2],action.operation as Parameters<typeof operationPreimage>[3]));
    artifact.learnedPlanHash=hashObserved(artifact.learnedPlan);artifact.replayPolicy.learnedPlanHash=artifact.learnedPlanHash;
    const build={...publicationFixture.build,schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH};
    const request={...publicationFixture.validationRequest,validationBasis:basis,basisHash:hashObserved(basis),artifact,requiredBuild:build,requiredProfile:name==='profile'?{contract:2}:OBSERVED_PROFILE};
    let rejected=false;try{rejected=!validateObservedRequest(request,build).ok;}catch{rejected=true;}expect(rejected).toBe(true);
  });
});
