/**
 * Checks Studio contract types.
 *
 * Hand-mirrored from `docs/specs/studio/openapi.yaml` (story 10.1, AC-15). The mirror is not
 * decorative: `studioContract.test.ts` validates the contract's own example payloads against
 * these shapes, so a rename on either side fails the build rather than surfacing as an undefined
 * field in the UI.
 */

export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR';

/**
 * The terminal error vocabulary as a **runtime** value (story 10.11a, AC-5; ADR-002 O-12).
 *
 * ADR-002 §18.3: *"generate the union from this document or assert it against this document."*
 * §15.5 records why the drift went unnoticed for two stories — *"the field arrives as a JSON
 * string and the union is erased"* — and an erased type is a thing no test can read. So the
 * vocabulary exists at run time first and the type is derived from it second. A hand-widened
 * union is then not a silent second copy: it is a `type-check` failure, because
 * {@link ExecutionErrorCode} is defined as this array's member type and
 * `ExecutionErrorCodeIsDerivedFromItsCarrier` asserts the two are mutually assignable.
 *
 * The **expected** value is never read from here. `studioContract.test.ts` compares this constant
 * against the non-null members of `components.schemas.ExecutionErrorCode.enum`, parsed from
 * `docs/specs/studio/openapi.yaml` through the single binding story 10.10 installed. An expected
 * value imported from the module under test is VAC-11, the shape @qa measured on story 10.10,
 * and it is the shape this constant is most naturally written into.
 *
 * Every member is assigned by the API — never by `studio-runner` — and the document's
 * `x-assigned-by` is the exhaustive statement of which component assigns which. Growth is a
 * Class C amendment (ADR-002 §12), and the contract assertion goes **red** on it rather than
 * narrowing quietly; that is the criterion working, not failing.
 */
export const EXECUTION_ERROR_CODES = [
  'TIMEOUT',
  'DISPATCH_FAILED',
  'DISPATCH_UNKNOWN',
  'START_TIMEOUT',
  'STALE',
  'DISPATCH_DISABLED',
  'AUTHORIZATION_REVOKED',
  'REFERENCE_UNAVAILABLE',
  'SECRET_TOO_LONG',
  'CANCELLED',
] as const;

export type ExecutionErrorCode = (typeof EXECUTION_ERROR_CODES)[number];

/** True only when `A` and `B` are the same type, not merely mutually extending. */
type TypeEquals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

type AssertTrue<T extends true> = T;

/**
 * The type-level half of AC-5's second obligation. Hand-widening or hand-narrowing
 * {@link ExecutionErrorCode} while leaving {@link EXECUTION_ERROR_CODES} alone makes this alias
 * `AssertTrue<false>`, which `tsc --noEmit` refuses. Falsification (iii) in the story's table is
 * exactly that edit.
 */
export type ExecutionErrorCodeIsDerivedFromItsCarrier = AssertTrue<
  TypeEquals<ExecutionErrorCode, (typeof EXECUTION_ERROR_CODES)[number]>
>;

/**
 * `ReplayFailure.code` in `openapi.yaml`: the two named causes of a replay that stopped at a learned
 * step (STUDIO-OBS-008 T0 ruling A1). `studioContract.test.ts` asserts this set against the
 * document's enum in both directions, so a third code added to the document goes red there.
 */
export const REPLAY_FAILURE_CODES = ['LOGIN_REQUIRED', 'TARGET_DRIFT'] as const;

export type ReplayFailureCode = (typeof REPLAY_FAILURE_CODES)[number];

/**
 * The one named cause of a replay that stopped at a learned step, derived by the API from the
 * runner's terminal report. Value-free: a closed code, the confirmed revision's stable step ID, its
 * 0-based position (the index space of {@link StepResult.stepIndex}) and, for login only, whether an
 * earlier step of the run filled a secret. `loginStepsPresent` is present exactly with
 * `LOGIN_REQUIRED` and absent with `TARGET_DRIFT`.
 */
export type ReplayFailure =
  | { code: 'LOGIN_REQUIRED'; stepId: string; stepIndex: number; loginStepsPresent: boolean }
  | { code: 'TARGET_DRIFT'; stepId: string; stepIndex: number };

/** The type-level half of the enum parity: the union's codes are exactly {@link REPLAY_FAILURE_CODES}. */
export type ReplayFailureCodesAreDerivedFromTheirCarrier = AssertTrue<
  TypeEquals<ReplayFailure['code'], ReplayFailureCode>
>;

