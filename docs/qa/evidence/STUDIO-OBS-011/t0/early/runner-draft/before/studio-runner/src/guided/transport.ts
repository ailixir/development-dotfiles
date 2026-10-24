import { createServer, request as httpsRequest } from 'node:https';
import type { ServerOptions } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { TLSSocket, checkServerIdentity } from 'node:tls';
import { verify, randomUUID, createPublicKey } from 'node:crypto';
import { parseWireJson } from './json.js';
import { canonical, hash, identity, insist, validate } from './contracts.js';
import type { BridgeIdentity, BridgeDispatch, BridgePrefixPrepare, BridgePrefixDriftCallback, Assignment, AssignmentStop, AssignmentLifecycle, Session } from './types.js';
import { GuidedOwnership } from './ownership.js';
import { describeStartFailure } from './diagnostics.js';
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
/**
 * The guided bridge without a listener (STUDIO-OBS-009 AC-1). The one runner listener
 * (`src/server/server.ts`) hands every `/internal/v2/studio/guided-sessions/...` request to
 * {@link GuidedBridge.handle}; the bridge owns the peer pin, the JWT and the session ownership, and
 * owns no socket.
 */
export interface GuidedBridgeOptions extends GuidedRuntimeOptions {
  claim: ClaimPort;
  controllerJwt: GuidedJwtPolicy;
  /** Bind the service certificate as well as the issuer JWT to the controller. */
  controllerCertificateFingerprint256: string;
  capacity?: number;
}
/** What `createGuidedServer` additionally takes: the TLS material of the listener it wraps. */
export interface GuidedServerOptions extends GuidedBridgeOptions {
  tls: Pick<ServerOptions, 'key' | 'cert' | 'ca'>;
}
export interface GuidedBridge {
  /** One bridge request. Every refusal is a closed answer; nothing is thrown to the caller. */
  handle(req: IncomingMessage, res: ServerResponse): void;
  /**
   * Stops every owned session with `CONTEXT_LOST` and waits for the recordings to settle. Rejects
   * `CONTEXT_LOST` when any stop could not be confirmed (the slot is then held until the process ends).
   */
  closeSessions(): Promise<void>;
}
export function guidedDispatchIdentity(body: unknown): { digest: string; secretIdentity: string } {
  insist(body && typeof body === 'object' && !Array.isArray(body), 'SCHEMA');
  const { secret, ...publicBody } = body as Record<string, unknown>;
  let secretIdentity = '';
  if (secret !== undefined) {
    const request = validate<BridgeDispatch>('bridge', body, 'dispatch');
    insist(request.proposal.operation.kind === 'fill' && request.proposal.operation.value.kind === 'secretRef' && request.secret, 'SCHEMA');
    secretIdentity = canonical({ secretId: request.secret.secretId, sourceInputId: request.proposal.operation.value.sourceInputId });
  }
  return { digest: hash(publicBody), secretIdentity };
}
/** Closed refusal vocabulary of the guided bridge: the source of truth for bridge#/definitions/refusal
 * (STUDIO-OBS-014 AR-2 r14-stops ruling 2), whose `code` enum is this list plus the POLICY_DENIED fallback. */
