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
function originalChoice(b,prep,ob){
 const w=prep.observedChoice,scopeHash=c.hash(b.scope),coord={stepId:ob.stepId,ordinal:ob.occurrence};
 if(!w){if(prep.proposal.target.kind==='node'){const seen=b.observations.find(o=>o.observationHash===prep.observationHash)?.observation,fact=seen?.facts[prep.proposal.target.ref],name=words(fact?.name);demand(fact&&[...words(ob.targetIntent)].every(x=>name.has(x)),'CHOICE_MISSING_ORIGINAL');}return;}
 const context=w.context,q=context.question,capture=context.questionCapture,r=w.receipt,a=w.attempt,qp=w.questionPlan,answer=r.answer;
 for(const[k,v]of Object.entries({sessionId:b.sessionId,scopeHash,sourceRevision:b.sourceRevision,configurationRevision:b.configurationRevision}))demand(context[k]===v,'CHOICE_CONTEXT');
 same(q.coordinate,coord,'CHOICE_COORDINATE');same(answer.coordinate,coord,'CHOICE_COORDINATE');
 demand(r.sessionId===b.sessionId&&r.preparationId===prep.preparationId&&r.obligationId===ob.obligationId&&r.clarificationId===context.clarificationId&&r.acceptedChoiceId===w.acceptedChoiceId,'CHOICE_RECEIPT');
 same(r.contextIdentityHash,c.hash(context),'CHOICE_HASH');same(r.meaningsHash,c.hash(w.meanings),'CHOICE_HASH');same(r.questionCaptureHash,c.hash(capture),'CHOICE_HASH');
 demand(q.sessionId===b.sessionId&&q.scopeHash===scopeHash&&q.clarificationId===context.clarificationId&&answer.sessionId===b.sessionId&&answer.scopeHash===scopeHash&&answer.sourceRevision===b.sourceRevision&&answer.configurationRevision===b.configurationRevision&&answer.clarificationId===q.clarificationId&&answer.choiceId===w.acceptedChoiceId&&answer.documentId===q.documentId&&answer.generation===q.generation,'CHOICE_ANSWER');
 const nanos=value=>{const m=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);demand(m,'CHOICE_INSTANT');const ms=Date.parse(m[1]+'Z');demand(Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,19)===m[1],'CHOICE_INSTANT');return BigInt(ms)*1000000n+BigInt((m[2]??'').padEnd(9,'0'));};
 demand(nanos(answer.resolvedAt)<=nanos(q.expiresAt),'CHOICE_EXPIRED');
 demand(capture.obligationId===ob.obligationId&&capture.attemptId===a.attemptId&&capture.requestId===a.requestId&&capture.attempt===a.attempt&&a.responseRequestId===a.requestId&&a.status==='APPLIED'&&a.kind==='NEXT_ACTION','CHOICE_ATTEMPT');
 const header=b.materializationEvidence.versions[capture.contextRevision-1];demand(header&&capture.authoredInputsHash===header.authoredInputsHash&&capture.authoredInputsHash===prep.proof.authoredInputsHash&&capture.contextRevision===prep.proof.contextRevision&&capture.contextId===prep.proof.contextId&&capture.contextId===b.bootstrap.contextId,'CHOICE_HISTORICAL_VERSION');
 demand(capture.workerId===a.owner.workerId&&capture.workerId===prep.proof.workerId&&capture.ownerFence===a.owner.fence&&capture.ownerFence===prep.proof.ownerFence&&capture.ownerFence===b.bootstrap.ownerFence,'CHOICE_OWNER');
 same(a.scope,b.scope,'CHOICE_SCOPE');demand(a.scopeHash===scopeHash,'CHOICE_SCOPE');same(a.executionEvidence,capture.executionEvidence,'CHOICE_EVIDENCE');
 const e=capture.executionEvidence;demand(e.kind==='observedDocument'&&e.sessionId===b.sessionId&&e.contextId===capture.contextId&&e.documentId===q.documentId&&e.generation===q.generation&&a.documentId===q.documentId&&a.generation===q.generation&&prep.executionEvidence.generation>e.generation,'CHOICE_GENERATION');
 demand(capture.evidenceHash===c.hash(e)&&capture.observationHash===e.observationHash,'CHOICE_EVIDENCE');
 const old=b.observations.find(o=>o.observationHash===capture.observationHash)?.observation;demand(old&&old.documentId===q.documentId&&old.generation===q.generation&&old.origin===e.origin&&!old.projection.projected&&old.coverage.unsupportedRegions===0,'CHOICE_ORIGINAL_OBSERVATION');
 demand(capture.planRevision===a.planRevision&&capture.planRevision===qp.revision&&BigInt(qp.revision)<=BigInt(b.translationRevision)&&capture.planHash===qp.planHash&&qp.planHash===c.hash(qp.plan),'CHOICE_PLAN');same(qp.plan.obligations.find(o=>o.obligationId===ob.obligationId),ob,'CHOICE_ORIGINAL_MEANING');
 demand(capture.modelQuestionHash===c.hash(a.modelQuestion)&&a.modelQuestion.reason===q.reason,'CHOICE_MODEL_QUESTION');
 const unique=(list,key)=>new Set(list.map(key)).size===list.length;
 demand(w.meanings.length>=2&&w.meanings.length<=10&&w.meanings.length===q.choices.length&&w.meanings.length===a.modelQuestion.choices.length&&unique(w.meanings,x=>x.choiceId)&&unique(q.choices,x=>x.choiceId)&&unique(a.modelQuestion.choices,x=>x.choiceId)&&unique(w.meanings,x=>c.hash(x.meaning)),'CHOICE_BIJECTION');
 for(let i=0;i<w.meanings.length;i++){const m=w.meanings[i],qChoice=q.choices[i];demand(qChoice.choiceId===m.choiceId&&m.meaning.obligationId===ob.obligationId&&qChoice.bindingId===m.meaning.bindingId,'CHOICE_ORDER');same(m.meaning,a.modelQuestion.choices[i].meaning,'CHOICE_MODEL_MEANING');const fact=old.facts[m.meaning.ref];demand(fact&&fact.role===m.selection.role&&fact.name===m.selection.name&&fact.evidence===m.selection.evidence,'CHOICE_ORIGINAL_NODE');}
 const selected=w.meanings.find(m=>m.choiceId===w.acceptedChoiceId);demand(selected,'CHOICE_SELECTION');const sel=selected.selection;
 demand(matches(old,sel).length===1,'CHOICE_OLD_AMBIGUITY');demand(answer.bindingId===selected.meaning.bindingId,'CHOICE_SELECTED_ANSWER');
 const fresh=b.observations.find(o=>o.observationHash===prep.observationHash)?.observation,hit=fresh?matches(fresh,sel):[];demand(hit.length===1&&hit[0]===prep.proposal.target.ref,'CHOICE_FRESH_AMBIGUITY');same(prep.proof.target.identity,{role:sel.role,name:sel.name},'CHOICE_FRESH_LOCATOR');
}
function validate(s,issued=authority(s),control=false){
 const b=s.basis,a=s.artifact;
 for(const[schema,v]of [['replay-validation.schema.json#/definitions/ValidationBasis',b],['replay-artifact.schema.json',a]]){const fn=ajv.getSchema('https://checks.citi.example/contracts/observed/v3/'+schema);demand(fn(v),'CURRENT_SCHEMA');}
 const header=b.materializationEvidence.versions[0];demand(header.contextRevision===1&&header.inputCount===3&&header.previousInputsHash===null&&b.materializationEvidence.entries.length===3,'CURRENT_RAW_HISTORY');
 demand(c.hash(issued.privateInputs)===header.authoredInputsHash&&b.bootstrap.inputsHash===header.authoredInputsHash,'CURRENT_VERSION');
 const effective=new Set(b.translationPlan.obligations.flatMap(o=>o.referenceIndex===null?[]:[o.referenceIndex]));
 demand(b.inputs.length===effective.size,'CURRENT_EFFECTIVE_INPUTS');
 for(const i of b.inputs){demand([...effective].some(j=>c.hash(i.provenance)===c.hash(b.translationPlan.sourceReferences[j])),'CURRENT_REFERENCE');if(i.provenance.referenceKind==='configuration'){const ref=b.configurationReferences.find(r=>r.referenceId===i.provenance.referenceId);demand(ref&&ref.inputId===i.inputId,'CURRENT_CONFIGURATION');}}
 for(const fact of b.actions){const prep=b.preparations.find(x=>x.preparationId===fact.preparationId),ob=b.translationPlan.obligations.find(x=>x.obligationId===fact.obligationId);demand(prep&&ob,'CURRENT_ACTION_JOIN');demand(prep.proposal.operation.kind===ob.operationKind,'CURRENT_OPERATION');originalChoice(b,prep,ob);if(ob.referenceIndex!==null){const i=b.inputs.find(i=>c.hash(i.provenance)===c.hash(b.translationPlan.sourceReferences[ob.referenceIndex]));const op=prep.proposal.operation;demand(i&&(op.destinationInputId??op.value?.sourceInputId??op.expected?.sourceInputId)===i.inputId,'CURRENT_REFERENCE');}}
 if(control){const r=b.preparations[1],recipe=r.proposal.operation.recipe;demand(recipe.kind==='controlValue'&&recipe.controlType==='textarea'&&recipe.classification==='nonsecretApproved'&&recipe.policyRuleId==='business-reference','CURRENT_CONTROL_RECIPE');const row=b.observations.find(o=>o.observationHash===r.observationHash),node=row?.observation.facts[r.proposal.target.ref];demand(node&&node.editable&&node.role==='textbox'&&row.observation.readRuleId===recipe.policyRuleId,'CURRENT_CONTROL_PRIVACY');demand(row.observation.origin==='https://orders.example.test','CURRENT_CONTROL_ORIGIN');demand(!Object.hasOwn(node,'value'),'CURRENT_CONTROL_VALUE');demand(matches(row.observation,node).length===1,'CURRENT_CONTROL_AMBIGUITY');}
 c.validateExtendedBasis(b,issued);c.validateSnapshotGraph(b,s.snapshotAuthority,a);
 same(a,f.deriveExpected(b),'CURRENT_PROJECTION');same(s.hashes,f.hashMap(b,a),'CURRENT_HASH_MAP');
 return true;
}
function run(){
 const results=[];for(const[name,s,control]of [['control',p.controlValueReference,true],['control-used-configuration',p.controlValueReferenceUsedConfiguration,true],['choice',p.observedChoice,false]]){validate(s,authority(s),control);results.push({name,status:'VALID',basisHash:c.hash(s.basis),artifactHash:c.hash(s.artifact)});}
 const base=p.controlValueReference,config=p.controlValueReferenceUsedConfiguration,issued=authority(base),mutations=[];
 function reject(name,mutate,{configuration=false,reseal=false,expected}={}){const parent=configuration?config:base,s=clone(parent);mutate(s);if(reseal){f.sealFacts(s.basis);s.artifact=f.deriveExpected(s.basis);s.hashes=f.hashMap(s.basis,s.artifact);}let code;try{validate(s,authority(parent),true);}catch(e){code=e.code;}demand(code&&code!=='ERR_ASSERTION',name+' must refuse at semantic boundary');if(expected)demand(code===expected,name+': '+code+' !== '+expected);mutations.push({name,parent:configuration?'control-used-configuration':'control',baselineValidated:true,code});}
 reject('basis/extra-unused-input',s=>{const entry=s.basis.materializationEvidence.entries.find(e=>!s.basis.inputs.some(i=>i.inputId===e.inputId));demand(entry,'UNUSED_DECLARATION_FIXTURE_REQUIRED');const m=entry.metadata;s.basis.inputs.push({inputId:m.inputId,kind:m.kind,intendedSlot:m.intendedSlot,provenance:clone(m.provenance),stepId:m.sourceStepId});},{expected:'CURRENT_EFFECTIVE_INPUTS'});
 const operation={
 'guard-role':s=>s.artifact.guards[1].target.identity.role='button',
 // A guard no longer carries a control type; the mutation of that name now changes the guard's remaining addressing attribute, its tier.
 'guard-control-type':s=>s.artifact.guards[1].target.tier=s.artifact.guards[1].target.tier==='role'?'testId':'role',
 'guard-locator':s=>s.artifact.guards[1].target.locator[0].value='foreign',
 'read-recipe':s=>s.artifact.steps[1].operations[0].operation.recipe.kind='visibleText',
 'argument-slot':s=>s.artifact.replayPolicy.transfers[0].slot='assert.expected',
 'binding-producer':s=>s.artifact.replayPolicy.bindings[0].producer.ordinal=1,
 'binding-consumer':s=>s.artifact.replayPolicy.bindings[0].consumers[0].coordinate.ordinal=1,
 'source-provenance':s=>s.artifact.inputRecipes[1].provenance.sourceHash='f'.repeat(64),
 'configuration-reference':s=>s.basis.configurationReferences[0].inputId='wrong',
 'original-evidence':s=>s.basis.preparations[1].proof.ownerFence++,
 'allocated-binding':s=>s.basis.allocations[0].bindingId='wrong',
 'profile':s=>s.artifact.profile.contract=2};
 for(const[name,mutate]of Object.entries(operation))reject(name,mutate,{configuration:name==='configuration-reference'});
 const basis={scope:s=>s.basis.scope.principalId='different',allocation:s=>s.basis.allocations[0].bindingId='substitute',producer:s=>s.basis.producers[0].producerAdmissionId='other',consumer:s=>s.basis.consumerEdges[0].coordinate.ordinal=1,obligation:s=>s.basis.translationPlan.obligations[1].needId='wrong','source-reference':s=>s.basis.translationPlan.sourceReferences[0].stepId=s.basis.sourceSteps[1].stepId,'prepared-target':s=>s.basis.preparations[1].proposal.target.ref='e99999','observation-node':s=>s.basis.observations[0].observation.facts.e1.editable=false,'observation-hash':s=>s.basis.observations[0].observationHash='a'.repeat(64),'proof-fence':s=>s.basis.preparations[0].proof.ownerFence++,'ledger-count':s=>s.basis.actions[0].ledger.dispatchCount=2,'ledger-state':s=>s.basis.actions[0].ledger.state='ADMITTED','operation-hash':s=>s.basis.actions[0].ledger.operationHash='b'.repeat(64),'extra-observation':s=>s.basis.observations.push(clone(s.basis.observations[0])),'missing-preparation':s=>s.basis.preparations.pop(),'translation-id':s=>s.basis.translationPlan.needs[0].bindingId='forged','bootstrap-origin':s=>s.basis.bootstrap.initialEvidence.origin='https://orders.example.test','input-span':s=>s.basis.inputs[1].provenance.endUtf16=999,'config-map':s=>s.basis.configurationReferences[0].inputId='wrong'};
 for(const[name,mutate]of Object.entries(basis))reject('basis/'+name,mutate,{configuration:name==='config-map'});
 for(const[name,field,value]of [['wrong-role','role','button'],['not-editable','editable',false]])reject('control-privacy/'+name,s=>{s.basis.observations[0].observation.facts.e1[field]=value;},{expected:'CURRENT_CONTROL_PRIVACY'});
 reject('control-privacy/wrong-rule',s=>{s.basis.observations[0].observation.readRuleId='unapproved';},{expected:'CURRENT_CONTROL_PRIVACY'});
 reject('control-privacy/wrong-origin',s=>s.basis.observations[0].observation.origin='https://foreign.example.test',{expected:'CURRENT_CONTROL_ORIGIN'});
 reject('control-privacy/value-leak',s=>s.basis.observations[0].observation.facts.e1.value='VALUE-CANARY',{expected:'CURRENT_SCHEMA'});
 reject('control-privacy/ambiguity',s=>{const o=s.basis.observations[0].observation;o.facts.e901=clone(o.facts.e1);},{expected:'CURRENT_CONTROL_AMBIGUITY'});
 assert.equal(p.job.inputs.length,2);assert.deepEqual(p.job.inputs.map(i=>i.inputId),p.artifact.inputRecipes.map(i=>i.inputId));assert.deepEqual(p.examples.ObservedJob.value.inputs,p.job.inputs);assert.equal(p.basis.materializationEvidence.entries.length,3);
 return{status:'PASS_SELECTED_CURRENT_SYNTHETIC_WORLDS',classification:'CURRENT_SYNTHETIC_NO_BROWSER_OR_DB_HISTORY',validParents:results,negativeMutations:mutations,operationMutations:12,basisMutations:20,privacyMutations:mutations.length-32,actualRuntimeOrNativeProof:false};
}
if(require.main===module)console.log(JSON.stringify(run(),null,2));module.exports={run,validate,authority,originalChoice};
