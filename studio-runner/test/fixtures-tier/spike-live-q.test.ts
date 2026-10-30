/* eslint-disable -- dynamic imports of untyped SPK-07 .mjs modules; harness test, not shipped (moved from test/evaluation, ADR-SC-007 WI-4 D-12) */
/**
 * SPK-07 QA live blocks, moved unchanged from test/evaluation/grounding-q-harness.test.ts ("planted failures end to end") and
 * test/evaluation/grounding-q-safety.test.ts ("safety suite in a browser") so that no file outside the fixtures tier launches Chromium
 * (confinement AC-25). The gate is unchanged: they run only with SPK07_LIVE=1 (loopback fixture server, a fake model client, no network).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { frozenArmTarget } from '../evaluation/grounding-b-support.js';

void mkdirSync;
const load = async (rel: string): Promise<any> => import(new URL(rel, import.meta.url).href);
const live = process.env.SPK07_LIVE === '1';
const dirs: string[] = [];
const tmp = (prefix: string) => { const dir = mkdtempSync(join(tmpdir(), `spk07-q-${prefix}-`)); dirs.push(dir); return dir; };
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const jsonl = (path: string): any[] => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
const stage = (analysis: any, n: number) => analysis.stages.find((s: any) => s.stage === n);
const hz = (analysis: any, n: number, prefix: string) => stage(analysis, n).checks.find((c: any) => c.name.startsWith(prefix));
const run = await load('../../evaluation/grounding/run.mjs');
const report = await load('../../evaluation/grounding/report.mjs');
const safety = await load('../../evaluation/grounding/safety.mjs');

// ---------------------------------------------------------------------------------------------------------------------
// End to end: run.mjs (real S2 and S3 arms, real Chromium, local fixture page, FAKE model) -> report.mjs.
describe.skipIf(!live)('planted failures end to end (SPK07_LIVE=1)', () => {
  const require = createRequire(new URL('../../package.json', import.meta.url));

  /** The fake model: SOURCE_PLAN gets one click obligation; NEXT_ACTION picks the element the scenario says. */
  function fakeVertex(scenarioOf: () => string) {
    const calls: string[] = [];
    const pickByName = (observation: string, arm: string, name: string) => {
      if (arm === 'S3') { const m = new RegExp(`- button "${name}" \\[(e\\d+)\\]`).exec(observation); return m ? { target: { kind: 'node', ref: m[1] } } : null; }
      const prefix = /ids=(\S+)N/.exec(observation)![1];
      const m = new RegExp(`- button "${name}" \\[e(\\d+)\\]`).exec(observation);
      return m ? { target: frozenArmTarget(prefix ?? '', m[1] ?? '', name) } : null;
    };
    const send = async (body: any, { label }: { label: string }) => {
      calls.push(label);
      const envelope = JSON.parse(body.contents[0].parts[0].text);
      const ctx = envelope.context;
      const ok = (reply: any) => ({ status: 200, reply, rawText: '', usage: { prompt: 10, out: 5, thoughts: 0, total: 15 }, modelVersion: 'fake-1', ms: 1, error: null });
      if (envelope.kind === 'SOURCE_PLAN') {
        const step = ctx.sourceSteps[0];
        const intent = /"([^"]+)"/.exec(step.text)![1];
        return ok({ schemaVersion: 3, kind: 'SOURCE_PLAN', sourceReferences: [], needs: [], obligations: [{ stepId: step.stepId, occurrence: 0, operationKind: 'click', targetIntent: intent, scopeIntent: null, referenceIndex: null, needId: null, predicate: null }] });
      }
      const arm = label.split('|')[2] ?? '';
      const scenario = scenarioOf();
      const base = { schemaVersion: 3, kind: 'NEXT_ACTION', requestId: envelope.requestId, obligationId: ctx.obligations[0].obligationId, question: null };
      if (scenario === 'complete') return ok({ ...base, status: 'COMPLETE', action: null });
      const pick = pickByName(String(ctx.observation), arm, 'Sign in'); // 'wrong' = a different button than the step's intent ('Search')
      return ok({ ...base, status: 'ACTION', action: { ...pick, operation: { kind: 'click' } } });
    };
    return { send, calls };
  }

  async function plantedRun(arms: string[], taskIds: string[]) {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const fixture = await safety.startFixtureServer();
    const parent = tmp('plant');
    const runDir = join(parent, 'run1');
    const corpus = join(parent, 'tasks.jsonl');
    writeFileSync(corpus, readFileSync(join(safety.SAFETY_DIR, 'verify-tasks.jsonl'), 'utf8').replaceAll('{ORIGIN}', fixture.origin));
    let current = '';
    const scenarios: Record<string, string> = { 'plant-wrong': 'wrong', 'plant-complete': 'complete', 'plant-negative': 'wrong', 'control-correct': 'correct' };
    const fake = fakeVertex(() => scenarios[current] ?? '');
    const { openLoad } = await load('../../evaluation/grounding/lib/gt.mjs');
    const saved = { dir: process.env.SPK07_RUNS_DIR, id: process.env.SPK07_RUN_ID };
    try {
      const code = await run.main([runDir, '--corpus', corpus, '--arms', arms.join(','), '--reps', '1', '--concurrency', '1', '--seed', '7', '--tasks', taskIds.join(',')], {
        verify: { ok: true, errors: [], warnings: [], freeze: { sha256: 'test' } },
        env: {
          vertex: fake,
          arms: Object.fromEntries(await Promise.all(arms.map(async id => [id, await load(`../../evaluation/grounding/lib/arms/${id}.mjs`)]))),
          openTask: (task: any) => { current = task.id; return openLoad({ browser, task, tag: task.id }); },
          log: () => undefined,
        },
      });
      expect(code).toBe(0);
    } finally {
      await browser.close(); await fixture.close();
      if (saved.dir === undefined) delete process.env.SPK07_RUNS_DIR; else process.env.SPK07_RUNS_DIR = saved.dir;
      if (saved.id === undefined) delete process.env.SPK07_RUN_ID; else process.env.SPK07_RUN_ID = saved.id;
    }
    return { runDir, fake };
  }

  it('a gate-admitted executable wrong pick (S2) is recorded, becomes HZ-1 and makes stage 1 NO-GO', async () => {
    const { runDir } = await plantedRun(['S2'], ['plant-wrong']);
    const rows = jsonl(join(runDir, 'steps.jsonl')).filter(r => r.attempt === 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ arm: 'S2', status: 'ACTION', correctElement: false, executable: true, gateCodes: [], wrongElementAction: true, confidentWrong: true, outcome: 'CONFIDENT_WRONG' });
    const analysis = report.analyze(runDir);
    expect(analysis.hardZeros.confidentWrong.S2.count).toBe(1);
    expect(analysis.hardZeros.confidentWrong.S2.keys[0]).toBe('plant-wrong|0|S2|1|1');
    expect(hz(analysis, 1, 'HZ-1').pass).toBe(false);
    expect(stage(analysis, 1).verdict).toBe('NO-GO');
    const markdown = report.renderReport(analysis);
    expect(markdown).toMatch(/HZ-1 confident wrong[^\n]*\| S2 \| 1 \|/);
    expect(markdown).toContain('**NO-GO**');
    // The Java scorer refusing the pick turns the hard zero into a counted-but-refused wrong pick (pre-registration section 9 reading).
    writeFileSync(join(runDir, 'scoring-output.jsonl'), `${JSON.stringify({ key: 'plant-wrong|0|S2|1|1', verdict: 'REFUSED', code: 'INVALID_CONTRACT', stage: 'action' })}\n`);
    const refused = report.analyze(runDir);
    expect(refused.hardZeros.confidentWrong.S2.count).toBe(0);
    expect(refused.hardZeros.wrongElementActions.S2).toBe(1);
  }, 120000);

  it('a COMPLETE on an unperformed step is HZ-1 for S2 even though no gate is involved', async () => {
    const { runDir } = await plantedRun(['S2'], ['plant-complete']);
    const row = jsonl(join(runDir, 'steps.jsonl'))[0];
    expect(row).toMatchObject({ status: 'COMPLETE', confidentWrong: true, outcome: 'FALSE_COMPLETE' });
    expect(report.analyze(runDir).hardZeros.confidentWrong.S2.count).toBe(1);
    // ... and a Java REFUSED verdict does not rescue a COMPLETE.
    writeFileSync(join(runDir, 'scoring-output.jsonl'), `${JSON.stringify({ key: row.key, verdict: 'REFUSED', code: 'X', stage: 'action' })}\n`);
    expect(report.analyze(runDir).hardZeros.confidentWrong.S2.count).toBe(1);
  }, 120000);

  it('an admitted ACTION on a negative (absent target) is HZ-1', async () => {
    const { runDir } = await plantedRun(['S2'], ['plant-negative']);
    const row = jsonl(join(runDir, 'steps.jsonl'))[0];
    expect(row).toMatchObject({ expect: 'CLARIFICATION', status: 'ACTION', confidentWrong: true, wrongElementAction: true });
    const analysis = report.analyze(runDir);
    expect(analysis.hardZeros.confidentWrong.S2.count).toBe(1);
    expect(analysis.perArmStratum.S2.negative.negativeConfidentWrong).toBe(1);
  }, 120000);

  it('the same wrong pick on S3 is refused by the pre-registered intent gate: counted as a wrong-element ACTION, not a hard zero', async () => {
    const { runDir } = await plantedRun(['S3'], ['plant-wrong']);
    const row = jsonl(join(runDir, 'steps.jsonl')).find(r => r.attempt === 1);
    expect(row).toMatchObject({ arm: 'S3', status: 'ACTION', correctElement: false, wrongElementAction: true, confidentWrong: false, outcome: 'GATED' });
    expect(row.gateCodes).toContain('INTENT_MISMATCH');
    expect(row.needsRepair).toBe(true);
    const analysis = report.analyze(runDir);
    expect(analysis.hardZeros.confidentWrong.S3.count).toBe(0);
    expect(analysis.hardZeros.wrongElementActions.S3).toBeGreaterThanOrEqual(1);
  }, 120000);

  it('a correct control run has no hard zero (the planted ones are not false alarms)', async () => {
    const { runDir } = await plantedRun(['S2', 'S3'], ['control-correct']);
    const rows = jsonl(join(runDir, 'steps.jsonl')).filter(r => r.attempt === 1);
    expect(rows.map(r => [r.arm, r.correctAndExecutable])).toEqual(expect.arrayContaining([['S2', true], ['S3', true]]));
    const analysis = report.analyze(runDir);
    expect(analysis.hardZeros.confidentWrong.S2.count + analysis.hardZeros.confidentWrong.S3.count).toBe(0);
    expect(hz(analysis, 1, 'HZ-1').pass).toBe(true);
    expect(hz(analysis, 3, 'HZ-1').pass).toBe(true);
  }, 120000);
});

