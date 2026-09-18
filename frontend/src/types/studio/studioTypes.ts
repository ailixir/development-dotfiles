/**
 * Checks Studio contract types.
 *
 * Hand-mirrored from `docs/specs/studio/openapi.yaml` (story 10.1, AC-15). The mirror is not
 * decorative: `studioContract.test.ts` validates the contract's own example payloads against
 * these shapes, so a rename on either side fails the build rather than surfacing as an undefined
 * field in the UI.
 *
 * The pre-10.1 `TestIR` shape now lives in `./legacyTestIr` and is only used to read drafts that
 * were authored before this contract existed.
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

export type CompileStatus =
  | 'STALE'
  | 'COMPILING'
  | 'AWAITING_CONFIRMATION'
  | 'READY'
  | 'NEEDS_REVISION';

export type WaitStrategy = 'none' | 'networkidle' | 'domcontentloaded' | 'load';

/** The canonical engine. Legacy `chrome` is normalized server-side; nothing else is accepted. */
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

/** Clients submit English steps only; the server generates the executable artifact. */
export interface TestRequest {
  name: string;
  description?: string | null;
  csiId?: string | null;
  environment: string;
  steps: string[];
  variables: StudioVariable[];
  configuration: TestConfiguration;
  sourceRevision?: number | null;
  configurationRevision?: number | null;
}

/**
 * Why a compile attempt ended without a candidate, for a reason that is **not** the author's
 * source. Mirrored from `CompileError` (ADR-002 §16.2). Non-null only with
 * `compileStatus: STALE`, and never non-null at the same time as `compileDiagnostics`.
 *
 * `code` is deliberately a free string, not a union: §14.7 lets the deployed API add a code in
 * its own PR, and a union narrowed here would turn a legitimate twelfth code into a runtime
 * conformance failure (§16.4). The exhaustive set the API can write today is
 * `x-compile-error-codes`, which `studioContract.test.ts` compares against the UI's explanations
 * in both directions (ADR-002 §18.3).
 */
export interface CompileError {
  code: string;
}

/**
 * One validator rejection, already bounded and redacted by the server. `message` and `excerpt`
 * are clamped to deployment-configured caps and a clamped string ends with a visible truncation
 * marker, so a cut diagnostic never reads as a complete one — which is why the marker must
 * survive rendering (ADR-002 §16.5).
 */
export interface CompileDiagnostic {
  code: string;
  /** Null for artifact-level problems belonging to no single step. */
  stepIndex: number | null;
  message: string;
  /** Syntax kind of the offending node, when the problem is a node. */
  node: string | null;
  /** Bounded excerpt of the offending node only — never the whole step (§9.2). */
  excerpt: string | null;
}

/**
 * One entry per **original source step**, index aligned, present even where the validator
 * returned nothing for that step (§4.4). The entry count equals the length of `steps` on the
 * same `TestDto`.
 */
export interface CompileStepDiagnostics {
  stepIndex: number;
  ok: boolean;
  diagnostics: CompileDiagnostic[];
  /**
   * True when this step had more diagnostics than the per-step cap, or when its diagnostics were
   * shed to fit the document cap. "There were no more problems" and "we stopped telling you" are
   * different facts, and this is the field that tells them apart.
   */
  truncated: boolean;
}

/** The only reason the document declares for shedding whole steps' diagnostics. */
export type TruncationReason = 'TOTAL_BYTES';

/**
 * Why the last compile produced nothing runnable, in the author's own step order. Non-null only
 * with `compileStatus: NEEDS_REVISION`, and never non-null at the same time as `compileError`.
 *
 * The document describes **the last attempt only**: `attempts` says how many happened and
 * `exhausted` says whether the repair bound was reached with the artifact still invalid.
 */
