import { describe, expect, it } from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {negativeBoundaries,assertExactNegativeMutation,validateSyntheticDeclaredAuthority,SYNTHETIC_AUTHORITY_SCOPE} from './helpers/incrementalNegativeBoundaries.js';
import type {NegativeSection,NegativeCase} from './helpers/incrementalNegativeBoundaries.js';
import {publicationFixture} from './helpers/publicationFixture.js';
import {parseDocumentJson} from './helpers/documentJson.js';
interface Case extends NegativeCase {expected:string;basis:ValidationBasis;expectedArtifact:Artifact3}
interface CanonicalVector {name:string;input:unknown;canonical:string;canonicalUtf8Hex:string;sha256:string}
interface Fixture {basis:ValidationBasis;artifact:Artifact3;snapshotCorrection:{positives:Case[];negatives:Case[];normalization:{identity:ValidationBasis['snapshotEvidence']['current']};underdeterminationCounterexample:{oldBasis:Record<string,unknown>;equalBeforeCorrection:boolean;identityA:ValidationBasis['snapshotEvidence']['current'];identityB:ValidationBasis['snapshotEvidence']['current'];snapshotMapA:unknown;snapshotMapB:unknown}};graphTimingConformance:{graphCases:Case[]};incrementalContracts:{basisCases:Case[];canonicalVectors:CanonicalVector[]}}
const fixtures=parseDocumentJson(readFileSync(new URL('../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json',import.meta.url)),33554432) as Fixture;
import { deriveObservedArtifact,validateObservedRequest } from '../src/validator/observedReplay.js';
import { deriveSnapshotMaps, inputChains, stepSnapshots } from '../src/validator/observedSnapshots.js';
import { validateMaterializationHistory, validateIncrementalHistory, effectiveGraph } from '../src/validator/observedHistory.js';
import { validateObserved,hashObserved,canonicalObserved,OBSERVED_SCHEMA_BUNDLE_HASH,OBSERVED_PROFILE,ObservedRefusal } from '../src/validator/observedReferencePolicy.js';
import type { Artifact3, ValidationBasis } from '../src/executor/observedOperations.js';
import type {TestDocument} from './helpers/publicationFixture.js';
const basis = (raw: unknown): ValidationBasis => validateObserved<ValidationBasis>('replay-validation#/definitions/ValidationBasis',raw);
const build={...publicationFixture.build,schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH};
const request=(row:NegativeCase)=>({...publicationFixture.validationRequest,requiredBuild:build,requiredProfile:OBSERVED_PROFILE,validationBasis:row.basis,basisHash:hashObserved(row.basis),artifact:row.expectedArtifact});
const rows=(section:NegativeSection)=>section==='snapshot'?[...fixtures.snapshotCorrection.positives,...fixtures.snapshotCorrection.negatives]:section==='graph'?fixtures.graphTimingConformance.graphCases:fixtures.incrementalContracts.basisCases;
function rejectsAtOriginalBoundary(row:Case,section:NegativeSection):void {
  const boundary=negativeBoundaries.find(item=>item.section===section&&item.name===row.name);
  if(!boundary){expect(()=>deriveObservedArtifact(row.basis)).toThrow();return;}
  const parent=rows(section).find(item=>item.name===boundary.parent);if(!parent)throw Error('DECLARED_PARENT_MISSING');
  // The complete unmodified parent must pass the real derivation and request boundary first.
  expect(deriveObservedArtifact(parent.basis).artifact).toEqual(parent.expectedArtifact);
  expect(validateObservedRequest(request(parent),build)).toMatchObject({ok:true,errorCode:null});
  const maliciousBytes=JSON.stringify(row);assertExactNegativeMutation(parent,row,boundary);
  if(boundary.route==='OFFERED_CANDIDATE_REQUEST_VALIDATION'){
    expect(row.basis).toEqual(parent.basis);
    // Keep the exact malicious offered artifact, including its original partial resealing.
    const outcome=(()=>{try{return {verdict:validateObservedRequest(request(row),build)};}catch(error){return {error};}})();
    if('error'in outcome){expect(outcome.error).toBeInstanceOf(ObservedRefusal);expect(outcome.error).toMatchObject({code:'INVALID_CONTRACT'});}
    else expect(outcome.verdict).toMatchObject({ok:false,errorCode:'OPERATION_MISMATCH'});
  }else if(boundary.route==='PUBLIC_MINIMUM_ADMITTED_GRAPH_JOIN_PLUS_EXTERNAL_EXACT_HISTORY'){
    expect(()=>effectiveGraph(basis(parent.basis))).not.toThrow();
    expect(()=>effectiveGraph(basis(row.basis))).toThrow('REFERENCE_MISMATCH');
    expect(()=>deriveObservedArtifact(row.basis)).toThrow('REFERENCE_MISMATCH');
  }else{
    // Explicit synthetic declaration checks consume the changed private sidecar/preimage.
    // They do not authenticate a token/connection/owner or query immutable database history.
    expect(SYNTHETIC_AUTHORITY_SCOPE).toBe('SYNTHETIC_DECLARED_FACTS_ONLY_NO_DB_JWT_MTLS_OR_LIVE_OWNER_PROOF');
    expect(boundary.actualBackendStatus).toBe('UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE');expect(boundary.requiredBackendCompanion.length).toBeGreaterThan(0);
    expect(()=>{validateSyntheticDeclaredAuthority(parent,section);}).not.toThrow();
    expect(()=>{validateSyntheticDeclaredAuthority(row,section);}).toThrow(row.expected==='REJECT'?undefined:row.expected);
    // The public basis lacks the authority mutated here; pure success is not authorization.
    expect(()=>deriveObservedArtifact(row.basis)).not.toThrow();
  }
  expect(JSON.stringify(row)).toBe(maliciousBytes);
}
describe('independent complete incremental publication reconstruction',()=>{
  for(const row of fixtures.snapshotCorrection.positives)it(row.name,()=>{
    const actual=deriveObservedArtifact(row.basis);expect(actual.artifact).toEqual(row.expectedArtifact);
  });
  for(const row of fixtures.snapshotCorrection.negatives)it(`rejects snapshot authority ${row.name}`,()=>{
    rejectsAtOriginalBoundary(row,'snapshot');
  });
  for(const row of fixtures.graphTimingConformance.graphCases)it(`${row.expected}: ${row.name}`,()=>{
    if(row.expected==='ACCEPT')expect(deriveObservedArtifact(row.basis).artifact).toEqual(row.expectedArtifact);
    else rejectsAtOriginalBoundary(row,'graph');
  });
  for(const row of fixtures.incrementalContracts.basisCases)it(`${row.expected}: ${row.name}`,()=>{
    if(row.expected==='VALID')expect(deriveObservedArtifact(row.basis).artifact).toEqual(row.expectedArtifact);
    else rejectsAtOriginalBoundary(row,'incrementalBasis');
  });
  it('current snapshot maps derive independently of a candidate artifact claim',()=>{
    const b=basis(fixtures.basis), maps=deriveSnapshotMaps(b,fixtures.artifact.learnedPlan as unknown as Parameters<typeof deriveSnapshotMaps>[1]);
    expect(maps.stepSnapshotHashes).toEqual(fixtures.artifact.learnedPlan.stepSnapshotHashes);
    const changed=structuredClone(b.snapshotEvidence.current);
    const forged={...changed,authoring:{...changed.authoring,globalContext:{entries:[{kind:'text' as const,value:'changed private global context'}],evidenceReferences:[]}}};
    expect(inputChains(forged,b.configuration)).not.toEqual(inputChains(changed,b.configuration));
  });
  it('does not reconstruct private input document hashes from metadata with absent values',()=>{
    const b=basis(fixtures.basis);expect(b.materializationEvidence.entries.every(e=>!('value'in e.metadata))).toBe(true);
    expect(()=>{validateMaterializationHistory(b);}).not.toThrow();
  });
  it('raw graph projection leaves original intent and full evidence byte-identical',()=>{
    const positive=fixtures.graphTimingConformance.graphCases.find(row=>row.expected==='ACCEPT');expect(positive).toBeDefined();
    expect(negativeBoundaries).toHaveLength(29);
    for(const [route,count]of [['OFFERED_CANDIDATE_REQUEST_VALIDATION',12],['PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY',15],['PUBLIC_MINIMUM_ADMITTED_GRAPH_JOIN_PLUS_EXTERNAL_EXACT_HISTORY',2]]as const)expect(negativeBoundaries.filter(item=>item.route===route)).toHaveLength(count);
    for(const boundary of negativeBoundaries)expect(rows(boundary.section).filter(row=>row.name===boundary.name)).toHaveLength(1);
    const b=basis(positive?.basis), before=JSON.stringify(b);validateIncrementalHistory(b);effectiveGraph(b);expect(JSON.stringify(b)).toBe(before);
  });
});

