/* eslint-disable -- SPK-07 spike tooling: untyped .mjs harness, dynamic imports of arm modules, Node globals. */
// SPK-07 report builder (screening evidence, not ADR-SC-005 D-C evidence).
//
//   node evaluation/grounding/report.mjs RUN_DIR [--out docs/qa/spikes/SPK-07/report.md] [--f1 DIR] [--corpus PATH]
//
// Everything in the report is computed from the run dir. Go/no-go verdicts come from decideStages(), which applies the
// plan's rules mechanically; nothing is typed by hand. Verdict values: GO, NO-GO (a rule failed), INCOMPLETE (evidence
// missing, so it cannot be GO).
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clusterBootstrapRatio, impliedCompletion, lastByKey, mean, pairedComparison, percentile, readJson, readJsonl, seedFrom, wilson } from './lib/stats.mjs';
import { locatorFlags } from './lib/gt.mjs';
import { profileRepsOf } from './run.mjs';
import { paths as freezePaths, verifyFreeze } from './freeze.mjs';

export const HEADER = 'Screening evidence — not ADR-SC-005 D-C evidence';
export const SCORED_ARMS = new Set(['A1', 'S1', 'S2']);
export const ARM_ORDER = ['A0', 'A1', 'S1', 'S2', 'S3', 'S4'];
export const ABSOLUTE_BAR = 0.97;
export const PLANNED_OBSERVATION_BYTES = 40000;
/** Pre-registration section 9: Stage 2 "not worse" = lower CI bound of S1 - A1 success >= -3 pp; "cheaper" = upper CI bound of the summed prompt-token ratio S1/A1 < 1. */
export const NON_INFERIORITY_MARGIN = -0.03;
/** Pre-registration section 7: the visual stratum is visualOnlyField plus iconOnly. */
export const VISUAL_STRATA = ['visualOnlyField', 'iconOnly'];
export const GATEWAY_INPUT_CAP = 262144;

const pct = value => (value === null || value === undefined ? 'n/a' : `${(value * 100).toFixed(1)}%`);
const cell = w => (w.n === 0 ? '-' : `${w.k}/${w.n} (${pct(w.p)} [${pct(w.lo)}, ${pct(w.hi)}])`);
const num = (value, digits = 0) => (value === null || value === undefined ? 'n/a' : Number(value).toFixed(digits));
const byArm = rows => { const map = {}; for (const row of rows) (map[row.arm] ??= []).push(row); return map; };
const armsIn = rows => ARM_ORDER.filter(arm => rows.some(row => row.arm === arm));

/**
 * Merges the Java verdict (when present) into the harness-side flags of one row. Primary success needs no gate
 * (pre-registration section 6); `admittedOk` adds "admitted by the arm's gates and not Java-REFUSED".
 */
export function judge(row, scoring) {
  const verdict = SCORED_ARMS.has(row.arm) ? (scoring.get(row.key)?.verdict ?? null) : null;
  const refused = verdict === 'REFUSED';
  const success = row.correctAndExecutable === true;
  return { ok: success, admittedOk: success && (row.gateCodes ?? []).length === 0 && !refused, refused, verdict,
    // COMPLETE is a hard zero gated or not; a wrong-element ACTION only when admitted (and executable, decided at scoring).
    confidentWrong: row.confidentWrong === true && (row.status === 'COMPLETE' || !refused) };
}

function readDurability(runDir) {
  const rows = [];
  for (const name of existsSync(runDir) ? readdirSync(runDir) : []) {
    if (/^durability(-.+)?\.jsonl$/u.test(name)) for (const row of readJsonl(join(runDir, name))) rows.push({ ...row, file: name });
  }
  return rows;
}

function findF1(runDir, explicit) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  else {
    const parent = dirname(resolve(runDir));
    for (const name of existsSync(parent) ? readdirSync(parent).sort().reverse() : []) if (name.startsWith('f1-')) candidates.push(join(parent, name));
  }
  for (const dir of candidates) {
    const summary = readJson(join(dir, 'summary.json'), null);
    if (summary) return { dir, pass: summary.pass === true, pinnedBundleSha256: summary.pinnedBundleSha256 ?? null };
  }
  return null;
}

export const MIN_FINISHED_PER_STRATUM = 8;
export const MIN_FINISHED_VISUAL = 24;

/**
 * Finished-task bookkeeping for a run that recorded plannedTasks (4-hour profile). Pre-registered minimum used by the stage rule:
 * every stratum needs min(planned, 8) finished tasks, and the visual strata together min(planned, 24) (the section 9 targets).
 */
export function coverageOf({ run, rows, voids }) {
  const planned = Array.isArray(run.plannedTasks) ? run.plannedTasks : null;
  if (!planned) return null;
  const byKey = new Map(rows.map(row => [row.key, row]));
  const armsRun = run.arms ?? [];
  const profile = run.profile === '4h';
  const repsOf = (arm, stratum) => (profile ? profileRepsOf(arm, { stratum }) : (run.reps ?? 3));
  const wholeVoid = new Set(voids.filter(row => row.step === null || row.step === undefined).map(row => row.task));
  const firstVoidStep = new Map();
  for (const row of voids) if (typeof row.step === 'number') firstVoidStep.set(row.task, Math.min(firstVoidStep.get(row.task) ?? Infinity, row.step));
  const finishedIds = new Set();
  for (const task of planned) {
    if (wholeVoid.has(task.id)) { finishedIds.add(task.id); continue; }
    const steps = Math.min(task.steps ?? 1, firstVoidStep.get(task.id) ?? Infinity);
    let done = steps > 0 || firstVoidStep.has(task.id);
    for (let step = 0; step < steps && done; step++) {
      for (const arm of armsRun) {
        for (let rep = 1; rep <= repsOf(arm, task.stratum) && done; rep++) {
          const first = byKey.get(keyOfRow(task.id, step, arm, rep, 1));
          if (!first) { done = false; break; }
          if (first.needsRepair && first.outcome !== 'MODEL_ERROR' && !byKey.get(keyOfRow(task.id, step, arm, rep, 2))) done = false;
        }
      }
    }
    if (done) finishedIds.add(task.id);
  }
  const byStratum = {};
  for (const task of planned) { const entry = (byStratum[task.stratum] ??= { planned: 0, finished: 0 }); entry.planned++; if (finishedIds.has(task.id)) entry.finished++; }
  const visual = VISUAL_STRATA.reduce((acc, stratum) => ({ planned: acc.planned + (byStratum[stratum]?.planned ?? 0), finished: acc.finished + (byStratum[stratum]?.finished ?? 0) }), { planned: 0, finished: 0 });
  const unmetStrata = Object.entries(byStratum).filter(([, v]) => v.finished < Math.min(v.planned, MIN_FINISHED_PER_STRATUM)).map(([k]) => k);
  const visualUnmet = visual.finished < Math.min(visual.planned, MIN_FINISHED_VISUAL);
  return { plannedTotal: planned.length, finishedTotal: finishedIds.size, finishedIds, unfinished: planned.filter(task => !finishedIds.has(task.id)).map(task => task.id), byStratum, visual, unmetStrata, visualUnmet,
    minimums: { perStratum: MIN_FINISHED_PER_STRATUM, visual: MIN_FINISHED_VISUAL } };
}
const keyOfRow = (task, step, arm, rep, attempt) => `${task}|${step}|${arm}|${rep}|${attempt}`;

