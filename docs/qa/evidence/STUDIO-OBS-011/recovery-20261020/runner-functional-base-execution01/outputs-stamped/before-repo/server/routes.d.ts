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
import type { IdentityChecker, PeerPin } from './identity.js';
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
export type BodyRead = {
    readonly ok: true;
    readonly text: string;
} | {
    readonly ok: false;
    readonly status: 413 | 400;
    readonly code: string;
};
/**
 * Reads a request body under a hard byte cap.
 *
 * The cap is applied to the accumulated length as chunks arrive, so an oversized body is refused
 * during the upload rather than after the process has buffered all of it.
 */
export declare function readBoundedBody(request: IncomingMessage, maxBytes: number, strictUtf8?: boolean): Promise<BodyRead>;
export declare function respond(response: ServerResponse, status: number, body: Readonly<Record<string, unknown>>, headers?: Readonly<Record<string, string>>): void;
/** Everything under this prefix is the guided bridge's (`guided/transport.ts` owns the route shape). */
export declare const GUIDED_ROUTE_PREFIX = "/internal/v2/studio/guided-sessions/";
export declare function createRequestHandler(options: RouteOptions): (request: IncomingMessage, response: ServerResponse) => void;
