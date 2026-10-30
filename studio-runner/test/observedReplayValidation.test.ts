import {currentReference} from './helpers/currentWorlds.js';
import type {ValidationBasis, Artifact3, Guard} from '../src/executor/observedOperations.js';
import type {TestDocument} from './helpers/publicationFixture.js';
import {publicationFixture} from './helpers/publicationFixture.js';
import controlFixture from '../fixtures/observed-reference/control-value-reference.json' with { type: 'json' };
import { describe, expect, it, vi } from 'vitest';
import * as observedPolicy from '../src/validator/observedReferencePolicy.js';
import {operationPreimage} from '../src/validator/operationPreimage.js';
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
        required(required(r.artifact.guards[1]).target.identity).role = 'button';
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
            (required(b.preparations[1]).proposal.target as { ref: string }).ref = 'e999';
        if (name === 'observation-node')
            required(Object.values(required(b.observations[0]).observation.facts)[0]).name = 'tampered fact';
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
      const ref=`e${String(4+i)}`,name=`Alternative field ${String(i)}`;
      old.observation.facts[ref]={role:'textbox',name,editable:true, nameComplete: true, ownTextComplete: true,evidence:name,evidenceSegments:[{field:'name',start:0,end:name.length}]};old.observation.outline+=`\n  - textbox "${name}" [${ref}]`;
      const meaning={...structuredClone(required(w.meanings[1]).meaning),ref};
      w.meanings.push({choiceId:`server-${String(i)}`,meaning,selection:{role:'textbox',name,evidence:name}});w.attempt.modelQuestion.choices.push({choiceId:`provider-extra-${String(i)}`,safeLabel:'Untrusted alternate',meaning:structuredClone(meaning)});w.context.question.choices.push({choiceId:`server-${String(i)}`,safeLabel:'Alternate field',labelSource:'PAGE',role:'textbox',region:null,bindingId:null});
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
  it.each(['provider-id','old-ambiguous','fresh-ambiguous','old-hidden','missing-old','unused-old','selection-name','selection-evidence','wrong-input','wrong-binding','extra-proof-key'] as const)('refuses independently joined %s despite coherent outer hashes',name=>{
    const b=choiceBasis(),w=witness(b),p=required(b.preparations[3]);
    const old=required(b.observations.find(o=>o.observationHash===w.context.questionCapture.observationHash));
    const fresh=required(b.observations.find(o=>o.observationHash===p.observationHash));
    if(name==='provider-id')required(w.attempt.modelQuestion.choices[1]).choiceId=required(w.attempt.modelQuestion.choices[0]).choiceId;
    const answerRef=required(w.meanings.find(m=>m.choiceId===w.acceptedChoiceId)).meaning.ref,duplicate=(page:typeof old.observation,ref:string)=>{const fact=structuredClone(required(page.facts[ref]));page.facts.e9=fact;page.outline+=`\n  - textbox "${fact.name}" [e9]`;};
    if(name==='old-ambiguous')duplicate(old.observation,answerRef);
    if(name==='fresh-ambiguous')duplicate(fresh.observation,(p.proposal.target.kind==='node'?p.proposal.target.ref:undefined)??'e3');
    if(name==='old-hidden'){const fact=required(old.observation.facts[answerRef]);Reflect.deleteProperty(old.observation.facts, answerRef);old.observation.outline=old.observation.outline.split('\n').filter(line=>!line.includes(`[${answerRef}]`)).join('\n');void fact;}
    if(name==='missing-old')b.observations=b.observations.filter(o=>o!==old);
    if(name==='unused-old'){const extra=structuredClone(old);extra.observation.documentId='unused';extra.observationHash=hashObserved(extra.observation);b.observations.push(extra);}
    if(name==='selection-name')required(w.meanings[1]).selection.name='different';
    if(name==='selection-evidence')required(w.meanings[1]).selection.evidence='different';
    if(name==='wrong-input')(p.proposal.operation as unknown as {value:unknown}).value={kind:'authoredLiteral',sourceInputId:'other'};
    if(name==='wrong-binding')(p.proposal.operation as unknown as {value:unknown}).value={kind:'binding',bindingId:'other'};
    if(name==='extra-proof-key')(w as unknown as Record<string,unknown>).unexpected='audit-data';
    const priorOld=old.observationHash,priorFresh=fresh.observationHash;
    old.observationHash=hashObserved(old.observation);fresh.observationHash=hashObserved(fresh.observation);
    w.context.questionCapture.observationHash=old.observationHash;w.context.questionCapture.executionEvidence.observationHash=old.observationHash;w.context.questionCapture.evidenceHash=hashObserved(w.context.questionCapture.executionEvidence);w.attempt.executionEvidence=structuredClone(w.context.questionCapture.executionEvidence);
    for(const prep of b.preparations){if(prep.observationHash===priorOld)prep.observationHash=old.observationHash;if(prep.observationHash===priorFresh){prep.observationHash=fresh.observationHash;prep.executionEvidence.observationHash=fresh.observationHash;prep.proposal.executionEvidence=structuredClone(prep.executionEvidence);prep.proposal.evidenceHash=hashObserved(prep.executionEvidence);prep.proof.evidenceHash=prep.proposal.evidenceHash;}}
    for(const [i,prep]of b.preparations.entries()){
      prep.proof.requestDigest=hashObserved(prep.proposal);const l=required(b.actions[i]).ledger;l.executionEvidence=structuredClone(prep.executionEvidence);l.evidenceHash=prep.proposal.evidenceHash;l.requestDigest=prep.proof.requestDigest;l.operationHash=hashObserved(operationPreimage(prep.proposal.coordinate,prep.executionEvidence.origin as string|null,prep.proof.target as Parameters<typeof operationPreimage>[2],prep.proposal.operation as Parameters<typeof operationPreimage>[3]));l.admission.policyDecisionHash=hashObserved({scopeHash:l.scopeHash,preparation:prep.proof,requestDigest:l.requestDigest});required(b.obligationAssociations[i]).proposalHash=l.requestDigest;
    }
    resealWitness(b);
    expect(()=>deriveObservedArtifact(b)).toThrow();
  });
  it('derives the manual artifact from old/fresh nodes and preserves original raw intent',()=>{
    const before=JSON.stringify(observedChoice.basis),derived=deriveObservedArtifact(observedChoice.basis);
    expect(derived).toEqual({artifact:observedChoice.artifact,hashes:observedChoice.hashes});expect(JSON.stringify(observedChoice.basis)).toBe(before);
    expect(required(observedChoice.basis.translationPlan.obligations[3]).targetIntent).toBe('label');expect(required(derived.artifact.guards[3]).target).toMatchObject({locator:[{by:'testId',value:'backup-label-é'}],tier:'testId'});
    expect(required(observedChoice.basis.preparations[3]).proposal.target).toMatchObject({kind:'node',ref:required(witness(observedChoice.basis).meanings.find(m=>m.choiceId===witness(observedChoice.basis).acceptedChoiceId)).meaning.ref});
  });
  it.each(['missing-proof','null-proof','wrong-preparation','wrong-accepted','wrong-answer-document','wrong-answer-binding','expired-answer','wrong-context','wrong-worker','wrong-scope','wrong-source','wrong-config','wrong-attempt','wrong-request','wrong-response-request','unaccepted-attempt','wrong-kind','wrong-plan-revision','wrong-plan-obligation','wrong-model-meaning','singleton','eleven','duplicate-meaning','duplicate-choice','reordered-map','wrong-old-node','wrong-old-selection','wrong-old-observation','stale-generation','unused-old-observation','wrong-fresh-target','extra-witness'] as const)('rejects coherently resealed %s',name=>{
    expect(deriveObservedArtifact(observedChoice.basis).artifact).toEqual(observedChoice.artifact);
    const b=choiceBasis(),p=required(b.preparations[3]),w=witness(b);
    if(name==='wrong-preparation')w.receipt.preparationId='different';
    if(name==='wrong-accepted'){w.acceptedChoiceId='choice-original';w.receipt.acceptedChoiceId='choice-original';w.receipt.answer.choiceId='choice-original';}
    if(name==='wrong-answer-document')w.receipt.answer.documentId='other-document';
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
    if(name==='wrong-model-meaning')required(w.attempt.modelQuestion.choices[1]).meaning.ref='e9';
    if(name==='singleton'){w.meanings.splice(0,1);w.context.question.choices.splice(0,1);w.attempt.modelQuestion.choices.splice(0,1);}
    if(name==='eleven')for(let i=0;i<9;i++){w.meanings.push(required(w.meanings[0]));w.context.question.choices.push(required(w.context.question.choices[0]));w.attempt.modelQuestion.choices.push(required(w.attempt.modelQuestion.choices[0]));}
    if(name==='duplicate-meaning'){required(w.meanings[0]).meaning=structuredClone(required(w.meanings[1]).meaning);required(w.attempt.modelQuestion.choices[0]).meaning=structuredClone(required(w.meanings[1]).meaning);}
    if(name==='duplicate-choice')required(w.meanings[0]).choiceId='choice-backup';
    if(name==='reordered-map')w.meanings.reverse();
    if(name==='wrong-old-node'){required(w.meanings[1]).meaning.ref='e9';required(w.attempt.modelQuestion.choices[1]).meaning.ref='e9';}
    if(name==='wrong-old-selection')required(w.meanings[1]).selection.name='different';
    if(name==='wrong-old-observation')w.context.questionCapture.observationHash='b'.repeat(64);
    if(name==='stale-generation')w.context.questionCapture.executionEvidence.generation=p.executionEvidence.generation;
    if(name==='unused-old-observation')b.observations.push(structuredClone(required(b.observations[3])));
    if(name==='wrong-fresh-target'&&p.proposal.target.kind==='node')p.proposal.target.ref='e2';
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
  it('accepts the largest shape-valid preparation receipt within 16384 bytes and refuses one byte less than its size',()=>{
    // With the node ids gone from the answer, the largest lawful receipt (every free string at its 256-scalar maximum) no longer reaches the cap;
    // the exact one-byte-over behaviour of the cap itself is the 'enforces exact and one-byte-over canonical cap' case below.
    const receipt=structuredClone(witness(observedChoice.basis).receipt) as unknown as Record<string,unknown>,answer=receipt.answer as Record<string,unknown>,coordinate=answer.coordinate as Record<string,unknown>;
    const fields:[Record<string,unknown>,string][]=[...['sessionId','preparationId','clarificationId','acceptedChoiceId'].map(k=>[receipt,k] as [Record<string,unknown>,string]),...['sessionId','clarificationId','documentId','choiceId','bindingId'].map(k=>[answer,k] as [Record<string,unknown>,string]),[coordinate,'stepId']];
    for(const [object,key]of fields)object[key]='\u0001'.repeat(256);
    coordinate.ordinal=7;answer.generation=2147483647;answer.sourceRevision='9223372036854775807';answer.configurationRevision='9223372036854775807';answer.resolvedAt='2026-10-08T03:00:05.123456789Z';
    const size=bytes(receipt);
    expect(size).toBeLessThanOrEqual(16384);
    expect(validateObserved('replay-validation#/definitions/ObservedChoiceReceipt1',receipt,16384)).toEqual(receipt);
    expect(boundedObserved(receipt,size)).toBe(size);
    expect(()=>boundedObserved(receipt,size-1)).toThrow('LIMIT_EXCEEDED');
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
    for(const row of b.observations){expect(Object.keys(row.observation.facts)).toHaveLength(2);expect(boundedObserved(row.observation,524288)).toBeLessThanOrEqual(524288);}
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

describe('the prepared target agrees with the fact the gates judged (GuidedPreparationCrossCheck, replayed independently)',()=>{
  /** Reseals everything the proof change touches, so only the cross-check can tell the mutation apart. */
  function mutateProof(change:(proof:TestDocument<ValidationBasis['preparations'][number]['proof']>,fact:{role:string;name:string})=>void):TestDocument<ValidationBasis>{
    const b:TestDocument<ValidationBasis>=structuredClone(fixture.basis);
    const index=b.preparations.findIndex(p=>p.proposal.target.kind==='node'),p=required(b.preparations[index]),l=required(b.actions[index]).ledger;
    const observed=required(b.observations.find(o=>o.observationHash===p.observationHash)),ref=(p.proposal.target as {ref:string}).ref,fact=required(observed.observation.facts[ref]);
    change(p.proof,fact);
    l.operationHash=hashObserved(operationPreimage(p.proposal.coordinate,p.executionEvidence.origin as string|null,p.proof.target as Parameters<typeof operationPreimage>[2],p.proposal.operation as Parameters<typeof operationPreimage>[3]));
    l.admission.policyDecisionHash=hashObserved({scopeHash:l.scopeHash,preparation:p.proof,requestDigest:l.requestDigest});
    return b;
  }
  it.each(['role','name'] as const)('refuses a prepared identity whose %s differs from the fact, even with every commitment resealed',field=>{
    const b=mutateProof((proof,fact)=>{const identity=required(proof.target).identity;if(field==='role')identity.role=fact.role==='button'?'link':'button';else identity.name=fact.name+' (other)';});
    expect(()=>deriveObservedArtifact(b)).toThrow('EVIDENCE_MISMATCH');
  });
  it('refuses a node proposal without a prepared target',()=>{
    expect(()=>deriveObservedArtifact(mutateProof(proof=>{proof.target=null;}))).toThrow('EVIDENCE_MISMATCH');
  });
  it('accepts a prepared identity name of null: the name is optional, the role is not',()=>{
    const b=mutateProof(proof=>{required(proof.target).identity.name=null;});
    expect(deriveObservedArtifact(b).artifact.guards.some(g=>g.target.kind==='element'&&g.target.identity.name===null)).toBe(true);
  });
});

/** Reseal all original public observation joins after a deliberate metadata mutation. */
function resealScopeObservations(b: TestDocument<ValidationBasis>): void {
  const replacements = new Map<string,string>();
  for (const row of b.observations) { const old = row.observationHash; row.observationHash = hashObserved(row.observation); replacements.set(old,row.observationHash); }
  for (const prep of b.preparations) {
    if (prep.observationHash !== null) prep.observationHash = replacements.get(prep.observationHash) ?? prep.observationHash;
    for (const evidence of [prep.executionEvidence,prep.proposal.executionEvidence]) if (evidence.kind === 'observedDocument') evidence.observationHash = replacements.get(required(evidence.observationHash)) ?? required(evidence.observationHash);
    prep.proposal.evidenceHash = hashObserved(prep.proposal.executionEvidence); prep.proof.evidenceHash = prep.proposal.evidenceHash; prep.proof.requestDigest = hashObserved(prep.proposal);
    if (prep.observedChoice) {
      const w = prep.observedChoice, capture = w.context.questionCapture;
      capture.observationHash = replacements.get(capture.observationHash) ?? capture.observationHash;
      if (capture.executionEvidence.kind === 'observedDocument') capture.executionEvidence.observationHash = replacements.get(required(capture.executionEvidence.observationHash)) ?? required(capture.executionEvidence.observationHash);
      capture.evidenceHash = hashObserved(capture.executionEvidence); w.attempt.executionEvidence = structuredClone(capture.executionEvidence);
      capture.modelQuestionHash = hashObserved(w.attempt.modelQuestion); w.receipt.contextIdentityHash = hashObserved(w.context); w.receipt.questionCaptureHash = hashObserved(capture); w.receipt.meaningsHash = hashObserved(w.meanings);
    }
    const action = b.actions.find(a => a.preparationId === prep.preparationId); if (!action) continue;
    action.ledger.executionEvidence = structuredClone(prep.proposal.executionEvidence); action.ledger.evidenceHash = prep.proposal.evidenceHash; action.ledger.requestDigest = prep.proof.requestDigest;
    action.ledger.admission.policyDecisionHash = hashObserved({scopeHash:action.ledger.scopeHash,preparation:prep.proof,requestDigest:prep.proof.requestDigest});
    const association = b.obligationAssociations.find(a => a.admissionId === action.ledger.admission.admissionId); if (association) association.proposalHash = prep.proof.requestDigest;
  }
  b.translationHash = hashObserved(b.translationPlan);
}
it('read scope provenance rejects coherent source ref and purpose mutations', () => {
  for (const mutation of ['self','dangling','effect-purpose'] as const) {
    const b = structuredClone(fixture.basis) as TestDocument<ValidationBasis>, prep = required(b.preparations.find(p => p.proposal.target.kind === 'node'));
    const row = required(b.observations.find(o => o.observationHash === prep.observationHash)), ref = (prep.proposal.target as {ref:string}).ref, fact = required(row.observation.facts[ref]);
    if (mutation === 'effect-purpose') fact.evidenceSegments = [{field:'ownText',start:0,end:fact.evidence.length,purpose:'READ_ASSERT_ONLY'}];
    else fact.readScope = {relation:'SAME_ROW_LABEL',sourceRefs:[mutation==='self'?ref:'e999999']};
    resealScopeObservations(b); expect(() => deriveObservedArtifact(b)).toThrow('EVIDENCE_MISMATCH');
  }
});
it('qualified scope rejects coherent source and fresh choice scope hash tampering', () => {
  const b = choiceBasis(), w = witness(b);
  for (const selection of w.meanings) selection.selection.scopeHash = 'f'.repeat(64);
  resealWitness(b); expect(() => deriveObservedArtifact(b)).toThrow('EVIDENCE_MISMATCH');
  const outside = structuredClone(fixture.basis) as TestDocument<ValidationBasis>;
  const action = required(outside.actions.find(a => required(outside.preparations.find(p=>p.preparationId===a.preparationId)).proposal.target.kind==='node'));
  required(outside.translationPlan.obligations.find(o=>o.obligationId===action.obligationId)).scopeIntent = 'Missing third workspace';
  outside.translationHash = hashObserved(outside.translationPlan);
  expect(() => deriveObservedArtifact(outside)).toThrow('EVIDENCE_MISMATCH');
});

it('frozen child locators reject coherently rehashed effect artifacts', () => {
  const artifact = structuredClone(fixture.artifact) as TestDocument<Artifact3>;
  const guard = required(artifact.guards.find(g => g.target.kind === 'element' && g.target.identity?.role === 'textbox'));
  if (guard.target.kind !== 'element') throw Error('ELEMENT');
  const element = guard.target as TestDocument<Extract<Guard['target'], { kind: 'element' }>>;
  const priorTarget = { locator: element.locator, tier: element.tier, identity: element.identity };
  const action = required(artifact.learnedPlan.actions.find(a => hashObserved(a.target) === hashObserved(priorTarget)));
  expect(action.operation.kind).toBe('fill');
  element.locator = [{ by: 'tag', tag: 'section' }, { by: 'filterHas', relation: 'child', has: [{ by: 'role', role: 'heading', name: 'Visible scope', exact: true }] }, { by: 'role', role: 'textbox', name: element.identity.name ?? 'Label', exact: true }];
  element.tier = 'filterHas';
  action.target = { locator: element.locator, tier: element.tier, identity: element.identity } as TestDocument<Artifact3['learnedPlan']['actions'][number]['target']>;
  action.operationHash = hashObserved(operationPreimage(action.coordinate, action.origin as Parameters<typeof operationPreimage>[1], action.target as Parameters<typeof operationPreimage>[2], action.operation as Parameters<typeof operationPreimage>[3]));
  artifact.learnedPlanHash = hashObserved(artifact.learnedPlan); artifact.replayPolicy.learnedPlanHash = artifact.learnedPlanHash;
  expect(() => validateReplayArtifact(artifact)).toThrow('OPERATION_MISMATCH');
});

describe('D6 immutable source assertion closure', () => {
  it.each(['receipt-only','wrong-prefix-mode'] as const)('rejects coherent prefix source metadata %s with receipt and switch hashes resealed', mutation => {
    const cases = (publicationFixture as unknown as { incrementalContracts: { basisCases: { name: string; basis: ValidationBasis }[] } }).incrementalContracts.basisCases;
    const original = required(cases.find(row => row.name === 'preAdmissionDrift')).basis;
    expect(() => deriveObservedArtifact(original)).not.toThrow();
    const b = structuredClone(original) as TestDocument<ValidationBasis>, incremental = required(b.incrementalEvidence), receipt = required(incremental.driftReceipt);
    const request = required(incremental.prefixRequests.find(request => hashObserved(request) === receipt.requestDigest));
    receipt.assertSourceBinding = { bindingId: 'binding-reference', producerAdmissionId: 'admission-1', producerPreparationId: 'preparation-1' };
    if (mutation === 'wrong-prefix-mode') { request.assertSourceBinding = structuredClone(receipt.assertSourceBinding); receipt.requestDigest = hashObserved(request); }
    const body = Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'receiptHash'));
    receipt.receiptHash = hashObserved(body); incremental.switch.driftReceiptHash = receipt.receiptHash;
    expect(() => deriveObservedArtifact(b)).toThrow('EVIDENCE_MISMATCH');
  });
  const reseal = (basis: TestDocument<ValidationBasis>): void => {
    resealScopeObservations(basis);
    for (const action of basis.actions) {
      const prep = required(basis.preparations.find(prep => prep.preparationId === action.preparationId));
      action.ledger.operationHash = hashObserved(operationPreimage(prep.proposal.coordinate, prep.executionEvidence.origin as string | null,
        prep.proof.target as Parameters<typeof operationPreimage>[2], prep.proposal.operation as Parameters<typeof operationPreimage>[3]));
    }
  };
  const sourceBasis = (): TestDocument<ValidationBasis> => {
    const b = structuredClone(fixture.basis) as TestDocument<ValidationBasis>;
    const consumer = required(b.preparations.at(-1)), read = required(b.preparations.find(prep => prep.proposal.operation.kind === 'read'));
    const originalTarget = required(read.proposal.target);
    consumer.proposal.target = { kind: 'node', ref: required(originalTarget.ref), documentId: originalTarget.documentId, generation: consumer.proposal.generation };
    consumer.proposal.operation = { kind: 'assert', predicate: 'containsText', expected: { kind: 'binding', bindingId: 'binding-reference' } };
    consumer.proof.target = { ...structuredClone(required(read.proof.target)), assertTextMode: 'READ_BINDING_SOURCE' };
    consumer.proof.assertSourceBinding = { bindingId: 'binding-reference', producerAdmissionId: 'admission-1', producerPreparationId: read.preparationId };
    const action = required(b.actions.find(action => action.preparationId === consumer.preparationId));
    const obligation = required(b.translationPlan.obligations.find(obligation => obligation.obligationId === action.obligationId));
    obligation.targetIntent = 'reference'; obligation.predicate = 'containsText';
    reseal(b); return b;
  };
  it('preserves the exact source comparator into learned and frozen targets', () => {
    const { artifact } = deriveObservedArtifact(sourceBasis());
    expect(artifact.learnedPlan.actions.at(-1)?.target?.assertTextMode).toBe('READ_BINDING_SOURCE');
    expect(artifact.guards.at(-1)?.target).toMatchObject({ kind: 'element', assertTextMode: 'READ_BINDING_SOURCE' });
    expect(validateReplayArtifact(artifact)).toEqual(artifact);
  });
  it.each(['page', 'the page', 'page content', 'version number'])('accepts the generic target intent "%s" for an assert bound to its read source', intent => {
    const b = sourceBasis(), consumer = required(b.preparations.at(-1));
    const action = required(b.actions.find(action => action.preparationId === consumer.preparationId));
    required(b.translationPlan.obligations.find(obligation => obligation.obligationId === action.obligationId)).targetIntent = intent;
    reseal(b);
    expect(() => deriveObservedArtifact(b)).not.toThrow();
  });
  it('still refuses an unrelated target intent for an assert bound to its read source', () => {
    const b = sourceBasis(), consumer = required(b.preparations.at(-1));
    const action = required(b.actions.find(action => action.preparationId === consumer.preparationId));
    required(b.translationPlan.obligations.find(obligation => obligation.obligationId === action.obligationId)).targetIntent = 'page of zebras';
    reseal(b);
    expect(() => deriveObservedArtifact(b)).toThrow('REFERENCE_MISMATCH');
  });
  const receiverAfterNavigation = (explicitSourceMode: boolean): TestDocument<ValidationBasis> => {
    const b = sourceBasis(), consumer = required(b.preparations.at(-1));
    const row = required(b.observations.find(row => row.observationHash === consumer.observationHash));
    row.observation.documentId = 'named-receiver-document';
    consumer.proposal.target.documentId = row.observation.documentId;
    consumer.proposal.executionEvidence.documentId = row.observation.documentId;
    consumer.executionEvidence.documentId = row.observation.documentId;
    required(b.actions.find(action => action.preparationId === consumer.preparationId)).ledger.documentId = row.observation.documentId;
    // The same e-ref spelling names a different document's public named receiver; its
    // body is withheld. Ref spelling or missing text cannot manufacture source authority.
    delete required(row.observation.facts.e1).text;
    if (!explicitSourceMode) { delete required(consumer.proof.target).assertTextMode; delete consumer.proof.assertSourceBinding; }
    reseal(b); return b;
  };
  it('keeps an ordinary named receiver after navigation when its e-ref collides and body is withheld', () => {
    const { artifact } = deriveObservedArtifact(receiverAfterNavigation(false));
    expect(artifact.learnedPlan.actions.at(-1)?.target?.assertTextMode).toBeUndefined();
    expect(validateReplayArtifact(artifact)).toEqual(artifact);
  });
  it('rejects explicitly supplied source authority for the same ref in a foreign document', () => {
    expect(() => deriveObservedArtifact(receiverAfterNavigation(true))).toThrow('REFERENCE_MISMATCH');
  });
  it.each(['mode','proof','both','producer','preparation','binding','foreign-target','wrong-predicate'] as const)('rejects coherently rehashed source assertion %s substitution', mutation => {
    const b = sourceBasis(), consumer = required(b.preparations.at(-1)), target = required(consumer.proof.target), source = required(consumer.proof.assertSourceBinding);
    if (mutation === 'mode' || mutation === 'both') delete target.assertTextMode;
    if (mutation === 'proof' || mutation === 'both') delete consumer.proof.assertSourceBinding;
    if (mutation === 'producer') source.producerAdmissionId = 'admission-2';
    if (mutation === 'preparation') source.producerPreparationId = 'preparation-2';
    if (mutation === 'binding') source.bindingId = 'foreign-binding';
    if (mutation === 'foreign-target') consumer.proposal.target.ref = 'e2';
    if (mutation === 'wrong-predicate') consumer.proposal.operation.predicate = 'hasValue';
    reseal(b);
    expect(() => deriveObservedArtifact(b)).toThrow();
  });
});