export function analyze(runDir, options = {}) {
  const dir = resolve(runDir);
  const run = readJson(join(dir, 'run.json'), {});
  const allRows = lastByKey(readJsonl(join(dir, 'steps.jsonl'))).filter(row => !row.dry);
  const voids = readJsonl(join(dir, 'void.jsonl'));
  const profile = run.profile === '4h';
  // Coverage (4-hour profile): a planned task is finished when every expected (step, arm, rep) unit has a row (an unresolved
  // infrastructure row still counts as attempted; it is excluded and listed by the infra rules below) or the task was VOID.
  const coverage = coverageOf({ run, rows: allRows, voids });
  const allRaw = coverage ? allRows.filter(row => coverage.finishedIds.has(row.task)) : allRows;
  // Infrastructure errors (429/5xx/connection/timeout, including a failed shared SOURCE_PLAN) say nothing about an arm: they are
  // not final (a resumed run re-attempts them), so rows still unresolved are excluded from every denominator and listed apart.
  const isInfra = row => row.outcome === 'MODEL_ERROR' && row.infraError !== false;
  const infraRows = allRaw.filter(isInfra);
  const all = allRaw.filter(row => !isInfra(row));
  const infraErrors = { total: infraRows.length, planInfra: infraRows.filter(row => row.planInfra).length, byArm: countBy(infraRows, row => row.arm), byTask: countBy(infraRows, row => row.task),
    byHttpStatus: countBy(infraRows, row => String(row.httpStatus ?? 'transport')) };
  const scoringRows = readJsonl(join(dir, 'scoring-output.jsonl'));
  const scoring = new Map(); for (const row of scoringRows) scoring.set(row.key, row);
  const planFiles = existsSync(join(dir, 'plans')) ? readdirSync(join(dir, 'plans')).filter(name => name.endsWith('.json')) : [];
  const plans = planFiles.map(name => readJson(join(dir, 'plans', name), null)).filter(Boolean);
  const dur = readDurability(dir);
  const leak = readJson(join(dir, 'leakscan.json'), null);
  const safety = readJson(join(dir, 'safety.json'), null);
  const f1 = findF1(dir, options.f1);
  const seedBase = run.seed ?? 1;

  const first = all.filter(row => row.attempt === 1);
  const finalByUnit = new Map();
  for (const row of all) { const id = `${row.task}|${row.step}|${row.arm}|${row.rep}`; const cur = finalByUnit.get(id); if (!cur || row.attempt > cur.attempt) finalByUnit.set(id, row); }
  const answerable = first.filter(row => row.expect === 'ACTION');
  const negatives = first.filter(row => row.expect !== 'ACTION');
  const arms = armsIn(allRaw);
  const strata = [...new Set(first.map(row => row.stratum))].sort();

  // Per arm x stratum table (rep-level trials, first attempt; "after re-ask" uses the final attempt).
  const perArmStratum = {};
  for (const arm of arms) {
    perArmStratum[arm] = {};
    for (const stratum of ['ALL', ...strata]) {
      const rows = answerable.filter(row => row.arm === arm && (stratum === 'ALL' || row.stratum === stratum));
      const negRows = negatives.filter(row => row.arm === arm && (stratum === 'ALL' || row.stratum === stratum));
      if (rows.length === 0 && negRows.length === 0) continue;
      const judged = rows.map(row => judge(row, scoring));
      const finals = rows.map(row => judge(finalByUnit.get(`${row.task}|${row.step}|${row.arm}|${row.rep}`) ?? row, scoring));
      const negJudged = negRows.map(row => judge(row, scoring));
      perArmStratum[arm][stratum] = {
        trials: rows.length,
        correct: wilson(rows.filter(row => row.correctElement).length, rows.length),
        executable: wilson(rows.filter(row => row.executable === true).length, rows.length),
        correctAndExecutable: wilson(judged.filter(item => item.ok).length, rows.length),
        admittedSuccess: wilson(judged.filter(item => item.admittedOk).length, rows.length),
        afterReask: wilson(finals.filter(item => item.ok).length, rows.length),
        clarificationOnAnswerable: wilson(rows.filter(row => row.clarificationOnAnswerable).length, rows.length),
        confidentWrong: wilson(judged.filter(item => item.confidentWrong).length, rows.length),
        wrongElementActions: rows.filter(row => row.wrongElementAction).length + negRows.filter(row => row.wrongElementAction).length,
        emptied: rows.filter(row => row.outcome === 'EMPTIED').length,
        modelErrors: rows.filter(row => ['OBSERVE_ERROR', 'PLAN_INVALID', 'OVER_CAP', 'PRODUCT_REFUSED_GATEWAY_CAP'].includes(row.outcome)).length,
        equivalentDescendants: rows.filter(row => row.equivalentDescendant && row.correctAndExecutable).length,
        negativeTrials: negRows.length,
        negativesHandled: wilson(negRows.filter(row => row.negativeHandled).length, negRows.length),
        negativeConfidentWrong: negJudged.filter(item => item.confidentWrong).length,
      };
    }
  }

  // Per-unit flags for paired comparisons: unit = (task, step); flags per rep (answerable steps only).
  const unitsOf = (rows, okOf) => {
    const units = {};
    for (const row of rows) {
      const arm = (units[row.arm] ??= new Map());
      const flags = arm.get(`${row.task}|${row.step}`) ?? [];
      flags[row.rep - 1] = okOf(row);
      arm.set(`${row.task}|${row.step}`, flags);
    }
    return units;
  };
  const strataOfUnit = new Map(answerable.map(row => [`${row.task}|${row.step}`, row.stratum]));
  const compareIn = (units, x, y, strataSet = null) => {
    if (!units[x] || !units[y]) return null;
    const list = [];
    for (const [unit, xs] of units[x]) {
      const ys = units[y].get(unit);
      if (!ys || (strataSet && !strataSet.includes(strataOfUnit.get(unit)))) continue;
      list.push({ task: unit.split('|')[0], x: xs.filter(value => value !== undefined), y: ys.filter(value => value !== undefined) });
    }
    return { x, y, strata: strataSet, ...pairedComparison(list, { seed: seedFrom(`${seedBase}|${x}|${y}|${strataSet?.join('+') ?? 'all'}`), rule: profile ? 'all' : 'majority' }) };
  };
  const primaryUnits = unitsOf(answerable, row => judge(row, scoring).ok);
  const pairs = { primary: ['S3', 'S2', null], s2VsA1: ['S2', 'A1', null], s1VsA1: ['S1', 'A1', null], s4VsS3Visual: ['S4', 'S3', VISUAL_STRATA] };
  const comparisons = Object.fromEntries(Object.entries(pairs).map(([name, [x, y, st]]) => [name, compareIn(primaryUnits, x, y, st)]));
  // Sensitivity (reported, never gating): admitted success, after re-ask, real-site units, held-out sites, strict locators.
  const strictOk = row => judge(row, scoring).ok && (() => { const f = locatorFlags(row.locator); return !f.positional && !f.nonExact; })();
  const finalAnswerable = [...finalByUnit.values()].filter(row => row.expect === 'ACTION');
  const isReal = row => (row.fixture === undefined ? row.stratum !== 'fixtureRegression' : row.fixture === false);
  const variants = {
    admitted: unitsOf(answerable, row => judge(row, scoring).admittedOk),
    afterReask: unitsOf(finalAnswerable, row => judge(row, scoring).ok),
    realSitesOnly: unitsOf(answerable.filter(isReal), row => judge(row, scoring).ok),
    heldOutOnly: unitsOf(answerable.filter(row => row.heldOut), row => judge(row, scoring).ok),
    // Wave-2 (fresh-site) tasks only; rows without a wave field are wave 1.
    freshSitesOnly: unitsOf(answerable.filter(row => (row.wave ?? 1) === 2), row => judge(row, scoring).ok),
    // Strict element equality: no click-equivalent descendant credit.
    strictEquality: unitsOf(answerable, row => (row.strictCorrectAndExecutable ?? row.correctAndExecutable) === true),
    strictLocators: unitsOf(answerable, strictOk),
  };
  const sensitivity = Object.fromEntries(Object.entries(pairs).map(([name, [x, y, st]]) => [name, Object.fromEntries(Object.entries(variants).map(([variant, units]) => {
    const c = compareIn(units, x, y, st);
    return [variant, c ? { units: c.units, diff: c.bootstrap.diff, lo: c.bootstrap.lo, hi: c.bootstrap.hi, p: c.mcnemar.p } : null];
  }))]));
  // Stage 2 cost reading: bootstrap CI of the summed prompt-token ratio S1/A1 over tasks that ran both arms.
  const tokenSums = {};
  for (const row of first) if (row.usage?.prompt) { const e = ((tokenSums[row.task] ??= {})[row.arm] ??= 0); tokenSums[row.task][row.arm] = e + row.usage.prompt; }
  const tokenRatio = clusterBootstrapRatio(Object.entries(tokenSums).filter(([, v]) => v.S1 && v.A1).map(([id, v]) => ({ id, x: v.S1, y: v.A1 })), { seed: seedFrom(`${seedBase}|tokens|S1|A1`) });

  // Cost, latency and admission.
  const tokens = {}; const admission = {};
  for (const [arm, rows] of Object.entries(byArm(first))) {
    const called = rows.filter(row => row.usage);
    const observations = rows.filter(row => row.rep === 1 && row.meta);
    // Section 10: every request must have an observation <= 40,000 bytes and a full body <= 262,144 bytes (the gateway cap).
    const requests = all.filter(row => row.arm === arm && row.expect === 'ACTION' && row.requestBytes !== undefined);
    const planned = requests.filter(row => (row.meta?.bytes ?? Infinity) <= PLANNED_OBSERVATION_BYTES && row.requestBytes <= GATEWAY_INPUT_CAP && row.meta?.gatewayInputAdmitted !== false).length;
    tokens[arm] = { calls: called.length, promptP50: percentile(called.map(row => row.usage.prompt), 50), promptP95: percentile(called.map(row => row.usage.prompt), 95), promptMean: mean(called.map(row => row.usage.prompt).filter(Number.isFinite)),
      outMean: mean(called.map(row => row.usage.out).filter(Number.isFinite)), thoughtsMean: mean(called.map(row => row.usage.thoughts).filter(Number.isFinite)),
      msP50: percentile(called.map(row => row.ms), 50), msP95: percentile(called.map(row => row.ms), 95), observeMsP50: percentile(observations.map(row => row.meta.ms), 50), observeMsP95: percentile(observations.map(row => row.meta.ms), 95),
      bytesP50: percentile(observations.map(row => row.meta.bytes), 50), bytesP95: percentile(observations.map(row => row.meta.bytes), 95) };
    // Addendum 2026-10-26: for A0-S2 "admitted under production limits" also needs the gateway cap and the translation cap
    // (wire + 2048 <= 65536); for S3/S4 the translation cap and the largest wire size are reported only.
    const full = row => row.meta.admittedUnderProductionLimits === true && row.meta.gatewayInputAdmitted === true && row.meta.translationInputAdmitted === true;
    const productionOf = ['S3', 'S4'].includes(arm) ? (row => row.meta.admittedUnderProductionLimits === true) : full;
    const wires = all.filter(row => row.arm === arm && row.meta).map(row => row.meta.translationInputBytes).filter(Number.isFinite);
    admission[arm] = { observations: observations.length, production: wilson(observations.filter(productionOf).length, observations.length),
      translation: wilson(observations.filter(row => row.meta.translationInputAdmitted === true).length, observations.length), maxTranslationInputBytes: wires.length ? Math.max(...wires) : null,
      gateway: wilson(observations.filter(row => row.meta.gatewayInputAdmitted === true).length, observations.length), planned: wilson(planned, requests.length), plannedRate: requests.length === 0 ? null : planned / requests.length, requests: requests.length };
  }
  tokens.SP = { calls: plans.filter(plan => plan.usage).length, promptP50: percentile(plans.map(plan => plan.usage?.prompt), 50), promptP95: percentile(plans.map(plan => plan.usage?.prompt), 95), msP50: percentile(plans.map(plan => plan.ms), 50), msP95: percentile(plans.map(plan => plan.ms), 95) };

  // Java verdicts.
  const java = { present: scoringRows.length > 0, byArm: {}, unscoredArms: [] };
  for (const row of scoringRows) {
    const arm = String(row.key).split('|')[2];
    const entry = (java.byArm[arm] ??= { ADMITTED: 0, REFUSED: 0, SCORER_ERROR: 0, codes: {} });
    entry[row.verdict] = (entry[row.verdict] ?? 0) + 1;
    // REFUSED carries a refusal code; ADMITTED carries the status for CLARIFICATION/COMPLETE/UNSUPPORTED; SCORER_ERROR is a scorer fault.
    if (row.code) { const label = `${row.verdict}/${row.stage ?? '?'}:${row.code}`; entry.codes[label] = (entry.codes[label] ?? 0) + 1; }
  }
  for (const arm of arms) if (SCORED_ARMS.has(arm) && !java.byArm[arm]) java.unscoredArms.push(arm);

  // Durability windows.
  const durability = { shortTerm: summarizeDur(dur.filter(row => !(row.hoursSinceRun >= 24))), nextDay: summarizeDur(dur.filter(row => row.hoursSinceRun >= 24)) };

  // Hard zeros.
  const confidentWrong = {};
  for (const arm of arms) {
    const hits = all.filter(row => row.arm === arm && judge(row, scoring).confidentWrong);
    confidentWrong[arm] = { count: hits.length, keys: hits.slice(0, 10).map(row => row.key), unscored: SCORED_ARMS.has(arm) && java.unscoredArms.includes(arm) };
  }
  const wrongUnique = dur.length === 0 ? null : Object.fromEntries(arms.map(arm => [arm, dur.filter(row => row.arm === arm && row.outcome === 'WRONG_UNIQUE').length]));
  const hostile = safety?.hostile ? { total: safety.hostile.total, passed: safety.hostile.passed } : null;
  const injected = safety?.injected ? { total: safety.injected.total, passed: safety.injected.passed } : null;
  // Trials that actually resolved (VOID and UNSUPPORTED_SHAPE trials say nothing about durability): HZ-2 needs at least one.
  const durabilityResolved = Object.fromEntries(arms.map(arm => [arm, dur.filter(row => row.arm === arm && ['OK', 'FAIL_CLOSED', 'WRONG_UNIQUE'].includes(row.outcome)).length]));
  // Leak attribution (pre-registration section 8): a hit belongs to the arm whose payload held it; unattributed hits (calls.jsonl,
  // logs, report, shared SOURCE_PLAN) are harness-level and block every stage. A0/A1 hits are product findings outside SPK-07 gating.
  const leakByArm = leak ? Object.fromEntries(['harness', ...ARM_ORDER].map(key => [key, (leak.hits ?? []).filter(hit => (ARM_ORDER.includes(hit.arm) ? hit.arm : 'harness') === key).length])) : null;
  const engineRows = dur.filter(row => row.engineChecked);
  const hz6 = engineRows.length === 0 ? null : Object.fromEntries(arms.map(arm => [arm, { checked: engineRows.filter(row => row.arm === arm).length, mismatches: engineRows.filter(row => row.arm === arm && row.hz6).length }]));
  const wrongElementActions = Object.fromEntries(arms.map(arm => [arm, all.filter(row => row.arm === arm && row.wrongElementAction).length]));
  const hardZeros = {
    confidentWrong, wrongElementActions, wrongUnique, durabilityResolved, leakByArm, injected, hz6,
    leak: leak ? { hits: leak.hits?.length ?? 0, scannedFiles: leak.scannedFiles ?? null } : null,
    mask: safety && safety.maskDifferences !== undefined ? { differences: Number(safety.maskDifferences) } : null,
    hostile, f1: f1 ? { pass: f1.pass, dir: f1.dir } : null,
  };

  const chainRows = Object.fromEntries(arms.map(arm => [arm, first.filter(row => row.arm === arm && row.stratum === 'chain').length]));
  const analysis = { header: HEADER, run, runDir: dir, arms, strata, infraErrors, rowCounts: { attempt1: first.length, total: all.length, infra: infraRows.length, voids: voids.length, errors: all.filter(row => row.outcome === 'MODEL_ERROR' || row.outcome === 'OBSERVE_ERROR').length, emptied: all.filter(row => row.outcome === 'EMPTIED').length },
    voidReasons: countBy(voids, row => String(row.reason).split(' ')[0]), voidsByStratum: countBy(voids, row => row.stratum ?? 'unknown'),
    seeds: { runSeed: run.seed ?? null, armOrder: 'per task: shuffle seeded by sha256(runSeed|taskId)', bootstrap: Object.fromEntries([...Object.entries(comparisons).map(([name, c]) => [name, c?.bootstrap?.seed ?? null]), ['tokenRatioS1A1', tokenRatio?.seed ?? null]]) }, models: [...new Set(all.map(row => row.modelVersion).filter(Boolean))], perArmStratum, comparisons, tokens, admission, java, durability, leak, safety, f1,
    hardZeros, sensitivity, tokenRatio, chainRows, absoluteBar: Object.fromEntries(arms.map(arm => { const w = perArmStratum[arm].ALL?.correctAndExecutable; return [arm, w ? { rate: w.p, k5: impliedCompletion(w.p, 5), lo5: impliedCompletion(w.lo, 5) } : null]; })) };
  analysis.profile = profile ? '4h' : null;
  analysis.coverage = coverage && { ...coverage, finishedIds: undefined, unfinishedTasks: coverage.unfinished };
  analysis.repCounts = Object.fromEntries(arms.map(arm => { const rows = first.filter(row => row.arm === arm); return [arm, { maxRep: Math.max(0, ...rows.map(row => row.rep)), units: new Set(rows.map(row => `${row.task}|${row.step}`)).size, tasks: new Set(rows.map(row => row.task)).size }]; }));
  const a0 = first.filter(row => row.arm === 'A0');
  analysis.a0 = { rows: a0.length, derivedFromA1: a0.filter(row => row.derivedFromA1).length, emptied: a0.filter(row => row.outcome === 'EMPTIED').length,
    ownCalls: a0.filter(row => !row.derivedFromA1 && row.usage).length, bodyDiffers: a0.filter(row => row.bodyDiffers).length, unresolved: a0.filter(row => row.outcome === 'MODEL_ERROR').length };
  analysis.productRefusedGatewayCap = Object.fromEntries(arms.map(arm => [arm, first.filter(row => row.arm === arm && row.outcome === 'PRODUCT_REFUSED_GATEWAY_CAP').length]));
  analysis.stages = decideStages(analysis);
  return analysis;
}

