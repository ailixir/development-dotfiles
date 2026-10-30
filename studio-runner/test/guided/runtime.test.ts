import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, readdir, unlink, writeFile,mkdir,lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { GuidedJournal } from '../../src/guided/journal.js';
import { GuidedRuntime } from '../../src/guided/runtime.js';
import { hash, identity, validate } from '../../src/guided/contracts.js';
import { OriginNotAllowed } from '../../src/allowedDomains.js';
import { ClosedActionError } from '../../src/run/closedError.js';
import { guidedContext, dispatch, proposal, sessionStub } from '../helpers/guided.js';
import { GuidedLaunchFailure, GUIDED_RECORDING_FINALIZE_MS, GUIDED_START_BUDGET_MS, GUIDED_START_RESERVE_MS, GUIDED_START_TRANSPORT_CEILING_MS, launchFailureCause } from '../../src/run/guidedBrowser.js';
import {PasswordNoEffect} from '../../src/run/passwordControl.js';
import type { GuidedBrowser, GuidedRecordingRequest, GuidedStartup } from '../../src/run/guidedBrowser.js';
import type { GuidedRuntimeOptions } from '../../src/guided/runtime.js';
import type { ObservationConfig } from '../../src/run/observationTypes.js';
import { createGuidedRecorder } from '../../src/guided/evidence.js';
import type { GuidedRecorder, RecordingEvidenceBody } from '../../src/guided/evidence.js';
import type { PutObjectRequest } from '../../src/run/objectStore.js';
import { WEBM_MAGIC } from '../../src/run/recording.js';
import type { BridgeBootstrap, BridgeOrdinaryOutcome as BridgeOutcome, BridgeObservation, Action, Limits } from '../../src/guided/types.js';

describe('REL-001/D4 the guided start has one deadline',()=>{
  const chainOf=(failure:unknown):Error[]=>{const chain:Error[]=[];for(let link:unknown=failure;link instanceof Error;link=link.cause)chain.push(link);return chain;};
  const blank=(context:ReturnType<typeof guidedContext>):GuidedBrowser=>({evidence:{kind:'initialBlank',sessionId:context.sessionId,contextId:context.contextId,creationId:randomUUID(),documentId:randomUUID(),bootstrapId:randomUUID(),url:'about:blank',origin:null,generation:0},blankMatches:()=>Promise.resolve(true),navigateBlank:()=>Promise.resolve(),close:()=>Promise.resolve(),terminate:vi.fn(()=>Promise.resolve()),orderlyClosed:()=>true,observations:sessionStub({withhold:()=>Promise.resolve(),observe:()=>Promise.reject(new Error('unused'))})});
  /** Fake clock from before the runtime exists, so `began` is the fake epoch. The launcher receives the real `startup`. */
  async function harness(launch:(startup:GuidedStartup,context:ReturnType<typeof guidedContext>)=>Promise<GuidedBrowser>,options:{leaseMs?:number;callback?:GuidedRuntimeOptions['callback']}={}){
    vi.useFakeTimers();
    const context=guidedContext('https://example.test');if(options.leaseMs)context.leaseExpiresAt=new Date(Date.now()+options.leaseMs).toISOString();
    let received:GuidedStartup|undefined;let entered:()=>void=()=>undefined;const launched=new Promise<void>(resolve=>{entered=resolve;});
    const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:await directory(),launch:(_config,_contextId,_onLost,_recording,startup)=>{received=startup;entered();return launch(startup,context);},callback:options.callback??(()=>Promise.resolve())});
    const began=Date.now();
    const outcome=runtime.start().then(()=>null,(error:unknown)=>error);
    return{context,runtime,launched,began,outcome,startup:()=>{if(!received)throw new Error('STARTUP');return received;}};
  }
  const settledFlag=(promise:Promise<unknown>)=>{const flag={done:false};void promise.then(()=>{flag.done=true;});return flag;};

  it('pins the budget to the backend 15 s transport ceiling minus the 3 s reserve (HttpRunnerDispatchClient.transportDeadline)',()=>{
    expect(GUIDED_START_TRANSPORT_CEILING_MS).toBe(15_000);expect(GUIDED_START_RESERVE_MS).toBe(3_000);
    expect(GUIDED_START_BUDGET_MS).toBe(15_000-3_000);expect(GUIDED_START_BUDGET_MS).toBe(12_000);
  });
  it('refuses at exactly 12 s a launcher that never settles and ignores its signal, and keeps the slot held',async()=>{
    const h=await harness(()=>new Promise<GuidedBrowser>(()=>undefined));await h.launched;
    expect(h.startup().deadlineEpochMs).toBe(h.began+GUIDED_START_BUDGET_MS);
    const flag=settledFlag(h.outcome);
    await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS-1);expect(flag.done).toBe(false);expect(h.startup().signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);const refused=await h.outcome;
    expect(Date.now()-h.began).toBe(GUIDED_START_BUDGET_MS);
    expect(refused).toMatchObject({message:'CONTEXT_LOST'});expect(chainOf(refused).map(link=>link.message)).toEqual(['CONTEXT_LOST','TIMEOUT']);
    expect(h.runtime.startFailure).toEqual({phase:'LAUNCH',loss:null});expect(h.startup().signal.aborted).toBe(true);
    // The stop does not wait on the launcher beyond the reserve; it fails closed, like any close failure, and the slot stays held.
    const stopping=h.runtime.stop('CONTEXT_LOST').then(()=>null,(error:unknown)=>error);const stopped=settledFlag(stopping);
    await vi.advanceTimersByTimeAsync(GUIDED_START_RESERVE_MS-1);expect(stopped.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);expect(await stopping).toMatchObject({message:'CONTEXT_LOST'});expect(h.runtime.active).toBe(true);
  });
  it('lets a launcher that finally settles close what it made, and only then releases the slot',async()=>{
    let finish:(browser:GuidedBrowser)=>void=()=>undefined;const terminate=vi.fn(()=>Promise.resolve());
    const h=await harness(()=>new Promise<GuidedBrowser>(resolve=>{finish=resolve;}));await h.launched;
    await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS);await h.outcome;
    const stopping=h.runtime.stop('CONTEXT_LOST').then(()=>null,(error:unknown)=>error);await vi.advanceTimersByTimeAsync(GUIDED_START_RESERVE_MS);await stopping;
    expect(h.runtime.active).toBe(true);expect(terminate).not.toHaveBeenCalled();
    finish({...blank(h.context),terminate});await vi.advanceTimersByTimeAsync(0);
    expect(terminate).toHaveBeenCalledOnce();expect(h.runtime.active).toBe(false);
  });
  it('takes the step and the cause from a launcher that honours its signal, closes it once and releases the slot',async()=>{
    const close=vi.fn(()=>Promise.resolve());
    const h=await harness(startup=>new Promise<GuidedBrowser>((_resolve,reject)=>{startup.signal.addEventListener('abort',()=>{reject(new GuidedLaunchFailure(close,new Error('TIMEOUT'),'PROCESS'));},{once:true});}));await h.launched;
    await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS);const refused=await h.outcome;
    expect(Date.now()-h.began).toBe(GUIDED_START_BUDGET_MS);
    expect(refused).toMatchObject({message:'CONTEXT_LOST'});
    const chain=chainOf(refused);expect(chain.map(link=>link.message)).toEqual(['CONTEXT_LOST','CONTEXT_LOST','TIMEOUT']);expect(chain[1]).toMatchObject({name:'GuidedLaunchFailure',phase:'PROCESS'});
    expect(h.runtime.startFailure).toEqual({phase:'LAUNCH',loss:null});
    await h.runtime.stop('CONTEXT_LOST');expect(close).toHaveBeenCalledOnce();expect(h.runtime.active).toBe(false);
  });
  it('clamps the deadline to the lease: a lease that ends at 5 s ends the start at 5 s',async()=>{
    const h=await harness(()=>new Promise<GuidedBrowser>(()=>undefined),{leaseMs:5_000});await h.launched;
    expect(h.startup().deadlineEpochMs).toBe(h.began+5_000);
    const flag=settledFlag(h.outcome);await vi.advanceTimersByTimeAsync(4_999);expect(flag.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);const refused=await h.outcome;expect(Date.now()-h.began).toBe(5_000);
    expect(refused).toMatchObject({message:'CONTEXT_LOST'});expect(h.startup().signal.aborted).toBe(true);
    // A lease that ends is a stop: its own timer (armed before any step) calls stop('LEASE_LOST'), which aborts first with CANCELLED.
    // It is the lease, not the 12 s budget, that ended this start, so CANCELLED is the truthful cause (Aria F1: name it, do not accept either).
    expect(chainOf(refused).at(-1)?.message).toBe('CANCELLED');expect(h.startup().signal.reason).toMatchObject({message:'CANCELLED'});
    await vi.advanceTimersByTimeAsync(GUIDED_START_RESERVE_MS);
  });
  /** A launcher modelled on `launchGuidedBrowser`: it ends its wait on abort with CANCELLED, then reports the cause through the real mapping. */
  const realisticLauncher=(close:()=>Promise<void>)=>(startup:GuidedStartup)=>new Promise<GuidedBrowser>((_resolve,reject)=>{startup.signal.addEventListener('abort',()=>{reject(new GuidedLaunchFailure(close,launchFailureCause(new Error('CANCELLED'),startup.signal),'PROCESS'));},{once:true});});
  it('Aria F1: logs a budget deadline as TIMEOUT when the runtime timer wins and the launcher can only say CANCELLED',async()=>{
    const close=vi.fn(()=>Promise.resolve());
    // This launcher has no timer of its own, so the runtime\'s is the one that fires: the abort is the only thing it sees.
    const h=await harness(realisticLauncher(close));await h.launched;
    await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS);const refused=await h.outcome;
    const chain=chainOf(refused);expect(chain.map(link=>link.message)).toEqual(['CONTEXT_LOST','CONTEXT_LOST','TIMEOUT']);expect(chain[1]).toMatchObject({name:'GuidedLaunchFailure',phase:'PROCESS'});
    expect(h.startup().signal.reason).toMatchObject({message:'TIMEOUT'});
    await h.runtime.stop('CONTEXT_LOST');expect(close).toHaveBeenCalledOnce();expect(h.runtime.active).toBe(false);
  });
  it('Aria F1: still logs a stop as CANCELLED with that launcher, and the first abort reason wins',async()=>{
    const close=vi.fn(()=>Promise.resolve());
    const h=await harness(realisticLauncher(close));await h.launched;
    await vi.advanceTimersByTimeAsync(1_000);const stopping=h.runtime.stop('LEASE_LOST');
    const refused=await h.outcome;await stopping;
    expect(chainOf(refused).map(link=>link.message)).toEqual(['CONTEXT_LOST','CONTEXT_LOST','CANCELLED']);expect(h.startup().signal.reason).toMatchObject({message:'CANCELLED'});
    // A deadline that arrives after the stop cannot rewrite it.
    await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS);expect(h.startup().signal.reason).toMatchObject({message:'CANCELLED'});
    expect(close).toHaveBeenCalledOnce();expect(h.runtime.active).toBe(false);
  });
  it('Quinn F5: keeps the slot held when the failed launch\'s close rejects (a survivor), and does not retry it',async()=>{
    // What the launcher\'s hard teardown throws when a pid it enumerated is still alive.
    const close=vi.fn(()=>Promise.reject(new Error('CONTEXT_LOST')));
    const h=await harness(startup=>new Promise<GuidedBrowser>((_resolve,reject)=>{startup.signal.addEventListener('abort',()=>{reject(new GuidedLaunchFailure(close,new Error('TIMEOUT'),'PROCESS'));},{once:true});}));await h.launched;
    await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS);const refused=await h.outcome;
    expect(chainOf(refused).map(link=>link.message)).toEqual(['CONTEXT_LOST','CONTEXT_LOST','TIMEOUT']);
    await expect(h.runtime.stop('CONTEXT_LOST')).rejects.toThrow('CONTEXT_LOST');
    expect(close).toHaveBeenCalledOnce();expect(h.runtime.active).toBe(true);
    // The verdict is cached: a second stop reports the same failure and never re-runs a teardown that may have killed half.
    await expect(h.runtime.stop('CONTEXT_LOST')).rejects.toThrow('CONTEXT_LOST');expect(close).toHaveBeenCalledOnce();expect(h.runtime.active).toBe(true);
  });
  it('maps a CANCELLED to the abort reason only when that reason is one of the two closed ones',()=>{
    const abortedWith=(reason?:unknown):AbortSignal=>{const controller=new AbortController();if(reason===undefined)controller.abort();else controller.abort(reason);return controller.signal;};
    const cancelled=new Error('CANCELLED'),timeout=new Error('TIMEOUT');
    expect(launchFailureCause(cancelled,abortedWith(timeout))).toBe(timeout);
    expect(launchFailureCause(cancelled,abortedWith(new Error('CANCELLED')))).toMatchObject({message:'CANCELLED'});
    // A bare abort() carries a DOMException, a foreign reason carries anything: neither may name the cause.
    expect(launchFailureCause(cancelled,abortedWith())).toBe(cancelled);
    expect(launchFailureCause(cancelled,abortedWith(new Error('/private/path/leak')))).toBe(cancelled);
    expect(launchFailureCause(cancelled,abortedWith('TIMEOUT'))).toBe(cancelled);
    // Only a CANCELLED is rewritten, and only by an aborted signal.
    expect(launchFailureCause(timeout,abortedWith(new Error('CANCELLED')))).toBe(timeout);
    const other=new Error('RECORDING_FAILED');expect(launchFailureCause(other,abortedWith(timeout))).toBe(other);
    expect(launchFailureCause(cancelled,new AbortController().signal)).toBe(cancelled);expect(launchFailureCause(cancelled,undefined)).toBe(cancelled);
    expect(launchFailureCause('CANCELLED',abortedWith(timeout))).toBe('CANCELLED');
  });
  it('aborts on a stop during the launch: the cause is CANCELLED and the stop settles within the reserve',async()=>{
    const close=vi.fn(()=>Promise.resolve());
    const h=await harness(startup=>new Promise<GuidedBrowser>((_resolve,reject)=>{startup.signal.addEventListener('abort',()=>{reject(new GuidedLaunchFailure(close,new Error('CANCELLED'),'PROCESS'));},{once:true});}));await h.launched;
    await vi.advanceTimersByTimeAsync(1_000);expect(h.startup().signal.aborted).toBe(false);
    const stopping=h.runtime.stop('LEASE_LOST');expect(h.startup().signal.aborted).toBe(true);
    const refused=await h.outcome;await stopping;
    expect(Date.now()-h.began).toBe(1_000);expect(chainOf(refused).map(link=>link.message)).toEqual(['CONTEXT_LOST','CONTEXT_LOST','CANCELLED']);
    expect(close).toHaveBeenCalledOnce();expect(h.runtime.active).toBe(false);
  });
  it('does not let a stop wait on a launcher that ignores the abort for longer than the reserve',async()=>{
    const h=await harness(()=>new Promise<GuidedBrowser>(()=>undefined));await h.launched;
    await vi.advanceTimersByTimeAsync(1_000);
    const stopping=h.runtime.stop('LEASE_LOST').then(()=>null,(error:unknown)=>error);const stopped=settledFlag(stopping);const refused=await h.outcome;
    expect(chainOf(refused).at(-1)?.message).toBe('CANCELLED');expect(Date.now()-h.began).toBe(1_000);
    await vi.advanceTimersByTimeAsync(GUIDED_START_RESERVE_MS-1);expect(stopped.done).toBe(false);await vi.advanceTimersByTimeAsync(1);expect(await stopping).toMatchObject({message:'CONTEXT_LOST'});
  });
  it('bounds a bootstrap-evidence callback that never answers and names BOOTSTRAP_CALLBACK',async()=>{
    const terminate=vi.fn(()=>Promise.resolve());let called:()=>void=()=>undefined;const reached=new Promise<void>(resolve=>{called=resolve;});
    const h=await harness((_startup,context)=>Promise.resolve({...blank(context),terminate}),{callback:route=>{if(route!=='bootstrap-evidence')return Promise.resolve();called();return new Promise<void>(()=>undefined);}});
    await reached;const flag=settledFlag(h.outcome);await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS-1);expect(flag.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);const refused=await h.outcome;
    expect(refused).toMatchObject({message:'CONTEXT_LOST'});expect(chainOf(refused).at(-1)?.message).toBe('TIMEOUT');
    expect(h.runtime.startFailure).toEqual({phase:'BOOTSTRAP_CALLBACK',loss:null});
    await h.runtime.stop('CONTEXT_LOST');expect(terminate).toHaveBeenCalledOnce();expect(h.runtime.active).toBe(false);
  });
  it('keeps a start that finishes inside the budget exactly as before, and leaves nothing armed',async()=>{
    const h=await harness((_startup,context)=>Promise.resolve(blank(context)));
    expect(await h.outcome).toBeNull();expect(h.runtime.startFailure.phase).toBe('STARTED');expect(h.startup().signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);await h.runtime.stop('CANCELLED');
  });
});

