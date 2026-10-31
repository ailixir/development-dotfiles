'use strict';
// Test data factory only: declared synthetic preimages, no browser/DB/model facts and no runtime imports.
const assert=require('node:assert/strict');
const c=require('./check-studio-observed-contracts.cjs');
const {hash}=c,clone=x=>structuredClone(x);
function identityRebind(value,mapping,key=''){
 if(Array.isArray(value))return value.map(v=>identityRebind(v,mapping,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,identityRebind(v,mapping,k)]));
 const identityKeys=new Set(['sessionId','contextId','workerId','authorizationId','creationId','bootstrapId','clarificationId','attemptId','requestId','responseRequestId','preparationId','admissionId','producerAdmissionId','consumerAdmissionId']);
 return identityKeys.has(key)&&Object.hasOwn(mapping,value)?mapping[value]:value;
}
function preimage(b){return{version:1,basisHash:hash(b),runAuthorizationHash:hash(b.runAuthorization),translationHash:b.translationHash,bootstrapHash:hash(b.bootstrap),sourceManifestHash:b.sourceManifestHash};}
function hashMap(b,a){return{sourceHash:b.sourceHash,configurationHash:b.configurationHash,authoringHash:b.authoringHash,learnedPlanHash:hash(a.learnedPlan),artifactHash:hash(a),referencePolicyHash:hash(a.replayPolicy),operationEquivalenceHash:hash({operations:a.steps.flatMap(s=>s.operations),guards:a.guards,inputRecipes:a.inputRecipes,bindings:a.replayPolicy.bindings,transfers:a.replayPolicy.transfers}),admissionProvenanceHash:a.replayPolicy.admissionProvenanceHash,publicationEvidenceHash:a.replayPolicy.publicationEvidenceHash,runAuthorizationHash:hash(b.runAuthorization),profileHash:hash(a.profile)};}
function sealFacts(b){
 // These current fixtures declare complete short synthetic label preimages, not runtime evidence.
 for(const row of b.observations)for(const fact of Object.values(row.observation.facts)){fact.nameComplete??=true;fact.ownTextComplete??=true;}
 const observationHashes=new Map();for(const o of b.observations){const old=o.observationHash;o.observationHash=hash(o.observation);observationHashes.set(old,o.observationHash);}
 const evidence=e=>{if(e.kind==='observedDocument')e.observationHash=observationHashes.get(e.observationHash)??e.observationHash;return e;};
 evidence(b.bootstrap.initialEvidence);b.translationHash=hash(b.translationPlan);b.bootstrap.allocationHash=hash(b.allocations);
 for(const p of b.preparations){
  const proposal=p.proposal,proof=p.proof,w=p.observedChoice;
  if(w){const q=w.context.questionCapture;evidence(q.executionEvidence);q.observationHash=q.executionEvidence.observationHash;q.evidenceHash=hash(q.executionEvidence);w.attempt.executionEvidence=clone(q.executionEvidence);w.questionPlan.planHash=hash(w.questionPlan.plan);q.planHash=w.questionPlan.planHash;q.modelQuestionHash=hash(w.attempt.modelQuestion);w.receipt.contextIdentityHash=hash(w.context);w.receipt.questionCaptureHash=hash(q);w.receipt.meaningsHash=hash(w.meanings);}
  evidence(proposal.executionEvidence);proposal.evidenceHash=hash(proposal.executionEvidence);p.executionEvidence=clone(proposal.executionEvidence);p.observationHash=proposal.executionEvidence.kind==='observedDocument'?proposal.executionEvidence.observationHash:null;proof.evidenceHash=proposal.evidenceHash;proof.requestDigest=hash(proposal);
  const fact=b.actions.find(x=>x.preparationId===p.preparationId);assert(fact,'declared successful preparation');const l=fact.ledger;l.executionEvidence=clone(proposal.executionEvidence);l.evidenceHash=proposal.evidenceHash;l.requestDigest=proof.requestDigest;l.operationHash=hash(c.operationIdentity({coordinate:proposal.coordinate,origin:proposal.executionEvidence.origin??null,target:proof.target??null,operation:proposal.operation}));l.admission.policyDecisionHash=hash({scopeHash:l.scopeHash,preparation:proof,requestDigest:l.requestDigest});const association=b.obligationAssociations.find(x=>x.obligationId===fact.obligationId);association.proposalHash=l.requestDigest;
 }
 return b;
}
function deriveExpected(b){
 // Independent explicit projection of the frozen facts; never invokes Java/TS production lowerers.
 const actions=b.actions.map(f=>{const prep=b.preparations.find(p=>p.preparationId===f.preparationId),p=prep.proposal;return{coordinate:clone(p.coordinate),origin:p.executionEvidence.origin??null,operation:clone(p.operation),admissionId:f.ledger.admission.admissionId,operationHash:f.ledger.operationHash};});
 const guards=b.preparations.map((p,i)=>({guardId:'g'+i,origin:p.executionEvidence.origin??null}));
 const graph=c.snapshotOracle.graphFromBasis(b),maps=c.snapshotOracle.envelopes(b.snapshotEvidence.current,b.configuration,graph).maps;
 const learnedPlan={schemaVersion:3,planId:'plan-'+hash({sessionId:b.sessionId}),scopeHash:hash(b.scope),sourceRevision:b.sourceRevision,configurationRevision:b.configurationRevision,authoredInputsHash:b.authoredInputsHash,initialContext:clone(b.replayRequirements.initialContext),sourceSteps:b.sourceSteps.map(s=>s.stepId),versions:{contract:3},actions,bindings:clone(b.bindings),stepSnapshotHashes:maps,reusedFrom:{},incremental:null};
 const inputRecipes=b.inputs.map(i=>({inputId:i.inputId,stepId:i.stepId,kind:i.kind,provenance:i.provenance.referenceKind==='sourceSpan'?{kind:'sourceSpan',start:i.provenance.startUtf16,end:i.provenance.endUtf16,sourceHash:b.sourceHash}:{kind:'configuration',referenceId:i.provenance.referenceId,referenceName:b.configurationReferences.find(r=>r.referenceId===i.provenance.referenceId).referenceName}}));
 const learnedPlanHash=hash(learnedPlan),replayPolicy={schemaVersion:4,learnedPlanHash,admissionProvenanceHash:hash(b.actions.map(({ledger:l})=>({coordinate:l.coordinate,admission:l.admission,operationHash:l.operationHash,scopeHash:l.scopeHash}))),publicationEvidenceHash:hash(preimage(b)),runAuthorizationHash:hash(b.runAuthorization),scope:clone(b.replayRequirements),inputs:clone(inputRecipes),bindings:clone(b.bindings),transfers:clone(b.transfers)};
 return{version:3,kind:'observed',profile:{contract:3},sourceHash:b.sourceHash,configurationHash:b.configurationHash,authoringHash:b.authoringHash,learnedPlan,learnedPlanHash,inputRecipes,guards,replayPolicy,steps:b.sourceSteps.map((s,i)=>({stepIndex:i,stepId:s.stepId,operations:actions.flatMap((a,k)=>a.coordinate.stepId===s.stepId?[{coordinate:clone(a.coordinate),guardId:'g'+k,operation:clone(a.operation)}]:[])}))};
}
function publicationOnly(sample){const b=sample.basis,a=sample.expectedArtifact??sample.artifact;if(!a)return sample;a.replayPolicy.publicationEvidenceHash=hash(preimage(b));if(sample.hashes)sample.hashes=hashMap(b,a);if(sample.publicationEvidencePreimage){sample.publicationEvidencePreimage=preimage(b);sample.publicationEvidenceHash=hash(preimage(b));}return sample;}
module.exports={sealFacts,deriveExpected,hashMap,preimage,publicationOnly,identityRebind};