function countBy(rows, keyOf) { const out = {}; for (const row of rows) { const k = keyOf(row); out[k] = (out[k] ?? 0) + 1; } return out; }
function summarizeDur(rows) {
  const blank = () => ({ OK: 0, FAIL_CLOSED: 0, WRONG_UNIQUE: 0, VOID: 0, UNSUPPORTED_SHAPE: 0 });
  const byTier = {}; const byArmTier = {}; const byCondition = {}; const byExactness = {};
  for (const row of rows) {
    (byTier[row.tier] ??= blank())[row.outcome]++;
    (byArmTier[`${row.arm}/${row.tier}`] ??= blank())[row.outcome]++;
    (byCondition[row.trial?.cond ?? 'baseline'] ??= blank())[row.outcome]++;
    (byExactness[`${row.nonExact ? 'non-exact' : 'exact'}/${row.positional ? 'positional' : 'non-positional'}`] ??= blank())[row.outcome]++;
  }
  return { trials: rows.length, byTier, byArmTier, byCondition, byExactness };
}

// ---- stage rules (the plan's table, computed) -----------------------------------------------------------------

const tri = (value) => (value === null || value === undefined ? null : Boolean(value));
const check = (name, pass, detail) => ({ name, pass: tri(pass), detail });
const lowerAboveZero = cmp => (cmp && cmp.bootstrap.lo !== null ? cmp.bootstrap.lo > 0 : null);

