/**
 * Checks Studio guided-session types (STUDIO-OBS-008 W2.0 interface drop, lane L2b).
 *
 * Hand-written from, and asserted against, the contract documents rather than generated (plan
 * AD-1, no codegen dependency):
 *
 *  - `docs/specs/studio/openapi.yaml` (operations `startGuidedSession`, `readGuidedSession`,
 *    `readGuidedResult`, `readGuidedClarification`, `clarifyGuidedSession`, `cancelGuidedSession`,
 *    `finalizeObservedPublication`, `getGuidedSessionVideo`, `readLatestGuidedAttempts`,
 *    `getStudioTestCapabilities`);
 *  - `docs/specs/studio-observed-authoring/contracts/v3/*.schema.json`:
 *    `session-view`, `result`, `clarification`, `latest-attempts`, `commands` (start, clarify, cancel), `publication`,
 *    `error`, `action-timing`, `learned-plan` (`RelearnedFrom`) and
 *    `public-ui-projections` (`StudioCapabilities`, `PublicProgress`, `PublicExplanation`).
 *
 * Every wire object here is closed (`additionalProperties: false`) in the contract. The unions
 * below are runtime values first and types second, on the `EXECUTION_ERROR_CODES` pattern in
 * `studioTypes.ts`, so `studioContract.test.ts` can compare each one against the document.
 *
 * Nothing in this file carries a secret value, token or authored text beyond the contract's own
 * fields. `PublicProgress.activeStep.text` and `GuidedClarification` choice labels are the
 * contract's own presentation strings and are the only free text on the wire.
 */

import type { VideoEvidence } from './studioTypes';

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

/**
 * `session-view.schema.json#/definitions/PublicSession.properties.state`, in contract order. The
 * result schema's `outcome` is the same enum.
 */
export const GUIDED_SESSION_STATES = [
  'PREPARING',
  'REPLAYING_PREFIX',
  'OBSERVING',
  'PROPOSING',
  'ACTING',
  'AWAITING_CLARIFICATION',
  'FINALIZING',
  'SUCCEEDED',
  'PUBLICATION_CONFLICT',
  'FAILED',
  'UNKNOWN_OUTCOME',
  'CANCELLED',
  'EXPIRED',
] as const;

export type GuidedSessionState = (typeof GUIDED_SESSION_STATES)[number];

/**
 * The states after which a session never moves again. This is the backend's own set
 * (`GuidedSessionService.TERMINAL`): `progress` is `null` in every one of them, and `readResult`
 * is the read that follows. `FINALIZING` is deliberately not in it: the client finalizes there.
 */
export const GUIDED_TERMINAL_STATES = [
  'SUCCEEDED',
  'PUBLICATION_CONFLICT',
  'FAILED',
  'UNKNOWN_OUTCOME',
  'CANCELLED',
  'EXPIRED',
] as const satisfies readonly GuidedSessionState[];

export type GuidedTerminalState = (typeof GUIDED_TERMINAL_STATES)[number];

export function isGuidedTerminalState(state: GuidedSessionState): state is GuidedTerminalState {
  return (GUIDED_TERMINAL_STATES as readonly GuidedSessionState[]).includes(state);
}

// ---------------------------------------------------------------------------
// Public projections (P2 progress, P3 explanation)
// ---------------------------------------------------------------------------

/** The step the session is on, by stable ID. `text` is the authored sentence only. */
export interface GuidedActiveStep {
  stepId: string;
  /** 1-based, 1..100. */
  number: number;
  text: string;
}

/**
 * `PublicProgress` (P2). The one source of "step N of M": a client never infers it from counters,
 * timers or its own editor state. `activeStep` is `null` while finalizing, in every terminal state
 * and whenever the API cannot name the step.
 */
export interface PublicProgress {
  /** The session's frozen source step count, 0..100. */
  stepCount: number;
  activeStep: GuidedActiveStep | null;
}

/** `PublicExplanation.steps[].actions[].outcome`. */
export const GUIDED_ACTION_OUTCOMES = [
  'ADMITTED',
  'DISPATCHING',
  'SUCCEEDED',
  'FAILED',
  'UNKNOWN_OUTCOME',
  'REVOKED',
] as const;

