import { afterEach,expect,it,vi } from 'vitest';
import { createBrowserObservationSession } from '../../src/run/browser.js';
import { PrivateObservationInventory } from '../../src/run/observationInventory.js';

afterEach(()=>vi.restoreAllMocks());
function boundary(collect:()=>Promise<unknown>) {
  const send=vi.fn((method:string,parameters?:{functionDeclaration?:string})=>{
    if(method==='Page.getFrameTree')return Promise.resolve({frameTree:{frame:{id:'frame'}}});
    if(method==='Page.createIsolatedWorld')return Promise.resolve({executionContextId:1});
    if(parameters?.functionDeclaration?.includes('const observation = this.collect'))return collect();
    return Promise.resolve({result:{objectId:'collector',value:true}});
  });
  const session=createBrowserObservationSession({on:vi.fn(),off:vi.fn(),context:()=>({newCDPSession:()=>Promise.resolve({send,detach:()=>Promise.resolve()})})} as unknown as Parameters<typeof createBrowserObservationSession>[0],{sessionId:'session',scopeHash:'a'.repeat(64),approvedOrigins:['https://example.test'],rules:[],knownSecrets:[]});
  return {session,send};
}
it('drops a completed private CDP collection when disposal won the race',async()=>{
  let release:((value:unknown)=>void)|undefined;
  const collection=new Promise<unknown>(resolve=>{release=resolve;});const entered=vi.fn(()=>collection);
  const merge=vi.spyOn(PrivateObservationInventory.prototype,'merge');const h=boundary(entered);const pending=h.session.observe();
  await expect.poll(()=>entered.mock.calls.length).toBe(1);await h.session.dispose();
  release?.({result:{value:{inventory:[['LATE_PRIVATE_CANARY',true]],observation:{}}}});
  await expect(pending).rejects.toThrow('CONTEXT_LOST');expect(merge).not.toHaveBeenCalled();await expect(h.session.observe()).rejects.toThrow();await expect(h.session.withhold?.(['AFTER_DISPOSE'])).rejects.toThrow('CONTEXT_LOST');
});
it('normalizes unexpected CDP exceptions and permanently refuses later collection',async()=>{
  const entered=vi.fn(()=>Promise.reject(new Error('PRIVATE_CDP_PAYLOAD')));const h=boundary(entered);
  await expect(h.session.observe()).rejects.toThrow('OBSERVATION_UNAVAILABLE');await expect(h.session.observe()).rejects.toThrow('CONTEXT_LOST');expect(entered).toHaveBeenCalledOnce();await h.session.dispose();
});
