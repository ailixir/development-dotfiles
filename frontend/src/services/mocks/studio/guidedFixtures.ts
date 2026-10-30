import contractFixtures from '../../../../../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json';
import type {
  GuidedActionTiming,
  GuidedClarification,
  GuidedError,
  GuidedErrorCode,
  GuidedFailure,
  GuidedFailureCode,
  GuidedOperationKind,
  GuidedProof,
  GuidedPublication,
  GuidedResult,
  GuidedSessionState,
  GuidedUnpublishedStatus,
  LoginRequiredDetail,
  PublicExplanation,
  PublicExplanationStep,
  PublicProgress,
  PublicSession,
  PublicationReceipt,
  RelearnedFrom,
} from '@/types/studio/studioGuidedTypes';

/**
 * Guided-session fixtures and scenarios (STUDIO-OBS-008 AC-1, lane L2b).
 *
 * Nothing here is a free-hand payload. Documents the contract publishes (`fixtures.json`
 * `documents`) are cloned and adjusted; documents the contract has no example for are built by the
 * functions below, typed against `studioGuidedTypes.ts`, and `guidedHandlers.test.ts` validates
 * every one of them against the v3 schemas (`session-view`, `result`, `clarification`, `error`,
 * `publication`, `public-ui-projections`) with the same draft-07 Ajv harness the contract suite
 * uses. A fixture that the schema refuses fails that test.
 *
 * A scenario is a function of the draft being learned: it returns the script of states the session
 * walks through (one entry per read of the session), and how it ends. The handlers advance the
 * script by read count, not by wall-clock time, so a test's outcome never depends on timing.
 */

const documents = (contractFixtures as unknown as { documents: Record<string, unknown> }).documents;

function contractDocument<T>(name: string): T {
  const found = documents[name];
  if (found === undefined) throw new Error(`contracts/v3/fixtures.json has no document "${name}"`);
  return structuredClone(found) as T;
}

// ---------------------------------------------------------------------------
// Steps, progress, counters
// ---------------------------------------------------------------------------

/** One source step of the draft being learned. */
export interface GuidedStepRef {
  stepId: string;
  text: string;
}

/** `PublicProgress` for the step at `activeIndex` (0-based), or `null` activeStep. */
export function progressFor(steps: readonly GuidedStepRef[], activeIndex: number | null): PublicProgress {
  const active = activeIndex === null ? undefined : steps[activeIndex];
  return {
    stepCount: steps.length,
    activeStep: active ? { stepId: active.stepId, number: (activeIndex ?? 0) + 1, text: active.text } : null,
  };
}

function countersFor(readCount: number): PublicSession['counters'] {
  return {
    actions: readCount,
    observations: readCount,
    modelProposals: readCount,
    modelInputTokens: readCount * 100,
    modelOutputTokens: readCount * 10,
    sanitizedEvidenceBytes: readCount * 512,
  };
}

const SESSION_LIFETIME_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Errors (error.schema.json)
// ---------------------------------------------------------------------------

let requestSequence = 0;

export function resetGuidedFixtureCounters(): void {
  requestSequence = 0;
}

/** A closed v3 refusal body. `messageCode` defaults to the code, as the backend's exception does. */
export function guidedError(
  code: GuidedErrorCode,
  options: { messageCode?: string; retryable?: boolean; detail?: LoginRequiredDetail } = {},
): GuidedError {
  requestSequence += 1;
  const error: GuidedError = {
    schemaVersion: 3,
    code,
    requestId: `request-${requestSequence}`,
    retryable: options.retryable ?? false,
    messageCode: options.messageCode ?? code,
  };
  if (options.detail) error.detail = options.detail;
  return error;
}

/** A refusal the handlers answer with: a status, a body, and the headers the contract names. */
export interface GuidedMockRefusal {
  status: number;
  /** The v3 body, or the platform envelope for the rate limiter and the authentication filter. */
  body: GuidedError | { error: { code: string; message: string } };
  /** `Retry-After`, whole seconds, only where the contract says it is present. */
  retryAfterSeconds?: number;
}

