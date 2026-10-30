import assert from 'node:assert/strict';
import { test } from 'node:test';
import { positivesOf } from './common.ts';
import {
  computeMetrics,
  evaluateControl,
  evaluateRun,
  exitCodeFor,
  judgeVerify,
  nearestRank,
  proxyState,
  validateDryRunScan,
  validateEnvironment,
  verifyIsSameDay,
  zeroModelCalls,
} from './evaluate.ts';
import type { EnvironmentRecord, ScanFile, RunBundle } from './evaluate.ts';
import type { LedgerRow } from './status.ts';
import { attempt, cleanScan, control, env, flow, goodBundle, replay, result, row, snap, table } from './testkit.ts';

const rule = (b: RunBundle, n: number) => evaluateRun(b).rules.find((entry) => entry.rule === n);

test('learning timing accepts120000ms, fails120001ms and requires every identity-bound step', () => {
  const exact = goodBundle(), f = exact.results.mdn!.flows[0]!;
  f.learningTiming!.receipts[1]!.responseEndMs = 120_000;
  assert.equal(rule(exact, 1)?.verdict, 'PASS');
  const over = structuredClone(exact);over.results.mdn!.flows[0]!.learningTiming!.receipts[1]!.responseEndMs = 120_001;
  assert.equal(rule(over, 1)?.verdict, 'FAIL');
  for (const mutation of ['missing', 'duplicate', 'clock', 'revision', 'step', 'negative', 'incomplete']) {
    const b = goodBundle(), flow = b.results.mdn!.flows[0]!, t = flow.learningTiming!;
    if (mutation === 'missing') flow.learningTiming = undefined;
    if (mutation === 'duplicate') t.receipts.push(structuredClone(t.receipts[1]!));
    if (mutation === 'clock') t.receipts[1]!.clockId = 'other';
    if (mutation === 'revision') t.receipts[1]!.sourceRevision = '2';
    if (mutation === 'step') t.receipts[1]!.stepIds = ['another'];
    if (mutation === 'negative') t.receipts[1]!.requestStartMs = -1;
    if (mutation === 'incomplete') t.receipts[1]!.stepIndex -= 1;
    assert.notEqual(rule(b, 1)?.verdict, 'PASS', mutation);
  }
});

test('an earlier timing failure cannot be replaced by a late OK or infra retry', () => {
  const b = goodBundle(), f = b.results.mdn!.flows[0]!;
  f.learningTiming!.failure = { code: 'STEP_LEARNING_TIMEOUT', atMs: 120_001 };
  f.learnAttempts = [attempt({ cls: 'INFRA', timingFailure: 'STEP_LEARNING_TIMEOUT' }), attempt({ attempt: 2 })];
  assert.equal(rule(b, 1)?.verdict, 'FAIL');
});

test('a complete same-day run passes without next-day or L1 evidence', () => {
  const bundle = goodBundle();
  assert.equal(bundle.nextday, null);
  assert.equal(bundle.scanNextday, null);
  assert.equal(bundle.results.L1, undefined);
  assert.deepEqual(bundle.scanFile?.exercised, {});
  const pass = evaluateRun(bundle);
  assert.equal(pass.verdict, 'PASS', JSON.stringify(pass.rules.filter((r) => r.verdict !== 'PASS')));
  assert.equal(exitCodeFor(pass.verdict), 0);
  assert.equal(pass.rules.some((r) => r.rule === 4), false);
});

test('evaluation iterates the table: a missing result for any key fails', () => {
  for (const key of [...positivesOf(table).map((t) => t.key), 'N1', 'N2', 'N3']) {
    const b = goodBundle();
    b.results[key] = undefined;
    assert.notEqual(evaluateRun(b).verdict, 'PASS', key);
  }
  const b = goodBundle();
  b.results = {};
  const e = evaluateRun(b);
  assert.equal(e.verdict, 'FAIL');
  assert.equal(exitCodeFor(e.verdict), 1);
});

