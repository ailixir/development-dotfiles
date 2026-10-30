/* eslint-disable -- SPK-07 spike tooling: untyped .mjs harness, dynamic imports of arm modules, Node globals. */
// SPK-07 run driver (screening evidence, not ADR-SC-005 D-C evidence).
//
//   node evaluation/grounding/run.mjs RUN_DIR [--arms A0,A1,S1,S2,S3,S4] [--reps 3] [--tasks id,...] [--strata a,b]
//        [--concurrency 2] [--seed N] [--max-prompt-tokens N] [--dry] [--repair-java]
//        [--profile 4h] [--wall-minutes 235]   (4-hour profile: see preregistration section 14, entry 6; defaults concurrency 4, wall 235 min)
//
// Per task load: one fresh context (1280x720, en-US), goto, GT setup ops, GT resolved to backendNodeIds (VOID unless
// exactly one), then per step every arm (per-task seeded random order) observes the SAME live page once and its reps
// reuse that observation. SOURCE_PLAN is asked once per task per rep and shared by every arm of that rep. Rows are
// appended to RUN_DIR/steps.jsonl keyed task|step|arm|rep|attempt, so a rerun skips what is already complete.
// `--repair-java` re-asks (attempt 2) the NEXT_ACTION rows the Java scorer refused (reads scoring-output.jsonl).
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { mulberry32, readJson, readJsonl, seedFrom, shuffled } from './lib/stats.mjs';
import { CLICK_LIKE, clickEquivalent, openLoad, performChainStep, resolveGt } from './lib/gt.mjs';
import { paths as freezePaths, playwrightPin, verifyFreeze } from './freeze.mjs';
import { createLanedLimiter, limitedVertex, tailThrottlesByLane } from './lib/limiter.mjs';
import { decode as decodeOutline } from './lib/renderCurrent.mjs';
import { SCOPE_HASH } from './lib/arms/A1.mjs';

export const ARM_IDS = ['A0', 'A1', 'S1', 'S2', 'S3', 'S4'];
export const S_ARMS = new Set(['S1', 'S2', 'S3', 'S4']);
/** Arms on today's contract: their replies are also scored by the Java rules. S3/S4 use the pre-registered harness gate. */
export const SCORED_ARMS = new Set(['A1', 'S1', 'S2']);
/** Outcomes that are retried on rerun instead of counting as complete. */
export const RETRY_OUTCOMES = new Set(['MODEL_ERROR', 'OBSERVE_ERROR']);
/** 4-hour profile (preregistration section 14, entry 6): reps per arm; S4 only on the visual strata; A0 derives from A1. */
export const PROFILE_REPS = Object.freeze({ A0: 1, A1: 1, S1: 1, S2: 2, S3: 2, S4: 2 });
export const PROFILE_S4_STRATA = Object.freeze(['visualOnlyField', 'iconOnly']);
export function profileRepsOf(arm, task) {
  if (arm === 'S4') return PROFILE_S4_STRATA.includes(task?.stratum) ? PROFILE_REPS.S4 : 0;
  return PROFILE_REPS[arm] ?? 0;
}

/**
 * Seeded task order for a profile run: strata interleaved in proportion and sites interleaved within a stratum, so any completed
 * prefix is a stratified sample. Deterministic for (tasks, seed).
 */
export function orderTasks(tasks, seed) {
  const rng = mulberry32(seedFrom(`${seed}|task-order`));
  const byStratum = new Map();
  for (const task of tasks) { const list = byStratum.get(task.stratum) ?? []; list.push(task); byStratum.set(task.stratum, list); }
  const positioned = [];
  for (const [stratum, list] of [...byStratum.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const bySite = new Map();
    for (const task of shuffled(list, rng)) { const bucket = bySite.get(task.site) ?? []; bucket.push(task); bySite.set(task.site, bucket); }
    const buckets = shuffled([...bySite.values()], rng);
    const interleaved = [];
    while (buckets.some(bucket => bucket.length > 0)) for (const bucket of buckets) if (bucket.length > 0) interleaved.push(bucket.shift());
    interleaved.forEach((task, index) => positioned.push({ task, position: (index + 0.5) / interleaved.length, tie: rng(), stratum }));
  }
  return positioned.sort((a, b) => a.position - b.position || a.tie - b.tie).map(item => item.task);
}

export const keyOf = (task, step, arm, rep, attempt) => `${task}|${step}|${arm}|${rep}|${attempt}`;

export class BudgetStop extends Error { constructor(message) { super(message); this.name = 'BudgetStop'; } }
export class FreezeRefusal extends Error { constructor(message) { super(message); this.name = 'FreezeRefusal'; } }
// vertex.mjs returns { error } for run-level caps (it never throws) and for a missing ADC token; both stop the run cleanly.
const BUDGET_RE = /^(?:CAP_MAX_CALLS|CAP_MAX_PROMPT_TOKENS_TOTAL|ADC_TOKEN_UNAVAILABLE)$|CAP_EXCEEDED/u;

// ---- arguments, corpus, store ----------------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = { runDir: null, arms: ['A0', 'A1', 'S1', 'S2', 'S3', 'S4'], reps: 3, tasks: null, strata: null, concurrency: 2, seed: null,
    maxPromptTokens: null, dry: false, repairJava: false, corpus: null, profile: null, wallMinutes: null, concurrencySet: false };
  const list = value => String(value).split(',').map(item => item.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { const value = argv[++i]; if (value === undefined) throw new Error(`MISSING_VALUE ${arg}`); return value; };
    if (arg === '--arms') args.arms = list(next());
    else if (arg === '--reps') args.reps = Number(next());
    else if (arg === '--tasks') args.tasks = list(next());
    else if (arg === '--strata') args.strata = list(next());
    else if (arg === '--concurrency') { args.concurrency = Number(next()); args.concurrencySet = true; }
    else if (arg === '--profile') args.profile = next();
    else if (arg === '--wall-minutes') args.wallMinutes = Number(next());
    else if (arg === '--seed') args.seed = Number(next());
    else if (arg === '--max-prompt-tokens') args.maxPromptTokens = Number(next());
    else if (arg === '--corpus') args.corpus = next();
    else if (arg === '--dry') args.dry = true;
    else if (arg === '--repair-java') args.repairJava = true;
    else if (arg.startsWith('--')) throw new Error(`UNKNOWN_FLAG ${arg}`);
    else if (args.runDir === null) args.runDir = arg;
    else throw new Error(`UNEXPECTED_ARGUMENT ${arg}`);
  }
  if (!args.runDir) throw new Error('RUN_DIR_REQUIRED');
  for (const arm of args.arms) if (!ARM_IDS.includes(arm)) throw new Error(`UNKNOWN_ARM ${arm}`);
  if (!Number.isInteger(args.reps) || args.reps < 1) throw new Error('REPS_INVALID');
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) throw new Error('CONCURRENCY_INVALID');
  if (args.profile !== null && args.profile !== '4h') throw new Error(`UNKNOWN_PROFILE ${args.profile}`);
  if (args.wallMinutes !== null && !(args.wallMinutes > 0)) throw new Error('WALL_MINUTES_INVALID');
  if (args.profile === '4h') { if (!args.concurrencySet) args.concurrency = 4; if (args.wallMinutes === null) args.wallMinutes = 235; }
  return args;
}

