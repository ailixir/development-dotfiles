import axios, { type AxiosResponseTransformer } from 'axios';
import { studioVideoUrl } from '@/components/studio/evidence/studioVideoUrl';
import {
  GUIDED_ERROR_CODES,
  GUIDED_LATEST_ATTEMPTS_MAX_TEST_IDS,
  type CancelRequest,
  type ClarifyRequest,
  type FinalizeRequest,
  type GuidedClarification,
  type GuidedError,
  type GuidedErrorCode,
  type GuidedLatestAttempt,
  type GuidedLatestAttempts,
  type GuidedResult,
  type GuidedResultRead,
  type GuidedSessionView,
  type GuidedStartRefusal,
  type GuidedStartRequest,
  type PublicationReceipt,
  type PublicSession,
} from '@/types/studio/studioGuidedTypes';
import apiClient from './apiClient';

/**
 * Guided-session client (STUDIO-OBS-008 AC-1, W2.0 interface drop), typed against
 * `docs/specs/studio/openapi.yaml` operations `startGuidedSession`, `readGuidedSession`,
 * `readGuidedResult`, `readGuidedClarification`, `clarifyGuidedSession`, `cancelGuidedSession`,
 * `finalizeObservedPublication` and `readLatestGuidedAttempts`. All calls go through `apiClient` (base `/api/v1`).
 *
 * Every guided mutation takes a **required** `Idempotency-Key` (`GuidedIdempotencyKey`, 1..256
 * characters; ruling D-1, plan B5). The key is the caller's: it is stable per logical operation and
 * is persisted by the session hook (plan P6) so a lost response retries with the same key and body.
 * Nothing here generates a key on the caller's behalf except {@link newGuidedIdempotencyKey}, which
 * the caller invokes once per logical operation.
 *
 * Every request body is rebuilt as the contract's closed object (`additionalProperties: false`)
 * before it leaves the client, so a caller's extra field never reaches the wire.
 */

const GUIDED_SESSIONS_PATH = '/studio/guided-sessions';

/** Path of the video route, rooted at the API base the way the server publishes execution video. */
const GUIDED_VIDEO_BASE_PATH = '/api/v1/studio/guided-sessions';

function sessionPath(sessionId: string): string {
  return `${GUIDED_SESSIONS_PATH}/${encodeURIComponent(sessionId)}`;
}

/** `GuidedIdempotencyKey` (`openapi.yaml`): a required header, 1..256 characters. */
const IDEMPOTENCY_KEY_MAX_LENGTH = 256;

function keyed(idempotencyKey: string): { headers: Record<string, string> } {
  if (idempotencyKey.length < 1 || idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    // Refuse before any request: the server would refuse the header anyway, and a guided mutation
    // must never go out without the key that makes a retry safe (ruling D-1).
    throw new Error(`An Idempotency-Key must be 1..${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`);
  }
  return { headers: { 'Idempotency-Key': idempotencyKey } };
}

/**
 * A fresh key for one logical guided operation (start, clarify, cancel or finalize). The contract
 * accepts any 1..256 character string; a well-formed v4 UUID keeps it compatible with the platform
 * idempotency filter that `executeTest` keys go through.
 */
