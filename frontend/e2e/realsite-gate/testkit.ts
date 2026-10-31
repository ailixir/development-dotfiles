/** Synthetic run data shared by the evaluate and report tests. Not a test file. */
import { anchorHash } from './anchor.ts';
import type { RuntimeFreeze } from './freeze.ts';
import { requiredScanSources } from './leakscan.ts';
import { loadTable, positivesOf, requiredLifecycleCases,sha256Hex } from './common.ts';
import type { EnvironmentRecord, FlowResult, LearnAttemptRecord, ModelCallSnapshot, NextDayResult, ReplayRecord, RunBundle, TestResult } from './evaluate.ts';
import type { ScanSummary } from './leakscan.ts';
import type { AttemptReceipt, LedgerRow, LearningTiming, StepReceipt, StepReceiptRow } from './status.ts';
import { newLearningTiming, recordLearningReceipt } from './status.ts';

export const table = loadTable();
export const row = (over: Partial<LedgerRow>): LedgerRow => ({ stepId: 's', ordinal: 0, attemptOrdinal: 0, state: 'SUCCEEDED', dispatched: 1, outcome: 'OK', ...over });
export const stepReceipt = (over: Partial<StepReceipt> = {}): StepReceipt => ({ closedCode: null, stepHash: 'a'.repeat(64), fenceCrossed: false, effects: [], effectsTruncated: false, offscreen: false, ...over });
export const gotoReceipt = (): StepReceipt => stepReceipt({ fenceCrossed: true, effects: [{ method: 'goto', completed: true }] });
/** A ledger row and its receipt entry, as learningReceipts joins them. A null receipt is an undispatched row. */
export interface Step { row: LedgerRow; entry: AttemptReceipt }
/** SC008 ledger shape: every step is ordinal 0 / attempt_ordinal 0; steps differ only by step id (`step-<index>`). */
export const stepIdOf = (index: number): string => `step-${index}`;
export const dispatched = (index: number, receipt: StepReceipt | null, over: Partial<LedgerRow> = {}): Step => ({
  row: row({ stepId: stepIdOf(index), state: receipt === null || receipt.closedCode !== null ? 'FAILED' : 'SUCCEEDED', outcome: receipt?.closedCode ?? 'OK', ...over }),
  entry: { stepId: over.stepId ?? stepIdOf(index), ordinal: over.ordinal ?? 0, attemptOrdinal: over.attemptOrdinal ?? 0, dispatchCount: 1, receipt },
});
export const refused = (index: number): Step => ({ row: row({ stepId: stepIdOf(index), state: 'ADMITTED', dispatched: 0, outcome: null }), entry: { stepId: stepIdOf(index), ordinal: 0, attemptOrdinal: 0, dispatchCount: 0, receipt: null } });
export const navStep = (): Step => dispatched(0, gotoReceipt());
export const proofRows = (revisionId: string, count: number, proofExecutionId: string): StepReceiptRow[] => Array.from({ length: count }, (_, i) => ({ revisionId, stepOrdinal: i, proofExecutionId, status: 'PASSED' as const, stepHash: 'a'.repeat(64), receipt: stepReceipt() }));
export const snap = (over: Partial<ModelCallSnapshot> = {}): ModelCallSnapshot => ({ proxy: 10, attemptRows: 6, sessionId: 'sess', proposals: 3, ...over });
export const replay = (over: Partial<ReplayRecord> = {}): ReplayRecord => ({
  lineage:{testId:'t',revisionId:'r',acceptedAt:'2026-10-27T12:07:00Z',startedAt:'2026-10-27T12:07:01Z',endedAt:'2026-10-27T12:07:20Z',errorCode:null,beforeExecutionIds:['p'],passedStepIds:['s','s2','password']},
  executionId: 'e', status: 'PASSED', triggerSource: 'MANUAL', replayFailureCode: null, uiReceipt: true, learnedChip: true, seconds: 20, stepResults: 6, before: snap(), after: snap(), ...over,
});
export const attempt = (over: Partial<LearnAttemptRecord> = {}): LearnAttemptRecord => ({
  failedStepIndex:1, attempt: 1, cls: 'OK', subClass: null, sessionId: 'sess', state: 'SUCCEEDED', errorCode: null, seconds: 90, receipt: true, clarifications: [],
  counters: { modelProposals: 3, modelInputTokens: 30000, modelOutputTokens: 1500, observations: 4, actions: 4 },
  attempts: [
    { kind: 'SOURCE_PLAN', attemptNumber: 1, status: 'APPLIED', rejectionReason: null, rejectionGate: null, inputTokens: 9000, outputTokens: 400, createdAt: '2026-10-27T12:00:00Z', updatedAt: '2026-10-27T12:00:08Z' },
    { kind: 'STEP_CODE', attemptNumber: 1, status: 'REJECTED', rejectionReason: 'INVALID_CONTRACT', rejectionGate: 'STEP_SYNTAX', inputTokens: null, outputTokens: null, createdAt: '2026-10-27T12:00:10Z', updatedAt: '2026-10-27T12:00:14Z' },
  ],
  ledger: [navStep().row], receipts: [navStep().entry], stepIds: [stepIdOf(0), stepIdOf(1), stepIdOf(2)], gatewayRequests: 4, ...over,
});
export const timing = (over: Partial<LearningTiming> = {}): LearningTiming => {
  const value = newLearningTiming('rg-20261027-1', 't', 'fixture-clock');
  const progress = { runId: value.runId, clockId: value.clockId, sessionId: 'sess', testId: 't', sourceRevision: '1', configurationRevision: '1', stepIds: ['s', 's2', 'password'], attempt: 1 };
  recordLearningReceipt(value, { ...progress, state: 'PREPARING', stepIndex: 0, requestStartMs: 1000, responseEndMs: 1100 });
  recordLearningReceipt(value, { ...progress, state: 'SUCCEEDED', stepIndex: 3, requestStartMs: 89_000, responseEndMs: 90_000 });
  return { ...value, ...over };
};
export const flow = (over: Partial<FlowResult> = {}): FlowResult => ({
  learningTiming: timing(),
  publication:{testId:'t',revisionId:'r',sourceRevision:1,configurationRevision:1,learnedCompletedAt:'2026-10-27T12:05:00Z',stepIds:['s','s2','password']},
  flowId: 'main', testId: 't', name: 'n', learnAttempts: [attempt()], learned: true, learnedAt: '2026-10-27T12:05:00Z',
  proof: { lineage:{testId:'t',revisionId:'r',acceptedAt:'2026-10-27T12:06:00Z',startedAt:'2026-10-27T12:06:01Z',endedAt:'2026-10-27T12:06:05Z',errorCode:null,beforeExecutionIds:[],passedStepIds:['s','s2','password']}, executionId: 'p', status: 'PASSED', triggerSource: 'AFTER_LEARN', videoStatus: 'AVAILABLE', durationMs: 5000 },
  replays: [replay({executionId:'e1'}), replay({executionId:'e2'})], detailOk: true, afterLearnExecutions: 1, learnedChip: true, error: null, ...over,
});
/** Learned and confirmed: the pointers and the per-step proof rows a promoted revision leaves behind. */
export const confirm = (f: FlowResult): void => {
  if (f.publication === undefined || f.proof === null) return;
  f.headAtLearn = { candidate: f.publication.revisionId, confirmed: null };
  f.headAfterProof = { candidate: null, confirmed: f.publication.revisionId };
  f.proofReceipts = proofRows(f.publication.revisionId, f.publication.stepIds.length, f.proof.executionId);
};
export const result = (key: string, kind: TestResult['kind'], flows: FlowResult[]): TestResult => {
  const test=table.tests.find((t)=>t.key===key);
  for(const f of flows){const authored=test?.flows?.find((a)=>a.id===f.flowId)?.steps ?? test?.steps;
    if(f.publication!==undefined&&authored!==undefined){
      const original=f.publication.stepIds;
      f.publication.authoredStepsHash=sha256Hex(JSON.stringify(authored));
      const ids=authored.map((_,i)=>original[i] ?? `step-${i}`);f.publication.stepIds=ids;
      if(f.learningTiming!==undefined)for(const receipt of f.learningTiming.receipts){if(JSON.stringify(receipt.stepIds)===JSON.stringify(original)){receipt.stepIds=[...ids];if(receipt.stepIndex===original.length)receipt.stepIndex=ids.length;}}
      for(const execution of [f.proof,...f.replays])if(execution?.lineage!==undefined&&original.every((id)=>execution.lineage!.passedStepIds.includes(id)))execution.lineage.passedStepIds=[...ids];
    }
    if (f.headAfterProof === undefined && f.proofReceipts === undefined) confirm(f);
  }
  return {key,kind,status:'RAN',voidReason:null,flows,startedAt:'2026-10-27T12:00:00Z',endedAt:'2026-10-27T12:09:00Z'};
};
/** A control that learned nothing: the steps its last attempt dispatched or refused, and unset head pointers. */
export const control = (code: string, state: string, steps: Step[], over: Partial<FlowResult> = {}): FlowResult =>
  flow({ publication:undefined, learned: false, learnedAt: null, proof: null, replays: [], detailOk: null, afterLearnExecutions: 0, learnedChip: false, headAtLearn: { candidate: null, confirmed: null }, learnAttempts: [attempt({ cls: 'GROUNDING', state, errorCode: code, receipt: false, ledger: steps.map((s) => s.row), receipts: steps.map((s) => s.entry) })], ...over });
