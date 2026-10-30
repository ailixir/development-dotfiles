/* eslint-disable -- dynamic imports of untyped SPK-07 .mjs modules */
/**
 * SPK-07 post-hoc "S3 v2" round: the repair retry rule, the per-row `wave` field, the report's freshSitesOnly variant and
 * POST-HOC label, and assemble-v2.mjs on small fixture dirs.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const load = async (rel: string): Promise<any> => import(new URL(rel, import.meta.url).href);
const run = await load('../../evaluation/grounding/run.mjs');
const report = await load('../../evaluation/grounding/report.mjs');
const assembler = await load('../../evaluation/grounding/assemble-v2.mjs');
const dirs: string[] = [];
const tmp = (prefix: string) => { const dir = mkdtempSync(join(tmpdir(), `spk07-f-${prefix}-`)); dirs.push(dir); return dir; };
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const jsonl = (path: string): any[] => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
const writeJsonl = (path: string, rows: any[]) => writeFileSync(path, rows.length ? `${rows.map(r => JSON.stringify(r)).join('\n')}\n` : '');

// ---- run.mjs: repair retry rule ---------------------------------------------------------------------------------

describe('pendingUnits under repairJava', () => {
  const task = { id: 't', steps: [{}] };
  const k = (attempt: number) => run.keyOf('t', 0, 'A1', 1, attempt);
  const refusals = new Map([[k(1), 'X']]);
  const pending = (rows: Map<string, any>) => run.pendingUnits({ task, armIds: ['A1'], reps: 1, rows, javaRefusals: refusals, repairJava: true });
  const unit = [{ step: 0, arm: 'A1', rep: 1, attempt: 2, repairCodes: ['X'] }];

  it('asks attempt 2 when it is missing', () => {
    expect(pending(new Map([[k(1), { outcome: 'GATED' }]]))).toEqual(unit);
  });
  it('asks attempt 2 again when the existing attempt-2 row is a retryable infra row', () => {
    expect(pending(new Map([[k(1), { outcome: 'GATED' }], [k(2), { outcome: 'MODEL_ERROR' }]]))).toEqual(unit);
    expect(pending(new Map([[k(1), { outcome: 'GATED' }], [k(2), { outcome: 'OBSERVE_ERROR' }]]))).toEqual(unit);
  });
  it('leaves a final attempt-2 row alone and never retries without an attempt-1 row', () => {
    expect(pending(new Map([[k(1), { outcome: 'GATED' }], [k(2), { outcome: 'CORRECT' }]]))).toEqual([]);
    expect(pending(new Map([[k(1), { outcome: 'GATED' }], [k(2), { outcome: 'INVALID' }]]))).toEqual([]);
    expect(pending(new Map())).toEqual([]);
  });
});

// ---- run.mjs: wave field ----------------------------------------------------------------------------------------

describe('step rows carry the task wave', () => {
  async function runOne(task: any) {
    const runDir = join(tmp('run'), 'run');
    const store = new run.RunStore(runDir);
    const arm = {
      observe: async () => ({ payload: {}, idMap: {}, dispose: async () => undefined, meta: { bytes: 10, nodes: 1, ms: 1, admittedUnderProductionLimits: true, gatewayInputAdmitted: true, emptied: false } }),
      buildRequest: () => ({ contents: [{ parts: [{ text: JSON.stringify({ kind: 'NEXT_ACTION', requestId: 'r', attempt: 1, context: {} }) }] }] }),
      interpret: async () => ({ status: 'ACTION', pickedId: 'n1', pickedBackendNodeId: 100, locator: { kind: 'role' }, locatorTier: 'role', executable: true, gateCodes: [] }),
    };
    const vertex = { send: async () => ({ status: 200, reply: { status: 'ACTION', obligations: [{ stepIndex: 0 }] }, usage: { prompt: 1, out: 1, thoughts: 0, total: 2 }, modelVersion: 'fake', ms: 1, error: null }) };
    const requests = {
      makeSession: (t: any) => ({ sessionId: 's', sourceSteps: t.steps.map((_: any, i: number) => ({ stepId: `s${i}` })) }),
      buildSourcePlanRequest: () => ({ body: { contents: [{ parts: [{ text: JSON.stringify({ kind: 'SOURCE_PLAN', requestId: 'p', attempt: 1, context: {} }) }] }] }, context: {} }),
      admitPlan: (reply: any) => ({ obligations: reply.obligations.map((o: any) => ({ obligationId: 'ob', stepId: `s${o.stepIndex}` })) }),
    };
    const env: any = { store, armIds: ['A1'], reps: 1, seed: 1, dry: false, repairJava: false, javaRefusals: new Map(), maxPromptTokens: 1000, freezeOk: true, arms: { A1: arm }, vertex, requests, observeTimeoutMs: 1000,
      openTask: async () => ({ page: {}, cdp: {}, void: false, renewCdp: async () => undefined, close: async () => undefined }), resolveGt: async () => ({ void: false, ids: [100], locator: {} }), performStep: async () => undefined };
    await run.executeTask(env, task);
    return jsonl(join(runDir, 'steps.jsonl'));
  }
  const base = { site: 'fixture', url: 'fixture://c01/home', stratum: 'uniqueNav', expect: 'ACTION', steps: [{ text: 'Click "Go"', operation: { kind: 'click' }, gt: { chain: [] } }] };

  it('copies wave 2 from the task and defaults to wave 1', async () => {
    expect((await runOne({ ...base, id: 'w2', wave: 2, heldOut: true })).map((r: any) => r.wave)).toEqual([2]);
    expect((await runOne({ ...base, id: 'w1' })).map((r: any) => r.wave)).toEqual([1]);
  });
});

// ---- report.mjs: freshSitesOnly and POST-HOC --------------------------------------------------------------------

function makeReportRun(opts: { postHoc?: boolean } = {}) {
  const parent = tmp('rep');
  const dir = join(parent, 'run1');
  mkdirSync(dir);
  const rows: any[] = [];
  // 20 wave-1 tasks (no wave field; S3 and S2 tie) and 10 wave-2 tasks (S3 always right, S2 never).
  const add = (task: string, wave: number | undefined, okS3: boolean, okS2: boolean) => {
    for (const [arm, ok] of [['S3', okS3], ['S2', okS2]] as const) {
      for (let rep = 1; rep <= 3; rep++) {
        rows.push({ key: `${task}|0|${arm}|${rep}|1`, task, step: 0, arm, rep, attempt: 1, expect: 'ACTION', stratum: 'uniqueNav', status: 'ACTION', ...(wave === undefined ? {} : { wave }), correctElement: ok, executable: ok,
          correctAndExecutable: ok, confidentWrong: false, clarificationOnAnswerable: false, gateCodes: [], needsRepair: false, usage: { prompt: 100, out: 5, thoughts: 0, total: 105 }, ms: 10, modelVersion: 'fake',
          meta: { bytes: 100, nodes: 3, ms: 3, admittedUnderProductionLimits: true, gatewayInputAdmitted: true, emptied: false } });
      }
    }
  };
  for (let t = 0; t < 20; t++) add(`a${t}`, undefined, true, true);
  for (let t = 0; t < 10; t++) add(`b${t}`, 2, true, false);
  writeJsonl(join(dir, 'steps.jsonl'), rows);
  writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 'r1', seed: 5, reps: 3, startedAt: '2026-10-27T10:00:00Z', ...(opts.postHoc ? { postHoc: true, assembledFrom: { base: 'final-x', s3v2: 's3v2-x', wave2: 'wave2-x', note: 'unit-test marker' } } : {}) }));
  return dir;
}

describe('report freshSitesOnly sensitivity variant', () => {
  it('counts only wave-2 answerable rows; rows without a wave are wave 1', () => {
    const analysis = report.analyze(makeReportRun());
    const fresh = analysis.sensitivity.primary.freshSitesOnly;
    expect(fresh.units).toBe(10);
    expect(fresh.diff).toBe(1);
    // the full comparison still sees all 30 units and is unchanged by the new variant
    expect(analysis.comparisons.primary.units).toBe(30);
    expect(analysis.sensitivity.primary.realSitesOnly.units).toBe(30);
    expect(analysis.sensitivity.primary.heldOutOnly).toBeNull(); // no held-out rows in this fixture: unchanged behaviour
  });
  it('is rendered as a column of the sensitivity table', () => {
    const { markdown } = report.buildReport(makeReportRun(), { verify: false });
    const header = markdown.split('\n').find((line: string) => line.startsWith('| comparison |'))!;
    expect(header).toBe('| comparison | admitted | afterReask | realSitesOnly | heldOutOnly | freshSitesOnly | strictLocators | strictEquality |');
    expect(markdown).toMatch(/\| S3 vs S2 \|.*\+?100\.0% \[100\.0%, 100\.0%\] \(10\)/);
  });
});

describe('report POST-HOC label', () => {
  it('prints a bold POST-HOC line under the title, postHoc and assembledFrom for a post-hoc run', () => {
    const { markdown } = report.buildReport(makeReportRun({ postHoc: true }), { verify: false });
    const lines = markdown.split('\n');
    expect(lines[0]).toBe('# SPK-07 grounding benchmark report');
    expect(lines.slice(1, 4).some((line: string) => /^\*\*POST-HOC\*\*/.test(line))).toBe(true);
    expect(markdown).toMatch(/\| postHoc \| true \|/);
    expect(markdown).toMatch(/\| assembledFrom \| .*unit-test marker/);
  });
  it('prints none of it for an ordinary run', () => {
    const { markdown } = report.buildReport(makeReportRun(), { verify: false });
    expect(markdown).not.toMatch(/POST-HOC|postHoc|assembledFrom/);
  });
});

