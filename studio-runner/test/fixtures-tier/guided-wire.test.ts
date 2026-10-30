import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { it,expect } from 'vitest';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TLSSocket } from 'node:tls';
import { createGuidedServer,guidedCallback,guidedClaimClient,verifyGuidedJwt } from '../../src/guided/transport.js';
import { launchGuidedBrowser } from '../../src/run/browser.js';
import { guidedContext,proposal,dispatch,ownershipSession,assignmentFor } from '../helpers/guided.js';
import { testTls,testFingerprint,jwtPolicy,jwt,post } from '../helpers/guidedTls.js';
import { identity,hash,validate } from '../../src/guided/contracts.js';
import type { BridgeBootstrap,BridgePreparation,BridgeOrdinaryOutcome as BridgeOutcome,CommandsClaim,AssignmentReceipt,BridgeObservation } from '../../src/guided/types.js';

it('uses real mTLS + service JWT for blank-to-Chromium control and data-free callbacks',async()=>{
  let receipts=0;const pages=httpServer((req,res)=>{if(req.url!=='/favicon.ico')receipts++;res.setHeader('content-type','text/html');res.end('<button>Ready</button>');});await new Promise<void>(resolve=>pages.listen(0,'127.0.0.1',resolve));const pageAddress=pages.address();if(!pageAddress||typeof pageAddress==='string')throw new Error('PORT');
  const messages:{route:string;body:unknown;key?:string}[]=[];const claims:CommandsClaim[]=[];let currentGrant:ReturnType<typeof ownershipSession>|null=null;
  const callbacks=httpsServer({...testTls,requestCert:true,rejectUnauthorized:true},(req,res)=>{
    try {expect(req.socket).toBeInstanceOf(TLSSocket);verifyGuidedJwt(req.headers.authorization,{...jwtPolicy,subject:'worker-one'},'studio-guided-controller','owning-worker');}catch{res.writeHead(401);res.end();return;}
    let text='';req.on('data',(b:Buffer)=>{text+=b.toString();});req.on('end',()=>{const route=req.url?.split('/').at(-1)??'';const body=JSON.parse(text) as unknown;if(route==='claim'){const command=validate<CommandsClaim>('commands',body,'claim');claims.push(command);if(!currentGrant){res.writeHead(409);res.end('{}');return;}currentGrant.owner.leaseExpiresAt=new Date(Math.min(Date.now()+30_000,Date.parse(currentGrant.expiresAt))).toISOString();res.writeHead(202);res.end(JSON.stringify(currentGrant));return;}messages.push({route,body,...(typeof req.headers['idempotency-key']==='string'?{key:req.headers['idempotency-key']}:{})});res.writeHead(202);res.end(JSON.stringify({sessionResponse:'x'.repeat(70_000)}));});
  });await new Promise<void>(resolve=>callbacks.listen(0,'127.0.0.1',resolve));const callbackAddress=callbacks.address();if(!callbackAddress||typeof callbackAddress==='string')throw new Error('PORT');
  const directory=await mkdtemp(join(tmpdir(),'guided-wire-'));const context=guidedContext(`http://localhost:${String(pageAddress.port)}`);
  currentGrant=ownershipSession(context);const assignment=assignmentFor(context);
  const client={baseUrl:`https://127.0.0.1:${String(callbackAddress.port)}`,tls:testTls,controllerCertificateFingerprint256:testFingerprint,token:()=>Promise.resolve(jwt({aud:'studio-guided-controller',role:'owning-worker',sub:context.workerId}))};
  const app=createGuidedServer({workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:directory,tls:testTls,controllerJwt:jwtPolicy,controllerCertificateFingerprint256:testFingerprint,launch:launchGuidedBrowser,claim:guidedClaimClient(client),callback:guidedCallback({baseUrl:`https://127.0.0.1:${String(callbackAddress.port)}`,tls:testTls,controllerCertificateFingerprint256:testFingerprint,token:()=>Promise.resolve(jwt({aud:'studio-guided-controller',role:'owning-worker',sub:context.workerId}))})});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const address=app.server.address();if(!address||typeof address==='string')throw new Error('PORT');const path=`/internal/v2/studio/guided-sessions/${context.sessionId}`;
  try {
    await expect(post(address.port,`${path}/context`,context,{certificate:false})).rejects.toThrow();
    expect((await post(address.port,`${path}/context`,context,{token:jwt({aud:'public-bff'})})).status).toBe(401);
    expect((await post(address.port,`${path}/context`,context,{fence:2})).status).toBe(409);
    expect(receipts).toBe(0);expect((await post(address.port,`${path}/context`,context,{key:'unassigned'})).status).toBe(409);
    const assignmentText=JSON.stringify(assignment);
    const malformed=[Buffer.from(assignmentText.replace('"schemaVersion":3','"schemaVersion":1,"schemaVersion":3')),Buffer.from(assignmentText.replace('"schemaVersion":3','"schemaVersion":1,"\\u0073chemaVersion":2')),Buffer.from(assignmentText+' {}'),Buffer.from(assignmentText.replace('"contract":3','"contract":1,"contract":3')),Buffer.from(assignmentText.replace('"expectedFence":0','"expectedFence":-0')),Buffer.concat([Buffer.from(assignmentText.slice(0,-1)+',"bad":"'),Buffer.from([0xc3,0x28]),Buffer.from('"}')])];
    for(const raw of malformed){const denied=await post(address.port,`${path}/assign`,assignment,{fence:null,raw});expect(denied.status).toBe(409);expect(denied.body).toEqual({code:'SCHEMA'});expect(claims).toHaveLength(0);expect(receipts).toBe(0);}
    const firstOwned=await post(address.port,`${path}/assign`,assignment,{fence:null});expect(firstOwned.status).toBe(200);expect(claims).toHaveLength(1);expect(receipts).toBe(0);
    // Real wall clock and real mutually authenticated claim HTTP: no fixture impersonation.
    await new Promise(resolve=>setTimeout(resolve,33_000));expect(claims.length).toBeGreaterThanOrEqual(4);expect(claims[0]?.expectedFence).toBe(0);expect(claims.slice(1).every(claim=>claim.expectedFence===1)).toBe(true);expect(receipts).toBe(0);
    const currentOwned=await post(address.port,`${path}/assign`,assignment,{fence:null});expect(currentOwned.status).toBe(200);expect((currentOwned.body as AssignmentReceipt).status).toBe('OWNED');expect(Date.parse((currentOwned.body as AssignmentReceipt).leaseExpiresAt??'')).toBeGreaterThan(Date.parse((firstOwned.body as AssignmentReceipt).leaseExpiresAt??''));
    expect((await post(address.port,`${path}/context`,context)).status).toBe(200);expect(receipts).toBe(0);
    expect((await post(address.port,`${path}/context`,context)).status).toBe(200);expect(messages).toHaveLength(1);
    expect((await post(address.port,`${path}/context`,{...context,materializationRevision:2})).body).toEqual({code:'IDEMPOTENCY_CONFLICT'});
    const bootstrap=validate<BridgeBootstrap>('bridge',messages[0]?.body,'bootstrap');expect(bootstrap.executionEvidence.origin).toBeNull();
    const p=proposal(context,bootstrap.executionEvidence,'nav',{kind:'navigate',destinationInputId:'input-nav'});const prepared=await post(address.port,`${path}/prepare`,{...identity(context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10_000).toISOString()});expect(prepared.status).toBe(200);
    const repeated=await post(address.port,`${path}/prepare`,{...identity(context),proposal:p,requestDigest:hash(p),expiresAt:(prepared.body as BridgePreparation).expiresAt});expect(repeated.body).toEqual(prepared.body);
    const request=dispatch(context,p,validate<BridgePreparation>('bridge',prepared.body,'preparation'));const completed=await post(address.port,`${path}/dispatch`,request);expect(completed.status).toBe(200);expect((completed.body as BridgeOutcome).ledger.state).toBe('SUCCEEDED');expect(receipts).toBe(1);
    expect((await post(address.port,`${path}/dispatch`,request)).status).toBe(409);expect(receipts).toBe(1);expect(messages.map(m=>m.route)).toEqual(['bootstrap-evidence','outcomes','observations']);
    const priorObservation=(messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;
    const refresh={...identity(context),expectedGeneration:priorObservation.generation,focus:{stepText:'',targetIntents:[]}};const refreshKey='refresh-one';
    const refreshed=await Promise.all([post(address.port,`${path}/observe`,refresh,{key:refreshKey}),post(address.port,`${path}/observe`,refresh,{key:refreshKey})]);expect(refreshed.map(result=>result.status)).toEqual([200,200]);expect(refreshed[0].body).toEqual(refreshed[1].body);expect(messages.filter(m=>m.route==='observations')).toHaveLength(2);expect(receipts).toBe(1);
    expect(messages.at(-1)?.key).toBe(`oref-${hash({identity:identity(refresh),idempotencyKey:refreshKey,requestDigest:hash(refresh)})}`);
    expect((await post(address.port,`${path}/observe`,{...refresh,expectedGeneration:0},{key:refreshKey})).body).toEqual({code:'IDEMPOTENCY_CONFLICT'});
    const generation=(refreshed[0].body as BridgeObservation).observation.generation;expect(generation).toBe(priorObservation.generation+1);
    expect((await post(address.port,`${path}/observe`,{...refresh,expectedGeneration:generation},{key:'refresh-two'})).status).toBe(200);expect((await post(address.port,`${path}/observe`,refresh,{key:refreshKey})).status).toBe(409);expect(messages.filter(m=>m.route==='observations')).toHaveLength(3);expect(receipts).toBe(1);
    expect((await post(address.port,`${path}/stop`,{...identity(context),reason:'CANCELLED'})).status).toBe(200);
    expect((await post(address.port,`${path}/context`,context)).status).toBe(409);
    expect((await post(address.port,`${path}/assign`,assignment,{fence:null})).status).toBe(409);
    expect((await post(address.port,`${path}/observe`,{...refresh,expectedGeneration:generation},{key:'refresh-two'})).status).toBe(409);
  } finally {await app.close();callbacks.closeAllConnections();pages.closeAllConnections();await Promise.all([new Promise<void>(resolve=>callbacks.close(()=>{ resolve(); })),new Promise<void>(resolve=>pages.close(()=>{ resolve(); }))]);await rm(directory,{recursive:true,force:true});}
});
