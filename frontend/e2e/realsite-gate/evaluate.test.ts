import assert from 'node:assert/strict';
import { test } from 'node:test';
import { positivesOf } from './common.ts';
import {
  computeMetrics,
  confirmationFindings,
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
import type { StepReceipt } from './status.ts';
import { attempt, cleanScan, control, dispatched, env, flow, goodBundle, navStep, proofRows, refused, replay, result, snap, stepReceipt, table } from './testkit.ts';

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
  assert.equal(rule(b3, 1)?.verdict, 'PASS', 'the UI receipt text is corroboration only; the database decides');
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

// ---- controls on effect receipts ---------------------------------------------------------------

const eff = (method: string, completed = true) => ({ method, completed });
/** A receipt of the control step: effects list (fence crossed when any), closed code, optional overrides. */
const at1 = (closedCode: StepReceipt['closedCode'], effects: { method: string; completed: boolean }[] = [], over: Partial<StepReceipt> = {}) =>
  dispatched(1, stepReceipt({ closedCode, fenceCrossed: effects.length > 0, effects, ...over }));
const met = (key: string, f: ReturnType<typeof control>) => evaluateControl(key, f).expectationMet;
const asked = (f: ReturnType<typeof control>) => {
  f.learnAttempts[0]!.clarifications = [{ atSeconds: 1, question: 'q', choices: [], picked: 'None of these' }];
  return f;
};

test('N1: only a selectOption attempted and not completed is tolerated; the closed code decides', () => {
  const nav = navStep();
  assert.equal(met('N1', control('TARGET_DRIFT', 'FAILED', [nav, at1('TARGET_DRIFT')])), true, 'a pre-fence miss has no effect');
  assert.equal(met('N1', control('OUTCOME_UNKNOWN', 'UNKNOWN_OUTCOME', [nav, at1('OUTCOME_UNKNOWN', [eff('selectOption', false)])])), true);
  assert.equal(met('N1', control('ASSERTION_FAILED', 'FAILED', [nav, at1('ASSERTION_FAILED')])), true);
  assert.equal(met('N1', control('TIMEOUT', 'FAILED', [nav, at1('TIMEOUT')])), true);
  assert.equal(met('N1', control('OUTCOME_UNKNOWN', 'FAILED', [nav, at1('OUTCOME_UNKNOWN', [eff('selectOption', true)])])), false, 'a completed selectOption fails');
  assert.equal(met('N1', control('OUTCOME_UNKNOWN', 'FAILED', [nav, at1('OUTCOME_UNKNOWN', [eff('click', false)])])), false, 'an attempted click fails');
  assert.equal(met('N1', control('OUTCOME_UNKNOWN', 'FAILED', [nav, at1('OUTCOME_UNKNOWN', [eff('selectOption', false), eff('click', false)])])), false);
  assert.equal(met('N1', control('CANCELLED', 'FAILED', [nav, at1('CANCELLED')])), false, 'a closed code outside the set');
  assert.equal(met('N1', control('X', 'FAILED', [nav, at1(null)])), false, 'the control step passed');
  const early = control('TARGET_DRIFT', 'FAILED', [nav, at1('TARGET_DRIFT')]);
  early.learnAttempts[0]!.failedStepIndex = 0;
  assert.equal(met('N1', early), false, 'the failedStepIndex 1 pin stays');
  assert.equal(met('N1', asked(control('X', 'CANCELLED', [nav, refused(1)]))), true, 'a clarification is accepted');
  assert.equal(met('N1', control('INVALID_CONTRACT', 'FAILED', [nav, refused(1)])), true, 'a pre-dispatch refusal is accepted');
});

test('N2: ASSERTION_FAILED with no effect at all; a clarification or a pre-dispatch refusal', () => {
  const nav = navStep();
  assert.equal(met('N2', control('ASSERTION_FAILED', 'FAILED', [nav, at1('ASSERTION_FAILED')])), true);
  assert.equal(met('N2', control('ASSERTION_FAILED', 'FAILED', [nav, at1('ASSERTION_FAILED', [eff('click')])])), false, 'any effect at the control step fails N2');
  assert.equal(met('N2', control('OUTCOME_UNKNOWN', 'FAILED', [nav, at1('OUTCOME_UNKNOWN', [eff('selectOption', false)])])), false);
  assert.equal(met('N2', control('TARGET_DRIFT', 'FAILED', [nav, at1('TARGET_DRIFT')])), false, 'TARGET_DRIFT is N1 only');
  assert.equal(met('N2', control('UNSUPPORTED_SURFACE', 'FAILED', [nav, refused(1)])), true, 'a session-level refusal before dispatch');
  assert.equal(met('N2', control('MODEL_UNAVAILABLE', 'FAILED', [nav, refused(1)])), false, 'infrastructure is not a refusal');
  assert.equal(met('N2', control('INVALID_CONTRACT', 'FAILED', [nav])), true, 'no ordinal-1 row after repair exhaustion');
  assert.equal(met('N2', asked(control('X', 'CANCELLED', [nav]))), true);
  assert.equal(met('N2', control('BUDGET_EXCEEDED', 'FAILED', [nav])), false);
});

test('N3: a clarification or a refusal; any effect or crossed fence at the control step voids it', () => {
  const nav = navStep();
  assert.equal(met('N3', asked(control('X', 'CANCELLED', [nav]))), true, 'goto at ordinal 0 plus a clarification');
  assert.equal(met('N3', control('INVALID_CONTRACT', 'FAILED', [nav])), true, 'no ordinal-1 row after INVALID_CONTRACT');
  assert.equal(met('N3', control('MISSING_SOURCE', 'FAILED', [nav, refused(1)])), true);
  assert.equal(met('N3', control('TARGET_DRIFT', 'FAILED', [nav, at1('TARGET_DRIFT')])), true, 'a pre-fence refusal that dispatched no effect');
  assert.equal(met('N3', control('TARGET_DRIFT', 'FAILED', [nav, at1('TARGET_DRIFT', [eff('click', false)])])), false, 'a click with completed false fails N3');
  assert.equal(met('N1', control('TARGET_DRIFT', 'FAILED', [nav, at1('TARGET_DRIFT', [eff('click', false)])])), false, 'and N1');
  assert.equal(met('N3', control('TARGET_DRIFT', 'FAILED', [nav, at1('TARGET_DRIFT', [eff('selectOption', false)])])), false);
  assert.equal(met('N3', control('X', 'FAILED', [nav, at1(null)])), false, 'the control step passed');
});

test('controls: a non-goto effect at ordinal 0, an inconsistent or truncated receipt, and a missing receipt fail', () => {
  const click0 = dispatched(0, stepReceipt({ fenceCrossed: true, effects: [eff('click')] }));
  for (const key of ['N1', 'N2', 'N3']) {
    assert.equal(met(key, asked(control('X', 'CANCELLED', [click0]))), false, `${key}: a non-goto effect at ordinal 0`);
    const fenced = at1('TARGET_DRIFT', [], { fenceCrossed: true });
    assert.equal(met(key, control('TARGET_DRIFT', 'FAILED', [navStep(), fenced])), false, `${key}: fenceCrossed with effects []`);
    const truncated = at1('OUTCOME_UNKNOWN', [eff('selectOption', false)], { effectsTruncated: true });
    assert.equal(met(key, control('OUTCOME_UNKNOWN', 'FAILED', [navStep(), truncated])), false, `${key}: truncated effects`);
    assert.equal(met(key, control('TARGET_DRIFT', 'FAILED', [navStep(), dispatched(1, null)])), false, `${key}: a dispatched row with a null receipt`);
  }
  assert.equal(met('N3', asked(control('X', 'CANCELLED', [dispatched(0, null)]))), false, 'a dispatched navigation row with a null receipt');
  const nav2 = dispatched(0, stepReceipt({ fenceCrossed: true, effects: [eff('goto'), eff('goto'), eff('waitForLoadState')] }));
  assert.equal(met('N3', asked(control('X', 'CANCELLED', [nav2]))), false, 'only goto is allowed at ordinal 0');
});

test('controls: receipts and ledger rows must join both ways, and an unread source is never a pass', () => {
  const nav = navStep();
  const orphan = control('INVALID_CONTRACT', 'FAILED', [nav]);
  orphan.learnAttempts[0]!.receipts!.push({ stepId: 'step-1', ordinal: 0, attemptOrdinal: 0, dispatchCount: 1, receipt: stepReceipt({ closedCode: 'TARGET_DRIFT' }) });
  assert.equal(met('N3', orphan), false, 'a receipt without its ledger row');
  const bare = control('INVALID_CONTRACT', 'FAILED', [nav]);
  bare.learnAttempts[0]!.receipts = [];
  assert.equal(met('N3', bare), false, 'a ledger row without its receipt entry');
  const unread = control('INVALID_CONTRACT', 'FAILED', [nav]);
  unread.learnAttempts[0]!.receipts = null;
  assert.equal(met('N3', unread), false);
  const noLedger = control('INVALID_CONTRACT', 'FAILED', [nav]);
  noLedger.learnAttempts[0]!.ledger = null;
  assert.equal(met('N3', noLedger), false);
  const unheaded = control('INVALID_CONTRACT', 'FAILED', [nav], { headAtLearn: undefined });
  assert.equal(met('N3', unheaded), false, 'the pointers were not read');
  const phantom = control('INVALID_CONTRACT', 'FAILED', [nav, refused(1)]);
  phantom.learnAttempts[0]!.receipts![1] = { stepId: 'step-1', ordinal: 0, attemptOrdinal: 0, dispatchCount: 0, receipt: stepReceipt() };
  assert.equal(met('N3', phantom), false, 'a receipt on a row that was never dispatched');
  const beyond = control('TARGET_DRIFT', 'FAILED', [nav, at1('TARGET_DRIFT'), dispatched(2, stepReceipt({ closedCode: 'TARGET_DRIFT' }))]);
  assert.equal(met('N3', beyond), false, 'a step beyond the control step was dispatched');
  const earlier = control('TARGET_DRIFT', 'FAILED', [nav, at1('TARGET_DRIFT')]);
  earlier.learnAttempts.unshift(attempt({ state: 'FAILED', receipt: false, cls: 'INFRA', ledger: [dispatched(0, stepReceipt({ fenceCrossed: true, effects: [eff('goto'), eff('click', false)] })).row], receipts: [dispatched(0, stepReceipt({ fenceCrossed: true, effects: [eff('goto'), eff('click', false)] })).entry] }));
  assert.equal(met('N3', earlier), false, 'every attempt is judged, not only the last');
  const noAttempts = control('TARGET_DRIFT', 'FAILED', [nav]);
  noAttempts.learnAttempts = [];
  assert.equal(met('N1', noAttempts), false);
  assert.equal(evaluateControl('N1', undefined).expectationMet, false);
  assert.equal(evaluateControl('N9', control('TARGET_DRIFT', 'FAILED', [nav])).expectationMet, false);
});

test('controls: steps are told apart by step id, since every SC008 ledger row is ordinal 0 / attempt 0', () => {
  const nav = navStep();
  for (const step of [nav, at1('ASSERTION_FAILED')]) assert.deepEqual([step.row.ordinal, step.row.attemptOrdinal], [0, 0]);
  assert.equal(met('N2', control('ASSERTION_FAILED', 'FAILED', [nav, at1('ASSERTION_FAILED')])), true, 'N2 clean ASSERTION_FAILED at step index 1');
  assert.equal(met('N1', control('OUTCOME_UNKNOWN', 'UNKNOWN_OUTCOME', [nav, at1('OUTCOME_UNKNOWN', [eff('selectOption', false)])])), true, 'N1 attempted selectOption at step index 1');
  assert.equal(met('N3', control('INVALID_CONTRACT', 'FAILED', [nav, at1('INVALID_CONTRACT', [eff('goto', true)])])), false, 'a completed wrong-target goto at the control step is an effect');
  assert.equal(met('N3', control('INVALID_CONTRACT', 'FAILED', [nav, at1('INVALID_CONTRACT')])), true);
  const swapped = control('TARGET_DRIFT', 'FAILED', [at1('TARGET_DRIFT', [eff('goto')]), navStep()]);
  assert.equal(met('N3', swapped), false, 'step identity comes from the step id, not the row position');
  const unknown = control('TARGET_DRIFT', 'FAILED', [nav, dispatched(1, stepReceipt({ closedCode: 'TARGET_DRIFT' }), { stepId: 'other' })]);
  assert.equal(met('N1', unknown), false, 'a step id outside the authored order');
  const noOrder = control('INVALID_CONTRACT', 'FAILED', [nav]);
  noOrder.learnAttempts[0]!.stepIds = null;
  assert.equal(met('N3', noOrder), false, 'unreadable step order');
  const extra = control('TARGET_DRIFT', 'FAILED', [nav, at1('TARGET_DRIFT'), dispatched(2, stepReceipt({ closedCode: 'TARGET_DRIFT' }))]);
  assert.equal(met('N1', extra), false, 'a step beyond the control step was dispatched');
});

test('a false pass on a control is a hard zero whatever the receipts say, and a missed expectation fails rule 5 on its own', () => {
  const nav = navStep();
  const clean = () => control('INVALID_CONTRACT', 'FAILED', [nav]);
  assert.equal(evaluateControl('N3', clean()).falsePass, false);
  const patches: Partial<ReturnType<typeof control>>[] = [
    { learned: true },
    { learnedChip: true },
    { afterLearnExecutions: 1 },
    { replays: [replay()] },
    { headAtLearn: { candidate: 'r', confirmed: null } },
    { headAtLearn: { candidate: null, confirmed: 'r' } },
    { publication: { testId: 't', revisionId: 'r', sourceRevision: 1, configurationRevision: 1, learnedCompletedAt: '2026-10-27T12:05:00Z', stepIds: ['s'] } },
  ];
  for (const patch of patches) {
    const verdict = evaluateControl('N3', { ...clean(), ...patch });
    assert.equal(verdict.falsePass, true, JSON.stringify(patch));
    assert.equal(verdict.expectationMet, false);
  }
  const proved = clean();
  proved.proof = flow().proof;
  assert.equal(evaluateControl('N3', proved).falsePass, true);
  const succeeded = control('TARGET_DRIFT', 'SUCCEEDED', [nav, at1('TARGET_DRIFT')]);
  assert.equal(evaluateControl('N1', succeeded).falsePass, true);
  const uiReceipt = clean();
  uiReceipt.learnAttempts[0]!.receipt = true;
  assert.equal(evaluateControl('N3', uiReceipt).falsePass, true);
  const b = goodBundle();
  b.results.N2 = result('N2', 'control', [control('BUDGET_EXCEEDED', 'FAILED', [nav])]);
  assert.equal(rule(b, 5)?.verdict, 'FAIL');
  assert.equal(evaluateRun(b).verdict, 'FAIL');
});

test('learned is the confirmed pointer plus the proof receipt rows, never UI text', () => {
  const ui = flow({ learnedChip: true, headAfterProof: { candidate: null, confirmed: null } });
  ui.learnAttempts[0]!.receipt = true;
  assert.equal(ui.learnedChip && ui.learnAttempts[0]!.receipt, true);
  const b = goodBundle();
  b.results.mdn = result('mdn', 'positive', [ui]);
  assert.equal(rule(b, 1)?.verdict, 'FAIL', 'chip and receipt text with a null pointer');
  const good = goodBundle().results.mdn!.flows[0]!;
  assert.deepEqual(confirmationFindings(good), []);
  const mutate = (change: (f: typeof good) => void) => { const f = structuredClone(good); change(f); return confirmationFindings(f); };
  assert.equal(mutate((f) => { f.headAfterProof = { candidate: 'revision-mdn', confirmed: null }; })[0]?.verdict, 'FAIL', 'still only a candidate');
  assert.equal(mutate((f) => { f.headAfterProof = { candidate: null, confirmed: 'other' }; })[0]?.verdict, 'FAIL', 'a different confirmed revision');
  assert.equal(mutate((f) => { f.headAfterProof = null; })[0]?.verdict, 'INCOMPLETE');
  assert.equal(mutate((f) => { f.proofReceipts = null; })[0]?.verdict, 'INCOMPLETE');
  assert.equal(mutate((f) => { f.proofReceipts = f.proofReceipts!.slice(1); })[0]?.verdict, 'FAIL', 'missing rows');
  assert.equal(mutate((f) => { f.proofReceipts = proofRows(f.publication!.revisionId, f.publication!.stepIds.length, 'foreign-proof'); })[0]?.verdict, 'FAIL', 'rows of another proof execution');
  assert.equal(mutate((f) => { f.proofReceipts = proofRows('foreign-revision', f.publication!.stepIds.length, f.proof!.executionId); })[0]?.verdict, 'FAIL', 'rows of another revision');
  assert.equal(mutate((f) => { f.proofReceipts![1]!.status = 'FAILED'; })[0]?.verdict, 'FAIL');
  assert.equal(mutate((f) => { f.proofReceipts![1]!.receipt = stepReceipt({ closedCode: 'TIMEOUT' }); })[0]?.verdict, 'FAIL', 'a PASSED row whose receipt carries a closed code');
  assert.equal(mutate((f) => { f.proofReceipts![1]!.receipt = stepReceipt({ stepHash: 'b'.repeat(64) }); })[0]?.verdict, 'FAIL', 'receipt hash differs from the row hash');
  assert.equal(mutate((f) => { f.proof = { ...f.proof!, status: 'FAILED' }; })[0]?.verdict, 'FAIL', 'no passed proof');
  assert.deepEqual(mutate((f) => { f.headAtLearn = { candidate: null, confirmed: 'revision-mdn' }; }), [], 'a pointer that was confirmed early is not a finding');
});

test('a recorded but unconfirmed revision is not counted as learned in the metrics', () => {
  const b = goodBundle();
  const full = computeMetrics(b).stepsLearned.learned;
  b.results.mdn!.flows[0]!.headAfterProof = { candidate: 'revision-mdn', confirmed: null };
  assert.equal(computeMetrics(b).stepsLearned.learned, full - b.table.tests.find((t) => t.key === 'mdn')!.steps!.length);
});

test('the environment must carry the Playwright reference hash', () => {
  const rec = env();
  assert.equal(rec.hashes.playwrightReferenceHash.length, 64);
  assert.deepEqual(validateEnvironment(rec, false), []);
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
    ['hashes.contractMd', env({ hashes: { contractMd: '', contractsV3: 'a', promptStatic: 'b', playwrightReferenceHash: 'c'.repeat(64), wireSystemInstruction: [] } })],
    ['hashes.promptStatic', env({ hashes: { contractMd: 'a', contractsV3: 'a', promptStatic: '', playwrightReferenceHash: 'c'.repeat(64), wireSystemInstruction: [] } })],
    ['hashes.playwrightReferenceHash', env({ hashes: { contractMd: 'a', contractsV3: 'a', promptStatic: 'b', playwrightReferenceHash: '', wireSystemInstruction: [] } })],
    ['playwright.driver', env({ playwright: { driver: '', runner: '1', coreBundleSha256: 'x', pinSha256: 'x', chromiumBuild: '1' } })],
    ['playwright.coreBundleSha256', env({ playwright: { driver: '1', runner: '1', coreBundleSha256: '', pinSha256: '', chromiumBuild: '1' } })],
    ['gateway settings', env({ gateway: {} })],
  ];
  for (const [label, rec] of missing) assert.ok(validateEnvironment(rec, false).some((p) => p.includes(label)), label);
  assert.ok(validateEnvironment(env({ hashes: { contractMd: 'a', contractsV3: 'a', promptStatic: 'b', playwrightReferenceHash: 'not-hex', wireSystemInstruction: [] } }), false).some((p) => /not a sha256/.test(p)));
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
  assert.equal(m.rejectionsByGate.STEP_SYNTAX, m.admitted.rejected);
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
  for(const mutation of ['digest','manifest','unknown-truncation'] as const){const b=goodBundle();if(mutation==='digest')b.scanFile!.dataDigest='b'.repeat(64);if(mutation==='manifest')delete b.scan!.sources[0]!.digest;if(mutation==='unknown-truncation')b.truncations!.unknown=1;assert.notEqual(evaluateRun(b).verdict,'PASS',mutation);}
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
