import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {decodeNativeControlJpeg,runNativeControlTool,waitForNativeControlReadiness} from './helpers/nativeControlReadiness.js';
import * as surfaces from './helpers/nativeBlankSurface.js';
import type {ControlDecoder,NativeTool,ObserverPort,NativeControlError} from './helpers/nativeControlReadiness.js';

const mocks=vi.hoisted(()=>({spawn:vi.fn()}));
vi.mock('node:child_process',()=>({spawn:mocks.spawn}));
const size={width:16,height:2},ready={specificDomReady:true,paintReady:true,videoPresent:true};
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason?:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function flush(){for(let n=0;n<12;n++)await Promise.resolve();}
function pixels(kind:'white'|'pad'|'black'|'gray'|'detail'):Buffer {
 const value=kind==='black'?0:kind==='gray'?127:255,b=Buffer.alloc(size.width*size.height*3,value);
 if(kind==='pad')for(let y=0;y<size.height;y++)for(let x=8;x<size.width;x++)b.fill(127,(y*size.width+x)*3,(y*size.width+x+1)*3);
 if(kind==='detail')for(let x=0;x<size.width;x+=2)b.fill(0,x*3,x*3+3);
 return b;
}
function rig(decode:ControlDecoder=()=>Promise.resolve(pixels('detail'))){
 let frame:(frame:{data:Buffer})=>void=()=>undefined,closed:()=>void=()=>undefined;
 const port={start:vi.fn((f:(value:{data:Buffer})=>void)=>{frame=f;return Promise.resolve();}),stop:vi.fn(()=>Promise.resolve()),closeContext:vi.fn(()=>Promise.resolve()),onClosed:vi.fn((f:()=>void)=>{closed=f;return vi.fn();})} satisfies ObserverPort;
 const promise=waitForNativeControlReadiness(port,size,ready,decode);
 // Install the rejection observer immediately, before controlled clocks/closures can reject.
 const outcome=promise.then(value=>({value,error:undefined}), (cause:unknown)=>({value:undefined,error:cause as NativeControlError}));
 return{port,promise,outcome,emit:(data=Buffer.from('borrowed-private-canary'))=>{frame({data});return data;},close:()=>{closed();}};
}
beforeEach(()=>{vi.useFakeTimers();mocks.spawn.mockReset();});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

