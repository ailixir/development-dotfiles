/* eslint-disable no-restricted-syntax, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/restrict-plus-operands -- SC008-E18 harness tests (not shipped): dynamic import of repository-owned evaluation modules at constant paths. */
/**
 * SC008-E18: the offline prompt-evaluation harness. No model call and no public site: the split, the curated examples, the request
 * builder, the retrieval port and the execution oracle (production admitStep/runStep on local fixture pages).
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const GROUNDING = new URL('../../evaluation/grounding/', import.meta.url);
const S: any = await import(new URL('lib/stepcode.mjs', GROUNDING).href);
const D: any = await import(new URL('step-code.mjs', GROUNDING).href);
const REPO = new URL('../../../', import.meta.url);
const norm = (text: string): string => text.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
const canon = (text: string): string => norm(text).replace(/\.+$/u, '');
const json = (path: string): any => JSON.parse(readFileSync(fileURLToPath(new URL(path, REPO)), 'utf8'));

describe('split and curated examples (AC1, AC2)', () => {
  it('is reproducible, drops every gate and smoke step, and keeps tune and eval disjoint', () => {
    const stored = json('studio-runner/evaluation/grounding/e18/split.json');
    expect(JSON.stringify(D.computeSplit())).toBe(JSON.stringify(stored));
    expect(stored.counts.excluded).toBeGreaterThanOrEqual(28);
    const gate = json('frontend/e2e/realsite-gate/gate-table.json');
    const smoke = json('frontend/e2e/realsite-gate/smoke-flows.json');
    const held = new Set<string>();
    for (const t of gate.tests) for (const s of t.steps) held.add(norm(s));
    for (const f of smoke.flows) for (const s of f.steps) held.add(norm(s));
    const ids = new Set<string>([...stored.tune, ...stored.eval]);
    expect(stored.tune.filter((id: string) => stored.eval.includes(id))).toEqual([]);
    for (const line of readFileSync(fileURLToPath(new URL('studio-runner/evaluation/grounding/corpus/tasks.jsonl', REPO)), 'utf8').split('\n').filter(Boolean)) {
      const task = JSON.parse(line);
      if (!ids.has(task.id)) continue;
      expect(gate.tests.some((t: any) => (t.corpusTasks ?? []).includes(task.id))).toBe(false);
      for (const step of task.steps) expect(held.has(norm(step.text))).toBe(false);
    }
    expect(stored.overlap.tuneTasksSharingUrlWithGateOrSmokeStep).toBeGreaterThanOrEqual(0);
  });

  it('keeps every curated example away from the gate, smoke, corpus and control step texts', () => {
    const contract = readFileSync(fileURLToPath(new URL('backend/src/main/resources/studio/guided-step-code-contract.md', REPO)), 'utf8');
    const examples = [...contract.matchAll(/Step "(.+?)"\.? [(w]/gu)].map(m => canon(m[1] ?? ''));
    expect(examples.length).toBeGreaterThanOrEqual(4);
    expect(examples.length).toBeLessThanOrEqual(8);
    const others = new Set<string>();
    const gate = json('frontend/e2e/realsite-gate/gate-table.json');
    for (const t of gate.tests) for (const s of t.steps) others.add(canon(s));
    for (const f of json('frontend/e2e/realsite-gate/smoke-flows.json').flows) for (const s of f.steps) others.add(canon(s));
    for (const file of ['studio-runner/evaluation/grounding/corpus/tasks.jsonl', 'studio-runner/evaluation/grounding/e18/controls/tuning.jsonl', 'studio-runner/evaluation/grounding/e18/controls/final.jsonl']) {
      for (const line of readFileSync(fileURLToPath(new URL(file, REPO)), 'utf8').split('\n').filter(Boolean)) for (const s of JSON.parse(line).steps) others.add(canon(s.text));
    }
    for (const example of examples) expect(others.has(example), example).toBe(false);
    expect(Buffer.byteLength(contract)).toBeLessThanOrEqual(10240);
    expect(contract).toContain('end the code with an `expect` that checks exactly that outcome');
    expect(contract).toContain('return a clarification instead of code');
  });
});

describe('page-text rule of the step-code contract (SC008-FIX-32)', () => {
  const contract = readFileSync(fileURLToPath(new URL('backend/src/main/resources/studio/guided-step-code-contract.md', REPO)), 'utf8');

  it('teaches the rendered-text check for a step that names no element, in the rule and in an example', () => {
    expect(contract).toContain('names no element or region');
    expect(contract).toContain('hidden text cannot make the check pass');
    const calls = [...contract.matchAll(/expect\(page\.locator\('body'\)\)\.toContainText\(([^)]*)\)/gu)].map(m => m[1] ?? '');
    expect(calls).toHaveLength(2);
    for (const args of calls) expect(args).toMatch(/, \{ useInnerText: true \}$/u);
  });

  it('names no site and no gate wording', () => {
    expect(contract).not.toMatch(/iana|wikipedia|kernel\.org|github|datatracker|debian/iu);
  });
});

describe('request builder (AC3)', () => {
  const texts = S.loadTexts();
  const task = { id: 'x', url: 'fixture://t1/home', steps: [{ text: 'Click the "Save" button', operation: { kind: 'click' } }] };
  const session = S.makeSession(task);

  it('builds the Java system text, the STEP_CODE schema and the wire size', () => {
    const request = S.stepRequest({ session, plan: null, stepIndex: 0, outline: '- button "Save" [e1]', texts, sections: ['script', 'nope'] });
    expect(request.system).toBe(`${texts.stepContract.trimEnd()}\n\n${texts.reference.select(['script'])}`);
    expect(request.bytes).toBe(S.wireBytes(request.body));
    expect(request.bytes).toBeLessThanOrEqual(S.WIRE_CAP);
    const schema = request.body.generationConfig.responseJsonSchema;
    expect(schema.anyOf).toHaveLength(2);
    expect(JSON.stringify(schema)).not.toMatch(/"const"|"oneOf"|"pattern"|"maxItems"/u);
    expect(request.body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    const envelope = JSON.parse(request.body.contents[0].parts[0].text);
    expect(Object.keys(envelope.context).slice(0, 3)).toEqual(['schemaVersion', 'sessionId', 'scopeHash']);
    expect(envelope.context.observation).toBe('- button "Save" [e1]');
    expect(envelope.context.repair).toBeNull();
  });

  it('drops sections from the end, then refuses; single stage carries the full reference or does not fit', () => {
    const big = `- document\n${'  - text "n"\n'.repeat(1)}${'x'.repeat(70000)}`;
    const four = texts.reference.extendedIds().slice(0, 4);
    const fitting = S.stepRequest({ session, plan: null, stepIndex: 0, outline: '- document', texts, sections: four });
    expect(fitting.sections).toHaveLength(4);
    const tight = S.stepRequest({ session, plan: null, stepIndex: 0, outline: big.slice(0, 28000), texts, sections: four });
    expect(tight.error ?? tight.sections.length).toSatisfy((v: unknown) => v === 'BUDGET_EXCEEDED' || (v as number) <= 4);
    const full = S.stepRequest({ session, plan: null, stepIndex: 0, outline: '- document', texts, sections: [], full: true });
    expect(full.system).toContain(texts.reference.selectAll());
    const refusal = S.stepRequest({ session, plan: null, stepIndex: 0, outline: 'y'.repeat(98000), texts, sections: [], full: true });
    expect(refusal.error).toBe('BUDGET_EXCEEDED');
  });

  it('parses replies against the rules the provider schema drops', () => {
    expect(S.parseStepReply({ schemaVersion: 3, kind: 'STEP_CODE', status: 'CODE', code: 'await page.goto("x");', captures: [] }, 'r')).toEqual({ code: 'await page.goto("x");', captures: [] });
    expect(S.parseStepReply({ schemaVersion: 3, kind: 'STEP_CODE', status: 'CODE', code: 'a', captures: ['b'] }, 'r', ['c']).error).toBe('INVALID_CAPTURE');
    expect(S.parseStepReply({ schemaVersion: 3, kind: 'STEP_CODE', status: 'CLARIFICATION', question: { reason: 'AMBIGUOUS_TARGET', choices: [] } }, 'r').clarification).toBeTruthy();
    expect(S.parseStepReply({ schemaVersion: 3, kind: 'STEP_CODE', status: 'CODE', code: 'a', captures: [], verify: 1 }, 'r').code).toBe('a');
    expect(S.parseStepReply(null, 'r').error).toBe('INVALID_RESPONSE');
  });

  it('ports the retrieval sanitizer, ranker and renderer', () => {
    const clean = S.sanitizeForStore('Type "Ada Lovelace" in the "Name" box', "await page.getByLabel('Name').fill('Ada Lovelace');");
    expect(clean.stepText).toBe('Type <value1> in the <value2> box');
    expect(clean.code).toContain('<value1>');
    expect(clean.code).not.toContain('Ada Lovelace');
    expect(S.sanitizeForStore('Open https://example.org/x', 'await page.goto("https://example.org/x")')).not.toBeNull();
    expect(S.sanitizeForStore('Click <step>', 'await x')).toBeNull();
    const candidates = [
      { id: 'a', stepText: 'click <value1> button', code: 'await a()', originHost: 'one.test' },
      { id: 'b', stepText: 'click <value1> link', code: 'await b()', originHost: 'two.test' },
      { id: 'c', stepText: 'scroll down', code: 'await c()', originHost: 'two.test' },
    ];
    const ranked = S.rankExamples(candidates, 'Click the "Go" button', 'one.test');
    expect(ranked.map((c: any) => c.id)).toEqual(['a', 'b']);
    expect(S.renderExamples(ranked)).toContain('<examples>');
    expect(S.renderExamples([{ stepText: 'x', code: "await p.fill('hunter2')" }])).toBe('');
  });

  it('refuses a cap environment that differs from the phase and a run directory from another phase', () => {
    const saved = process.env.SPK07_MAX_CALLS;
    process.env.SPK07_MAX_CALLS = '5';
    try { expect(() => D.capEnv('tune')).toThrow(/CAP_ENV_MISMATCH/u); } finally { if (saved === undefined) delete process.env.SPK07_MAX_CALLS; else process.env.SPK07_MAX_CALLS = saved; }
    expect(D.PHASES.tune.calls + D.PHASES.final.calls + D.PHASES.eval.calls).toBeLessThanOrEqual(3400);
    expect(D.PHASES.tune.tokens + D.PHASES.final.tokens + D.PHASES.eval.tokens).toBeLessThanOrEqual(51_000_000);
    expect(existsSync(fileURLToPath(new URL('docs/qa/evidence/SC008-E18', REPO)))).toBe(false);
  });
});

describe('execution oracle on local fixture pages (AC3, AC7)', () => {
  let runner: any; let browser: any; let hosts: any;
  const role = (r: string, name: string) => ({ chain: [{ m: 'getByRole', a: [r, { name, exact: true }] }] });
  const mk = (text: string, kind: string, gt: unknown, url = 'fixture://t1/home') => ({ id: 'selftest', host: 'controls', url, expect: 'ACTION', setup: [], steps: [{ text, operation: { kind }, gt }] });
  beforeAll(async () => {
    runner = await S.loadRunner();
    const { startCorpusPages } = await import(new URL('../observed-authoring/pages/server.mjs', GROUNDING).href);
    hosts = { corpus: await startCorpusPages(), controls: await startCorpusPages({ root: fileURLToPath(new URL('studio-runner/evaluation/grounding/e18/controls/pages', REPO)) }) };
    browser = await runner.playwright.chromium.launch({ headless: true });
  }, 60000);
  afterAll(async () => { await browser?.close(); await hosts?.corpus.close(); await hosts?.controls.close(); });

  async function go(task: any, code: string, control = false): Promise<any> {
    const unit = await S.openUnit({ runner, browser, hosts, task, upto: 0, tag: `t${Math.random().toString(36).slice(2, 7)}` });
    try {
      const vars: Record<string, unknown> = {};
      const run = await S.runCode({ runner, unit, task, stepIndex: 0, code, vars, mode: 'real' });
      return await S.judge({ unit, task, stepIndex: 0, run, vars, controlRule: control });
    } finally { await unit.close(); }
  }
  const click = mk('Click the "Save" button', 'click', role('button', 'Save'));
  const status = mk('Verify that the status shows "Active"', 'assert', { chain: [{ m: 'locator', a: ['#status'] }] });

  it('scores ground-truth code 100 percent and wrong code 0 percent', async () => {
    expect((await go(click, "await page.getByRole('button', { name: 'Save' }).click();")).success).toBe(true);
    expect((await go(click, "await page.getByRole('button', { name: 'Cancel' }).click();")).reason).toBe('WRONG_ELEMENT_EFFECT');
    expect((await go(click, "await page.getByRole('button', { name: 'Save' }).click();\nawait page.getByRole('button', { name: 'Cancel' }).click();")).success).toBe(false);
    expect((await go(click, 'await page.waitForTimeout(10);')).reason).toBe('NO_EFFECT');
    expect((await go(status, "await expect(page.locator('#status')).toContainText('Active');")).success).toBe(true);
    expect((await go(status, "await expect(page.locator('body')).toBeVisible();")).reason).toBe('ASSERT_WRONG_ELEMENT');
    expect((await go(status, 'expect(1).toBe(1);')).reason).toBe('NO_LOCATOR_EXPECT');
  }, 120000);

  it('fails a control whose code runs ok and passes one that fails without effect', async () => {
    const control = { ...mk('Click the "Remove" button', 'click', null, 'fixture://t2/home'), expect: 'CLARIFICATION' };
    expect((await go(control, 'await page.waitForTimeout(10);', true)).reason).toBe('RAN_OK_NOT_CLARIFIED');
    expect((await go(control, "await page.getByRole('button', { name: 'Download' }).first().click();", true)).success).toBe(false);
  }, 120000);

  it('runs an outcome check on the true page and fails it on the false-outcome twin', async () => {
    const code = "await expect(page.locator('#status')).toContainText('Active');";
    const trueUnit = await S.openUnit({ runner, browser, hosts, task: status, upto: 0, tag: 'twinsa' });
    const twinTask = { ...status, url: 'fixture://t1f/home' };
    const twinUnit = await S.openUnit({ runner, browser, hosts, task: twinTask, upto: 0, tag: 'twinsb' });
    try {
      const on = await S.runCode({ runner, unit: trueUnit, task: status, stepIndex: 0, code, vars: {}, mode: 'real' });
      const off = await S.runCode({ runner, unit: twinUnit, task: twinTask, stepIndex: 0, code, vars: {}, mode: 'real', useGt: false });
      expect(on.result.ok).toBe(true);
      expect(on.receivers.length).toBeGreaterThan(0);
      expect(off.result.ok).toBe(false);
      expect(off.result.closedCode).toBe('ASSERTION_FAILED');
    } finally { await trueUnit.close(); await twinUnit.close(); }
  }, 120000);
});