export function loadTasks(corpusPath, { tasks = null, strata = null } = {}) {
  const all = readJsonl(corpusPath);
  const picked = all.filter(task => (tasks === null || tasks.includes(task.id)) && (strata === null || strata.includes(task.stratum)));
  for (const task of picked) if (!Array.isArray(task.steps) || task.steps.length === 0) throw new Error(`TASK_WITHOUT_STEPS ${task.id}`);
  return picked;
}

const safeName = text => String(text).replace(/[^A-Za-z0-9._-]/gu, '_');

/** Append-only run directory. All writes are synchronous appends, so a killed run leaves at most one torn last line. */
export class RunStore {
  constructor(runDir, { dry = false } = {}) {
    this.runDir = resolve(runDir);
    this.dry = dry;
    mkdirSync(join(this.runDir, 'plans'), { recursive: true });
    this.rows = new Map();
    for (const row of readJsonl(this.file('steps.jsonl'))) this.rows.set(row.key, row);
  }
  file(name) { return join(this.runDir, name); }
  append(name, row) { appendFileSync(this.file(name), `${JSON.stringify(row)}\n`); }
  step(row) { if (this.dry) { this.append('dry.jsonl', row); return; } this.append('steps.jsonl', row); this.rows.set(row.key, row); }
  scoringInput(line) { if (!this.dry) this.append('scoring-input.jsonl', line); }
  reply(line) { if (!this.dry) this.append('replies.jsonl', line); }
  load(row) { this.append(this.dry ? 'dry-loads.jsonl' : 'loads.jsonl', row); }
  void(row) { this.append(this.dry ? 'dry-void.jsonl' : 'void.jsonl', row); }
  error(row) { this.append('errors.jsonl', row); }
  planFile(task, rep) { return join(this.runDir, 'plans', `${safeName(task)}.${rep}.json`); }
  readPlan(task, rep) { return readJson(this.planFile(task, rep)); }
  writePlan(task, rep, plan) { if (!this.dry) writeFileSync(this.planFile(task, rep), JSON.stringify(plan)); }
}

/** Units still to run for a task. Attempt 2 is pending when attempt 1 asked for a repair and none was recorded. */
export function pendingUnits({ task, armIds, reps, repsOf = () => reps, rows, javaRefusals = new Map(), repairJava = false }) {
  const units = [];
  task.steps.forEach((_step, step) => {
    for (const arm of armIds) {
      for (let rep = 1; rep <= repsOf(arm, task); rep++) {
        const r1 = rows.get(keyOf(task.id, step, arm, rep, 1));
        const r2 = rows.get(keyOf(task.id, step, arm, rep, 2));
        if (repairJava) {
          const code = javaRefusals.get(keyOf(task.id, step, arm, rep, 1));
          // Attempt 2 is also retried when its row exists but is a retryable infra row (MODEL_ERROR / OBSERVE_ERROR).
          if (r1 && code && (!r2 || RETRY_OUTCOMES.has(r2.outcome))) units.push({ step, arm, rep, attempt: 2, repairCodes: [code] });
          continue;
        }
        if (!r1 || RETRY_OUTCOMES.has(r1.outcome)) units.push({ step, arm, rep, attempt: 1, repairCodes: [] });
        else if (r1.needsRepair && (!r2 || RETRY_OUTCOMES.has(r2.outcome))) units.push({ step, arm, rep, attempt: 2, repairCodes: r1.repairCodes ?? [] });
      }
    }
  });
  return units;
}

// ---- classification --------------------------------------------------------------------------------------------

/**
 * Harness-side scoring of one interpreted reply (the Java verdict is merged later by the report), per pre-registration §6/§8.
 * success = ACTION on the GT element with an executable locator (first-attempt primary metric, gates not required);
 * admittedSuccess adds "the arm's harness gates admitted it". HZ-1 confidentWrong = a wrong-element ACTION (any ACTION
 * on a negative) that is gate-admitted AND executable, or any COMPLETE (gated or not).
 */
