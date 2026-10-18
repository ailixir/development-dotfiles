import {createServer} from 'node:http';
import type {ServerResponse} from 'node:http';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {expect,it} from 'vitest';
import corpus from '../../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json' with {type:'json'};
import type {ObservedJob,Artifact3,Scope,TrustedPolicy,BuildIdentity} from '../../src/executor/observedOperations.js';
import {hashObserved,OBSERVED_PROFILE,OBSERVED_SCHEMA_BUNDLE_HASH,validateObserved} from '../../src/validator/observedReferencePolicy.js';
import {validateReplayArtifact} from '../../src/validator/observedReplay.js';
import {createApplication} from '../../src/server/application.js';
import {loadConfig} from '../../src/server/config.js';
import {createRecordingLogSink} from '../../src/server/logging.js';
import {createFetchHttpClient} from '../../src/reporting/httpClient.js';
import type {ReportBody} from '../../src/reporting/snapshot.js';
import {createChildBrowserLauncher,createForkSpawner} from '../../src/run/launcher.js';
import type {ChildProcessHandle} from '../../src/run/launcher.js';
import {descendantsOf,isAlive} from '../../src/run/tree.js';
import {envBrowserRoot} from '../../scripts/browser-provenance.mjs';
import {untilMs} from './realRunner.js';