test('rule 1: clarification, grounding failure, no receipt, extra attempts all fail; one infra retry passes', () => {
  const b1 = goodBundle();
  b1.results.mdn = result('mdn', 'positive', [flow({ learnAttempts: [attempt({ clarifications: [{ atSeconds: 5, question: 'q', choices: ['a'], picked: 'a' }] })] })]);
  assert.equal(rule(b1, 1)?.verdict, 'FAIL');
  const b2 = goodBundle();
  b2.results.mdn = result('mdn', 'positive', [flow({ learned: false, learnAttempts: [attempt({ cls: 'GROUNDING', errorCode: 'UNSUPPORTED_SURFACE', state: 'FAILED', receipt: false })] })]);
  assert.equal(rule(b2, 1)?.verdict, 'FAIL');
  const b3 = goodBundle();
  b3.results.mdn = result('mdn', 'positive', [flow({ learnAttempts: [attempt({ receipt: false })] })]);
  assert.equal(rule(b3, 1)?.verdict, 'FAIL');
  const b4 = goodBundle();
  b4.results.mdn = result('mdn', 'positive', [flow({ learnAttempts: [attempt({ cls: 'INFRA', errorCode: 'MODEL_UNAVAILABLE', state: 'FAILED', receipt: false }), attempt({ attempt: 2 })] })]);
  assert.equal(rule(b4, 1)?.verdict, 'PASS');
  const b5 = goodBundle();
  b5.results.mdn = result('mdn', 'positive', [flow({ learnAttempts: [attempt({ cls: 'GROUNDING' }), attempt({ attempt: 2 })] })]);
  assert.equal(rule(b5, 1)?.verdict, 'FAIL');
  const b6 = goodBundle();
  b6.results.mdn = result('mdn', 'positive', [flow({ learnAttempts: [attempt({ cls: 'INFRA' }), attempt({ cls: 'INFRA', attempt: 2 }), attempt({ attempt: 3 })] })]);
  assert.equal(rule(b6, 1)?.verdict, 'FAIL');
});

test('VOID blocks PASS (INCOMPLETE) and judgeVerify voids absent, failed and short-record ids', () => {
  const b = goodBundle();
  b.voidKeys['iana-home'] = 'ground truth no longer resolves';
  const e = evaluateRun(b);
  assert.equal(e.verdict, 'INCOMPLETE');
  assert.equal(exitCodeFor(e.verdict), 2);
  const ids = table.tests.flatMap((t) => t.corpusTasks);
  const perTask = Object.fromEntries(ids.map((id) => [id, { pass: true, counts: [[1], [1], [1]] }]));
  const base = { contexts: 3, total: ids.length, perTask };
  assert.deepEqual(judgeVerify(base, table).voidKeys, {});
  const absent = { ...base, perTask: { ...perTask } } as { perTask: Record<string, unknown> };
  delete absent.perTask['iana-nav-01'];
  assert.match(judgeVerify(absent, table).voidKeys['iana-home'] ?? '', /absent/);
  assert.match(judgeVerify({ ...base, perTask: { ...perTask, 'iana-nav-01': { pass: false, counts: [[0], [1], [1]] } } }, table).voidKeys['iana-home'] ?? '', /pass:false/);
  assert.match(judgeVerify({ ...base, perTask: { ...perTask, 'iana-nav-01': { pass: true, counts: [[1]] } } }, table).voidKeys['iana-home'] ?? '', /1 records for 3 contexts/);
  assert.notEqual(judgeVerify({ contexts: 2, total: 5, perTask }, table).invalid, null);
  assert.notEqual(judgeVerify({ contexts: 3, total: 0, perTask }, table).invalid, null);
  assert.notEqual(judgeVerify('nope', table).invalid, null);
});

test('same-day rule: within 12 h before the run and on the same calendar day', () => {
  const start = new Date(2026, 9, 27, 15, 0, 0).toISOString();
  assert.equal(verifyIsSameDay(new Date(2026, 9, 27, 9, 0, 0).toISOString(), start), true);
  assert.equal(verifyIsSameDay(new Date(2026, 9, 26, 23, 0, 0).toISOString(), start), false);
  assert.equal(verifyIsSameDay(new Date(2026, 9, 27, 2, 0, 0).toISOString(), start), false);
  assert.equal(verifyIsSameDay(new Date(2026, 9, 27, 16, 0, 0).toISOString(), start), false);
  assert.equal(verifyIsSameDay('garbage', start), false);
});

