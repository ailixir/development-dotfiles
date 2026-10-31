'use strict';
// Pure synthetic full-world preservation gate. No compiled dist or application imports.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Ajv=require('ajv'),formats=require('ajv-formats');
const c=require('./check-studio-observed-contracts.cjs'),f=require('./studio-current-vector-factory.cjs');
const P=path.resolve(__dirname,'../docs/specs/studio-observed-authoring/contracts/v3'),read=n=>JSON.parse(fs.readFileSync(path.join(P,n),'utf8')),p=read('publication-fixtures.json'),clone=x=>structuredClone(x);
const ajv=new Ajv({allErrors:true,strict:true});formats(ajv);for(const name of fs.readdirSync(P).filter(n=>n.endsWith('.schema.json')))ajv.addSchema(read(name));
const demand=(ok,code)=>{if(!ok){const e=new Error(code);e.code=code;throw e;}};
// ADR-SC-007: observations are an outline plus a facts table keyed by ref; a selection is the stored {role, name, evidence} triple.
const words=x=>new Set(String(x??'').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(Boolean));
const matches=(o,sel)=>Object.entries(o.facts).filter(([,x])=>x.role===sel.role&&x.name===sel.name&&x.evidence===sel.evidence).map(([ref])=>ref);
const same=(a,b,code)=>demand(c.canonical(a)===c.canonical(b),code);
function authority(s){return{privateInputs:s.syntheticTestMetadata.privateInputs,ledgers:clone(s.basis.actions.map(a=>a.ledger)),preparations:clone(s.basis.preparations.map(x=>({preparationId:x.preparationId,materializationRevision:x.materializationRevision}))),snapshot:s.snapshotAuthority};}
// SC008-E5: the choice witness and the control-privacy rules are deleted; the synthetic worlds validate on the step shape.
function validate(s,issued=authority(s)){
 const b=s.basis,a=s.artifact;
 for(const[schema,v]of [['replay-validation.schema.json#/definitions/ValidationBasis',b],['replay-artifact.schema.json',a]]){const fn=ajv.getSchema('https://checks.citi.example/contracts/observed/v3/'+schema);demand(fn(v),'CURRENT_SCHEMA');}
 const header=b.materializationEvidence.versions[0];demand(header.contextRevision===1&&header.inputCount===3&&header.previousInputsHash===null&&b.materializationEvidence.entries.length===3,'CURRENT_RAW_HISTORY');
 demand(c.hash(issued.privateInputs)===header.authoredInputsHash&&b.bootstrap.inputsHash===header.authoredInputsHash,'CURRENT_VERSION');
 const effective=new Set(b.translationPlan.obligations.flatMap(o=>o.referenceIndex===null?[]:[o.referenceIndex]));
 demand(b.inputs.length===effective.size,'CURRENT_EFFECTIVE_INPUTS');
 for(const i of b.inputs){demand([...effective].some(j=>c.hash(i.provenance)===c.hash(b.translationPlan.sourceReferences[j])),'CURRENT_REFERENCE');if(i.provenance.referenceKind==='configuration'){const ref=b.configurationReferences.find(r=>r.referenceId===i.provenance.referenceId);demand(ref&&ref.inputId===i.inputId,'CURRENT_CONFIGURATION');}}
 for(const fact of b.actions){const prep=b.preparations.find(x=>x.preparationId===fact.preparationId),ob=b.translationPlan.obligations.find(x=>x.obligationId===fact.obligationId);demand(prep&&ob,'CURRENT_ACTION_JOIN');demand(prep.proposal.operation.kind==='step','CURRENT_OPERATION');if(ob.referenceIndex!==null){const i=b.inputs.find(i=>c.hash(i.provenance)===c.hash(b.translationPlan.sourceReferences[ob.referenceIndex]));demand(i&&prep.proposal.operation.uses.some(u=>u.kind==='input'&&u.id===i.inputId),'CURRENT_REFERENCE');}}
 c.validateExtendedBasis(b,issued);c.validateSnapshotGraph(b,s.snapshotAuthority,a);
 same(a,f.deriveExpected(b),'CURRENT_PROJECTION');same(s.hashes,f.hashMap(b,a),'CURRENT_HASH_MAP');
 return true;
}
function run(){
 const results=[];for(const[name,s]of [['control',p.controlValueReference],['control-used-configuration',p.controlValueReferenceUsedConfiguration]]){validate(s,authority(s));results.push({name,status:'VALID',basisHash:c.hash(s.basis),artifactHash:c.hash(s.artifact)});}
 const base=p.controlValueReference,config=p.controlValueReferenceUsedConfiguration,issued=authority(base),mutations=[];
 function reject(name,mutate,{configuration=false,reseal=false,expected}={}){const parent=configuration?config:base,s=clone(parent);mutate(s);if(reseal){f.sealFacts(s.basis);s.artifact=f.deriveExpected(s.basis);s.hashes=f.hashMap(s.basis,s.artifact);}let code;try{validate(s,authority(parent));}catch(e){code=e.code;}demand(code&&code!=='ERR_ASSERTION',name+' must refuse at semantic boundary');if(expected)demand(code===expected,name+': '+code+' !== '+expected);mutations.push({name,parent:configuration?'control-used-configuration':'control',baselineValidated:true,code});}
 reject('basis/extra-unused-input',s=>{const entry=s.basis.materializationEvidence.entries.find(e=>!s.basis.inputs.some(i=>i.inputId===e.inputId));demand(entry,'UNUSED_DECLARATION_FIXTURE_REQUIRED');const m=entry.metadata;s.basis.inputs.push({inputId:m.inputId,kind:m.kind,provenance:clone(m.provenance),stepId:m.sourceStepId});},{expected:'CURRENT_EFFECTIVE_INPUTS'});
 const operation={
 'guard-origin':s=>s.artifact.guards[1].origin='https://foreign.example.test',
 'step-code':s=>s.artifact.steps[1].operations[0].operation.code+=' ',
 'step-captures':s=>s.artifact.steps[1].operations[0].operation.captures=[],
 'step-uses':s=>s.artifact.steps[0].operations[0].operation.uses=[],
 'transfer-binding':s=>s.artifact.replayPolicy.transfers[0].bindingId='wrong',
 'binding-producer':s=>s.artifact.replayPolicy.bindings[0].producer.ordinal=1,
 'binding-consumer':s=>s.artifact.replayPolicy.bindings[0].consumers[0].coordinate.ordinal=1,
 'source-provenance':s=>s.artifact.inputRecipes[1].provenance.sourceHash='f'.repeat(64),
 'configuration-reference':s=>s.basis.configurationReferences[0].inputId='wrong',
 'original-evidence':s=>s.basis.preparations[1].proof.ownerFence++,
 'allocated-binding':s=>s.basis.allocations[0].bindingId='wrong',
 'profile':s=>s.artifact.profile.contract=2};
 for(const[name,mutate]of Object.entries(operation))reject(name,mutate,{configuration:name==='configuration-reference'});
 const basis={scope:s=>s.basis.scope.principalId='different',allocation:s=>s.basis.allocations[0].bindingId='substitute',producer:s=>s.basis.producers[0].producerAdmissionId='other',consumer:s=>s.basis.consumerEdges[0].coordinate.ordinal=1,obligation:s=>s.basis.translationPlan.obligations[1].needId='wrong','source-reference':s=>s.basis.translationPlan.sourceReferences[0].stepId=s.basis.sourceSteps[1].stepId,'prepared-code':s=>s.basis.preparations[1].proposal.operation.code+=' ','observation-node':s=>s.basis.observations[0].observation.facts.e1.editable=false,'observation-hash':s=>s.basis.observations[0].observationHash='a'.repeat(64),'proof-fence':s=>s.basis.preparations[0].proof.ownerFence++,'ledger-count':s=>s.basis.actions[0].ledger.dispatchCount=2,'ledger-state':s=>s.basis.actions[0].ledger.state='ADMITTED','operation-hash':s=>s.basis.actions[0].ledger.operationHash='b'.repeat(64),'extra-observation':s=>s.basis.observations.push(clone(s.basis.observations[0])),'missing-preparation':s=>s.basis.preparations.pop(),'translation-id':s=>s.basis.translationPlan.needs[0].bindingId='forged','bootstrap-origin':s=>s.basis.bootstrap.initialEvidence.origin='https://orders.example.test','input-span':s=>s.basis.inputs[1].provenance.endUtf16=999,'config-map':s=>s.basis.configurationReferences[0].inputId='wrong'};
 for(const[name,mutate]of Object.entries(basis))reject('basis/'+name,mutate,{configuration:name==='config-map'});
 reject('observation/foreign-origin',s=>s.basis.observations[0].observation.origin='https://foreign.example.test');
 reject('observation/value-leak',s=>s.basis.observations[0].observation.facts.e1.value='VALUE-CANARY',{expected:'CURRENT_SCHEMA'});
 reject('observation/duplicate-fact',s=>{const o=s.basis.observations[0].observation;o.facts.e901=clone(o.facts.e1);});
 assert.equal(p.job.inputs.length,2);assert.deepEqual(p.job.inputs.map(i=>i.inputId),p.artifact.inputRecipes.map(i=>i.inputId));assert.deepEqual(p.examples.ObservedJob.value.inputs,p.job.inputs);assert.equal(p.basis.materializationEvidence.entries.length,3);
 return{status:'PASS_SELECTED_CURRENT_SYNTHETIC_WORLDS',classification:'CURRENT_SYNTHETIC_NO_BROWSER_OR_DB_HISTORY',validParents:results,negativeMutations:mutations,operationMutations:Object.keys(operation).length,basisMutations:Object.keys(basis).length,actualRuntimeOrNativeProof:false};
}
if(require.main===module)console.log(JSON.stringify(run(),null,2));module.exports={run,validate,authority};
