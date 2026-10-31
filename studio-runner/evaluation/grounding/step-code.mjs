/* eslint-disable -- SC008-E18 evaluation driver: untyped .mjs harness, Node globals. */
// SC008-E18 driver: split, record, observe, sizes, run (tune | final | eval), seed, freeze, report, check.
//
//   node evaluation/grounding/step-code.mjs split
//   node evaluation/grounding/step-code.mjs record [--only substring] [--concurrency 2]
//   node evaluation/grounding/step-code.mjs observe [--sets tune,eval,tuning,final]
//   node evaluation/grounding/step-code.mjs sizes
//   node evaluation/grounding/step-code.mjs run --phase tune|final|eval [--round N] [--arms T,S,R] [--reps N] [--only id,id]
//   node evaluation/grounding/step-code.mjs seed --round N       (retrieval store from the tune round's first-attempt passes)
//   node evaluation/grounding/step-code.mjs freeze                (after the final controls pass)
//   node evaluation/grounding/step-code.mjs report
//   node evaluation/grounding/step-code.mjs check
// Node 24, run from studio-runner/. Screening evidence, not the counted gate. Thresholds and rules: e18/prereg.json.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clusterBootstrapDiff, mean, mulberry32, percentile, readJson, readJsonl, seedFrom, shuffled } from './lib/stats.mjs';
import * as S from './lib/stepcode.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const E18 = join(HERE, 'e18');
export const RUNS = join(HERE, 'runs');
export const EVID = '/Users/brunobuger/.aiox-lean/put-checks-ui-studio/SC008/work/SC008-E18/evidence';
const REPO = resolve(HERE, '../../..');
const CORPUS = join(HERE, 'corpus', 'tasks.jsonl');
const HAR_DIR = join(RUNS, 'e18-har');
const OBS_DIR = join(RUNS, 'e18-cache', 'obs');
export const PHASES = { tune: { id: 'e18-tune', calls: 800, tokens: 12_000_000 }, final: { id: 'e18-final', calls: 150, tokens: 2_000_000 }, replan: { id: 'e18-replan', calls: 589, tokens: 9_000_000 }, eval: { id: 'e18-eval', calls: 2200, tokens: 36_000_000 },
  // SC008-E22 stage 0.6: the final controls again on the current prompts (FIX-9, FIX-10); run directory outside the repo (E22_FINAL_RUNS), 200-call cap by user decision.
  final2: { id: 'e22-final', calls: 200, tokens: 2_000_000, runsDir: process.env.E22_FINAL_RUNS },
  // SC008-FIX-18: tuning rounds on the tuning18 replicas and the one fresh final run on final18; run directories outside the repo (FIX18_RUNS).
  tune18: { id: 'fix18-tune', calls: 130, tokens: 1_500_000, runsDir: process.env.FIX18_RUNS },
  final18: { id: 'fix18-final', calls: 120, tokens: 1_500_000, runsDir: process.env.FIX18_RUNS },
  // SC008-FIX-18 revision 3 (hidden/absent outcome rule): tuning replicas tuning18b, one fresh final set final18b; total FIX-18 cap 335 calls (243 used before final18b, which is capped at 90).
  tune18b: { id: 'fix18-tuneb', calls: 40, tokens: 600_000, runsDir: process.env.FIX18_RUNS },
  final18b: { id: 'fix18-finalb', calls: 90, tokens: 1_000_000, runsDir: process.env.FIX18_RUNS },
  // SC008-FIX-21 (step-contract tuning R1-R4): tuning replicas tuning21 (A/B rounds) and one fresh final set final21; total FIX-21 cap 200 calls (tune21 142 + final21 92 (diagnostic raised the total to 222)); run directories outside the repo (FIX21_RUNS).
  tune21: { id: 'fix21-tune', calls: 142, tokens: 1_500_000, runsDir: process.env.FIX21_RUNS },
  final21: { id: 'fix21-final', calls: 92, tokens: 1_500_000, runsDir: process.env.FIX21_RUNS },
  // SC008-FIX-26 (step-contract R5 scoped list item, R6 live values): total cap 120 calls across the three phases (40 + 80 + 0); run directories outside the repo (FIX26_RUNS).
  // tune26 = A/B on tuning26 (plans stated); final26 = the final21 set; final26b = a subset of the final18b set (--only).
  tune26: { id: 'fix26-tune', calls: 40, tokens: 600_000, runsDir: process.env.FIX26_RUNS },
  final26: { id: 'fix26-final', calls: 80, tokens: 1_200_000, runsDir: process.env.FIX26_RUNS },
  final26b: { id: 'fix26-finalb', calls: 0, tokens: 200_000, runsDir: process.env.FIX26_RUNS } }; // eval raised from 1,800 / 30M by user decision 2026-10-30 (total 3,400 calls / 50M tokens); prereg.json is unchanged
const MODEL = 'gemini-3.8-flash';
let unhandled = 0;

const norm = text => String(text ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
const readJsonl2 = file => readJsonl(file);
const write = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const fileSha = file => S.sha256(readFileSync(file));
const gitSha = () => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(); } catch { return null; } };

// ---- split ----------------------------------------------------------------------------------------------------------------
const OUTCOME_RE = /^(check|verify|confirm|ensure|assert)\b|\b(should|is visible|is shown|is displayed|is hidden|shows?|contains?|has the value)\b/iu;
export const isOutcomeStep = step => step.operation?.kind === 'assert' || OUTCOME_RE.test(step.text);

