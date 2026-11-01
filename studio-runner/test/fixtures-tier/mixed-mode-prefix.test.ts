import { stepOp } from '../helpers/stepCode.js';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
/** Actual guided browser/ObservationSession composition; execution is serialized by Orion. Proposal supply is a test seam, not an authenticated gateway counter; Java joined tests own gateway/admission authority. */
import {describe,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// eslint-disable-next-line no-restricted-imports -- Native fixture video duration/decode oracle, no production subprocess.
import {execFileSync} from 'node:child_process';
import {GuidedRuntime} from '../../src/guided/runtime.js';
import {TEST_CHILD,guidedChildLaunch,guidedChildLauncher} from './helpers/guidedLaunch.js';
import {childPage} from './helpers/childPage.js';
import {createGuidedRecorder} from '../../src/guided/evidence.js';
import type {RecordingEvidenceBody} from '../../src/guided/evidence.js';
import {createConfiguredObjectStore,evidenceBoundsFrom,NODE_EVIDENCE_FILE_SYSTEM} from '../../src/run/objectStoreFactory.js';
import {loadEvidenceConfig} from '../../src/server/config.js';
import {systemOriginSource} from '../../src/run/timeline.js';
import {hash,identity,validate} from '../../src/guided/contracts.js';
import {guidedContext,proposal,dispatch} from '../helpers/guided.js';
import type {GuidedBrowser} from '../../src/run/guidedBrowser.js';
import type {Action,BridgeBootstrap,BridgeObservation,BridgePrefixPrepare,ConsumerEdge,PrefixProgram,Producer,ExecutionEvidence,Observation,Guard,PrefixAction,BridgePreparation} from '../../src/guided/types.js';
import {startGuidedDataflowFixture,canary} from '../fixtures/guided-dataflow/visibleTextServer.js';
const ids=Array.from({length:10},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const REFERENCE='page.getByRole("status", { name: "Business reference" })',DESTINATION='page.getByRole("textbox", { name: "Destination" })',SUBMIT='page.getByRole("button", { name: "Submit" })';
const useBinding=[{kind:'binding' as const,id:'stable-reference'}];
const operations:Action['operation'][]=[
  stepOp('await page.goto(inputs["source-url"]);',{uses:[{kind:'input',id:'source-url'}]}),
  stepOp(`vars["stable-reference"] = await ${REFERENCE}.innerText();`,{captures:['stable-reference']}),
  stepOp('await page.goto(inputs["destination-url"]);',{uses:[{kind:'input',id:'destination-url'}]}),
  stepOp(`await ${DESTINATION}.fill(vars["stable-reference"]);`,{uses:useBinding}),
  stepOp(`await ${SUBMIT}.hover();`),
  stepOp(`await expect(${SUBMIT}).toBeVisible();`),
  stepOp(`await ${DESTINATION}.fill(vars["stable-reference"]);`,{uses:useBinding}),
  stepOp(`await expect(${DESTINATION}).toHaveValue(vars["stable-reference"]);`,{uses:useBinding}),
  stepOp(`await ${SUBMIT}.click();`),
  stepOp(`await expect(${SUBMIT}).toBeVisible();`),
];
/** The guard of an action is its origin: null before the first document, else the document's origin. */
function guardFor(p:Action,index:number):Guard {
  return {guardId:`g${String(index)}`,origin:p.executionEvidence.kind==='initialBlank'?null:p.executionEvidence.origin};
}
describe('mixed prefix and suffix on one actual recorded guided session',()=>{
  it('recaptures a stable binding, preserves exact prepared lineage, crosses at4 and records both modes',async()=>{
    let liveValue='base-reference-value';const fixture=await startGuidedDataflowFixture('mixedVisible',()=>liveValue),root=await mkdtemp(join(tmpdir(),'mixed-prefix-native-'));
    try {
      const run=async(program?:PrefixProgram)=>{
        const context=guidedContext(fixture.origin);context.sourceRevision='1';context.configurationRevision='1';context.authoredInputs.sourceRevision='1';context.authoredInputs.configurationRevision='1';context.sourceStepIds=[...ids];context.authoredInputs.inputs=[{inputId:'source-url',sourceStepId:ids[0]??'',kind:'destination',value:fixture.origin+'/source',provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:ids[0]??'',referenceId:'source-url',kind:'destination'}},{inputId:'destination-url',sourceStepId:ids[2]??'',kind:'destination',value:fixture.origin+'/destination',provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:ids[2]??'',referenceId:'destination-url',kind:'destination'}}];context.authoredInputsHash=hash(context.authoredInputs);context.allocations=[{bindingId:'stable-reference',needId:'reference-need',producerStepId:ids[1]??'',consumers:[{stepId:ids[3]??''},{stepId:ids[6]??''},{stepId:ids[7]??''}]}];
        if(program){context.prefixProgram=structuredClone(program);context.prefixProgramHash=hash(program);}
        const settings=loadEvidenceConfig({STUDIO_RUNNER_OBJECT_STORE_DIR:join(root,context.sessionId,'objects'),STUDIO_RUNNER_SCRATCH_DIR:join(root,context.sessionId,'scratch')}),configured=createConfiguredObjectStore(settings),evidenceRoot=join(root,context.sessionId,'evidence');await mkdir(evidenceRoot,{recursive:true});
        const recorder=createGuidedRecorder({store:configured.store,fileSystem:NODE_EVIDENCE_FILE_SYSTEM,bounds:evidenceBoundsFrom(settings),size:{width:settings.recordingWidth,height:settings.recordingHeight},calibrationOffsetMs:settings.seekOriginCalibrationMs,originSource:systemOriginSource,now:()=>performance.now(),sleep:ms=>new Promise(resolve=>{setTimeout(resolve,ms);}),evidenceRoot});
        const messages:{route:string;body:unknown}[]=[],actions:PrefixAction[]=[];let browser:GuidedBrowser|undefined;let observation:Observation|null=null;
        const launch=vi.fn(async(...args:Parameters<typeof guidedChildLaunch>)=>{browser=await guidedChildLaunch(...args);return browser;}),runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:join(root,context.sessionId,'journal'),launch,recorder,csiId:'mixed-fixture',callback:(route,body)=>{messages.push({route,body});return Promise.resolve();}});
        let evidence:ExecutionEvidence;const proposalSupply=vi.fn(()=>undefined);let originalSession:GuidedBrowser['observations']|undefined;
        try {
          await runtime.start();evidence=(messages[0]?.body as BridgeBootstrap).executionEvidence;originalSession=browser?.observations;
          for(const [index,operation]of operations.entries()){
            const stepId=ids[index];if(!stepId)throw new Error('STEP');let p:Action,prepared:BridgePreparation;
            if(program&&index<3){
              const request={schemaVersion:3 as const,sessionId:context.sessionId,workerId:context.workerId,ownerFence:context.ownerFence,scopeHash:context.scopeHash,contextId:context.contextId,contextRevision:context.contextRevision,authoredInputsHash:context.authoredInputsHash,sourceRevision:context.sourceRevision,configurationRevision:context.configurationRevision,prefixProgramHash:hash(program),coordinate:{stepId,ordinal:0},evidenceHash:hash(evidence)},envelope:BridgePrefixPrepare={kind:'prefix',request,requestDigest:hash(request)},result=await runtime.preparePrefix(envelope);p=result.proposal;prepared=result.preparation;expect(proposalSupply).not.toHaveBeenCalled();
            }else{
              proposalSupply();p=proposal(context,evidence,stepId,structuredClone(operation));prepared=await runtime.prepare({...identity(context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()});
            }
            const guard=guardFor(p,index),request=dispatch(context,structuredClone(p),prepared);if(operation.uses.some(use=>use.kind==='binding')){
              const producer=context.producers.find(p=>p.bindingId==='stable-reference');if(!producer)throw new Error('PRODUCER');const edge:ConsumerEdge={bindingId:producer.bindingId,producerAdmissionId:producer.producerAdmissionId,consumerAdmissionId:request.ledger.admission.admissionId,coordinate:p.coordinate,destinationOrigin:fixture.origin,transferPolicy:'sameOrigin'};request.consumerEdges=[edge];context.consumerEdges.push(edge);
            }
            const outcome=await runtime.dispatch(request);expect(outcome.ledger.state).toBe('SUCCEEDED');actions.push({coordinate:p.coordinate,origin:p.executionEvidence.origin,operation:p.operation,operationHash:outcome.ledger.operationHash,guard});
            const captured=operation.captures[0];if(captured!==undefined){const availability=outcome.availability[0];if(!availability)throw new Error('AVAILABILITY');const producer:Producer={bindingId:captured,producerAdmissionId:outcome.ledger.admission.admissionId,coordinate:p.coordinate,origin:fixture.origin,availability};context.producers.push(producer);}
            if(operation.captures.length||request.consumerEdges.length){context.materializationRevision++;await runtime.update(context);}
            observation=(messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;evidence={kind:'observedDocument',sessionId:context.sessionId,contextId:context.contextId,documentId:observation.documentId,generation:observation.generation,origin:observation.origin,observationHash:hash(observation)};
            expect(browser?.observations).toBe(originalSession);expect(launch).toHaveBeenCalledOnce();
          }
        }finally{await runtime.stop('CANCELLED');await runtime.recordingSettled;configured.close();}
        const recording=messages.find(m=>m.route==='recording-evidence')?.body as RecordingEvidenceBody;expect(recording.state).toBe('STORED');
        // A timeline segment starts at the native fence: the six steps that act on the page (two navigations, two fills, hover, click) have one; the capture and the three assertions do not cross it.
        expect(recording.timings).toHaveLength(6);
        const path=join(root,context.sessionId,'objects','studio','mixed-fixture','guided',context.sessionId+'.webm');expect((await readFile(path)).byteLength).toBeGreaterThan(1024);
        const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path],{encoding:'utf8'}).trim())*1000;expect(duration).toBeGreaterThan(0);
        for(const timing of recording.timings){expect(timing.endMs).not.toBeNull();expect(timing.startMs).toBeGreaterThanOrEqual(0);expect(timing.endMs).toBeLessThanOrEqual(duration);}
        execFileSync('ffmpeg',['-v','error','-i',path,'-f','null','-'],{stdio:'pipe'});return {actions,proposalSupply,context,recording};
      };
      const base=await run();expect(fixture.receipts.at(-1)).toBe(liveValue);liveValue='fresh-current-session-reference';
      const program:PrefixProgram={schemaVersion:3,baseRevisionId:'00000000-0000-4000-8000-000000000999',baseRevisionDigest:hash(base.actions),sourceStepIds:ids.slice(0,3),actions:base.actions.slice(0,3)};
      const mixed=await run(program);expect(mixed.proposalSupply).toHaveBeenCalledTimes(7);expect(fixture.receipts.at(-1)).toBe(liveValue);expect(mixed.context.producers[0]?.bindingId).toBe('stable-reference');expect(mixed.context.producers[0]?.producerAdmissionId).not.toBe(base.context.producers[0]?.producerAdmissionId);expect(mixed.recording.timings[2]?.endMs).toBeLessThanOrEqual(mixed.recording.timings[3]?.startMs??0);
      expect(JSON.stringify(mixed.recording)).not.toContain(liveValue);expect(JSON.stringify(mixed.recording)).not.toContain(canary);
    }finally{await fixture.close();await rm(root,{recursive:true,force:true});}
  });
});

