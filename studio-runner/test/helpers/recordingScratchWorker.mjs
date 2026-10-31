// Plain .mjs worker: cannot import the TypeScript helper, so it names the one whitelist entry its fixture page falls under.
const TEST_DOMAINS=['localhost'];
// A subprocess witness: imports the compiled production recorder/browser/cleanup, never copies it.
// eslint-disable-next-line no-restricted-imports -- Actual call witness verifies the fixed guided launch options then calls the original SDK.
import {chromium} from 'playwright';
import {readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {prepareRecordingScratch} from '../../dist/run/recordingScratch.js';
import {createGuidedRecorder} from '../../dist/guided/evidence.js';
import {launchGuidedBrowser} from '../../dist/run/browser.js';
// The standalone guided worker's shutdown (`dist/run/guidedShutdown.js`) is folded into the runner's one drain (STUDIO-OBS-009 AC-1);
// this witness keeps the same signal lifecycle locally: close on the first SIGTERM/SIGINT, exit 0 or 1, then release.
const installGuidedShutdown=(close,release)=>{let stopping;const stop=()=>{stopping??=close().then(()=>{process.exitCode=0;}).catch(()=>{process.exitCode=1;}).finally(release);};process.once('SIGTERM',stop);process.once('SIGINT',stop);};
import {loadEvidenceConfig} from '../../dist/server/config.js';
import {createConfiguredObjectStore,NODE_EVIDENCE_FILE_SYSTEM,evidenceBoundsFrom} from '../../dist/run/objectStoreFactory.js';
import {systemOriginSource} from '../../dist/run/timeline.js';
const actualLaunch=chromium.launchPersistentContext.bind(chromium);
chromium.launchPersistentContext=async(profile,options)=>{if(options.handleSIGINT!==false||options.handleSIGTERM!==false)throw Error('SIGNAL_OWNER_MISMATCH');process.send?.({kind:'signalOptions',handleSIGINT:options.handleSIGINT,handleSIGTERM:options.handleSIGTERM});return actualLaunch(profile,options);};
const [root,origin,mode]=process.argv.slice(2);
const scratch=await prepareRecordingScratch({workerId:'kill-fixture-worker',journalDirectory:join(root,'journal'),evidenceRoot:join(root,'evidence')});
if(mode==='sweep'){process.send?.({kind:'swept',report:scratch.report});process.disconnect();}
else {
 const settings=loadEvidenceConfig({STUDIO_RUNNER_OBJECT_STORE_DIR:join(root,'objects'),STUDIO_RUNNER_SCRATCH_DIR:join(root,'scratch')}),store=createConfiguredObjectStore(settings);
 const recorder=createGuidedRecorder({recordingScratch:scratch,store:store.store,fileSystem:NODE_EVIDENCE_FILE_SYSTEM,bounds:evidenceBoundsFrom(settings),size:{width:1280,height:720},calibrationOffsetMs:0,originSource:systemOriginSource,now:()=>performance.now(),sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms))});
 const recording=await recorder.open({sessionId:'kill-session',csiId:'fixture-csi',maxSessionSeconds:600});
 const browser=await launchGuidedBrowser({sessionId:'kill-session',scopeHash:'a'.repeat(64),allowedDomains: TEST_DOMAINS,rules:[],knownSecrets:[]},'kill-context',()=>{/* context loss is observed by the parent timeout */},recording.launchRequest());
 await browser.handle.page.goto(origin+'/login');
 process.send?.({kind:'profile',profile:browser.scratchDirectory});
 const observation=await browser.observations.observe();
 if(observation.observation.coverage.passwordControls!==1)throw Error('LOGIN_NOT_OBSERVED');
 // Fixed fixture-only animation forces encoder output while preserving the actual login form.
 // eslint-disable-next-line no-undef -- This literal callback executes in the controlled browser fixture, not Node.
 await browser.handle.page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;document.body.append(canvas);const ctx=canvas.getContext('2d');let frame=0;setInterval(()=>{const image=ctx.createImageData(256,128);for(let i=0;i<image.data.length;i+=4){image.data[i]=(i*13+frame*37)%256;image.data[i+1]=(i*7+frame*53)%256;image.data[i+2]=(i*23+frame*17)%256;image.data[i+3]=255;}ctx.putImageData(image,0,0);frame++;},25);});
 // Repeated real app frames give the encoder actual bytes; readiness is never a fabricated file.
 const end=Date.now()+20000;let files=[];
 while(Date.now()<end){files=await readdir(recording.directory);if((await Promise.all(files.map(file=>stat(join(recording.directory,file))))).some(s=>s.size>128))break;await new Promise(resolve=>setTimeout(resolve,100));}
 if(!files.length||(await Promise.all(files.map(file=>stat(join(recording.directory,file))))).every(s=>s.size<=128))throw Error('VIDEO_NOT_WRITTEN');
 process.send?.({kind:'recording',directory:recording.directory,profile:browser.scratchDirectory,files});
 installGuidedShutdown(async()=>{
  await browser.close();
  const state=await recording.settle({identity:{schemaVersion:3,sessionId:'kill-session',workerId:'kill-fixture-worker',ownerFence:1,scopeHash:'a'.repeat(64),contextId:'kill-context',contextRevision:1,sourceRevision:'source-1',configurationRevision:'config-1',versions:{contract:3}},videoPath:await browser.recordedVideo(),orderlyClose:true,callback:async()=>{process.send?.({kind:'callback'});}});
  process.send?.({kind:'settled',state});
 },()=>{store.close();process.disconnect();});
}
