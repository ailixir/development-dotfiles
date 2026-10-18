// eslint-disable-next-line no-restricted-imports -- Subprocess kill witness imports only fixed helper; no artifact or app text becomes code.
import {fork} from 'node:child_process';
// eslint-disable-next-line no-restricted-imports -- Type for the fixed subprocess witness above.
import type {ChildProcess} from 'node:child_process';
import {mkdtemp,mkdir,readdir,readFile,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {expect,it} from 'vitest';
import {descendantsOf,isAlive,signalProcessTree} from '../../src/run/tree.js';
import {startSecretLoginFixture} from '../fixtures/secret-login/server.js';

interface Message {kind:string;directory?:string;profile?:string;state?:string;report?:{reclaimed:number};handleSIGINT?:boolean;handleSIGTERM?:boolean}
function worker(root:string,origin:string,mode='record') {
 const child=fork(resolve('test/helpers/recordingScratchWorker.mjs'),[root,origin,mode],{stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,DEBUG:'',PWDEBUG:'',NODE_DEBUG:'',NODE_OPTIONS:''}});
 const messages:Message[]=[],output:string[]=[];child.on('message',(m:Message)=>messages.push(m));child.stdout?.on('data',(b:Buffer)=>output.push(b.toString()));child.stderr?.on('data',(b:Buffer)=>output.push(b.toString()));
 return {child,messages,output};
}
async function until(test:()=>boolean|Promise<boolean>,ms=30000):Promise<void>{const end=Date.now()+ms;while(Date.now()<end){if(await test())return;await new Promise(r=>setTimeout(r,50));}throw Error('FIXTURE_TIMEOUT');}
async function exists(path:string):Promise<boolean>{return stat(path).then(()=>true,()=>false);}
async function exited(child:ChildProcess):Promise<void>{await until(()=>child.exitCode!==null||child.signalCode!==null);}
async function bytes(directory:string):Promise<number>{return (await Promise.all((await readdir(directory)).map(async file=>(await stat(join(directory,file))).size))).reduce((a,b)=>a+b,0);}

