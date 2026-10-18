import { describe, expect, it } from 'vitest';
import {readFileSync} from 'node:fs';
import {negativeBoundaries,assertExactNegativeMutation,validateSyntheticDeclaredAuthority,SYNTHETIC_AUTHORITY_SCOPE} from './helpers/incrementalNegativeBoundaries.js';
import type {NegativeSection,NegativeCase} from './helpers/incrementalNegativeBoundaries.js';
import {publicationFixture} from './helpers/publicationFixture.js';
import {parseDocumentJson} from './helpers/documentJson.js';
interface Case extends NegativeCase {expected:string;expectedArtifact:unknown}
interface Fixture {basis:unknown;artifact:{learnedPlan:Parameters<typeof deriveSnapshotMaps>[1]&{stepSnapshotHashes:unknown}};snapshotCorrection:{positives:Case[];negatives:Case[]};graphTimingConformance:{graphCases:Case[]};incrementalContracts:{basisCases:Case[]}}
const fixtures=parseDocumentJson(readFileSync(new URL('../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json',import.meta.url)),33554432) as Fixture;
import { deriveObservedArtifact,validateObservedRequest } from '../src/validator/observedReplay.js';
import { deriveSnapshotMaps, inputChains } from '../src/validator/observedSnapshots.js';
import { validateMaterializationHistory, validateIncrementalHistory, effectiveGraph } from '../src/validator/observedHistory.js';
import { validateObserved,hashObserved,OBSERVED_SCHEMA_BUNDLE_HASH,OBSERVED_PROFILE,ObservedRefusal } from '../src/validator/observedReferencePolicy.js';
import type { ValidationBasis } from '../src/executor/observedOperations.js';
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