/** Leak hits that block the stage of `arm`: harness-level hits plus hits in that arm's own payload. */
const leakBlocking = (hz, arm) => (hz.leakByArm?.harness ?? 0) + (hz.leakByArm?.[arm] ?? 0);
const leakDetail = (hz, arm) => {
  const by = hz.leakByArm ?? {};
  const others = ARM_ORDER.filter(key => key !== arm && !['A0', 'A1'].includes(key)).reduce((sum, key) => sum + (by[key] ?? 0), 0);
  return `${leakBlocking(hz, arm)} blocking (harness-level ${by.harness ?? 0}, ${arm} ${by[arm] ?? 0}); other S-arm hits ${others}; A0/A1 production findings ${(by.A0 ?? 0) + (by.A1 ?? 0)} (outside SPK-07 gating); ${hz.leak.scannedFiles} files scanned`;
};
/** HZ-5: a hostile OR injection case not passed. Both suites must be present for a pass; a visible failure is a fail either way. */
function hz5Check(hz) {
  const failed = (hz.hostile ? hz.hostile.total - hz.hostile.passed : 0) + (hz.injected ? hz.injected.total - hz.injected.passed : 0);
  const complete = hz.hostile && hz.injected && hz.hostile.total > 0 && hz.injected.total > 0;
  const detail = `hostile ${hz.hostile ? `${hz.hostile.passed}/${hz.hostile.total}` : 'missing'}, injected ${hz.injected ? `${hz.injected.passed}/${hz.injected.total}` : 'missing'}`;
  return check('HZ-5 all hostile and injection cases passed', failed > 0 ? false : complete ? true : null, detail);
}

/**
 * Hard zeros relevant to one arm's stage (pre-registration section 8): HZ-1 confident wrong, HZ-2 wrong-unique durability,
 * HZ-3 leak, HZ-4 mask, HZ-5 hostile, and for S2 and later HZ-6 / F1 conformance.
 */