export function computeSplit() {
  const gate = readJson(join(REPO, 'frontend/e2e/realsite-gate/gate-table.json'));
  const smoke = readJson(join(REPO, 'frontend/e2e/realsite-gate/smoke-flows.json'));
  const heldTexts = new Set(); const heldIds = new Set(); const heldUrls = new Set();
  const note = text => { heldTexts.add(norm(text)); const m = /go to (?:the page )?["“]([^"”]+)["”]/iu.exec(text); if (m) heldUrls.add(m[1].replace(/\/$/u, '')); };
  for (const t of gate.tests) { t.steps.forEach(note); (t.corpusTasks ?? []).forEach(id => heldIds.add(id)); }
  for (const f of smoke.flows) f.steps.forEach(note);
  const rows = readJsonl2(CORPUS);
  const excluded = []; const eligible = [];
  for (const r of rows) {
    const byId = heldIds.has(r.id); const byText = r.steps.some(s => heldTexts.has(norm(s.text)));
    if (byId || byText) excluded.push({ id: r.id, byId, byText }); else eligible.push(r);
  }
  const outcomeSteps = [];
  const pick = ho => eligible.filter(r => r.heldOut === ho);
  const tune = pick(false); const evaluate = pick(true);
  for (const r of eligible) r.steps.forEach((s, i) => { if (isOutcomeStep(s)) outcomeSteps.push(`${r.id}|${i}`); });
  const overlap = tune.filter(r => heldUrls.has(r.url.replace(/\/$/u, '')));
  const hosts = r => { try { return new URL(r.url).host.replace(/^www\./u, ''); } catch { return 'fixture'; } };
  const gateHosts = new Set([...gate.tests.map(t => t.site.replace(/^www\./u, '')), ...smoke.flows.map(f => f.site.replace(/^www\./u, ''))]);
  const sameHost = tune.filter(r => gateHosts.has(hosts(r)));
  const controls = ['tuning', 'final'].map(set => readJsonl2(join(E18, 'controls', `${set}.jsonl`)).map(c => c.id));
  return {
    corpusSha256: fileSha(CORPUS), gateTableSha256: fileSha(join(REPO, 'frontend/e2e/realsite-gate/gate-table.json')), smokeSha256: fileSha(join(REPO, 'frontend/e2e/realsite-gate/smoke-flows.json')),
    rule: 'drop a task if its id is a gate corpusTask or any step text (normalized) equals a gate-table or smoke-flows step; tune = heldOut:false sites plus fixtures; eval = heldOut:true sites',
    excluded, counts: { corpus: rows.length, excluded: excluded.length, eligible: eligible.length, tune: tune.length, eval: evaluate.length, tuneSteps: tune.reduce((n, r) => n + r.steps.length, 0), evalSteps: evaluate.reduce((n, r) => n + r.steps.length, 0), outcomeSteps: outcomeSteps.length },
    tune: tune.map(r => r.id), eval: evaluate.map(r => r.id), outcomeSteps, controls: { tuning: controls[0], final: controls[1] },
    overlap: { tuneTasksSharingUrlWithGateOrSmokeStep: overlap.length, tuneTasksOnGateOrSmokeHosts: sameHost.length, note: 'the tune sites are the gate-positive sites; verbatim exclusion is what AC-I6 requires (named limit)' },
  };
}

// ---- tasks and hosts --------------------------------------------------------------------------------------------------------
export function loadUnits(setName) {
  if (['tuning', 'final', 'tuning18', 'final18', 'tuning18b', 'final18b', 'tuning21', 'final21', 'tuning26'].includes(setName)) return readJsonl2(join(E18, 'controls', `${setName}.jsonl`));
  const split = readJson(join(E18, 'split.json'));
  const ids = new Set(split[setName]);
  return readJsonl2(CORPUS).filter(r => ids.has(r.id));
}
const harFile = task => join(HAR_DIR, `${S.sha256(task.url).slice(0, 16)}.har`);
const isPublic = task => /^https?:/u.test(task.url);
const hostOf = task => { try { return new URL(task.url).host; } catch { return null; } };

export async function startEnv() {
  const runner = await S.loadRunner();
  const dist = statSync(join(REPO, 'studio-runner/dist/run/stepCode.js')).mtimeMs; const src = statSync(join(REPO, 'studio-runner/src/run/stepCode.ts')).mtimeMs;
  const srcB = statSync(join(REPO, 'studio-runner/src/run/stepCodeBinding.ts')).mtimeMs;
  // SC008-FIX-21: tuning A/B rounds may run on the dist they started on while another work item edits runner sources (FIX21_STALE_DIST_OK=1); the final21 run refuses it.
  if ((src > dist || srcB > dist) && process.env.FIX21_STALE_DIST_OK !== '1' && process.env.FIX26_STALE_DIST_OK !== '1') throw new Error('DIST_STALE: rebuild the runner dist (controller action)');
  const { startCorpusPages } = await import('../observed-authoring/pages/server.mjs');
  const hosts = { corpus: await startCorpusPages(), controls: await startCorpusPages({ root: join(E18, 'controls', 'pages') }) };
  const browser = await runner.playwright.chromium.launch({ headless: true });
  const env = { runner, hosts, browser, async close() { await env.browser.close().catch(() => undefined); await hosts.corpus.close().catch(() => undefined); await hosts.controls.close().catch(() => undefined); } };
  return env;
}
async function pool(items, width, work) {
  let next = 0; const results = [];
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => { for (;;) { const index = next++; if (index >= items.length) return; results[index] = await work(items[index], index); } }));
  return results;
}
const tagOf = (task, kind) => `${task.id}-${kind}-${Math.random().toString(36).slice(2, 7)}`.toLowerCase().replace(/[^a-z0-9-]/gu, '-').slice(0, 32);
async function ensureBrowser(env) {
  if (env.browser.isConnected()) return;
  env.relaunch ??= (async () => { env.browser = await env.runner.playwright.chromium.launch({ headless: true }); })().finally(() => { env.relaunch = null; });
  await env.relaunch;
}
const unitOf = async (env, task, upto, extra = {}) => { await ensureBrowser(env); return unitOpen(env, task, upto, extra); };
const unitOpen = (env, task, upto, extra = {}) => S.openUnit({ runner: env.runner, browser: env.browser, hosts: env.hosts, task, upto, harFile: isPublic(task) ? harFile(task) : null, tag: tagOf(task, 'u'), ...extra });

// ---- record (GET/HEAD only, enforced in openUnit) -----------------------------------------------------------------------------
async function record(args) {
  const env = await startEnv();
  const tasks = [...loadUnits('tune'), ...loadUnits('eval')].filter(isPublic).filter(t => !args.only || t.url.includes(args.only));
  const groups = new Map(); for (const t of tasks) { const g = groups.get(t.url) ?? []; g.push(t); groups.set(t.url, g); }
  mkdirSync(join(HAR_DIR, 'tmp'), { recursive: true });
  const manifest = readJson(join(HAR_DIR, 'manifest.json'), { recordedAt: null, groups: {} });
  const stats = { aborts: 0, thirdParty: new Set() };
  try {
    await pool([...groups.entries()], Number(args.concurrency ?? 2), async ([url, list]) => {
      if (!args.force && manifest.groups[url] && existsSync(harFile(list[0]))) { console.log(`skip ${url} (recorded)`); return; }
      const merged = { log: { version: '1.2', creator: { name: 'e18', version: '1' }, pages: [], entries: [] } }; const seen = new Set(); let ok = 0; let bad = 0;
      for (const task of list) {
        const tmp = join(HAR_DIR, 'tmp', `${task.id}.har`);
        const rec = { aborts: 0, thirdParty: new Set() };
        const upto = task.steps.every(s => s.gt) ? task.steps.length : 0;
        const unit = await S.openUnit({ runner: env.runner, browser: env.browser, hosts: env.hosts, task, upto, harFile: tmp, record: rec, tag: tagOf(task, 'r') });
        if (unit.load.void) bad++; else ok++;
        await unit.close();
        stats.aborts += rec.aborts; rec.thirdParty.forEach(h => stats.thirdParty.add(h));
        if (existsSync(tmp)) for (const e of readJson(tmp).log.entries) { if (!(e.response.status > 0)) continue; const key = `${e.request.method} ${e.request.url}`; if (!seen.has(key)) { seen.add(key); merged.log.entries.push(e); } }
        await new Promise(r => setTimeout(r, 700));
      }
      write(harFile(list[0]), merged);
      manifest.groups[url] = { har: harFile(list[0]).split('/').pop(), tasks: list.length, loaded: ok, voidLoads: bad, entries: merged.log.entries.length };
      console.log(`recorded ${url} tasks=${list.length} entries=${merged.log.entries.length} void=${bad}`);
    });
  } finally { await env.close(); }
  manifest.recordedAt = new Date().toISOString(); manifest.nonGetRequestsAborted = (manifest.nonGetRequestsAborted ?? 0) + stats.aborts;
  manifest.thirdPartyHosts = [...new Set([...(manifest.thirdPartyHosts ?? []), ...stats.thirdParty])].sort();
  write(join(HAR_DIR, 'manifest.json'), manifest); write(join(EVID, 'recording-manifest.json'), manifest);
}