export interface CompileDiagnostics {
  validatorSchemaVersion: string;
  /** Artifact-level rejections belonging to no single step. */
  artifact: CompileDiagnostic[];
  steps: CompileStepDiagnostics[];
  /** True when whole steps' diagnostics were shed to fit the document byte cap. */
  truncated: boolean;
  /** Present only when `truncated` is true. */
  truncationReason?: TruncationReason | null;
  attempts: number;
  exhausted: boolean;
}

/** The `202` body of `POST /tests/{id}/compile`. Acceptance of an attempt, never its success. */
export interface CompileAccepted {
  compileRequestId: string;
  compileStatus: string;
  sourceRevision?: number | null;
  configurationRevision?: number | null;
}

/**
 * The confirmation body, exactly the four fields `ConfirmCompileRequest.required` declares
 * (architecture §4.2, §8.3). The transaction is conditional on all four, so all four must come
 * from the one response the user was looking at.
 */
export interface ConfirmCompileRequest {
  revisionId: string;
  artifactHash: string;
  sourceRevision: number;
  configurationRevision: number;
}

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
  compileStatus: CompileStatus;
  currentCandidateRevisionId: string | null;
  /**
   * The canonical artifact hash of the revision `currentCandidateRevisionId` names, and the value
   * `ConfirmCompileRequest.artifactHash` is read from (ADR-002 §21.2). Null when there is no
   * candidate, and **always null on `GET /tests`** — the list projection drops it alongside
   * `currentCandidateArtifact` and `compileDiagnostics` (§21.2, on §16.5's precedent).
   *
   * Never fabricated, never recomputed client-side, never defaulted. A client-computed hash would
   * be the client asserting what the server canonicalized, which is the one thing the conditional
   * transaction exists to check (§21.8).
   */
  currentCandidateArtifactHash?: string | null;
  /**
   * The candidate revision's immutable validated artifact. Null when there is no candidate, and
   * always null on `GET /tests`.
   *
   * This is the **candidate's**, and `steps` is the draft's current English. Where a surface
   * claims to show what was validated it renders this, never `steps` (ADR-002 §21.7).
   */
  currentCandidateArtifact?: SourceArtifact | null;
  confirmedRevisionId: string | null;
  /**
   * Non-null only with `compileStatus: STALE`. Present on both `GET /tests` and `GET /tests/{id}`
   * (ADR-002 §16.5).
   */
  compileError?: CompileError | null;
  /**
   * Non-null only with `compileStatus: NEEDS_REVISION`, and **always null on `GET /tests`** — the
   * list projection drops it deliberately (ADR-002 §16.5), so the review surface reads the
   * single-draft route regardless of what the list already holds.
   */
  compileDiagnostics?: CompileDiagnostics | null;
}

/** One entry per original step. Skipped or unstarted steps carry null timings. */
export interface StepResult {
  stepIndex: number;
  originalText: string;
  status: StepStatus;
  offsetMs: number | null;
  durationMs: number | null;
  message: string | null;
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
  executionId: string;
  testId: string;
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

export interface ExecuteAccepted {
  executionId: string;
  status: ExecutionStatus;
}

export interface StudioErrorResponse {
  error: string;
  message: string;
}

/** The compiled artifact, mirrored from `docs/specs/studio/artifact.schema.json`. */
export interface ArtifactStep {
  stepIndex: number;
  originalText: string;
  code: string;
}

export interface SourceArtifact {
  version: number;
  steps: ArtifactStep[];
}

/**
 * The terminal outcomes, in one place. Every Studio surface that decides whether a run has ended
 * (the Studio page, the Tests page, the Runs page) reads this set rather than keeping its own.
 */
export const TERMINAL_EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  'PASSED',
  'FAILED',
  'ERROR',
];

export function isTerminalExecutionStatus(status: string): boolean {
  return (TERMINAL_EXECUTION_STATUSES as readonly string[]).includes(status);
}

export function defaultConfiguration(): TestConfiguration {
  return {
    browser: CANONICAL_BROWSER,
    viewport: { width: 1920, height: 1080 },
    timeoutSeconds: 30,
    waitStrategy: 'networkidle',
  };
}
