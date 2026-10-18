import type { ValidationBasis, MaterializationVersion, PreparationFact, EffectiveActionFact, OriginalAllocation, OriginalConsumerEdge } from '../executor/observedOperations.js';
import { demand, equalObserved, hashObserved } from './observedReferencePolicy.js';
const same = (a: unknown,b: unknown): void => { demand(equalObserved(a,b),'EVIDENCE_MISMATCH'); };
const unique = (ids: readonly string[]): void => { demand(new Set(ids).size === ids.length,'EVIDENCE_MISMATCH'); };
export function historicalVersion(b: ValidationBasis, revision: number): MaterializationVersion {
  const header=b.materializationEvidence.versions[revision-1]; demand(header?.contextRevision===revision,'EVIDENCE_MISMATCH');return header;
}
export function validateHistoricalAction(b: ValidationBasis,fact: EffectiveActionFact,p: PreparationFact): void {
  const l=fact.ledger, proposal=p.proposal, proof=p.proof, header=historicalVersion(b,l.contextRevision), scopeHash=hashObserved(b.scope);
  same(hashObserved(proposal),l.requestDigest);same(proof.requestDigest,l.requestDigest);same(p.preparationId,l.preparationId);same(proof.preparationId,l.preparationId);
  demand(p.materializationRevision>=header.birthMaterializationRevision,'EVIDENCE_MISMATCH');
  for (const item of [proposal,proof,l]) {same(item.sessionId,b.sessionId);same(item.scopeHash,scopeHash);same(item.contextRevision,header.contextRevision);same(item.authoredInputsHash,header.authoredInputsHash);}
  same(l.ownerFence,header.ownerFence);same(proof.ownerFence,header.ownerFence);same(proof.workerId,header.workerId);same(proof.contextId,header.contextId);same(proof.sourceRevision,b.sourceRevision);same(proof.configurationRevision,b.configurationRevision);
  same(proposal.coordinate,l.coordinate);same(proposal.executionEvidence,p.executionEvidence);same(proposal.executionEvidence,l.executionEvidence);same(proposal.evidenceHash,hashObserved(proposal.executionEvidence));same(proposal.evidenceHash,l.evidenceHash);same(proposal.evidenceHash,proof.evidenceHash);
  const evidence=proposal.executionEvidence;
  same(evidence.sessionId,b.sessionId);same(evidence.contextId,header.contextId);same(l.documentId,evidence.documentId);same(l.generation,evidence.generation);same(proposal.generation,evidence.generation);same(proposal.target.documentId,evidence.documentId);same(proposal.target.generation,evidence.generation);
  if(evidence.kind==='initialBlank')same(evidence,b.bootstrap.initialEvidence);
  else {const snapshot=b.observations.find(o=>o.observationHash===evidence.observationHash);demand(snapshot,'EVIDENCE_MISMATCH');for(const key of ['documentId','generation','origin'] as const)same(snapshot.observation[key],evidence[key]);}
  same(l.operationHash,hashObserved({coordinate:l.coordinate,origin:evidence.origin,locator:'locator'in proposal.target?proposal.target.locator:null,operation:proposal.operation}));
  same(l.admission.policyDecisionHash,hashObserved({scopeHash,preparation:proof,requestDigest:l.requestDigest}));same(l.admission.authorizationId,b.runAuthorization.authorizationId);
  const ids=new Set(b.materializationEvidence.entries.slice(0,header.inputCount).map(e=>e.inputId));
  const op=proposal.operation, ref=op.kind==='navigate'?op.destinationInputId:op.kind==='fill'||op.kind==='selectOption'?('sourceInputId'in op.value?op.value.sourceInputId:null):op.kind==='assert'&&op.expected&&'sourceInputId'in op.expected?op.expected.sourceInputId:null;
  if(ref)demand(ids.has(ref),'REFERENCE_MISMATCH');
}
export function validateMaterializationHistory(b: ValidationBasis): void {
  const {versions,entries}=b.materializationEvidence, scopeHash=hashObserved(b.scope);
  demand(versions.length>0 && versions.length<=201 && entries.length<=200,'EVIDENCE_MISMATCH'); unique(entries.map(e=>e.inputId));
  entries.forEach((entry,index)=>{demand(entry.inputOrdinal===index&&entry.metadata.inputId===entry.inputId&&!('value'in entry.metadata),'EVIDENCE_MISMATCH');});
  let count=-1,previous:string|null=null,birth=0;
  for(const [index,header]of versions.entries()) {
    demand(header.contextRevision===index+1&&header.inputCount>count&&header.inputCount<=entries.length&&header.birthMaterializationRevision>birth,'EVIDENCE_MISMATCH');
    same(header.previousInputsHash,previous);same(header.sessionId,b.sessionId);same(header.scopeHash,scopeHash);same(header.sourceRevision,b.sourceRevision);same(header.configurationRevision,b.configurationRevision);
    const first=versions[0];demand(first,'EVIDENCE_MISMATCH');for(const key of ['contextId','workerId','ownerFence']as const)same(header[key],first[key]);
    for(const entry of entries.slice(Math.max(count,0),header.inputCount))same(entry.introducedContextRevision,header.contextRevision);
    count=header.inputCount;previous=header.authoredInputsHash;birth=header.birthMaterializationRevision;
  }
  same(count,entries.length);same(previous,b.authoredInputsHash);const first=historicalVersion(b,1);same(b.bootstrap.contextRevision,1);same(b.bootstrap.inputsHash,first.authoredInputsHash);same(b.bootstrap.contextId,first.contextId);same(b.bootstrap.ownerFence,first.ownerFence);
  for(const input of b.inputs) {const entry=entries.find(e=>e.inputId===input.inputId);demand(entry,'REFERENCE_MISMATCH');same(entry.metadata.provenance,input.provenance);same(entry.metadata.sourceStepId,input.stepId);same(entry.metadata.kind,input.kind);same(entry.metadata.intendedSlot,input.intendedSlot);}
  const preparations=new Map(b.preparations.map(p=>[p.preparationId,p]));unique(b.preparations.map(p=>p.preparationId));
  for(const fact of b.actions) {const p=preparations.get(fact.preparationId);demand(p,'EVIDENCE_MISMATCH');validateHistoricalAction(b,fact,p);}
}
export function validateIncrementalHistory(b: ValidationBasis): void {
  const inc=b.incrementalEvidence;demand(b.actions.length+(inc?.excludedAttempts.length??0)<=200,'LIMIT_EXCEEDED');if(!inc){demand(b.actions.every(a=>a.ledger.attemptOrdinal===0),'EVIDENCE_MISMATCH');return;}
  const first=inc.firstSuffixAcceptance, change=inc.switch; same(first.sessionId,b.sessionId);same(first.retainedPrefixAdmissionIds,change.retainedPrefixAdmissionIds);demand(first.planRevision===first.previousPlanRevision+1&&BigInt(first.planRevision)<=BigInt(b.translationRevision),'EVIDENCE_MISMATCH');
  const requests=new Map(inc.prefixRequests.map(r=>[hashObserved(r),r]));unique(inc.prefixRequests.map(r=>hashObserved(r)));
  let previous:readonly[number,number,number,string]|null=null;
  for(const request of inc.prefixRequests) {
    const header=historicalVersion(b,request.contextRevision);for(const key of ['sessionId','scopeHash','workerId','ownerFence','contextId','contextRevision','authoredInputsHash','sourceRevision','configurationRevision']as const)same(request[key],header[key]);same(request.prefixProgramHash,inc.plan.prefixProgramHash);
    const index=b.sourceSteps.findIndex(s=>s.stepId===request.coordinate.stepId);demand(index>=0&&index<inc.plan.initialFirstLearnIndex,'EVIDENCE_MISMATCH');
    let generation=hashObserved(b.bootstrap.initialEvidence)===request.evidenceHash?0:-1;
    for(const row of b.observations){const o=row.observation;const e={kind:'observedDocument',sessionId:b.sessionId,contextId:header.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:row.observationHash};if(hashObserved(e)===request.evidenceHash)generation=o.generation;}
    demand(generation>=0,'EVIDENCE_MISMATCH');const tuple=[index,request.coordinate.ordinal,generation,hashObserved(request)]as const;
    if(previous){const delta=tuple[0]-previous[0]||tuple[1]-previous[1]||tuple[2]-previous[2]||(tuple[3]>previous[3]?1:tuple[3]<previous[3]?-1:0);demand(delta>0,'EVIDENCE_MISMATCH');}previous=tuple;
  }
  const receipt=inc.driftReceipt, excluded=inc.excludedAttempts;
  if(change.reason!=='DRIFT'){same(receipt,null);same(excluded.length,0);demand(b.actions.every(a=>a.ledger.attemptOrdinal===0),'EVIDENCE_MISMATCH');return;}
  demand(receipt&&!receipt.nativeInvocationStarted,'EVIDENCE_MISMATCH');const request=requests.get(receipt.requestDigest);demand(request,'EVIDENCE_MISMATCH');
  for(const key of ['sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','authoredInputsHash','sourceRevision','configurationRevision','prefixProgramHash','coordinate','evidenceHash']as const)same(receipt[key],request[key]);
  const program=inc.program.actions.find(a=>equalObserved(a.coordinate,receipt.coordinate));demand(program,'EVIDENCE_MISMATCH');same(program.operationHash,receipt.operationHash);
  if(receipt.phase==='PRE_ADMISSION')same(excluded.length,0);
  else {
    demand(excluded.length===1,'EVIDENCE_MISMATCH');const old=excluded[0];demand(old,'EVIDENCE_MISMATCH');validateHistoricalAction(b,old.action,old.preparation);
    const l=old.action.ledger;demand(l.state==='FAILED'&&l.outcomeCode==='TARGET_CHANGED'&&l.dispatchCount===1&&l.attemptOrdinal===0&&l.assertionPassed===null,'EVIDENCE_MISMATCH');same(l.admission.admissionId,receipt.admissionId);same(l.preparationId,receipt.preparationId);same(l.coordinate,receipt.coordinate);same(l.operationHash,receipt.operationHash);same(old.obligationAssociation.proposalHash,l.requestDigest);same(old.obligationAssociation.admissionId,l.admission.admissionId);same(old.obligationAssociation.coordinate,l.coordinate);same(old.obligationAssociation.obligationId,old.action.obligationId);
    demand(!b.actions.some(a=>a.ledger.admission.admissionId===l.admission.admissionId),'EVIDENCE_MISMATCH');
  }
  for(const fact of b.actions) {const replacement=equalObserved(fact.ledger.coordinate,receipt.coordinate)&&receipt.phase==='ADMITTED_PRE_INVOCATION';same(fact.ledger.attemptOrdinal,replacement?1:0);}
}
function argument(op: PreparationFact['proposal']['operation']): {kind:string;bindingId?:string}|null {return op.kind==='fill'||op.kind==='selectOption'?op.value:op.kind==='assert'?op.expected:null;}
/** ARCH015-02: raw arrays remain committed; only a proven spent no-native edge is omitted. */
export function effectiveGraph(b: ValidationBasis): {allocations:OriginalAllocation[];consumerEdges:OriginalConsumerEdge[]} {
  const inc=b.incrementalEvidence, drift=inc?.switch.reason==='DRIFT';
  const bases=b.snapshotEvidence.baseProof?.artifact.learnedPlan.bindings??[];
  const atOrAfter=(c:{stepId:string;ordinal:number}):boolean=>{demand(inc,'REFERENCE_MISMATCH');const index=b.sourceSteps.findIndex(s=>s.stepId===c.stepId);demand(index>=0,'REFERENCE_MISMATCH');return index>inc.switch.effectiveFirstLearnIndex||index===inc.switch.effectiveFirstLearnIndex&&c.ordinal>=inc.switch.nextSemanticOrdinal;};
  const importedRead=(binding:string,step:string,after:boolean):boolean=>{const base=bases.find(x=>x.bindingId===binding);return !!base&&base.producer.stepId===step&&!!inc?.program.actions.some(a=>equalObserved(a.coordinate,base.producer)&&a.operation.kind==='read'&&a.operation.bindingId===binding&&equalObserved(a.operation.recipe,base.recipe)&&(!after||atOrAfter(a.coordinate)));};
  const importedConsumer=(binding:string,intent:OriginalAllocation['consumers'][number]):boolean=>{const base=bases.find(x=>x.bindingId===binding);return !!base?.consumers.some(e=>e.coordinate.stepId===intent.stepId&&e.argumentSlot===intent.argumentSlot)&&!!inc?.program.actions.some(a=>a.coordinate.stepId===intent.stepId&&`${a.operation.kind}.${a.operation.kind==='assert'?'expected':'value'}`===intent.argumentSlot&&argument(a.operation)?.kind==='binding'&&argument(a.operation)?.bindingId===binding&&atOrAfter(a.coordinate));};
  unique(b.allocations.map(a=>a.bindingId));unique(b.producers.map(p=>p.bindingId));unique(b.consumerEdges.map(e=>`${e.consumerAdmissionId}:${e.argumentSlot}`));
  // Admission validates the allocated pair and atomically attaches its edge before dispatch.
  // A witnessed excluded no-native failure may remove neither fact from the raw evidence.
  // These are minimum public joins, not proof of the complete immutable database inventory.
  for(const excluded of inc?.excludedAttempts??[]){
    const proposal=excluded.preparation.proposal,ref=argument(proposal.operation);
    if(ref?.kind!=='binding')continue;
    demand(drift&&inc.driftReceipt?.phase==='ADMITTED_PRE_INVOCATION'&&ref.bindingId,'EVIDENCE_MISMATCH');
    const producer=b.producers.find(p=>p.bindingId===ref.bindingId),allocation=b.allocations.find(a=>a.bindingId===ref.bindingId);
    const argumentSlot=`${proposal.operation.kind}.${proposal.operation.kind==='assert'?'expected':'value'}`;
    demand(producer&&allocation&&allocation.producerStepId===producer.coordinate.stepId&&producer.origin===proposal.executionEvidence.origin,'REFERENCE_MISMATCH');
    demand(allocation.consumers.filter(c=>c.stepId===proposal.coordinate.stepId&&c.argumentSlot===argumentSlot).length===1,'REFERENCE_MISMATCH');
    const admissionId=excluded.action.ledger.admission.admissionId;
    const edges=b.consumerEdges.filter(e=>e.consumerAdmissionId===admissionId&&e.argumentSlot===argumentSlot);
    demand(edges.length===1&&equalObserved(edges[0],{bindingId:ref.bindingId,producerAdmissionId:producer.producerAdmissionId,consumerAdmissionId:admissionId,coordinate:proposal.coordinate,argumentSlot,destinationOrigin:proposal.executionEvidence.origin,transferPolicy:'sameOrigin'}),'REFERENCE_MISMATCH');
  }
  const actions=new Map(b.actions.map(a=>[a.ledger.admission.admissionId,a]));
  const consumerEdges=b.consumerEdges.filter(edge=>{
    if(actions.has(edge.consumerAdmissionId))return true;
    const excluded=inc?.excludedAttempts[0];demand(drift&&excluded&&inc.driftReceipt?.phase==='ADMITTED_PRE_INVOCATION'&&excluded.action.ledger.admission.admissionId===edge.consumerAdmissionId,'EVIDENCE_MISMATCH');
    const proposal=excluded.preparation.proposal, producer=b.producers.find(p=>p.bindingId===edge.bindingId);demand(producer&&producer.producerAdmissionId===edge.producerAdmissionId&&producer.origin===edge.destinationOrigin&&proposal.executionEvidence.origin===edge.destinationOrigin,'REFERENCE_MISMATCH');same(edge.coordinate,proposal.coordinate);const producerIndex=b.sourceSteps.findIndex(s=>s.stepId===producer.coordinate.stepId),consumerIndex=b.sourceSteps.findIndex(s=>s.stepId===edge.coordinate.stepId);demand(producerIndex>=0&&consumerIndex>=0&&(producerIndex<consumerIndex||producerIndex===consumerIndex&&producer.coordinate.ordinal<edge.coordinate.ordinal),'REFERENCE_MISMATCH');const arg=argument(proposal.operation);demand(arg?.kind==='binding'&&arg.bindingId===edge.bindingId&&`${proposal.operation.kind}.${proposal.operation.kind==='assert'?'expected':'value'}`===edge.argumentSlot,'REFERENCE_MISMATCH');return false;
  });
  const allocations:OriginalAllocation[]=[];
  for(const raw of b.allocations){unique(raw.consumers.map(c=>`${c.stepId}:${c.argumentSlot}`));const need=b.translationPlan.needs.find(n=>n.bindingId===raw.bindingId),producer=b.producers.find(p=>p.bindingId===raw.bindingId);
    if(!producer){demand(!need&&drift&&importedRead(raw.bindingId,raw.producerStepId,true)&&raw.consumers.every(c=>importedConsumer(raw.bindingId,c))&&!consumerEdges.some(e=>e.bindingId===raw.bindingId),'REFERENCE_MISMATCH');continue;}
    demand(need&&need.needId===raw.needId&&need.producerStepId===raw.producerStepId,'REFERENCE_MISMATCH');
    for(const intent of raw.consumers)if(!need.consumers.some(c=>equalObserved(c,intent)))demand(drift&&importedConsumer(raw.bindingId,intent),'REFERENCE_MISMATCH');
    demand(need.consumers.every(c=>raw.consumers.some(i=>equalObserved(i,c))),'REFERENCE_MISMATCH');
    if(need.consumers.length===0){const base=bases.find(x=>x.bindingId===raw.bindingId);demand(importedRead(raw.bindingId,raw.producerStepId,false)&&base&&equalObserved(base.producer,producer.coordinate)&&equalObserved(base.recipe,producer.recipe)&&base.sourceOrigin===producer.origin&&inc?.switch.retainedPrefixAdmissionIds.includes(producer.producerAdmissionId),'REFERENCE_MISMATCH');}
    allocations.push({...raw,consumers:need.consumers});
  }
  demand(allocations.length===b.producers.length&&b.translationPlan.needs.length===b.producers.length,'REFERENCE_MISMATCH');return {allocations,consumerEdges};
}
