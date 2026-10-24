/**
 * Types for `evaluate.mjs` and `pages/server.mjs`, following the `evaluation/report.d.mts` precedent: the harness stays plain
 * ESM runnable with bare `node`, and its contract is declared so type-checked tests can import it.
 */

export type JsonObject = Record<string, unknown>;
export type CaseClass = 'P' | 'F' | 'N';
export type RunMode = 'HARNESS_SELF_TEST' | 'D_C';
export type MutationKind = 'wrongTarget' | 'reversedAssertion' | 'droppedSubmit' | 'literalSubstitution';

export declare const HARNESS_VERSION: string;
export declare const COMPARISON_CLAIM: 'NONE_NO_COMPARISON_TO_20261004';
export declare const SELF_TEST_LABEL: 'HARNESS_SELF_TEST_NOT_D_C_EVIDENCE';
export declare const MUTATION_KINDS: readonly MutationKind[];
export declare const ZERO_FIELDS: readonly string[];
export declare const FIXTURE_MODES: readonly string[];
export declare const ADMISSION_STATUSES: readonly string[];
export declare const ADMISSION_PURPOSES: readonly string[];
export declare const OBSERVED_AUTHORING_DIR: string;
export declare const observedAuthoringDirectory: string;

export declare function sha256Hex(data: string | Uint8Array): string;
export declare function sha256File(path: string): string;
export declare function canonicalJson(value: unknown): string;
export declare function resolveInside(root: string, relative: string): string;

export interface Pin { path: string; sha256: string | null; base?: 'repo'; owner?: string; consumedUnchanged?: boolean }
export interface CorpusCase {
  id: string; block: string; class: CaseClass; classBasis: string; status: 'READY_LOCAL' | 'EXTERNAL_BLOCKED';
  blockedBy: { owner: string; register: string[]; state: string } | null;
  repetitions: number; modelSessionsPerRepetition?: number;
  portRecord: { knownFromRecord: { resultsJsonl: { sha256: string | null; rowLines: number[]; recordOutcomeKinds: string[] }; intendedClass: CaseClass }; reauthored: string[]; invented: string[]; comparisonClaim: string } | null;
  stepText: Pin | null; pages: Pin[]; pagesReason: string | null;
  fixture: { kind: string; mode?: string; server?: string; serverPin?: Pin; namespaceBase?: string } | null;
  expectedOutcome: Pin | null;
  oracle: { kind: string; endpoint: string; independentOf: string[]; mutationControls: string[]; noSideEffect: boolean };
  rs1: { isRs1Case: boolean | null; state?: string; valueLocations: { value: string; elementKind: string; reachableByGrant: boolean }[]; assertTextLocations: { value: string; elementKind: string }[] };
  [extra: string]: unknown;
}
export interface CorpusManifest {
  schemaVersion: number; kind: string; comparisonClaim: string; manifestFrozenAt: string | null; manifestSha256: string | null;
  gate: { completionThresholdPct: number; classPCases: number; plannedRuns: number; minCompletions: number; maxFailedRuns: number };
  sessionPlan: { runs: number; sessions: number; contingencySessions: number };
  sources: Record<string, Pin>; rulings: Record<string, JsonObject>; cases: CorpusCase[];
  [extra: string]: unknown;
}

export interface GateArithmetic { classPCases: number; repetitions: number; plannedRuns: number; thresholdPct: number; minCompletions: number; maxFailedRuns: number }
export declare function gateArithmetic(classPCases: number, repetitions: number, thresholdPct?: number): GateArithmetic;
export declare function sessionPlan(manifest: { cases: { repetitions: number; modelSessionsPerRepetition?: number }[] }): { runs: number; sessions: number; contingencySessions: number };
export declare function validateCorpusManifest(manifest: unknown, options?: { root?: string; repoRoot?: string | null; checkFiles?: boolean }): {
  errors: string[]; counts: { P: number; F: number; N: number; total: number; blockedExternal: number; rs1Cases: number; rs1KnownLocalCases: number; rs1UnknownStagingCases: number } | null; gate: GateArithmetic | null; plan?: { runs: number; sessions: number; contingencySessions: number };
};
export declare function manifestDigest(manifest: unknown): string;
export declare function freezeManifest(path: string, options?: { now?: Date; root?: string; repoRoot?: string | null }): CorpusManifest;
export declare function loadManifest(path?: string): CorpusManifest;