export function classify({ task, gtIds, interp, equivalent = false }) {
  const status = interp.status ?? 'INVALID';
  const picked = interp.pickedBackendNodeId ?? null;
  const gateCodes = interp.gateCodes ?? [];
  const executable = interp.executable === true;
  const admitted = gateCodes.length === 0;
  const answerable = task.expect === 'ACTION' && gtIds.length === 1;
  const strictCorrectElement = picked !== null && gtIds.includes(picked);
  // A descendant of the GT with no interactive element in between is an equivalent click target (see lib/gt.mjs clickEquivalent).
  const equivalentDescendant = answerable && !strictCorrectElement && equivalent === true;
  const correctElement = strictCorrectElement || equivalentDescendant;
  const correctAndExecutable = status === 'ACTION' && correctElement && executable;
  const strictCorrectAndExecutable = status === 'ACTION' && strictCorrectElement && executable;
  const admittedSuccess = correctAndExecutable && admitted;
  const clarificationOnAnswerable = answerable && (status === 'CLARIFICATION' || status === 'UNSUPPORTED');
  const wrongElementAction = status === 'ACTION' && (answerable ? !correctElement : task.expect !== 'ACTION');
  const confidentWrong = (wrongElementAction && admitted && executable) || status === 'COMPLETE';
  const negativeHandled = task.expect !== 'ACTION' && (status === 'CLARIFICATION' || status === 'UNSUPPORTED');
  const needsRepair = status === 'INVALID' || (status === 'ACTION' && (!executable || !admitted));
  const repairCodes = !needsRepair ? [] : !admitted ? [...gateCodes] : status === 'INVALID' ? ['INVALID_REPLY'] : ['LOCATOR_NOT_EXECUTABLE'];
  const outcome = admittedSuccess ? (equivalentDescendant ? 'EQUIVALENT_DESCENDANT' : 'CORRECT') : confidentWrong ? (status === 'COMPLETE' ? 'FALSE_COMPLETE' : 'CONFIDENT_WRONG')
    : negativeHandled ? 'NEGATIVE_HANDLED' : clarificationOnAnswerable ? 'CLARIFICATION_ON_ANSWERABLE'
      : status === 'ACTION' ? (!admitted ? 'GATED' : correctElement ? 'NOT_EXECUTABLE' : 'WRONG_NOT_EXECUTABLE') : status;
  return { status, correctElement, strictCorrectElement, equivalentDescendant, executable: interp.executable ?? null, gateCodes, correctAndExecutable, strictCorrectAndExecutable, admittedSuccess,
    wrongElementAction, clarificationOnAnswerable, confidentWrong, negativeHandled, needsRepair, repairCodes, outcome };
}

/**
 * Infrastructure error = the model call did not produce an HTTP 200 reply (429/503/5xx, any other HTTP error, connection,
 * timeout, transport). It says nothing about an arm, so the row is retryable (RETRY_OUTCOMES) and the report excludes it.
 * A 200 without a parsable reply is the model's own failure and stays an arm failure.
 */
export function isInfraError(result) {
  if (!result || result.reply) return false;
  if (typeof result.error === 'string' && /^CAP_/u.test(result.error)) return false;
  return result.status !== 200;
}

export function contextOf(body) {
  try { return JSON.parse(body.contents[0].parts[0].text).context ?? null; } catch { return null; }
}

/**
 * Java scoring input (deviation 10). S1/S2 send the lossless outline string as context.observation; the validators need the
 * structured observation the server would hold, so it is decoded back (same session/scope constants as A1's collector config).
 * observedAt is not in the outline and no guided validator reads it: the row's own timestamp stands in.
 */
export function scoringContext(context, observedAt) {
  if (!context || typeof context.observation !== 'string') return context;
  return { ...context, observation: decodeOutline(context.observation, { schemaVersion: 3, sessionId: 'spk07', scopeHash: SCOPE_HASH, observedAt }) };
}

async function withTimeout(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`TIMEOUT ${label}`)), ms); })]); } finally { clearTimeout(timer); }
}

async function sendGuarded(env, body, label, armId) {
  if (armId !== 'SP' && S_ARMS.has(armId) && !env.freezeOk) throw new FreezeRefusal(`FREEZE_REQUIRED before ${armId} model call`);
  if (armId === 'SP' && env.armIds.some(id => S_ARMS.has(id)) && !env.freezeOk) throw new FreezeRefusal('FREEZE_REQUIRED before SOURCE_PLAN for S-arm run');
  let result;
  try {
    result = await env.vertex.send(body, { label, maxPromptTokens: env.maxPromptTokens });
  } catch (error) {
    if (BUDGET_RE.test(String(error.message))) throw new BudgetStop(error.message);
    return { status: null, reply: null, rawText: null, usage: null, modelVersion: null, ms: null, error: String(error.message).split('\n')[0] };
  }
  if (result.error && BUDGET_RE.test(String(result.error))) throw new BudgetStop(String(result.error));
  return result;
}

/**
 * SOURCE_PLAN for one task and rep, shared by every arm of that rep. The benchmark session (stable step ids), the reply and
 * the admitted plan (server-assigned obligationIds) are persisted so a resumed run hands the arms the very same plan.
 */
async function planFor(env, task, rep) {
  const stored = env.store.readPlan(task.id, rep);
  if (stored?.admitted) return stored;
  if (env.dry) return null;
  const session = env.requests.makeSession(task);
  const built = env.requests.buildSourcePlanRequest({ session });
  const key = keyOf(task.id, -1, 'SP', rep, 1);
  const result = await sendGuarded(env, built.body, key, 'SP');
  const plan = { key, reply: result.reply, usage: result.usage ?? null, ms: result.ms ?? null, modelVersion: result.modelVersion ?? null, error: result.error ?? null, httpStatus: result.status ?? null, infra: isInfraError(result) };
  if (result.reply) {
    plan.session = session;
    plan.admitted = env.requests.admitPlan(result.reply);
    env.store.writePlan(task.id, rep, plan);
    env.store.scoringInput({ key, kind: 'SOURCE_PLAN', context: built.context ?? contextOf(built.body), reply: result.reply });
    env.store.reply({ key, reply: result.reply });
  }
  return plan;
}