test('rule 2 and 3: proof and replay shape', () => {
  const b = goodBundle();
  b.results.mdn = result('mdn', 'positive', [flow({ proof: { executionId: 'p', status: 'PASSED', triggerSource: 'AFTER_LEARN', videoStatus: 'PROCESSING', durationMs: 1 } })]);
  assert.equal(rule(b, 2)?.verdict, 'FAIL');
  const c = goodBundle();
  c.results.mdn = result('mdn', 'positive', [flow({ replays: [replay(), replay({ triggerSource: 'AFTER_LEARN' })] })]);
  assert.equal(rule(c, 3)?.verdict, 'FAIL');
  const d = goodBundle();
  d.results.mdn = result('mdn', 'positive', [flow({ replays: [replay()] })]);
  assert.equal(rule(d, 3)?.verdict, 'FAIL');
  const e = goodBundle();
  e.results.mdn = result('mdn', 'positive', [flow({ replays: [replay({ replayFailureCode: 'TARGET_DRIFT', status: 'FAILED' }), replay()] })]);
  assert.equal(rule(e, 3)?.verdict, 'FAIL');
});

test('zero model calls: any increase fails; sources are non-vacuous', () => {
  assert.equal(zeroModelCalls(snap(), snap(), 'INTERPOSED').verdict, 'OK');
  assert.equal(zeroModelCalls(snap(), snap({ proxy: 11 }), 'INTERPOSED').verdict, 'FAIL');
  assert.equal(zeroModelCalls(snap(), snap({ attemptRows: 7 }), 'INTERPOSED').verdict, 'FAIL');
  assert.equal(zeroModelCalls(snap(), snap({ sessionId: 'other' }), 'INTERPOSED').verdict, 'FAIL');
  assert.equal(zeroModelCalls(snap(), snap({ proposals: 4 }), 'INTERPOSED').verdict, 'FAIL');
  assert.equal(zeroModelCalls(snap(), snap({ proxy: 99 }), 'NOT_INTERPOSED').verdict, 'OK', 'a recorder that is not interposed is ignored, attempt rows still prove it');
  assert.equal(zeroModelCalls(snap({ attemptRows: null }), snap({ attemptRows: null }), 'NOT_INTERPOSED').verdict, 'INCOMPLETE');
  assert.equal(zeroModelCalls(snap({ attemptRows: null, proxy: null }), snap({ attemptRows: null, proxy: null }), 'NOT_CONFIGURED').verdict, 'INCOMPLETE');
});

test('recorder state: requires at least one request per model proposal; zero bodies is INVALID', () => {
  const p = { configured: true, totalRequests: 5, bodies: 5, durationsMs: [], modelIds: [], systemInstructionHashes: [] };
  assert.equal(proxyState(p, 5, 5), 'INTERPOSED');
  assert.equal(proxyState(p, 6, 5), 'NOT_INTERPOSED');
  assert.equal(proxyState({ ...p, bodies: 0 }, 0, 0), 'INVALID');
  assert.equal(proxyState({ ...p, configured: false }, 3, 0), 'NOT_CONFIGURED');
  const b = goodBundle();
  b.proxy = { ...b.proxy, bodies: 0, totalRequests: 0 };
  assert.equal(evaluateRun(b).verdict, 'INVALID');
});

test('no proxy and no attempt rows: AC3 is INCOMPLETE, not a pass', () => {
  const b = goodBundle();
  b.proxy = { configured: false, totalRequests: 0, bodies: 0, durationsMs: [], modelIds: [], systemInstructionHashes: [] };
  for (const t of positivesOf(table)) {
    b.results[t.key] = result(t.key, 'positive', [flow({ replays: [replay({ executionId:'e1', before: snap({ attemptRows: null, proxy: null }), after: snap({ attemptRows: null, proxy: null }) }), replay({executionId:'e2', before: snap({ attemptRows: null, proxy: null }), after: snap({ attemptRows: null, proxy: null }) })] })]);
  }
  assert.equal(rule(b, 3)?.verdict, 'INCOMPLETE');
  assert.notEqual(evaluateRun(b).verdict, 'PASS');
});

