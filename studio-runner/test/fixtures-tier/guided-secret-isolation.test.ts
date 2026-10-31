import { stepOp } from '../helpers/stepCode.js';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
// eslint-disable-next-line no-restricted-imports -- Test-local original SDK delegation; no alternate browser or password primitive.
import {chromium,type BrowserContext} from 'playwright';
import {createServer} from 'node:https';
import type * as HttpsModule from 'node:https';
import {TLSSocket} from 'node:tls';
import {mkdtemp,readFile,readdir,writeFile,rm,stat,realpath} from 'node:fs/promises';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {expect,it,vi} from 'vitest';
import {createGuidedServer,guidedClaimClient,guidedCallback,verifyGuidedJwt} from '../../src/guided/transport.js';
import {GuidedRuntime} from '../../src/guided/runtime.js';
import {PrivateInventory} from '../../src/run/privateInventory.js';
import {launchGuidedBrowser} from '../../src/run/browser.js';
import {GuidedLaunchFailure} from '../../src/run/guidedBrowser.js';
import {descendantsOf,isAlive} from '../../src/run/tree.js';
import {hash,identity,validate} from '../../src/guided/contracts.js';
import type {Action,ExecutionEvidence,BridgeBootstrap,BridgeObservation,BridgeOrdinaryOutcome as BridgeOutcome,BridgePreparation,CommandsClaim,Producer,ConsumerEdge} from '../../src/guided/types.js';
import type {BrowserPreferenceEvidence} from '../../src/run/scratchLayout.js';
import {guidedContext,ownershipSession,assignmentFor,proposal,dispatch} from '../helpers/guided.js';
import {testTls,testFingerprint,jwtPolicy,jwt,post} from '../helpers/guidedTls.js';
import {startSecretLoginFixture} from '../fixtures/secret-login/server.js';
import {startGuidedDataflowFixture,canary as publicReference} from '../fixtures/guided-dataflow/visibleTextServer.js';
import {untilMs} from './realRunner.js';
import {evidencePath} from '../helpers/evidenceOut.js';

