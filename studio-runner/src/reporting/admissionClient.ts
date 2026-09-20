/**
 * Admission CAS **client** (AC-7, AC-8, AC-9, architecture §5.1.4, §5.1 closing paragraph).
 *
 * The compare-and-set itself is the API's (story 10.7). This file is the runner's half: it issues
 * **exactly one** request per run and translates the outcome into a verdict the run loop obeys
 * without discretion.
 *
 * Three outcomes, and the difference between them is the whole security property:
 *
 * | Outcome | Meaning | What the runner does |
 * |---|---|---|
 * | `ADMITTED` | This `(runnerInstanceId, admissionId)` owns the attempt | Launch, exactly once |
 * | `REFUSED` (`409`/`401`/`403`) | Definite non-acceptance; nothing was granted | Stop. Never re-attempt. |
 * | `AMBIGUOUS` (timeout, transport loss, 5xx, `307`/`308`) | **Unknown** — admission may already have been granted | Stop. Never resend. |
 *
 * `AMBIGUOUS` is not a softer `REFUSED`; it is the dangerous one. A timed-out admission may have
 * committed on the API side, so a second attempt risks two runners owning one attempt and two
 * browsers running one test. Resolving the ambiguity is the API's reaper work in 10.7. The runner
 * holds no state and cannot resolve it, so it does the only safe thing: nothing.
 *
 * **There is no retry here, at any level.** Not in the client (it has no retry parameter), not in
 * this module, not in the caller. And the runner never generates a second `admissionId` for the
 * same `attemptId` — that is the one way a single runner could compete with itself for an attempt
 * it may already own (AC-7).
 */
import { randomUUID } from 'node:crypto';

import type { HttpClient } from './httpClient.js';
import type { Logger } from '../server/logging.js';

export interface AdmissionIdentity {
  /** Stable for the life of the process (AC-7). */
  readonly runnerInstanceId: string;
  /** Fresh per run, never reused, never regenerated for a retry that does not happen (AC-7). */
  readonly admissionId: string;
}

export type AmbiguityReason = 'TIMEOUT' | 'TRANSPORT' | 'SERVER_ERROR' | 'REDIRECT';

export type AdmissionOutcome =
  | { readonly kind: 'ADMITTED'; readonly identity: AdmissionIdentity }
  | { readonly kind: 'REFUSED'; readonly status: number; readonly code: string }
  | { readonly kind: 'AMBIGUOUS'; readonly reason: AmbiguityReason; readonly status?: number };

export interface AdmissionRequestInput {
  readonly executionId: string;
  readonly attemptId: string;
  readonly identity: AdmissionIdentity;
  /** Runtime versions recorded by the build, reported on every admission (architecture §4.6). */
  readonly runtimeVersions: Readonly<Record<string, unknown>>;
}

export interface AdmissionClient {
  /** Issues exactly one admission request. Resolves to a verdict; never throws for an HTTP fault. */
  admit(input: AdmissionRequestInput): Promise<AdmissionOutcome>;
}

export interface AdmissionClientOptions {
  readonly http: HttpClient;
  readonly baseUrl: string;
  readonly identityToken: string;
  readonly timeoutMs: number;
  readonly logger: Logger;
}

export const ADMISSION_COUNTERS = {
  admitted: 'runner.admission.admitted',
  refused: 'runner.admission.refused',
  ambiguous: 'runner.admission.ambiguous',
} as const;

