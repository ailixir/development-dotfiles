import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import type { Session } from '../../src/guided/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GuidedOwnership } from '../../src/guided/ownership.js';
import type { ClaimPort, OwnershipOptions } from '../../src/guided/ownership.js';
import { GuidedLaunchFailure, GUIDED_CLOSE_GRACE_MS, GUIDED_START_BUDGET_MS, GUIDED_START_RESERVE_MS, GUIDED_START_TRANSPORT_CEILING_MS, guidedCloseStages } from '../../src/run/guidedBrowser.js';
import type { GuidedBrowser } from '../../src/run/guidedBrowser.js';
import { GuidedStartFailure, describeStartFailure } from '../../src/guided/diagnostics.js';
import { hash,identity } from '../../src/guided/contracts.js';
import { guidedContext,ownershipSession,assignmentFor,proposal,dispatch, sessionStub } from '../helpers/guided.js';
import { stepOp } from '../helpers/stepCode.js';
import { fakeHandle, newRig } from '../helpers/stepFakes.js';
import type { CommandsClaim } from '../../src/guided/types.js';
import { inProcessBrowser } from '../helpers/guidedStepService.js';
const clean:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const fn of clean.reverse())await fn().catch(()=>undefined);clean.length=0;vi.useRealTimers();});
async function setup(claimOverride?:ClaimPort,secret=false){
  vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout']});
  const directory=await mkdtemp(join(tmpdir(),'guided-own-'));clean.push(()=>rm(directory,{recursive:true,force:true}));
  const context=guidedContext('https://example.test');
  if(secret){context.authoredInputs.inputs.push({inputId:'pass',sourceStepId:'fill',kind:'secretRef',secretId:'PASS',provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:'fill',referenceId:'pass-reference',referenceName:'PASS',kind:'secretRef'}});context.authoredInputsHash=hash(context.authoredInputs);}
  const grant=ownershipSession(context),assignment=assignmentFor(context),rig=newRig('about:blank');
  const claims:{command:CommandsClaim;key:string;timeout:number}[]=[];const messages:{route:string;body:unknown}[]=[];
  const browser:GuidedBrowser=inProcessBrowser({evidence:{kind:'initialBlank',sessionId:context.sessionId,contextId:context.contextId,creationId:randomUUID(),documentId:randomUUID(),bootstrapId:randomUUID(),url:'about:blank',origin:null,generation:0},blankMatches:()=>Promise.resolve(true),handle:fakeHandle(rig),close:vi.fn(()=>Promise.resolve()),terminate:vi.fn(()=>Promise.resolve()),orderlyClosed:()=>true,observations: sessionStub({withhold:()=>Promise.resolve(),dispose:()=>Promise.resolve(),observe:()=>Promise.resolve({observation:{schemaVersion:3,sessionId:context.sessionId,scopeHash:context.scopeHash,documentId:'after-nav',generation:1,origin:'https://example.test',observedAt:new Date().toISOString(),coverage:{withheldRegions:0,unsupportedRegions:0,passwordControls:0},projection:{projected:false,tier:null,totalNodes:1,shownNodes:1,notShown:0,outlineBytes:15},outline:'- text "x" [e1]',facts:{e1:{role:'text',name:'x',editable:false, nameComplete: true, ownTextComplete: true,evidence:'x',evidenceSegments:[]}}},json:'',bytes:0,observationHash:''})})});
  const launch=vi.fn(()=>Promise.resolve(browser));
  const options:OwnershipOptions={workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:directory,launch,callback:(route,body)=>{messages.push({route,body});return Promise.resolve();},claim:(command,key,timeout,signal)=>{claims.push({command,key,timeout});return claimOverride?claimOverride(command,key,timeout,signal):Promise.resolve({...structuredClone(grant),owner:{...grant.owner,leaseExpiresAt:new Date(Math.min(Date.now()+30_000,Date.parse(grant.expiresAt))).toISOString()}});}};
  const manager=new GuidedOwnership(options);clean.push(()=>manager.close());return{context,grant,assignment,claims,messages,browser,launch,options,manager,directory,rig};
}
describe('actual owning-worker driver and acknowledged lease authority',()=>{
  it('caps secret reauthorization requests at one second and stops on the two-second lost-response ceiling',async()=>{
    const h=await setup(undefined,true);await h.manager.assign(h.assignment);await h.manager.context(h.context);
    h.options.claim=(_command,_key,timeout,signal)=>{expect(timeout).toBe(1000);return new Promise<Session>((_resolve,reject)=>{signal.addEventListener('abort',()=>{reject(new Error('closed'));},{once:true});});};
    await vi.advanceTimersByTimeAsync(999);expect(h.browser.close).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(h.browser.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(999);expect(h.browser.close).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(h.browser.close).toHaveBeenCalledOnce();expect(h.messages.filter(m=>m.route==='lifecycle').at(-1)?.body).toHaveProperty('reason','LEASE_LOST');
    expect(()=>h.manager.getRuntime(h.context)).toThrow('CONTEXT_LOST');
  });
  it('uses absolute one-second epochs rather than adding response delay to the next secret renewal',async()=>{
    const h=await setup(undefined,true);await h.manager.assign(h.assignment);await h.manager.context(h.context);const starts:number[]=[];
    h.options.claim=()=>{starts.push(Date.now());return new Promise<Session>(resolve=>{setTimeout(()=>{resolve({...structuredClone(h.grant),owner:{...h.grant.owner,leaseExpiresAt:new Date(Date.now()+30000).toISOString()}});},800);});};
    const start=Date.now();await vi.advanceTimersByTimeAsync(2999);expect(starts.map(time=>time-start)).toEqual([1000,2000]);await vi.advanceTimersByTimeAsync(1);expect(starts.map(time=>time-start)).toEqual([1000,2000,3000]);
  });
  it('stops with authentic REVOKED on secret renewal denial and cannot accept another step',async()=>{
    const h=await setup(undefined,true);await h.manager.assign(h.assignment);await h.manager.context(h.context);h.options.claim=()=>Promise.reject(new Error('REVOKED'));
    await vi.advanceTimersByTimeAsync(1000);expect(h.browser.close).toHaveBeenCalledOnce();expect(h.messages.filter(m=>m.route==='lifecycle').at(-1)?.body).toHaveProperty('reason','REVOKED');expect(()=>h.manager.getRuntime(h.context)).toThrow('CONTEXT_LOST');expect(h.rig.w.effects).toEqual([]);
  });
  it('claims once, serially renews beyond30seconds with fresh keys, and installs a delayed context under only acknowledged authority',async()=>{
    const h=await setup();const owned=await h.manager.assign(h.assignment);expect(owned.status).toBe('OWNED');expect(owned.ownerFence).toBe(1);expect(h.claims).toHaveLength(1);expect(h.launch).not.toHaveBeenCalled();
    await h.manager.assign(h.assignment);expect(h.claims).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(35_000);expect(h.claims).toHaveLength(4);expect(new Set(h.claims.map(c=>c.key)).size).toBe(4);expect(h.claims.map(c=>c.command.expectedFence)).toEqual([0,1,1,1]);expect(h.launch).not.toHaveBeenCalled();
    h.context.leaseExpiresAt=new Date(Date.now()-1000).toISOString();await h.manager.context(h.context);expect(h.launch).toHaveBeenCalledOnce();
    const runtime=h.manager.getRuntime(h.context);const p=proposal(h.context,h.browser.evidence,'nav',stepOp('await page.goto(inputs["input-nav"]);',{uses:[{kind:'input',id:'input-nav'}]}));const prepared=await runtime.prepare({...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:h.context.expiresAt});expect(Date.parse(prepared.expiresAt)).toBeLessThanOrEqual(Date.now()+30_000);
    expect((await runtime.dispatch(dispatch(h.context,p,prepared))).ledger.state).toBe('SUCCEEDED');
  });
  it('renews while a consumed browser action is busy without resetting workflow or materialization',async()=>{
    const h=await setup();await h.manager.assign(h.assignment);await h.manager.context(h.context);const runtime=h.manager.getRuntime(h.context);let release:(()=>void)|undefined;let entered:(()=>void)|undefined;const entering=new Promise<void>(resolve=>{entered=resolve;});h.rig.page.goto=()=>{h.rig.w.effects.push('goto');entered?.();return new Promise<void>(resolve=>{release=resolve;});};
    const p=proposal(h.context,h.browser.evidence,'nav',stepOp('await page.goto(inputs["input-nav"]);',{uses:[{kind:'input',id:'input-nav'}]}));const proof=await runtime.prepare({...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:h.context.expiresAt});const request=dispatch(h.context,p,proof);const pending=runtime.dispatch(request);await entering;
    await vi.advanceTimersByTimeAsync(11_000);expect(h.claims.length).toBeGreaterThan(1);expect(h.rig.w.effects).toEqual(['goto']);if(!release)throw new Error('RELEASE');release();expect((await pending).ledger.state).toBe('SUCCEEDED');await expect(runtime.dispatch(request)).rejects.toThrow();
  });
  it('stops on renewal failure, stale fence/lease or terminal grant and cannot revive via context or assignment retry',async()=>{
    for(const failure of ['network','fence','lease','terminal'] as const){
      const h=await setup();let initial:ReturnType<typeof ownershipSession>|null=null;let calls=0;h.options.claim=()=>{calls++;if(calls===1){initial=structuredClone(h.grant);return Promise.resolve(initial);}if(failure==='network')return Promise.reject(new Error('PRIVATE-TRANSPORT-FAILURE'));if(!initial)throw new Error('GRANT');const next=structuredClone(initial);next.owner.leaseExpiresAt=new Date(Date.now()+30_000).toISOString();if(failure==='fence')next.owner.fence++;if(failure==='lease')next.owner.leaseExpiresAt=initial.owner.leaseExpiresAt;if(failure==='terminal')next.state='CANCELLED';return Promise.resolve(next);};
      await h.manager.assign(h.assignment);await h.manager.context(h.context);await vi.advanceTimersByTimeAsync(10_000);await expect(h.manager.assign(h.assignment)).rejects.toThrow('CONTEXT_LOST');await expect(h.manager.context(h.context)).rejects.toThrow('CONTEXT_LOST');expect(h.browser.close).toHaveBeenCalledOnce();expect(JSON.stringify(h.messages)).not.toContain('PRIVATE-TRANSPORT-FAILURE');await vi.advanceTimersByTimeAsync(30_000);expect(calls).toBe(2);
    }
  });
  it('answers a PUBLISHED stop idempotently on both variants and never reports it as a lifecycle reason',async()=>{
    const pre=await setup();
    for(let n=0;n<2;n++)expect(await pre.manager.stop({schemaVersion:3,kind:'assignment',assignment:pre.assignment,reason:'PUBLISHED'})).toMatchObject({status:'STOPPED',ownerFence:null});
    expect(pre.messages).toEqual([]);expect(pre.launch).not.toHaveBeenCalled();
    const h=await setup();await h.manager.assign(h.assignment);await h.manager.context(h.context);
    const message={...identity(h.context),reason:'PUBLISHED' as const};
    await h.manager.stop(message);await h.manager.stop(message);
    expect(h.browser.close).toHaveBeenCalledOnce();expect(h.messages.map(m=>m.route)).not.toContain('lifecycle');
  });
  it('pre-context stop before assign creates a durable tombstone and sends no claim or browser command',async()=>{
    const h=await setup();const stopped=await h.manager.stop({schemaVersion:3,kind:'assignment',assignment:h.assignment,reason:'CANCELLED'});expect(stopped).toMatchObject({status:'STOPPED',ownerFence:null,leaseExpiresAt:null});await expect(h.manager.assign(h.assignment)).rejects.toThrow('CONTEXT_LOST');expect(h.claims).toHaveLength(0);expect(h.launch).not.toHaveBeenCalled();
    const restarted=new GuidedOwnership(h.options);await expect(restarted.assign(h.assignment)).rejects.toThrow('CONTEXT_LOST');expect(h.claims).toHaveLength(0);
  });
  it('ignores a late initial claim after cancellation and never recreates ownership after restart',async()=>{
    const h=await setup();let release:((grant:Session)=>void)|undefined;let entered:(()=>void)|undefined;const entering=new Promise<void>(resolve=>{entered=resolve;});h.options.claim=()=>{entered?.();return new Promise<Session>(resolve=>{release=resolve;});};const assigning=h.manager.assign(h.assignment).catch((error:unknown)=>error instanceof Error?error.message:'unexpected');await entering;
    const stop=await h.manager.stop({schemaVersion:3,kind:'assignment',assignment:h.assignment,reason:'CANCELLED'});expect(stop).toMatchObject({status:'STOPPED',ownerFence:null});if(!release)throw new Error('CLAIM');release(h.grant);expect(await assigning).toBe('CONTEXT_LOST');expect(h.launch).not.toHaveBeenCalled();
    const other=await setup();await other.manager.assign(other.assignment);const restarted=new GuidedOwnership(other.options);await expect(restarted.assign(other.assignment)).rejects.toThrow('CONTEXT_LOST');expect(other.claims).toHaveLength(1);
  });
  it('permits clarification waits but rejects contradictory grant scope and context attempts to extend authority',async()=>{
    const h=await setup();h.grant.state='AWAITING_CLARIFICATION';await h.manager.assign(h.assignment);await vi.advanceTimersByTimeAsync(35_000);expect(h.claims.length).toBeGreaterThan(3);expect(h.launch).not.toHaveBeenCalled();h.context.leaseExpiresAt=h.context.expiresAt;await h.manager.context(h.context);
    const stopped=await h.manager.stop({schemaVersion:3,kind:'assignment',assignment:h.assignment,reason:'CANCELLED'});expect(stopped).toMatchObject({status:'STOPPED',ownerFence:1});
    const bad=await setup();bad.grant.scope.configurationRevision='other';await expect(bad.manager.assign(bad.assignment)).rejects.toThrow('CONTEXT_LOST');expect(bad.launch).not.toHaveBeenCalled();
  });
});
describe('the configured capacity (STUDIO_RUNNER_GUIDED_CAPACITY)',()=>{
  it('owns as many learning sessions as its capacity, refuses the next with CAPACITY, and keeps each session separate',async()=>{
    const grants=new Map<string,Session>();
    const h=await setup(command=>{const grant=grants.get(command.sessionId);return grant?Promise.resolve(structuredClone(grant)):Promise.reject(new Error('UNKNOWN_SESSION'));});
    h.options.capacity=3;
    const contexts=[0,1,2,3].map(()=>{const context=guidedContext('https://example.test');grants.set(context.sessionId,ownershipSession(context));return context;});
    const [first,second,third,fourth]=contexts as [typeof contexts[number],typeof contexts[number],typeof contexts[number],typeof contexts[number]];
    const receipts=[];for(const context of [first,second,third])receipts.push(await h.manager.assign(assignmentFor(context)));
    expect(receipts.map(receipt=>receipt.status)).toEqual(['OWNED','OWNED','OWNED']);
    await expect(h.manager.assign(assignmentFor(fourth))).rejects.toThrow('CAPACITY');
    // Each owned session has its own runtime and browser, reachable only under its own identity.
    for(const context of [first,second,third])await h.manager.context(context);
    expect(h.launch).toHaveBeenCalledTimes(3);
    const runtimes=[first,second,third].map(context=>h.manager.getRuntime(context));
    expect(new Set(runtimes).size).toBe(3);
    expect(()=>h.manager.getRuntime(fourth)).toThrow('IDENTITY_MISMATCH');
    expect(()=>h.manager.getRuntime({...identity(first),sessionId:second.sessionId})).toThrow('IDENTITY_MISMATCH');
  });
  it('is one by default: the second assignment of a default-capacity worker is refused CAPACITY',async()=>{
    const grants=new Map<string,Session>();
    const h=await setup(command=>{const grant=grants.get(command.sessionId);return grant?Promise.resolve(structuredClone(grant)):Promise.reject(new Error('UNKNOWN_SESSION'));});
    const contexts=[0,1].map(()=>{const context=guidedContext('https://example.test');grants.set(context.sessionId,ownershipSession(context));return context;});
    const [a,b]=contexts as [typeof contexts[number],typeof contexts[number]];
    await h.manager.assign(assignmentFor(a));await expect(h.manager.assign(assignmentFor(b))).rejects.toThrow('CAPACITY');
  });
});
describe('REL-001 start-up refusals keep their cause',()=>{
  const causes=(failure:unknown):Error[]=>{const chain:Error[]=[];for(let link:unknown=failure;link instanceof Error;link=link.cause)chain.push(link);return chain;};
  it('keeps the launch error, the failed launch step and the failed start step under the unchanged CONTEXT_LOST message',async()=>{
    const h=await setup();await h.manager.assign(h.assignment);
    const original=new Error('browserType.launchPersistentContext: Target page, context or browser has been closed');
    h.launch.mockRejectedValueOnce(new GuidedLaunchFailure(()=>Promise.resolve(),original,'PROBE'));
    const refused=await h.manager.context(h.context).then(()=>null,(error:unknown)=>error);
    expect(refused).toBeInstanceOf(GuidedStartFailure);expect(refused).toMatchObject({message:'CONTEXT_LOST',phase:'LAUNCH',loss:null});
    const chain=causes(refused);expect(chain.map(link=>link.message)).toEqual(['CONTEXT_LOST','CONTEXT_LOST','CONTEXT_LOST',original.message]);
    expect(chain.at(-1)).toBe(original);expect(chain[2]).toMatchObject({phase:'PROBE'});
  });
  it('names why a running browser reported itself lost while the start was still in flight',async()=>{
    const h=await setup();await h.manager.assign(h.assignment);
    h.options.launch=(_config,_contextId,onLost)=>{onLost('PAGE_CRASH');return Promise.resolve(h.browser);};
    const refused=await h.manager.context(h.context).then(()=>null,(error:unknown)=>error);
    expect(refused).toMatchObject({message:'CONTEXT_LOST',phase:'LAUNCH',loss:'PAGE_CRASH'});
  });
  it('keeps the journal error as the cause when the assignment cannot be acquired',async()=>{
    const h=await setup();const blocked=join(h.directory,'assignments');await writeFile(blocked,'not a directory');
    const refused=await h.manager.assign(h.assignment).then(()=>null,(error:unknown)=>error);
    expect(refused).toMatchObject({message:'CONTEXT_LOST'});expect(causes(refused).length).toBeGreaterThan(1);
    expect((causes(refused).at(-1) as NodeJS.ErrnoException).code).toMatch(/^E[A-Z]+$/u);
  });
});

describe('REL-001/D4 a start that cannot finish is refused inside the backend window',()=>{
  const causes=(failure:unknown):Error[]=>{const chain:Error[]=[];for(let link:unknown=failure;link instanceof Error;link=link.cause)chain.push(link);return chain;};
  const otherAssignment=()=>assignmentFor(guidedContext('https://example.test'));
  /** Whether `promise` has settled by now; read it after each fake-clock step to learn the first step at which it did. */
  const settledFlag=(promise:Promise<unknown>)=>{const flag={done:false};void promise.then(()=>{flag.done=true;});return flag;};
  it('refuses a launcher that never settles with the full chain and one TIMEOUT line, and keeps the only slot held',async()=>{
    const h=await setup();await h.manager.assign(h.assignment);
    let entered:()=>void=()=>undefined;const launched=new Promise<void>(resolve=>{entered=resolve;});
    h.options.launch=()=>{entered();return new Promise<GuidedBrowser>(()=>undefined);};
    const began=Date.now();const pending=h.manager.context(h.context).then(()=>null,(error:unknown)=>error);const reply=settledFlag(pending);
    await launched;
    // A launcher that ignores the abort is waited for once, for the whole reserve (ratified deviation 3), so the reply is
    // at the backend's 15 s ceiling and not inside it: the backend sees its own transport timeout, not CONTEXT_LOST.
    // The test pins that instant exactly, from both sides, so a later or an earlier reply is a red.
    await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS+GUIDED_START_RESERVE_MS-1);expect(reply.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);expect(reply.done).toBe(true);
    expect(Date.now()-began).toBe(GUIDED_START_BUDGET_MS+GUIDED_START_RESERVE_MS);expect(GUIDED_START_BUDGET_MS+GUIDED_START_RESERVE_MS).toBe(GUIDED_START_TRANSPORT_CEILING_MS);
    const refused=await pending;
    expect(refused).toBeInstanceOf(GuidedStartFailure);expect(refused).toMatchObject({message:'CONTEXT_LOST',phase:'LAUNCH',loss:null});
    expect(causes(refused).map(link=>link.message)).toEqual(['CONTEXT_LOST','CONTEXT_LOST','TIMEOUT']);
    const line=describeStartFailure(refused,{operation:'context',sessionId:h.context.sessionId,elapsedMs:Date.now()-began});
    expect(line.match(/GUIDED_START_FAILED/gu)).toHaveLength(1);expect(line).toContain('{"name":"Error","code":"TIMEOUT"}');expect(line).toContain('"phase":"LAUNCH"');expect(line).not.toContain('"kind":"TIMEOUT"');
    // Fail closed: the launcher never reported, so a new assignment is still refused CAPACITY.
    await expect(h.manager.assign(otherAssignment())).rejects.toThrow('CAPACITY');
  });
  it('releases the slot after a launcher that honours its deadline has closed, and takes the next assignment',async()=>{
    const h=await setup();await h.manager.assign(h.assignment);const close=vi.fn(()=>Promise.resolve());
    let entered:()=>void=()=>undefined;const launched=new Promise<void>(resolve=>{entered=resolve;});
    h.options.launch=(_config,_contextId,_onLost,_recording,startup)=>new Promise<GuidedBrowser>((_resolve,reject)=>{entered();startup.signal.addEventListener('abort',()=>{reject(new GuidedLaunchFailure(close,new Error('TIMEOUT'),'PROCESS'));},{once:true});});
    const began=Date.now();const pending=h.manager.context(h.context).then(()=>null,(error:unknown)=>error);const reply=settledFlag(pending);
    await launched;
    // Inside the backend's 15 s window, with the whole reserve to spare: the reply goes out at the start deadline itself, never later.
    await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS-1);expect(reply.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);expect(reply.done).toBe(true);
    expect(Date.now()-began).toBe(GUIDED_START_BUDGET_MS);expect(GUIDED_START_TRANSPORT_CEILING_MS-(Date.now()-began)).toBeGreaterThanOrEqual(GUIDED_START_RESERVE_MS);
    const refused=await pending;
    expect(refused).toBeInstanceOf(GuidedStartFailure);expect(causes(refused).map(link=>link.message)).toEqual(['CONTEXT_LOST','CONTEXT_LOST','CONTEXT_LOST','TIMEOUT']);
    expect(causes(refused)[2]).toMatchObject({name:'GuidedLaunchFailure',phase:'PROCESS'});
    expect(close).toHaveBeenCalledOnce();
    const next=await h.manager.assign(otherAssignment()).then(()=>null,(error:unknown)=>error);
    expect((next as Error|null)?.message).not.toBe('CAPACITY');
  });
  it('replies at the instant a launcher that ignored the abort settles inside the reserve, closes what it made and releases the slot',async()=>{
    const h=await setup();await h.manager.assign(h.assignment);const close=vi.fn(()=>Promise.resolve());
    let entered:()=>void=()=>undefined;const launched=new Promise<void>(resolve=>{entered=resolve;});
    // Never looks at its signal; fails by itself one second after the deadline.
    h.options.launch=()=>new Promise<GuidedBrowser>((_resolve,reject)=>{entered();setTimeout(()=>{reject(new GuidedLaunchFailure(close,new Error('TIMEOUT'),'PROCESS'));},GUIDED_START_BUDGET_MS+1_000);});
    const began=Date.now();const pending=h.manager.context(h.context).then(()=>null,(error:unknown)=>error);const reply=settledFlag(pending);
    await launched;
    await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS+1_000-1);expect(reply.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);expect(reply.done).toBe(true);
    expect(Date.now()-began).toBe(GUIDED_START_BUDGET_MS+1_000);expect(Date.now()-began).toBeLessThan(GUIDED_START_TRANSPORT_CEILING_MS);
    const refused=await pending;expect(refused).toBeInstanceOf(GuidedStartFailure);expect(causes(refused).at(-1)?.message).toBe('TIMEOUT');
    expect(close).toHaveBeenCalledOnce();
    expect(((await h.manager.assign(otherAssignment()).then(()=>null,(error:unknown)=>error)) as Error|null)?.message).not.toBe('CAPACITY');
  });
  it('Quinn F5: keeps the only slot held when the failed launch cannot confirm its processes are gone, and still replies with the full chain',async()=>{
    const h=await setup();await h.manager.assign(h.assignment);
    // What the launcher's hard teardown throws when a pid it enumerated is still alive.
    const close=vi.fn(()=>Promise.reject(new Error('CONTEXT_LOST')));
    let entered:()=>void=()=>undefined;const launched=new Promise<void>(resolve=>{entered=resolve;});
    h.options.launch=(_config,_contextId,_onLost,_recording,startup)=>new Promise<GuidedBrowser>((_resolve,reject)=>{entered();startup.signal.addEventListener('abort',()=>{reject(new GuidedLaunchFailure(close,new Error('TIMEOUT'),'PROCESS'));},{once:true});});
    const pending=h.manager.context(h.context).then(()=>null,(error:unknown)=>error);
    await launched;await vi.advanceTimersByTimeAsync(GUIDED_START_BUDGET_MS);
    const refused=await pending;
    expect(refused).toBeInstanceOf(GuidedStartFailure);expect(refused).toMatchObject({message:'CONTEXT_LOST',phase:'LAUNCH'});
    expect(causes(refused).map(link=>link.message)).toEqual(['CONTEXT_LOST','CONTEXT_LOST','CONTEXT_LOST','TIMEOUT']);
    expect(close).toHaveBeenCalledOnce();
    // Fail closed: a survivor means a Chrome may still be running, so no second session may start next to it.
    await expect(h.manager.assign(otherAssignment())).rejects.toThrow('CAPACITY');
    expect(h.manager.getRuntime.bind(h.manager,h.context)).toThrow('CONTEXT_LOST');
  });
});