/**
 * The `startGuidedSession` refusals the OpenAPI document spells out (`409` and `429` examples), by
 * name. Each is a complete response: no session, no publication base, no budget charge.
 */
export const GUIDED_START_REFUSALS = {
  FIRST_LEARN_STEP_NARROWED: () => ({
    status: 409,
    body: guidedError('REVISION_CONFLICT', { messageCode: 'FIRST_LEARN_STEP_NARROWED' }),
  }),
  FIRST_LEARN_STEP_UNKNOWN: () => ({
    status: 409,
    body: guidedError('REVISION_CONFLICT', { messageCode: 'FIRST_LEARN_STEP_UNKNOWN' }),
  }),
  BASE_REVISION_MISMATCH: () => ({
    status: 409,
    body: guidedError('REVISION_CONFLICT', { messageCode: 'BASE_REVISION_MISMATCH' }),
  }),
  BASE_IDENTITY_INCOMPLETE: () => ({
    status: 409,
    body: guidedError('REVISION_CONFLICT', { messageCode: 'BASE_IDENTITY_INCOMPLETE' }),
  }),
  RUNTIME_INCOMPATIBLE: () => ({
    status: 409,
    body: guidedError('RUNTIME_INCOMPATIBLE'),
  }),
  FORBIDDEN_SCOPE: () => ({
    status: 403,
    body: guidedError('FORBIDDEN_SCOPE', { messageCode: 'ACCESS_DENIED' }),
  }),
  CSI_CONCURRENT_SESSIONS_EXHAUSTED: () => ({
    status: 429,
    body: guidedError('BUDGET_EXCEEDED', {
      messageCode: 'CSI_CONCURRENT_SESSIONS_EXHAUSTED',
      retryable: true,
    }),
    retryAfterSeconds: 120,
  }),
  /** The page is not in the environment's allowed domains (STUDIO-FLEX-001): refused before any session. */
  ORIGIN_NOT_ALLOWED: () => ({
    status: 403,
    body: guidedError('ORIGIN_NOT_ALLOWED'),
  }),
  /** The deployment-wide cap on concurrent learning sessions (STUDIO-FLEX-001 item 5). */
  LEARNING_CAPACITY_EXHAUSTED: () => ({
    status: 429,
    body: guidedError('BUDGET_EXCEEDED', { messageCode: 'LEARNING_CAPACITY_EXHAUSTED', retryable: true }),
    retryAfterSeconds: 30,
  }),
  CSI_DAILY_TOKENS_EXHAUSTED: () => ({
    status: 429,
    body: guidedError('BUDGET_EXCEEDED', { messageCode: 'CSI_DAILY_TOKENS_EXHAUSTED', retryable: true }),
    retryAfterSeconds: 3600,
  }),
  /** A per-session bound: `retryable: false`, no `Retry-After`. */
  SESSION_BOUND_EXCEEDED: () => ({
    status: 429,
    body: guidedError('BUDGET_EXCEEDED', { messageCode: 'BUDGET_EXCEEDED', retryable: false }),
  }),
  /** The platform rate limiter's envelope, with `Retry-After`. */
  RATE_LIMITED: () => ({
    status: 429,
    body: { error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } },
    retryAfterSeconds: 5,
  }),
  UNAVAILABLE: () => ({
    status: 503,
    body: guidedError('VAULT_UNAVAILABLE', { retryable: true }),
  }),
} satisfies Record<string, () => GuidedMockRefusal>;

export type GuidedStartRefusalName = keyof typeof GUIDED_START_REFUSALS;

// ---------------------------------------------------------------------------
// Clarification (clarification.schema.json)
// ---------------------------------------------------------------------------

/** What kind of question a scenario asks. */
export type GuidedQuestionKind = 'PAGE_CHOICE' | 'SOURCE_CHOICE';

/**
 * The pending question for `kind`, at `stepId`. `PAGE_CHOICE` is the contract's own
 * `labelledQuestion` document (page-derived labels with role and region); `SOURCE_CHOICE` follows
 * the rules the schema states for `phase: source` and for authored labels.
 */
