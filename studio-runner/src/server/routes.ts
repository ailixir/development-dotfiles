/**
 * The four internal routes (AC-1..AC-5, AC-10, AC-11, architecture §8.4).
 *
 * ```
 * POST /v1/validate   browser-free wrapper over validateArtifact; cannot reserve a slot
 * POST /v1/runs       envelope → slot → admission CAS → 202
 * GET  /health        liveness only; 200 while saturated and while draining
 * GET  /ready         ability to admit safely; false only while draining
 * ```
 *
 * **Identity is checked on the request head, before the body is read.** An unauthenticated caller
 * never causes a parse, a validation or a slot reservation — it costs one hash comparison. The
 * body is read with a hard byte cap, so an oversized body is refused while it arrives rather than
 * after it has been buffered.
 *
 * Error bodies carry a code and nothing else: no stack trace, no file path, no artifact echo
 * (AC-5). Diagnostics that do go out are bounded and carry diagnostic codes, not source text.
 *
 * **`/health` vs `/ready` are four states, not two.** Saturated-and-ready is the interesting one:
 * a busy pod answers `429` to `/v1/runs` while `/ready` stays `200`, because it is healthy and
 * about to be free. Only draining makes readiness false.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import { DEFAULT_BOUNDS, validateArtifact } from '../validator/index.js';
import type { ReferenceDeclarations } from '../validator/index.js';
import type { CapacityPool } from './capacity.js';
import type { IdentityChecker } from './identity.js';
import { IDENTITY_HEADER } from './identity.js';
import type { Logger } from './logging.js';
import type { RunCoordinator } from './runCoordinator.js';

export interface RouteOptions {
  readonly identity: IdentityChecker;
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
export function readBoundedBody(request: IncomingMessage, maxBytes: number): Promise<BodyRead> {
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
      finish({ ok: true, text: Buffer.concat(chunks).toString('utf8') });
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

/** Keys a `/v1/validate` body may carry. Default-deny, like the job envelope. */
const VALIDATE_KEYS = new Set(['artifact', 'source', 'references']);

const EMPTY_DECLARATIONS: ReferenceDeclarations = { variables: [], secrets: [] };

export function createRequestHandler(
  options: RouteOptions,
): (request: IncomingMessage, response: ServerResponse) => void {
  const { identity, pool, coordinator, logger } = options;

  async function handleValidate(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const body = await readBoundedBody(request, options.maxRequestBodyBytes);
    if (!body.ok) {
      respond(response, body.status, { code: body.code });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body.text);
    } catch {
      // No stack trace, no excerpt of what failed to parse (AC-5).
      respond(response, 400, { code: 'BODY_NOT_JSON' });
      return;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      respond(response, 400, { code: 'BODY_NOT_OBJECT' });
      return;
    }
    const record = parsed as Record<string, unknown>;
    const unknownKeys = Object.keys(record).filter((key) => !VALIDATE_KEYS.has(key));
    if (unknownKeys.length > 0) {
      respond(response, 400, { code: 'BODY_UNKNOWN_KEY', fields: unknownKeys.slice(0, 10) });
      return;
    }

    const source = record.source;
    if (!Array.isArray(source) || !source.every((line) => typeof line === 'string')) {
      respond(response, 400, { code: 'SOURCE_INVALID' });
      return;
    }
    if (source.length > DEFAULT_BOUNDS.maxSteps) {
      respond(response, 413, { code: 'SOURCE_TOO_MANY_STEPS' });
      return;
    }

    const declared = record.references;
    const references: ReferenceDeclarations =
      declared === undefined ? EMPTY_DECLARATIONS : (declared as ReferenceDeclarations);

    // Launches nothing, creates no scratch state and — critically — never touches the pool, so a
    // fully saturated runner still answers validate (AC-4).
    const startedAt = options.now();
    const result = validateArtifact(record.artifact, source, references);
    const elapsedMs = options.now() - startedAt;

    if (elapsedMs > options.validateTimeoutMs) {
      // The validator is synchronous and cannot be interrupted mid-call; the wall-clock bound is
      // therefore enforced by DEFAULT_BOUNDS on the way in and reported here on the way out, so
      // an input that somehow costs more than the bound is visible rather than silently slow.
      logger.record('warn', 'validate.over_budget', 'runner.validate.over_budget', { elapsedMs });
      respond(response, 503, { code: 'VALIDATE_OVER_BUDGET' });
      return;
    }

    respond(response, 200, {
      ok: result.ok,
      validatorSchemaVersion: result.validatorSchemaVersion,
      diagnostics: result.diagnostics,
      steps: result.steps.map((step) => ({
        stepIndex: step.stepIndex,
        ok: step.ok,
        // Typed operations stay inside the runner; the caller gets diagnostics, never source or
        // an executable operation list.
        diagnostics: step.diagnostics,
      })),
    });
  }

  async function handleRuns(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await readBoundedBody(request, options.maxRequestBodyBytes);
    if (!body.ok) {
      respond(response, body.status, { code: body.code });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body.text);
    } catch {
      respond(response, 400, { code: 'BODY_NOT_JSON' });
      return;
    }

    // From here to the slot acquire inside `submit` there is no `await` (AC-10).
    const decision = await coordinator.submit(parsed);
    const headers =
      decision.retryAfterSeconds === undefined
        ? {}
        : { 'retry-after': String(decision.retryAfterSeconds) };
    respond(
      response,
      decision.status,
      {
        code: decision.code,
        ...(decision.detail === undefined ? {} : { detail: decision.detail }),
      },
      headers,
    );
  }

  return (request: IncomingMessage, response: ServerResponse): void => {
    const method = request.method ?? 'GET';
    const path = (request.url ?? '/').split('?')[0] ?? '/';

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

    if (method === 'POST' && path === '/v1/validate') {
      void handleValidate(request, response).catch(() => {
        respond(response, 500, { code: 'INTERNAL_ERROR' });
      });
      return;
    }

    if (method === 'POST' && path === '/v1/runs') {
      void handleRuns(request, response).catch(() => {
        respond(response, 500, { code: 'INTERNAL_ERROR' });
      });
      return;
    }

    request.resume();
    respond(response, 404, { code: 'NOT_FOUND' });
  };
}
