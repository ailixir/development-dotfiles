// eslint-disable-next-line no-restricted-imports -- Test-local original SDK delegation; no alternate browser or password primitive.
import {chromium,type BrowserContext} from 'playwright';
import {createServer} from 'node:https';
import {TLSSocket} from 'node:tls';
import {mkdtemp,readFile,readdir,writeFile,rm,stat,realpath} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {expect,it,vi} from 'vitest';
import {createGuidedServer,guidedClaimClient,guidedCallback,verifyGuidedJwt} from '../../src/guided/transport.js';
import {GuidedRuntime} from '../../src/guided/runtime.js';
import {PrivateObservationInventory} from '../../src/run/observationInventory.js';
import {launchGuidedBrowser} from '../../src/run/browser.js';
import {descendantsOf,isAlive} from '../../src/run/tree.js';
import {hash,identity,validate} from '../../src/guided/contracts.js';
import type {Action,ExecutionEvidence,BridgeBootstrap,BridgeObservation,BridgeOutcome,BridgePreparation,CommandsClaim,Producer,ConsumerEdge} from '../../src/guided/types.js';
import type {BrowserPreferenceEvidence} from '../../src/run/scratchLayout.js';
import {guidedContext,ownershipSession,assignmentFor,proposal,dispatch} from '../helpers/guided.js';
import {testTls,testFingerprint,jwtPolicy,jwt,post} from '../helpers/guidedTls.js';
import {startSecretLoginFixture} from '../fixtures/secret-login/server.js';
import {startGuidedDataflowFixture,canary as publicReference} from '../fixtures/guided-dataflow/server.js';
import {untilMs} from './realRunner.js';

