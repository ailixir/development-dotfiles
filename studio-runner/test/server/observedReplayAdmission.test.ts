import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import {mutableCurrentJob} from '../helpers/currentWorlds.js';
import {createFakeScheduler} from '../helpers/scheduler.js';
import {until} from '../helpers/harness.js';
import {createChildDriver} from '../helpers/childDriver.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {ScratchStore} from '../../src/server/adapters.js';
import {createFsScratchStore} from '../../src/server/scratch.js';
import type {BrowserLauncher} from '../../src/server/adapters.js';
import {ackRequestsCancel} from '../../src/reporting/reportClient.js';
import type {ObservedJob,Artifact3,Scope,BuildIdentity} from '../../src/executor/observedOperations.js';
import {OBSERVED_PROFILE} from '../../src/validator/observedReferencePolicy.js';
import { describe, it, expect } from 'vitest';
import {publicationFixture as fixture} from '../helpers/publicationFixture.js';
import { createApplication } from '../../src/server/application.js';
import { loadConfig } from '../../src/server/config.js';
import { testFingerprint, testTls } from '../helpers/guidedTls.js';
const listener = { tls: testTls, controllerCertificateFingerprint256: testFingerprint };
import { createRecordingLogSink } from '../../src/server/logging.js';
import type { } from '../../src/executor/observedOperations.js';
import { createFakeScratchStore } from '../helpers/runner.js';
import type { HttpOutcome } from '../../src/reporting/httpClient.js';
import { CONTROL_WINDOW_MARGIN_MS } from '../../src/server/runCoordinator.js';
import {hashObserved,OBSERVED_SCHEMA_BUNDLE_HASH} from '../../src/validator/observedReferencePolicy.js';
const currentBuild={...fixture.build,schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH};
function job(){return mutableCurrentJob(currentBuild);}

describe('observed admission sends once and never confuses receipt with authority', () => {
    // The expectations below derive from the constant, so they would follow a negative margin
    // that extends the secret-bearing window. Pin its bounds literally (012A ruling R5).
    it('keeps the control-window margin positive and small', () => {
        expect(CONTROL_WINDOW_MARGIN_MS).toBeGreaterThan(0);
        expect(CONTROL_WINDOW_MARGIN_MS).toBeLessThanOrEqual(50);
    });
    it.each(['timeout', 'redirect', 'oversize', 'wrong-receipt', 'malformed'])('stops before scratch/browser on %s', async (mode) => {
        let sends = 0, launches = 0;
        const scratch = createFakeScratchStore();
        const config = loadConfig({ STUDIO_RUNNER_SERVICE_IDENTITY: 'service', STUDIO_RUNNER_CALLBACK_IDENTITY: 'callback', STUDIO_RUNNER_CALLBACK_BASE_URL: 'https://backend.test', STUDIO_RUNNER_ALLOWED_DOMAINS: TEST_DOMAINS.join(','), STUDIO_RUNNER_ALLOW_ALL_DOMAINS: 'false' });
        const app = createApplication(config, { listener, runtimeVersions: {}, scratch, launcher: { launch() { launches++; return Promise.reject(Error('unexpected')); } }, http: { send(request): Promise<HttpOutcome> {
                    sends++;
                    expect(request.maxResponseBytes).toBe(65536);
                    if (mode === 'timeout')
                        return Promise.resolve({ kind: 'timeout' });
                    if (mode === 'redirect')
                        return Promise.resolve({ kind: 'response', status: 307, body: '' });
                    if (mode === 'oversize')
                        return Promise.resolve({ kind: 'response', status: 200, body: 'x'.repeat(65537) });
                    if (mode === 'malformed')
                        return Promise.resolve({ kind: 'response', status: 200, body: '{"a":1,"a":2}' });
                    return Promise.resolve({ kind: 'response', status: 200, body: JSON.stringify(fixture.admissionReceipt) });
                } }, observed: { build: currentBuild, validationEnabled: true, replayEnabled: true }, logSink: createRecordingLogSink() });
        const result = await required(app.coordinator.submitObserved?.bind(app.coordinator))(job());
        expect(result).toEqual({ status: 503, code: 'ADMISSION_NOT_ACKNOWLEDGED' });
        expect(sends).toBe(1);
        expect(launches).toBe(0);
        expect(await scratch.list()).toEqual([]);
    });
    it('disabled replay refuses locally and enabled replay reaches ordinary admission without an account provider', async () => {
        for (const enabled of [false, true]) {
            let sends = 0;
            const app = createApplication(loadConfig({ STUDIO_RUNNER_SERVICE_IDENTITY: 'service', STUDIO_RUNNER_CALLBACK_IDENTITY: 'callback', STUDIO_RUNNER_CALLBACK_BASE_URL: 'https://backend.test', STUDIO_RUNNER_ALLOWED_DOMAINS: TEST_DOMAINS.join(','), STUDIO_RUNNER_ALLOW_ALL_DOMAINS: 'false' }), { listener, runtimeVersions: {}, scratch: createFakeScratchStore(), launcher: { launch() { return Promise.reject(Error('no browser')); } }, http: { send() { sends++; return Promise.resolve({ kind: 'timeout' }); } }, observed: { build: currentBuild, validationEnabled: true, replayEnabled: enabled }, logSink: createRecordingLogSink() });
            expect((await required(app.coordinator.submitObserved?.bind(app.coordinator))(job())).code).toBe(enabled ? 'ADMISSION_NOT_ACKNOWLEDGED' : 'OBSERVED_REPLAY_DISABLED');
            expect(sends).toBe(enabled ? 1 : 0);
            expect(app.pool.inUse).toBe(0);
        }
    });
});
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}

