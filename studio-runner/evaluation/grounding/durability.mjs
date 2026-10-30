/* eslint-disable -- SPK-07 spike tooling: untyped .mjs harness, dynamic imports of arm modules, Node globals. */
// SPK-07 durability (screening evidence, not ADR-SC-005 D-C evidence), pre-registration section 11.
//
//   node evaluation/grounding/durability.mjs RUN_DIR [--contexts 5] [--concurrency 3] [--tasks id,...] [--arms S2,S3] [--include-wrong]
//
// Every frozen locator of a run (the locator an arm froze for an ACTION it got right) is re-resolved in fresh contexts,
// varied ONE FACTOR AT A TIME (not factorial), per task:
//   baseline          N fresh contexts (default 5) at 1280x720, en-US, the task's own cookie choice
//   viewport          1 fresh context at 1920x1080
//   locale            1 fresh context at en-GB
//   cookie-opposite   1 fresh context with the opposite banner choice, only where corpus/sites.json has a banner hint
// The task's own GT chain is re-resolved in the same load (VOID if gone) and each result is classified:
//   OK            exactly one element and it is the GT
//   FAIL_CLOSED   count != 1 (the locator refuses, nothing is clicked)
//   WRONG_UNIQUE  exactly one element and it is NOT the GT (HZ-2 in any condition)
// S2..S4 locators and A0/A1/S1 hints (reported as tier 'hint') are resolved with Playwright's own engine inside the
// isolated world when they map to an internal selector; the public Playwright API resolves the same locator on the same
// load and any difference in the matched element set is HZ-6 (engine conformance). Locators that were already the wrong
// element at freeze are skipped by default (confident-wrong results are counted elsewhere); --include-wrong keeps them.
// Rerunnable >=24h later: the first run writes durability.jsonl, later runs durability-<timestamp>.jsonl.
import { existsSync, writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locatorIds } from './lib/cdp.mjs';
import { toSelector } from './lib/synth.mjs';
import { clickEquivalent, locatorFlags, locatorFromFrozen, openLoad, performChainStep, resolveGt } from './lib/gt.mjs';
import { call, evaluateHandle, isolatedWorld, backendNodeId } from './lib/cdp.mjs';
import { engineExpression, hintSelector } from './lib/pwEngine.mjs';
import { lastByKey, readJson, readJsonl } from './lib/stats.mjs';
import { paths as freezePaths } from './freeze.mjs';

export const BASELINE = { viewport: { width: 1280, height: 720 }, locale: 'en-US' };
export const ALT_VIEWPORT = { width: 1920, height: 1080 };
export const ALT_LOCALE = 'en-GB';
const HINT_ARMS = new Set(['A0', 'A1', 'S1']);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function classifyResolution(ids, gtIds) {
  if (ids.length !== 1) return 'FAIL_CLOSED';
  return gtIds.includes(ids[0]) ? 'OK' : 'WRONG_UNIQUE';
}

/** Distinct frozen locators of a run: final attempt per task/step/arm/rep, ACTION with a locator, deduped by locator. */
export function collectFrozen(stepRows, { includeWrong = false, arms = null } = {}) {
  const finals = new Map();
  for (const row of lastByKey(stepRows)) {
    const id = `${row.task}|${row.step}|${row.arm}|${row.rep}`;
    const current = finals.get(id);
    if (!current || row.attempt > current.attempt) finals.set(id, row);
  }
  const distinct = new Map();
  for (const row of finals.values()) {
    if (row.status !== 'ACTION' || !row.locator || (arms && !arms.includes(row.arm))) continue;
    if (!includeWrong && !(row.correctElement && row.executable === true)) continue;
    // S3/S4 rows carry the typed locator plus the Playwright internal selector string synth.mjs produced; keep both.
    let selector = typeof row.selector === 'string' ? row.selector : null;
    if (selector === null && Array.isArray(row.locator)) { try { selector = toSelector(row.locator); } catch { selector = null; } }
    const locatorKey = JSON.stringify(row.locator);
    const id = `${row.task}|${row.step}|${row.arm}|${locatorKey}|${selector ?? ''}`;
    const entry = distinct.get(id) ?? { task: row.task, step: row.step, arm: row.arm, tier: HINT_ARMS.has(row.arm) ? 'hint' : (row.locatorTier ?? 'untyped'),
      kind: HINT_ARMS.has(row.arm) ? 'hint' : 'frozen', locator: row.locator, selector, locatorKey, equivalentDescendant: row.equivalentDescendant === true, ...locatorFlags(row.locator), reps: [] };
    entry.reps.push(row.rep);
    distinct.set(id, entry);
  }
  return [...distinct.values()];
}

