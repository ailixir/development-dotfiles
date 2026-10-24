/**
 * Shared test inputs for the observed-authoring harness tests (STUDIO-OBS-009 AC-7..AC-10, lane EP).
 * Everything here is a UNIT-TEST INPUT. Synthetic run records exist only to prove the gate arithmetic and the
 * accounting; they are never written to an evidence file as results and never labelled D-C evidence.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OBSERVED_AUTHORING_DIR, canonicalJson, computeAdmission, loadManifest, manifestDigest, repoRootFrom, sha256File, sha256Hex,
  type CauseField, type ClosedCauseReview, type CorpusCase, type CorpusManifest, type ExpectedOutcome, type ReviewDocument, type ReviewInput, type RunMode, type RunRecord, type AdmissionLedger,
} from '../../evaluation/observed-authoring/evaluate.mjs';

export const frozenManifest = (): CorpusManifest => {
  // Unit-only freeze of the candidate metadata; never writes/adopts the actual manifest.
  const manifest = structuredClone(loadManifest());
  for (const [name, path] of Object.entries({ evaluator: 'studio-runner/evaluation/observed-authoring/evaluate.mjs', evaluationCli: 'studio-runner/evaluation/cli.mjs', corpusPageServer: 'studio-runner/evaluation/observed-authoring/pages/server.mjs' })) {
    manifest.sources[name] = { path, base: 'repo', sha256: sha256File(join(repoRootFrom(), path)) };
  }
  manifest.manifestFrozenAt = '2026-10-18T16:38:51.221Z';
  manifest.manifestSha256 = manifestDigest(manifest);
  return manifest;
};

/** Synthetic closed review inputs for pure scoring controls; no assertion of actual independent evidence. */
export function reviewedInput(manifest: CorpusManifest, runs: RunRecord[]): ReviewInput {
  const reference = <T>(value: T): ReviewDocument<T> => { const fileText = canonicalJson(value); return { fileText, sha256: sha256Hex(fileText), value }; };
  const rawRunsText = runs.map((run) => JSON.stringify(run)).join('\n') + '\n';
  const rawRunsSha256 = sha256Hex(rawRunsText);
  const reviews: ReviewDocument<ClosedCauseReview>[] = [];
  const annotations = runs.map((run, i) => {
    const id = { caseId: run.caseId, rep: run.rep, attempt: run.attempt };
    const rawRecordSha256 = sha256Hex(canonicalJson(run));
    const entry = manifest.cases.find((item) => item.id === run.caseId);
    const causes = Object.fromEntries(['rs1NonScalarReadGaps', 'authoredEchoUnobservableTargets', 'focusMutationRefusedFills'].map((name) => {
      const field = name as CauseField;
      const events = run.details?.[field] ?? [];
      const review = reference<ClosedCauseReview>({ kind: 'STUDIO_OBS_009_CLOSED_CAUSE_REVIEW', ...id, rawRunsSha256, rawOrdinal: i + 1, rawRecordSha256,
        manifestSha256: run.manifestSha256, field, events, scope: { complete: true, observationEvidenceSha256: sha256Hex('SYNTHETIC_UNIT_SCOPE'), justificationCode: 'COMPLETE_REVIEWED_SCOPE',
          stepTextSha256: entry?.stepText?.sha256 ?? null, expectedOutcomeSha256: entry?.expectedOutcome?.sha256 ?? null, valueLocationsSha256: sha256Hex(canonicalJson(entry?.rs1.valueLocations ?? [])) } });
      reviews.push(review);
      return [field, { count: run[field], events, assessment: { status: 'VERIFIED', evidenceSha256: review.sha256, manifestSha256: run.manifestSha256, ...id } }];
    })) as ReviewInput['overlay']['annotations'][number]['causes'];
    return { rawOrdinal: i + 1, rawRecordSha256, manifestSha256: run.manifestSha256, ...id, causes };
  });
  const overlay = { rawRunsSha256, annotations };
  const overlayText = canonicalJson(overlay);
  const admitted = computeAdmission({ purpose: 'ac7-benchmark', manifest, now: new Date(Date.parse(manifest.manifestFrozenAt ?? '') + 1000),
    price: { pInPerMTok: 1, pOutPerMTok: 2, source: 'SYNTHETIC_UNIT_PRICE' }, headroomUsd: { value: 500, source: 'SYNTHETIC_UNIT_HEADROOM' }, allocationUsd: 100,
    enforcedCaps: { maxOutputTokensPerCall: 4096, maxModelInputTokensTotal: 786432, maxModelOutputTokensTotal: 98304 },
    proposalPlan: { plannedProposals: 1, contingencyFactor: 1, inputTokenCap: 1000, basis: 'SYNTHETIC_UNIT_PLAN' }, pinned: { source: 'SYNTHETIC_UNIT_CONFIG' }, admittedBy: 'SYNTHETIC_UNIT_ONLY' });
  const admission = { seq: 1, prevEntrySha256: null, ...admitted };
  const ledger = reference<AdmissionLedger>({ schemaVersion: 1, kind: 'BUDGET_ADMISSION_LEDGER', appendOnly: true, admissions: [admission] });
  const execution = reference<NonNullable<ReviewInput['execution']>['value']>({ kind: 'STUDIO_OBS_009_EXECUTION_RECEIPT', mode: 'D_C', startedAt: new Date(Date.parse(manifest.manifestFrozenAt ?? '') + 2000).toISOString(),
    // Explicit synthetic closure, never inferred as an actual original end from run timestamps.
    finishedAt: new Date(Date.parse(manifest.manifestFrozenAt ?? '') + 7_200_000).toISOString(), intervalLedgerSha256: ledger.sha256,
    manifestSha256: manifest.manifestSha256, rawRunsSha256, ledgerSha256: ledger.sha256, admissionSeq: 1, admissionEntrySha256: sha256Hex(canonicalJson(admission)),
    configurationSha256: sha256Hex(canonicalJson({ enforcedCaps: admission.enforcedCaps, pinned: admission.pinned })) });
  const adoption = reference<NonNullable<ReviewInput['adoption']>['value']>({ kind: 'INDEPENDENT_BENCHMARK_CAUSE_ADOPTION', status: 'ADOPTED', rawRunsSha256, overlaySha256: sha256Hex(overlayText),
    manifestSha256: manifest.manifestSha256, executionReceiptSha256: execution.sha256, ledgerSha256: ledger.sha256, independentOfAuthor: true, originalExecutionAndConfigurationReviewed: true, originalIntervalHistoryReviewed: true, intervalLedgerSha256: ledger.sha256,
    accepted: reviews.map((review) => ({ rawOrdinal: review.value.rawOrdinal, field: review.value.field, evidenceSha256: review.sha256 })) });
  return { rawRunsText, overlayText, overlay, reviews, adoption, execution, ledger, intervalLedger: structuredClone(ledger) };
}