import {ObservedPreReadyFailure} from '../../src/run/errors.js';
it('delivers pre-Ready FINAL from ADMITTED without an invalid PROGRESS transition',async()=>{
    const scratch=createFakeScratchStore(),logs=createRecordingLogSink();
    const received:string[]=[];let state:'NEW'|'ADMITTED'|'RUNNING'|'FINAL'='NEW',admissions=0,launches=0;
    let final:Record<string,unknown>|null=null;
    const app=createApplication(loadConfig({STUDIO_RUNNER_SERVICE_IDENTITY:'service',STUDIO_RUNNER_CALLBACK_IDENTITY:'callback',STUDIO_RUNNER_CALLBACK_BASE_URL:'https://backend.test', STUDIO_RUNNER_ALLOWED_DOMAINS: TEST_DOMAINS.join(','), STUDIO_RUNNER_ALLOW_ALL_DOMAINS: 'false'}),{ listener,
        runtimeVersions:{},scratch,logSink:logs,
        launcher:{launch(){launches++;return Promise.reject(new ObservedPreReadyFailure('ACCOUNT_UNKNOWN',{path:null,bytes:null,error:null,state:'UNAVAILABLE',partial:false}));}},
        observed:{build:currentBuild,validationEnabled:true,replayEnabled:true},
        http:{send(request):Promise<HttpOutcome>{
            if(request.method==='GET')return Promise.resolve({kind:'response',status:200,body:'{"cancelRequested":false}'});
            const body=JSON.parse(request.body) as Record<string,unknown>;
            if(request.url.endsWith('/observed-admission')){
                admissions++;state='ADMITTED';const now=Date.now();
                return Promise.resolve({kind:'response',status:200,body:JSON.stringify({schemaVersion:3,kind:'observed',admissionId:body.admissionId,request:body,admittedAt:new Date(now).toISOString(),startDeadlineAt:new Date(now+30000).toISOString(),runDeadlineAt:new Date(now+60000).toISOString()})});
            }
            const kind=String(body.kind);received.push(kind);
            if(kind==='STARTED'&&state==='ADMITTED')state='RUNNING';
            else if(kind==='PROGRESS'&&state==='RUNNING'){ /* permitted running progress */ }
            else if(kind==='FINAL'&&(state==='ADMITTED'||state==='RUNNING')){state='FINAL';final=body;}
            else return Promise.resolve({kind:'response',status:409,body:'{"code":"OWNERSHIP_LOST"}'});
            return Promise.resolve({kind:'response',status:200,body:'{}'});
        }},
    });
    expect(await required(app.coordinator.submitObserved?.bind(app.coordinator))(job())).toEqual({status:202,code:'ADMITTED'});
    expect(await app.coordinator.awaitInFlight(1000)).toBe(true);
    expect(received).toEqual(['FINAL']);expect(admissions).toBe(1);expect(launches).toBe(1);
    expect(final).toMatchObject({browserStartedAt:null,outcome:{result:'ERROR',errorMessage:'ACCOUNT_UNKNOWN'},evidence:{state:'UNAVAILABLE',partial:false}});
    const steps=required(final as Record<string,unknown>|null).steps as Record<string,unknown>[];
    expect(steps).toHaveLength(3);for(const step of steps)expect(step).toMatchObject({status:'SKIPPED',startedAtMs:null,finishedAtMs:null,durationMs:null,failure:null});
    expect(logs.lines.join('\n')).not.toContain('ownership_lost');expect(await scratch.list()).toEqual([]);
});