export type GuidedActionOutcome = (typeof GUIDED_ACTION_OUTCOMES)[number];

export interface PublicExplanationAction {
  admissionId: string;
  /** 0..7. */
  ordinal: number;
  /** 0..1. */
  attemptOrdinal: number;
  outcome: GuidedActionOutcome;
  /** Declared reference IDs only, never a value. At most 32, unique. */
  referenceIds: string[];
}

export interface PublicExplanationReusedFrom {
  revisionId: string;
  stepId: string;
}

export interface PublicExplanationStep {
  stepId: string;
  /** 1-based, 1..100. */
  number: number;
  completed: boolean;
  learnedFromThisRun: boolean;
  reusedFrom: PublicExplanationReusedFrom | null;
  relearnedAfterDrift: boolean;
  /** At most 9. Empty when the retained facts do not prove an action. */
  actions: PublicExplanationAction[];
}

export interface PublicExplanationReferenceFlow {
  bindingId: string;
  producerStepId: string;
  consumerStepId: string;
}

/**
 * `PublicExplanation` (P3). A read-only account of what this session did, from the session itself
 * and never from the test's current head. It does not imply publication: `GuidedResult.publication`
 * stays the authority for that.
 */
export interface PublicExplanation {
  sessionId: string;
  sourceRevision: string;
  configurationRevision: string;
  steps: PublicExplanationStep[];
  referenceFlows: PublicExplanationReferenceFlow[];
}

// ---------------------------------------------------------------------------
// Session view
// ---------------------------------------------------------------------------

/** `PublicSession.counters`. */
export interface GuidedCounters {
  actions: number;
  observations: number;
  modelProposals: number;
  modelInputTokens: number;
  modelOutputTokens: number;
  sanitizedEvidenceBytes: number;
}

/**
 * `PublicSession`: the body of `clarify` and `cancel` (202), and `GuidedSessionView.session`.
 * `baseRevisionId` and `firstLearnStepId` are present together or not at all.
 */
export interface PublicSession {
  schemaVersion: 3;
  sessionId: string;
  testId: string;
  state: GuidedSessionState;
  /** UTC `…Z`, 1..9 fractional digits. */
  expiresAt: string;
  counters: GuidedCounters;
  progress: PublicProgress;
  baseRevisionId?: string;
  firstLearnStepId?: string;
}

/**
 * `session-view.schema.json`: the body of `startSession` (202) and `readSession` (200). `result` is
 * `null` until the session has one.
 */
