import { createServer } from 'node:http';

export const canary='  OBS-private-é-471\n  ';
export async function startGuidedDataflowFixture(mode:'exact'|'regionVisible'|'regionControl'|'mixedVisible'='exact',valueSource:()=>string=()=>canary) {
  const receipts:string[]=[]; let sourceRequests=0;
  const server=createServer((req,res)=>{
    if(req.url==='/receipt') { let text=''; req.on('data',(b:Buffer)=>{text+=b.toString();});req.on('end',()=>{receipts.push(text);res.end('OK');});return; }
    res.setHeader('content-type','text/html; charset=utf-8');
    if(req.url==='/source') {sourceRequests++;const sourceValue=valueSource();res.write('<input type="password" value="UNREAD_PASSWORD_004_QA"><input value="UNREAD_INPUT_004_QA">');res.end(mode==='mixedVisible'?`<output data-testid="source" aria-label="Business reference">${sourceValue}</output><button data-testid="refresh">Refresh</button>`:mode==='exact'?`<div data-testid="source">${sourceValue}</div><button data-testid="refresh">Refresh</button>`:`<main aria-label="Operations">${mode==='regionVisible'?`<output aria-label="Business reference">${sourceValue}</output>`:`<textarea aria-label="Business reference">${sourceValue}</textarea>`}</main>`);}
    else {let html=`<label>Destination<textarea data-testid="destination" aria-label="Destination"></textarea></label><button data-testid="submit">Submit</button><button>${canary}</button><button>PRIVATE-INPUT-064</button><button>UNREAD_PASSWORD_004_QA</button><button>UNREAD_INPUT_004_QA</button><script>document.querySelector('[data-testid=submit]').onclick=()=>fetch('/receipt',{method:'POST',body:document.querySelector('textarea').value});</script>`;if(mode!=='exact'&&mode!=='mixedVisible')html=html.replace(/ data-testid="(?:destination|submit)"/gu,'').replace("document.querySelector('[data-testid=submit]')","document.querySelector('button')");res.end(html);}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve)); const address=server.address(); if(!address||typeof address==='string') throw new Error('PORT');
  return {origin:`http://127.0.0.1:${String(address.port)}`,receipts,sourceRequests:()=>sourceRequests,close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>{ resolve(); }));}};
}