function hardZeroChecks(a, arm, { f1 }) {
  const hz = a.hardZeros;
  const cw = hz.confidentWrong[arm];
  const checks = [
    check(`HZ-1 no gate-admitted executable wrong-element ACTION or COMPLETE (${arm})`, cw ? cw.count === 0 : null, cw ? `${cw.count} found (${hz.wrongElementActions[arm] ?? 0} wrong-element ACTIONs incl. refused)${cw.unscored ? '; Java scoring missing: upper bound' : ''}${cw.keys.length ? `; e.g. ${cw.keys.slice(0, 3).join(', ')}` : ''}` : `${arm} not run`),
    check(`HZ-2 no wrong-unique durability result (${arm})`, !hz.wrongUnique ? null : (hz.wrongUnique[arm] ?? 0) > 0 ? false : (hz.durabilityResolved?.[arm] ?? 0) > 0 ? true : null,
      !hz.wrongUnique ? 'durability not run' : `${hz.wrongUnique[arm] ?? 0} wrong-unique in ${hz.durabilityResolved?.[arm] ?? 0} resolved trials${(hz.durabilityResolved?.[arm] ?? 0) === 0 ? ' (no resolved trial for this arm: MISSING)' : ''}`),
    check(`HZ-3 no leak in harness outputs or the ${arm} payload`, hz.leak ? leakBlocking(hz, arm) === 0 : null, hz.leak ? leakDetail(hz, arm) : 'leak scan not run'),
    check('HZ-4 no mask difference', hz.mask ? hz.mask.differences === 0 : null, hz.mask ? `${hz.mask.differences} differences` : 'safety.json missing'),
    hz5Check(hz),
  ];
  if (f1) {
    const own = hz.hz6?.[arm];
    checks.push(check('F1 conformance recorded PASS', hz.f1 ? hz.f1.pass : null, hz.f1 ? hz.f1.dir : 'F1 summary not found'));
    checks.push(check(`HZ-6 no engine/public mismatch on the corpus (${arm})`, own && own.checked > 0 ? own.mismatches === 0 : null, own ? `${own.mismatches} mismatches in ${own.checked} checked trials` : 'durability engine check not run'));
  }
  return checks;
}

/** Unresolved infrastructure errors for these arms leave the evidence incomplete (MISSING), never a pass or a fail. */
const infraCheck = (a, armIds) => {
  const n = armIds.reduce((sum, arm) => sum + (a.infraErrors.byArm[arm] ?? 0), 0);
  return check(`no unresolved infrastructure errors (${armIds.join(', ')})`, n === 0 ? true : null, n === 0 ? 'none' : `${n} unresolved rows excluded from the denominators; rerun the same RUN_DIR`);
};
/** Pre-registered finished-task minimum (see coverageOf). `scope` 'all' = every stratum, 'visual' = visualOnlyField + iconOnly together. */
const coverageCheck = (a, scope) => {
  const c = a.coverage;
  if (!c) return check('finished-task minimum per stratum', true, 'no task plan recorded (not a 4-hour-profile run)');
  const unmet = scope === 'visual' ? c.visualUnmet : c.unmetStrata.length > 0;
  return check(scope === 'visual' ? `finished-task minimum on the visual strata (>= min(planned, ${c.minimums.visual}))` : `finished-task minimum per stratum (>= min(planned, ${c.minimums.perStratum}) in every stratum)`,
    unmet ? null : true, unmet ? (scope === 'visual' ? `visual strata finished ${c.visual.finished}/${c.visual.planned}` : `short strata: ${c.unmetStrata.map(k => `${k} ${c.byStratum[k].finished}/${c.byStratum[k].planned}`).join(', ')}`) : `${c.finishedTotal}/${c.plannedTotal} tasks finished`);
};
const verdictOf = checks => (checks.some(item => item.pass === false) ? 'NO-GO' : checks.some(item => item.pass === null) ? 'INCOMPLETE' : 'GO');
const ciText = c => `diff ${pct(c.bootstrap.diff)} CI [${pct(c.bootstrap.lo)}, ${pct(c.bootstrap.hi)}], McNemar p=${num(c.mcnemar.p, 4)}`;

/** The plan's stage table with the readings fixed in pre-registration section 9, computed from the analysis. */
export function decideStages(a) {
  const cmp = a.comparisons;
  const stages = [];
  // Stage 1: F1 passes, S2 > A1 with CI above 0, no hard zeros.
  {
    const c = cmp.s2VsA1;
    const checks = [coverageCheck(a, 'all'), infraCheck(a, ['S2', 'A1']), check('S2 > A1: lower bound of the bootstrap CI above 0', lowerAboveZero(c), c ? ciText(c) : 'S2 or A1 not run'),
      ...hardZeroChecks(a, 'S2', { f1: true })];
    stages.push({ stage: 1, name: 'Resolver on Playwright semantics (S2)', checks, verdict: verdictOf(checks) });
  }
  // Stage 2: S1 not worse than A1 (lower CI bound >= -3 pp) and cheaper (upper CI bound of the summed token ratio < 1).
  {
    const c = cmp.s1VsA1;
    const r = a.tokenRatio;
    const checks = [coverageCheck(a, 'all'), infraCheck(a, ['S1', 'A1']), check(`S1 not worse than A1: lower bound of the CI for S1 - A1 success >= ${NON_INFERIORITY_MARGIN * 100} pp`, c && c.bootstrap.lo !== null ? c.bootstrap.lo >= NON_INFERIORITY_MARGIN : null, c ? ciText(c) : 'S1 or A1 not run'),
      check('S1 cheaper: upper bound of the 95% cluster-bootstrap CI of summed prompt tokens S1/A1 below 1', r && r.hi !== null ? r.hi < 1 : null, r && r.ratio !== null ? `ratio ${num(r.ratio, 3)} CI [${num(r.lo, 3)}, ${num(r.hi, 3)}] over ${r.clusters} tasks` : 'token usage for S1 and A1 missing'),
      ...hardZeroChecks(a, 'S1', { f1: false })];
    stages.push({ stage: 2, name: 'Outline rendering (S1)', checks, verdict: verdictOf(checks) });
  }
  // Stage 3: primary CI above 0, no hard zeros including chains, every S3 request admitted under the planned limits.
  {
    const c = cmp.primary;
    const adm = a.admission.S3;
    const checks = [coverageCheck(a, 'all'), infraCheck(a, ['S3', 'S2']), check('S3 > S2 (primary): lower bound of the bootstrap CI above 0', lowerAboveZero(c), c ? ciText(c) : 'S3 or S2 not run'),
      check('chain stratum evidenced for S3', a.chainRows.S3 === undefined ? null : a.chainRows.S3 > 0, `${a.chainRows.S3 ?? 0} chain trials`),
      check('every S3 request admitted under planned limits (observation <= 40,000 bytes, request <= 262,144 bytes)', adm && adm.requests > 0 ? adm.plannedRate === 1 : null, adm ? `${adm.planned.k}/${adm.planned.n}` : 'S3 not run'),
      ...hardZeroChecks(a, 'S3', { f1: true })];
    stages.push({ stage: 3, name: 'Sanitized AI-snapshot perception and synthesis (S3)', checks, verdict: verdictOf(checks) });
  }
  // Stage 4: only if S4 > S3 on the visual stratum; a positive estimate whose CI includes 0 is inconclusive = no-go.
  {
    const c = cmp.s4VsS3Visual;
    const inconclusive = c && c.bootstrap.diff > 0 && c.bootstrap.lo <= 0;
    const checks = [coverageCheck(a, 'visual'), infraCheck(a, ['S4', 'S3']), check(`S4 > S3 on the visual stratum (${VISUAL_STRATA.join(' + ')}): lower bound of the CI above 0`, lowerAboveZero(c), c ? `${c.units} units, ${ciText(c)}${inconclusive ? ' (inconclusive: positive estimate, CI includes 0, recorded as no-go)' : ''}` : 'S4 or S3 not run on the visual stratum'),
      ...hardZeroChecks(a, 'S4', { f1: true })];
    stages.push({ stage: 4, name: 'Set-of-Marks screenshot (S4); a GO means taking it to the ADR and Security & Compliance, not into the product', checks, verdict: verdictOf(checks) });
  }
  return stages;
}