/**
 * KL-015-D5 (W1.5 ruling part 1 section 2): the runtime closes a session whose start COMPLETED through the browser's
 * bounded close, and every other session through the hard teardown alone. The slot is released only when that settles.
 */
describe('KL-015-D5 the runtime closes by start phase',()=>{
  const chainOf=(failure:unknown):Error[]=>{const chain:Error[]=[];for(let link:unknown=failure;link instanceof Error;link=link.cause)chain.push(link);return chain;};
  interface Hooks{close?:()=>Promise<void>;terminate?:()=>Promise<void>;orderly?:boolean;withhold?:()=>Promise<void>;blankMatches?:()=>Promise<boolean>}
  const fake=(context:ReturnType<typeof guidedContext>,hooks:Hooks={}):GuidedBrowser&{close:ReturnType<typeof vi.fn>;terminate:ReturnType<typeof vi.fn>}=>({
    evidence:{kind:'initialBlank',sessionId:context.sessionId,contextId:context.contextId,creationId:randomUUID(),documentId:randomUUID(),bootstrapId:randomUUID(),url:'about:blank',origin:null,generation:0},
    blankMatches:hooks.blankMatches??(()=>Promise.resolve(true)),navigateBlank:()=>Promise.resolve(),
    close:vi.fn(hooks.close??(()=>Promise.resolve())),terminate:vi.fn(hooks.terminate??(()=>Promise.resolve())),orderlyClosed:()=>hooks.orderly??false,
    observations:sessionStub({withhold:hooks.withhold??(()=>Promise.resolve()),observe:()=>Promise.reject(new Error('unused'))}),
  });
  async function started(hooks:Hooks,options:{callback?:GuidedRuntimeOptions['callback'];recorder?:GuidedRecorder}={}){
    vi.useFakeTimers();
    const context=guidedContext('https://example.test');const browser=fake(context,hooks);
    let entered:()=>void=()=>undefined;const launched=new Promise<void>(resolve=>{entered=resolve;});
    const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:await directory(),launch:()=>{entered();return Promise.resolve(browser);},callback:options.callback??(()=>Promise.resolve()),...(options.recorder?{recorder:options.recorder}:{})});
    const outcome=runtime.start().then(()=>null,(error:unknown)=>error);await launched;
    return{context,browser,runtime,outcome};
  }
  const settledFlag=(promise:Promise<unknown>)=>{const flag={done:false};void promise.then(()=>{flag.done=true;},()=>{flag.done=true;});return flag;};
  /** A recorder double that only reports what `orderlyClose` the runtime settled with. */
  const recorderDouble=()=>{const settled:{orderlyClose:boolean;videoPath:string|null}[]=[];
    const recording={launchRequest:()=>null,settle:(input:{orderlyClose:boolean;videoPath:string|null})=>{settled.push({orderlyClose:input.orderlyClose,videoPath:input.videoPath});return Promise.resolve('UNAVAILABLE');}};
    const recorder:GuidedRecorder={open:()=>Promise.resolve(recording as unknown as Awaited<ReturnType<GuidedRecorder['open']>>)};return{recorder,settled};};

  it('U2 closes a started session through browser.close() only, and reports the browser\'s own orderly verdict to the recording',async()=>{
    for(const orderly of [true,false]){
      const double=recorderDouble();const h=await started({orderly},{recorder:double.recorder});expect(await h.outcome).toBeNull();expect(h.runtime.startFailure.phase).toBe('STARTED');
      await h.runtime.stop('CONTEXT_LOST');await h.runtime.recordingSettled;
      expect(h.browser.close).toHaveBeenCalledOnce();expect(h.browser.terminate).not.toHaveBeenCalled();expect(h.runtime.active).toBe(false);
      expect(double.settled.map(entry=>entry.orderlyClose)).toEqual([orderly]);vi.useRealTimers();
    }
  });
  it('R065 the recording is settled orderly iff the recorder finished by itself, and only after finalizeRecording ran, before the file is read',async()=>{
    for(const finalized of [true,false]){
      const order:string[]=[];const double=recorderDouble();
      const h=await started({orderly:false},{recorder:double.recorder});expect(await h.outcome).toBeNull();
      const browser=h.browser as GuidedBrowser&{finalizeRecording?:(boundMs:number)=>Promise<boolean>;recordedVideo?:()=>Promise<string|null>};
      browser.finalizeRecording=vi.fn(()=>{order.push('finalize');return Promise.resolve(finalized);});
      browser.recordedVideo=vi.fn(()=>{order.push('path');return Promise.resolve('/tmp/x.webm');});
      await h.runtime.stop('CONTEXT_LOST');await h.runtime.recordingSettled;
      expect(browser.finalizeRecording).toHaveBeenCalledWith(GUIDED_RECORDING_FINALIZE_MS);
      expect(order).toEqual(['finalize','path']);
      expect(double.settled).toEqual([{orderlyClose:finalized,videoPath:'/tmp/x.webm'}]);vi.useRealTimers();
    }
  });
  it('U1 keeps the stop pending until the close settles, and releases the slot only then',async()=>{
    let release:()=>void=()=>undefined;const h=await started({close:()=>new Promise<void>(resolve=>{release=resolve;})});await h.outcome;
    const stopping=h.runtime.stop('CONTEXT_LOST');const flag=settledFlag(stopping);
    await vi.advanceTimersByTimeAsync(20_000);expect(flag.done).toBe(false);expect(h.runtime.active).toBe(true);
    release();await stopping;expect(flag.done).toBe(true);expect(h.runtime.active).toBe(false);
  });
  it('U3 a close that rejects keeps the slot held, and a repeat stop returns the same rejection without a second teardown',async()=>{
    const h=await started({close:()=>Promise.reject(new Error('CONTEXT_LOST'))});await h.outcome;
    await expect(h.runtime.stop('CONTEXT_LOST')).rejects.toThrow('CONTEXT_LOST');expect(h.runtime.active).toBe(true);
    await expect(h.runtime.stop('CONTEXT_LOST')).rejects.toThrow('CONTEXT_LOST');expect(h.browser.close).toHaveBeenCalledOnce();expect(h.runtime.active).toBe(true);
  });
  it('U3 a terminate that rejects (survivor) keeps the slot held for a start that failed, and a repeat stop returns the same rejection',async()=>{
    const h=await started({terminate:()=>Promise.reject(new Error('CONTEXT_LOST')),withhold:()=>Promise.reject(new Error('boom'))});await h.outcome;
    expect(h.runtime.startFailure.phase).toBe('WITHHOLD');
    await expect(h.runtime.stop('CONTEXT_LOST')).rejects.toThrow('CONTEXT_LOST');expect(h.runtime.active).toBe(true);
    await expect(h.runtime.stop('CONTEXT_LOST')).rejects.toThrow('CONTEXT_LOST');expect(h.browser.terminate).toHaveBeenCalledOnce();expect(h.browser.close).not.toHaveBeenCalled();expect(h.runtime.active).toBe(true);
  });
  describe.each([
    {phase:'WITHHOLD',deadline:{withhold:()=>new Promise<void>(()=>undefined)},failure:{withhold:()=>Promise.reject(new Error('boom'))}},
    {phase:'BLANK_MATCH',deadline:{blankMatches:()=>new Promise<boolean>(()=>undefined)},failure:{blankMatches:()=>Promise.resolve(false)}},
    {phase:'BOOTSTRAP_CALLBACK',deadline:{},failure:{}},
  ] as const)('U4 start failure in $phase after the browser launched',({phase,deadline,failure})=>{
    const callbackFor=(mode:'deadline'|'failure'):GuidedRuntimeOptions['callback']=>route=>{
      if(phase!=='BOOTSTRAP_CALLBACK'||route!=='bootstrap-evidence')return Promise.resolve();
      return mode==='deadline'?new Promise<void>(()=>undefined):Promise.reject(new Error('callback refused'));
    };
    for(const mode of ['deadline','failure'] as const){
      it(`${mode}: terminate() runs once, close() never, the start is refused CONTEXT_LOST with its phase kept, and the slot is released`,async()=>{
        const hooks:Hooks=mode==='deadline'?deadline:failure;const h=await started(hooks,{callback:callbackFor(mode)});
        if(mode==='deadline')await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS);
        const refused=await h.outcome;
        expect(h.runtime.startFailure).toEqual({phase,loss:null});
        if(mode==='deadline'){expect(refused).toMatchObject({message:'CONTEXT_LOST'});expect(chainOf(refused).at(-1)?.message).toBe('TIMEOUT');}
        await h.runtime.stop('CONTEXT_LOST');
        expect(h.browser.terminate).toHaveBeenCalledOnce();expect(h.browser.close).not.toHaveBeenCalled();expect(h.runtime.active).toBe(false);
      });
    }
  });
  it('U5 a launch that failed after its context existed closes through the failure\'s own hard teardown, never through a browser',async()=>{
    vi.useFakeTimers();const context=guidedContext('https://example.test');const hard=vi.fn(()=>Promise.resolve());const graceful=vi.fn(()=>Promise.resolve());
    const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:await directory(),launch:()=>Promise.reject(new GuidedLaunchFailure(hard,new Error('RECORDING_FAILED'),'APP_PAGE')),callback:()=>Promise.resolve()});
    const refused=await runtime.start().then(()=>null,(error:unknown)=>error);expect(refused).toMatchObject({message:'CONTEXT_LOST'});expect(runtime.startFailure.phase).toBe('LAUNCH');
    await runtime.stop('CONTEXT_LOST');expect(hard).toHaveBeenCalledOnce();expect(graceful).not.toHaveBeenCalled();expect(runtime.active).toBe(false);
  });
  it('closes a browser that a launcher hands back after the deadline through its terminate, then releases the slot',async()=>{
    vi.useFakeTimers();const context=guidedContext('https://example.test');let finish:(browser:GuidedBrowser)=>void=()=>undefined;
    let entered:()=>void=()=>undefined;const launched=new Promise<void>(resolve=>{entered=resolve;});
    const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:await directory(),launch:()=>{entered();return new Promise<GuidedBrowser>(resolve=>{finish=resolve;});},callback:()=>Promise.resolve()});
    const outcome=runtime.start().then(()=>null,(error:unknown)=>error);await launched;await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS);await outcome;
    const stopping=runtime.stop('CONTEXT_LOST').then(()=>null,(error:unknown)=>error);await vi.advanceTimersByTimeAsync(GUIDED_START_RESERVE_MS);await stopping;expect(runtime.active).toBe(true);
    const late=fake(context);finish(late);await vi.advanceTimersByTimeAsync(0);
    expect(late.terminate).toHaveBeenCalledOnce();expect(late.close).not.toHaveBeenCalled();expect(runtime.active).toBe(false);
  });
  it('keeps the launch-phase stop exactly as D4 ruled: a launcher that ignores its signal still holds the slot',async()=>{
    vi.useFakeTimers();const context=guidedContext('https://example.test');
    let entered:()=>void=()=>undefined;const launched=new Promise<void>(resolve=>{entered=resolve;});
    const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:await directory(),launch:()=>{entered();return new Promise<GuidedBrowser>(()=>undefined);},callback:()=>Promise.resolve()});
    const outcome=runtime.start().then(()=>null,(error:unknown)=>error);await launched;await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS);await outcome;
    const stopping=runtime.stop('CONTEXT_LOST').then(()=>null,(error:unknown)=>error);await vi.advanceTimersByTimeAsync(GUIDED_START_RESERVE_MS);expect(await stopping).toMatchObject({message:'CONTEXT_LOST'});expect(runtime.active).toBe(true);
  });
});