// Only the HTTPS factory counter is mocked, and the proxy delegates the real factory.
// No TLS options, private arguments, return objects or mock call/result records are stored.
const tlsCounter=vi.hoisted(()=>({created:0}));
vi.mock('node:https',async importOriginal=>{
  const actual=await importOriginal<typeof import('node:https')>();
  return {...actual,createServer:new Proxy(actual.createServer,{apply(target,receiver,args){tlsCounter.created++;return Reflect.apply(target,receiver,args);}})};
});
const A='obs007-isolation-A-planted',B='obs007-isolation-B-planted';
type Scalar=string|number|boolean|null;
type Event=Record<string,Scalar>;
type Context=ReturnType<typeof guidedContext>;
interface Client {
  label:string;context:Context;grant:ReturnType<typeof ownershipSession>;assignment:ReturnType<typeof assignmentFor>;
  evidence?:ExecutionEvidence;observation?:BridgeObservation['observation'];producer?:Producer;
  scratch?:string;preferences?:BrowserPreferenceEvidence;sdk?:WeakRef<BrowserContext>;closeRestores:(()=>void)[];
  nativeCount:number;focusCount:number;nativePending:number;closed:boolean;
}
interface InventoryView {values:Map<string,boolean>;bytes:number;failed:boolean;disposed:boolean}
interface RuntimeView {
  values:Map<string,unknown>;secretValues:Set<string>;prepared:Map<string,unknown>;evidence:unknown;
  context:Context;dispatched:Set<string>;ordinals:Map<string,number>;exercisedEdges:unknown[];
  browser:unknown;launching:unknown;journal:unknown;diagnostics:unknown;
}
const codes=new Set(['CONFIGURATION_DENIED','CAPACITY','CONTEXT_LOST','IDENTITY_MISMATCH','INPUT_IDENTITY','CONTEXT_REVISION','PREPARATION_DENIED','ALREADY_CONSUMED','TARGET_CHANGED','POLICY_DENIED','IDEMPOTENCY_CONFLICT']);
function closedCode(body:unknown):string {return typeof body==='object'&&body!==null&&'code' in body&&typeof body.code==='string'&&codes.has(body.code)?body.code:'OTHER';}
function resultStatus(reply:Awaited<ReturnType<typeof post>>,status:number):void {expect(reply.status,closedCode(reply.body)).toBe(status);}
async function canaryScan(root:string):Promise<number>{
  let hits=0;for(const entry of await readdir(root,{withFileTypes:true})){
    const path=join(root,entry.name);if(entry.isDirectory())hits+=await canaryScan(path);
    else if(entry.isFile())try{const bytes=await readFile(path);for(const value of [A,B])if([Buffer.from(value),Buffer.from(value,'utf16le'),Buffer.from(encodeURIComponent(value)),Buffer.from(Buffer.from(value).toString('base64'))].some(v=>bytes.includes(v))){hits++;break;}}catch(error){if(!(error instanceof Error&&'code' in error&&error.code==='ENOENT'))throw error;}
  }return hits;
}
function gate(){let release:(()=>void)|undefined;const pending=new Promise<void>(resolve=>{release=resolve;});return {pending,release(){release?.();}};}
function patchMethod(holder:object,key:string,observer:(receiver:object,args:unknown[],invoke:()=>unknown)=>unknown):()=>void{
  const own=Object.getOwnPropertyDescriptor(holder,key),original=Reflect.get(holder,key) as (...args:unknown[])=>unknown;
  if(typeof original!=='function')throw Error('METHOD');
  Object.defineProperty(holder,key,{configurable:true,writable:true,value:new Proxy(original,{apply(target,receiver,args){return observer(receiver as object,args,()=>Reflect.apply(target,receiver,args));}})});
  return ()=>{if(own)Object.defineProperty(holder,key,own);else Reflect.deleteProperty(holder,key);};
}
async function harness(){
  const F=await startGuidedDataflowFixture('regionVisible'),S=await startSecretLoginFixture(A),directory=await mkdtemp(join(tmpdir(),'guided-isolation-'));
  const clients=new Map<string,Client>(),events:Event[]=[],messages:{label:string;route:string;body:unknown}[]=[],claims:{label:string;at:number}[]=[],pids:{label:string;pid:number}[]=[],restores:(()=>void)[]=[];
  const tags=new WeakMap<object,string>(),sdkSetup=new Map<string,Promise<void>>();let nextTag=0,launchingLabel='NONE',worker:ReturnType<typeof createGuidedServer>|undefined,workerPort=0,launchCount=0,maxLive=0,live=0,gateA:ReturnType<typeof gate>|undefined,gateEntered=false,inventoryOwner='NONE';
  const tag=(object:object):string=>{let value=tags.get(object);if(!value){value='opaque-'+String(++nextTag);tags.set(object,value);}return value;};
  const owner=(runtime:GuidedRuntime):string=>clients.get(runtime.currentIdentity.sessionId)?.label??'NONE';
  const inventoryOwners=new WeakMap<object,string>();
  const inventoryRecord=(receiver:object,stage:string):void=>{
    const data=receiver as InventoryView;let label=inventoryOwners.get(receiver);if(!label){label=inventoryOwner;inventoryOwners.set(receiver,label);}
    events.push({kind:'inventory',stage,label,tag:tag(receiver),at:performance.now(),size:data.values.size,bytes:data.bytes,disposed:data.disposed,failed:data.failed,containsA:data.values.has(A),containsB:data.values.has(B)});
  };
  const originalSnapshot=Object.getOwnPropertyDescriptor(PrivateObservationInventory.prototype,'snapshot')?.value as (...args:unknown[])=>unknown;
  if(typeof originalSnapshot!=='function')throw Error('SNAPSHOT_METHOD');
  for(const method of ['merge','snapshot','dispose'])restores.push(patchMethod(PrivateObservationInventory.prototype,method,(receiver,_args,invoke)=>{
    inventoryRecord(receiver,'before-'+method);const returned=invoke();inventoryRecord(receiver,'after-'+method);
    if(method==='dispose'){
      let refused=false;try{Reflect.apply(originalSnapshot,receiver,[]);}catch(error){refused=error instanceof Error&&error.message==='CONTEXT_LOST';}
      events.push({kind:'disposed-snapshot',label:inventoryOwners.get(receiver)??'NONE',refused,at:performance.now()});
    }
    return returned; // raw snapshot is returned only to its original trusted caller, never stored.
  }));
  const runtimeRecord=(receiver:object,stage:string):void=>{
    const runtime=receiver as GuidedRuntime,data=receiver as RuntimeView;
    events.push({kind:'runtime',stage,label:owner(runtime),tag:tag(receiver),at:performance.now(),accepting:runtime.accepting,active:runtime.active,values:data.values.size,secrets:data.secretValues.size,prepared:data.prepared.size,hasBinding:data.values.has('binding-one'),containsA:data.secretValues.has(A),containsB:data.secretValues.has(B),evidenceAbsent:data.evidence===null,inputCount:data.context.authoredInputs.inputs.length,allocationCount:data.context.allocations.length,producerCount:data.context.producers.length,consumerCount:data.context.consumerEdges.length,dispatched:data.dispatched.size,ordinals:data.ordinals.size,edges:data.exercisedEdges.length,browserAbsent:data.browser===null,launchAbsent:data.launching===null,journalAbsent:data.journal===null,diagnosticsAbsent:data.diagnostics===null});
  };
  for(const method of ['start','stop','closeResources','dispatch'])restores.push(patchMethod(GuidedRuntime.prototype,method,(receiver,_args,invoke)=>{
    runtimeRecord(receiver,'before-'+method);const returned=invoke();runtimeRecord(receiver,'after-sync-'+method);
    if(returned instanceof Promise)void returned.then(()=>{runtimeRecord(receiver,'settled-'+method);},()=>{runtimeRecord(receiver,'rejected-'+method);});
    return returned; // original promise/errors; no replacement promise, value snapshot or mock archive.
  }));
  restores.push(patchMethod(chromium,'launchPersistentContext',(_receiver,args,invoke)=>{
    const label=launchingLabel,before=descendantsOf(process.pid),returned=invoke() as Promise<BrowserContext>;
    const setup=returned.then(async context=>{
      const client=[...clients.values()].find(c=>c.label===label);if(!client)throw Error('CLIENT');client.sdk=new WeakRef(context);launchCount++;live++;maxLive=Math.max(maxLive,live);
      for(const pid of descendantsOf(process.pid))if(!before.includes(pid))pids.push({label,pid});
      await context.exposeBinding('__obs007IsolationFocus',()=>{client.focusCount++;events.push({kind:'focus',label,at:performance.now(),nativePending:client.nativePending});});
      await context.addInitScript(()=>{document.addEventListener('focus',event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='password')(window as unknown as {__obs007IsolationFocus:()=>void}).__obs007IsolationFocus();},true);});
      client.closeRestores.push(patchMethod(context,'newCDPSession',(_r,_a,open)=>{
        const opened=open() as Promise<object>;void opened.then(session=>{
          client.closeRestores.push(patchMethod(session,'send',(_s,arguments_,send)=>{
            const result=send() as Promise<unknown>,parameters=arguments_[1] as {functionDeclaration?:unknown}|undefined;
            if(arguments_[0]==='Runtime.callFunctionOn'&&typeof parameters?.functionDeclaration==='string'){
              const functionText=parameters.functionDeclaration;
              if(functionText.includes('this.fillPasswordResult')){client.nativeCount++;client.nativePending++;events.push({kind:'native-entry',label,at:performance.now(),count:client.nativeCount});void result.then(()=>{client.nativePending--;events.push({kind:'native-end',label,at:performance.now()});},()=>{client.nativePending--;events.push({kind:'native-end',label,at:performance.now()});});}
              if(functionText==='function() { this.dispose(); }')void result.then(reply=>{const exception=typeof reply==='object'&&reply!==null&&'exceptionDetails' in reply&&reply.exceptionDetails!==undefined;events.push({kind:exception?'renderer-dispose-exception':'renderer-dispose-ack',label,at:performance.now()});},()=>{events.push({kind:'renderer-dispose-unavailable',label,at:performance.now()});});
            }
            return result;
          }));
        });return opened;
      }));
    });sdkSetup.set(label,setup);void setup.catch(()=>{events.push({kind:'sdk-setup-failed',label,at:performance.now()});});
    // SDK launch is not replaced: its original promise is returned unchanged.
    void args;return returned;
  }));
  function client(label:string,csiId:string,initial:string):Client{
    const context=guidedContext(F.origin);context.approvedOrigins=[F.origin,S.origin];context.sourceStepIds=['login-nav','password-fill','login-submit','nav','read','next','fill','submit','reports'];
    for(let i=0;i<65;i++)context.authoredInputs.inputs.push({inputId:`private-${String(i)}`,sourceStepId:'fill',kind:'nonsecretText',value:`PRIVATE-INPUT-${String(i).padStart(3,'0')}`,intendedSlot:'fill.value',provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:'fill',referenceId:`saved-${String(i)}`,kind:'nonsecretText',intendedSlot:'fill.value'}});
    for(const [id,step,value] of [['input-login','login-nav',initial],['input-reports','reports',S.origin+'/reports']] as const)context.authoredInputs.inputs.push({inputId:id,sourceStepId:step,kind:'destination',intendedSlot:'navigate.destination',value,provenance:{referenceKind:'sourceSpan',sourceRevision:context.sourceRevision,stepId:step,startUtf16:0,endUtf16:12,kind:'destination',intendedSlot:'navigate.destination'}});
    context.authoredInputs.inputs.push({inputId:'input-pass',sourceStepId:'password-fill',kind:'secretRef',intendedSlot:'fill.value',secretId:'PASS',provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:'password-fill',referenceId:'reference-pass',referenceName:'PASS',kind:'secretRef',intendedSlot:'fill.value'}});
    const grant=ownershipSession(context);grant.scope.csiId=csiId;grant.scopeHash=hash(grant.scope);grant.runAuthorization.scopeHash=grant.scopeHash;context.scopeHash=grant.scopeHash;context.authoredInputs.scopeHash=grant.scopeHash;context.authoredInputsHash=hash(context.authoredInputs);context.leaseExpiresAt=grant.owner.leaseExpiresAt;
    const value:Client={label,context,grant,assignment:assignmentFor(context),closeRestores:[],nativeCount:0,focusCount:0,nativePending:0,closed:false};clients.set(context.sessionId,value);return value;
  }
  const callbacks=createServer({...testTls,requestCert:true,rejectUnauthorized:true},(req,res)=>{void(async()=>{
    expect(req.socket).toBeInstanceOf(TLSSocket);expect((req.socket as TLSSocket).authorized).toBe(true);expect((req.socket as TLSSocket).getPeerCertificate().fingerprint256).toBe(testFingerprint);verifyGuidedJwt(req.headers.authorization,{...jwtPolicy,subject:'worker-one'},'studio-guided-controller','owning-worker');
    let text='';for await(const part of req)text+=(part as Buffer).toString();const body=JSON.parse(text) as unknown,route=req.url?.split('/').at(-1)??'';
    if(route==='claim'){
      const command=validate<CommandsClaim>('commands',body,'claim'),entry=clients.get(command.sessionId);if(!entry)throw Error('SESSION');claims.push({label:entry.label,at:performance.now()});entry.grant.owner.leaseExpiresAt=new Date(Math.min(Date.now()+30000,Date.parse(entry.grant.expiresAt))).toISOString();res.writeHead(202);res.end(JSON.stringify(entry.grant));return;
    }
    const envelope=body as {sessionId?:string;kind?:string;assignment?:{sessionId:string}};const label=clients.get(envelope.sessionId??envelope.assignment?.sessionId??'')?.label??'NONE';messages.push({label,route,body});res.writeHead(202);res.end('{}');
  })().catch(()=>{res.writeHead(500);res.end('{}');});});
  await new Promise<void>(r=>callbacks.listen(0,'127.0.0.1',r));const address=callbacks.address();if(!address||typeof address==='string')throw Error('PORT');
  const callbackOptions={baseUrl:'https://127.0.0.1:'+String(address.port),tls:testTls,controllerCertificateFingerprint256:testFingerprint,token:()=>Promise.resolve(jwt({aud:'studio-guided-controller',role:'owning-worker',sub:'worker-one'}))};
  const options={workerId:'worker-one',capacity:1,journalDirectory:directory,tls:testTls,controllerJwt:jwtPolicy,controllerCertificateFingerprint256:testFingerprint,rules:[],applicationPolicy:{policyRuleId:'app-structural',allowStructuralDiscovery:true,readGrants:[{policyRuleId:'region-read',origin:F.origin,region:{kind:'role' as const,role:'main',name:'Operations',exact:true as const},visibleText:{classification:'permittedBusinessData' as const},controlValue:{classification:'nonsecretApproved' as const,types:['text','textarea'] as ('text'|'textarea')[]}}]},claim:guidedClaimClient(callbackOptions),callback:guidedCallback(callbackOptions),launch:async(...args:Parameters<typeof launchGuidedBrowser>)=>{
    const entry=clients.get(args[0].sessionId);if(!entry)throw Error('SESSION');launchingLabel=entry.label;inventoryOwner=entry.label;
    const browser=await launchGuidedBrowser(...args);await sdkSetup.get(entry.label);entry.scratch=browser.scratchDirectory;entry.preferences=browser.preferenceEvidence;
    return {...browser,close:()=>{
      const original=()=>browser.close();
      const close=gateA&&entry.label==='A'?(gateEntered=true,events.push({kind:'close-gate',label:'A',at:performance.now()}),gateA.pending.then(original)):original();
      void close.then(()=>{live--;entry.closed=true;events.push({kind:'actual-close',label:entry.label,at:performance.now()});for(const restore of entry.closeRestores.splice(0).reverse())restore();entry.sdk=undefined;sdkSetup.delete(entry.label);},()=>{events.push({kind:'close-failed',label:entry.label,at:performance.now()});});return close;
    }};
  }};
  const path=(entry:Client)=>'/internal/v2/studio/guided-sessions/'+entry.context.sessionId;
  const refresh=(entry:Client):void=>{const notice=messages.filter(m=>m.label===entry.label&&m.route==='observations').at(-1)?.body as BridgeObservation|undefined;if(notice){entry.observation=notice.observation;entry.evidence={kind:'observedDocument',sessionId:entry.context.sessionId,contextId:entry.context.contextId,documentId:notice.observation.documentId,generation:notice.observation.generation,origin:notice.observation.origin,observationHash:hash(notice.observation)};}};
  async function startWorker(){worker=createGuidedServer(options);await new Promise<void>(r=>worker?.server.listen(0,'127.0.0.1',r));const at=worker.server.address();if(!at||typeof at==='string')throw Error('PORT');workerPort=at.port;}
  async function assign(entry:Client,key:string){return post(workerPort,path(entry)+'/assign',entry.assignment,{fence:null,key});}
  async function context(entry:Client){const reply=await post(workerPort,path(entry)+'/context',entry.context,{key:'context-'+String(entry.context.materializationRevision)});if(reply.status===200){const bootstrap=messages.find(m=>m.label===entry.label&&m.route==='bootstrap-evidence')?.body as BridgeBootstrap|undefined;if(bootstrap&&!entry.evidence)entry.evidence=bootstrap.executionEvidence;}return reply;}
  function target(entry:Client,name:string):Action['target']{const node=entry.observation?.nodes.find(n=>n.name===name&&n.locatorHints.length>0);if(!node?.locatorHints[0])throw Error('OBSERVED_TARGET');return {nodeId:node.nodeId,documentId:node.documentId,generation:node.generation,locator:node.locatorHints[0]};}
  async function act(entry:Client,step:string,operation:Action['operation'],target_?:Action['target'],secret?:string){
    if(!entry.evidence)throw Error('EVIDENCE');const p=proposal(entry.context,entry.evidence,step,operation,target_);
    const prepared=await post(workerPort,path(entry)+'/prepare',{...identity(entry.context),proposal:p,requestDigest:hash(p),expiresAt:entry.context.expiresAt},{key:'prepare-'+step});resultStatus(prepared,200);
    const request=dispatch(entry.context,p,validate<BridgePreparation>('bridge',prepared.body,'preparation'));
    if(operation.kind==='fill'&&operation.value.kind==='binding'){
      const producer=entry.producer;if(!producer)throw Error('PRODUCER');request.consumerEdges=[{bindingId:producer.bindingId,producerAdmissionId:producer.producerAdmissionId,consumerAdmissionId:request.ledger.admission.admissionId,coordinate:p.coordinate,argumentSlot:'fill.value',destinationOrigin:producer.origin,transferPolicy:'sameOrigin'}];
    }
    const frame=secret===undefined?request:{...request,secret:{secretId:'PASS',value:secret,versionId:'fixture-version',allowedOrigins:[S.origin]}};
    let response:Awaited<ReturnType<typeof post>>;try{response=await post(workerPort,path(entry)+'/dispatch',frame,{key:'dispatch-'+step});}finally{if('secret' in frame)delete (frame as {secret?:unknown}).secret;}
    resultStatus(response,200);const result=validate<BridgeOutcome>('bridge',response.body,'outcome');expect(result.ledger.state).toBe('SUCCEEDED');refresh(entry);return {result,request,p};
  }
  async function login(entry:Client,secret:string){
    await act(entry,'login-nav',{kind:'navigate',destinationInputId:'input-login'});expect(entry.observation?.origin).toBe(S.origin);expect(entry.observation?.coverage.passwordControls).toBe(1);expect(entry.sdk?.deref()?.pages()[0]?.url()).toBe(S.origin+'/login');
    const observation=entry.observation;if(!observation)throw Error('OBSERVATION');await act(entry,'password-fill',{kind:'fill',value:{kind:'secretRef',sourceInputId:'input-pass'}},{kind:'passwordControl',documentId:observation.documentId,generation:observation.generation},secret);
    await act(entry,'login-submit',{kind:'click'},target(entry,'Sign in'));
  }
  async function stop(entry:Client){resultStatus(await post(workerPort,path(entry)+'/stop',{...identity(entry.context),reason:'CANCELLED'},{key:'stop'}),200);await untilMs(()=>entry.closed&&pids.filter(p=>p.label===entry.label).every(p=>!isAlive(p.pid)),5000);expect(entry.scratch===undefined?false:!existsSync(entry.scratch)).toBe(true);}
  async function unusedPreparation(entry:Client){
    if(!entry.evidence)throw Error('EVIDENCE');const p=proposal(entry.context,entry.evidence,'reports',{kind:'navigate',destinationInputId:'input-reports'});p.coordinate.ordinal=1;
    resultStatus(await post(workerPort,path(entry)+'/prepare',{...identity(entry.context),proposal:p,requestDigest:hash(p),expiresAt:entry.context.expiresAt},{key:'unused-reports-preparation'}),200);
  }
  async function scans(){
    for(const value of [A,B])for(const variant of [value,encodeURIComponent(value),Buffer.from(value).toString('base64')])expect(JSON.stringify(messages).includes(variant)).toBe(false);
    expect(await canaryScan(directory)).toBe(0);for(const entry of clients.values())if(entry.scratch&&existsSync(entry.scratch))expect(await canaryScan(entry.scratch)).toBe(0);
  }
  async function close(){
    gateA?.release();try{await worker?.close();}finally{
      for(const entry of clients.values()){for(const restore of entry.closeRestores.splice(0).reverse())restore();entry.sdk=undefined;}
      for(const restore of restores.splice(0).reverse())restore();callbacks.closeAllConnections();await new Promise<void>(r=>callbacks.close(()=>{r();}));await F.close();await S.close();clients.clear();sdkSetup.clear();await rm(directory,{recursive:true,force:true});
    }
  }
  async function record(name:string){await writeFile(resolve('../docs/qa/evidence/STUDIO-OBS-007/runner-isolation-three-candidate/'+name+'.json'),JSON.stringify({name,events,claims,pids,launches:launchCount,maxLive,allObservedPidsGone:pids.every(p=>!isAlive(p.pid)),backendVaultScopeProved:false,physicalHeapErasureProved:false},null,2)+'\n');}
  return {F,S,events,messages,claims,pids,options,client,startWorker,assign,context,act,login,stop,unusedPreparation,target,refresh,scans,close,record,path,get port(){return workerPort;},get launches(){return launchCount;},get maxLive(){return maxLive;},holdClose(){gateA=gate();return gateA;},get gateEntered(){return gateEntered;}};
}

