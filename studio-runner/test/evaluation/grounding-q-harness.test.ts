/* eslint-disable -- dynamic imports of untyped SPK-07 .mjs modules; harness test, not shipped */
/**
 * SPK-07 QA (Quinn): verification of the harness itself (plan "Verification of the harness itself").
 *  - a planted wrong pick, a planted COMPLETE and a planted action on a negative go through run.mjs -> steps.jsonl -> report.mjs and
 *    must give hard zeros and NO-GO (browser: SPK07_LIVE=1, local fixture server, a fake model client, no network);
 *  - a planted canary in a run output must be found by the leak scan and flagged by the report;
 *  - regression tests for the defects QA-D1..D9 found on 2026-10-26 (originally `it.fails` pins, converted after the fixes).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const load = async (rel: string): Promise<any> => import(new URL(rel, import.meta.url).href);
const run = await load('../../evaluation/grounding/run.mjs');
const report = await load('../../evaluation/grounding/report.mjs');
const safety = await load('../../evaluation/grounding/safety.mjs');
const gt = await load('../../evaluation/grounding/lib/gt.mjs');
await load('../../evaluation/grounding/durability.mjs');
const perceive = await load('../../evaluation/grounding/lib/perceive.mjs');
const s3 = await load('../../evaluation/grounding/lib/arms/S3.mjs');
const leakscan = await load('../../evaluation/grounding/lib/leakscan.mjs');
const freeze = await load('../../evaluation/grounding/freeze.mjs');
const dirs: string[] = [];
const tmp = (prefix: string) => { const dir = mkdtempSync(join(tmpdir(), `spk07-q-${prefix}-`)); dirs.push(dir); return dir; };
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const jsonl = (path: string): any[] => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
const stage = (analysis: any, n: number) => analysis.stages.find((s: any) => s.stage === n);
const hz = (analysis: any, n: number, prefix: string) => stage(analysis, n).checks.find((c: any) => c.name.startsWith(prefix));

// ---------------------------------------------------------------------------------------------------------------------
// The run.mjs classifier (no browser).
describe('classify: planted failures produce the hard-zero flags', () => {
  const task = { expect: 'ACTION' };
  const base = { status: 'ACTION', pickedBackendNodeId: 5, executable: true, gateCodes: [] };
  it('wrong element, executable, no gate code = confident wrong', () => {
    expect(run.classify({ task, gtIds: [9], interp: base })).toMatchObject({ confidentWrong: true, wrongElementAction: true, correctAndExecutable: false, outcome: 'CONFIDENT_WRONG' });
  });
  it('wrong element refused by an arm gate is counted but is not a hard zero', () => {
    expect(run.classify({ task, gtIds: [9], interp: { ...base, gateCodes: ['INTENT_MISMATCH'] } })).toMatchObject({ confidentWrong: false, wrongElementAction: true, outcome: 'GATED' });
  });
  it('wrong element that is not executable is not a hard zero', () => {
    expect(run.classify({ task, gtIds: [9], interp: { ...base, executable: false } })).toMatchObject({ confidentWrong: false, wrongElementAction: true });
  });
  it('COMPLETE is a hard zero whether or not a gate would have admitted it', () => {
    expect(run.classify({ task, gtIds: [9], interp: { status: 'COMPLETE', gateCodes: [] } })).toMatchObject({ confidentWrong: true, outcome: 'FALSE_COMPLETE' });
    expect(run.classify({ task, gtIds: [9], interp: { status: 'COMPLETE', gateCodes: ['X'] } }).confidentWrong).toBe(true);
  });
  it('any admitted executable ACTION on a negative is a hard zero; CLARIFICATION on a negative is handled', () => {
    expect(run.classify({ task: { expect: 'CLARIFICATION' }, gtIds: [], interp: base })).toMatchObject({ confidentWrong: true, wrongElementAction: true });
    expect(run.classify({ task: { expect: 'CLARIFICATION' }, gtIds: [], interp: { status: 'CLARIFICATION', gateCodes: [] } })).toMatchObject({ confidentWrong: false, negativeHandled: true });
  });
  it('a correct executable action is a success and no hard zero', () => {
    expect(run.classify({ task, gtIds: [5], interp: base })).toMatchObject({ correctAndExecutable: true, admittedSuccess: true, confidentWrong: false });
  });
});


// ---------------------------------------------------------------------------------------------------------------------
// Planted canary: leak scan + report.
describe('planted canary', () => {
  const makeRun = () => {
    const parent = tmp('canary'); const dir = join(parent, 'run1'); mkdirSync(join(dir, 'bodies'), { recursive: true });
    writeFileSync(join(dir, 'steps.jsonl'), ''); writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId: 'r', seed: 1 }));
    writeFileSync(join(dir, 'calls.jsonl'), `${JSON.stringify({ n: 1 })}\n`);
    return dir;
  };
  it('a canary in a model reply file is found by the scan and flagged HZ-3 by the report in every stage', () => {
    const dir = makeRun(); const registry = new safety.Registry();
    const token = registry.mint('plant', 'textInput', 'plant');
    writeFileSync(join(dir, 'replies.jsonl'), `${JSON.stringify({ key: 'x', reply: { note: `typed ${token}` } })}\n`);
    const scan = safety.scanCanaries(dir, registry);
    expect(scan.hits).toHaveLength(1);
    expect(scan.hits[0]).toMatchObject({ file: 'replies.jsonl', match: 'full' });
    writeFileSync(join(dir, 'leakscan.json'), JSON.stringify({ hits: scan.hits, scannedFiles: scan.scannedFiles, canaries: scan.canaries }));
    const analysis = report.analyze(dir);
    expect(analysis.hardZeros.leak.hits).toBe(1);
    for (const n of [1, 2, 3, 4]) { expect(hz(analysis, n, 'HZ-3').pass, `stage ${n}`).toBe(false); expect(stage(analysis, n).verdict).toBe('NO-GO'); }
    expect(report.renderReport(analysis)).toContain('1 hits in');
  });
  it('a clean scan passes HZ-3 and a missing leakscan.json leaves it MISSING (INCOMPLETE), never GO', () => {
    const clean = makeRun(); const registry = new safety.Registry(); registry.mint('plant', 'textInput', 'plant');
    const scan = safety.scanCanaries(clean, registry);
    writeFileSync(join(clean, 'leakscan.json'), JSON.stringify({ hits: scan.hits, scannedFiles: scan.scannedFiles, canaries: scan.canaries }));
    expect(hz(report.analyze(clean), 1, 'HZ-3').pass).toBe(true);
    const none = makeRun();
    expect(hz(report.analyze(none), 1, 'HZ-3').pass).toBe(null);
    expect(stage(report.analyze(none), 1).verdict).not.toBe('GO');
  });
  it('a canary in the request body of a kept bodies/ file is found even when only its JSON-escaped or (3-byte-aligned) base64 form appears', () => {
    const dir = makeRun(); const registry = new safety.Registry(); const token = registry.mint('plant', 'password', 'plant');
    writeFileSync(join(dir, 'bodies', '1.json'), JSON.stringify({ text: JSON.stringify({ q: token }) }));       // escaped JSON inside JSON
    writeFileSync(join(dir, 'bodies', '2.json'), JSON.stringify({ blob: Buffer.from(`abc${token}`).toString('base64') }));
    const files = safety.scanCanaries(dir, registry).hits.map((h: any) => h.file).sort();
    expect(files).toEqual(['bodies/1.json', 'bodies/2.json']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Regression tests for the defects QA reported on 2026-10-26 (QA-D1..D9), fixed afterwards. They were `it.fails` pins;
// each now asserts the pre-registered behavior. Still open: QA-D10 (decided as addendum 3), see qa-harness-verification.md.
describe('regressions: harness vs pre-registration (QA-D1..D9)', () => {
  it('QA-D1: leakscan finds a canary the page capitalized or truncated, and attributes the arm', () => {
    const dir = tmp('d1'); const canary = 'cnryABCDEFGHIJKLMNOPQRST';
    writeFileSync(join(dir, 'a-S3.json'), JSON.stringify({ link: 'CnryABCDEFGHIJKLMNOPQRST' }));
    writeFileSync(join(dir, 'b-A1.json'), JSON.stringify({ fragment: 'xxBCDEFGHIJKLMyy' }));
    const hits = leakscan.scanRun(dir, { canaries: [canary] }).hits;
    expect(hits.map((h: any) => [h.file, h.arm]).sort()).toEqual([['a-S3.json', 'S3'], ['b-A1.json', 'A1']]);
  });

  const runWith = (hits: any[]) => {
    const dir = join(tmp('d3'), 'run1'); mkdirSync(dir);
    writeFileSync(join(dir, 'steps.jsonl'), ''); writeFileSync(join(dir, 'run.json'), '{}');
    writeFileSync(join(dir, 'leakscan.json'), JSON.stringify({ hits, scannedFiles: 3, canaries: 1 }));
    return report.analyze(dir);
  };
  it('QA-D3: a leak blocks only the stage of the arm that holds it; A0/A1 are production findings; harness-level blocks all', () => {
    const hz3 = (analysis: any) => [1, 2, 3, 4].map(n => hz(analysis, n, 'HZ-3').pass);
    expect(hz3(runWith([{ kind: 'canary', file: 'bodies/leak-x-A1.json', arm: 'A1' }]))).toEqual([true, true, true, true]);
    expect(hz3(runWith([{ kind: 'canary', file: 'bodies/leak-x-S3.json', arm: 'S3' }]))).toEqual([true, true, false, true]);
    expect(hz3(runWith([{ kind: 'canary', file: 'bodies/leak-x-S2.json', arm: 'S2' }]))).toEqual([false, true, true, true]);
    expect(hz3(runWith([{ kind: 'canary', file: 'replies.jsonl', arm: null }]))).toEqual([false, false, false, false]);
  });

  it('QA-D4: durability re-resolves a frozen S3/S4 typed locator through the public Playwright API', () => {
    const calls: string[] = [];
    const node: any = new Proxy({}, { get: (_t, name: string) => (...args: any[]) => { calls.push(`${name}:${JSON.stringify(args)}`); return node; } });
    gt.locatorFromFrozen(node, [{ by: 'scope', role: 'form', name: 'Login', exact: true }, { by: 'role', role: 'button', name: 'Go', exact: true }, { by: 'nth', index: 1 }]);
    expect(calls.map(c => c.split(':')[0])).toEqual(['getByRole', 'getByRole', 'nth']);
    expect(() => gt.locatorFromFrozen(node, [{ by: 'bogus' }])).toThrow(/LOCATOR_SHAPE/);
  });

  it('QA-D5: HZ-2 is MISSING for an arm whose durability rows were all UNSUPPORTED_SHAPE (no resolved trial)', () => {
    const dir = join(tmp('d5'), 'run1'); mkdirSync(dir);
    writeFileSync(join(dir, 'run.json'), '{}');
    const row = (arm: string) => ({ key: `t|0|${arm}|1|1`, task: 't', step: 0, arm, rep: 1, attempt: 1, expect: 'ACTION', stratum: 'uniqueNav', status: 'ACTION', correctElement: true, executable: true, correctAndExecutable: true, gateCodes: [] });
    writeFileSync(join(dir, 'steps.jsonl'), `${[row('S2'), row('S3')].map(r => JSON.stringify(r)).join('\n')}\n`);
    writeFileSync(join(dir, 'durability.jsonl'), `${JSON.stringify({ task: 't', step: 0, arm: 'S2', tier: 'role', outcome: 'OK', engineChecked: true })}\n${JSON.stringify({ task: 't', step: 0, arm: 'S3', tier: 'role', outcome: 'UNSUPPORTED_SHAPE' })}\n`);
    const analysis = report.analyze(dir);
    expect(hz(analysis, 3, 'HZ-2').pass).toBe(null);
    expect(hz(analysis, 1, 'HZ-2').pass).toBe(true);
  });

  it('QA-D6: locatorFlags marks a typed S3/S4 nth locator as positional and a non-exact step as non-exact', () => {
    expect(gt.locatorFlags([{ by: 'filterHas', has: [] }, { by: 'nth', index: 2 }]).positional).toBe(true);
    expect(gt.locatorFlags([{ by: 'role', role: 'button', name: 'Go', exact: false }]).nonExact).toBe(true);
    expect(gt.locatorFlags([{ by: 'role', role: 'button', name: 'Go', exact: true }])).toEqual({ positional: false, nonExact: false });
  });

  it('QA-D7: the intent gate passes an icon-only control whose name equals the intent', () => {
    for (const icon of ['×', '+', '☰', '€']) { expect(perceive.norm(icon)).toBe(icon); expect(s3.intentGate(icon, { rawName: icon }), icon).toBeNull(); }
    expect(s3.intentGate('Close', { rawName: '×', ownText: 'Close' })).toBeNull();
    expect(s3.intentGate('×', { rawName: 'Close' })).toBe('INTENT_MISMATCH');
    expect(s3.intentGate('  ', { rawName: 'x' })).toBe('INTENT_MISSING');
    expect(perceive.norm('"Search!"')).toBe('search');
  });

  it('QA-D8: the freeze record pins the production contract file', () => {
    const record = freeze.computeFreeze({ now: new Date('2026-10-26T00:00:00Z') });
    expect(record.productionContract.path).toBe('studio-runner/evaluation/grounding/contracts/frozen-production/guided-output-contract.md');
    expect(record.productionContract.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('QA-D9: VOID entries carry the stratum (run.executeTask)', async () => {
    const dir = tmp('d9');
    const store = new run.RunStore(dir);
    const env = { store, armIds: ['S2'], reps: 1, seed: 1, dry: false, repairJava: false, javaRefusals: new Map(), openTask: async () => ({ void: true, reason: 'LOAD_FAILED x', close: async () => undefined }), log: () => undefined };
    await run.executeTask(env, { id: 't', site: 's', url: 'http://x', stratum: 'iconOnly', expect: 'ACTION', steps: [{ text: 'Click "A"', operation: { kind: 'click' }, gt: null }] });
    expect(jsonl(join(dir, 'void.jsonl'))[0]).toMatchObject({ task: 't', stratum: 'iconOnly', reason: 'LOAD_FAILED x' });
  });
});
