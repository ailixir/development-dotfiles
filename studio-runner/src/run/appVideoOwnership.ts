import {closeSync,fstatSync,lstatSync,mkdirSync,readSync,writeSync,fsyncSync,linkSync,unlinkSync,existsSync,createReadStream} from 'node:fs';
import type {BigIntStats,ReadStream} from 'node:fs';
import {join,dirname,basename,resolve} from 'node:path';
import type {Launch3} from '../executor/observedOperations.js';
import {parseWireJson} from '../guided/json.js';
import {evidenceFor,hasWebmHeader} from './recording.js';
import type {SessionRecording} from '../server/adapters.js';
import {host} from './host/index.js';
import {openFencedSync} from './host/fence.js';

const PRIVATE='runner-private',RECEIPT='app-video-owner.json',MAX_BYTES=4096;
const KEYS=['schemaVersion','kind','runId','attemptId','admissionId','runnerInstanceId','parentPid','childPid','scratchDev','scratchIno','videoBasename'].sort().join(',');
export interface AppVideoOwner {
 readonly schemaVersion:1;readonly kind:'observed-app-video';readonly runId:string;readonly attemptId:string;readonly admissionId:string;readonly runnerInstanceId:string;
 readonly parentPid:number;readonly childPid:number;readonly scratchDev:string;readonly scratchIno:string;readonly videoBasename:string;
}
interface DirectoryPin {readonly path:string;readonly dev:bigint;readonly ino:bigint;readonly uid:bigint;readonly mode:bigint}
export interface AppVideoRegistry {readonly scratch:DirectoryPin;readonly private:DirectoryPin;readonly video:DirectoryPin}
export interface VerifiedVideoFile {readonly open:()=>ReadStream;readonly bytes:number}
interface ReceiptPin {readonly dev:bigint;readonly ino:bigint;readonly uid:bigint;readonly content:string}
export type AppVideoSnapshot={readonly kind:'absent'}|{readonly kind:'invalid'}|{readonly kind:'owned';readonly owner:AppVideoOwner;readonly receipt:ReceiptPin;readonly registry:AppVideoRegistry;readonly path:string};
function refuse():never{throw new Error('RECORDING_FAILED');}
function noLink(path:string):BigIntStats{const stat=lstatSync(path,{bigint:true});if(stat.isSymbolicLink())refuse();return stat;}
// Permission bits and canonical paths are the host's; every open below is checked by fence.ts (win32: lstat + bigint dev/ino fence).
function pinDirectory(path:string,mode?:number):DirectoryPin{const stat=noLink(path);if(!stat.isDirectory()||mode!==undefined&&!host.files.hasMode(stat,mode))refuse();return {path:host.files.canonical(path),dev:stat.dev,ino:stat.ino,uid:stat.uid,mode:stat.mode};}
function sameDirectory(pin:DirectoryPin):void{const now=pinDirectory(pin.path);if(now.dev!==pin.dev||now.ino!==pin.ino||now.uid!==pin.uid||now.mode!==pin.mode)refuse();}
function registryAt(scratchPath:string):AppVideoRegistry{const scratch=pinDirectory(scratchPath),privateDirectory=pinDirectory(join(scratch.path,PRIVATE),0o700),video=pinDirectory(join(scratch.path,'video'),0o700);if(privateDirectory.uid!==scratch.uid||video.uid!==scratch.uid)refuse();return {scratch,private:privateDirectory,video};}
function checkRegistry(registry:AppVideoRegistry):void{sameDirectory(registry.scratch);sameDirectory(registry.private);sameDirectory(registry.video);if(registry.private.path!==join(registry.scratch.path,PRIVATE)||registry.video.path!==join(registry.scratch.path,'video'))refuse();}
/** Parent-only, before spawn: exclusive registry freshness, no reusable stale receipt. */
export function createAppVideoRegistry(scratchPath:string):AppVideoRegistry{
 const root=pinDirectory(scratchPath);mkdirSync(join(root.path,PRIVATE),{mode:0o700});
 if(!existsSync(join(root.path,'video')))mkdirSync(join(root.path,'video'),{mode:0o700});
 return registryAt(root.path);
}
function safeBasename(value:unknown):value is string{return typeof value==='string'&&Buffer.byteLength(value,'utf8')<=255&&/^[A-Za-z0-9@_-][A-Za-z0-9@_.-]*\.webm$/u.test(value)&&!value.includes('..');}
export function validateAppVideoPath(scratchPath:string,path:string):string{
 const root=pinDirectory(scratchPath),video=pinDirectory(join(root.path,'video'));const name=basename(path);
 if(!safeBasename(name)||host.files.canonical(dirname(path))!==video.path||resolve(path)!==join(dirname(path),name))refuse();
 const candidate=join(video.path,name);try{const file=noLink(candidate);if(!file.isFile()||file.nlink!==1n||file.uid!==root.uid)refuse();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}return candidate;
}
function closedOwner(value:unknown):AppVideoOwner{
 if(typeof value!=='object'||value===null||Array.isArray(value)||Object.keys(value).sort().join(',')!==KEYS)refuse();const v=value as Record<string,unknown>,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
 if(v.schemaVersion!==1||v.kind!=='observed-app-video'||![v.runId,v.attemptId,v.admissionId].every(id=>typeof id==='string'&&uuid.test(id))||typeof v.runnerInstanceId!=='string'||v.runnerInstanceId.length<1||v.runnerInstanceId.length>256||![v.parentPid,v.childPid].every(pid=>typeof pid==='number'&&Number.isSafeInteger(pid)&&pid>0&&pid<=2147483647)||![v.scratchDev,v.scratchIno].every(n=>typeof n==='string'&&/^(?:0|[1-9][0-9]{0,30})$/u.test(n))||!safeBasename(v.videoBasename))refuse();return v as unknown as AppVideoOwner;
}
function expectedOwner(launch:Launch3,registry:AppVideoRegistry,name:string,pids:{pid:number;ppid:number}):AppVideoOwner{return closedOwner({schemaVersion:1,kind:'observed-app-video',runId:launch.runId,attemptId:launch.attemptId,admissionId:launch.admission.admissionId,runnerInstanceId:launch.admission.request.runnerInstanceId,parentPid:pids.ppid,childPid:pids.pid,scratchDev:String(registry.scratch.dev),scratchIno:String(registry.scratch.ino),videoBasename:name});}
/** Child-only synchronous bounded publication: no timed-out async writer can recreate scratch. */
export function publishAppVideoOwner(launch:Launch3,path:string,live:()=>void,pids={pid:process.pid,ppid:process.ppid}):void{
 live();const registry=registryAt(launch.scratchPath);checkRegistry(registry);const native=validateAppVideoPath(launch.scratchPath,path),owner=expectedOwner(launch,registry,basename(native),pids),bytes=Buffer.from(JSON.stringify(owner),'utf8');if(bytes.length>MAX_BYTES)refuse();
 const temporary=join(registry.private.path,'app-video-owner.tmp'),target=join(registry.private.path,RECEIPT);let fd:number|undefined,created=false;
 try{fd=openFencedSync(temporary,host.files.flags.createExclusive,0o600);created=true;if(writeSync(fd,bytes)!==bytes.length)refuse();fsyncSync(fd);closeSync(fd);fd=undefined;live();checkRegistry(registry);linkSync(temporary,target);unlinkSync(temporary);created=false;host.files.syncDirectorySync(registry.private.path);live();}
 finally{if(fd!==undefined)closeSync(fd);if(created)unlinkSync(temporary);}
}
function readReceipt(registry:AppVideoRegistry):{owner:AppVideoOwner;pin:ReceiptPin}{
 checkRegistry(registry);const fd=openFencedSync(join(registry.private.path,RECEIPT),host.files.flags.noFollowNonBlock);try{const stat=fstatSync(fd,{bigint:true});if(!stat.isFile()||stat.nlink!==1n||stat.uid!==registry.private.uid||!host.files.hasMode(stat,0o600)||stat.size>BigInt(MAX_BYTES))refuse();const bytes=Buffer.alloc(MAX_BYTES+1);const count=readSync(fd,bytes,0,bytes.length,0);if(count>MAX_BYTES||BigInt(count)!==stat.size)refuse();const content=bytes.subarray(0,count).toString('utf8'),owner=closedOwner(parseWireJson(bytes.subarray(0,count)));return {owner,pin:{dev:stat.dev,ino:stat.ino,uid:stat.uid,content}};}finally{closeSync(fd);}
}
/** One immutable cut before stop/kill. Absence at that cut cannot be repaired by late writes. */
export function sealAppVideoOwner(registry:AppVideoRegistry,launch:Launch3,childPid:number|null,parentPid=process.pid):AppVideoSnapshot{
 try{checkRegistry(registry);try{lstatSync(join(registry.private.path,RECEIPT));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {kind:'absent'};throw error;}if(childPid===null)refuse();const {owner,pin}=readReceipt(registry),expected=expectedOwner(launch,registry,owner.videoBasename,{pid:childPid,ppid:parentPid});if(JSON.stringify(owner)!==JSON.stringify(expected)){
   // Parse key ordering is immaterial; every closed scalar must match retained launch identity.
   if(Object.keys(expected).some(k=>owner[k as keyof AppVideoOwner]!==expected[k as keyof AppVideoOwner]))refuse();
  }return {kind:'owned',owner:Object.freeze(owner),receipt:pin,registry,path:join(registry.video.path,owner.videoBasename)};
 }catch{return {kind:'invalid'};}
}
function stableReceipt(snapshot:Extract<AppVideoSnapshot,{kind:'owned'}>):void{const current=readReceipt(snapshot.registry);if(current.pin.dev!==snapshot.receipt.dev||current.pin.ino!==snapshot.receipt.ino||current.pin.uid!==snapshot.receipt.uid||current.pin.content!==snapshot.receipt.content)refuse();}
/** Four-byte inspection only, after the parent has proved writer/process-tree quiescence. */
export function observeOwnedAppRecording(snapshot:AppVideoSnapshot,reportedPath:string|null|undefined,orderlyClose:boolean,quiescent:boolean):SessionRecording{
 if(snapshot.kind==='absent')return {path:null,bytes:null,error:null,state:'UNAVAILABLE',partial:false};
 if(snapshot.kind==='invalid'||!quiescent)return {path:null,bytes:null,error:'RECORDING_FAILED',state:'FAILED',partial:false};
 let fd:number|undefined;
 try{stableReceipt(snapshot);if(reportedPath!==undefined&&reportedPath!==null&&validateAppVideoPath(snapshot.registry.scratch.path,reportedPath)!==snapshot.path)refuse();const path=validateAppVideoPath(snapshot.registry.scratch.path,snapshot.path);fd=openFencedSync(path,host.files.flags.noFollowNonBlock);const stat=fstatSync(fd,{bigint:true});if(!stat.isFile()||stat.nlink!==1n||stat.uid!==snapshot.registry.scratch.uid||stat.size>BigInt(Number.MAX_SAFE_INTEGER))refuse();const bytes=Number(stat.size),head=Buffer.alloc(4);readSync(fd,head,0,4,0);const evidence=evidenceFor({attempted:true,path,bytes,header:hasWebmHeader(head),error:null,orderlyClose});
  const verifiedFile:VerifiedVideoFile={bytes,open(){stableReceipt(snapshot);const current=validateAppVideoPath(snapshot.registry.scratch.path,path),opened=openFencedSync(current,host.files.flags.noFollowNonBlock);try{const now=fstatSync(opened,{bigint:true});if(!now.isFile()||now.nlink!==1n||now.dev!==stat.dev||now.ino!==stat.ino||now.size!==stat.size||now.mtimeNs!==stat.mtimeNs)refuse();return createReadStream(path,{fd:opened,autoClose:true});}catch(error){closeSync(opened);throw error;}}};
  return {...evidence,...(evidence.state==='PENDING'?{verifiedFile}:{} )};
 }catch{return {path:null,bytes:null,error:'RECORDING_FAILED',state:'FAILED',partial:false};}finally{if(fd!==undefined)closeSync(fd);}
}
