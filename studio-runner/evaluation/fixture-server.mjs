/* global Buffer */
import { createServer } from 'node:http';

const token=process.env.STUDIO_EVAL_FIXTURE_TOKEN;
if(!token)throw new Error('STUDIO_EVAL_FIXTURE_TOKEN is required');
const targetPort=Number(process.env.STUDIO_EVAL_TARGET_PORT??4100);
const controlPort=Number(process.env.STUDIO_EVAL_CONTROL_PORT??4101);
if (![targetPort,controlPort].every(port=>Number.isInteger(port)&&port>0&&port<=65535)||targetPort===controlPort) throw new Error('Distinct valid fixture ports required');
const trials=new Map();
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
      trials.set(body.namespace,empty());reply(response,201,{namespace:body.namespace,targetUrl:`http://127.0.0.1:${targetPort}/trials/${body.namespace}`});return;
    }
    const match=/^\/trials\/([0-9a-f-]{36})(\/reset)?$/.exec(request.url??'');
    if(!match||!trials.has(match[1])){reply(response,404,{});return;}
    if(match[2]&&request.method==='POST'){trials.set(match[1],empty());reply(response,200,{});return;}
    if(request.method!=='GET'||match[2]){reply(response,405,{});return;}
    reply(response,200,{namespace:match[1],...trials.get(match[1])});
  }catch{reply(response,400,{});}
});
target.listen(targetPort,'127.0.0.1');control.listen(controlPort,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{target.close();control.close();});
process.stdout.write(`Synthetic fixture target on127.0.0.1:${targetPort}; authenticated control on127.0.0.1:${controlPort}\n`);