// Only the HTTPS factory counter is mocked, and the proxy delegates the real factory.
// No TLS options, private arguments, return objects or mock call/result records are stored.
const tlsCounter=vi.hoisted(()=>({created:0}));
vi.mock('node:https',async importOriginal=>{
  const actual=await importOriginal<typeof HttpsModule>();
  return {...actual,createServer:new Proxy(actual.createServer,{apply(target,receiver,args){tlsCounter.created++;return Reflect.apply(target,receiver,args) as ReturnType<typeof createServer>;}})};
});
const A='obs007-isolation-A-é:+/',B='obs007-isolation-B-ß &/';
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
function* encodings(value:string):Generator<readonly [string,Buffer]> {
  yield ['UTF8-NFC',Buffer.from(value.normalize('NFC'))];yield ['UTF8-NFD',Buffer.from(value.normalize('NFD'))];
  yield ['URI',Buffer.from(encodeURIComponent(value))];yield ['URI-TWICE',Buffer.from(encodeURIComponent(encodeURIComponent(value)))];
  yield ['UTF16-LE',Buffer.from(value,'utf16le')];yield ['UTF16-BE',Buffer.from(value,'utf16le').swap16()];
  yield ['HEX-LOWER',Buffer.from(Buffer.from(value).toString('hex'))];yield ['HEX-UPPER',Buffer.from(Buffer.from(value).toString('hex').toUpperCase())];
  yield ['BASE64',Buffer.from(Buffer.from(value).toString('base64'))];
  yield ['JSON-UNICODE',Buffer.from(value.replace(/[^\u0020-\u007e]/gu,character=>'\\u'+character.charCodeAt(0).toString(16).padStart(4,'0')))];
}
function byteHits(bytes:Uint8Array):number {
  let hits=0;for(const value of [A,B])for(const [,pattern] of encodings(value))if(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).includes(pattern))hits++;return hits;
}
/** Streaming prefix state is numeric only; no previous output chunk/tail is retained. */
function outputWitness(){
  const state:Record<string,number>={},counts:Record<string,number>={},observed:Record<string,number>={};
  function observe(sink:string,chunk:unknown,encoding?:unknown):void {
    const bytes=typeof chunk==='string'?Buffer.from(chunk,typeof encoding==='string'&&Buffer.isEncoding(encoding)?encoding:undefined):chunk instanceof Uint8Array?chunk:null;if(!bytes)return;observed[sink+'-calls']=(observed[sink+'-calls']??0)+1;observed[sink+'-bytes']=(observed[sink+'-bytes']??0)+bytes.byteLength;
    for(const [label,value] of [['A',A],['B',B]] as const)for(const [variant,pattern] of encodings(value)){
      const key=sink+'/'+label+'/'+variant;let matched=state[key]??0;
      for(const byte of bytes){
        while(matched>0&&byte!==pattern[matched]){let next=matched-1;while(next>0&&!pattern.subarray(0,next).equals(pattern.subarray(matched-next,matched)))next--;matched=next;}
        if(byte===pattern[matched])matched++;
        if(matched===pattern.length){counts[key]=(counts[key]??0)+1;matched=0;}
      }state[key]=matched;
    }
  }
  return {observe,counts,observed,hits:()=>Object.values(counts).reduce((total,n)=>total+n,0)};
}
const CLEANUP_MS=5000;
interface CleanupIssue {label:string;confirmed:boolean}
async function boundedRelease(label:string,release:()=>Promise<unknown>,deadline:number,issues:CleanupIssue[]):Promise<void>{
  let operation:Promise<unknown>;try{operation=release();}catch{issues.push({label,confirmed:false});return;}
  let timer:ReturnType<typeof setTimeout>|undefined;
  const confirmed=await Promise.race([operation.then(()=>true,()=>false),new Promise<boolean>(resolve=>{timer=setTimeout(()=>{resolve(false);},Math.max(0,deadline-performance.now()));})]);if(timer)clearTimeout(timer);issues.push({label,confirmed});
}
/** Failed capabilities stay in their list until a later restoration actually succeeds. */
function restoreMethods(list:(()=>void)[],label:string,issues:CleanupIssue[]):boolean {
  let confirmed=true;
  for(const restore of [...list].reverse())try{restore();const index=list.lastIndexOf(restore);if(index>=0)list.splice(index,1);}catch{issues.push({label,confirmed:false});confirmed=false;}
  return confirmed;
}
async function canaryScan(root:string):Promise<number>{
  let hits=0;for(const entry of await readdir(root,{withFileTypes:true})){
    const path=join(root,entry.name);if(entry.isDirectory())hits+=await canaryScan(path);
    else if(entry.isFile())try{hits+=byteHits(await readFile(path));}catch(error){if(!(error instanceof Error&&'code' in error&&error.code==='ENOENT'))throw error;}
  }return hits;
}
function canaryScanSync(root:string):number {
  let hits=0;for(const entry of readdirSync(root,{withFileTypes:true})){
    const path=join(root,entry.name);if(entry.isDirectory())hits+=canaryScanSync(path);
    else if(entry.isFile())try{hits+=byteHits(readFileSync(path));}catch(error){if(!(error instanceof Error&&'code' in error&&error.code==='ENOENT'))throw error;}
  }return hits;
}
function gate(){let release:(()=>void)|undefined;const pending=new Promise<void>(resolve=>{release=resolve;});return {pending,release(){release?.();}};}
function patchMethod(holder:object,key:string,observer:(receiver:object,args:unknown[],invoke:()=>unknown)=>unknown):()=>void{
  const own=Object.getOwnPropertyDescriptor(holder,key),original=Reflect.get(holder,key) as (...args:unknown[])=>unknown;
  if(typeof original!=='function')throw Error('METHOD');
  Object.defineProperty(holder,key,{configurable:true,writable:true,value:new Proxy(original,{apply(target,receiver,args){return observer(receiver as object,args,()=>Reflect.apply(target,receiver,args));}})});
  return ()=>{if(own)Object.defineProperty(holder,key,own);else if(!Reflect.deleteProperty(holder,key))throw Error('DESCRIPTOR_RESTORE_UNCONFIRMED');};
}
async function harness(){
  const acquired:{label:string;release:()=>Promise<unknown>}[]=[],constructionIssues:CleanupIssue[]=[],cleanupIssues:CleanupIssue[]=[],restores:(()=>void)[]=[];
  try {
  const F=await startGuidedDataflowFixture('regionVisible');acquired.push({label:'F',release:F.close});
  const S=await startSecretLoginFixture(A);acquired.push({label:'S',release:S.close});
  const directory=await mkdtemp(join(tmpdir(),'guided-isolation-'));acquired.push({label:'journal-directory',release:()=>rm(directory,{recursive:true,force:true})});
  const clients=new Map<string,Client>(),events:Event[]=[],messages:{label:string;route:string;body:unknown}[]=[],claims:{label:string;at:number}[]=[],pids:{label:string;pid:number}[]=[];
  const tags=new WeakMap<object,string>(),sdkSetup=new Map<string,Promise<void>>();let nextTag=0,launchingLabel='NONE',worker:ReturnType<typeof createGuidedServer>|undefined,workerPort=0,launchCount=0,maxLive=0,live=0,gateA:ReturnType<typeof gate>|undefined,gateEntered=false,inventoryOwner='NONE';
  const output=outputWitness();let cleanupDone=false;
  const restoreAll=():boolean=>{
    const confirmed=restoreMethods(restores,'descriptor',cleanupIssues);
    for(const entry of clients.values())delete entry.sdk;sdkSetup.clear();return confirmed;
  };
  acquired.push({label:'descriptors',release:()=>restoreAll()?Promise.resolve():Promise.reject(Error('DESCRIPTOR_RESTORE_UNCONFIRMED'))});
  for(const [sink,stream] of [['stdout',process.stdout],['stderr',process.stderr]] as const)restores.push(patchMethod(stream,'write',(_receiver,args,invoke)=>{output.observe(sink,args[0],args[1]);return invoke();}));
  const scanOwnedRoot=(root:string,label:string,phase:string,required=false):void=>{
    if(!existsSync(root)){events.push({kind:'owned-root-scan',label,phase,scanned:false,status:'UNAVAILABLE_UNSCANNED',hits:null,at:performance.now()});if(required)cleanupIssues.push({label:'required-root-unscanned',confirmed:false});return;}
    try{const hits=canaryScanSync(root);events.push({kind:'owned-root-scan',label,phase,scanned:true,status:'SCANNED',hits,at:performance.now()});if(hits>0)cleanupIssues.push({label:'profile-or-journal-canary',confirmed:false});}
    catch{events.push({kind:'owned-root-scan',label,phase,scanned:false,status:'UNAVAILABLE_UNSCANNED',hits:null,at:performance.now()});cleanupIssues.push({label:'owned-root-scan',confirmed:false});}
  };
  const scanExtant=():void=>{
    const callbackHits=byteHits(Buffer.from(JSON.stringify(messages)));events.push({kind:'cleanup-callback-scan',hits:callbackHits,at:performance.now()});if(callbackHits>0)cleanupIssues.push({label:'callback-canary',confirmed:false});
    scanOwnedRoot(directory,'JOURNAL','cleanup');for(const entry of clients.values())if(entry.scratch)scanOwnedRoot(entry.scratch,entry.label,'cleanup');
  };
  const tag=(object:object):string=>{let value=tags.get(object);if(!value){value='opaque-'+String(++nextTag);tags.set(object,value);}return value;};
  const owner=(runtime:GuidedRuntime):string=>clients.get(runtime.currentIdentity.sessionId)?.label??'NONE';
  const inventoryOwners=new WeakMap<object,string>();
  const inventoryRecord=(receiver:object,stage:string):void=>{
    const data=inventoryView(receiver);let label=inventoryOwners.get(receiver);if(!label){label=inventoryOwner;inventoryOwners.set(receiver,label);}
    events.push({kind:'inventory',stage,label,tag:tag(receiver),at:performance.now(),size:data.values.size,bytes:data.bytes,disposed:data.disposed,failed:data.failed,containsA:data.values.has(A),containsB:data.values.has(B)});
  };
  const originalSnapshot=Object.getOwnPropertyDescriptor(PrivateInventory.prototype,'snapshot')?.value as (...args:unknown[])=>unknown;
  if(typeof originalSnapshot!=='function')throw Error('SNAPSHOT_METHOD');
  // The WI-2 inventory keeps its state private: its entries and byte count are read through the public snapshot(), a latched inventory (failed or disposed) reads as empty and disposed.
  const inventoryView=(receiver:object):InventoryView=>{try{const entries=Reflect.apply(originalSnapshot,receiver,[]) as [string,boolean][];return {values:new Map(entries),bytes:entries.reduce((sum,[value])=>sum+Buffer.byteLength(value),0),failed:false,disposed:false};}catch{return {values:new Map(),bytes:0,failed:false,disposed:true};}};
  for(const method of ['merge','withhold','snapshot','dispose'])restores.push(patchMethod(PrivateInventory.prototype,method,(receiver,_args,invoke)=>{
    const stage=method==='withhold'?'merge':method;inventoryRecord(receiver,'before-'+stage);const returned=invoke();inventoryRecord(receiver,'after-'+stage);
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
  for(const method of ['start','prepare','update','stop','closeResources','dispatch'])restores.push(patchMethod(GuidedRuntime.prototype,method,(receiver,_args,invoke)=>{
    runtimeRecord(receiver,'before-'+method);let returned:unknown;try{returned=invoke();}catch(error){runtimeRecord(receiver,'threw-'+method);throw error;}runtimeRecord(receiver,'after-sync-'+method);
    if(returned instanceof Promise)void returned.then(()=>{runtimeRecord(receiver,'settled-'+method);},()=>{runtimeRecord(receiver,'rejected-'+method);});
    return returned; // original promise/errors; no replacement promise, value snapshot or mock archive.
  }));
  restores.push(patchMethod(chromium,'launchPersistentContext',(_receiver,args,invoke)=>{
    const label=launchingLabel,launchScratch=typeof args[0]==='string'&&basename(args[0])==='browser-profile'?dirname(args[0]):null,before=descendantsOf(process.pid);
    const launchClient=[...clients.values()].find(c=>c.label===label);if(launchClient&&launchScratch)launchClient.scratch=launchScratch;
    let returned:Promise<BrowserContext>;try{returned=invoke() as Promise<BrowserContext>;}catch(original){if(launchScratch)scanOwnedRoot(launchScratch,label,'sdk-synchronous-rejection',true);throw original;}
    const setup=returned.then(async context=>{
      const client=[...clients.values()].find(c=>c.label===label);if(!client||cleanupDone){await boundedRelease('late-SDK-context',()=>context.close(),performance.now()+CLEANUP_MS,cleanupIssues);throw Error('CLIENT');}client.sdk=new WeakRef(context);restores.push(()=>{if(!restoreMethods(client.closeRestores,'SDK-descriptor',cleanupIssues))throw Error('SDK_DESCRIPTOR_RESTORE_UNCONFIRMED');});launchCount++;live++;maxLive=Math.max(maxLive,live);
      for(const pid of descendantsOf(process.pid))if(!before.includes(pid))pids.push({label,pid});
      try {
      await context.exposeBinding('__obs007IsolationFocus',()=>{client.focusCount++;events.push({kind:'focus',label,at:performance.now(),nativePending:client.nativePending});});
      await context.addInitScript(()=>{document.addEventListener('focus',event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='password')(window as unknown as {__obs007IsolationFocus:()=>void}).__obs007IsolationFocus();},true);});
      client.closeRestores.push(patchMethod(context,'newCDPSession',(_r,_a,open)=>{
        const opened=open() as Promise<object>;void opened.then(session=>{
          if(cleanupDone||client.closed)return;
          client.closeRestores.push(patchMethod(session,'send',(_s,arguments_,send)=>{
            const result=send() as Promise<unknown>,parameters=arguments_[1] as {functionDeclaration?:unknown}|undefined;
            if(arguments_[0]==='Runtime.callFunctionOn'&&typeof parameters?.functionDeclaration==='string'){
              const functionText=parameters.functionDeclaration;
              if(functionText.includes('this.fillPasswordResult')){client.nativeCount++;client.nativePending++;events.push({kind:'native-entry',label,at:performance.now(),count:client.nativeCount});void result.then(()=>{client.nativePending--;events.push({kind:'native-end',label,at:performance.now()});},()=>{client.nativePending--;events.push({kind:'native-end',label,at:performance.now()});});}
              if(functionText==='function() { this.dispose(); }')void result.then(reply=>{const exception=typeof reply==='object'&&reply!==null&&'exceptionDetails' in reply&&reply.exceptionDetails!==undefined;events.push({kind:exception?'renderer-dispose-exception':'renderer-dispose-ack',label,at:performance.now()});},()=>{events.push({kind:'renderer-dispose-unavailable',label,at:performance.now()});});
            }
            return result;
          }));
        },()=>{events.push({kind:'CDP-open-failed',label,at:performance.now()});});return opened;
      }));
      }catch(original){
        scanExtant();await boundedRelease('SDK-setup-context',()=>context.close(),performance.now()+CLEANUP_MS,cleanupIssues);
        restoreMethods(client.closeRestores,'SDK-setup-descriptor',cleanupIssues);delete client.sdk;throw original;
      }
    },(original:unknown)=>{if(launchScratch)scanOwnedRoot(launchScratch,label,'sdk-promise-rejection-before-production-disposal',true);throw original;});sdkSetup.set(label,setup);void setup.catch(()=>{events.push({kind:'sdk-setup-failed',label,at:performance.now()});});
    // SDK launch is not replaced: its original promise is returned unchanged.
    void args;return returned;
  }));
  function client(label:string,csiId:string,initial:string):Client{
    // The read profile is the runner's constant, derived from the approved origins of each session's context.
    const context=guidedContext(F.origin);context.sourceStepIds=['login-nav','password-fill','login-submit','nav','read','next','fill','submit','reports'];
    for(let i=0;i<65;i++)context.authoredInputs.inputs.push({inputId:`private-${String(i)}`,sourceStepId:'fill',kind:'nonsecretText',value:`PRIVATE-INPUT-${String(i).padStart(3,'0')}`,provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:'fill',referenceId:`saved-${String(i)}`,kind:'nonsecretText'}});
    for(const [id,step,value] of [['input-login','login-nav',initial],['input-reports','reports',S.origin+'/reports']] as const)context.authoredInputs.inputs.push({inputId:id,sourceStepId:step,kind:'destination',value,provenance:{referenceKind:'sourceSpan',sourceRevision:context.sourceRevision,stepId:step,startUtf16:0,endUtf16:12,kind:'destination'}});
    context.authoredInputs.inputs.push({inputId:'input-pass',sourceStepId:'password-fill',kind:'secretRef',secretId:'PASS',provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:'password-fill',referenceId:'reference-pass',referenceName:'PASS',kind:'secretRef'}});
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
  acquired.push({label:'callback-server',release:()=>{callbacks.closeAllConnections();return new Promise<void>((resolve,reject)=>callbacks.close(error=>{if(error)reject(error);else resolve();}));}});
  await new Promise<void>(r=>callbacks.listen(0,'127.0.0.1',r));const address=callbacks.address();if(!address||typeof address==='string')throw Error('PORT');
  const callbackOptions={baseUrl:'https://127.0.0.1:'+String(address.port),tls:testTls,controllerCertificateFingerprint256:testFingerprint,token:()=>Promise.resolve(jwt({aud:'studio-guided-controller',role:'owning-worker',sub:'worker-one'}))};
  const options:Parameters<typeof createGuidedServer>[0]={workerId:'worker-one',capacity:1,allowedDomains:TEST_DOMAINS,journalDirectory:directory,tls:testTls,controllerJwt:jwtPolicy,controllerCertificateFingerprint256:testFingerprint,claim:guidedClaimClient(callbackOptions),callback:guidedCallback(callbackOptions),diagnosticStderr:text=>{output.observe('diagnostic',text);process.stderr.write(text);},launch:async(...args:Parameters<typeof launchGuidedBrowser>)=>{
    const entry=clients.get(args[0].sessionId);if(!entry)throw Error('SESSION');launchingLabel=entry.label;inventoryOwner=entry.label;
    let browser:Awaited<ReturnType<typeof launchGuidedBrowser>>;
    try{browser=await launchGuidedBrowser(...args);}catch(original){
      scanExtant();const deadline=performance.now()+CLEANUP_MS;const context=entry.sdk?.deref();if(context)await boundedRelease('launch-SDK-context',()=>context.close(),deadline,cleanupIssues);if(original instanceof GuidedLaunchFailure)await boundedRelease('launch-owned-scratch',original.close,deadline,cleanupIssues);
      restoreMethods(entry.closeRestores,'launch-descriptor',cleanupIssues);delete entry.sdk;sdkSetup.delete(entry.label);throw original;
    }
    try{await sdkSetup.get(entry.label);if(!browser.scratchDirectory||!browser.preferenceEvidence)throw Error('PROFILE');entry.scratch=browser.scratchDirectory;entry.preferences=browser.preferenceEvidence;}
    catch(error){const deadline=performance.now()+CLEANUP_MS;scanExtant();await boundedRelease('setup-browser-close',()=>browser.close(),deadline,cleanupIssues);restoreMethods(entry.closeRestores,'setup-descriptor',cleanupIssues);delete entry.sdk;sdkSetup.delete(entry.label);throw error;}
    return {...browser,close:()=>{
      const original=()=>{scanExtant();return browser.close();};
      const close=gateA&&entry.label==='A'?(gateEntered=true,events.push({kind:'close-gate',label:'A',at:performance.now()}),gateA.pending.then(original)):original();
      void close.then(()=>{live--;entry.closed=true;events.push({kind:'actual-close',label:entry.label,at:performance.now()});restoreMethods(entry.closeRestores,'closed-SDK-descriptor',cleanupIssues);delete entry.sdk;sdkSetup.delete(entry.label);},()=>{events.push({kind:'close-failed',label:entry.label,at:performance.now()});});return close;
    }};
  }};
  const path=(entry:Client)=>'/internal/v2/studio/guided-sessions/'+entry.context.sessionId;
  const refresh=(entry:Client):void=>{const notice=messages.filter(m=>m.label===entry.label&&m.route==='observations').at(-1)?.body as BridgeObservation|undefined;if(notice){entry.observation=notice.observation;entry.evidence={kind:'observedDocument',sessionId:entry.context.sessionId,contextId:entry.context.contextId,documentId:notice.observation.documentId,generation:notice.observation.generation,origin:notice.observation.origin,observationHash:hash(notice.observation)};}};
  async function startWorker(){worker=createGuidedServer(options);await new Promise<void>(r=>worker?.server.listen(0,'127.0.0.1',r));const at=worker.server.address();if(!at||typeof at==='string')throw Error('PORT');workerPort=at.port;}
  async function assign(entry:Client,key:string){return post(workerPort,path(entry)+'/assign',entry.assignment,{fence:null,key});}
  async function context(entry:Client){const reply=await post(workerPort,path(entry)+'/context',entry.context,{key:'context-'+String(entry.context.materializationRevision)});if(reply.status===200){const bootstrap=messages.find(m=>m.label===entry.label&&m.route==='bootstrap-evidence')?.body as BridgeBootstrap|undefined;if(bootstrap&&!entry.evidence)entry.evidence=bootstrap.executionEvidence;}return reply;}
  async function act(entry:Client,step:string,operation:Action['operation'],secret?:string){
    if(!entry.evidence)throw Error('EVIDENCE');const p=proposal(entry.context,entry.evidence,step,operation);
    const prepared=await post(workerPort,path(entry)+'/prepare',{...identity(entry.context),proposal:p,requestDigest:hash(p),expiresAt:entry.context.expiresAt},{key:'prepare-'+step});resultStatus(prepared,200);
    const request=dispatch(entry.context,p,validate<BridgePreparation>('bridge',prepared.body,'preparation'));
    if(operation.uses.some(use=>use.kind==='binding')){
      const producer=entry.producer;if(!producer)throw Error('PRODUCER');request.consumerEdges=[{bindingId:producer.bindingId,producerAdmissionId:producer.producerAdmissionId,consumerAdmissionId:request.ledger.admission.admissionId,coordinate:p.coordinate,destinationOrigin:producer.origin,transferPolicy:'sameOrigin'}];
    }
    const frame=secret===undefined?request:{...request,secrets:[{secretId:'PASS',value:secret,versionId:'fixture-version',allowedOrigins:[S.origin]}]};
    let response:Awaited<ReturnType<typeof post>>;try{response=await post(workerPort,path(entry)+'/dispatch',frame,{key:'dispatch-'+step});}finally{if('secrets' in frame)frame.secrets.forEach(entry_=>{(entry_ as {value:string}).value='';});}
    resultStatus(response,200);const result=validate<BridgeOutcome>('bridge',response.body,'outcome');expect(result.ledger.state).toBe('SUCCEEDED');refresh(entry);return {result,request,p};
  }
  async function login(entry:Client,secret:string,afterFill?:()=>void){
    await act(entry,'login-nav',stepOp('await page.goto(inputs["input-login"]);', { uses: [{ kind: 'input', id: 'input-login' }] }));expect(entry.observation?.origin).toBe(S.origin);expect(entry.observation?.coverage.passwordControls).toBe(1);expect(entry.sdk?.deref()?.pages()[0]?.url()).toBe(S.origin+'/login');
    const observation=entry.observation;if(!observation)throw Error('OBSERVATION');void observation;await act(entry,'password-fill',stepOp('await page.locator(\'input[type="password"]\').fill(secrets["PASS"]);',{uses:[{kind:'secret',id:'PASS'}]}),secret);afterFill?.();
    await act(entry,'login-submit',stepOp('await page.getByRole("button", { name: "Sign in", exact: true }).click();'));
  }
  async function stop(entry:Client){await scans();resultStatus(await post(workerPort,path(entry)+'/stop',{...identity(entry.context),reason:'CANCELLED'},{key:'stop'}),200);await untilMs(()=>entry.closed&&pids.filter(p=>p.label===entry.label).every(p=>!isAlive(p.pid)),5000);expect(entry.scratch===undefined?false:!existsSync(entry.scratch)).toBe(true);}
  async function unusedPreparation(entry:Client){
    if(!entry.evidence)throw Error('EVIDENCE');const p=proposal(entry.context,entry.evidence,'reports',stepOp('await page.goto(inputs["input-reports"]);', { uses: [{ kind: 'input', id: 'input-reports' }] }));p.coordinate.ordinal=1;
    resultStatus(await post(workerPort,path(entry)+'/prepare',{...identity(entry.context),proposal:p,requestDigest:hash(p),expiresAt:entry.context.expiresAt},{key:'unused-reports-preparation'}),200);
  }
  async function scans(){
    expect(byteHits(Buffer.from(JSON.stringify(messages)))).toBe(0);expect(output.hits()).toBe(0);
    expect(await canaryScan(directory)).toBe(0);for(const entry of clients.values())if(entry.scratch&&existsSync(entry.scratch))expect(await canaryScan(entry.scratch)).toBe(0);
  }
  async function record(name:string,primaryFailure=false){
    const serialized=JSON.stringify({name,primaryFailure,events,claims,pids,outputHits:output.counts,outputObserved:output.observed,cleanupIssues,pendingDescriptorRestorations:restores.length,launches:launchCount,maxLive,allObservedPidsGone:pids.every(p=>!isAlive(p.pid)),backendVaultScopeProved:false,physicalHeapErasureProved:false},null,2)+'\n';
    expect(byteHits(Buffer.from(serialized))).toBe(0);await writeFile(evidencePath('STUDIO-OBS-007/runner-isolation-source-repair/'+name+'.json'),serialized);
  }
  async function close(name:string,primaryFailure:boolean,pendingStop?:Promise<void>){
    if(cleanupDone)return;cleanupDone=true;gateA?.release();const deadline=performance.now()+CLEANUP_MS;scanExtant();
    try{if(worker){const current=worker;await boundedRelease('worker',()=>current.close(),deadline,cleanupIssues);}}
    finally{
      worker=undefined;
      if(pendingStop)await boundedRelease('pending-stop',()=>pendingStop,deadline,cleanupIssues);
      for(const entry of clients.values())if(!entry.closed){const context=entry.sdk?.deref();if(context)await boundedRelease('SDK-context',()=>context.close(),deadline,cleanupIssues);}
      scanExtant();if(output.hits()>0)cleanupIssues.push({label:'output-canary',confirmed:false});
      for(const item of [...acquired].reverse()){
        if(item.label==='journal-directory'&&pids.some(p=>isAlive(p.pid))){cleanupIssues.push({label:'directory-retained-live-writers',confirmed:false});continue;}
        await boundedRelease(item.label,item.release,deadline,cleanupIssues);
      }
      restoreAll();clients.clear();acquired.length=0;
      await boundedRelease('cleanup-evidence',()=>record(name+'-cleanup',primaryFailure),deadline,cleanupIssues);
    }
    if(!primaryFailure&&cleanupIssues.some(issue=>!issue.confirmed))throw Error('ISOLATION_CLEANUP_UNCONFIRMED');
  }
  return {F,S,events,messages,claims,pids,options,client,startWorker,assign,context,act,login,stop,unusedPreparation,refresh,scans,close,record,path,get port(){return workerPort;},get launches(){return launchCount;},get maxLive(){return maxLive;},holdClose(){gateA=gate();return gateA;},get gateEntered(){return gateEntered;}};
  }catch(original){
    const deadline=performance.now()+CLEANUP_MS;for(const item of acquired.reverse())await boundedRelease(item.label,item.release,deadline,constructionIssues);acquired.length=0;
    if(restores.length>0)await boundedRelease('descriptor-retry',()=>restoreMethods(restores,'constructor-descriptor-retry',cleanupIssues)?Promise.resolve():Promise.reject(Error('DESCRIPTOR_RESTORE_UNCONFIRMED')),deadline,constructionIssues);
    const serialized=JSON.stringify({constructionFailed:true,releaseIssues:constructionIssues,descriptorAndScanIssues:cleanupIssues,pendingDescriptorRestorations:restores.length,unresolved:restores.length>0||constructionIssues.some(issue=>!issue.confirmed)||cleanupIssues.some(issue=>!issue.confirmed),nativeQuiescenceProved:false})+'\n';
    if(byteHits(Buffer.from(serialized))===0)await boundedRelease('construction-evidence',()=>writeFile(evidencePath('STUDIO-OBS-007/runner-isolation-source-repair/construction-cleanup.json'),serialized),deadline,constructionIssues);throw original;
  }
}

