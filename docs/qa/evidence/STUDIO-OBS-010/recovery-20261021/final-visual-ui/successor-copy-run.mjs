import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(); const out=path.join(root,'docs/qa/evidence/STUDIO-OBS-010/recovery-20261021/final-visual-ui');
const require=createRequire(path.join(root,'frontend/package.json'));
const {chromium,expect}=require('@playwright/test');
const evidence={started:new Date().toISOString(),node:process.version,mode:'Vite standalone + Node MSW demo proxy (5173 -> 5174)',app:'http://127.0.0.1:5173',syntheticOnly:true,actions:[],testIds:[],screenshots:[],runtimeErrors:[],failedRequests:[],http:[],servedModules:[]};
const sourceFiles=['frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx','frontend/src/components/studio/SecretInput.tsx','frontend/src/components/studio/references/ReferencePicker.tsx','frontend/src/components/studio/run/RunControl.tsx','frontend/src/components/studio/guided/guidedNarratives.ts','frontend/src/components/studio/evidence/VideoEvidencePanel.tsx'];
const hashes=()=>Object.fromEntries(sourceFiles.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
evidence.sourceBefore=hashes(); const browser=await chromium.launch({headless:true}); evidence.browser=browser.version();
const context=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await context.newPage(); page.setDefaultTimeout(15000);
page.on('response',async r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/v1/'))evidence.http.push({method:r.request().method(),path:u.pathname,status:r.status()});if(sourceFiles.some(f=>u.pathname==='/'+f.replace('frontend/',''))){try{evidence.servedModules.push({path:u.pathname,sha256:crypto.createHash('sha256').update(await r.body()).digest('hex')});}catch{}}});page.on('pageerror',e=>evidence.runtimeErrors.push(e.message)); page.on('requestfailed',r=>evidence.failedRequests.push({url:r.url(),failure:r.failure()}));
const persist=()=>fs.writeFileSync(path.join(out,'successor-copy-execution.json'),JSON.stringify(evidence,null,2));
async function shot(name){await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.screenshot({path:path.join(out,name+'.png'),fullPage:await page.getByRole('dialog').count()===0,animations:'disabled'});evidence.screenshots.push(name+'.png');fs.writeFileSync(path.join(out,name+'.txt'),await page.locator('body').innerText());persist();}
async function stage(name,fn){try{const detail=await fn(); evidence.actions.push({name,status:'PASS',detail:detail??null,time:new Date().toISOString()}); persist();}catch(e){evidence.actions.push({name,status:'FAIL',error:String(e),time:new Date().toISOString()});await shot('FAILED-'+String(evidence.actions.length));throw e;}}
const button=(name)=>page.getByRole('button',{name,exact:true});
const dialog=()=>page.getByRole('dialog').last();
async function newTest(suffix){await page.goto('http://127.0.0.1:5173/checks/studio/tests');await button('Create Test').first().click();await dialog().getByLabel('Name',{exact:false}).fill('SYNTHETIC Visual UI 20261021 '+suffix);await dialog().getByRole('combobox',{name:'System (CSI)'}).click();await page.getByRole('option').first().click();await dialog().getByRole('button',{name:'Create',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveText('SYNTHETIC Visual UI 20261021 '+suffix); const id=page.url().split('/').at(-1);evidence.testIds.push({suffix,id,url:page.url()});return id;}
async function openNewReference(){await button('Insert reference').click();await page.getByRole('menuitem',{name:'New secret…',exact:true}).click();}
async function cancelDialog(){await dialog().getByRole('button',{name:'Cancel',exact:true}).click();}
try {
 await page.goto('http://127.0.0.1:5173/checks/studio/f9be71a1-5a87-4de1-b0c8-0f0b5725fa5f');
 await stage('One-string successor empty Logs copy through actual UI; no Run',async()=>{await page.locator('#studio-tab-logs').click();await expect(page.getByText('No logs are available.',{exact:true})).toBeVisible();await expect(page.getByText('No logs yet. Run the test to see live output.',{exact:true})).toHaveCount(0);await shot('23-successor-logs-neutral-copy');return {logs:await page.locator('#studio-panel-logs').innerText(),scope:'Fresh context; prior completed result pointer lost on earlier context cleanup. No third Run.'};});
} catch(e){evidence.abort=String(e);console.error(String(e));}
finally {evidence.finished=new Date().toISOString();evidence.sourceAfter=hashes();evidence.sourceStable=JSON.stringify(evidence.sourceBefore)===JSON.stringify(evidence.sourceAfter);persist();await context.close();await browser.close();console.log(JSON.stringify({out,actions:evidence.actions,sourceStable:evidence.sourceStable,servedModules:evidence.servedModules},null,2));}