describe('native positive-control readiness orchestration',()=>{
 it('waits through white then actual informative event, stops observer and releases only owned buffers',async()=>{
  const owned:Buffer[]=[],rgb:Buffer[]=[],decode=vi.fn<ControlDecoder>(b=>{owned.push(b);const out=pixels(owned.length===1?'white':'detail');rgb.push(out);return Promise.resolve(out);});
  const r=rig(decode);await flush();const borrowed=r.emit();await flush();expect(r.port.stop).not.toHaveBeenCalled();r.emit();const result=await r.promise;
  expect(result).toMatchObject({startComplete:true,qualified:true,candidates:2,observerStopped:true,decoderJoined:true,contextFallbackClosed:false});
  expect(owned.every(b=>b.every(v=>v===0))).toBe(true);expect(rgb.every(b=>b.every(v=>v===0))).toBe(true);expect(borrowed.toString()).toBe('borrowed-private-canary');expect(r.port.closeContext).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
 });
 it('cached informative callback cannot bypass pending start completion',async()=>{
  const start=deferred<undefined>(),r=rig();r.port.start.mockImplementation(f=>{f({data:Buffer.from('cached')});return start.promise;});await flush();expect(r.port.stop).not.toHaveBeenCalled();start.resolve(undefined);await r.promise;expect(r.port.stop).toHaveBeenCalledTimes(1);
 });
 it('cached qualification followed by start rejection remains red',async()=>{
  const r=rig();r.port.start.mockImplementation(f=>{f({data:Buffer.from('cached')});return Promise.reject(Error('private start after cached frame'));});expect((await r.outcome).error?.code).toBe('CONTROL_START');expect(r.port.closeContext).toHaveBeenCalled();
 });
 it.each(['specificDomReady','paintReady','videoPresent'] as const)('failed %s prerequisite prevents subscription',async key=>{
  const port={start:vi.fn(),stop:vi.fn(),closeContext:vi.fn(),onClosed:vi.fn()} as ObserverPort;
  await expect(waitForNativeControlReadiness(port,size,{...ready,[key]:false})).rejects.toThrow('CONTROL_PREREQUISITES');expect(port.start).not.toHaveBeenCalled();expect(port.onClosed).not.toHaveBeenCalled();
 });
 it.each(['white','pad','black','gray'] as const)('%s cannot qualify; no delivery of detail remains a timeout',async kind=>{
  const r=rig(()=>Promise.resolve(pixels(kind)));await flush();r.emit();await flush();await vi.advanceTimersByTimeAsync(10000);const o=await r.outcome;expect(o.error?.code).toBe('CONTROL_DEADLINE');expect(o.error?.facts).toMatchObject({qualified:false,decoderJoined:true,contextFallbackClosed:true});
 });
 it('no native callback fails instead of crediting encoder synthetic fallback',async()=>{
  const r=rig();await flush();await vi.advanceTimersByTimeAsync(10000);expect((await r.outcome).error?.code).toBe('CONTROL_DEADLINE');expect(r.port.closeContext).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
 });
 it('does not combine a nonblank simple frame with a separate accepted white frame',async()=>{
  const complexity=vi.spyOn(surfaces,'nativeControlMaxRowRuns').mockReturnValue(1);let n=0;const r=rig(()=>Promise.resolve(pixels(n++===0?'black':'white')));await flush();r.emit();await flush();complexity.mockReturnValue(100);r.emit();await flush();expect(complexity).toHaveBeenCalledTimes(1);expect(r.port.stop).not.toHaveBeenCalled();r.close();expect((await r.outcome).error?.code).toBe('CONTROL_CLOSED');
 });
 it('burst delivery has one decoder, no queued/latest candidate, and drops busy callbacks',async()=>{
  const pending=deferred<Buffer>(),decode=vi.fn<ControlDecoder>(()=>pending.promise),r=rig(decode);await flush();r.emit();for(let n=0;n<40;n++)r.emit();expect(decode).not.toHaveBeenCalled();await flush();expect(decode).toHaveBeenCalledTimes(1);pending.resolve(pixels('detail'));const result=await r.promise;expect(result).toMatchObject({candidates:1,droppedBusy:40});expect(decode).toHaveBeenCalledTimes(1);
 });
 it('cancellation before scheduled decoder starts never invokes native tool',async()=>{
  const decode=vi.fn<ControlDecoder>(()=>Promise.resolve(pixels('detail'))),r=rig(decode);await flush();r.emit();r.close();expect((await r.outcome).error?.code).toBe('CONTROL_CLOSED');expect(decode).not.toHaveBeenCalled();
 });
 it.each([0,32*1024*1024+1])('rejects encoded length %s before allocating candidate/decoder',async length=>{
  const decode=vi.fn<ControlDecoder>(),r=rig(decode);await flush();const b=r.emit(Buffer.alloc(length));expect((await r.outcome).error?.code).toBe('CONTROL_INPUT');expect(decode).not.toHaveBeenCalled();expect(b.length).toBe(length);
 });
 it.each([-1,1])('rejects short/extra RGB (%s byte) and releases it',async delta=>{
  const b=Buffer.alloc(size.width*size.height*3+delta,44),r=rig(()=>Promise.resolve(b));await flush();r.emit();expect((await r.outcome).error?.code).toBe('CONTROL_RGB');expect(b.every(v=>v===0)).toBe(true);
 });
 it('decoder private error becomes a fixed code and owned input is cleared',async()=>{
  let owned:Buffer|undefined;const r=rig(b=>{owned=b;return Promise.reject(Error('private path and page text'));});await flush();const borrowed=r.emit();const o=await r.outcome;expect(o.error?.code).toBe('CONTROL_DECODE');expect(JSON.stringify(o.error)).not.toContain('private path');expect(owned?.every(v=>v===0)).toBe(true);expect(borrowed.toString()).toBe('borrowed-private-canary');
 });
 it('candidate limit400 fails without scheduling401 or resetting deadline',async()=>{
  const decode=vi.fn<ControlDecoder>(()=>Promise.resolve(pixels('white'))),r=rig(decode);await flush();for(let n=0;n<400;n++){r.emit();await flush();}expect((await r.outcome).error?.code).toBe('CONTROL_CANDIDATES');r.emit();expect(decode).toHaveBeenCalledTimes(400);
 });
 it('later frames do not reset the single absolute deadline',async()=>{
  const r=rig(()=>Promise.resolve(pixels('white')));await flush();await vi.advanceTimersByTimeAsync(9000);r.emit();await flush();await vi.advanceTimersByTimeAsync(1000);expect((await r.outcome).error?.facts?.elapsedMs).toBe(10000);
 });
 it('late decoder success fails absolute elapsed deadline even before timer callback runs',async()=>{
  const pending=deferred<Buffer>(),r=rig(()=>pending.promise);await flush();r.emit();await flush();vi.setSystemTime(Date.now()+10001);pending.resolve(pixels('detail'));expect((await r.outcome).error?.code).toBe('CONTROL_DEADLINE');
 });
 it('start rejection attempts partial-stop and fallback close and remains red',async()=>{
  const r=rig();r.port.start.mockRejectedValue(Error('private start'));expect((await r.outcome).error?.code).toBe('CONTROL_START');expect(r.port.stop).toHaveBeenCalledTimes(2);expect(r.port.closeContext).toHaveBeenCalledTimes(1);
 });
 it('late start after timeout is joined and stopped, with late callback inert',async()=>{
  const start=deferred<undefined>(),decode=vi.fn<ControlDecoder>(()=>Promise.resolve(pixels('detail'))),r=rig(decode);r.port.start.mockImplementation(()=>start.promise);await flush();await vi.advanceTimersByTimeAsync(10000);expect(r.port.closeContext).toHaveBeenCalled();let finished=false;void r.outcome.then(()=>{finished=true;});await flush();expect(finished).toBe(false);start.resolve(undefined);expect((await r.outcome).error?.code).toBe('CONTROL_DEADLINE');r.emit();expect(decode).not.toHaveBeenCalled();expect(r.port.stop).toHaveBeenCalledTimes(2);
 });
 it('late rejected start is consumed and cannot replace deadline',async()=>{
  const start=deferred<undefined>(),r=rig();r.port.start.mockImplementation(()=>start.promise);await flush();await vi.advanceTimersByTimeAsync(10000);start.reject(Error('private late'));expect((await r.outcome).error?.code).toBe('CONTROL_DEADLINE');
 });
 it('page close cancels an active decoder, waits for join and clears late result',async()=>{
  const pending=deferred<Buffer>();let signal:AbortSignal|undefined,owned:Buffer|undefined;const r=rig((b,_canvas,s)=>{owned=b;signal=s;return pending.promise;});await flush();r.emit();await flush();r.close();await flush();expect(signal?.aborted).toBe(true);let finished=false;void r.outcome.then(()=>{finished=true;});await flush();expect(finished).toBe(false);const late=pixels('detail');pending.resolve(late);const o=await r.outcome;expect(o.error?.code).toBe('CONTROL_CLOSED');expect(o.error?.facts?.decoderJoined).toBe(true);expect(late.every(v=>v===0)).toBe(true);expect(owned?.every(v=>v===0)).toBe(true);
 });
 it('timeout cancels decoder and consumes its late rejection',async()=>{
  const pending=deferred<Buffer>();const r=rig(()=>pending.promise);await flush();r.emit();await vi.advanceTimersByTimeAsync(10000);pending.reject(Error('private late decoder'));expect((await r.outcome).error?.code).toBe('CONTROL_DEADLINE');
 });
 it('observer stop rejection stays red and still closes context',async()=>{
  const r=rig();r.port.stop.mockRejectedValue(Error('private stop'));await flush();r.emit();expect((await r.outcome).error?.code).toBe('CONTROL_CLEANUP');expect(r.port.closeContext).toHaveBeenCalled();
 });
 it('hung observer stop uses same deadline and context closure fallback, then joins stop',async()=>{
  const stop=deferred<undefined>(),r=rig();r.port.stop.mockImplementationOnce(()=>stop.promise);r.port.closeContext.mockImplementation(()=>{stop.resolve(undefined);return Promise.resolve();});await flush();r.emit();await flush();await vi.advanceTimersByTimeAsync(10000);expect((await r.outcome).error?.code).toBe('CONTROL_DEADLINE');expect(r.port.closeContext).toHaveBeenCalled();
 });
 it('close rejection cannot prevent observer stop/decoder cleanup or produce success',async()=>{
  const r=rig();r.port.closeContext.mockRejectedValue(Error('private close'));await flush();r.close();const o=await r.outcome;expect(o.error?.code).toBe('CONTROL_CLEANUP');expect(o.error?.facts).toMatchObject({decoderJoined:true,contextFallbackClosed:false});expect(r.port.stop).toHaveBeenCalledTimes(2);
 });
 it('late callbacks after success cannot start another decoder or change returned facts',async()=>{
  const decode=vi.fn<ControlDecoder>(()=>Promise.resolve(pixels('detail'))),r=rig(decode);await flush();r.emit();const result=await r.promise;r.emit();await flush();expect(result.candidates).toBe(1);expect(decode).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
 });
});