export interface ObservedSession { terminal: string; observedStates: string[]; published: boolean; clarifications: number; failureCode: string | null; failedStepNumber: number | null }
export interface PhaseReceipts { actions: JsonObject[]; views: string[] }
export interface Observation { session: ObservedSession; receipts: { phases: Record<string, PhaseReceipts> }; incremental?: JsonObject }
export interface ExpectedOutcome {
  class: CaseClass; caseId?: string;
  receipts: { phases: Record<string, { actions: { type: string; fields?: JsonObject }[] }>; views?: { required?: string[]; allowed?: string[] } };
  session: { terminal: string[]; published: boolean; failureCodes?: string[]; failedStepNumber?: number; clarifications?: number | 'ANY'; mustObserve?: string[] };
  incremental?: JsonObject; script?: { clarificationChoices?: string[] };
}
export interface OutcomeVerdict { correct: boolean; falseSuccess: boolean; failures: string[] }
export declare function evaluateOutcome(expected: ExpectedOutcome, observed: Observation, vars?: Record<string, string>): OutcomeVerdict;
export declare function idealObservation(expected: ExpectedOutcome, vars?: Record<string, string>): Observation;
export declare function mutateObservation(kind: MutationKind, observed: Observation, expected: ExpectedOutcome): { applicable: boolean; observed: Observation };
export declare function oracleMutationControl(expected: ExpectedOutcome, vars?: Record<string, string>): {
  positiveAccepted: boolean; mutants: Record<MutationKind, { applicable: boolean; rejected: boolean | null; failures?: string[] }>; applicableMutants: number; ok: boolean;
};
export declare function checkIsolation(sessions: { csiId: string; ownValue: string; observedValues: string[] }[]): { isolated: boolean; failures: string[] };
export declare function scanCanaries(input: { texts: Record<string, string>; secretCanaries?: string[]; positiveCanary?: string | null; requirePositive?: boolean }): {
  leaks: number; findings: { label: string; canaryIndex: number; canarySha256Prefix: string; hits: number }[]; positiveCanaryPresent: boolean | null; positiveCanaryOk: boolean; scannedLabels: number;
};