const modes=['worst-phase','slow-revoked','lost-control-body','progress-revoked'] as const;
const CANARY='obs007-control-native-private';
const stepId=(index:number)=>'00000000-0000-4000-8000-'+String(301+index).padStart(12,'0');
/** Controlled independent artifact construction; not a learned/publication proof. */
function controlledJob(origin:string,build:BuildIdentity):{job:ObservedJob;policy:TrustedPolicy}{
  const job=structuredClone(corpus.job) as ObservedJob;
  const scope:Scope={...job.binding.scope,allowedOrigins:[origin],policyVersion:'observed-4-full-chromium-1',initialContext:{kind:'initialBlank'}};
  const policy:TrustedPolicy={...corpus.trustedPolicy as TrustedPolicy,allowedOrigins:[origin],policyVersion:scope.policyVersion,rules:[],applicationPolicy:{policyRuleId:'structural',allowStructuralDiscovery:true,readGrants:[]}};
  const configuration={...job.configuration,timeoutSeconds:10,waitStrategy:'domcontentloaded' as const,viewport:{width:800,height:600}};
  const inputRecipes:Artifact3['inputRecipes']=[{inputId:'nav',stepId:stepId(0),kind:'destination',intendedSlot:'navigate.destination',provenance:{kind:'sourceSpan',start:0,end:1,sourceHash:job.artifact.sourceHash}},...(['PASS','NEXT'] as const).map((referenceName,index)=>({inputId:referenceName.toLowerCase(),stepId:stepId(index+1),kind:'secretRef' as const,intendedSlot:'fill.value' as const,provenance:{kind:'configuration' as const,referenceId:'reference-'+referenceName,referenceName}}))];
  const steps:Artifact3['steps']=[{stepIndex:0,stepId:stepId(0),operations:[{coordinate:{stepId:stepId(0),ordinal:0},guardId:'g0',operation:{kind:'navigate',destinationInputId:'nav'}}]},...(['pass','next'] as const).map((input,index)=>({stepIndex:index+1,stepId:stepId(index+1),operations:[{coordinate:{stepId:stepId(index+1),ordinal:0},guardId:'g'+String(index+1),operation:{kind:'fill' as const,value:{kind:'secretRef' as const,sourceInputId:input}}}]})),{stepIndex:3,stepId:stepId(3),operations:[{coordinate:{stepId:stepId(3),ordinal:0},guardId:'g3',operation:{kind:'click'}}]}];
  const guards:Artifact3['guards']=[{guardId:'g0',origin:null,target:{kind:'initialBlank'}},{guardId:'g1',origin,target:{kind:'passwordControl'}},{guardId:'g2',origin,target:{kind:'passwordControl'}},{guardId:'g3',origin,target:{kind:'element',locator:{kind:'role',role:'button',name:'Continue',exact:true},role:'button',elementType:'button',controlType:'none',classification:'structuralOnly',visible:true,actionable:true,readRuleId:null}}];
  const {principalId,...requirements}=scope;
  const actions:Artifact3['learnedPlan']['actions']=steps.flatMap(step=>step.operations.map(action=>{
    const guard=guards.find(g=>g.guardId===action.guardId);if(!guard)throw Error('GUARD');
    if(guard.origin===null){
      if(action.operation.kind!=='navigate'||action.coordinate.ordinal!==0)throw Error('BLANK_ACTION');
      const projection={coordinate:{stepId:action.coordinate.stepId,ordinal:0 as const},origin:null,locator:null,operation:action.operation};
      return {...projection,admissionId:'control-admission-'+String(step.stepIndex),operationHash:hashObserved(projection)};
    }
    const projection={coordinate:action.coordinate,origin:guard.origin,locator:guard.target.kind==='element'?guard.target.locator:null,operation:action.operation};
    return {...projection,admissionId:'control-admission-'+String(step.stepIndex),operationHash:hashObserved(projection)};
  }));
  const learnedPlan={...job.artifact.learnedPlan,sourceSteps:steps.map(s=>s.stepId),actions,bindings:[]};
  const learnedPlanHash=hashObserved(learnedPlan),configurationHash=hashObserved(configuration);
  const artifact:Artifact3={...job.artifact,configurationHash,learnedPlan,learnedPlanHash,inputRecipes,steps,guards,replayPolicy:{...job.artifact.replayPolicy,learnedPlanHash,scope:requirements,inputs:inputRecipes,bindings:[],transfers:[]}};
  const now=Date.now(),scopeHash=hashObserved(scope),currentPolicyHash=hashObserved(policy);
  const binding={...job.binding,artifactHash:hashObserved(artifact),configurationHash,learnedPlanHash,referencePolicyHash:hashObserved(artifact.replayPolicy),publicationEvidenceHash:artifact.replayPolicy.publicationEvidenceHash,requiredBuild:build,requiredProfile:OBSERVED_PROFILE,scope,scopeHash,currentPolicyHash,principalId,startedAt:new Date(now).toISOString(),replayGrant:{...job.binding.replayGrant,scopeHash,currentPolicyHash,profileHash:hashObserved(OBSERVED_PROFILE),buildHash:hashObserved(build),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+30000).toISOString()}};
  return {policy,job:{...job,binding,artifact,configuration,inputs:[{inputId:'nav',value:origin+'/login'}],secrets:{PASS:CANARY,NEXT:CANARY+'-next'},secretOrigins:{PASS:[origin],NEXT:[origin]},runtime:{stepTimeoutMs:10000,totalRuntimeMs:20000},recording:{width:800,height:600}}};
}

