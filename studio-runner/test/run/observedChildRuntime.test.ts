import {retainedReplay,retainedSecretReplay} from '../helpers/retainedReplay.js';
import {createChildBrowserLauncher} from '../../src/run/launcher.js';
import type {ChildProcessHandle,ChildSpawner} from '../../src/run/launcher.js';
import type {ObservedJob} from '../../src/executor/observedOperations.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import type {ValidationBasis} from '../../src/executor/observedOperations.js';
const fixture=JSON.parse(readFileSync(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json',import.meta.url),'utf8')) as {build:BuildIdentity;launch:Launch3;execute:Execute3;basis:ValidationBasis;job:ObservedJob};
import {attachChildRuntime} from '../../src/run/childRuntime.js';
import type {ObservedChildMessage} from '../../src/run/protocol.js';
import type {Launch3, Execute3, BuildIdentity} from '../../src/executor/observedOperations.js';
import {hashObserved, OBSERVED_SCHEMA_BUNDLE_HASH} from '../../src/validator/observedReferencePolicy.js';
import type {Observation, ObservationSession} from '../../src/run/observationTypes.js';
import type {BrowserHandle} from '../../src/run/browserFactory.js';
import {createFakePage} from '../helpers/child.js';
import {PasswordNoEffect} from '../../src/run/passwordControl.js';
import {BrowserStartupCleanupFailure} from '../../src/run/browserFactory.js';

function driver(fault: 'none'|'launch'|'cleanup-unconfirmed'|'close'|'read'|'target'|'secret'|'secret-delay'|'launch-delay' = 'none', withRetained=false,freshReadValue='private-fresh-value',retainedSecret=false) {
  const build: BuildIdentity = {...fixture.build, schemaBundleHash: OBSERVED_SCHEMA_BUNDLE_HASH};
  const retained=withRetained?(retainedSecret?retainedSecretReplay():retainedReplay()):null;
  const launch = structuredClone(retained?.launch??fixture.launch);
  const now = Date.now();
  (launch as {build: BuildIdentity}).build = build;
  (launch.admission.request as {build: BuildIdentity}).build = build;
  (launch.admission as {startDeadlineAt: string; runDeadlineAt: string}).startDeadlineAt = new Date(now+5000).toISOString();
  (launch.admission as {runDeadlineAt: string}).runDeadlineAt = new Date(now+10000).toISOString();
  const execute = structuredClone(retained?.execute??fixture.execute);
  const messages: ObservedChildMessage[] = [], exits: number[] = [], captured: string[] = [], withheld: string[] = [];
  let parentMessage:(value:unknown)=>void=()=>undefined,parentExit:()=>void=()=>undefined;
  let listener: (value: unknown) => void = () => undefined, popup: () => void = () => undefined, clock = 0;
  const observation = structuredClone(fixture.basis.observations[0]?.observation) as Observation | undefined;
  if (!observation) throw new Error('OBSERVATION');
  observation.nodes = execute.guards.flatMap(guard => guard.target.kind !== 'element' || guard.target.classification === 'withheld' ? [] : [{nodeId: guard.guardId, documentId: observation.documentId, generation: observation.generation, role: guard.target.role, name: '', elementType: guard.target.elementType, controlType: guard.target.controlType, classification: guard.target.classification, policyRuleId: guard.target.readRuleId ?? 'fixture-structural', visible: guard.target.visible, actionable: guard.target.actionable, depth: 0, parentNodeId: null, regionId: null, formId: null, labelNodeIds: [], locatorHints: [guard.target.locator]}]);
  const observationDispose = vi.fn(() => Promise.resolve());
  let releaseSecret:()=>void=()=>undefined;
  const pendingSecret=new Promise<void>(resolve=>{releaseSecret=resolve;});
  const observations: ObservationSession = {
    observe: () => Promise.resolve({observation, json: '{}', bytes: 2, observationHash: hashObserved(observation)}),
    acquire: request => { const node = observation.nodes.find(node => node.locatorHints.some(hint => hashObserved(hint) === hashObserved(request.locator))); return Promise.resolve(fault === 'target' || !node ? {kind: 'REFUSED', code: 'TARGET_DRIFT'} : {kind: 'READY', target: {nodeId: node.nodeId, documentId: observation.documentId, generation: observation.generation}}); },
    matches: () => Promise.resolve(true), validateInvocation: () => Promise.resolve(true),
    invoke(invocation, control) { control?.beginInvocation(); if (fault === 'read') return Promise.reject(new Error('PRIVATE-ERROR')); if (invocation.operation.kind === 'read') return Promise.resolve({value: freshReadValue}); if (invocation.resolvedValue) captured.push(invocation.resolvedValue); return Promise.resolve({assertionPassed: true}); },
    withhold(values) { withheld.push(...values); return Promise.resolve(); },
    preparePassword: () => Promise.resolve(),
    fillPassword(_target, _origin, _allowed, value, control) { control?.beginInvocation(); if (fault === 'secret') return Promise.reject(new PasswordNoEffect('PASSWORD_FORM_ACTION_NOT_ALLOWED')); captured.push(value); return fault==='secret-delay'?pendingSecret:Promise.resolve(); },
    dispose: observationDispose,
  };
  const close = vi.fn(() => fault === 'close' ? Promise.reject(new Error('PRIVATE-CLOSE')) : Promise.resolve(null));
  const dispose = vi.fn(() => Promise.resolve());
  const handle: BrowserHandle = {page: createFakePage(), observedAppVideoPath:()=>Promise.resolve("/unit/app.webm"), createObservationSession: () => observations, observedBlankMatches: () => Promise.resolve(true), observedInitialContextMatches: () => Promise.resolve(true), observedWait: () => Promise.resolve(), observedNavigateBlank: (_destination, control) => {control?.beginInvocation();return Promise.resolve();}, onExtraPage(fn) {popup=fn;}, observedHosts: () => [], close, dispose};
  let releaseLaunch: (handle: BrowserHandle) => void = () => undefined;
  const pendingLaunch = new Promise<BrowserHandle>(resolve => {releaseLaunch=resolve;});
  const open = vi.fn(() => fault==='cleanup-unconfirmed'?Promise.reject(new BrowserStartupCleanupFailure()):fault === 'launch' ? Promise.reject(new Error('PRIVATE-LAUNCH')) : fault === 'launch-delay' ? pendingLaunch : Promise.resolve(handle));
  attachChildRuntime({channel: {onMessage(fn) {listener=fn;}, send(message) {messages.push(message);parentMessage(message);}, exit(code) {exits.push(code);parentExit();}}, browsers: {launch: open}, observedBuild: build,publishAppVideoOwner:()=>undefined, originSource: {monotonicNow: () => ++clock, wallNow: () => new Date()}, sleep: () => Promise.resolve()});
  const result = () => messages.find(message => message.kind === 'result' && 'mode' in message);
  const child:ChildProcessHandle={pid:123,send(message){listener(message);},onMessage(callback){parentMessage=callback;},onExit(callback){parentExit=()=>{callback(0,null);};},onOutput(){return;},kill(){listener({kind:'stop'});}};
  const spawner:ChildSpawner={spawn:()=>child};
  return {retained,spawner,launch, execute, messages, exits, captured, withheld, observations, handle, close, dispose, observationDispose, open, releaseSecret,releaseLaunch: () => {releaseLaunch(handle);}, send: (value: unknown) => {listener(value);}, popup: () => {popup();}, result};
}
describe('actual observed child lifecycle against the browser-free factory seam', () => {
  it('replays identical retained artifact bytes twice through actual launcher and child validators with fresh admissions',async()=>{
    const hashes:string[]=[];
    for(let run=0;run<2;run++){
      const h=driver('none',true,`fresh-${String(run)}`);if(!h.retained)throw new Error('RETAINED');hashes.push(hashObserved(h.retained.artifact));
      const root=await mkdtemp(join(tmpdir(),'retained-launch-unit-'));
      const job={...structuredClone(fixture.job),artifact:h.retained.artifact,configuration:h.retained.basis.configuration,inputs:h.execute.inputs.flatMap(input=>input.kind==='secretRef'?[]:[{inputId:input.inputId,value:input.value}]),binding:{...fixture.job.binding,executionId:h.launch.runId,attemptId:h.launch.attemptId,configurationHash:h.launch.configurationHash,scope:h.launch.scope,scopeHash:h.launch.scopeHash,requiredBuild:h.launch.build,requiredProfile:h.launch.profile},secrets:{},secretOrigins:{}} as ObservedJob;
      const launcher=createChildBrowserLauncher({recording:h.launch.recording,stepTimeoutMs:h.execute.stepTimeoutMs,launchTimeoutMs:1000,maxFailureMessageLength:400,seekOriginCalibrationMs:0,stopTimeoutMs:100,spawner:h.spawner});
      try{const session=await launcher.launch({browser:'chromium',viewport:h.launch.viewport,totalRuntimeMs:10000,stepTimeoutMs:h.execute.stepTimeoutMs,scratchPath:root,observed:{job,admission:h.launch.admission,policy:h.launch.policy}});const result=await session.run.execute({reporter:{stepStarted:()=>undefined,stepFinished:()=>undefined}});expect(result.ok).toBe(true);expect(h.messages.filter(m=>m.kind==='result')).toHaveLength(1);expect(h.withheld).toContain(`fresh-${String(run)}`);expect(h.open).toHaveBeenCalledOnce();await session.close();}finally{await rm(root,{recursive:true,force:true});}
    }
    expect(hashes[0]).toBe(hashes[1]);
  });
  it('retains a private accepted Launch snapshot despite later caller mutation',async()=>{
    const h=driver('none',true);h.send(h.launch);await vi.waitFor(()=>{expect(h.messages.some(m=>m.kind==='ready')).toBe(true);});(h.launch.admission.request as {artifactHash:string}).artifactHash='f'.repeat(64);h.send(h.execute);await vi.waitFor(()=>{expect(h.exits).toEqual([0]);});expect(h.result()?.ok).toBe(true);h.send(h.execute);await Promise.resolve();expect(h.messages.filter(m=>m.kind==='result')).toHaveLength(1);
  });
  it('accepts Execute after startDeadline when the same Launch already reached Ready',async()=>{
    vi.useFakeTimers({toFake:['Date']});const start=Date.now();
    try{const h=driver('none',true);(h.launch.admission as {startDeadlineAt:string}).startDeadlineAt=new Date(start+500).toISOString();h.send(h.launch);await vi.waitFor(()=>{expect(h.messages.some(m=>m.kind==='ready')).toBe(true);});vi.setSystemTime(start+1000);h.send(h.execute);await vi.waitFor(()=>{expect(h.exits).toEqual([0]);});expect(h.result()?.ok).toBe(true);}finally{vi.useRealTimers();}
  });
  it('preserves child secret withholding, frame erasure and value-free output with retained proof',async()=>{
    const h=driver('none',true,'fresh-retained-business-canary',true);h.send(h.launch);await vi.waitFor(()=>{expect(h.messages.some(m=>m.kind==='ready')).toBe(true);});h.send(h.execute);await vi.waitFor(()=>{expect(h.exits).toEqual([0]);});expect(h.result()).toMatchObject({ok:true,secretUse:{PASS:'USED'}});expect(h.withheld).toEqual(expect.arrayContaining(['released-secret-canary','fresh-retained-business-canary']));expect(h.execute.secrets).toEqual({PASS:''});expect(JSON.stringify(h.execute.retainedArtifact)).not.toMatch(/released-secret-canary|fresh-retained-business-canary/u);expect(JSON.stringify(h.messages)).not.toMatch(/released-secret-canary|fresh-retained-business-canary/u);
  });
  it.each(['execute-before-launch','launch-replacement']as const)('refuses %s without replay native input',async mode=>{
    const h=driver('none',true),invoke=vi.spyOn(h.observations,'invoke'),navigate=vi.spyOn(h.handle,'observedNavigateBlank');if(mode==='launch-replacement'){h.send(h.launch);await vi.waitFor(()=>{expect(h.messages.some(m=>m.kind==='ready')).toBe(true);});h.send(h.launch);}else h.send(h.execute);await vi.waitFor(()=>{expect(h.exits).toEqual([0]);});expect(invoke).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();
  });
  it('refuses a malformed retained proof before any replay native invocation',async()=>{
    const h=driver('none',true),invoke=vi.spyOn(h.observations,'invoke'),navigate=vi.spyOn(h.handle,'observedNavigateBlank');h.send(h.launch);await vi.waitFor(()=>{expect(h.messages.some(m=>m.kind==='ready')).toBe(true);});h.send({...h.execute,retainedArtifact:{...h.execute.retainedArtifact,trusted:true}});await vi.waitFor(()=>{expect(h.exits).toEqual([0]);});expect(invoke).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();expect(h.captured).toEqual([]);expect(h.result()?.ok).toBe(false);
  });
  it('consumes the admitted runtime window during startup without granting a new allowance on late page readiness',async()=>{
    const h=driver('launch-delay');(h.launch as {totalRuntimeMs:number}).totalRuntimeMs=100;h.send(h.launch);await vi.waitFor(()=>{expect(h.open).toHaveBeenCalledOnce();});await new Promise<void>(r=>setTimeout(r,130));expect(h.exits).toEqual([]);h.releaseLaunch();await vi.waitFor(()=>{expect(h.exits).toEqual([0]);});expect(h.messages.some(m=>m.kind==='ready')).toBe(false);expect(h.result()).toMatchObject({errorCode:'TIMEOUT'});expect(h.dispose).toHaveBeenCalledOnce();
  });
  it('keeps an unconfirmed startup cleanup alive for the parent tree kill without Ready or clean-exit claim',async()=>{const h=driver('cleanup-unconfirmed');h.send(h.launch);await vi.waitFor(()=>{expect(h.result()).toBeDefined();});expect(h.exits).toEqual([]);expect(h.messages.some(m=>m.kind==='ready')).toBe(false);h.send({kind:'stop'});await Promise.resolve();expect(h.exits).toEqual([]);});
  it('disposes a late browser launch after cancellation without minting Ready or executing', async () => {
    const h=driver('launch-delay');h.send(h.launch);await vi.waitFor(()=>{ expect(h.open).toHaveBeenCalledOnce(); });h.send({kind:'stop'});expect(h.exits).toEqual([]);h.releaseLaunch();await vi.waitFor(()=>{ expect(h.dispose).toHaveBeenCalledOnce();expect(h.exits).toEqual([0]); });expect(h.messages.some(message=>message.kind==='ready')).toBe(false);expect(h.result()).toMatchObject({ok:false,errorCode:'CANCELLED'});expect(h.captured).toEqual([]);
  });
  it.each(['none','secret','secret-delay'] as const)('binds run-scoped secret IPC and wipes its frame on %s', async fault => {
    const h=driver(fault), stepId=fixture.execute.steps[1]?.stepId;
    const firstStep=h.execute.steps[0], firstGuard=h.execute.guards[0], firstInput=h.execute.inputs[0];
    if(!stepId || !firstStep || !firstGuard || !firstInput)throw new Error('SECRET_STEP');
    const message: Execute3 = {...h.execute, steps: [firstStep, {stepIndex:1,stepId,operations:[{coordinate:{stepId,ordinal:0},guardId:'g1',operation:{kind:'fill',value:{kind:'secretRef',sourceInputId:'pass'}}}]}], guards:[firstGuard,{guardId:'g1',origin:h.launch.scope.allowedOrigins[0]??'',target:{kind:'passwordControl'}}],bindings:[],transfers:[],inputs:[firstInput,{inputId:'pass',stepId,kind:'secretRef',intendedSlot:'fill.value',referenceName:'PASS'}],secrets:{PASS:'child-secret-value',UNREACHED:'child-unreached'},secretOrigins:{PASS:[h.launch.scope.allowedOrigins[0]??'']}};
    h.send(h.launch);await vi.waitFor(()=>{ expect(h.messages.some(message=>message.kind==='ready')).toBe(true); });h.send(message);
    if(fault==='secret-delay'){await vi.waitFor(()=>{expect(h.captured).toContain('child-secret-value');});h.send({kind:'stop'});}
    await vi.waitFor(()=>{ expect(h.exits).toEqual([0]); });
    expect(h.result()).toMatchObject({ok:fault==='none',secretUse:fault==='secret-delay'?{UNREACHED:'NOT_USED'}:{PASS:fault==='none'?'USED':'REFUSED',UNREACHED:'NOT_USED'}});
    if(fault==='secret-delay'){expect(h.result()).not.toHaveProperty('secretUse.PASS');h.releaseSecret();await Promise.resolve();expect(h.messages.filter(message=>message.kind==='result')).toHaveLength(1);}
    expect(message.secrets).toEqual({PASS:'',UNREACHED:''});expect(h.withheld).toContain('child-secret-value');expect(JSON.stringify(h.messages)).not.toContain('child-secret-value');expect(h.observationDispose).toHaveBeenCalledOnce();
  });
  it.each(['none','close','read','target'] as const)('performs admitted v3 IPC, disposes and exits on %s', async fault => {
    const h=driver(fault); h.send(h.launch); await vi.waitFor(() => { expect(h.messages.some(message => message.kind === 'ready')).toBe(true); }); h.send(h.execute);
    await vi.waitFor(() => { expect(h.exits).toEqual([0]); });
    expect(h.result(), JSON.stringify(h.messages)).toMatchObject({ok: fault === 'none' || fault === 'close'}); expect(h.open).toHaveBeenCalledOnce(); expect(h.close).toHaveBeenCalledOnce(); expect(h.observationDispose).toHaveBeenCalledOnce();
    expect(JSON.stringify(h.messages)).not.toMatch(/private-fresh-value|PRIVATE-ERROR|PRIVATE-CLOSE/u);
    if (fault === 'none') {expect(h.captured).toContain('private-fresh-value'); expect(h.withheld).toContain('private-fresh-value');}
  });
  it.each(['profile','policy','expired','identity','launch'] as const)('refuses %s before execution and closes any created browser', async fault => {
    const h=driver(fault === 'launch' ? 'launch' : 'none');
    if (fault === 'profile') (h.launch.profile as {contract: number}).contract = 2;
    if (fault === 'policy') (h.launch.policy as {policyId: string}).policyId = 'wrong';
    if (fault === 'expired') (h.launch.admission as {startDeadlineAt: string}).startDeadlineAt = new Date(Date.now()-1).toISOString();
    if (fault === 'identity') (h.launch as {runId: string}).runId = '00000000-0000-4000-8000-000000000999';
    h.send(h.launch); await vi.waitFor(() => { expect(h.exits).toEqual([0]); }); if (fault === 'profile') {expect(h.result()).toBeUndefined(); expect(h.open).not.toHaveBeenCalled();} else expect(h.result()?.ok).toBe(false); expect(h.messages.some(message => message.kind === 'ready')).toBe(false); expect(JSON.stringify(h.messages)).not.toContain('PRIVATE-LAUNCH');
  });
  it.each(['stop','popup','bad-execute'] as const)('stops a ready context on %s and emits no duplicate result', async fault => {
    const h=driver();h.send(h.launch);await vi.waitFor(()=>{ expect(h.messages.some(message=>message.kind==='ready')).toBe(true); });
    if(fault==='popup')h.popup(); else if(fault==='stop')h.send({kind:'stop'}); else h.send({...h.execute,source:'FORBIDDEN'});
    await vi.waitFor(()=>{ expect(h.exits).toEqual([0]); }); expect(h.messages.filter(message=>message.kind==='result')).toHaveLength(1);expect(h.close).toHaveBeenCalledOnce();
  });
});
