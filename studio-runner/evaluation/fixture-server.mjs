/* global Buffer */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

/** Fixture app version recorded in evaluation evidence; bump when its events/state change. */
export const FIXTURE_VERSION='1.0.0';

const listen=(server,port)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve(server.address().port);});});

/**
 * Starts the synthetic target and its separately authenticated control interface on loopback.
 * Port 0 picks free ports (used by the fixture-backed tests); the CLI keeps fixed defaults.
 */
export async function startFixtureServer({token,targetPort=4100,controlPort=4101}){
  if(!token)throw new Error('STUDIO_EVAL_FIXTURE_TOKEN is required');
  if (![targetPort,controlPort].every(port=>Number.isInteger(port)&&port>=0&&port<=65535)||(targetPort!==0&&targetPort===controlPort)) throw new Error('Distinct valid fixture ports required');
  const trials=new Map();
  let boundTargetPort=targetPort;
  const empty=()=>({events:[],state:{loggedIn:false,saved:null}});
  const reply=(response,status,body)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(body));};
  async function json(request){
    const chunks=[];let size=0;
    for await(const chunk of request){size+=chunk.length;if(size>65536)throw new Error('body limit');chunks.push(chunk);}
    return JSON.parse(Buffer.concat(chunks).toString()||'{}');
  }
  const target=createServer(async(request,response)=>{
    try {
      const match=/^\/trials\/([0-9a-f-]{36})(\/event)?$/.exec(request.url??'');
      const trial=match&&trials.get(match[1]);if(!trial){reply(response,404,{});return;}
      if(match[2]&&request.method==='POST'){
        const body=await json(request);
        if(body.action==='login'){trial.state.loggedIn=true;trial.events.push({type:'login.accepted',account:'synthetic-user'});}
        else if(['target','other'].includes(body.action)&&trial.state.loggedIn){trial.state.saved=body.action;trial.events.push({type:'form.saved',account:body.action});}
        else {reply(response,409,{error:'Invalid action or missing login'});return;}
        reply(response,200,trial.state);return;
      }
      if(match[2]||request.method!=='GET'){reply(response,405,{});return;}
      response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
      response.end(`<!doctype html><html lang="en"><title>Studio evaluation</title><main>
        <h1>Account review</h1><button onclick="act('login')">Log in</button>
        <button data-save disabled onclick="act('target')">Save target</button><button data-save disabled onclick="act('other')">Save other</button>
        <p id="status">Not saved</p></main><script>
        async function act(action){const response=await fetch(location.pathname+'/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});
        const state=await response.json();if(response.ok)document.querySelectorAll('[data-save]').forEach(button=>button.disabled=!state.loggedIn);document.getElementById('status').textContent=response.ok?(state.saved?'Saved '+state.saved:'Logged in'):'Action refused';}
        </script></html>`);
    }catch{reply(response,400,{});}
  });
  const control=createServer(async(request,response)=>{
    try{
      if(request.headers.authorization!==`Bearer ${token}`){reply(response,401,{});return;}
      if(request.url==='/trials'&&request.method==='POST'){
        const body=await json(request);
        if(typeof body.namespace!=='string'||!/^[0-9a-f-]{36}$/.test(body.namespace)||trials.has(body.namespace)||trials.size>=1000){reply(response,400,{});return;}
        trials.set(body.namespace,empty());reply(response,201,{namespace:body.namespace,targetUrl:`http://localhost:${boundTargetPort}/trials/${body.namespace}`});return;
      }
      const match=/^\/trials\/([0-9a-f-]{36})(\/reset)?$/.exec(request.url??'');
      if(!match||!trials.has(match[1])){reply(response,404,{});return;}
      if(match[2]&&request.method==='POST'){trials.set(match[1],empty());reply(response,200,{});return;}
      if(request.method!=='GET'||match[2]){reply(response,405,{});return;}
      reply(response,200,{namespace:match[1],...trials.get(match[1])});
    }catch{reply(response,400,{});}
  });
  boundTargetPort=await listen(target,targetPort);
  const boundControlPort=await listen(control,controlPort);
  const close=()=>Promise.all([target,control].map(server=>new Promise(resolve=>{server.closeAllConnections();server.close(()=>{resolve();});}))).then(()=>undefined);
  return {fixtureVersion:FIXTURE_VERSION,targetOrigin:`http://localhost:${boundTargetPort}`,controlUrl:`http://127.0.0.1:${boundControlPort}`,close};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const server=await startFixtureServer({token:process.env.STUDIO_EVAL_FIXTURE_TOKEN,
    targetPort:Number(process.env.STUDIO_EVAL_TARGET_PORT??4100),controlPort:Number(process.env.STUDIO_EVAL_CONTROL_PORT??4101)});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void server.close();});
  process.stdout.write(`Synthetic fixture target on ${server.targetOrigin}; authenticated control on ${server.controlUrl}\n`);
}
