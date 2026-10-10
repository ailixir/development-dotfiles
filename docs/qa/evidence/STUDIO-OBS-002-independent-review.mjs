import {createServer} from 'node:http';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {playwrightBrowserFactory} from '../../../studio-runner/dist/run/browser.js';
const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<html><body></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const scratch=await mkdtemp(join(tmpdir(),'obs002-qa-'));
let browser;
const results=[];
try {
 browser=await playwrightBrowserFactory.launch({browser:'chromium',scratchPath:scratch,viewport:{width:800,height:600},recording:{width:800,height:600}});
 const page=browser.page;
 await page.goto(origin);
 const config={sessionId:'independent-qa',scopeHash:'a'.repeat(64),approvedOrigins:[origin],rules:[],knownSecrets:[],applicationPolicy:{policyRuleId:'app-policy-v1',allowStructuralDiscovery:true}};
 async function probe(id,html,fn){
   await page.setContent(html);
   const observer=browser.createObservationSession(config);
   try {const exported=await observer.observe(); const details=await fn(exported,observer); results.push({id,...details,coverage:exported.observation.coverage,nodes:exported.observation.nodes});}
   catch(e){results.push({id,error:String(e)});}
   finally{await observer.dispose();}
 }
 await probe('sensitive-ancestor-aria-label','<section data-sensitive><span id="private">PRIVATE_REGION_CANARY</span></section><input aria-labelledby="private">',async e=>({pass:!e.json.includes('PRIVATE_REGION_CANARY'),leaked:e.json.includes('PRIVATE_REGION_CANARY')}));
 await probe('password-label-aliased','<label id="pwlabel" for="pw">PRIVATE_LABEL_CANARY</label><input id="pw" type="password"><button aria-labelledby="pwlabel"></button>',async e=>({pass:!e.json.includes('PRIVATE_LABEL_CANARY'),leaked:e.json.includes('PRIVATE_LABEL_CANARY')}));
 await probe('normalized-input-echo','<input value="CUSTOMER  CANARY"><button>CUSTOMER  CANARY</button>',async e=>({pass:!e.json.includes('CUSTOMER CANARY'),leaked:e.json.includes('CUSTOMER CANARY')}));
 await probe('sensitive-ancestor-native-label','<section data-sensitive><label for="field">REGION_LABEL_CANARY</label></section><input id="field">',async e=>({pass:!e.json.includes('REGION_LABEL_CANARY'),leaked:e.json.includes('REGION_LABEL_CANARY')}));
 for (const [id,html,name] of [
 ['default-submit-duplicate','<button>Submit</button><input type="submit">','Submit'],
 ['title-button-duplicate','<button>Continue</button><button title="Continue"></button>','Continue'],
 ['title-button-wrong-name','<button title="Continue" aria-label="">Other</button>','Other'],
 ['duplicate-aria-references','<span id="x">Continue</span><button aria-labelledby="x x"></button>','Continue Continue'],
 ['svg-title-duplicate','<button>Continue</button><svg role="button"><title>Continue</title></svg>','Continue'],
 ['shadow-button-duplicate','<button>Continue</button><div id="host"></div>','Continue']]){
   await page.setContent(html);
   if(id==='shadow-button-duplicate') await page.evaluate(()=>{document.querySelector('#host').attachShadow({mode:'open'}).innerHTML='<button>Continue</button>';});
   const observer=browser.createObservationSession(config);
   try {const e=await observer.observe();const target=e.observation.nodes.find(n=>n.role==='button'&&n.name===name);const count=await page.getByRole('button',{name,exact:true}).count();const matches=target?await observer.matches(target,{kind:'role',role:'button',name,exact:true}):false;results.push({id,pass:!matches||count===1,playwrightCount:count,collectorMatches:matches,nodes:e.observation.nodes,coverage:e.observation.coverage});}finally{await observer.dispose();}
 }
 await probe('aria-hidden-ancestor-label','<section aria-hidden="true"><span id="h">HIDDEN_REGION_CANARY</span></section><input aria-labelledby="h">',async e=>({pass:!e.json.includes('HIDDEN_REGION_CANARY'),leaked:e.json.includes('HIDDEN_REGION_CANARY')}));
 for (const [id,html,hint] of [
 ['label-noninput-duplicate','<label for="x">Reference</label><input id="x"><button aria-label="Reference"></button>',{kind:'label',value:'Reference',exact:true}],
 ['placeholder-whitespace-duplicate','<input placeholder="Reference"><input placeholder=" Reference ">',{kind:'placeholder',value:'Reference',exact:true}],
 ]){
 await page.setContent(html);const observer=browser.createObservationSession(config);
 try{const e=await observer.observe();const target=e.observation.nodes.find(n=>n.elementType==='input');const count=await (hint.kind==='label'?page.getByLabel(hint.value,{exact:true}):page.getByPlaceholder(hint.value,{exact:true})).count();const matches=target?await observer.matches(target,hint):false;results.push({id,pass:!matches||count===1,playwrightCount:count,collectorMatches:matches,nodes:e.observation.nodes});}finally{await observer.dispose();}
 }
 // Lifecycle checks exercise refusal and cleanup without changing production sources.
 await page.setContent('<button>Continue</button>');
 const lifecycle=browser.createObservationSession(config);const snapshot=await lifecycle.observe();
 await lifecycle.dispose();await lifecycle.dispose();
 let closedRejects=false;try{await lifecycle.observe();}catch{closedRejects=true;}
 results.push({id:'disposed-session-refuses',pass:closedRejects&&!(await lifecycle.matches(snapshot.observation.nodes[0],{kind:'role',role:'button',name:'Continue',exact:true}))});
 console.log(JSON.stringify(results.map(({nodes,...rest})=>rest),null,2));
 await writeFile(new URL('./STUDIO-OBS-002-independent-review.json',import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),results},null,2)+'\n');
}finally {await browser?.dispose();await new Promise(r=>server.close(r));await rm(scratch,{recursive:true,force:true});}
if(results.some(r=>r.pass===false||r.error))process.exitCode=1;