export function clarificationFor(
  kind: GuidedQuestionKind,
  sessionId: string,
  stepId: string,
  sequence: number,
): GuidedClarification {
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const base = contractDocument<GuidedClarification>('labelledQuestion');
  const common = {
    ...base,
    clarificationId: `question-${sequence}`,
    sessionId,
    coordinate: { stepId, ordinal: 0 },
    expiresAt,
  };
  if (kind === 'PAGE_CHOICE') return common;
  return {
    ...common,
    phase: 'source',
    documentId: null,
    generation: 0,
    reason: 'MISSING_SOURCE',
    promptCode: 'CHOOSE_SOURCE',
    choices: [
      { choiceId: 'choice-1', safeLabel: 'Use authored text', labelSource: 'AUTHORED', bindingId: null },
      { choiceId: 'choice-2', safeLabel: 'Use a saved input', labelSource: 'SAVED_INPUT', bindingId: null },
    ],
  };
}

// ---------------------------------------------------------------------------
// Explanation (public-ui-projections PublicExplanation)
// ---------------------------------------------------------------------------

/** The controlled `safeLabel` of each operation kind (`PublicExplanation` `allOf`). */
const SAFE_LABELS: Record<GuidedOperationKind, string> = {
  navigate: 'Open page',
  click: 'Click control',
  fill: 'Fill field',
  press: 'Press key',
  check: 'Check control',
  uncheck: 'Uncheck control',
  hover: 'Move over control',
  selectOption: 'Select option',
  read: 'Read reference',
  assert: 'Check expected result',
};

function operationKindOf(text: string): GuidedOperationKind {
  const lower = text.toLowerCase();
  if (lower.startsWith('go to') || lower.startsWith('open')) return 'navigate';
  if (lower.startsWith('type') || lower.startsWith('enter') || lower.startsWith('fill')) return 'fill';
  if (lower.startsWith('check that') || lower.startsWith('verify') || lower.startsWith('assert')) return 'assert';
  return 'click';
}

/** How a session's steps are accounted for: learned this run, reused, or not reached. */
export interface ExplanationPlan {
  /** Steps `0..completed-1` completed. */
  completed: number;
  /** Steps before this index were reused from `baseRevisionId`, not learned (an incremental run). */
  reusedBefore: number;
  baseRevisionId: string | null;
  /** The step (0-based) whose last action failed, if any: it is not `completed` but has an action. */
  failedIndex: number | null;
}

export function explanationFor(
  sessionId: string,
  sourceRevision: string,
  configurationRevision: string,
  steps: readonly GuidedStepRef[],
  plan: ExplanationPlan,
): PublicExplanation {
  const rows: PublicExplanationStep[] = steps.map((step, index) => {
    const completed = index < plan.completed;
    const reused = completed && index < plan.reusedBefore && plan.baseRevisionId !== null;
    const attempted = completed || index === plan.failedIndex;
    const kind = operationKindOf(step.text);
    return {
      stepId: step.stepId,
      number: index + 1,
      completed,
      learnedFromThisRun: completed && !reused,
      reusedFrom: reused ? { revisionId: plan.baseRevisionId as string, stepId: step.stepId } : null,
      relearnedAfterDrift: false,
      actions: attempted
        ? [
            {
              admissionId: `admission-${index + 1}`,
              ordinal: 0,
              attemptOrdinal: 0,
              operationKind: kind,
              safeLabel: SAFE_LABELS[kind],
              outcome: completed ? 'SUCCEEDED' : 'FAILED',
              referenceIds: [],
            },
          ]
        : [],
    };
  });
  return { sessionId, sourceRevision, configurationRevision, steps: rows, referenceFlows: [] };
}

// ---------------------------------------------------------------------------
// Receipt, timings, result
// ---------------------------------------------------------------------------

export function receiptFor(
  sessionId: string,
  sequence: number,
  relearnedFrom: RelearnedFrom | null,
): PublicationReceipt {
  return {
    schemaVersion: 3,
    sessionId,
    revisionId: `11111111-1111-4111-8111-${sequence.toString(16).padStart(12, '0')}`,
    revisionDigest: '1'.repeat(64),
    learnedPlanHash: '2'.repeat(64),
    artifactHash: '3'.repeat(64),
    publicationEvidenceHash: '4'.repeat(64),
    publishedAt: new Date().toISOString(),
    learnedFromThisRun: true,
    replayVerified: false,
    relearnedFrom,
  };
}

