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

export type ExecutionErrorCode =
  | 'TIMEOUT'
  | 'DISPATCH_FAILED'
  | 'DISPATCH_UNKNOWN'
  | 'START_TIMEOUT'
  | 'STALE'
  | 'DISPATCH_DISABLED';

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
  confirmedRevisionId: string | null;
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
  at: string;
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