/**
 * KL-015-D5 (W1.5 ruling part 1 section 2.4 and 2.5): a stop replies only after its close has settled, and the slot is released
 * exactly when the close is confirmed. The browser here is built from the same `guidedCloseStages` helper `launchGuidedBrowser`
 * uses, with a graceful stage that hangs (the frozen-Chromium wedge) and a hard stage that takes a realistic 400 ms.
 */
describe('KL-015-D5 the stop reply and the slot follow the confirmed close',()=>{
  const otherAssignment=()=>assignmentFor(guidedContext('https://example.test'));
  const settledFlag=(promise:Promise<unknown>)=>{const flag={done:false};void promise.then(()=>{flag.done=true;},()=>{flag.done=true;});return flag;};
  const TERMINATE_MS=400;
  function wedged(h:Awaited<ReturnType<typeof setup>>,hard:()=>Promise<void>){
    const graceful=vi.fn(()=>new Promise<void>(()=>undefined));const terminate=vi.fn(hard);
    const stages=guidedCloseStages({graceful,hard:terminate});
    const browser:GuidedBrowser={...h.browser,close:stages.close,terminate:stages.terminate,orderlyClosed:stages.orderlyClosed};
    h.options.launch=()=>Promise.resolve(browser);return{graceful,terminate,stages};
  }
  it('U1 (i) a started session whose graceful close hangs: terminate at the grace, the 200 only after it, the next assign accepted',async()=>{
    const h=await setup();await h.manager.assign(h.assignment);
    const w=wedged(h,()=>new Promise<void>(resolve=>{setTimeout(resolve,TERMINATE_MS);}));
    await h.manager.context(h.context);
    const identityOfSession={...identity(h.context),reason:'CONTEXT_LOST' as const};
    const began=Date.now();const stopping=h.manager.stop(identityOfSession);const reply=settledFlag(stopping);
    await vi.advanceTimersByTimeAsync(GUIDED_CLOSE_GRACE_MS-1);expect(w.terminate).not.toHaveBeenCalled();expect(reply.done).toBe(false);
    await expect(h.manager.assign(otherAssignment())).rejects.toThrow('CAPACITY');
    await vi.advanceTimersByTimeAsync(1);expect(w.terminate).toHaveBeenCalledOnce();expect(Date.now()-began).toBe(GUIDED_CLOSE_GRACE_MS);
    // Confirmed dead is the only thing a 200 means: nothing is sent while the teardown is still running.
    await vi.advanceTimersByTimeAsync(TERMINATE_MS-1);expect(reply.done).toBe(false);await expect(h.manager.assign(otherAssignment())).rejects.toThrow('CAPACITY');
    await vi.advanceTimersByTimeAsync(1);await stopping;expect(reply.done).toBe(true);
    expect(Date.now()-began).toBe(GUIDED_CLOSE_GRACE_MS+TERMINATE_MS);expect(Date.now()-began).toBeLessThan(GUIDED_START_TRANSPORT_CEILING_MS);
    expect(w.stages.orderlyClosed()).toBe(false);expect(w.terminate).toHaveBeenCalledOnce();
    const next=await h.manager.assign(otherAssignment()).then(()=>null,(error:unknown)=>error);expect((next as Error|null)?.message).not.toBe('CAPACITY');
  });
  it('U3 (i) a terminate that finds a survivor: the stop rejects CONTEXT_LOST, the slot stays held, a repeat stop returns the same rejection',async()=>{
    const h=await setup();await h.manager.assign(h.assignment);
    const w=wedged(h,()=>Promise.reject(new Error('CONTEXT_LOST')));await h.manager.context(h.context);
    const message={...identity(h.context),reason:'CONTEXT_LOST' as const};
    const first=h.manager.stop(message).then(()=>null,(error:unknown)=>error);await vi.advanceTimersByTimeAsync(GUIDED_CLOSE_GRACE_MS);
    expect(await first).toMatchObject({message:'CONTEXT_LOST'});
    await expect(h.manager.assign(otherAssignment())).rejects.toThrow('CAPACITY');
    await expect(h.manager.stop(message)).rejects.toThrow('CONTEXT_LOST');
    expect(w.terminate).toHaveBeenCalledOnce();await expect(h.manager.assign(otherAssignment())).rejects.toThrow('CAPACITY');
  });
  it('U4 (ii) a start that fails after the browser launched replies after the hard teardown alone, and releases the slot',async()=>{
    const h=await setup();await h.manager.assign(h.assignment);
    let teardownBegan:()=>void=()=>undefined;const began=new Promise<void>(resolve=>{teardownBegan=resolve;});
    const w=wedged(h,()=>{teardownBegan();return new Promise<void>(resolve=>{setTimeout(resolve,TERMINATE_MS);});});
    // The bootstrap callback is refused: the browser exists, the start never completed.
    h.options.callback=route=>route==='bootstrap-evidence'?Promise.reject(new Error('refused')):Promise.resolve();
    const pending=h.manager.context(h.context).then(()=>null,(error:unknown)=>error);const reply=settledFlag(pending);
    await began;const failedAt=Date.now();
    // No graceful stage and no grace: the reply is the failure instant plus the teardown, and nothing sooner.
    await vi.advanceTimersByTimeAsync(TERMINATE_MS-1);expect(reply.done).toBe(false);await expect(h.manager.assign(otherAssignment())).rejects.toThrow('CAPACITY');
    await vi.advanceTimersByTimeAsync(1);const refused=await pending;
    expect(Date.now()-failedAt).toBe(TERMINATE_MS);
    expect(refused).toBeInstanceOf(GuidedStartFailure);expect(refused).toMatchObject({message:'CONTEXT_LOST',phase:'BOOTSTRAP_CALLBACK'});
    expect(w.graceful).not.toHaveBeenCalled();expect(w.terminate).toHaveBeenCalledOnce();
    const next=await h.manager.assign(otherAssignment()).then(()=>null,(error:unknown)=>error);expect((next as Error|null)?.message).not.toBe('CAPACITY');
  });
  it('U4 (ii) a stop that arrives while the failed start tears down joins the same settle, never answering earlier',async()=>{
    const h=await setup();await h.manager.assign(h.assignment);
    let teardownBegan:()=>void=()=>undefined;const began=new Promise<void>(resolve=>{teardownBegan=resolve;});
    const w=wedged(h,()=>{teardownBegan();return new Promise<void>(resolve=>{setTimeout(resolve,TERMINATE_MS);});});
    h.options.callback=route=>route==='bootstrap-evidence'?Promise.reject(new Error('refused')):Promise.resolve();
    const starting=h.manager.context(h.context).then(()=>null,(error:unknown)=>error);const startFlag=settledFlag(starting);
    await began;await vi.advanceTimersByTimeAsync(10);
    const stopping=h.manager.stop({...identity(h.context),reason:'CONTEXT_LOST' as const}).then(()=>null,(error:unknown)=>error);const stopFlag=settledFlag(stopping);
    await vi.advanceTimersByTimeAsync(TERMINATE_MS-11);expect(startFlag.done).toBe(false);expect(stopFlag.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);await starting;await stopping;expect(startFlag.done).toBe(true);expect(stopFlag.done).toBe(true);
    expect(w.terminate).toHaveBeenCalledOnce();expect(w.graceful).not.toHaveBeenCalled();
  });
});


