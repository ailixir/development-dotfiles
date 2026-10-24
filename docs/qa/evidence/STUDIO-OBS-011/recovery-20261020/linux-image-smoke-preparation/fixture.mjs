// UNEXECUTED, one-shot D2 smoke adapter. No production module is replaced.
// Wire/claim/JWT shape: test/helpers/guided{,Tls}.ts and fixtures-tier/guided-wire.test.ts.
import { readFileSync, writeFileSync, readdirSync, lstatSync, readlinkSync, unlinkSync } from 'node:fs';
import { randomUUID, sign, X509Certificate } from 'node:crypto';
import { createServer, request } from 'node:https';
import { join } from 'node:path';
// Do not export native/auth/filesystem error strings, request bodies, keys or stacks.
process.on('uncaughtException',()=>{console.log('{"event":"D2_ADAPTER_ERROR"}');process.exit(1);});
process.on('unhandledRejection',()=>{console.log('{"event":"D2_ADAPTER_ERROR"}');process.exit(1);});
const mode = process.argv[2];
if (mode === 'inspect' || mode === 'inspect-after') {
  const tmp = mode === 'inspect' ? '/tmp' : '/runner-tmp';
  let activeRecordingDirectories=0, journals=0, nonemptyJournals=0, owners=0;
  const walk=(path,depth=0)=>{if(depth>6)throw new Error('D2_INSPECTION_BOUND');for(const name of readdirSync(path)){const child=join(path,name),s=lstatSync(child);if(s.isSymbolicLink())continue;if(s.isDirectory()){if(name.startsWith('checks-recording-'))activeRecordingDirectories++;walk(child,depth+1);}else if(name.endsWith('.journal')){journals++;if(s.size>0)nonemptyJournals++;}else if(name.endsWith('.journal.owner'))owners++;}};
  walk(`${tmp}/.checks-guided-recordings`);
  if(mode==='inspect-after') {if(activeRecordingDirectories!==0)throw new Error('D2_SCRATCH_NOT_REMOVED');console.log(JSON.stringify({event:'D2_AFTER',activeRecordingDirectories}));process.exit(0);}
  walk('/journal/data');
  const nodePid=process.argv[3];if(!/^[1-9][0-9]*$/.test(nodePid)||Number(nodePid)<=1)throw new Error('D2_NODE_PID');
  const core=/^Max core file size\s+(\S+)\s+(\S+)\s+bytes$/m.exec(readFileSync(`/proc/${nodePid}/limits`,'utf8'));
  if(core?.[1]!=='0'||core?.[2]!=='0')throw new Error('D2_CORE_LIMIT');
  const fdDirectory=`/proc/${nodePid}/fd`;
  let recordingDirectoryHandles=0;
  for(const fd of readdirSync(fdDirectory)){try{if(readlinkSync(join(fdDirectory,fd)).includes('/.checks-guided-recordings/'))recordingDirectoryHandles++;}catch{/* fd may close between enumeration/readlink */}}
  const keyStat=lstatSync('/tls/tls.key');
  if((keyStat.mode&0o777)!==0o440||keyStat.gid!==1001||readFileSync('/tls/tls.key').length===0)throw new Error('D2_TLS_MODE');
  for(const path of ['/app/.d2-readonly-probe','/tls/.d2-readonly-probe']){try{writeFileSync(path,'D2',{flag:'wx'});unlinkSync(path);throw new Error('D2_ROOT_WRITABLE');}catch(error){if(error.code!=='EROFS')throw error;}}
  if(process.platform!=='linux'||journals!==2||nonemptyJournals!==2||owners!==2||activeRecordingDirectories!==1||recordingDirectoryHandles<1)throw new Error('D2_FILESYSTEM_PROOF');
  console.log(JSON.stringify({event:'D2_ACTIVE',linux:true,nodePid:Number(nodePid),journals,nonemptyJournals,owners,activeRecordingDirectories,recordingDirectoryHandles,tlsMode:'0440',tlsGid:keyStat.gid,readonlyRefusals:2,coreSoft:0,coreHard:0}));process.exit(0);
}
const root = mode === 'prepare' ? process.argv[3] : '/tls';
const fixtureRoot = process.argv[4];
const key = readFileSync(mode === 'prepare' ? join(fixtureRoot, 'key.fixture') : '/tls/tls.key');
const cert = readFileSync(mode === 'prepare' ? join(fixtureRoot, 'cert.fixture') : '/tls/tls.crt');
const fingerprint = new X509Certificate(cert).fingerprint256;
const jwt = (overrides = {}) => {
  const now = Math.floor(Date.now()/1000);
  const header = Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
  const payload = Buffer.from(JSON.stringify({iss:'fixture-issuer',sub:'controller',aud:'studio-guided-runner',role:'backend-controller',iat:now,exp:now+300,...overrides})).toString('base64url');
  const body = `${header}.${payload}`;
  return `${body}.${sign('RSA-SHA256',Buffer.from(body),key).toString('base64url')}`;
};
if (mode === 'prepare') {
  for (const [name,value] of Object.entries({'tls.key':key,'tls.crt':cert,'ca.crt':cert,'controller-public.pem':cert,'callback.token':jwt({sub:'worker-one',aud:'studio-guided-controller',role:'owning-worker'})})) writeFileSync(join(root,name),value,{mode:0o600});
  const values = {
    PORT:'8443',SERVICE_IDENTITY:'d2-local-smoke-service',CALLBACK_IDENTITY:'d2-local-smoke-callback',
    CALLBACK_BASE_URL:'https://127.0.0.1:9443',TLS_KEY_FILE:'/tls/tls.key',TLS_CERT_FILE:'/tls/tls.crt',TLS_CA_FILE:'/tls/ca.crt',
    CONTROLLER_CERTIFICATE_FINGERPRINT256:fingerprint,GUIDED_ENABLED:'true',GUIDED_WORKER_ID:'worker-one',
    GUIDED_JOURNAL_DIR:'/journal/data',GUIDED_CONTROLLER_ISSUER:'fixture-issuer',GUIDED_CONTROLLER_SUBJECT:'controller',
    GUIDED_CONTROLLER_PUBLIC_KEY_FILE:'/tls/controller-public.pem',GUIDED_CALLBACK_BASE_URL:'https://127.0.0.1:9443',GUIDED_CALLBACK_TOKEN_FILE:'/tls/callback.token',
  };
  writeFileSync(join(root,'env'),Object.entries(values).map(([k,v])=>`STUDIO_RUNNER_${k}=${v}`).join('\n')+'\n',{mode:0o600});
  process.exit(0);
}
if (mode !== 'serve') throw new Error('D2_MODE');
const {hash,validate} = await import('/app/dist/guided/contracts.js');
const {observationPolicyHash} = await import('/app/dist/guided/policyHash.js');
const {verifyGuidedJwt} = await import('/app/dist/guided/transport.js');
const tls = {key,cert,ca:cert};
const ensure = (condition) => { if (!condition) throw new Error('D2_ASSERTION'); };
const emit = (event,facts={}) => console.log(JSON.stringify({event,...facts}));
const policy = {policyRuleId:'structural',allowStructuralDiscovery:true,readGrants:[]};
// Same controlled context/grant/assignment composition as existing helpers, without executing actions.
const sessionId=randomUUID(), scopeHash='a'.repeat(64), origin='http://127.0.0.1:9';
const authoredInputs={schemaVersion:3,sessionId,scopeHash,sourceRevision:'source-1',configurationRevision:'config-1',inputs:['nav','next'].map((step,i)=>({inputId:`input-${step}`,sourceStepId:step,kind:'destination',value:`${origin}/${i===0?'source':'destination'}`,intendedSlot:'navigate.destination',provenance:{referenceKind:'sourceSpan',sourceRevision:'source-1',stepId:step,startUtf16:0,endUtf16:12,kind:'destination',intendedSlot:'navigate.destination'}}))};
const limits={maxSessionSeconds:600,maxActions:200,maxObservations:400,maxModelProposals:100,maxModelInputTokensTotal:128000,maxModelOutputTokensTotal:32000,maxObservationBytes:32768,maxObservationNodes:500,maxObservationDepth:8,maxSanitizedEvidenceBytesTotal:1048576,maxRuntimeValues:32,maxRuntimeValueBytes:4096,maxRuntimeValuesBytesTotal:65536,maxSourceSteps:100,maxStatementsPerStep:8};
const context={schemaVersion:3,sessionId,workerId:'worker-one',ownerFence:1,scopeHash,contextId:randomUUID(),contextRevision:1,sourceRevision:'source-1',configurationRevision:'config-1',versions:{contract:3},expiresAt:new Date(Date.now()+120_000).toISOString(),leaseExpiresAt:new Date(Date.now()+60_000).toISOString(),approvedOrigins:[origin],sourceStepIds:['nav','read','next','fill','submit'],authoredInputs,authoredInputsHash:hash(authoredInputs),materializationRevision:1,allocations:[{bindingId:'binding-one',needId:'need-one',producerStepId:'read',consumers:[{stepId:'fill',argumentSlot:'fill.value'}]}],producers:[],consumerEdges:[],limits,applicationPolicy:policy,policyHash:observationPolicyHash(policy)};
const scope={principalId:'fixture-author',csiId:'fixture-csi',environmentId:'fixture-environment',applicationId:'fixture-app',approvedOrigins:[origin],sourceRevision:context.sourceRevision,configurationRevision:context.configurationRevision,modelDataPolicyId:'metadata-only',valueTransferPolicyId:'same-origin',capabilities:['observe','navigate','click','fill','press','check','uncheck','selectOption','hover','read','assert']};
context.scopeHash=hash(scope);authoredInputs.scopeHash=context.scopeHash;context.authoredInputsHash=hash(authoredInputs);
const grant={schemaVersion:3,sessionId,testId:'controlled-test',state:'PREPARING',scope,scopeHash:context.scopeHash,runAuthorization:{authorizationId:'run-authority',kind:'scopedRun',authorizedAt:new Date().toISOString(),principalId:scope.principalId,scopeHash:context.scopeHash},versions:context.versions,owner:{workerId:context.workerId,fence:1,leaseExpiresAt:new Date(Date.now()+30_000).toISOString()},createdAt:new Date().toISOString(),expiresAt:context.expiresAt,limits,counters:{actions:0,observations:0,modelProposals:0,modelInputTokens:0,modelOutputTokens:0,sanitizedEvidenceBytes:0},sourceSteps:context.sourceStepIds.map(stepId=>({stepId,requiresAssertion:false}))};
const assignment={schemaVersion:3,assignmentId:randomUUID(),sessionId,workerId:context.workerId,scopeHash:context.scopeHash,sourceRevision:context.sourceRevision,configurationRevision:context.configurationRevision,versions:context.versions,expectedFence:0,expiresAt:context.expiresAt};
validate('runner-context',context);validate('session',grant);validate('assignment',assignment);
let claims=0, bootstraps=0, recordings=0;
const server=createServer({...tls,requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2'},(req,res)=>{
  const parts=[];let bytes=0;
  req.on('data',b=>{bytes+=b.length;if(bytes>1024*1024)req.destroy();else parts.push(b);});
  req.on('end',()=>{
    try {
      ensure(req.socket.authorized&&req.socket.getPeerCertificate().fingerprint256===fingerprint);
      verifyGuidedJwt(req.headers.authorization,{issuer:'fixture-issuer',subject:'worker-one',publicKey:cert.toString()},'studio-guided-controller','owning-worker');
      ensure(req.method==='POST'&&typeof req.headers['idempotency-key']==='string');
      const base=`/internal/v2/studio/guided-sessions/${sessionId}/`;
      ensure(req.url?.startsWith(base));const route=req.url.slice(base.length);
      const body=JSON.parse(Buffer.concat(parts).toString('utf8'));
      if(route==='claim') {
        const command=validate('commands',body,'claim');ensure(command.sessionId===sessionId&&command.workerId==='worker-one'&&command.expectedFence===(claims===0?0:1));claims++;
        grant.owner.leaseExpiresAt=new Date(Math.min(Date.now()+30_000,Date.parse(grant.expiresAt))).toISOString();
        res.writeHead(202,{'content-type':'application/json'});res.end(JSON.stringify(grant));return;
      }
      const definition=route==='bootstrap-evidence'?'bootstrap':route==='recording-evidence'?'recordingEvidence':route==='lifecycle'?'lifecycle':null;
      ensure(definition!==null);validate('bridge',body,definition);
      if(route==='bootstrap-evidence'){ensure(body.executionEvidence.kind==='initialBlank');bootstraps++;}
      if(route==='recording-evidence'){ensure(body.state==='STORED');recordings++;emit('D2_RECORDING_STORED',{recordings});}
      res.writeHead(202,{'content-type':'application/json'});res.end('{}');
    }catch {res.writeHead(401);res.end('{}');emit('D2_FIXTURE_REJECTED');process.exitCode=1;}
  });
});
await new Promise(resolve=>server.listen(9443,'127.0.0.1',resolve));
const post=(operation,body,fence)=>new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port:8443,path:`/internal/v2/studio/guided-sessions/${sessionId}/${operation}`,method:'POST',...tls,headers:{authorization:`Bearer ${jwt()}`,'content-type':'application/json','idempotency-key':`d2-${operation}`,...(fence===undefined?{}:{'x-owner-fence':String(fence)})},timeout:30_000},res=>{const parts=[];res.on('data',b=>parts.push(b));res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(parts).toString())});}catch{reject(new Error('D2_JSON'));}});});
  req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('D2_TIMEOUT')));req.end(JSON.stringify(body));
});
try {
  const owned=await post('assign',assignment);ensure(owned.status===200&&owned.body.status==='OWNED'&&owned.body.ownerFence===1&&claims===1);
  const started=await post('context',context,1);ensure(started.status===200&&bootstraps===1);
  emit('D2_READY_FOR_STOP',{assignStatus:owned.status,contextStatus:started.status,claims,bootstraps});
} catch {emit('D2_FIXTURE_FAILED');server.closeAllConnections();server.close();process.exitCode=1;}
process.on('SIGTERM',()=>{emit('D2_FIXTURE_TERMINAL',{claims,bootstraps,recordings});if(bootstraps!==1||recordings!==1)process.exitCode=1;server.closeAllConnections();server.close();});