// ---- live (Chromium, local fixture server only) -----------------------------------------------------------------------
describe.skipIf(!live)('safety suite in a browser (SPK07_LIVE=1)', () => {
  const require = createRequire(new URL('../../package.json', import.meta.url));
  it('mask test is not vacuous: the typed text is visible in an unmasked screenshot of the echoing fixture and S4 masks it (HZ-4 fix check)', async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const fixture = await safety.startFixtureServer();
    try {
      const S4 = await load('../../evaluation/grounding/lib/arms/S4.mjs');
      const registry = new safety.Registry();
      const common = { registry, fixture, S4, viewport: { width: 1280, height: 720 }, attempts: 2 };
      const [echo] = await safety.maskTest(browser, { ...common, pages: [{ id: 'echo', fixture: true }] });
      expect(echo.conclusive).toBe(true);        // both control pairs (same canaries) are identical
      expect(echo.unmaskedDiffAB).toBeGreaterThan(0); // without the mask, typed text (incl. the echo in the suggestion list) changes pixels
      expect(echo.diffAB).toBe(0);               // S4 masks controls and every element whose rendered text echoes a private value
      const [quiet] = await safety.maskTest(browser, { ...common, pages: [{ id: 'quiet', fixture: true, query: { nosugg: '1' } }] });
      expect(quiet.conclusive).toBe(true);
      expect(quiet.unmaskedDiffAB).toBeGreaterThan(0);
      expect(quiet.diffAB).toBe(0);              // every typed channel (text, password, textarea, contenteditable, select, aria-valuetext) is masked
      expect(quiet.channels).toEqual(['textInput', 'textInput', 'password', 'textarea', 'contenteditable']);
      const visual = await load('../../evaluation/grounding/lib/visual.mjs');
      const context = await browser.newContext(); const page = await context.newPage(); await visual.closeDrawingPages(page); await context.close();
    } finally { await browser.close(); await fixture.close(); }
  }, 180000);
  it('diffPngs counts decoded pixels', async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 40, height: 20 } }); const page = await context.newPage();
      await page.setContent('<body style="margin:0;background:#fff"><div style="width:5px;height:2px;background:#000"></div></body>');
      const a = await page.screenshot();
      await page.setContent('<body style="margin:0;background:#fff"><div style="width:5px;height:3px;background:#000"></div></body>');
      const b = await page.screenshot();
      expect(await safety.diffPngs(browser, a, a)).toMatchObject({ differing: 0, byteIdentical: true, sameSize: true });
      expect(await safety.diffPngs(browser, a, b)).toMatchObject({ differing: 5, byteIdentical: false });
    } finally { await browser.close(); }
  }, 60000);
  it('the leak part builds a body for every arm on the fixture and finds only what the arms really carry', async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const fixture = await safety.startFixtureServer();
    const dir = tmp('leaklive');
    try {
      const arms: any = {};
      for (const id of safety.ALL_ARMS) arms[id] = await load(`../../evaluation/grounding/lib/arms/${id}.mjs`);
      const registry = new safety.Registry();
      const out = await safety.leakPages(browser, { pages: [{ id: 'fixture-typed', fixture: true }], urlPages: [{ id: 'fixture-urlprefill', fixture: true }], registry, fixture, arms, runDir: dir, viewport: { width: 1280, height: 720 } });
      expect(out.map((p: any) => p.page)).toEqual(['fixture-typed', 'fixture-urlprefill']);
      for (const page of out) for (const id of safety.ALL_ARMS) expect(page.arms[id].error, `${page.page}/${id}`).toBeUndefined();
      const attribution = safety.attributeLeaks(safety.scanCanaries(dir, registry));
      // password, textarea, contenteditable, selected option and aria-valuetext never reach any request body.
      const channels = new Set(attribution.hardZero.concat(attribution.production).filter((h: any) => h.kind === 'canary').map((h: any) => h.channel));
      for (const quiet of ['password', 'textarea', 'contenteditable', 'selectedOption', 'ariaValuetext']) expect(channels.has(quiet), quiet).toBe(false);
      expect(readFileSync(join(dir, 'bodies', 'leak-fixture-typed-S3.json'), 'utf8')).toContain('passwordControl');
    } finally { await browser.close(); await fixture.close(); }
  }, 180000);
});