export type CauseField = 'rs1NonScalarReadGaps' | 'authoredEchoUnobservableTargets' | 'focusMutationRefusedFills';
export type AccountingScope = 'gateP' | 'creditedAllClasses' | 'allAttempts';
export interface RunIdentity { caseId: string | null; rep: number | null; attempt: number | null }
export interface CauseAssessment extends RunIdentity { status: 'VERIFIED' | 'UNKNOWN'; evidenceSha256: string | null; manifestSha256: string | null }
export interface BudgetUsage { basis: 'PUBLIC_BUDGET_COUNTERS'; modelProposals: number | null; inputTokens: number | null; outputTokens: number | null }
export interface LearnSession { phase: 'base' | 'incremental'; sessionId: string; session?: ObservedSession; observationComplete?: boolean; usage: BudgetUsage; hardGates: { falsePass: boolean; secretOrPiiLeak: number }; budgetCharge?: { amountUsd: number; basis: string }; oracle?: OutcomeVerdict }
export interface CauseAnnotation extends RunIdentity { rawOrdinal: number; rawRecordSha256: string; manifestSha256: string | null; causes: Record<CauseField, { count: number; events: JsonObject[]; assessment: CauseAssessment }> }
export interface CauseOverlay { rawRunsSha256: string; annotations: CauseAnnotation[] }
export interface ClosedCauseReview extends RunIdentity { kind: 'STUDIO_OBS_009_CLOSED_CAUSE_REVIEW'; rawRunsSha256: string; rawOrdinal: number; rawRecordSha256: string; manifestSha256: string | null; field: CauseField; events: JsonObject[]; scope: { complete: boolean; observationEvidenceSha256: string; justificationCode: 'COMPLETE_REVIEWED_SCOPE' | 'PARTIAL_REVIEWED_SCOPE'; stepTextSha256: string | null; expectedOutcomeSha256: string | null; valueLocationsSha256: string } }
export interface ReviewDocument<T = JsonObject> { sha256: string; fileText: string; value: T }
export interface ReviewAdoption { kind: 'INDEPENDENT_BENCHMARK_CAUSE_ADOPTION'; status: 'ADOPTED'; rawRunsSha256: string; overlaySha256: string; manifestSha256: string | null; executionReceiptSha256: string; ledgerSha256: string; independentOfAuthor: boolean; originalExecutionAndConfigurationReviewed: boolean; originalIntervalHistoryReviewed?: boolean; intervalLedgerSha256?: string; accepted: { rawOrdinal: number; field: CauseField; evidenceSha256: string }[] }
export interface ExecutionReceipt { kind: 'STUDIO_OBS_009_EXECUTION_RECEIPT'; mode: RunMode; startedAt: string; finishedAt?: string; intervalLedgerSha256?: string | null; manifestSha256: string | null; rawRunsSha256: string; ledgerSha256: string; admissionSeq: number; admissionEntrySha256: string; configurationSha256: string }
export interface ReviewInput { rawRunsText: string; overlayText: string; overlay: CauseOverlay; reviews: ReviewDocument<ClosedCauseReview>[]; adoption: ReviewDocument<ReviewAdoption> | null; execution: ReviewDocument<ExecutionReceipt> | null; ledger: ReviewDocument<AdmissionLedger> | null; intervalLedger?: ReviewDocument<AdmissionLedger> | null; inputFileSha256?: Record<string, string> }
export interface CauseSummary { unit: 'classified-events'; confirmedTotal: number; total: number | null; runsCounted: number; verifiedRuns: number; unknownRuns: number; items: JsonObject[]; unknownIdentities: RunIdentity[]; affectedRuns: RunIdentity[]; fullPlannedRuns?: number; runnablePlannedRuns?: number; missingRuns?: string[]; blockedUnrun?: string[] }
export interface ChargeMetric { total: number | null; knownSubtotal: number; complete: boolean; knownSessions: number; unknownSessions: number; unknownSessionIdentities: (RunIdentity & { phase: string; sessionId: string })[]; p50: number | null; p95: number | null }
export interface ChargeSummary { basis: 'PUBLIC_BUDGET_COUNTERS'; logicalAttempts: number; knownStartedSessions: number | null; knownSessionReferences: number; duplicateSessionIds: string[]; unknownAttempts: RunIdentity[]; proposals: ChargeMetric; input: ChargeMetric; output: ChargeMetric; knownConservativeChargeSubtotalUsd: number | null; logicalCounterClaims: Record<string, { knownSubtotal: number; knownAttempts: number; unknownAttemptIdentities: RunIdentity[]; basis: string }>; protectiveStopCharges: { knownSubtotalUsd: number; totalUsd: number | null; complete: boolean; unknownSessions: number; unresolvedPotentialStarts: number; bases: string[] }; conservativeChargeUsd: number | null; actualWireCalls: null; actualProviderInputTokens: null; actualProviderOutputTokens: null; actualBilledCostUsd: null; actualEvidence: string }
export interface RunRecord {
  caseId: string; rep: number; attempt: number; mode: RunMode; manifestSha256: string | null; runStartedAt: string; runFinishedAt: string;
  sessionId?: string; session?: ObservedSession; oracle?: OutcomeVerdict; infrastructureFailure: string | null;
  causeAssessment?: Record<CauseField, CauseAssessment>;
  learnSessionsComplete?: boolean; learnSessions?: LearnSession[];
  usage?: { basis?: 'PUBLIC_BUDGET_COUNTERS'; modelProposals: number | null; inputTokens: number | null; outputTokens: number | null };
  secretOrPiiLeak?: number; rs1NonScalarReadGaps: number; authoredEchoUnobservableTargets: number; focusMutationRefusedFills: number;
  details?: Record<string, JsonObject[]>; incremental?: JsonObject;
}
export declare function validateRunRecord(run: unknown, manifest: CorpusManifest): string[];
export interface Price { pInPerMTok: number; pOutPerMTok: number; source?: string | null }
export interface Benchmark {
  schemaVersion: number; kind: string; label: string; manifestSha256: string | null; comparisonClaim: string; admissionStatus: string | null;
  gate: { scope: string; verdict: string; reasons: string[]; classP: { casesPlanned: number; casesRunnable: number; runsCredited: number; completions: number; failedRuns: number; rate: number | null; thresholdPct: number; fullArithmetic: GateArithmetic; runnableArithmetic: GateArithmetic }; blockedUnrun: string[] };
  hardGates: { falsePasses: number; secretOrPiiLeaks: number; falsePassRuns: RunIdentity[]; leakRuns: RunIdentity[] };
  reviewProvenance: JsonObject; evidenceStatus: string; requiredActualEvidence: string[];
  corpusInspection: { knownLocalCaseIds: string[]; confirmedRs1CaseIds: string[]; unknownStagingCaseIds: string[]; knownLocalCount: number; confirmedRs1CaseCount: number; unknownStagingCount: number; globalRs1Total: number | null; disclosure: string };
  classFN: { runs: number; correct: number };
  denominatorLedger: { plannedRuns: number; creditedRuns: number; infrastructureFailures: JsonObject[]; missingRuns: string[]; blockedUnrunCases: string[]; problems: { caseId: string | null; rep: number | null; code: string }[] };
  accounting: Record<CauseField, Record<AccountingScope, CauseSummary>>;
  charges: Record<AccountingScope, ChargeSummary>;
  latency: { basis: string; missingSamples: number; p50Ms: number | null; p95Ms: number | null; samples: number; denominator: number };
  modelCalls: { total: number | null; basis: string; proposals: ChargeMetric; p50: number | null; p95: number | null; samples: number; denominator: number };
  tokens: { input: number | null; output: number | null; denominator: number; complete: boolean; basis: string };
  costUsd: { total: number | null; conservativeChargeUsd: number | null; basis: string; denominator: number };
  incremental: JsonObject[];
}
export declare function buildBenchmark(input: { manifest: CorpusManifest; runs: RunRecord[]; mode: RunMode; generatedAt?: string; admission?: JsonObject | null; price?: Price | null; reviewInput?: ReviewInput | null; root?: string; repoRoot?: string }): Benchmark;
export declare function scoreReplayStability(input: { replays: { ok: boolean; artifactHash: string }[]; required?: number; thresholdPct?: number; label?: string }): {
  label: string; required: number; executed: number; completed: number; completionRate: number | null; thresholdPct: number; distinctArtifactHashes: number; pass: boolean; verdict: string;
};
export declare function measureProposals(documents: JsonObject[], production?: { perCallOutputTokens: number; outputTotal: number; inputTotal: number; csiDailyOutput: number; csiDailyInput: number }): {
  kind: string; label: string; maxProposalsAtProductionCeilings: number; peakProposals: number; verdict: string; caveat: string;
  sessions: { proposals: number; reservedOutputAtFixtureCeiling: number; reservedOutputAtProductionCeiling: number; exceedsProductionOutputTotal: boolean; inputShareOfTotal: number; fullSessionsPerCsiDayOutput: number; fullSessionsPerCsiDayInput: number; fixtureCeilingPerCall: number }[];
};

