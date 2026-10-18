import { parseObservedBytes, ObservedRefusal } from '../validator/observedReferencePolicy.js';
/**
 * The five internal routes (AC-1..AC-5, AC-10, AC-11, architecture §8.4; ADR-002 §29).
 *
 * ```
 * POST   /v2/validate-observed  browser-free observed validation; cannot reserve a slot
 * POST   /v2/runs               closed observed job → slot → observed admission → 202
 * DELETE /v2/runs/{id}          cancel one admitted run: ordered stop, bounded grace, process tree
 * GET    /health                liveness only; 200 while saturated and while draining
 * GET    /ready                 ability to admit safely; false only while draining
 * ```
 *
 * STUDIO-OBS-012A AC-3 deleted the artifact-1 validate, run and cancel routes; cancellation is
 * served at `DELETE /v2/runs/{id}` on the same coordinator path.
 *
 * **Identity is checked on the request head, before the body is read.** An unauthenticated caller
 * never causes a parse, a validation or a slot reservation — it costs one hash comparison. The
 * body is read with a hard byte cap, so an oversized body is refused while it arrives rather than
 * after it has been buffered.
 *
 * **The peer is pinned before the bearer** (STUDIO-OBS-009 AC-3): the listener already required a
 * CA-verified client certificate, and every route except the exec probe's `/health` and `/ready`
 * additionally requires it to be the backend's. A refused peer gets `401 {code:'PEER_REJECTED'}` and
 * nothing about the bearer. `/internal/v2/studio/guided-sessions/...` belongs to the guided bridge
 * (its own pin and JWT) when guided mode is on, and is not routed at all when it is off.
 *
 * Error bodies carry a code and nothing else: no stack trace, no file path, no artifact echo
 * (AC-5). Diagnostics that do go out are bounded and carry diagnostic codes, not source text.
 *
 * **`/health` vs `/ready` are four states, not two.** Saturated-and-ready is the interesting one:
 * a busy pod answers `429` to `/v2/runs` while `/ready` stays `200`, because it is healthy and
 * about to be free. Only draining makes readiness false.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { CapacityPool } from './capacity.js';
import type { GuidedBridge } from '../guided/transport.js';
import type { IdentityChecker, PeerAudience, PeerPin } from './identity.js';
import { IDENTITY_HEADER } from './identity.js';
import type { Logger } from './logging.js';
import type { RunCoordinator } from './runCoordinator.js';

export interface RouteOptions {
  readonly identity: IdentityChecker;
  /** The client-certificate pin that runs before the bearer (STUDIO-OBS-009 AC-3, ruling A3). */
  readonly peer: PeerPin;
  /**
   * The guided bridge, present only when `STUDIO_RUNNER_GUIDED_ENABLED` is true. Absent, the guided
   * routes are not routed: they answer the replay 404 (ruling 1.5 f), before any JWT work.
   */
  readonly guided?: Pick<GuidedBridge, 'handle'> | undefined;
  readonly pool: CapacityPool;
  readonly coordinator: RunCoordinator;
  readonly logger: Logger;
  readonly maxRequestBodyBytes: number;
  readonly validateTimeoutMs: number;
  readonly now: () => number;
}

export type BodyRead =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly status: 413 | 400; readonly code: string };

/**
 * Reads a request body under a hard byte cap.
 *
 * The cap is applied to the accumulated length as chunks arrive, so an oversized body is refused
 * during the upload rather than after the process has buffered all of it.
 */
export function readBoundedBody(request: IncomingMessage, maxBytes: number, strictUtf8 = false): Promise<BodyRead> {
  return new Promise<BodyRead>((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    let discarding = false;

    const finish = (result: BodyRead): void => {
      if (done) return;
      done = true;
      resolve(result);
    };

    request.on('data', (chunk: Buffer) => {
      if (discarding) return;
      size += chunk.length;
      if (size > maxBytes) {
        // Stop buffering immediately, but keep the connection readable so the 413 can be written
        // and actually reach the caller. Destroying the socket here would answer nothing at all.
        discarding = true;
        chunks.length = 0;
        finish({ ok: false, status: 413, code: 'BODY_TOO_LARGE' });
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try { const bytes=Buffer.concat(chunks);finish({ ok: true, text: strictUtf8 ? new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes) : bytes.toString('utf8') }); } catch { finish({ok:false,status:400,code:'INVALID_CONTRACT'}); }
    });
    request.on('error', () => {
      finish({ ok: false, status: 400, code: 'BODY_READ_FAILED' });
    });
  });
}

export function respond(
  response: ServerResponse,
  status: number,
  body: Readonly<Record<string, unknown>>,
  headers: Readonly<Record<string, string>> = {},
): void {
  const serialized = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    // Explicit length: chunked framing on a four-route internal API buys nothing and makes the
    // response harder to read on the wire.
    'content-length': String(Buffer.byteLength(serialized, 'utf8')),
    ...headers,
  });
  response.end(serialized);
}

