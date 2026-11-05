import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect} from 'vitest';
import { itPosixOnly } from '../helpers/platform.js';
import {createForkSpawner} from '../../src/run/launcher.js';
import {isAlive,signalProcessTree} from '../../src/run/tree.js';
/** Actual Node process tracking only; Chromium/encoder proof lives in the fixtures tier. */
const POSIX_ONLY = 'the writer leads its own process group and is tracked by the posix `ps` sampler; win32 has no sampler';
itPosixOnly(POSIX_ONLY, 'retains an actual detached writer across leader exit and bounds its separate quiescence wait',async()=>{
 const root=await mkdtemp(join(tmpdir(),'writer-quiescence-')),writer=join(root,'writer.mjs'),leader=join(root,'leader.mjs');let writerPid=0;
 await writeFile(writer,'setInterval(()=>{},1000);\n');await writeFile(leader,`import {spawn} from 'node:child_process';console.log('SAFE_WRITER_STDOUT');console.error('SAFE_WRITER_STDERR');const writer=spawn(process.execPath,[${JSON.stringify(writer)}],{detached:true,stdio:'ignore'});process.send({pid:writer.pid});process.on('message',()=>{process.exit(0);});\n`);
 const handle=createForkSpawner().spawn({modulePath:leader,args:[],env:{PATH:process.env.PATH??''}});
 const output:string[]=[];handle.onOutput((stream,text)=>{output.push(stream+':'+text);});
 try{
  if(!handle.trackTree||!handle.quiesce)throw Error('TREE_CAPABILITY');handle.trackTree();handle.trackTree();await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{reject(Error('WRITER_NOT_STARTED'));},3000);handle.onMessage(value=>{if(typeof value==='object'&&value!==null&&'pid' in value&&typeof value.pid==='number'){writerPid=value.pid;clearTimeout(timeout);resolve();}});});expect(isAlive(writerPid)).toBe(true);
  // Let the real bounded tracking interval retain this actual process before orphaning it.
  await new Promise<void>(resolve=>{setTimeout(resolve,75);});const exited=new Promise<void>(resolve=>{handle.onExit(()=>{resolve();});});handle.send({kind:'stop'});await exited;expect(isAlive(writerPid)).toBe(true);expect(output.join('')).toContain('stdout:SAFE_WRITER_STDOUT');expect(output.join('')).toContain('stderr:SAFE_WRITER_STDERR');handle.kill();expect(isAlive(writerPid)).toBe(true);const started=Date.now();expect(await handle.quiesce(1000)).toBe(true);expect(Date.now()-started).toBeLessThan(1250);expect(isAlive(writerPid)).toBe(false);expect(handle.pid===null||!isAlive(handle.pid)).toBe(true);
 }finally{if(writerPid&&isAlive(writerPid))signalProcessTree(writerPid);if(handle.pid&&isAlive(handle.pid))handle.kill();await handle.quiesce?.(1000);await rm(root,{recursive:true,force:true});}
},10000);