const CONTROL_WINDOW_CANARY='control-window-unit-only';
const controlWindowStepId=(index:number)=>'00000000-0000-4000-8000-'+String(301+index).padStart(12,'0');
function controlWindowJob(origin:string,build:BuildIdentity,timeoutSeconds=10):{job:ObservedJob}{
  const job=structuredClone(fixture.job) as ObservedJob;
  const scope:Scope={...job.binding.scope,initialContext:{kind:'initialBlank'}};
  
  const configuration={...job.configuration,timeoutSeconds,waitStrategy:'domcontentloaded' as const,viewport:{width:800,height:600}};
  const inputRecipes:Artifact3['inputRecipes']=[{inputId:'nav',stepId:controlWindowStepId(0),kind:'destination',intendedSlot:'navigate.destination',provenance:{kind:'sourceSpan',start:0,end:1,sourceHash:job.artifact.sourceHash}},...(['PASS','NEXT'] as const).map((referenceName,index)=>({inputId:referenceName.toLowerCase(),stepId:controlWindowStepId(index+1),kind:'secretRef' as const,intendedSlot:'fill.value' as const,provenance:{kind:'configuration' as const,referenceId:'reference-'+referenceName,referenceName}}))];
  const steps:Artifact3['steps']=[{stepIndex:0,stepId:controlWindowStepId(0),operations:[{coordinate:{stepId:controlWindowStepId(0),ordinal:0},guardId:'g0',operation:{kind:'navigate',destinationInputId:'nav'}}]},...(['pass','next'] as const).map((input,index)=>({stepIndex:index+1,stepId:controlWindowStepId(index+1),operations:[{coordinate:{stepId:controlWindowStepId(index+1),ordinal:0},guardId:'g'+String(index+1),operation:{kind:'fill' as const,value:{kind:'secretRef' as const,sourceInputId:input}}}]})),{stepIndex:3,stepId:controlWindowStepId(3),operations:[{coordinate:{stepId:controlWindowStepId(3),ordinal:0},guardId:'g3',operation:{kind:'click'}}]}];
  const guards:Artifact3['guards']=[{guardId:'g0',origin:null,target:{kind:'initialBlank'}},{guardId:'g1',origin,target:{kind:'passwordControl'}},{guardId:'g2',origin,target:{kind:'passwordControl'}},{guardId:'g3',origin,target:{kind:'element',locator:[{by:'role',role:'button',name:'Continue',exact:true}],tier:'role',identity:{role:'button',name:'Continue'},readRuleId:null}}];
  const {principalId,...requirements}=scope;
  const actions:Artifact3['learnedPlan']['actions']=steps.flatMap(step=>step.operations.map(action=>{
    const guard=guards.find(g=>g.guardId===action.guardId);if(!guard)throw Error('GUARD');
    if(guard.origin===null){
      if(action.operation.kind!=='navigate'||action.coordinate.ordinal!==0)throw Error('BLANK_ACTION');
      const projection={coordinate:{stepId:action.coordinate.stepId,ordinal:0 as const},origin:null,target:null,operation:action.operation};
      return {...projection,admissionId:'control-admission-'+String(step.stepIndex),operationHash:hashObserved(projection)};
    }
    const projection={coordinate:action.coordinate,origin:guard.origin,target:guard.target.kind==='element'?{locator:guard.target.locator,tier:guard.target.tier,identity:guard.target.identity}:null,operation:action.operation};
    return {...projection,admissionId:'control-admission-'+String(step.stepIndex),operationHash:hashObserved(projection)};
  }));
  const learnedPlan={...job.artifact.learnedPlan,sourceSteps:steps.map(s=>s.stepId),actions,bindings:[]};
  const learnedPlanHash=hashObserved(learnedPlan),configurationHash=hashObserved(configuration);
  const artifact:Artifact3={...job.artifact,configurationHash,learnedPlan,learnedPlanHash,inputRecipes,steps,guards,replayPolicy:{...job.artifact.replayPolicy,learnedPlanHash,scope:requirements,inputs:inputRecipes,bindings:[],transfers:[]}};
  const now=Date.now(),scopeHash=hashObserved(scope);
  const binding={...job.binding,artifactHash:hashObserved(artifact),configurationHash,learnedPlanHash,referencePolicyHash:hashObserved(artifact.replayPolicy),publicationEvidenceHash:artifact.replayPolicy.publicationEvidenceHash,requiredBuild:build,requiredProfile:OBSERVED_PROFILE,scope,scopeHash,principalId,startedAt:new Date(now).toISOString(),replayGrant:{...job.binding.replayGrant,scopeHash,profileHash:hashObserved(OBSERVED_PROFILE),buildHash:hashObserved(build),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+30000).toISOString()}};
  return {job:{...job,binding,artifact,configuration,inputs:[{inputId:'nav',value:origin+'/login'}],secrets:{PASS:CONTROL_WINDOW_CANARY,NEXT:CONTROL_WINDOW_CANARY+'-next'},secretOrigins:{PASS:[origin],NEXT:[origin]},runtime:{stepTimeoutMs:timeoutSeconds*1000,totalRuntimeMs:20000},recording:{width:800,height:600}}};
}