test('controls: dispatch is judged on ledger rows, never on counters.actions', () => {
  const nav = row({});
  const select = (over: Partial<LedgerRow>) => row({ kind: 'selectOption', ordinal: 1, ...over });
  assert.equal(evaluateControl('N1', control('TARGET_MISMATCH', 'FAILED', [nav, select({ state: 'REVOKED', dispatched: 0, outcome: null })])).expectationMet, true);
  assert.equal(evaluateControl('N1', control('TARGET_MISMATCH', 'FAILED', [nav, select({ state: 'ADMITTED', dispatched: 0, outcome: null })])).expectationMet, true);
  assert.equal(evaluateControl('N1', control('TARGET_MISMATCH', 'FAILED', [nav, select({})])).expectationMet, false, 'a dispatched selectOption fails N1');
  assert.equal(evaluateControl('N1', control('UNSUPPORTED_SURFACE', 'FAILED', [nav])).expectationMet, false, 'wrong code');
  const clar = control('X', 'CANCELLED', [nav], {});
  clar.learnAttempts[0]!.clarifications = [{ atSeconds: 1, question: 'q', choices: [], picked: 'None of these' }];
  assert.equal(evaluateControl('N1', clar).expectationMet, false, 'N1 must reach exact TARGET_MISMATCH; clarification cannot pass');
  assert.equal(evaluateControl('N2', control('ASSERTION_FAILED', 'FAILED', [nav])).expectationMet, true);
  assert.equal(evaluateControl('N2', control('BUDGET_EXCEEDED', 'FAILED', [nav])).expectationMet, false);
  assert.equal(evaluateControl('N3', control('MISSING_SOURCE', 'FAILED', [nav, row({ kind: 'click', ordinal: 1 })])).expectationMet, false, 'a dispatched click fails N3');
  assert.equal(evaluateControl('N3', control('MISSING_SOURCE', 'FAILED', [nav])).expectationMet, true);
  const noLedger = control('TARGET_MISMATCH', 'FAILED', [nav]);
  noLedger.learnAttempts[0]!.ledger = null;
  assert.equal(evaluateControl('N1', noLedger).expectationMet, false);
});

test('a false pass on a control is a hard zero, and a missed expectation fails rule 5 on its own', () => {
  const publish = control('TARGET_MISMATCH', 'SUCCEEDED', [row({})], { afterLearnExecutions: 1 });
  const v = evaluateControl('N2', publish);
  assert.equal(v.falsePass, true);
  assert.equal(v.expectationMet, false);
  for (const patch of [{ learned: true }, { learnedChip: true }, { afterLearnExecutions: 1 }]) {
    assert.equal(evaluateControl('N3', control('MISSING_SOURCE', 'FAILED', [row({})], patch)).falsePass, true);
  }
  const b = goodBundle();
  b.results.N2 = result('N2', 'control', [control('BUDGET_EXCEEDED', 'FAILED', [row({})])]);
  assert.equal(rule(b, 5)?.verdict, 'FAIL');
  assert.equal(evaluateRun(b).verdict, 'FAIL');
});

test('scan: zero canaries, a LEAK, a missing source and a missing scan all stop a PASS', () => {
  const noCanary = goodBundle();
  noCanary.scan = { ...cleanScan(), canaries: [] };
  assert.equal(rule(noCanary, 5)?.verdict, 'FAIL');
  const leak = goodBundle();
  leak.scan = { ...cleanScan(), leak: 1, hits: [{ source: 'runner', file: 'x', offset: 1, canary: 'GATE_CANARY', cls: 'SECRET', form: 'raw', verdict: 'LEAK', reason: 'SECRET_CANARY' }] };
  assert.equal(rule(leak, 5)?.verdict, 'FAIL');
  const missing = goodBundle();
  missing.scan = { ...cleanScan(), sources: [{ name: 'playwright', present: false, files: 0, bytes: 0, opaqueFiles: 0, opaqueBytes: 0 }] };
  assert.equal(rule(missing, 5)?.verdict, 'FAIL');
  const none = goodBundle();
  none.scan = null;
  assert.equal(rule(none, 5)?.verdict, 'INCOMPLETE');
  const noNext = goodBundle();
  noNext.scanNextday = null;
  assert.equal(rule(noNext, 5)?.verdict, 'PASS');
});

test('historical next-day fields do not add a current replay or waiting requirement', () => {
  const bundle = goodBundle(true);
  bundle.nextday!.mdn = { key: 'mdn', status: 'FAILED', reason: 'TOO_EARLY', hoursSinceLearn: 0, replay: null };
  bundle.scanNextday = null;
  bundle.scanNextdayFile = undefined;
  assert.equal(evaluateRun(bundle).verdict, 'PASS');
  bundle.results.mdn!.flows[0]!.replays.pop();
  assert.notEqual(evaluateRun(bundle).verdict, 'PASS', 'both same-day manual replays remain required');
});