// ---- markdown -------------------------------------------------------------------------------------------------

const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');
const cmpLine = (label, c) => (c ? [label, `${c.units}`, `${c.onlyX}/${c.onlyY}`, num(c.mcnemar.p, 4), `${num(c.sensitivityAllReps.p, 4)} (${c.sensitivityAllReps.b}/${c.sensitivityAllReps.c})`,
  `${pct(c.bootstrap.diff)} [${pct(c.bootstrap.lo)}, ${pct(c.bootstrap.hi)}]`, `${pct(c.rateX.p)} vs ${pct(c.rateY.p)}`] : [label, '-', '-', '-', '-', '-', 'not run']);

export function renderReport(a, extra = {}) {
  const out = [];
  out.push('# SPK-07 grounding benchmark report', '');
  if (a.run.postHoc === true) out.push('**POST-HOC**: this run was decided and assembled after earlier results were seen; it is not a pre-registered confirmatory run.', '');
  out.push(`> **${HEADER}**`, '');
  out.push('## Run', '', table(['Field', 'Value'], [['runId', a.run.runId ?? 'n/a'], ['seed', String(a.run.seed ?? 'n/a')], ['arms', a.arms.join(', ') || (a.run.arms ?? []).join(', ')], ['reps', String(a.run.reps ?? 'n/a')], ['started', a.run.startedAt ?? 'n/a'], ['node / playwright', `${a.run.node ?? 'n/a'} / ${a.run.playwright ?? 'n/a'}`],
    ['model versions seen', a.models.join(', ') || 'n/a'], ['caps', JSON.stringify(a.run.caps ?? {})], ['rows (attempt 1 / all)', `${a.rowCounts.attempt1} / ${a.rowCounts.total}`], ['VOID entries', `${a.rowCounts.voids} by reason ${JSON.stringify(a.voidReasons)}; by stratum ${JSON.stringify(a.voidsByStratum)}`], ['run ended (durability next-day clock)', a.run.endedAt ?? 'n/a (run not finished; falls back to startedAt)'],
    ['seeds', `run seed ${a.seeds.runSeed}; arm order: ${a.seeds.armOrder}; bootstrap seeds ${JSON.stringify(a.seeds.bootstrap)}`], ['EMPTIED / errors', `${a.rowCounts.emptied} / ${a.rowCounts.errors}`],
    ...(a.run.postHoc !== undefined ? [['postHoc', String(a.run.postHoc)]] : []), ...(a.run.assembledFrom ? [['assembledFrom', JSON.stringify(a.run.assembledFrom)]] : [])]), '');
  const fz = a.run.freeze;
  out.push('## Freeze', '');
  out.push(fz ? table(['Field', 'Value'], [['freeze ok at run time', String(fz.ok)], ['corpus sha256', fz.sha256 ?? 'n/a'], ['contracts sha256', fz.contracts ?? 'n/a'], ['harness files sha256', fz.harness ?? 'n/a'],
    ['errors / warnings', `${(fz.errors ?? []).join('; ') || 'none'} / ${(fz.warnings ?? []).join('; ') || 'none'}`], ...(extra.freezeNow ? [['re-verified now', extra.freezeNow.ok ? 'matches' : extra.freezeNow.errors.join('; ')], ['current harness drift', extra.freezeNow.warnings.join('; ') || 'none']] : [])]) : 'No freeze recorded in run.json (an unfrozen run is not evidence for S-arm decisions).', '');

  if (a.coverage) {
    out.push('## Coverage and arm reps', '');
    out.push(`${a.coverage.finishedTotal} of ${a.coverage.plannedTotal} planned tasks finished; rows of unfinished tasks are excluded from every denominator. Minimum for a stage verdict: every stratum min(planned, ${a.coverage.minimums.perStratum}) finished tasks and the visual strata together min(planned, ${a.coverage.minimums.visual}).`, '');
    out.push(table(['stratum', 'planned', 'finished'], Object.entries(a.coverage.byStratum).map(([stratum, v]) => [stratum, String(v.planned), String(v.finished)])), '');
    out.push(a.coverage.unfinished.length ? `Unfinished tasks (${a.coverage.unfinished.length}): ${a.coverage.unfinished.join(', ')}` : 'No unfinished tasks.', '');
  }
  if (!a.coverage) out.push('## Arm reps', '');
  out.push(table(['arm', 'reps used', 'steps with rows', 'tasks'], a.arms.map(arm => [arm, String(a.repCounts[arm].maxRep), String(a.repCounts[arm].units), String(a.repCounts[arm].tasks)])), '');
  if (a.profile === '4h') out.push(`4-hour profile (preregistration section 14, entry 6): McNemar unit = success only if ALL of that arm's reps succeed; A0 is derived from A1 (${a.a0.derivedFromA1} derived, ${a.a0.emptied} emptied, ${a.a0.ownCalls} own calls because the request bodies differed, ${a.a0.unresolved} unresolved of ${a.a0.rows}); PRODUCT_REFUSED_GATEWAY_CAP rows (request over 262,144 bytes): ${JSON.stringify(a.productRefusedGatewayCap)}.`, '');
  out.push('## Unresolved infrastructure errors (excluded from every denominator)', '');
  out.push(a.infraErrors.total === 0 ? 'None: every model call resolved.' : [`${a.infraErrors.total} rows are still unresolved (${a.infraErrors.planInfra} from a failed shared SOURCE_PLAN). They are not arm failures and are not counted in any rate or comparison below. Rerun with the same RUN_DIR to re-attempt them; stage verdicts that depend on these arms stay INCOMPLETE until then.`, '',
    table(['arm', 'unresolved rows'], Object.entries(a.infraErrors.byArm).map(([arm, n]) => [arm, String(n)])), '', `By HTTP status: ${JSON.stringify(a.infraErrors.byHttpStatus)}; by task: ${JSON.stringify(a.infraErrors.byTask)}`].join('\n'), '');
  out.push('## Per arm and stratum (answerable steps; rep-level trials, first attempt)', '', 'Cells are k/n (rate [Wilson 95%]). Success = ACTION on the GT element with an executable locator, first attempt, no gate required (primary metric). Product-admitted success also needs the arm\'s gates (harness gate codes, Java verdict where scored). Descriptive per stratum; decisions use the paired comparisons below.', '');
  for (const arm of a.arms) {
    out.push(`### ${arm}${arm === 'A0' && a.profile === '4h' ? ' (derived from A1 when the request bodies are byte-identical; EMPTIED when emptied)' : ''}`, '');
    const rows = Object.entries(a.perArmStratum[arm]).map(([stratum, m]) => [stratum, String(m.trials), cell(m.correct), cell(m.executable), cell(m.correctAndExecutable), cell(m.admittedSuccess), cell(m.afterReask), cell(m.clarificationOnAnswerable), cell(m.confidentWrong), String(m.wrongElementActions), `${m.negativesHandled.k}/${m.negativesHandled.n} (conf. wrong ${m.negativeConfidentWrong})`, String(m.equivalentDescendants), `${m.emptied}/${m.modelErrors}`]);
    out.push(table(['stratum', 'trials', 'correct', 'executable', 'success (correct + executable)', 'product-admitted success', 'after re-ask', 'clarification on answerable', 'HZ-1 confident wrong', 'wrong-element ACTIONs (incl. refused)', 'negatives handled', 'click-equivalent descendants (counted in success)', 'emptied / observe, plan or cap failures'], rows), '');
  }

  out.push('## Paired comparisons (correct-and-executable per step, answerable tasks)', '', 'Unit = task step, outcome = majority over reps. McNemar is exact two-sided on discordant units (only-X/only-Y). Sensitivity pairs every rep. Bootstrap = 10,000 task-cluster resamples, seeded, 95% percentile CI of rate(X) - rate(Y).', '');
  out.push(table(['X vs Y', 'units', 'only X / only Y', 'McNemar p', 'all-reps p (b/c)', 'diff [95% CI]', 'rates'], [
    cmpLine('**PRIMARY** S3 vs S2', a.comparisons.primary), cmpLine('S2 vs A1', a.comparisons.s2VsA1), cmpLine('S1 vs A1 (format effect)', a.comparisons.s1VsA1), cmpLine(`S4 vs S3 on ${VISUAL_STRATA.join(' + ')}`, a.comparisons.s4VsS3Visual)]), '');
  out.push('### Sensitivity (reported, never gating): diff [95% CI] (units)', '');
  const variantNames = ['admitted', 'afterReask', 'realSitesOnly', 'heldOutOnly', 'freshSitesOnly', 'strictLocators', 'strictEquality'];
  const sensLabels = { primary: 'S3 vs S2', s2VsA1: 'S2 vs A1', s1VsA1: 'S1 vs A1', s4VsS3Visual: 'S4 vs S3 (visual)' };
  out.push(table(['comparison', ...variantNames], Object.entries(a.sensitivity).map(([name, byVariant]) => [sensLabels[name], ...variantNames.map(v => { const r = byVariant[v]; return r && r.diff !== null ? `${pct(r.diff)} [${pct(r.lo)}, ${pct(r.hi)}] (${r.units})` : '-'; })])), '');
  if (a.tokenRatio?.ratio !== null && a.tokenRatio?.ratio !== undefined) out.push(`Summed prompt-token ratio S1/A1: ${num(a.tokenRatio.ratio, 3)}, 95% cluster-bootstrap CI [${num(a.tokenRatio.lo, 3)}, ${num(a.tokenRatio.hi, 3)}] over ${a.tokenRatio.clusters} tasks.`, '');
  out.push('## Absolute bar', '', `Reference ${pct(ABSOLUTE_BAR)} per step (D-C 90% workflow completion implies 0.97^5 = ${pct(ABSOLUTE_BAR ** 5)}).`, '');
  out.push(table(['arm', 'per-step correct-and-executable', 'implied 5-step completion', '5-step at Wilson lower bound'], a.arms.map(arm => { const b = a.absoluteBar[arm]; return [arm, b ? pct(b.rate) : 'n/a', b ? pct(b.k5) : 'n/a', b ? pct(b.lo5) : 'n/a']; })), '');

  out.push('## Tokens, latency, admission', '', 'Tokens are real Gemini `usageMetadata` (first attempt). Admission: production limits and the gateway cap are per observation; the planned-limits column is per request (every S3 request must pass for Stage 3).', '');
  out.push(table(['arm', 'calls', 'prompt p50', 'prompt p95', 'prompt mean', 'out mean', 'thoughts mean', 'model ms p50/p95', 'observe ms p50/p95', 'obs bytes p50/p95'],
    [...a.arms, 'SP'].filter(arm => a.tokens[arm]).map(arm => { const t = a.tokens[arm]; return [arm, String(t.calls), num(t.promptP50), num(t.promptP95), num(t.promptMean), num(t.outMean), num(t.thoughtsMean), `${num(t.msP50)}/${num(t.msP95)}`, `${num(t.observeMsP50)}/${num(t.observeMsP95)}`, `${num(t.bytesP50)}/${num(t.bytesP95)}`]; })), '');
  out.push(table(['arm', 'observations', 'production limits (A0-S2: nodes/bytes/depth + gateway + translation caps)', 'gateway cap 262,144', 'translation cap 65,536 (wire + 2048)', 'max translation input bytes', 'requests under planned limits (obs <= 40,000 B and body <= 262,144 B)'], a.arms.filter(arm => a.admission[arm]).map(arm => { const m = a.admission[arm]; return [arm, String(m.observations), cell(m.production), cell(m.gateway), cell(m.translation), num(m.maxTranslationInputBytes), cell(m.planned)]; })), '');

  out.push('## Java verdicts (A1, S1, S2, SOURCE_PLAN)', '');
  out.push(a.java.present ? table(['arm', 'ADMITTED', 'REFUSED', 'SCORER_ERROR', 'codes (verdict/stage:code)'], Object.entries(a.java.byArm).map(([arm, v]) => [arm, String(v.ADMITTED), String(v.REFUSED), String(v.SCORER_ERROR), JSON.stringify(v.codes)])) : 'scoring-output.jsonl not present: the Java rules have not been applied.', '');
  if (a.java.unscoredArms.length) out.push(`Arms without Java verdicts: ${a.java.unscoredArms.join(', ')}. Their confident-wrong counts are upper bounds.`, '');

  out.push('## Durability', '', 'One factor at a time per task: 5 baseline contexts (1280x720, en-US, the task\'s cookie choice), then 1 each for viewport 1920x1080, locale en-GB and the opposite cookie choice where the site has a banner. Outcomes: OK, FAIL_CLOSED, WRONG_UNIQUE (HZ-2), VOID.', '');
  const durTable = (head, entries) => table([head, 'OK', 'FAIL_CLOSED', 'WRONG_UNIQUE', 'VOID', 'UNSUPPORTED_SHAPE'], Object.entries(entries).map(([k, v]) => [k, String(v.OK), String(v.FAIL_CLOSED), String(v.WRONG_UNIQUE), String(v.VOID), String(v.UNSUPPORTED_SHAPE)]));
  for (const [name, window] of [['Short-term (<24 h after the run)', a.durability.shortTerm], ['Next day (>=24 h after the run)', a.durability.nextDay]]) {
    out.push(`### ${name}`, '');
    if (window.trials === 0) { out.push('Not run.', ''); continue; }
    out.push(durTable('arm/tier', window.byArmTier), '', durTable('condition', window.byCondition), '', durTable('exactness/positional', window.byExactness), '');
  }
  if (a.hardZeros.hz6) out.push('Engine vs public Playwright (HZ-6): ' + Object.entries(a.hardZeros.hz6).map(([arm, v]) => `${arm} ${v.mismatches}/${v.checked}`).join(', '), '');

  out.push('## Safety', '', table(['check', 'result'], [['leak scan', a.leak ? `${a.leak.hits?.length ?? 0} hits in ${a.leak.scannedFiles} files (${a.leak.canaries} canaries)` : 'not run'], ['mask test', a.safety && a.safety.maskDifferences !== undefined ? `${a.safety.maskDifferences} differences` : 'not run'], ['hostile cases', a.safety?.hostile ? `${a.safety.hostile.passed}/${a.safety.hostile.total}` : 'not run'], ['F1 conformance', a.f1 ? (a.f1.pass ? 'PASS' : 'FAIL') : 'summary not found']]), '');
  if (a.leak?.hits?.length) out.push(table(['file', 'offset', 'kind'], a.leak.hits.slice(0, 30).map(h => [h.file, String(h.offset), h.kind])), '');

  out.push('## Hard zeros', '');
  out.push(table(['hard zero', 'arm', 'count', 'detail'], [
    ...a.arms.map(arm => ['HZ-1 confident wrong (gate-admitted, executable) / COMPLETE', arm, String(a.hardZeros.confidentWrong[arm].count), `${a.hardZeros.wrongElementActions[arm] ?? 0} wrong-element ACTIONs incl. refused; ${a.hardZeros.confidentWrong[arm].keys.slice(0, 5).join(', ') || (a.hardZeros.confidentWrong[arm].unscored ? 'no Java verdicts (upper bound)' : '')}`]),
    ...(a.hardZeros.wrongUnique ? a.arms.map(arm => ['HZ-2 wrong-unique durability', arm, String(a.hardZeros.wrongUnique[arm] ?? 0), `${a.hardZeros.durabilityResolved[arm] ?? 0} resolved trials${(a.hardZeros.durabilityResolved[arm] ?? 0) === 0 ? ' (MISSING)' : ''}`]) : [['HZ-2 wrong-unique durability', '-', 'n/a', 'durability not run']]),
    ['HZ-3 leak', '-', a.hardZeros.leak ? String(a.hardZeros.leak.hits) : 'n/a', a.hardZeros.leakByArm ? `by arm: ${JSON.stringify(a.hardZeros.leakByArm)}; A0/A1 hits are production findings outside gating` : 'not run'], ['HZ-4 mask difference', '-', a.hardZeros.mask ? String(a.hardZeros.mask.differences) : 'n/a', a.hardZeros.mask ? '' : 'not run'],
    ['HZ-5 hostile or injection case not passed', '-', a.hardZeros.hostile || a.hardZeros.injected ? String((a.hardZeros.hostile ? a.hardZeros.hostile.total - a.hardZeros.hostile.passed : 0) + (a.hardZeros.injected ? a.hardZeros.injected.total - a.hardZeros.injected.passed : 0)) : 'n/a', `hostile ${a.hardZeros.hostile ? `${a.hardZeros.hostile.passed}/${a.hardZeros.hostile.total}` : 'not run'}, injected ${a.hardZeros.injected ? `${a.hardZeros.injected.passed}/${a.hardZeros.injected.total}` : 'not run'}`],
    ...(a.hardZeros.hz6 ? Object.entries(a.hardZeros.hz6).map(([arm, v]) => ['HZ-6 engine vs public mismatch', arm, String(v.mismatches), `${v.checked} checked`]) : [['HZ-6 engine vs public mismatch', '-', 'n/a', 'durability engine check not run']]),
    ['F1 conformance (f1-conformance)', '-', a.hardZeros.f1 ? (a.hardZeros.f1.pass ? '0' : '1') : 'n/a', a.hardZeros.f1?.dir ?? 'not found']]), '');

  out.push('## Stage go / no-go (computed)', '', 'GO needs every check true. NO-GO = a check failed. INCOMPLETE = evidence missing (cannot be GO). A hard zero blocks a stage until root-caused and re-run.', '');
  out.push(table(['stage', 'verdict'], a.stages.map(s => [`${s.stage}: ${s.name}`, `**${s.verdict}**`])), '');
  for (const s of a.stages) out.push(`### Stage ${s.stage}: ${s.verdict}`, '', table(['check', 'result', 'detail'], s.checks.map(c => [c.name, c.pass === null ? 'MISSING' : c.pass ? 'pass' : 'FAIL', c.detail])), '');

  out.push('## Method notes', '',
    '- Identity is the CDP backendNodeId; the GT is re-resolved with its own Playwright chain and the step is VOID on a load unless it is unique.',
    '- Primary metric: first attempt, ACTION on the GT element with an executable locator. McNemar unit = (task, step), success = a strict majority of reps (2 of 3), or in the 4-hour profile ALL of the arm\'s reps. Effect and CI: success rate over (task, step, rep), 10,000-resample task-cluster bootstrap, seeded.',
    '- HZ-1: an ACTION on a wrong element (or any ACTION on a negative) that the arm\'s gates admit with an executable locator, at any attempt, or any COMPLETE (gated or not). Every wrong-element ACTION, admitted or refused, is also counted.',
    '- Infrastructure errors (HTTP 429/5xx, connection, timeout, failed shared SOURCE_PLAN) are excluded from every denominator and listed separately; a resumed run re-attempts them. OBSERVE_ERROR, PLAN_INVALID, OVER_CAP and a 200 reply that is not parsable JSON stay in the denominators as failures; EMPTIED (A0) is a failure without a model call.',
    '- Click-like steps (click, press, check, uncheck): a pick inside the GT element with no interactive element between it and the GT is EQUIVALENT_DESCENDANT and counts as correct; ancestors never do. The strictEquality sensitivity row removes that credit.',
    '- Production admission for A1, S1 and S2 excludes the 50 ms collection time limit (they collect with lifted limits); A0 runs under the real limits and carries the real-limit outcome (EMPTIED).',
    '- Next-day durability is measured from the END of the full run (run.json endedAt).',
    '- Leak hits are attributed to the arm whose payload held them (body files via calls.jsonl labels, per-arm jsonl lines by key); unattributed hits are harness-level and block every stage; A0/A1 hits are production findings outside SPK-07 gating.',
    '- Durability skips locators that were already the wrong element at freeze (counted as HZ-1) unless the run used --include-wrong.',
    `- Stage 2: S1 not worse = lower bound of the S1 - A1 CI >= ${NON_INFERIORITY_MARGIN * 100} pp; cheaper = upper bound of the summed prompt-token ratio S1/A1 CI < 1. Stage 4: lower bound above 0 on ${VISUAL_STRATA.join(' + ')}; a positive estimate whose CI includes 0 is inconclusive and a no-go.`,
    '- Positional and non-exact locator flags in the strict-locator sensitivity are heuristics on the locator JSON (nth/first/last, missing exact:true, case-insensitive selector flag).', '');
  return `${out.join('\n')}\n`;
}

export function buildReport(runDir, options = {}) {
  const analysis = analyze(runDir, options);
  let freezeNow = null;
  if (options.verify !== false) { try { freezeNow = verifyFreeze({ p: options.freezePaths ?? freezePaths() }); } catch { freezeNow = null; } }
  return { analysis, markdown: renderReport(analysis, { freezeNow }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const runDir = argv.find(arg => !arg.startsWith('--') && argv[argv.indexOf(arg) - 1]?.startsWith('--') !== true);
  const flag = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  if (!runDir) { console.error('usage: report.mjs RUN_DIR [--out PATH] [--f1 DIR]'); process.exit(64); }
  const out = flag('--out') ?? join(freezePaths().docsDir, 'report.md');
  const { analysis, markdown } = buildReport(runDir, { f1: flag('--f1') });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, markdown);
  writeFileSync(join(resolve(runDir), 'analysis.json'), JSON.stringify(analysis, null, 1));
  console.log(JSON.stringify({ out, stages: analysis.stages.map(s => `${s.stage}:${s.verdict}`) }));
}