/**
 * The code a cancelled run ends with: `status: ERROR`, `errorCode: CANCELLED`.
 *
 * A member of {@link EXECUTION_ERROR_CODES} since Studio v1 WP4 amended the contract's enum
 * (ADR-002 §29). WP5 kept it outside the carrier while the enum did not declare it, so that
 * `studioContract.test.ts` would go red on the amendment and force this fold; the fold is done, and
 * this name stays only because the Stop flow and its tests read it. `satisfies` keeps it a member:
 * dropping `CANCELLED` from the carrier fails the type-check here.
 */
export const CANCELLED_ERROR_CODE = 'CANCELLED' as const satisfies ExecutionErrorCode;

export type StepStatus = 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL' | 'SKIPPED';

/** Evidence state, deliberately independent of the check outcome (architecture §6.1). */
export type VideoStatus = 'PROCESSING' | 'AVAILABLE' | 'FAILED' | 'UNAVAILABLE' | 'EXPIRED';

/**
 * The single-path readiness vocabulary (ADR-SC-005 defaults "Readiness vocabulary"; STUDIO-OBS-012A
 * `TestDto.readiness`) as a **runtime** value, on the {@link EXECUTION_ERROR_CODES} pattern.
 *
 * `studioContract.test.ts` compares this constant against
 * `components.schemas.TestDto.properties.readiness.enum`, parsed from `docs/specs/studio/openapi.yaml`;
 * the expected value is read from the document, never from here. `readiness` is derived by the
 * server on every read: `UNLEARNED` — no published revision matches the draft; `LEARNING` — a guided
 * session for the draft is in progress; `READY` — the confirmed observed revision matches the draft
 * and replays model-free; `NEEDS_RELEARN` — a published revision exists and a step changed (the
 * server emits it only from STUDIO-OBS-015).
 */
export const TEST_READINESS_VALUES = ['UNLEARNED', 'LEARNING', 'RECORDED', 'READY', 'NEEDS_RELEARN'] as const;

export type TestReadiness = (typeof TEST_READINESS_VALUES)[number];

/**
 * `UITest.verification` (openapi): PENDING — the proof is running; FAILED — a step failed, so
 * "Re-learn from step N"; INCOMPLETE — the proof was refused, cancelled, timed out or did not
 * promote, so "Verify again". `firstUnverifiedStepId` is the first step without a PASSED receipt.
 */
export interface TestVerification {
  state: 'PENDING' | 'FAILED' | 'INCOMPLETE';
  firstUnverifiedStepId: string;
}

/** `StepResult.receipt` (contracts/v3 step-receipt.schema.json): what the runner computed for the step. */
export interface StepReceipt {
  closedCode: string | null;
  stepHash: string;
  fenceCrossed: boolean;
  effects: Array<{ method: string; completed: boolean }>;
  offscreen: boolean;
  effectsTruncated: boolean;
}

/** Same guard as {@link ExecutionErrorCodeIsDerivedFromItsCarrier}, for the readiness carrier. */
export type TestReadinessIsDerivedFromItsCarrier = AssertTrue<
  TypeEquals<TestReadiness, (typeof TEST_READINESS_VALUES)[number]>
>;

/**
 * The `409` conflict code `POST /tests/{id}/execute` answers when no published revision matches the
 * draft (ADR-SC-005). `studioContract.test.ts` asserts the execute route's `x-conflict-codes` against
 * the refusal wording, so a rename in the document fails there.
 */
export const LEARN_REQUIRED_CONFLICT_CODE = 'LEARN_REQUIRED' as const;

export type WaitStrategy = 'none' | 'networkidle' | 'domcontentloaded' | 'load';

/** The canonical engine. `chromium` is the only engine a draft may name; any other is refused. */
export const CANONICAL_BROWSER = 'chromium';

export interface Viewport {
  width: number;
  height: number;
}

export interface TestConfiguration {
  browser: typeof CANONICAL_BROWSER;
  viewport: Viewport;
  timeoutSeconds: number;
  waitStrategy: WaitStrategy;
}

/** A declared reference. A resolved secret never travels on this contract, only its id. */
export interface StudioVariable {
  name: string;
  kind: 'plain' | 'secretRef';
  value?: string | null;
  secretId?: string | null;
}

/** Story 10.36 authoring-context v2 contract. Array position is presentation, never identity. */
export interface ContextText {
  kind: 'text';
  value: string;
}

/** An explicit input whose value must survive authoring byte-for-byte, including the empty string. */
export interface LiteralInput {
  kind: 'literal';
  value: string;
}