// ---- observe ------------------------------------------------------------------------------------------------------------------
const obsFile = (task, i) => join(OBS_DIR, `${task.id}-${i}.json`);
async function observeUnit(env, task, i) {
  const unit = await unitOf(env, task, i);
  try {
    if (unit.load.void) return { void: true, reason: unit.load.reason };
    const step = task.steps[i];
    if (step.gt) { const gt = await (await import('./lib/gt.mjs')).resolveGt(unit.page, unit.load.cdp, step.gt); if (gt.void) return { void: true, reason: gt.reason }; }
    const { perceive } = await import('./lib/perceive.mjs');
    const perceived = await perceive({ page: unit.page, cdp: unit.load.cdp, stepText: step.text, resolveIds: false });
    return { void: false, outline: perceived.outline, bytes: perceived.meta.bytes, nodes: perceived.meta.nodes, projected: perceived.meta.projected, origin: perceived.origin };
  } finally { await unit.close(); }
}
async function getObs(env, task, i) {
  const file = obsFile(task, i);
  if (existsSync(file)) return readJson(file);
  const obs = await observeUnit(env, task, i);
  write(file, obs);
  return obs;
}
async function observe(args) {
  const env = await startEnv();
  try {
    for (const set of String(args.sets ?? 'tune,eval,tuning,final').split(',')) {
      const jobs = loadUnits(set).filter(t => !args.only || t.url.includes(args.only)).flatMap(task => task.steps.map((_, i) => [task, i]));
      let voids = 0;
      await pool(jobs, 4, async ([task, i]) => { const o = await getObs(env, task, i); if (o.void) { voids++; console.log(`VOID ${task.id}|${i} ${o.reason}`); } });
      console.log(`observed ${set}: ${jobs.length} units, ${voids} void`);
    }
  } finally { await env.close(); }
}

// ---- sizes (AC-I5, no model) -----------------------------------------------------------------------------------------------------
async function sizes() {
  const texts = S.loadTexts(); const ext = texts.reference.extendedIds();
  const largest = [...ext].sort((a, b) => texts.reference.sections.get(b).body.length - texts.reference.sections.get(a).body.length).slice(0, 4);
  const rows = { twoStageCoreOnly: [], twoStageWorstCase: [], singleStageFullReference: [], plan: [] };
  for (const set of ['tune', 'eval', 'tuning', 'final']) for (const task of loadUnits(set)) {
    const session = S.makeSession(task);
    rows.plan.push({ fits: true, bytes: S.wireBytes(S.planRequest({ session, texts }).body) });
    for (let i = 0; i < task.steps.length; i++) {
      const o = existsSync(obsFile(task, i)) ? readJson(obsFile(task, i)) : null; if (!o || o.void) continue;
      const base = { session, plan: null, stepIndex: i, outline: o.outline, texts, originHost: o.origin };
      rows.twoStageCoreOnly.push(S.stepRequestBytes({ ...base, sections: [] }));
      rows.twoStageWorstCase.push(S.stepRequestBytes({ ...base, sections: largest }));
      rows.singleStageFullReference.push(S.stepRequestBytes({ ...base, sections: [], full: true }));
    }
  }
  const stats = list => { const b = list.filter(r => r.fits).map(r => r.bytes); return { n: list.length, doesNotFit: list.filter(r => !r.fits).length, max: b.length ? Math.max(...b) : null, p95: percentile(b, 95), mean: b.length ? Math.round(mean(b)) : null }; };
  const out = { cap: S.WIRE_CAP, contractBytes: Buffer.byteLength(texts.stepContract), planContractBytes: Buffer.byteLength(texts.planContract), referenceBytes: Buffer.byteLength(readFileSync(S.PATHS.reference)), stepContractHash: texts.stepContractHash, referenceHash: texts.referenceHash, largestFourExtended: largest, arms: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, stats(v)])) };
  write(join(EVID, 'sizes.json'), out);
  return out;
}

// ---- model calls, plans, steps ---------------------------------------------------------------------------------------------------
class BudgetStop extends Error {}
export function capEnv(phase) {
  const p = PHASES[phase];
  for (const [name, value] of [['SPK07_MAX_CALLS', p.calls], ['SPK07_MAX_PROMPT_TOKENS_TOTAL', p.tokens]]) {
    if (process.env[name] !== undefined && Number(process.env[name]) !== value) throw new Error(`CAP_ENV_MISMATCH ${name}=${process.env[name]} expected ${value}`);
    process.env[name] = String(value);
  }
  if (process.env.SPK07_RUN_ID !== undefined && process.env.SPK07_RUN_ID !== p.id) throw new Error('CAP_ENV_MISMATCH SPK07_RUN_ID');
  if (p.id.startsWith('fix18-') && !p.runsDir) throw new Error('FIX18_RUNS required: the fix18 run directories live outside the repo');
  if (p.id.startsWith('fix26-') && !p.runsDir) throw new Error('FIX26_RUNS required: the fix26 run directories live outside the repo');
  if (p.id.startsWith('fix21-') && !p.runsDir) throw new Error('FIX21_RUNS required: the fix21 run directories live outside the repo');
  if (p.id === 'e22-final' && !p.runsDir) throw new Error('E22_FINAL_RUNS required: the e22-final run directory lives outside the repo');
  const base = p.runsDir ?? RUNS;
  process.env.SPK07_RUN_ID = p.id; process.env.SPK07_RUNS_DIR = base;
  const dir = join(base, p.id); mkdirSync(dir, { recursive: true });
  const marker = join(dir, 'phase.json');
  if (existsSync(marker) && readJson(marker).phase !== phase) throw new Error('RUN_DIR_FROM_OTHER_PHASE');
  if (!existsSync(marker)) { if (existsSync(join(dir, 'calls.jsonl'))) throw new Error('RUN_DIR_FROM_OTHER_PHASE'); write(marker, { phase }); }
  return dir;
}

function allowedCaptures(plan, stepId) { return (plan?.needs ?? []).filter(n => n.producerStepId === stepId).map(n => n.bindingId); }

async function planFor(ctx, task, planRep) {
  const key = `${task.id}|${planRep}`;
  if (ctx.plans.has(key)) return ctx.plans.get(key);
  const job = (async () => {
    const file = join(ctx.dir, 'plans', `${task.id}-${planRep}.json`);
    const session = S.makeSession(task, `${task.id}|plan${planRep}`);
    if (existsSync(file)) { const saved = readJson(file); return { ...saved, session }; }
    if (task.plan) {
      // SC008-FIX-21: a stated plan (no model call) for replicas that need an exact obligation, need or consumer: task.plan = { obligations: [{ step, targetIntent, scopeIntent, needId, uses }] }.
      const reply = { kind: 'SOURCE_PLAN', obligations: task.plan.obligations.map(o => ({ stepId: session.sourceSteps[o.step].stepId, targetIntent: o.targetIntent, scopeIntent: o.scopeIntent ?? null, needId: o.needId ?? null, uses: o.uses ?? [] })), stepSections: task.plan.obligations.filter(o => o.sections).map(o => ({ stepId: session.sourceSteps[o.step].stepId, sections: o.sections })) };
      const stated = S.admitPlan(reply, session);
      const saved = { ms: 0, usage: null, refusal: null, stated: true, plan: { obligations: stated.obligations, needs: stated.needs, sections: [...stated.sections] } };
      write(file, saved);
      return { ...saved, session };
    }
    const request = S.planRequest({ session, texts: ctx.texts });
    let plan = null; let ms = 0; let usage = null; let modelError = false; let refusal = null;
    for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
      const resp = await ctx.send(request.body, { label: `${task.id}|plan|${planRep}|${attempt}` });
      if (resp.error?.startsWith('CAP_') || resp.error === 'ADC_TOKEN_UNAVAILABLE') throw new BudgetStop(resp.error);
      ms += resp.ms; usage = resp.usage;
      modelError = resp.status !== 200 || !resp.reply;
      refusal = resp.reply?.status ?? resp.reply?.reasonCode ?? (resp.reply?.question ? 'QUESTION' : null);
      plan = S.admitPlan(resp.reply, session);
      if (!plan && !modelError) break; // a definite refusal is not retried
    }
    if (!plan && modelError) throw new Error('PLAN_MODEL_ERROR');
    const saved = { ms, usage, refusal, plan: plan ? { obligations: plan.obligations, needs: plan.needs, sections: [...plan.sections] } : null };
    write(file, saved);
    return { ...saved, session };
  })();
  ctx.plans.set(key, job);
  job.catch(() => ctx.plans.delete(key));
  return job;
}
const planObject = saved => (saved.plan ? { obligations: saved.plan.obligations, needs: saved.plan.needs, sections: new Map(saved.plan.sections) } : null);