// STUDIO-OBS-015 G (aria-g-ruling01): every contract-valid timeoutSeconds reaches ordinary admission
// under the default runner configuration. Before the ceiling fix, 31 and 120 were refused locally
// (400 LIMIT_EXCEEDED, no admission send).
it.each([30,31,120])('admits an authored step timeout of %i s under the default runner configuration',async timeoutSeconds=>{
  const {job:timedJob}=controlWindowJob('https://unit-timeout.example.test',currentBuild as BuildIdentity,timeoutSeconds);
  let sends=0,launches=0;
  const app=createApplication(loadConfig({STUDIO_RUNNER_SERVICE_IDENTITY:'service',STUDIO_RUNNER_CALLBACK_IDENTITY:'callback',STUDIO_RUNNER_CALLBACK_BASE_URL:'https://backend.test', STUDIO_RUNNER_ALLOWED_DOMAINS: TEST_DOMAINS.join(','), STUDIO_RUNNER_ALLOW_ALL_DOMAINS: 'false'}),{ listener,
    runtimeVersions:{},scratch:createFakeScratchStore(),logSink:createRecordingLogSink(),
    launcher:{launch(){launches++;return Promise.reject(Error('unexpected'));}},
    observed:{build:currentBuild as BuildIdentity,validationEnabled:true,replayEnabled:true},
    http:{send():Promise<HttpOutcome>{sends++;return Promise.resolve({kind:'timeout'});}},
  });
  expect(await required(app.coordinator.submitObserved?.bind(app.coordinator))(timedJob)).toEqual({status:503,code:'ADMISSION_NOT_ACKNOWLEDGED'});
  expect(sends).toBe(1);
  expect(launches).toBe(0);
});