export interface VariableReference {
  kind: 'variableRef';
  referenceId: string;
}

/** An opaque reference only. A resolved secret is never part of the authoring contract. */
export interface SecretReference {
  kind: 'secretRef';
  referenceId: string;
}

export interface TargetHint {
  kind: 'targetHint';
  strategy: 'role' | 'label' | 'testId' | 'text';
  value: string;
  scope?: string;
  exact?: boolean;
}

export type ContextualDefaultValue = LiteralInput | VariableReference;

export interface ContextualDefault {
  kind: 'default';
  name: string;
  value: ContextualDefaultValue;
}

export type GlobalContextEntry = ContextText | TargetHint | ContextualDefault;
export type StepContextEntry =
  | GlobalContextEntry
  | LiteralInput
  | VariableReference
  | SecretReference;

export type EvidenceCompleteness = 'complete' | 'partial' | 'unknown';

/**
 * Evidence selectable by an author. Its source is intentionally narrower than server-held
 * evidence: imported or user-supplied evidence cannot assert that a live page was observed.
 */
export interface AuthoringEvidenceReference {
  id: string;
  revision: number;
  source: 'supplied';
  csiId: string;
  environment: string;
  route: string;
  state: string;
  stepId: string;
  capturedAt: string;
  completeness: EvidenceCompleteness;
  hash: string;
}

/** Server-held evidence; only a trusted capture boundary may mint `observed`. */
export interface EvidenceReference extends Omit<AuthoringEvidenceReference, 'source'> {
  source: 'supplied' | 'observed';
}

export interface GlobalAuthoringContext {
  entries?: GlobalContextEntry[];
  evidenceReferences?: AuthoringEvidenceReference[];
}

export interface StepAuthoringContext {
  entries?: StepContextEntry[];
  evidenceReferences?: AuthoringEvidenceReference[];
}

export interface AuthoringStep {
  id: string;
  text: string;
  context?: StepAuthoringContext;
}

export interface AuthoringV2Request {
  authoringSchemaVersion: 2;
  globalContext?: GlobalAuthoringContext;
  steps: AuthoringStep[];
}

export interface AuthoringRevisionInputs {
  contextDigest: string;
  globalContext: string;
  stepContexts: Array<{ stepId: string; hash: string }>;
  nonsecretReferencedValues: Array<{ referenceId: string; valueHash: string }>;
  selectedEvidenceReferences: Array<{ id: string; revision: number; hash: string }>;
}

export interface AuthoringV2Response extends AuthoringV2Request {
  revisionInputs?: AuthoringRevisionInputs;
}

/**
 * `TestRequest` in `openapi.yaml`: the one authoring write. Clients submit English steps with stable
 * IDs and nothing executable; the server generates the executable artifact. A body without
 * `authoringSchemaVersion: 2`, or with string steps, is refused `400 INVALID_AUTHORING`.
 * `csiId` is required on create and immutable; both revisions are required on update.
 */
export interface TestRequest extends AuthoringV2Request {
  name: string;
  description?: string | null;
  csiId?: string | null;
  environment: string;
  variables: StudioVariable[];
  configuration: TestConfiguration;
  sourceRevision?: number | null;
  configurationRevision?: number | null;
}

/** `PUT /tests/{id}`: the same body, carrying the revisions the optimistic check compares. */
export interface TestUpdateRequest extends TestRequest {
  sourceRevision: number;
  configurationRevision: number;
}

/**
 * The list projection (`TestDto` in `openapi.yaml`): ordered display text only. A client that edits
 * steps reads {@link TestDetailDto} instead, because only it carries the stable step IDs.
 */
export interface TestDto {
  id: string;
  name: string;
  description: string | null;
  csiId: string | null;
  environment: string;
  steps: string[];
  variables: StudioVariable[];
  configuration: TestConfiguration;
  status: string | null;
  schedule: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: 'PASSED' | 'FAILED' | 'ERROR' | null;
  sourceRevision: number;
  configurationRevision: number;
  /** Derived on every read, never stored (ADR-SC-005). */
  readiness: TestReadiness;
  /** The first changed step's stable ID; non-null only with `NEEDS_RELEARN`. */
  firstChangedStepId: string | null;
  /** The state of the model-free proof; non-null exactly with `RECORDED` (SC008-E12). */
  verification?: TestVerification | null;
  confirmedRevisionId: string | null;
  /** Canonical hash of `confirmedRevisionId`; null on list responses or without a confirmation. */
  confirmedRevisionArtifactHash?: string | null;
  /**
   * The immutable published artifact of `confirmedRevisionId`, typed as the document declares it
   * (`object`, nullable). Its normative schema is the observed
   * `contracts/v3/replay-artifact.schema.json`; plan types derived from it belong to STUDIO-OBS-008.
   * Null on list responses.
   */
  confirmedRevisionArtifact?: Record<string, unknown> | null;
}

