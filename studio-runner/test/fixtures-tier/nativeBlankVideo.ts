// eslint-disable-next-line no-restricted-imports -- Fixed native decoder tools in test tier only; no executable app/model input.
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {copyFile,lstat,mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {classifyNativeBlank,nativeControlMaxRowRuns} from '../helpers/nativeBlankSurface.js';
import type {BlankSurface} from '../helpers/nativeBlankSurface.js';
import {evidencePath} from '../helpers/evidenceOut.js';
const MAX_NATIVE_BYTES=32*1024*1024,MAX_FRAMES=400;
export async function nativeEvidenceDirectory(label:string):Promise<string>{
 if(!/^[a-z0-9-]+$/u.test(label))throw Error('NATIVE_DIAGNOSTIC_LABEL');
 const root=evidencePath('STUDIO-OBSERVED-NEXT/strict-qa-20261014/runner-remediation/padding-correction/native-runs');await mkdir(root,{recursive:true});return mkdtemp(join(root,label+'-'));
}
export async function nativeJson(directory:string,name:string,body:unknown):Promise<void>{await writeFile(join(directory,name),JSON.stringify(body,null,2)+'\n',{flag:'wx',mode:0o600});}
export async function archiveNativeVideo(source:string,directory:string,name='selected-app.webm'):Promise<{path:string;bytes:number;sha256:string}>{
 const stats=await lstat(source);if(!stats.isFile()||stats.isSymbolicLink()||stats.size>MAX_NATIVE_BYTES)throw Error('NATIVE_ARCHIVE_BOUNDS');
 const path=join(directory,name);await copyFile(source,path,constants.COPYFILE_EXCL);const bytes=await readFile(path);return{path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export interface NativeFrameFact{index:number;ms:number;surface:BlankSurface;maxRowRuns?:number}
export interface NativeBlankResult{nativeWidth:number;nativeHeight:number;totalNativeFrames:number;classifiedFrames:number;rejectedFrames:number;prefixVacuous:boolean;frames:NativeFrameFact[]}
/** Stream full-resolution RGB a single frame at a time. Prefix is EXACT first frameCount frames:
 * no scale/crop/gray exemption and no silently omitted frame. Child/tool time budgets unchanged. */
export async function decodeNativeBlank(video:string,size:{width:number;height:number},options:{frameCount?:number;timeoutMs?:number;diagnostics?:string;controlMetrics?:boolean}={}):Promise<NativeBlankResult>{
 const fail=():Error=>Error('NATIVE_DECODE_INVALID');
 const probe:unknown=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_streams','-show_frames','-show_entries','stream=width,height:frame=best_effort_timestamp_time','-of','json',video],{encoding:'utf8',timeout:options.timeoutMs??10000,maxBuffer:1024*1024}));
 if(!probe||typeof probe!=='object'||!('streams'in probe)||!Array.isArray(probe.streams)||probe.streams.length!==1||!('frames'in probe)||!Array.isArray(probe.frames))throw fail();
 const stream:unknown=probe.streams[0];if(!stream||typeof stream!=='object'||!('width'in stream)||!('height'in stream)||stream.width!==size.width||stream.height!==size.height)throw fail();
 const timestamps:number[]=[];for(const value of probe.frames as unknown[]){if(!value||typeof value!=='object'||!('best_effort_timestamp_time'in value)||typeof value.best_effort_timestamp_time!=='string'||value.best_effort_timestamp_time.trim()==='')throw fail();const ms=Number(value.best_effort_timestamp_time)*1000;if(!Number.isFinite(ms)||ms<0||ms<(timestamps.at(-1)??0))throw fail();timestamps.push(ms);}
 if(timestamps.length<1||timestamps.length>MAX_FRAMES)throw fail();const count=options.frameCount??timestamps.length;
 const frameBytes=size.width*size.height*3;if(!Number.isSafeInteger(frameBytes)||frameBytes<3||frameBytes>MAX_NATIVE_BYTES||!Number.isSafeInteger(count)||count<0||count>timestamps.length)throw fail();
 const frames:NativeFrameFact[]=[];
 if(count>0)await new Promise<void>((accept,reject)=>{
  const child=spawn('ffmpeg',['-v','error','-i',video,'-frames:v',String(count),'-vsync','0','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{stdio:['ignore','pipe','ignore']});
  let pending=Buffer.alloc(0),invalid=false;const timer=setTimeout(()=>{invalid=true;child.kill('SIGKILL');},options.timeoutMs??10000);
  child.on('error',()=>{invalid=true;});child.stdout.on('data',(chunk:Buffer)=>{if(invalid)return;pending=Buffer.concat([pending,chunk]);while(pending.length>=frameBytes){if(frames.length>=count){invalid=true;child.kill('SIGKILL');return;}const index=frames.length;frames.push({index,ms:timestamps[index]??NaN,surface:classifyNativeBlank(pending.subarray(0,frameBytes),size.width,size.height),...(options.controlMetrics?{maxRowRuns:nativeControlMaxRowRuns(pending.subarray(0,frameBytes),size.width)}:{})});pending=Buffer.from(pending.subarray(frameBytes));}});
  child.on('close',code=>{clearTimeout(timer);if(invalid||code!==0||pending.length!==0||frames.length!==count)reject(fail());else accept();});
 });
 const result={nativeWidth:size.width,nativeHeight:size.height,totalNativeFrames:timestamps.length,classifiedFrames:frames.length,rejectedFrames:frames.filter(f=>!f.surface.accepted).length,prefixVacuous:count===0,frames};
 if(options.diagnostics){await nativeJson(options.diagnostics,'native-classification.json',result);const first=frames.find(f=>!f.surface.accepted);if(first){const png=join(options.diagnostics,'rejected-frame-'+String(first.index)+'.png');execFileSync('ffmpeg',['-n','-v','error','-i',video,'-vf','select=eq(n\\,'+String(first.index)+')','-frames:v','1',png],{timeout:options.timeoutMs??10000});await nativeJson(options.diagnostics,'rejected-frame-hash.json',{frame:first.index,sha256:createHash('sha256').update(await readFile(png)).digest('hex')});}}
 return result;
}
