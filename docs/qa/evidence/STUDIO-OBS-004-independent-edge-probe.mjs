import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(pathToFileURL(resolve('studio-runner/node_modules/playwright/index.mjs')));
const {createBrowserObservationSession}=await import(pathToFileURL(resolve('studio-runner/dist/run/browser.js')));
const token='QA_PRIVATE_6a3c88_FIELD';
let markup='';const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(markup)});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,chromiumSandbox:true,args:[]});const results=[];
try{
for(const [name,html,kind] of [['prevented-check','<input type="checkbox" aria-label="Choice" onclick="event.preventDefault()">','check'],['radio-uncheck','<input type="radio" aria-label="Choice" checked>','uncheck']]){
markup=html;const page=await browser.newPage();await page.goto(origin);const session=createBrowserObservationSession(page,{sessionId:name,scopeHash:'a'.repeat(64),approvedOrigins:[origin],rules:[],knownSecrets:[],applicationPolicy:{policyRuleId:'scope',allowStructuralDiscovery:true}});
const obs=(await session.observe()).observation;const n=obs.nodes.find(n=>n.name==='Choice');const i={target:{nodeId:n.nodeId,documentId:n.documentId,generation:n.generation,locator:n.locatorHints[0]},operation:{kind},resolvedValue:null,origin,maxValueBytes:4096};let error=null;try{await session.invoke(i)}catch(e){error=e.message}results.push({name,error,checked:await page.locator('input').isChecked(),desired:kind==='check'});await session.dispose();await page.close();}
markup=`<input type="password" aria-label="Password" value="${token}"><button>Continue</button>`;const page=await browser.newPage();await page.goto(origin);const session=createBrowserObservationSession(page,{sessionId:'prior-page',scopeHash:'a'.repeat(64),approvedOrigins:[origin],rules:[],knownSecrets:[],applicationPolicy:{policyRuleId:'scope',allowStructuralDiscovery:true}});const first=await session.observe();markup=`<button>${token}</button>`;await page.goto(origin+'/next');const second=await session.observe();results.push({name:'prior-page-password-echo',firstContains:first.json.includes(token),secondContains:second.json.includes(token)});await session.dispose();await page.close();
}finally{await browser.close();await new Promise(r=>server.close(r))}
await writeFile('docs/qa/evidence/STUDIO-OBS-004-independent-edge-probe.json',JSON.stringify({reviewer:'/root/sdc_obs004_qa',results},null,2)+'\n');console.log(JSON.stringify(results));