export declare class AdmissionError extends Error { readonly code: string; constructor(code: string) }
export interface ProposalPlan { plannedProposals: number; contingencyFactor: number; inputBytesPerCall?: number; inputTokenCap?: number; basis: string }
export interface ProposalCaps { plannedProposals: number; contingencyFactor: number; contingencyProposals: number; tokenCapIn: number; tokenCapOut: number; capBasis: { output: string; input: string; plan: string } }
export declare function proposalCaps(plan: ProposalPlan, caps: { maxOutputTokensPerCall: number; [extra: string]: unknown }): ProposalCaps;
export interface AdmissionComputed { plannedRuns: number | null; plannedSessions: number | null; contingencySessions: number | null; plannedProposals: number; contingencyFactor: number; contingencyProposals: number; tokenCapIn: number; tokenCapOut: number; capBasis: { output: string; input: string; plan: string }; costBoundUsd: number | null }
export interface AdmissionDecision {
  status: string; purpose: string; decidedAt: string; admittedAt: string | null; admittedBy: string | null; manifestSha256: string | null;
  ceilingUsd: number; ceilingScope: string; remainingUsdAtAdmission: { value: number; source?: string | null } | null; allocationUsd: number | null; stopThresholdUsd: number | null;
  priceSource: Price | null; computed: AdmissionComputed; enforcedCaps: { maxModelInputTokensTotal: number; maxModelOutputTokensTotal: number; [extra: string]: unknown };
  perCsiPlan: JsonObject | null; measuredProposalsPerSession: unknown; pinned: JsonObject | null; notAdmittedBecause: string[];
}
export interface AdmissionEntry extends AdmissionDecision { seq: number; prevEntrySha256: string | null }
export interface AdmissionLedger { schemaVersion: number; kind: string; appendOnly: boolean; admissions: AdmissionEntry[] }
export declare function emptyLedger(): AdmissionLedger;
export declare function verifyLedger(ledger: unknown): string[];
export declare function computeAdmission(input: {
  purpose: string; manifest?: CorpusManifest | null; price?: Price | null; headroomUsd?: { value: number; source?: string | null } | null; allocationUsd?: number | null; ceilingUsd?: number;
  enforcedCaps: { maxModelInputTokensTotal: number; maxModelOutputTokensTotal: number; maxOutputTokensPerCall: number; [extra: string]: unknown }; proposalPlan: ProposalPlan; perCsiPlan?: JsonObject | null; measuredProposalsPerSession?: unknown;
  pinned?: JsonObject | null; admittedBy?: string | null; now?: Date; notAdmittedBecause?: string[];
}): AdmissionDecision;
export declare function appendAdmission(path: string, decision: AdmissionDecision, options?: { create?: boolean }): AdmissionEntry;
export declare function guardStart(input: { ledger: AdmissionLedger; manifestSha256: string | null; purpose?: string; now?: Date }): AdmissionEntry;
export declare function createStopRule(input: { allocationUsd: number; price: Price; stopFraction?: number; reservedCeiling: { input: number; output: number }; perCallCeiling?: { input: number; output: number } | null }): {
  record(session: { inputTokens: number | null; outputTokens: number | null; modelProposals?: number | null; falsePass?: boolean; leak?: boolean }): { stop: boolean; reason: string | null; spentUsd: number; costBasis: string };
  observeHardGate(facts: { falsePass?: boolean; leak?: boolean }): { stop: boolean; reason: string | null; spentUsd: number };
  nextSessionAllowed(): boolean; state(): { observedReasons: string[]; sessions: number; spentUsd: number; stopped: string | null; stopThresholdUsd: number };
};