it('ISO1 rejects mounted capacity2 before worker TLS, claim, browser or secret effects',async()=>{
  const h=await harness();try{
    for(const name of ['DEBUG','PWDEBUG','NODE_DEBUG','NODE_OPTIONS'])expect(Boolean(process.env[name])).toBe(false);
    expect(tlsCounter.created).toBeGreaterThan(0);const before=tlsCounter.created;expect(()=>createGuidedServer({...h.options,capacity:2})).toThrow('CONFIGURATION_DENIED');
    expect(tlsCounter.created-before).toBe(0);expect(h.launches).toBe(0);expect(h.claims.length).toBe(0);expect(h.messages.length).toBe(0);expect(h.S.receipts().length).toBe(0);expect(h.F.sourceRequests()).toBe(0);await h.record('ISO1');
  }finally{await h.close();}
},45000);

it('ISO2 retains capacity1 through actual A close and writer quiescence before B',async()=>{
  const h=await harness();let closing:Promise<void>|undefined;try{
    await h.startWorker();const a=h.client('A','CSI-A',h.S.origin+'/login'),b=h.client('B','CSI-B',h.S.origin+'/login');resultStatus(await h.assign(a,'assign-A'),200);resultStatus(await h.context(a),200);await h.login(a,A);
    expect(a.nativeCount).toBe(1);expect(a.focusCount).toBe(1);expect(h.pids.some(p=>p.label==='A'&&isAlive(p.pid))).toBe(true);
    const denied=await h.assign(b,'assign-B');resultStatus(denied,409);expect(closedCode(denied.body)).toBe('CAPACITY');expect(h.claims.filter(c=>c.label==='B').length).toBe(0);expect(h.launches).toBe(1);expect(b.nativeCount).toBe(0);expect(b.scratch===undefined).toBe(true);
    const closeGate=h.holdClose();closing=h.stop(a);await untilMs(()=>h.gateEntered,3000);expect(h.events.some(e=>e.kind==='runtime'&&e.label==='A'&&e.stage==='after-sync-stop'&&e.accepting===false&&e.active===true)).toBe(true);
    expect(h.pids.some(p=>p.label==='A'&&isAlive(p.pid))).toBe(true);const stillDenied=await h.assign(b,'assign-B');resultStatus(stillDenied,409);expect(closedCode(stillDenied.body)).toBe('CAPACITY');expect(h.claims.filter(c=>c.label==='B').length).toBe(0);
    closeGate.release();await closing;closing=undefined;resultStatus(await h.assign(b,'assign-B'),200);resultStatus(await h.context(b),200);expect(h.maxLive).toBe(1);expect(h.launches).toBe(2);await h.stop(b);await h.scans();await h.record('ISO2');
  }finally{await h.close();if(closing)await closing.catch(()=>undefined);}
},45000);