// Independent expected preimages: no lowerer/policy output supplies an expected hash.
function expectedCanonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(expectedCanonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+expectedCanonical((value as Record<string,unknown>)[key])).join(',')+'}';
  return JSON.stringify(value);
}
const expectedHash=(value:unknown)=>createHash('sha256').update(expectedCanonical(value),'utf8').digest('hex');
const evidencePreimage=(b:ValidationBasis)=>({version:1,basisHash:expectedHash(b),runAuthorizationHash:expectedHash(b.runAuthorization),translationHash:b.translationHash,bootstrapHash:expectedHash(b.bootstrap),sourceManifestHash:b.sourceManifestHash});
const admissionTuples=(b:ValidationBasis)=>b.actions.map(({ledger:l})=>({coordinate:l.coordinate,admission:l.admission,operationHash:l.operationHash,scopeHash:l.scopeHash}));
function required<T>(value:T|null|undefined):T {if(value===null||value===undefined)throw Error('MISSING_FIXED_FACT');return value;}
function record(value:unknown):Record<string,unknown> {if(value===null||typeof value!=='object')throw Error('MISSING_FIXED_OBJECT');return value as Record<string,unknown>;}
function commitmentLeaves(value:unknown,path:string,out:string[]):void {
  if(Array.isArray(value)&&value.length)value.forEach((child,index)=>{commitmentLeaves(child,path+'/'+String(index),out);});
  else if(value!==null&&typeof value==='object'&&Object.keys(value).length)for(const [key,child]of Object.entries(value))commitmentLeaves(child,path+'/'+key.replaceAll('~','~0').replaceAll('/','~1'),out);
  else out.push(path);
}
function mutateLeaf(root:unknown,path:string):void {
  const parts=path.split('/').slice(1).map(part=>part.replaceAll('~1','/').replaceAll('~0','~'));
  const key=required(parts.pop());let parent=root;for(const part of parts)parent=record(parent)[part];
  const object=record(parent),old=object[key];
  // Null/empty containers and constant lexemes are commitment-only shape negatives.
  object[key]=typeof old==='string'?(old.length?(old.startsWith('a')?'b':'a')+old.slice(1):'changed'):typeof old==='number'?old+1:typeof old==='boolean'?!old:old===null?'changed-null':null;
}
function fullReseal(offered:Artifact3):TestDocument<Artifact3> {
  const artifact=structuredClone(offered) as TestDocument<Artifact3>;
  artifact.learnedPlanHash=expectedHash(artifact.learnedPlan);artifact.replayPolicy.learnedPlanHash=artifact.learnedPlanHash;
  return artifact;
}
describe('remaining original incremental basis commitments',()=>{
  it('old basis cannot distinguish unused step2 context',()=>{
    const counter=fixtures.snapshotCorrection.underdeterminationCounterexample,before=expectedCanonical(counter);
    expect(counter.equalBeforeCorrection).toBe(true);expect(counter.oldBasis).not.toHaveProperty('snapshotEvidence');
    const other=structuredClone(counter.identityB) as TestDocument<typeof counter.identityB>;
    required(other.authoring.steps[1]).context=structuredClone(required(counter.identityA.authoring.steps[1]).context) as TestDocument<ValidationBasis['snapshotEvidence']['current']['authoring']['steps'][number]['context']>;
    expect(other).toEqual(counter.identityA);
    expect(required(required(counter.identityB.authoring.steps[1]).context.entries[0])).toEqual({kind:'text',value:'A distinct unused authored hint'});
    const parent=required(fixtures.snapshotCorrection.positives.find(row=>row.name==='ordinary'));
    expect(deriveObservedArtifact(parent.basis).artifact).toEqual(parent.expectedArtifact);
    expect(validateObservedRequest(request(parent),build).ok).toBe(true);
    for(const [identity,map]of [[counter.identityA,counter.snapshotMapA],[counter.identityB,counter.snapshotMapB]]as const){
      const current=structuredClone(parent.basis) as TestDocument<ValidationBasis>;current.snapshotEvidence.current=structuredClone(identity) as TestDocument<typeof identity>;
      const old=structuredClone(current) as Record<string,unknown>;delete old.snapshotEvidence;old.sourceManifestHash=counter.oldBasis.sourceManifestHash;
      expect(old).toEqual(counter.oldBasis);
      const original=expectedCanonical(current);
      expect(stepSnapshots(identity,parent.basis.configuration,parent.expectedArtifact.learnedPlan)).toEqual(map);
      expect(deriveSnapshotMaps(current as ValidationBasis,parent.expectedArtifact.learnedPlan).stepSnapshotHashes).toEqual(map);
      expect(expectedCanonical(current)).toBe(original);
    }
    for(const [index,step]of counter.identityA.authoring.steps.entries()){
      if(index===0)expect(record(counter.snapshotMapA)[step.id]).toBe(record(counter.snapshotMapB)[step.id]);
      else expect(record(counter.snapshotMapA)[step.id]).not.toBe(record(counter.snapshotMapB)[step.id]);
    }
    expect(expectedCanonical(counter)).toBe(before);
  });
  it.each(['numeric-captured-at','lone-surrogate-context','unsafe-evidence-revision']as const)('normalized snapshot source refuses malformed metadata %s',name=>{
    const identity=fixtures.snapshotCorrection.normalization.identity,before=JSON.stringify(identity);
    expect(validateObserved('authoring-snapshot#/definitions/AuthoringSnapshotIdentity',identity)).toEqual(identity);
    const parent=required(fixtures.snapshotCorrection.positives.find(row=>row.name==='ordinary'));
    const current=structuredClone(parent.basis) as TestDocument<ValidationBasis>;current.snapshotEvidence.current=structuredClone(identity) as TestDocument<typeof identity>;
    expect(()=>deriveSnapshotMaps(current as ValidationBasis,parent.expectedArtifact.learnedPlan)).not.toThrow();
    const malformed=structuredClone(identity),second=record(record(required(malformed.authoring.steps[1]).context.evidenceReferences[0]));
    if(name==='numeric-captured-at')second.capturedAt=1792036800;
    if(name==='unsafe-evidence-revision')second.revision=9007199254740992;
    if(name==='lone-surrogate-context')record(required(required(malformed.authoring.steps[2]).context.entries[1])).value='\uD800';
    const malformedBefore=JSON.stringify(malformed);
    expect(()=>validateObserved('authoring-snapshot#/definitions/AuthoringSnapshotIdentity',malformed)).toThrow('INVALID_CONTRACT');
    current.snapshotEvidence.current=malformed as TestDocument<typeof identity>;
    expect(()=>deriveObservedArtifact(current)).toThrow('INVALID_CONTRACT');
    expect(JSON.stringify(malformed)).toBe(malformedBefore);expect(JSON.stringify(identity)).toBe(before);
  });
  it('commits each of 537 original complete-basis leaves through the unchanged six-field envelope',()=>{
    let total=0;
    for(const [index,parent]of fixtures.incrementalContracts.basisCases.slice(0,3).entries()){
      const b=parent.basis,before=expectedCanonical(b),derived=deriveObservedArtifact(b);
      expect(derived.artifact).toEqual(parent.expectedArtifact);expect(validateObservedRequest(request(parent),build).ok).toBe(true);
      const paths:string[]=[];
      for(const root of ['snapshotEvidence/current','materializationEvidence/versions','materializationEvidence/entries']){
        const [one,two]=root.split('/');commitmentLeaves(record(record(b)[required(one)])[required(two)],'/'+root,paths);
      }
      if(b.incrementalEvidence)for(const key of ['plan','program','switch','prefixRequests','driftReceipt','firstSuffixAcceptance','excludedAttempts']as const)commitmentLeaves(b.incrementalEvidence[key],'/incrementalEvidence/'+key,paths);
      expect(new Set(paths).size).toBe(paths.length);expect(paths).toHaveLength(required([79,173,285][index]));
      const envelope=evidencePreimage(b),tuples=admissionTuples(b);
      expect(expectedHash(envelope)).toBe(parent.expectedArtifact.replayPolicy.publicationEvidenceHash);
      for(const path of paths){
        const changed=structuredClone(b);mutateLeaf(changed,path);const next=evidencePreimage(changed),original=expectedCanonical(changed);
        expect(expectedHash(changed),parent.name+path).not.toBe(expectedHash(b));
        expect(hashObserved(changed),parent.name+path).toBe(expectedHash(changed));
        expect(Object.keys(next).sort()).toEqual(['basisHash','bootstrapHash','runAuthorizationHash','sourceManifestHash','translationHash','version']);
        expect(next.version).toBe(1);expect(expectedHash(next),parent.name+path).not.toBe(expectedHash(envelope));
        expect(hashObserved(next),parent.name+path).toBe(expectedHash(next));
        expect(admissionTuples(changed)).toEqual(tuples);expect(expectedCanonical(changed)).toBe(original);
      }
      expect(expectedCanonical(b)).toBe(before);total+=paths.length;
    }
    expect(total).toBe(537);
  },20000);
  it.each([0,1,2])('keeps whole-basis, six-field evidence, effective tuple array and final-plan domains distinct for parent %i',index=>{
    const parent=required(fixtures.incrementalContracts.basisCases[index]),b=parent.basis,before=expectedCanonical(b),artifact=parent.expectedArtifact;
    const actual=deriveObservedArtifact(b);expect(actual.artifact).toEqual(artifact);
    const tuples=admissionTuples(b),vector=required(fixtures.incrementalContracts.canonicalVectors[26]);
    expect(vector.name).toBe('effective-admission-provenance-array');expect(tuples).toEqual(vector.input);
    expect(expectedCanonical(tuples)).toBe(vector.canonical);expect(Buffer.from(expectedCanonical(tuples)).toString('hex')).toBe(vector.canonicalUtf8Hex);
    expect(expectedHash(tuples)).toBe(vector.sha256);expect(actual.hashes.admissionProvenanceHash).toBe(vector.sha256);
    expect(expectedHash({admissions:tuples})).not.toBe(vector.sha256);
    for(const key of ['coordinate','admission','operationHash','scopeHash']){
      const incomplete=structuredClone(tuples);Reflect.deleteProperty(required(incomplete[0]),key);expect(expectedHash(incomplete)).not.toBe(vector.sha256);
    }
    const envelope=evidencePreimage(b);expect(actual.hashes.publicationEvidenceHash).toBe(expectedHash(envelope));
    expect(expectedHash({publicationEvidence:envelope})).not.toBe(expectedHash(envelope));expect(expectedHash({...envelope,version:2})).not.toBe(expectedHash(envelope));
    for(const key of Object.keys(envelope)){const missing=record(structuredClone(envelope));Reflect.deleteProperty(missing,key);expect(expectedHash(missing)).not.toBe(expectedHash(envelope));}
    if(index<2){
      const basisVector=required(fixtures.incrementalContracts.canonicalVectors[index===0?24:27]),evidenceVector=required(fixtures.incrementalContracts.canonicalVectors[index===0?25:28]);
      expect(b).toEqual(basisVector.input);expect(expectedCanonical(b)).toBe(basisVector.canonical);expect(expectedHash(b)).toBe(basisVector.sha256);
      expect(expectedHash({basis:b})).not.toBe(basisVector.sha256);
      expect(envelope).toEqual(evidenceVector.input);expect(expectedCanonical(envelope)).toBe(evidenceVector.canonical);expect(expectedHash(envelope)).toBe(evidenceVector.sha256);
      expect(Buffer.from(expectedCanonical(envelope)).toString('hex')).toBe(evidenceVector.canonicalUtf8Hex);
    }
    expect(actual.hashes.learnedPlanHash).toBe(expectedHash(artifact.learnedPlan));expect(actual.artifact.replayPolicy.learnedPlanHash).toBe(expectedHash(artifact.learnedPlan));
    for(const key of ['stepSnapshotHashes','reusedFrom','incremental']){const premature=record(structuredClone(artifact.learnedPlan));Reflect.deleteProperty(premature,key);expect(expectedHash(premature)).not.toBe(actual.hashes.learnedPlanHash);}
    if(b.incrementalEvidence?.excludedAttempts.length){
      const excluded=required(b.incrementalEvidence.excludedAttempts[0]).action.ledger;
      expect(excluded.admission.admissionId).toBe('admission-spent');expect(expectedCanonical(tuples)).not.toContain('admission-spent');
      expect(expectedHash([...tuples,{coordinate:excluded.coordinate,admission:excluded.admission,operationHash:excluded.operationHash,scopeHash:excluded.scopeHash}])).not.toBe(vector.sha256);
      const erased=structuredClone(b) as TestDocument<ValidationBasis>;required(erased.incrementalEvidence).excludedAttempts=[];
      expect(expectedHash(erased)).not.toBe(expectedHash(b));expect(admissionTuples(erased as ValidationBasis)).toEqual(tuples);
    }
    expect(expectedCanonical(b)).toBe(before);
  });
  it.each(['materialization-version','materialization-entry','prefix-program','relearn-switch','prefix-request','drift-receipt','first-suffix-acceptance','excluded-attempt']as const)('recomputed basis/evidence commitments cannot bypass semantic join %s',name=>{
    const parent=required(fixtures.incrementalContracts.basisCases.find(row=>row.name==='admittedDrift')),b=parent.basis;
    expect(deriveObservedArtifact(b).artifact).toEqual(parent.expectedArtifact);expect(validateObservedRequest(request(parent),build).ok).toBe(true);
    const changed=structuredClone(b) as TestDocument<ValidationBasis>,inc=required(changed.incrementalEvidence);
    if(name==='materialization-version')required(changed.materializationEvidence.versions[0]).authoredInputsHash='f'.repeat(64);
    if(name==='materialization-entry')required(changed.materializationEvidence.entries[0]).inputId='foreign-input';
    if(name==='prefix-program')required(inc.program.actions[0]).operationHash='f'.repeat(64);
    if(name==='relearn-switch')inc.switch.retainedPrefixAdmissionsHash='f'.repeat(64);
    if(name==='prefix-request')required(inc.prefixRequests[0]).evidenceHash='f'.repeat(64);
    if(name==='drift-receipt')required(inc.driftReceipt).operationHash='f'.repeat(64);
    if(name==='first-suffix-acceptance')inc.firstSuffixAcceptance.planRevision=3;
    if(name==='excluded-attempt')required(inc.excludedAttempts[0]).action.ledger.operationHash='f'.repeat(64);
    expect(expectedHash(changed)).not.toBe(expectedHash(b));expect(expectedHash(evidencePreimage(changed as ValidationBasis))).not.toBe(expectedHash(evidencePreimage(b)));
    expect(admissionTuples(changed as ValidationBasis)).toEqual(admissionTuples(b));
    const offered=fullReseal(parent.expectedArtifact);offered.replayPolicy.publicationEvidenceHash=expectedHash(evidencePreimage(changed as ValidationBasis));
    const r={...request(parent),validationBasis:changed,basisHash:expectedHash(changed),artifact:offered},before=expectedCanonical(r);
    expect(()=>validateObservedRequest(r,build)).toThrow('EVIDENCE_MISMATCH');expect(expectedCanonical(r)).toBe(before);
  });
  for(const boundary of negativeBoundaries.filter(item=>item.route==='OFFERED_CANDIDATE_REQUEST_VALIDATION'))it('fully resealed offered candidate still refuses '+boundary.name,()=>{
    const parent=required(rows(boundary.section).find(row=>row.name===boundary.parent)),original=required(rows(boundary.section).find(row=>row.name===boundary.name));
    expect(deriveObservedArtifact(parent.basis).artifact).toEqual(parent.expectedArtifact);expect(validateObservedRequest(request(parent),build).ok).toBe(true);
    const frozen=expectedCanonical(original);assertExactNegativeMutation(parent,original,boundary);
    const offered=fullReseal(original.expectedArtifact),r={...request(parent),artifact:offered,basisHash:expectedHash(parent.basis)};
    expect(offered.learnedPlanHash).toBe(expectedHash(offered.learnedPlan));expect(offered.replayPolicy.learnedPlanHash).toBe(offered.learnedPlanHash);
    // All candidate-side hashes present in the real request are now coherent; basis authority stays independent.
    expect(canonicalObserved(r)).toBe(expectedCanonical(r));
    expect(validateObservedRequest(r,build)).toMatchObject({ok:false,errorCode:'OPERATION_MISMATCH'});expect(expectedCanonical(original)).toBe(frozen);
  });
  it.each(['admittedDrift','preAdmissionDrift'])('uses the chosen current-prefix basis at drift j and refuses reuse at j for %s',name=>{
    const parent=required(fixtures.incrementalContracts.basisCases.find(row=>row.name===name)),b=parent.basis,inc=required(b.incrementalEvidence),pin=required(b.snapshotEvidence.pinnedBase);
    const before=expectedCanonical(parent),j=inc.switch.effectiveFirstLearnIndex,jId=required(b.sourceSteps[j]).stepId;
    expect(inc.plan.initialFirstLearnIndex).toBe(2);expect(j).toBe(1);expect(inc.switch.nextSemanticOrdinal).toBe(0);
    expect(deriveObservedArtifact(b).artifact).toEqual(parent.expectedArtifact);expect(validateObservedRequest(request(parent),build).ok).toBe(true);
    const maps=deriveSnapshotMaps(b,parent.expectedArtifact.learnedPlan);
    expect(maps.stepSnapshotHashes).toEqual(stepSnapshots(b.snapshotEvidence.current,b.configuration,parent.expectedArtifact.learnedPlan));
    expect(Object.keys(maps.reusedFrom)).toEqual(b.sourceSteps.slice(0,j).map(step=>step.stepId));expect(maps.reusedFrom).not.toHaveProperty(jId);
    // Equal semantics at j still come from the chosen current prefix and do not authorize reuse there.
    expect(record(maps.stepSnapshotHashes)[jId]).toBe(record(required(b.snapshotEvidence.baseProof).revision.stepSnapshotHashes)[jId]);
    for(const kind of ['reuse-at-j','substitute-current-map-at-j','omit-retained-prefix']as const){
      const offered=fullReseal(parent.expectedArtifact);
      if(kind==='reuse-at-j')record(offered.learnedPlan.reusedFrom)[jId]={revisionId:pin.revisionId,stepId:jId};
      if(kind==='substitute-current-map-at-j')record(offered.learnedPlan.stepSnapshotHashes)[jId]='f'.repeat(64);
      if(kind==='omit-retained-prefix')Reflect.deleteProperty(offered.learnedPlan.reusedFrom,required(b.sourceSteps[0]).stepId);
      const sealed=fullReseal(offered as Artifact3);
      expect(sealed).not.toEqual(parent.expectedArtifact);expect(validateObservedRequest({...request(parent),artifact:sealed},build)).toMatchObject({ok:false,errorCode:'OPERATION_MISMATCH'});
    }
    expect(expectedCanonical(parent)).toBe(before);
  });
});
