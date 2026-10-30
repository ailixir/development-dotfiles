import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
// eslint-disable-next-line no-restricted-imports -- Fault injection wraps an actual sandboxed Chromium context, never a fake browser.
import {chromium} from 'playwright';
// eslint-disable-next-line no-restricted-imports -- Actual recorded page/context types for this real-browser oracle.
import type {BrowserContext,Page} from 'playwright';
import {mkdtemp,rm,symlink,readdir,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import corpusJson from '../../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json' with {type:'json'};
import type {PublicationDocument} from '../helpers/publicationFixture.js';
import {playwrightBrowserFactory} from './preparedBrowser.js';
// Typed view of the static JSON import: the file exceeds tsserver's 4 MiB non-TS limit, so ESLint's projectService types it as `error`.
const corpus=corpusJson as unknown as PublicationDocument;
afterEach(()=>{vi.restoreAllMocks();});
it('deletes only the captured startup-native capability before creating the distinct sole app page in the same recorded context',async()=>{
 const scratch=await mkdtemp(join(tmpdir(),'bootstrap-capability-')),launch=chromium.launchPersistentContext.bind(chromium);let startupPath='',deleteCount=0,emptyBeforeCreation=false;
 let startupVideo:unknown;
 vi.spyOn(chromium,'launchPersistentContext').mockImplementation(async(...args)=>{
  const context=await launch(...args),page=context.pages()[0];if(!page)throw new Error('PAGE');const video=page.video();if(!video)throw new Error('VIDEO');startupVideo=video;
  const path=video.path.bind(video),remove=video.delete.bind(video);vi.spyOn(video,'delete').mockImplementation(async()=>{startupPath=await path();deleteCount++;await remove();});
  const newPage=context.newPage.bind(context);vi.spyOn(context,'newPage').mockImplementation(async()=>{emptyBeforeCreation=context.pages().length===0&&(await readdir(join(scratch,'video'))).length===0;return newPage();});return context;
 });
 try{
  const browser=await playwrightBrowserFactory.launch({allowedDomains: TEST_DOMAINS, browser:'chromium',scratchPath:scratch,viewport:{width:800,height:600},recording:{width:800,height:600},observedScope:corpus.job.binding.scope});
  try{
   const app=browser.page as unknown as Page,video=app.video();if(!video)throw new Error('APP_VIDEO');expect(video).not.toBe(startupVideo);expect(deleteCount).toBe(1);expect(emptyBeforeCreation).toBe(true);const soleAppAtReady=browser.observedStartupReady?.();expect(soleAppAtReady).toBe(true);await expect(stat(startupPath)).rejects.toThrow();const appDeleted=vi.spyOn(video,'delete');const produced=await browser.close();expect(produced).toBe(await video.path());expect(produced).not.toBe(startupPath);expect(appDeleted).not.toHaveBeenCalled();expect(await readdir(join(scratch,'video'))).toEqual([produced?.split('/').at(-1)]);
   await writeFile(resolve('../docs/qa/evidence/STUDIO-OBS-007/runner-bootstrap-capability-oracle.json'),JSON.stringify({actualSandboxedFullChromium:true,samePersistentRecordedContext:true,distinctNativeCapabilities:true,startupVideoPath:startupPath,appVideoPath:produced,startupNativeDeleteCount:deleteCount,zeroPagesAndZeroVideoArtifactsBeforeAppCreation:emptyBeforeCreation,soleAppAtReady,startupArtifactAbsent:true,appNativeVideoNotDeleted:true,imageProvenance:'NOT_ASSERTED: local Chromium fixture'},null,2)+'\n');
  }finally{await browser.dispose();}
 }finally{await rm(scratch,{recursive:true,force:true});}
},15000);
it.each(['probe-popup','delete-popup','competing-new-page','delete-failure','symlink-video','cancel-delete','expired-delete','close-failure'] as const)('refuses %s in the actual recorded bootstrap and closes the same context before returning',async fault=>{
 const scratch=await mkdtemp(join(tmpdir(),'bootstrap-refusal-')),controller=new AbortController();let context:BrowserContext|undefined,deleteCalled=false,lateDelete:Promise<void>|undefined;
 const launch=chromium.launchPersistentContext.bind(chromium);
 vi.spyOn(chromium,'launchPersistentContext').mockImplementation(async(...args)=>{
  const actual=await launch(...args);context=actual;const page=actual.pages()[0];if(!page)throw new Error('NO_STARTUP');const video=page.video();if(!video)throw new Error('NO_VIDEO');
  if(fault==='probe-popup'){const goto=page.goto.bind(page);vi.spyOn(page,'goto').mockImplementation(async(...values)=>{if(values[0]==='chrome://prefs-internals/')await actual.newPage();return goto(...values);});}
  if(fault==='competing-new-page'){const newPage=actual.newPage.bind(actual);vi.spyOn(actual,'newPage').mockImplementation(async()=>{const first=await newPage();await newPage();return first;});}
  if(fault==='close-failure')vi.spyOn(page,'close').mockRejectedValue(new Error('INJECTED_CLOSE_FAILURE'));
  if(fault==='symlink-video'){const path=video.path.bind(video);vi.spyOn(video,'path').mockImplementation(async()=>{const owned=await path(),link=join(scratch,'video','linked.webm');await symlink(owned,link);return link;});}
  const remove=video.delete.bind(video);vi.spyOn(video,'delete').mockImplementation(async()=>{deleteCalled=true;
   if(fault==='delete-failure')throw new Error('INJECTED_DELETE_FAILURE');
   if(fault==='cancel-delete'){controller.abort();await remove();return;}
   if(fault==='expired-delete'){lateDelete=new Promise<void>(r=>setTimeout(r,2100)).then(remove);await lateDelete;return;}
   await remove();if(fault==='delete-popup')await actual.newPage();
  });return actual;
 });
 try{
  await expect(playwrightBrowserFactory.launch({allowedDomains: TEST_DOMAINS, browser:'chromium',scratchPath:scratch,viewport:{width:800,height:600},recording:{width:800,height:600},observedScope:corpus.job.binding.scope,startup:{signal:controller.signal,deadlineEpochMs:Date.now()+(fault==='expired-delete'?1800:10000)}})).rejects.toThrow();
  expect(context).toBeDefined();if(fault!=='expired-delete'){expect(context?.pages()).toHaveLength(0);expect(context?.browser()?.isConnected()).toBe(false);}
  if(fault==='symlink-video'){expect(deleteCalled).toBe(false);expect(await readdir(join(scratch,'video'))).toContain('linked.webm');}
 }finally{await lateDelete?.catch(()=>undefined);await context?.close();await context?.browser()?.close();await rm(scratch,{recursive:true,force:true});}
},15000);
it('retains an unexpected app-page latch until a subscriber is attached and never deletes the app video as bootstrap',async()=>{
 const scratch=await mkdtemp(join(tmpdir(),'bootstrap-late-latch-'));try{
  const browser=await playwrightBrowserFactory.launch({allowedDomains: TEST_DOMAINS, browser:'chromium',scratchPath:scratch,viewport:{width:800,height:600},recording:{width:800,height:600},observedScope:corpus.job.binding.scope});
  try{
   const page=browser.page as unknown as Page;expect(browser.observedStartupReady?.()).toBe(true);const video=page.video();if(!video)throw new Error('APP_VIDEO');const deleted=vi.spyOn(video,'delete');
   await page.context().newPage().catch(()=>undefined);expect(browser.observedStartupReady?.()).toBe(false);const notified=vi.fn();browser.onExtraPage(notified);expect(notified).toHaveBeenCalledOnce();const produced=await browser.close();expect(produced).toBe(await video.path());expect(deleted).not.toHaveBeenCalled();
  }finally{await browser.dispose();}
 }finally{await rm(scratch,{recursive:true,force:true});}
},15000);
