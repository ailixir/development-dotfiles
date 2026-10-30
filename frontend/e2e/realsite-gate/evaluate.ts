import type {HnAmendment} from './public-label-preflight.ts';
/**
 * The release-gate verdict (ADR-SC-007 "Pass rule" 1-6) as pure functions over recorded results.
 *
 * Nothing here reads a file or a clock. It iterates the TEST TABLE, never the result files that happen
 * to exist, so a missing result is a failure. Anything not proven is INCOMPLETE or INVALID.
 * PASS needs complete same-day learn, proof, replay, control and scan evidence.
 */
import { flowsOf, isDryRunId, isInside, requiredLifecycleCases, sha256Hex, RUN_ID_RE } from './common.ts';
import type { GateTable, GateTest } from './common.ts';
import type { AttemptRow, LedgerRow, LearningTiming } from './status.ts';
import { attemptDurationMs, learningTimingProblems } from './status.ts';
import type { FailureClass } from './classify.ts';
import type { ScanSummary } from './leakscan.ts';
import { scanVerdict,requiredScanSources } from './leakscan.ts';
import { cleanManualFindings, executionFindings, instant } from './lifecycle.ts';
import type { ExecutionLineage, PublishedLineage } from './lifecycle.ts';
import { anchorProblems } from './anchor.ts';
import type { SameDayAnchor } from './anchor.ts';
import { regionFindings } from './region-audit.ts';
import type { RegionAudit } from './region-audit.ts';
import { freezeProblems } from './freeze.ts';
import type { FreezeCheckpoint } from './freeze.ts';

export type Verdict = 'PASS' | 'FAIL' | 'INVALID' | 'INCOMPLETE' | 'PENDING_NEXT_DAY';

export interface RuleResult {
  rule: number;
  name: string;
  verdict: Verdict;
  reasons: string[];
}

// ---- recorded results ------------------------------------------------------------------------

export interface ClarificationRecord {
  atSeconds: number;
  question: string;
  choices: string[];
  picked: string | null;
}

export interface LearnAttemptRecord {
  timingFailure?: string | null;
  failedStepIndex?: number | null;
  attempt: number;
  cls: FailureClass;
  subClass: string | null;
  sessionId: string | null;
  state: string | null;
  errorCode: string | null;
  seconds: number;
  receipt: boolean;
  clarifications: ClarificationRecord[];
  counters: { modelProposals: number; modelInputTokens: number; modelOutputTokens: number; observations: number; actions: number } | null;
  attempts: AttemptRow[] | null;
  ledger: LedgerRow[] | null;
  /** Recorder requests during this attempt, null when the recorder is not configured. */
  gatewayRequests: number | null;
}

export interface ProofRecord {
  lineage?: ExecutionLineage;
  executionId: string;
  status: string;
  triggerSource: string;
  videoStatus: string;
  durationMs: number | null;
}

export interface ModelCallSnapshot {
  proxy: number | null;
  attemptRows: number | null;
  sessionId: string | null;
  proposals: number | null;
}

export interface ReplayRecord {
  lineage?: ExecutionLineage;
  executionId: string;
  status: string;
  triggerSource: string;
  replayFailureCode: string | null;
  uiReceipt: boolean;
  learnedChip: boolean;
  seconds: number;
  stepResults: number;
  before: ModelCallSnapshot;
  after: ModelCallSnapshot;
}

export interface FlowResult {
  learningTiming?: LearningTiming;
  regionAudit?: RegionAudit;
  publicPickDocuments?:{stepId:string;documentId:string}[];
  literalPageTitles?:import('./diagnostic-oracles.ts').LiteralPageTitleWitness[];
  publication?: PublishedLineage;
  flowId: string;
  testId: string | null;
  name: string;
  learnAttempts: LearnAttemptRecord[];
  learned: boolean;
  learnedAt: string | null;
  proof: ProofRecord | null;
  replays: ReplayRecord[];
  detailOk: boolean | null;
  afterLearnExecutions: number;
  learnedChip: boolean;
  error: string | null;
}

export interface TestResult {
  schemaVersion?: 1;
  runId?: string;
  key: string;
  kind: GateTest['kind'];
  status: 'RAN' | 'VOID';
  voidReason: string | null;
  flows: FlowResult[];
  startedAt: string;
  endedAt: string;
}

export interface NextDayResult {
  schemaVersion?: 1;
  runId?: string;
  key: string;
  status: 'PASSED' | 'FAILED' | 'NOT_LEARNED';
  reason: string | null;
  hoursSinceLearn: number | null;
  replay: ReplayRecord | null;
}

export interface ProxySummary {
  truncations?: { total: number; verified4096: number; unknown: number };
  configured: boolean;
  totalRequests: number;
  bodies: number;
  durationsMs: number[];
  modelIds: string[];
  systemInstructionHashes: string[];
}