/**
 * Cookie-banner conditions for a task. corpus/sites.json: { "<site>": { "cookie": { "accept": {chain}, "reject": {chain} } } }.
 * baseline = the task's setup as written; opposite = the other banner choice (null when the site has no banner hint).
 */
export function cookieVariants(task, sites) {
  const base = task.setup ?? [];
  const baseline = { name: 'task', setup: base };
  const hint = sites?.[task.site]?.cookie;
  if (!hint) return { baseline, opposite: null };
  const optional = gt => ({ op: 'click', gt, optional: true });
  const rejectAt = hint.reject ? base.findIndex(entry => same(entry.gt, hint.reject)) : -1;
  const acceptAt = hint.accept ? base.findIndex(entry => same(entry.gt, hint.accept)) : -1;
  const swap = (index, gt) => base.map((entry, i) => (i === index ? optional(gt) : entry));
  if (rejectAt >= 0 && hint.accept) return { baseline, opposite: { name: 'accepted', setup: swap(rejectAt, hint.accept) } };
  if (acceptAt >= 0 && hint.reject) return { baseline, opposite: { name: 'rejected', setup: swap(acceptAt, hint.reject) } };
  if (hint.accept) return { baseline, opposite: { name: 'accepted', setup: [optional(hint.accept), ...base] } };
  if (hint.reject) return { baseline, opposite: { name: 'rejected', setup: [optional(hint.reject), ...base] } };
  return { baseline, opposite: null };
}

/** One-factor-at-a-time trial plan for a task: baseline x contexts, then one context per changed factor. */
export function trialPlan(task, sites, contexts = 5) {
  const { baseline, opposite } = cookieVariants(task, sites);
  const plan = [];
  for (let n = 1; n <= contexts; n++) plan.push({ cond: 'baseline', n, viewport: BASELINE.viewport, locale: BASELINE.locale, variant: baseline });
  plan.push({ cond: 'viewport', n: 1, viewport: ALT_VIEWPORT, locale: BASELINE.locale, variant: baseline });
  plan.push({ cond: 'locale', n: 1, viewport: BASELINE.viewport, locale: ALT_LOCALE, variant: baseline });
  if (opposite) plan.push({ cond: 'cookie-opposite', n: 1, viewport: BASELINE.viewport, locale: BASELINE.locale, variant: opposite });
  return plan;
}

/**
 * Engine resolver for one load: Playwright's InjectedScript in a fresh isolated world, built lazily. Returns backendNodeIds of
 * the elements the internal selector matches, or null when the locator has no internal-selector form (chains, unknown kinds).
 */
export function makeEngineIds(load) {
  let engine = null;
  let boundTo = null;
  const selectorOf = (locator, selector) => {
    if (typeof selector === 'string') return selector;
    if (typeof locator?.selector === 'string') return locator.selector;
    if (['role', 'label', 'testId', 'text', 'placeholder'].includes(locator?.kind)) return hintSelector(locator);
    return null;
  };
  return async (locator, carried = null) => {
    const selector = selectorOf(locator, carried);
    if (selector === null) return null;
    if (engine === null || boundTo !== load.cdp) { boundTo = load.cdp; engine = await evaluateHandle(load.cdp, await isolatedWorld(load.cdp), engineExpression()); }
    const count = await call(load.cdp, engine, 'function(s) { const all = this.querySelectorAll(this.parseSelector(s), document); globalThis.__spk07q = all; return all.length; }', [selector]);
    const ids = [];
    for (let i = 0; i < count; i++) ids.push(await backendNodeId(load.cdp, await call(load.cdp, engine, 'function(i) { return globalThis.__spk07q[i]; }', [i], false)));
    return ids;
  };
}