export function newGuidedIdempotencyKey(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.();
  if (fromCrypto) return fromCrypto;
  const hex = (length: number): string =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

/**
 * `apiClient` resolves a call to the response body alone, so a `200` and a `202` that carry the
 * same schema cannot be told apart. This keeps axios's own parsing (so error bodies stay as the
 * client's error normalizer expects) and wraps only a successful body with its status.
 */
interface StatusEnvelope<T> {
  __guidedHttpStatus: number;
  body: T;
}

function defaultResponseTransforms(): AxiosResponseTransformer[] {
  const defaults = axios.defaults.transformResponse;
  if (!defaults) return [];
  return Array.isArray(defaults) ? defaults : [defaults];
}

const LATEST_ATTEMPTS_PATH = `${GUIDED_SESSIONS_PATH}/latest`;

const KEEP_SUCCESS_STATUS: AxiosResponseTransformer[] = [
  ...defaultResponseTransforms(),
  (data: unknown, _headers, status?: number) =>
    typeof status === 'number' && status >= 200 && status < 300
      ? ({ __guidedHttpStatus: status, body: data } satisfies StatusEnvelope<unknown>)
      : data,
];

export const studioGuidedApi = {
  /**
   * `POST /studio/guided-sessions` (`startGuidedSession`, `202`). `body` is the capability's exact
   * `guidedStart.context` plus the optional `baseRevisionId` and `firstLearnStepId` hints. A `409`
   * or `429` refusal rejects (`REVISION_CONFLICT`, `BUDGET_EXCEEDED`, …) and
   * leaves nothing written. A lost response retries the exact body under the same key.
   */
  startSession: async (
    body: GuidedStartRequest,
    idempotencyKey: string,
  ): Promise<GuidedSessionView> =>
    apiClient.post(GUIDED_SESSIONS_PATH, startBodyFrom(body), keyed(idempotencyKey)),

  /** `GET /studio/guided-sessions/{id}` (`readGuidedSession`). */
  readSession: (sessionId: string): Promise<GuidedSessionView> =>
    apiClient.get(sessionPath(sessionId)),

  /**
   * `GET /studio/guided-sessions/{id}/result` (`readGuidedResult`). `200` is `final`; `202` is
   * `pending` publication, which is never a success claim. A terminal session may still report
   * `evidence.video.status: PROCESSING`; the caller re-polls until it settles.
   */
  readResult: async (sessionId: string): Promise<GuidedResultRead> => {
    const envelope = await apiClient.get<StatusEnvelope<GuidedResult>>(
      `${sessionPath(sessionId)}/result`,
      { transformResponse: KEEP_SUCCESS_STATUS },
    );
    return {
      status: envelope.__guidedHttpStatus === 202 ? 'pending' : 'final',
      result: envelope.body,
    };
  },

  /**
   * `GET /studio/guided-sessions/{id}/clarification` (`readGuidedClarification`). `204` ("no
   * pending question") is `null`.
   */
  readClarification: async (sessionId: string): Promise<GuidedClarification | null> => {
    const body = await apiClient.get<GuidedClarification | ''>(
      `${sessionPath(sessionId)}/clarification`,
    );
    return typeof body === 'object' && body !== null ? body : null;
  },

  /**
   * `POST /studio/guided-sessions/{id}/clarify` (`clarifyGuidedSession`, `202`). The body names a
   * server `choiceId`; there is no "none of these" choice in the contract (plan B6, AD-3).
   */
  clarify: async (
    sessionId: string,
    body: ClarifyRequest,
    idempotencyKey: string,
  ): Promise<PublicSession> =>
    apiClient.post(`${sessionPath(sessionId)}/clarify`, body, keyed(idempotencyKey)),

  /**
   * `POST /studio/guided-sessions/{id}/cancel` (`cancelGuidedSession`, `202`). The body is the
   * closed `{schemaVersion: 3, reason}`.
   */
  cancel: async (
    sessionId: string,
    body: CancelRequest,
    idempotencyKey: string,
  ): Promise<PublicSession> =>
    apiClient.post(`${sessionPath(sessionId)}/cancel`, body, keyed(idempotencyKey)),

  /**
   * `POST /studio/guided-sessions/{id}/finalize` (`finalizeObservedPublication`, `200`). The body
   * is the closed `{schemaVersion: 3, expectedSourceRevision, expectedConfigurationRevision}`,
   * taken from the start request's revisions.
   */
  finalize: async (
    sessionId: string,
    body: FinalizeRequest,
    idempotencyKey: string,
  ): Promise<PublicationReceipt> =>
    apiClient.post(
      `${sessionPath(sessionId)}/finalize`,
      // Closed: exactly the three contract keys, whatever the caller handed over.
      {
        schemaVersion: 3,
        expectedSourceRevision: body.expectedSourceRevision,
        expectedConfigurationRevision: body.expectedConfigurationRevision,
      } satisfies FinalizeRequest,
      keyed(idempotencyKey),
    ),

  /**
   * `GET /studio/guided-sessions/latest?testId=…&testId=…` (`readLatestGuidedAttempts`): the
   * caller's own latest terminal learning attempt for each test that has one. A test with none, an
   * unknown test and one the caller cannot read are simply absent from the answer. The route takes
   * 1..50 ids, so an empty list resolves `[]` without a request and a longer one is split into
   * chunks of 50 (duplicates collapse first) whose answers are merged in request order.
   *
   * `signal` cancels every chunk (story .5: a cancelled call rejects quietly). This is a best-effort
   * read for a caption, so a failed call is not retried: the caller shows nothing instead.
   */
  readLatestAttempts: async (
    testIds: readonly string[],
    options: { signal?: AbortSignal } = {},
  ): Promise<GuidedLatestAttempt[]> => {
    const unique = [...new Set(testIds)];
    const chunks: string[][] = [];
    for (let at = 0; at < unique.length; at += GUIDED_LATEST_ATTEMPTS_MAX_TEST_IDS) {
      chunks.push(unique.slice(at, at + GUIDED_LATEST_ATTEMPTS_MAX_TEST_IDS));
    }
    const answers = await Promise.all(
      chunks.map((chunk) =>
        apiClient.get<GuidedLatestAttempts>(LATEST_ATTEMPTS_PATH, {
          params: { testId: chunk },
          // `testId=a&testId=b`, the contract's repeated form; axios's default adds `[]`.
          paramsSerializer: { indexes: null },
          signal: options.signal,
          __doNotRetry: true,
        }),
      ),
    );
    return answers.flatMap((answer) => (Array.isArray(answer?.attempts) ? answer.attempts : []));
  },

  /**
   * The `<video src>` for `getGuidedSessionVideo`: built from `sessionId`, like
   * {@link studioVideoUrl} builds execution video. No fetch and no token query; the ambient session
   * authorizes the native request. Render only when `result.evidence.video.status` is `AVAILABLE`.
   */
  videoPath: (sessionId: string): string =>
    studioVideoUrl(`${GUIDED_VIDEO_BASE_PATH}/${encodeURIComponent(sessionId)}/video`),
};

// ---------------------------------------------------------------------------
// Closed request bodies
// ---------------------------------------------------------------------------

/**
 * The start body with exactly the contract's keys (`commands.schema.json#/definitions/start`
 * is `additionalProperties: false`). A caller may hand over a wider object (a capability context
 * with a spread-in field, say); nothing outside the contract leaves the client. The two optional
 * hints are present only when set.
 */
export function startBodyFrom(input: GuidedStartRequest): GuidedStartRequest {
  const body: GuidedStartRequest = {
    schemaVersion: 3,
    testId: input.testId,
    sourceRevision: input.sourceRevision,
    configurationRevision: input.configurationRevision,
    environmentId: input.environmentId,
    versions: { contract: 3 },
  };
  if (input.baseRevisionId !== undefined) body.baseRevisionId = input.baseRevisionId;
  if (input.firstLearnStepId !== undefined) body.firstLearnStepId = input.firstLearnStepId;
  return body;
}

/**
 * The closed finalize body (`publication.schema.json`), taken from the revisions the start request
 * carried. It names no hash, fence or session.
 */
export function finalizeBodyFrom(startRequest: GuidedStartRequest): FinalizeRequest {
  return {
    schemaVersion: 3,
    expectedSourceRevision: startRequest.sourceRevision,
    expectedConfigurationRevision: startRequest.configurationRevision,
  };
}

/** The closed clarify body, answering the pending question by a server `choiceId`. */
export function clarifyBodyFor(
  clarification: Pick<GuidedClarification, 'clarificationId' | 'generation'>,
  choiceId: string,
): ClarifyRequest {
  return {
    schemaVersion: 3,
    clarificationId: clarification.clarificationId,
    choiceId,
    generation: clarification.generation,
  };
}

/** The closed cancel body for the author's own Cancel. */
export const USER_CANCEL_BODY: CancelRequest = { schemaVersion: 3, reason: 'userRequested' };

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/** The HTTP status of a rejected `apiClient` call, or `null` when no response arrived. */
export function httpStatusOf(error: unknown): number | null {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === 'number' ? status : null;
}

function responseBodyOf(error: unknown): unknown {
  return (error as { response?: { data?: unknown } } | null)?.response?.data;
}

/**
 * The closed v3 refusal body (`error.schema.json`) of a rejected call, or `null` when the response
 * carried none (a platform envelope, an empty body, a network failure). Checked field by field:
 * the schema requires `schemaVersion`, `code`, `requestId`, `retryable` and `messageCode`.
 */
export function guidedErrorOf(error: unknown): GuidedError | null {
  const body = responseBodyOf(error);
  if (typeof body !== 'object' || body === null) return null;
  const candidate = body as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 3 ||
    typeof candidate.code !== 'string' ||
    !(GUIDED_ERROR_CODES as readonly string[]).includes(candidate.code) ||
    typeof candidate.requestId !== 'string' ||
    typeof candidate.retryable !== 'boolean' ||
    typeof candidate.messageCode !== 'string'
  ) {
    return null;
  }
  const result: GuidedError = {
    schemaVersion: 3,
    code: candidate.code as GuidedErrorCode,
    requestId: candidate.requestId,
    retryable: candidate.retryable,
    messageCode: candidate.messageCode,
  };
  const detail = candidate.detail as Record<string, unknown> | undefined;
  if (
    detail &&
    typeof detail.stepId === 'string' &&
    typeof detail.loginStepsPresent === 'boolean'
  ) {
    result.detail = { stepId: detail.stepId, loginStepsPresent: detail.loginStepsPresent };
  }
  return result;
}