const cleanup:(()=>Promise<void>)[]=[];
afterEach(async()=>{vi.useRealTimers();for(const fn of cleanup.reverse())await fn();cleanup.length=0;});
async function directory(){const p=await mkdtemp(join(tmpdir(),'guided-unit-'));cleanup.push(()=>rm(p,{recursive:true,force:true}));return p;}
async function setup(options:{failedOutcomeCallback?:boolean;secret?:boolean;failEffect?:boolean;loseOutcomeAck?:boolean;leaseMs?:number;limits?:Partial<Limits>;observationCallback?:(body:unknown,key?:string)=>Promise<void>;onLostObserver?:(callback:()=>void)=>void}={}){
  const context=guidedContext('https://example.test');Object.assign(context.limits,options.limits);if(options.leaseMs)context.leaseExpiresAt=new Date(Date.now()+options.leaseMs).toISOString();
  if(options.secret){context.authoredInputs.inputs.push({inputId:'pass',sourceStepId:'fill',kind:'secretRef',intendedSlot:'fill.value',secretId:'PASS',provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:'fill',referenceId:'pass-reference',referenceName:'PASS',kind:'secretRef',intendedSlot:'fill.value'}});context.authoredInputs.inputs.push({inputId:'later',sourceStepId:'submit',kind:'nonsecretText',intendedSlot:'assert.expected',value:'current-assertion-canary',provenance:{referenceKind:'sourceSpan',sourceRevision:context.sourceRevision,stepId:'submit',startUtf16:0,endUtf16:8,kind:'nonsecretText',intendedSlot:'assert.expected'}});context.authoredInputsHash=hash(context.authoredInputs);}
  const messages:{route:string;body:unknown;key?:string}[]=[];const path=await directory();let generation=0;
  const browser:GuidedBrowser={evidence:{kind:'initialBlank',sessionId:context.sessionId,contextId:context.contextId,creationId:randomUUID(),bootstrapId:randomUUID(),documentId:randomUUID(),url:'about:blank',origin:null,generation:0},blankMatches:vi.fn(()=>Promise.resolve(true)),navigateBlank:vi.fn(async()=>{const files=await readdir(path);const journal=await readFile(join(path,files.find(f=>f.endsWith('.journal'))??''),'utf8');expect(journal.trim().split('\n')).toHaveLength(3);expect(JSON.parse(journal.trim().split('\n')[2]??'{}')).toMatchObject({state:'INVOKING',receiptHash:null});if(options.failEffect)throw new Error('captured-canary-private');}),close:vi.fn(()=>Promise.resolve()),terminate:vi.fn(()=>Promise.resolve()),orderlyClosed:()=>true,observations:sessionStub({prepareTarget:()=>Promise.resolve({locator:[{by:'testId',value:'source'}],tier:'testId',identity:{role:'text',name:null}}),pageMatches:()=>Promise.resolve(true),invoke:()=>Promise.resolve({value:'ab'}),withhold:()=>Promise.resolve(),observe:()=>Promise.resolve({observation:{schemaVersion:3,sessionId:context.sessionId,scopeHash:context.scopeHash,documentId:'page-document',generation:++generation,origin:'https://example.test',observedAt:new Date().toISOString(),coverage:{withheldRegions:0,unsupportedRegions:0,passwordControls:options.secret?1:0},projection:{projected:false,tier:null,totalNodes:1,shownNodes:1,notShown:0,outlineBytes:15},readRuleId:null,outline:'- text "x" [e1]',facts:{e1:{role:'text',name:'x',editable:false, nameComplete: true, ownTextComplete: true,evidence:'x',evidenceSegments:[]}}},json:'',bytes:0,observationHash:''}),dispose:()=>Promise.resolve()})};
  const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:path,launch:(_config,_contextId,onLost)=>{options.onLostObserver?.(onLost);return Promise.resolve(browser);},callback:(route,body,key)=>{messages.push({route,body,...(key?{key}:{})});return route==='observations'&&options.observationCallback?options.observationCallback(body,key):route==='outcomes'&&(options.loseOutcomeAck||options.failedOutcomeCallback&&(body as BridgeOutcome).ledger.state==='UNKNOWN_OUTCOME')?Promise.reject(new Error('lost')):Promise.resolve();}});cleanup.push(()=>runtime.stop('CANCELLED'));await runtime.start();
  const evidence=(messages[0]?.body as BridgeBootstrap).executionEvidence;const p=proposal(context,evidence,'nav',{kind:'navigate',destinationInputId:'input-nav'});
  const prep=await runtime.prepare({pressInheritance:null,...identity(context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Math.min(Date.now()+10_000,Date.parse(context.leaseExpiresAt)-1)).toISOString()});
  return {context,runtime,browser,messages,path,request:dispatch(context,p,prep)};
}
describe('durable worker consumption and recovery',()=>{
  it.each(['fulfill','reject'] as const)('completes managed secret loss only after original close and consumes late %s without output reentry',async late=>{
    let originalLoss:(()=>void)|undefined;
    const h=await setup({secret:true,onLostObserver:callback=>{originalLoss=callback;}});await h.runtime.dispatch(h.request);
    const o=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;
    const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:hash(o)};
    let nativeFulfill:()=>void=()=>undefined,nativeReject:(error:Error)=>void=()=>undefined,closeFinish:()=>void=()=>undefined;
    const native=new Promise<void>((resolve,reject)=>{nativeFulfill=resolve;nativeReject=reject;});
    h.browser.observations.preparePassword=()=>Promise.resolve();
    const fill=vi.fn(()=>native);h.browser.observations.fillPassword=fill;
    vi.mocked(h.browser.close).mockImplementationOnce(()=>new Promise<void>(resolve=>{closeFinish=resolve;}));
    const p=proposal(h.context,evidence,'fill',{kind:'fill',value:{kind:'secretRef',sourceInputId:'pass'}},{kind:'passwordControl',documentId:o.documentId,generation:o.generation});
    const prepared=await h.runtime.prepare({pressInheritance:null,...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()});
    const request={...dispatch(h.context,p,prepared),secret:{secretId:'PASS',value:'managed-unit-canary',versionId:'unit',allowedOrigins:[o.origin]}};
    const stderr=vi.spyOn(process.stderr,'write').mockImplementation(()=>true);
    try{
      let completed=false;const pending=h.runtime.dispatch(request).then(result=>{completed=true;return result;});
      await vi.waitFor(()=>{expect(fill).toHaveBeenCalledOnce();});
      if(!originalLoss)throw new Error('LOSS_CALLBACK');originalLoss();
      const stopping=(h.runtime as unknown as {closing:Promise<void>}).closing;
      await Promise.resolve();expect(completed).toBe(false);
      expect((h.runtime as unknown as {busy:boolean}).busy).toBe(true);expect(h.runtime.active).toBe(true);
      closeFinish();await stopping;
      const result=await pending;expect(result.ledger.state).toBe('UNKNOWN_OUTCOME');expect(result.ledger.outcomeCode).toBe('ACK_LOST');
      expect((h.runtime as unknown as {busy:boolean}).busy).toBe(false);expect(h.runtime.active).toBe(false);expect(request).not.toHaveProperty('secret');
      const before=JSON.stringify(h.messages),errCount=stderr.mock.calls.length;
      const name=(await readdir(h.path)).find(f=>f.endsWith('.diagnostic.jsonl'));if(!name)throw new Error('DIAGNOSTIC');
      const diagnostic=await readFile(join(h.path,name),'utf8');
      if(late==='fulfill')nativeFulfill();else nativeReject(new Error('managed-unit-canary'));
      await native.catch(()=>undefined);await Promise.resolve();await Promise.resolve();
      expect(JSON.stringify(h.messages)).toBe(before);expect(stderr.mock.calls).toHaveLength(errCount);
      expect(await readFile(join(h.path,name),'utf8')).toBe(diagnostic);expect(fill).toHaveBeenCalledOnce();
      await expect(h.runtime.dispatch(h.request)).rejects.toThrow('CONTEXT_LOST');
    }finally{nativeFulfill();closeFinish();stderr.mockRestore();}
  });
  it('adds a newly captured runtime value to the dispatch-local redactor before shutdown can clear it',async()=>{
    const h=await setup();await h.runtime.dispatch(h.request);const o=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;
    const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:hash(o)};
    const p=proposal(h.context,evidence,'read',{kind:'read',bindingId:'binding-one',recipe:{kind:'visibleText',classification:'permittedBusinessData',policyRuleId:'read-policy'}},{kind:'node',ref:'e1',documentId:o.documentId,generation:o.generation});
    const proof=await h.runtime.prepare({pressInheritance:null,...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()});const canary='new-runtime-é-canary';
    h.browser.observations.invoke=()=>Promise.resolve({value:canary});h.browser.observations.withhold=async()=>{await h.runtime.stop('CONTEXT_LOST');throw new Error(canary+' '+encodeURIComponent(canary)+' '+Buffer.from(canary).toString('base64'));};
    const stderr=vi.spyOn(process.stderr,'write').mockImplementation(()=>true);
    try{const outcome=await h.runtime.dispatch(dispatch(h.context,p,proof));expect(outcome.errorMessage).toContain('[REDACTED]');const file=(await readdir(h.path)).find(f=>f.endsWith('.diagnostic.jsonl'));if(!file)throw new Error('DIAGNOSTIC');const persisted=await readFile(join(h.path,file),'utf8');for(const sink of [JSON.stringify(outcome),stderr.mock.calls.map(c=>String(c[0])).join(''),persisted])for(const variant of [canary,encodeURIComponent(canary),Buffer.from(canary).toString('base64')])expect(sink).not.toContain(variant);}
    finally{stderr.mockRestore();}
  });
  it.each(['stderr','callback','file'] as const)('keeps prior-value redaction and immutable success when %s diagnostic delivery fails',async sink=>{
    const h=await setup({secret:true,failedOutcomeCallback:sink==='callback'});await h.runtime.dispatch(h.request);h.browser.observations.preparePassword=()=>Promise.resolve();h.browser.observations.fillPassword=()=>Promise.resolve();
    const make=async(step:'fill'|'submit')=>{const o=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:hash(o)};const p=proposal(h.context,evidence,step,step==='fill'?{kind:'fill',value:{kind:'secretRef',sourceInputId:'pass'}}:{kind:'assert',predicate:'title',expected:{kind:'authoredLiteral',sourceInputId:'later'}},step==='fill'?{kind:'passwordControl',documentId:o.documentId,generation:o.generation}:undefined);const proof=await h.runtime.prepare({pressInheritance:null,...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()});return h.runtime.dispatch({...dispatch(h.context,p,proof),...(step==='fill'?{secret:{secretId:'PASS',value:'prior-sink-canary',versionId:'unit',allowedOrigins:[o.origin]}}:{})});};
    expect((await make('fill')).ledger.state).toBe('SUCCEEDED');const texts:string[]=[];const stderr=vi.spyOn(process.stderr,'write').mockImplementation(text=>{texts.push(String(text));if(sink==='stderr')throw new Error('stderr unavailable');return true;});
    const path=join(h.path,hash(h.context.sessionId)+'.diagnostic.jsonl');if(sink==='file')await mkdir(path);
    h.browser.observations.assertPage=async()=>{await h.runtime.stop('CANCELLED');throw new Error('prior-sink-canary '+Buffer.from('prior-sink-canary').toString('base64'));};
    try{const outcome=await make('submit');expect(outcome.ledger.state).toBe('UNKNOWN_OUTCOME');expect(outcome.errorMessage).toContain('[REDACTED]');expect(texts.join('')).not.toContain('prior-sink-canary');expect(JSON.stringify(h.messages.filter(m=>m.route==='outcomes'))).not.toContain('prior-sink-canary');expect((h.messages.filter(m=>m.route==='outcomes')[1]?.body as BridgeOutcome).ledger.state).toBe('SUCCEEDED');if(sink!=='file')expect(await readFile(path,'utf8')).not.toContain('prior-sink-canary');else expect(await readdir(path)).toEqual([]);}
    finally{stderr.mockRestore();}
  });
  it.each(['CANCELLED','EXPIRED','CONTEXT_LOST'].flatMap(reason=>['immediate','delayed'].flatMap(close=>['nonsecret','secret'].map(action=>({reason:reason as 'CANCELLED'|'EXPIRED'|'CONTEXT_LOST',close,action})))))('redacts all earlier/current values through $reason/$close/$action after inventory erasure',async({reason,close,action})=>{
    const h=await setup({secret:true});await h.runtime.dispatch(h.request);h.browser.observations.preparePassword=()=>Promise.resolve();h.browser.observations.fillPassword=()=>Promise.resolve();
    const perform=async(secret:boolean,ordinal=0)=>{const o=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;
      const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:hash(o)};
      const p=proposal(h.context,evidence,secret?'fill':'submit',secret?{kind:'fill',value:{kind:'secretRef',sourceInputId:'pass'}}:{kind:'assert',predicate:'title',expected:{kind:'authoredLiteral',sourceInputId:'later'}},secret?{kind:'passwordControl',documentId:o.documentId,generation:o.generation}:undefined);p.coordinate.ordinal=ordinal;
      const proof=await h.runtime.prepare({pressInheritance:null,...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()});
      return h.runtime.dispatch({...dispatch(h.context,p,proof),...(secret?{secret:{secretId:'PASS',value:ordinal===0?'earlier-released-é':'current-released-é',versionId:'unit',allowedOrigins:[o.origin]}}:{})});};
    await perform(true);
    let release:()=>void=()=>undefined;vi.mocked(h.browser.close).mockImplementationOnce(()=>close==='immediate'?Promise.resolve():new Promise<void>(resolve=>{release=resolve;}));
    const known=['earlier-released-é',...(action==='secret'?['current-released-é']:[]),'current-assertion-canary'],variants=known.flatMap(v=>[v,encodeURIComponent(v),Buffer.from(v).toString('base64')]);
    const fail=async()=>{const stopped=h.runtime.stop(reason);if(close==='immediate')await stopped;throw new Error(variants.join(' '));};
    h.browser.observations.fillPassword=fail;h.browser.observations.assertPage=fail;
    const stderr=vi.spyOn(process.stderr,'write').mockImplementation(()=>true);const pending=perform(action==='secret',action==='secret'?1:0);
    try{await vi.waitFor(()=>{expect(h.messages.filter(m=>m.route==='outcomes')).toHaveLength(3);});const outcome=h.messages.filter(m=>m.route==='outcomes').at(-1)?.body as BridgeOutcome;expect(outcome.errorMessage).toContain('[REDACTED]');const diagnostic=(await readdir(h.path)).find(f=>f.endsWith('.diagnostic.jsonl'));if(!diagnostic)throw new Error('DIAGNOSTIC');const persisted=await readFile(join(h.path,diagnostic),'utf8');for(const sink of [JSON.stringify(outcome),stderr.mock.calls.map(c=>String(c[0])).join(''),persisted])for(const value of variants)expect(sink).not.toContain(value);expect((h.runtime as unknown as {secretValues:Set<string>}).secretValues.size).toBe(0);}
    finally{release();await pending;stderr.mockRestore();}
  });
  it.each(['trusted-pre-write','uncertain-after-call'] as const)('preserves %s secret target-change evidence without inventing refusal',async mode=>{
    const h=await setup({secret:true});await h.runtime.dispatch(h.request);
    const observe=h.browser.observations.observe.bind(h.browser.observations);h.browser.observations.observe=async(...args)=>{const collected=await observe(...args);(collected.observation.coverage as {passwordControls:number}).passwordControls=1;return collected;};
    const refreshed=await h.runtime.refreshObservation({...identity(h.context),expectedGeneration:1,focus:{stepText:'',targetIntents:[]}},'secret-count');const o=refreshed.observation;
    const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:hash(o)};
    h.browser.observations.preparePassword=()=>Promise.resolve();h.browser.observations.fillPassword=()=>Promise.reject(mode==='trusted-pre-write'?new PasswordNoEffect('TARGET_CHANGED'):new Error('TARGET_CHANGED'));
    const action=proposal(h.context,evidence,'fill',{kind:'fill',value:{kind:'secretRef',sourceInputId:'pass'}},{kind:'passwordControl',documentId:o.documentId,generation:o.generation});
    const prepared=await h.runtime.prepare({pressInheritance:null,...identity(h.context),proposal:action,requestDigest:hash(action),expiresAt:new Date(Date.now()+10000).toISOString()});
    const request={...dispatch(h.context,action,prepared),secret:{secretId:'PASS',value:'released-unit-canary',versionId:'unit',allowedOrigins:[o.origin]}};
    const result=await h.runtime.dispatch(request);expect(result.ledger.state).toBe(mode==='trusted-pre-write'?'FAILED':'UNKNOWN_OUTCOME');expect(result.ledger.outcomeCode).toBe('TARGET_CHANGED');expect(()=>validate('bridge',result,'outcome')).not.toThrow();expect(request).not.toHaveProperty('secret');
  });
  it('excludes independent writers and refuses missing/corrupt expected journal state',async()=>{
    const path=await directory();const journal=await GuidedJournal.open(path,'session');
    await expect(GuidedJournal.open(path,'session')).rejects.toThrow('CONTEXT_LOST');
    const results=await Promise.allSettled([journal.consume({admissionId:'one',ownerFence:1}),journal.consume({admissionId:'one',ownerFence:1})]);expect(results.map(r=>r.status).sort()).toEqual(['fulfilled','rejected']);
    const filename=(await readdir(path)).find(f=>f.endsWith('.journal'));if(!filename)throw new Error('JOURNAL');await unlink(join(path,filename));await expect(journal.consume({admissionId:'new',ownerFence:1})).rejects.toThrow('JOURNAL_UNAVAILABLE');await expect(GuidedJournal.open(path,'session')).rejects.toThrow('CONTEXT_LOST');
    await writeFile(join(path,filename),'partial');await expect(GuidedJournal.open(path,'session')).rejects.toThrow('CONTEXT_LOST');
  });
  it('fsyncs before an effect and admits only one concurrent delivery',async()=>{
    const h=await setup();const results=await Promise.allSettled([h.runtime.dispatch(h.request),h.runtime.dispatch(h.request)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(h.browser.navigateBlank).toHaveBeenCalledTimes(1);await expect(h.runtime.dispatch(h.request)).rejects.toThrow();
    expect(h.messages.map(m=>m.route)).toEqual(['bootstrap-evidence','outcomes','observations']);
  });
  it('never retries an effect after an uncertain exception and delivers bounded non-authoritative diagnostics',async()=>{
    const h=await setup({failEffect:true});const result=await h.runtime.dispatch(h.request);expect(result.ledger.state).toBe('UNKNOWN_OUTCOME');expect(h.browser.close).toHaveBeenCalledTimes(1);await expect(h.runtime.dispatch(h.request)).rejects.toThrow();expect(h.browser.navigateBlank).toHaveBeenCalledTimes(1);expect(result.errorMessage).toBe('Error: captured-canary-private');expect(()=>validate('bridge',result,'outcome')).not.toThrow();
  });
  it('preserves a definite success when its callback acknowledgement is lost',async()=>{
    const h=await setup({loseOutcomeAck:true});const result=await h.runtime.dispatch(h.request);expect(result.ledger.state).toBe('SUCCEEDED');const outcomes=h.messages.filter(m=>m.route==='outcomes');expect(outcomes).toHaveLength(1);expect((outcomes[0]?.body as BridgeOutcome).ledger.state).toBe('SUCCEEDED');expect(h.browser.close).toHaveBeenCalledOnce();
  });
  it('redacts the in-flight local value when stop has already wiped its inventory',async()=>{
    const h=await setup();const input=h.context.authoredInputs.inputs[0];if(!input||!('value' in input))throw new Error('INPUT');
    let release:()=>void=()=>undefined;vi.mocked(h.browser.close).mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
    const stderr=vi.spyOn(process.stderr,'write').mockImplementation(()=>true);
    vi.mocked(h.browser.navigateBlank).mockImplementationOnce(()=>{void h.runtime.stop('CANCELLED');return Promise.reject(new Error(input.value));});
    const pending=h.runtime.dispatch(h.request);
    try{await vi.waitFor(()=>{expect(h.messages.filter(message=>message.route==='outcomes')).toHaveLength(1);});const outcome=h.messages.find(message=>message.route==='outcomes')?.body as BridgeOutcome;expect(outcome.errorMessage).toBe('Error: [REDACTED]');expect(JSON.stringify(h.messages)).not.toContain(input.value);expect(stderr).toHaveBeenCalledWith('Error: [REDACTED]\n');}
    finally{release();await pending;stderr.mockRestore();}
  });
  it('cancellation before consume prevents invocation and lease expiry autonomously closes',async()=>{
    const h=await setup();await h.runtime.stop('CANCELLED');await expect(h.runtime.dispatch(h.request)).rejects.toThrow('CONTEXT_LOST');expect(h.browser.navigateBlank).not.toHaveBeenCalled();
    vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout']});const timed=await setup({leaseMs:80});await vi.advanceTimersByTimeAsync(81);expect(timed.runtime.active).toBe(false);expect(timed.browser.close).toHaveBeenCalledOnce();
  });
  it('reports a definite failed target refusal after consume and before any browser invocation',async()=>{
    const h=await setup();vi.mocked(h.browser.blankMatches).mockResolvedValueOnce(false);const result=await h.runtime.dispatch(h.request);expect(result.ledger.state).toBe('FAILED');expect(result.ledger.outcomeCode).toBe('TARGET_CHANGED');expect(h.browser.navigateBlank).not.toHaveBeenCalled();
  });
  it('cancellation after durable consume but before invocation prevents the browser call',async()=>{
    const h=await setup();vi.mocked(h.browser.blankMatches).mockImplementationOnce(async()=>{await h.runtime.stop('CANCELLED');return true;});
    const result=await h.runtime.dispatch(h.request);expect(result.ledger.state).toBe('UNKNOWN_OUTCOME');expect(h.browser.navigateBlank).not.toHaveBeenCalled();
  });
  it('cancellation after an application effect cannot commit a success or retry',async()=>{
    const h=await setup();let effects=0;vi.mocked(h.browser.navigateBlank).mockImplementationOnce(async()=>{effects++;await h.runtime.stop('CANCELLED');});
    const result=await h.runtime.dispatch(h.request);expect(effects).toBe(1);expect(result.ledger.state).toBe('UNKNOWN_OUTCOME');await expect(h.runtime.dispatch(h.request)).rejects.toThrow('CONTEXT_LOST');expect(effects).toBe(1);
  });
  it('retains cumulative allocations while admitting appended prospective consumers',async()=>{
    const h=await setup();const next=structuredClone(h.context);next.materializationRevision++;next.allocations[0]?.consumers.push({stepId:'submit',argumentSlot:'assert.expected'});await expect(h.runtime.update(next)).resolves.toEqual(identity(next));const accepted=hash((h.runtime as unknown as {context:unknown}).context);
    const dropped=structuredClone(next);dropped.materializationRevision++;dropped.allocations[0]?.consumers.shift();await expect(h.runtime.update(dropped)).rejects.toThrow('CONTEXT_REVISION');expect(hash((h.runtime as unknown as {context:unknown}).context)).toBe(accepted);
    const changed=structuredClone(next);changed.materializationRevision++;if(changed.allocations[0])changed.allocations[0].needId='replacement';await expect(h.runtime.update(changed)).rejects.toThrow('CONTEXT_REVISION');expect(hash((h.runtime as unknown as {context:unknown}).context)).toBe(accepted);
  });
  it.each([{maxRuntimeValues:1},{maxRuntimeValuesBytesTotal:3}])('enforces aggregate/count bounds without exporting a read value: %j',async limits=>{
    const h=await setup({limits});await h.runtime.dispatch(h.request);
    const original=h.context.allocations[0];if(!original)throw new Error('ALLOCATION');h.context.allocations.push({...original,bindingId:'second',needId:'need-two'});h.context.materializationRevision++;await h.runtime.update(h.context);
    const read=async(bindingId:string,ordinal:number)=>{
      const observation=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;
      const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:observation.documentId,generation:observation.generation,origin:observation.origin,observationHash:hash(observation)};
      const operation:Action['operation']={kind:'read',bindingId,recipe:{kind:'visibleText',classification:'permittedBusinessData',policyRuleId:'read-policy'}};
      const p=proposal(h.context,evidence,'read',operation,{kind:'node',ref:'e1',documentId:evidence.documentId,generation:evidence.generation});p.coordinate.ordinal=ordinal;
      const proof=await h.runtime.prepare({pressInheritance:null,...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10_000).toISOString()});const request=dispatch(h.context,p,proof);return{outcome:await h.runtime.dispatch(request),p};
    };
    const first=await read('binding-one',0);expect(first.outcome.ledger.state).toBe('SUCCEEDED');if(!first.outcome.availability||first.p.operation.kind!=='read'||!first.p.executionEvidence.origin)throw new Error('READ');
    h.context.producers.push({bindingId:'binding-one',producerAdmissionId:first.outcome.ledger.admission.admissionId,coordinate:first.p.coordinate,origin:first.p.executionEvidence.origin,recipe:first.p.operation.recipe,availability:first.outcome.availability});h.context.materializationRevision++;await h.runtime.update(h.context);
    const other=await setup();const foreign=structuredClone(other.context);foreign.producers=structuredClone(h.context.producers);foreign.materializationRevision++;const foreignBefore=hash((other.runtime as unknown as {context:unknown}).context);await expect(other.runtime.update(foreign)).rejects.toThrow('CONTEXT_LOST');expect(hash((other.runtime as unknown as {context:unknown}).context)).toBe(foreignBefore);
    const second=await read('second',1);expect(second.outcome.ledger.state).not.toBe('SUCCEEDED');expect(second.outcome.availability).toBeNull();expect(h.runtime.active).toBe(false);expect(JSON.stringify(h.messages.filter(m=>m.route==='outcomes'))).not.toContain('"value"');
  });
  it('retains capacity until actual browser close and releases private runtime references even when close fails',async()=>{
    const h=await setup();let finish:(()=>void)|undefined;vi.mocked(h.browser.close).mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));const stopping=h.runtime.stop('CANCELLED');await Promise.resolve();expect(h.runtime.active).toBe(true);expect(h.messages.filter(m=>m.route==='lifecycle')).toHaveLength(0);if(!finish)throw new Error('CLOSE');finish();await stopping;expect(h.runtime.active).toBe(false);
    const closed=h.runtime as unknown as {browser:unknown;launching:unknown;context:{authoredInputs:{inputs:unknown[]}}};expect(closed.browser).toBeNull();expect(closed.launching).toBeNull();expect(closed.context.authoredInputs.inputs).toEqual([]);
    const failed=await setup();vi.mocked(failed.browser.close).mockRejectedValueOnce(new Error('private-close-canary'));await expect(failed.runtime.stop('CANCELLED')).rejects.toThrow('CONTEXT_LOST');expect(failed.runtime.active).toBe(true);expect(failed.messages.filter(m=>m.route==='lifecycle')).toHaveLength(0);
    const state=failed.runtime as unknown as {browser:unknown;launching:unknown;context:{authoredInputs:{inputs:unknown[]}}};expect(state.browser).toBeNull();expect(state.launching).toBeNull();expect(state.context.authoredInputs.inputs).toEqual([]);expect(JSON.stringify(failed.messages)).not.toContain('private-close-canary');
    // A failed close remains unacknowledged. Test cleanup must not turn it into a false success.
    cleanup.pop();
  });
  it('cleans a partial launch failure and cancels an in-flight launch without creating a live context',async()=>{
    const failedContext=guidedContext('https://example.test');const failedClose=vi.fn(()=>Promise.resolve());const failed=new GuidedRuntime(failedContext,{workerId:failedContext.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:await directory(),launch:()=>Promise.reject(new GuidedLaunchFailure(failedClose)),callback:()=>Promise.resolve()});
    await expect(failed.start()).rejects.toThrow('CONTEXT_LOST');await failed.stop('CONTEXT_LOST');expect(failedClose).toHaveBeenCalledOnce();expect(failed.active).toBe(false);
    const fixture=await setup();const context=guidedContext('https://example.test');let release:((browser:GuidedBrowser)=>void)|undefined;let entered=false;const gate=new Promise<GuidedBrowser>(resolve=>{release=resolve;});
    const terminate=vi.fn(()=>Promise.resolve());const browser={...fixture.browser,terminate};const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:await directory(),launch:()=>{entered=true;return gate;},callback:()=>Promise.resolve()});
    const starting=runtime.start().catch((error:unknown)=>error instanceof Error?error.message:'unexpected');await expect.poll(()=>entered).toBe(true);const stopping=runtime.stop('CANCELLED');expect(runtime.active).toBe(true);if(!release)throw new Error('LAUNCH');release(browser);await stopping;expect(await starting).toBe('CONTEXT_LOST');expect(terminate).toHaveBeenCalledOnce();expect(runtime.active).toBe(false);
  });
  it('refreshes a new generation, correlates its committed callback and invalidates old preparation without another action',async()=>{
    const h=await setup();const observe=vi.spyOn(h.browser.observations,'observe');await expect(h.runtime.refreshObservation({...identity(h.context),expectedGeneration:0,focus:{stepText:'',targetIntents:[]}},'blank')).rejects.toThrow('TARGET_CHANGED');await h.runtime.dispatch(h.request);
    const old=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;
    const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:old.documentId,generation:old.generation,origin:old.origin,observationHash:hash(old)};
    const next=proposal(h.context,evidence,'next',{kind:'navigate',destinationInputId:'input-next'});const prepared=await h.runtime.prepare({pressInheritance:null,...identity(h.context),proposal:next,requestDigest:hash(next),expiresAt:new Date(Date.now()+10_000).toISOString()});
    const request={...identity(h.context),expectedGeneration:old.generation,focus:{stepText:'',targetIntents:[]}};const refreshed=await h.runtime.refreshObservation(request,'refresh-one');expect(refreshed.observation.generation).toBe(old.generation+1);expect(h.runtime.currentObservation(refreshed)).toEqual(refreshed);expect(h.messages.at(-1)?.key).toBe(`oref-${hash({identity:identity(request),idempotencyKey:'refresh-one',requestDigest:hash(request)})}`);
    await expect(h.runtime.dispatch(dispatch(h.context,next,prepared))).rejects.toThrow('PREPARATION_DENIED');await expect(h.runtime.refreshObservation(request,'stale-new-key')).rejects.toThrow('TARGET_CHANGED');
    const newer=await h.runtime.refreshObservation({...identity(h.context),expectedGeneration:refreshed.observation.generation,focus:{stepText:'',targetIntents:[]}},'refresh-two');expect(newer.observation.generation).toBe(refreshed.observation.generation+1);expect(()=>h.runtime.currentObservation(refreshed)).toThrow('TARGET_CHANGED');expect(observe).toHaveBeenCalledTimes(3);expect(h.browser.navigateBlank).toHaveBeenCalledOnce();expect(h.messages.filter(m=>m.route==='outcomes')).toHaveLength(1);
  });
  it('does not expose unacknowledged refresh evidence and rejects late acknowledgement after cancellation',async()=>{
    let entered:(()=>void)|undefined,release:(()=>void)|undefined;const entering=new Promise<void>(resolve=>{entered=resolve;});const hold=new Promise<void>(resolve=>{release=resolve;});
    const h=await setup({observationCallback:(_body,key)=>{if(key){entered?.();return hold;}return Promise.resolve();}});await h.runtime.dispatch(h.request);const request={...identity(h.context),expectedGeneration:1,focus:{stepText:'',targetIntents:[]}};const pending=h.runtime.refreshObservation(request,'hold');await entering;
    await expect(h.runtime.refreshObservation(request,'busy')).rejects.toThrow('BUSY');expect(()=>h.runtime.currentObservation(h.messages.at(-1)?.body)).toThrow('BUSY');await h.runtime.stop('CANCELLED');if(!release)throw new Error('ACK');release();await expect(pending).rejects.toThrow('CONTEXT_LOST');expect(h.browser.navigateBlank).toHaveBeenCalledOnce();expect(h.runtime.active).toBe(false);
  });
  it('reserves refresh count and remaining byte capacity without resetting budgets or running extra effects',async()=>{
    const h=await setup({limits:{maxObservations:2}});const observe=vi.spyOn(h.browser.observations,'observe');await h.runtime.dispatch(h.request);await h.runtime.refreshObservation({...identity(h.context),expectedGeneration:1,focus:{stepText:'',targetIntents:[]}},'last');await expect(h.runtime.refreshObservation({...identity(h.context),expectedGeneration:2,focus:{stepText:'',targetIntents:[]}},'exhausted')).rejects.toThrow('BUDGET_EXCEEDED');expect(observe).toHaveBeenCalledTimes(2);expect(h.browser.navigateBlank).toHaveBeenCalledOnce();
    const bytes=await setup({limits:{maxSanitizedEvidenceBytesTotal:700,maxObservationBytes:700}});const collect=vi.spyOn(bytes.browser.observations,'observe');await bytes.runtime.dispatch(bytes.request);const first=(bytes.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;const remaining=700-Buffer.byteLength(JSON.stringify(first));await expect(bytes.runtime.refreshObservation({...identity(bytes.context),expectedGeneration:1,focus:{stepText:'',targetIntents:[]}},'byte-limit')).rejects.toThrow('BUDGET_EXCEEDED');expect(collect.mock.calls[1]?.[0]).toBe(remaining);expect(bytes.messages.filter(m=>m.route==='observations')).toHaveLength(1);
  });
  it('stops on a lost refresh callback acknowledgement without changing already successful action outcomes',async()=>{
    const h=await setup({observationCallback:(_body,key)=>key?Promise.reject(new Error('PRIVATE-ACK-FAILURE')):Promise.resolve()});await h.runtime.dispatch(h.request);await expect(h.runtime.refreshObservation({...identity(h.context),expectedGeneration:1,focus:{stepText:'',targetIntents:[]}},'lost-ack')).rejects.toThrow('CONTEXT_LOST');expect(h.runtime.active).toBe(false);expect(h.messages.filter(m=>m.route==='outcomes').map(m=>(m.body as BridgeOutcome).ledger.state)).toEqual(['SUCCEEDED']);expect(JSON.stringify(h.messages)).not.toContain('PRIVATE-ACK-FAILURE');
  });
  it('ends the session without emitting an observation when the page stays off the whitelist, and reports the host only',async()=>{
    const h=await setup();await h.runtime.dispatch(h.request);const observations=()=>h.messages.filter(m=>m.route==='observations').length,before=observations();
    const written:string[]=[];const stderr=vi.spyOn(process.stderr,'write').mockImplementation((chunk:string|Uint8Array)=>{written.push(String(chunk));return true;});
    try{
      vi.spyOn(h.browser.observations,'observe').mockRejectedValueOnce(new OriginNotAllowed('idp.example.net'));
      await expect(h.runtime.refreshObservation({...identity(h.context),expectedGeneration:1,focus:{stepText:'',targetIntents:[]}},'off-list')).rejects.toThrow('POLICY_DENIED');
    }finally{stderr.mockRestore();}
    expect(observations()).toBe(before);expect(h.runtime.active).toBe(false);
    expect(h.messages.filter(m=>m.route==='lifecycle').map(m=>(m.body as {reason:string}).reason)).toEqual(['CONTEXT_LOST']);
    expect(written).toEqual(['GUIDED_ORIGIN_NOT_ALLOWED host=idp.example.net\n']);
  });
  it('rejects mismatched owner/tuple, raised caps, fabricated origin and context rewrites',async()=>{
    const h=await setup();await expect(h.runtime.dispatch({...h.request,ownerFence:2})).rejects.toThrow('IDENTITY_MISMATCH');await expect(h.runtime.dispatch({...h.request,versions:{...h.request.versions,contract:1}})).rejects.toThrow('SCHEMA');
    expect(()=>validate('runner-context',{...h.context,limits:{...h.context.limits,maxRuntimeValues:33}})).toThrow('SCHEMA');
    const altered=structuredClone(h.request);altered.proposal.executionEvidence={...altered.proposal.executionEvidence,origin:'https://example.test'} as typeof altered.proposal.executionEvidence;await expect(h.runtime.dispatch(altered)).rejects.toThrow('SCHEMA');
    const before=hash((h.runtime as unknown as {context:unknown}).context);await expect(h.runtime.update({...h.context,authoredInputsHash:'b'.repeat(64)})).rejects.toThrow('INPUT_IDENTITY');expect(hash((h.runtime as unknown as {context:unknown}).context)).toBe(before);expect(h.browser.navigateBlank).not.toHaveBeenCalled();
  });
});

