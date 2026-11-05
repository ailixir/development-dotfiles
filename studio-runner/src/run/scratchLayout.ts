/**
 * Where the browser is allowed to write (AC-22, architecture §9.3, ADR-001 §9).
 *
 * Everything Chromium produces — its profile/user-data directory, the recording, downloads,
 * traces and its temporary files — lives under one of these names inside the **per-run** scratch
 * directory, which is created after admission and cleared on success, step failure, launch
 * failure, error and drain. `readOnlyRootFilesystem: true` and a writable `/dev/shm` are honoured
 * by construction: nothing here writes anywhere else.
 *
 * Declared in its own module because both halves of the child boundary need it — the parent, to
 * point `TMPDIR` at the run's own temp directory before spawning, and `src/run/browser.ts`, to
 * place the profile and the recording — and the parent must not import the one module that
 * imports Playwright (AC-1).
 *
 * Resolved variables and secrets are never written to any of them (§9.2).
 */
export const SCRATCH_SUBDIRECTORIES = {
  profile: 'browser-profile',
  video: 'video',
  downloads: 'downloads',
  traces: 'traces',
  temp: 'tmp',
} as const;

import {mkdirSync,closeSync,fstatSync,lstatSync,readSync,writeSync,fsyncSync,fchmodSync,existsSync} from 'node:fs';
import type {BigIntStats,Stats} from 'node:fs';
import {join,dirname,basename,resolve} from 'node:path';
import {host} from './host/index.js';
import {openFencedSync} from './host/fence.js';