/** Prepare run, then the judged real run (and the false-outcome twin for outcome pairs) for one piece of code. */
export async function execAttempt(env, { task, i, code, plan, stepId, readIndex, control, out }) {
  const seedFor = unit => {
    const vars = {};
    for (const need of plan?.needs ?? []) {
      if (!need.consumers.some(c => c.stepId === stepId)) continue;
      const value = unit.load.readValues[readIndex.get(need.producerStepId)];
      if (typeof value === 'string') vars[need.bindingId] = value;
    }
    return vars;
  };
  const unitPrep = await unitOf(env, task, i);
  let prepared;
  try { prepared = await S.runCode({ runner: env.runner, unit: unitPrep, task, stepIndex: i, code, vars: seedFor(unitPrep), mode: 'prepare' }); } finally { await unitPrep.close(); }
  if (prepared.void) return { void: prepared.reason };
  if (!prepared.result.ok) return { prepareFailed: true, closedCode: prepared.result.closedCode, matchCount: prepared.result.matchCount, prepExpect: prepared.receivers.length > 0 };
  const unitReal = await unitOf(env, task, i);
  let real; let judged;
  try {
    const vars = seedFor(unitReal);
    real = await S.runCode({ runner: env.runner, unit: unitReal, task, stepIndex: i, code, vars, mode: 'real' });
    if (real.void) return { void: real.reason };
    judged = out ? { success: real.result.ok && real.receivers.length > 0, reason: real.result.ok ? 'TRUE_PAGE_OK' : `TRUE_PAGE_${real.result.closedCode}` }
      : await S.judge({ unit: unitReal, task, stepIndex: i, run: real, vars, controlRule: control, expectCapture: allowedCaptures(plan, stepId).length > 0 });
  } finally { await unitReal.close(); }
  const expectSeen = real.receivers.length > 0;
  const fields = { ok: real.result.ok, closedCode: real.result.closedCode ?? null, effects: real.result.effects.length, events: real.events.length };
  if (out) {
    const twin = { ...task, url: task.twinUrl, steps: task.steps.map(x => ({ ...x })) };
    const unitTwin = await unitOf(env, twin, i);
    try {
      const run = await S.runCode({ runner: env.runner, unit: unitTwin, task: twin, stepIndex: i, code, vars: {}, mode: 'real', useGt: false });
      fields.twinClosedCode = run.result.ok ? 'OK' : run.result.closedCode;
      judged = { success: judged.success && expectSeen && !run.result.ok && run.result.closedCode === 'ASSERTION_FAILED', reason: `${judged.reason}|TWIN_${fields.twinClosedCode}${expectSeen ? '' : '|NO_EXPECT'}` };
    } finally { await unitTwin.close(); }
  }
  return { judged, expectSeen, fields, prepExpect: prepared.receivers.length > 0 };
}

/** One learn loop (<= 3 attempts) for a step: model, admission, prepare run, then the real run that is judged. */
export async function learnStep(ctx, env, { task, i, arm, rep }) {
  const key = `${task.id}|${i}|${arm}|${rep}`;
  await ensureBrowser(env); // a dead browser must fail before a model call is spent
  let obs = readJson(obsFile(task, i)) ?? await getObs(env, task, i);
  if (obs.void) return { key, task: task.id, step: i, arm, rep, void: true, reason: obs.reason };
  const step = task.steps[i];
  if (step.outlineEdits) {
    // SC008-FIX-21: the replica outline is brought to the product's shape (ordinal hints, unnamed node text, withheld values) by stated string edits; an edit that finds nothing is an error.
    let outline = obs.outline;
    for (const [from, to] of step.outlineEdits) { if (!outline.includes(from)) throw new Error(`OUTLINE_EDIT_NOT_FOUND ${from}`); outline = outline.split(from).join(to); }
    obs = { ...obs, outline };
  }
  const control = task.expect !== undefined && task.expect !== 'ACTION';
  const out = task.pattern === 'OUT';
  const planSaved = await planFor(ctx, task, ctx.controlPlanOnce && task.pattern ? 0 : (ctx.planRepOf?.(rep) ?? rep));
  let plan = planObject(planSaved);
  const session = planSaved.session;
  const stepId = session.sourceSteps[i].stepId;
  if (step.selectedChoice && plan) {
    // SC008-FIX-21: the author's earlier answer: the ref is the outline node the choice names ({ role, name, line }: first outline line with that role and a substring).
    const line = obs.outline.split('\n').find(l => l.trimStart().startsWith(`- ${step.selectedChoice.role}`) && l.includes(step.selectedChoice.line));
    const ref = /\[(e\d+)\]/u.exec(line ?? '')?.[1];
    if (!ref) return { key, task: task.id, step: i, arm, rep, void: true, reason: 'SELECTED_CHOICE_NOT_IN_OUTLINE' };
    plan = { ...plan, obligations: plan.obligations.map(o => (o.stepId === stepId ? { ...o, selectedChoice: { role: step.selectedChoice.role, name: step.selectedChoice.name, ref, scopeHash: S.sha256(obs.outline) } } : o)) };
  }
  const sections = arm === 'S' ? [] : (plan?.sections.get(stepId) ?? []);
  const readIndex = new Map(session.sourceSteps.map((s, j) => [s.stepId, j]));
  let examplesBlock = '';
  if (arm === 'R') examplesBlock = S.renderExamples(S.rankExamples(ctx.store, step.text, hostOf(task)));
  const attempts = []; let repair = null; let repairCodes = []; let final = null; let expectSeen = false; let planMsCharged = arm === 'S' ? 0 : planSaved.ms;
  for (let attempt = 1; attempt <= 3 && !final; attempt++) {
    const request = S.stepRequest({ session, plan, stepIndex: i, outline: obs.outline, texts: ctx.texts, sections, examplesBlock, repair, repairCodes, attempt, originHost: obs.origin, full: arm === 'S' });
    const record = { attempt, bytes: request.bytes, sections: request.sections?.length ?? 0 };
    if (request.error) { record.outcome = 'BUDGET_EXCEEDED'; attempts.push(record); final = { success: false, reason: 'BUDGET_EXCEEDED' }; break; }
    const resp = await ctx.send(request.body, { label: `${key}|${attempt}` });
    if (resp.error?.startsWith('CAP_') || resp.error === 'ADC_TOKEN_UNAVAILABLE') throw new BudgetStop(resp.error);
    record.ms = resp.ms; record.usage = resp.usage;
    if (resp.status !== 200 || !resp.reply) { record.outcome = 'MODEL_ERROR'; record.error = String(resp.error ?? '').slice(0, 80); attempts.push(record); return { key, task: task.id, step: i, arm, rep, incomplete: true, attempts }; }
    const parsed = S.parseStepReply(resp.reply, request.requestId, allowedCaptures(plan, stepId));
    repairCodes = [];
    if (parsed.error) { record.outcome = parsed.error; repairCodes = [parsed.error]; repair = null; attempts.push(record); continue; }
    if (parsed.clarification) {
      record.outcome = 'CLARIFICATION'; attempts.push(record);
      final = control ? { success: true, reason: 'CLARIFIED' } : { success: false, reason: 'CLARIFIED_ACTION_STEP' };
      break;
    }
    record.code = parsed.code; record.captures = parsed.captures;
    const frozen = { stepId: 'e18', code: parsed.code, sourceHash: env.runner.hashObserved(parsed.code) };
    const admission = env.runner.admitStep(frozen);
    if (!admission.ok) { record.outcome = 'STEP_SYNTAX'; repair = { closedCode: 'STEP_SYNTAX', stage: 'SYNTAX', line: admission.syntax?.line ?? null, column: admission.syntax?.column ?? null, facts: 'the code does not parse', previousCode: parsed.code }; attempts.push(record); continue; }
    const executed = await execAttempt(env, { task, i, code: parsed.code, plan, stepId, readIndex, control, out });
    if (executed.void) { final = { void: true, reason: executed.void }; record.outcome = 'VOID'; attempts.push(record); break; }
    if (executed.prepareFailed) {
      record.outcome = 'PRE_FENCE'; record.closedCode = executed.closedCode; record.expect = executed.prepExpect;
      repair = { closedCode: 'TARGET_DRIFT', stage: 'PRE_FENCE', line: null, column: null, facts: `the code failed before its first action; its target matched ${executed.matchCount ?? 'an unknown number of'} elements`, previousCode: parsed.code };
      attempts.push(record); continue;
    }
    const judged = executed.judged; expectSeen = executed.expectSeen;
    Object.assign(record, executed.fields, { outcome: 'RAN', reason: judged.reason, success: judged.success, expect: expectSeen });
    attempts.push(record); final = judged;
  }
  if (!final) final = { success: control && attempts.every(a => ['PRE_FENCE', 'STEP_SYNTAX', 'INVALID_RESPONSE', 'INVALID_CAPTURE'].includes(a.outcome)), reason: 'ATTEMPTS_EXHAUSTED_NO_EXECUTION' };
  if (final.void) return { key, task: task.id, step: i, arm, rep, void: true, reason: final.reason, attempts };
  const first = attempts[0]; const firstSuccess = Boolean(first && ((first.outcome === 'RAN' && first.success) || (first.outcome === 'CLARIFICATION' && final.success && attempts.length === 1)));
  const modelMs = attempts.reduce((n, a) => n + (a.ms ?? 0), 0);
  return { key, task: task.id, step: i, arm, rep, pattern: task.pattern ?? null, control, opKind: step.operation?.kind ?? null, planNull: plan === null, outcomeStep: isOutcomeStep(step), site: task.site ?? null, firstSuccess, success: Boolean(final.success), reason: final.reason, repairs: attempts.length - 1, attempts: attempts.map(a => (a.code ? { ...a, codeHash: S.sha256(a.code) } : a)), modelMs, planMs: planMsCharged, learnMs: modelMs + planMsCharged, expectOnFirst: Boolean(first?.expect) };
}