/** A draft's header fields, common to the list projection and the single read. */
export type TestDraftHeader = Omit<TestDto, 'steps'>;

/**
 * `GET /tests/{id}` and the success bodies of `POST /tests` and `PUT /tests/{id}` (`TestDetailDto`
 * in `openapi.yaml`): one v2 draft with `AuthoringStep` objects, read together with its immutable
 * confirmed revision.
 */
export interface TestDetailDto extends TestDraftHeader, AuthoringV2Response {
  /** Present with `NEEDS_RELEARN` when the immutable base lacks complete input identity. */
  readinessReason?: 'BASE_IDENTITY_INCOMPLETE';
}

/**
 * One entry per original step. Skipped or unstarted steps carry null timings — except the step a
 * cancel interrupted, which is `SKIPPED` with the start it had and the runner's stop text in
 * `message` (openapi `StepResult`, ADR-002 §29.5).
 */
export interface StepResult {
  stepIndex: number;
  originalText: string;
  status: StepStatus;
  offsetMs: number | null;
  durationMs: number | null;
  message: string | null;
  /** Null or absent for legacy history and steps that never started. */
  receipt?: StepReceipt | null;
}

export interface ExecutionLogEntry {
  /** Null where the runner held no reading (openapi `ExecutionLogEntry`). */
  at: string | null;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  stepIndex?: number | null;
}

export interface VideoEvidence {
  status: VideoStatus;
  error: string | null;
  expiresAt: string | null;
  partial: boolean;
}

export interface RuntimeVersions {
  playwright: string | null;
  chromium: string | null;
  validator: string | null;
  executor: string | null;
  image: string | null;
}

/**
 * The single execution payload. `GET /executions/{id}`, the items of `GET /executions` and the
 * SSE `execution.snapshot` event all carry exactly this shape, so 10.11 can swap the transport
 * without touching rendering.
 */
export interface ExecutionSnapshot {
  /** Absent/null on historical servers or legacy runs; never infer Manual from missing provenance. */
  triggerSource?: 'MANUAL' | 'SCHEDULED' | 'AFTER_LEARN' | null;
  /** True when the run executed a revision that was not confirmed (a labelled diagnostic run of a RECORDED draft). */
  diagnostic?: boolean | null;
  /** The shared `/api/v1/schedules` schedule that produced the run; null once that schedule is removed. */
  scheduleId?: string | null;
  scheduledAt?: string | null;
  executionId: string;
  testId: string;
  /**
   * The parent test's current name, resolved server-side for `GET /executions` items (story
   * 10.46). `null` when the test was soft-deleted. Optional because snapshots from the SSE stream,
   * older servers and older fixtures may not carry it; read it as `snapshot.testName ?? null`.
   */
  testName?: string | null;
  csiId: string | null;
  /** Null for legacy history: those runs never had a confirmed revision. */
  revisionId: string | null;
  status: ExecutionStatus;
  errorCode: ExecutionErrorCode | null;
  /** Immutable acceptance instant; also the history partition key. */
  acceptedAt: string;
  /** Browser start. Null until the runner reports one. */
  startedAt: string | null;
  endedAt: string | null;
  /** Browser execution time only; queue time is not included. */
  durationMs: number | null;
  stepResults: StepResult[];
  logs: ExecutionLogEntry[];
  logsTruncated: boolean;
  video: VideoEvidence;
  /** Protected API path. Never an object storage key or a public URL. */
  videoPath: string | null;
  runtime: RuntimeVersions;
  /** Monotonic API snapshot revision; also the SSE event id. */
  revision: number;
  /** True once outcome and evidence disposition are both settled. */
  streamComplete: boolean;
  /**
   * The API's named cause for a replay that stopped at a learned step. Absent or null means the API
   * names none; a client never derives one from `stepResults[].message`, `logs` or `status`, and a
   * non-null value selects the narrative before `status` or `errorCode` do (STUDIO-OBS-008 A1).
   */
  replayFailure?: ReplayFailure | null;
}

