import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { afterEach,expect,it,vi } from 'vitest';
import { createBrowserObservationSession } from '../../src/run/browser.js';
import { PrivateInventory } from '../../src/run/privateInventory.js';

afterEach(()=>vi.restoreAllMocks());
function boundary(collect:()=>Promise<unknown>) {
  const send=vi.fn((method:string,parameters?:{functionDeclaration?:string})=>{
    if(method==='Page.getFrameTree')return Promise.resolve({frameTree:{frame:{id:'frame'}}});
    if(method==='Page.createIsolatedWorld')return Promise.resolve({executionContextId:1});
    if(parameters?.functionDeclaration?.includes('this.revision()'))return Promise.resolve({result:{value:0}});
    // The perception program (the collection) runs on the engine object. The liveness probe on the same object (frozen declaration) finds the
    // page gone, as a collection that threw on a dead channel does; every other CDP call answers an opaque handle.
    if(method==='Runtime.callFunctionOn'&&(parameters as {objectId?:string}|undefined)?.objectId==='engine')return parameters?.functionDeclaration==='function() { return true; }'?Promise.reject(new Error('PROBE_DEAD')):collect();
    return Promise.resolve({result:{objectId:method==='Runtime.evaluate'?'engine':'handle',value:true}});
  });
  const session=createBrowserObservationSession({on:vi.fn(),off:vi.fn(),url:()=>'http://localhost:1/',context:()=>({newCDPSession:()=>Promise.resolve({send,detach:()=>Promise.resolve()})})} as unknown as Parameters<typeof createBrowserObservationSession>[0],{sessionId:'session',scopeHash:'a'.repeat(64),allowedDomains: TEST_DOMAINS,knownSecrets:[]});
  return {session,send};
}
it('drops a completed private CDP collection when disposal won the race',async()=>{
  let release:((value:unknown)=>void)|undefined;
  const collection=new Promise<unknown>(resolve=>{release=resolve;});const entered=vi.fn(()=>collection);
  const merge=vi.spyOn(PrivateInventory.prototype,'merge');const h=boundary(entered);const pending=h.session.observe();
  await expect.poll(()=>entered.mock.calls.length).toBe(1);await h.session.dispose();
  release?.({result:{value:{inventory:[['LATE_PRIVATE_CANARY',true]],observation:{}}}});
  await expect(pending).rejects.toThrow('CONTEXT_LOST');expect(merge).not.toHaveBeenCalled();await expect(h.session.observe()).rejects.toThrow();await expect(h.session.withhold?.(['AFTER_DISPOSE'])).rejects.toThrow('CONTEXT_LOST');
});
it('normalizes unexpected CDP exceptions and permanently refuses later collection',async()=>{
  const entered=vi.fn(()=>Promise.reject(new Error('PRIVATE_CDP_PAYLOAD')));const h=boundary(entered);
  await expect(h.session.observe()).rejects.toThrow('OBSERVATION_UNAVAILABLE');await expect(h.session.observe()).rejects.toThrow('CONTEXT_LOST');expect(entered).toHaveBeenCalledOnce();await h.session.dispose();
});
