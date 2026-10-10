import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GuidedOwnership } from '../../src/guided/ownership.js';
import type { ClaimPort, OwnershipOptions } from '../../src/guided/ownership.js';
import type { GuidedBrowser } from '../../src/run/guidedBrowser.js';
import { hash,identity } from '../../src/guided/contracts.js';
import { guidedContext,ownershipSession,assignmentFor,proposal,dispatch } from '../helpers/guided.js';
import type { Session,CommandsClaim } from '../../src/guided/types.js';
const clean:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const fn of clean.reverse())await fn().catch(()=>undefined);clean.length=0;vi.useRealTimers();});
async function setup(claimOverride?:ClaimPort){
  vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout']});
  const directory=await mkdtemp(join(tmpdir(),'guided-own-'));clean.push(()=>rm(directory,{recursive:true,force:true}));
  const context=guidedContext('https://example.test');const grant=ownershipSession(context),assignment=assignmentFor(context);
  const claims:{command:CommandsClaim;key:string;timeout:number}[]=[];const messages:{route:string;body:unknown}[]=[];
  const browser:GuidedBrowser={evidence:{kind:'initialBlank',sessionId:context.sessionId,contextId:context.contextId,creationId:randomUUID(),documentId:randomUUID(),bootstrapId:randomUUID(),url:'about:blank',origin:null,generation:0},blankMatches:()=>Promise.resolve(true),navigateBlank:vi.fn(()=>Promise.resolve()),close:vi.fn(()=>Promise.resolve()),observations:{withhold:()=>Promise.resolve(),dispose:()=>Promise.resolve(),matches:()=>Promise.resolve(false),observe:()=>Promise.resolve({observation:{schemaVersion:1,sessionId:context.sessionId,scopeHash:context.scopeHash,documentId:'after-nav',generation:1,origin:context.approvedOrigins[0]??'',observedAt:new Date().toISOString(),coverage:{mode:'semantic',complete:true,truncated:false,withheldRegions:0,reason:'complete'},nodes:[]},json:'',bytes:0,observationHash:''})}};
  const launch=vi.fn(()=>Promise.resolve(browser));
  const options:OwnershipOptions={workerId:context.workerId,journalDirectory:directory,rules:[],launch,callback:(route,body)=>{messages.push({route,body});return Promise.resolve();},claim:(command,key,timeout,signal)=>{claims.push({command,key,timeout});return claimOverride?claimOverride(command,key,timeout,signal):Promise.resolve({...structuredClone(grant),owner:{...grant.owner,leaseExpiresAt:new Date(Math.min(Date.now()+30_000,Date.parse(grant.expiresAt))).toISOString()}});}};
  const manager=new GuidedOwnership(options);clean.push(()=>manager.close());return{context,grant,assignment,claims,messages,browser,launch,options,manager,directory};
}
describe('actual owning-worker driver and acknowledged lease authority',()=>{
  it('claims once, serially renews beyond30seconds with fresh keys, and installs a delayed context under only acknowledged authority',async()=>{
    const h=await setup();const owned=await h.manager.assign(h.assignment);expect(owned.status).toBe('OWNED');expect(owned.ownerFence).toBe(1);expect(h.claims).toHaveLength(1);expect(h.launch).not.toHaveBeenCalled();
    await h.manager.assign(h.assignment);expect(h.claims).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(35_000);expect(h.claims).toHaveLength(4);expect(new Set(h.claims.map(c=>c.key)).size).toBe(4);expect(h.claims.map(c=>c.command.expectedFence)).toEqual([0,1,1,1]);expect(h.launch).not.toHaveBeenCalled();
    h.context.leaseExpiresAt=new Date(Date.now()-1000).toISOString();await h.manager.context(h.context);expect(h.launch).toHaveBeenCalledOnce();
    const runtime=h.manager.getRuntime(h.context);const p=proposal(h.context,h.browser.evidence,'nav',{kind:'navigate',destinationInputId:'input-nav'});const prepared=await runtime.prepare({...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:h.context.expiresAt});expect(Date.parse(prepared.expiresAt)).toBeLessThanOrEqual(Date.now()+30_000);
    expect((await runtime.dispatch(dispatch(h.context,p,prepared))).ledger.state).toBe('SUCCEEDED');
  });
  it('renews while a consumed browser action is busy without resetting workflow or materialization',async()=>{
    const h=await setup();await h.manager.assign(h.assignment);await h.manager.context(h.context);const runtime=h.manager.getRuntime(h.context);let release:(()=>void)|undefined;let entered:(()=>void)|undefined;const entering=new Promise<void>(resolve=>{entered=resolve;});vi.mocked(h.browser.navigateBlank).mockImplementationOnce(()=>{entered?.();return new Promise<void>(resolve=>{release=resolve;});});
    const p=proposal(h.context,h.browser.evidence,'nav',{kind:'navigate',destinationInputId:'input-nav'});const proof=await runtime.prepare({...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:h.context.expiresAt});const request=dispatch(h.context,p,proof);const pending=runtime.dispatch(request);await entering;
    await vi.advanceTimersByTimeAsync(35_000);expect(h.claims.length).toBeGreaterThan(3);expect(h.browser.navigateBlank).toHaveBeenCalledOnce();if(!release)throw new Error('RELEASE');release();expect((await pending).ledger.state).toBe('SUCCEEDED');await expect(runtime.dispatch(request)).rejects.toThrow();
  });
  it('stops on renewal failure, stale fence/lease or terminal grant and cannot revive via context or assignment retry',async()=>{
    for(const failure of ['network','fence','lease','terminal'] as const){
      const h=await setup();let initial:Session|null=null;let calls=0;h.options.claim=()=>{calls++;if(calls===1){initial=structuredClone(h.grant);return Promise.resolve(initial);}if(failure==='network')return Promise.reject(new Error('PRIVATE-TRANSPORT-FAILURE'));if(!initial)throw new Error('GRANT');const next=structuredClone(initial);next.owner.leaseExpiresAt=new Date(Date.now()+30_000).toISOString();if(failure==='fence')next.owner.fence++;if(failure==='lease')next.owner.leaseExpiresAt=initial.owner.leaseExpiresAt;if(failure==='terminal')next.state='CANCELLED';return Promise.resolve(next);};
      await h.manager.assign(h.assignment);await h.manager.context(h.context);await vi.advanceTimersByTimeAsync(10_000);await expect(h.manager.assign(h.assignment)).rejects.toThrow('CONTEXT_LOST');await expect(h.manager.context(h.context)).rejects.toThrow('CONTEXT_LOST');expect(h.browser.close).toHaveBeenCalledOnce();expect(JSON.stringify(h.messages)).not.toContain('PRIVATE-TRANSPORT-FAILURE');await vi.advanceTimersByTimeAsync(30_000);expect(calls).toBe(2);
    }
  });
  it('pre-context stop before assign creates a durable tombstone and sends no claim or browser command',async()=>{
    const h=await setup();const stopped=await h.manager.stop({schemaVersion:2,kind:'assignment',assignment:h.assignment,reason:'CANCELLED'});expect(stopped).toMatchObject({status:'STOPPED',ownerFence:null,leaseExpiresAt:null});await expect(h.manager.assign(h.assignment)).rejects.toThrow('CONTEXT_LOST');expect(h.claims).toHaveLength(0);expect(h.launch).not.toHaveBeenCalled();
    const restarted=new GuidedOwnership(h.options);await expect(restarted.assign(h.assignment)).rejects.toThrow('CONTEXT_LOST');expect(h.claims).toHaveLength(0);
  });
  it('ignores a late initial claim after cancellation and never recreates ownership after restart',async()=>{
    const h=await setup();let release:((grant:Session)=>void)|undefined;let entered:(()=>void)|undefined;const entering=new Promise<void>(resolve=>{entered=resolve;});h.options.claim=()=>{entered?.();return new Promise<Session>(resolve=>{release=resolve;});};const assigning=h.manager.assign(h.assignment).catch((error:unknown)=>error instanceof Error?error.message:'unexpected');await entering;
    const stop=await h.manager.stop({schemaVersion:2,kind:'assignment',assignment:h.assignment,reason:'CANCELLED'});expect(stop).toMatchObject({status:'STOPPED',ownerFence:null});if(!release)throw new Error('CLAIM');release(h.grant);expect(await assigning).toBe('CONTEXT_LOST');expect(h.launch).not.toHaveBeenCalled();
    const other=await setup();await other.manager.assign(other.assignment);const restarted=new GuidedOwnership(other.options);await expect(restarted.assign(other.assignment)).rejects.toThrow('CONTEXT_LOST');expect(other.claims).toHaveLength(1);
  });
  it('permits clarification waits but rejects contradictory grant scope and context attempts to extend authority',async()=>{
    const h=await setup();h.grant.state='AWAITING_CLARIFICATION';await h.manager.assign(h.assignment);await vi.advanceTimersByTimeAsync(35_000);expect(h.claims.length).toBeGreaterThan(3);expect(h.launch).not.toHaveBeenCalled();h.context.leaseExpiresAt=h.context.expiresAt;await h.manager.context(h.context);
    const stopped=await h.manager.stop({schemaVersion:2,kind:'assignment',assignment:h.assignment,reason:'CANCELLED'});expect(stopped).toMatchObject({status:'STOPPED',ownerFence:1});
    const bad=await setup();bad.grant.scope.configurationRevision='other';await expect(bad.manager.assign(bad.assignment)).rejects.toThrow('CONTEXT_LOST');expect(bad.launch).not.toHaveBeenCalled();
  });
});