describe('in-memory JPEG geometry and exact installed canvas',()=>{
 function tool(metadata:unknown,rgb=Buffer.alloc(size.width*size.height*3)):NativeTool{return vi.fn<NativeTool>((executable)=>Promise.resolve(executable==='ffprobe'?Buffer.from(typeof metadata==='string'?metadata:JSON.stringify(metadata)):rgb));}
 it('metadata then RGB use sequential tools, stdin-only and exact pinned pad/crop',async()=>{
  const t=tool({streams:[{width:8,height:1}]}),b=Buffer.from('jpeg');const rgb=await decodeNativeControlJpeg(b,size,new AbortController().signal,t);expect(rgb.length).toBe(96);expect(t).toHaveBeenCalledTimes(2);expect(vi.mocked(t).mock.calls[1]?.[1]).toEqual(['-v','error','-i','pipe:0','-frames:v','1','-vf','pad=16:2:0:0:gray,crop=16:2:0:0','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);expect(vi.mocked(t).mock.calls.every(call=>call[2]===b)).toBe(true);
 });
 it('cannot start RGB tool while metadata process has not joined',async()=>{
  const metadata=deferred<Buffer>(),t=vi.fn<NativeTool>(executable=>executable==='ffprobe'?metadata.promise:Promise.resolve(Buffer.alloc(96)));const p=decodeNativeControlJpeg(Buffer.from('x'),size,new AbortController().signal,t);await flush();expect(t).toHaveBeenCalledTimes(1);metadata.resolve(Buffer.from(JSON.stringify({streams:[size]})));await p;expect(t).toHaveBeenCalledTimes(2);
 });
 it.each(['not json',{streams:[]},{streams:[{width:0,height:1}]},{streams:[{width:1.1,height:1}]},{streams:[{width:17,height:1}]},{streams:[{width:1,height:3}]},{streams:[{width:999999,height:999999}]}])('rejects malformed/invalid JPEG dimensions %# before RGB',async metadata=>{
  const t=tool(metadata);await expect(decodeNativeControlJpeg(Buffer.from('x'),size,new AbortController().signal,t)).rejects.toThrow('CONTROL_JPEG');expect(t).toHaveBeenCalledTimes(1);
 });
 it.each([-1,1])('rejects nonexact RGB byte count %s and clears output',async delta=>{
  const rgb=Buffer.alloc(96+delta,77),t=tool({streams:[size]},rgb);await expect(decodeNativeControlJpeg(Buffer.from('x'),size,new AbortController().signal,t)).rejects.toThrow('CONTROL_RGB');expect(rgb.every(v=>v===0)).toBe(true);
 });
 it('aborting during metadata prevents second process and clears metadata',async()=>{
  const controller=new AbortController(),metadata=Buffer.from(JSON.stringify({streams:[size]}));const t=vi.fn<NativeTool>(()=>{controller.abort();return Promise.resolve(metadata);});await expect(decodeNativeControlJpeg(Buffer.from('x'),size,controller.signal,t)).rejects.toThrow('CONTROL_JPEG');expect(t).toHaveBeenCalledTimes(1);expect(metadata.every(v=>v===0)).toBe(true);
 });
});

describe('owned native tool process cancellation and output bounds',()=>{
 function child(){const process=new EventEmitter(),stdin=new PassThrough(),stdout=new PassThrough(),kill=vi.fn(()=>true);Object.assign(process,{stdin,stdout,kill});mocks.spawn.mockReturnValue(process);return{process,stdin,stdout,kill};}
 it('success waits for exit, returns only bounded stdout and uses no media path',async()=>{
  const c=child(),controller=new AbortController(),p=runNativeControlTool('ffmpeg',['pipe:0','pipe:1'],Buffer.from('private'),8,controller.signal);c.stdout.write(Buffer.from([1,2]));c.process.emit('close',0);expect([...await p]).toEqual([1,2]);expect(mocks.spawn).toHaveBeenCalledWith('ffmpeg',['pipe:0','pipe:1'],{stdio:['pipe','pipe','ignore']});
 });
 it.each(['abort','overrun','stdin-error','stdout-error'] as const)('%s kills and joins; kill alone never claims cleanup',async mode=>{
  const c=child(),controller=new AbortController(),p=runNativeControlTool('ffmpeg',[],Buffer.from('x'),4,controller.signal);const outcome=p.catch((cause:unknown)=>cause);let finished=false;void outcome.then(()=>{finished=true;});
  if(mode==='abort')controller.abort();else if(mode==='overrun')c.stdout.write(Buffer.alloc(5));else if(mode==='stdin-error')c.stdin.emit('error',Error('private'));else c.stdout.emit('error',Error('private'));
  await flush();expect(c.kill).toHaveBeenCalledWith('SIGKILL');expect(finished).toBe(false);c.process.emit('close',null);expect(await outcome).toMatchObject({code:'CONTROL_TOOL'});expect(finished).toBe(true);
 });
 it.each(['nonzero','spawn-error'] as const)('%s is sanitized and consumes child errors',async mode=>{
  const c=child(),p=runNativeControlTool('ffprobe',[],Buffer.from('x'),8,new AbortController().signal),outcome=p.catch((cause:unknown)=>cause);if(mode==='spawn-error')c.process.emit('error',Error('private executable'));c.process.emit('close',1);expect(await outcome).toMatchObject({code:'CONTROL_TOOL'});expect(JSON.stringify(await outcome)).not.toContain('private');
 });
 it('already cancelled never spawns',async()=>{
  const c=new AbortController();c.abort();await expect(runNativeControlTool('ffprobe',[],Buffer.from('x'),8,c.signal)).rejects.toThrow('CONTROL_CANCELLED');expect(mocks.spawn).not.toHaveBeenCalled();
 });
});