/** `kind: step` and `kind: action` readings for the first `completed` steps (action rows only carry ids). */
export function timingsFor(steps: readonly GuidedStepRef[], completed: number): GuidedActionTiming[] {
  const rows: GuidedActionTiming[] = [];
  for (let index = 0; index < Math.min(completed, steps.length); index += 1) {
    const startMs = 120 + index * 1000;
    const endMs = startMs + 740;
    rows.push({ kind: 'step', stepId: steps[index].stepId, admissionId: null, ordinal: null, startMs, endMs });
    rows.push({
      kind: 'action',
      stepId: steps[index].stepId,
      admissionId: `admission-${index + 1}`,
      ordinal: 0,
      startMs,
      endMs,
    });
  }
  return rows;
}

/** The video states a result can carry (`videoEvidence`). */
export type GuidedVideoMode = 'AVAILABLE' | 'PROCESSING' | 'UNAVAILABLE' | 'PARTIAL';

export interface ResultInputs {
  sessionId: string;
  executionId: string;
  outcome: GuidedSessionState;
  publication: GuidedPublication;
  steps: readonly GuidedStepRef[];
  sourceRevision: string;
  configurationRevision: string;
  explanation: ExplanationPlan;
  errorCode: string | null;
  failure: GuidedFailure | null;
  detail: LoginRequiredDetail | null;
  relearnedFrom: RelearnedFrom | null;
  /** The learning recording's state. Ignored for a published learn, whose recording is discarded (`video: null`). */
  video: GuidedVideoMode;
  /** Steps whose timings the recording holds (only used when the video carries timings). */
  timedSteps: number;
  /** The proof replay of a published learn (`result.proof`); absent or null when it was refused. */
  proof?: GuidedProof | null;
}

export function resultFor(input: ResultInputs): GuidedResult {
  const published = input.publication.status === 'PUBLISHED';
  const hasTimings = input.video === 'AVAILABLE' || input.video === 'PARTIAL';
  const result: GuidedResult = {
    schemaVersion: 3,
    sessionId: input.sessionId,
    executionId: input.executionId,
    scopeHash: '0'.repeat(64),
    mode: 'guided',
    outcome: input.outcome,
    assertionsPassed: published || input.outcome === 'FINALIZING',
    learnedFromThisRun: published,
    replayVerified: false,
    scheduleActivated: false,
    publication: input.publication,
    currentReadiness:
      input.publication.status === 'PUBLISHED'
        ? { revisionId: input.publication.receipt.revisionId, ready: true, code: 'READY' }
        : { revisionId: null, ready: false, code: 'NOT_PUBLISHED' },
    evidence: {
      kind: 'guidedLedger',
      ref: input.sessionId,
      // Keyed on the publication (architect R1): a published learn has no learning recording.
      video: published
        ? null
        : {
            status: hasTimings ? 'AVAILABLE' : input.video === 'PROCESSING' ? 'PROCESSING' : 'UNAVAILABLE',
            error: null,
            expiresAt: hasTimings ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
            partial: input.video === 'PARTIAL',
          },
    },
    actionTimings: hasTimings && !published ? timingsFor(input.steps, input.timedSteps) : [],
    proof: published ? (input.proof ?? null) : null,
    errorCode: input.errorCode,
    relearnedFrom: input.relearnedFrom,
    progress: progressFor(input.steps, null),
    explanation: explanationFor(
      input.sessionId,
      input.sourceRevision,
      input.configurationRevision,
      input.steps,
      input.explanation,
    ),
  };
  if (input.detail) result.detail = input.detail;
  if (input.failure) result.failure = input.failure;
  return result;
}

// ---------------------------------------------------------------------------
// Public session
// ---------------------------------------------------------------------------