it('ISO1 accepts a configured capacity above one, and constructing it has no claim, browser or secret effect',async()=>{
  const h=await harness();let failed=false;try{
    for(const name of ['DEBUG','PWDEBUG','NODE_DEBUG','NODE_OPTIONS'])expect(Boolean(process.env[name])).toBe(false);
    const app=createGuidedServer({...h.options,capacity:2});
    expect(app.server.listening).toBe(false);await app.close().catch(()=>undefined);
    expect(h.launches).toBe(0);expect(h.claims.length).toBe(0);expect(h.messages.length).toBe(0);expect(h.S.receipts().length).toBe(0);expect(h.F.sourceRequests()).toBe(0);await h.record('ISO1');
  }catch(error){failed=true;throw error;}finally{await h.close('ISO1',failed);}
},45000);

it('ISO2 retains capacity1 through actual A close and writer quiescence before B',async()=>{
  const h=await harness();let closing:Promise<void>|undefined,failed=false;try{
    await h.startWorker();const a=h.client('A','CSI-A',h.S.origin+'/login'),b=h.client('B','CSI-B',h.S.origin+'/login');resultStatus(await h.assign(a,'assign-A'),200);resultStatus(await h.context(a),200);await h.login(a,A);
    expect(a.nativeCount).toBe(1);expect(a.focusCount).toBe(1);expect(h.pids.some(p=>p.label==='A'&&isAlive(p.pid))).toBe(true);
    const denied=await h.assign(b,'assign-B');resultStatus(denied,409);expect(closedCode(denied.body)).toBe('CAPACITY');expect(h.claims.filter(c=>c.label==='B').length).toBe(0);expect(h.launches).toBe(1);expect(b.nativeCount).toBe(0);expect(b.scratch===undefined).toBe(true);
    const closeGate=h.holdClose();closing=h.stop(a);await untilMs(()=>h.gateEntered,3000);expect(h.events.some(e=>e.kind==='runtime'&&e.label==='A'&&e.stage==='after-sync-stop'&&e.accepting===false&&e.active===true)).toBe(true);
    expect(h.pids.some(p=>p.label==='A'&&isAlive(p.pid))).toBe(true);const stillDenied=await h.assign(b,'assign-B');resultStatus(stillDenied,409);expect(closedCode(stillDenied.body)).toBe('CAPACITY');expect(h.claims.filter(c=>c.label==='B').length).toBe(0);
    closeGate.release();await closing;closing=undefined;resultStatus(await h.assign(b,'assign-B'),200);resultStatus(await h.context(b),200);expect(h.maxLive).toBe(1);expect(h.launches).toBe(2);await h.stop(b);await h.scans();await h.record('ISO2');
  }catch(error){failed=true;throw error;}finally{await h.close('ISO2',failed,closing);}
},45000);