async function runPhase(args) {
  const phase = args.phase; if (!PHASES[phase]) throw new Error('PHASE_REQUIRED');
  const prereg = join(E18, 'prereg.json'); const preregSha = fileSha(prereg);
  const texts = S.loadTexts();
  const dir = capEnv(phase);
  if (phase === 'final21' && process.env.FIX21_STALE_DIST_OK === '1') throw new Error('FINAL21_REFUSED a stale runner dist is not allowed on the final run');
  if (phase.startsWith('final26') && process.env.FIX18_STEP_CONTRACT) throw new Error('FINAL26_REFUSED the FIX18_STEP_CONTRACT override is not allowed on the final run');
  if ((phase.startsWith('final18') || phase === 'final21') && process.env.FIX18_STEP_CONTRACT) throw new Error('FINAL18_REFUSED the FIX18_STEP_CONTRACT override is not allowed on the final run');
  if (phase === 'eval') {
    const freeze = readJson(join(EVID, 'freeze.json'));
    if (!freeze) throw new Error('EVAL_REFUSED no freeze.json: run the final controls and `freeze` first');
    if (freeze.preregSha !== preregSha) throw new Error('EVAL_REFUSED prereg.json changed after the freeze');
    if (freeze.stepContractHash !== texts.stepContractHash || freeze.planContractHash !== texts.planContractHash || freeze.referenceHash !== texts.referenceHash) throw new Error('EVAL_REFUSED the contract differs from the frozen hash');
  }
  let replanTasks = null;
  if (phase === 'replan') {
    // FIX-9 re-plan: only the stand-alone Copy-step tasks whose eval plan was refused, against the new plan contract; step contract and reference stay frozen.
    const freeze = readJson(join(EVID, 'freeze.json'));
    if (!freeze || freeze.stepContractHash !== texts.stepContractHash || freeze.referenceHash !== texts.referenceHash) throw new Error('REPLAN_REFUSED step contract or reference differs from the frozen hash');
    if (!texts.planContractHash.startsWith('6b086fa228dca9b0')) throw new Error(`REPLAN_REFUSED plan contract hash ${texts.planContractHash.slice(0, 16)} is not the FIX-9 contract`);
    const evalTasks = new Map(loadUnits('eval').map(t => [t.id, t]));
    replanTasks = new Set();
    for (const f of readdirSync(join(RUNS, PHASES.eval.id, 'plans'))) {
      const id = f.replace(/-\d+\.json$/u, ''); const t = evalTasks.get(id);
      if (t && t.steps.some(st => st.operation?.kind === 'read') && readJson(join(RUNS, PHASES.eval.id, 'plans', f))?.plan === null) replanTasks.add(id);
    }
  }
  const header = join(dir, 'run.json');
  if (existsSync(header)) { const h = readJson(header); if (h.preregSha !== preregSha) throw new Error('PREREG_CHANGED_AFTER_FIRST_CALL'); }
  else write(header, { phase, preregSha, gitSha: gitSha(), model: MODEL, startedAt: new Date().toISOString(), referenceHash: texts.referenceHash, stepContractHash: texts.stepContractHash, planContractHash: texts.planContractHash, stepContractOverride: Boolean(process.env.FIX18_STEP_CONTRACT) });
  const round = Number(args.round ?? 1);
  const vertex = await import('./lib/vertex.mjs');
  const env = await startEnv();
  const stepsFile = join(dir, phase === 'tune' || phase.startsWith('tune18') || phase === 'tune21' || phase === 'tune26' ? `steps-r${round}.jsonl` : 'steps.jsonl');
  const done = new Map(readJsonl2(stepsFile).filter(r => !r.incomplete).map(r => [r.key, r]));
  const ctx = { texts, dir, plans: new Map(), send: (body, o) => vertex.send(body, o), store: [], controlPlanOnce: true, planRepOf: phase === 'tune' || phase.startsWith('tune18') || phase === 'tune21' || phase === 'tune26' ? () => 0 : undefined };
  if (!existsSync(join(dir, 'plans'))) mkdirSync(join(dir, 'plans'), { recursive: true });
  const arms = String(args.arms ?? (phase === 'eval' || phase === 'replan' ? 'T,S,R' : 'T')).split(',');
  if (arms.includes('R')) ctx.store = readJsonl2(join(RUNS, 'e18-store.jsonl'));
  const only = args.only ? new Set(String(args.only).split(',')) : null;
  const sets = phase === 'tune' ? ['tune', 'tuning'] : phase === 'tune18' ? ['tuning18'] : phase === 'tune18b' ? ['tuning18b'] : phase === 'final18' ? ['final18'] : phase === 'final18b' ? ['final18b'] : phase === 'tune21' ? ['tuning21'] : phase === 'tune26' ? ['tuning26'] : phase === 'final21' || phase === 'final26' ? ['final21'] : phase === 'final26b' ? ['final18b'] : phase === 'final' || phase === 'final2' ? ['final'] : ['eval'];
  if (replanTasks) console.log(`replan tasks: ${replanTasks.size}`);
  const jobs = [];
  for (const set of sets) for (const task of loadUnits(set)) {
    if (only && !only.has(task.id)) continue;
    if (replanTasks && !replanTasks.has(task.id)) continue;
    const reps = task.reps ?? Number(args.reps ?? (phase === 'eval' || phase === 'replan' ? 2 : 1));
    for (let i = 0; i < task.steps.length; i++) for (const arm of arms) for (let rep = 0; rep < reps; rep++) {
      if (task.steps[i].noRun) continue; // SC008-FIX-21: a step present only so the plan and the session are complete (its consumer)
      const key = `${task.id}|${i}|${arm}|${rep}`; if (!done.has(key)) jobs.push({ task, i, arm, rep });
    }
  }
  const order = mulberry32(seedFrom(`e18|${phase}|${round}`)); const queue = shuffled(jobs, order);
  console.log(`${phase} round ${round}: ${queue.length} units to run (${done.size} done)`);
  let stopped = null; let ran = 0;
  try {
    await pool(queue, Number(args.concurrency ?? 4), async job => {
      if (stopped) return;
      try { const row = await learnStep(ctx, env, job); appendFileSync(stepsFile, `${JSON.stringify({ ...row, round, phase })}\n`); ran++; if (ran % 20 === 0) console.log(`ran ${ran}/${queue.length} ${JSON.stringify(vertex.counters())}`); }
      catch (error) { if (error instanceof BudgetStop) stopped = error.message; else { console.error(`unit ${job.task.id}|${job.i}|${job.arm}|${job.rep} failed: ${String(error.stack ?? error).split('\n').slice(0, 3).join(' / ')}`); appendFileSync(stepsFile, `${JSON.stringify({ key: `${job.task.id}|${job.i}|${job.arm}|${job.rep}`, incomplete: true, error: String(error.message).slice(0, 160), round, phase })}\n`); } }
    });
  } finally { await env.close(); }
  const counters = vertex.counters();
  write(join(dir, `summary-r${round}.json`), { phase, round, ran, stopped, counters, endedAt: new Date().toISOString() });
  console.log(JSON.stringify({ ran, stopped, ...counters }));
  if (stopped) { writeFileSync(join(dir, 'STOPPED_AT_CAP'), `${stopped} ${new Date().toISOString()}\n`); process.exitCode = 3; }
}