it('ISO3 isolates fresh CSI-B PASS from genuine A producer, cookie, masking and profile state',async()=>{
  const h=await harness();try{
    await h.startWorker();const a=h.client('A','CSI-A',h.S.origin+'/login');resultStatus(await h.assign(a,'assign-A'),200);resultStatus(await h.context(a),200);await h.login(a,A);
    expect(h.S.receipts().length).toBe(1);expect(h.S.receipts()[0]?.accepted===true&&h.S.receipts()[0]?.password===A).toBe(true);
    expect((await a.sdk?.deref()?.cookies(h.S.origin))?.some(cookie=>cookie.name==='fixture_session')).toBe(true);
    await h.act(a,'nav',{kind:'navigate',destinationInputId:'input-nav'});expect(h.F.sourceRequests()).toBe(1);
    const recipe:Producer['recipe']={kind:'visibleText',classification:'permittedBusinessData',policyRuleId:'region-read'};
    const read=await h.act(a,'read',{kind:'read',bindingId:'binding-one',recipe},h.target(a,'Business reference'));expect(read.result.availability!==null).toBe(true);
    if(!read.result.availability||read.p.executionEvidence.kind!=='observedDocument')throw Error('PRODUCER');
    const producer:Producer={bindingId:'binding-one',producerAdmissionId:read.request.ledger.admission.admissionId,coordinate:read.p.coordinate,origin:read.p.executionEvidence.origin,recipe,availability:read.result.availability};a.producer=producer;a.context.producers=[producer];a.context.materializationRevision++;resultStatus(await h.context(a),200);
    await h.act(a,'next',{kind:'navigate',destinationInputId:'input-next'});const used=await h.act(a,'fill',{kind:'fill',value:{kind:'binding',bindingId:'binding-one'}},h.target(a,'Destination'));await h.act(a,'submit',{kind:'click'},h.target(a,'Submit'));
    await untilMs(()=>h.F.receipts.length===1,3000);expect(h.F.receipts[0]===publicReference).toBe(true);
    a.context.consumerEdges=used.request.consumerEdges as ConsumerEdge[];a.context.materializationRevision++;resultStatus(await h.context(a),200);
    await h.act(a,'reports',{kind:'navigate',destinationInputId:'input-reports'});expect(a.observation?.origin).toBe(h.S.origin);expect(a.observation?.coverage.passwordControls).toBe(0);expect(a.sdk?.deref()?.pages()[0]?.url()).toBe(h.S.origin+'/reports');
    const liveA=h.events.filter(e=>e.kind==='runtime'&&e.label==='A').at(-1);expect(liveA?.hasBinding).toBe(true);expect(liveA?.edges).toBe(1);
    await h.unusedPreparation(a);
    const profileA=a.scratch;if(!profileA||!a.preferences)throw Error('PROFILE');expect(a.preferences.effective).toEqual({credentialsEnableService:false,autofillProfileEnabled:false,autofillCreditCardEnabled:false,restoreOnStartup:5});expect(a.preferences.activeProfilePath).toBe(await realpath(join(profileA,'browser-profile','Default')));const profileInfoA=await stat(profileA);expect(profileInfoA.isDirectory()).toBe(true);await h.scans();await h.stop(a);
    const beforeStop=h.events.filter(e=>e.kind==='runtime'&&e.label==='A'&&e.stage==='before-stop').at(-1);expect(beforeStop?.values).toBe(1);expect(beforeStop?.secrets).toBe(1);expect(beforeStop?.prepared).toBe(1);expect(beforeStop?.edges).toBe(1);
    const cleared=h.events.filter(e=>e.kind==='runtime'&&e.label==='A'&&e.stage==='after-sync-stop').at(-1);expect(cleared?.values).toBe(0);expect(cleared?.secrets).toBe(0);expect(cleared?.prepared).toBe(0);expect(cleared?.evidenceAbsent).toBe(true);expect(cleared?.inputCount).toBe(0);expect(cleared?.producerCount).toBe(0);expect(cleared?.consumerCount).toBe(0);expect(cleared?.allocationCount).toBe(0);
    const closed=h.events.filter(e=>e.kind==='runtime'&&e.label==='A'&&e.stage==='settled-closeResources').at(-1);expect(closed?.dispatched).toBe(0);expect(closed?.ordinals).toBe(0);expect(closed?.edges).toBe(0);expect(closed?.browserAbsent).toBe(true);expect(closed?.launchAbsent).toBe(true);expect(closed?.journalAbsent).toBe(true);expect(closed?.diagnosticsAbsent).toBe(true);
    const disposedA=h.events.filter(e=>e.kind==='inventory'&&e.label==='A'&&e.stage==='after-dispose').at(-1);expect(disposedA?.size).toBe(0);expect(disposedA?.bytes).toBe(0);expect(disposedA?.disposed).toBe(true);expect(h.events.some(e=>e.kind==='disposed-snapshot'&&e.label==='A'&&e.refused===true)).toBe(true);
    h.S.rotate(B);const b=h.client('B','CSI-B',h.S.origin+'/reports');resultStatus(await h.assign(b,'assign-B'),200);resultStatus(await h.context(b),200);expect(b.context.scopeHash===a.context.scopeHash).toBe(false);expect(b.context.contextId===a.context.contextId).toBe(false);expect(b.scratch===profileA).toBe(false);expect((await b.sdk?.deref()?.cookies(h.S.origin))?.length).toBe(0);
    const freshRuntime=h.events.filter(e=>e.kind==='runtime'&&e.label==='B'&&e.stage==='settled-start').at(-1);expect(freshRuntime!==undefined).toBe(true);expect(freshRuntime?.hasBinding).toBe(false);expect(freshRuntime?.tag===liveA?.tag).toBe(false);
    const foreign={...b.context,materializationRevision:b.context.materializationRevision+1,producers:[producer]};resultStatus(await post(h.port,h.path(b)+'/context',foreign,{key:'foreign-producer'}),409);
    resultStatus(await post(h.port,h.path(b)+'/context',a.context,{key:'foreign-context'}),409);
    await h.login(b,B);expect(b.sdk?.deref()?.pages()[0]?.url()).toBe(h.S.origin+'/home');expect(h.S.receipts().length).toBe(2);expect(h.S.receipts()[1]?.accepted===true&&h.S.receipts()[1]?.password===B).toBe(true);expect(h.S.receipts()[0]?.id===h.S.receipts()[1]?.id).toBe(false);expect(b.nativeCount).toBe(1);expect(h.maxLive).toBe(1);
    const bInventory=h.events.filter(e=>e.kind==='inventory'&&e.label==='B');expect(bInventory.length>0).toBe(true);expect(bInventory.every(e=>e.containsA===false)).toBe(true);expect(bInventory.some(e=>e.containsB===true)).toBe(true);expect(bInventory.some(e=>e.tag===disposedA?.tag)).toBe(false);
    if(!b.scratch||!b.preferences)throw Error('PROFILE');expect(b.preferences.effective).toEqual({credentialsEnableService:false,autofillProfileEnabled:false,autofillCreditCardEnabled:false,restoreOnStartup:5});expect(b.preferences.activeProfilePath).toBe(await realpath(join(b.scratch,'browser-profile','Default')));await h.scans();await h.stop(b);await h.scans();
    await writeFile(resolve('../docs/qa/evidence/STUDIO-OBS-007/runner-isolation-three-candidate/ISO3.json'),JSON.stringify({scope:'actual-local-source-worker-isolation-only',events:h.events,claims:h.claims,pids:h.pids,scopeHashesDistinct:b.context.scopeHash!==a.context.scopeHash,actualAProducer:true,actualAConsumerReceipt:true,actualBInitialCookieCount:0,fixtureReceiptCount:h.S.receipts().length,allObservedPidsGone:h.pids.every(p=>!isAlive(p.pid)),backendVaultScopeProved:false,physicalHeapErasureProved:false},null,2)+'\n');
  }finally{await h.close();}
},90000);