export const GUIDED_REFUSAL_CODES = ['AUTH_DENIED','IDEMPOTENCY_CONFLICT','SCHEMA','IDENTITY_MISMATCH','CAPACITY','CONTEXT_LOST','ALREADY_CONSUMED','BUSY','TARGET_CHANGED','PREPARATION_DENIED','ADMISSION_DENIED','BINDING_UNAVAILABLE','BINDING_DENIED','BINDING_ORDER','ACTION_ORDER','CONTEXT_REVISION','INPUT_IDENTITY','BUDGET_EXCEEDED'] as const;
export const GUIDED_REFUSAL_REASONS = ['PASSWORD_TARGET_ABSENT','PASSWORD_TARGET_AMBIGUOUS','PASSWORD_FORM_ACTION_NOT_ALLOWED','PASSWORD_CONTROL_READ_REFUSED'] as const;
export function createGuidedBridge(options: GuidedBridgeOptions): GuidedBridge {
  insist(!process.env.DEBUG && !process.env.PWDEBUG && !process.env.NODE_DEBUG && !process.env.NODE_OPTIONS, 'CONFIGURATION_DENIED');
  insist((options.capacity ?? 1) === 1, 'CONFIGURATION_DENIED');
  // STUDIO-OBS-014 AC-1: the policy is per session, from the hash-bound runner context only; neither a
  // policy nor field rules may be configured on the server (ar-mounted-rules: refused in every form).
  insist(!Object.hasOwn(options, 'applicationPolicy'), 'CONFIGURATION_DENIED');
  insist(!Object.hasOwn(options, 'rules'), 'CONFIGURATION_DENIED');
  const ownership = new GuidedOwnership(options);
  const replay = new Map<string, {digest:string;secretIdentity:string;promise:Promise<unknown>}>();
  const handleRequest=(req:IncomingMessage,res:ServerResponse):void=>{
    const began=Date.now();let routed:{operation:string;sessionId:string}|null=null;
    const handle=async():Promise<void>=>{
      insist(req.socket instanceof TLSSocket&&req.socket.authorized&&req.socket.getPeerCertificate().fingerprint256===options.controllerCertificateFingerprint256,'AUTH_DENIED');
      verifyGuidedJwt(req.headers.authorization,options.controllerJwt,'studio-guided-runner','backend-controller');
      insist(req.method==='POST'&&req.headers['content-type']?.split(';')[0]==='application/json','SCHEMA');
      const route=/^\/internal\/v2\/studio\/guided-sessions\/([^/]+)\/(assign|context|prepare|dispatch|observe|stop)$/u.exec(req.url??'');insist(route,'SCHEMA');const sessionId=decodeURIComponent(route[1]??'');const operation=route[2];routed={operation:operation??'',sessionId};
      const key=req.headers['idempotency-key'];insist(typeof key==='string'&&key.length>0&&key.length<=256,'SCHEMA');
      const body=await readBody(req);insist(body&&typeof body==='object'&&!Array.isArray(body),'SCHEMA');
      let envelope:BridgeIdentity|null=null;
      if(operation==='assign'){
        const assignment=validate<Assignment>('assignment',body);insist(assignment.sessionId===sessionId&&assignment.workerId===options.workerId&&req.headers['x-owner-fence']===undefined,'IDENTITY_MISMATCH');
      }else if(operation==='stop'&&'kind' in body&&body.kind==='assignment'){
        const stop=validate<AssignmentStop>('assignment-stop',body);insist(stop.assignment.sessionId===sessionId&&stop.assignment.workerId===options.workerId&&req.headers['x-owner-fence']===undefined,'IDENTITY_MISMATCH');
      }else if(operation==='prepare' && 'kind' in body && body.kind==='prefix') {
        const prefix = validate<BridgePrefixPrepare>('bridge', body, 'PrefixPrepare');
        envelope = { ...prefix.request, versions: { contract: 3 } };
        insist(envelope.sessionId===sessionId&&envelope.workerId===options.workerId&&req.headers['x-owner-fence']===String(envelope.ownerFence),'IDENTITY_MISMATCH');
      }else{
        envelope=validate<BridgeIdentity>('bridge',identity(body as BridgeIdentity),'identity');insist(envelope.sessionId===sessionId&&envelope.workerId===options.workerId&&req.headers['x-owner-fence']===String(envelope.ownerFence),'IDENTITY_MISMATCH');
      }
      const replayKey=JSON.stringify([sessionId,operation,key]),{digest,secretIdentity}=guidedDispatchIdentity(body),prior=replay.get(replayKey);if(prior)insist(prior.digest===digest&&prior.secretIdentity===secretIdentity,'IDEMPOTENCY_CONFLICT');
      const execute=async():Promise<unknown>=>{
        if(operation==='assign')return ownership.assign(body);
        if(operation==='context')return ownership.context(body,key);
        if(operation==='stop')return ownership.stop(body);
        insist(envelope,'IDENTITY_MISMATCH');const runtime=ownership.getRuntime(envelope);
        if(operation==='prepare')return 'kind' in body && body.kind==='prefix' ? runtime.preparePrefix(body) : runtime.prepare(body);
        if(operation==='observe')return runtime.refreshObservation(body,key);
        return runtime.dispatch(body);
      };
      let result:unknown;
      if(prior){
        insist(operation!=='dispatch','ALREADY_CONSUMED');
        // OWNED is current acknowledged authority, never a historical winning claim replay.
        if(operation==='assign')result=await execute();
        else{if(operation!=='stop'){insist(envelope,'IDENTITY_MISMATCH');ownership.getRuntime(envelope);}result=await prior.promise;if(operation==='observe'){insist(envelope,'IDENTITY_MISMATCH');result=ownership.getRuntime(envelope).currentObservation(result);}}
      }else{insist(replay.size<10000,'CAPACITY');const promise=execute();replay.set(replayKey,{digest,secretIdentity,promise});result=await promise;}
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result));
    };
    void handle().catch((error:unknown)=>{
      const code=error instanceof Error&&(GUIDED_REFUSAL_CODES as readonly string[]).includes(error.message)?error.message:'POLICY_DENIED';
      const reason = error instanceof Error && (GUIDED_REFUSAL_REASONS as readonly string[]).includes(error.message) ? error.message : null;
      // REL-001: a refused assign/context ends the session, so the worker says why on stderr. The wire answer below is unchanged.
      if(code==='CONTEXT_LOST'&&routed&&(routed.operation==='assign'||routed.operation==='context')){
        try{(options.diagnosticStderr??((text:string)=>{process.stderr.write(text);}))(describeStartFailure(error,{operation:routed.operation,sessionId:routed.sessionId,elapsedMs:Date.now()-began}));}catch{/* A diagnostic never changes the verdict. */}
      }
      if(!res.headersSent)res.writeHead(code==='AUTH_DENIED'?401:409,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({code,...(reason ? {reason} : {})}));
    });
  };
  return {handle:handleRequest,closeSessions:()=>ownership.close()};
}
/**
 * The bridge wrapped in a listener of its own, with the timeouts of the one runner listener. Not used by
 * the runner process (`main.ts` serves the bridge on the one listener); kept for the tiers that drive the
 * bridge on its own socket.
 */
