import {currentReference} from './helpers/currentWorlds.js';
import type {ValidationBasis} from '../src/executor/observedOperations.js';
import type {TestDocument} from './helpers/publicationFixture.js';
import controlFixture from '../fixtures/observed-reference/control-value-reference.json' with { type: 'json' };
import { describe, expect, it, vi } from 'vitest';
import * as observedPolicy from '../src/validator/observedReferencePolicy.js';
import {incrementalBoundaryFixture,oneByteOverBoundary,boundaryHash,BOUNDARY_CLASSIFICATION} from './helpers/incrementalBoundaryFixture.js';
import fixture from '../fixtures/observed-reference/fresh-order-reference.json' with { type: 'json' };
import { deriveObservedArtifact, validateReplayArtifact, validateObservedRequest } from '../src/validator/observedReplay.js';
import { OBSERVED_LIMITS, OBSERVED_PROFILE, OBSERVED_SCHEMA_BUNDLE_HASH, boundedObserved, canonicalObserved, hashObserved, parseObservedBytes, validateObserved } from '../src/validator/observedReferencePolicy.js';
const build = { profileHash: hashObserved(OBSERVED_PROFILE), schemaBundleHash: OBSERVED_SCHEMA_BUNDLE_HASH, referenceBundleHash: 'a'.repeat(64), executableImageDigest: 'b'.repeat(64), chromiumBuild: 'fixture-123' };
const request = () => { expect(deriveObservedArtifact(fixture.basis)).toEqual({artifact:fixture.artifact,hashes:fixture.hashes}); return { schemaVersion: 3, attemptId: '00000000-0000-4000-8000-000000000900', claimId: '00000000-0000-4000-8000-000000000901', snapshotHash: 'c'.repeat(64), basisHash: hashObserved(fixture.basis), requiredProfile: OBSERVED_PROFILE, requiredBuild: build, artifact: structuredClone(fixture.artifact), validationBasis: structuredClone(fixture.basis) }; };
describe('independent packaged observed validator', () => {
    it('derives fixed manual graph, original guard facts, source recipes and every hash', () => {
        expect(deriveObservedArtifact(fixture.basis)).toEqual({ artifact: fixture.artifact, hashes: fixture.hashes });
        expect(validateReplayArtifact(fixture.artifact)).toEqual(fixture.artifact);
        expect(validateObservedRequest(request(), build).ok).toBe(true);
    });
    it('accepts truthful absent historical full prompt/model labels, requires output pin', () => {
        expect(fixture.basis.learningProvenance.guidedPromptHash).toBeNull();
        const b: Record<string, unknown> = structuredClone(fixture.basis.learningProvenance);
        delete b.outputContractHash;
        expect(() => validateObserved('replay-profile#/definitions/LearningProvenance', b)).toThrow();
    });
    it('rejects coherent self-hashed artifact guard substitution against original evidence', () => {
        const r = request();
        required(r.artifact.guards[1]).target.role = 'button';
        expect(validateObservedRequest(r, build)).toMatchObject({ ok: false, errorCode: 'OPERATION_MISMATCH' });
    });
});
const BASIS_JOIN_MUTATIONS=['scope', 'allocation', 'producer', 'consumer', 'obligation', 'source-reference', 'prepared-target', 'observation-node', 'observation-hash', 'proof-fence', 'ledger-count', 'ledger-state', 'operation-hash', 'extra-observation', 'missing-preparation', 'translation-id', 'bootstrap-origin', 'input-span', 'config-map'] as const;
function mutateBasisJoin(name:typeof BASIS_JOIN_MUTATIONS[number],b:TestDocument<ValidationBasis>):void {
        if (name === 'scope')
            b.scope.principalId = 'different';
        if (name === 'allocation')
            required(b.allocations[0]).bindingId = 'substitute';
        if (name === 'producer')
            required(b.producers[0]).producerAdmissionId = 'other';
        if (name === 'consumer')
            required(b.consumerEdges[0]).coordinate.ordinal = 1;
        if (name === 'obligation')
            required(b.translationPlan.obligations[1]).needId = 'wrong';
        if (name === 'source-reference')
            required(b.translationPlan.sourceReferences[0]).stepId = required(b.sourceSteps[1]).stepId;
        if (name === 'prepared-target')
            required(b.preparations[1]).proposal.target.nodeId = 'missing';
        if (name === 'observation-node')
            required(required(b.observations[0]).observation.nodes[0]).visible = false;
        if (name === 'observation-hash')
            required(b.observations[0]).observationHash = 'a'.repeat(64);
        if (name === 'proof-fence')
            required(b.preparations[0]).proof.ownerFence++;
        if (name === 'ledger-count')
            required(b.actions[0]).ledger.dispatchCount = 2;
        if (name === 'ledger-state')
            required(b.actions[0]).ledger.state = 'ADMITTED';
        if (name === 'operation-hash')
            required(b.actions[0]).ledger.operationHash = 'b'.repeat(64);
        if (name === 'extra-observation')
            b.observations.push(required(b.observations[0]));
        if (name === 'missing-preparation')
            b.preparations.pop();
        if (name === 'translation-id')
            required(b.translationPlan.needs[0]).bindingId = 'forged';
        if (name === 'bootstrap-origin')
            (b.bootstrap.initialEvidence as {
                origin: unknown;
            }).origin = 'https://orders.example.test';
        if (name === 'input-span')
            required(b.inputs[1]).provenance.endUtf16 = 999;
        if (name === 'config-map')
            required<TestDocument<ValidationBasis['configurationReferences'][number]>>(b.configurationReferences[0]).inputId = 'wrong';
}
describe('original evidence bidirectional joins', () => {
    it('derives authorized control-value read independently', () => { expect(deriveObservedArtifact(controlFixture.basis)).toEqual({ artifact: controlFixture.artifact, hashes: controlFixture.hashes }); });
    it.each(BASIS_JOIN_MUTATIONS)('refuses %s mutation', name => {
        const reference=name==='config-map'?currentReference('configuration'):fixture;
        expect(deriveObservedArtifact(reference.basis)).toEqual({artifact:reference.artifact,hashes:reference.hashes});
        const b:TestDocument<ValidationBasis> = structuredClone(reference.basis);
        mutateBasisJoin(name,b);
        b.translationHash = hashObserved(b.translationPlan);
        expect(() => deriveObservedArtifact(b)).toThrow();
    });
    it.each(BASIS_JOIN_MUTATIONS)('preserves control-value subtype while refusing %s basis mutation',name=>{
        const reference=currentReference(name==='config-map'?'configuration':'control');
        expect(deriveObservedArtifact(reference.basis)).toEqual({artifact:reference.artifact,hashes:reference.hashes});
        const b=structuredClone(validateObserved<ValidationBasis>('replay-validation#/definitions/ValidationBasis',reference.basis,OBSERVED_LIMITS.basis)) as TestDocument<ValidationBasis>;
        mutateBasisJoin(name,b);b.translationHash=hashObserved(b.translationPlan);expect(()=>deriveObservedArtifact(b)).toThrow();
    });
    it.each(['click', 'fill', 'read', 'press', 'check', 'uncheck', 'hover', 'selectOption', 'assert'])('cannot replace the exercised first navigation with %s', kind => {
        const r = request();
        required(required(r.artifact.steps[0]).operations[0]).operation.kind = kind;
        expect(() => validateReplayArtifact(r.artifact)).toThrow();
    });
    it('binds output-contract provenance to the evidence hash, without current model defaults', () => {
        const r = request();
        r.validationBasis.learningProvenance.outputContractHash = 'd'.repeat(64);
        r.basisHash = hashObserved(r.validationBasis);
        expect(validateObservedRequest(r, build).ok).toBe(false);
    });
});
// These mutations preserve artifact-local hashes; only original admission authority distinguishes them.
it.each(['policy-decision', 'proof-expiry'])('refuses original admission %s even with coherent local artifact hashes', kind => {
    const b = structuredClone(fixture.basis);
    if (kind === 'policy-decision')
        required(b.actions[0]).ledger.admission.policyDecisionHash = 'd'.repeat(64);
    else
        required(b.preparations[0]).proof.expiresAt = '2026-10-08T03:00:26Z';
    expect(() => deriveObservedArtifact(b)).toThrow('EVIDENCE_MISMATCH');
});
it('refuses a different targetIntent after resealing the accepted translation hash', () => {
    const basis = structuredClone(fixture.basis);
    required(basis.translationPlan.obligations[3]).targetIntent = 'label';
    basis.translationHash = hashObserved(basis.translationPlan);
    expect(() => deriveObservedArtifact(basis)).toThrow('OPERATION_MISMATCH');
});
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}

