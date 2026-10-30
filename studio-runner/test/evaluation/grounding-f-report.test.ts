/* eslint-disable -- dynamic imports of untyped SPK-07 .mjs modules */
/**
 * SPK-07 workstream F: the report computes stage verdicts from the run dir. A planted confident-wrong row must give
 * NO-GO; a clean synthetic run with every piece of evidence gives GO; missing evidence gives INCOMPLETE.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const load = async (rel: string): Promise<any> => import(new URL(rel, import.meta.url).href);
const report = await load('../../evaluation/grounding/report.mjs');
const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

interface Spec { tasks?: number; wrongS2?: string[]; withEvidence?: boolean; a1OkEvery?: number }
function makeRun(spec: Spec = {}) {
  const parent = mkdtempSync(join(tmpdir(), 'spk07-f-rep-'));
  dirs.push(parent);
  const dir = join(parent, 'run1');
  mkdirSync(dir);
  const tasks = spec.tasks ?? 30;
  const rows: any[] = [];
  for (let t = 0; t < tasks; t++) {
    for (const arm of ['A1', 'S2', 'S1']) {
      for (let rep = 1; rep <= 3; rep++) {
        const task = `t${t}`;
        const ok = arm === 'S2' ? !(spec.wrongS2 ?? []).includes(task) : arm === 'S1' ? t % 2 === 0 || t % 3 === 0 : t % (spec.a1OkEvery ?? 3) === 0;
        const wrongExecutable = arm === 'S2' && !ok;
        rows.push({ key: `${task}|0|${arm}|${rep}|1`, task, step: 0, arm, rep, attempt: 1, expect: 'ACTION', stratum: 'uniqueNav', status: 'ACTION', correctElement: ok, executable: ok || wrongExecutable,
          correctAndExecutable: ok, confidentWrong: wrongExecutable, clarificationOnAnswerable: false, gateCodes: [], needsRepair: false, usage: { prompt: arm === 'A1' ? 9000 : 3000, out: 20, thoughts: 0, total: 9100 }, ms: 800, modelVersion: 'fake-1',
          meta: { bytes: 5000, nodes: 10, ms: 30, admittedUnderProductionLimits: true, gatewayInputAdmitted: true, emptied: false } });
      }
    }
  }
  writeFileSync(join(dir, 'steps.jsonl'), `${rows.map(r => JSON.stringify(r)).join('\n')}\n`);
  writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 'r1', seed: 5, reps: 3, startedAt: '2026-10-26T10:00:00Z', freeze: { ok: true, sha256: 'abc' } }));
  if (spec.withEvidence) {
    mkdirSync(join(parent, 'f1-x'));
    writeFileSync(join(parent, 'f1-x', 'summary.json'), JSON.stringify({ pass: true }));
    writeFileSync(join(dir, 'leakscan.json'), JSON.stringify({ hits: [], scannedFiles: 4, canaries: 2 }));
    writeFileSync(join(dir, 'safety.json'), JSON.stringify({ maskDifferences: 0, hostile: { total: 4, passed: 4 }, injected: { total: 6, passed: 6 } }));
    writeFileSync(join(dir, 'durability.jsonl'), ['S1', 'S2', 'S3', 'S4'].map(arm => `${JSON.stringify({ task: 't0', step: 0, arm, tier: 'role', outcome: 'OK', engineChecked: true, hoursSinceRun: 0.2 })}\n`).join(''));
  }
  return dir;
}
const stage = (analysis: any, n: number) => analysis.stages.find((s: any) => s.stage === n);

describe('report stage rules', () => {
  it('computes GO for stage 1 from a clean run with S2 clearly above A1 and every evidence file present', () => {
    const analysis = report.analyze(makeRun({ withEvidence: true }));
    expect(analysis.comparisons.s2VsA1.bootstrap.lo).toBeGreaterThan(0);
    expect(stage(analysis, 1).verdict).toBe('GO');
    expect(analysis.hardZeros.confidentWrong.S2.count).toBe(0);
  });
  it('computes NO-GO when a confident-wrong row is planted, naming the key', () => {
    const analysis = report.analyze(makeRun({ withEvidence: true, wrongS2: ['t4'] }));
    const s1 = stage(analysis, 1);
    expect(analysis.hardZeros.confidentWrong.S2.count).toBe(3);
    expect(s1.verdict).toBe('NO-GO');
    const failed = s1.checks.filter((c: any) => c.pass === false);
    expect(failed.map((c: any) => c.name).join(' ')).toMatch(/HZ-1/);
    expect(failed[0].detail).toContain('t4|0|S2');
  });
  it('a Java REFUSED verdict removes a row from the confident-wrong count', () => {
    const dir = makeRun({ withEvidence: true, wrongS2: ['t4'] });
    writeFileSync(join(dir, 'scoring-output.jsonl'), [1, 2, 3].map(rep => JSON.stringify({ key: `t4|0|S2|${rep}|1`, verdict: 'REFUSED', code: 'TARGET_INTENT_MISMATCH', stage: 'action' })).join('\n'));
    const analysis = report.analyze(dir);
    expect(analysis.hardZeros.confidentWrong.S2.count).toBe(0);
    expect(analysis.java.byArm.S2.REFUSED).toBe(3);
  });
  it('a wrong-unique durability row, a leak hit or a hostile failure each give NO-GO', () => {
    const wrongUnique = makeRun({ withEvidence: true });
    writeFileSync(join(wrongUnique, 'durability.jsonl'), `${JSON.stringify({ task: 't0', step: 0, arm: 'S2', tier: 'role', outcome: 'WRONG_UNIQUE', engineChecked: true, hoursSinceRun: 0.2 })}\n`);
    expect(stage(report.analyze(wrongUnique), 1).verdict).toBe('NO-GO');
    const leak = makeRun({ withEvidence: true });
    writeFileSync(join(leak, 'leakscan.json'), JSON.stringify({ hits: [{ file: 'calls.jsonl', offset: 3, kind: 'canary' }], scannedFiles: 4, canaries: 1 }));
    expect(stage(report.analyze(leak), 1).verdict).toBe('NO-GO');
    const hostile = makeRun({ withEvidence: true });
    writeFileSync(join(hostile, 'safety.json'), JSON.stringify({ maskDifferences: 0, hostile: { total: 4, passed: 3 }, injected: { total: 6, passed: 6 } }));
    expect(stage(report.analyze(hostile), 1).verdict).toBe('NO-GO');
  });
  it('is INCOMPLETE, never GO, when evidence is missing; stages for arms that were not run are INCOMPLETE', () => {
    const analysis = report.analyze(makeRun());
    expect(stage(analysis, 1).verdict).toBe('INCOMPLETE');
    expect(stage(analysis, 3).verdict).toBe('INCOMPLETE');
    expect(stage(analysis, 4).verdict).toBe('INCOMPLETE');
  });
  it('is NO-GO for stage 1 when S2 is not above A1 even with all evidence', () => {
    const analysis = report.analyze(makeRun({ withEvidence: true, a1OkEvery: 1 }));
    expect(stage(analysis, 1).verdict).toBe('NO-GO');
  });
  it('stage 2 compares S1 with A1 on accuracy and the summed prompt-token ratio', () => {
    const analysis = report.analyze(makeRun({ withEvidence: true }));
    const checks = stage(analysis, 2).checks;
    expect(checks.find((c: any) => /cheaper/.test(c.name)).pass).toBe(true);
    expect(checks.find((c: any) => /not worse/.test(c.name)).pass).toBe(true);
  });
  it('an HZ-6 engine/public mismatch gives NO-GO for stage 1', () => {
    const dir = makeRun({ withEvidence: true });
    writeFileSync(join(dir, 'durability.jsonl'), `${JSON.stringify({ task: 't0', step: 0, arm: 'S2', tier: 'role', outcome: 'OK', engineChecked: true, hz6: true, hoursSinceRun: 0.2 })}\n`);
    const checks = stage(report.analyze(dir), 1).checks;
    expect(checks.find((c: any) => /HZ-6/.test(c.name)).pass).toBe(false);
    expect(stage(report.analyze(dir), 1).verdict).toBe('NO-GO');
  });
  it('stage 2 uses the -3 pp non-inferiority margin and the token-ratio CI upper bound', () => {
    const analysis = report.analyze(makeRun({ withEvidence: true }));
    expect(analysis.tokenRatio.ratio).toBeCloseTo(1 / 3, 6);
    expect(analysis.tokenRatio.hi).toBeLessThan(1);
    expect(stage(analysis, 2).verdict).toBe('GO');
    const costly = makeRun({ withEvidence: true });
    // an S1 that costs as much as A1 fails the cost reading
    const rows = readFileSync(join(costly, 'steps.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    writeFileSync(join(costly, 'steps.jsonl'), `${rows.map(r => JSON.stringify(r.arm === 'S1' ? { ...r, usage: { ...r.usage, prompt: 9000 } } : r)).join('\n')}\n`);
    const failed = stage(report.analyze(costly), 2).checks.find((c: any) => /cheaper/.test(c.name));
    expect(failed.pass).toBe(false);
    // an S1 clearly worse than A1 fails the non-inferiority reading
    const worse = makeRun({ withEvidence: true });
    const wrows = readFileSync(join(worse, 'steps.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    writeFileSync(join(worse, 'steps.jsonl'), `${wrows.map(r => JSON.stringify(r.arm === 'S1' ? { ...r, correctAndExecutable: false, correctElement: false } : r)).join('\n')}\n`);
    expect(stage(report.analyze(worse), 2).checks.find((c: any) => /not worse/.test(c.name)).pass).toBe(false);
  });
  it('success needs no gate but product-admitted success does; COMPLETE is a hard zero even when gated', () => {
    const dir = makeRun({ withEvidence: true });
    const rows = readFileSync(join(dir, 'steps.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const planted = rows.map(r => (r.arm === 'S1' && r.task === 't0' ? { ...r, gateCodes: ['INTENT_MISMATCH'] } : r.arm === 'A1' && r.task === 't1' && r.rep === 1 ? { ...r, status: 'COMPLETE', correctAndExecutable: false, confidentWrong: true, gateCodes: ['X'] } : r));
    writeFileSync(join(dir, 'steps.jsonl'), `${planted.map(r => JSON.stringify(r)).join('\n')}\n`);
    const analysis = report.analyze(dir);
    const s1 = analysis.perArmStratum.S1.ALL;
    expect(s1.admittedSuccess.k).toBe(s1.correctAndExecutable.k - 3);
    expect(analysis.hardZeros.confidentWrong.A1.count).toBe(1);
  });
  it('stage 4 treats a positive estimate with a CI including 0 as inconclusive, which is a no-go', () => {
    const dir = makeRun({ withEvidence: true });
    const rows = readFileSync(join(dir, 'steps.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const extra: any[] = [];
    for (let t = 0; t < 6; t++) for (const arm of ['S3', 'S4']) for (let rep = 1; rep <= 3; rep++) {
      const ok = arm === 'S4' ? t < 4 : t < 3;
      extra.push({ ...rows[0], key: `v${t}|0|${arm}|${rep}|1`, task: `v${t}`, arm, rep, stratum: 'iconOnly', correctAndExecutable: ok, correctElement: ok, confidentWrong: false });
    }
    writeFileSync(join(dir, 'steps.jsonl'), `${[...rows, ...extra].map(r => JSON.stringify(r)).join('\n')}\n`);
    const s4 = stage(report.analyze(dir), 4);
    const visual = s4.checks.find((c: any) => /S4 > S3/.test(c.name));
    expect(visual.pass).toBe(false);
    expect(visual.detail).toMatch(/inconclusive/);
    expect(s4.verdict).toBe('NO-GO');
  });
  it('admission: A0-S2 production needs the translation cap too; S3 reports it and the max wire size without gating on it', () => {
    const dir = makeRun({ withEvidence: true });
    const rows = readFileSync(join(dir, 'steps.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const patched = rows.map(r => (r.arm === 'A1' ? { ...r, requestBytes: 1000, meta: { ...r.meta, translationInputAdmitted: r.task !== 't0', translationInputBytes: 70000 } } : r.arm === 'S2' ? { ...r, requestBytes: 1000, meta: { ...r.meta, translationInputAdmitted: true, translationInputBytes: 20000 } } : r));
    const s3 = rows.filter(r => r.arm === 'S2').map(r => ({ ...r, key: r.key.replace('|S2|', '|S3|'), arm: 'S3', requestBytes: 90000, meta: { ...r.meta, translationInputAdmitted: false, translationInputBytes: 90000 } }));
    writeFileSync(join(dir, 'steps.jsonl'), `${[...patched, ...s3].map(r => JSON.stringify(r)).join('\n')}\n`);
    const a = report.analyze(dir);
    expect(a.admission.A1.production.k).toBe(29);
    expect(a.admission.A1.translation.k).toBe(29);
    expect(a.admission.S2.production.k).toBe(30);
    expect(a.admission.S3.translation.k).toBe(0);
    expect(a.admission.S3.production.k).toBe(30);
    expect(a.admission.S3.maxTranslationInputBytes).toBe(90000);
    expect(a.admission.S3.plannedRate).toBe(1); // 90,000-byte request is within the 262,144 planned cap: the Stage-3 rule is unchanged
  });
  it('QA-D2: a failed injection case or a missing injection suite blocks HZ-5', () => {
    const failed = makeRun({ withEvidence: true });
    writeFileSync(join(failed, 'safety.json'), JSON.stringify({ maskDifferences: 0, hostile: { total: 4, passed: 4 }, injected: { total: 6, passed: 5 } }));
    const hz5 = (dir: string) => stage(report.analyze(dir), 1).checks.find((c: any) => c.name.startsWith('HZ-5'));
    expect(hz5(failed).pass).toBe(false);
    const missing = makeRun({ withEvidence: true });
    writeFileSync(join(missing, 'safety.json'), JSON.stringify({ maskDifferences: 0, hostile: { total: 4, passed: 4 } }));
    expect(hz5(missing).pass).toBeNull();
    expect(stage(report.analyze(missing), 1).verdict).toBe('INCOMPLETE');
  });
  it('QA-D3: leak hits are attributed: S2 hit blocks stage 1 only, A1 hit blocks nothing, harness-level hit blocks all', () => {
    const verdicts = (hits: any[]) => {
      const dir = makeRun({ withEvidence: true });
      writeFileSync(join(dir, 'leakscan.json'), JSON.stringify({ hits, scannedFiles: 9, canaries: 2 }));
      const a = report.analyze(dir);
      return [1, 2, 3, 4].map(n => stage(a, n).checks.find((c: any) => c.name.startsWith('HZ-3')).pass);
    };
    expect(verdicts([{ kind: 'canary', file: 'replies.jsonl', arm: 'S2' }])).toEqual([false, true, true, true]);
    expect(verdicts([{ kind: 'canary', file: 'bodies/1.json', arm: 'S3' }])).toEqual([true, true, false, true]);
    expect(verdicts([{ kind: 'canary', file: 'bodies/2.json', arm: 'A1' }])).toEqual([true, true, true, true]);
    expect(verdicts([{ kind: 'canary', file: 'calls.jsonl', arm: null }])).toEqual([false, false, false, false]);
    const dir = makeRun({ withEvidence: true });
    writeFileSync(join(dir, 'leakscan.json'), JSON.stringify({ hits: [{ kind: 'canary', file: 'x', arm: 'A1' }], scannedFiles: 9, canaries: 2 }));
    expect(report.analyze(dir).hardZeros.leakByArm.A1).toBe(1);
  });
  it('QA-D5: HZ-2 is MISSING when an arm has no resolved durability trial', () => {
    const dir = makeRun({ withEvidence: true });
    writeFileSync(join(dir, 'durability.jsonl'), ['S2', 'S3'].map(arm => JSON.stringify({ task: 't0', step: 0, arm, tier: 'role', outcome: arm === 'S3' ? 'UNSUPPORTED_SHAPE' : 'OK', engineChecked: arm === 'S2', hoursSinceRun: 0.1 })).join('\n'));
    const a = report.analyze(dir);
    expect(stage(a, 1).checks.find((c: any) => c.name.startsWith('HZ-2')).pass).toBe(true);
    expect(stage(a, 3).checks.find((c: any) => c.name.startsWith('HZ-2')).pass).toBeNull();
  });
  it('QA-D9/D12/D14: VOIDs per stratum, the run end and both seeds are disclosed', () => {
    const dir = makeRun({ withEvidence: true });
    writeFileSync(join(dir, 'void.jsonl'), `${JSON.stringify({ task: 'a', stratum: 'iconOnly', step: 0, reason: 'GT_ABSENT' })}\n${JSON.stringify({ task: 'b', stratum: 'iconOnly', step: 0, reason: 'GT_AMBIGUOUS:2' })}\n${JSON.stringify({ task: 'c', stratum: 'chain', step: 1, reason: 'GT_ABSENT' })}\n`);
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 'r1', seed: 5, reps: 3, startedAt: '2026-10-26T10:00:00Z', endedAt: '2026-10-26T20:00:00Z', freeze: { ok: true, sha256: 'abc' } }));
    const { analysis, markdown } = report.buildReport(dir, { verify: false });
    expect(analysis.voidsByStratum).toEqual({ iconOnly: 2, chain: 1 });
    expect(analysis.seeds.runSeed).toBe(5);
    expect(Object.keys(analysis.seeds.bootstrap)).toContain('primary');
    expect(markdown).toContain('2026-10-26T20:00:00Z');
    expect(markdown).toContain('excludes the 50 ms collection time limit');
    expect(markdown).toContain('bootstrap seeds');
  });
  it('D-1: unresolved infrastructure errors are excluded from denominators, listed per arm, and keep the stage INCOMPLETE; a resolved retry replaces them', () => {
    const dir = makeRun({ withEvidence: true });
    const rows = readFileSync(join(dir, 'steps.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const broken = rows.map(r => (r.arm === 'S2' && r.task === 't1' && r.rep === 1 ? { ...r, status: null, outcome: 'MODEL_ERROR', infraError: true, httpStatus: 429, correctAndExecutable: false, correctElement: false, confidentWrong: false } : r));
    writeFileSync(join(dir, 'steps.jsonl'), `${broken.map(r => JSON.stringify(r)).join('\n')}\n`);
    const a = report.analyze(dir);
    expect(a.infraErrors).toMatchObject({ total: 1, byArm: { S2: 1 }, byTask: { t1: 1 }, byHttpStatus: { '429': 1 } });
    expect(a.perArmStratum.S2.ALL.trials).toBe(89); // 30 tasks x 3 reps minus the unresolved one
    expect(a.perArmStratum.S2.ALL.correctAndExecutable.k).toBe(89); // not counted as a failure
    expect(stage(a, 1).verdict).toBe('INCOMPLETE');
    expect(stage(a, 1).checks.find((c: any) => /infrastructure/.test(c.name)).pass).toBeNull();
    expect(stage(a, 2).checks.find((c: any) => /infrastructure/.test(c.name)).pass).toBe(true); // Stage 2 depends on S1 and A1 only
    const { markdown } = report.buildReport(dir, { verify: false });
    expect(markdown).toContain('Unresolved infrastructure errors');
    // a rerun appends the resolved row for the same key: last row wins and the error disappears
    const retried = rows.find(r => r.arm === 'S2' && r.task === 't1' && r.rep === 1);
    writeFileSync(join(dir, 'steps.jsonl'), `${[...broken, retried].map(r => JSON.stringify(r)).join('\n')}\n`);
    expect(report.analyze(dir).infraErrors.total).toBe(0);
  });
  it('D-3: strict equality is reported as a sensitivity row next to the equivalence-credited primary', () => {
    const dir = makeRun({ withEvidence: true });
    const rows = readFileSync(join(dir, 'steps.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const eq = rows.map(r => (r.arm === 'S1' && r.task === 't1' ? { ...r, correctAndExecutable: true, strictCorrectAndExecutable: false, equivalentDescendant: true, outcome: 'EQUIVALENT_DESCENDANT' } : r));
    writeFileSync(join(dir, 'steps.jsonl'), `${eq.map(r => JSON.stringify(r)).join('\n')}\n`);
    const a = report.analyze(dir);
    expect(a.sensitivity.s1VsA1.strictEquality).toBeTruthy();
    expect(a.perArmStratum.S1.ALL.equivalentDescendants).toBe(3);
    expect(report.buildReport(dir, { verify: false }).markdown).toContain('strictEquality');
  });
  it('renders the screening header, freeze info and the computed verdict table', () => {
    const { markdown } = report.buildReport(makeRun({ withEvidence: true, wrongS2: ['t4'] }), { verify: false });
    expect(markdown).toContain('Screening evidence — not ADR-SC-005 D-C evidence');
    expect(markdown).toContain('## Stage go / no-go (computed)');
    expect(markdown).toMatch(/1: Resolver on Playwright semantics \(S2\) \| \*\*NO-GO\*\*/);
    expect(markdown).toContain('abc');
    expect(markdown).toContain('implied 5-step completion');
  });
});