/** Re-execute and re-judge the recorded code of a round with the current harness (no model call). Writes steps-r<N>.rejudged.jsonl. */
async function rejudge(args) {
  const phase = args.phase ?? 'tune'; const round = Number(args.round ?? 1);
  const texts = S.loadTexts(); const dir = join(RUNS, PHASES[phase].id);
  const src = join(dir, phase === 'tune' ? `steps-r${round}.jsonl` : 'steps.jsonl'); const dst = src.replace(/\.jsonl$/u, '.rejudged.jsonl');
  const env = await startEnv();
  const ctx = { texts, dir, plans: new Map(), send: async () => { throw new Error('REJUDGE_NO_MODEL'); }, controlPlanOnce: true, planRepOf: phase === 'tune' ? () => 0 : undefined };
  const tasks = new Map([...loadUnits('tune'), ...loadUnits('eval'), ...loadUnits('tuning'), ...loadUnits('final')].map(t => [t.id, t]));
  const rows = readJsonl2(src).filter(r => !r.incomplete && !r.void);
  writeFileSync(dst, '');
  await pool(rows, 4, async row => {
    const task = tasks.get(row.task); const attempts = row.attempts ?? [];
    const k = attempts.findIndex(a => a.outcome === 'RAN' && a.code);
    if (k >= 0 && task) {
      const control = task.expect !== undefined && task.expect !== 'ACTION'; const out = task.pattern === 'OUT';
      const planRep = ctx.controlPlanOnce && task.pattern ? 0 : (ctx.planRepOf?.(row.rep) ?? row.rep);
      const planSaved = await planFor(ctx, task, planRep).catch(() => ({ plan: null, session: S.makeSession(task, `${task.id}|plan${planRep}`) }));
      const plan = planObject(planSaved); const stepId = planSaved.session.sourceSteps[row.step].stepId; const readIndex = new Map(planSaved.session.sourceSteps.map((x, j) => [x.stepId, j]));
      const executed = await execAttempt(env, { task, i: row.step, code: attempts[k].code, plan, stepId, readIndex, control, out });
      if (executed.judged) {
        Object.assign(attempts[k], executed.fields, { reason: executed.judged.reason, success: executed.judged.success, expect: executed.expectSeen, rejudged: true });
        row.success = Boolean(executed.judged.success); row.reason = executed.judged.reason;
        row.firstSuccess = Boolean(attempts[0].outcome === 'RAN' && attempts[0].success); row.expectOnFirst = Boolean(attempts[0].expect);
      } else { row.rejudgeNote = executed.void ? `VOID ${executed.void}` : 'PREPARE_FAILED_ON_REPLAY'; }
    }
    appendFileSync(dst, `${JSON.stringify(row)}\n`);
  });
  await env.close();
  console.log(`rejudged ${rows.length} rows -> ${dst}`);
}


/**
 * Measurement fix (disclosed): an attempt that failed the until-fence prepare run never recorded its expect receivers, so its first-attempt
 * expect was counted as missing. Re-run the prepare for the outcome steps whose first attempt has code and no recorded expect, and append the
 * corrected row (same key, last row wins). No model call.
 */
async function reexpect() {
  const file = join(RUNS, PHASES.eval.id, 'steps.jsonl');
  const tasks = new Map(loadUnits('eval').map(t => [t.id, t]));
  const rows = rowsOf('eval').filter(r => r.outcomeStep && !r.control && r.attempts?.[0]?.code && r.attempts[0].expect !== true);
  const env = await startEnv();
  try {
    await pool(rows, 3, async row => {
      const task = tasks.get(row.task);
      const unit = await unitOf(env, task, row.step);
      let seen = false;
      try { const run = await S.runCode({ runner: env.runner, unit, task, stepIndex: row.step, code: row.attempts[0].code, vars: {}, mode: 'prepare' }); seen = !run.void && run.receivers.length > 0; } finally { await unit.close(); }
      row.attempts[0].expect = seen; row.expectOnFirst = seen; row.expectRechecked = true;
      appendFileSync(file, `${JSON.stringify(row)}\n`);
    });
  } finally { await env.close(); }
  console.log(`rechecked ${rows.length} rows`);
}

