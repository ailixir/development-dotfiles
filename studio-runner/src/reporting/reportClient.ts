/**
 * Progress and terminal delivery (AC-13, AC-16, AC-17, AC-18, AC-19, AC-20, architecture §5.3).
 *
 * **Two retry policies, deliberately opposite, in the same file so neither can be "simplified"
 * into the other:**
 *
 * - `deliverProgress` (`STARTED`, `PROGRESS`) — one attempt, failure dropped. A lost progress
 *   delivery is repaired by the next cumulative snapshot, so retrying it buys nothing and costs
 *   an ordering hazard.
 * - `deliverTerminal` (`FINAL`) — retried until acknowledged, within a bounded count and window,
 *   with jitter. The API side is idempotent by `(attemptId, runnerSequence)`, so a duplicate is
 *   recognisable — **provided the duplicate is actually identical.**
 *
 * That proviso is the whole of AC-17. The `FINAL` body is serialized **once**, before the first
 * send, and the same string is handed to the client on every attempt. Nothing is recomputed per
 * attempt, timestamps included: the AC-13 timestamps describe the run, not the delivery. The
 * per-delivery attempt counter that a human debugging this will want travels as a header, where
 * it cannot change the bytes the API de-duplicates on.
 *
 * **Redaction happens on the serialized string, after serialization and before sending.** A field
 * added to `ReportBody` next year is redacted automatically, because the redactor sees the
 * finished payload rather than a list of fields somebody remembered to enumerate (AC-20).
 *
 * A `409` from the API on **any** report — ownership lost, superseded attempt, execution already
 * finalized — stops reporting for that run immediately and never escalates. It is not a delivery
 * failure to retry; it is the API saying this runner no longer owns the attempt, and the correct
 * response to that is silence plus an audit line and a counter (AC-18).
 */
import type { HttpClient, HttpOutcome } from './httpClient.js';
import type { ReportBody } from './snapshot.js';
import { serializeBounded } from './snapshot.js';
import type { ReportBounds } from './bounds.js';
import type { Logger } from '../server/logging.js';
import type { Redactor } from '../executor/redaction.js';

export const REPORT_COUNTERS = {
  progressDropped: 'runner.report.progress_dropped',
  terminalDelivered: 'runner.report.terminal_delivered',
  terminalAbandoned: 'runner.report.terminal_abandoned',
  ownershipLost: 'runner.report.ownership_lost',
} as const;

export type DeliveryResult =
  | { readonly kind: 'ACKNOWLEDGED'; readonly attempts: number }
  /** The API says this runner no longer owns the attempt. Reporting stops; nothing escalates. */
  | { readonly kind: 'OWNERSHIP_LOST'; readonly attempts: number }
  | { readonly kind: 'DROPPED'; readonly attempts: number }
  | { readonly kind: 'ABANDONED'; readonly attempts: number };

export interface ReportClientOptions {
  readonly http: HttpClient;
  readonly baseUrl: string;
  readonly identityToken: string;
  readonly bounds: ReportBounds;
  readonly logger: Logger;
  readonly redactor: Redactor;
  readonly timeoutMs: number;
  readonly terminal: {
    readonly windowMs: number;
    readonly maxAttempts: number;
    readonly backoffMs: number;
  };
  /** Monotonic milliseconds, for the delivery window. */
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  /** `[0, 1)` jitter source. Injected so the retry schedule is deterministic under test. */
  readonly random: () => number;
  /**
   * Called when a progress acknowledgement carries `cancelRequested: true` (ADR-002 §29). The API
   * answers the pod that holds the run, so this is one of the two pull paths a cancel reaches it
   * by; the other is the control read.
   */
  readonly onCancelRequested?: (() => void) | undefined;
}

/** True when an acknowledgement body says a cancel is recorded. Anything unreadable is false. */
export function ackRequestsCancel(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as unknown;
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      ((parsed as { cancelRequested?: unknown }).cancelRequested === true || (parsed as { revoked?: unknown }).revoked === true)
    );
  } catch {
    return false;
  }
}

/** Secret-bearing executions fail closed on malformed or mismatched control authority. */
export function validSecretControl(body: string, executionId: string): boolean {
  try {
    const value = JSON.parse(body) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const control = value as Record<string, unknown>;
    return Object.keys(control).sort().join(',') === 'cancelRequested,executionId,revoked' && control.executionId === executionId && typeof control.cancelRequested === 'boolean' && typeof control.revoked === 'boolean';
  } catch { return false; }
}

export interface ReportClient {
  /** Best-effort single attempt. A failure is dropped; the next snapshot repairs the gap. */
  deliverProgress(body: ReportBody): Promise<DeliveryResult>;
  /** Bounded idempotent retry of byte-identical `FINAL` bytes. */
  deliverTerminal(body: ReportBody): Promise<DeliveryResult>;
  /** True once a `409` has stopped reporting for this run (AC-18). */
  readonly stopped: boolean;
  /** Every byte sequence handed to the HTTP client, in order. Test seam for AC-17 and AC-20. */
  readonly sentBodies: readonly string[];
}