/** Numeric PUT tokens; the driver rejects nonpositive, unsafe or nonnumeric values. */
export interface DraftRevisionTuple { sourceRevision: number; configurationRevision: number }
export interface DraftSnapshot extends DraftRevisionTuple { id: string }

export interface StudioApiClient {
  createDraft(name: string, authoring: { request: JsonObject }): Promise<{ id: string; sourceRevision: number | string; configurationRevision: number | string }>;
  /** Full decoded successful body, captured before the driver validates its identity/revisions. */
  readDraft(id: string): Promise<unknown>;
  /** Validates only the explicit PUT input tuple; response validation follows privacy capture. */
  updateDraft(id: string, name: string, authoring: { request: JsonObject }, revisions: DraftRevisionTuple): Promise<unknown>;
  startSession(draft: { id: string; sourceRevision: number | string; configurationRevision: number | string }, extra?: JsonObject): Promise<{ session: { sessionId: string; state: string; counters?: JsonObject } }>;
  readSession(id: string): Promise<{ session: { sessionId: string; state: string; counters?: JsonObject } }>;
  readClarification(id: string): Promise<{ clarificationId: string; generation: number } | null>;
  clarify(id: string, body: JsonObject): Promise<unknown>;
  cancel(id: string): Promise<unknown>;
  finalize(id: string, revisions: { sourceRevision: number | string; configurationRevision: number | string }): Promise<unknown>;
  readResult(id: string): Promise<JsonObject>;
  execute(testId: string): Promise<{ executionId: string }>;
  readExecution(id: string): Promise<{ status: string }>;
}
export declare function createPublicApiClient(input: { baseUrl: string; token: string; transport?: (url: URL, init: RequestInit) => Promise<Response>; csiId: string; environmentId: string; applicationId: string }): StudioApiClient;
export declare function buildAuthoringRequest(stepText: JsonObject, vars: Record<string, string>): { request: JsonObject };