/** Runs the pending units of one task on one live load. Returns a small summary for the progress log. */
export async function executeTask(env, task) {
  const { store, armIds, reps } = env;
  const pending = pendingUnits({ task, armIds, reps, repsOf: env.repsOf, rows: env.dry ? new Map() : store.rows, javaRefusals: env.javaRefusals, repairJava: env.repairJava });
  if (pending.length === 0) return { task: task.id, skipped: true, units: 0 };
  const order = shuffled(armIds, mulberry32(seedFrom(`${env.seed}|${task.id}`)));
  const lastNeeded = Math.max(...pending.map(unit => unit.step));
  const started = Date.now();
  const load = await env.openTask(task);
  const loadRow = { task: task.id, seed: env.seed, armOrder: order, at: new Date().toISOString(), void: false, voidReason: null, gtIds: [] };
  const summary = { task: task.id, skipped: false, units: pending.length, done: 0, void: false };
  try {
    if (load.void) {
      loadRow.void = true; loadRow.voidReason = load.reason; summary.void = true;
      store.void({ task: task.id, stratum: task.stratum, step: null, reason: load.reason, at: loadRow.at });
      return summary;
    }
    // SOURCE_PLAN is asked lazily, once per task per rep, and only after the GT of the first step resolved (a VOID task costs no call).
    const plans = {};
    const planOf = rep => (plans[rep] ??= planFor(env, task, rep));
    for (let stepIndex = 0; stepIndex <= lastNeeded; stepIndex++) {
      const step = task.steps[stepIndex];
      const gt = await env.resolveGt(load, step.gt ?? null);
      loadRow.gtIds.push(gt.void ? null : gt.ids);
      if (gt.void) {
        for (let later = stepIndex; later <= lastNeeded; later++) store.void({ task: task.id, stratum: task.stratum, step: later, reason: later === stepIndex ? gt.reason : `PRIOR_STEP_VOID ${stepIndex}`, at: new Date().toISOString() });
        loadRow.void = true; loadRow.voidReason = gt.reason; summary.void = true;
        break;
      }
      const here = pending.filter(unit => unit.step === stepIndex);
      if (here.length > 0) {
        // A wall-clock stop lets in-flight work finish but starts no further step; the task stays unfinished and resumable.
        if (env.stopRequested) { loadRow.stopped = true; break; }
        if (load.renewCdp) await load.renewCdp();
        const ctx = { task, step, stepIndex, gt, load, planOf, order };
        if (env.profile) summary.done += await runStepParallel(env, ctx, here);
        else for (const armId of order.filter(id => here.some(unit => unit.arm === id))) summary.done += await runArm(env, ctx, armId, here.filter(unit => unit.arm === armId));
      }
      if (stepIndex < lastNeeded) {
        try { await env.performStep(load, step, gt, stepIndex); } catch (error) {
          for (let later = stepIndex + 1; later <= lastNeeded; later++) store.void({ task: task.id, stratum: task.stratum, step: later, reason: `GT_PERFORM_FAILED ${stepIndex} ${String(error.message).split('\n')[0]}`, at: new Date().toISOString() });
          loadRow.void = true; loadRow.voidReason = `GT_PERFORM_FAILED ${stepIndex}`;
          break;
        }
      }
    }
  } finally {
    loadRow.ms = Date.now() - started;
    store.load(loadRow);
    await load.close?.();
  }
  return summary;
}

const GATEWAY_INPUT_CAP = 262144;

/**
 * Hash of the request with every per-call random part neutralized: requestId, the observation's documentId (top level, every node
 * and executionEvidence), observationHash, observedAt, and the randomly minted authored-input ids with the hash computed from them.
 * Each body's own documentId / inputId strings are also replaced wherever else they occur, so two bodies built from the same page
 * and plan hash equal while any content difference still changes the hash.
 */
export function normalizedBodyHash(body) {
  const drop = new Set(['requestId', 'documentId', 'observationHash', 'observedAt', 'authoredInputsHash', 'inputId']);
  const randomIds = new Set();
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value !== null && typeof value === 'object') for (const [key, item] of Object.entries(value)) { if ((key === 'documentId' || key === 'inputId') && typeof item === 'string') randomIds.add(item); else collect(item); }
  };
  const scrub = (value) => {
    if (Array.isArray(value)) return value.map(scrub);
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !drop.has(key)).map(([key, item]) => [key, scrub(item)]));
    return value;
  };
  let envelope = null;
  try { const parsed = JSON.parse(body.contents[0].parts[0].text); collect(parsed); envelope = scrub(parsed); } catch { envelope = null; }
  const rest = scrub({ ...body, contents: body.contents.map((content, index) => (index === 0 ? { ...content, parts: content.parts.slice(1) } : content)) });
  let text = JSON.stringify({ envelope, rest });
  for (const id of randomIds) text = text.split(id).join('<random-id>');
  return createHash('sha256').update(text).digest('hex');
}

function makeMutex() {
  let tail = Promise.resolve();
  return (fn) => { const run = tail.then(fn, fn); tail = run.then(() => undefined, () => undefined); return run; };
}

function armBase(env, ctx, armId) {
  const { task, step, stepIndex, gt, order } = ctx;
  return { task: task.id, site: task.site ?? null, fixture: String(task.url ?? '').startsWith('fixture://'), stratum: task.stratum, heldOut: Boolean(task.heldOut), wave: task.wave ?? 1, expect: task.expect, step: stepIndex,
    op: step.operation?.kind ?? null, arm: armId, gtIds: gt.ids, armOrder: order.indexOf(armId) };
}