/**
 * `DELETE /v2/runs/{executionId}`. The id is one path segment and nothing else; anything that is
 * not a single segment is a route this runner does not serve.
 */
const RUN_PATH = /^\/v2\/runs\/([^/]+)$/u;

/** Everything under this prefix is the guided bridge's (`guided/transport.ts` owns the route shape). */
export const GUIDED_ROUTE_PREFIX = '/internal/v2/studio/guided-sessions/';

/** Routes the exec probe calls: it presents the runner's own certificate, not the controller's. */
function audienceFor(method: string, path: string): PeerAudience {
  return method === 'GET' && (path === '/health' || path === '/ready') ? 'controller-or-self' : 'controller';
}

export function createRequestHandler(
  options: RouteOptions,
): (request: IncomingMessage, response: ServerResponse) => void {
  const { identity, pool, coordinator, logger } = options;

  return (request: IncomingMessage, response: ServerResponse): void => {
    const method = request.method ?? 'GET';
    const path = (request.url ?? '/').split('?')[0] ?? '/';

    // ── The guided bridge's routes: its own pin and JWT, or not routed at all. ──────────────
    if (path.startsWith(GUIDED_ROUTE_PREFIX)) {
      if (options.guided !== undefined) {
        options.guided.handle(request, response);
        return;
      }
      const guidedPeer = options.peer.check(request.socket, 'controller');
      request.resume();
      if (!guidedPeer.ok) {
        respond(response, guidedPeer.status, { code: guidedPeer.code });
        return;
      }
      respond(response, 404, { code: 'NOT_FOUND' });
      return;
    }

    // ── The pinned peer, before the bearer: an unpinned caller learns nothing about the bearer. ──
    const peer = options.peer.check(request.socket, audienceFor(method, path));
    if (!peer.ok) {
      logger.record('warn', 'request.peer_rejected', 'runner.request.peer_rejected', { path, method });
      request.resume();
      respond(response, peer.status, { code: peer.code });
      return;
    }

    // ── Identity first, on the head, before anything else happens (AC-2a). ──────────────────
    const verdict = identity.check(request.headers[IDENTITY_HEADER]);
    if (!verdict.ok) {
      logger.record('warn', 'request.unauthenticated', 'runner.request.unauthenticated', {
        path,
        method,
        code: verdict.code,
      });
      // Drain the unread body *before* answering: with `connection: close` a response that ends
      // while the caller is still uploading makes Node destroy the socket, and the caller sees a
      // connection reset instead of the 401 it was told it would get.
      request.resume();
      // The body carries a code and no job detail.
      respond(response, verdict.status, { code: verdict.code });
      return;
    }

    if (method === 'GET' && path === '/health') {
      // Liveness only. Stays 200 while saturated and while draining.
      respond(response, 200, { status: 'ok', draining: pool.draining });
      return;
    }

    if (method === 'GET' && path === '/ready') {
      // Ability to admit safely. Saturation alone keeps this true; draining makes it false.
      const ready = !pool.draining;
      respond(response, ready ? 200 : 503, {
        ready,
        draining: pool.draining,
        inUse: pool.inUse,
        size: pool.size,
      });
      return;
    }

    if(method==='POST'&&(path==='/v2/validate-observed'||path==='/v2/runs')){
      const observedRequest=async():Promise<void>=>{
        const limit=path==='/v2/validate-observed'?8388608:4194304;
        const body=await readBoundedBody(request,limit,true);if(!body.ok){respond(response,body.status,{code:body.code});return;}
        try{
          const parsed=parseObservedBytes(Buffer.from(body.text),limit);
          if(path==='/v2/validate-observed'){
            if(!coordinator.validateObserved){respond(response,503,{code:'OBSERVED_VALIDATION_DISABLED'});return;}
            const start=options.now(),verdict=coordinator.validateObserved(parsed);
            if(options.now()-start>Math.min(15000,options.validateTimeoutMs)){respond(response,503,{code:'VALIDATE_OVER_BUDGET'});return;}
            respond(response,200,{...verdict});
          }else{
            if(!coordinator.submitObserved){respond(response,503,{code:'OBSERVED_REPLAY_DISABLED'});return;}
            const decision=await coordinator.submitObserved(parsed);respond(response,decision.status,{code:decision.code},decision.retryAfterSeconds?{'retry-after':String(decision.retryAfterSeconds)}:{});
          }
        }catch(error){respond(response,400,{code:error instanceof ObservedRefusal?error.code:'INVALID_CONTRACT'});}
      };
      void observedRequest().catch(()=>{ respond(response,500,{code:'INTERNAL_ERROR'}); });return;
    }

    const runPath = method === 'DELETE' ? RUN_PATH.exec(path) : null;
    if (runPath !== null) {
      // No body is read: the cancel is the path and the identity, both already checked.
      request.resume();
      const executionId = decodeURIComponent(runPath[1] ?? '');
      const decision = coordinator.cancel(executionId);
      respond(response, decision.status, { code: decision.code });
      return;
    }

    request.resume();
    respond(response, 404, { code: 'NOT_FOUND' });
  };
}