import {publicationFixture as publicationFixtures} from './helpers/publicationFixture.js';
const observedChoice=publicationFixtures.observedChoice;
type ChoiceBasis=typeof observedChoice.basis;
function choiceBasis():ChoiceBasis { return currentReference('choice').basis; }
function witness(b:ChoiceBasis){return required(required(b.preparations[3]).observedChoice);}
function resealWitness(b:ChoiceBasis):void{
  const w=witness(b),c=w.context.questionCapture;
  c.modelQuestionHash=hashObserved(w.attempt.modelQuestion);w.questionPlan.planHash=hashObserved(w.questionPlan.plan);c.planHash=w.questionPlan.planHash;
  w.receipt.contextIdentityHash=hashObserved(w.context);w.receipt.questionCaptureHash=hashObserved(c);w.receipt.meaningsHash=hashObserved(w.meanings);
}
describe('independent original observed-choice publication witness',()=>{
  it('accepts ten complete original alternatives and still preserves the selected target',()=>{
    const b=choiceBasis(),w=witness(b),old=required(b.observations.find(o=>o.observationHash===w.context.questionCapture.observationHash));
    for(let i=0;i<8;i++){
      const node=structuredClone(required(old.observation.nodes.find(n=>n.nodeId===w.receipt.answer.nodeId)));node.nodeId=`alternative-${String(i)}`;node.locatorHints=[{kind:'testId',value:node.nodeId,exact:true}];old.observation.nodes.push(node);
      const meaning={...structuredClone(required(w.meanings[1]).meaning),nodeId:node.nodeId,locator:required(node.locatorHints[0])};
      w.meanings.push({choiceId:`server-${String(i)}`,meaning});w.attempt.modelQuestion.choices.push({choiceId:`provider-extra-${String(i)}`,safeLabel:'Untrusted alternate',meaning:structuredClone(meaning)});w.context.question.choices.push({choiceId:`server-${String(i)}`,safeLabel:'Alternate field',labelSource:'PAGE',role:node.role,region:node.regionId,nodeId:node.nodeId,bindingId:null});
    }
    old.observationHash=hashObserved(old.observation);w.context.questionCapture.observationHash=old.observationHash;w.context.questionCapture.executionEvidence.observationHash=old.observationHash;w.context.questionCapture.evidenceHash=hashObserved(w.context.questionCapture.executionEvidence);w.attempt.executionEvidence=structuredClone(w.context.questionCapture.executionEvidence);resealWitness(b);
    expect(w.meanings).toHaveLength(10);expect(deriveObservedArtifact(b).artifact.guards).toEqual(observedChoice.artifact.guards);
  });
  it.each(['2026-02-30T03:00:05.123456789Z','2026-10-08T03:00:60Z','2026-10-08T03:00:05.123456789+00:00','2026-10-08T24:00:00Z'])('rejects invalid original calendar/UTC instant %s',instant=>{
    const b=choiceBasis(),w=witness(b);w.receipt.answer.resolvedAt=instant;resealWitness(b);
    expect(()=>deriveObservedArtifact(b)).toThrow('INVALID_CONTRACT');
  });
  it('compares preserved original instants exactly through nanoseconds without rewriting their bytes',()=>{
    const b=choiceBasis(),w=witness(b);w.context.question.expiresAt=w.receipt.answer.resolvedAt;resealWitness(b);
    expect(deriveObservedArtifact(b).artifact.guards).toEqual(observedChoice.artifact.guards);
    expect(w.receipt.answer.resolvedAt).toBe('2026-10-08T03:00:05.123456789Z');
    w.receipt.answer.resolvedAt='2026-10-08T03:00:05.123456790Z';resealWitness(b);
    expect(()=>deriveObservedArtifact(b)).toThrow('EVIDENCE_MISMATCH');
  });
  it('rejects old bundle pins even when the executable profile is identical',()=>{
    const current={...request(),requiredBuild:{...build},artifact:structuredClone(observedChoice.artifact),validationBasis:choiceBasis(),basisHash:hashObserved(observedChoice.basis)};
    expect(validateObservedRequest(current,build).ok).toBe(true);
    current.requiredBuild.schemaBundleHash='0'.repeat(64);
    expect(()=>validateObservedRequest(current,build)).toThrow('PROFILE_MISMATCH');
    expect(current.requiredProfile).toEqual(OBSERVED_PROFILE);
  });
  it('supports a later plan revision only when the original admitted obligation is unchanged',()=>{
    const b=choiceBasis();b.translationRevision='2';
    expect(deriveObservedArtifact(b).artifact.guards).toEqual(observedChoice.artifact.guards);
    const w=witness(b);required(w.questionPlan.plan.obligations[3]).needId='changed-original-meaning';resealWitness(b);
    expect(()=>deriveObservedArtifact(b)).toThrow('EVIDENCE_MISMATCH');
  });
  it.each(['provider-id','old-ambiguous','fresh-ambiguous','old-hidden','old-truncated','old-unsupported','missing-old','unused-old','locator-kind','locator-exact','wrong-input','wrong-binding','extra-proof-key'] as const)('refuses independently joined %s despite coherent outer hashes',name=>{
    const b=choiceBasis(),w=witness(b),p=required(b.preparations[3]);
    const old=required(b.observations.find(o=>o.observationHash===w.context.questionCapture.observationHash));
    const fresh=required(b.observations.find(o=>o.observationHash===p.observationHash));
    if(name==='provider-id')required(w.attempt.modelQuestion.choices[1]).choiceId=required(w.attempt.modelQuestion.choices[0]).choiceId;
    if(name==='old-ambiguous')old.observation.nodes.push({...structuredClone(required(old.observation.nodes.find(n=>n.nodeId===w.receipt.answer.nodeId))),nodeId:'duplicate-old'});
    if(name==='fresh-ambiguous')fresh.observation.nodes.push({...structuredClone(required(fresh.observation.nodes.find(n=>n.nodeId===p.proposal.target.nodeId))),nodeId:'duplicate-fresh'});
    if(name==='old-hidden')required(old.observation.nodes.find(n=>n.nodeId===w.receipt.answer.nodeId)).visible=false;
    if(name==='old-truncated')old.observation.coverage.truncated=true;
    if(name==='old-unsupported')(old.observation.coverage as {reason:unknown}).reason='unsupportedSurface';
    if(name==='missing-old')b.observations=b.observations.filter(o=>o!==old);
    if(name==='unused-old'){const extra=structuredClone(old);extra.observation.documentId='unused';extra.observation.nodes.forEach(n=>n.documentId='unused');extra.observationHash=hashObserved(extra.observation);b.observations.push(extra);}
    if(name==='locator-kind'||name==='locator-exact'){
      const locator=structuredClone(required(required(w.meanings[1]).meaning.locator));
      if(name==='locator-kind')locator.kind='css';else locator.exact=false;
      required(w.meanings[1]).meaning.locator=locator;required(w.attempt.modelQuestion.choices[1]).meaning.locator=structuredClone(locator);
      required(old.observation.nodes.find(n=>n.nodeId===w.receipt.answer.nodeId)).locatorHints=[locator];
    }
    if(name==='wrong-input')(p.proposal.operation as unknown as {value:unknown}).value={kind:'authoredLiteral',sourceInputId:'other'};
    if(name==='wrong-binding')(p.proposal.operation as unknown as {value:unknown}).value={kind:'binding',bindingId:'other'};
    if(name==='extra-proof-key')(w as unknown as Record<string,unknown>).unexpected='audit-data';
    const priorOld=old.observationHash,priorFresh=fresh.observationHash;
    old.observationHash=hashObserved(old.observation);fresh.observationHash=hashObserved(fresh.observation);
    w.context.questionCapture.observationHash=old.observationHash;w.context.questionCapture.executionEvidence.observationHash=old.observationHash;w.context.questionCapture.evidenceHash=hashObserved(w.context.questionCapture.executionEvidence);w.attempt.executionEvidence=structuredClone(w.context.questionCapture.executionEvidence);
    for(const prep of b.preparations){if(prep.observationHash===priorOld)prep.observationHash=old.observationHash;if(prep.observationHash===priorFresh){prep.observationHash=fresh.observationHash;prep.executionEvidence.observationHash=fresh.observationHash;prep.proposal.executionEvidence=structuredClone(prep.executionEvidence);prep.proposal.evidenceHash=hashObserved(prep.executionEvidence);prep.proof.evidenceHash=prep.proposal.evidenceHash;}}
    for(const [i,prep]of b.preparations.entries()){
      prep.proof.requestDigest=hashObserved(prep.proposal);const l=required(b.actions[i]).ledger;l.executionEvidence=structuredClone(prep.executionEvidence);l.evidenceHash=prep.proposal.evidenceHash;l.requestDigest=prep.proof.requestDigest;l.operationHash=hashObserved({coordinate:prep.proposal.coordinate,origin:prep.executionEvidence.origin,locator:prep.proposal.target.locator??null,operation:prep.proposal.operation});l.admission.policyDecisionHash=hashObserved({scopeHash:l.scopeHash,preparation:prep.proof,requestDigest:l.requestDigest});required(b.obligationAssociations[i]).proposalHash=l.requestDigest;
    }
    resealWitness(b);
    expect(()=>deriveObservedArtifact(b)).toThrow();
  });
  it('derives the manual artifact from old/fresh nodes and preserves original raw intent',()=>{
    const before=JSON.stringify(observedChoice.basis),derived=deriveObservedArtifact(observedChoice.basis);
    expect(derived).toEqual({artifact:observedChoice.artifact,hashes:observedChoice.hashes});expect(JSON.stringify(observedChoice.basis)).toBe(before);
    expect(required(observedChoice.basis.translationPlan.obligations[3]).targetIntent).toBe('label-input');expect(required(derived.artifact.guards[3]).target).toMatchObject({locator:{kind:'testId',value:'backup-label-é',exact:true}});
    expect(required(observedChoice.basis.preparations[3]).proposal.target.nodeId).not.toBe(witness(observedChoice.basis).receipt.answer.nodeId);
  });
  it.each(['missing-proof','null-proof','wrong-preparation','wrong-accepted','wrong-answer-node','wrong-answer-binding','expired-answer','wrong-context','wrong-worker','wrong-scope','wrong-source','wrong-config','wrong-attempt','wrong-request','wrong-response-request','unaccepted-attempt','wrong-kind','wrong-plan-revision','wrong-plan-obligation','wrong-model-meaning','singleton','eleven','duplicate-meaning','duplicate-choice','reordered-map','wrong-old-node','wrong-old-locator','wrong-old-observation','stale-generation','unused-old-observation','wrong-fresh-locator','extra-witness'] as const)('rejects coherently resealed %s',name=>{
    expect(deriveObservedArtifact(observedChoice.basis).artifact).toEqual(observedChoice.artifact);
    const b=choiceBasis(),p=required(b.preparations[3]),w=witness(b);
    if(name==='wrong-preparation')w.receipt.preparationId='different';
    if(name==='wrong-accepted'){w.acceptedChoiceId='choice-original';w.receipt.acceptedChoiceId='choice-original';w.receipt.answer.choiceId='choice-original';w.receipt.answer.nodeId='label-input';}
    if(name==='wrong-answer-node')w.receipt.answer.nodeId='label-input';
    if(name==='wrong-answer-binding')(w.receipt.answer as {bindingId:unknown}).bindingId='other-binding';
    if(name==='expired-answer')w.receipt.answer.resolvedAt='2026-10-08T04:00:00Z';
    if(name==='wrong-context')w.context.questionCapture.contextId='different';
    if(name==='wrong-worker'){w.context.questionCapture.workerId='other-worker';w.attempt.owner.workerId='other-worker';}
    if(name==='wrong-scope')w.context.scopeHash='a'.repeat(64);
    if(name==='wrong-source')w.context.sourceRevision='2';
    if(name==='wrong-config')w.context.configurationRevision='2';
    if(name==='wrong-attempt')w.attempt.attemptId='other-attempt';
    if(name==='wrong-request')w.context.questionCapture.requestId='other-request';
    if(name==='wrong-response-request')w.attempt.responseRequestId='other-request';
    if(name==='unaccepted-attempt')w.attempt.status='CALLING';
    if(name==='wrong-kind')w.attempt.kind='SOURCE_PLAN';
    if(name==='wrong-plan-revision'){w.questionPlan.revision='999';w.attempt.planRevision='999';w.context.questionCapture.planRevision='999';}
    if(name==='wrong-plan-obligation')required(w.questionPlan.plan.obligations[3]).targetIntent='altered';
    if(name==='wrong-model-meaning')required(w.attempt.modelQuestion.choices[1]).meaning.nodeId='other';
    if(name==='singleton'){w.meanings.splice(0,1);w.context.question.choices.splice(0,1);w.attempt.modelQuestion.choices.splice(0,1);}
    if(name==='eleven')for(let i=0;i<9;i++){w.meanings.push(required(w.meanings[0]));w.context.question.choices.push(required(w.context.question.choices[0]));w.attempt.modelQuestion.choices.push(required(w.attempt.modelQuestion.choices[0]));}
    if(name==='duplicate-meaning'){required(w.meanings[0]).meaning=structuredClone(required(w.meanings[1]).meaning);required(w.attempt.modelQuestion.choices[0]).meaning=structuredClone(required(w.meanings[1]).meaning);}
    if(name==='duplicate-choice')required(w.meanings[0]).choiceId='choice-backup';
    if(name==='reordered-map')w.meanings.reverse();
    if(name==='wrong-old-node'){required(w.meanings[1]).meaning.nodeId='missing';required(w.attempt.modelQuestion.choices[1]).meaning.nodeId='missing';required(w.context.question.choices[1]).nodeId='missing';w.receipt.answer.nodeId='missing';}
    if(name==='wrong-old-locator'){required(required(w.meanings[1]).meaning.locator).value='different';required(required(w.attempt.modelQuestion.choices[1]).meaning.locator).value='different';}
    if(name==='wrong-old-observation')w.context.questionCapture.observationHash='b'.repeat(64);
    if(name==='stale-generation')w.context.questionCapture.executionEvidence.generation=p.executionEvidence.generation;
    if(name==='unused-old-observation')b.observations.push(structuredClone(required(b.observations[3])));
    if(name==='wrong-fresh-locator')required(p.proposal.target.locator).value='label-input';
    if(name==='extra-witness')required(b.preparations[4]).observedChoice=structuredClone(w);
    resealWitness(b);
    if(name==='missing-proof')delete p.observedChoice;
    if(name==='null-proof')(p as unknown as {observedChoice:unknown}).observedChoice=null;
    expect(()=>deriveObservedArtifact(b)).toThrow();
  });
});