it.each(['late-tick','expired-tick','late-valid-response'] as const)('keeps a secret control read inside its original absolute window: %s',async mode=>{
  const controlClock=createFakeScheduler();let lateness=0;
  const {job:secretJob}=controlWindowJob('https://unit-control.example.test',currentBuild as BuildIdentity);
  const requests:{timeoutMs:number;started:number}[]=[];
  const reports:Record<string,unknown>[]=[];
  let launches=0,aborts=0,releaseLaunch:()=>void=()=>undefined,resolveControl:(outcome:HttpOutcome)=>void=()=>undefined;
  const neverBody=new Promise<HttpOutcome>(resolve=>{resolveControl=resolve;});
  const logs=createRecordingLogSink();
  const app=createApplication(loadConfig({STUDIO_RUNNER_SERVICE_IDENTITY:'service',STUDIO_RUNNER_CALLBACK_IDENTITY:'callback',STUDIO_RUNNER_CALLBACK_BASE_URL:'https://backend.test', STUDIO_RUNNER_ALLOWED_DOMAINS: TEST_DOMAINS.join(','), STUDIO_RUNNER_ALLOW_ALL_DOMAINS: 'false'}),{ listener,
    runtimeVersions:{},scratch:createFakeScratchStore(),logSink:logs,
    now:()=>controlClock.now()+lateness,controlTimers:controlClock,
    launcher:{launch(request){launches++;return new Promise<never>((_resolve,reject)=>{
      releaseLaunch=()=>{reject(new ObservedPreReadyFailure('CONTEXT_LOST',{path:null,bytes:null,error:null,state:'UNAVAILABLE',partial:false}));};
      request.signal?.addEventListener('abort',()=>{aborts++;releaseLaunch();},{once:true});
    });}},
    observed:{build:currentBuild as BuildIdentity,validationEnabled:true,replayEnabled:true},
    http:{send(request):Promise<HttpOutcome>{
      if(request.method==='GET'){
        requests.push({timeoutMs:request.timeoutMs,started:controlClock.now()+lateness});
        if(mode==='late-tick')lateness+=5; // Original send setup consumes policy time, not extra tolerance.
        return neverBody;
      }
      const body=JSON.parse(request.body) as Record<string,unknown>;
      if(request.url.endsWith('/observed-admission')){
        const now=Date.now();return Promise.resolve({kind:'response',status:200,body:JSON.stringify({schemaVersion:3,kind:'observed',admissionId:body.admissionId,request:body,admittedAt:new Date(now).toISOString(),startDeadlineAt:new Date(now+15000).toISOString(),runDeadlineAt:new Date(now+30000).toISOString()})});
      }
      reports.push(body);return Promise.resolve({kind:'response',status:200,body:'{}'});
    }},
  });
  try{
    expect(await required(app.coordinator.submitObserved?.bind(app.coordinator))(secretJob)).toEqual({status:202,code:'ADMITTED'});
    await until(()=>launches===1);expect(controlClock.pending()).toEqual([1000]);
    lateness=mode==='late-tick'?37:mode==='expired-tick'?1000:0;
    controlClock.advance(1000);
    if(mode==='late-tick'){
      expect(requests).toEqual([{timeoutMs:938,started:1037}]); // window end 2000 − CONTROL_WINDOW_MARGIN_MS
      expect(controlClock.scheduled.at(-1)).toEqual({atMs:1000,delayMs:933});
      expect(controlClock.now()+lateness+933).toBe(2000-CONTROL_WINDOW_MARGIN_MS);
      controlClock.advance(933);
    }else if(mode==='expired-tick'){
      expect(requests).toEqual([]);expect(controlClock.scheduled).toHaveLength(1);
    }else{
      expect(requests).toEqual([{timeoutMs:1000-CONTROL_WINDOW_MARGIN_MS,started:1000}]);
      expect(controlClock.pending()).toEqual([1000-CONTROL_WINDOW_MARGIN_MS]);
      controlClock.skip(1000-CONTROL_WINDOW_MARGIN_MS); // The existing timeout callback is deliberately not dispatched yet.
      resolveControl({kind:'response',status:200,body:JSON.stringify({executionId:secretJob.binding.executionId,cancelRequested:false,revoked:false})});
    }
    await until(()=>aborts===1);expect(await app.coordinator.awaitInFlight(1000)).toBe(true);
    expect(launches).toBe(1);expect(aborts).toBe(1);expect(app.pool.inUse).toBe(0);
    expect(controlClock.pending()).toEqual([]);expect(requests).toHaveLength(mode==='expired-tick'?0:1);
    expect(reports.some(body=>body.kind==='FINAL')).toBe(true);
    expect(reports.filter(body=>body.kind==='FINAL')).toHaveLength(1);
    // 012A ruling R8.3: the self-stop's FINAL shape, not only its existence. The window loss is
    // the runner's own decision, so the outer code is RUN_ERROR and the reason is the launcher's.
    const final=required(reports.find(body=>body.kind==='FINAL'));
    expect(final).toMatchObject({runnerSequence:1,browserStartedAt:null,outcome:{result:'ERROR',errorCode:'RUN_ERROR',errorMessage:'CONTEXT_LOST'}});
    expectUntimedSkipped(final,secretJob.artifact.steps.length);
    expect(stopEvents(logs)).toEqual([{source:'control-window',recorded:false}]);
  }finally{
    releaseLaunch();resolveControl({kind:'timeout'});expect(await app.coordinator.awaitInFlight(1000)).toBe(true);
  }
});