export const BROWSER_PREFERENCES = Object.freeze({
  credentials_enable_service: false,
  autofill: Object.freeze({ profile_enabled: false, credit_card_enabled: false }),
  session: Object.freeze({ restore_on_startup: 5 }),
});
// F6: where opens are fenced (win32) node ids are read as bigint, because NTFS file ids exceed 2^53; posix reads Numbers as it always did.
type NodeStats=Stats|BigIntStats;
const wideIds=host.files.fencesOpens;
const lstatNode=(path:string):NodeStats=>wideIds?lstatSync(path,{bigint:true}):lstatSync(path);
const fstatNode=(fd:number):NodeStats=>wideIds?fstatSync(fd,{bigint:true}):fstatSync(fd);
const mtimeOf=(stat:NodeStats):number|bigint=>'mtimeNs' in stat?stat.mtimeNs:stat.mtimeMs;
interface DirectoryPin {readonly path:string;readonly dev:number|bigint;readonly ino:number|bigint;readonly uid:number|bigint}
export interface BrowserProfileConfinement {readonly scratch:DirectoryPin;readonly profile:DirectoryPin;readonly defaultProfile:DirectoryPin}
interface PreparedProfile extends BrowserProfileConfinement {readonly file:{readonly dev:number|bigint;readonly ino:number|bigint;readonly uid:number|bigint}}
const preparedProfiles=new Map<string,PreparedProfile>();
const MAX_PREFERENCE_BYTES=65536;
function refused():never{throw new Error('PROFILE_PREFERENCES_REQUIRED');}
// Ownership and permission bits are the host's (posix: uid and mode; win32: the private root's ACL). Opens are checked by fence.ts.
function owned(stat:NodeStats):boolean{return host.files.isOwnNode(stat);}
function directory(path:string):DirectoryPin{const stat=lstatNode(path);if(!stat.isDirectory()||stat.isSymbolicLink()||!owned(stat)||!host.files.hasMode(stat,0o700))refused();return {path:host.files.canonical(path),dev:stat.dev,ino:stat.ino,uid:stat.uid};}
function sameDirectory(pin:DirectoryPin):void{const actual=directory(pin.path);if(actual.dev!==pin.dev||actual.ino!==pin.ino||actual.uid!==pin.uid)refused();}
/** The trusted parent calls this before capturing private video/scratch identities. */
export function secureScratchDirectory(path:string):string{
 try{const before=lstatNode(path);if(!before.isDirectory()||before.isSymbolicLink()||!owned(before)||!host.files.lacksMode(before,0o022))refused();
  const fd=openFencedSync(path,host.files.flags.directory);try{const actual=fstatNode(fd);if(actual.dev!==before.dev||actual.ino!==before.ino)refused();if(!host.files.hasMode(actual,0o700)){if(existsSync(join(path,'runner-private')))refused();fchmodSync(fd,0o700);}}finally{closeSync(fd);}
  const secured=directory(path);if(secured.dev!==before.dev||secured.ino!==before.ino)refused();return secured.path;
 }catch{refused();}
}
function profileKey(profile:string):string{if(basename(profile)!==SCRATCH_SUBDIRECTORIES.profile)refused();return join(directory(dirname(profile)).path,SCRATCH_SUBDIRECTORIES.profile);}
/** Only retained directory identities establish the expected effective Default path. */
export function browserProfileConfinement(profile:string):BrowserProfileConfinement{
 try{const pin=preparedProfiles.get(profileKey(profile));if(!pin)refused();sameDirectory(pin.scratch);sameDirectory(pin.profile);sameDirectory(pin.defaultProfile);if(pin.profile.path!==join(pin.scratch.path,SCRATCH_SUBDIRECTORIES.profile)||pin.defaultProfile.path!==join(pin.profile.path,'Default'))refused();return pin;}catch{refused();}
}
export function releaseBrowserProfile(profile:string):void{let key=resolve(profile);try{key=profileKey(profile);}catch{/* Confirmed teardown may have removed the root already. */}preparedProfiles.delete(key);}
function createDirectory(path:string):void{try{mkdirSync(path,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}directory(path);}
export function prepareBrowserProfile(scratchPath:string):string{
 let preparedKey:string|undefined;
 try{const scratch=secureScratchDirectory(scratchPath),profile=join(scratch,SCRATCH_SUBDIRECTORIES.profile);preparedKey=profile;if(preparedProfiles.has(profile)){requireBrowserPreferences(profile);return profile;}
  createDirectory(profile);createDirectory(join(profile,'Default'));const confinement={scratch:directory(scratch),profile:directory(profile),defaultProfile:directory(join(profile,'Default'))},filePath=join(profile,'Default','Preferences'),bytes=Buffer.from(JSON.stringify(BROWSER_PREFERENCES));
  const fd=openFencedSync(filePath,host.files.flags.createExclusive,0o600);let stat:NodeStats;try{if(writeSync(fd,bytes)!==bytes.length)refused();fsyncSync(fd);stat=fstatNode(fd);}finally{closeSync(fd);}sameDirectory(confinement.scratch);sameDirectory(confinement.profile);sameDirectory(confinement.defaultProfile);
  preparedProfiles.set(profile,{...confinement,file:{dev:stat.dev,ino:stat.ino,uid:stat.uid}});requireBrowserPreferences(profile);return profile;
 }catch{if(preparedKey)preparedProfiles.delete(preparedKey);refused();}
}
export function requireBrowserPreferences(profile:string):void{
 let fd:number|undefined;
 try{const confinement=browserProfileConfinement(profile),pin=preparedProfiles.get(confinement.profile.path);if(!pin)refused();const path=join(confinement.defaultProfile.path,'Preferences'),before=lstatNode(path);if(before.isSymbolicLink()||!before.isFile()||!owned(before)||Number(before.nlink)!==1||!host.files.hasMode(before,0o600)||before.dev!==pin.file.dev||before.ino!==pin.file.ino||before.uid!==pin.file.uid||Number(before.size)>MAX_PREFERENCE_BYTES)refused();
  fd=openFencedSync(path,host.files.flags.noFollowNonBlock);const stat=fstatNode(fd);if(!stat.isFile()||stat.dev!==before.dev||stat.ino!==before.ino||Number(stat.nlink)!==1||!owned(stat)||!host.files.hasMode(stat,0o600))refused();const buffer=Buffer.alloc(MAX_PREFERENCE_BYTES+1),count=readSync(fd,buffer,0,buffer.length,0);if(count!==Number(stat.size)||count>MAX_PREFERENCE_BYTES)refused();const actual=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,count))) as unknown;if(JSON.stringify(actual)!==JSON.stringify(BROWSER_PREFERENCES))refused();
  browserProfileConfinement(profile);const after=lstatNode(path);if(after.dev!==stat.dev||after.ino!==stat.ino||Number(after.nlink)!==1||after.size!==stat.size||mtimeOf(after)!==mtimeOf(stat)||after.isSymbolicLink()||!owned(after)||!host.files.hasMode(after,0o600))refused();
 }catch{refused();}finally{if(fd!==undefined)closeSync(fd);}
}
export interface EffectiveBrowserPreferences {credentialsEnableService:unknown;autofillProfileEnabled:unknown;autofillCreditCardEnabled:unknown;restoreOnStartup:unknown}
export interface BrowserPreferenceEvidence {channel:'chromium';browserVersion:string;activeProfilePath:string;executablePath:string;effective:EffectiveBrowserPreferences}
export function assertEffectiveBrowserPreferences(p:EffectiveBrowserPreferences):void{
  if(p.credentialsEnableService!==false||p.autofillProfileEnabled!==false||p.autofillCreditCardEnabled!==false||p.restoreOnStartup!==5)throw new Error('PROFILE_PREFERENCES_REQUIRED');
}
