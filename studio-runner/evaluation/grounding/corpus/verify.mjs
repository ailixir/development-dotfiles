// SPK-07 corpus verifier: every task's ground-truth chain must resolve to EXACTLY ONE element.
// usage (from studio-runner/):
//   node evaluation/grounding/corpus/verify.mjs [--tasks corpus/tasks.draft.jsonl] [--out corpus/verify-report.json]
//        [--only prefix1,prefix2] [--contexts 2] [--concurrency 4]
// For each task it loads the URL in `--contexts` fresh browser contexts (1280x720), applies `setup`, then
// resolves each step's gt.chain and records the match count. Single-step tasks share one page load per
// (url, setup) group and are never performed. Chain tasks (steps.length > 1) are performed step by step by
// the GT locator, so each later step is resolved after the previous one ran, as INTERFACES.md requires.
// Negative tasks (gt: null) only need a loadable page; an optional `negCheck` is verified too:
//   { kind: 'absent', chain }            -> chain matches 0 elements (the named target does not exist)
//   { kind: 'ambiguous', chain, min: 2 } -> chain matches >= min elements (the planted ambiguity is real)
// fixture://<case>/<page> URLs are served by evaluation/observed-authoring/pages/server.mjs.
// The reusable part is `resolveChain(page, chain)` and `performOperation(...)`, exported for other tools.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const { chromium } = require('playwright');

/** Turn JSON args into live Playwright args: {regex,flags} -> RegExp, {chain} (inside has/hasNot) -> Locator. */
function revive(page, value) {
  if (Array.isArray(value)) return value.map((v) => revive(page, v));
  if (value && typeof value === 'object') {
    if (typeof value.regex === 'string') return new RegExp(value.regex, value.flags ?? '');
    if (Array.isArray(value.chain)) return resolveChain(page, value.chain);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(page, v)]));
  }
  return value;
}

const METHODS = new Set(['getByRole', 'getByLabel', 'getByText', 'getByPlaceholder', 'getByTestId', 'locator', 'filter', 'nth', 'first', 'last']);

/** Applies gt.chain from `page`, one Playwright call per element, and returns the resulting Locator. */
export function resolveChain(page, chain) {
  let current = page;
  for (const [index, call] of chain.entries()) {
    if (!METHODS.has(call.m)) throw new Error(`chain method not allowed: ${call.m}`);
    if (index === 0 && call.m === 'filter') throw new Error('chain cannot start with filter');
    if ((call.m === 'nth' || call.m === 'first' || call.m === 'last') && index === 0) throw new Error(`chain cannot start with ${call.m}`);
    current = current[call.m](...revive(page, call.a ?? []));
  }
  return current;
}

/** Performs one step's operation with its GT locator (used between chain steps). Returns the text a `read` captured. */
export async function performOperation(page, locator, operation, memory) {
  const timeout = 8000;
  switch (operation.kind) {
    case 'click': await locator.click({ timeout }); return null;
    case 'fill': {
      const value = operation.value ?? memory[operation.valueFromStep];
      if (typeof value !== 'string') throw new Error('fill value missing');
      await locator.fill(value, { timeout }); return null;
    }
    case 'selectOption': await locator.selectOption(operation.value, { timeout }); return null;
    case 'check': await locator.check({ timeout }); return null;
    case 'uncheck': await locator.uncheck({ timeout }); return null;
    case 'press': await locator.press(operation.key, { timeout }); return null;
    case 'read': return ((await locator.innerText({ timeout })) ?? '').trim();
    case 'assert': return null;
    default: throw new Error(`unknown operation ${operation.kind}`);
  }
}

const settle = (page, ms = 2500) => page.waitForTimeout(ms);

async function gotoTask(page, url, fixtures, tag) {
  let target = url;
  if (url.startsWith('fixture://')) {
    const [, rest] = url.split('fixture://');
    const [caseId, ...pagePath] = rest.split('/');
    target = `${fixtures.origin}/ns/${caseId}.${tag}/${pagePath.join('/')}`;
  }
  const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await settle(page, url.startsWith('fixture://') ? 300 : 2500);
  return response?.status() ?? null;
}

async function applySetup(page, setup) {
  const log = [];
  for (const item of setup ?? []) {
    const locator = resolveChain(page, item.gt.chain);
    const count = await locator.count();
    log.push({ op: item.op, count });
    if (count !== 1) throw new Error(`SETUP_NOT_UNIQUE count=${String(count)}`);
    await performOperation(page, locator, { kind: item.op, value: item.value, key: item.key }, {});
    await page.waitForTimeout(800);
  }
  return log;
}

/** Checks one step's chain on the live page. */
async function checkStep(page, step) {
  const locator = resolveChain(page, step.gt.chain);
  const count = await locator.count();
  const result = { count };
  if (count !== 1) result.diag = { url: page.url(), title: (await page.title()).slice(0, 60), bodyChars: await page.evaluate(() => (document.body?.innerText ?? '').length) };
  if (count === 1) {
    result.visible = await locator.isVisible();
    if (['fill', 'selectOption', 'check', 'uncheck'].includes(step.operation.kind)) result.enabled = await locator.isEnabled();
  }
  return result;
}

async function checkNegative(page, task) {
  const check = task.negCheck;
  if (!check) return { ok: true, note: 'no negCheck; page loaded only' };
  const count = await resolveChain(page, check.chain).count();
  const ok = check.kind === 'absent' ? count === 0 : count >= (check.min ?? 2);
  return { ok, count, kind: check.kind };
}

