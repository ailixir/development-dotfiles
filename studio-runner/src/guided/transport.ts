import { createServer, request as httpsRequest } from 'node:https';
import type { ServerOptions } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { TLSSocket, checkServerIdentity } from 'node:tls';
import { verify, randomUUID, createPublicKey } from 'node:crypto';
import { parseWireJson } from './json.js';
import { hash, identity, insist, validate } from './contracts.js';
import type { BridgeIdentity, Assignment, AssignmentStop, AssignmentLifecycle, Session } from './types.js';
import { GuidedOwnership } from './ownership.js';
import type { ClaimPort } from './ownership.js';
import type { GuidedRuntimeOptions } from './runtime.js';

export interface GuidedJwtPolicy { issuer: string; publicKey: string; subject: string; }
/** JWT uses the same fatal, duplicate-aware parser as the wire, with a closed flat shape. */
function jwtObject(segment: string, allowed: readonly string[]): Record<string, unknown> {
  insist(/^[A-Za-z0-9_-]+$/u.test(segment), 'AUTH_DENIED');
  const bytes = Buffer.from(segment, 'base64url'); insist(bytes.toString('base64url') === segment, 'AUTH_DENIED');
  const value = parseWireJson(bytes);
  insist(value && typeof value === 'object' && !Array.isArray(value), 'AUTH_DENIED');
  const record = value as Record<string, unknown>;
  insist(Object.keys(record).every(key => allowed.includes(key)), 'AUTH_DENIED');
  return record;
}
export function verifyGuidedJwt(authorization: string | undefined, policy: GuidedJwtPolicy, audience: string, role: string): void {
  try {
    insist(authorization !== undefined && authorization.startsWith('Bearer ') && authorization.length <= 8192, 'AUTH_DENIED');
    const [header, payload, signature, extra] = authorization.slice(7).split('.');
    insist(header && payload && signature && extra === undefined && /^[A-Za-z0-9_-]+$/u.test(signature), 'AUTH_DENIED');
    const h = jwtObject(header, ['alg','typ']);
    const p = jwtObject(payload, ['iss','sub','aud','role','iat','exp','nbf']);
    insist(h.alg === 'RS256' && h.typ === 'JWT', 'AUTH_DENIED');
    const key = createPublicKey(policy.publicKey);
    insist(key.asymmetricKeyType === 'rsa' && (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048, 'AUTH_DENIED');
    insist(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), key, Buffer.from(signature, 'base64url')), 'AUTH_DENIED');
    const now = Math.floor(Date.now() / 1000);
    insist(p.iss === policy.issuer && p.aud === audience && p.role === role && p.sub === policy.subject && typeof p.sub === 'string' && p.sub.trim().length > 0 && p.sub.length <= 256 && typeof p.exp === 'number' && typeof p.iat === 'number' && Number.isSafeInteger(p.exp) && Number.isSafeInteger(p.iat) && p.exp > now && p.iat >= 0 && p.iat <= now && p.exp > p.iat && p.exp - p.iat <= 300 && (p.nbf === undefined || typeof p.nbf === 'number' && Number.isSafeInteger(p.nbf) && p.nbf >= 0 && p.nbf <= now), 'AUTH_DENIED');
  } catch { throw new Error('AUTH_DENIED'); }
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  const parts: Buffer[] = []; let size = 0;
  for await (const raw of req) { const part = raw as Buffer; size += part.length; insist(size <= 1024 * 1024, 'SCHEMA'); parts.push(part); }
  try { return parseWireJson(Buffer.concat(parts)); } catch { throw new Error('SCHEMA'); }
}
export interface GuidedServerOptions extends GuidedRuntimeOptions {
  tls: Pick<ServerOptions, 'key' | 'cert' | 'ca'>;
  claim: ClaimPort;
  controllerJwt: GuidedJwtPolicy;
  /** Bind the service certificate as well as the issuer JWT to the controller. */
  controllerCertificateFingerprint256: string;
  capacity?: number;
}
export function createGuidedServer(options: GuidedServerOptions) {
  insist(!process.env.DEBUG && !process.env.PWDEBUG && !process.env.NODE_DEBUG && !process.env.NODE_OPTIONS, 'CONFIGURATION_DENIED');
  const ownership = new GuidedOwnership(options);
  const replay = new Map<string, {digest:string;promise:Promise<unknown>}>();
  const server = createServer({...options.tls,minVersion:'TLSv1.2',requestCert:true,rejectUnauthorized:true},(req,res)=>{
    const handle=async():Promise<void>=>{
      insist(req.socket instanceof TLSSocket&&req.socket.authorized&&req.socket.getPeerCertificate().fingerprint256===options.controllerCertificateFingerprint256,'AUTH_DENIED');
      verifyGuidedJwt(req.headers.authorization,options.controllerJwt,'studio-guided-runner','backend-controller');
      insist(req.method==='POST'&&req.headers['content-type']?.split(';')[0]==='application/json','SCHEMA');
      const route=/^\/internal\/v2\/studio\/guided-sessions\/([^/]+)\/(assign|context|prepare|dispatch|observe|stop)$/u.exec(req.url??'');insist(route,'SCHEMA');const sessionId=decodeURIComponent(route[1]??'');const operation=route[2];
      const key=req.headers['idempotency-key'];insist(typeof key==='string'&&key.length>0&&key.length<=256,'SCHEMA');
      const body=await readBody(req);insist(body&&typeof body==='object'&&!Array.isArray(body),'SCHEMA');
      let envelope:BridgeIdentity|null=null;
      if(operation==='assign'){
        const assignment=validate<Assignment>('assignment',body);insist(assignment.sessionId===sessionId&&assignment.workerId===options.workerId&&req.headers['x-owner-fence']===undefined,'IDENTITY_MISMATCH');
      }else if(operation==='stop'&&'kind' in body&&body.kind==='assignment'){
        const stop=validate<AssignmentStop>('assignment-stop',body);insist(stop.assignment.sessionId===sessionId&&stop.assignment.workerId===options.workerId&&req.headers['x-owner-fence']===undefined,'IDENTITY_MISMATCH');
      }else{
        envelope=validate<BridgeIdentity>('bridge',identity(body as BridgeIdentity),'identity');insist(envelope.sessionId===sessionId&&envelope.workerId===options.workerId&&req.headers['x-owner-fence']===String(envelope.ownerFence),'IDENTITY_MISMATCH');
      }
      const replayKey=JSON.stringify([sessionId,operation,key]),digest=hash(body),prior=replay.get(replayKey);if(prior)insist(prior.digest===digest,'IDEMPOTENCY_CONFLICT');
      const execute=async():Promise<unknown>=>{
        if(operation==='assign')return ownership.assign(body);
        if(operation==='context')return ownership.context(body);
        if(operation==='stop')return ownership.stop(body);
        insist(envelope,'IDENTITY_MISMATCH');const runtime=ownership.getRuntime(envelope);
        if(operation==='prepare')return runtime.prepare(body);
        if(operation==='observe')return runtime.refreshObservation(body,key);
        return runtime.dispatch(body);
      };
      let result:unknown;
      if(prior){
        insist(operation!=='dispatch','ALREADY_CONSUMED');
        // OWNED is current acknowledged authority, never a historical winning claim replay.
        if(operation==='assign')result=await execute();
        else{if(operation!=='stop'){insist(envelope,'IDENTITY_MISMATCH');ownership.getRuntime(envelope);}result=await prior.promise;if(operation==='observe'){insist(envelope,'IDENTITY_MISMATCH');result=ownership.getRuntime(envelope).currentObservation(result);}}
      }else{insist(replay.size<10000,'CAPACITY');const promise=execute();replay.set(replayKey,{digest,promise});result=await promise;}
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result));
    };
    void handle().catch((error:unknown)=>{
      const code=error instanceof Error&&['AUTH_DENIED','IDEMPOTENCY_CONFLICT','SCHEMA','IDENTITY_MISMATCH','CAPACITY','CONTEXT_LOST','ALREADY_CONSUMED','BUSY','TARGET_CHANGED','PREPARATION_DENIED','ADMISSION_DENIED','BINDING_UNAVAILABLE','BINDING_DENIED','BINDING_ORDER','ACTION_ORDER','CONTEXT_REVISION','INPUT_IDENTITY','BUDGET_EXCEEDED'].includes(error.message)?error.message:'POLICY_DENIED';
      if(!res.headersSent)res.writeHead(code==='AUTH_DENIED'?401:409,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({code}));
    });
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.timeout = 30_000;
  return {server,async close(){const stopped=await Promise.allSettled([ownership.close()]);server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>{if(error)reject(error);else resolve();}));if(stopped.some(result=>result.status==='rejected'))throw new Error('CONTEXT_LOST');}};
}
export interface GuidedCallbackOptions {
  baseUrl: string;
  tls: Pick<ServerOptions, 'key' | 'cert' | 'ca'>;
  token: () => Promise<string>;
  controllerCertificateFingerprint256: string;
}
/** One authenticated send, bounded response and wall time including credential lookup. No POST retry. */
async function controllerRequest(options: GuidedCallbackOptions, sessionId: string, route: string, message: unknown, fence: number | undefined, key: string, timeoutMs: number, signal?: AbortSignal): Promise<{status: number; body: unknown}> {
  insist(!process.env.DEBUG && !process.env.PWDEBUG && !process.env.NODE_DEBUG && !process.env.NODE_OPTIONS, 'CONFIGURATION_DENIED');
  const base = new URL(options.baseUrl); insist(base.protocol === 'https:' && !base.username && !base.password && !base.search && !base.hash, 'CONFIGURATION_DENIED');
  const body = JSON.stringify(message); insist(Buffer.byteLength(body) <= 1024 * 1024, 'BUDGET_EXCEEDED');
  const deadline = AbortSignal.timeout(Math.max(1,Math.floor(timeoutMs)));
  const cancellation = signal ? AbortSignal.any([signal,deadline]) : deadline;
  let abortListener: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve,reject) => { abortListener = () => { reject(new Error('CALLBACK_DENIED')); }; if (cancellation.aborted) abortListener(); else cancellation.addEventListener('abort',abortListener,{once:true}); });
  const send = async (): Promise<{status:number;body:unknown}> => {
    const token = await options.token(); insist(!cancellation.aborted,'CALLBACK_DENIED');
    const destination = new URL(`/internal/v2/studio/guided-sessions/${encodeURIComponent(sessionId)}/${route}`,base);
    return new Promise((resolve,reject) => {
      const req = httpsRequest(destination,{...options.tls,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,checkServerIdentity:(hostname,certificate)=>checkServerIdentity(hostname,certificate)?? (certificate.fingerprint256===options.controllerCertificateFingerprint256?undefined:new Error('CALLBACK_DENIED')),method:'POST',signal:cancellation,headers:{authorization:`Bearer ${token}`,'content-type':'application/json','content-length':Buffer.byteLength(body),'idempotency-key':key,...(fence === undefined ? {} : {'x-owner-fence':String(fence)})}},response => {
        let bytes=0;const chunks:Buffer[]=[];
        response.on('data',(part:Buffer)=>{bytes+=part.length;if(bytes>1024*1024)req.destroy(new Error('CALLBACK_DENIED'));else chunks.push(part);});
        response.on('end',()=>{try{const bytes=Buffer.concat(chunks);resolve({status:response.statusCode??0,body:bytes.length ? parseWireJson(bytes) : null});}catch{reject(new Error('CALLBACK_DENIED'));}});
        response.on('error',()=>{reject(new Error('CALLBACK_DENIED'));});
      });
      req.on('socket',socket=>{if(socket instanceof TLSSocket)socket.on('secureConnect',()=>{if(!socket.authorized||socket.getPeerCertificate().fingerprint256!==options.controllerCertificateFingerprint256)req.destroy(new Error('CALLBACK_DENIED'));});});
      req.on('error',()=>{reject(new Error('CALLBACK_DENIED'));});req.end(body);
    });
  };
  try{return await Promise.race([send(),aborted]);}finally{if(abortListener)cancellation.removeEventListener('abort',abortListener);}
}
export function guidedCallback(options: GuidedCallbackOptions): GuidedRuntimeOptions['callback'] {
  return async(route,message,idempotencyKey)=>{
    const definition=route==='bootstrap-evidence'?'bootstrap':route==='observations'?'observation':route==='outcomes'?'outcome':'lifecycle';
    const notice=validate<BridgeIdentity|AssignmentLifecycle>('bridge',message,definition);
    const assignment='kind' in notice ? notice.assignment : null;
    const result=await controllerRequest(options,assignment?.sessionId??(notice as BridgeIdentity).sessionId,route,message,assignment?undefined:(notice as BridgeIdentity).ownerFence,idempotencyKey??randomUUID(),10_000);
    insist(result.status===202,'CALLBACK_DENIED');
  };
}
export function guidedClaimClient(options: GuidedCallbackOptions): ClaimPort {
  return async(command,key,timeoutMs,signal)=>{
    const result=await controllerRequest(options,command.sessionId,'claim',command,command.expectedFence,key,timeoutMs,signal);
    insist(result.status===202,'CLAIM_DENIED');
    return validate<Session>('session',result.body);
  };
}