export interface EnvironmentRecord {
  runId: string;
  dryRun: boolean;
  startedAt: string;
  git: { sha: string; dirty: boolean | 'UNKNOWN'; workingTreeDigestStart: string; workingTreeDigestEnd: string | null };
  model: { id: string | null; source: 'wire' | 'declared'; wireIds: string[] };
  hashes: { contractMd: string; contractsV3: string; promptStatic: string; wireSystemInstruction: string[] };
  playwright: { driver: string; runner: string; coreBundleSha256: string; pinSha256: string; chromiumBuild: string };
  gateway: Record<string, unknown>;
  stack: { backendPid: number | null; jarSha256: string | null; runnerPid: number | null; runnerFrozenDir: string | null; bound: boolean; rehearsal: boolean };
  outDir: string;
  repoRoot: string;
  proxyConfigured: boolean;
}

export interface RunBundle {
  scanDataDigest?: string;
  nextdayDataDigest?: string;
  hnPreflight?: boolean;
  hnAmendment?: HnAmendment;
  scanFile?: ScanFile;
  scanNextdayFile?: ScanFile;
  scanHistory?: ScanFile[];
  anchor?: SameDayAnchor;
  sameDayDigest?: string;
  regionAudit?: RegionAudit;
  freeze?: FreezeCheckpoint[];
  truncations?: { total: number; verified4096: number; unknown: number };
  table: GateTable;
  runId: string;
  environment: EnvironmentRecord | null;
  preconditionsOk: boolean | null;
  /** key -> reason, from the same-day verify judgement. */
  voidKeys: Record<string, string>;
  results: Record<string, TestResult | undefined>;
  proxy: ProxySummary;
  scan: ScanSummary | null;
  scanNextday: ScanSummary | null;
  /** null means no next-day pass was run for this run id. */
  nextday: Record<string, NextDayResult | undefined> | null;
}

// ---- verify judgement ------------------------------------------------------------------------

export interface VerifyJudgement {
  /** test key -> VOID reason. */
  voidKeys: Record<string, string>;
  invalid: string | null;
  checked: number;
}

/**
 * verify.mjs --only is a PREFIX filter and the process exits 0 even when tasks fail, so the verdict
 * comes from the report JSON: every wanted id must be present, pass === true and carry one record per
 * context. Anything else makes the owning test VOID. Extra prefix matches are ignored.
 */
export function judgeVerify(report: unknown, table: GateTable): VerifyJudgement {
  const rep = report as { contexts?: unknown; total?: unknown; perTask?: unknown } | null;
  if (rep === null || typeof rep !== 'object' || typeof rep.contexts !== 'number' || typeof rep.total !== 'number' || rep.perTask === null || typeof rep.perTask !== 'object') {
    return { voidKeys: {}, invalid: 'verify.json does not parse as a verify report', checked: 0 };
  }
  if (rep.contexts < 3 || rep.total === 0) return { voidKeys: {}, invalid: `verify.json ran ${rep.contexts} contexts over ${rep.total} tasks`, checked: 0 };
  const perTask = rep.perTask as Record<string, { pass?: unknown; counts?: unknown } | undefined>;
  const voidKeys: Record<string, string> = {};
  let checked = 0;
  for (const test of table.tests) {
    const bad: string[] = [];
    for (const id of test.corpusTasks) {
      checked += 1;
      const entry = perTask[id];
      if (entry === undefined) bad.push(`${id} absent`);
      else if (entry.pass !== true) bad.push(`${id} pass:${String(entry.pass)}`);
      else if (!Array.isArray(entry.counts) || entry.counts.length !== rep.contexts) bad.push(`${id} has ${Array.isArray(entry.counts) ? entry.counts.length : 'no'} records for ${rep.contexts} contexts`);
    }
    if (bad.length > 0) voidKeys[test.key] = `ground truth no longer resolves: ${bad.join(', ')}`;
  }
  return { voidKeys, invalid: null, checked };
}

/** Same-day rule: the verify report is no older than 12 h at the first test and on the same calendar day. */
export function verifyIsSameDay(verifyDate: string, runStartIso: string): boolean {
  const verified = Date.parse(verifyDate);
  const started = Date.parse(runStartIso);
  if (Number.isNaN(verified) || Number.isNaN(started)) return false;
  const ageMs = started - verified;
  if (ageMs < 0 || ageMs > 12 * 3600_000) return false;
  const day = (ms: number): string => new Date(ms).toDateString();
  return day(verified) === day(started);
}

// ---- environment validation ------------------------------------------------------------------