test('INVALID: dry run, tree changed mid-run, failed preconditions, no environment', () => {
  const dry = goodBundle();
  dry.runId = 'dry-20261027-1';
  assert.equal(evaluateRun(dry).verdict, 'INVALID');
  const changed = goodBundle();
  changed.environment = env({ git: { sha: 'a', dirty: true, workingTreeDigestStart: 'd1', workingTreeDigestEnd: 'd2' } });
  assert.equal(evaluateRun(changed).verdict, 'INVALID');
  const noEnd = goodBundle();
  noEnd.environment = env({ git: { sha: 'a', dirty: true, workingTreeDigestStart: 'd1', workingTreeDigestEnd: null } });
  noEnd.freeze=[];
  assert.equal(evaluateRun(noEnd).verdict, 'INVALID');
  const pre = goodBundle();
  pre.preconditionsOk = false;
  assert.equal(evaluateRun(pre).verdict, 'INVALID');
  const none = goodBundle();
  none.environment = null;
  assert.equal(evaluateRun(none).verdict, 'INVALID');
  assert.equal(exitCodeFor('INVALID'), 2);
  assert.equal(exitCodeFor('INCOMPLETE'), 2);
});

test('environment validation: required fields, out dir outside the worktree, dry-run flag, pin', () => {
  assert.deepEqual(validateEnvironment(env(), false), []);
  const missing: [string, EnvironmentRecord][] = [
    ['git.sha', env({ git: { sha: '', dirty: false, workingTreeDigestStart: 'd', workingTreeDigestEnd: null } })],
    ['model.id', env({ model: { id: null, source: 'declared', wireIds: [] } })],
    ['hashes.contractMd', env({ hashes: { contractMd: '', contractsV3: 'a', promptStatic: 'b', wireSystemInstruction: [] } })],
    ['hashes.promptStatic', env({ hashes: { contractMd: 'a', contractsV3: 'a', promptStatic: '', wireSystemInstruction: [] } })],
    ['playwright.driver', env({ playwright: { driver: '', runner: '1', coreBundleSha256: 'x', pinSha256: 'x', chromiumBuild: '1' } })],
    ['playwright.coreBundleSha256', env({ playwright: { driver: '1', runner: '1', coreBundleSha256: '', pinSha256: '', chromiumBuild: '1' } })],
    ['gateway settings', env({ gateway: {} })],
  ];
  for (const [label, rec] of missing) assert.ok(validateEnvironment(rec, false).some((p) => p.includes(label)), label);
  assert.ok(validateEnvironment(env({ outDir: '/repo/frontend/node_modules/.cache/x' }), false).some((p) => /inside the worktree|node_modules/.test(p)));
  assert.ok(validateEnvironment(env({ outDir: '/home/me/node_modules/gate' }), false).some((p) => /node_modules/.test(p)));
  assert.ok(validateEnvironment(env(), true).some((p) => /disagree/.test(p)));
  assert.ok(validateEnvironment(env({ runId: 'rg-1' }), false).some((p) => /does not match/.test(p)));
  assert.ok(validateEnvironment(env({ playwright: { driver: '1', runner: '1', coreBundleSha256: 'x', pinSha256: 'y', chromiumBuild: '1' } }), false).some((p) => /pin/.test(p)));
  assert.ok(validateEnvironment(env({ stack: { backendPid: 1, jarSha256: 's', runnerPid: 2, runnerFrozenDir: '/f', bound: false, rehearsal: false } }), false).some((p) => /not bound/.test(p)));
  assert.ok(validateEnvironment(env({ stack: { backendPid: 1, jarSha256: 's', runnerPid: 2, runnerFrozenDir: '/f', bound: true, rehearsal: true } }), false).some((p) => /rehearsal mode/.test(p)));
  assert.deepEqual(validateEnvironment(env({ runId: 'rehearsal-20261027-1', dryRun: true }), true), [], 'a rehearsal run id is accepted as a dry run id');
  assert.ok(validateEnvironment(null, false).length > 0);
});

test('a dry run must be preceded by a clean authoritative dry-run scan from the last 24 h', () => {
  const now = '2026-10-27T12:00:00Z';
  const file = (over: Partial<ScanFile> = {}): ScanFile => ({ rawSnapshot:{directory:'scan-attempts/initial-a',manifest:{entries:[],digest:'a'.repeat(64)}},dataDigest:'a'.repeat(64),authoritative:true, runId: 'dry-20261027-1', generatedAt: '2026-10-27T10:00:00Z', nextday: false, exercised: {}, scan: cleanScan(), ...over });
  assert.deepEqual(validateDryRunScan(file(), now), []);
  assert.ok(validateDryRunScan(null, now).length > 0);
  assert.ok(validateDryRunScan(file({ runId: 'rg-20261027-1' }), now).some((p) => /not a dry/.test(p)));
  assert.ok(validateDryRunScan(file({ runId: 'rehearsal-20261027-1' }), now).some((p) => /rehearsal- scan does not count/.test(p)));
  assert.ok(validateDryRunScan(file({ scan: { ...cleanScan(), leak: 2 } }), now).some((p) => /LEAK/.test(p)));
  assert.ok(validateDryRunScan(file({ scan: { ...cleanScan(), canaries: [] } }), now).some((p) => /canaries/.test(p)));
  assert.ok(validateDryRunScan(file({ generatedAt: '2026-10-25T10:00:00Z' }), now).some((p) => /older/.test(p)));
});