it.each(modes)('proves actual secret-bearing observed control cutoff: %s',async mode=>{
  const directory=await mkdtemp(join(tmpdir(),'observed-secret-control-'));
  const reports:ReportBody[]=[],controls:{started:number;completed?:number;timeoutMs?:number}[]=[],nativeEntries:number[]=[],nativeEnds:number[]=[],childMessages:unknown[]=[],rawOutput:string[]=[];
  let handle:ChildProcessHandle|undefined,heldProgress:ServerResponse|undefined,focusAt:number|undefined,nativePendingAtFocus:number|undefined,revokedAt:number|undefined,stopAt:number|undefined,stopSendAt:number|undefined,clearedAt:number|undefined,effects=0,inputEvents=0;
  const observedPids=new Set<number>();
  const server=createServer((req,res)=>{void(async()=>{
    res.setHeader('content-type','application/json');let text='';for await(const chunk of req)text+=(chunk as Buffer).toString();
    if(req.url==='/native-entry'){nativeEntries.push(performance.now());res.end('{}');return;}
    if(req.url==='/native-end'){nativeEnds.push(performance.now());res.end('{}');return;}
    if(req.url==='/focus-entry'){
      const signal=JSON.parse(text) as {kind?:unknown;nativePending?:unknown};
      expect(signal).toEqual({kind:'focus-entry',nativePending:1});nativePendingAtFocus=1;focusAt=performance.now();
      if(mode==='progress-revoked'&&heldProgress){revokedAt=focusAt;heldProgress.end('{"revoked":true}');heldProgress=undefined;}res.end('{}');return;
    }
    if(req.url==='/input'){inputEvents++;res.end('{}');return;}
    if(req.url==='/effect'){effects++;res.end('{}');return;}
    if(req.url==='/login'){
      res.setHeader('content-type','text/html');res.end('<form action="/login"><input type="password"><button type="button" onclick="fetch(\'/effect\')">Continue</button></form><script>document.querySelector("input").addEventListener("focus",()=>{window.__obs007Focus();const end=Date.now()+10000;while(Date.now()<end){};});document.querySelector("input").addEventListener("input",()=>fetch("/input"));</script>');return;
    }
    if(req.url?.endsWith('/observed-admission')){const request=JSON.parse(text) as Record<string,unknown>,now=Date.now();res.end(JSON.stringify({schemaVersion:3,kind:'observed',admissionId:request.admissionId,request,admittedAt:new Date(now).toISOString(),startDeadlineAt:new Date(now+15000).toISOString(),runDeadlineAt:new Date(now+30000).toISOString()}));return;}
    if(req.url?.endsWith('/control')){
      const state={executionId:corpus.job.binding.executionId,cancelRequested:false,revoked:revokedAt!==undefined};
      if(state.revoked&&mode==='lost-control-body'){res.writeHead(200,{'content-length':'1000'});res.write('{');return;}
      if(state.revoked&&mode==='slow-revoked')await new Promise<void>(r=>{setTimeout(r,900);});
      res.end(JSON.stringify(state));return;
    }
    if(req.url?.endsWith('/progress')){
      const body=JSON.parse(text) as ReportBody;reports.push(body);
      if(mode==='progress-revoked'&&body.kind==='PROGRESS'&&body.steps.some(s=>s.stepIndex===1&&s.status==='RUNNING')){if(focusAt===undefined)heldProgress=res;else{revokedAt=focusAt;res.end('{"revoked":true}');}return;}
      res.end('{}');return;
    }
    res.writeHead(404);res.end('{}');
  })().catch(()=>{res.writeHead(500);res.end('{}');});});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error('PORT');const origin='http://127.0.0.1:'+String(address.port);
  const runtime=JSON.parse(await readFile(resolve('dist/runtime-versions.json'),'utf8')) as Record<string,unknown>;
  const build:BuildIdentity={profileHash:hashObserved(OBSERVED_PROFILE),schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH,referenceBundleHash:String(runtime.observedReferenceBundleHash),executableImageDigest:'b'.repeat(64),chromiumBuild:String(runtime.observedChromiumBuild)};
  const {job,policy}=controlledJob(origin,build),catalog=join(directory,'catalog.json'),entry=join(directory,'child.mjs');await writeFile(catalog,JSON.stringify({profile:OBSERVED_PROFILE,build}));
  const startup={STUDIO_RUNNER_OBSERVED_CATALOG_FILE:catalog,STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST:build.executableImageDigest,PLAYWRIGHT_BROWSERS_PATH:envBrowserRoot(process.env)};
  // The actual SDK binding emits a constant, value-free focus witness through CDP while
  // the renderer blocks. Child-side HTTP avoids the page request route. It checks the
  // original native command is still pending; neither the command nor its result is held.
  await writeFile(entry,`import {chromium} from ${JSON.stringify(pathToFileURL(resolve('node_modules/playwright/index.mjs')).href)};import {startChild} from ${JSON.stringify(pathToFileURL(resolve('dist/run/child.js')).href)};import {loadObservedBuild} from ${JSON.stringify(pathToFileURL(resolve('dist/compat/runtime-versions.js')).href)};const launch=chromium.launchPersistentContext.bind(chromium);chromium.launchPersistentContext=async(...args)=>{const context=await launch(...args),open=context.newCDPSession.bind(context);let nativePending=0;await context.exposeBinding('__obs007Focus',()=>{if(nativePending!==1)throw new Error('NATIVE_FOCUS_ORDER');return fetch(${JSON.stringify(origin+'/focus-entry')},{method:'POST',body:JSON.stringify({kind:'focus-entry',nativePending})}).then(()=>undefined);});context.newCDPSession=async(...args)=>{const session=await open(...args),send=session.send.bind(session);session.send=(method,params)=>{const pending=send(method,params);if(method==='Runtime.callFunctionOn'&&params?.functionDeclaration?.includes('this.fillPasswordResult')){nativePending++;void fetch(${JSON.stringify(origin+'/native-entry')},{method:'POST'});const ended=()=>{nativePending--;return fetch(${JSON.stringify(origin+'/native-end')},{method:'POST'});};void pending.then(ended,ended).catch(()=>{});}return pending;};return session;};return context;};startChild(process,{observedBuild:loadObservedBuild(${JSON.stringify(startup)})});`);
  const actualHttp=createFetchHttpClient(),sink=createRecordingLogSink(),scratch=join(directory,'scratch'),objects=join(directory,'objects');
  const spawner=createForkSpawner(),launcher=createChildBrowserLauncher({childModulePath:entry,recording:job.recording,stepTimeoutMs:10000,launchTimeoutMs:15000,stopTimeoutMs:1000,maxFailureMessageLength:400,seekOriginCalibrationMs:0,spawner:{spawn(request){handle=spawner.spawn(request);const send=handle.send.bind(handle);handle.send=m=>{if(m.kind==='stop')stopSendAt??=performance.now();send(m);};handle.onMessage(m=>{childMessages.push(m);if(handle?.pid){observedPids.add(handle.pid);for(const pid of descendantsOf(handle.pid))observedPids.add(pid);}});handle.onOutput((_stream,chunk)=>{rawOutput.push(chunk);});return handle;}}});
  const app=createApplication(loadConfig({STUDIO_RUNNER_PORT:'0',STUDIO_RUNNER_HOST:'127.0.0.1',STUDIO_RUNNER_SERVICE_IDENTITY:'service',STUDIO_RUNNER_CALLBACK_IDENTITY:'callback',STUDIO_RUNNER_CALLBACK_BASE_URL:origin,STUDIO_RUNNER_INSTANCE_ID:'secret-control-fixture',STUDIO_RUNNER_SCRATCH_DIR:scratch,STUDIO_RUNNER_OBJECT_STORE_DIR:objects,STUDIO_RUNNER_DRAIN_TIMEOUT_MS:'100'}),{launcher,runtimeVersions:runtime,observed:{build,policies:[policy],validationEnabled:true,replayEnabled:true},logSink:{write(line){sink.write(line);if(line.includes('"event":"run.cancel_requested"'))stopAt??=performance.now();}},http:{async send(request){const state=request.url.endsWith('/control')?{started:performance.now(),timeoutMs:request.timeoutMs}:undefined;if(state)controls.push(state);const response=await actualHttp.send(request);if(state){Object.assign(state,{completed:performance.now()});if(mode!=='progress-revoked'&&focusAt!==undefined&&revokedAt===undefined&&response.kind==='response'&&response.status===200)revokedAt=performance.now();}return response;}}});
  const facts:Record<string,unknown>={mode,productionControlExecuted:false,localCallbackOnly:true,backendRevocationAuditProved:false,artifactHash:job.binding.artifactHash,scopeHash:job.binding.scopeHash,declaredRecipes:job.artifact.inputRecipes,artifact:job.artifact,binding:job.binding,jobSecretIds:Object.keys(job.secrets),build,provenance:runtime.observedBrowserProvenance};
  try{
    // Preserve an exact failing production guard before asserting admission. Schema validation
    // and all hash/recipe joins are real; no disabled guard or placeholder secret is installed.
    validateObserved('replay-artifact',job.artifact);facts.artifactSchemaValid=true;
    expect(hashObserved(job.artifact.learnedPlan)).toBe(job.artifact.learnedPlanHash);
    expect(job.artifact.replayPolicy.inputs).toEqual(job.artifact.inputRecipes);
    try{validateReplayArtifact(job.artifact);facts.productionArtifactValidation='PASS';}catch(error){facts.productionArtifactValidation={message:error instanceof Error?error.message:'UNKNOWN',stack:error instanceof Error?error.stack:undefined};}
    const port=await app.start(),response=await fetch('http://127.0.0.1:'+String(port)+'/v2/runs',{method:'POST',headers:{authorization:'Bearer service','content-type':'application/json'},body:JSON.stringify(job)}),body=await response.text();facts.admissionResponse={status:response.status,body};
    expect(response.status,body).toBe(202);
    await untilMs(()=>focusAt!==undefined&&nativeEntries.length>0,10000);
    expect(nativePendingAtFocus).toBe(1);
    expect(nativeEnds).toEqual([]);
    await untilMs(()=>stopAt!==undefined,5000);
    if(revokedAt===undefined||stopAt===undefined)throw Error('CUTOFF_CLOCK');
    facts.productionControlExecuted=true;facts.cutoffMs=stopAt-revokedAt;expect(stopAt-revokedAt).toBeLessThanOrEqual(2000);
    expect(controls.every(c=>typeof c.timeoutMs==='number'&&Number.isFinite(c.timeoutMs)&&c.timeoutMs>0&&c.timeoutMs<=1000)).toBe(true);
    await untilMs(()=>reports.some(r=>r.kind==='FINAL')&&app.pool.inUse===0,10000);clearedAt=performance.now();
    await untilMs(()=>[...observedPids].every(pid=>!isAlive(pid)),5000);
    expect(nativeEntries).toHaveLength(1);expect(effects).toBe(0);expect(inputEvents).toBe(0);
    const started=childMessages.filter(m=>typeof m==='object'&&m!==null&&'kind' in m&&m.kind==='step-started');expect(started).toHaveLength(2);
    expect(await readdir(scratch)).toEqual([]);const final=reports.find(r=>r.kind==='FINAL');expect(final?.outcome?.result).toBe('ERROR');expect(final?.outcome?.errorCode).toBe('CANCELLED');
    for(const secret of [CANARY,CANARY+'-next'])for(const value of [secret,encodeURIComponent(secret),Buffer.from(secret).toString('base64')])expect(JSON.stringify({reports,log:sink.lines,rawOutput})).not.toContain(value);
  }finally{
    await app.drain();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>{r();}));
    Object.assign(facts,{controls,focusAt,nativePendingAtFocus,revokedAt,stopAt,stopSendAt,clearedAt,nativeEntries,nativeEnds,inputEvents,effects,reports,pids:[...observedPids],allObservedPidsGone:[...observedPids].every(pid=>!isAlive(pid)),capacityInUse:app.pool.inUse,scratchEntries:await readdir(scratch).catch(()=>[])});
    await writeFile(resolve('../docs/qa/evidence/STUDIO-OBS-007/runner-control-focus-candidate/oracle-'+mode+'.json'),JSON.stringify(facts,null,2)+'\n');
    if(handle?.pid&&isAlive(handle.pid))handle.kill();await rm(directory,{recursive:true,force:true});
  }
},45000);