export function validateEnvironment(rec: EnvironmentRecord | null, dryRunFlag: boolean): string[] {
  const problems: string[] = [];
  if (rec === null) return ['no environment record'];
  const need = (label: string, value: unknown): void => {
    if (value === null || value === undefined || value === '' || (typeof value === 'object' && Object.keys(value as object).length === 0)) problems.push(`environment lacks ${label}`);
  };
  if (!RUN_ID_RE.test(rec.runId)) problems.push(`run id ${rec.runId} does not match rg-YYYYMMDD-N or dry-YYYYMMDD-N`);
  if (isDryRunId(rec.runId) !== dryRunFlag) problems.push('run id prefix and CHECKS_GATE_DRY_RUN disagree');
  need('git.sha', rec.git.sha);
  need('git.workingTreeDigestStart', rec.git.workingTreeDigestStart);
  need('model.id', rec.model.id);
  need('hashes.contractMd', rec.hashes.contractMd);
  need('hashes.contractsV3', rec.hashes.contractsV3);
  need('hashes.promptStatic', rec.hashes.promptStatic);
  need('playwright.driver', rec.playwright.driver);
  need('playwright.runner', rec.playwright.runner);
  need('playwright.coreBundleSha256', rec.playwright.coreBundleSha256);
  need('gateway settings', rec.gateway);
  if (rec.playwright.coreBundleSha256 !== rec.playwright.pinSha256) problems.push('coreBundle.js sha256 differs from the engine pin');
  if (!isDryRunId(rec.runId)) {
    if (isInside(rec.outDir, rec.repoRoot)) problems.push('CHECKS_GATE_OUT is inside the worktree');
    if (/(^|[\\/])node_modules([\\/]|$)/.test(rec.outDir)) problems.push('CHECKS_GATE_OUT is under node_modules');
    if (!rec.stack.bound) problems.push('the answering backend/runner is not bound to the stack manifest');
    if (rec.stack.rehearsal) problems.push('the stack was launched in rehearsal mode (stale dist tolerated): not evidence');
    if (rec.model.source === 'declared' && rec.proxyConfigured) problems.push('model id is only declared although the recorder is configured');
  }
  return problems;
}

// ---- model-free replay proof -----------------------------------------------------------------

export type ProxyState = 'NOT_CONFIGURED' | 'INTERPOSED' | 'NOT_INTERPOSED' | 'INVALID';

export function sumProposals(results: Record<string, TestResult | undefined>): number {
  let total = 0;
  for (const result of Object.values(results)) {
    for (const flow of result?.flows ?? []) for (const a of flow.learnAttempts) total += a.counters?.modelProposals ?? 0;
  }
  return total;
}

export function learnRequests(results: Record<string, TestResult | undefined>): number {
  let total = 0;
  for (const result of Object.values(results)) {
    for (const flow of result?.flows ?? []) for (const a of flow.learnAttempts) total += a.gatewayRequests ?? 0;
  }
  return total;
}

/** The recorder counts only if it saw at least one request per model proposal of the learn phase. */
export function proxyState(proxy: ProxySummary, proposals: number, learnPhaseRequests: number): ProxyState {
  if (!proxy.configured) return 'NOT_CONFIGURED';
  if (proxy.bodies === 0) return 'INVALID';
  return learnPhaseRequests >= proposals ? 'INTERPOSED' : 'NOT_INTERPOSED';
}

export interface ZeroCallsVerdict {
  verdict: 'OK' | 'FAIL' | 'INCOMPLETE';
  reasons: string[];
}

export function zeroModelCalls(before: ModelCallSnapshot, after: ModelCallSnapshot, proxy: ProxyState): ZeroCallsVerdict {
  const reasons: string[] = [];
  let sufficient = false;
  let failed = false;
  const valid = (n: unknown): boolean => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (![before.attemptRows, after.attemptRows, before.proposals, after.proposals].every(valid) || before.sessionId === null || after.sessionId === null || (proxy === 'INTERPOSED' && ![before.proxy, after.proxy].every(valid))) return { verdict: 'INCOMPLETE', reasons: ['missing or invalid coherent model counters/session identity'] };
  if (proxy === 'INTERPOSED' && before.proxy !== null && after.proxy !== null) {
    sufficient = true;
    if (after.proxy !== before.proxy) {
      failed = true;
      reasons.push(`gateway requests ${before.proxy} -> ${after.proxy}`);
    }
  }
  if (before.attemptRows !== null && after.attemptRows !== null) {
    sufficient = true;
    if (after.attemptRows !== before.attemptRows) {
      failed = true;
      reasons.push(`model-attempt rows ${before.attemptRows} -> ${after.attemptRows}`);
    }
  }
  if (before.sessionId !== after.sessionId) {
    failed = true;
    reasons.push('latest guided session changed during a replay');
  }
  if (before.proposals !== null && after.proposals !== null && before.proposals !== after.proposals) {
    failed = true;
    reasons.push(`session modelProposals ${before.proposals} -> ${after.proposals}`);
  }
  if (failed) return { verdict: 'FAIL', reasons };
  if (!sufficient) return { verdict: 'INCOMPLETE', reasons: ['neither an interposed recorder nor attempt rows could prove zero gateway calls'] };
  return { verdict: 'OK', reasons: [] };
}