// ---- seed, freeze, report, check ---------------------------------------------------------------------------------------------------
function seed(args) {
  const round = Number(args.round);
  const base = join(RUNS, PHASES.tune.id, `steps-r${round}.jsonl`); const judged = base.replace(/\.jsonl$/u, '.rejudged.jsonl');
  const rows = readJsonl2(existsSync(judged) ? judged : base).filter(r => !r.incomplete && !r.void && r.firstSuccess && r.arm === 'T' && !r.pattern);
  const tune = new Map(loadUnits('tune').map(t => [t.id, t])); const store = [];
  for (const r of rows) {
    const task = tune.get(r.task); const code = r.attempts[0]?.code; if (!task || !code) continue;
    const clean = S.sanitizeForStore(task.steps[r.step].text, code); if (!clean) continue;
    store.push({ id: S.sha256(`${r.task}|${r.step}`).slice(0, 16), ...clean, originHost: (hostOf(task) ?? '').toLowerCase() });
  }
  writeFileSync(join(RUNS, 'e18-store.jsonl'), store.map(x => JSON.stringify(x)).join('\n') + '\n');
  console.log(`store: ${store.length} examples from tune round ${round} (cross-site seeds; not the product store)`);
}

const KIND_OF = (() => { let map = null; return row => { map ??= new Map(readJsonl2(CORPUS).flatMap(t => t.steps.map((st, i) => [`${t.id}|${i}`, st.operation?.kind]))); return row.opKind ?? map.get(`${row.task}|${row.step}`) ?? 'control'; }; })();
const byKind = rows => { const out = {}; for (const r of rows.filter(x => !x.control && !x.pattern)) { const k = ['read', 'assert'].includes(KIND_OF(r)) ? KIND_OF(r) : 'action'; const o = out[k] ??= { n: 0, first: 0, final: 0 }; o.n++; o.first += r.firstSuccess ? 1 : 0; o.final += r.success ? 1 : 0; } return out; };
const rate = list => (list.length ? list.filter(Boolean).length / list.length : null);
function rowsOf(phase, file = 'steps.jsonl') { const last = new Map(); for (const r of readJsonl2(join(RUNS, PHASES[phase].id, file))) if (!r.incomplete) last.set(r.key, r); return [...last.values()].filter(r => !r.void); }

export function controlSummary(rows) {
  const out = {};
  for (const pattern of ['N1', 'N3', 'OUT']) {
    const list = rows.filter(r => r.pattern === pattern);
    out[pattern] = { trials: list.length, success: list.filter(r => r.success).length, failures: list.filter(r => !r.success).map(r => ({ task: r.task, rep: r.rep, reason: r.reason })), byReason: Object.fromEntries([...new Set(list.map(r => r.reason))].map(k => [k, list.filter(r => r.reason === k).length])) };
  }
  return out;
}

