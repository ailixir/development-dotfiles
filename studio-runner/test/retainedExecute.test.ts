import { FIXTURE_ORIGIN, TEST_DOMAINS } from './helpers/allowedDomains.js';
import {scriptedAdapter,stepOp,stepResult} from './helpers/stepCode.js';
import {readFileSync} from 'node:fs';
import type {Launch3} from '../src/executor/observedOperations.js';
import {describe,expect,it,vi} from 'vitest';
import {boundObservedExecute,executeObservedReplay,RETAINED_EXECUTE_MAX_BYTES,validateObservedExecute} from '../src/executor/observedReplay.js';
import {retainedReplay,retainedSecretReplay} from './helpers/retainedReplay.js';
import {hashObserved,OBSERVED_LIMITS,ObservedRefusal} from '../src/validator/observedReferencePolicy.js';
import type {ObservedAdapter} from '../src/run/observedReplayAdapter.js';
function rebind(h:ReturnType<typeof retainedReplay>):void {h.artifact.learnedPlanHash=hashObserved(h.artifact.learnedPlan);h.artifact.replayPolicy.learnedPlanHash=h.artifact.learnedPlanHash;h.launch.admission.request.artifactHash=hashObserved(h.artifact);h.launch.admission.request.learnedPlanHash=h.artifact.learnedPlanHash;h.launch.admission.request.referencePolicyHash=hashObserved(h.artifact.replayPolicy);}
describe('ARCH015-05 exact admitted whole-artifact child witness',()=>{
  it.each(['admitted-binding-replacement'])('accepts %s retained producer only with the current accepted launch',name=>{const h=retainedReplay(name);expect(validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS,h.launch)).toBe(h.execute);expect(()=>validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS)).toThrow();});
  it.each(['missing','null','unknown','trusted','raw-source','recursive','unnecessary'])('refuses %s witness data before replay',mode=>{
    const h=retainedReplay(),raw:Record<string,unknown>={...h.execute};
    if(mode==='missing')delete raw.retainedArtifact;if(mode==='null')raw.retainedArtifact=null;if(mode==='unknown')raw.expectedArtifactHash=h.launch.admission.request.artifactHash;
    if(mode==='trusted')raw.retainedArtifact={...h.artifact,trusted:true};if(mode==='raw-source')raw.retainedArtifact={...h.artifact,source:'private'};if(mode==='recursive')raw.retainedArtifact={...h.artifact,validationBasis:h.basis};if(mode==='unnecessary')raw.bindings=[];
    expect(()=>validateObservedExecute(raw,h.launch.scope, TEST_DOMAINS,h.launch)).toThrow();
  });
  it.each(['base','retained','origin','admission','sourceIntent','guard'])('refuses altered artifact %s against unchanged admitted commitment',kind=>{
    const h=retainedReplay(),binding=h.artifact.learnedPlan.bindings[0];if(!binding)throw new Error('BINDING');
    if(kind==='base'&&h.artifact.learnedPlan.incremental)h.artifact.learnedPlan.incremental.baseRevisionId='00000000-0000-4000-8000-000000000999';if(kind==='retained'&&h.artifact.learnedPlan.incremental)h.artifact.learnedPlan.incremental.retainedPrefixAdmissionIds.reverse();if(kind==='origin')binding.sourceOrigin='https://other.example.test';if(kind==='admission')binding.provenance.producerAdmissionId='missing';if(kind==='sourceIntent')binding.provenance.sourceIntentStepId='missing';if(kind==='guard'&&h.artifact.guards[1])h.artifact.guards[1].origin='https://other.example.test';
    expect(()=>validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS,h.launch)).toThrow();
  });
  it.each(['steps','guards','bindings','transfers','input-order','input-id','input-kind','input-step','extra-input'])('refuses independently altered executable %s projection',kind=>{
    const h=retainedReplay();
    if(kind==='steps')h.execute.steps.reverse();if(kind==='guards')h.execute.guards.reverse();if(kind==='bindings')h.execute.bindings=[];if(kind==='transfers')h.execute.transfers.push({bindingId:'binding-reference',producer:{stepId:'absent',ordinal:0},consumer:{stepId:'absent',ordinal:1},origin:FIXTURE_ORIGIN});if(kind==='input-order')h.execute.inputs.reverse();const input=h.execute.inputs[0];if(!input)throw new Error('INPUT');if(kind==='input-id')input.inputId='substitute';if(kind==='input-step')input.stepId='substitute';if(kind==='input-kind')input.kind='nonsecretText';if(kind==='extra-input')h.execute.inputs.push({...input,inputId:'extra'});
    expect(()=>validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS,h.launch)).toThrow();
  });
  it.each(['run','attempt','configuration','profile','principal','scope','build'])('refuses crossed %s launch authority',kind=>{
    const h=retainedReplay(),launch=structuredClone(h.launch),scope=structuredClone(h.launch.scope);
    if(kind==='run')h.execute.runId='00000000-0000-4000-8000-000000009999';if(kind==='attempt')h.execute.attemptId='00000000-0000-4000-8000-000000009999';if(kind==='configuration')h.execute.configurationHash='f'.repeat(64);if(kind==='profile')h.execute.profileHash='f'.repeat(64);if(kind==='principal')scope.principalId='other';if(kind==='scope')launch.scopeHash='f'.repeat(64);if(kind==='build')launch.build.chromiumBuild='other';
    expect(()=>validateObservedExecute(h.execute,scope, TEST_DOMAINS,launch)).toThrow();
  });
  it.each(['duplicate','non-prefix','unknown','boundary','producer'])('refuses %s local published joins even under a unit admission recomputed for that malformed artifact',kind=>{
    const h=retainedReplay(),inc=h.artifact.learnedPlan.incremental,binding=h.artifact.learnedPlan.bindings[0];if(!inc||!binding)throw new Error('RETAINED');
    if(kind==='duplicate')inc.retainedPrefixAdmissionIds.push(inc.retainedPrefixAdmissionIds[0]??'');if(kind==='non-prefix')inc.retainedPrefixAdmissionIds.reverse();if(kind==='unknown')inc.retainedPrefixAdmissionIds[0]='unknown';if(kind==='boundary')inc.effectiveFirstLearnStepId='missing';if(kind==='producer')binding.provenance.sourceIntentStepId='missing';
    rebind(h);expect(()=>validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS,h.launch)).toThrow();
  });
  it('rejects a coherent Launch whose copied build identities both cross the current schema bundle',()=>{const h=retainedReplay();h.launch.build.schemaBundleHash='0'.repeat(64);h.launch.admission.request.build.schemaBundleHash='0'.repeat(64);expect(h.launch.build).toEqual(h.launch.admission.request.build);expect(()=>validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS,h.launch)).toThrow('PROFILE_MISMATCH');});
  it('rejects an otherwise admitted artifact with coherently foreign source-span recipe hashes',()=>{const h=retainedReplay();for(const recipe of [...h.artifact.inputRecipes,...h.artifact.replayPolicy.inputs])if(recipe.provenance.kind==='sourceSpan')recipe.provenance.sourceHash='f'.repeat(64);rebind(h);expect(hashObserved(h.artifact)).toBe(h.launch.admission.request.artifactHash);expect(()=>validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS,h.launch)).toThrow('REFERENCE_MISMATCH');});
  it('rejects a self-consistent extra input recipe even when Execute projection and synthetic admission match it',()=>{const h=retainedReplay(),first=h.artifact.inputRecipes[0];if(!first)throw new Error('RECIPE');const extra={...structuredClone(first),inputId:'extra-unused'};h.artifact.inputRecipes.push(extra);h.artifact.replayPolicy.inputs.push(structuredClone(extra));h.execute.inputs.push({inputId:extra.inputId,stepId:extra.stepId,kind:'destination',value:FIXTURE_ORIGIN});rebind(h);expect(()=>validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS,h.launch)).toThrow('REFERENCE_MISMATCH');});
  it('permits immutable revision bytes under two fresh valid admissions and rejects crossed Execute',()=>{
    const first=retainedReplay(),second=retainedReplay();expect(hashObserved(first.artifact)).toBe(hashObserved(second.artifact));expect(first.launch.runId).not.toBe(second.launch.runId);expect(validateObservedExecute(first.execute,first.launch.scope, TEST_DOMAINS,first.launch)).toBeDefined();expect(validateObservedExecute(second.execute,second.launch.scope, TEST_DOMAINS,second.launch)).toBeDefined();expect(()=>validateObservedExecute(first.execute,second.launch.scope, TEST_DOMAINS,second.launch)).toThrow();
  });
  it('does not reapply accepted Launch startDeadline while waiting Ready',()=>{const h=retainedReplay();h.launch.admission.startDeadlineAt=new Date(Date.now()-1000).toISOString();expect(validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS,h.launch)).toBeDefined();});
  it('keeps resolved secrets outside witness and checks exact secret referenceName projection',async()=>{
    const h=retainedSecretReplay();expect(validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS,h.launch)).toBeDefined();expect(JSON.stringify(h.execute.retainedArtifact)).not.toContain('released-secret-canary');
    const wrong=structuredClone(h.execute),input=wrong.inputs[1];if(input?.kind!=='secretRef')throw new Error('SECRET');input.referenceName='OTHER';wrong.secrets.OTHER='released-secret-canary';expect(()=>validateObservedExecute(wrong,h.launch.scope, TEST_DOMAINS,h.launch)).toThrow();
    const withheld:string[]=[],filled:string[]=[];
    // A scripted adapter: the secret fill reads its resolved value from the step io, the read step captures a fresh private value.
    const adapter=scriptedAdapter((action,_guard,io,control)=>{control.beginInvocation();filled.push(...Object.values(io.secrets));const id=action.operation.captures[0];return Promise.resolve(stepResult(action,id===undefined?{}:{[id]:'fresh-private-business-value'}));},withheld);let clock=0;
    const result=await executeObservedReplay(h.execute,adapter,h.launch.scope, TEST_DOMAINS,{now:()=>++clock},{stepStarted:()=>undefined,stepFinished:()=>undefined},new AbortController().signal,100000,undefined,h.launch);expect(result.ok).toBe(true);expect(filled).toContain('released-secret-canary');expect(withheld).toEqual(expect.arrayContaining(['fresh-private-business-value']));expect(JSON.stringify(result)).not.toMatch(/released-secret-canary|fresh-private-business-value/u);
  });
  it('executor revalidates with identical accepted launch and actually recaptures retained reads',async()=>{
    const captured:string[]=[],withheld:string[]=[];let value=0;
    const perform=vi.fn<ObservedAdapter['perform']>((action,_guard,_resolved,control)=>{control.beginInvocation();const id=action.operation.captures[0];if(id!==undefined){const fresh=`fresh-${String(++value)}`;captured.push(fresh);return Promise.resolve(stepResult(action,{[id]:fresh}));}return Promise.resolve(stepResult(action));});
    const adapter=scriptedAdapter(perform,withheld);
    for(let run=0;run<2;run++){const h=retainedReplay();let clock=0;expect((await executeObservedReplay(h.execute,adapter,h.launch.scope, TEST_DOMAINS,{now:()=>++clock},{stepStarted:()=>undefined,stepFinished:()=>undefined},new AbortController().signal,100000,undefined,h.launch)).ok).toBe(true);}
    expect(captured).toEqual(['fresh-1','fresh-2']);expect(withheld).toEqual(expect.arrayContaining(captured));
    const h=retainedReplay(),calls=perform.mock.calls.length;await expect(executeObservedReplay(h.execute,adapter,h.launch.scope, TEST_DOMAINS,{now:()=>0},{stepStarted:()=>undefined,stepFinished:()=>undefined},new AbortController().signal)).rejects.toThrow();expect(perform).toHaveBeenCalledTimes(calls);
  });
});
describe('proof branch independent component and combined preflight limits',()=>{
  const bytes=(value:unknown):number=>Buffer.byteLength(JSON.stringify(value));
  it('adds exactly20 wrapper bytes without extending either component cap',()=>{
    const base={kind:'execute',text:'é\\"'},proof={text:'value'},combined={...base,retainedArtifact:proof};expect(bytes(combined)-bytes(base)-bytes(proof)).toBe(20);expect(RETAINED_EXECUTE_MAX_BYTES).toBe(3145792);
    const largeBase={text:'a'.repeat(OBSERVED_LIMITS.execute-11)},largeProof={text:'b'.repeat(OBSERVED_LIMITS.artifact-11)};expect(bytes(largeBase)).toBe(OBSERVED_LIMITS.execute);expect(bytes(largeProof)).toBe(OBSERVED_LIMITS.artifact);expect(()=>{boundObservedExecute({...largeBase,retainedArtifact:largeProof});}).not.toThrow();
  });
  it.each(['artifact','base','combined','depth','unicode','nodes'])('refuses %s overflow before semantic traversal',kind=>{
    let raw:unknown={retainedArtifact:{text:'a'.repeat(OBSERVED_LIMITS.artifact)}};
    if(kind==='base')raw={text:'a'.repeat(OBSERVED_LIMITS.execute),retainedArtifact:{}};if(kind==='combined')raw={text:'a'.repeat(RETAINED_EXECUTE_MAX_BYTES),retainedArtifact:{}};if(kind==='unicode')raw={retainedArtifact:{text:'\ud800'}};if(kind==='nodes')raw={items:Array.from({length:690000},()=>[]),retainedArtifact:{items:Array.from({length:340000},()=>[])}};
    if(kind==='depth'){let nested:unknown={};for(let i=0;i<33;i++)nested=[nested];raw={retainedArtifact:nested};}
    expect(()=>{boundObservedExecute(raw);}).toThrow();
  });
  it('keeps ordinary no-proof frame at2MiB',()=>{expect(()=>{boundObservedExecute({text:'a'.repeat(OBSERVED_LIMITS.execute)});}).toThrow();});
});

