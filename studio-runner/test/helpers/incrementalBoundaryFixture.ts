import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {strictEqual} from 'node:assert';
import {publicationFixture} from './publicationFixture.js';
import type {TestDocument} from './publicationFixture.js';
import {parseDocumentJson} from './documentJson.js';
import type {Artifact3,ValidationBasis,LearnedPlan,Guard,ReplayAction,InputRecipe,Policy4} from '../../src/executor/observedOperations.js';
import type {ObservedHashes} from '../../src/validator/observedReplay.js';

/** Explicit conformance history only: no database, callback, browser or native authority.
 * Expected values use this independent serializer and literal action/guard/snapshot facts.
 * This module never imports or calls the production derivation/hash implementation. */
export const BOUNDARY_CLASSIFICATION='SYNTHETIC_CONFORMANCE_HISTORY_NO_DB_CALLBACK_OR_NATIVE_AUTHORITY';
function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';
  return JSON.stringify(value);
}
export const boundaryHash=(value:unknown):string=>createHash('sha256').update(canonical(value),'utf8').digest('hex');
const bytes=(value:unknown):number=>Buffer.byteLength(canonical(value),'utf8');
function need<T>(value:T|null|undefined):T {if(value===null||value===undefined)throw Error('MISSING_BOUNDARY_FACT');return value;}
const uuid=(n:number):string=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
type MutableBasis=TestDocument<ValidationBasis>;
type Witness=NonNullable<MutableBasis['preparations'][number]['observedChoice']>;
interface BoundaryParent {basis:ValidationBasis;expectedArtifact:Artifact3;expectedHashes:ObservedHashes;classification:typeof BOUNDARY_CLASSIFICATION;construction:{baselineBytes:number;planBytesAdded:number;labelResidue:number;targetBytes:number};privateInputEnvelope:unknown}

