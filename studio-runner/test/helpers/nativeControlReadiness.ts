// eslint-disable-next-line no-restricted-imports -- Test-owned fixed ffprobe/ffmpeg pipes; no application input or media files.
import {spawn} from 'node:child_process';
import {classifyNativeBlank,nativeControlMaxRowRuns} from './nativeBlankSurface.js';

const MAX_BYTES=32*1024*1024,MAX_CANDIDATES=400,DEADLINE_MS=10000;
export interface Canvas {width:number;height:number}
export interface ReadinessFacts {startComplete:boolean;qualified:boolean;candidates:number;droppedBusy:number;elapsedMs:number;observerStopped:boolean;decoderJoined:boolean;contextFallbackClosed:boolean}
export class NativeControlError extends Error {
 constructor(readonly code:string,readonly facts?:ReadinessFacts){super(code);this.name='NativeControlError';}
}
const error=(code:string):NativeControlError=>new NativeControlError(code);
export interface ObserverPort {
 start:(onFrame:(frame:{data:Buffer})=>void)=>Promise<unknown>;
 stop:()=>Promise<void>;
 closeContext:()=>Promise<void>;
 onClosed:(listener:()=>void)=>(()=>void);
}
export type ControlDecoder=(ownedJpeg:Buffer,canvas:Canvas,signal:AbortSignal)=>Promise<Buffer>;
export type NativeTool=(executable:'ffprobe'|'ffmpeg',args:readonly string[],input:Buffer,maxOutput:number,signal:AbortSignal)=>Promise<Buffer>;
export interface ControlPrerequisites {specificDomReady:boolean;paintReady:boolean;videoPresent:boolean}

/** One owned process at a time. Abort/overrun rejects only AFTER child close, never after kill alone. */
export const runNativeControlTool:NativeTool=(executable,args,input,maxOutput,signal)=>new Promise((resolve,reject)=>{
 if(signal.aborted){reject(error('CONTROL_CANCELLED'));return;}
 const output=Buffer.alloc(maxOutput);let length=0,failed=false,closed=false;
 const child=spawn(executable,[...args],{stdio:['pipe','pipe','ignore']});
 const terminate=():void=>{failed=true;child.stdout.destroy();child.stdin.destroy();child.kill('SIGKILL');};
 const abort=():void=>{terminate();};signal.addEventListener('abort',abort,{once:true});
 child.on('error',()=>{failed=true;});child.stdin.on('error',terminate);child.stdout.on('error',terminate);
 child.stdout.on('data',(chunk:Buffer)=>{
  if(failed||closed){chunk.fill(0);return;}
  if(length+chunk.length>maxOutput){chunk.fill(0);terminate();return;}
  chunk.copy(output,length);length+=chunk.length;chunk.fill(0);
 });
 child.on('close',code=>{
  closed=true;signal.removeEventListener('abort',abort);
  if(failed||code!==0||signal.aborted){output.fill(0);reject(error('CONTROL_TOOL'));}
  else resolve(output.subarray(0,length));
 });
 child.stdin.end(input);
});

function canvasBytes(canvas:Canvas):number {
 const bytes=canvas.width*canvas.height*3;
 if(!Number.isSafeInteger(canvas.width)||!Number.isSafeInteger(canvas.height)||canvas.width<1||canvas.height<1||!Number.isSafeInteger(bytes)||bytes>MAX_BYTES)throw error('CONTROL_GEOMETRY');
 return bytes;
}
/** Readiness sample only: exactly the pinned automatic encoder pad/crop, never the original WebM. */
export async function decodeNativeControlJpeg(input:Buffer,canvas:Canvas,signal:AbortSignal,tool:NativeTool=runNativeControlTool):Promise<Buffer>{
 const bytes=canvasBytes(canvas);if(input.length<1||input.length>MAX_BYTES)throw error('CONTROL_INPUT');
 const cancelled=():boolean=>signal.aborted;
 let metadata:Buffer|undefined;
 try{
  metadata=await tool('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json','pipe:0'],input,65536,signal);
  if(cancelled())throw error('CONTROL_CANCELLED');
  const value:unknown=JSON.parse(metadata.toString('utf8'));
  if(!value||typeof value!=='object'||!('streams'in value)||!Array.isArray(value.streams)||value.streams.length!==1)throw error('CONTROL_JPEG');
  const stream:unknown=value.streams[0];
  if(!stream||typeof stream!=='object'||!('width'in stream)||!('height'in stream)||typeof stream.width!=='number'||typeof stream.height!=='number')throw error('CONTROL_JPEG');
  canvasBytes({width:stream.width,height:stream.height});
  if(stream.width>canvas.width||stream.height>canvas.height)throw error('CONTROL_JPEG');
 }catch{throw error('CONTROL_JPEG');}finally{metadata?.fill(0);}
 if(cancelled())throw error('CONTROL_CANCELLED');
 const rgb=await tool('ffmpeg',['-v','error','-i','pipe:0','-frames:v','1','-vf',`pad=${String(canvas.width)}:${String(canvas.height)}:0:0:gray,crop=${String(canvas.width)}:${String(canvas.height)}:0:0`,'-pix_fmt','rgb24','-f','rawvideo','pipe:1'],input,bytes,signal);
 if(cancelled()||rgb.length!==bytes){rgb.fill(0);throw error('CONTROL_RGB');}
 return rgb;
}