// ---- controls --------------------------------------------------------------------------------

export interface ControlVerdict {
  expectationMet: boolean;
  falsePass: boolean;
  reasons: string[];
}

const lastAttempt = (flow: FlowResult): LearnAttemptRecord | null => flow.learnAttempts[flow.learnAttempts.length - 1] ?? null;
const clarified = (flow: FlowResult): boolean => flow.learnAttempts.some((a) => a.clarifications.length > 0);

export function evaluateControl(key: string, flow: FlowResult | undefined): ControlVerdict {
  const reasons: string[] = [];
  if (flow === undefined) return { expectationMet: false, falsePass: false, reasons: ['no result'] };
  const a = lastAttempt(flow);
  if (a === null) return { expectationMet: false, falsePass: false, reasons: ['no learn attempt recorded'] };
  if (flow.learnAttempts.some((attempt) => attempt.ledger === null || attempt.ledger.length === 0)) return { expectationMet: false, falsePass: false, reasons: ['no action-ledger rows could be read'] };
  const falsePass = flow.learnAttempts.some((attempt) => attempt.state === 'SUCCEEDED' || attempt.receipt) || flow.learned || flow.afterLearnExecutions > 0 || flow.learnedChip || flow.proof !== null || flow.replays.length > 0 || flow.publication !== undefined;
  if (falsePass) reasons.push('control published, learned or replayed: false pass');
  let met = false;
  if (key === 'N1') {
    met = a.errorCode === 'TARGET_MISMATCH' && a.state === 'FAILED' && a.failedStepIndex === 1 && !clarified(flow);
    if (!met) reasons.push(`N1 expected TARGET_MISMATCH, got ${String(a.errorCode)} (${String(a.state)})`);
    if (flow.learnAttempts.some((attempt) => (attempt.ledger ?? []).some((r) => r.dispatched === 1 && r.kind !== 'navigate'))) {
      met = false;
      reasons.push('N1 dispatched a selectOption');
    }
  } else if (key === 'N2') {
    met = a.state === 'FAILED' && (a.errorCode === 'ASSERTION_FAILED' || a.errorCode === 'UNSUPPORTED_SURFACE');
    if (!met) reasons.push(`N2 expected ASSERTION_FAILED or UNSUPPORTED_SURFACE, got ${String(a.errorCode)} (${String(a.state)})`);
  } else if (key === 'N3') {
    met = clarified(flow) || a.state === 'FAILED';
    if (!met) reasons.push(`N3 expected a clarification or refusal, got ${String(a.state)}`);
    if (flow.learnAttempts.some((attempt) => (attempt.ledger ?? []).some((r) => r.dispatched === 1 && r.kind !== 'navigate'))) {
      met = false;
      reasons.push('N3 dispatched a click');
    }
  } else {
    reasons.push(`no control rule for ${key}`);
  }
  if (flow.learnAttempts.some((attempt) => (attempt.ledger ?? []).some((r) => r.dispatched === 1 && !['navigate','assert'].includes(r.kind)))) { met = false; reasons.push('control dispatched a wrong-target action in an attempt'); }
  if(flow.error!==null){met=false;reasons.push('control flow has an incomplete/error outcome');}
  return { expectationMet: met && !falsePass, falsePass, reasons };
}

// ---- metrics ---------------------------------------------------------------------------------