it.each([false,true])('parent-only SIGKILL leaves real app video; same-scope restart removes only dead-owned bytes (external symlink=%s)',async link=>{
 const fixture=await startSecretLoginFixture('kill-login-secret-canary'),root=await mkdtemp(join(tmpdir(),'recording-kill-'));await mkdir(join(root,'evidence'));
 const workers:ReturnType<typeof worker>[]=[],pids=new Set<number>(),profiles=new Set<string>();
 try{
  const victim=worker(root,fixture.origin);workers.push(victim);await until(()=>victim.messages.some(m=>m.kind==='recording')||victim.child.exitCode!==null);expect(victim.child.exitCode,victim.output.join('')).toBeNull();expect(victim.messages.find(m=>m.kind==='signalOptions')).toMatchObject({handleSIGINT:false,handleSIGTERM:false});const v=victim.messages.find(m=>m.kind==='recording');if(!v?.directory)throw Error('VICTIM');if(v.profile)profiles.add(v.profile);const victimBytes=await bytes(v.directory);expect(victimBytes).toBeGreaterThan(128);
  const live=worker(root,fixture.origin);workers.push(live);await until(()=>live.messages.some(m=>m.kind==='recording')||live.child.exitCode!==null);expect(live.child.exitCode,live.output.join('')).toBeNull();const l=live.messages.find(m=>m.kind==='recording');if(!l?.directory)throw Error('LIVE');if(l.profile)profiles.add(l.profile);
  const victimTree=victim.child.pid?descendantsOf(victim.child.pid):[];expect(victimTree.length).toBeGreaterThan(0);for(const pid of victimTree)pids.add(pid);
  victim.child.kill('SIGKILL');await exited(victim.child);expect(victim.child.signalCode).toBe('SIGKILL');expect(await bytes(v.directory)).toBeGreaterThan(128);expect(victim.messages.filter(m=>m.kind==='callback')).toEqual([]);
  // The harness owns captured descendants. Production sweep never signals them and never gets
  // credit for tree cleanup: stop known encoders first to freeze residue and separately prove gone.
  for(const pid of [...victimTree].reverse())if(isAlive(pid))signalProcessTree(pid);await until(()=>victimTree.every(pid=>!isAlive(pid)));
  const outside=join(root,'outside');await mkdir(outside);await writeFile(join(outside,'CANARY'),'outside-unchanged');if(link)await symlink(outside,join(v.directory,'external-link'));
  const liveBytes=await bytes(l.directory),replacement=worker(root,fixture.origin,'sweep');workers.push(replacement);await until(()=>replacement.messages.some(m=>m.kind==='swept')||replacement.child.exitCode!==null);await exited(replacement.child);expect(replacement.child.exitCode,replacement.output.join('')).toBe(0);expect(replacement.messages.find(m=>m.kind==='swept')?.report?.reclaimed).toBe(1);
  expect(await exists(dirname(v.directory))).toBe(false);expect(await bytes(l.directory)).toBeGreaterThanOrEqual(liveBytes);expect(await readFile(join(outside,'CANARY'),'utf8')).toBe('outside-unchanged');expect(victim.messages.some(m=>m.kind==='callback'||m.kind==='settled')).toBe(false);
  expect(await exists(join(root,'objects','studio','fixture-csi','guided','kill-session.webm'))).toBe(false);
  live.child.kill('SIGTERM');await exited(live.child);expect(live.child.exitCode,live.output.join('')).toBe(0);expect(live.messages.filter(m=>m.kind==='callback')).toHaveLength(1);expect(live.messages.find(m=>m.kind==='settled')?.state).toBe('STORED');expect(await exists(l.directory)).toBe(false);
  await writeFile(resolve('../docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/runner-remediation/kill-facts-'+String(link)+'.json'),JSON.stringify({platform:process.platform,parentOnlySignal:victim.child.signalCode,victimBytesBeforeKill:victimBytes,victimCallbackCount:0,victimSettlementCount:0,recordingDirectoryRemovedByRestart:true,ownedVictimDescendantCount:victimTree.length,ownedVictimDescendantsGone:victimTree.every(pid=>!isAlive(pid)),liveBytesBeforeSweep:liveBytes,liveCallbackCount:live.messages.filter(m=>m.kind==='callback').length,liveSettlement:live.messages.find(m=>m.kind==='settled')?.state,liveSignal:'SIGTERM',outsideCanaryPreserved:true,symlinkVariant:link,backendEvidenceProjection:'NOT_ASSERTED: recorder-only process fixture; no victim callback/upload invented'},null,2)+'\n');
 }finally{
  for(const w of workers)if(w.child.pid&&w.child.exitCode===null&&w.child.signalCode===null){for(const pid of descendantsOf(w.child.pid))pids.add(pid);signalProcessTree(w.child.pid);}
  for(const pid of [...pids].reverse())if(isAlive(pid))signalProcessTree(pid);await until(()=>[...pids].every(pid=>!isAlive(pid)));for(const w of workers)await exited(w.child);for(const w of workers)for(const message of w.messages)if(message.profile)profiles.add(message.profile);for(const profile of profiles)await rm(profile,{recursive:true,force:true});await fixture.close();await rm(root,{recursive:true,force:true});
 }
});

it('actual SIGINT gracefully settles real guided recorder and removes its owned recording bytes',async()=>{
 const fixture=await startSecretLoginFixture('signal-login-canary'),root=await mkdtemp(join(tmpdir(),'recording-signal-'));await mkdir(join(root,'evidence'));const w=worker(root,fixture.origin),pids=new Set<number>();
 try{await until(()=>w.messages.some(m=>m.kind==='recording')||w.child.exitCode!==null);expect(w.child.exitCode,w.output.join('')).toBeNull();expect(w.messages.find(m=>m.kind==='signalOptions')).toMatchObject({handleSIGINT:false,handleSIGTERM:false});const message=w.messages.find(m=>m.kind==='recording');if(!message?.directory)throw Error('RECORDING');expect(await bytes(message.directory)).toBeGreaterThan(128);if(w.child.pid)for(const pid of descendantsOf(w.child.pid))pids.add(pid);w.child.kill('SIGINT');await exited(w.child);expect(w.child.exitCode,w.output.join('')).toBe(0);expect(w.messages.filter(m=>m.kind==='callback')).toHaveLength(1);expect(w.messages.find(m=>m.kind==='settled')?.state).toBe('STORED');expect(await exists(message.directory)).toBe(false);await until(()=>[...pids].every(pid=>!isAlive(pid)));}
 finally{if(w.child.pid&&w.child.exitCode===null&&w.child.signalCode===null){for(const pid of descendantsOf(w.child.pid))pids.add(pid);signalProcessTree(w.child.pid);}for(const pid of [...pids].reverse())if(isAlive(pid))signalProcessTree(pid);await until(()=>[...pids].every(pid=>!isAlive(pid)));await exited(w.child);for(const message of w.messages)if(message.profile)await rm(message.profile,{recursive:true,force:true});await fixture.close();await rm(root,{recursive:true,force:true});}
});