// R1 native companion only: local source/admission metadata never stands for actual PG publication.
// Backend B2/B3 must repeat this same partial-step case with its genuinely issued Artifact/Launch.
import {createServer} from 'node:http';
import {settleNativeOperation,withObservedNativeEvidence} from '../helpers/observedNativeEvidence.js';
import type {ObservedNativeEvidence} from '../helpers/observedNativeEvidence.js';
import {randomUUID} from 'node:crypto';
import {playwrightBrowserFactory} from '../../src/run/browser.js';
import {prepareBrowserProfile} from '../../src/run/scratchLayout.js';
import {createObservedReplayAdapter} from '../../src/run/observedReplayAdapter.js';
import {executeObservedReplay} from '../../src/executor/observedReplay.js';
import {validateReplayArtifact} from '../../src/validator/observedReplay.js';
import {stepSnapshots} from '../../src/validator/observedSnapshots.js';
import {hashObserved,OBSERVED_PROFILE,OBSERVED_SCHEMA_BUNDLE_HASH,ObservedRefusal} from '../../src/validator/observedReferencePolicy.js';
import {publicationFixture} from '../helpers/publicationFixture.js';
import type {Artifact3,AuthoringSnapshotIdentity,Configuration,Execute3,HistoricalBinding,Launch3,LearnedPlan,Scope } from '../../src/executor/observedOperations.js';
import type {BridgeOrdinaryOutcome,BridgeAdmittedDrift} from '../../src/guided/types.js';
const partialIds=ids.slice(0,4);
function need<T>(value:T|undefined|null):T {if(value===undefined||value===null)throw Error('MISSING_NATIVE_FACT');return value;}
async function partialSite(){
  let current='partial-base-private',requests=0;const receipts:string[]=[];
  const server=createServer((req,res)=>{
    if(req.url==='/receipt'){let body='';req.on('data',(part:Buffer)=>{body+=part.toString();});req.on('end',()=>{receipts.push(body);res.end('OK');});return;}
    if(req.url!=='/workflow'){res.writeHead(404);res.end();return;}requests++;
    res.setHeader('content-type','text/html; charset=utf-8');res.end(`<main><output data-testid="reference" aria-label="Business reference">${current}</output><label>Destination<textarea data-testid="destination"></textarea></label><button data-testid="commit">Commit</button></main><script>window.r1Fills=0;window.r1Clicks=0;document.addEventListener('input',()=>window.r1Fills++);document.querySelector('button').onclick=()=>{window.r1Clicks++;fetch('/receipt',{method:'POST',body:document.querySelector('textarea').value})};</script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('PORT');
  return {origin:`http://localhost:${String(address.port)}`,receipts,requests:()=>requests,set:(value:string)=>{current=value;},close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>{resolve();}));}};
}
interface PartialFact {proposal:Action;guard:Guard;outcome:BridgeOrdinaryOutcome}
async function runPartial(root:string,origin:string,preserved:ObservedNativeEvidence,program?:PrefixProgram){
  const context=guidedContext(origin);context.sourceRevision='1';context.configurationRevision='1';context.sourceStepIds=[...partialIds];context.authoredInputs.sourceRevision='1';context.authoredInputs.configurationRevision='1';
  context.authoredInputs.inputs=[{inputId:'partial-url',sourceStepId:need(partialIds[0]),kind:'destination',value:origin+'/workflow',provenance:{referenceKind:'configuration',configurationRevision:'1',stepId:need(partialIds[0]),referenceId:'partial-url',kind:'destination'}},{inputId:'unused-history',sourceStepId:need(partialIds[3]),kind:'nonsecretText',value:'old-unused-input',provenance:{referenceKind:'configuration',configurationRevision:'1',stepId:need(partialIds[3]),referenceId:'unused-history',kind:'nonsecretText'}}];context.authoredInputsHash=hash(context.authoredInputs);
  context.allocations=[{bindingId:'partial-reference',needId:'partial-need',producerStepId:need(partialIds[1]),consumers:[{stepId:need(partialIds[1])}]}];if(program){context.prefixProgram=structuredClone(program);context.prefixProgramHash=hash(program);}

  const settings=loadEvidenceConfig({STUDIO_RUNNER_OBJECT_STORE_DIR:join(root,context.sessionId,'objects'),STUDIO_RUNNER_SCRATCH_DIR:join(root,context.sessionId,'scratch')}),configured=createConfiguredObjectStore(settings),evidenceRoot=join(root,context.sessionId,'evidence');await mkdir(evidenceRoot,{recursive:true});
  const recorder=createGuidedRecorder({store:configured.store,fileSystem:NODE_EVIDENCE_FILE_SYSTEM,bounds:evidenceBoundsFrom(settings),size:{width:settings.recordingWidth,height:settings.recordingHeight},calibrationOffsetMs:settings.seekOriginCalibrationMs,originSource:systemOriginSource,now:()=>performance.now(),sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms)),evidenceRoot});
  let browser:GuidedBrowser|undefined;const messages:{route:string;body:unknown}[]=[],facts:PartialFact[]=[];const probing=guidedChildLauncher({childModulePath:TEST_CHILD.probe}),launches=vi.fn(async(...args:Parameters<typeof guidedChildLaunch>)=>{browser=await probing(...args);return browser;});
  const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:join(root,context.sessionId,'journal'),launch:launches,recorder,csiId:'CSI-123',callback:(route,body)=>{messages.push({route,body});return Promise.resolve();}});
  const role=program?'mixed-guided':'base-guided',video=join(root,context.sessionId,'objects','studio','CSI-123','guided',context.sessionId+'.webm');preserved.media(role,video);preserved.check(role,'assertions','RUNNING');
  let evidence:ExecutionEvidence,observation:Observation|null=null,drift:BridgeAdmittedDrift|undefined,excluded:PartialFact|undefined;
  const latest=()=>{observation=(messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;evidence={kind:'observedDocument',sessionId:context.sessionId,contextId:context.contextId,documentId:observation.documentId,generation:observation.generation,origin:observation.origin,observationHash:hash(observation)};};
  const operationList:Action['operation'][]=[stepOp('await page.goto(inputs["partial-url"]);',{uses:[{kind:'input',id:'partial-url'}]}),stepOp('vars["partial-reference"] = await page.getByRole("status", { name: "Business reference" }).innerText();',{captures:['partial-reference']}),stepOp('await page.getByRole("textbox", { name: "Destination" }).fill(vars["partial-reference"]);',{uses:[{kind:'binding',id:'partial-reference'}]}),stepOp('await page.getByRole("button", { name: "Commit" }).click();'),stepOp('await expect(page.getByRole("textbox", { name: "Destination" })).toBeVisible();')];
  const steps=[need(partialIds[0]),need(partialIds[1]),need(partialIds[1]),need(partialIds[2]),need(partialIds[3])];
  await settleNativeOperation(async()=>{
    await runtime.start();evidence=(messages[0]?.body as BridgeBootstrap).executionEvidence;const original=need(browser),session=original.observations,probe=await childPage();
    for(const [index,operation]of operationList.entries()){
      const coordinate={stepId:need(steps[index]),ordinal:index===2?1:0};let p:Action,proof;
      if(program&&index<3){const request={schemaVersion:3 as const,sessionId:context.sessionId,workerId:context.workerId,ownerFence:context.ownerFence,scopeHash:context.scopeHash,contextId:context.contextId,contextRevision:context.contextRevision,authoredInputsHash:context.authoredInputsHash,sourceRevision:context.sourceRevision,configurationRevision:context.configurationRevision,prefixProgramHash:hash(program),coordinate,evidenceHash:hash(evidence)},envelope:BridgePrefixPrepare={kind:'prefix',request,requestDigest:hash(request)},prepared=await runtime.preparePrefix(envelope);p=prepared.proposal;proof=prepared.preparation;}
      else{p={...proposal(context,evidence,coordinate.stepId,operation),coordinate};proof=await runtime.prepare({...identity(context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()});}
      const guard=guardFor(p,index),request=dispatch(context,p,proof);
      if(operation.uses.some(use=>use.kind==='binding')){const producer=need(context.producers[0]);const edge:ConsumerEdge={bindingId:producer.bindingId,producerAdmissionId:producer.producerAdmissionId,consumerAdmissionId:request.ledger.admission.admissionId,coordinate,destinationOrigin:origin,transferPolicy:'sameOrigin'};context.consumerEdges.push(edge);request.consumerEdges=[edge];}
      if(program&&index===2){
        // An ambiguous destination after prepare refuses at the strict-mode resolution, before any effect, without a repeat admission.
        await probe.duplicateLabelOf('[data-testid=destination]','twin-destination');
        expect(await probe.count('[data-testid=destination]')).toBe(2);
        const outcome=await runtime.dispatch(request);await probe.remove('#twin-destination');expect(outcome.ledger).toMatchObject({state:'FAILED',outcomeCode:'TARGET_CHANGED',attemptOrdinal:0});excluded={proposal:p,guard,outcome};
        const notice=messages.find(m=>(m.body as {kind?:string}).kind==='prefixDrift')?.body as {receipt:BridgeAdmittedDrift};drift=notice.receipt;expect(drift).toMatchObject({phase:'ADMITTED_PRE_INVOCATION',nativeInvocationStarted:false,coordinate});
        expect(await probe.globals(['r1Fills','r1Clicks'])).toEqual({r1Fills:0,r1Clicks:0});await expect(runtime.dispatch(request)).rejects.toThrow('PREPARATION_DENIED');
        context.materializationRevision++;await runtime.update(context);const before=structuredClone(context),rawGraph=hash({allocations:context.allocations,producers:context.producers,edges:context.consumerEdges});
        const appended=structuredClone(context);appended.contextRevision++;appended.materializationRevision++;appended.authoredInputs.inputs.push({inputId:'suffix-label',sourceStepId:coordinate.stepId,kind:'nonsecretText',value:'fresh-suffix-private',provenance:{referenceKind:'configuration',configurationRevision:'1',stepId:coordinate.stepId,referenceId:'suffix-label',kind:'nonsecretText'}});appended.authoredInputsHash=hash(appended.authoredInputs);
        const withhold=session.withhold.bind(session);let release:()=>void=()=>undefined;const gate=new Promise<void>(resolve=>{release=resolve;});session.withhold=async values=>{await withhold(values);await gate;};
        const deliveryId=randomUUID(),pending=runtime.update(appended,deliveryId);await Promise.resolve();const metadata=structuredClone(context);metadata.materializationRevision++;await expect(runtime.update(metadata,randomUUID())).rejects.toThrow('BUSY');await expect(runtime.refreshObservation({...identity(context),expectedGeneration:need<Observation>(observation).generation,focus:{stepText:'',targetIntents:[]}},'pending-no-refresh')).rejects.toThrow('BUSY');expect(runtime.currentIdentity).toEqual(identity(before));
        expect(launches).toHaveBeenCalledOnce();expect(messages.filter(m=>m.route==='bootstrap-evidence')).toHaveLength(1);expect(need(browser).observations).toBe(session);expect(await probe.inputValue('textarea')).toBe('');
        release();const ack=await pending;session.withhold=withhold;expect(validate('bridge',ack,'ContextAcknowledgement')).toMatchObject({deliveryId,contextHash:hash(appended),contextRevision:2});Object.assign(context,appended);const historical=structuredClone(context);context.materializationRevision++;await runtime.update(context);expect(await runtime.update(historical,deliveryId)).toEqual(ack);expect(hash({allocations:context.allocations,producers:context.producers,edges:context.consumerEdges})).toBe(rawGraph);
        await runtime.refreshObservation({...identity(context),expectedGeneration:need<Observation>(observation).generation,focus:{stepText:'',targetIntents:[]}},'after-current-wait');latest();const replacement=proposal(context,evidence,coordinate.stepId,stepOp('await page.getByRole("textbox", { name: "Destination" }).fill(inputs["suffix-label"]);',{uses:[{kind:'input',id:'suffix-label'}]}));replacement.coordinate.ordinal=1;const fresh=await runtime.prepare({...identity(context),proposal:replacement,requestDigest:hash(replacement),expiresAt:new Date(Date.now()+10000).toISOString()}),replacementRequest=dispatch(context,replacement,fresh);replacementRequest.ledger.attemptOrdinal=1;
        const replaced=await runtime.dispatch(replacementRequest);expect(replaced.ledger.state).toBe('SUCCEEDED');facts.push({proposal:replacement,guard:guardFor(replacement,index),outcome:replaced});latest();continue;
      }
      const outcome=await runtime.dispatch(request);expect(outcome.ledger.state).toBe('SUCCEEDED');facts.push({proposal:p,guard,outcome});
      const captured=operation.captures[0];if(captured!==undefined){const availability=need(outcome.availability[0]);context.producers.push({bindingId:captured,producerAdmissionId:outcome.ledger.admission.admissionId,coordinate,origin,availability});}
      if(operation.captures.length||request.consumerEdges.length){context.materializationRevision++;await runtime.update(context);}latest();expect(need(browser).observations).toBe(session);expect(launches).toHaveBeenCalledOnce();
    }
  },async()=>{try{await runtime.stop('CANCELLED');await runtime.recordingSettled;}finally{configured.close();preserved.recording(role,messages.find(m=>m.route==='recording-evidence')?.body as RecordingEvidenceBody|undefined);for(const fact of facts)preserved.outcome(role,fact.outcome.ledger);preserved.outcome(role,excluded?.outcome.ledger);}});
  const recording=(messages.find(m=>m.route==='recording-evidence')?.body as RecordingEvidenceBody);expect(recording.state).toBe('STORED');expect(recording.timings).toHaveLength(3);const excludedFact=excluded;if(excludedFact)expect(recording.timings.some(t=>t.admissionId===excludedFact.outcome.ledger.admission.admissionId)).toBe(false);
  expect((await readFile(video)).byteLength).toBeGreaterThan(1024);preserved.check(role,'decoder','RUNNING');execFileSync('ffmpeg',['-v','error','-i',video,'-f','null','-'],{stdio:'pipe'});preserved.check(role,'decoder','PASSED');preserved.check(role,'assertions','PASSED');
  return {context,facts,drift,excluded,recording,video};
}
function partialArtifact(run:Awaited<ReturnType<typeof runPartial>>,origin:string){
  const producer=need(run.context.producers[0]),baseId=need(run.context.prefixProgram).baseRevisionId,drift=need(run.drift);
  const sourceSteps=partialIds.map((stepId,index)=>({stepId:need(stepId),ordinal:index,source:['Open <var partial-url>','Read reference then fill <var suffix-label>','Click Commit','Assert destination <var unused-history>'][index]??''}));
  const identity:AuthoringSnapshotIdentity={authoringIdentityVersion:1,authoring:{authoringSchemaVersion:2,globalContext:{entries:[],evidenceReferences:[]},steps:sourceSteps.map(step=>({id:step.stepId,text:step.source,context:{entries:[],evidenceReferences:[]}}))},authoredDeclarations:[{referenceId:'partial-url',kind:'plain',valueHash:hash(origin+'/workflow')},{referenceId:'suffix-label',kind:'plain',valueHash:hash('fresh-suffix-private')},{referenceId:'unused-history',kind:'plain',valueHash:hash('old-unused-input')}]};
  const requirements={...publicationFixture.artifact.replayPolicy.scope,initialContext:{kind:'initialBlank' as const},capabilities:['step'] as const};
  const scope:Scope={principalId:'r1-native-fixture-author',...requirements};
  const configuration:Configuration={environment:scope.environment,browser:'chromium',viewport:{width:1280,height:720},timeoutSeconds:10,waitStrategy:'domcontentloaded'};
  const binding:HistoricalBinding={schemaVersion:3,bindingId:producer.bindingId,valueType:'string',producer:producer.coordinate,sourceOrigin:producer.origin,consumers:[],provenance:{sessionId:run.context.sessionId,producerAdmissionId:producer.producerAdmissionId,sourceIntentStepId:producer.coordinate.stepId},transferPolicy:'sameOrigin',preserveBytes:true};
  // These actions/admissions were actually completed above. The metadata admission below is
  // fixture-local, not a statement that a server published or persisted this revision.
  const actions=run.facts.map(({proposal:p,outcome})=>({coordinate:p.coordinate,origin:p.executionEvidence.origin,operation:p.operation,admissionId:outcome.ledger.admission.admissionId,operationHash:outcome.ledger.operationHash})) as unknown as LearnedPlan['actions'];
  const learnedPlan:LearnedPlan={schemaVersion:3,planId:'native-partial-plan',scopeHash:run.context.scopeHash,sourceRevision:run.context.sourceRevision,configurationRevision:run.context.configurationRevision,authoredInputsHash:run.context.authoredInputsHash,initialContext:{kind:'initialBlank'},sourceSteps:sourceSteps.map(s=>s.stepId),versions:{contract:3},actions,bindings:[binding],stepSnapshotHashes:stepSnapshots(identity,configuration,{actions,bindings:[binding]}),reusedFrom:{[need(partialIds[0])]:{revisionId:baseId,stepId:need(partialIds[0])}},incremental:{baseRevisionId:baseId,initialFirstLearnStepId:need(partialIds[3]),effectiveFirstLearnStepId:need(partialIds[1]),retainedPrefixAdmissionIds:run.facts.slice(0,2).map(f=>f.outcome.ledger.admission.admissionId),driftReceiptHash:drift.receiptHash}};
  const inputRecipes:Artifact3['inputRecipes']=[{inputId:'partial-url',stepId:need(partialIds[0]),kind:'destination',provenance:{kind:'configuration',referenceId:'partial-url',referenceName:'partial-url'}},{inputId:'suffix-label',stepId:need(partialIds[1]),kind:'nonsecretText',provenance:{kind:'configuration',referenceId:'suffix-label',referenceName:'suffix-label'}}];
  const learnedPlanHash=hashObserved(learnedPlan),publicationEvidenceHash=hash({classification:'NATIVE_FIXTURE_ONLY_NO_DATABASE_PUBLICATION',rawContext:run.context,ledgers:run.facts.map(f=>f.outcome.ledger),excluded:run.excluded,drift});
  const artifact:Artifact3={version:3,kind:'observed',profile:OBSERVED_PROFILE,sourceHash:hash(sourceSteps.map(s=>s.source)),configurationHash:hash(configuration),authoringHash:hash(sourceSteps),learnedPlan,learnedPlanHash,inputRecipes,guards:run.facts.map(f=>f.guard),steps:sourceSteps.map((s,stepIndex)=>({stepIndex,stepId:s.stepId,operations:run.facts.filter(f=>f.proposal.coordinate.stepId===s.stepId).map(f=>({coordinate:f.proposal.coordinate,guardId:f.guard.guardId,operation:f.proposal.operation}))})),replayPolicy:{schemaVersion:4,learnedPlanHash,admissionProvenanceHash:hash(run.facts.map(f=>({coordinate:f.outcome.ledger.coordinate,admission:f.outcome.ledger.admission,operationHash:f.outcome.ledger.operationHash,scopeHash:f.outcome.ledger.scopeHash}))),publicationEvidenceHash,runAuthorizationHash:hash(need(run.facts[0]).outcome.ledger.admission.authorizationId),scope:requirements,inputs:inputRecipes,bindings:[binding],transfers:[]}};
  validateReplayArtifact(artifact);return {artifact,scope,configuration,identity};
}
async function verifyMixedPrefixReplacement():Promise<void>{
  const site=await partialSite(),root=await mkdtemp(join(tmpdir(),'partial-prefix-native-'));
  await withObservedNativeEvidence(root,'partial-step',async preserved=>{
    const base=await runPartial(root,site.origin,preserved);expect(site.receipts.at(-1)).toBe('partial-base-private');site.set('partial-new-session-private');
    const program:PrefixProgram={schemaVersion:3,baseRevisionId:randomUUID(),baseRevisionDigest:hash(base.facts.map(f=>f.outcome.ledger)),sourceStepIds:partialIds.slice(0,3),actions:base.facts.slice(0,4).map(f=>({coordinate:f.proposal.coordinate,origin:f.proposal.executionEvidence.origin,operation:f.proposal.operation,operationHash:f.outcome.ledger.operationHash,guard:f.guard}))};
    const mixed=await runPartial(root,site.origin,preserved,program);expect(site.receipts.at(-1)).toBe('fresh-suffix-private');
    const producer=need(mixed.context.producers[0]);expect(producer.coordinate).toEqual({stepId:partialIds[1],ordinal:0});expect(producer.producerAdmissionId).not.toBe(base.context.producers[0]?.producerAdmissionId);expect(producer.availability).toEqual({bindingId:producer.bindingId,producerAdmissionId:producer.producerAdmissionId,contextId:mixed.context.contextId,workerId:mixed.context.workerId,ownerFence:mixed.context.ownerFence});
    expect(mixed.context.allocations[0]?.consumers).toEqual([{stepId:partialIds[1]}]);const excluded=need(mixed.excluded);expect(mixed.context.consumerEdges).toEqual([{bindingId:producer.bindingId,producerAdmissionId:producer.producerAdmissionId,consumerAdmissionId:excluded.outcome.ledger.admission.admissionId,coordinate:{stepId:partialIds[1],ordinal:1},destinationOrigin:site.origin,transferPolicy:'sameOrigin'}]);
    const built=partialArtifact(mixed,site.origin),{artifact,scope,configuration}=built;expect(artifact.learnedPlan.bindings[0]?.consumers).toEqual([]);expect(artifact.learnedPlan.reusedFrom).not.toHaveProperty(need(partialIds[1]));expect(artifact.learnedPlan.incremental?.retainedPrefixAdmissionIds).toContain(producer.producerAdmissionId);expect(mixed.context.authoredInputs.inputs).toHaveLength(3);expect(artifact.inputRecipes).toHaveLength(2);
    const baseActions=base.facts.map(f=>({coordinate:f.proposal.coordinate,origin:f.proposal.executionEvidence.origin,operation:f.proposal.operation,operationHash:f.outcome.ledger.operationHash,admissionId:f.outcome.ledger.admission.admissionId})) as unknown as LearnedPlan['actions'];
    const baseProducer=need(base.context.producers[0]),baseBinding:HistoricalBinding={...need(artifact.learnedPlan.bindings[0]),producer:baseProducer.coordinate,provenance:{sessionId:base.context.sessionId,producerAdmissionId:baseProducer.producerAdmissionId,sourceIntentStepId:baseProducer.coordinate.stepId},consumers:base.context.consumerEdges};const baseMaps=stepSnapshots(built.identity,configuration,{actions:baseActions,bindings:[baseBinding]});expect((artifact.learnedPlan.stepSnapshotHashes as Record<string,string>)[need(partialIds[0])]).toBe(baseMaps[need(partialIds[0])]);expect((artifact.learnedPlan.stepSnapshotHashes as Record<string,string>)[need(partialIds[1])]).not.toBe(baseMaps[need(partialIds[1])]);
    preserved.hash('artifactHash',hash(artifact));preserved.hash('learnedPlanHash',artifact.learnedPlanHash);preserved.hash('publicationEvidenceHash',artifact.replayPolicy.publicationEvidenceHash);preserved.hash('rawGraphHash',hash({allocations:mixed.context.allocations,producers:mixed.context.producers,edges:mixed.context.consumerEdges}));preserved.hash('producerHash',hash(producer));preserved.hash('excludedHash',hash(excluded.outcome.ledger));preserved.hash('availabilityHash',hash(producer.availability));preserved.hash('originHash',hash(producer.origin));
    const immutable=JSON.stringify(artifact),launchRuns:string[]=[];const before=site.requests();
    for(const value of ['partial-ordinary-native-one','partial-ordinary-native-two']){
      site.set(value);const directory=await mkdtemp(join(root,'ordinary-'));prepareBrowserProfile(directory);
      
      const handle=await playwrightBrowserFactory.launch({allowedDomains: TEST_DOMAINS, browser:'chromium',scratchPath:directory,observedScope:scope,viewport:configuration.viewport,recording:configuration.viewport}),receiptsBefore=site.receipts.length;
      const role=value==='partial-ordinary-native-one'?'ordinary-one':'ordinary-two';let video:string|undefined;
      await settleNativeOperation(async()=>{
      const template=publicationFixture.launch as Launch3,runId=randomUUID(),attemptId=randomUUID(),admissionId=randomUUID(),build={...template.build,schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH};
      const launch:Launch3={...template,runId,attemptId,profile:OBSERVED_PROFILE,build,scope,scopeHash:hash(scope),configurationHash:artifact.configurationHash,browser:'chromium',viewport:configuration.viewport,recording:configuration.viewport,scratchPath:directory,admission:{...template.admission,admissionId,startDeadlineAt:new Date(Date.now()+5000).toISOString(),runDeadlineAt:new Date(Date.now()+30000).toISOString(),request:{...template.admission.request,executionId:runId,attemptId,admissionId,build,profile:OBSERVED_PROFILE,scopeHash:hash(scope),configurationHash:artifact.configurationHash,artifactHash:hash(artifact),learnedPlanHash:artifact.learnedPlanHash,referencePolicyHash:hash(artifact.replayPolicy),publicationEvidenceHash:artifact.replayPolicy.publicationEvidenceHash}}};launchRuns.push(runId);
      const message:Execute3={kind:'execute',protocolVersion:3,mode:'observed',runId,attemptId,profileHash:hash(OBSERVED_PROFILE),configurationHash:artifact.configurationHash,waitStrategy:configuration.waitStrategy,stepTimeoutMs:configuration.timeoutSeconds*1000,steps:artifact.steps,guards:artifact.guards,bindings:artifact.replayPolicy.bindings.map(b=>({bindingId:b.bindingId,producer:b.producer,origin:b.sourceOrigin})),transfers:artifact.replayPolicy.transfers,inputs:[{inputId:'partial-url',stepId:need(partialIds[0]),kind:'destination',value:site.origin+'/workflow'},{inputId:'suffix-label',stepId:need(partialIds[1]),kind:'nonsecretText',value:'fresh-suffix-private'}],secrets:{},secretOrigins:{},retainedArtifact:artifact};
      const adapter=createObservedReplayAdapter(handle, scope, TEST_DOMAINS,runId,()=>{if(Date.now()>=Date.parse(launch.admission.runDeadlineAt))throw new ObservedRefusal('TIMEOUT');});
      preserved.localRun(role,runId,attemptId,admissionId);
      const result=await executeObservedReplay(message,adapter,scope, TEST_DOMAINS,{now:()=>performance.now()},{stepStarted(){return;},stepFinished(){return;}},new AbortController().signal,performance.now()+30000,undefined,launch);expect(result.ok).toBe(true);// The recaptured reference is not observable outside the step (that is the point of a capture); the fill after it uses the authored suffix, so the page receives that.
      await expect.poll(()=>site.receipts.length).toBe(receiptsBefore+1);expect(site.receipts.at(-1)).toBe('fresh-suffix-private');expect(JSON.stringify(result)).not.toContain(value);expect(JSON.stringify(artifact)).toBe(immutable);video=need(await handle.close());preserved.media(role,video);preserved.check(role,'assertions','RUNNING');expect((await readFile(video)).byteLength).toBeGreaterThan(1024);preserved.check(role,'decoder','RUNNING');execFileSync('ffmpeg',['-v','error','-i',video,'-f','null','-'],{stdio:'pipe'});preserved.check(role,'decoder','PASSED');preserved.check(role,'assertions','PASSED');},async()=>{try{if(video===undefined){const originalVideo=await handle.close();if(originalVideo){video=originalVideo;preserved.media(role,video);}}}finally{await handle.dispose();}});
    }
    expect(site.requests()-before).toBe(2);expect(new Set(launchRuns).size).toBe(2);for(const value of ['partial-base-private','partial-new-session-private','partial-ordinary-native-one','partial-ordinary-native-two'])expect(immutable).not.toContain(value);
  },()=>site.close(),()=>rm(root,{recursive:true,force:true}));
}
it('retains actual read ordinal0 inside drift step2, spends only failed ordinal1, then natively recaptures twice under identical fixture artifact bytes',()=>verifyMixedPrefixReplacement());