it('ISO3 isolates fresh CSI-B PASS from genuine A producer, cookie, masking and profile state',async()=>{
  const h=await harness();let failed=false;try{
    await h.startWorker();const a=h.client('A','CSI-A',h.S.origin+'/login');resultStatus(await h.assign(a,'assign-A'),200);resultStatus(await h.context(a),200);await h.login(a,A);
    expect(h.S.receipts().length).toBe(1);expect(h.S.receipts()[0]?.accepted===true&&h.S.receipts()[0]?.password===A).toBe(true);
    expect((await a.sdk?.deref()?.cookies(h.S.origin))?.some(cookie=>cookie.name==='fixture_session')).toBe(true);
    await h.act(a,'nav',stepOp('await page.goto(inputs["input-nav"]);', { uses: [{ kind: 'input', id: 'input-nav' }] }));expect(h.F.sourceRequests()).toBe(1);
    const read=await h.act(a,'read',stepOp('vars["binding-one"] = await page.getByText(/OBS-private/).innerText();',{captures:['binding-one']}));expect(read.result.availability.length>0).toBe(true);
    if(read.result.availability.length===0||read.p.executionEvidence.kind!=='observedDocument')throw Error('PRODUCER');
    const producer:Producer={bindingId:'binding-one',producerAdmissionId:read.request.ledger.admission.admissionId,coordinate:read.p.coordinate,origin:read.p.executionEvidence.origin,availability:(()=>{const first=read.result.availability[0];if(!first)throw new Error('AVAILABILITY');return first;})()};a.producer=producer;a.context.producers=[producer];a.context.materializationRevision++;resultStatus(await h.context(a),200);
    await h.act(a,'next',stepOp('await page.goto(inputs["input-next"]);', { uses: [{ kind: 'input', id: 'input-next' }] }));const used=await h.act(a,'fill',stepOp('await page.getByRole("textbox", { name: "Destination" }).fill(vars["binding-one"]);',{uses:[{kind:'binding',id:'binding-one'}]}));await h.act(a,'submit',stepOp('await page.getByRole("button", { name: "Submit" }).click();'));
    await untilMs(()=>h.F.receipts.length===1,3000);expect(h.F.receipts[0]===publicReference).toBe(true);
    a.context.consumerEdges=used.request.consumerEdges as ConsumerEdge[];a.context.materializationRevision++;resultStatus(await h.context(a),200);
    await h.act(a,'reports',stepOp('await page.goto(inputs["input-reports"]);', { uses: [{ kind: 'input', id: 'input-reports' }] }));expect(a.observation?.origin).toBe(h.S.origin);expect(a.observation?.coverage.passwordControls).toBe(0);expect(a.sdk?.deref()?.pages()[0]?.url()).toBe(h.S.origin+'/reports');
    const liveA=h.events.filter(e=>e.kind==='runtime'&&e.label==='A').at(-1);expect(liveA?.hasBinding).toBe(true);expect(liveA?.edges).toBe(1);
    await h.unusedPreparation(a);
    const maskedA=h.events.filter(e=>e.kind==='inventory'&&e.label==='A'&&e.stage==='after-merge').at(-1);expect(maskedA!==undefined).toBe(true);expect(maskedA?.containsA).toBe(true);expect(Number(maskedA?.size)).toBeGreaterThan(0);expect(Number(maskedA?.bytes)).toBeGreaterThan(0);
    const profileA=a.scratch;if(!profileA||!a.preferences)throw Error('PROFILE');expect(a.preferences.effective).toEqual({credentialsEnableService:false,autofillProfileEnabled:false,autofillCreditCardEnabled:false,restoreOnStartup:5});expect(a.preferences.activeProfilePath).toBe(await realpath(join(profileA,'browser-profile','Default')));const profileInfoA=await stat(profileA);expect(profileInfoA.isDirectory()).toBe(true);await h.scans();await h.stop(a);
    const beforeStop=h.events.filter(e=>e.kind==='runtime'&&e.label==='A'&&e.stage==='before-stop').at(-1);expect(beforeStop?.values).toBe(1);expect(beforeStop?.secrets).toBe(1);expect(beforeStop?.prepared).toBe(1);expect(beforeStop?.edges).toBe(1);
    const cleared=h.events.filter(e=>e.kind==='runtime'&&e.label==='A'&&e.stage==='after-sync-stop').at(-1);expect(cleared?.values).toBe(0);expect(cleared?.secrets).toBe(0);expect(cleared?.prepared).toBe(0);expect(cleared?.evidenceAbsent).toBe(true);expect(cleared?.inputCount).toBe(0);expect(cleared?.producerCount).toBe(0);expect(cleared?.consumerCount).toBe(0);expect(cleared?.allocationCount).toBe(0);
    const closed=h.events.filter(e=>e.kind==='runtime'&&e.label==='A'&&e.stage==='settled-closeResources').at(-1);expect(closed?.dispatched).toBe(0);expect(closed?.ordinals).toBe(0);expect(closed?.edges).toBe(0);expect(closed?.browserAbsent).toBe(true);expect(closed?.launchAbsent).toBe(true);expect(closed?.journalAbsent).toBe(true);expect(closed?.diagnosticsAbsent).toBe(true);
    const disposedA=h.events.filter(e=>e.kind==='inventory'&&e.label==='A'&&e.stage==='after-dispose').at(-1);expect(disposedA?.tag).toBe(maskedA?.tag);expect(disposedA?.size).toBe(0);expect(disposedA?.bytes).toBe(0);expect(disposedA?.disposed).toBe(true);expect(h.events.some(e=>e.kind==='disposed-snapshot'&&e.label==='A'&&e.refused===true)).toBe(true);
    h.S.rotate(B);const b=h.client('B','CSI-B',h.S.origin+'/reports');resultStatus(await h.assign(b,'assign-B'),200);resultStatus(await h.context(b),200);expect(b.context.scopeHash===a.context.scopeHash).toBe(false);expect(b.context.contextId===a.context.contextId).toBe(false);expect(b.scratch===profileA).toBe(false);expect((await b.sdk?.deref()?.cookies(h.S.origin))?.length).toBe(0);
    const freshRuntime=h.events.filter(e=>e.kind==='runtime'&&e.label==='B'&&e.stage==='settled-start').at(-1);expect(freshRuntime!==undefined).toBe(true);expect(freshRuntime?.hasBinding).toBe(false);expect(freshRuntime?.containsA).toBe(false);expect(freshRuntime?.accepting).toBe(true);expect(freshRuntime?.active).toBe(true);expect(freshRuntime?.tag===liveA?.tag).toBe(false);
    const initialB=h.events.filter(e=>e.kind==='inventory'&&e.label==='B'&&e.stage==='after-merge').at(-1);expect(initialB!==undefined).toBe(true);expect(initialB?.tag===maskedA?.tag).toBe(false);expect(initialB?.containsA).toBe(false);expect(initialB?.containsB).toBe(false);
    const foreign={...b.context,materializationRevision:b.context.materializationRevision+1,producers:[producer]};
    const refusedProducer=await post(h.port,h.path(b)+'/context',foreign,{key:'foreign-producer'});resultStatus(refusedProducer,409);expect(closedCode(refusedProducer.body)).toBe('CONTEXT_LOST');h.events.push({kind:'foreign-producer-refusal',status:refusedProducer.status,code:closedCode(refusedProducer.body)});
    const afterProducer=h.events.filter(e=>e.kind==='runtime'&&e.label==='B').at(-1);expect(afterProducer?.accepting).toBe(true);expect(afterProducer?.active).toBe(true);expect(afterProducer?.hasBinding).toBe(false);expect(afterProducer?.containsA).toBe(false);
    const refusedContext=await post(h.port,h.path(b)+'/context',a.context,{key:'foreign-context'});resultStatus(refusedContext,409);expect(closedCode(refusedContext.body)).toBe('IDENTITY_MISMATCH');h.events.push({kind:'foreign-context-refusal',status:refusedContext.status,code:closedCode(refusedContext.body)});
    resultStatus(await post(h.port,h.path(b)+'/context',b.context,{key:'live-B-after-refusals'}),200);
    const afterContext=h.events.filter(e=>e.kind==='runtime'&&e.label==='B').at(-1);expect(afterContext?.accepting).toBe(true);expect(afterContext?.active).toBe(true);expect(afterContext?.hasBinding).toBe(false);expect(afterContext?.containsA).toBe(false);
    await h.login(b,B,()=>{const filledB=h.events.filter(e=>e.kind==='inventory'&&e.label==='B'&&e.stage==='after-merge').at(-1);expect(filledB?.tag).toBe(initialB?.tag);expect(filledB?.containsB).toBe(true);expect(filledB?.containsA).toBe(false);expect(b.nativeCount).toBe(1);});expect(b.sdk?.deref()?.pages()[0]?.url()).toBe(h.S.origin+'/home');expect(h.S.receipts().length).toBe(2);expect(h.S.receipts()[1]?.accepted===true&&h.S.receipts()[1]?.password===B).toBe(true);expect(h.S.receipts()[0]?.id===h.S.receipts()[1]?.id).toBe(false);expect(b.nativeCount).toBe(1);expect(h.maxLive).toBe(1);
    const bInventory=h.events.filter(e=>e.kind==='inventory'&&e.label==='B');expect(bInventory.length>0).toBe(true);expect(bInventory.every(e=>e.containsA===false)).toBe(true);expect(bInventory.some(e=>e.containsB===true)).toBe(true);expect(bInventory.some(e=>e.tag===disposedA?.tag)).toBe(false);
    if(!b.scratch||!b.preferences)throw Error('PROFILE');expect(b.preferences.effective).toEqual({credentialsEnableService:false,autofillProfileEnabled:false,autofillCreditCardEnabled:false,restoreOnStartup:5});expect(b.preferences.activeProfilePath).toBe(await realpath(join(b.scratch,'browser-profile','Default')));await h.scans();await h.stop(b);await h.scans();
    await h.record('ISO3');
  }catch(error){failed=true;throw error;}finally{await h.close('ISO3',failed);}
},90000);