/** Observes one arm on the live page; on failure writes OBSERVE_ERROR rows for its attempt-1 units and returns null. */
async function observeArm(env, ctx, armId, units) {
  const { task, step, stepIndex, load } = ctx;
  const arm = env.arms[armId];
  try {
    return await withTimeout(arm.observe({ page: load.page, cdp: load.cdp, task, step, stepIndex }), env.observeTimeoutMs ?? 90000, `observe ${armId}`);
  } catch (error) {
    const base = armBase(env, ctx, armId);
    for (const unit of units) {
      if (unit.attempt !== 1) continue;
      env.store.step({ ...base, key: keyOf(task.id, stepIndex, armId, unit.rep, 1), rep: unit.rep, attempt: 1, status: null, outcome: 'OBSERVE_ERROR', error: String(error.message).split('\n')[0],
        correctElement: false, correctAndExecutable: false, confidentWrong: false, needsRepair: false, at: new Date().toISOString() });
    }
    return null;
  }
}

/** The unit runner for one arm on one observation (shared by the serial and the parallel step executors). */
function makeRunUnit(env, ctx, armId, observed) {
  const { task, step, stepIndex, gt, load, planOf } = ctx;
  const lock = ctx.lock ?? (fn => fn());
  const { store } = env;
  const arm = env.arms[armId];
  const base = armBase(env, ctx, armId);
  return async (unit) => {
    const key = keyOf(task.id, stepIndex, armId, unit.rep, unit.attempt);
    const common = { ...base, key, rep: unit.rep, attempt: unit.attempt, repairCodes: unit.repairCodes ?? [], meta: observed.meta ?? null, at: new Date().toISOString(), ...(unit.extra ?? {}) };
    if (observed.meta?.emptied) {
      store.step({ ...common, status: 'EMPTIED', outcome: 'EMPTIED', correctElement: false, executable: false, correctAndExecutable: false, confidentWrong: false, needsRepair: false, gateCodes: [], usage: null, ms: 0 });
      return null;
    }
    const plan = await planOf(env.profile ? 1 : unit.rep); // 4-hour profile: one SOURCE_PLAN per task, shared by every arm and rep
    // The plan cursor lib/requests.mjs expects: { session, plan, stepIndex, done }. Dry runs use its size-accurate stub.
    let cursor;
    if (plan?.admitted) {
      cursor = { session: plan.session, plan: plan.admitted, stepIndex, done: 0 };
      const stepId = plan.session.sourceSteps[stepIndex]?.stepId;
      if (!plan.admitted.obligations.some(item => item.stepId === stepId)) {
        // The product asks NEXT_ACTION only for a step that has an obligation; without one the step fails for every arm alike.
        store.step({ ...common, status: null, outcome: 'NO_OBLIGATION', correctElement: false, executable: false, correctAndExecutable: false, confidentWrong: false, needsRepair: false, gateCodes: [], usage: null, ms: 0 });
        return null;
      }
    } else if (env.dry) cursor = env.requests.stubCursor(task, step);
    else if (plan?.infra !== false) {
      // The shared SOURCE_PLAN hit an infrastructure error (not stored as final): every arm of this rep waits for a resumed run.
      store.step({ ...common, status: null, outcome: 'MODEL_ERROR', infraError: true, planInfra: true, error: plan?.error ?? 'SOURCE_PLAN_FAILED', httpStatus: plan?.httpStatus ?? null, correctElement: false, correctAndExecutable: false, confidentWrong: false, needsRepair: false });
      return null;
    } else {
      // A 200 SOURCE_PLAN without a parsable reply is a plan failure for every arm alike (final, not retried).
      store.step({ ...common, status: null, outcome: 'PLAN_INVALID', error: plan.error ?? 'SOURCE_PLAN_NO_REPLY', correctElement: false, correctAndExecutable: false, confidentWrong: false, needsRepair: false, gateCodes: [], usage: null, ms: 0 });
      return null;
    }
    const body = await lock(() => arm.buildRequest({ task, step, obligations: cursor, observed, attempt: unit.attempt, repairCodes: unit.repairCodes ?? [] }));
    const requestBytes = Buffer.byteLength(JSON.stringify(body));
    common.bodyHash = normalizedBodyHash(body);
    if (env.dry) { store.step({ ...common, dry: true, requestBytes, planReply: Boolean(plan?.admitted) }); return null; }
    // A0 (4-hour profile) copies A1's result when the two request bodies are identical; the hook returns the written row or null.
    if (unit.derive) { const derived = await unit.derive({ common, requestBytes }); if (derived) return derived; }
    // 4-hour profile: the per-call cap is the gateway input cap. An over-cap request is a product refusal: a failure, never sent or retried.
    if (env.profile && requestBytes > GATEWAY_INPUT_CAP) {
      store.step({ ...common, status: null, outcome: 'PRODUCT_REFUSED_GATEWAY_CAP', error: 'GATEWAY_INPUT_CAP', requestBytes, correctElement: false, executable: false, correctAndExecutable: false, strictCorrectAndExecutable: false, confidentWrong: false, needsRepair: false, gateCodes: [], usage: null, ms: 0 });
      return null;
    }
    const result = await sendGuarded(env, body, key, armId);
    if (result.error === 'CAP_PER_CALL_ESTIMATE') {
      store.step({ ...common, status: null, outcome: 'OVER_CAP', error: result.error, requestBytes, correctElement: false, correctAndExecutable: false, confidentWrong: false, needsRepair: false, gateCodes: [], usage: null, ms: 0 });
      return null;
    }
    if (isInfraError(result)) {
      store.step({ ...common, status: null, outcome: 'MODEL_ERROR', infraError: true, error: result.error ?? 'NO_REPLY', httpStatus: result.status ?? null, usage: result.usage ?? null, ms: result.ms ?? null,
        modelVersion: result.modelVersion ?? null, requestBytes, correctElement: false, correctAndExecutable: false, confidentWrong: false, needsRepair: false });
      return null;
    }
    if (!result.reply) {
      // HTTP 200 but no parsable JSON reply: the model's failure (INVALID), counted against the arm and eligible for the correction re-ask.
      store.step({ ...common, status: 'INVALID', outcome: 'INVALID', error: result.error ?? 'REPLY_UNPARSEABLE', gateCodes: ['REPLY_UNPARSEABLE'], usage: result.usage ?? null, ms: result.ms ?? null, modelVersion: result.modelVersion ?? null, requestBytes,
        correctElement: false, correctAndExecutable: false, strictCorrectAndExecutable: false, confidentWrong: false, needsRepair: true, repairCodes: unit.attempt === 1 ? ['INVALID_REPLY'] : (unit.repairCodes ?? []) });
      return unit.attempt === 1 ? store.rows.get(key) : null;
    }
    let interp;
    try { interp = await lock(() => arm.interpret({ page: load.page, cdp: load.cdp, reply: result.reply, observed, task, step, request: body })); } catch (error) {
      interp = { status: 'INVALID', pickedId: null, pickedBackendNodeId: null, locator: null, locatorTier: null, executable: false, gateCodes: ['INTERPRET_ERROR'], interpretError: String(error.message).split('\n')[0] };
    }
    // Click-like steps: a pick inside the GT element with no interactive element in between activates the GT (computed read-only via CDP).
    let equivalence = null;
    if (CLICK_LIKE.has(step.operation?.kind) && interp.status === 'ACTION' && interp.pickedBackendNodeId != null && gt.ids.length === 1 && !gt.ids.includes(interp.pickedBackendNodeId)) {
      try { equivalence = await lock(() => (env.equivalent ?? clickEquivalent)(load.cdp, interp.pickedBackendNodeId, gt.ids[0])); } catch (error) { equivalence = { equivalent: false, reason: `EQUIVALENCE_ERROR ${String(error.message).split('\n')[0]}` }; }
    }
    const scored = classify({ task, gtIds: gt.ids, interp, equivalent: equivalence?.equivalent === true });
    const row = { ...common, status: scored.status, outcome: scored.outcome, pickedId: interp.pickedId ?? null, pickedBackendNodeId: interp.pickedBackendNodeId ?? null,
      correctElement: scored.correctElement, strictCorrectElement: scored.strictCorrectElement, strictCorrectAndExecutable: scored.strictCorrectAndExecutable,
      ...(equivalence ? { equivalentDescendant: scored.equivalentDescendant, equivalenceReason: equivalence.reason } : {}), executable: scored.executable, locator: interp.locator ?? null, selector: interp.selector ?? null, locatorTier: interp.locatorTier ?? null, gateCodes: scored.gateCodes,
      correctAndExecutable: scored.correctAndExecutable, admittedSuccess: scored.admittedSuccess, wrongElementAction: scored.wrongElementAction, clarificationOnAnswerable: scored.clarificationOnAnswerable, confidentWrong: scored.confidentWrong,
      negativeHandled: scored.negativeHandled, needsRepair: scored.needsRepair, usage: result.usage ?? null, ms: result.ms ?? null, modelVersion: result.modelVersion ?? null, requestBytes,
      ...(interp.interpretError ? { interpretError: interp.interpretError } : {}) };
    if (unit.attempt === 1) row.repairCodes = scored.repairCodes; // codes to send if a re-ask follows
    store.step(row);
    store.reply({ key, reply: result.reply });
    if (SCORED_ARMS.has(armId)) store.scoringInput({ key, kind: 'NEXT_ACTION', context: scoringContext(contextOf(body), common.at), reply: result.reply });
    return row;
  };
}