/** Called only after exact destination, specific DOM and two rAFs. Source readiness is not WebM proof. */
export async function waitForNativeControlReadiness(port:ObserverPort,canvas:Canvas,prerequisites:ControlPrerequisites,decode:ControlDecoder=decodeNativeControlJpeg):Promise<ReadinessFacts>{
 if(!prerequisites.specificDomReady||!prerequisites.paintReady||!prerequisites.videoPresent)throw error('CONTROL_PREREQUISITES');
 const bytes=canvasBytes(canvas),startedAt=Date.now(),controller=new AbortController();
 const facts:ReadinessFacts={startComplete:false,qualified:false,candidates:0,droppedBusy:0,elapsedMs:0,observerStopped:false,decoderJoined:false,contextFallbackClosed:false};
 let settled=false,acceptFrames=true,busy=false,failedCode:string|undefined,active:Promise<void>|undefined;
 let resolveQualified:()=>void=()=>undefined,rejectFailure:(reason:NativeControlError)=>void=()=>undefined;
 const qualification=new Promise<void>(resolve=>{resolveQualified=resolve;});
 const failure=new Promise<never>((_resolve,reject)=>{rejectFailure=reject;});
 // Always consume the failure latch, even if subscription throws before its first await.
 void failure.catch(()=>undefined);
 const fail=(code:string):void=>{if(!settled&&!failedCode){failedCode=code;rejectFailure(error(code));}};
 const inactive=():boolean=>settled||failedCode!==undefined;
 const expired=():boolean=>{if(Date.now()-startedAt<DEADLINE_MS)return false;fail('CONTROL_DEADLINE');controller.abort();return true;};
 const timer=setTimeout(()=>{fail('CONTROL_DEADLINE');controller.abort();},DEADLINE_MS);
 const unsubscribe=port.onClosed(()=>{fail('CONTROL_CLOSED');controller.abort();});
 const onFrame=(frame:{data:Buffer}):void=>{
  if(inactive()||!acceptFrames||facts.qualified||expired())return;if(busy){facts.droppedBusy++;return;}
  if(!Buffer.isBuffer(frame.data)||frame.data.length<1||frame.data.length>MAX_BYTES){fail('CONTROL_INPUT');return;}
  if(facts.candidates>=MAX_CANDIDATES){fail('CONTROL_CANDIDATES');return;}
  let owned:Buffer;try{owned=Buffer.from(frame.data);}catch{fail('CONTROL_INPUT');return;}
  busy=true;facts.candidates++;
  // Defer even subprocess setup until AFTER the synchronous native callback has returned.
  active=Promise.resolve().then(async()=>{
   let rgb:Buffer|undefined;
   try{
    if(inactive())return;
    rgb=await decode(owned,canvas,controller.signal);
    if(expired()||inactive())return;
    if(rgb.length!==bytes){fail('CONTROL_RGB');return;}
    const surface=classifyNativeBlank(rgb,canvas.width,canvas.height);
    if(!surface.accepted&&surface.kind==='NONBLANK'&&nativeControlMaxRowRuns(rgb,canvas.width)>6){facts.qualified=true;resolveQualified();}
    else if(facts.candidates===MAX_CANDIDATES)fail('CONTROL_CANDIDATES');
   }catch{fail('CONTROL_DECODE');}finally{rgb?.fill(0);owned.fill(0);busy=false;}
  });
 };
 let start:Promise<unknown>|undefined,stop:Promise<void>|undefined;
 const stopObserver=():Promise<void>=>Promise.resolve().then(()=>port.stop()).then(()=>{facts.observerStopped=true;});
 try{
  start=Promise.resolve().then(()=>{if(expired()||inactive())throw error('CONTROL_CLOSED');return port.start(onFrame);}).then(()=>{facts.startComplete=true;expired();},()=>{fail('CONTROL_START');throw error('CONTROL_START');});
  await Promise.race([Promise.all([start,qualification]),failure]);
  // Make late callbacks inert before removing this second client. Automatic recording stays installed.
  acceptFrames=false;
  stop=stopObserver();
  // Keep the SAME absolute deadline through observer-stop/decoder quiescence.
  await Promise.race([Promise.all([stop,active]),failure]);
  if(expired()||failedCode)throw error('CONTROL_DEADLINE');
 }catch{
  failedCode??='CONTROL_STOP';settled=true;controller.abort();
  // kNoTimeout start/stop is not cancellable by Promise.race. Context close is the fallback.
  // Issue stop even on partially attached start, then stop again after late start has settled.
  stop??=stopObserver();void stop.catch(()=>undefined);
  try{await port.closeContext();facts.contextFallbackClosed=true;}catch{failedCode='CONTROL_CLEANUP';}
  if(start)await start.catch(()=>undefined);
  await stop.catch(()=>{failedCode='CONTROL_CLEANUP';});
  try{await stopObserver();}catch{failedCode='CONTROL_CLEANUP';}
 }finally{
  settled=true;clearTimeout(timer);controller.abort();unsubscribe();
  if(active)await active;facts.decoderJoined=true;facts.elapsedMs=Date.now()-startedAt;
 }
 if(failedCode)throw new NativeControlError(failedCode,{...facts});
 return {...facts};
}