export interface ReceiptsChannel { mark(): number; since(cursor: number): PhaseReceipts }
export declare function pageReceipts(host: CorpusPagesHost, ns: string): ReceiptsChannel;
export interface DriveOptions { pollMs?: number; timeoutMs?: number; now?: () => Date; pause?: (ms: number) => Promise<void>; replays?: number; secretCanaries?: string[]; /** Operator-supplied text outputs to scan (logs, SSE, audit, gateway bytes), by label. */ extraTexts?: (() => Promise<Record<string, string>>) | null }
export declare function driveCase(input: DriveOptions & {
  client: StudioApiClient; entry: CorpusCase; stepText: JsonObject; expected: ExpectedOutcome; vars: Record<string, string>; receipts: ReceiptsChannel; mode: RunMode; manifest: CorpusManifest;
  rep?: number; attempt?: number; stopRule?: ReturnType<typeof createStopRule> | null;
}): Promise<RunRecord>;
export declare function driveIncremental(input: DriveOptions & {
  client: StudioApiClient; entry: CorpusCase; caseFile: JsonObject; expected: ExpectedOutcome; vars: Record<string, string>; receipts: ReceiptsChannel; switchSourceValue: () => void; mode: RunMode; manifest: CorpusManifest;
  rep?: number; attempt?: number; stopRule?: ReturnType<typeof createStopRule> | null;
}): Promise<RunRecord>;
export declare function hostExistingFixture(kind: 'guided-dataflow' | 'secret-login', options?: { mode?: string; initialValue?: string; password?: string }): Promise<{
  origin: string; close(): Promise<void>; receipts: ReceiptsChannel; setSourceValue?: (value: string) => void;
}>;
export declare function runBenchmark(input: {
  manifest: CorpusManifest; mode: RunMode; client: StudioApiClient; ledger?: AdmissionLedger | null; price?: Price | null; root?: string; repoRoot?: string;
  select?: string[] | null; plantedSecrets?: Record<string, string>; driveOptions?: DriveOptions; scripts?: Record<string, { client?: StudioApiClient; expected?: ExpectedOutcome }>;
}): Promise<{ runs: RunRecord[]; benchmark: Benchmark }>;
export declare function repoRootFrom(root?: string): string;

export interface CorpusPagesHost {
  pagesVersion: string; origin: string; fixtureOrigin(ns: string): string; pageKeys(): string[];
  receipts(ns: string): ({ seq: number; type: string; [field: string]: unknown })[]; reset(ns: string): void; close(): Promise<void>;
}
export declare function startCorpusPages(options?: { port?: number; root?: string; plantedSecrets?: Record<string, string> }): Promise<CorpusPagesHost>;