/** One page load of one group of tasks sharing (url, setup). */
async function runGroup(browser, group, fixtures, ctxIndex) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const out = {};
  try {
    // Chain tasks mutate the page, so each gets its own load; single-step tasks share the group's load.
    const shared = group.tasks.filter((t) => t.steps.length === 1);
    const chains = group.tasks.filter((t) => t.steps.length > 1);
    if (shared.length) {
      const page = await context.newPage();
      try {
        const status = await gotoTask(page, group.url, fixtures, `v${String(ctxIndex)}g${String(group.n)}`);
        const setupLog = await applySetup(page, group.setup);
        for (const task of shared) {
          try {
            if (task.gt === null || task.steps[0].gt === null) out[task.id] = { status, setupLog, negative: await checkNegative(page, task) };
            else out[task.id] = { status, setupLog, steps: [await checkStep(page, task.steps[0])] };
          } catch (error) { out[task.id] = { error: String(error.message).split('\n')[0] }; }
        }
      } catch (error) {
        for (const task of shared) out[task.id] ??= { error: `LOAD ${String(error.message).split('\n')[0]}` };
      } finally { await page.close(); }
    }
    for (const task of chains) {
      const page = await context.newPage();
      const record = { steps: [] };
      try {
        record.status = await gotoTask(page, task.url, fixtures, `v${String(ctxIndex)}c${task.id.replace(/[^a-z0-9]/gu, '').slice(-20)}`);
        record.setupLog = await applySetup(page, task.setup);
        const memory = {};
        for (const [i, step] of task.steps.entries()) {
          const result = await checkStep(page, step);
          record.steps.push(result);
          if (result.count !== 1 || i === task.steps.length - 1) break; // the last step is only resolved, never performed
          const locator = resolveChain(page, step.gt.chain);
          const captured = await performOperation(page, locator, step.operation, memory);
          if (captured !== null) memory[i] = captured;
          await page.waitForTimeout(1200);
        }
      } catch (error) { record.error = String(error.message).split('\n')[0]; }
      finally { await page.close(); }
      out[task.id] = record;
    }
  } finally { await context.close(); }
  return out;
}

function groupTasks(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    const key = task.steps.length > 1 ? `chain:${task.id}` : `${task.url}|${JSON.stringify(task.setup ?? [])}`;
    if (!groups.has(key)) groups.set(key, { url: task.url, setup: task.setup ?? [], tasks: [] });
    groups.get(key).tasks.push(task);
  }
  return [...groups.values()].map((g, n) => ({ ...g, n }));
}

const taskPass = (task, perContext) => {
  const negative = task.expect !== 'ACTION';
  return perContext.every((r) => {
    if (r.error) return false;
    if (negative) return r.negative?.ok !== false;
    return r.steps?.length === task.steps.length && r.steps.every((s) => s.count === 1);
  });
};

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const tasksPath = new URL(flag('--tasks', './tasks.draft.jsonl'), import.meta.url);
  const outPath = new URL(flag('--out', './verify-report.json'), import.meta.url);
  const only = flag('--only', null)?.split(',') ?? null;
  const contexts = Number(flag('--contexts', '2'));
  const concurrency = Number(flag('--concurrency', '4'));
  const tasks = readFileSync(tasksPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((t) => !only || only.some((p) => t.id.startsWith(p)));

  let fixtures = null;
  if (tasks.some((t) => t.url.startsWith('fixture://'))) {
    const { startCorpusPages } = await import(new URL('../../observed-authoring/pages/server.mjs', import.meta.url));
    fixtures = await startCorpusPages();
  }
  const browser = await chromium.launch({ headless: true });
  const groups = groupTasks(tasks);
  const results = {}; // id -> per-context records
  const queue = [];
  for (let c = 1; c <= contexts; c += 1) for (const g of groups) queue.push({ g, c });
  const worker = async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const out = await runGroup(browser, next.g, fixtures, next.c);
      for (const [id, rec] of Object.entries(out)) (results[id] ??= []).push(rec);
      process.stderr.write('.');
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  process.stderr.write('\n');
  await browser.close();
  await fixtures?.close();

  const date = new Date().toISOString();
  const perTask = {};
  let pass = 0;
  for (const task of tasks) {
    const records = results[task.id] ?? [];
    const ok = records.length === contexts && taskPass(task, records);
    if (ok) pass += 1;
    perTask[task.id] = { pass: ok, counts: records.map((r) => r.steps?.map((s) => s.count) ?? (r.negative ? [r.negative.count ?? null] : [r.error ?? null])), visible: records.map((r) => r.steps?.map((s) => s.visible) ?? null), diag: records.flatMap((r) => (r.steps ?? []).map((s) => s.diag).filter(Boolean)), error: records.map((r) => r.error).filter(Boolean)[0] ?? null };
  }
  const report = { date, contexts, viewport: '1280x720', playwright: require('playwright/package.json').version, total: tasks.length, pass, failed: tasks.length - pass, perTask };
  writeFileSync(outPath, `${JSON.stringify(report, null, 1)}\n`);
  const failedIds = Object.entries(perTask).filter(([, v]) => !v.pass).map(([id, v]) => `${id} ${JSON.stringify(v.counts)} ${v.error ?? ''}`);
  console.log(`verified ${String(tasks.length)} tasks, pass ${String(pass)}, fail ${String(failedIds.length)}`);
  for (const line of failedIds) console.log('  FAIL', line);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