// ── 012A ruling R8: a pre-Ready self-stop against a backend that applies the pre-Ready rule ─────

/** The backend's fixed pre-Ready reason set (RunnerReportProjection.requireObservedPreReadyFailure). */
const PRE_READY_REASONS=new Set(['INVALID_CONTRACT','PROFILE_MISMATCH','POLICY_REFUSED','AUTHORIZATION_EXPIRED','REFERENCE_MISMATCH','PASSWORD_CONTROL_READ_REFUSED','TARGET_DRIFT','TIMEOUT','CANCELLED','INTERNAL_ERROR']);

/**
 * The backend's observed pre-Ready predicate, applied literally (ProgressReportService +
 * requireObservedPreReadyFailure). Absent JSON fields read as null, as Jackson does.
 */
function preReadyAccepted(body:Record<string,unknown>,sourceCount:number):boolean{
  const outcome=(body.outcome??null) as Record<string,unknown>|null;
  const steps=(body.steps??null) as (Record<string,unknown>|null)[]|null;
  const logs=(body.logs??null) as (Record<string,unknown>|null)[]|null;
  if(body.kind!=='FINAL'||body.runnerSequence!==1||(body.browserStartedAt??null)!==null||outcome===null)return false;
  if(outcome.result!=='ERROR'||outcome.errorCode!=='RUN_ERROR'||typeof outcome.errorMessage!=='string'||!PRE_READY_REASONS.has(outcome.errorMessage))return false;
  if(sourceCount<1||sourceCount>100||!Array.isArray(steps)||steps.length!==sourceCount)return false;
  const seen=new Set<number>();
  for(const step of steps){
    if(step===null)return false;
    const index=step.stepIndex;
    if(typeof index!=='number'||!Number.isInteger(index)||index<0||index>=sourceCount||seen.has(index))return false;
    seen.add(index);
    if(step.status!=='SKIPPED'||[step.failure,step.startedAtMs,step.finishedAtMs,step.durationMs].some(value=>(value??null)!==null))return false;
  }
  return logs===null||logs.every(log=>log!==null&&(log.atMs??null)===null);
}

function expectUntimedSkipped(final:Record<string,unknown>,sourceCount:number):void{
  const steps=final.steps as Record<string,unknown>[];
  expect(steps).toHaveLength(sourceCount);
  for(const step of steps)expect(step).toMatchObject({status:'SKIPPED',startedAtMs:null,finishedAtMs:null,durationMs:null,failure:null});
}

function events(logs:{readonly lines:readonly string[]},event:string):Record<string,unknown>[]{
  return logs.lines.map(line=>JSON.parse(line) as Record<string,unknown>).filter(line=>line.event===event);
}

function stopEvents(logs:{readonly lines:readonly string[]}):{source:unknown;recorded:unknown}[]{
  return events(logs,'run.cancel_requested').map(line=>({source:line.source,recorded:line.recorded}));
}

type ControlAnswer=(executionId:string)=>HttpOutcome;

/**
 * One secret-bearing observed run held in launch, against a fake backend that answers a FINAL the
 * way the real one does: with no recorded cancel it applies the pre-Ready predicate and refuses
 * anything else with 400; with a recorded cancel (the only time it answers `cancelRequested:true`
 * or relays a DELETE) the normal terminal path admits it.
 */