// ---- assemble-v2.mjs -------------------------------------------------------------------------------------------

const row = (task: string, arm: string, extra: object = {}) => ({ key: `${task}|0|${arm}|1|1`, task, step: 0, arm, rep: 1, attempt: 1, ...extra });
const planFile = (dir: string, name: string, tag: string) => { mkdirSync(join(dir, 'plans'), { recursive: true }); writeFileSync(join(dir, 'plans', name), JSON.stringify({ tag })); };

function fixture() {
  const root = tmp('asm');
  const base = join(root, 'base'); const s3v2 = join(root, 's3v2'); const wave2 = join(root, 'wave2');
  for (const dir of [base, s3v2, wave2]) mkdirSync(dir);
  const baseArms = ['A0', 'A1', 'S1', 'S2', 'S3', 'S4'];
  const baseTasks = ['t1', 'neg-gov-02'];
  writeJsonl(join(base, 'steps.jsonl'), baseTasks.flatMap(task => baseArms.map(arm => row(task, arm, { src: 'base' }))));
  writeJsonl(join(base, 'void.jsonl'), [{ task: 't1', step: 0, reason: 'GT_NOT_UNIQUE' }, { task: 'neg-gov-02', step: 0, reason: 'old' }]);
  writeJsonl(join(base, 'scoring-input.jsonl'), [...baseTasks.flatMap(task => ['A1', 'S1', 'S2'].map(arm => ({ key: `${task}|0|${arm}|1|1`, kind: 'NEXT_ACTION' }))), { key: 't1|-1|SP|1|1', kind: 'SOURCE_PLAN' }, { key: 'neg-gov-02|-1|SP|1|1', kind: 'SOURCE_PLAN' }]);
  writeJsonl(join(base, 'scoring-output.jsonl'), baseTasks.map(task => ({ key: `${task}|0|S2|1|1`, verdict: 'ADMITTED' })));
  writeJsonl(join(base, 'loads.jsonl'), baseTasks.map(task => ({ task, src: 'base' })));
  writeJsonl(join(base, 'replies.jsonl'), [{ key: 't1|0|S3|1|1', reply: {} }, { key: 't1|0|A1|1|1', reply: {} }]);
  planFile(base, 't1.1.json', 'base-t1'); planFile(base, 'neg-gov-02.1.json', 'base-neg');
  writeFileSync(join(base, 'run.json'), JSON.stringify({ runId: 'base', seed: 9, profile: '4h', arms: baseArms, repsByArm: { A0: 1, A1: 1, S1: 1, S2: 2, S3: 2, S4: 2 }, plannedTasks: [{ id: 'stale' }] }));

  writeJsonl(join(s3v2, 'steps.jsonl'), [row('t1', 'S3', { src: 's3v2' }), row('neg-gov-02', 'S3', { src: 's3v2' }), row('t1', 'S2', { src: 's3v2-stray' })]);
  writeJsonl(join(s3v2, 'void.jsonl'), [{ task: 'neg-gov-02', step: 0, reason: 'x' }]);
  writeJsonl(join(s3v2, 'loads.jsonl'), [{ task: 't1', src: 's3v2' }, { task: 'neg-gov-02', src: 's3v2' }]);
  writeJsonl(join(s3v2, 'replies.jsonl'), [{ key: 't1|0|S3|1|1', reply: { v: 2 } }]);
  writeFileSync(join(s3v2, 'safety.json'), JSON.stringify({ maskDifferences: 0 })); writeFileSync(join(s3v2, 'leakscan.json'), JSON.stringify({ hits: [] }));
  writeFileSync(join(s3v2, 'run.json'), JSON.stringify({ runId: 's3v2' }));

  writeJsonl(join(wave2, 'steps.jsonl'), ['t2', 'neg-gov-02'].flatMap(task => baseArms.map(arm => row(task, arm, { src: 'wave2', wave: 2 }))));
  writeJsonl(join(wave2, 'void.jsonl'), [{ task: 't2', step: 0, reason: 'GT_NOT_UNIQUE' }]);
  writeJsonl(join(wave2, 'scoring-input.jsonl'), [{ key: 't2|0|A1|1|1', kind: 'NEXT_ACTION' }, { key: 't2|-1|SP|1|1', kind: 'SOURCE_PLAN' }]);
  writeJsonl(join(wave2, 'loads.jsonl'), [{ task: 't2', src: 'wave2' }]);
  planFile(wave2, 't2.1.json', 'wave2-t2'); planFile(wave2, 'neg-gov-02.1.json', 'wave2-neg');
  writeFileSync(join(wave2, 'run.json'), JSON.stringify({ runId: 'wave2' }));

  const step = [{ text: 's' }];
  writeJsonl(join(root, 'tasks.jsonl'), [{ id: 't1', stratum: 'uniqueNav', site: 'a.com', steps: step }, { id: 'neg-gov-02', stratum: 'negative', site: 'gov.uk', steps: step, wave: 2 },
    { id: 't2', stratum: 'labeledField', site: 'b.com', wave: 2, steps: [...step, ...step] }, { id: 't3', stratum: 'chain', site: 'c.com', steps: step }]);
  return { root, base, s3v2, wave2, corpus: join(root, 'tasks.jsonl'), out: join(root, 'out') };
}
const snapshot = (dir: string): Record<string, string> => Object.fromEntries(readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => [join(e.parentPath, e.name), readFileSync(join(e.parentPath, e.name), 'utf8')]));