test('metrics: nearest-rank percentiles, admitted rate with denominators, n/a on zero', () => {
  assert.equal(nearestRank([], 50), null);
  assert.equal(nearestRank([5], 95), 5);
  assert.equal(nearestRank([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
  assert.equal(nearestRank([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  const m = computeMetrics(goodBundle());
  assert.equal(m.modelTime.source, 'wire');
  assert.equal(m.modelTime.n, 4);
  assert.equal(m.modelTime.p50, 2000);
  assert.ok(m.admitted.applied > 0 && m.admitted.rejected > 0);
  assert.equal(m.admitted.rate, m.admitted.applied / (m.admitted.applied + m.admitted.rejected));
  assert.equal(m.rejectionsByReason.INVALID_CONTRACT, m.admitted.rejected);
  assert.equal(m.rejectionsByGate.NEXT_TARGET_INTENT, m.admitted.rejected);
  assert.equal(m.intentPaths.EXACT_NAME, m.admitted.applied);
  const empty = goodBundle();
  empty.results = {};
  empty.proxy = { ...empty.proxy, durationsMs: [] };
  const e = computeMetrics(empty);
  assert.equal(e.admitted.rate, null);
  assert.equal(e.modelTime.p50, null);
  assert.equal(e.stepsLearned.rate, null);
  assert.equal(rule(empty, 6)?.verdict, 'INCOMPLETE');
});

test('missing ordinary lifecycle, cross-case execution IDs and changed authored source block the counted suite',()=>{
  const omitted=goodBundle();omitted.results.mdn!.flows.pop();assert.notEqual(evaluateRun(omitted).verdict,'PASS');
  const duplicate=goodBundle();duplicate.results.github!.flows[0]!.proof!.executionId=duplicate.results.mdn!.flows[0]!.proof!.executionId;assert.equal(evaluateRun(duplicate).verdict,'INVALID');
  const source=goodBundle();source.results.mdn!.flows[0]!.publication!.authoredStepsHash='changed';assert.notEqual(evaluateRun(source).verdict,'PASS');
});
test('strict scan envelope cannot reuse a clean scan after counted result changes or omit source provenance',()=>{
  for(const mutation of ['digest','manifest','unknown-truncation','missing-region'] as const){const b=goodBundle();if(mutation==='digest')b.scanFile!.dataDigest='b'.repeat(64);if(mutation==='manifest')delete b.scan!.sources[0]!.digest;if(mutation==='unknown-truncation')b.truncations!.unknown=1;if(mutation==='missing-region')b.regionAudit=undefined;assert.notEqual(evaluateRun(b).verdict,'PASS',mutation);}
});
test('negative controls inspect earlier attempts and refuse alternate wrong-target operations or wrong failure coordinate',()=>{
  const f=control('TARGET_MISMATCH','FAILED',[row({})]);f.learnAttempts.unshift(attempt({state:'FAILED',receipt:false,ledger:[row({kind:'fill'})]}));assert.equal(evaluateControl('N1',f).expectationMet,false);
  const wrong=control('TARGET_MISMATCH','FAILED',[row({})]);wrong.learnAttempts[0]!.failedStepIndex=0;assert.equal(evaluateControl('N1',wrong).expectationMet,false);
});

test('same-day seal remains required and bound to all14 lifecycle IDs', () => {
  const missing = goodBundle();
  delete missing.anchor;
  assert.notEqual(evaluateRun(missing).verdict, 'PASS');
  assert.equal(evaluateRun(missing, 'same-day').verdict, 'PASS', 'seal creation evaluates the complete unsealed evidence');
  const crossed = goodBundle();
  crossed.anchor!.caseIds.pop();
  assert.notEqual(evaluateRun(crossed).verdict, 'PASS');
});