export function createGuidedServer(options: GuidedServerOptions) {
  const bridge = createGuidedBridge(options);
  const server = createServer({...options.tls,minVersion:'TLSv1.2',requestCert:true,rejectUnauthorized:true},(req,res)=>{bridge.handle(req,res);});
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.timeout = 30_000;
  return {server,async close(){const stopped=await Promise.allSettled([bridge.closeSessions()]);server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>{if(error)reject(error);else resolve();}));if(stopped.some(result=>result.status==='rejected'))throw new Error('CONTEXT_LOST');}};
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
    const definition=route==='bootstrap-evidence'?'bootstrap':route==='observations'?'observation':route==='outcomes'?'outcome':route==='recording-evidence'?'recordingEvidence':'lifecycle';
    const notice=validate<BridgeIdentity|AssignmentLifecycle|BridgePrefixDriftCallback>('bridge',message,definition);
    const drift='kind' in notice && notice.kind==='prefixDrift' ? notice.receipt : null;
    const assignment='kind' in notice && notice.kind==='assignment' ? notice.assignment : null;
    const result=await controllerRequest(options,assignment?.sessionId??drift?.sessionId??(notice as BridgeIdentity).sessionId,route,message,assignment?undefined:drift?.ownerFence??(notice as BridgeIdentity).ownerFence,idempotencyKey??randomUUID(),10_000);
    insist(result.status===202,'CALLBACK_DENIED');
  };
}
export function guidedClaimClient(options: GuidedCallbackOptions): ClaimPort {
  return async(command,key,timeoutMs,signal)=>{
    const result=await controllerRequest(options,command.sessionId,'claim',command,command.expectedFence,key,timeoutMs,signal);
    if (result.status === 403 || result.status === 409 && typeof result.body === 'object' && result.body !== null && 'code' in result.body && result.body.code === 'SECRET_USE_REVOKED') throw new Error('REVOKED');
    insist(result.status===202,'CLAIM_DENIED');
    return validate<Session>('session',result.body);
  };
}