export const readJson = (relative: string): unknown => JSON.parse(readFileSync(join(OBSERVED_AUTHORING_DIR, relative), 'utf8'));

/** Narrowing helper for tests: a missing value is a failed precondition, not a silent undefined. */
export function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

export const expectedOf = (entry: CorpusCase): ExpectedOutcome => {
  if (entry.expectedOutcome === null) throw new Error(`no expected outcome for ${entry.id}`);
  return readJson(entry.expectedOutcome.path) as ExpectedOutcome;
};

export interface SyntheticOptions {
  mode: RunMode;
  /** Number of class P runs (in case order) that end as ordinary failures. */
  failP?: number;
  /** Case id whose first run is a false pass. */
  falsePassCase?: string;
  /** Case id whose first run leaks a secret. */
  leakCase?: string;
  /** Drop this many class P runs from the end (missing runs). */
  dropP?: number;
}

export function syntheticRuns(manifest: CorpusManifest, options: SyntheticOptions): RunRecord[] {
  const runs: RunRecord[] = [];
  const frozen = Date.parse(manifest.manifestFrozenAt ?? '');
  let tick = 0;
  let failuresLeft = options.failP ?? 0;
  for (const entry of manifest.cases) {
    if (entry.status !== 'READY_LOCAL') continue;
    for (let rep = 1; rep <= entry.repetitions; rep += 1) {
      tick += 1;
      const start = new Date(frozen + 3_600_000 + tick * 10_000);
      const end = new Date(start.getTime() + 1_000 + tick * 100);
      const fails = entry.class === 'P' && failuresLeft > 0;
      if (fails) failuresLeft -= 1;
      const falsePass = options.falsePassCase === entry.id && rep === 1;
      const good = entry.class === 'P' ? !fails : true;
      runs.push({
        caseId: entry.id, rep, attempt: 1, mode: options.mode, manifestSha256: manifest.manifestSha256,
        runStartedAt: start.toISOString(), runFinishedAt: end.toISOString(), infrastructureFailure: null,
        session: { terminal: entry.class === 'P' ? (fails ? 'FAILED' : 'SUCCEEDED') : 'FAILED', observedStates: [], published: entry.class === 'P' && !fails, clarifications: 0, failureCode: null, failedStepNumber: null },
        oracle: { correct: good && !falsePass, falseSuccess: falsePass, failures: good && !falsePass ? [] : ['synthetic'] },
        usage: { modelProposals: 4 + (tick % 5), inputTokens: 1000 * tick, outputTokens: 100 * tick },
        secretOrPiiLeak: options.leakCase === entry.id && rep === 1 ? 1 : 0,
        rs1NonScalarReadGaps: 0, authoredEchoUnobservableTargets: 0, focusMutationRefusedFills: 0,
      });
    }
  }
  for (const run of runs) {
    const count = manifest.cases.find((entry) => entry.id === run.caseId)?.block === 'incremental' ? 2 : 1;
    const usage = run.usage;
    if (usage) run.usage = { ...usage, basis: 'PUBLIC_BUDGET_COUNTERS' };
    run.learnSessionsComplete = true;
    run.learnSessions = Array.from({ length: count }, (_v, i): NonNullable<RunRecord['learnSessions']>[number] => ({ phase: i === 0 ? 'base' : 'incremental', sessionId: `synthetic-${run.caseId}-${String(run.rep)}-${String(i)}`,
      session: { ...(run.session ?? { terminal: 'FAILED', observedStates: [], published: false, clarifications: 0, failureCode: null, failedStepNumber: null }) },
      usage: { basis: 'PUBLIC_BUDGET_COUNTERS', modelProposals: usage?.modelProposals == null ? null : i === 0 && count === 2 ? Math.floor(usage.modelProposals / 2) : count === 2 ? usage.modelProposals - Math.floor(usage.modelProposals / 2) : usage.modelProposals,
        inputTokens: usage?.inputTokens == null ? null : i === 0 && count === 2 ? Math.floor(usage.inputTokens / 2) : count === 2 ? usage.inputTokens - Math.floor(usage.inputTokens / 2) : usage.inputTokens,
        outputTokens: usage?.outputTokens == null ? null : i === 0 && count === 2 ? Math.floor(usage.outputTokens / 2) : count === 2 ? usage.outputTokens - Math.floor(usage.outputTokens / 2) : usage.outputTokens },
      hardGates: { falsePass: run.oracle?.falseSuccess === true, secretOrPiiLeak: run.secretOrPiiLeak ?? 0 } }));
  }
  if ((options.dropP ?? 0) > 0) {
    let drop = options.dropP ?? 0;
    const classOf = new Map(manifest.cases.map((c) => [c.id, c.class]));
    for (let i = runs.length - 1; i >= 0 && drop > 0; i -= 1) {
      const run = runs[i];
      if (run !== undefined && classOf.get(run.caseId) === 'P') { runs.splice(i, 1); drop -= 1; }
    }
  }
  return runs;
}