describe('independent composed canonical UTF-8 ceilings',()=>{
  const bytes=(v:unknown)=>Buffer.byteLength(canonicalObserved(v));
  it('keeps the structural preparation/witness cardinality at 200 independently of byte caps',()=>{
    const b=choiceBasis(),p=required(b.preparations[3]);b.preparations=Array.from({length:200},()=>structuredClone(p));
    validateObserved('replay-validation#/definitions/ValidationBasis',b,OBSERVED_LIMITS.basis);
    b.preparations.push(structuredClone(p));expect(()=>validateObserved('replay-validation#/definitions/ValidationBasis',b,OBSERVED_LIMITS.basis)).toThrow('INVALID_CONTRACT');
  });
  it('accepts a shape-valid 16384-byte preparation receipt and refuses the next byte',()=>{
    const receipt=structuredClone(witness(observedChoice.basis).receipt) as unknown as Record<string,unknown>,answer=receipt.answer as Record<string,unknown>,coordinate=answer.coordinate as Record<string,unknown>;
    const fields:[Record<string,unknown>,string][]=[...['sessionId','preparationId','clarificationId','acceptedChoiceId'].map(k=>[receipt,k] as [Record<string,unknown>,string]),...['sessionId','clarificationId','documentId','choiceId','nodeId','bindingId'].map(k=>[answer,k] as [Record<string,unknown>,string]),[coordinate,'stepId']];
    for(const [object,key]of fields)object[key]='\u0001'.repeat(256);
    coordinate.ordinal=7;answer.generation=2147483647;answer.sourceRevision='9223372036854775807';answer.configurationRevision='9223372036854775807';answer.resolvedAt='2026-10-08T03:00:05.123456789Z';
    let remaining=bytes(receipt)-16384;
    for(const [object,key]of fields){
      const chars=Array.from(String(object[key]));
      for(let i=0;i<chars.length&&remaining>0;i++){
        if(remaining>=5){chars[i]='a';remaining-=5;}
        else if(remaining===4){chars[i]='é';remaining=0;}
        else if(remaining===3){chars[i]='\u2028';remaining=0;}
        else if(remaining===2){chars[i]='🧪';remaining=0;}
        else {chars[i]='a';chars[i+1]='"';remaining-=9;throw Error('controlled byte residue unexpectedly one');}
      }
      object[key]=chars.join('');if(remaining===0)break;
    }
    expect(remaining).toBe(0);expect(bytes(receipt)).toBe(16384);
    expect(validateObserved('replay-validation#/definitions/ObservedChoiceReceipt1',receipt,16384)).toEqual(receipt);
    receipt.preparationId=String(receipt.preparationId).replace('a','"');expect(bytes(receipt)).toBe(16385);
    // Independently demonstrate valid shape with a larger transport cap, then the unchanged receipt cap refusal.
    expect(validateObserved('replay-validation#/definitions/ObservedChoiceReceipt1',receipt,16385)).toEqual(receipt);
    expect(()=>boundedObserved(receipt,16384)).toThrow('LIMIT_EXCEEDED');
  });
  function growHistoricalPlan(w:ReturnType<typeof witness>,count:number):void{
    const original=required(w.questionPlan.plan.obligations[0]);
    for(let i=0;i<count;i++)w.questionPlan.plan.obligations.push({...structuredClone(original),stepId:`00000000-0000-4000-8000-${String(1000+i).padStart(12,'0')}`,obligationId:`00000000-0000-4000-8000-${String(2000+i).padStart(12,'0')}`,targetIntent:'é'.repeat(250)});
  }
  function trimTo(value:unknown,target:number,obligations:ChoiceBasis['translationPlan']['obligations']):void{
    let excess=bytes(value)-target;
    for(const ob of obligations){
      const available=Buffer.byteLength(ob.targetIntent)-1,remove=Math.min(excess,available);
      if(remove>0){const keep=Buffer.byteLength(ob.targetIntent)-remove;ob.targetIntent='é'.repeat(Math.floor(keep/2))+(keep%2?'a':'');excess-=remove;}
      if(excess===0)break;
    }
    expect(excess).toBe(0);expect(bytes(value)).toBe(target);
  }
  it('accepts exactly 262144 witness bytes and refuses one more, counting multibyte scalars',()=>{
    const b=choiceBasis(),w=witness(b);growHistoricalPlan(w,500);
    trimTo(w,262144,w.questionPlan.plan.obligations.slice(5));
    expect(validateObserved('replay-validation#/definitions/ObservedChoiceWitness1',w,262144)).toEqual(w);
    expect(canonicalObserved(w).length).toBeLessThan(262144);
    required(w.questionPlan.plan.obligations[5]).targetIntent+='a';
    expect(()=>boundedObserved(w,262144)).toThrow('LIMIT_EXCEEDED');
  });
  it('keeps the 6291456 basis ceiling separate inside a sub8388608 request with many bounded witnesses',()=>{
    const b=choiceBasis(),template=structuredClone(required(b.preparations[3]));growHistoricalPlan(required(template.observedChoice),80);
    b.preparations=Array.from({length:100},()=>structuredClone(template));
    const filler=b.preparations.flatMap(p=>required(p.observedChoice).questionPlan.plan.obligations.slice(5));
    trimTo(b,OBSERVED_LIMITS.basis,filler);
    for(const p of b.preparations)validateObserved('replay-validation#/definitions/ObservedChoiceWitness1',required(p.observedChoice),262144);
    // This is the structural composition gate; duplicate action associations deliberately do not claim a publishable 100-action session.
    expect(validateObserved('replay-validation#/definitions/ValidationBasis',b,OBSERVED_LIMITS.basis)).toEqual(b);
    const r={...request(),validationBasis:b,basisHash:hashObserved(b),artifact:observedChoice.artifact};
    expect(bytes(r)).toBeLessThan(OBSERVED_LIMITS.validation);
    required(filler[0]).targetIntent+='a';
    expect(()=>deriveObservedArtifact(b)).toThrow('LIMIT_EXCEEDED');
    expect(()=>validateObservedRequest({...r,basisHash:hashObserved(b)},build)).toThrow('LIMIT_EXCEEDED');
  });
  it.each([16384,65536,262144,6291456,8388608])('enforces exact and one-byte-over canonical cap %i',cap=>{
    const value={value:'é'.repeat(Math.floor((cap-12)/2))+'a'.repeat((cap-12)%2)};
    expect(boundedObserved(value,cap)).toBe(cap);value.value+='a';expect(()=>boundedObserved(value,cap)).toThrow('LIMIT_EXCEEDED');
  });
  it('counts the raw request envelope independently, including permitted JSON whitespace',()=>{
    const r={...request(),requiredBuild:{...build},validationBasis:observedChoice.basis,basisHash:hashObserved(observedChoice.basis),artifact:observedChoice.artifact};
    const json=canonicalObserved(r),remaining=OBSERVED_LIMITS.validation-Buffer.byteLength(json);
    const exact=Buffer.from(json+' '.repeat(remaining));expect(bytes(r)).toBeLessThan(OBSERVED_LIMITS.basis);
    expect(validateObservedRequest(parseObservedBytes(exact,OBSERVED_LIMITS.validation),build).ok).toBe(true);
    expect(()=>parseObservedBytes(Buffer.concat([exact,Buffer.from(' ')]),OBSERVED_LIMITS.validation)).toThrow('LIMIT_EXCEEDED');
  });
  it('accepts the lawful fully joined semantic 6291456-byte parent and refuses one legal byte before hashing',()=>{
    const parent=incrementalBoundaryFixture(),b=parent.basis,before=canonicalObserved(b);
    expect(parent.classification).toBe(BOUNDARY_CLASSIFICATION);
    expect(parent.construction.targetBytes).toBe(6291456);expect(bytes(b)).toBe(6291456);expect(canonicalObserved(b).length).toBeLessThan(6291456);
    expect(b.sourceSteps).toHaveLength(100);expect(b.actions).toHaveLength(100);expect(b.preparations).toHaveLength(100);expect(b.obligationAssociations).toHaveLength(100);expect(b.translationPlan.obligations).toHaveLength(100);
    for(const ids of [b.sourceSteps.map(s=>s.stepId),b.actions.map(a=>a.ledger.admission.admissionId),b.preparations.map(p=>p.preparationId),b.obligationAssociations.map(a=>a.obligationId),b.actions.map(a=>a.ledger.idempotencyKey)])expect(new Set(ids).size).toBe(100);
    expect(b.materializationEvidence.versions).toHaveLength(1);expect(b.materializationEvidence.entries).toHaveLength(1);expect(b.inputs).toHaveLength(1);
    expect(boundaryHash(parent.privateInputEnvelope)).toBe(b.authoredInputsHash);
    for(const collection of [b.allocations,b.producers,b.consumerEdges,b.bindings,b.transfers])expect(collection).toEqual([]);
    const inc=required(b.incrementalEvidence);expect(inc.plan.initialFirstLearnIndex).toBe(0);expect(inc.switch.reason).toBe('EMPTY_PREFIX');expect(inc.program.actions).toEqual([]);expect(inc.program.sourceStepIds).toEqual([]);expect(b.snapshotEvidence.baseProof).toBeNull();expect(b.snapshotEvidence.pinnedBase).not.toBeNull();
    const witnesses=b.preparations.flatMap(p=>p.observedChoice?[p.observedChoice]:[]);expect(witnesses).toHaveLength(99);
    for(const ids of [witnesses.map(w=>w.context.clarificationId),witnesses.map(w=>w.receipt.obligationId),witnesses.map(w=>w.attempt.attemptId),witnesses.map(w=>w.attempt.requestId)])expect(new Set(ids).size).toBe(99);
    for(const w of witnesses){
      expect(w.questionPlan.plan).toEqual(b.translationPlan);expect(w.meanings).toHaveLength(2);
      expect(w.context.questionCapture.executionEvidence.generation).toBeLessThan(required(b.preparations.find(p=>p.preparationId===w.receipt.preparationId)).executionEvidence.generation);
      for(const [value,cap]of [[w,262144],[w.context,65536],[w.meanings,65536],[w.receipt,16384]]as const)expect(boundedObserved(value,cap)).toBeLessThanOrEqual(cap);
      for(const choice of w.attempt.modelQuestion.choices)expect(Array.from(choice.safeLabel).length).toBeLessThanOrEqual(256);
    }
    expect(b.observations).toHaveLength(198);expect(new Set(b.observations.map(o=>o.observationHash)).size).toBe(198);
    for(const row of b.observations){expect(row.observation.nodes).toHaveLength(2);expect(boundedObserved(row.observation,32768)).toBeLessThanOrEqual(32768);}
    expect(b.observations.reduce((sum,row)=>sum+bytes(row.observation),0)).toBeLessThanOrEqual(1048576);
    expect(b.sourceSteps.reduce((sum,step)=>sum+Buffer.byteLength(step.source),0)).toBeLessThanOrEqual(1048576);
    for(const obligation of b.translationPlan.obligations)expect(Array.from(obligation.targetIntent).length).toBeLessThanOrEqual(500);
    expect(boundedObserved(parent.expectedArtifact,OBSERVED_LIMITS.artifact)).toBeLessThanOrEqual(OBSERVED_LIMITS.artifact);
    expect(boundedObserved(parent.expectedArtifact.replayPolicy,OBSERVED_LIMITS.policy)).toBeLessThanOrEqual(OBSERVED_LIMITS.policy);
    // The offered expected candidate was built from declared fixture facts before the subject runs.
    expect(deriveObservedArtifact(b)).toEqual({artifact:parent.expectedArtifact,hashes:parent.expectedHashes});
    const r={...request(),validationBasis:b,basisHash:boundaryHash(b),artifact:parent.expectedArtifact};
    expect(bytes(r)).toBeLessThan(OBSERVED_LIMITS.validation);expect(validateObservedRequest(r,build)).toMatchObject({ok:true,errorCode:null,artifactHash:parent.expectedHashes.artifactHash});
    const over=oneByteOverBoundary(b);expect(bytes(over)).toBe(6291457);
    const overWitness=required(required(over.preparations[1]).observedChoice);expect(Array.from(required(overWitness.attempt.modelQuestion.choices[0]).safeLabel).length).toBeLessThanOrEqual(256);
    // The shape remains closed and legal with the transport allowance; the component cap owns refusal.
    expect(validateObserved('replay-validation#/definitions/ValidationBasis',over,OBSERVED_LIMITS.validation)).toEqual(over);
    const overRequest={...r,validationBasis:over};expect(bytes(overRequest)).toBeLessThan(OBSERVED_LIMITS.validation);
    // Installed only after all module initialization and expected-fixture construction hashes.
    const hash=vi.spyOn(observedPolicy,'hashObserved');
    try{
      expect(validateObservedRequest(r,build).ok).toBe(true);expect(hash).toHaveBeenCalled();
      hash.mockClear();expect(()=>deriveObservedArtifact(over)).toThrow('LIMIT_EXCEEDED');expect(hash).not.toHaveBeenCalled();
      hash.mockClear();expect(()=>validateObservedRequest(overRequest,build)).toThrow('LIMIT_EXCEEDED');expect(hash).not.toHaveBeenCalled();
    }finally{hash.mockRestore();}
    expect(canonicalObserved(b)).toBe(before);
    // Harness capacity only: builds, hashes and validates two ~6 MiB bases (4.3 s idle, >5 s under load).
  },20000);
});