export function nearestRank(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

export interface Metrics {
  admitted: { applied: number; rejected: number; rate: number | null };
  rejectionsByReason: Record<string, number>;
  /** Persisted diagnostics Gate of each refused attempt (WI-3 column rejection_gate). */
  rejectionsByGate: Record<string, number>;
  /** Which intent-gate path admitted each applied attempt (EXACT_NAME, EVIDENCE_SUBSET, SELECTED_CHOICE). */
  intentPaths: Record<string, number>;
  modelTime: { n: number; p50: number | null; p95: number | null; source: 'wire' | 'attempt-rows' | 'none' };
  stepsLearned: { learned: number; authored: number; rate: number | null };
  perTest: { key: string; flow: string; learnSeconds: number[]; proofSeconds: number | null; replaySeconds: number[]; modelCalls: number; inputTokens: number; outputTokens: number; clarifications: number }[];
}

export function computeMetrics(bundle: RunBundle): Metrics {
  let applied = 0;
  let rejected = 0;
  const reasons: Record<string, number> = {};
  const gates: Record<string, number> = {};
  const paths: Record<string, number> = {};
  const rowDurations: number[] = [];
  let learned = 0;
  let authored = 0;
  const perTest: Metrics['perTest'] = [];
  for (const test of bundle.table.tests) {
    const result = bundle.results[test.key];
    if (result === undefined) continue;
    for (const flow of result.flows) {
      let calls = 0;
      let inTok = 0;
      let outTok = 0;
      let clar = 0;
      for (const att of flow.learnAttempts) {
        calls += att.counters?.modelProposals ?? 0;
        inTok += att.counters?.modelInputTokens ?? 0;
        outTok += att.counters?.modelOutputTokens ?? 0;
        clar += att.clarifications.length;
        for (const row of att.attempts ?? []) {
          if (row.status === 'APPLIED') {
            applied += 1;
            if (row.intentPath !== null) paths[row.intentPath] = (paths[row.intentPath] ?? 0) + 1;
          }
          if (row.status === 'REJECTED') {
            rejected += 1;
            const reason = row.rejectionReason ?? 'UNRECORDED';
            reasons[reason] = (reasons[reason] ?? 0) + 1;
            const gate = row.rejectionGate ?? 'UNRECORDED';
            gates[gate] = (gates[gate] ?? 0) + 1;
          }
          const d = attemptDurationMs(row);
          if (Number.isFinite(d) && d >= 0) rowDurations.push(d);
        }
      }
      if (test.kind === 'positive') {
        authored += (test.steps ?? []).length;
        if (flow.learned) learned += (test.steps ?? []).length;
      }
      perTest.push({
        key: test.key,
        flow: flow.flowId,
        learnSeconds: flow.learnAttempts.map((a) => a.seconds),
        proofSeconds: flow.proof?.durationMs === null || flow.proof === null ? null : Math.round((flow.proof.durationMs ?? 0) / 1000),
        replaySeconds: flow.replays.map((r) => r.seconds),
        modelCalls: calls,
        inputTokens: inTok,
        outputTokens: outTok,
        clarifications: clar,
      });
    }
  }
  const wire = bundle.proxy.durationsMs;
  const times = wire.length > 0 ? wire : rowDurations;
  const source: Metrics['modelTime']['source'] = wire.length > 0 ? 'wire' : rowDurations.length > 0 ? 'attempt-rows' : 'none';
  const total = applied + rejected;
  return {
    admitted: { applied, rejected, rate: total === 0 ? null : applied / total },
    rejectionsByReason: reasons,
    rejectionsByGate: gates,
    intentPaths: paths,
    modelTime: { n: times.length, p50: nearestRank(times, 50), p95: nearestRank(times, 95), source },
    stepsLearned: { learned, authored, rate: authored === 0 ? null : learned / authored },
    perTest,
  };
}

// ---- rules -----------------------------------------------------------------------------------

function worst(verdicts: Verdict[]): Verdict {
  for (const v of ['FAIL', 'INVALID', 'INCOMPLETE', 'PENDING_NEXT_DAY'] as const) if (verdicts.includes(v)) return v;
  return 'PASS';
}


interface KeyFinding {
  rule: 1 | 2 | 3;
  verdict: Verdict;
  reason: string;
}

/** Rules 1-3 for one positive test; the run-level rules aggregate these, the spec asserts them per test. */
export function positiveFindings(key: string, result: TestResult | undefined, voided: string | null, proxy: ProxyState, flowId = 'main'): KeyFinding[] {
  const out: KeyFinding[] = [];
  const flow = result?.flows.find((f) => f.flowId === flowId);
  if (voided !== null) return [{ rule: 1, verdict: 'INCOMPLETE', reason: `${key}: VOID (${voided}); needs @architect approval for a replacement` }];
  if (result === undefined || flow === undefined) return [{ rule: 1, verdict: 'FAIL', reason: `${key}: no result recorded` }];
  if (flow.error !== null || flow.detailOk !== true) out.push({rule: 3, verdict: 'FAIL', reason: `${key}: flow error or missing detail receipt`});
  const attempts = flow.learnAttempts;
  const classes = attempts.map((a) => a.cls);
  const infraBeforeLast = classes.slice(0, -1).every((c) => c === 'INFRA');
  const clar = attempts.reduce((n, a) => n + a.clarifications.length, 0);
  if (attempts.some((attempt) => attempt.timingFailure != null || attempt.subClass === 'TIMEOUT' || attempt.subClass === 'STEP_LEARNING_TIMEOUT')) out.push({ rule: 1, verdict: 'FAIL', reason: `${key}: terminal learning timeout cannot be retried or replaced by late success` });
  if (flow.publication === undefined) out.push({ rule: 1, verdict: 'INCOMPLETE', reason: `${key}: UNKNOWN per-step learning identity` });
  else for (const reason of learningTimingProblems(flow.learningTiming, { runId: result.runId, testId: flow.testId, sourceRevision: flow.publication.sourceRevision, configurationRevision: flow.publication.configurationRevision, stepIds: flow.publication.stepIds, sessionId: attempts.at(-1)?.sessionId ?? null })) out.push({ rule: 1, verdict: reason.startsWith('UNKNOWN') ? 'INCOMPLETE' : 'FAIL', reason: `${key}: ${reason}` });
  if (attempts.length === 0 || attempts.length > 2 || !infraBeforeLast) {
    out.push({ rule: 1, verdict: 'FAIL', reason: `${key}: attempts ${classes.join('>') || 'none'} are not a single optional infra retry` });
  } else if (classes[classes.length - 1] !== 'OK' || !flow.learned || attempts[attempts.length-1]?.state!=='SUCCEEDED' || attempts[attempts.length-1]?.errorCode!==null || attempts[attempts.length-1]?.sessionId===null || attempts[attempts.length-1]?.counters===null) {
    const a = attempts[attempts.length - 1];
    out.push({ rule: 1, verdict: 'FAIL', reason: `${key}: not learned (${a?.cls ?? '?'} ${a?.errorCode ?? a?.state ?? ''})` });
  } else if (clar > 0) {
    out.push({ rule: 1, verdict: 'FAIL', reason: `${key}: ${clar} clarification(s) on a positive test` });
  } else if (!attempts[attempts.length - 1]?.receipt) {
    out.push({ rule: 1, verdict: 'FAIL', reason: `${key}: no 'Completed — learned from this run.' receipt` });
  }
  const p = flow.proof;
  if (p !== null) for (const reason of executionFindings(p.executionId, p.lineage, flow.publication)) out.push({rule: 2, verdict: reason.startsWith('UNKNOWN') ? 'INCOMPLETE' : 'FAIL', reason: `${key}: ${reason}`});
  const ids = [p?.executionId, ...flow.replays.map((r) => r.executionId)];
  if (new Set(ids).size !== ids.length) out.push({rule: 3, verdict: 'FAIL', reason: `${key}: duplicate proof/manual execution ID`});
  if (!flow.learned || p === null) out.push({ rule: 2, verdict: 'FAIL', reason: `${key}: no proof replay` });
  else if (p.status !== 'PASSED' || p.triggerSource !== 'AFTER_LEARN' || p.videoStatus !== 'AVAILABLE') {
    out.push({ rule: 2, verdict: 'FAIL', reason: `${key}: proof ${p.status}/${p.triggerSource}/video ${p.videoStatus}` });
  }
  if (!flow.learned || flow.replays.length !== 2) {
    out.push({ rule: 3, verdict: 'FAIL', reason: `${key}: expected two manual replays, found ${flow.replays.length}` });
  } else {
    for (const [i, r] of flow.replays.entries()) {
      for (const reason of executionFindings(r.executionId, r.lineage, flow.publication)) out.push({rule: 3, verdict: reason.startsWith('UNKNOWN') ? 'INCOMPLETE' : 'FAIL', reason: `${key}: ${reason}`});
      if (cleanManualFindings(r).length>0) {
        out.push({ rule: 3, verdict: 'FAIL', reason: `${key}: replay ${i + 1} ${r.status}/${r.triggerSource}${r.replayFailureCode === null ? '' : `/${r.replayFailureCode}`}${r.uiReceipt ? '' : ' without the UI receipt'}` });
        continue;
      }
      const zero = zeroModelCalls(r.before, r.after, proxy);
      if (zero.verdict === 'FAIL') out.push({ rule: 3, verdict: 'FAIL', reason: `${key}: replay ${i + 1}: ${zero.reasons.join('; ')}` });
      if (zero.verdict === 'INCOMPLETE') out.push({ rule: 3, verdict: 'INCOMPLETE', reason: `${key}: replay ${i + 1}: ${zero.reasons.join('; ')}` });
    }
  }
  return out;
}

function ruleFrom(bundle: RunBundle, rule: 1 | 2 | 3, name: string, proxy: ProxyState): RuleResult {
  const findings: KeyFinding[] = [];
  for (const c of requiredLifecycleCases(bundle.table)) {
    const result = bundle.results[c.test.key];
    const voided = bundle.voidKeys[c.test.key] ?? null;
    const flow=result?.flows.find((f)=>f.flowId===c.flow.id);
    if(rule===1 && (flow?.publication?.authoredStepsHash!==sha256Hex(JSON.stringify(c.flow.steps)) || flow.publication.stepIds.length!==c.flow.steps.length))findings.push({rule:1,verdict:'INCOMPLETE',reason:`${c.key}: UNKNOWN exact authored source/step identity`});
    if(rule===1 && flow?.learningTiming!==undefined && flow.learningTiming.runId!==bundle.runId)findings.push({rule:1,verdict:'INCOMPLETE',reason:`${c.key}: UNKNOWN crossed learning timing run`});
    findings.push(...positiveFindings(c.key, result, voided, proxy, c.flow.id).filter((f) => f.rule === rule));
  }
  return { rule, name, verdict: worst(findings.map((f) => f.verdict)), reasons: findings.map((f) => f.reason) };
}

function rule5(bundle: RunBundle): RuleResult {
  const reasons: string[] = [];
  const verdicts: Verdict[] = [];
  for (const test of bundle.table.tests.filter((t) => t.kind === 'control')) {
    const v = evaluateControl(test.key, bundle.results[test.key]?.flows[0]);
    if (v.falsePass) verdicts.push('FAIL');
    if (!v.expectationMet) verdicts.push('FAIL');
    for (const r of v.reasons) reasons.push(`${test.key}: ${r}`);
  }
  const scan = bundle.scan;
  if (scan === null) {
    verdicts.push('INCOMPLETE');
    reasons.push('scan missing');
  } else {
    const envelope = bundle.scanFile;
    const envelopeProblems = validateScanEnvelope(envelope, bundle.runId, false, bundle.scanDataDigest);
    if (envelopeProblems.length) { verdicts.push('INCOMPLETE'); reasons.push(...envelopeProblems); }
    const verdict = scanVerdict(scan, requiredScanSources(false, envelope?.diagnosticsIncluded === true));
    if (verdict.verdict === 'FAIL') verdicts.push('FAIL');
    for (const reason of verdict.reasons) reasons.push(`scan: ${reason}`);
  }
  if ((bundle.scanHistory ?? []).some((s) => s.scan.hits.length > 0 || s.scan.leak !== 0 || s.scan.pageOrigin !== 0 || (s.authoritative === true && !s.nextday && scanVerdict(s.scan).verdict !== 'PASS'))) { verdicts.push('FAIL'); reasons.push('a preserved earlier scan failed; new run required'); }
  return { rule: 5, name: 'Controls and leak scan', verdict: worst(verdicts), reasons };
}

function rule6(metrics: Metrics): RuleResult {
  const reasons: string[] = [];
  if (metrics.admitted.rate === null) reasons.push('product-admitted rate has denominator 0 (no model-attempt rows)');
  if (metrics.modelTime.p50 === null) reasons.push('model-time percentiles have no samples');
  if (metrics.stepsLearned.rate === null) reasons.push('steps-learned rate has denominator 0');
  return { rule: 6, name: 'Reported metrics', verdict: reasons.length === 0 ? 'PASS' : 'INCOMPLETE', reasons };
}

export interface RunEvaluation {
  runId: string;
  verdict: Verdict;
  rules: RuleResult[];
  invalid: string[];
  proxyState: ProxyState;
  metrics: Metrics;
  voided: string[];
}

export function evaluateRun(bundle: RunBundle, phase: 'release' | 'same-day' = 'release'): RunEvaluation {
  const invalid: string[] = [];
  const env = bundle.environment;
  if (isDryRunId(bundle.runId)) invalid.push('a dry run is not evidence');
  if (env === null) invalid.push('no environment record');
  if (bundle.preconditionsOk !== true) invalid.push('the precondition test did not pass');
  if (env !== null && !isDryRunId(bundle.runId)) {
    if (env.git.workingTreeDigestEnd === null && !(bundle.freeze ?? []).some((c)=>c.phase==='initial')) invalid.push('no end-of-run working-tree digest (run gate-cli collect)');
    else if (env.git.workingTreeDigestEnd !== null && env.git.workingTreeDigestEnd !== env.git.workingTreeDigestStart) invalid.push('the working tree changed during the run');
  }
  const proposals = sumProposals(bundle.results);
  const state = proxyState(bundle.proxy, proposals, learnRequests(bundle.results));
  if (state === 'INVALID') invalid.push('the recorder is configured but recorded zero bodies');
  const expectedCases = requiredLifecycleCases(bundle.table);
  const expectedKeys = bundle.table.tests.map((t) => t.key);
  if (Object.keys(bundle.results).some((k) => !expectedKeys.includes(k))) invalid.push('extra result key');
  for (const test of bundle.table.tests) {
    const result = bundle.results[test.key];
    if (result !== undefined && (result.key !== test.key || result.kind !== test.kind || result.flows.map((f) => f.flowId).sort().join() !== flowsOf(test).map((f) => f.id).sort().join())) invalid.push('result identity/flow mismatch');
  }
  const tests=expectedCases.flatMap((c)=>{const f=bundle.results[c.test.key]?.flows.find((x)=>x.flowId===c.flow.id);return f?.testId===null||f?.testId===undefined?[]:[f.testId];});
  const executions=expectedCases.flatMap((c)=>{const f=bundle.results[c.test.key]?.flows.find((x)=>x.flowId===c.flow.id);return [...(f?.proof===null||f?.proof===undefined?[]:[f.proof.executionId]),...(f?.replays.map((r)=>r.executionId)??[])];});
  if(new Set(tests).size!==tests.length||new Set(executions).size!==executions.length)invalid.push('duplicate test or execution identity across required lifecycles');
  const metrics = computeMetrics(bundle);
  const rules = [ruleFrom(bundle, 1, 'Learn', state), ruleFrom(bundle, 2, 'Proof', state), ruleFrom(bundle, 3, 'Re-runs', state), rule5(bundle), rule6(metrics)];
  const readiness: string[] = [];
  if(bundle.hnPreflight!==true)readiness.push('UNKNOWN frozen same-day HN3 public capture');
  readiness.push(...freezeProblems((bundle.freeze ?? []).filter((checkpoint) => checkpoint.phase === 'start' || checkpoint.phase === 'initial'), false));
  readiness.push(...regionFindings(bundle.regionAudit, env?.startedAt ?? ''));
  if (bundle.truncations === undefined || bundle.truncations.total < 1 || bundle.truncations.unknown !== 0) readiness.push('UNKNOWN4096 truncation metadata coverage');
  if (phase === 'release') readiness.push(...anchorProblems(bundle.anchor,bundle.runId,bundle.sameDayDigest ?? '',env?.git.workingTreeDigestStart ?? '',expectedCases.map((c) => c.key)));
  if (readiness.length) rules.push({rule:7,name:'Evidence completeness and whole-suite anchor',verdict:readiness.some((p) => p.includes('MISMATCH') || p.includes('WRONG_REGION')) ? 'FAIL':'INCOMPLETE',reasons:readiness});
  const voided = Object.keys(bundle.voidKeys);
  let verdict: Verdict;
  if (invalid.length > 0) verdict = 'INVALID';
  else verdict = worst(rules.map((r) => r.verdict));
  return { runId: bundle.runId, verdict, rules, invalid, proxyState: state, metrics, voided };
}

/** 0 PASS, 1 FAIL, 2 INVALID or INCOMPLETE, 3 PENDING_NEXT_DAY. */
export function exitCodeFor(verdict: Verdict): number {
  switch (verdict) {
    case 'PASS':
      return 0;
    case 'FAIL':
      return 1;
    case 'PENDING_NEXT_DAY':
      return 3;
    default:
      return 2;
  }
}

// ---- dry-run scan gate -------------------------------------------------------------------------

/** Scan and provenance. The exercised map is retained only for historical artifact readability. */
export interface ScanFile {
  rawSnapshot?: {directory:string;manifest:import('./collection.ts').RawManifest};
  diagnosticsIncluded?: boolean;
  dataDigest?: string;
  authoritative?: boolean;
  runId: string;
  generatedAt: string;
  nextday: boolean;
  exercised: Record<string, boolean>;
  scan: ScanSummary;
}

/** The first rg- run requires a clean authoritative scan from the previous 24 hours. */
export function validateDryRunScan(file: ScanFile | null, nowIso: string): string[] {
  if (file === null) return ['no dry-run scan (set CHECKS_GATE_DRYRUN_SCAN to the scan.json of a clean dry- run)'];
  const problems: string[] = [];
  if (!file.runId.startsWith('dry-')) problems.push(`the dry-run scan belongs to ${file.runId}, not a dry- run (a rehearsal- scan does not count)`);
  if (file.scan.canaries.length === 0) problems.push('the dry-run scan has no declared canaries');
  problems.push(...validateScanEnvelope(file, file.runId, false));
  if (file.scan.leak !== 0) problems.push(`the dry-run scan has ${file.scan.leak} LEAK hit(s)`);
  const age = Date.parse(nowIso) - Date.parse(file.generatedAt);
  if (Number.isNaN(age) || age < 0 || age > 24 * 3600_000) problems.push('the dry-run scan is older than 24 h');
  if (scanVerdict(file.scan).verdict !== 'PASS') problems.push(`the dry-run scan does not pass: ${scanVerdict(file.scan).reasons.join('; ')}`);
  return problems;
}

/** Envelope identity is retained at every boundary, including dry-run admission. */
export function validateScanEnvelope(file: ScanFile | undefined, runId: string, nextday: boolean, expectedDataDigest?:string): string[] {
  if (file === undefined) return ['missing authoritative scan envelope'];
  const reasons: string[] = [];
  if(file.rawSnapshot===undefined||!/^scan-attempts\/(initial|nextday)-[a-f0-9-]+$/.test(file.rawSnapshot.directory)||!file.rawSnapshot.directory.startsWith(`scan-attempts/${nextday?'nextday':'initial'}-`)||!/^[a-f0-9]{64}$/.test(file.rawSnapshot.manifest.digest))reasons.push('immutable raw scan snapshot missing or crossed');
  if(!/^[a-f0-9]{64}$/.test(file.dataDigest ?? '') || (expectedDataDigest!==undefined&&file.dataDigest!==expectedDataDigest))reasons.push('scan is not bound to current counted records');
  if (file.authoritative !== true) reasons.push('scan is not post-collection authoritative');
  if (file.runId !== runId || file.nextday !== nextday || instant(file.generatedAt) === null) reasons.push('scan run/stage/timestamp identity mismatch');
  return reasons;
}