export const cleanScan = (nextday=false): ScanSummary => ({
  originalUi:{snapshots:1,bytes:1,missing:0},
  canaries: [{ label: 'GATE_CANARY', cls: 'SECRET', length: 41, sha6: 'bbbbbb' }],
  formsPerCanary:{GATE_CANARY:3},sources:requiredScanSources(nextday,false).map((name)=>({name,digest:'a'.repeat(64),present:true,files:1,bytes:1,opaqueFiles:0,opaqueBytes:0})),filesScanned:requiredScanSources(nextday,false).length,bytesScanned:requiredScanSources(nextday,false).length,opaqueBytes:0,
  hits: [], leak: 0, pageOrigin: 0, pageTextChars: 1000, db: { tables: 70, rows: 100, bytes: 10 }, gatewayBodies: 20,
});
export const env = (over: Partial<EnvironmentRecord> = {}): EnvironmentRecord => ({
  runId: 'rg-20261027-1', dryRun: false, startedAt: '2026-10-27T12:00:00Z',
  git: { sha: 'abc', dirty: true, workingTreeDigestStart: 'd1', workingTreeDigestEnd: 'd1' },
  model: { id: 'gemini-3.8-flash', source: 'wire', wireIds: ['gemini-3.8-flash'] },
  hashes: { contractMd: 'h1', contractsV3: 'h2', promptStatic: 'h3', playwrightReferenceHash: 'c'.repeat(64), wireSystemInstruction: ['h4'] },
  playwright: { driver: '1.63.0', runner: '1.63.0', coreBundleSha256: 'x', pinSha256: 'x', chromiumBuild: '1243' },
  gateway: { provider: 'vertex' }, stack: { backendPid: 1, jarSha256: 's', runnerPid: 2, runnerFrozenDir: '/f', bound: true, rehearsal: false },
  outDir: '/var/gate-out', repoRoot: '/repo', proxyConfigured: true, ...over,
});

