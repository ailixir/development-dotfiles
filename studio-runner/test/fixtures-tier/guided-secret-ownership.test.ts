// eslint-disable-next-line no-restricted-imports -- Actual fixed Chromium SDK witness; every intercepted call invokes its original.
import {chromium} from 'playwright';
import {createServer} from 'node:https';
import type {ServerResponse} from 'node:http';
import {TLSSocket} from 'node:tls';
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {expect,it,vi} from 'vitest';
import {createGuidedServer,guidedCallback,guidedClaimClient,verifyGuidedJwt} from '../../src/guided/transport.js';
import {GuidedRuntime} from '../../src/guided/runtime.js';
import {launchGuidedBrowser} from '../../src/run/browser.js';
import {descendantsOf,isAlive} from '../../src/run/tree.js';
import {hash,identity,validate} from '../../src/guided/contracts.js';
import type {BridgeBootstrap,BridgeObservation,BridgePreparation,BridgeOrdinaryOutcome as BridgeOutcome,BridgeLifecycle,CommandsClaim} from '../../src/guided/types.js';
import {guidedContext,ownershipSession,assignmentFor,proposal,dispatch} from '../helpers/guided.js';
import {testTls,testFingerprint,jwtPolicy,jwt,post} from '../helpers/guidedTls.js';
import {startSecretLoginFixture} from '../fixtures/secret-login/server.js';
import {untilMs} from './realRunner.js';