/**
 * The code of a platform envelope refusal (`PlatformErrorResponse`: `{error: {code, message}}`, for
 * example `RATE_LIMITED` on `429` and `AUTH_TEMPORARILY_UNAVAILABLE` on `503`) or of the flat
 * `ErrorResponse` (`{error: 'CODE'}`). `null` when the body has neither.
 */
function platformCodeOf(error: unknown): string | null {
  const body = responseBodyOf(error);
  if (typeof body !== 'object' || body === null) return null;
  const inner = (body as { error?: unknown }).error;
  if (typeof inner === 'string' && inner !== '') return inner;
  const code = (inner as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code !== '' ? code : null;
}

/** `Retry-After` in whole seconds (at least 1), or `null` when the header is absent or unusable. */
function retryAfterSecondsOf(error: unknown): number | null {
  const headers = (error as { response?: { headers?: unknown } } | null)?.response?.headers as
    | { get?: (name: string) => unknown; [name: string]: unknown }
    | undefined;
  if (!headers) return null;
  const raw = typeof headers.get === 'function' ? headers.get('retry-after') : headers['retry-after'];
  const seconds = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : Number.NaN;
  return Number.isInteger(seconds) && seconds >= 1 ? seconds : null;
}

/**
 * Describes a rejected guided call as the {@link GuidedStartRefusal} the UI renders. Every field is
 * read from the response and nothing is inferred:
 *  - `httpStatus`: the HTTP status;
 *  - `error`: the closed v3 body when the response carried one ({@link guidedErrorOf});
 *  - `platformCode`: the platform envelope's code when it carried that instead;
 *  - `retryAfterSeconds`: the `Retry-After` header.
 * Returns `null` when no response arrived at all (a network failure has no refusal to show).
 */
export function toGuidedStartRefusal(error: unknown): GuidedStartRefusal | null {
  const httpStatus = httpStatusOf(error);
  if (httpStatus === null) return null;
  const v3 = guidedErrorOf(error);
  return {
    httpStatus,
    error: v3,
    platformCode: v3 ? null : platformCodeOf(error),
    retryAfterSeconds: retryAfterSecondsOf(error),
  };
}

export default studioGuidedApi;
