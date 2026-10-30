/* eslint-disable -- dynamic imports of untyped SPK-07 .mjs modules */
/**
 * SPK-07 workstream F: the run driver with fake arms, a fake model client and a fake page. Covers the freeze refusal,
 * resumability, EMPTIED handling, the correction re-ask, shared SOURCE_PLAN and scoring-input lines.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const load = async (rel: string): Promise<any> => import(new URL(rel, import.meta.url).href);
const run = await load('../../evaluation/grounding/run.mjs');
const freeze = await load('../../evaluation/grounding/freeze.mjs');
const dirs: string[] = [];
const tmp = (prefix: string) => { const dir = mkdtempSync(join(tmpdir(), `spk07-f-${prefix}-`)); dirs.push(dir); return dir; };
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const jsonl = (path: string): any[] => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));

// ---- freeze ---------------------------------------------------------------------------------------------------

function makeRoot() {
  const root = tmp('root');
  mkdirSync(join(root, 'corpus'), { recursive: true });
  mkdirSync(join(root, 'contracts'), { recursive: true });
  mkdirSync(join(root, 'lib'), { recursive: true });
  const task = (id: string, stratum: string, extra: object = {}) => JSON.stringify({ id, site: 'fixture', url: 'fixture://c01/home', stratum, heldOut: false, expect: 'ACTION', steps: [{ text: 'Click "Go"', operation: { kind: 'click' }, gt: { chain: [{ m: 'getByText', a: ['Go'] }] } }], ...extra });
  writeFileSync(join(root, 'corpus', 'tasks.jsonl'), `${task('a', 'uniqueNav')}\n${task('b', 'chain')}\n${task('n', 'negative', { expect: 'CLARIFICATION' })}\n`);
  writeFileSync(join(root, 'contracts', 'guided-output-contract.md'), 'contract v1\n');
  writeFileSync(join(root, 'lib', 'x.mjs'), 'export {}\n');
  const production = join(tmp('prod'), 'guided-output-contract.md');
  writeFileSync(production, 'production contract v1\n');
  return { root, production, p: freeze.paths(root, join(tmp('docs'), 'SPK-07'), production) };
}

describe('freeze', () => {
  it('writes freeze.json (and the docs copy) and verifies clean', () => {
    const { p } = makeRoot();
    const written = freeze.writeFreeze({ p, now: new Date('2026-10-26T12:00:00Z') });
    expect(written.counts).toMatchObject({ total: 3, byStratum: { uniqueNav: 1, chain: 1, negative: 1 }, sites: 1 });
    expect(written.frozenAt).toBe('2026-10-26T12:00:00.000Z');
    expect(readFileSync(p.docsFreeze, 'utf8')).toBe(readFileSync(p.freeze, 'utf8'));
    const verdict = freeze.verifyFreeze({ p });
    expect(verdict).toMatchObject({ ok: true, errors: [] });
  });
  it('QA-D8: pins the production guided-output-contract.md and refuses a run after it changed', () => {
    const { p, production } = makeRoot();
    const written = freeze.writeFreeze({ p });
    expect(written.productionContract.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(freeze.verifyFreeze({ p }).ok).toBe(true);
    writeFileSync(production, 'production contract v2\n');
    const changed = freeze.verifyFreeze({ p });
    expect(changed.ok).toBe(false);
    expect(changed.errors.join(' ')).toMatch(/PRODUCTION_CONTRACT_CHANGED/);
    expect(run.freezeGate({ armIds: ['A1', 'S2'], dry: false, verify: changed }).allowed).toBe(false);
  });
  it('refuses a refreeze unless forced', () => {
    const { p } = makeRoot();
    freeze.writeFreeze({ p });
    expect(() => freeze.writeFreeze({ p })).toThrow(/FREEZE_EXISTS/);
    expect(() => freeze.writeFreeze({ p, force: true })).not.toThrow();
  });
  it('refuses S-arm model calls when the corpus bytes change, and when a contract changes', () => {
    const { p } = makeRoot();
    freeze.writeFreeze({ p });
    writeFileSync(p.corpus, `${readFileSync(p.corpus, 'utf8')}\n`.replace('"Go"', '"Gone"'));
    const changed = freeze.verifyFreeze({ p });
    expect(changed.ok).toBe(false);
    expect(changed.errors.join(' ')).toMatch(/CORPUS_CHANGED/);
    const gate = run.freezeGate({ armIds: ['A1', 'S3'], dry: false, verify: changed });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/REFUSED/);

    const second = makeRoot();
    freeze.writeFreeze({ p: second.p });
    writeFileSync(join(second.root, 'contracts', 'guided-output-contract.md'), 'contract v2\n');
    expect(freeze.verifyFreeze({ p: second.p }).errors.join(' ')).toMatch(/CONTRACTS_CHANGED guided-output-contract.md/);
  });
  it('refuses when there is no freeze at all, but allows baseline-only arms and dry runs; warns on harness drift', () => {
    const { root, p } = makeRoot();
    const missing = freeze.verifyFreeze({ p });
    expect(missing.ok).toBe(false);
    expect(run.freezeGate({ armIds: ['S1'], dry: false, verify: missing }).allowed).toBe(false);
    expect(run.freezeGate({ armIds: ['A0', 'A1'], dry: false, verify: missing }).allowed).toBe(true);
    expect(run.freezeGate({ armIds: ['S1'], dry: true, verify: missing }).allowed).toBe(true);
    freeze.writeFreeze({ p });
    writeFileSync(join(root, 'lib', 'x.mjs'), 'export const changed = 1\n');
    const drift = freeze.verifyFreeze({ p });
    expect(drift.ok).toBe(true);
    expect(drift.warnings.join(' ')).toMatch(/HARNESS_CHANGED_SINCE_FREEZE lib\/x.mjs/);
  });
  it('main() exits 2 before doing anything when S arms are requested without a matching freeze', async () => {
    const { p } = makeRoot();
    const runDir = join(tmp('main'), 'run');
    const code = await run.main([runDir, '--arms', 'S2', '--reps', '1'], { freezePaths: p });
    expect(code).toBe(2);
  });
});

// ---- classification and pending units --------------------------------------------------------------------------

describe('classify', () => {
  const answerable = { id: 't', expect: 'ACTION' };
  it('marks a correct, executable, ungated ACTION as correct and a wrong executable pick as confident wrong', () => {
    expect(run.classify({ task: answerable, gtIds: [5], interp: { status: 'ACTION', pickedBackendNodeId: 5, executable: true, gateCodes: [] } })).toMatchObject({ correctAndExecutable: true, confidentWrong: false, outcome: 'CORRECT' });
    expect(run.classify({ task: answerable, gtIds: [5], interp: { status: 'ACTION', pickedBackendNodeId: 9, executable: true, gateCodes: [] } })).toMatchObject({ correctAndExecutable: false, confidentWrong: true, outcome: 'CONFIDENT_WRONG' });
  });
  it('primary success needs no gate; admittedSuccess does; wrong-element ACTIONs are counted even when refused', () => {
    const gatedRight = run.classify({ task: answerable, gtIds: [5], interp: { status: 'ACTION', pickedBackendNodeId: 5, executable: true, gateCodes: ['INTENT_MISMATCH'] } });
    expect(gatedRight).toMatchObject({ correctAndExecutable: true, admittedSuccess: false, needsRepair: true });
    const gatedWrong = run.classify({ task: answerable, gtIds: [5], interp: { status: 'ACTION', pickedBackendNodeId: 9, executable: true, gateCodes: ['INTENT_MISMATCH'] } });
    expect(gatedWrong).toMatchObject({ wrongElementAction: true, confidentWrong: false });
  });
  it('does not call a gated or non-executable wrong pick confident, and re-asks it', () => {
    const gated = run.classify({ task: answerable, gtIds: [5], interp: { status: 'ACTION', pickedBackendNodeId: 9, executable: true, gateCodes: ['INTENT_MISMATCH'] } });
    expect(gated).toMatchObject({ confidentWrong: false, needsRepair: true, repairCodes: ['INTENT_MISMATCH'] });
    const notExec = run.classify({ task: answerable, gtIds: [5], interp: { status: 'ACTION', pickedBackendNodeId: 5, executable: false, gateCodes: [] } });
    expect(notExec).toMatchObject({ confidentWrong: false, correctElement: true, correctAndExecutable: false, needsRepair: true, outcome: 'NOT_EXECUTABLE' });
  });
  it('treats clarification on an answerable task as a failure, false COMPLETE as confident wrong, and scores negatives', () => {
    expect(run.classify({ task: answerable, gtIds: [5], interp: { status: 'CLARIFICATION' } })).toMatchObject({ clarificationOnAnswerable: true, correctAndExecutable: false });
    expect(run.classify({ task: answerable, gtIds: [5], interp: { status: 'COMPLETE' } })).toMatchObject({ confidentWrong: true, outcome: 'FALSE_COMPLETE' });
    expect(run.classify({ task: answerable, gtIds: [5], interp: { status: 'COMPLETE', gateCodes: ['G'] } })).toMatchObject({ confidentWrong: true });
    const negative = { id: 'n', expect: 'CLARIFICATION' };
    expect(run.classify({ task: negative, gtIds: [], interp: { status: 'CLARIFICATION' } })).toMatchObject({ negativeHandled: true, confidentWrong: false });
    expect(run.classify({ task: negative, gtIds: [], interp: { status: 'ACTION', pickedBackendNodeId: 3, executable: true, gateCodes: [] } })).toMatchObject({ negativeHandled: false, confidentWrong: true });
  });
});

describe('D-3 classify: click-equivalent descendants', () => {
  const answerable = { id: 't', expect: 'ACTION' };
  it('counts an equivalent descendant as correct for the primary metric and keeps the strict result beside it', () => {
    const interp = { status: 'ACTION', pickedBackendNodeId: 88, executable: true, gateCodes: [] };
    const credited = run.classify({ task: answerable, gtIds: [87], interp, equivalent: true });
    expect(credited).toMatchObject({ correctElement: true, strictCorrectElement: false, correctAndExecutable: true, strictCorrectAndExecutable: false, equivalentDescendant: true, confidentWrong: false, wrongElementAction: false, outcome: 'EQUIVALENT_DESCENDANT' });
    expect(run.classify({ task: answerable, gtIds: [87], interp, equivalent: false })).toMatchObject({ correctAndExecutable: false, confidentWrong: true, outcome: 'CONFIDENT_WRONG' });
    expect(run.classify({ task: { id: 'n', expect: 'CLARIFICATION' }, gtIds: [], interp, equivalent: true })).toMatchObject({ equivalentDescendant: false, confidentWrong: true });
  });
});

describe('D-1 infrastructure errors', () => {
  it('classifies HTTP and transport failures as infrastructure, but not a 200 without a reply or a cap refusal', () => {
    expect(run.isInfraError({ status: 429, reply: null, error: 'Resource exhausted' })).toBe(true);
    expect(run.isInfraError({ status: 503, reply: null })).toBe(true);
    expect(run.isInfraError({ status: 0, reply: null, error: 'CONNECT' })).toBe(true);
    expect(run.isInfraError({ status: 0, reply: null, error: 'TIMEOUT' })).toBe(true);
    expect(run.isInfraError({ status: 200, reply: null })).toBe(false);
    expect(run.isInfraError({ status: 0, reply: null, error: 'CAP_PER_CALL_ESTIMATE' })).toBe(false);
    expect(run.isInfraError({ status: 200, reply: { kind: 'NEXT_ACTION' } })).toBe(false);
  });
  it('is the default concurrency of 2', () => {
    expect(run.parseArgs(['dir']).concurrency).toBe(2);
  });
});

describe('pendingUnits', () => {
  const task = { id: 't', steps: [{}, {}] };
  it('lists everything for a fresh run, nothing for a complete one, and only the missing repair', () => {
    const fresh = run.pendingUnits({ task, armIds: ['A1', 'S1'], reps: 2, rows: new Map() });
    expect(fresh).toHaveLength(2 * 2 * 2);
    const rows = new Map();
    for (const u of fresh) rows.set(run.keyOf('t', u.step, u.arm, u.rep, 1), { outcome: 'CORRECT', needsRepair: false });
    expect(run.pendingUnits({ task, armIds: ['A1', 'S1'], reps: 2, rows })).toHaveLength(0);
    rows.set(run.keyOf('t', 0, 'A1', 1, 1), { outcome: 'GATED', needsRepair: true, repairCodes: ['X'] });
    rows.set(run.keyOf('t', 1, 'S1', 2, 1), { outcome: 'MODEL_ERROR' });
    const pending = run.pendingUnits({ task, armIds: ['A1', 'S1'], reps: 2, rows });
    expect(pending).toEqual([{ step: 0, arm: 'A1', rep: 1, attempt: 2, repairCodes: ['X'] }, { step: 1, arm: 'S1', rep: 2, attempt: 1, repairCodes: [] }]);
  });
  it('java repair mode only re-asks refused attempt-1 rows that have no attempt 2', () => {
    const rows = new Map([[run.keyOf('t', 0, 'A1', 1, 1), { outcome: 'CORRECT' }], [run.keyOf('t', 1, 'A1', 1, 1), { outcome: 'CORRECT' }], [run.keyOf('t', 1, 'A1', 1, 2), { outcome: 'CORRECT' }]]);
    const javaRefusals = new Map([[run.keyOf('t', 0, 'A1', 1, 1), 'TARGET_INTENT_MISMATCH'], [run.keyOf('t', 1, 'A1', 1, 1), 'X']]);
    expect(run.pendingUnits({ task, armIds: ['A1'], reps: 1, rows, javaRefusals, repairJava: true })).toEqual([{ step: 0, arm: 'A1', rep: 1, attempt: 2, repairCodes: ['TARGET_INTENT_MISMATCH'] }]);
  });
});

// ---- executeTask with fakes -----------------------------------------------------------------------------------

const GT_ID = 100;
function fakeArm(id: string, opts: { emptied?: boolean; pick?: number; firstExecutable?: boolean } = {}) {
  const calls = { observe: 0, dispose: 0, build: [] as any[], interpret: 0 };
  return {
    calls,
    mod: {
      id,
      observe: async () => { calls.observe++; return { payload: {}, idMap: {}, dispose: async () => { calls.dispose++; }, meta: { bytes: 1000, nodes: 3, ms: 5, admittedUnderProductionLimits: true, gatewayInputAdmitted: true, emptied: Boolean(opts.emptied) } }; },
      buildRequest: ({ attempt, repairCodes, obligations }: any) => { calls.build.push({ attempt, repairCodes, cursor: obligations }); return { contents: [{ parts: [{ text: JSON.stringify({ kind: 'NEXT_ACTION', requestId: `r${calls.build.length}`, attempt, context: { arm: id, attempt } }) }] }] }; },
      interpret: async () => ({ status: 'ACTION', pickedId: 'n1', pickedBackendNodeId: opts.pick ?? GT_ID, locator: { kind: 'role', role: 'button', name: 'Go' }, locatorTier: 'role',
        executable: calls.build.length === 1 && opts.firstExecutable === false ? false : true, gateCodes: [] }),
    },
  };
}

function makeEnv(armSpecs: Record<string, any>, extra: any = {}) {
  const runDir = join(tmp('run'), 'run');
  const store = new run.RunStore(runDir);
  const sent: string[] = [];
  const vertex = { send: async (_body: any, { label }: any) => { sent.push(label); return { status: 200, reply: { status: 'ACTION', obligations: [{ stepIndex: 0, id: 'o1' }] }, rawText: '{}', usage: { prompt: 100, out: 10, thoughts: 0, total: 110 }, modelVersion: 'fake-1', ms: 12, error: null }; } };
  let plans = 0;
  const requests = {
    makeSession: (task: any) => ({ sessionId: `sess-${plans}`, sourceSteps: task.steps.map((_: any, i: number) => ({ stepId: `s${i}` })) }),
    buildSourcePlanRequest: ({ session }: any) => { plans++; return { body: { contents: [{ parts: [{ text: JSON.stringify({ kind: 'SOURCE_PLAN', requestId: 'p', attempt: 1, context: { sessionId: session.sessionId } }) }] }] }, context: { sessionId: session.sessionId } }; },
    admitPlan: (reply: any) => ({ sourceReferences: [], needs: [], obligations: (reply.obligations ?? []).map((o: any, i: number) => ({ obligationId: `ob${i}`, stepId: `s${o.stepIndex}` })) }),
    stubCursor: (task: any) => ({ session: { sourceSteps: task.steps.map((_: any, i: number) => ({ stepId: `s${i}` })) }, plan: { obligations: [] }, stepIndex: 0, done: 0 }),
  };
  const loads = { opened: 0, closed: 0 };
  const env: any = { store, armIds: Object.keys(armSpecs), reps: 2, seed: 7, dry: false, repairJava: false, javaRefusals: new Map(), maxPromptTokens: 1000, freezeOk: true,
    arms: Object.fromEntries(Object.entries(armSpecs).map(([id, spec]) => [id, spec.mod])), vertex, requests, observeTimeoutMs: 1000,
    openTask: async () => { loads.opened++; return { page: {}, cdp: {}, void: false, renewCdp: async () => undefined, close: async () => { loads.closed++; } }; },
    resolveGt: async (_l: any, gt: any) => (gt === null ? { void: false, ids: [], locator: null } : { void: false, ids: [GT_ID], locator: {} }),
    performStep: async () => undefined, ...extra };
  return { env, store, sent, loads, plans: () => plans, runDir };
}
const answerableTask = { id: 'tA', site: 'fixture', url: 'fixture://c01/home', stratum: 'uniqueNav', expect: 'ACTION', steps: [{ text: 'Click "Go"', operation: { kind: 'click' }, gt: { chain: [] } }] };

describe('executeTask', () => {
  it('runs every arm and rep on one load, shares SOURCE_PLAN per rep, and writes scoring-input only for A1/S1/S2', async () => {
    const arms = { A1: fakeArm('A1'), S1: fakeArm('S1'), S3: fakeArm('S3') };
    const { env, store, sent, loads, plans, runDir } = makeEnv(arms);
    const summary = await run.executeTask(env, answerableTask);
    expect(summary).toMatchObject({ skipped: false, units: 6, done: 6 });
    expect(loads).toEqual({ opened: 1, closed: 1 });
    expect(plans()).toBe(2);
    expect(Object.values(arms).map(a => a.calls.observe)).toEqual([1, 1, 1]);
    expect(Object.values(arms).map(a => a.calls.dispose)).toEqual([1, 1, 1]);
    const cursor = arms.A1.calls.build[0].cursor;
    expect(cursor).toMatchObject({ stepIndex: 0, done: 0, plan: { obligations: [{ obligationId: 'ob0', stepId: 's0' }] } });
    expect(JSON.parse(readFileSync(store.planFile('tA', 1), 'utf8')).session.sourceSteps[0].stepId).toBe('s0');
    expect(sent.filter(l => l.includes('|SP|'))).toHaveLength(2);
    expect(sent.filter(l => !l.includes('|SP|'))).toHaveLength(6);
    const rows = jsonl(join(runDir, 'steps.jsonl'));
    expect(rows).toHaveLength(6);
    expect(rows.every((r: any) => r.correctElement && r.correctAndExecutable && r.modelVersion === 'fake-1' && r.key === `tA|0|${r.arm}|${r.rep}|1`)).toBe(true);
    const scoring = jsonl(join(runDir, 'scoring-input.jsonl'));
    expect(scoring.filter((l: any) => l.kind === 'SOURCE_PLAN').map((l: any) => l.key).sort()).toEqual(['tA|-1|SP|1|1', 'tA|-1|SP|2|1']);
    const next = scoring.filter((l: any) => l.kind === 'NEXT_ACTION');
    expect(next.map((l: any) => l.context.arm).sort()).toEqual(['A1', 'A1', 'S1', 'S1']);
    const loadsRow = jsonl(join(runDir, 'loads.jsonl'))[0];
    expect([...loadsRow.armOrder].sort()).toEqual(['A1', 'S1', 'S3']);
    expect(loadsRow.seed).toBe(7);
    expect(store.rows.size).toBe(6);
  });
  it('is resumable: a rerun skips every completed key, and a partial run only makes the missing calls', async () => {
    const arms = { A1: fakeArm('A1'), S2: fakeArm('S2') };
    const first = makeEnv(arms);
    await run.executeTask(first.env, answerableTask);
    expect(first.sent).toHaveLength(2 + 4);
    // same run dir, fresh process state: nothing to do, no load, no calls
    const again = { ...first.env, store: new run.RunStore(first.runDir), openTask: async () => { throw new Error('should not open'); } };
    const sentBefore = first.sent.length;
    expect(await run.executeTask(again, answerableTask)).toMatchObject({ skipped: true, units: 0 });
    expect(first.sent.length).toBe(sentBefore);
    // drop one row: only that unit is re-asked
    const path = join(first.runDir, 'steps.jsonl');
    const kept = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    writeFileSync(path, `${kept.slice(0, -1).join('\n')}\n`);
    const partial = { ...first.env, store: new run.RunStore(first.runDir) };
    const summary = await run.executeTask(partial, answerableTask);
    expect(summary).toMatchObject({ skipped: false, units: 1 });
    expect(first.sent.length).toBe(sentBefore + 1);
    expect(jsonl(path)).toHaveLength(kept.length);
  });
  it('records EMPTIED without a model call when the observation emptied', async () => {
    const arms = { A0: fakeArm('A0', { emptied: true }), A1: fakeArm('A1') };
    const { env, sent, runDir } = makeEnv(arms);
    await run.executeTask(env, answerableTask);
    const rows = jsonl(join(runDir, 'steps.jsonl'));
    const a0 = rows.filter((r: any) => r.arm === 'A0');
    expect(a0).toHaveLength(2);
    expect(a0.every((r: any) => r.outcome === 'EMPTIED' && r.correctAndExecutable === false && r.usage === null)).toBe(true);
    expect(sent.filter(l => l.includes('|A0|'))).toHaveLength(0);
    expect(arms.A0.calls.build).toHaveLength(0);
  });
  it('re-asks once with the repair codes when the harness refuses the first attempt, and resumes that re-ask', async () => {
    const arms = { S3: fakeArm('S3', { firstExecutable: false }) };
    const { env, runDir, sent } = makeEnv(arms, { reps: 1 });
    env.reps = 1;
    await run.executeTask(env, answerableTask);
    const rows = jsonl(join(runDir, 'steps.jsonl'));
    expect(rows.map((r: any) => [r.attempt, r.needsRepair, r.correctAndExecutable])).toEqual([[1, true, false], [2, false, true]]);
    expect(rows[0].repairCodes).toEqual(['LOCATOR_NOT_EXECUTABLE']);
    expect(rows[1].repairCodes).toEqual(['LOCATOR_NOT_EXECUTABLE']);
    expect(arms.S3.calls.build.map((b: any) => ({ attempt: b.attempt, repairCodes: b.repairCodes }))).toEqual([{ attempt: 1, repairCodes: [] }, { attempt: 2, repairCodes: ['LOCATOR_NOT_EXECUTABLE'] }]);
    expect(sent.filter(l => l.endsWith('|2'))).toHaveLength(1);
    // kill between attempt 1 and attempt 2: only the re-ask is pending
    writeFileSync(join(runDir, 'steps.jsonl'), `${JSON.stringify(rows[0])}\n`);
    const resumed = { ...env, store: new run.RunStore(runDir) };
    expect(await run.executeTask(resumed, answerableTask)).toMatchObject({ units: 1 });
  });
  it('D-1: a 429 on a NEXT_ACTION is stored as a retryable infrastructure row, and a resumed run re-attempts only that unit', async () => {
    const arms = { A1: fakeArm('A1'), S2: fakeArm('S2') };
    const first = makeEnv(arms);
    let n = 0;
    first.env.vertex = { send: async (_b: any, { label }: any) => { first.sent.push(label); return label.includes('|S2|1|1') && n++ === 0
      ? { status: 429, reply: null, usage: null, ms: 5, error: 'Resource exhausted' }
      : { status: 200, reply: { status: 'ACTION', obligations: [{ stepIndex: 0 }] }, usage: { prompt: 5, out: 1, thoughts: 0, total: 6 }, modelVersion: 'm', ms: 5, error: null }; } };
    first.env.reps = 1;
    await run.executeTask(first.env, answerableTask);
    const rows = jsonl(join(first.runDir, 'steps.jsonl'));
    const failed = rows.find((r: any) => r.arm === 'S2');
    expect(failed).toMatchObject({ outcome: 'MODEL_ERROR', infraError: true, httpStatus: 429, correctAndExecutable: false });
    expect(run.RETRY_OUTCOMES.has(failed.outcome)).toBe(true);
    const resumedSent: string[] = [];
    const resumed = { ...first.env, reps: 1, store: new run.RunStore(first.runDir), vertex: { send: async (_b: any, { label }: any) => { resumedSent.push(label); return { status: 200, reply: { status: 'ACTION' }, usage: { prompt: 5, out: 1, thoughts: 0, total: 6 }, modelVersion: 'm', ms: 5, error: null }; } } };
    await run.executeTask(resumed, answerableTask);
    expect(resumedSent).toEqual(['tA|0|S2|1|1']);
    const last = new Map(jsonl(join(first.runDir, 'steps.jsonl')).map((r: any) => [r.key, r]));
    expect(last.get('tA|0|S2|1|1')).toMatchObject({ outcome: 'CORRECT' });
  });
  it('D-1: an infrastructure error on the shared SOURCE_PLAN marks every arm retryable, stores no plan, and recovers on resume', async () => {
    const arms = { A1: fakeArm('A1'), S2: fakeArm('S2') };
    const first = makeEnv(arms);
    first.env.reps = 1;
    first.env.vertex = { send: async () => ({ status: 503, reply: null, usage: null, ms: 1, error: 'unavailable' }) };
    await run.executeTask(first.env, answerableTask);
    const rows = jsonl(join(first.runDir, 'steps.jsonl'));
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.outcome === 'MODEL_ERROR' && r.infraError === true && r.planInfra === true)).toBe(true);
    const resumed = { ...first.env, reps: 1, store: new run.RunStore(first.runDir), vertex: { send: async () => ({ status: 200, reply: { status: 'ACTION', obligations: [{ stepIndex: 0 }] }, usage: null, ms: 1, error: null }) } };
    expect(await run.executeTask(resumed, answerableTask)).toMatchObject({ units: 2 });
    expect(new Map(jsonl(join(first.runDir, 'steps.jsonl')).map((r: any) => [r.key, r])).get('tA|0|A1|1|1')).toMatchObject({ outcome: 'CORRECT' });
  });
  it('D-1: HTTP 200 without a parsable reply is an arm failure (INVALID, re-asked once), not an infrastructure error', async () => {
    const arms = { A1: fakeArm('A1') };
    const env = makeEnv(arms);
    env.env.reps = 1;
    let n = 0;
    env.env.vertex = { send: async (_b: any, { label }: any) => (label.includes('|SP|') || ++n > 1 ? { status: 200, reply: { status: 'ACTION', obligations: [{ stepIndex: 0 }] }, usage: null, ms: 1 } : { status: 200, reply: null, usage: { prompt: 3, out: 0, thoughts: 0, total: 3 }, ms: 1, error: null }) };
    await run.executeTask(env.env, answerableTask);
    const rows = jsonl(join(env.runDir, 'steps.jsonl'));
    expect(rows.map((r: any) => [r.attempt, r.outcome])).toEqual([[1, 'INVALID'], [2, 'CORRECT']]);
    expect(rows[0].infraError).toBeUndefined();
  });
  it('D-3: a click step credits a click-equivalent descendant; fill steps keep strict equality', async () => {
    const calls: any[] = [];
    const mkEnv = (kind: string) => {
      const task = { ...answerableTask, id: `t-${kind}`, steps: [{ text: 'step', operation: { kind }, gt: { chain: [] } }] };
      const arm = fakeArm('S2', { pick: 555 });
      const e = makeEnv({ S2: arm }, { equivalent: async (_cdp: any, picked: number, gt: number) => { calls.push([picked, gt]); return { equivalent: true, reason: 'DESCENDANT' }; } });
      e.env.reps = 1;
      return { ...e, task };
    };
    const click = mkEnv('click');
    await run.executeTask(click.env, click.task);
    expect(jsonl(join(click.runDir, 'steps.jsonl'))[0]).toMatchObject({ outcome: 'EQUIVALENT_DESCENDANT', correctAndExecutable: true, strictCorrectAndExecutable: false, strictCorrectElement: false, equivalentDescendant: true, equivalenceReason: 'DESCENDANT' });
    const fill = mkEnv('fill');
    await run.executeTask(fill.env, fill.task);
    expect(jsonl(join(fill.runDir, 'steps.jsonl'))[0]).toMatchObject({ outcome: 'CONFIDENT_WRONG', correctAndExecutable: false });
    expect(calls).toEqual([[555, 100]]);
  });
  it('refuses an S-arm model call without a freeze and makes none', async () => {
    const arms = { S1: fakeArm('S1') };
    const { env, sent } = makeEnv(arms, { freezeOk: false });
    await expect(run.executeTask(env, answerableTask)).rejects.toThrow(/FREEZE_REQUIRED/);
    expect(sent).toHaveLength(0);
  });
  it('writes a VOID entry and makes no model call when the GT is not unique', async () => {
    const arms = { A1: fakeArm('A1') };
    const { env, sent, runDir, loads } = makeEnv(arms, { resolveGt: async () => ({ void: true, reason: 'GT_AMBIGUOUS:2' }) });
    const summary = await run.executeTask(env, answerableTask);
    expect(summary.void).toBe(true);
    expect(sent).toHaveLength(0);
    expect(jsonl(join(runDir, 'void.jsonl'))[0]).toMatchObject({ task: 'tA', stratum: 'uniqueNav', step: 0, reason: 'GT_AMBIGUOUS:2' });
    expect(loads.closed).toBe(1);
  });
  it('stops cleanly on a budget error: no row for the refused call, resumable afterwards', async () => {
    const arms = { A1: fakeArm('A1') };
    const { env, runDir } = makeEnv(arms);
    let n = 0;
    env.vertex = { send: async () => { if (++n > 2) return { status: 0, reply: null, usage: null, ms: 0, error: 'CAP_MAX_CALLS' }; return { reply: { status: 'ACTION', obligations: [{ stepIndex: 0 }] }, usage: { prompt: 1, out: 1, thoughts: 0, total: 2 }, modelVersion: 'm', ms: 1 }; } };
    const outcome = await run.runTasks(env, [answerableTask], { concurrency: 1 });
    expect(outcome.budgetStop).toBe('CAP_MAX_CALLS');
    const rows = jsonl(join(runDir, 'steps.jsonl'));
    expect(rows).toHaveLength(1); // plan 1 and the first A1 call succeeded; the second SOURCE_PLAN hit the cap and left no row
  });
  it('reuses the persisted session and admitted plan on resume, so obligation ids match the scored SOURCE_PLAN', async () => {
    const first = makeEnv({ A1: fakeArm('A1') });
    await run.executeTask(first.env, answerableTask);
    const stored = JSON.parse(readFileSync(first.store.planFile('tA', 2), 'utf8'));
    const rows = readFileSync(join(first.runDir, 'steps.jsonl'), 'utf8').split('\n').filter(Boolean);
    writeFileSync(join(first.runDir, 'steps.jsonl'), `${rows[0]}\n`);
    const arm = fakeArm('A1');
    const resumed = { ...first.env, arms: { A1: arm.mod }, store: new run.RunStore(first.runDir) };
    await run.executeTask(resumed, answerableTask);
    expect(first.plans()).toBe(2);
    expect(arm.calls.build[0].cursor.session.sessionId).toBe(stored.session.sessionId);
  });
  it('records NO_OBLIGATION (no model call) when the plan has none for the step, and OVER_CAP for a per-call cap refusal', async () => {
    const arms = { A1: fakeArm('A1') };
    const none = makeEnv(arms);
    none.env.requests.admitPlan = () => ({ sourceReferences: [], needs: [], obligations: [] });
    await run.executeTask(none.env, answerableTask);
    expect(jsonl(join(none.runDir, 'steps.jsonl')).every((r: any) => r.outcome === 'NO_OBLIGATION' && r.correctAndExecutable === false)).toBe(true);
    expect(none.sent.filter(l => !l.includes('|SP|'))).toHaveLength(0);
    const capped = makeEnv({ A1: fakeArm('A1') });
    capped.env.vertex = { send: async (_b: any, { label }: any) => (label.includes('|SP|') ? { reply: { obligations: [{ stepIndex: 0 }] }, usage: null, ms: 1 } : { status: 0, reply: null, usage: null, ms: 0, error: 'CAP_PER_CALL_ESTIMATE' }) };
    await run.executeTask(capped.env, answerableTask);
    const rows = jsonl(join(capped.runDir, 'steps.jsonl'));
    expect(rows.map((r: any) => r.outcome)).toEqual(['OVER_CAP', 'OVER_CAP']);
    // OVER_CAP is a recorded failure, not retried on resume
    expect(run.pendingUnits({ task: answerableTask, armIds: ['A1'], reps: 2, rows: new run.RunStore(capped.runDir).rows })).toHaveLength(0);
  });
  it('a dry run writes no steps, scoring input or plans and makes no model call', async () => {
    const arms = { S3: fakeArm('S3') };
    const { env, sent, runDir } = makeEnv(arms, { dry: true, freezeOk: false });
    env.store = new run.RunStore(runDir, { dry: true });
    await run.executeTask(env, answerableTask);
    expect(sent).toHaveLength(0);
    const dry = jsonl(join(runDir, 'dry.jsonl'));
    expect(dry).toHaveLength(2);
    expect(dry[0].requestBytes).toBeGreaterThan(0);
  });
});

describe('D-10: Java scoring input carries the structured observation for outline arms', () => {
  it('decodes an S1/S2 outline back to the exact observation and leaves JSON observations alone', async () => {
    const render = await load('../../evaluation/grounding/lib/renderCurrent.mjs');
    const requests = await load('../../evaluation/grounding/lib/requests.mjs');
    const template = requests.loadTemplate('next-action');
    const original = JSON.parse(template.contents[0].parts[0].text).context.observation;
    const observation = { ...original, schemaVersion: 3, sessionId: 'spk07', scopeHash: 'a'.repeat(64), observedAt: '2026-10-26T19:11:23.904Z' };
    const context = { sessionId: 'ctx', observation: render.encode(observation) };
    expect(run.scoringContext(context, observation.observedAt)).toEqual({ sessionId: 'ctx', observation });
    const json = { sessionId: 'ctx', observation };
    expect(run.scoringContext(json, 'ignored')).toBe(json);
    expect(run.scoringContext(null, 'x')).toBeNull();
  });
});