/** Walks one load: GT-resolve each step (VOID when gone), classify that step's frozen locators, advance with the GT locator. */
export async function walkLoad({ load, task, frozen, trial, deps = {} }) {
  const resolve_ = deps.resolveGt ?? ((gt) => resolveGt(load.page, load.cdp, gt));
  const perform = deps.performStep ?? ((step, gt, stepIndex) => performChainStep(load, step, stepIndex, gt));
  const idsOf = deps.locatorIds ?? (locator => locatorIds(load.page, load.cdp, locator));
  const engineIds = deps.engineIds ?? (load.cdp ? makeEngineIds(load) : async () => null);
  const toLocator = deps.locatorFromFrozen ?? ((locator, selector) => locatorFromFrozen(load.page, locator, selector));
  const rows = [];
  const lastStep = Math.max(...frozen.map(item => item.step));
  const emit = (item, outcome, extra = {}) => rows.push({ task: task.id, step: item.step, arm: item.arm, tier: item.tier, kind: item.kind, locatorKey: item.locatorKey, positional: item.positional ?? false, nonExact: item.nonExact ?? false, trial, outcome, ...extra });
  if (load.void) { for (const item of frozen) emit(item, 'VOID', { reason: load.reason }); return rows; }
  for (let stepIndex = 0; stepIndex <= lastStep; stepIndex++) {
    const step = task.steps[stepIndex];
    const here = frozen.filter(item => item.step === stepIndex);
    const gt = await resolve_(step.gt ?? null);
    if (gt.void) {
      for (const item of frozen.filter(candidate => candidate.step >= stepIndex)) emit(item, 'VOID', { reason: gt.reason });
      return rows;
    }
    for (const item of here) {
      let ids;
      let engineChecked = false;
      try {
        const publicIds = await idsOf(toLocator(item.locator, item.selector ?? null));
        const viaEngine = await engineIds(item.locator, item.selector ?? null);
        // The replay resolver is the engine where the locator maps to an internal selector; the public API is the reference (HZ-6).
        ids = viaEngine ?? publicIds;
        engineChecked = viaEngine !== null;
        if (viaEngine !== null && !(viaEngine.length === publicIds.length && viaEngine.every((id, i) => id === publicIds[i]))) {
          emit(item, classifyResolution(ids, gt.ids), { count: ids.length, engineChecked, hz6: true, engineCount: viaEngine.length, publicCount: publicIds.length });
          continue;
        }
      } catch (error) {
        const message = String(error.message).split('\n')[0];
        emit(item, message.startsWith('LOCATOR_SHAPE') ? 'UNSUPPORTED_SHAPE' : 'FAIL_CLOSED', { count: null, reason: message });
        continue;
      }
      let outcome = classifyResolution(ids, gt.ids);
      let extra = {};
      // A locator frozen on a descendant of the GT (click-equivalent at freeze) stays OK while it is still such a descendant.
      if (outcome === 'WRONG_UNIQUE' && item.equivalentDescendant) {
        try {
          const eq = await (deps.equivalent ?? ((a, b) => clickEquivalent(load.cdp, a, b)))(ids[0], gt.ids[0]);
          if (eq.equivalent) { outcome = 'OK'; extra = { equivalentDescendant: true }; }
        } catch { /* keep WRONG_UNIQUE: an unverifiable equivalence is not a pass */ }
      }
      emit(item, outcome, { count: ids.length, engineChecked, ...extra });
    }
    if (stepIndex < lastStep) {
      try { await perform(step, gt, stepIndex); await load.renewCdp?.(); } catch (error) {
        for (const item of frozen.filter(candidate => candidate.step > stepIndex)) emit(item, 'VOID', { reason: `GT_PERFORM_FAILED ${String(error.message).split('\n')[0]}` });
        return rows;
      }
    }
  }
  return rows;
}

export function summarizeDurability(rows) {
  const blank = () => ({ OK: 0, FAIL_CLOSED: 0, WRONG_UNIQUE: 0, VOID: 0, UNSUPPORTED_SHAPE: 0 });
  const byTier = {}; const byArm = {}; const byArmTier = {}; const byCondition = {}; const byExactness = {};
  for (const row of rows) {
    (byTier[row.tier] ??= blank())[row.outcome]++;
    (byArm[row.arm] ??= blank())[row.outcome]++;
    (byArmTier[`${row.arm}/${row.tier}`] ??= blank())[row.outcome]++;
    (byCondition[row.trial?.cond ?? 'baseline'] ??= blank())[row.outcome]++;
    (byExactness[`${row.nonExact ? 'non-exact' : 'exact'}/${row.positional ? 'positional' : 'non-positional'}`] ??= blank())[row.outcome]++;
  }
  const wrongUnique = rows.filter(row => row.outcome === 'WRONG_UNIQUE').slice(0, 50).map(row => ({ task: row.task, step: row.step, arm: row.arm, tier: row.tier, trial: row.trial }));
  const hz6 = rows.filter(row => row.hz6).slice(0, 50).map(row => ({ task: row.task, step: row.step, arm: row.arm, engineCount: row.engineCount, publicCount: row.publicCount }));
  return { trials: rows.length, byTier, byArm, byArmTier, byCondition, byExactness, wrongUnique, hz6 };
}

export function outputNames(runDir, now = new Date(), label = null) {
  const stamp = now.toISOString().replace(/[-:]/gu, '').replace(/\.\d+Z$/u, 'Z');
  if (!label && !existsSync(join(runDir, 'durability.jsonl'))) return { rows: 'durability.jsonl', summary: 'durability-summary.json' };
  return { rows: `durability-${label ?? stamp}.jsonl`, summary: `durability-summary-${label ?? stamp}.json` };
}