describe('guided session recording on the runtime (STUDIO-OBS-013 AC-1, AC-2)', () => {
  type Route = Parameters<GuidedRuntimeOptions['callback']>[0];
  async function recorded(options:{recorder?:boolean;ready?:boolean;effect?:'ok'|'unknown'|'targetChanged'|'targetChangedAfterNative';csiId?:string;openGate?:Promise<void>;putGate?:Promise<void>}={}){
    const context=guidedContext('https://example.test');const path=await directory();const evidenceRoot=await directory();
    const objects=new Map<string,Uint8Array>();
    const store={async put(request:PutObjectRequest){await options.putGate;objects.set(request.key,request.body.kind==='bytes'?request.body.data:await readFile(request.body.path));}};
    let tick=0;const source={monotonicNow:()=>{tick+=10.25;return 5_000+tick;},wallNow:()=>new Date()};
    const recorder=createGuidedRecorder({store,fileSystem:{stat:async p=>({size:(await readFile(p)).byteLength}),readFile:()=>Promise.reject(new Error('whole-file'))},bounds:{maxAttempts:1,windowMs:5_000,backoffMs:0},size:{width:1280,height:720},calibrationOffsetMs:0,originSource:source,now:()=>0,sleep:()=>Promise.resolve(),evidenceRoot});
    const allocatedDirectories:string[]=[];
    let opening=0;const gated:GuidedRecorder={async open(session){opening++;await options.openGate;const recording=await recorder.open(session);if(recording.directory===null)throw new Error('RECORDING_DIRECTORY_NOT_ALLOCATED');allocatedDirectories.push(recording.directory);return recording;}};
    const messages:{route:Route;body:unknown;key?:string}[]=[];const launches:unknown[][]=[];let video:string|null=null;
    const browser:GuidedBrowser={evidence:{kind:'initialBlank',sessionId:context.sessionId,contextId:context.contextId,creationId:randomUUID(),bootstrapId:randomUUID(),documentId:randomUUID(),url:'about:blank',origin:null,generation:0},blankMatches:vi.fn(()=>Promise.resolve(true)),
      navigateBlank:vi.fn(()=>options.effect==='unknown'?Promise.reject(new Error('lost')):options.effect==='targetChangedAfterNative'?Promise.reject(new Error('TARGET_CHANGED')):Promise.resolve()),close:vi.fn(()=>Promise.resolve()),terminate:vi.fn(()=>Promise.resolve()),orderlyClosed:()=>true,recordedVideo:()=>Promise.resolve(video),
      observations:sessionStub({withhold:()=>Promise.resolve(),observe:()=>Promise.resolve({observation:{schemaVersion:3,sessionId:context.sessionId,scopeHash:context.scopeHash,documentId:'page-document',generation:1,origin:'https://example.test',observedAt:new Date().toISOString(),coverage:{withheldRegions:0,unsupportedRegions:0,passwordControls:0},projection:{projected:false,tier:null,totalNodes:1,shownNodes:1,notShown:0,outlineBytes:15},readRuleId:null,outline:'- text "x" [e1]',facts:{e1:{role:'text',name:'x',editable:false, nameComplete: true, ownTextComplete: true,evidence:'x',evidenceSegments:[]}}},json:'',bytes:0,observationHash:''}),dispose:()=>Promise.resolve()})};
    const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:path,...(options.recorder===false?{}:{recorder:gated}),csiId:options.csiId??'CSI-123',
      launch:async(...args:unknown[])=>{launches.push(args);const request=args[3] as GuidedRecordingRequest|undefined;if(request){request.ready(options.ready??true);video=join(request.dir,'page.webm');const bytes=Buffer.alloc(4096,1);bytes.set(WEBM_MAGIC,0);await writeFile(video,bytes);}return browser;},
      callback:(route,body,key)=>{messages.push({route,body,...(key?{key}:{})});return Promise.resolve();}});
    cleanup.push(()=>runtime.stop('CANCELLED'));
    return {context,runtime,messages,launches,objects,browser,evidenceRoot,allocatedDirectories,effect:options.effect,opening:()=>opening};
  }
  async function assertRecordingCleanup(h:Awaited<ReturnType<typeof recorded>>):Promise<void>{
    // Capture the actual allocated leaf even when cancellation prevents browser launch.
    expect(h.allocatedDirectories).toHaveLength(1);
    for(const leaf of h.allocatedDirectories)await expect(lstat(leaf)).rejects.toMatchObject({code:'ENOENT'});
    let nodes=0;
    const inspect=async(path:string,depth:number,scope:string|null,nonce:string|null):Promise<void>=>{
      expect(++nodes).toBeLessThanOrEqual(5);expect(depth).toBeLessThanOrEqual(4);
      const stats=await lstat(path);expect(stats.isSymbolicLink()).toBe(false);expect(stats.uid).toBe(process.getuid?.());
      if(depth===4){
        expect(stats.isFile()).toBe(true);expect(stats.mode&0o777).toBe(0o600);expect(stats.nlink).toBe(1);expect(stats.size).toBeGreaterThan(0);expect(stats.size).toBeLessThanOrEqual(32768);
        const owner:unknown=JSON.parse(await readFile(path,'utf8'));
        expect(owner).toEqual({version:1,pid:process.pid,nonce,scope});return;
      }
      expect(stats.isDirectory()).toBe(true);expect(stats.mode&0o777).toBe(0o700);
      const entries=await readdir(path);expect(entries).toHaveLength(1);const entry=entries[0];if(entry===undefined)throw new Error('OWNERSHIP_ENTRY_MISSING');
      if(depth===0)expect(entry).toBe('.checks-guided-recordings');
      else if(depth===1){expect(entry).toMatch(/^[a-f0-9]{64}$/u);scope=entry;}
      else if(depth===2){expect(entry).toMatch(/^inc-[a-f0-9]{48}$/u);nonce=entry.slice(4);}
      else expect(entry).toBe('owner.json');
      await inspect(join(path,entry),depth+1,scope,nonce);
    };
    // Only the complete private ownership chain and its closed marker may remain. Any extra
    // file/directory (including video or application content) fails this full-tree assertion.
    await inspect(h.evidenceRoot,0,null,null);expect(nodes).toBe(5);
  }
  async function navigate(h:Awaited<ReturnType<typeof recorded>>){
    await h.runtime.start();const evidence=(h.messages[0]?.body as BridgeBootstrap).executionEvidence;const p=proposal(h.context,evidence,'nav',{kind:'navigate',destinationInputId:'input-nav'});
    const prep=await h.runtime.prepare({pressInheritance:null,...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10_000).toISOString()});const request=dispatch(h.context,p,prep);
    // A pre-native target refusal happens after immutable preparation, at the final guard.
    if(h.effect==='targetChanged')vi.mocked(h.browser.blankMatches).mockResolvedValueOnce(false);
    return {request,outcome:await h.runtime.dispatch(request)};
  }
  it('launches one recorded context, stamps the dispatched action on the session clock and reports after the lifecycle', async () => {
    const h=await recorded();const {request,outcome}=await navigate(h);expect(outcome.ledger.state).toBe('SUCCEEDED');
    expect(h.launches).toHaveLength(1);expect((h.launches[0]?.[3] as GuidedRecordingRequest).size).toEqual({width:1280,height:720});
    await h.runtime.stop('CANCELLED');await h.runtime.recordingSettled;
    expect(h.messages.map(m=>m.route)).toEqual(['bootstrap-evidence','outcomes','observations','lifecycle','recording-evidence']);
    const evidence=h.messages.at(-1);const body=evidence?.body as RecordingEvidenceBody;
    expect(evidence?.key).toBe(`rec-${body.recordingId}`);
    expect(body).toMatchObject({...identity(h.context),state:'STORED',partial:false});
    expect(body.timings).toEqual([{kind:'action',stepId:'nav',admissionId:request.ledger.admission.admissionId,ordinal:0,startMs:10,endMs:21}]);
    expect(validate('bridge',body,'recordingEvidence')).toEqual(body);
    expect([...h.objects.keys()].sort()).toEqual([`studio/CSI-123/guided/${h.context.sessionId}.manifest.json`,`studio/CSI-123/guided/${h.context.sessionId}.webm`]);
    const stored=JSON.stringify({messages:h.messages.slice(-1),manifest:Buffer.from(h.objects.get(`studio/CSI-123/guided/${h.context.sessionId}.manifest.json`)??new Uint8Array()).toString('utf8')});
    for(const input of h.context.authoredInputs.inputs)if('value' in input)expect(stored).not.toContain(input.value);
    await assertRecordingCleanup(h);
  });
  it('does not make the stop wait for the upload', async () => {
    let release:()=>void=()=>undefined;const putGate=new Promise<void>(resolve=>{release=resolve;});
    const h=await recorded({putGate});await navigate(h);await h.runtime.stop('CANCELLED');
    expect(h.runtime.active).toBe(false);expect(h.messages.map(m=>m.route)).not.toContain('recording-evidence');
    release();await h.runtime.recordingSettled;expect(h.messages.at(-1)?.route).toBe('recording-evidence');
  });
  it.each([['unknown','UNKNOWN_OUTCOME',null],['targetChanged','FAILED',null],['targetChangedAfterNative','UNKNOWN_OUTCOME',null]] as const)('stamps endMs per outcome for %s effects', async (effect,state,endMs) => {
    const h=await recorded({effect});const stderr=vi.spyOn(process.stderr,'write').mockImplementation(()=>true);let spent:Awaited<ReturnType<typeof navigate>>['request']|undefined;
    try{const {request,outcome}=await navigate(h);spent=request;expect(outcome.ledger.state).toBe(state);expect(outcome.ledger.admission).toEqual(request.ledger.admission);expect(outcome.ledger.preparationId).toBe(request.preparationId);}finally{stderr.mockRestore();}
    await h.runtime.recordingSettled;const body=h.messages.at(-1)?.body as RecordingEvidenceBody;
    expect(body.state).toBe('STORED');expect(h.launches).toHaveLength(1);expect(h.runtime.accepting).toBe(false);
    if(effect==='targetChanged'){expect(h.browser.navigateBlank).not.toHaveBeenCalled();expect(body.timings).toEqual([]);}
    else{expect(h.browser.navigateBlank).toHaveBeenCalledOnce();expect(body.timings).toEqual([expect.objectContaining({startMs:10,endMs})]);}
    await expect(h.runtime.dispatch(spent)).rejects.toThrow('CONTEXT_LOST');
  });
  it('reports a recorder that never attached as UNAVAILABLE with no timings and no video object', async () => {
    const h=await recorded({ready:false});await navigate(h);await h.runtime.stop('CANCELLED');await h.runtime.recordingSettled;
    expect(h.messages.at(-1)?.body).toMatchObject({state:'UNAVAILABLE',partial:false,timings:[]});
    expect([...h.objects.keys()]).toEqual([`studio/CSI-123/guided/${h.context.sessionId}.manifest.json`]);
  });
  it('records nothing and launches unrecorded without a recorder', async () => {
    const h=await recorded({recorder:false});await navigate(h);await h.runtime.stop('CANCELLED');await h.runtime.recordingSettled;
    expect(h.launches[0]?.[3]).toBeUndefined();expect(h.launches[0]).toHaveLength(5);expect((h.launches[0]?.[4] as GuidedStartup).deadlineEpochMs).toBeGreaterThan(Date.now());expect(h.messages.map(m=>m.route)).not.toContain('recording-evidence');expect(h.objects.size).toBe(0);
  });
  const KEPT_REASONS=['CANCELLED','EXPIRED','UNKNOWN_OUTCOME','LEASE_LOST','CONTEXT_LOST','REVOKED'] as const;
  it.each(KEPT_REASONS)('keeps the recording for a %s stop: upload, manifest, lifecycle and recording-evidence as before', async reason => {
    const h=await recorded();await navigate(h);await h.runtime.stop(reason);await h.runtime.recordingSettled;
    expect(h.messages.map(m=>m.route)).toEqual(['bootstrap-evidence','outcomes','observations','lifecycle','recording-evidence']);
    expect(h.messages.find(m=>m.route==='lifecycle')?.body).toMatchObject({reason});
    expect(h.messages.at(-1)?.body).toMatchObject({state:'STORED'});
    expect([...h.objects.keys()].sort()).toEqual([`studio/CSI-123/guided/${h.context.sessionId}.manifest.json`,`studio/CSI-123/guided/${h.context.sessionId}.webm`]);
    await assertRecordingCleanup(h);
  });
  it('discards the recording on a PUBLISHED stop: no object, no manifest, no recording-evidence callback, no lifecycle, and the scratch is gone', async () => {
    const h=await recorded();await navigate(h);await h.runtime.stop('PUBLISHED');await h.runtime.recordingSettled;
    expect(h.runtime.active).toBe(false);expect(h.browser.close).toHaveBeenCalledOnce();
    expect(h.messages.map(m=>m.route)).toEqual(['bootstrap-evidence','outcomes','observations']);
    expect(h.objects.size).toBe(0);
    await assertRecordingCleanup(h);
  });
  it('is idempotent for a re-sent PUBLISHED stop, before or after the recording settled', async () => {
    const h=await recorded();await navigate(h);const first=h.runtime.stop('PUBLISHED');const resent=h.runtime.stop('PUBLISHED');
    await Promise.all([first,resent]);await h.runtime.recordingSettled;await expect(h.runtime.stop('PUBLISHED')).resolves.toBeUndefined();await h.runtime.recordingSettled;
    expect(h.browser.close).toHaveBeenCalledOnce();expect(h.messages.map(m=>m.route)).toEqual(['bootstrap-evidence','outcomes','observations']);
    expect(h.objects.size).toBe(0);await assertRecordingCleanup(h);
  });
  it('turns the pending settlement of an already closing session into a discard when PUBLISHED arrives second', async () => {
    const h=await recorded();await navigate(h);const closing=h.runtime.stop('CANCELLED');await h.runtime.stop('PUBLISHED');await closing;await h.runtime.recordingSettled;
    expect(h.messages.map(m=>m.route)).toEqual(['bootstrap-evidence','outcomes','observations','lifecycle']);
    expect(h.messages.at(-1)?.body).toMatchObject({reason:'CANCELLED'});
    expect(h.objects.size).toBe(0);await assertRecordingCleanup(h);
  });
  it('discards a recording opened by a start that a PUBLISHED stop overtook', async () => {
    let open:()=>void=()=>undefined;const openGate=new Promise<void>(resolve=>{open=resolve;});
    const h=await recorded({openGate});const starting=h.runtime.start();await vi.waitFor(()=>{expect(h.opening()).toBe(1);});
    await h.runtime.stop('PUBLISHED');open();await expect(starting).rejects.toThrow('CONTEXT_LOST');await h.runtime.recordingSettled;
    expect(h.launches).toEqual([]);expect(h.messages.map(m=>m.route)).not.toContain('recording-evidence');expect(h.objects.size).toBe(0);
    await assertRecordingCleanup(h);
  });
  it('settles a recording opened by a start that a stop overtook, without launching', async () => {
    let open:()=>void=()=>undefined;const openGate=new Promise<void>(resolve=>{open=resolve;});
    const h=await recorded({openGate});const starting=h.runtime.start();await vi.waitFor(()=>{expect(h.opening()).toBe(1);});
    await h.runtime.stop('CANCELLED');open();await expect(starting).rejects.toThrow('CONTEXT_LOST');await h.runtime.recordingSettled;
    expect(h.launches).toEqual([]);expect(h.messages.at(-1)).toMatchObject({route:'recording-evidence',body:{state:'UNAVAILABLE',timings:[]}});
    await assertRecordingCleanup(h);
  });
});
describe('STUDIO-OBS-014 AC-1 guided learning takes no field rules (ar-mounted-rules oracle 2)',()=>{
  it('builds the collector config with rules: [] even when a rules option is smuggled past the type',async()=>{
    const context=guidedContext('https://example.test');const configs:ObservationConfig[]=[];
    const readRule={testId:'source',name:'Business reference',policyRuleId:'reference-read',classification:'permittedBusinessData'};
    const smuggled={workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:await directory(),rules:[readRule],launch:(config:ObservationConfig)=>{configs.push(config);return Promise.reject(new GuidedLaunchFailure(()=>Promise.resolve()));},callback:()=>Promise.resolve()} as unknown as GuidedRuntimeOptions;
    const runtime=new GuidedRuntime(context,smuggled);await expect(runtime.start()).rejects.toThrow('CONTEXT_LOST');await runtime.stop('CONTEXT_LOST');
    expect(configs).toHaveLength(1);expect(configs[0]).not.toHaveProperty('rules');
    expect(await readFile(new URL('../../src/guided/runtime.ts',import.meta.url),'utf8')).not.toContain('options.rules');
  });
});
describe('REL-001 the failed start step and the launch error stay visible',()=>{
  const blankBrowser=(context:ReturnType<typeof guidedContext>,blank:boolean):GuidedBrowser=>({evidence:{kind:'initialBlank',sessionId:context.sessionId,contextId:context.contextId,creationId:randomUUID(),documentId:randomUUID(),bootstrapId:randomUUID(),url:'about:blank',origin:null,generation:0},blankMatches:()=>Promise.resolve(blank),navigateBlank:()=>Promise.resolve(),close:()=>Promise.resolve(),terminate:vi.fn(()=>Promise.resolve()),orderlyClosed:()=>true,observations:sessionStub({withhold:()=>Promise.resolve(),observe:()=>Promise.reject(new Error('unused'))})});
  it('keeps a plain launch rejection as the cause and records LAUNCH',async()=>{
    const context=guidedContext('https://example.test');const original=new Error('launch exploded');
    const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:await directory(),launch:()=>Promise.reject(original),callback:()=>Promise.resolve()});
    await expect(runtime.start()).rejects.toMatchObject({message:'CONTEXT_LOST',cause:original});
    expect(runtime.startFailure).toEqual({phase:'LAUNCH',loss:null});await runtime.stop('CONTEXT_LOST');
  });
  it.each([{phase:'BLANK_MATCH',blank:false,callbackFails:false,message:'CONTEXT_LOST'},{phase:'BOOTSTRAP_CALLBACK',blank:true,callbackFails:true,message:'CALLBACK_DENIED'}] as const)('records $phase when the start fails there',async({phase,blank,callbackFails,message})=>{
    const context=guidedContext('https://example.test');
    const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:await directory(),launch:()=>Promise.resolve(blankBrowser(context,blank)),callback:route=>callbackFails&&route==='bootstrap-evidence'?Promise.reject(new Error('CALLBACK_DENIED')):Promise.resolve()});
    await expect(runtime.start()).rejects.toThrow(message);expect(runtime.startFailure.phase).toBe(phase);await runtime.stop('CONTEXT_LOST');
  });
  it('records STARTED after a completed start',async()=>{
    const context=guidedContext('https://example.test');
    const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:await directory(),launch:()=>Promise.resolve(blankBrowser(context,true)),callback:()=>Promise.resolve()});
    await runtime.start();expect(runtime.startFailure).toEqual({phase:'STARTED',loss:null});await runtime.stop('CANCELLED');
  });
});