export function publicSessionFor(input: {
  sessionId: string;
  testId: string;
  state: GuidedSessionState;
  steps: readonly GuidedStepRef[];
  activeIndex: number | null;
  reads: number;
  baseRevisionId?: string;
  firstLearnStepId?: string;
}): PublicSession {
  const template = contractDocument<PublicSession>('publicSessionPreparing');
  const session: PublicSession = {
    ...template,
    sessionId: input.sessionId,
    testId: input.testId,
    state: input.state,
    expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS).toISOString(),
    counters: countersFor(input.reads),
    progress: progressFor(input.steps, input.activeIndex),
  };
  if (input.baseRevisionId !== undefined && input.firstLearnStepId !== undefined) {
    session.baseRevisionId = input.baseRevisionId;
    session.firstLearnStepId = input.firstLearnStepId;
  }
  return session;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/** One read of the session: the state it shows, and the step it is on (`null` = unnameable). */
export interface GuidedScriptStep {
  state: GuidedSessionState;
  activeIndex: number | null;
}

/** What a scenario needs to know about the draft being learned. */
export interface GuidedPlanContext {
  steps: readonly GuidedStepRef[];
  /** Index of the first step this run learns when it is incremental; `null` for a full learn. */
  boundaryIndex: number | null;
}

export type GuidedFinalize = 'PUBLISH' | 'CONFLICT';

export interface GuidedTerminal {
  /**
   * The named cause. The handlers set `result.failure` and `result.errorCode` from it; for
   * `LOGIN_REQUIRED` they also set the closed `detail` (`stepId` of the failed step).
   */
  failureCode?: GuidedFailureCode;
  /** With `failureCode: 'LOGIN_REQUIRED'`: whether the draft already has login steps. */
  loginStepsPresent?: boolean;
  publicationStatus: GuidedUnpublishedStatus;
  /** Steps the explanation reports completed. */
  completed: number;
  /** The step (0-based) whose last action failed, if any. */
  failedIndex: number | null;
}

export interface GuidedPlan {
  /** The reads, in order. A gate state holds until its trigger; the last entry never advances. */
  script: GuidedScriptStep[];
  /** The question asked at `AWAITING_CLARIFICATION`. */
  question?: { kind: GuidedQuestionKind; stepIndex: number };
  /** How the `FINALIZING` entry resolves when the client finalizes. */
  finalize?: GuidedFinalize;
  /** How a terminal last entry reads. Absent for `FINALIZING`-ended scripts. */
  terminal?: GuidedTerminal;
  /** Result reads that still show the recording as `PROCESSING` after the session is terminal. */
  videoProcessingReads?: number;
  /** The recording of a learn that did not publish (its learning attempt), when it exists. */
  video?: GuidedVideoMode;
  /**
   * How the proof replay of a published learn resolves at finalize: `ACCEPTED` (default) creates an
   * `AFTER_LEARN` execution and names it in `result.proof`; `REFUSED` publishes with `proof: null`.
   */
  proof?: 'ACCEPTED' | 'REFUSED';
}

export interface GuidedScenario {
  name: string;
  /** Refuses the start call. No session exists. */
  startRefusal?: () => GuidedMockRefusal;
  plan?: (context: GuidedPlanContext) => GuidedPlan;
}

function learningReads(steps: number, from: number): GuidedScriptStep[] {
  const reads: GuidedScriptStep[] = [];
  for (let index = from; index < steps; index += 1) {
    reads.push(
      { state: 'OBSERVING', activeIndex: index },
      { state: 'PROPOSING', activeIndex: index },
      { state: 'ACTING', activeIndex: index },
    );
  }
  return reads;
}

function prefixReads(boundary: number | null): GuidedScriptStep[] {
  if (boundary === null || boundary === 0) return [];
  return [{ state: 'REPLAYING_PREFIX', activeIndex: 0 }];
}

/** A full or incremental learn that publishes. */
export const LEARN_SCENARIO: GuidedScenario = {
  name: 'LEARN',
  plan: ({ steps, boundaryIndex }) => ({
    script: [
      { state: 'PREPARING', activeIndex: 0 },
      ...prefixReads(boundaryIndex),
      ...learningReads(steps.length, boundaryIndex ?? 0),
      { state: 'FINALIZING', activeIndex: null },
    ],
    finalize: 'PUBLISH',
    video: 'AVAILABLE',
  }),
};