async function runArm(env, ctx, armId, units) {
  const { task, stepIndex } = ctx;
  const { store } = env;
  const observed = await observeArm(env, ctx, armId, units);
  if (!observed) return units.filter(unit => unit.attempt === 1).length;
  const runUnit = makeRunUnit(env, ctx, armId, observed);
  let done = 0;
  try {
    for (const unit of units) {
      const row = await runUnit(unit);
      done++;
      if (row && unit.attempt === 1 && row.needsRepair && !env.repairJava && !store.rows.has(keyOf(task.id, stepIndex, armId, unit.rep, 2))) {
        await runUnit({ ...unit, attempt: 2, repairCodes: row.repairCodes });
        done++;
      }
    }
  } finally {
    // The observation owns a live collector in the page's isolated world: release it after the arm's reps, before the GT acts.
    try { await observed.dispose?.(); } catch { /* a disposal failure never changes a result */ }
  }
  return done;
}



/** Copies an A1 row into an A0 row (the two request bodies were identical, so the same model call would be asked twice). */
function derivedRow(a1, common) {
  return { ...a1, key: common.key, arm: 'A0', armOrder: common.armOrder, meta: common.meta, at: common.at, rep: common.rep, attempt: common.attempt, derivedFromA1: true, derivedFromKey: a1.key,
    bodyHash: common.bodyHash ?? a1.bodyHash, usage: null, ms: 0, repairCodes: a1.repairCodes ?? [] };
}

/**
 * 4-hour profile step executor: observe every arm first (serial, so observations never race the page), then dispatch all arm x rep
 * NEXT_ACTION calls of the step concurrently (the global limiter wraps vertex.send), re-asking inline, then derive A0 from A1.
 */
