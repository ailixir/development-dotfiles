import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
// eslint-disable-next-line no-restricted-imports -- Prelaunch call-count fault oracle and actual full Chromium context.
import {chromium} from 'playwright';
import * as promises from 'node:fs/promises';
import type * as PromiseFs from 'node:fs/promises';
import {basename,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {afterEach,expect,it,vi} from 'vitest';
import { describePosixOnly } from '../helpers/platform.js';
import corpusJson from '../../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json' with {type:'json'};
import type {PublicationDocument} from '../helpers/publicationFixture.js';
import type {Scope} from '../../src/executor/observedOperations.js';
import {prepareBrowserProfile,BROWSER_PREFERENCES,releaseBrowserProfile} from '../../src/run/scratchLayout.js';
import {playwrightBrowserFactory,launchGuidedBrowser} from '../../src/run/browser.js';
import {GuidedLaunchFailure} from '../../src/run/guidedBrowser.js';
import {readProcessTableWithArgs} from '../../src/run/tree.js';
import type {LaunchedBrowser} from '../../src/run/guidedBrowser.js';
import {ProfileSafetyFixture,probeOwnedProfilePid,performLiveProfileRedirect} from '../helpers/profileSafetyFixture.js';
import {evidencePath} from '../helpers/evidenceOut.js';
// Typed view of the static JSON import: the file exceeds tsserver's 4 MiB non-TS limit, so ESLint's projectService types it as `error`.
const corpus=corpusJson as unknown as PublicationDocument;
const fault=vi.hoisted(()=>({unsafePreparation:false}));
vi.mock('node:fs/promises',async importOriginal=>{const actual=await importOriginal<typeof PromiseFs>();return {...actual,async mkdtemp(prefix:string){const path=await actual.mkdtemp(prefix);if(fault.unsafePreparation&&prefix.endsWith('checks-guided-'))await actual.chmod(path,0o777);return path;}};});
afterEach(()=>{fault.unsafePreparation=false;vi.restoreAllMocks();vi.unstubAllEnvs();});
const config={sessionId:'00000000-0000-4000-8000-000000000099',scopeHash:'a'.repeat(64),allowedDomains: TEST_DOMAINS,knownSecrets:[]};
const scope={...corpus.job.binding.scope} as Scope;
// ADR-SC-009: skipped on Windows; the body is not re-indented, to keep the diff to the gate itself.
describePosixOnly('plants file symlinks and hardlinks and asserts the POSIX owner, mode (0o600/0o700) and inode confinement of the profile; the win32 ACL and file-id fence have their own tests', 'browser profile safety', () => {
it.each(['preferences-symlink','default-symlink','preferences-replacement','preferences-hardlink','default-replacement'] as const)('refuses unsafe %s before invoking any browser launch',async kind=>{
 const scratch=await promises.mkdtemp(join(tmpdir(),'prelaunch-profile-')),outside=await promises.mkdtemp(join(tmpdir(),'prelaunch-external-')),profile=prepareBrowserProfile(scratch),pref=join(profile,'Default','Preferences');const launch=vi.spyOn(chromium,'launchPersistentContext');try{
  if(kind==='preferences-symlink'){await promises.writeFile(join(outside,'Preferences'),JSON.stringify(BROWSER_PREFERENCES),{mode:0o600});await promises.rm(pref);await promises.symlink(join(outside,'Preferences'),pref);}
  if(kind==='default-symlink'){await promises.rename(join(profile,'Default'),join(outside,'Default'));await promises.symlink(join(outside,'Default'),join(profile,'Default'));}
  if(kind==='preferences-replacement'){await promises.rename(pref,pref+'.old');await promises.writeFile(pref,JSON.stringify(BROWSER_PREFERENCES),{mode:0o600});}
  if(kind==='preferences-hardlink')await promises.link(pref,join(outside,'linked'));
  if(kind==='default-replacement'){await promises.rename(join(profile,'Default'),join(outside,'Default'));await promises.mkdir(join(profile,'Default'),{mode:0o700});await promises.writeFile(pref,JSON.stringify(BROWSER_PREFERENCES),{mode:0o600});}
  await expect(playwrightBrowserFactory.launch({allowedDomains: TEST_DOMAINS, browser:'chromium',viewport:{width:800,height:600},recording:{width:800,height:600},scratchPath:scratch,observedScope:scope})).rejects.toThrow('PROFILE_PREFERENCES_REQUIRED');expect(launch).not.toHaveBeenCalled();
 }finally{await promises.rm(scratch,{recursive:true,force:true});await promises.rm(outside,{recursive:true,force:true});}
});
it.each(['preparation','initial-launch'] as const)('awaits actual scratch removal after guided %s rejection without an acquired context',async stage=>{
 const root=await promises.mkdtemp(join(tmpdir(),'guided-rejection-'));vi.stubEnv('TMPDIR',root);const injected=Error('INJECTED_LAUNCH_REJECTION');const launch=vi.spyOn(chromium,'launchPersistentContext').mockRejectedValue(injected);fault.unsafePreparation=stage==='preparation';try{
  // REL-001 patch A: the wire message is the closed CONTEXT_LOST; the raw refusal is the cause and the step is the phase. The safety facts are unchanged.
  const failure=await launchGuidedBrowser(config,'context',()=>undefined).then(()=>null,(error:unknown)=>error);
  expect(failure).toBeInstanceOf(GuidedLaunchFailure);
  expect(failure).toMatchObject({message:'CONTEXT_LOST',phase:stage==='preparation'?'PROFILE':'PROCESS',cause:{message:stage==='preparation'?'PROFILE_PREFERENCES_REQUIRED':'INJECTED_LAUNCH_REJECTION'}});
  if(stage==='initial-launch')expect((failure as GuidedLaunchFailure).cause).toBe(injected);
  // The scratch directory is already gone when the launcher rejects, and no browser was launched before the preparation was accepted.
  expect(await promises.readdir(root)).toEqual([]);expect(launch).toHaveBeenCalledTimes(stage==='preparation'?0:1);
  // No cleanup capability is left over: its close settles without touching anything.
  await (failure as GuidedLaunchFailure).close();expect(await promises.readdir(root)).toEqual([]);
 }finally{await promises.rm(root,{recursive:true,force:true});}
});
it('a failed launch after context acquisition takes the hard teardown: no context.close(), processes and scratch gone when it rejects',async()=>{
 // Pre-F-merge ruling item 1 (F-R2-1), amending the 2026-10-14 fixture ruling for the failed-launch path only: a launch that fails after the
 // context exists never takes a graceful close. It kills its own tree, confirms no survivor, and only then removes the scratch. The property
 // "scratch is kept while a survivor is unconfirmed" is proved elsewhere (test/run/guidedBrowserReap.test.ts, test/guided/browser.test.ts U3).
 const root=await promises.mkdtemp(join(tmpdir(),'guided-acquired-failure-'));vi.stubEnv('TMPDIR',root);const real=chromium.launchPersistentContext.bind(chromium);let profile:string|undefined,contextCloseCalls=0;
 vi.spyOn(chromium,'launchPersistentContext').mockImplementation(async(...args)=>{const context=await real(...args),page=context.pages()[0];profile=args[0];if(!page)throw Error('PAGE');vi.spyOn(page,'goto').mockRejectedValue(Error('INJECTED_PROBE_FAILURE'));const close=context.close.bind(context);vi.spyOn(context,'close').mockImplementation(async()=>{contextCloseCalls++;await close();});return context;});
 // Read-only process listing (no signal is sent). Chrome's argv names the profile by its realpath (/private/var/... on macOS), so match the unique scratch directory name, which both forms contain. An unreadable table is `[]`, so require a non-empty one.
 const owned=(scratchName:string)=>{const table=readProcessTableWithArgs();expect(table.length).toBeGreaterThan(0);return table.filter(row=>row.args.includes(scratchName)).map(row=>row.pid);};
 try{
  let failure:unknown;try{await launchGuidedBrowser(config,'context',()=>undefined);}catch(error){failure=error;}
  // (1) the launcher rejects with the closed failure; (2) it made no graceful context.close(); (3) the scratch is gone; (4) no process still names it.
  expect(failure).toBeInstanceOf(GuidedLaunchFailure);expect(contextCloseCalls).toBe(0);
  expect((await promises.readdir(root)).filter(p=>p.startsWith('checks-guided-'))).toEqual([]);
  if(!profile)throw Error('PROFILE');const scratchName=basename(dirname(profile));if(!scratchName.startsWith('checks-guided-'))throw Error('SCRATCH_NAME');
  expect(owned(scratchName)).toEqual([]);
  // (5) the teardown is memoised: a repeat close settles, touches nothing and still makes no context.close().
  if(!(failure instanceof GuidedLaunchFailure))throw Error('CLEANUP_CAPABILITY');await failure.close();await failure.close();
  expect(contextCloseCalls).toBe(0);expect((await promises.readdir(root)).filter(p=>p.startsWith('checks-guided-'))).toEqual([]);
 }finally{await promises.rm(root,{recursive:true,force:true});}
});
it('refuses a Default directory redirected after actual launch rather than accepting its newly canonical outside path',async()=>{
 const root=await promises.mkdtemp(join(tmpdir(),'guided-default-escape-'));
 // The evidence directory must be created before TMPDIR is stubbed: evidencePath() resolves under os.tmpdir(), and the fixture removes `root` before it persists its diagnostics.
 const evidenceRoot=evidencePath('STUDIO-OBSERVED-NEXT/strict-qa-20261014/runner-remediation/profile-safety-fixture/native-runs');await promises.mkdir(evidenceRoot,{recursive:true});const evidence=await promises.mkdtemp(join(evidenceRoot,'redirect-'));
 vi.stubEnv('TMPDIR',root);const real=chromium.launchPersistentContext.bind(chromium);
 const outside=join(root,'outside-default'),canary=join(outside,'fixture-canary'),canaryBytes=Buffer.from('profile-fixture-owned-canary');
 let profile:string|undefined,defaultIdentity:{dev:number;ino:number;uid:number}|undefined,canaryIdentity:{dev:number;ino:number}|undefined;
 const attackFacts={defaultRecreations:0,renamed:false,canaryCreated:false,symlinkInstalled:false,liveBefore:false,liveAfter:false,expectedRefusal:false,canaryUnchanged:false,outsideIdentityUnchanged:false};
 const identity=async(path:string)=>{const stat=await promises.lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('ATTACK_DIRECTORY');return{dev:stat.dev,ino:stat.ino,uid:stat.uid};};
 // A failed launch confirms closure by its hard teardown, so this fixture credits zero production context.close() requests (ruling item 1).
 const harness=new ProfileSafetyFixture<Awaited<ReturnType<typeof real>>,LaunchedBrowser>({
  productionTeardown:'terminate',
  bind:context=>{const browser=context.browser(),rawClose=context.close.bind(context);return{
   value:context,rawClose,installClose:close=>{vi.spyOn(context,'close').mockImplementation(close);},
   connected:()=>browser?.isConnected()??false,closing:()=>context.isClosed(),hasPage:()=>context.pages().length>0,
   onClose:listener=>{context.on('close',listener);return()=>{context.off('close',listener);};},
   onDisconnected:listener=>{browser?.on('disconnected',listener);return()=>{browser?.off('disconnected',listener);};},
   session:async()=>{if(!browser)throw Error('ATTACK_BROWSER');const session=await browser.newBrowserCDPSession();return{send:()=>session.send('SystemInfo.getProcessInfo'),detach:()=>session.detach()};},
   fallbackBrowserClose:async()=>{if(!browser)throw Error('ATTACK_BROWSER');await browser.close();},
  };},
  attack:()=>performLiveProfileRedirect({
   capture:async()=>{if(!profile)throw Error('ATTACK_PROFILE');attackFacts.liveBefore=true;defaultIdentity=await identity(join(profile,'Default'));},
   rename:async()=>{if(!profile)throw Error('ATTACK_PROFILE');await promises.rename(join(profile,'Default'),outside);attackFacts.renamed=true;},
   canary:async()=>{await promises.writeFile(canary,canaryBytes,{flag:'wx',mode:0o600});const stat=await promises.lstat(canary);canaryIdentity={dev:stat.dev,ino:stat.ino};attackFacts.canaryCreated=true;},
   symlink:async()=>{
    if(!profile)throw Error('ATTACK_PROFILE');
    // The live browser re-creates Default (its "Extension State" directory) whenever it finds it missing, so it can win the race between our rename and this link. The attack being modelled is "swap Default for a link": move what the browser re-created aside and link again. Bounded; any other error, or a persistent browser, stays a failure.
    for(let attempt=0;;attempt++){
     try{await promises.symlink(outside,join(profile,'Default'));return;}
     catch(error){
      if((error as NodeJS.ErrnoException).code!=='EEXIST'||attempt>=20)throw error;
      await promises.rename(join(profile,'Default'),join(root,'recreated-default-'+String(attempt)));attackFacts.defaultRecreations++;
     }
    }
   },
   verify:async()=>{if(!profile)throw Error('ATTACK_PROFILE');const link=await promises.lstat(join(profile,'Default'));if(!link.isSymbolicLink()||await promises.readlink(join(profile,'Default'))!==outside)throw Error('ATTACK_SYMLINK');expect(await identity(outside)).toEqual(defaultIdentity);attackFacts.symlinkInstalled=true;},
  }),
  closeOutcome:async outcome=>{if(outcome.returned)await outcome.value?.close();else if(outcome.error instanceof GuidedLaunchFailure)await outcome.error.close();},
  probe:probeOwnedProfilePid,release:()=>{if(profile)releaseBrowserProfile(profile);},remove:()=>promises.rm(root,{recursive:true,force:true}),
  persist:facts=>promises.writeFile(join(evidence,'profile-safety.json'),JSON.stringify({fixtureSchedulingObservationOnly:true,...facts,...attackFacts})+'\n',{flag:'wx',mode:0o600}),
 });
 vi.spyOn(chromium,'launchPersistentContext').mockImplementation(async(...args)=>{const context=await real(...args);profile=args[0];return harness.handoff(context);});
 await harness.run(()=>launchGuidedBrowser(config,'context',()=>undefined),async outcome=>{
   attackFacts.liveAfter=harness.facts.attackComplete;
   const failure=outcome.error;expect(failure).toBeInstanceOf(GuidedLaunchFailure);if(!(failure instanceof GuidedLaunchFailure))throw Error('CLEANUP_CAPABILITY');expect(failure.message).toBe('CONTEXT_LOST');attackFacts.expectedRefusal=true;
   harness.observeProductionTeardown();await failure.close();expect((await promises.readdir(root)).filter(p=>p.startsWith('checks-guided-'))).toEqual([]);
   expect(await identity(outside)).toEqual(defaultIdentity);attackFacts.outsideIdentityUnchanged=true;
   const stat=await promises.lstat(canary);expect(stat.isFile()&&!stat.isSymbolicLink()).toBe(true);expect({dev:stat.dev,ino:stat.ino}).toEqual(canaryIdentity);expect((await promises.readFile(canary)).equals(canaryBytes)).toBe(true);attackFacts.canaryUnchanged=true;
 });
});
it('launches the actual owned confined guided profile and removes it only after successful close',async()=>{
 const root=await promises.mkdtemp(join(tmpdir(),'guided-owned-positive-'));vi.stubEnv('TMPDIR',root);try{const browser=await launchGuidedBrowser(config,'context',()=>undefined);const evidence=browser.preferenceEvidence;if(!evidence||!browser.scratchDirectory)throw Error('EVIDENCE');expect(evidence.activeProfilePath).toBe(join(await promises.realpath(browser.scratchDirectory),'browser-profile','Default'));expect(evidence.effective).toEqual({credentialsEnableService:false,autofillProfileEnabled:false,autofillCreditCardEnabled:false,restoreOnStartup:5});expect((await promises.stat(evidence.activeProfilePath)).mode&0o777).toBe(0o700);await browser.close();expect(await promises.readdir(root)).toEqual([]);}finally{await promises.rm(root,{recursive:true,force:true});}
});
});
