// eslint-disable-next-line no-restricted-imports -- Actual pinned native positive controls, fixed trusted chrome pages only.
import {chromium} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {prepareBrowserProfile,releaseBrowserProfile} from '../../src/run/scratchLayout.js';
import {nativeEvidenceDirectory,nativeJson,decodeNativeBlank} from './nativeBlankVideo.js';
import {NativeControlError,waitForNativeControlReadiness} from '../helpers/nativeControlReadiness.js';

// Each probe has its own profile/context/page/video. One rejected page cannot satisfy both.
const controls=[{destination:'chrome://version/',viewport:{width:1280,height:720},recording:{width:640,height:360}},{destination:'chrome://prefs-internals/',viewport:{width:1280,height:720},recording:{width:640,height:360}},{destination:'chrome://version/',viewport:{width:800,height:600},recording:{width:800,height:600}},{destination:'chrome://prefs-internals/',viewport:{width:800,height:600},recording:{width:800,height:600}}] as const;
it.each(controls)('exact native blank classifier rejects actual $destination at $recording.width x $recording.height separately',async({destination,viewport,recording})=>{
 const root=await mkdtemp(join(tmpdir(),'native-blank-control-')),profile=prepareBrowserProfile(root),diagnostics=await nativeEvidenceDirectory(destination==='chrome://version/'?'version-control':'prefs-control');
 let context:Awaited<ReturnType<typeof chromium.launchPersistentContext>>|undefined;
 try{
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,chromiumSandbox:true,args:[],viewport,recordVideo:{dir:join(root,'video'),size:recording},acceptDownloads:false,serviceWorkers:'block'});
  const browserVersion=context.browser()?.version()??'UNKNOWN';
  const page=context.pages()[0];if(!page)throw Error('CONTROL_PAGE');const video=page.video();if(!video)throw Error('CONTROL_VIDEO');
  await page.goto(destination);if(page.url()!==destination)throw Error('CONTROL_DOCUMENT');
  const specificDomReady=destination==='chrome://version/'?await page.locator('#profile_path').evaluate(node=>node.textContent.trim().length>0):await page.evaluate(()=>{try{const p=JSON.parse(document.body.innerText) as {credentials_enable_service?:unknown;autofill?:unknown;session?:unknown};return !!p.credentials_enable_service&&!!p.autofill&&!!p.session;}catch{return false;}});
  if(!specificDomReady)throw Error('CONTROL_PROBE_DOM');
  const paintReady=await page.evaluate(()=>new Promise<boolean>(r=>{requestAnimationFrame(()=>{requestAnimationFrame(()=>{r(true);});});}));
  const controlContext=context;
  try{
   const sourceReadiness=await waitForNativeControlReadiness({
    start:onFrame=>page.screencast.start({onFrame}),stop:()=>page.screencast.stop(),closeContext:()=>controlContext.close(),
    onClosed:listener=>{page.on('close',listener);page.on('crash',listener);controlContext.on('close',listener);if(page.isClosed())listener();return()=>{page.off('close',listener);page.off('crash',listener);controlContext.off('close',listener);};},
   },recording,{specificDomReady,paintReady,videoPresent:true});
   await nativeJson(diagnostics,'control-readiness.json',{controlSynchronizationOnly:true,...sourceReadiness});
  }catch(cause){
   await nativeJson(diagnostics,'control-readiness.json',{controlSynchronizationOnly:true,errorCode:cause instanceof NativeControlError?cause.code:'CONTROL_READINESS',...(cause instanceof NativeControlError?cause.facts:{})});
   throw Error('CONTROL_READINESS');
  }
  await page.close();await context.close();context=undefined;
  // Never persist probe pixels, page text, profile paths or native probe files. Numeric facts only.
  const result=await decodeNativeBlank(await video.path(),recording,{controlMetrics:true});
  const informationBearingRejectedFrames=result.frames.filter(f=>!f.surface.accepted&&f.surface.kind==='NONBLANK'&&(f.maxRowRuns??0)>6).length,last=result.frames.at(-1);
  const finalProbeFrameRejected=!!last&&!last.surface.accepted&&last.surface.kind==='NONBLANK'&&(last.maxRowRuns??0)>6;
  await nativeJson(diagnostics,'control-counts.json',{probe:destination==='chrome://version/'?'VERSION':'PREFS',browserVersion,viewport,recording,specificDomReady,paintReady,informationBearingRejectedFrames,finalProbeFrameRejected,controlRowTolerance:12,controlContentFreeMaxRuns:6,nativeWidth:result.nativeWidth,nativeHeight:result.nativeHeight,totalFrames:result.totalNativeFrames,classifiedFrames:result.classifiedFrames,rejectedFrames:result.rejectedFrames,acceptedFrames:result.classifiedFrames-result.rejectedFrames,blankOracle:'Aria20261014 exact full-resolution classifier; separate actual page/video'});
  expect(result.classifiedFrames).toBeGreaterThan(0);expect(result.rejectedFrames).toBeGreaterThan(0);expect(informationBearingRejectedFrames).toBeGreaterThan(0);expect(finalProbeFrameRejected).toBe(true);
 }finally{try{await context?.close();}finally{try{releaseBrowserProfile(profile);}finally{await rm(root,{recursive:true,force:true});}}}
});
