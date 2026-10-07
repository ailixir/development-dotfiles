/**
 * Types for `evaluation/report.mjs`, following the `scripts/*.d.mts` precedent: the harness stays
 * plain ESM runnable with bare `node`, and its contract is declared so type-checked tests can import it.
 */

export declare const REPORT_SCHEMA_VERSION: 2;
export declare const UNAVAILABLE: 'unavailable';
export type Unavailable = typeof UNAVAILABLE;
export type ExpectedClass = 'SUPPORTED' | 'UNSUPPORTED' | 'CLARIFICATION';

export interface Ratio {
  readonly numerator: number;
  readonly denominator: number;
  readonly rate: number | null;
  readonly denominatorDefinition: string;
}
export interface Latency {
  readonly samples: number;
  readonly denominator: number;
  readonly missingSamples: number;
  readonly denominatorDefinition: string;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly maxMs: number | null;
}
export interface Total {
  readonly total: number | null;
  readonly availableTrials: number;
  readonly denominator: number;
}
export interface PlannedTrial {
  readonly id: string;
  readonly expectedClass: ExpectedClass;
  readonly requestedMode?: string;
  readonly family?: string | null;
}
export interface Usage {
  readonly proposalCount?: number | null;
  readonly repairCount?: number | null;
  readonly transportAttemptCount?: number | null;
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
  readonly thinkingTokens?: number | null;
  readonly cancellationOutcome?: string | null;
  readonly elapsedMs?: number | null;
}
export interface TrialRecord {
  readonly id: string;
  readonly expectedClass: ExpectedClass;
  readonly complete: boolean;
  readonly family?: string;
  readonly requestedMode?: string;
  readonly elapsedMs?: number;
  readonly compileMs?: number;
  readonly executionStatus?: 'PASSED' | 'FAILED' | 'ERROR';
  readonly candidateProduced?: boolean;
  readonly admissionRefused?: boolean;
  readonly usage?: Usage | null;
  readonly baseline?: { readonly usage?: Usage | null };
  readonly runtime?: Record<string, string>;
  readonly oracle?: { readonly correct: boolean; readonly falseSuccess: boolean; readonly failures?: string[] };
}
export interface RunContext {
  readonly tier: string;
  readonly purpose: string;
  readonly concurrency: number;
  readonly pins: Record<string, string>;
  readonly sourceCommit: string;
  readonly dirtyBaselineDigest: string;
  readonly manifestDigest: string;
  readonly fixtureVersion: string | null;
  readonly budgets: { readonly maxApiCalls: number; readonly maxTransportCalls: number; readonly maxElapsedMs: number };
  readonly apiCalls: number;
  readonly reservedTransportCalls: number;
  readonly elapsedMs: number;
  readonly stoppedBy: string | null;
  readonly peakInFlightCompiles?: number;
}
export interface CapacityEvent {
  readonly type: 'ACCEPTED' | 'REFUSED';
  readonly atMs: number;
  readonly httpStatus?: number;
}
interface OutcomeMetrics {
  readonly correctness: { readonly behavioralCorrectness: Ratio; readonly completion: Ratio; readonly incompleteSupported: number };
  readonly coverage: { readonly supportedCoverage: Ratio; readonly familyCorrectness: Ratio; readonly plannedByClass: Record<string, number> };
  readonly unsupportedOutcomes: Record<'UNSUPPORTED' | 'CLARIFICATION', { readonly correctNonExecutable: Ratio; readonly wrongAcceptance: Ratio; readonly incomplete: number }>;
  readonly falseSuccess: { readonly count: number; readonly perSupportedTrial: Ratio; readonly perPassExecution: Ratio };
}
interface LatencyMetrics {
  readonly concurrency: { readonly configuredWorkers: number; readonly peakInFlightCompiles: number | null } | Unavailable;
  readonly compileToCandidate: Latency;
  readonly inference: Latency;
  readonly endToEnd: Latency;
}
export interface EvaluationReport extends OutcomeMetrics {
  readonly schemaVersion: 2;
  readonly releaseReady: false;
  /** `'unavailable'` without run context. */
  readonly tier: string;
  readonly purpose: string;
  readonly plannedTrials: number;
  readonly completedTrials: number;
  readonly missingTrials: number;
  readonly correctTrials: number;
  readonly incorrectTrials: number;
  readonly falseSuccesses: number;
  readonly evidenceGaps: string[];
  readonly pins: {
    /** Each field is the literal `'unavailable'` when the run context was not supplied. */
    readonly declared: Record<string, string> | Unavailable;
    /** Not exposed by the API; always the literal `'unavailable'`, never inferred. */
    readonly inference: { readonly generation: Unavailable; readonly model: Unavailable; readonly prompt: Unavailable };
    readonly sourceCommit: string;
    readonly dirtyBaselineDigest: string;
    readonly manifestDigest: string;
    readonly fixtureVersion: string | null;
    readonly observedRuntime: { readonly runtime: Record<string, string>; readonly executions: number }[];
    readonly runtimeMismatch: Ratio;
  };
  readonly latency: LatencyMetrics;
  readonly budgets: {
    readonly tokens: { readonly definition: string; readonly input: Total; readonly output: Total; readonly thinking: Total };
    readonly transport: {
      readonly observedAttempts: Total;
      readonly reservedCalls: number | Unavailable;
      readonly maxTransportCalls: number | Unavailable;
      readonly apiCalls: number | Unavailable;
      readonly maxApiCalls: number | Unavailable;
      readonly elapsedMs: number | Unavailable;
      readonly maxElapsedMs: number | Unavailable;
      /** `'unavailable'` without run context; null when no ceiling stopped work. */
      readonly stoppedBy: string | null;
    };
    readonly cost: Unavailable;
  };
  readonly repairs: {
    readonly enteredRepair: Ratio;
    readonly repairTelemetryMissing: number;
    readonly repairYield: Ratio;
    readonly totalRepairs: Total;
    readonly totalProposals: Total;
    readonly regressions: Unavailable;
  };
  readonly capacity: Unavailable | {
    readonly admissionsOffered: number;
    readonly admissionsAccepted: number;
    readonly admissionsRefused: number;
    readonly refusalRate: Ratio;
    readonly recovery: Ratio & { readonly p50Ms: number | null; readonly maxMs: number | null };
    readonly cancellationOutcomes: Record<string, number>;
    readonly postDeadlineCalls: Unavailable;
    readonly deadlineSlotRecovery: Unavailable;
  };
  readonly byRequestedMode: Record<string, OutcomeMetrics & { readonly plannedTrials: number; readonly latency: LatencyMetrics }>;
}

export declare function percentile(values: readonly number[], p: number): number | null;
export declare function buildReport(input: {
  trials: readonly TrialRecord[];
  planned: readonly (PlannedTrial | string)[];
  run?: RunContext | undefined;
  capacityEvents?: readonly CapacityEvent[] | undefined;
}): EvaluationReport;
/** 0 = checks passed; 1 = behavioral/check failure; 2 = incomplete evidence. */
export declare function reportExitCode(report: EvaluationReport): 0 | 1 | 2;
export declare function renderReport(report: EvaluationReport): string;