/** `POST /internal/studio/executions/{id}/admission` (architecture §8.4). */
function admissionUrl(baseUrl: string, executionId: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}/internal/studio/executions/${encodeURIComponent(executionId)}/admission`;
}

function refusalCode(status: number, body: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        const code = (parsed as Record<string, unknown>).code;
        if (typeof code === 'string' && code !== '') return code;
      }
    } catch {
      // A malformed error body is not worth a second failure mode; fall through to the status.
    }
  }
  return status === 409 ? 'ADMISSION_COMPETING' : `ADMISSION_REFUSED_${String(status)}`;
}

export function createAdmissionClient(options: AdmissionClientOptions): AdmissionClient {
  const { http, baseUrl, identityToken, timeoutMs, logger } = options;

  return {
    async admit(input: AdmissionRequestInput): Promise<AdmissionOutcome> {
      const body = JSON.stringify({
        executionId: input.executionId,
        attemptId: input.attemptId,
        runnerInstanceId: input.identity.runnerInstanceId,
        admissionId: input.identity.admissionId,
        runtimeVersions: input.runtimeVersions,
      });

      // One request. The absence of a loop around this call is the AC-9 guarantee.
      const outcome = await http.send({
        url: admissionUrl(baseUrl, input.executionId),
        method: 'POST',
        headers: {
          // The credential travels in a header. Never in the URL or a query string (AC-3).
          authorization: `Bearer ${identityToken}`,
          'content-type': 'application/json',
        },
        body,
        timeoutMs,
      });

      const identityFields = {
        executionId: input.executionId,
        attemptId: input.attemptId,
        admissionId: input.identity.admissionId,
        runnerInstanceId: input.identity.runnerInstanceId,
      };

      if (outcome.kind === 'timeout') {
        logger.record('warn', 'admission.ambiguous', ADMISSION_COUNTERS.ambiguous, {
          ...identityFields,
          reason: 'TIMEOUT',
        });
        return { kind: 'AMBIGUOUS', reason: 'TIMEOUT' };
      }
      if (outcome.kind === 'transport') {
        logger.record('warn', 'admission.ambiguous', ADMISSION_COUNTERS.ambiguous, {
          ...identityFields,
          reason: 'TRANSPORT',
        });
        return { kind: 'AMBIGUOUS', reason: 'TRANSPORT' };
      }

      const { status } = outcome;

      if (status >= 200 && status < 300) {
        logger.record('info', 'admission.admitted', ADMISSION_COUNTERS.admitted, identityFields);
        return { kind: 'ADMITTED', identity: input.identity };
      }

      // A redirect is not a routing detail on this route: re-issuing the POST to the target is a
      // second admission request. The client already refused to follow it; the verdict records
      // that the outcome is unknown rather than that the request failed.
      if (status === 307 || status === 308 || status === 301 || status === 302 || status === 303) {
        logger.record('warn', 'admission.ambiguous', ADMISSION_COUNTERS.ambiguous, {
          ...identityFields,
          reason: 'REDIRECT',
          status,
        });
        return { kind: 'AMBIGUOUS', reason: 'REDIRECT', status };
      }

      if (status >= 500) {
        logger.record('warn', 'admission.ambiguous', ADMISSION_COUNTERS.ambiguous, {
          ...identityFields,
          reason: 'SERVER_ERROR',
          status,
        });
        return { kind: 'AMBIGUOUS', reason: 'SERVER_ERROR', status };
      }

      const code = refusalCode(status, outcome.body);
      logger.record('warn', 'admission.refused', ADMISSION_COUNTERS.refused, {
        ...identityFields,
        status,
        code,
      });
      return { kind: 'REFUSED', status, code };
    },
  };
}

/**
 * Fresh admission identity for one run.
 *
 * Called **once** per `POST /v1/runs`. There is deliberately no "regenerate" helper: a second
 * `admissionId` for the same `attemptId` is the failure mode AC-7 names, and the cheapest way to
 * prevent it is to give nobody a function that produces one.
 *
 * The contract declares `admissionId` as `format: uuid` (`AdmissionRequest`, `AdmissionResponse`)
 * and the ledger column is `UUID`, so the API refuses anything else with `400` before the CAS runs.
 */
export function newAdmissionIdentity(runnerInstanceId: string): AdmissionIdentity {
  return {
    runnerInstanceId,
    admissionId: randomUUID(),
  };
}