export function goodBundle(withNextDay = false): RunBundle {
  const results: Record<string, TestResult | undefined> = {};
  for (const t of positivesOf(table)) results[t.key] = result(t.key, 'positive', [flow()]);
  results.N1 = result('N1', 'control', [control('TARGET_DRIFT', 'FAILED', [navStep(), dispatched(1, stepReceipt({ closedCode: 'TARGET_DRIFT' }))])]);
  results.N2 = result('N2', 'control', [control('ASSERTION_FAILED', 'FAILED', [navStep(), dispatched(1, stepReceipt({ closedCode: 'ASSERTION_FAILED' }))])]);
  results.N3 = result('N3', 'control', [control('INVALID_CONTRACT', 'FAILED', [navStep(), refused(1)])]);
  const nextday: Record<string, NextDayResult | undefined> = {};
  for (const t of requiredLifecycleCases(table)) nextday[t.key] = { key: t.key, status: 'PASSED', reason: null, hoursSinceLearn: 25, replay: replay({executionId:'next',lineage:{...replay().lineage!,acceptedAt:'2026-10-28T15:00:00Z',startedAt:'2026-10-28T15:00:01Z',endedAt:'2026-10-28T15:00:20Z'}}) };
  for(const c of requiredLifecycleCases(table)){const f=results[c.test.key]!.flows.find((f)=>f.flowId===c.flow.id)!;const key=c.key.replace('/','-');f.testId=`test-${key}`;f.publication!.testId=f.testId;f.publication!.revisionId=`revision-${key}`;if(f.learningTiming!==undefined){f.learningTiming.testId=f.testId;for(const receipt of f.learningTiming.receipts)receipt.testId=f.testId;}nextday[c.key]!.replay!.lineage!.passedStepIds=[...f.publication!.stepIds];for(const execution of [f.proof!,...f.replays,nextday[c.key]!.replay!]){execution.executionId=`${key}-${execution.executionId}`;execution.lineage!.testId=f.testId;execution.lineage!.revisionId=f.publication!.revisionId;}confirm(f);}
  const freeze:RuntimeFreeze={head:'abc',source:{entries:[],digest:'d1'},externalCore:{root:'/core',source:{entries:[],digest:'core'},artifact:{entries:[],digest:'bundle'}},nonsecretSettings:{model:'fixture'},artifactDigest:'artifact',processIdentities:[{role:'backend',pid:1,startedAt:'time'},{role:'runner',pid:2,startedAt:'time'}]};
  const anchorBody={version:1 as const,runId:'rg-20261027-1',event:'SAME_DAY_PASS' as const,occurredAt:'2026-10-27T14:00:00Z',evidenceDigest:'a'.repeat(64),sourceDigest:'d1',caseIds:requiredLifecycleCases(table).map((c)=>c.key),controllerReceiptHash:'b'.repeat(64),predicateVersion:'WI5-R2'};
  return {
    scanDataDigest:'a'.repeat(64),nextdayDataDigest:'a'.repeat(64),scanFile:{rawSnapshot:{directory:'scan-attempts/initial-a',manifest:{entries:[],digest:'a'.repeat(64)}},dataDigest:'a'.repeat(64),runId:'rg-20261027-1',generatedAt:'2026-10-27T13:00:00Z',nextday:false,authoritative:true,exercised:{},scan:cleanScan()},scanNextdayFile:withNextDay?{rawSnapshot:{directory:'scan-attempts/nextday-a',manifest:{entries:[],digest:'a'.repeat(64)}},dataDigest:'a'.repeat(64),runId:'rg-20261027-1',generatedAt:'2026-10-28T16:00:00Z',nextday:true,authoritative:true,exercised:{},scan:cleanScan(true)}:undefined,
    anchor:{...anchorBody,eventHash:anchorHash(anchorBody)},sameDayDigest:'a'.repeat(64),freeze:(withNextDay?['start','initial','pre-nextday','final'] as const:['start','initial'] as const).map((phase)=>({phase,at:'2026-10-27T12:00:00Z',freeze:structuredClone(freeze)})),
    truncations:{total:80,verified4096:0,unknown:0},
    hnPreflight:true,table, runId: 'rg-20261027-1', environment: env(), preconditionsOk: true, voidKeys: {}, results,
    proxy: { configured: true, totalRequests: 80, bodies: 80, durationsMs: [1000, 2000, 3000, 9000], modelIds: ['gemini-3.8-flash'], systemInstructionHashes: ['h4'] },
    scan: cleanScan(), scanNextday: withNextDay ? cleanScan(true) : null, nextday: withNextDay ? nextday : null,
  };
}
