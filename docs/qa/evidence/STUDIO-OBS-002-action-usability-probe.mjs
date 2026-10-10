import {createServer} from 'node:http';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {playwrightBrowserFactory} from '../../../studio-runner/dist/run/browser.js';
const server=createServer((req,res)=>res.end('<main>fixture</main>'));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const scratch=await mkdtemp(join(tmpdir(),'studio-page-size-'));
const browser=await playwrightBrowserFactory.launch({browser:'chromium',scratchPath:scratch,viewport:{width:1000,height:800},recording:{width:1000,height:800}});
const results=[];
try{
 await browser.page.goto(origin);
 const control='<label for="search">Search orders</label><input id="search"><button>Search</button>';
 for(const [name,html] of [['small',`<main>${control}</main>`],['ordinary-alert',`<main><div role=alert>Notice</div>${control}</main>`],['native-submit',`<main><label for=search>Search orders</label><input id=search><input type=submit value=Search></main>`],['ordinary-checkbox',`<main><label>Enabled<input type=checkbox checked></label>${control}</main>`],['short-nonsecret-input',`<main><label>Quantity<input value=1></label>${control}</main>`],['nested-normal-form',`<main>${'<div>'.repeat(12)}${control}${'</div>'.repeat(12)}</main>`],['long-content-page',`<main>${control}${'<p>Ordinary unrelated page content</p>'.repeat(550)}</main>`]]){
  await browser.page.setContent(html);
  const observer=browser.createObservationSession({sessionId:'size-probe',scopeHash:'a'.repeat(64),approvedOrigins:[origin],rules:[],knownSecrets:[],applicationPolicy:{policyRuleId:'generic-approved-app',allowStructuralDiscovery:true}});
  try{const result=await observer.observe();results.push({name,nodeCount:result.observation.nodes.length,coverage:result.observation.coverage,searchFieldVisible:result.observation.nodes.some(x=>x.name==='Search orders'),browserSearchCount:await browser.page.getByLabel('Search orders').count(),searchButtonProved:await (async()=>{const n=result.observation.nodes.find(x=>x.role==='button'&&x.name==='Search');return n?observer.matches(n,{kind:'role',role:'button',name:'Search',exact:true}):false})()});}finally{await observer.dispose();}
 }
 const dist=await readFile(new URL('../../../studio-runner/dist/run/observationCollector.js',import.meta.url));
 const report={scope:'Read-only synthetic browser usability probe against current built dist; no product source edited',distSha256:createHash('sha256').update(dist).digest('hex'),results};
 await writeFile(new URL('./STUDIO-OBS-002-action-usability-probe.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(results.some(result=>!result.searchFieldVisible||!result.searchButtonProved))process.exitCode=1;
}finally{await browser.dispose();await new Promise(resolve=>server.close(resolve));await rm(scratch,{recursive:true,force:true});}