function report() {
  const header = phase => readJson(join(RUNS, PHASES[phase].id, 'run.json'));
  const out = { generatedAt: new Date().toISOString(), gitSha: gitSha(), model: MODEL, prereg: fileSha(join(E18, 'prereg.json')), texts: (({ stepContractHash, planContractHash, referenceHash }) => ({ stepContractHash, planContractHash, referenceHash }))(S.loadTexts()), phases: {} };
  for (const phase of Object.keys(PHASES)) {
    const dir = join(RUNS, PHASES[phase].id); if (!existsSync(dir)) continue;
    const calls = readJsonl2(join(dir, 'calls.jsonl'));
    out.phases[phase] = { header: header(phase), calls: calls.length, promptTokens: calls.reduce((n, c) => n + (c.usage?.prompt ?? 0), 0), outputTokens: calls.reduce((n, c) => n + (c.usage?.out ?? 0) + (c.usage?.thoughts ?? 0), 0), wallMs: calls.length ? Date.parse(calls.at(-1).ts) - Date.parse(calls[0].ts) : 0, stoppedAtCap: existsSync(join(dir, 'STOPPED_AT_CAP')) };
    const p = out.phases[phase]; p.estimatedUsd = Number(((p.promptTokens * 0.75 + p.outputTokens * 3.75) / 1e6).toFixed(2));
  }
  // tuning rounds
  const tuneDir = join(RUNS, PHASES.tune.id);
  if (existsSync(tuneDir)) {
    out.tuning = [];
    for (const f of readdirSync(tuneDir).filter(n => /^steps-r\d+\.jsonl$/u.test(n)).sort()) {
      const rejudged = f.replace(/\.jsonl$/u, '.rejudged.jsonl');
      const rows = readJsonl2(join(tuneDir, existsSync(join(tuneDir, rejudged)) ? rejudged : f)).filter(r => !r.incomplete && !r.void);
      const corpus = rows.filter(r => !r.pattern);
      const act = corpus.filter(r => !r.control);
      const outcome = act.filter(r => r.outcomeStep);
      out.tuning.push({ round: f, units: rows.length, firstAttemptSuccess: rate(act.map(r => r.firstSuccess)), byKind: byKind(corpus), planNullUnits: corpus.filter(r => r.planNull).length, negativesHandled: rate(corpus.filter(r => r.control).map(r => r.success)), outcomeStepExpectRate: rate(outcome.map(r => r.expectOnFirst)), controls: controlSummary(rows) });
    }
  }
  const finalRows = existsSync(join(RUNS, PHASES.final.id)) ? rowsOf('final') : [];
  if (finalRows.length) out.finalControls = controlSummary(finalRows);
  // eval
  if (existsSync(join(RUNS, PHASES.eval.id, 'steps.jsonl'))) {
    // FIX-9: units of the Copy-step tasks re-run against the new plan contract replace their earlier rows (same key).
    const replanned = existsSync(join(RUNS, PHASES.replan.id, 'steps.jsonl')) ? new Map(rowsOf('replan').map(r => [r.key, r])) : new Map();
    const everything = rowsOf('eval').map(r => replanned.get(r.key) ?? r);
    const triple = r => `${r.task}|${r.step}|${r.rep}`;
    const armsOf = new Map(); for (const r of everything) { const set = armsOf.get(triple(r)) ?? new Set(); set.add(r.arm); armsOf.set(triple(r), set); }
    const rows = everything.filter(r => armsOf.get(triple(r)).size === 3); // matched triples only: T, S and R all finished for the same task, step and rep
    const act = rows.filter(r => !r.control);
    const key = r => `${r.task}|${r.step}`;
    const arms = ['T', 'S', 'R']; const ev = { coverage: { unitsDone: everything.length, matchedTriples: rows.length / 3, expectedTriples: 148 * 2, matchedTasks: new Set(rows.map(r => r.task)).size }, arms: {}, voidUnits: readJsonl2(join(RUNS, PHASES.eval.id, 'steps.jsonl')).filter(r => r.void).length };
    for (const arm of arms) {
      const mine = rows.filter(r => r.arm === arm); const a = mine.filter(r => !r.control);
      ev.arms[arm] = { failReasons: Object.fromEntries(Object.entries(mine.filter(r => !r.control && !r.firstSuccess).reduce((m, r) => { const k = r.attempts?.[0]?.outcome === 'BUDGET_EXCEEDED' ? 'BUDGET_EXCEEDED' : (r.attempts?.[0]?.reason ?? r.attempts?.[0]?.outcome ?? 'NONE'); m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1])), byKind: byKind(mine), planNullUnits: mine.filter(r => r.planNull).length, units: mine.length, firstAttemptSuccess: rate(a.map(r => r.firstSuccess)), finalSuccess: rate(a.map(r => r.success)), repairsPerUnit: mean(mine.map(r => r.repairs)), p95LearnMs: percentile(mine.map(r => r.learnMs), 95), p50LearnMs: percentile(mine.map(r => r.learnMs), 50),
        negativesHandled: rate(mine.filter(r => r.control).map(r => r.success)), outcomeStepExpectRate: rate(a.filter(r => r.outcomeStep).map(r => r.expectOnFirst)), outcomeStepSuccess: rate(a.filter(r => r.outcomeStep).map(r => r.firstSuccess)),
        perRep: [0, 1].map(rep => rate(a.filter(r => r.rep === rep).map(r => r.firstSuccess))) };
      ev.arms[arm].noiseFloorRepGap = ev.arms[arm].perRep[0] !== null && ev.arms[arm].perRep[1] !== null ? Math.abs(ev.arms[arm].perRep[0] - ev.arms[arm].perRep[1]) : null;
      ev.arms[arm].p95LearnMsWithPlanCharged = arm === 'S' ? percentile(mine.map(r => r.modelMs + (rows.find(x => x.arm === 'T' && x.task === r.task && x.rep === r.rep)?.planMs ?? 0)), 95) : ev.arms[arm].p95LearnMs;
    }
    const pairs = (x, y) => { const byTask = new Map(); for (const r of act) { if (r.arm !== x && r.arm !== y) continue; const c = byTask.get(r.task) ?? { id: r.task, x: { k: 0, n: 0 }, y: { k: 0, n: 0 } }; const side = r.arm === x ? c.x : c.y; side.k += r.firstSuccess ? 1 : 0; side.n += 1; byTask.set(r.task, c); } return clusterBootstrapDiff([...byTask.values()], { seed: `e18|${x}|${y}` }); };
    ev.twoStageMinusSingle = pairs('T', 'S'); ev.retrievalMinusTwoStage = pairs('R', 'T');
    const prereg = readJson(join(E18, 'prereg.json'));
    const T = ev.arms.T; const Sg = ev.arms.S; const R = ev.arms.R;
    ev.decisions = {
      twoStage: T.firstAttemptSuccess !== null && Sg.firstAttemptSuccess !== null ? { keepTwoStage: (T.firstAttemptSuccess - Sg.firstAttemptSuccess) >= prereg.d10.twoStageMinSuccessDiff && T.p95LearnMs <= Sg.p95LearnMs, successDiff: T.firstAttemptSuccess - Sg.firstAttemptSuccess, p95T: T.p95LearnMs, p95S: Sg.p95LearnMs } : null,
      retrieval: R.units ? { keepRetrieval: R.firstAttemptSuccess >= T.firstAttemptSuccess && R.repairsPerUnit <= T.repairsPerUnit, successDiff: R.firstAttemptSuccess - T.firstAttemptSuccess, repairsR: R.repairsPerUnit, repairsT: T.repairsPerUnit } : { unmeasured: true },
    };
    out.eval = ev;
  }
  out.userDecisions = { twoStage: 'keep two-stage (user, 2026-10-30; supersedes the literal p95 rule)', retrieval: 'dropped from the product (user, 2026-10-30; handled by FIX-10, not E18)', planContractAfterFix9: '6b086fa228dca9b0...' };
  write(join(EVID, 'results.json'), out);
  return out;
}

function check() {
  const problems = [];
  const need = (cond, text) => { if (!cond) problems.push(text); };
  const prereg = join(E18, 'prereg.json'); need(existsSync(prereg), 'prereg.json missing');
  const split = readJson(join(E18, 'split.json')); need(Boolean(split), 'split.json missing');
  if (split) {
    const again = computeSplit();
    need(JSON.stringify({ ...again }) === JSON.stringify({ ...split }), 'split.json is not reproducible from the corpus, gate table and smoke flows');
    need(split.tune.every(id => !split.eval.includes(id)), 'tune and eval overlap');
  }
  try { const freeze = JSON.parse(readFileSync(join(HERE, 'corpus', 'freeze.json'), 'utf8')); need(freeze.sha256 === fileSha(CORPUS), 'frozen corpus hash differs'); } catch { problems.push('corpus freeze.json unreadable'); }
  for (const phase of Object.keys(PHASES)) {
    const dir = join(RUNS, PHASES[phase].id); if (!existsSync(dir)) continue;
    const h = readJson(join(dir, 'run.json')); if (h) need(h.preregSha === fileSha(prereg), `${phase}: prereg hash differs from the run header`);
    const calls = readJsonl2(join(dir, 'calls.jsonl')); need(calls.length <= PHASES[phase].calls + 4, `${phase}: calls ${calls.length} above cap ${PHASES[phase].calls}`);
    need(calls.reduce((n, c) => n + (c.usage?.prompt ?? 0), 0) <= PHASES[phase].tokens + 4 * 120000, `${phase}: prompt tokens above cap`);
    need(!existsSync(join(dir, 'bodies')), `${phase}: request bodies were kept`);
  }
  const results = join(EVID, 'results.json'); if (existsSync(results)) { const r = readJson(results); for (const f of ['gitSha', 'model', 'prereg', 'texts']) need(r[f], `results.json lacks ${f}`); need(r.texts?.referenceHash, 'results.json lacks referenceHash'); }
  const stray = join(REPO, 'docs/qa/evidence/SC008-E18'); need(!existsSync(stray), 'evidence must live under work/SC008-E18/evidence, not docs/qa/evidence');
  console.log(problems.length ? `CHECK FAILED\n${problems.join('\n')}` : 'CHECK OK');
  if (problems.length) process.exitCode = 1;
}

function freeze() {
  const rows = rowsOf('final'); const summary = controlSummary(rows);
  const prereg = readJson(join(E18, 'prereg.json'));
  const ok = ['N1', 'N3'].every(p => summary[p].trials >= prereg.controls.minTrials && summary[p].success === summary[p].trials) && summary.OUT.trials > 0 && summary.OUT.success === summary.OUT.trials;
  if (!ok) { console.error(`FREEZE REFUSED ${JSON.stringify(summary)}`); process.exitCode = 1; return; }
  const texts = S.loadTexts();
  write(join(EVID, 'freeze.json'), { frozenAt: new Date().toISOString(), stepContractHash: texts.stepContractHash, planContractHash: texts.planContractHash, referenceHash: texts.referenceHash, preregSha: fileSha(join(E18, 'prereg.json')), finalControls: summary });
  console.log('FROZEN');
}

function parse(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; else args._.push(argv[i]); }
  return args;
}
async function main() {
  // Code that floats a Playwright promise can reject after its step ended; that must not kill a run of hundreds of units.
  process.on('unhandledRejection', reason => { unhandled++; if (unhandled <= 5) console.error(`unhandledRejection (kept running): ${String(reason?.message ?? reason).split('\n')[0].slice(0, 160)}`); });
  const args = parse(process.argv.slice(2)); const cmd = args._[0];
  mkdirSync(EVID, { recursive: true });
  if (cmd === 'split') { const s = computeSplit(); write(join(E18, 'split.json'), s); console.log(JSON.stringify(s.counts), JSON.stringify(s.overlap)); }
  else if (cmd === 'record') await record(args);
  else if (cmd === 'observe') await observe(args);
  else if (cmd === 'sizes') console.log(JSON.stringify(await sizes(), null, 1));
  else if (cmd === 'run') await runPhase(args);
  else if (cmd === 'rejudge') await rejudge(args);
  else if (cmd === 'reexpect') await reexpect();
  else if (cmd === 'seed') seed(args);
  else if (cmd === 'freeze') freeze();
  else if (cmd === 'report') console.log(JSON.stringify(report(), null, 1));
  else if (cmd === 'check') check();
  else { console.error('usage: step-code.mjs split|record|observe|sizes|run|seed|freeze|report|check'); process.exitCode = 2; }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => { console.error(String(error.stack ?? error.message)); process.exitCode = 1; });