export async function runDurability({ runDir, browser, fixtureHost = null, tasks, frozen, sites = null, contexts = 5, concurrency = 3,
  now = () => new Date(), openTaskLoad = openLoad, deps = {}, label = null, log = () => undefined }) {
  const dir = resolve(runDir);
  const names = outputNames(dir, now(), label);
  const runJson = readJson(join(dir, 'run.json'), {});
  // "Next day" = at least 24 h after the END of the full run (run.json.endedAt); startedAt is only a fallback for runs that never finished.
  const endedAtRaw = runJson.endedAt ?? runJson.startedAt;
  const startedAt = endedAtRaw ? Date.parse(endedAtRaw) : null;
  const collected = [];
  const byTask = new Map();
  for (const item of frozen) { const list = byTask.get(item.task) ?? []; list.push(item); byTask.set(item.task, list); }
  const jobs = [];
  for (const task of tasks) {
    const items = byTask.get(task.id);
    if (!items) continue;
    for (const planned of trialPlan(task, sites, contexts)) jobs.push({ task, items, ...planned });
  }
  const queue = [...jobs];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const trial = { cond: job.cond, n: job.n, viewport: `${job.viewport.width}x${job.viewport.height}`, locale: job.locale, cookie: job.variant.name };
      const load = await openTaskLoad({ browser, task: job.task, fixtureHost, tag: `dur-${Math.random().toString(36).slice(2, 10)}`, viewport: job.viewport, locale: job.locale, setup: job.variant.setup });
      let rows;
      try { rows = await walkLoad({ load, task: job.task, frozen: job.items, trial, deps }); } finally { await load.close?.(); }
      const at = now();
      for (const row of rows) {
        const full = { ...row, runAt: at.toISOString(), hoursSinceRun: startedAt === null ? null : Number(((at.getTime() - startedAt) / 3600000).toFixed(2)) };
        appendFileSync(join(dir, names.rows), `${JSON.stringify(full)}\n`);
        collected.push(full);
      }
      log(`${job.task.id} ${trial.viewport} ${trial.locale} ${trial.cookie} #${trial.n}: ${rows.length} results`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, jobs.length)) }, worker));
  const summary = { runAt: now().toISOString(), jobs: jobs.length, ...summarizeDurability(collected) };
  writeFileSync(join(dir, names.summary), JSON.stringify(summary, null, 1));
  return { names, summary };
}

function parseArgs(argv) {
  const args = { runDir: null, contexts: 5, concurrency: 3, tasks: null, arms: null, includeWrong: false, label: null, corpus: null };
  const list = value => String(value).split(',').filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--contexts') args.contexts = Number(next());
    else if (arg === '--concurrency') args.concurrency = Number(next());
    else if (arg === '--tasks') args.tasks = list(next());
    else if (arg === '--arms') args.arms = list(next());
    else if (arg === '--label') args.label = next();
    else if (arg === '--corpus') args.corpus = next();
    else if (arg === '--include-wrong') args.includeWrong = true;
    else if (!args.runDir) args.runDir = arg;
    else throw new Error(`UNEXPECTED_ARGUMENT ${arg}`);
  }
  if (!args.runDir) throw new Error('RUN_DIR_REQUIRED');
  return args;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseArgs(process.argv.slice(2));
  const p = freezePaths();
  const corpus = readJsonl(args.corpus ?? p.corpus).filter(task => args.tasks === null || args.tasks.includes(task.id));
  const sites = readJson(join(p.root, 'corpus', 'sites.json'), null);
  const frozen = collectFrozen(readJsonl(join(args.runDir, 'steps.jsonl')), { includeWrong: args.includeWrong, arms: args.arms })
    .filter(item => corpus.some(task => task.id === item.task));
  const require = createRequire(new URL('../../package.json', import.meta.url));
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  let fixtureHost = null;
  if (corpus.some(task => String(task.url).startsWith('fixture://'))) {
    const { startCorpusPages } = await import('../observed-authoring/pages/server.mjs');
    fixtureHost = await startCorpusPages();
  }
  try {
    const { names, summary } = await runDurability({ runDir: args.runDir, browser, fixtureHost, tasks: corpus, frozen, sites, contexts: args.contexts, concurrency: args.concurrency, label: args.label, log: console.log });
    console.log(JSON.stringify({ wrote: names, trials: summary.trials, byTier: summary.byTier }, null, 1));
  } finally { await browser.close(); await fixtureHost?.close(); }
}
