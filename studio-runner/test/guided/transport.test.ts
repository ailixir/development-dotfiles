import { describe,it,expect,vi,afterEach } from 'vitest';
import { createGuidedBridge, createGuidedServer, guidedCallback, verifyGuidedJwt, GUIDED_REFUSAL_CODES, GUIDED_REFUSAL_REASONS } from '../../src/guided/transport.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GuidedBrowser } from '../../src/run/guidedBrowser.js';
import { GuidedLaunchFailure } from '../../src/run/guidedBrowser.js';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { sign, generateKeyPairSync } from 'node:crypto';
import { jwt,jwtPolicy,testKey,testTls,testFingerprint,post } from '../helpers/guidedTls.js';
import schemas from '../../src/guided/schemas.json' with {type:'json'};
import { readFile } from 'node:fs/promises';
import { validate,hash,identity,canonical,auditSchemaBundle } from '../../src/guided/contracts.js';
import type { ObservationRefresh } from '../../src/guided/types.js';
import { parseWireJson } from '../../src/guided/json.js';
import { assignmentFor,guidedContext,ownershipSession,withContextPolicy } from '../helpers/guided.js';
afterEach(()=>{vi.restoreAllMocks();});
describe('guided strict identity and wire schemas',()=>{
  it('accepts only the designated RS256 service audience, role, issuer, subject and bounded time',()=>{
    expect(()=>{ verifyGuidedJwt(`Bearer ${jwt()}`,jwtPolicy,'studio-guided-runner','backend-controller'); }).not.toThrow();
    for(const override of [{aud:'studio-guided-controller'},{role:'user'},{sub:'different'},{iss:'different'},{exp:0},{iat:Math.floor(Date.now()/1000)+100},{exp:Math.floor(Date.now()/1000)+3600}])expect(()=>{ verifyGuidedJwt(`Bearer ${jwt(override)}`,jwtPolicy,'studio-guided-runner','backend-controller'); }).toThrow('AUTH_DENIED');
    expect(()=>{ verifyGuidedJwt(`Bearer ${jwt().slice(0,-10)}changed`,jwtPolicy,'studio-guided-runner','backend-controller'); }).toThrow('AUTH_DENIED');
  });
  it('rejects duplicate/extra JWT keys, trailing bytes, optional type, fractional/future times and weak RSA',()=>{
    vi.spyOn(Date,'now').mockReturnValue(1_900_000_000_000);
    const now=Math.floor(Date.now()/1000);
    const claims=JSON.stringify({iss:'fixture-issuer',sub:'controller',aud:'studio-guided-runner',role:'backend-controller',iat:now,exp:now+180});
    const signed=(header:string,payload:string)=>{const body=`${Buffer.from(header).toString('base64url')}.${Buffer.from(payload).toString('base64url')}`;return `Bearer ${body}.${sign('RSA-SHA256',Buffer.from(body),testKey).toString('base64url')}`;};
    for(const [header,payload] of [['{"alg":"RS256"}',claims],['{"alg":"RS256","typ":"JWT","alg":"RS256"}',claims],['{"alg":"RS256","typ":"JWT","extra":"x"}',claims],['{"alg":"RS256","typ":"JWT"}',claims.replace('"iat":',`"iat":0,"iat":`)],['{"alg":"RS256","typ":"JWT"}',`${claims}null`]])expect(()=>{ verifyGuidedJwt(signed(header??'',payload??''),jwtPolicy,'studio-guided-runner','backend-controller'); }).toThrow('AUTH_DENIED');
    for(const override of [{nbf:-1},{iat:now+1},{iat:-1},{iat:now+0.5},{extra:'x'},{nbf:now+0.5}])expect(()=>{ verifyGuidedJwt(`Bearer ${jwt(override)}`,jwtPolicy,'studio-guided-runner','backend-controller'); }).toThrow('AUTH_DENIED');
    const weak=generateKeyPairSync('rsa',{modulusLength:1024});const body=`${Buffer.from('{"alg":"RS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(claims).toString('base64url')}`;const weakToken=`${body}.${sign('RSA-SHA256',Buffer.from(body),weak.privateKey).toString('base64url')}`;expect(()=>{ verifyGuidedJwt(`Bearer ${weakToken}`,{...jwtPolicy,publicKey:weak.publicKey.export({type:'spki',format:'pem'}).toString()},'studio-guided-runner','backend-controller'); }).toThrow('AUTH_DENIED');
  });
  it('keeps the packaged schemas byte-equivalent in meaning to the approved contract bundle',async()=>{
    for(const [file,schema]of Object.entries(schemas))expect(JSON.parse(await readFile(new URL(`../../../docs/specs/studio-observed-authoring/contracts/v3/${file}`,import.meta.url),'utf8')) as unknown).toEqual(schema);
  });
  it('enforces lowered limits, exact closed shapes and invalid Unicode',()=>{
    const context=guidedContext('https://example.test');expect(()=>validate('runner-context',context)).not.toThrow();
    for(const value of [{...context,rawValue:'forbidden'},{...context,limits:{...context.limits,maxActions:201}},{...context,contextId:'\ud800'},{...context,expiresAt:'2026-02-31T00:00:00Z'}])expect(()=>validate('runner-context',value)).toThrow();
  });
  it('matches the independently frozen refresh callback correlation vector',async()=>{
    const fixture=JSON.parse(await readFile(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json',import.meta.url),'utf8')) as {observationRefreshCorrelationVector:{request:ObservationRefresh;idempotencyKey:string;requestDigest:string;canonical:string;callbackKey:string}};
    const vector=fixture.observationRefreshCorrelationVector;expect(hash(vector.request)).toBe(vector.requestDigest);const input={identity:identity(vector.request),idempotencyKey:vector.idempotencyKey,requestDigest:hash(vector.request)};expect(canonical(input)).toBe(vector.canonical);expect(`oref-${hash(input)}`).toBe(vector.callbackKey);
  });

});

it('audits the enforced schema subset and refuses unresolved or unsupported semantics',()=>{
  const root={$id:'https://schema.test/a',type:'object',properties:{child:{type:'string'}},definitions:{value:{type:'integer'}},allOf:[{$ref:'#/definitions/value'}]};
  expect(()=>auditSchemaBundle({root})).not.toThrow();
  for(const mutation of [{$ref:'#/definitions/missing'},{$ref:'https://foreign.test/a'},{$ref:'#/properties/child/type'},{$ref:'#/definitions/value~2'},{$ref:'#value'},{$ref:'https://schema.test/a'},{anyOf:[{type:'string'}]},{format:'email'},{additionalProperties:{}},{type:'number'},{items:[]},{pattern:'['}]) {
    expect(()=>auditSchemaBundle({root:{$id:root.$id,...mutation}})).toThrow();
  }
});

it('rejects duplicate/trailing/invalidUTF8 and noncanonical numeric wire bytes without echoing input',()=>{
  for(const raw of [Buffer.from('{"a":1,"\\u0061":2}'),Buffer.from('{"child":{"x":1,"x":2}}'),Buffer.from('{} {}'),Buffer.from('{"n":1e2}'),Buffer.from('{"n":1.0}'),Buffer.from('{"n":-0}'),Buffer.from('{"n":9007199254740992}'),Buffer.from('{"s":"\\ud800"}'),Buffer.from([123,34,115,34,58,34,0xc3,0x28,34,125]),Buffer.from('\ufeff{}'),Buffer.from('\u00a0{}'),Buffer.from('[1,]'),Buffer.from('{"a":1,}'),Buffer.from('['.repeat(66)+'0'+']'.repeat(66))])expect(()=>parseWireJson(raw)).toThrow('SCHEMA');
  expect(parseWireJson(Buffer.from(' {"a":[true,false,null,-12,"é\\n"],"__proto__":{}}\n'))).toEqual({a:[true,false,null,-12,'é\n'],['__proto__']:{}});
});

it('matches the shared UTC timestamp profile on actual assignment schemas',async()=>{
  const fixture=JSON.parse(await readFile(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/wire-parity.fixtures.json',import.meta.url),'utf8')) as {dateTimes:{value:string;accepted:boolean}[]};
  const assignment=assignmentFor(guidedContext('https://example.test'));
  for(const vector of fixture.dateTimes) {
    const check=()=>validate('assignment',{...assignment,expiresAt:vector.value});
    if(vector.accepted)expect(check,vector.value).not.toThrow();else expect(check,vector.value).toThrow('SCHEMA');
  }
});

it('agrees with the shared raw-byte JSON parity corpus',async()=>{
  const fixture=JSON.parse(await readFile(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/wire-parity.fixtures.json',import.meta.url),'utf8')) as {rawJson:{name:string;base64:string;accepted:boolean}[]};
  for(const vector of fixture.rawJson) {
    const check=()=>parseWireJson(Buffer.from(vector.base64,'base64'));
    if(vector.accepted)expect(check,vector.name).not.toThrow();else expect(check,vector.name).toThrow('SCHEMA');
  }
});
describe('STUDIO-OBS-013 recording-evidence callback route (applied by R14 from R13 queue)',()=>{
  const bodies=()=>{const id=identity(guidedContext('https://example.test'));return{lifecycle:{...id,reason:'CANCELLED'},recording:{...id,recordingId:'recording-1',state:'UNAVAILABLE',partial:false,timings:[]}};};
  it('validates the route against recordingEvidence locally, before any credential lookup or send',async()=>{
    const token=vi.fn(()=>Promise.reject(new Error('TOKEN_REACHED')));
    const send=guidedCallback({baseUrl:'https://127.0.0.1:9',tls:testTls,controllerCertificateFingerprint256:testFingerprint,token});
    const {lifecycle,recording}=bodies();
    await expect(send('recording-evidence',lifecycle)).rejects.toThrow(/^SCHEMA$/u);
    await expect(send('lifecycle',recording)).rejects.toThrow(/^SCHEMA$/u);
    expect(token).not.toHaveBeenCalled();
    // Positive control: the same sender passes validation for the right shape and only then looks up the credential.
    await expect(send('recording-evidence',recording)).rejects.toThrow(/^TOKEN_REACHED$/u);expect(token).toHaveBeenCalledOnce();
  });
  it('posts a valid recordingEvidence body with the owner fence and the caller idempotency key',async()=>{
    const seen:{url?:string|undefined;fence?:string|string[]|undefined;key?:string|string[]|undefined;body?:unknown}={};
    const server=createServer({...testTls},(req,res)=>{const parts:Buffer[]=[];req.on('data',(part:Buffer)=>{parts.push(part);});req.on('end',()=>{seen.url=req.url;seen.fence=req.headers['x-owner-fence'];seen.key=req.headers['idempotency-key'];seen.body=JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;res.writeHead(202);res.end();});});
    await new Promise<void>(resolve=>{server.listen(0,'127.0.0.1',resolve);});
    try{
      const {recording}=bodies();const port=(server.address() as AddressInfo).port;
      await guidedCallback({baseUrl:`https://127.0.0.1:${String(port)}`,tls:testTls,controllerCertificateFingerprint256:testFingerprint,token:()=>Promise.resolve('fixture-token')})('recording-evidence',recording,'recording-key-1');
      expect(seen).toEqual({url:`/internal/v2/studio/guided-sessions/${encodeURIComponent(recording.sessionId)}/recording-evidence`,fence:String(recording.ownerFence),key:'recording-key-1',body:recording});
    }finally{server.closeAllConnections();await new Promise<void>(resolve=>{server.close(()=>{resolve();});});}
  });
});
describe('STUDIO-OBS-014 AC-1 guided server configuration',()=>{
  it('refuses an observation application policy supplied as server configuration',()=>{
    const options:Parameters<typeof createGuidedServer>[0]={workerId:'worker-one',journalDirectory:'/nonexistent',tls:{},controllerJwt:jwtPolicy,controllerCertificateFingerprint256:'AA',launch:()=>Promise.reject(new Error('unused')),claim:()=>Promise.reject(new Error('unused')),callback:()=>Promise.resolve()};
    expect(()=>createGuidedServer({...options,applicationPolicy:{policyRuleId:'structural',allowStructuralDiscovery:true,readGrants:[]}})).toThrow(/^CONFIGURATION_DENIED$/u);
    // ar-mounted-rules: field rules are refused as a server option in every form, never silently dropped.
    const readRule={testId:'source',name:'Business reference',policyRuleId:'reference-read',classification:'permittedBusinessData'};
    for(const rules of [[],[readRule]])expect(()=>createGuidedServer({...options,rules} as unknown as Parameters<typeof createGuidedServer>[0])).toThrow(/^CONFIGURATION_DENIED$/u);
    // Positive control: the same options without the key construct a (not yet listening) server.
    expect(createGuidedServer(options).server.listening).toBe(false);
  });
});
describe('STUDIO-OBS-009 AC-1 the bridge owns no listener',()=>{
  const bridgeOptions:Parameters<typeof createGuidedBridge>[0]={workerId:'worker-one',journalDirectory:'/nonexistent',controllerJwt:jwtPolicy,controllerCertificateFingerprint256:testFingerprint,launch:()=>Promise.reject(new Error('unused')),claim:()=>Promise.reject(new Error('unused')),callback:()=>Promise.resolve(),diagnosticStderr:()=>undefined};
  it('is a request handler and a session closer, with no server of its own, and refuses the same configuration the server variant refuses',async()=>{
    const bridge=createGuidedBridge(bridgeOptions);
    expect(Object.keys(bridge).sort()).toEqual(['closeSessions','handle']);
    expect(typeof bridge.handle).toBe('function');
    await expect(bridge.closeSessions()).resolves.toBeUndefined();
    expect(()=>createGuidedBridge({...bridgeOptions,applicationPolicy:{policyRuleId:'structural',allowStructuralDiscovery:true,readGrants:[]}})).toThrow(/^CONFIGURATION_DENIED$/u);
    expect(()=>createGuidedBridge({...bridgeOptions,rules:[]} as unknown as Parameters<typeof createGuidedBridge>[0])).toThrow(/^CONFIGURATION_DENIED$/u);
    expect(()=>createGuidedBridge({...bridgeOptions,capacity:2})).toThrow(/^CONFIGURATION_DENIED$/u);
  });
  it('keeps its own peer pin: a client certificate the CA trusts but the pin does not name is AUTH_DENIED, whatever listener hosts it',async()=>{
    const context=guidedContext('https://example.test');
    for(const [pin,expected] of [['AA:BB',401],[testFingerprint,409]] as const){
      const bridge=createGuidedBridge({...bridgeOptions,controllerCertificateFingerprint256:pin});
      const host=createServer({...testTls,requestCert:true,rejectUnauthorized:true},(req,res)=>{bridge.handle(req,res);});
      await new Promise<void>(resolve=>{host.listen(0,'127.0.0.1',resolve);});
      try{
        const port=(host.address() as AddressInfo).port;
        const reply=await post(port,`/internal/v2/studio/guided-sessions/${context.sessionId}/assign`,assignmentFor(context),{fence:null,key:'assign-1'});
        // Pinned: past the pin and the JWT, the unusable claim port ends the assignment as a definite CONTEXT_LOST refusal (409).
        expect(reply.status).toBe(expected);
        expect(reply.body).toEqual({code:expected===401?'AUTH_DENIED':'CONTEXT_LOST'});
      }finally{host.closeAllConnections();await new Promise<void>(resolve=>{host.close(()=>{resolve();});});await bridge.closeSessions().catch(()=>undefined);}
    }
  });
});
describe('STUDIO-OBS-014 AC-1 definite context refusal on the wire (AR-2 r14-stops ruling 2)',()=>{
  it('keeps bridge#/definitions/refusal equal to the transport refusal vocabulary',()=>{
    const refusal=(schemas['bridge.schema.json'] as unknown as {definitions:{refusal:{properties:{code:{enum:string[]};reason:{enum:string[]}}}}}).definitions.refusal;
    expect(refusal.properties.code.enum).toEqual([...GUIDED_REFUSAL_CODES,'POLICY_DENIED']);
    expect(refusal.properties.reason.enum).toEqual([...GUIDED_REFUSAL_REASONS]);
  });
  it('answers a policy mismatch and a context without the policy fields with schema-valid 409 refusals and changes nothing on the worker',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'guided-refusal-'));
    const context=guidedContext('https://example.test');const grant=ownershipSession(context);const assignment=assignmentFor(context);
    const browser:GuidedBrowser={evidence:{kind:'initialBlank',sessionId:context.sessionId,contextId:context.contextId,creationId:randomUUID(),documentId:randomUUID(),bootstrapId:randomUUID(),url:'about:blank',origin:null,generation:0},blankMatches:()=>Promise.resolve(true),navigateBlank:()=>Promise.resolve(),close:()=>Promise.resolve(),terminate:vi.fn(()=>Promise.resolve()),orderlyClosed:()=>true,observations:{withhold:()=>Promise.resolve(),dispose:()=>Promise.resolve(),matches:()=>Promise.resolve(false),observe:()=>Promise.reject(new Error('unused'))}};
    const launch=vi.fn(()=>Promise.resolve(browser));const callbacks:string[]=[];
    const app=createGuidedServer({workerId:context.workerId,journalDirectory:directory,tls:testTls,controllerJwt:jwtPolicy,controllerCertificateFingerprint256:testFingerprint,launch,
      claim:()=>Promise.resolve({...structuredClone(grant),owner:{...grant.owner,leaseExpiresAt:new Date(Math.min(Date.now()+30_000,Date.parse(grant.expiresAt))).toISOString()}}),
      callback:route=>{callbacks.push(route);return Promise.resolve();}});
    await new Promise<void>(resolve=>{app.server.listen(0,'127.0.0.1',resolve);});
    try{
      const port=(app.server.address() as AddressInfo).port;const path=`/internal/v2/studio/guided-sessions/${context.sessionId}`;
      const owned=await post(port,`${path}/assign`,assignment,{fence:null,key:'assign-1'});expect(owned.status).toBe(200);
      const forged=withContextPolicy(structuredClone(context),{policyRuleId:'structural',allowStructuralDiscovery:true,readGrants:[]});forged.applicationPolicy={policyRuleId:'widened',allowStructuralDiscovery:true,readGrants:[]} as unknown as typeof forged.applicationPolicy;
      const missing=Object.fromEntries(Object.entries(structuredClone(context)).filter(([key])=>key!=='applicationPolicy'&&key!=='policyHash'));
      for(const [body,code,key] of [[forged,'IDENTITY_MISMATCH','context-forged'],[missing,'SCHEMA','context-missing']] as const){
        const reply=await post(port,`${path}/context`,body,{key});
        expect(reply.status).toBe(409);expect(reply.body).toEqual({code});expect(()=>validate('bridge',reply.body,'refusal')).not.toThrow();
        // A replay of the refused request is still a definite refusal. Before any runtime exists the
        // transport replay path answers IDENTITY_MISMATCH (pre-existing, transport.ts replay branch).
        const again=await post(port,`${path}/context`,body,{key});
        expect(again.status).toBe(409);expect(()=>validate('bridge',again.body,'refusal')).not.toThrow();expect(again.body).toEqual({code: 'IDENTITY_MISMATCH'});
      }
      // Nothing changed: no launch, no callback, the assignment receipt is the same, and the bound context is then accepted once.
      expect(launch).not.toHaveBeenCalled();expect(callbacks).toEqual([]);
      expect(await post(port,`${path}/assign`,assignment,{fence:null,key:'assign-2'})).toEqual(owned);
      const accepted=await post(port,`${path}/context`,context,{key:'context-bound'});expect(accepted.status).toBe(200);expect(accepted.body).toEqual(identity(context));expect(launch).toHaveBeenCalledOnce();
    }finally{await app.close().catch(()=>undefined);await rm(directory,{recursive:true,force:true});}
  });
});
describe('REL-001 a refused start-up says why on stderr and nowhere else',()=>{
  it('answers the unchanged CONTEXT_LOST refusal and writes one value-free line naming the failed step and the browser exit',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'guided-rel001-'));
    const context=guidedContext('https://example.test');const grant=ownershipSession(context);const assignment=assignmentFor(context);
    const privatePath='/Users/private-canary/checks-guided-profile';const lines:string[]=[];
    const exited=new Error(`browserType.launchPersistentContext: Target page, context or browser has been closed\n<process did exit: exitCode=null, signal=SIGABRT> ${privatePath}`);
    const app=createGuidedServer({workerId:context.workerId,journalDirectory:directory,tls:testTls,controllerJwt:jwtPolicy,controllerCertificateFingerprint256:testFingerprint,
      launch:()=>Promise.reject(new GuidedLaunchFailure(()=>Promise.resolve(),exited,'PROCESS')),
      claim:()=>Promise.resolve({...structuredClone(grant),owner:{...grant.owner,leaseExpiresAt:new Date(Math.min(Date.now()+30_000,Date.parse(grant.expiresAt))).toISOString()}}),
      callback:()=>Promise.resolve(),diagnosticStderr:text=>{lines.push(text);}});
    await new Promise<void>(resolve=>{app.server.listen(0,'127.0.0.1',resolve);});
    try{
      const port=(app.server.address() as AddressInfo).port;const path=`/internal/v2/studio/guided-sessions/${context.sessionId}`;
      expect((await post(port,`${path}/assign`,assignment,{fence:null,key:'assign-1'})).status).toBe(200);expect(lines).toEqual([]);
      const refused=await post(port,`${path}/context`,context,{key:'context-1'});
      expect(refused.status).toBe(409);expect(refused.body).toEqual({code:'CONTEXT_LOST'});expect(()=>validate('bridge',refused.body,'refusal')).not.toThrow();
      expect(lines).toHaveLength(1);const line=lines[0]??'';expect(line).not.toContain(privatePath);expect(line).not.toContain(context.sessionId);
      const facts=JSON.parse(line.slice('GUIDED_START_FAILED '.length)) as {operation:string;session:string;elapsedMs:number;links:unknown[]};
      expect(facts).toMatchObject({operation:'context',session:hash(context.sessionId).slice(0,16)});expect(Number.isInteger(facts.elapsedMs)&&facts.elapsedMs>=0).toBe(true);
      expect(facts.links).toEqual([{name:'GuidedStartFailure',code:'CONTEXT_LOST',phase:'LAUNCH'},{name:'Error',code:'CONTEXT_LOST'},{name:'GuidedLaunchFailure',code:'CONTEXT_LOST',phase:'PROCESS'},{name:'Error',kind:'TARGET_CLOSED',exitCode:null,signal:'SIGABRT'}]);
    }finally{await app.close().catch(()=>undefined);await rm(directory,{recursive:true,force:true});}
  });
});
