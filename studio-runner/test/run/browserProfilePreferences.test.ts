import {mkdtemp, readFile, rm, writeFile,symlink,link,rename,mkdir,chmod,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {afterEach,expect,it,vi} from 'vitest';
import {BROWSER_PREFERENCES, prepareBrowserProfile, requireBrowserPreferences,assertEffectiveBrowserPreferences,browserProfileConfinement,releaseBrowserProfile,secureScratchDirectory} from '../../src/run/scratchLayout.js';
import { describePosixOnly } from '../helpers/platform.js';
afterEach(()=>{vi.restoreAllMocks();});

// ADR-SC-009: skipped on Windows; the body is not re-indented, to keep the diff to the gate itself.
describePosixOnly('the prepared profile is confined by 0o700/0o600 modes, the owner uid, symlink/hardlink refusal and inode identity, which are POSIX file metadata', 'browser profile preferences confinement', () => {
it('requires the exact password/autofill/session preferences before Chromium can start', async () => {
  const scratch=await mkdtemp(join(tmpdir(),'profile-preferences-'));
  try {
    expect(()=>{ requireBrowserPreferences(join(scratch,'browser-profile')); }).toThrow('PROFILE_PREFERENCES_REQUIRED');
    const profile=prepareBrowserProfile(scratch);
    expect(JSON.parse(await readFile(join(profile,'Default','Preferences'),'utf8')) as unknown).toEqual(BROWSER_PREFERENCES);
    expect(()=>{ requireBrowserPreferences(profile); }).not.toThrow();
    for (const mutation of [{credentials_enable_service:true},{autofill:{profile_enabled:true,credit_card_enabled:false}},{autofill:{profile_enabled:false,credit_card_enabled:true}},{session:{restore_on_startup:1}}]) {
      await writeFile(join(profile,'Default','Preferences'),JSON.stringify({...BROWSER_PREFERENCES,...mutation}));
      expect(()=>{ requireBrowserPreferences(profile); }).toThrow('PROFILE_PREFERENCES_REQUIRED');
    }
    await writeFile(join(profile,'Default','Preferences'),'invalid'); expect(()=>{ requireBrowserPreferences(profile); }).toThrow('PROFILE_PREFERENCES_REQUIRED');
  } finally {await rm(scratch,{recursive:true,force:true});}
});
it.each(['preferences-symlink','preferences-hardlink','preferences-replacement','default-symlink','default-replacement','profile-symlink','scratch-symlink','preferences-mode','directory-mode','oversize','unknown-owner'] as const)('refuses unsafe prepared %s without following/reusing the location',async fault=>{
 const root=await mkdtemp(join(tmpdir(),'unsafe-profile-')),scratch=join(root,'admitted'),outside=join(root,'outside');await mkdir(scratch,{mode:0o700});await mkdir(outside,{mode:0o700});const profile=prepareBrowserProfile(scratch),preferences=join(profile,'Default','Preferences');
 try{
  if(fault==='preferences-symlink'){await writeFile(join(outside,'Preferences'),JSON.stringify(BROWSER_PREFERENCES),{mode:0o600});await rm(preferences);await symlink(join(outside,'Preferences'),preferences);}
  if(fault==='preferences-hardlink')await link(preferences,join(outside,'duplicate'));
  if(fault==='preferences-replacement'){await rename(preferences,preferences+'.old');await writeFile(preferences,JSON.stringify(BROWSER_PREFERENCES),{mode:0o600});}
  if(fault==='default-symlink'){await rename(join(profile,'Default'),join(outside,'Default'));await symlink(join(outside,'Default'),join(profile,'Default'));}
  if(fault==='default-replacement'){await rename(join(profile,'Default'),join(profile,'Default.old'));await mkdir(join(profile,'Default'),{mode:0o700});await writeFile(preferences,JSON.stringify(BROWSER_PREFERENCES),{mode:0o600});}
  if(fault==='profile-symlink'){await rename(profile,join(outside,'profile'));await symlink(join(outside,'profile'),profile);}
  if(fault==='scratch-symlink'){await rename(scratch,scratch+'.old');await symlink(scratch+'.old',scratch);}
  if(fault==='preferences-mode')await chmod(preferences,0o644);
  if(fault==='directory-mode')await chmod(join(profile,'Default'),0o755);
  if(fault==='oversize')await writeFile(preferences,' '.repeat(65537));
  if(fault==='unknown-owner'){const uid=process.getuid?.();if(uid===undefined)throw Error('UID_REQUIRED');vi.spyOn(process as {getuid:()=>number},'getuid').mockReturnValue(uid+1);}
  expect(()=>{requireBrowserPreferences(profile);}).toThrow('PROFILE_PREFERENCES_REQUIRED');expect(()=>{prepareBrowserProfile(scratch);}).toThrow('PROFILE_PREFERENCES_REQUIRED');
 }finally{releaseBrowserProfile(profile);await rm(root,{recursive:true,force:true});}
});
it('secures a fresh owned scratch before pinning, reuses only the identical prepared file and releases metadata after disposal',async()=>{
 const scratch=await mkdtemp(join(tmpdir(),'owned-profile-'));try{await chmod(scratch,0o755);const canonical=secureScratchDirectory(scratch);expect((await stat(scratch)).mode&0o777).toBe(0o700);const profile=prepareBrowserProfile(scratch),before=await stat(join(profile,'Default','Preferences'));expect(prepareBrowserProfile(scratch)).toBe(profile);expect((await stat(join(profile,'Default','Preferences'))).ino).toBe(before.ino);const pin=browserProfileConfinement(profile);expect(pin.scratch.path).toBe(canonical);expect(pin.defaultProfile.path).toBe(join(pin.profile.path,'Default'));expect(Object.isFrozen(BROWSER_PREFERENCES.autofill)).toBe(true);expect(Object.isFrozen(BROWSER_PREFERENCES.session)).toBe(true);releaseBrowserProfile(profile);expect(()=>{requireBrowserPreferences(profile);}).toThrow('PROFILE_PREFERENCES_REQUIRED');}finally{await rm(scratch,{recursive:true,force:true});}
});
it('refuses unsafe scratch or a permission repair after the video registry has pinned it',async()=>{const root=await mkdtemp(join(tmpdir(),'scratch-pin-'));try{await chmod(root,0o777);expect(()=>{secureScratchDirectory(root);}).toThrow('PROFILE_PREFERENCES_REQUIRED');await chmod(root,0o755);await mkdir(join(root,'runner-private'),{mode:0o700});expect(()=>{secureScratchDirectory(root);}).toThrow('PROFILE_PREFERENCES_REQUIRED');}finally{await rm(root,{recursive:true,force:true});}});
it('requires actual supported effective values; obsolete key history grants no effective-policy proof',()=>{
  const effective={credentialsEnableService:false,autofillProfileEnabled:false,autofillCreditCardEnabled:false,restoreOnStartup:5};expect(()=>{assertEffectiveBrowserPreferences(effective);}).not.toThrow();
  for(const key of Object.keys(effective))for(const value of [undefined,null,true,'false',0])expect(()=>{assertEffectiveBrowserPreferences({...effective,[key]:value});}).toThrow('PROFILE_PREFERENCES_REQUIRED');
  expect(BROWSER_PREFERENCES).not.toHaveProperty('profile.password_manager_enabled');
});
});