/** As {@link LEARN_SCENARIO}, but the proof replay is refused at finalize: published with `proof: null`. */
export const LEARN_PROOF_REFUSED_SCENARIO: GuidedScenario = {
  name: 'LEARN_PROOF_REFUSED',
  plan: (context) => ({
    ...(LEARN_SCENARIO.plan as (context: GuidedPlanContext) => GuidedPlan)(context),
    proof: 'REFUSED',
  }),
};

/** A learn that stops to ask a question at step index `stepIndex`, then publishes. */
export function learnWithQuestion(kind: GuidedQuestionKind, stepIndex = 1): GuidedScenario {
  return {
    name: `LEARN_ASKS_${kind}`,
    plan: (context) => {
      const base = (LEARN_SCENARIO.plan as (context: GuidedPlanContext) => GuidedPlan)(context);
      const at = Math.min(stepIndex, context.steps.length - 1);
      const insertAt = base.script.findIndex((entry) => entry.activeIndex === at && entry.state === 'OBSERVING');
      const script = [...base.script];
      script.splice(insertAt < 0 ? 1 : insertAt + 1, 0, { state: 'AWAITING_CLARIFICATION', activeIndex: at });
      return { ...base, script, question: { kind, stepIndex: at } };
    },
  };
}

/** A session that ends in a terminal state without publishing. */
export function endsIn(
  state: Extract<GuidedSessionState, 'FAILED' | 'UNKNOWN_OUTCOME' | 'EXPIRED' | 'CANCELLED'>,
  options: {
    atStepIndex?: number;
    failureCode?: GuidedFailureCode;
    loginStepsPresent?: boolean;
    /** `PENDING` makes the result read answer `202`, as the backend does for a pending publication. */
    publicationStatus?: GuidedUnpublishedStatus;
    /** The kept learning recording. Default `UNAVAILABLE`. */
    video?: GuidedVideoMode;
    /** Result reads that still show that recording as `PROCESSING` after the session is terminal. */
    videoProcessingReads?: number;
  } = {},
): GuidedScenario {
  return {
    name: `ENDS_${state}${options.failureCode ? `_${options.failureCode}` : ''}`,
    plan: ({ steps }) => {
      const stopAt = Math.min(options.atStepIndex ?? 1, steps.length - 1);
      const implied: GuidedFailureCode | undefined =
        state === 'CANCELLED' || state === 'EXPIRED' ? state : undefined;
      return {
        script: [
          { state: 'PREPARING', activeIndex: 0 },
          ...learningReads(stopAt + 1, 0),
          { state, activeIndex: null },
        ],
        terminal: {
          failureCode: options.failureCode ?? implied,
          loginStepsPresent: options.loginStepsPresent,
          publicationStatus: options.publicationStatus ?? 'REFUSED',
          completed: stopAt,
          failedIndex: state === 'FAILED' ? stopAt : null,
        },
        video: options.video ?? 'UNAVAILABLE',
        ...(options.videoProcessingReads !== undefined ? { videoProcessingReads: options.videoProcessingReads } : {}),
      };
    },
  };
}

/** `LOGIN_REQUIRED` at the first step: the contract's `loginResult` shape, `detail` closed. */
export function loginRequired(loginStepsPresent: boolean): GuidedScenario {
  return endsIn('FAILED', { atStepIndex: 0, failureCode: 'LOGIN_REQUIRED', loginStepsPresent });
}

/** Reaches `FINALIZING`, where finalize answers `409 PUBLICATION_CONFLICT`. */
export const PUBLICATION_CONFLICT_SCENARIO: GuidedScenario = {
  name: 'PUBLICATION_CONFLICT',
  plan: (context) => ({
    ...(LEARN_SCENARIO.plan as (context: GuidedPlanContext) => GuidedPlan)(context),
    finalize: 'CONFLICT',
  }),
};

/** A start that the server refuses outright. */
export function refusesStart(name: GuidedStartRefusalName): GuidedScenario {
  return { name: `REFUSES_${name}`, startRefusal: GUIDED_START_REFUSALS[name] };
}