const conformance=JSON.parse(readFileSync(new URL('../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json',import.meta.url),'utf8')) as {retainedExecuteConformance:{cases:{name:string;expected:'ACCEPT'|'REJECT';execute:unknown;acceptedLaunch?:Launch3|null}[]}};
describe('all independently frozen ARCH015-05 closed runtime witnesses',()=>{
  for(const row of conformance.retainedExecuteConformance.cases)it(`${row.expected}: ${row.name}`,()=>{
    const h=retainedReplay(),launch=row.acceptedLaunch??undefined,scope=launch?.scope??h.launch.scope;
    if(row.expected==='ACCEPT')expect(validateObservedExecute(row.execute,scope, TEST_DOMAINS,launch)).toBeDefined();
    else expect(()=>validateObservedExecute(row.execute,scope, TEST_DOMAINS,launch)).toThrow();
  });
});

// Declared partial-coordinate publication shape for child/executor tests only. Source maps are
// constructed from its declared authoring/actual local graph, never treated as a historical DB
// witness. The independent native partial-step companion remains in mixed-mode-prefix.test.ts.
import {stepSnapshots} from '../src/validator/observedSnapshots.js';
import {validateReplayArtifact} from '../src/validator/observedReplay.js';
import type {AuthoringSnapshotIdentity} from '../src/executor/observedOperations.js';
function partialCoordinateReplay():ReturnType<typeof retainedReplay> {
  const h=retainedReplay(),readStep=h.artifact.learnedPlan.sourceSteps[1],verifyStep=h.artifact.learnedPlan.sourceSteps[2],navStep=h.artifact.learnedPlan.sourceSteps[0],inc=h.artifact.learnedPlan.incremental;
  const moved=h.artifact.learnedPlan.actions[2],movedWire=h.artifact.steps[2]?.operations[0],readGuard=h.artifact.guards[1],label=h.execute.inputs[1];
  if(!readStep||!verifyStep||!navStep||!inc||!moved||!movedWire||typeof readGuard?.origin!=='string'||!label||label.kind==='secretRef')throw Error('PARTIAL_DECLARED_PARENT');
  expect(validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS,h.launch)).toBe(h.execute);
  moved.coordinate={stepId:readStep,ordinal:1};movedWire.coordinate={stepId:readStep,ordinal:1};
  const producerStep=h.artifact.steps[1],oldFillStep=h.artifact.steps[2],lastStep=h.artifact.steps[3];if(!producerStep||!oldFillStep||!lastStep)throw Error('PARTIAL_STEPS');producerStep.operations.push(structuredClone(movedWire));
  const operation=stepOp('await expect(page.getByText("Reference")).toBeVisible();'),coordinate={stepId:verifyStep,ordinal:0};
  const guard={...structuredClone(readGuard),guardId:'g3'};
  const projection={coordinate,origin:readGuard.origin,operation};
  h.artifact.learnedPlan.actions.splice(3,0,{...projection,admissionId:'declared-partial-visible',operationHash:hashObserved(projection)});
  oldFillStep.operations=[{coordinate,guardId:'g3',operation}];h.artifact.guards.splice(3,0,guard);const lastGuard=h.artifact.guards[4];if(!lastGuard)throw Error('PARTIAL_GUARD');lastGuard.guardId='g4';if(!lastStep.operations[0])throw Error('PARTIAL_LAST');lastStep.operations[0].guardId='g4';
  const authoring:AuthoringSnapshotIdentity={authoringIdentityVersion:1,authoring:{authoringSchemaVersion:2,globalContext:{entries:[],evidenceReferences:[]},steps:h.basis.snapshotEvidence.current.authoring.steps.map(step=>({...step,text:step.id===readStep?'Read the reference and fill <var partial-label>':step.id===verifyStep?'Verify the reference is visible':step.text,context:{entries:[],evidenceReferences:[]}}))},authoredDeclarations:[{referenceId:'partial-label',kind:'plain',valueHash:hashObserved(label.value)}]};
  h.artifact.sourceHash=hashObserved(authoring.authoring.steps.map(step=>step.text));h.artifact.authoringHash=hashObserved(authoring.authoring.steps.map((step,ordinal)=>({stepId:step.id,ordinal,source:step.text})));
  for(const inputs of [h.artifact.inputRecipes,h.artifact.replayPolicy.inputs])for(const input of inputs){if(input.inputId===label.inputId){input.stepId=readStep;input.provenance={kind:'configuration',referenceId:'partial-label',referenceName:'partial-label'};}else if(input.provenance.kind==='sourceSpan')input.provenance.sourceHash=h.artifact.sourceHash;}
  inc.effectiveFirstLearnStepId=readStep;inc.driftReceiptHash=hashObserved({classification:'DECLARED_UNIT_COORDINATE_ONLY_NO_DB_AUTHORITY',coordinate:{stepId:readStep,ordinal:1},retainedPrefixAdmissionIds:inc.retainedPrefixAdmissionIds});
  h.artifact.learnedPlan.reusedFrom={[navStep]:{revisionId:inc.baseRevisionId,stepId:navStep}};
  for(const action of h.artifact.learnedPlan.actions)action.operationHash=hashObserved({coordinate:action.coordinate,origin:action.origin,operation:action.operation});
  h.artifact.learnedPlan.stepSnapshotHashes=stepSnapshots(authoring,h.basis.configuration,h.artifact.learnedPlan);
  h.artifact.replayPolicy.publicationEvidenceHash=hashObserved({classification:'DECLARED_PARTIAL_CHILD_FIXTURE_ONLY',sourceHash:h.artifact.sourceHash,actions:h.artifact.learnedPlan.actions});
  h.execute.steps=structuredClone(h.artifact.steps);h.execute.guards=structuredClone(h.artifact.guards);h.execute.inputs[1]={...label,stepId:readStep};h.execute.retainedArtifact=h.artifact;
  rebind(h);h.launch.admission.request.publicationEvidenceHash=h.artifact.replayPolicy.publicationEvidenceHash;
  return h;
}
describe('retained read before later drift ordinal inside the same step',()=>{
  it('keeps read ordinal0 under the current whole artifact, does not mark drift step reused, and requires the accepted Launch at executor boundary',async()=>{
    const h=partialCoordinateReplay(),producer=h.artifact.learnedPlan.bindings[0];if(!producer)throw Error('PARTIAL_PRODUCER');
    expect(producer.producer).toEqual({stepId:h.artifact.learnedPlan.incremental?.effectiveFirstLearnStepId,ordinal:0});expect(producer.consumers).toEqual([]);expect(h.artifact.learnedPlan.reusedFrom).not.toHaveProperty(producer.producer.stepId);
    expect(h.execute.steps[1]?.operations.map(op=>op.coordinate.ordinal)).toEqual([0,1]);expect(validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS,h.launch)).toBe(h.execute);expect(()=>validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS)).toThrow();
    const perform=vi.fn<ObservedAdapter['perform']>((action,_guard,_value,control)=>{control.beginInvocation();const id=action.operation.captures[0];return Promise.resolve(stepResult(action,id===undefined?{}:{[id]:'declared-partial-private'}));}),adapter=scriptedAdapter(perform);
    await expect(executeObservedReplay(h.execute,adapter,h.launch.scope, TEST_DOMAINS,{now:()=>0},{stepStarted(){return;},stepFinished(){return;}},new AbortController().signal,100000)).rejects.toThrow();expect(perform).not.toHaveBeenCalled();
    const result=await executeObservedReplay(h.execute,adapter,h.launch.scope, TEST_DOMAINS,{now:()=>0},{stepStarted(){return;},stepFinished(){return;}},new AbortController().signal,100000,undefined,h.launch);expect(result.ok).toBe(true);expect(JSON.stringify(result)).not.toContain('declared-partial-private');
  });
  it.each(['producer-late-ordinal','omitted-retained-read','orphan-effective-admission']as const)('refuses a self-resealed partial-step %s before adapter invocation',async mutation=>{
    const h=partialCoordinateReplay();expect(validateObservedExecute(h.execute,h.launch.scope, TEST_DOMAINS,h.launch)).toBeDefined();
    if(mutation==='producer-late-ordinal'){
      for(const bindings of [h.artifact.learnedPlan.bindings,h.artifact.replayPolicy.bindings]){const binding=bindings[0];if(!binding)throw Error('BINDING');binding.producer.ordinal=1;}
      const binding=h.execute.bindings[0];if(!binding)throw Error('RUNTIME_BINDING');binding.producer.ordinal=1;
    }else if(mutation==='omitted-retained-read'){
      const inc=h.artifact.learnedPlan.incremental;if(!inc)throw Error('INCREMENTAL');inc.retainedPrefixAdmissionIds=inc.retainedPrefixAdmissionIds.slice(0,1);
    }else{
      const binding=h.artifact.replayPolicy.bindings[0],learned=h.artifact.learnedPlan.bindings[0];if(!binding||!learned)throw Error('BINDING');const edge={bindingId:binding.bindingId,producerAdmissionId:binding.provenance.producerAdmissionId,consumerAdmissionId:'absent-from-effective-actions',coordinate:{stepId:binding.producer.stepId,ordinal:1},destinationOrigin:binding.sourceOrigin,transferPolicy:'sameOrigin' as const};binding.consumers.push(edge);learned.consumers.push(structuredClone(edge));h.artifact.replayPolicy.transfers=[{bindingId:binding.bindingId,producer:binding.producer,consumer:edge.coordinate,origin:edge.destinationOrigin}];
    }
    rebind(h);
    // Public artifact admission/operation joins only: this says nothing about an omitted raw DB row.
    expect(()=>validateReplayArtifact(h.artifact)).toThrow('REFERENCE_MISMATCH');
    const perform=vi.fn<ObservedAdapter['perform']>(()=>Promise.reject(Error('UNEXPECTED_ADAPTER'))),adapter=scriptedAdapter(perform);
    await expect(executeObservedReplay(h.execute,adapter,h.launch.scope, TEST_DOMAINS,{now:()=>0},{stepStarted(){return;},stepFinished(){return;}},new AbortController().signal,100000,undefined,h.launch)).rejects.toThrow();expect(perform).not.toHaveBeenCalled();
  });
  it('withholds a completed earlier read before a later pre-invocation policy refusal and never retries or reports its private value',async()=>{
    const h=partialCoordinateReplay(),withheld:string[]=[],seen:string[]=[],events:unknown[]=[];
    const perform=vi.fn<ObservedAdapter['perform']>((action,_guard,_value,control)=>{const id=action.operation.captures[0];seen.push(id===undefined?(action.operation.uses.length>0?'navigate':'step'):'read');if(action.coordinate.stepId===h.artifact.learnedPlan.sourceSteps[3])return Promise.reject(new ObservedRefusal('POLICY_REFUSED',undefined,true));control.beginInvocation();return Promise.resolve(stepResult(action,id===undefined?{}:{[id]:'partial-retained-sensitive'}));});
    const result=await executeObservedReplay(h.execute,scriptedAdapter(perform,withheld),h.launch.scope, TEST_DOMAINS,{now:()=>0},{stepStarted:event=>{events.push(event);},stepFinished:event=>{events.push(event);}},new AbortController().signal,100000,undefined,h.launch);
    expect(result).toMatchObject({ok:false,errorCode:'POLICY_REFUSED'});expect(seen).toEqual(expect.arrayContaining(['navigate','read']));expect(withheld).toContain('partial-retained-sensitive');expect(JSON.stringify({result,events})).not.toContain('partial-retained-sensitive');
  });
});