export interface GuidedSessionView {
  schemaVersion: 3;
  session: PublicSession;
  result: GuidedResult | null;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** `result.schema.json` `publication.status` for the non-published members. */
export const GUIDED_UNPUBLISHED_STATUSES = ['PENDING', 'CONFLICT', 'REFUSED'] as const;

export type GuidedUnpublishedStatus = (typeof GUIDED_UNPUBLISHED_STATUSES)[number];

/** `publication.schema.json#/definitions/PublicationReceipt`. */
export interface PublicationReceipt {
  schemaVersion: 3;
  sessionId: string;
  revisionId: string;
  revisionDigest: string;
  learnedPlanHash: string;
  artifactHash: string;
  publicationEvidenceHash: string;
  /** Millisecond `…sss Z` profile. */
  publishedAt: string;
  learnedFromThisRun: true;
  replayVerified: false;
  relearnedFrom: RelearnedFrom | null;
}

/**
 * `learned-plan.schema.json#/definitions/RelearnedFrom`. Until the committed boundary, drift or
 * empty-prefix switch, results report `relearnedFrom: null`.
 */
export interface RelearnedFrom {
  stepId: string;
  driftSwitchStepId?: string;
}

export type GuidedPublication =
  | { status: 'PUBLISHED'; receipt: PublicationReceipt }
  | { status: GuidedUnpublishedStatus; receipt: null };

/** `result.currentReadiness.code`. */
export const GUIDED_READINESS_CODES = [
  'READY',
  'NOT_PUBLISHED',
  'HEAD_CHANGED',
  'SOURCE_CHANGED',
  'CONFIG_CHANGED',
  'RUNTIME_INCOMPATIBLE',
  'REPLAY_DISABLED',
] as const;

export type GuidedReadinessCode = (typeof GUIDED_READINESS_CODES)[number];

/** The result's own account of readiness now. Never derived in Redux (plan AC-2). */
export interface GuidedCurrentReadiness {
  revisionId: string | null;
  ready: boolean;
  code: GuidedReadinessCode;
}

/** `action-timing.schema.json` `kind`. `clarificationWait` and `prefixReplay` are reserved (OBS-015). */
export const GUIDED_TIMING_KINDS = ['step', 'action', 'clarificationWait', 'prefixReplay'] as const;

export type GuidedTimingKind = (typeof GUIDED_TIMING_KINDS)[number];

/**
 * One reading on the recording timeline, integer milliseconds on the run clock. `admissionId` and
 * `ordinal` are non-null exactly when `kind` is `action`. Seek only from `kind: action` with video
 * `AVAILABLE` (ruling D-10).
 */
export interface GuidedActionTiming {
  kind: GuidedTimingKind;
  stepId: string;
  admissionId: string | null;
  ordinal: number | null;
  startMs: number;
  endMs: number | null;
}

/**
 * `result.evidence`. `video` is keyed on the publication (architect R1): `null` exactly when
 * `publication.status` is `PUBLISHED` (the learning recording is discarded; the proof is the replay
 * named by `result.proof`), and the recording of the learning attempt for every other state.
 */
export interface GuidedEvidence {
  kind: 'guidedLedger';
  ref: string | null;
  video: VideoEvidence | null;
}

/**
 * `result.proof`: the observed replay of the revision a learn published (trigger source
 * `AFTER_LEARN`), followed through the ordinary execution routes. Non-null only when the
 * publication is `PUBLISHED`; `null` while that replay was refused or has not been accepted.
 */
export interface GuidedProof {
  executionId: string;
}

/** `result.detail` / `error.detail` / `failure.detail`: present only with `LOGIN_REQUIRED`. */
export interface LoginRequiredDetail {
  stepId: string;
  loginStepsPresent: boolean;
}

/** `error.schema.json` `code`, in contract order. `result.failure.code` is the same list. */
export const GUIDED_ERROR_CODES = [
  'INVALID_CONTRACT',
  'UNAUTHENTICATED',
  'FORBIDDEN_SCOPE',
  'REVISION_CONFLICT',
  'STALE_GENERATION',
  'TARGET_MISMATCH',
  'AMBIGUOUS_TARGET',
  'MISSING_SOURCE',
  'BINDING_ORDER',
  'SENSITIVE_SOURCE',
  'ORIGIN_NOT_ALLOWED',
  'UNSUPPORTED_SURFACE',
  'BUDGET_EXCEEDED',
  'STALE_FENCE',
  'IDEMPOTENCY_CONFLICT',
  'UNKNOWN_OUTCOME',
  'PUBLICATION_CONFLICT',
  'RUNTIME_INCOMPATIBLE',
  'ASSERTION_FAILED',
  'CANCELLED',
  'EXPIRED',
  'SECRET_UNAVAILABLE',
  'VAULT_UNAVAILABLE',
  'LOGIN_REQUIRED',
  'SECRET_TOO_LONG',
  'NO_APPLICATION_URL',
  'MODEL_UNAVAILABLE',
  'MODEL_REFUSED',
] as const;

export type GuidedErrorCode = (typeof GUIDED_ERROR_CODES)[number];

/** `result.schema.json#/properties/failure/oneOf/0/properties/code/enum`. */
export const GUIDED_FAILURE_CODES = [
  'INVALID_CONTRACT',
  'UNAUTHENTICATED',
  'FORBIDDEN_SCOPE',
  'REVISION_CONFLICT',
  'STALE_GENERATION',
  'TARGET_MISMATCH',
  'AMBIGUOUS_TARGET',
  'MISSING_SOURCE',
  'BINDING_ORDER',
  'SENSITIVE_SOURCE',
  'ORIGIN_NOT_ALLOWED',
  'UNSUPPORTED_SURFACE',
  'BUDGET_EXCEEDED',
  'STALE_FENCE',
  'IDEMPOTENCY_CONFLICT',
  'UNKNOWN_OUTCOME',
  'PUBLICATION_CONFLICT',
  'RUNTIME_INCOMPATIBLE',
  'ASSERTION_FAILED',
  'CANCELLED',
  'EXPIRED',
  'SECRET_UNAVAILABLE',
  'VAULT_UNAVAILABLE',
  'LOGIN_REQUIRED',
  'SECRET_TOO_LONG',
] as const;

export type GuidedFailureCode = (typeof GUIDED_FAILURE_CODES)[number];

/** `result.failure`: `detail` is present exactly when `code` is `LOGIN_REQUIRED`. */
export type GuidedFailure =
  | { code: 'LOGIN_REQUIRED'; detail: LoginRequiredDetail }
  | { code: Exclude<GuidedFailureCode, 'LOGIN_REQUIRED'>; detail?: undefined };

/**
 * `result.schema.json`: the body of `readResult` (200, and 202 while publication is pending) and
 * `GuidedSessionView.result`. `outcome` equals the session `state`.
 *
 * `errorCode` is a free-form string in the contract (the existing failure vocabulary plus the
 * secret and login codes); `failure` is the typed carrier and is absent or `null` when there is
 * no named cause.
 */
export interface GuidedResult {
  schemaVersion: 3;
  sessionId: string;
  executionId: string;
  /** 64 lowercase hex. */
  scopeHash: string;
  mode: 'guided';
  outcome: GuidedSessionState;
  assertionsPassed: boolean;
  learnedFromThisRun: boolean;
  replayVerified: false;
  scheduleActivated: false;
  publication: GuidedPublication;
  currentReadiness: GuidedCurrentReadiness;
  evidence: GuidedEvidence;
  /** Non-empty only while `evidence.video.status` is `AVAILABLE`; `[]` when `evidence.video` is `null`. At most 400. */
  actionTimings: GuidedActionTiming[];
  /** The replay that is this learn's proof; `null` unless `publication.status` is `PUBLISHED` and it was accepted. */
  proof: GuidedProof | null;
  errorCode: string | null;
  /** Present only with `errorCode: LOGIN_REQUIRED`. */
  detail?: LoginRequiredDetail;
  failure?: GuidedFailure | null;
  relearnedFrom: RelearnedFrom | null;
  progress: PublicProgress;
  explanation: PublicExplanation;
}

// ---------------------------------------------------------------------------
// Clarification
// ---------------------------------------------------------------------------

/** `clarification.schema.json` `reason`. */
export const GUIDED_CLARIFICATION_REASONS = [
  'AMBIGUOUS_TARGET',
  'AMBIGUOUS_BINDING',
  'MISSING_SOURCE',
  'INSUFFICIENT_EVIDENCE',
  'UNSUPPORTED_SURFACE',
] as const;

export type GuidedClarificationReason = (typeof GUIDED_CLARIFICATION_REASONS)[number];

/** `clarification.schema.json` `promptCode`. */
export const GUIDED_PROMPT_CODES = ['CHOOSE_FIELD', 'CHOOSE_SOURCE', 'REVISE_STEP'] as const;

export type GuidedPromptCode = (typeof GUIDED_PROMPT_CODES)[number];

/** `clarification.schema.json` `choices[].labelSource`. Only `PAGE` is untrusted page text. */
export const GUIDED_LABEL_SOURCES = ['AUTHORED', 'SAVED_INPUT', 'PAGE'] as const;

export type GuidedLabelSource = (typeof GUIDED_LABEL_SOURCES)[number];

interface GuidedChoiceBase {
  choiceId: string;
  safeLabel: string;
  bindingId: string | null;
}

/** `role` and `region` exist on `PAGE` choices only, and are both required there. */
export type GuidedChoice =
  | (GuidedChoiceBase & { labelSource: 'PAGE'; role: string; region: string | null })
  | (GuidedChoiceBase & {
      labelSource: Exclude<GuidedLabelSource, 'PAGE'>;
      role?: undefined;
      region?: undefined;
    });

/**
 * `clarification.schema.json`: the body of `readClarification` (200). `204` is "no pending
 * question" and surfaces as `null` from the client. `phase: source` has `documentId: null`,
 * `generation: 0` and choices without a binding ID. The contract has no "none of these"
 * choice (plan B6, AD-3).
 */
export interface GuidedClarification {
  schemaVersion: 3;
  clarificationId: string;
  sessionId: string;
  scopeHash: string;
  coordinate: { stepId: string; ordinal: number };
  documentId: string | null;
  generation: number;
  reason: GuidedClarificationReason;
  promptCode: GuidedPromptCode;
  /** At most 10. */
  choices: GuidedChoice[];
  expiresAt: string;
  phase: 'source' | 'observed';
}

// ---------------------------------------------------------------------------
// Commands (request bodies)
// ---------------------------------------------------------------------------

/**
 * The exact start context, byte for byte what `getStudioTestCapabilities` returns under
 * `guidedStart.context` (P1): a client sends no revision it did not receive there.
 */
export interface GuidedStartContext {
  schemaVersion: 3;
  /** Lowercase UUID of the persisted test. */
  testId: string;
  /** Decimal string, `^(0|[1-9][0-9]{0,18})$`. */
  sourceRevision: string;
  configurationRevision: string;
  environmentId: string;
  versions: { contract: 3 };
}

/**
 * `commands.schema.json#/definitions/start`. The two optional hints are each checked
 * independently by the server (`REVISION_CONFLICT` with `FIRST_LEARN_STEP_NARROWED`,
 * `FIRST_LEARN_STEP_UNKNOWN`, `BASE_REVISION_MISMATCH` or `BASE_IDENTITY_INCOMPLETE`). Never send a
 * `firstLearnStepId` other than the server's own `firstChangedStepId` (ruling D-3).
 */
export interface GuidedStartRequest extends GuidedStartContext {
  baseRevisionId?: string;
  firstLearnStepId?: string;
}

/** `commands.schema.json#/definitions/clarify`: answers the pending question by `choiceId`. */
export interface ClarifyRequest {
  schemaVersion: 3;
  clarificationId: string;
  choiceId: string;
  generation: number;
}

/** `commands.schema.json#/definitions/cancel`. */
export const GUIDED_CANCEL_REASONS = ['userRequested', 'policyRevoked'] as const;

export type GuidedCancelReason = (typeof GUIDED_CANCEL_REASONS)[number];

export interface CancelRequest {
  schemaVersion: 3;
  reason: GuidedCancelReason;
}

/**
 * `publication.schema.json` (the public `finalizeObservedPublication` body): closed, built from the
 * revisions the start request carried. It names no hash, fence or session; those belong to the
 * internal bridge.
 */
export interface FinalizeRequest {
  schemaVersion: 3;
  expectedSourceRevision: string;
  expectedConfigurationRevision: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * `error.schema.json`: the closed v3 refusal body. `detail` is present exactly when `code` is
 * `LOGIN_REQUIRED`. The contract does not define a `reason` field.
 */
export interface GuidedError {
  schemaVersion: 3;
  code: GuidedErrorCode;
  requestId: string;
  retryable: boolean;
  messageCode: string;
  detail?: LoginRequiredDetail;
}

/**
 * What the transport hands the UI when a guided call is refused with an HTTP response. Every field
 * is read from that response (`openapi.yaml`, `startGuidedSession` responses) and nothing is
 * inferred:
 *  - `httpStatus`: the HTTP status (`400`, `401`, `403`, `409`, `429`, `503`);
 *  - `error`: the closed v3 body (`error.schema.json`) when the response carried one, for example
 *    `409` `REVISION_CONFLICT` and the Studio handler's `429`
 *    `BUDGET_EXCEEDED`; `null` otherwise;
 *  - `platformCode`: the platform envelope's code (`PlatformErrorResponse`, for example the rate
 *    limiter's `RATE_LIMITED` `429` or the authentication `503`) when there is no v3 body;
 *  - `retryAfterSeconds`: the `Retry-After` header (whole seconds, at least 1), `null` when absent.
 * A call that got no response at all has no refusal and produces none.
 */
export interface GuidedStartRefusal {
  httpStatus: number;
  error: GuidedError | null;
  platformCode: string | null;
  retryAfterSeconds: number | null;
}

// ---------------------------------------------------------------------------
// Capabilities (P1)
// ---------------------------------------------------------------------------

/** `StudioCapabilities.guidedStart.code` when `available` is false. */
export const GUIDED_START_UNAVAILABLE_CODES = ['FORBIDDEN_SCOPE', 'RUNTIME_INCOMPATIBLE'] as const;

export type GuidedStartUnavailableCode = (typeof GUIDED_START_UNAVAILABLE_CODES)[number];

export type GuidedStartCapability =
  | { available: true; context: GuidedStartContext }
  | { available: false; code: GuidedStartUnavailableCode };

/**
 * `public-ui-projections.schema.json#/definitions/StudioCapabilities`. `vaultSecrets` is true when
 * a Vault provider is configured; no Vault call is made, so it is not a health check.
 */
export interface StudioCapabilities {
  vaultSecrets: boolean;
  guidedStart: GuidedStartCapability;
}

// ---------------------------------------------------------------------------
// Latest learning attempts (STUDIO-UNIFY-001.6 AC-09, AC-10)
// ---------------------------------------------------------------------------

/** `readLatestGuidedAttempts`: the most `testId` values one request may carry (`maxItems`). */
export const GUIDED_LATEST_ATTEMPTS_MAX_TEST_IDS = 50;

/**
 * One item of `latest-attempts.schema.json#/properties/attempts`: the caller's own most recent
 * terminal guided session for one test. `startedAt` is the session's creation time. `errorCode` is
 * the session's `progress.errorCode`. `explanation` is the public explanation of a `FAILED`
 * attempt and `null` for every other state.
 */
export interface GuidedLatestAttempt {
  testId: string;
  sessionId: string;
  state: GuidedTerminalState;
  /** UTC instant, the family's frozen timestamp pattern. */
  startedAt: string;
  errorCode: string | null;
  explanation: PublicExplanation | null;
}

/** `latest-attempts.schema.json`: a test with no terminal session of the caller is absent. */
export interface GuidedLatestAttempts {
  schemaVersion: 3;
  attempts: GuidedLatestAttempt[];
}

// ---------------------------------------------------------------------------
// Client-side shapes (not on the wire)
// ---------------------------------------------------------------------------

/** What `readResult` answers: `200` is final, `202` is a pending publication, never a success. */
export type GuidedResultRead =
  | { status: 'final'; result: GuidedResult }
  | { status: 'pending'; result: GuidedResult };

/**
 * Why a session is held without a final answer. Each value is one contract element:
 *  - `REAUTHENTICATION_REQUIRED`: HTTP `401` (`SessionUnauthorized`, every guided route). The
 *    pointer is kept and nothing is shown as success.
 *  - `NOT_READY`: HTTP `503` on any guided route ("Current authority or Vault unavailable"), or a
 *    `400`/`409` refusing the finalize call, after which the session stays in `FINALIZING` and no
 *    publication exists.
 *  - `PUBLICATION_PENDING`: HTTP `202` on `readGuidedResult` ("Pending publication, not a success
 *    claim"; the body's `publication.status` is `PENDING`).
 */
export const GUIDED_PENDING_REASONS = [
  'REAUTHENTICATION_REQUIRED',
  'NOT_READY',
  'PUBLICATION_PENDING',
] as const;

export type GuidedPendingReason = (typeof GUIDED_PENDING_REASONS)[number];

/**
 * The only thing persisted for a guided session (plan P6, `sessionStorage` key
 * {@link guidedSessionStorageKey}). IDs, keys and the closed start body only: no authored text,
 * value or token. `sessionId` is `null` until the start answer arrives; once it is known nothing
 * re-POSTs start and every reload only GETs by `sessionId`.
 */
export interface GuidedSessionPointer {
  testId: string;
  sessionId: string | null;
  startKey: string;
  finalizeKey: string;
  startRequest: GuidedStartRequest;
}

export const GUIDED_SESSION_STORAGE_PREFIX = 'checks.studio.guided.v1:';

export function guidedSessionStorageKey(testId: string): string {
  return `${GUIDED_SESSION_STORAGE_PREFIX}${testId}`;
}