async function runStepParallel(env, ctx, units) {
  const { task, stepIndex, order } = ctx;
  const { store } = env;
  const lockedCtx = { ...ctx, lock: makeMutex() };
  const armIds = order.filter(id => units.some(unit => unit.arm === id));
  const observedBy = new Map();
  const runners = new Map();
  let done = 0;
  for (const armId of armIds) {
    const observed = await observeArm(env, lockedCtx, armId, units.filter(unit => unit.arm === armId));
    if (!observed) { done += units.filter(unit => unit.arm === armId && unit.attempt === 1).length; continue; }
    observedBy.set(armId, observed);
    runners.set(armId, makeRunUnit(env, lockedCtx, armId, observed));
  }
  const makeDerive = (armId, unit) => async ({ common }) => {
    if (armId !== 'A0') return null;
    const a1 = store.rows.get(keyOf(task.id, stepIndex, 'A1', 1, unit.attempt));
    if (unit.attempt > 1 && !store.rows.get(keyOf(task.id, stepIndex, 'A0', unit.rep, 1))?.derivedFromA1) return null;
    if (unit.attempt === 1 && !a1) return null; // no A1 row to copy: A0 asks for itself
    if (!a1 || RETRY_OUTCOMES.has(a1.outcome)) {
      const row = { ...common, status: null, outcome: 'MODEL_ERROR', infraError: true, error: 'A1_UNRESOLVED_FOR_DERIVATION', correctElement: false, correctAndExecutable: false, confidentWrong: false, needsRepair: false };
      store.step(row);
      return row;
    }
    if (unit.attempt === 1 && a1.bodyHash !== common.bodyHash) { common.bodyDiffers = true; return null; } // different request: A0 makes its own call
    const row = derivedRow(a1, common);
    store.step(row);
    return row;
  };
  const withRepair = async (armId, unit) => {
    const runUnit = runners.get(armId);
    const decorate = candidate => (armId === 'A0' && env.profile && !env.dry ? { ...candidate, derive: makeDerive(armId, candidate) } : candidate);
    const row = await runUnit(decorate(unit));
    done++;
    if (row && unit.attempt === 1 && row.needsRepair && !env.repairJava && !store.rows.has(keyOf(task.id, stepIndex, armId, unit.rep, 2))) {
      await runUnit(decorate({ ...unit, attempt: 2, repairCodes: row.repairCodes }));
      done++;
    }
  };
  try {
    const settled = await Promise.allSettled(units.filter(unit => unit.arm !== 'A0' && runners.has(unit.arm)).map(unit => withRepair(unit.arm, unit)));
    const fatal = settled.find(item => item.status === 'rejected');
    if (fatal) throw fatal.reason; // the other in-flight calls were allowed to finish first
    for (const unit of units.filter(item => item.arm === 'A0' && runners.has('A0'))) await withRepair('A0', unit);
  } finally {
    for (const observed of observedBy.values()) { try { await observed.dispose?.(); } catch { /* a disposal failure never changes a result */ } }
  }
  return done;
}

// ---- gate, orchestration, CLI ---------------------------------------------------------------------------------

/** No S-arm model call without a matching freeze. A dry run makes no model call, so it is not gated. */
export function freezeGate({ armIds, dry, verify }) {
  const needs = !dry && armIds.some(id => S_ARMS.has(id));
  if (needs && !verify.ok) return { allowed: false, reason: `REFUSED: S-arm model calls need a matching freeze (${verify.errors.join('; ')})` };
  return { allowed: true, reason: null };
}

export async function runTasks(env, tasks, { concurrency = 2 } = {}) {
  const queue = [...tasks];
  const results = [];
  let budgetStop = null;
  let refusal = null;
  const worker = async () => {
    while (!env.stopRequested && budgetStop === null && refusal === null) {
      const task = queue.shift();
      if (!task) return;
      try {
        const result = await executeTask(env, task);
        results.push(result);
        if (!result.skipped) env.log?.(`${task.id}: ${result.void ? 'VOID' : `${result.done}/${result.units} units`}`);
      } catch (error) {
        if (error instanceof BudgetStop) budgetStop = error;
        else if (error instanceof FreezeRefusal) refusal = error;
        else { env.store.error({ task: task.id, error: String(error.stack ?? error.message).split('\n').slice(0, 4).join(' | '), at: new Date().toISOString() }); env.log?.(`${task.id}: ERROR ${String(error.message).split('\n')[0]}`); }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, queue.length)) }, worker));
  return { results, budgetStop: budgetStop ? budgetStop.message : null, refusal: refusal ? refusal.message : null, remaining: queue.length };
}