function strictPreReadyRun(options:{launchReason:string;rejectOnAbort:boolean;control?:ControlAnswer;launcher?:BrowserLauncher;scratch?:ScratchStore}){
  const controlClock=createFakeScheduler();
  const {job:secretJob}=controlWindowJob('https://unit-control.example.test',currentBuild as BuildIdentity);
  const sourceCount=secretJob.artifact.steps.length;
  const logs=createRecordingLogSink();
  const backend={cancelRecorded:false,finals:[] as {body:Record<string,unknown>;status:number}[],controlReads:0};
  const state={lateness:0,launches:0,aborts:0,release:():void=>undefined};
  const launcher:BrowserLauncher=options.launcher??{launch(request){state.launches++;return new Promise<never>((_resolve,reject)=>{
    state.release=()=>{reject(new ObservedPreReadyFailure(options.launchReason,{path:null,bytes:null,error:null,state:'UNAVAILABLE',partial:false}));};
    request.signal?.addEventListener('abort',()=>{state.aborts++;if(options.rejectOnAbort)state.release();},{once:true});
  });}};
  const app=createApplication(loadConfig({STUDIO_RUNNER_SERVICE_IDENTITY:'service',STUDIO_RUNNER_CALLBACK_IDENTITY:'callback',STUDIO_RUNNER_CALLBACK_BASE_URL:'https://backend.test', STUDIO_RUNNER_ALLOWED_DOMAINS: TEST_DOMAINS.join(','), STUDIO_RUNNER_ALLOW_ALL_DOMAINS: 'false'}),{ listener,
    runtimeVersions:{},scratch:options.scratch??createFakeScratchStore(),logSink:logs,
    now:()=>controlClock.now()+state.lateness,controlTimers:controlClock,launcher,
    observed:{build:currentBuild as BuildIdentity,validationEnabled:true,replayEnabled:true},
    http:{send(request):Promise<HttpOutcome>{
      if(request.method==='GET'){
        backend.controlReads++;
        const answer=(options.control??(id=>({kind:'response',status:200,body:JSON.stringify({executionId:id,cancelRequested:false,revoked:false})})))(secretJob.binding.executionId);
        if(answer.kind==='response'&&answer.status===200&&ackRequestsCancel(answer.body))backend.cancelRecorded=true;
        return Promise.resolve(answer);
      }
      const body=JSON.parse(request.body) as Record<string,unknown>;
      if(request.url.endsWith('/observed-admission')){
        const now=Date.now();return Promise.resolve({kind:'response',status:200,body:JSON.stringify({schemaVersion:3,kind:'observed',admissionId:body.admissionId,request:body,admittedAt:new Date(now).toISOString(),startDeadlineAt:new Date(now+15000).toISOString(),runDeadlineAt:new Date(now+30000).toISOString()})});
      }
      // ADMITTED ownership admits no PROGRESS or STARTED here: no browser was ever started.
      if(body.kind!=='FINAL')return Promise.resolve({kind:'response',status:409,body:'{"error":"OWNERSHIP_LOST"}'});
      const status=backend.cancelRecorded||preReadyAccepted(body,sourceCount)?200:400;
      backend.finals.push({body,status});
      return Promise.resolve(status===200?{kind:'response',status,body:'{}'}:{kind:'response',status,body:'{"error":"INVALID_REPORT","message":"Invalid observed pre-Ready terminal report"}'});
    }},
  });
  const recordCancel=():void=>{backend.cancelRecorded=true;expect(app.coordinator.cancel(secretJob.binding.executionId)).toEqual({status:202,code:'CANCELLING'});};
  const finalOf=():Record<string,unknown>=>{expect(backend.finals).toHaveLength(1);const only=required(backend.finals[0]);expect(only.status).toBe(200);return only.body;};
  const expectDelivered=():void=>{expect(events(logs,'report.terminal_delivered')).toHaveLength(1);expect(events(logs,'report.terminal_rejected')).toEqual([]);};
  return {app,controlClock,secretJob,sourceCount,logs,backend,state,recordCancel,finalOf,expectDelivered,
    submit:async()=>{expect(await required(app.coordinator.submitObserved?.bind(app.coordinator))(secretJob)).toEqual({status:202,code:'ADMITTED'});},
    /** The incident's shape: the first secret control tick fires a whole window late (host stall). */
    stallPastWindow:()=>{state.lateness=1000;controlClock.advance(1000);},
    settle:async()=>{expect(await app.coordinator.awaitInFlight(2000)).toBe(true);expect(app.pool.inUse).toBe(0);},
  };
}