describe('assemble-v2', () => {
  it('combines base A0/A1/S1/S2, s3v2 S3 and wave-2 A0-S3, without S4, wave-1 S3 or the old neg-gov-02', () => {
    const f = fixture();
    const before = [snapshot(f.base), snapshot(f.s3v2), snapshot(f.wave2)];
    const result = assembler.assemble({ out: f.out, base: f.base, s3v2: f.s3v2, wave2: f.wave2, corpus: f.corpus });
    expect([snapshot(f.base), snapshot(f.s3v2), snapshot(f.wave2)]).toEqual(before); // sources untouched

    const steps = jsonl(join(f.out, 'steps.jsonl'));
    const tag = (task: string) => steps.filter(r => r.task === task).map(r => `${r.arm}:${r.src}`).sort();
    expect(tag('t1')).toEqual(['A0:base', 'A1:base', 'S1:base', 'S2:base', 'S3:s3v2']);
    expect(tag('t2')).toEqual(['A0:wave2', 'A1:wave2', 'S1:wave2', 'S2:wave2', 'S3:wave2']);
    expect(tag('neg-gov-02')).toEqual(['A0:wave2', 'A1:wave2', 'S1:wave2', 'S2:wave2', 'S3:wave2']);
    expect(steps.some(r => r.arm === 'S4')).toBe(false);
    expect(result.counts['steps.jsonl']).toEqual({ base: 4, s3v2: 1, wave2: 10 });

    expect(jsonl(join(f.out, 'void.jsonl')).map(r => `${r.task}:${r.reason}`)).toEqual(['t1:GT_NOT_UNIQUE', 't2:GT_NOT_UNIQUE']);
    expect(jsonl(join(f.out, 'loads.jsonl')).map(r => `${r.task}:${r.src}`)).toEqual(['t1:base', 't1:s3v2', 't2:wave2']);
    expect(jsonl(join(f.out, 'scoring-input.jsonl')).map(r => r.key)).toEqual(['t1|0|A1|1|1', 't1|0|S1|1|1', 't1|0|S2|1|1', 't1|-1|SP|1|1', 't2|0|A1|1|1', 't2|-1|SP|1|1']);
    expect(jsonl(join(f.out, 'scoring-output.jsonl')).map(r => r.key)).toEqual(['t1|0|S2|1|1']);
    // replies: base wave-1 S3 reply dropped, s3v2 S3 reply kept
    expect(jsonl(join(f.out, 'replies.jsonl'))).toEqual([{ key: 't1|0|A1|1|1', reply: {} }, { key: 't1|0|S3|1|1', reply: { v: 2 } }]);

    expect(readdirSync(join(f.out, 'plans')).sort()).toEqual(['neg-gov-02.1.json', 't1.1.json', 't2.1.json']);
    expect(JSON.parse(readFileSync(join(f.out, 'plans', 'neg-gov-02.1.json'), 'utf8')).tag).toBe('wave2-neg');
    expect(JSON.parse(readFileSync(join(f.out, 'plans', 't1.1.json'), 'utf8')).tag).toBe('base-t1');
    expect(existsSync(join(f.out, 'safety.json')) && existsSync(join(f.out, 'leakscan.json'))).toBe(true);

    const runJson = JSON.parse(readFileSync(join(f.out, 'run.json'), 'utf8'));
    expect(runJson).toMatchObject({ runId: 'out', seed: 9, profile: '4h', postHoc: true, arms: ['A0', 'A1', 'S1', 'S2', 'S3'], assembledFrom: { base: 'base', s3v2: 's3v2', wave2: 'wave2' } });
    expect(runJson.assembledFrom.note).toBeTruthy();
    expect(runJson.repsByArm.S4).toBeUndefined();
    expect(runJson.plannedTasks).toEqual([{ id: 't1', stratum: 'uniqueNav', site: 'a.com', steps: 1 }, { id: 't3', stratum: 'chain', site: 'c.com', steps: 1 },
      { id: 'neg-gov-02', stratum: 'negative', site: 'gov.uk', steps: 1 }, { id: 't2', stratum: 'labeledField', site: 'b.com', steps: 2 }]);
  });

  it('--fresh-only keeps only the wave-2 tasks of the wave2 run', () => {
    const f = fixture();
    // an extra wave-1 task in the wave2 run must be dropped: it is not a wave-2 task in the corpus
    writeJsonl(join(f.wave2, 'steps.jsonl'), [...jsonl(join(f.wave2, 'steps.jsonl')), row('t3', 'A1', { src: 'wave2' })]);
    assembler.assemble({ out: f.out, base: f.base, s3v2: f.s3v2, wave2: f.wave2, corpus: f.corpus, freshOnly: true });
    const steps = jsonl(join(f.out, 'steps.jsonl'));
    expect([...new Set(steps.map(r => r.task))].sort()).toEqual(['neg-gov-02', 't2']);
    expect(steps.every(r => r.src === 'wave2' && r.arm !== 'S4')).toBe(true);
    expect(readdirSync(join(f.out, 'plans')).sort()).toEqual(['neg-gov-02.1.json', 't2.1.json']);
    const runJson = JSON.parse(readFileSync(join(f.out, 'run.json'), 'utf8'));
    expect(runJson.plannedTasks.map((t: any) => t.id)).toEqual(['neg-gov-02', 't2']);
    expect(runJson.postHoc).toBe(true);
  });

  it('refuses to overwrite an existing --out, and parses its flags', () => {
    const f = fixture();
    mkdirSync(f.out);
    writeFileSync(join(f.out, 'keep.txt'), 'x');
    expect(() => assembler.assemble({ out: f.out, base: f.base, s3v2: f.s3v2, wave2: f.wave2, corpus: f.corpus })).toThrow(/OUT_EXISTS/);
    expect(readFileSync(join(f.out, 'keep.txt'), 'utf8')).toBe('x');
    expect(() => assembler.assemble({ out: join(f.root, 'o2'), base: join(f.root, 'missing'), s3v2: f.s3v2, wave2: f.wave2, corpus: f.corpus })).toThrow(/SOURCE_MISSING/);
    expect(assembler.parseArgs(['--out', 'runs/x', '--fresh-only'])).toMatchObject({ out: 'runs/x', freshOnly: true, base: 'runs/final-20261026', s3v2: 'runs/s3v2-20261027', wave2: 'runs/wave2-20261027' });
    expect(() => assembler.parseArgs([])).toThrow(/OUT_REQUIRED/);
    expect(() => assembler.parseArgs(['--out', 'x', '--bogus'])).toThrow(/UNKNOWN_ARGUMENT/);
  });

  it('the assembled dir is readable by the report (post-hoc label, S4 absent)', () => {
    const f = fixture();
    assembler.assemble({ out: f.out, base: f.base, s3v2: f.s3v2, wave2: f.wave2, corpus: f.corpus });
    const analysis = report.analyze(f.out);
    expect(analysis.run.postHoc).toBe(true);
    expect(analysis.arms).not.toContain('S4');
  });
});