function sealWitness(w:Witness):void {
  const capture=w.context.questionCapture;
  w.questionPlan.planHash=boundaryHash(w.questionPlan.plan);capture.planHash=w.questionPlan.planHash;
  capture.modelQuestionHash=boundaryHash(w.attempt.modelQuestion);
  w.receipt.contextIdentityHash=boundaryHash(w.context);w.receipt.questionCaptureHash=boundaryHash(capture);w.receipt.meaningsHash=boundaryHash(w.meanings);
}
function expectedCandidate(b:MutableBasis):{artifact:Artifact3;hashes:ObservedHashes} {
  const origin='https://orders.example.test',scopeHash=boundaryHash(b.scope),ids=b.sourceSteps.map(s=>s.stepId);
  // Literal descriptor: one blank-page navigation, then one selected Proceed click per step.
  const actions:LearnedPlan['actions'][number][]=ids.map((stepId,index)=>{
    const coordinate={stepId,ordinal:0 as const},operation=index===0?{kind:'navigate' as const,destinationInputId:'input-destination'}:{kind:'click' as const};
    const locator=index===0?null:{kind:'testId' as const,value:`proceed-${String(index).padStart(3,'0')}`,exact:true as const};
    const actionOrigin=index===0?null:origin;
    const admissionId=`boundary-admission-${String(index).padStart(3,'0')}`,operationHash=boundaryHash({coordinate,origin:actionOrigin,locator,operation});
    return index===0?{coordinate,origin:null,locator:null,operation:{kind:'navigate',destinationInputId:'input-destination'},admissionId,operationHash}:{coordinate,origin,locator:need(locator),operation:{kind:'click'},admissionId,operationHash};
  });
  const guards:Guard[]=ids.map((_,index)=>index===0?{guardId:'g0',origin:null,target:{kind:'initialBlank'}}:{guardId:'g'+String(index),origin,target:{kind:'element',locator:{kind:'testId',value:`proceed-${String(index).padStart(3,'0')}`,exact:true},role:'button',elementType:'button',controlType:'none',classification:'structuralOnly',visible:true,actionable:true,readRuleId:null}});
  const replay:ReplayAction[]=actions.map((action,index)=>({coordinate:action.coordinate,guardId:'g'+String(index),operation:action.operation}));
  const context={entries:[],evidenceReferences:[]};
  let previous=boundaryHash({domain:'studio.test-config',version:1,...b.configuration,globalContextHash:boundaryHash(context),globalReferences:[]});
  const stepSnapshotHashes:Record<string,string>={};
  for(const [index,source]of b.sourceSteps.entries()){
    const stepInputHash=boundaryHash({domain:'studio.step-input',version:1,stepId:source.stepId,text:source.source,context,references:[]});
    previous=boundaryHash({domain:'studio.step-chain',version:1,stepId:source.stepId,stepInputHash,previous});
    const action=need(actions[index]),semanticAction={coordinate:action.coordinate,origin:action.origin,locator:action.locator,operation:action.operation,operationHash:action.operationHash};
    stepSnapshotHashes[source.stepId]=boundaryHash({domain:'studio.step-snapshot',version:1,stepId:source.stepId,inputChain:previous,learnedStepHash:boundaryHash({actions:[semanticAction],producedBindings:[],consumedBindings:[]})});
  }
  const pin=need(b.snapshotEvidence.pinnedBase),first=need(ids[0]);
  const plan:LearnedPlan={schemaVersion:3,planId:'plan-'+boundaryHash({sessionId:b.sessionId}),scopeHash,sourceRevision:b.sourceRevision,configurationRevision:b.configurationRevision,authoredInputsHash:b.authoredInputsHash,initialContext:{kind:'initialBlank'},sourceSteps:ids,versions:{contract:3},actions,bindings:[],stepSnapshotHashes,reusedFrom:{},incremental:{baseRevisionId:pin.revisionId,initialFirstLearnStepId:first,effectiveFirstLearnStepId:first,retainedPrefixAdmissionIds:[],driftReceiptHash:null}};
  const learnedPlanHash=boundaryHash(plan),runAuthorizationHash=boundaryHash(b.runAuthorization);
  const admissions=actions.map((action,index)=>({coordinate:action.coordinate,admission:{admissionId:action.admissionId,authorizationId:b.runAuthorization.authorizationId,admittedAt:'2026-10-08T03:00:10Z',policyDecisionHash:need(b.actions[index]).ledger.admission.policyDecisionHash},operationHash:action.operationHash,scopeHash}));
  const admissionProvenanceHash=boundaryHash(admissions),publicationEvidenceHash=boundaryHash({version:1,basisHash:boundaryHash(b),runAuthorizationHash,translationHash:b.translationHash,bootstrapHash:boundaryHash(b.bootstrap),sourceManifestHash:b.sourceManifestHash});
  const inputRecipes:InputRecipe[]=[{inputId:'input-destination',stepId:first,kind:'destination',intendedSlot:'navigate.destination',provenance:{kind:'sourceSpan',start:5,end:38,sourceHash:b.sourceHash}}];
  const policy:Policy4={schemaVersion:4,learnedPlanHash,admissionProvenanceHash,publicationEvidenceHash,runAuthorizationHash,scope:b.replayRequirements as ValidationBasis['replayRequirements'],inputs:inputRecipes,bindings:[],transfers:[]};
  const artifact:Artifact3={version:3,kind:'observed',profile:{contract:3},sourceHash:b.sourceHash,configurationHash:b.configurationHash,authoringHash:b.authoringHash,learnedPlan:plan,learnedPlanHash,inputRecipes,guards,replayPolicy:policy,steps:ids.map((stepId,stepIndex)=>({stepId,stepIndex,operations:[need(replay[stepIndex])]}))};
  const hashes:ObservedHashes={sourceHash:b.sourceHash,configurationHash:b.configurationHash,authoringHash:b.authoringHash,learnedPlanHash,artifactHash:boundaryHash(artifact),referencePolicyHash:boundaryHash(policy),operationEquivalenceHash:boundaryHash({operations:replay,guards,inputRecipes,bindings:[],transfers:[]}),admissionProvenanceHash,publicationEvidenceHash,runAuthorizationHash,profileHash:boundaryHash({contract:3})};
  return {artifact,hashes};
}

