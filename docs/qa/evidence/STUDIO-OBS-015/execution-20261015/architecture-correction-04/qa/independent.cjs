// Independent in-memory schema addendum and focused proof checks only, no app imports.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Ajv=require('ajv');
const base=path.dirname(__dirname),root=path.resolve(base,'../../../../../..'),contracts=path.join(root,'docs/specs/studio-observed-authoring/contracts/v3');
const read=p=>JSON.parse(fs.readFileSync(p)),clone=x=>JSON.parse(JSON.stringify(x));
const canon=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canon).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';
const hash=v=>crypto.createHash('sha256').update(canon(v)).digest('hex'),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function requireThat(ok,why){if(!ok)throw Error(why);}
const patch=read(path.join(base,'patch-spec.json')),manifest=read(path.join(base,'manifest.json')),mapping=read(path.join(base,'conformance-mapping.json'));
requireThat(sha(path.join(base,'manifest.json'))==='1cc89ac2cb5947c36701147546ec9cb15c8f6ee890490b255626093a34e71697','exact delegated manifest');
const bound=Object.entries(manifest.files).map(([file,expected])=>({file,expected,observed:sha(path.join(base,file)),ok:expected===sha(path.join(base,file))}));
const before=read(path.join(base,'replay-validation.before.schema.json')),after=clone(before);
const parts=patch.jsonPatch[1].path.slice(1).split('/');let node=after;for(const part of parts.slice(0,-1))node=node[part];requireThat(node.minItems===1,'exact test predecessor');node.minItems=0;
function diffs(a,b,p=''){if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return a===b?[]:[p];return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>diffs(a[k],b[k],p+'/'+k));}
requireThat(canon(diffs(before,after))===canon([patch.jsonPatch[1].path]),'one authorized scalar only');
function engine(target){const ajv=new Ajv({strict:true,allErrors:true});require('ajv-formats')(ajv);for(const file of fs.readdirSync(contracts).filter(f=>f.endsWith('.schema.json')&&f!=='replay-validation.schema.json')){const s=read(path.join(contracts,file));if(s.$id)ajv.addSchema(s);}ajv.addSchema(target);return ajv;}
const oldAjv=engine(before),newAjv=engine(after),oldValidate=oldAjv.getSchema(before.$id+'#/definitions/ValidationBasis'),newValidate=newAjv.getSchema(after.$id+'#/definitions/ValidationBasis');
const copies=[];
function visit(v,p,file){if(!v||typeof v!=='object')return;if(v.properties?.consumers?.type==='array')copies.push({file,pointer:p+'/properties/consumers/minItems',minimum:v.properties.consumers.minItems});for(const [k,child]of Object.entries(v))visit(child,p+'/'+k,file);}
for(const file of fs.readdirSync(contracts).filter(f=>f.endsWith('.schema.json')))visit(read(path.join(contracts,file)),'',file);
requireThat(copies.length===6,'all six consumer definitions audited');
requireThat(sha(path.join(contracts,'guided-model-response.schema.json'))===patch.rawModelBeforeSHA256,'raw model complete source unchanged');
const checks=[];const witnesses=mapping.fullWitnesses.map(w=>{const file=path.join(root,w.path);requireThat(sha(file)===w.sha256,'immutable failed witness');return read(file);});
function prep(b,fact){return b.preparations.find(p=>p.preparationId===fact.preparationId);}
function arg(operation){return operation.kind==='assert'?operation.expected:operation.value;}
function focused(b){
  const inc=b.incrementalEvidence,proof=b.snapshotEvidence?.baseProof,pin=b.snapshotEvidence?.pinnedBase;
  requireThat(inc&&proof&&pin&&inc.plan.initialFirstLearnIndex>0,'real nonempty original prefix proof required');
  requireThat(pin.revisionId===inc.plan.baseRevisionId&&pin.revisionId===inc.program.baseRevisionId&&pin.revisionId===proof.revision.id&&pin.revisionDigest===proof.revision.revisionDigest&&pin.revisionDigest===hash(proof.revision.identity)&&pin.revisionDigest===inc.program.baseRevisionDigest,'original base exact ID and digest');
  requireThat(hash(inc.program)===inc.plan.prefixProgramHash,'exact prefix program');
  requireThat(canon(inc.firstSuffixAcceptance.retainedPrefixAdmissionIds)===canon(inc.switch.retainedPrefixAdmissionIds)&&inc.firstSuffixAcceptance.sessionId===b.sessionId,'first suffix retained authority');
  requireThat(hash(b.allocations)===b.bootstrap.allocationHash,'raw allocation hash preserved');
  const effective=new Map(b.actions.map(a=>[a.ledger.admission.admissionId,a]));
  requireThat(effective.size===b.actions.length&&b.actions.every(a=>a.ledger.state==='SUCCEEDED'&&a.ledger.dispatchCount===1),'all actual successful actions');
  const spent=inc.excludedAttempts??[];
  requireThat(spent.length<=1,'sole excluded attempt');
  if(inc.driftReceipt?.phase==='PRE_ADMISSION')requireThat(!spent.length,'no pre-admission invented spent action');
  if(spent.length){const e=spent[0],l=e.action.ledger,r=inc.driftReceipt;
    requireThat(r?.phase==='ADMITTED_PRE_INVOCATION'&&r.nativeInvocationStarted===false&&r.attemptOrdinal===0&&r.admissionId===l.admission.admissionId&&l.state==='FAILED'&&l.outcomeCode==='TARGET_CHANGED'&&l.dispatchCount===1&&l.attemptOrdinal===0,'sole exact positive no-native failure');
    requireThat(r.receiptHash===hash(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='receiptHash')))&&r.receiptHash===inc.switch.driftReceiptHash&&canon(r.coordinate)===canon(l.coordinate)&&r.operationHash===l.operationHash,'excluded receipt exact integrity');
    requireThat(e.preparation.preparationId===r.preparationId&&e.obligationAssociation.admissionId===r.admissionId&&canon(e.obligationAssociation.coordinate)===canon(l.coordinate),'original excluded preparation association');
  }
  const edges=[];
  for(const edge of b.consumerEdges){const actual=effective.get(edge.consumerAdmissionId),excluded=spent.find(e=>e.action.ledger.admission.admissionId===edge.consumerAdmissionId);requireThat(actual||excluded,'unknown/pending/raw edge cannot vanish');const p=actual?prep(b,actual):excluded.preparation,operation=p.proposal.operation,reference=arg(operation),producer=b.producers.find(p=>p.bindingId===edge.bindingId);
    requireThat(reference?.kind==='binding'&&reference.bindingId===edge.bindingId&&edge.argumentSlot===operation.kind+(operation.kind==='assert'?'.expected':'.value')&&producer&&producer.producerAdmissionId===edge.producerAdmissionId&&edge.destinationOrigin===producer.origin&&canon(edge.coordinate)===canon((actual??excluded.action).ledger.coordinate),'raw edge complete operation join');
    if(actual)edges.push(edge);
  }
  for(const need of b.translationPlan.needs.filter(n=>n.consumers.length===0)){
    const producer=b.producers.find(p=>p.bindingId===need.bindingId),allocation=b.allocations.find(a=>a.bindingId===need.bindingId);requireThat(producer&&allocation&&allocation.needId===need.needId&&allocation.producerStepId===need.producerStepId,'actual producer and stable need identity');
    const fact=effective.get(producer.producerAdmissionId),p=fact&&prep(b,fact);requireThat(fact&&p&&inc.switch.retainedPrefixAdmissionIds.includes(producer.producerAdmissionId),'current successful retained prefix admission');
    requireThat(p.proposal.operation.kind==='read'&&p.proposal.operation.bindingId===need.bindingId&&canon(p.proposal.operation.recipe)===canon(producer.recipe)&&canon(fact.ledger.coordinate)===canon(producer.coordinate),'exact read not model-orphan flag');
    const old=proof.artifact.learnedPlan.bindings.find(v=>v.bindingId===need.bindingId);requireThat(old&&canon(old.producer)===canon(producer.coordinate)&&canon(old.recipe)===canon(producer.recipe)&&old.sourceOrigin===producer.origin,'proved original base binding');
    requireThat(inc.program.actions.some(a=>a.operation.kind==='read'&&a.operation.bindingId===need.bindingId&&canon(a.coordinate)===canon(producer.coordinate)),'actual prefix imported read');
    const version=b.materializationEvidence.versions.find(v=>v.contextRevision===fact.ledger.contextRevision);requireThat(version&&fact.ledger.authoredInputsHash===version.authoredInputsHash&&p.proof.authoredInputsHash===version.authoredInputsHash&&producer.availability.contextId===p.proof.contextId&&producer.availability.workerId===p.proof.workerId&&producer.availability.ownerFence===p.proof.ownerFence,'exact historical producer availability');
    requireThat(!edges.some(e=>e.bindingId===need.bindingId)&&!b.actions.some(a=>{const reference=arg(prep(b,a).proposal.operation);return reference?.kind==='binding'&&reference.bindingId===need.bindingId;}),'no actual successful binding use lost');
  }
}
for(const witness of witnesses){const old=oldValidate(witness.basis),priorErrors=clone(oldValidate.errors),patched=newValidate(witness.basis);focused(witness.basis);checks.push({name:witness.name,before:old,after:patched,oldErrors:priorErrors,focusedProof:true,ok:!old&&patched});}
const raw=read(path.join(contracts,'guided-model-response.schema.json')).oneOf[0].properties.needs.items,validateRaw=newAjv.compile(raw),need=witnesses[0].basis.translationPlan.needs[0],rawNeed={needId:need.needId,producerStepId:need.producerStepId,consumers:[]};
checks.push({name:'raw-model-new-empty-need-still-refused',ok:!validateRaw(rawNeed)});rawNeed.consumers=[{stepId:need.producerStepId,argumentSlot:'fill.value'}];checks.push({name:'raw-model-nonempty-need-unchanged',ok:validateRaw(rawNeed)});
const mutations=[['no-incremental-authority',b=>b.incrementalEvidence=null],['unread-orphan',b=>b.producers=[]],['failed-producer',b=>b.actions.find(a=>a.ledger.admission.admissionId===b.producers[0].producerAdmissionId).ledger.state='FAILED'],['unretained-producer',b=>{b.incrementalEvidence.switch.retainedPrefixAdmissionIds=[];b.incrementalEvidence.firstSuffixAcceptance.retainedPrefixAdmissionIds=[];}],['foreign-base-pin',b=>b.snapshotEvidence.pinnedBase.revisionId='00000000-0000-4000-8000-000000000999'],['missing-base-binding',b=>b.snapshotEvidence.baseProof.artifact.learnedPlan.bindings=[]],['missing-prefix-read',b=>{b.incrementalEvidence.program.actions=b.incrementalEvidence.program.actions.filter(a=>a.operation.kind!=='read');b.incrementalEvidence.plan.prefixProgramHash=hash(b.incrementalEvidence.program);}],[ 'wrong-historical-context',b=>b.producers[0].availability.contextId='other-context'],['unknown-raw-edge',b=>b.consumerEdges[0].consumerAdmissionId='unknown-pending'],['lost-successful-use',b=>{const a=b.actions.find(a=>a.ledger.admission.admissionId==='replacement-literal');prep(b,a).proposal.operation.value={kind:'binding',bindingId:need.bindingId};}],['native-started-cannot-exclude-edge',b=>{b.incrementalEvidence.driftReceipt.nativeInvocationStarted=true;b.incrementalEvidence.driftReceipt.receiptHash=hash(Object.fromEntries(Object.entries(b.incrementalEvidence.driftReceipt).filter(([k])=>k!=='receiptHash')));b.incrementalEvidence.switch.driftReceiptHash=b.incrementalEvidence.driftReceipt.receiptHash;}]];
for(const [name,mutate]of mutations){const b=clone(witnesses[0].basis);mutate(b);try{focused(b);checks.push({name,ok:false});}catch(error){checks.push({name,ok:true,rejectedBy:error.message});}}
const fake=clone(witnesses[0].basis);fake.translationPlan.needs[0].trusted=true;checks.push({name:'claimed-trusted-flag-refused-by-closed-shape',ok:!newValidate(fake)});
const historical=[];for(const [file,info]of Object.entries(manifest.preservedManifests)){const p=path.join(root,file),m=read(p);requireThat(sha(p)===info.sha256,'prior exact manifest');for(const [f,v]of Object.entries(m.files)){const target=f.startsWith('docs/')?path.join(root,f):path.join(path.dirname(p),f);historical.push({file:f,ok:sha(target)===v});}}
const receipt=read(path.join(base,'completion-receipt.json')),sources=Object.entries(receipt.sourceSnapshots).map(([file,captured])=>({file,captured,observed:sha(path.join(root,file)),unchanged:captured===sha(path.join(root,file))}));
const result={classification:'INDEPENDENT_IN_MEMORY_SCHEMA_AND_FOCUSED_PROOF_ONLY',createdAt:new Date().toISOString(),manifestSha256:sha(path.join(base,'manifest.json')),boundFiles:bound,oneChangedPointer:diffs(before,after),consumerDefinitions:copies,witnessHashes:mapping.fullWitnesses,checks,preservedHistoricalFiles:historical,diagnosticSources:sources,errors:[...checks.filter(c=>!c.ok),...bound.filter(c=>!c.ok),...historical.filter(c=>!c.ok)],applicationTestsExecuted:0,databaseCommandsExecuted:0,browserCommandsExecuted:0,buildCommandsExecuted:0,generatorCommandsExecuted:0};result.status=result.errors.length?'FAIL':'PASS';fs.writeFileSync(path.join(__dirname,'independent-audit.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,cases:checks.length,boundFiles:bound.length,preservedFiles:historical.length,copies:copies.length,sourceDrift:sources.filter(s=>!s.unchanged).map(s=>s.file),errors:result.errors},null,2));process.exitCode=result.errors.length?1:0;
