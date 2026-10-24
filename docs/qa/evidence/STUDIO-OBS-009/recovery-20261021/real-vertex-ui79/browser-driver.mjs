import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(`${process.cwd()}/frontend/package.json`);
const { chromium } = require('playwright');
const evidence = 'docs/qa/evidence/STUDIO-OBS-009/recovery-20261021/real-vertex-ui79';
const cookiesPath='.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/devops-owned/playwright-author-cookies.private.json';
const browser = await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1512,height:1100}});
await context.addCookies(JSON.parse(fs.readFileSync(cookiesPath,'utf8')));
const page=await context.newPage();
const network=[], bodies=[];
let phase='preparation';
const save=()=>fs.writeFileSync(`${evidence}/network.json`,JSON.stringify(network,null,2));
page.on('response',async response=>{
 const u=new URL(response.url());if(!u.pathname.startsWith('/api/'))return;
 const request=response.request();const row={at:new Date().toISOString(),phase,method:request.method(),path:u.pathname,status:response.status()};
 network.push(row);save();
 if(response.headers()['content-type']?.includes('json')) { try{
  const body=await response.json();bodies.push({row,body});
  if(body?.session?.counters?.modelProposals>=9 && !['SUCCEEDED','FAILED','CANCELLED','EXPIRED','UNKNOWN_OUTCOME','PUBLICATION_CONFLICT'].includes(body.session.state)){
   if(!network.some(x=>x.kind==='budgetStop')){
    network.push({at:new Date().toISOString(),phase,kind:'budgetStop',proposals:body.session.counters.modelProposals,ceiling:9});save();
    const stop=page.getByRole('button',{name:'Stop',exact:true});if(await stop.isVisible()) await stop.click();
   }
  }
 }catch{}}
});
page.on('requestfailed',request=>{const u=new URL(request.url());if(u.pathname.startsWith('/api/')){network.push({at:new Date().toISOString(),phase,method:request.method(),path:u.pathname,failed:true});save();}});
const server=http.createServer(async(req,res)=>{let data='';for await(const chunk of req)data+=chunk;try{const {code}=JSON.parse(data);const result=await new Function('page','context','browser','network','bodies','fs','evidence','setPhase',`return (async()=>{${code}\n})()`)(page,context,browser,network,bodies,fs,evidence,p=>{phase=p;});res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,result}));}catch(e){res.end(JSON.stringify({ok:false,errorName:e.name,error:String(e.message).slice(0,500)}));}});
server.listen(18185,'127.0.0.1',()=>console.log(JSON.stringify({ready:true,pid:process.pid,control:'http://127.0.0.1:18185',ownedBrowser:true})));
await page.goto('http://127.0.0.1:5177/checks/studio');