describe('ADR-SC-007 node targets: prepare proof, dispatch through the session, observation windows',()=>{
  const TARGET={locator:[{by:'testId' as const,value:'source'}],tier:'testId' as const,identity:{role:'text',name:null}};
  async function nodeProposal(h:Awaited<ReturnType<typeof setup>>,operation:Action['operation']={kind:'click'}){
    await h.runtime.dispatch(h.request);const o=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;
    const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:hash(o)};
    return{o,p:proposal(h.context,evidence,'submit',operation,{kind:'node',ref:'e1',documentId:o.documentId,generation:o.generation})};
  }
  const prepare=(h:Awaited<ReturnType<typeof setup>>,p:Action)=>h.runtime.prepare({pressInheritance:null,...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10_000).toISOString()});

  it('puts the prepared target in the proof and acts through session.invoke with that target in the learn profile',async()=>{
    const h=await setup();const prepareTarget=vi.fn(()=>Promise.resolve(TARGET));const invoke=vi.fn(()=>Promise.resolve({}));
    h.browser.observations.prepareTarget=prepareTarget;h.browser.observations.invoke=invoke;
    const{o,p}=await nodeProposal(h);const proof=await prepare(h,p);
    expect(proof.target).toEqual(TARGET);
    const authority = (prepareTarget.mock.calls[0] as unknown as [{ continuityAuthority: string }])[0].continuityAuthority;
    expect(authority).toMatch(/^[a-f0-9]{64}$/u);
    expect(prepareTarget).toHaveBeenCalledWith({ref:'e1',documentId:o.documentId,generation:o.generation,origin:o.origin,operation:{kind:'click'},authoredLiteral:null,pressInheritance:null,continuityAuthority:authority});
    await h.runtime.dispatch(dispatch(h.context,p,proof));
    expect(invoke).toHaveBeenCalledOnce();
    const[request]=invoke.mock.calls[0] as unknown as [{resolved:unknown;profile:string;expect:unknown;readRuleId:unknown}];
    expect(request).toMatchObject({resolved:TARGET,profile:'learn',expect:{documentId:o.documentId,generation:o.generation},readRuleId:null});
  });

  it('refuses a dispatch whose ledger hash was computed without the prepared target',async()=>{
    const h=await setup();h.browser.observations.prepareTarget=()=>Promise.resolve(TARGET);const invoke=vi.fn(()=>Promise.resolve({}));h.browser.observations.invoke=invoke;
    const{p}=await nodeProposal(h);const proof=await prepare(h,p);const request=dispatch(h.context,p,{...proof,target:null});
    await expect(h.runtime.dispatch(request)).rejects.toThrow('ADMISSION_DENIED');expect(invoke).not.toHaveBeenCalled();
  });

  it.each(['OPTION_NOT_PRESENT','NO_DURABLE_LOCATOR','READ_NOT_ALLOWED','TARGET_CHANGED'])('lets the closed prepare refusal %s leave unchanged and stores nothing',async code=>{
    const h=await setup();h.browser.observations.prepareTarget=()=>Promise.reject(new Error(code));
    const{p}=await nodeProposal(h);await expect(prepare(h,p)).rejects.toThrow(code);
    await expect(h.runtime.dispatch(dispatch(h.context,p,{...(await(async()=>{h.browser.observations.prepareTarget=()=>Promise.resolve(TARGET);return prepare(h,p);})())}))).resolves.toMatchObject({ledger:{state:'SUCCEEDED'}});
  });

  it('hands G1 the selectOption authored literal, and nothing for a binding-sourced value or another operation',async()=>{
    const h=await setup();await h.runtime.dispatch(h.request);const o=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;
    const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:hash(o)};
    const literal=(operation:Action['operation'])=>(h.runtime as unknown as {authoredLiteral(p:Action):string|null}).authoredLiteral(proposal(h.context,evidence,'nav',operation));
    expect(literal({kind:'selectOption',value:{kind:'authoredLiteral',sourceInputId:'input-nav'}})).toBe('https://example.test/source');
    expect(literal({kind:'selectOption',value:{kind:'binding',bindingId:'binding-one'}})).toBeNull();
    expect(literal({kind:'fill',value:{kind:'authoredLiteral',sourceInputId:'input-nav'}})).toBeNull();
  });

  it('passes the refresh focus to the observation and ends a deadline as the OBSERVATION_DEADLINE refusal',async()=>{
    const h=await setup();await h.runtime.dispatch(h.request);const observe=vi.spyOn(h.browser.observations,'observe');
    const focus={stepText:'Click the Save button',targetIntents:['Save']};
    await h.runtime.refreshObservation({...identity(h.context),expectedGeneration:1,focus},'with-focus');
    expect(observe).toHaveBeenLastCalledWith(expect.any(Number),true,focus,undefined);
    observe.mockRejectedValueOnce(new ClosedActionError('OBSERVATION_DEADLINE'));
    await expect(h.runtime.refreshObservation({...identity(h.context),expectedGeneration:2,focus},'too-heavy')).rejects.toThrow('OBSERVATION_DEADLINE');
    expect(h.runtime.active).toBe(true);
  });

  it('gives the post-dispatch observation what is left of the 12 s window, skips it below 1.5 s, and keeps a committed outcome when it hits the deadline',async()=>{
    const h=await setup();const observe=vi.spyOn(h.browser.observations,'observe');
    await h.runtime.dispatch(h.request);
    const windowMs=(observe.mock.calls.at(-1) as unknown[])[3] as number;
    expect(windowMs).toBeLessThanOrEqual(12_000);expect(windowMs).toBeGreaterThanOrEqual(1_500);
    const g=await setup();const gObserve=vi.spyOn(g.browser.observations,'observe');
    gObserve.mockRejectedValue(new ClosedActionError('OBSERVATION_DEADLINE'));
    await expect(g.runtime.dispatch(g.request)).resolves.toMatchObject({ledger:{state:'SUCCEEDED'}});
    expect(g.runtime.active).toBe(true);
    const s=await setup();vi.useFakeTimers();const sObserve=vi.spyOn(s.browser.observations,'observe');Object.assign(s.browser,{navigateBlank:vi.fn(async()=>{await vi.advanceTimersByTimeAsync(11_000);})});
    await s.runtime.dispatch(s.request);expect(sObserve).not.toHaveBeenCalled();
  });

  it('answers the deadline refusal, not a stale generation, to a pull that follows a post-dispatch observation that ran out of time', async () => {
    const g = await setup();
    vi.spyOn(g.browser.observations, 'observe').mockRejectedValue(new ClosedActionError('OBSERVATION_DEADLINE'));
    await expect(g.runtime.dispatch(g.request)).resolves.toMatchObject({ ledger: { state: 'SUCCEEDED' } });
    await expect(g.runtime.refreshObservation({ ...identity(g.context), expectedGeneration: 0, focus: { stepText: '', targetIntents: [] } }, 'after-deadline')).rejects.toThrow('OBSERVATION_DEADLINE');
    // The sequence the real worker hits: the refusal leaves the session alive (the backend ends it as UNSUPPORTED_SURFACE), and a repeated pull answers the same refusal.
    expect(g.runtime.active).toBe(true);
    await expect(g.runtime.refreshObservation({ ...identity(g.context), expectedGeneration: 0, focus: { stepText: '', targetIntents: [] } }, 'after-deadline-again')).rejects.toThrow('OBSERVATION_DEADLINE');
    expect(g.runtime.active).toBe(true);
  });
});