describe('012A R8: a pre-Ready stop is CANCELLED only when the API recorded it', () => {
  it('pre-Ready control-window self-stop is a conformant RUN_ERROR/CANCELLED FINAL',async()=>{
    // launcher.ts throws ObservedPreReadyFailure('CANCELLED') on abort when the child sent no result.
    const run=strictPreReadyRun({launchReason:'CANCELLED',rejectOnAbort:true});
    await run.submit();await until(()=>run.state.launches===1);
    run.stallPastWindow();
    await until(()=>run.state.aborts===1);await run.settle();
    expect(run.backend.controlReads).toBe(0); // The stalled tick never had time to ask.
    const final=run.finalOf();
    expect(final).toMatchObject({runnerSequence:1,browserStartedAt:null,outcome:{result:'ERROR',errorCode:'RUN_ERROR',errorMessage:'CANCELLED'}});
    expectUntimedSkipped(final,run.sourceCount);
    expect(stopEvents(run.logs)).toEqual([{source:'control-window',recorded:false}]);
    run.expectDelivered();expect(run.state.aborts).toBe(1);
  });

  it('a recorded control acknowledgement during launch stays outer CANCELLED',async()=>{
    const run=strictPreReadyRun({launchReason:'CANCELLED',rejectOnAbort:true,control:id=>({kind:'response',status:200,body:JSON.stringify({executionId:id,cancelRequested:true,revoked:false})})});
    await run.submit();await until(()=>run.state.launches===1);
    run.controlClock.advance(1000);
    await until(()=>run.state.aborts===1);await run.settle();
    expect(run.backend.controlReads).toBe(1);
    expect(run.finalOf()).toMatchObject({browserStartedAt:null,outcome:{result:'ERROR',errorCode:'CANCELLED',errorMessage:'CANCELLED'}});
    expect(stopEvents(run.logs)).toEqual([{source:'control',recorded:true}]);
    run.expectDelivered();
  });

  it('a recorded DELETE during launch stays outer CANCELLED',async()=>{
    const run=strictPreReadyRun({launchReason:'CANCELLED',rejectOnAbort:true});
    await run.submit();await until(()=>run.state.launches===1);
    run.recordCancel();
    await until(()=>run.state.aborts===1);await run.settle();
    expect(run.finalOf()).toMatchObject({browserStartedAt:null,outcome:{result:'ERROR',errorCode:'CANCELLED',errorMessage:'CANCELLED'}});
    expect(stopEvents(run.logs)).toEqual([{source:'delete',recorded:true}]);
    run.expectDelivered();
  });

  it('a recorded DELETE after a self-stop, before the launch settles, upgrades to CANCELLED with one stop',async()=>{
    const run=strictPreReadyRun({launchReason:'CANCELLED',rejectOnAbort:false});
    await run.submit();await until(()=>run.state.launches===1);
    run.stallPastWindow();
    await until(()=>run.state.aborts===1);
    run.recordCancel();
    run.state.release();await run.settle();
    expect(run.state.aborts).toBe(1); // The upgrade records the fact; it never orders a second stop.
    expect(run.finalOf()).toMatchObject({browserStartedAt:null,outcome:{result:'ERROR',errorCode:'CANCELLED',errorMessage:'CANCELLED'}});
    expect(stopEvents(run.logs)).toEqual([{source:'control-window',recorded:false}]);
    run.expectDelivered();
  });

  it('a pre-Ready launch-wait expiry is a conformant RUN_ERROR/TIMEOUT FINAL (R8-ADJ-2)',async()=>{
    // The real launcher with a silent child: its pre-Ready wait expires (launchTimeoutMs 60).
    const driver=createChildDriver({ready:false});
    const root=mkdtempSync(join(tmpdir(),'studio-runner-adj2-'));
    try{
    const run=strictPreReadyRun({launchReason:'unused',rejectOnAbort:false,launcher:driver.launcher,scratch:createFsScratchStore(root)});
    await run.submit();await run.settle();
    expect(driver.spawner.children[0]?.killed).toBe(1);
    const final=run.finalOf();
    expect(final).toMatchObject({runnerSequence:1,browserStartedAt:null,outcome:{result:'ERROR',errorCode:'RUN_ERROR',errorMessage:'TIMEOUT'}});
    expectUntimedSkipped(final,run.sourceCount);
    expect(stopEvents(run.logs)).toEqual([]);
    run.expectDelivered();
    }finally{rmSync(root,{recursive:true,force:true});}
  });
});