export function incrementalBoundaryFixture():BoundaryParent {
  const document=parseDocumentJson(readFileSync(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json',import.meta.url)),33554432) as {incrementalContracts:{basisCases:{name:string;basis:ValidationBasis}[]}};
  const seed=need(document.incrementalContracts.basisCases.find(row=>row.name==='emptyPrefix'));
  const b=structuredClone(seed.basis) as MutableBasis;
  const firstPrep=structuredClone(need(b.preparations[0])),firstAction=structuredClone(need(b.actions[0]));
  const choiceTemplate=need(need(publicationFixture.observedChoice.basis.preparations[3]).observedChoice);
  const scopeHash=boundaryHash(b.scope),contextId=b.bootstrap.contextId,header=need(b.materializationEvidence.versions[0]),worker=header.workerId;
  b.sourceSteps=Array.from({length:100},(_,ordinal)=>({stepId:uuid(ordinal+1),ordinal,source:ordinal===0?'Open https://orders.example.test/start':'Click Proceed'}));
  b.sourceHash=boundaryHash(b.sourceSteps.map(s=>s.source));b.authoringHash=boundaryHash(b.sourceSteps);b.configurationHash=boundaryHash(b.configuration);
  b.snapshotEvidence.current={authoringIdentityVersion:1,authoring:{authoringSchemaVersion:2,globalContext:{entries:[],evidenceReferences:[]},steps:b.sourceSteps.map(s=>({id:s.stepId,text:s.source,context:{entries:[],evidenceReferences:[]}}))},authoredDeclarations:[]};
  // Keep the original small EMPTY_PREFIX base pin; a proof body is lawfully null here.
  b.snapshotEvidence.baseProof=null;
  const ref={referenceKind:'sourceSpan' as const,sourceRevision:b.sourceRevision,stepId:uuid(1),startUtf16:5,endUtf16:38,kind:'destination' as const,intendedSlot:'navigate.destination' as const};
  b.inputs=[{inputId:'input-destination',stepId:uuid(1),kind:'destination',intendedSlot:'navigate.destination',provenance:ref}];
  const metadata={inputId:'input-destination',sourceStepId:uuid(1),kind:'destination' as const,intendedSlot:'navigate.destination' as const,provenance:ref};
  const privateInput={...metadata,value:'https://orders.example.test/start'};
  const privateInputEnvelope={schemaVersion:3,sessionId:b.sessionId,scopeHash,sourceRevision:b.sourceRevision,configurationRevision:b.configurationRevision,inputs:[privateInput]};
  b.authoredInputsHash=boundaryHash(privateInputEnvelope);
  b.materializationEvidence={versions:[{...header,contextRevision:1,authoredInputsHash:b.authoredInputsHash,birthMaterializationRevision:1,inputCount:1,previousInputsHash:null}],entries:[{inputOrdinal:0,inputId:'input-destination',introducedContextRevision:1,inputHash:boundaryHash(privateInput),metadata}]};
  b.bootstrap.contextRevision=1;b.bootstrap.materializationRevision=1;b.bootstrap.inputsHash=b.authoredInputsHash;b.bootstrap.allocationHash=boundaryHash([]);
  b.configurationReferences=[];b.sourceSelections=[];b.allocations=[];b.producers=[];b.consumerEdges=[];b.bindings=[];b.transfers=[];
  b.translationRevision='2';
  b.translationPlan={sourceReferences:[ref],needs:[],obligations:b.sourceSteps.map((step,index)=>({obligationId:uuid(1001+index),stepId:step.stepId,occurrence:0,operationKind:index===0?'navigate':'click',targetIntent:index===0?'page':'Proceed',referenceIndex:index===0?0:null,needId:null,predicate:null}))};
  const inc=need(b.incrementalEvidence);inc.firstSuffixAcceptance.previousPlanRevision=1;inc.firstSuffixAcceptance.planRevision=2;
  b.preparations=[];b.actions=[];b.observations=[];b.obligationAssociations=[];
  const origin='https://orders.example.test';
  for(const [index,step]of b.sourceSteps.entries()){
    const suffix=String(index).padStart(3,'0'),coordinate={stepId:step.stepId,ordinal:0},preparationId='boundary-preparation-'+suffix,admissionId='boundary-admission-'+suffix,obligation=need(b.translationPlan.obligations[index]);
    const p=structuredClone(firstPrep),fact=structuredClone(firstAction);
    let evidence:MutableBasis['preparations'][number]['executionEvidence']=structuredClone(b.bootstrap.initialEvidence);
    if(index>0){
      const documentId='boundary-document-'+suffix,oldGeneration=index*2-1,freshGeneration=index*2;
      const observe=(generation:number)=>{
        const observation={schemaVersion:3,sessionId:b.sessionId,scopeHash,documentId,generation,origin,observedAt:'2026-10-08T03:00:05.123456789Z',coverage:{mode:'semantic' as const,complete:true,truncated:false,withheldRegions:0,reason:'complete' as const,passwordControls:0},nodes:[0,1].map(alternative=>({nodeId:`${alternative===0?'alternate':'proceed'}-${suffix}-${String(generation)}`,documentId,generation,role:'button',name:alternative===0?'Alternate':'Proceed',elementType:'button' as const,controlType:'none' as const,classification:'structuralOnly' as const,policyRuleId:'structure-only',visible:true,actionable:true,depth:0,parentNodeId:null,regionId:null,formId:null,labelNodeIds:[],locatorHints:[{kind:'testId' as const,value:`${alternative===0?'alternate':'proceed'}-${suffix}`,exact:true}]}))};
        const row={observationHash:boundaryHash(observation),observation};b.observations.push(row);return row;
      };
      const old=observe(oldGeneration),fresh=observe(freshGeneration);
      const oldEvidence={kind:'observedDocument' as const,sessionId:b.sessionId,contextId,documentId,generation:oldGeneration,origin,observationHash:old.observationHash};
      evidence={...oldEvidence,generation:freshGeneration,observationHash:fresh.observationHash};
      p.proposal.target={nodeId:need(fresh.observation.nodes[1]).nodeId,documentId,generation:freshGeneration,locator:need(need(fresh.observation.nodes[1]).locatorHints[0])};
      p.proposal.operation={kind:'click'};
      const w=structuredClone(choiceTemplate),clarificationId='boundary-question-'+suffix,requestId='boundary-question-request-'+suffix,attemptId='boundary-question-attempt-'+suffix;
      w.acceptedChoiceId='boundary-choice-'+suffix+'-1';
      w.meanings=old.observation.nodes.map((node,alternative)=>({choiceId:`boundary-choice-${suffix}-${String(alternative)}`,meaning:{obligationId:obligation.obligationId,nodeId:node.nodeId,bindingId:null,locator:need(node.locatorHints[0])}}));
      w.context={sessionId:b.sessionId,scopeHash,sourceRevision:b.sourceRevision,configurationRevision:b.configurationRevision,clarificationId,question:{...w.context.question,clarificationId,sessionId:b.sessionId,scopeHash,coordinate,documentId,generation:oldGeneration,choices:w.meanings.map((mapping,alternative)=>({choiceId:mapping.choiceId,safeLabel:alternative===0?'Alternate':'Proceed',labelSource:'PAGE',role:'button',region:null,nodeId:mapping.meaning.nodeId,bindingId:null}))},questionCapture:{...w.context.questionCapture,attemptId,requestId,planRevision:'2',obligationId:obligation.obligationId,workerId:worker,ownerFence:b.bootstrap.ownerFence,contextId,contextRevision:1,authoredInputsHash:b.authoredInputsHash,executionEvidence:oldEvidence,evidenceHash:boundaryHash(oldEvidence),observationHash:old.observationHash}};
      w.attempt={...w.attempt,attemptId,requestId,responseRequestId:requestId,planRevision:'2',scopeHash,scope:structuredClone(b.scope),owner:{...w.attempt.owner,workerId:worker,fence:b.bootstrap.ownerFence},documentId,generation:oldGeneration,executionEvidence:oldEvidence,projectionHash:boundaryHash({sessionId:b.sessionId,coordinate,observationHash:old.observationHash}),modelQuestion:{reason:'AMBIGUOUS_TARGET',choices:w.meanings.map((mapping,alternative)=>({choiceId:`boundary-provider-${suffix}-${String(alternative)}`,safeLabel:alternative===0?'Alternate':'Proceed',meaning:structuredClone(mapping.meaning)}))}};
      w.questionPlan={revision:'2',planHash:boundaryHash(b.translationPlan),plan:structuredClone(b.translationPlan)};
      w.receipt={...w.receipt,sessionId:b.sessionId,preparationId,clarificationId,obligationId:obligation.obligationId,acceptedChoiceId:w.acceptedChoiceId,answer:{...w.receipt.answer,sessionId:b.sessionId,scopeHash,clarificationId,coordinate,documentId,generation:oldGeneration,choiceId:w.acceptedChoiceId,nodeId:need(need(w.meanings[1]).meaning.nodeId),bindingId:null,sourceRevision:b.sourceRevision,configurationRevision:b.configurationRevision}};
      sealWitness(w);p.observedChoice=w;
    }
    const evidenceHash=boundaryHash(evidence);
    p.preparationId=preparationId;p.materializationRevision=1;p.observationHash=evidence.kind==='observedDocument'?need(evidence.observationHash):null;p.executionEvidence=structuredClone(evidence);
    p.proposal={...p.proposal,sessionId:b.sessionId,coordinate,scopeHash,generation:evidence.generation,executionEvidence:structuredClone(evidence),evidenceHash,authoredInputsHash:b.authoredInputsHash,contextRevision:1};
    p.proof={...p.proof,sessionId:b.sessionId,workerId:worker,ownerFence:b.bootstrap.ownerFence,scopeHash,contextId,contextRevision:1,sourceRevision:b.sourceRevision,configurationRevision:b.configurationRevision,preparationId,requestDigest:boundaryHash(p.proposal),evidenceHash,authoredInputsHash:b.authoredInputsHash};
    const operationHash=boundaryHash({coordinate,origin:evidence.origin,locator:'locator'in p.proposal.target?p.proposal.target.locator:null,operation:p.proposal.operation});
    fact.obligationId=obligation.obligationId;fact.preparationId=preparationId;
    fact.ledger={...fact.ledger,sessionId:b.sessionId,coordinate,idempotencyKey:'boundary-request-'+suffix,requestDigest:p.proof.requestDigest,scopeHash,operationHash,generation:evidence.generation,documentId:evidence.documentId,ownerFence:b.bootstrap.ownerFence,admission:{admissionId,authorizationId:b.runAuthorization.authorizationId,admittedAt:'2026-10-08T03:00:10Z',policyDecisionHash:boundaryHash({scopeHash,preparation:p.proof,requestDigest:p.proof.requestDigest})},state:'SUCCEEDED',dispatchCount:1,outcomeCode:'OK',assertionPassed:null,executionEvidence:structuredClone(evidence),evidenceHash,authoredInputsHash:b.authoredInputsHash,contextRevision:1,preparationId,attemptOrdinal:0};
    b.preparations.push(p);b.actions.push(fact);b.obligationAssociations.push({obligationId:obligation.obligationId,coordinate,admissionId,proposalHash:p.proof.requestDigest});
  }
  b.translationHash=boundaryHash(b.translationPlan);
  b.sourceManifestHash=boundaryHash({sessionId:b.sessionId,sourceSteps:b.sourceSteps,current:b.snapshotEvidence.current,materializationEvidence:b.materializationEvidence});
  // One measured baseline, then exact integer arithmetic. No validation/derivation retry loop.
  // Every added intent byte occurs once in the current plan and in all 99 genuine question plans.
  const baselineBytes=bytes(b),targetBytes=6291456,available=targetBytes-baselineBytes;
  if(available<0)throw Error('BOUNDARY_BASELINE_ALREADY_OVER_CAP');
  const planBytesAdded=Math.floor(available/100),labelResidue=available%100;
  let remaining=planBytesAdded;
  for(const obligation of b.translationPlan.obligations.slice(1)){
    const add=Math.min(remaining,986);obligation.targetIntent='Proceed'+'é'.repeat(Math.floor(add/2))+(add%2?'a':'');remaining-=add;
  }
  strictEqual(remaining,0,'100 lawful obligations have enough bounded intent capacity');
  b.translationHash=boundaryHash(b.translationPlan);
  for(const p of b.preparations){if(p.observedChoice){p.observedChoice.questionPlan.plan=structuredClone(b.translationPlan);sealWitness(p.observedChoice);}}
  const residueWitness=need(need(b.preparations[1]).observedChoice);
  need(residueWitness.attempt.modelQuestion.choices[0]).safeLabel+='a'.repeat(labelResidue);sealWitness(residueWitness);
  strictEqual(bytes(b),targetBytes,'deterministic quotient/residue construction reaches exact UTF-8 cap');
  const expected=expectedCandidate(b);
  return {basis:b as ValidationBasis,expectedArtifact:expected.artifact,expectedHashes:expected.hashes,classification:BOUNDARY_CLASSIFICATION,construction:{baselineBytes,planBytesAdded,labelResidue,targetBytes},privateInputEnvelope};
}

/** Add exactly one legal model-label byte and reseal the original witness commitments.
 * No new candidate is derived from this oversized input. */
export function oneByteOverBoundary(parent:ValidationBasis):ValidationBasis {
  const b=structuredClone(parent) as MutableBasis,w=need(need(b.preparations[1]).observedChoice);
  need(w.attempt.modelQuestion.choices[0]).safeLabel+='a';sealWitness(w);
  strictEqual(bytes(b),6291457);return b as ValidationBasis;
}