describe('009 secret renewal keeps its original claim-phase endpoint',()=>{
  it('does not install an otherwise valid late grant after a delayed renewal phase has ended',async()=>{
    const h=await setup(undefined,true);await h.manager.assign(h.assignment);await h.manager.context(h.context);
    const runtime=h.manager.getRuntime(h.context),installed=vi.spyOn(runtime,'applyAcknowledgedLease'),began=Date.now();
    const action=proposal(h.context,h.browser.evidence,'nav',stepOp('await page.goto(inputs["input-nav"]);',{uses:[{kind:'input',id:'input-nav'}]}));
    const proof=await runtime.prepare({...identity(h.context),proposal:action,requestDigest:hash(action),expiresAt:h.context.expiresAt}),request=dispatch(h.context,action,proof);
    let release:((grant:Session)=>void)|undefined;const claims:{at:number;timeout:number}[]=[];
    h.options.claim=(_command,_key,timeout)=>{claims.push({at:Date.now(),timeout});return new Promise<Session>(resolve=>{release=resolve;});};
    try{
      // setSystemTime shifts pending relative timers, not the stored nextRenewal epoch.
      vi.setSystemTime(began+500);await vi.advanceTimersByTimeAsync(1000);
      expect(claims).toHaveLength(1);expect((claims[0]?.at??0)-began).toBe(1500);expect(release).toBeTypeOf('function');
      await vi.advanceTimersByTimeAsync(600);
      release?.({...structuredClone(h.grant),owner:{...h.grant.owner,leaseExpiresAt:new Date(Date.now()+30000).toISOString()}});
      await vi.advanceTimersByTimeAsync(0);
      // Defining old-product red: the old fresh1000 budget installs this valid grant atB+2100.
      expect(runtime.accepting,'phase-end authority; acknowledged lease installs='+String(installed.mock.calls.length)).toBe(false);
      expect(installed).not.toHaveBeenCalled();expect(h.browser.close).toHaveBeenCalledOnce();
      expect(h.messages.filter(m=>m.route==='lifecycle').at(-1)?.body).toHaveProperty('reason','LEASE_LOST');
      expect(()=>h.manager.getRuntime(h.context)).toThrow('CONTEXT_LOST');
      await expect(runtime.dispatch(request)).rejects.toThrow('CONTEXT_LOST');expect(h.rig.w.effects).toEqual([]);
      await expect(h.manager.context(h.context)).rejects.toThrow('CONTEXT_LOST');await expect(h.manager.assign(h.assignment)).rejects.toThrow('CONTEXT_LOST');
      await vi.advanceTimersByTimeAsync(1000);expect(claims).toHaveLength(1);expect(installed).not.toHaveBeenCalled();
    }finally{
      try{release?.({...structuredClone(h.grant),owner:{...h.grant.owner,leaseExpiresAt:new Date(Date.now()+30000).toISOString()}});await vi.advanceTimersByTimeAsync(0);await h.manager.close();expect(vi.getTimerCount()).toBe(0);}finally{installed.mockRestore();}
    }
  });
  it('rechecks the captured phase after grant validation and a delayed caller continuation',async()=>{
    const h=await setup(undefined,true);await h.manager.assign(h.assignment);await h.manager.context(h.context);
    const runtime=h.manager.getRuntime(h.context),installed=vi.spyOn(runtime,'applyAcknowledgedLease'),began=Date.now();
    let release:((grant:Session)=>void)|undefined,restoreCheck=():void=>undefined;const starts:number[]=[];
    h.options.claim=()=>{starts.push(Date.now());return new Promise<Session>(resolve=>{release=resolve;});};
    try{
      type GrantCheck=(entry:unknown,value:unknown,initial:boolean)=>Session;
      const prototype=GuidedOwnership.prototype as unknown as {checkGrant:GrantCheck};
      const original=Object.getOwnPropertyDescriptor(GuidedOwnership.prototype,'checkGrant')?.value as GrantCheck|undefined;
      if(typeof original!=='function')throw Error('CHECK_GRANT');
      const checked=vi.spyOn(prototype,'checkGrant').mockImplementation(function(this:GuidedOwnership,entry,value,initial){
        const grant=original.call(this,entry,value,initial);
        // The original checks finish beforeP; this microtask runs after requestClaim's finally and before renew resumes.
        if(!initial)queueMicrotask(()=>{vi.setSystemTime(began+2100);});return grant;
      });restoreCheck=()=>{checked.mockRestore();};
      vi.setSystemTime(began+500);await vi.advanceTimersByTimeAsync(1000);expect(starts).toEqual([began+1500]);expect(release).toBeTypeOf('function');
      await vi.advanceTimersByTimeAsync(100);
      release?.({...structuredClone(h.grant),owner:{...h.grant.owner,leaseExpiresAt:new Date(Date.now()+30000).toISOString()}});
      await vi.advanceTimersByTimeAsync(0);
      expect(Date.now()-began).toBe(2100);expect(runtime.accepting).toBe(false);expect(installed).not.toHaveBeenCalled();
      expect(h.messages.filter(m=>m.route==='lifecycle').at(-1)?.body).toHaveProperty('reason','LEASE_LOST');
      await expect(h.manager.assign(h.assignment)).rejects.toThrow('CONTEXT_LOST');await expect(h.manager.context(h.context)).rejects.toThrow('CONTEXT_LOST');
    }finally{
      try{release?.({...structuredClone(h.grant),owner:{...h.grant.owner,leaseExpiresAt:new Date(Date.now()+30000).toISOString()}});await vi.advanceTimersByTimeAsync(0);await h.manager.close();expect(vi.getTimerCount()).toBe(0);}finally{restoreCheck();installed.mockRestore();}
    }
  });
  it('starts no claim and loses authority when the delayed phase has ended inside the session margin',async()=>{
    const h=await setup(undefined,true),began=Date.now(),expiry=new Date(began+2050).toISOString();
    h.context.expiresAt=expiry;h.context.leaseExpiresAt=expiry;h.grant.expiresAt=expiry;h.grant.owner.leaseExpiresAt=expiry;
    const assignment={...h.assignment,expiresAt:expiry};await h.manager.assign(assignment);await h.manager.context(h.context);
    const claim=vi.fn(()=>Promise.resolve(structuredClone(h.grant)));h.options.claim=claim;
    try{
      vi.setSystemTime(began+1000);await vi.advanceTimersByTimeAsync(1000);
      expect(Date.now()-began).toBe(2000);expect(Date.now()).toBeLessThan(Date.parse(expiry));expect(claim).not.toHaveBeenCalled();expect(h.browser.close).toHaveBeenCalledOnce();
      expect(h.messages.filter(m=>m.route==='lifecycle').at(-1)?.body).toHaveProperty('reason','LEASE_LOST');expect(()=>h.manager.getRuntime(h.context)).toThrow('CONTEXT_LOST');
      await expect(h.manager.assign(assignment)).rejects.toThrow('CONTEXT_LOST');
    }finally{await h.manager.close();expect(vi.getTimerCount()).toBe(0);}
  });
  it('treats a cadence and session-lease-margin tie as LEASE_LOST rather than deferring it to expiry',async()=>{
    const h=await setup(undefined,true),began=Date.now(),expiry=new Date(began+2100).toISOString();
    h.context.expiresAt=expiry;h.context.leaseExpiresAt=expiry;h.grant.expiresAt=expiry;h.grant.owner.leaseExpiresAt=expiry;
    const assignment={...h.assignment,expiresAt:expiry};await h.manager.assign(assignment);await h.manager.context(h.context);
    let release:((grant:Session)=>void)|undefined;const timeouts:number[]=[];
    h.options.claim=(_command,_key,timeout)=>{timeouts.push(timeout);return new Promise<Session>(resolve=>{release=resolve;});};
    try{
      vi.setSystemTime(began+500);await vi.advanceTimersByTimeAsync(1000);expect(timeouts).toEqual([500]);
      await vi.advanceTimersByTimeAsync(499);expect(h.browser.close).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);expect(Date.now()-began).toBe(2000);expect(h.browser.close).toHaveBeenCalledOnce();
      expect(Date.now()).toBeLessThan(Date.parse(expiry));expect(h.messages.filter(m=>m.route==='lifecycle').at(-1)?.body).toHaveProperty('reason','LEASE_LOST');
      expect(()=>h.manager.getRuntime(h.context)).toThrow('CONTEXT_LOST');
      await vi.advanceTimersByTimeAsync(601);expect(h.messages.filter(m=>m.route==='lifecycle')).toHaveLength(1);expect(timeouts).toEqual([500]);
    }finally{release?.(structuredClone(h.grant));await vi.advanceTimersByTimeAsync(0);await h.manager.close();expect(vi.getTimerCount()).toBe(0);}
  });
});