const modes=['revoked','slow-grant','lost-body-late-grant','hard-expiry'] as const;
const CANARY='obs007-guided-renew-private';
// A Node timer can fire a little before Date.now() reaches its due time (a millisecond, stretched by however stale the loop clock was when it was armed).
// The hard-expiry stop is therefore asserted at the instant it happened, with this much allowance: far below the 100 ms claim margin and the seconds a premature stop would show.
const TIMER_EARLY_MS=10;
const responseCodes=new Set(['AUTH_DENIED','IDEMPOTENCY_CONFLICT','SCHEMA','IDENTITY_MISMATCH','CAPACITY','CONTEXT_LOST','ALREADY_CONSUMED','BUSY','TARGET_CHANGED','PREPARATION_DENIED','ADMISSION_DENIED','BINDING_UNAVAILABLE','BINDING_DENIED','BINDING_ORDER','ACTION_ORDER','CONTEXT_REVISION','INPUT_IDENTITY','BUDGET_EXCEEDED','POLICY_DENIED']);
function closedResponseCode(body:unknown):string {
  if(typeof body!=='object'||body===null||Array.isArray(body)||!('code' in body)||typeof body.code!=='string'||!responseCodes.has(body.code))return 'OTHER';
  return body.code;
}
it.each(modes)('uses actual mTLS and native focus for guided secret ownership: %s',async mode=>{
  const fixture=await startSecretLoginFixture(CANARY),directory=await mkdtemp(join(tmpdir(),'guided-secret-ownership-'));
  const context=guidedContext(fixture.origin),destination=context.authoredInputs.inputs[0];
  if(!destination||!('value' in destination))throw Error('DESTINATION');destination.value=fixture.origin+'/slow';
  context.authoredInputs.inputs.push({inputId:'input-pass',sourceStepId:'fill',kind:'secretRef',intendedSlot:'fill.value',secretId:'PASS',provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:'fill',referenceId:'reference-pass',referenceName:'PASS',kind:'secretRef',intendedSlot:'fill.value'}},{inputId:'input-later-pass',sourceStepId:'submit',kind:'secretRef',intendedSlot:'fill.value',secretId:'NEXT',provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:'submit',referenceId:'reference-next',referenceName:'NEXT',kind:'secretRef',intendedSlot:'fill.value'}});
  if(mode==='hard-expiry')context.expiresAt=new Date(Date.now()+5000).toISOString();
  context.authoredInputsHash=hash(context.authoredInputs);
  let grant=ownershipSession(context);context.leaseExpiresAt=grant.owner.leaseExpiresAt;
  const assignment=assignmentFor(context),messages:{route:string;body:unknown}[]=[],commandResponses:{stage:string;status:number;code:string}[]=[],nativeEntries:number[]=[],nativeEnds:number[]=[],claimFacts:{started:number;completed?:number;failed?:number;timeoutMs:number;key:string}[]=[],requestFacts:{started:number;completed?:number;leaseExpiresAt?:string;key:string}[]=[],pids=new Set<number>();
  const expectedStage=(stage:string,reply:Awaited<ReturnType<typeof post>>,status:number):void=>{const code=closedResponseCode(reply.body);commandResponses.push({stage,status:reply.status,code});expect(reply.status,stage+': '+code).toBe(status);};
  let focusAt:number|undefined,nativePendingAtFocus:number|undefined,t0:number|undefined,authorityStoppedAt:number|undefined,authorityStoppedWallMs:number|undefined,stopReason:string|undefined,closeRequestedAt:number|undefined,closeFinishedAt:number|undefined,lateGrantWriteAt:number|undefined,lateGrantResponseClosed:boolean|undefined,scratchPath:string|undefined,launches=0,nativePending=0,inputEvents=0;
  let heldLate:ServerResponse|undefined,activeClaims=0,maxActiveClaims=0;
  const timers:ReturnType<typeof setTimeout>[]=[];
  const actualStop=Object.getOwnPropertyDescriptor(GuidedRuntime.prototype,'stop')?.value as GuidedRuntime['stop'];
  if(typeof actualStop!=='function')throw Error('STOP_METHOD');
  vi.spyOn(GuidedRuntime.prototype,'stop').mockImplementation(function(this:GuidedRuntime,reason){
    const pending=actualStop.call(this,reason);
    if(this.currentIdentity.sessionId===context.sessionId&&!this.accepting){authorityStoppedAt??=performance.now();authorityStoppedWallMs??=Date.now();stopReason??=reason;}
    return pending;
  });
  const actualLaunch=chromium.launchPersistentContext.bind(chromium);
  vi.spyOn(chromium,'launchPersistentContext').mockImplementation(async(profile,options)=>{
    const before=new Set(descendantsOf(process.pid)),browser=await actualLaunch(profile,options);launches++;
    for(const pid of descendantsOf(process.pid))if(!before.has(pid))pids.add(pid);
    await browser.exposeBinding('__obs007OwnershipFocus',()=>{expect(nativePending).toBe(1);nativePendingAtFocus=nativePending;focusAt=performance.now();for(const pid of descendantsOf(process.pid))if(!before.has(pid))pids.add(pid);});
    await browser.exposeBinding('__obs007OwnershipInput',()=>{inputEvents++;});
    // No selector/fill/read outside the trusted collector. A constant event witness and
    // capturing focus wait run on the existing /slow fixture before its ordinary listener.
    await browser.addInitScript(()=>{
      const signals=window as unknown as {__obs007OwnershipFocus:()=>void;__obs007OwnershipInput:()=>void};
      document.addEventListener('focus',event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='password'){signals.__obs007OwnershipFocus();const end=Date.now()+10000;while(Date.now()<end){/* controlled actual native focus stall */}}},true);
      document.addEventListener('input',event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='password')signals.__obs007OwnershipInput();},true);
    });
    const actualSession=browser.newCDPSession.bind(browser);
    vi.spyOn(browser,'newCDPSession').mockImplementation(async page=>{
      const session=await actualSession(page);
      Object.defineProperty(session,'send',{value:new Proxy(session.send.bind(session),{apply(target,thisArg,args:unknown[]){
        const pending=Reflect.apply(target,thisArg,args) as Promise<unknown>,params=args[1] as {functionDeclaration?:unknown}|undefined;
        if(args[0]==='Runtime.callFunctionOn'&&typeof params?.functionDeclaration==='string'&&params.functionDeclaration.includes('this.fillPasswordResult')){
          nativePending++;nativeEntries.push(performance.now());const ended=()=>{nativePending--;nativeEnds.push(performance.now());};void pending.then(ended,ended);
        }
        return pending;
      }}),configurable:true});return session;
    });return browser;
  });
  const callbacks=createServer({...testTls,requestCert:true,rejectUnauthorized:true},(req,res)=>{void(async()=>{
    expect(req.socket).toBeInstanceOf(TLSSocket);expect((req.socket as TLSSocket).authorized).toBe(true);
    expect((req.socket as TLSSocket).getPeerCertificate().fingerprint256).toBe(testFingerprint);
    verifyGuidedJwt(req.headers.authorization,{...jwtPolicy,subject:context.workerId},'studio-guided-controller','owning-worker');
    let text='';for await(const chunk of req)text+=(chunk as Buffer).toString();const route=req.url?.split('/').at(-1)??'',body=JSON.parse(text) as unknown;
    if(route==='claim'){
      const command=validate<CommandsClaim>('commands',body,'claim');expect(command.sessionId).toBe(context.sessionId);expect(command.expectedFence).toBe(requestFacts.length===0?0:1);
      const fact={started:performance.now(),key:String(req.headers['idempotency-key'])};requestFacts.push(fact);activeClaims++;maxActiveClaims=Math.max(maxActiveClaims,activeClaims);let ended=false;res.once('close',()=>{if(!ended){ended=true;activeClaims--;}});
      if(mode==='revoked'&&t0!==undefined){res.writeHead(409);res.end('{"code":"SECRET_USE_REVOKED"}');return;}
      grant={...grant,owner:{...grant.owner,leaseExpiresAt:new Date(Math.min(Date.now()+30000,Date.parse(grant.expiresAt))).toISOString()}};
      const serialized=JSON.stringify(grant);
      if(mode==='lost-body-late-grant'&&t0!==undefined){
        heldLate=res;res.writeHead(202,{'content-length':Buffer.byteLength(serialized)});res.write(serialized.slice(0,1));
        timers.push(setTimeout(()=>{lateGrantWriteAt=performance.now();lateGrantResponseClosed=res.destroyed;res.end(serialized.slice(1));},1500));return;
      }
      if(mode==='slow-grant'&&requestFacts.length>1)await new Promise<void>(r=>{timers.push(setTimeout(r,850));});
      Object.assign(fact,{completed:performance.now(),leaseExpiresAt:grant.owner.leaseExpiresAt});res.writeHead(202);res.end(serialized);return;
    }
    messages.push({route,body});res.writeHead(202);res.end('{}');
  })().catch(()=>{res.writeHead(500);res.end('{}');});});
  await new Promise<void>(r=>callbacks.listen(0,'127.0.0.1',r));const callbackAddress=callbacks.address();if(!callbackAddress||typeof callbackAddress==='string')throw Error('PORT');
  const client={baseUrl:'https://127.0.0.1:'+String(callbackAddress.port),tls:testTls,controllerCertificateFingerprint256:testFingerprint,token:()=>Promise.resolve(jwt({aud:'studio-guided-controller',role:'owning-worker',sub:context.workerId}))};
  const actualClaim=guidedClaimClient(client);
  const app=createGuidedServer({workerId:context.workerId,capacity:1,journalDirectory:directory,tls:testTls,controllerJwt:jwtPolicy,controllerCertificateFingerprint256:testFingerprint,claim:async(command,key,timeout,signal)=>{
    const fact={started:performance.now(),timeoutMs:timeout,key};claimFacts.push(fact);
    try{const acknowledged=await actualClaim(command,key,timeout,signal);Object.assign(fact,{completed:performance.now()});if(focusAt!==undefined&&t0===undefined&&(mode==='revoked'||mode==='lost-body-late-grant'))t0=performance.now();return acknowledged;}
    catch(error){Object.assign(fact,{failed:performance.now()});throw error;}
  },callback:guidedCallback(client),launch:async(...args)=>{const browser=await launchGuidedBrowser(...args);scratchPath=browser.scratchDirectory;return {...browser,close:async()=>{closeRequestedAt??=performance.now();await browser.close();closeFinishedAt=performance.now();}};}});
  await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const address=app.server.address();if(!address||typeof address==='string')throw Error('PORT');const path='/internal/v2/studio/guided-sessions/'+context.sessionId;
  let pendingFill:Promise<Awaited<ReturnType<typeof post>>>|undefined;
  const facts:Record<string,unknown>={mode,sourceGuidedWorker:true,compiledWorker:false,realMtlsJwt:true,backendRevocationAuditProved:false,scopeHash:context.scopeHash,sessionId:context.sessionId,absoluteExpiresAt:context.expiresAt};
  try{
    expect((await post(address.port,path+'/assign',assignment,{fence:null})).status).toBe(200);
    expect((await post(address.port,path+'/context',context)).status).toBe(200);
    const bootstrap=messages.find(m=>m.route==='bootstrap-evidence')?.body as BridgeBootstrap|undefined;if(!bootstrap)throw Error('BOOTSTRAP');
    const navigation=proposal(context,bootstrap.executionEvidence,'nav',{kind:'navigate',destinationInputId:'input-nav'}),navigationPreparation=await post(address.port,path+'/prepare',{...identity(context),proposal:navigation,requestDigest:hash(navigation),expiresAt:context.expiresAt},{key:'navigation-prepare'});expectedStage('navigation-prepare',navigationPreparation,200);
    expectedStage('navigation-dispatch',await post(address.port,path+'/dispatch',dispatch(context,navigation,validate<BridgePreparation>('bridge',navigationPreparation.body,'preparation')),{key:'navigation-dispatch'}),200);
    const observation=(messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;
    expect(observation.origin).toBe(fixture.origin);expect(observation.coverage.passwordControls).toBe(1);
    const evidence={kind:'observedDocument' as const,sessionId:context.sessionId,contextId:context.contextId,documentId:observation.documentId,generation:observation.generation,origin:fixture.origin,observationHash:hash(observation)};
    const fill=proposal(context,evidence,'fill',{kind:'fill',value:{kind:'secretRef',sourceInputId:'input-pass'}},{kind:'passwordControl',documentId:observation.documentId,generation:observation.generation}),preparation=await post(address.port,path+'/prepare',{...identity(context),proposal:fill,requestDigest:hash(fill),expiresAt:context.expiresAt},{key:'password-prepare'});expectedStage('password-prepare',preparation,200);
    const request={...dispatch(context,fill,validate<BridgePreparation>('bridge',preparation.body,'preparation')),secret:{secretId:'PASS',value:CANARY,versionId:'fixture-version',allowedOrigins:[fixture.origin]}};
    pendingFill=post(address.port,path+'/dispatch',request,{key:'actual-secret-fill'});
    await untilMs(()=>focusAt!==undefined,4000);expect(nativePendingAtFocus).toBe(1);expect(nativePending).toBe(1);expect(nativeEnds).toEqual([]);
    if(mode==='slow-grant'){
      await untilMs(()=>claimFacts.filter(c=>c.completed!==undefined).length>=4,6000);
      const renewals=requestFacts.slice(1);expect(renewals.length).toBeGreaterThanOrEqual(3);
      for(const [i,renewal] of renewals.entries())expect(Math.abs(renewal.started-(renewals[0]?.started??0)-i*1000)).toBeLessThanOrEqual(200);
      for(const renewal of claimFacts.slice(1).filter(c=>c.completed!==undefined)){expect((renewal.completed??0)-renewal.started).toBeGreaterThanOrEqual(800);expect((renewal.completed??0)-renewal.started).toBeLessThanOrEqual(1000);}
      expect(authorityStoppedAt).toBeUndefined();expect((await post(address.port,path+'/stop',{...identity(context),reason:'CANCELLED'})).status).toBe(200);
    }
    await untilMs(()=>authorityStoppedAt!==undefined,7000);
    if(authorityStoppedAt===undefined)throw Error('STOP_CLOCK');
    if(mode==='revoked'||mode==='lost-body-late-grant'){
      if(t0===undefined)throw Error('ACK_CLOCK');expect(authorityStoppedAt-t0).toBeLessThanOrEqual(2000);facts.cutoffMs=authorityStoppedAt-t0;expect(stopReason).toBe(mode==='revoked'?'REVOKED':'LEASE_LOST');
    }
    if(mode==='hard-expiry'){expect(authorityStoppedWallMs).toBeGreaterThanOrEqual(Date.parse(context.expiresAt)-TIMER_EARLY_MS);expect(stopReason).toBe('EXPIRED');expect(claimFacts.slice(1).every(c=>c.timeoutMs<=1000)).toBe(true);}
    const later=proposal(context,evidence,'submit',{kind:'fill',value:{kind:'secretRef',sourceInputId:'input-later-pass'}},{kind:'passwordControl',documentId:observation.documentId,generation:observation.generation});
    expect((await post(address.port,path+'/prepare',{...identity(context),proposal:later,requestDigest:hash(later),expiresAt:context.expiresAt},{key:'later-secret-prepare'})).status).toBe(409);
    if(mode==='lost-body-late-grant')await untilMs(()=>lateGrantWriteAt!==undefined,3000);
    expect((await post(address.port,path+'/context',context,{key:'late-context'})).status).toBe(409);expect((await post(address.port,path+'/assign',assignment,{fence:null,key:'late-assignment'})).status).toBe(409);
    expect((await pendingFill).status).toBe(200);
    await untilMs(()=>closeFinishedAt!==undefined&&[...pids].every(pid=>!isAlive(pid)),5000);
    expect(launches).toBe(1);expect(nativeEntries).toHaveLength(1);expect(inputEvents).toBe(0);expect(fixture.receipts()).toEqual([]);expect(maxActiveClaims).toBe(1);
    expect(scratchPath).toBeDefined();if(!scratchPath)throw Error('SCRATCH');expect(existsSync(scratchPath)).toBe(false);
    const lifecycle=messages.filter(m=>m.route==='lifecycle').at(-1)?.body as BridgeLifecycle|undefined;expect(lifecycle?.reason).toBe(stopReason);
    for(const secret of [CANARY])for(const value of [secret,encodeURIComponent(secret),Buffer.from(secret).toString('base64')]){
      expect(JSON.stringify(messages)).not.toContain(value);for(const file of await readdir(directory))if(file.endsWith('.journal')||file.endsWith('.diagnostic.jsonl'))expect(await readFile(join(directory,file),'utf8')).not.toContain(value);
    }
    const outcome=messages.filter(m=>m.route==='outcomes').at(-1)?.body as BridgeOutcome|undefined;expect(outcome?.ledger.dispatchCount).toBe(1);expect(outcome?.ledger.state).toBe('UNKNOWN_OUTCOME');
  }finally{
    await app.close();if(pendingFill)await pendingFill.catch(()=>undefined);for(const timer of timers)clearTimeout(timer);heldLate?.destroy();callbacks.closeAllConnections();await new Promise<void>(r=>callbacks.close(()=>{r();}));
    Object.assign(facts,{commandResponses,claimFacts,requestFacts,focusAt,nativePendingAtFocus,t0,authorityStoppedAt,stopReason,closeRequestedAt,closeFinishedAt,lateGrantWriteAt,lateGrantResponseClosed,launches,nativeEntries,nativeEnds,inputEvents,pids:[...pids],allObservedPidsGone:[...pids].every(pid=>!isAlive(pid)),scratchPath,scratchAbsent:scratchPath!==undefined&&!existsSync(scratchPath),messages});
    await writeFile(resolve('../docs/qa/evidence/STUDIO-OBS-007/runner-guided-renew-execution-2/oracle-'+mode+'.json'),JSON.stringify(facts,null,2)+'\n');vi.restoreAllMocks();await fixture.close();await rm(directory,{recursive:true,force:true});
  }
},45000);