export async function main(argv = process.argv.slice(2), overrides = {}) {
  const args = parseArgs(argv);
  const p = overrides.freezePaths ?? freezePaths();
  const corpus = args.corpus ?? p.corpus;
  const verify = overrides.verify ?? verifyFreeze({ p });
  const gate = freezeGate({ armIds: args.arms, dry: args.dry, verify });
  if (!gate.allowed) { console.error(gate.reason); return 2; }

  const store = new RunStore(args.runDir, { dry: args.dry });
  const runJson = readJson(store.file('run.json'), null);
  const seed = runJson?.seed ?? args.seed ?? Number.parseInt(randomUUID().slice(0, 8), 16);
  // vertex.mjs writes calls.jsonl to $SPK07_RUNS_DIR/$SPK07_RUN_ID, so RUN_DIR's basename is the run id.
  const runId = basename(store.runDir);
  if (!/^[A-Za-z0-9._-]{1,80}$/u.test(runId)) throw new Error('RUN_DIR_BASENAME_INVALID (letters, digits, . _ - only)');
  process.env.SPK07_RUNS_DIR = dirname(store.runDir);
  process.env.SPK07_RUN_ID = runId;
  if (!args.dry) {
    const meta = { runId, seed, arms: args.arms, reps: args.reps, node: process.version, playwright: playwrightPin().version,
      freeze: { ok: verify.ok, sha256: verify.freeze?.sha256 ?? null, contracts: verify.freeze?.contracts?.sha256 ?? null, harness: verify.freeze?.harness?.sha256 ?? null, errors: verify.errors, warnings: verify.warnings },
      caps: { SPK07_MAX_CALLS: process.env.SPK07_MAX_CALLS ?? null, SPK07_MAX_PROMPT_TOKENS_TOTAL: process.env.SPK07_MAX_PROMPT_TOKENS_TOTAL ?? null, maxPromptTokensPerCall: args.profile ? 'gateway input cap 262144 bytes' : (args.maxPromptTokens ?? 150000) },
      profile: args.profile, wallMinutes: args.wallMinutes, concurrency: args.concurrency, repsByArm: args.profile ? PROFILE_REPS : Object.fromEntries(args.arms.map(arm => [arm, args.reps])) };
    writeFileSync(store.file('run.json'), JSON.stringify({ ...(runJson ?? {}), ...meta, startedAt: runJson?.startedAt ?? new Date().toISOString(), resumedAt: [...(runJson?.resumedAt ?? []), ...(runJson ? [new Date().toISOString()] : [])] }, null, 1));
  }

  let tasks = loadTasks(corpus, { tasks: args.tasks, strata: args.strata });
  if (args.profile) tasks = orderTasks(tasks, seed);
  if (!args.dry) {
    const current = readJson(store.file('run.json'), {});
    writeFileSync(store.file('run.json'), JSON.stringify({ ...current, plannedTasks: tasks.map(task => ({ id: task.id, stratum: task.stratum, site: task.site ?? null, steps: task.steps.length })) }, null, 1));
  }
  const javaRefusals = new Map();
  if (args.repairJava) {
    for (const row of readJsonl(store.file('scoring-output.jsonl'))) if (row.verdict === 'REFUSED' && /\|1$/u.test(row.key) && !row.key.includes('|SP|')) javaRefusals.set(row.key, row.code ?? 'REFUSED');
  }
  const env = { store, armIds: args.arms, reps: args.reps, seed, dry: args.dry, repairJava: args.repairJava, javaRefusals, maxPromptTokens: args.profile ? undefined : (args.maxPromptTokens ?? 150000),
    profile: args.profile ? { name: args.profile } : null, repsOf: args.profile ? profileRepsOf : undefined,
    freezeOk: verify.ok, stopRequested: false, log: message => console.log(message), observeTimeoutMs: 90000 };
  if (overrides.env) Object.assign(env, overrides.env);
  if (!env.arms) env.arms = Object.fromEntries(await Promise.all(args.arms.map(async id => [id, await import(`./lib/arms/${id}.mjs`)])));
  if (!env.requests) env.requests = await import('./lib/requests.mjs');
  if (!env.vertex) {
    env.vertex = await import('./lib/vertex.mjs');
  }
  let browser = null;
  let fixtureHost = null;
  if (!env.openTask) {
    const require = createRequire(new URL('../../package.json', import.meta.url));
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: true });
    if (tasks.some(task => String(task.url).startsWith('fixture://'))) {
      const { startCorpusPages } = await import('../observed-authoring/pages/server.mjs');
      fixtureHost = await startCorpusPages();
    }
    env.openTask = task => openLoad({ browser, task, fixtureHost, tag: `${safeName(task.id).toLowerCase()}-${Date.now().toString(36)}` });
  }
  // Global adaptive in-flight limiter around vertex.send (4-hour profile).
  let limiter = null; let limiterTimer = null;
  if (env.profile && !overrides.noLimiter) {
    limiter = createLanedLimiter({ pollThrottles: tailThrottlesByLane(store.file('calls.jsonl')), onChange: row => store.append('limiter.jsonl', row) });
    env.vertex = limitedVertex(env.vertex, limiter);
    limiterTimer = setInterval(() => env.log?.(`limiter ${JSON.stringify(limiter.stats())}`), 60000);
  }
  let wallTimer = null;
  if (args.wallMinutes) wallTimer = setTimeout(() => { env.stopRequested = true; env.wallStopped = true; env.log?.(`wall clock ${args.wallMinutes} min reached: finishing in-flight calls, starting no new step`); }, args.wallMinutes * 60000);
  env.resolveGt ??= (load, gt) => resolveGt(load.page, load.cdp, gt);
  env.performStep ??= (load, step, gt, stepIndex) => performChainStep(load, step, stepIndex, gt);
  process.once('SIGINT', () => { env.stopRequested = true; console.error('SIGINT: finishing in-flight tasks; rerun to resume'); });

  let outcome;
  try { outcome = await runTasks(env, tasks, { concurrency: args.concurrency }); } finally {
    clearTimeout(wallTimer); clearInterval(limiterTimer);
    if (limiter && !args.dry) writeFileSync(store.file('limiter-stats.json'), JSON.stringify(limiter.stats(), null, 1));
    await browser?.close().catch(() => undefined);
    await fixtureHost?.close().catch(() => undefined);
  }
  if (!args.dry) {
    // endedAt: durability's "next day" is measured from the end of the full run. `complete` is false after a cap or signal stop.
    const current = readJson(store.file('run.json'), {});
    writeFileSync(store.file('run.json'), JSON.stringify({ ...current, endedAt: new Date().toISOString(), complete: !outcome.budgetStop && !env.stopRequested && !outcome.refusal && outcome.remaining === 0, wallStopped: Boolean(env.wallStopped) }, null, 1));
  }
  const summary = { tasks: tasks.length, ran: outcome.results.filter(r => !r.skipped).length, skipped: outcome.results.filter(r => r.skipped).length, voided: outcome.results.filter(r => r.void).length,
    remaining: outcome.remaining, budgetStop: outcome.budgetStop, refusal: outcome.refusal, stoppedBySignal: env.stopRequested && !env.wallStopped, wallStopped: Boolean(env.wallStopped), limiter: limiter?.stats() ?? null, resumable: Boolean(outcome.budgetStop || env.stopRequested) };
  console.log(JSON.stringify(summary));
  if (outcome.refusal) return 2;
  return outcome.budgetStop || env.wallStopped ? 3 : env.stopRequested ? 130 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(code => { process.exitCode = code; }, error => { console.error(String(error.stack ?? error.message)); process.exitCode = 1; });
}
