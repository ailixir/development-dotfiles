import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(pathToFileURL(resolve('studio-runner/node_modules/playwright/index.mjs')).href);
const { createBrowserObservationSession } = await import(pathToFileURL(resolve('studio-runner/dist/run/browser.js')).href);
const receipts = [];
const server = createServer((req,res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/receipt') { receipts.push(Object.fromEntries(url.searchParams)); res.writeHead(204); res.end(); return; }
  const name = url.pathname === '/offscreen' ? 'offscreen' : 'visible';
  res.writeHead(200, {'content-type':'text/html'});
  res.end(`<html><body><button style="margin-top:${name === 'offscreen' ? '2200px' : '0'}" onmousedown="fetch('/receipt?case=${name}&event=down&buttons='+event.buttons+'&trusted='+event.isTrusted,{method:'POST'})" onclick="fetch('/receipt?case=${name}&event=click&trusted='+event.isTrusted,{method:'POST'})">Perform action</button></body></html>`);
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true,chromiumSandbox:true,args:[]});
const results=[];
try {
  for (const name of ['visible','offscreen']) {
    const context = await browser.newContext({viewport:{width:800,height:600}});
    const page = await context.newPage(); await page.goto(`${origin}/${name}`);
    const session=createBrowserObservationSession(page,{sessionId:`probe-${name}`,scopeHash:'0'.repeat(64),approvedOrigins:[origin],rules:[],knownSecrets:[],applicationPolicy:{policyRuleId:'probe-structure',allowStructuralDiscovery:true}});
    try {
      const snapshot=await session.observe();
      const node=snapshot.observation.nodes.find(n=>n.role==='button' && n.name==='Perform action');
      if (!node) { results.push({name,nodeFound:false}); continue; }
      const locator=node.locatorHints.find(h=>h.kind==='role');
      const invocation={target:{nodeId:node.nodeId,documentId:node.documentId,generation:node.generation,locator},operation:{kind:'click'},resolvedValue:null,origin,maxValueBytes:4096};
      const prepared=await session.validateInvocation(invocation);
      let failure=null;
      try { await session.invoke(invocation); } catch(error) { failure=error.message; }
      await new Promise(r=>setTimeout(r,100));
      results.push({name,nodeFound:true,reportedVisible:node.visible,reportedActionable:node.actionable,prepared,failure,receipts:receipts.filter(r=>r.case===name)});
    } finally { await session.dispose(); await context.close(); }
  }
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
await writeFile('docs/qa/evidence/STUDIO-OBS-004-viewport-probe.json',JSON.stringify({kind:'independent-root-development-probe',results},null,2)+'\n');
console.log(JSON.stringify(results));