export interface Page<T> {
  data: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export type TestPage = Page<TestDto>;
export type ExecutionPage = Page<ExecutionSnapshot>;

/*
 * List query parameters (story 10.46). All optional and additive: an omitted parameter means
 * "no filter" and the server's default sort. Unknown `sort`, `status` or `lastRun` values answer
 * `400`. `page` is 0-based; `size` is capped at 100 server-side.
 */

export type SortDirection = 'asc' | 'desc';

export const TEST_SORT_FIELDS = ['name', 'updatedAt', 'lastRunAt'] as const;
export type TestSortField = (typeof TEST_SORT_FIELDS)[number];
/** Wire form `field,direction`, e.g. `name,asc`. */
export type TestSort = `${TestSortField},${SortDirection}`;
export const DEFAULT_TEST_SORT: TestSort = 'updatedAt,desc';

export const EXECUTION_SORT_FIELDS = ['acceptedAt', 'durationMs'] as const;
export type ExecutionSortField = (typeof EXECUTION_SORT_FIELDS)[number];
/** Wire form `field,direction`, e.g. `durationMs,desc`. */
export type ExecutionSort = `${ExecutionSortField},${SortDirection}`;
export const DEFAULT_EXECUTION_SORT: ExecutionSort = 'acceptedAt,desc';

/** `NEVER` selects drafts with no run; the rest match `TestDto.lastRunStatus`. */
export const TEST_LAST_RUN_FILTERS = ['PASSED', 'FAILED', 'ERROR', 'NEVER'] as const;
export type TestLastRunFilter = (typeof TEST_LAST_RUN_FILTERS)[number];

/**
 * `CANCELLED` selects `ERROR` with `errorCode: CANCELLED` (see `isCancelledOutcome`), and `ERROR`
 * then excludes cancelled runs.
 */
export const EXECUTION_STATUS_FILTERS = [
  'PENDING',
  'RUNNING',
  'PASSED',
  'FAILED',
  'ERROR',
  'CANCELLED',
] as const;
export type ExecutionStatusFilter = (typeof EXECUTION_STATUS_FILTERS)[number];

/** `GET /studio/tests` query. */
export interface TestListQuery {
  csiId?: string;
  environment?: string;
  /** Case-insensitive match on name or description. */
  q?: string;
  lastRun?: TestLastRunFilter;
  sort?: TestSort;
  /** 0-based. */
  page?: number;
  size?: number;
}

/** `GET /studio/executions` query. */
export interface ExecutionListQuery {
  testId?: string;
  csiId?: string;
  status?: ExecutionStatusFilter;
  /** Case-insensitive match on the test name. */
  q?: string;
  sort?: ExecutionSort;
  /** 0-based. */
  page?: number;
  size?: number;
}

/** Narrowing helpers for values read from the URL or a select. */
export function isTestSort(value: string): value is TestSort {
  const [field, direction, ...rest] = value.split(',');
  return rest.length === 0
    && (TEST_SORT_FIELDS as readonly string[]).includes(field)
    && (direction === 'asc' || direction === 'desc');
}

export function isExecutionSort(value: string): value is ExecutionSort {
  const [field, direction, ...rest] = value.split(',');
  return rest.length === 0
    && (EXECUTION_SORT_FIELDS as readonly string[]).includes(field)
    && (direction === 'asc' || direction === 'desc');
}

export interface ExecuteAccepted {
  executionId: string;
  status: ExecutionStatus;
}

export interface StudioErrorResponse {
  error: string;
  message: string;
}

/**
 * The terminal outcomes, in one place. Every Studio surface that decides whether a run has ended
 * (the Studio editor, the UI test detail page and its Runs tab, All Checks) reads this set rather
 * than keeping its own.
 */
export const TERMINAL_EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  'PASSED',
  'FAILED',
  'ERROR',
];

export function isTerminalExecutionStatus(status: string): boolean {
  return (TERMINAL_EXECUTION_STATUSES as readonly string[]).includes(status);
}

/**
 * The per-step budget (`configuration.timeoutSeconds`, openapi `TestConfiguration`): how long each
 * action or assertion may wait for the page before the step fails. Authors do not set it; every
 * save and create sends this value.
 */
export const DEFAULT_STEP_TIMEOUT_SECONDS = 30;

export function defaultConfiguration(): TestConfiguration {
  return {
    browser: CANONICAL_BROWSER,
    viewport: { width: 1920, height: 1080 },
    timeoutSeconds: DEFAULT_STEP_TIMEOUT_SECONDS,
    waitStrategy: 'networkidle',
  };
}
