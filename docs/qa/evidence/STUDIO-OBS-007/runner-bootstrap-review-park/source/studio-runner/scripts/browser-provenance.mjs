import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
export function envBrowserRoot(env){return env.PLAYWRIGHT_BROWSERS_PATH??(process.platform==='darwin'?join(homedir(),'Library','Caches','ms-playwright'):process.platform==='linux'?join(homedir(),'.cache','ms-playwright'):join(homedir(),'AppData','Local','ms-playwright'));}
export function browserExecutableRelativePath(platform=process.platform,arch=process.arch){
  if(platform==='darwin'&&['arm64','x64'].includes(arch))return 'chrome-mac-'+arch+'/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  if(platform==='linux')return 'chrome-linux64/chrome';
  if(platform==='win32')return 'chrome-win64/chrome.exe';
  throw new Error('Unsupported full Chromium platform.');
}
export function fileSha256(path){return createHash('sha256').update(readFileSync(path)).digest('hex');}
/** Trusted build/startup metadata only. No caller-selected executable or unsafe alternate. */
export function readBrowserProvenance(root,revision,platform=process.platform,arch=process.arch){
  if(!root||typeof revision!=='string'||!/^\d+$/u.test(revision))throw new Error('Missing full Chromium revision.');
  const executableRelativePath=browserExecutableRelativePath(platform,arch),directory=join(root,'chromium-'+revision);
  if(!existsSync(join(directory,'INSTALLATION_COMPLETE')))throw new Error('Missing full Chromium installation.');
  return {channel:'chromium',headless:true,chromiumSandbox:true,args:[],platform,arch,revision,executableRelativePath,executableSha256:fileSha256(join(directory,executableRelativePath))};
}