function progressUrl(baseUrl: string, executionId: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}/internal/studio/executions/${encodeURIComponent(executionId)}/progress`;
}

/** Whether an outcome means "try again with the same bytes" rather than "stop". */
function isRetryable(outcome: HttpOutcome): boolean {
  if (outcome.kind === 'timeout' || outcome.kind === 'transport') return true;
  return outcome.status >= 500;
}

export function createReportClient(options: ReportClientOptions): ReportClient {
  const { http, baseUrl, identityToken, bounds, logger, redactor, timeoutMs, terminal } = options;
  const sentBodies: string[] = [];
  let stopped = false;

  const identityFieldsOf = (
    body: ReportBody,
  ): { executionId: string; attemptId: string; admissionId: string; runnerSequence: number } => ({
    executionId: body.executionId,
    attemptId: body.attemptId,
    admissionId: body.admissionId,
    runnerSequence: body.runnerSequence,
  });

  /**
   * Serializes, bounds and redacts **once**. The returned string is the payload: callers that
   * retry send this exact value again rather than rebuilding it.
   */
  const freezeBytes = (body: ReportBody): string =>
    redactor.redact(serializeBounded(body, bounds));

  const send = (body: ReportBody, bytes: string, attempt: number): Promise<HttpOutcome> => {
    sentBodies.push(bytes);
    return http.send({
      url: progressUrl(baseUrl, body.executionId),
      method: 'POST',
      headers: {
        authorization: `Bearer ${identityToken}`,
        'content-type': 'application/json',
        // Per-delivery metadata lives in headers so the body stays byte-identical (AC-17).
        'x-runner-delivery-attempt': String(attempt),
      },
      body: bytes,
      timeoutMs,
    });
  };

  const noteOwnershipLost = (body: ReportBody): void => {
    stopped = true;
    logger.record('warn', 'report.ownership_lost', REPORT_COUNTERS.ownershipLost, {
      ...identityFieldsOf(body),
      kind: body.kind,
    });
  };

  return {
    sentBodies,
    get stopped(): boolean {
      return stopped;
    },

    async deliverProgress(body: ReportBody): Promise<DeliveryResult> {
      if (stopped) return { kind: 'DROPPED', attempts: 0 };
      const outcome = await send(body, freezeBytes(body), 1);

      if (outcome.kind === 'response' && outcome.status === 409) {
        noteOwnershipLost(body);
        return { kind: 'OWNERSHIP_LOST', attempts: 1 };
      }
      if (outcome.kind === 'response' && outcome.status >= 200 && outcome.status < 300) {
        if (ackRequestsCancel(outcome.body)) options.onCancelRequested?.();
        return { kind: 'ACKNOWLEDGED', attempts: 1 };
      }

      // Dropped on purpose. The next cumulative snapshot carries the state this one was
      // carrying, so there is nothing to re-run and nothing to replay (AC-16).
      logger.record('warn', 'report.progress_dropped', REPORT_COUNTERS.progressDropped, {
        ...identityFieldsOf(body),
        kind: body.kind,
        ...(outcome.kind === 'response' ? { status: outcome.status } : { reason: outcome.kind }),
      });
      return { kind: 'DROPPED', attempts: 1 };
    },

    async deliverTerminal(body: ReportBody): Promise<DeliveryResult> {
      if (stopped) return { kind: 'DROPPED', attempts: 0 };

      // Frozen once, here. Every attempt below re-sends this exact string.
      const bytes = freezeBytes(body);
      const deadline = options.now() + terminal.windowMs;
      let issued = 0;

      for (let attempt = 1; attempt <= terminal.maxAttempts; attempt += 1) {
        issued = attempt;
        const outcome = await send(body, bytes, attempt);

        if (outcome.kind === 'response' && outcome.status === 409) {
          noteOwnershipLost(body);
          return { kind: 'OWNERSHIP_LOST', attempts: attempt };
        }
        if (outcome.kind === 'response' && outcome.status >= 200 && outcome.status < 300) {
          logger.record('info', 'report.terminal_delivered', REPORT_COUNTERS.terminalDelivered, {
            ...identityFieldsOf(body),
            attempts: attempt,
          });
          return { kind: 'ACKNOWLEDGED', attempts: attempt };
        }
        if (!isRetryable(outcome)) {
          logger.record('error', 'report.terminal_rejected', REPORT_COUNTERS.terminalAbandoned, {
            ...identityFieldsOf(body),
            ...(outcome.kind === 'response' ? { status: outcome.status } : { reason: outcome.kind }),
            attempts: attempt,
          });
          return { kind: 'ABANDONED', attempts: attempt };
        }

        if (attempt === terminal.maxAttempts) break;
        // Jitter spreads a fleet of runners retrying against one API replica set.
        const backoff = terminal.backoffMs * attempt * (0.5 + options.random() * 0.5);
        const wait = Math.min(backoff, Math.max(0, deadline - options.now()));
        if (options.now() + wait >= deadline) break;
        await options.sleep(wait);
        if (options.now() >= deadline) break;
      }

      logger.record('error', 'report.terminal_abandoned', REPORT_COUNTERS.terminalAbandoned, {
        ...identityFieldsOf(body),
        attempts: issued,
      });
      return { kind: 'ABANDONED', attempts: issued };
    },
  };
}
