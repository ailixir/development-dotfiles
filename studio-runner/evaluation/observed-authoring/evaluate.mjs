/* global Buffer, structuredClone, fetch, AbortSignal */
// STUDIO-OBS-009 AC-7..AC-10: observed-authoring benchmark harness (preparation half).
//
// This module drives the PUBLIC Studio API only (create draft, start a guided session, poll, clarify,
// finalize once, replay, read the result) and scores each run against an oracle that is independent of
// the model, the learned plan and the runner: the fixture-owned receipts of `pages/server.mjs` (or the
// existing fixtures' own receipt endpoints). It replaces the compile-era `lifecycle.mjs` driver.
//
// What it is NOT: it makes no model call by itself, it holds no provider credential, and a run labelled
// HARNESS_SELF_TEST is never D-C evidence. A D_C run is refused unless the latest entry of the budget
// admission ledger is ADMITTED for exactly this manifest (T0 QA B7). Nothing here converts a call count
// into dollars, and nothing here invents a price or a headroom.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startCorpusPages } from './pages/server.mjs';

export { startCorpusPages };

export const HARNESS_VERSION = '1.0.0';
export const COMPARISON_CLAIM = 'NONE_NO_COMPARISON_TO_20261004';
export const SELF_TEST_LABEL = 'HARNESS_SELF_TEST_NOT_D_C_EVIDENCE';
export const MUTATION_KINDS = ['wrongTarget', 'reversedAssertion', 'droppedSubmit', 'literalSubstitution'];
export const ZERO_FIELDS = ['rs1NonScalarReadGaps', 'authoredEchoUnobservableTargets', 'focusMutationRefusedFills'];
export const FIXTURE_MODES = ['exact', 'regionVisible', 'regionControl', 'mixedVisible'];
export const ADMISSION_STATUSES = [
  'DRAFT', 'ADMISSION_REFUSED_PRICE_UNKNOWN', 'ADMISSION_REFUSED_HEADROOM_UNKNOWN', 'ADMISSION_REFUSED_OVER_ALLOCATION',
  'ADMITTED', 'STOPPED_BUDGET_80', 'STOPPED_HARD_GATE',
];
export const ADMISSION_PURPOSES = ['ac7-benchmark', 'ac8-schema-probe', 'rehearsal'];
const HERE = dirname(fileURLToPath(import.meta.url));
export const OBSERVED_AUTHORING_DIR = HERE;
const SUCCESS_STATES = ['SUCCEEDED', 'FINALIZING', 'PUBLICATION_CONFLICT'];

// ---------------------------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------------------------
export const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');
export const sha256File = (path) => sha256Hex(readFileSync(path));

/** Key-sorted compact JSON, the form every harness digest is taken over. */
export function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonicalJson: non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  throw new Error('canonicalJson: unsupported value');
}

const clone = (value) => structuredClone(value);
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isIso = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/u.test(value);
const nearestRank = (sorted, p) => (sorted.length === 0 ? null : sorted[Math.ceil(sorted.length * p) - 1]);
const ceilRate = (n, pct) => Math.ceil((n * pct) / 100 - 1e-9);

// ---------------------------------------------------------------------------------------------
// Gate arithmetic (adopted PO85506e3d / architectb602698e): class-P completion; all-class hard gates.
// Every number is computed from the frozen prospective corpus, never from successful outcomes.
// ---------------------------------------------------------------------------------------------
export function gateArithmetic(classPCases, repetitions, thresholdPct = 90) {
  const planned = classPCases * repetitions;
  const minCompletions = ceilRate(planned, thresholdPct);
  return { classPCases, repetitions, plannedRuns: planned, thresholdPct, minCompletions, maxFailedRuns: planned - minCompletions };
}

export function sessionPlan(manifest) {
  let sessions = 0;
  let runs = 0;
  for (const entry of manifest.cases) {
    runs += entry.repetitions;
    sessions += entry.repetitions * (entry.modelSessionsPerRepetition ?? 1);
  }
  return { runs, sessions, contingencySessions: Math.ceil(sessions * 1.5) };
}

// ---------------------------------------------------------------------------------------------
// Corpus manifest: validation and freezing
// ---------------------------------------------------------------------------------------------
const ORACLE_KINDS = ['receipts', 'events', 'appSideRead'];
const CASE_CLASSES = ['P', 'F', 'N'];

/** Resolves a manifest-relative path inside the observed-authoring directory (no traversal). */
export function resolveInside(root, relative) {
  const full = resolve(root, relative);
  if (!full.startsWith(`${resolve(root)}/`)) throw new Error(`path escapes the corpus directory: ${relative}`);
  return full;
}

/**
 * Structural and arithmetic validation of the corpus manifest. Returns `{errors, counts, gate}`; an empty
 * `errors` means the manifest may be frozen. With `checkFiles` every pinned sha256 is re-read from disk.
 */
export function validateCorpusManifest(manifest, { root = HERE, repoRoot = null, checkFiles = true } = {}) {
  const errors = [];
  const err = (code, where) => { errors.push(where === undefined ? code : `${code}: ${where}`); };
  if (!isRecord(manifest) || manifest.schemaVersion !== 1) err('MANIFEST_SCHEMA_VERSION');
  if (!isRecord(manifest) || !Array.isArray(manifest.cases)) { err('MANIFEST_CASES_MISSING'); return { errors, counts: null, gate: null }; }
  if (manifest.kind !== 'STUDIO_OBSERVED_AUTHORING_BENCHMARK_MANIFEST') err('MANIFEST_KIND');
  if (manifest.comparisonClaim !== COMPARISON_CLAIM) err('COMPARISON_CLAIM_NOT_NONE');
  if (manifest.cases.length < 20) err('FEWER_THAN_20_WORKFLOWS', String(manifest.cases.length));
  const ids = new Set();
  const counts = { P: 0, F: 0, N: 0, total: 0, blockedExternal: 0, rs1Cases: 0, rs1KnownLocalCases: 0, rs1UnknownStagingCases: 0 };
  const checkPin = (label, pin) => {
    if (!isRecord(pin) || typeof pin.path !== 'string' || !/^[a-f0-9]{64}$/u.test(pin.sha256 ?? '')) { err('PIN_MALFORMED', label); return; }
    if (!checkFiles) return;
    try {
      const base = pin.base === 'repo' ? repoRoot : root;
      if (base === null) { err('PIN_REPO_ROOT_REQUIRED', label); return; }
      if (sha256File(resolveInside(base, pin.path)) !== pin.sha256) err('PIN_HASH_MISMATCH', label);
    } catch { err('PIN_UNREADABLE', label); }
  };
  for (const name of ['evaluator', 'evaluationCli', 'corpusPageServer']) {
    if (manifest.sources?.[name]?.base !== 'repo') err('REQUIRED_CODE_PIN', name);
  }
  for (const [name, source] of Object.entries(manifest.sources ?? {})) checkPin(`sources.${name}`, source);
  for (const entry of manifest.cases) {
    const id = isRecord(entry) && typeof entry.id === 'string' ? entry.id : '<no id>';
    if (ids.has(id)) err('DUPLICATE_CASE_ID', id);
    ids.add(id);
    counts.total += 1;
    if (!CASE_CLASSES.includes(entry.class)) { err('CASE_CLASS', id); continue; }
    counts[entry.class] += 1;
    if (entry.repetitions !== 3) err('REPETITIONS_NOT_3', id);
    const blocked = entry.status === 'EXTERNAL_BLOCKED';
    if (!blocked && entry.status !== 'READY_LOCAL') err('CASE_STATUS', id);
    if (blocked) {
      counts.blockedExternal += 1;
      if (!isRecord(entry.blockedBy) || typeof entry.blockedBy.owner !== 'string' || entry.blockedBy.owner.trim().length === 0) err('BLOCKED_WITHOUT_OWNER', id);
    }
    // B6: independent oracle, declared, with all four mutation controls.
    const oracle = entry.oracle;
    if (!isRecord(oracle) || !ORACLE_KINDS.includes(oracle.kind)) err('ORACLE_KIND_NOT_INDEPENDENT', id);
    else {
      if (!Array.isArray(oracle.independentOf) || !['model', 'learned-plan', 'runner'].every((x) => oracle.independentOf.includes(x))) err('ORACLE_INDEPENDENCE_NOT_DECLARED', id);
      if (!Array.isArray(oracle.mutationControls) || !MUTATION_KINDS.every((x) => oracle.mutationControls.includes(x))) err('ORACLE_MUTATION_CONTROLS_MISSING', id);
      if (entry.class !== 'P' && oracle.noSideEffect !== true) err('NON_P_ORACLE_MUST_EXPECT_NO_SIDE_EFFECT', id);
    }
    // RS-1 (AC-7 obligation a): explicit on every case, [] written explicitly.
    const rs1 = entry.rs1;
    if (rs1?.state === 'UNKNOWN_UNTIL_STAGING_PAGES_ARE_READ' && (!blocked || rs1.isRs1Case !== null)) err('RS1_UNKNOWN_INSPECTION', id);
    if (!isRecord(rs1) || !Array.isArray(rs1.valueLocations)) err('RS1_MARK_MISSING', id);
    else if (rs1.isRs1Case === null) {
      if (!blocked || rs1.state !== 'UNKNOWN_UNTIL_STAGING_PAGES_ARE_READ' || rs1.valueLocations.length !== 0) err('RS1_UNKNOWN_INSPECTION', id);
      else counts.rs1UnknownStagingCases += 1;
    } else if (typeof rs1.isRs1Case !== 'boolean') err('RS1_MARK_MISSING', id);
    else {
      const unreachable = rs1.valueLocations.some((x) => x.reachableByGrant === false);
      if (rs1.isRs1Case !== unreachable || rs1.valueLocations.some((x) => typeof x.elementKind !== 'string' || typeof x.reachableByGrant !== 'boolean')) err('RS1_MARK_INCONSISTENT', id);
      if (!blocked) counts.rs1KnownLocalCases += 1;
      if (rs1.isRs1Case) counts.rs1Cases += 1;
    }
    // B5: guided-dataflow fixtures declare their mode; `exact` is the RS-1 shape and never class P.
    const fixture = entry.fixture;
    if (!isRecord(fixture) || typeof fixture.kind !== 'string') err('FIXTURE_MISSING', id);
    else if (typeof fixture.server === 'string' && fixture.server.includes('guided-dataflow')) {
      if (!FIXTURE_MODES.includes(fixture.mode)) err('FIXTURE_MODE_UNDECLARED', id);
      else if (fixture.mode === 'exact' && entry.class === 'P') err('EXACT_MODE_CASE_IN_CLASS_P', id);
    }
    // B1: ported cases carry a fidelity record, nothing invented, no comparison.
    if (entry.block === 'ported') {
      const port = entry.portRecord;
      if (!isRecord(port)) err('PORT_RECORD_MISSING', id);
      else {
        if (port.comparisonClaim !== COMPARISON_CLAIM) err('PORT_COMPARISON_CLAIM', id);
        if (!Array.isArray(port.invented) || port.invented.length !== 0) err('PORT_INVENTED_NOT_EMPTY', id);
        if (!isRecord(port.knownFromRecord) || !isRecord(port.knownFromRecord.resultsJsonl) || port.knownFromRecord.resultsJsonl.sha256 !== manifest.sources?.resultsJsonl?.sha256) err('PORT_RECORD_NOT_PINNED', id);
        if (!Array.isArray(port.reauthored) || port.reauthored.length === 0) err('PORT_REAUTHORED_EMPTY', id);
      }
    }
    // Pinned artifacts.
    const pins = [];
    if (entry.stepText === null) { if (!blocked) err('STEP_TEXT_MISSING', id); }
    else pins.push(['stepText', entry.stepText]);
    if (entry.expectedOutcome === null || entry.expectedOutcome === undefined) { if (!blocked) err('EXPECTED_OUTCOME_MISSING', id); }
    else pins.push(['expectedOutcome', entry.expectedOutcome]);
    if (!Array.isArray(entry.pages)) err('PAGES_NOT_DECLARED', id);
    else {
      if (entry.pages.length === 0 && entry.fixture?.kind === 'corpus-pages' && typeof entry.pagesReason !== 'string') err('NO_PAGES_WITHOUT_REASON', id);
      entry.pages.forEach((page, i) => { pins.push([`pages[${String(i)}]`, page]); });
    }
    if (isRecord(fixture) && fixture.serverPin !== undefined) pins.push(['fixture.serverPin', fixture.serverPin]);
    for (const [label, pin] of pins) checkPin(`${id} ${label}`, pin);
    if (checkFiles && entry.expectedOutcome && !blocked) {
      try {
        const expected = JSON.parse(readFileSync(resolveInside(root, entry.expectedOutcome.path), 'utf8'));
        if (expected.class !== entry.class) err('EXPECTED_OUTCOME_CLASS_MISMATCH', id);
        if (entry.class !== 'P') {
          const phases = Object.values(expected.receipts?.phases ?? {});
          if (!phases.every((phase) => Array.isArray(phase.actions) && phase.actions.length === 0)) err('NON_P_EXPECTS_ACTIONS', id);
          if (expected.session?.published !== false) err('NON_P_EXPECTS_PUBLISH', id);
        }
      } catch { err('EXPECTED_OUTCOME_UNREADABLE', id); }
    }
  }
  const gate = gateArithmetic(counts.P, 3, manifest.gate?.completionThresholdPct ?? 90);
  if (manifest.gate?.classPCases !== gate.classPCases || manifest.gate?.plannedRuns !== gate.plannedRuns
      || manifest.gate?.minCompletions !== gate.minCompletions || manifest.gate?.maxFailedRuns !== gate.maxFailedRuns) err('GATE_ARITHMETIC_NOT_COMPUTED_FROM_CLASSES');
  const plan = sessionPlan(manifest);
  if (manifest.sessionPlan?.sessions !== plan.sessions || manifest.sessionPlan?.contingencySessions !== plan.contingencySessions) err('SESSION_PLAN_MISMATCH');
  if (manifest.manifestFrozenAt !== null) {
    if (!isIso(manifest.manifestFrozenAt)) err('FROZEN_AT_NOT_ISO');
    if (manifest.manifestSha256 !== manifestDigest(manifest)) err('MANIFEST_SHA256_MISMATCH');
  } else if (manifest.manifestSha256 !== null) err('MANIFEST_SHA256_WITHOUT_FREEZE');
  return { errors, counts, gate, plan };
}

/** sha256 over the canonical manifest with `manifestSha256` blanked, so the digest can live inside it. */
export function manifestDigest(manifest) {
  return sha256Hex(canonicalJson({ ...manifest, manifestSha256: null }));
}

/** Fills every pinned sha256 from disk, stamps `manifestFrozenAt` and `manifestSha256`. */
export function freezeManifest(path, { now = new Date(), root = HERE, repoRoot = null } = {}) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const pin = (entry) => {
    const base = entry.base === 'repo' ? repoRoot : root;
    if (base === null) throw new Error('repoRoot is required for a repo-based pin');
    entry.sha256 = sha256File(resolveInside(base, entry.path));
  };
  for (const source of Object.values(manifest.sources ?? {})) pin(source);
  for (const entry of manifest.cases) {
    if (entry.stepText) pin(entry.stepText);
    if (entry.expectedOutcome) pin(entry.expectedOutcome);
    for (const page of entry.pages ?? []) pin(page);
    if (entry.fixture?.serverPin) pin(entry.fixture.serverPin);
    if (entry.portRecord) entry.portRecord.knownFromRecord.resultsJsonl.sha256 = manifest.sources.resultsJsonl.sha256;
  }
  manifest.gate = { ...manifest.gate, ...gateArithmetic(manifest.cases.filter((c) => c.class === 'P').length, 3, manifest.gate?.completionThresholdPct ?? 90) };
  manifest.sessionPlan = sessionPlan(manifest);
  manifest.manifestFrozenAt = now.toISOString();
  manifest.manifestSha256 = null;
  manifest.manifestSha256 = manifestDigest(manifest);
  writeFileSync(`${path}.next`, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(`${path}.next`, path);
  return manifest;
}

export function loadManifest(path = join(HERE, 'manifest.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ---------------------------------------------------------------------------------------------
// The independent outcome oracle (B6) and its mutation controls (AC-9)
// ---------------------------------------------------------------------------------------------
const fill = (template, vars) => {
  if (typeof template !== 'string') return template;
  return template.replace(/\$\{([A-Za-z][A-Za-z0-9]*)\}/gu, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
};
const fillFields = (fields, vars) => Object.fromEntries(Object.entries(fields ?? {}).map(([k, v]) => [k, fill(v, vars)]));
const sameAction = (want, got) => {
  if (want.type !== got.type) return false;
  const fields = fillFields(want.fields, {});
  return Object.entries(fields).every(([k, v]) => got[k] === v) && Object.keys(got).filter((k) => !['type', 'seq'].includes(k)).length === Object.keys(fields).length;
};

/**
 * Scores one run's observation against the case's expected outcome.
 * `observed = {session:{terminal, observedStates[], published, failureCode, failedStepNumber, clarifications},
 *              receipts:{phases:{<phase>:{actions[], views[]}}}, incremental?}`.
 * An action is `{type, ...fields}`; a view is a page name. `falseSuccess` is the hard-gate input: the
 * system claims success (or acts / publishes on a class F or N case) while the oracle disagrees.
 */
export function evaluateOutcome(expected, observed, vars = {}) {
  const failures = [];
  const want = expected?.session;
  const got = observed?.session;
  if (!isRecord(expected) || !isRecord(want) || !isRecord(got) || !isRecord(observed?.receipts?.phases)) {
    return { correct: false, falseSuccess: false, failures: ['invalid-oracle-input'] };
  }
  if (!Array.isArray(want.terminal) || !want.terminal.includes(got.terminal)) failures.push('session-terminal');
  if (got.published !== want.published) failures.push('session-published');
  if (want.failureCodes && !want.failureCodes.includes(got.failureCode)) failures.push('failure-code');
  if (want.failedStepNumber !== undefined && got.failedStepNumber !== want.failedStepNumber) failures.push('failed-step');
  if (typeof want.clarifications === 'number' && got.clarifications !== want.clarifications) failures.push('clarifications');
  for (const state of want.mustObserve ?? []) if (!(got.observedStates ?? []).includes(state)) failures.push(`must-observe-${state}`);
  const allowedViews = new Set(expected.receipts.views?.allowed ?? []);
  const requiredViews = expected.receipts.views?.required ?? [];
  // Finalization adds zero receipts for every case (protocol PR-1), so an observed finalize phase defaults to no actions.
  const phases = { finalize: { actions: [] }, ...expected.receipts.phases };
  for (const [phase, spec] of Object.entries(phases)) {
    const seen = observed.receipts.phases[phase];
    if (!isRecord(seen)) { if (phase !== 'finalize') failures.push(`phase-missing-${phase}`); continue; }
    const wantActions = spec.actions.map((a) => ({ type: a.type, fields: fillFields(a.fields, vars) }));
    const gotActions = seen.actions ?? [];
    if (wantActions.length !== gotActions.length || !wantActions.every((a, i) => sameAction(a, gotActions[i]))) failures.push(`actions-${phase}`);
  }
  for (const phase of Object.keys(observed.receipts.phases)) if (!(phase in phases)) failures.push(`unexpected-phase-${phase}`);
  const viewed = Object.values(observed.receipts.phases).flatMap((p) => p.views ?? []);
  for (const page of requiredViews) if (!viewed.includes(page)) failures.push(`view-required-${page}`);
  if (viewed.some((page) => !allowedViews.has(page))) failures.push('view-unlisted-page');
  const incremental = expected.incremental;
  if (incremental !== undefined) {
    const seen = observed.incremental;
    if (!isRecord(seen)) failures.push('incremental-missing');
    else {
      for (const field of ['prefixLearnedSteps', 'prefixReusedSteps', 'finalizeModelCalls']) {
        if (seen[field] !== incremental[field]) failures.push(`incremental-${field}`);
      }
      if (seen.relearnedFromStepNumber !== incremental.relearnedFromStepNumber || seen.relearnedThroughStepNumber !== incremental.relearnedThroughStepNumber) failures.push('incremental-relearned-range');
    }
  }
  const acted = Object.values(observed.receipts.phases).some((p) => (p.actions ?? []).length > 0);
  const claimsSuccess = SUCCESS_STATES.includes(got.terminal) || got.published === true;
  const falseSuccess = failures.length > 0 && (claimsSuccess || (expected.class !== 'P' && acted));
  return { correct: failures.length === 0, falseSuccess, failures };
}

/** The observation a perfect system would produce. Used ONLY for oracle positive/mutation controls. */
export function idealObservation(expected, vars = {}) {
  const phases = {};
  for (const [phase, spec] of Object.entries(expected.receipts.phases)) {
    phases[phase] = { actions: spec.actions.map((a) => ({ type: a.type, ...fillFields(a.fields, vars) })), views: [] };
  }
  const first = Object.keys(phases)[0];
  if (first !== undefined) phases[first].views = [...(expected.receipts.views?.required ?? [])];
  const want = expected.session;
  const terminal = want.terminal[0];
  const observed = {
    session: {
      terminal, observedStates: [...new Set([...(want.mustObserve ?? []), terminal])], published: want.published,
      failureCode: want.failureCodes ? want.failureCodes[0] : null, failedStepNumber: want.failedStepNumber ?? null,
      clarifications: typeof want.clarifications === 'number' ? want.clarifications : 0,
    },
    receipts: { phases },
  };
  if (expected.incremental !== undefined) observed.incremental = { ...expected.incremental };
  return observed;
}

/** One injected defect (AC-9): returns `{applicable, observed}`. */
export function mutateObservation(kind, observed, expected) {
  const out = clone(observed);
  const phaseNames = Object.keys(out.receipts.phases);
  const withActions = phaseNames.filter((p) => out.receipts.phases[p].actions.length > 0);
  if (kind === 'wrongTarget') {
    const phase = withActions[0];
    if (phase === undefined) out.receipts.phases[phaseNames[0]].actions.push({ type: 'click.target', target: 'WRONG-TARGET' });
    else {
      const action = out.receipts.phases[phase].actions[0];
      const key = Object.keys(action).find((k) => typeof action[k] === 'string' && k !== 'type' && k !== 'seq');
      if (key === undefined) action.type = `${action.type}x`;
      else action[key] = 'WRONG-TARGET';
    }
    return { applicable: true, observed: out };
  }
  if (kind === 'reversedAssertion') {
    const claimsSuccess = out.session.terminal === 'SUCCEEDED';
    out.session.terminal = claimsSuccess ? 'FAILED' : 'SUCCEEDED';
    out.session.published = !claimsSuccess;
    out.session.failureCode = claimsSuccess ? 'ASSERTION_FAILED' : null;
    out.session.failedStepNumber = claimsSuccess ? 2 : null;
    return { applicable: true, observed: out };
  }
  if (kind === 'droppedSubmit') {
    const phase = [...withActions].reverse()[0];
    if (phase !== undefined) { out.receipts.phases[phase].actions.pop(); return { applicable: true, observed: out }; }
    const required = expected.receipts.views?.required ?? [];
    if (required.length === 0) return { applicable: false, observed: out };
    for (const name of phaseNames) out.receipts.phases[name].views = out.receipts.phases[name].views.filter((v) => v !== required[0]);
    return { applicable: true, observed: out };
  }
  if (kind === 'literalSubstitution') {
    const phase = withActions[0];
    if (phase === undefined) return { applicable: false, observed: out };
    const action = out.receipts.phases[phase].actions[0];
    const key = Object.keys(action).find((k) => typeof action[k] === 'string' && k !== 'type' && k !== 'seq');
    if (key === undefined) return { applicable: false, observed: out };
    action[key] = `${action[key]}-substituted`;
    return { applicable: true, observed: out };
  }
  throw new Error(`unknown mutation: ${kind}`);
}

/** Runs the positive control and the four mutants against one expected outcome. */
export function oracleMutationControl(expected, vars = {}) {
  const good = idealObservation(expected, vars);
  const positive = evaluateOutcome(expected, good, vars);
  const mutants = {};
  for (const kind of MUTATION_KINDS) {
    const { applicable, observed } = mutateObservation(kind, good, expected);
    if (!applicable) { mutants[kind] = { applicable: false, rejected: null }; continue; }
    const verdict = evaluateOutcome(expected, observed, vars);
    mutants[kind] = { applicable: true, rejected: !verdict.correct, failures: verdict.failures };
  }
  const applicable = Object.values(mutants).filter((m) => m.applicable);
  return { positiveAccepted: positive.correct, mutants, applicableMutants: applicable.length, ok: positive.correct && applicable.length >= 2 && applicable.every((m) => m.rejected === true) };
}

/** AC-9 isolation: two concurrent sessions that used the same secret id each see only their own value. */
export function checkIsolation(sessions) {
  const failures = [];
  const values = sessions.map((s) => s.ownValue);
  if (new Set(values).size !== values.length) failures.push('own-values-not-distinct');
  for (const session of sessions) {
    for (const other of sessions) {
      if (other === session) continue;
      if (session.observedValues.includes(other.ownValue)) failures.push(`cross-read:${session.csiId}<-${other.csiId}`);
    }
    if (!session.observedValues.every((v) => v === session.ownValue)) failures.push(`foreign-value:${session.csiId}`);
  }
  return { isolated: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------------------------
// AC-10 canary scan (local half): the findings never carry the canary text
// ---------------------------------------------------------------------------------------------
const variantsOf = (canary) => [...new Set([
  canary, JSON.stringify(canary).slice(1, -1), encodeURIComponent(canary), Buffer.from(canary, 'utf8').toString('base64'),
  Buffer.from(canary, 'utf8').toString('base64url'), Buffer.from(canary, 'utf8').toString('hex'),
])].filter((v) => v.length > 0);

/**
 * `texts` maps a label (diagnostics, raw output, manifest, journal, SSE, audit, gateway bytes) to its text.
 * A secret canary found anywhere is a leak. The authored non-secret positive canary must be present in the
 * text that is allowed to carry it (INPUT-POLICY-01 A) when `requirePositive` is set.
 */
export function scanCanaries({ texts, secretCanaries = [], positiveCanary = null, requirePositive = false }) {
  const findings = [];
  secretCanaries.forEach((canary, index) => {
    const variants = variantsOf(canary);
    for (const [label, text] of Object.entries(texts)) {
      const hits = variants.reduce((n, v) => n + (typeof text === 'string' ? text.split(v).length - 1 : 0), 0);
      if (hits > 0) findings.push({ label, canaryIndex: index, canarySha256Prefix: sha256Hex(canary).slice(0, 12), hits });
    }
  });
  const positivePresent = positiveCanary === null ? null : Object.values(texts).some((t) => typeof t === 'string' && t.includes(positiveCanary));
  const positiveOk = !requirePositive || positivePresent === true;
  return { leaks: findings.length, findings, positiveCanaryPresent: positivePresent, positiveCanaryOk: positiveOk, scannedLabels: Object.keys(texts).length };
}

// ---------------------------------------------------------------------------------------------
// Run records
// ---------------------------------------------------------------------------------------------
const SHA256 = /^[a-f0-9]{64}$/u;
const identity = (run) => ({ caseId: run?.caseId ?? null, rep: run?.rep ?? null, attempt: run?.attempt ?? null });
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const causeCoverage = new WeakMap();
const isVerified = (run, field) => isRecord(run) && causeCoverage.get(run)?.has(field) === true;
const unknownAssessments = (run) => Object.fromEntries(ZERO_FIELDS.map((field) => [field, {
  status: 'UNKNOWN', evidenceSha256: null, manifestSha256: run.manifestSha256, ...identity(run),
}]));

function causeErrors(run, field) {
  const errors = [];
  const events = run.details?.[field] ?? [];
  const keys = field === 'rs1NonScalarReadGaps' ? ['eventRef', 'elementKind']
    : field === 'authoredEchoUnobservableTargets' ? ['eventRef', 'step', 'slot'] : ['eventRef', 'step'];
  if (!Array.isArray(events) || events.length !== run[field]) return [`RUN_CAUSE_DETAILS_${field}`];
  const refs = new Set();
  for (const event of events) {
    if (!isRecord(event) || Object.keys(event).some((key) => !keys.includes(key)) || !SHA256.test(event.eventRef ?? '')
      || refs.has(event.eventRef) || (keys.includes('step') && (!Number.isInteger(event.step) || event.step < 1 || event.step > 1000))
      || (keys.includes('slot') && !/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/u.test(event.slot ?? ''))
      || (keys.includes('elementKind') && !/^[a-z][a-z0-9-]{0,31}$/u.test(event.elementKind ?? ''))) errors.push(`RUN_CAUSE_EVENT_${field}`);
    refs.add(event?.eventRef);
  }
  const assessment = run.causeAssessment?.[field];
  if (assessment !== undefined && (!isRecord(assessment) || Object.keys(assessment).some((key) => !['status', 'evidenceSha256', 'manifestSha256', 'caseId', 'rep', 'attempt'].includes(key)) || !['VERIFIED', 'UNKNOWN'].includes(assessment.status)
    || assessment.manifestSha256 !== run.manifestSha256 || !same(identity(assessment), identity(run))
    || (assessment.status === 'VERIFIED' && !SHA256.test(assessment.evidenceSha256 ?? '')) || (assessment.evidenceSha256 !== null && !SHA256.test(assessment.evidenceSha256 ?? '')))) errors.push(`RUN_CAUSE_ASSESSMENT_${field}`);
  if (run.mode === 'D_C' && !isVerified(run, field)) errors.push(`RUN_CAUSE_UNREVIEWED_${field}`);
  return errors;
}

/** Binding checks only: the existing independent QA process must establish the actual review's truth/authority. */
const containsEvents = (events, prior) => {
  const remaining = [...events];
  for (const event of prior) { const index = remaining.findIndex((candidate) => same(candidate, event)); if (index < 0) return false; remaining.splice(index, 1); }
  return true;
};

function projectReviewedInput(manifest, supplied, input) {
  const problems = [];
  const problem = (code) => { problems.push({ caseId: null, rep: null, code }); };
  if (input === null) return { runs: supplied, problems, provenance: { status: 'UNREVIEWED', authenticatesReviewer: false } };
  const rawHash = sha256Hex(input.rawRunsText);
  const original = input.rawRunsText.split(/\r?\n/u).filter((line) => line.trim() !== '').map((line) => JSON.parse(line));
  if (!same(original, supplied)) problem('REVIEW_RAW_POPULATION_OR_IMMUTABLE_FACT_MISMATCH');
  for (const raw of original) for (const code of validateRunRecord(raw, manifest)) {
    if (!code.startsWith('RUN_CAUSE_UNREVIEWED_')) problem(`ORIGINAL_${code}`);
  }
  const overlay = input.overlay;
  if (!isRecord(overlay) || overlay.rawRunsSha256 !== rawHash || !Array.isArray(overlay.annotations)) {
    problem('REVIEW_OVERLAY_HEADER');
    return { runs: original, problems, provenance: { rawRunsSha256: rawHash, status: 'INVALID_OVERLAY', authenticatesReviewer: false } };
  }
  const bound = (ref) => {
    try { return isRecord(ref) && SHA256.test(ref.sha256 ?? '') && typeof ref.fileText === 'string'
      && sha256Hex(ref.fileText) === ref.sha256 && isRecord(ref.value) && same(JSON.parse(ref.fileText), ref.value); } catch { return false; }
  };
  const overlayHash = typeof input.overlayText === 'string' ? sha256Hex(input.overlayText) : null;
  if (overlayHash === null || !same(JSON.parse(input.overlayText), overlay)) problem('REVIEW_OVERLAY_BYTES');
  const reviewByHash = new Map((input.reviews ?? []).filter(bound).map((ref) => [ref.sha256, ref]));
  const adoption = bound(input.adoption) ? input.adoption.value : null;
  const execution = bound(input.execution) ? input.execution.value : null;
  const ledger = bound(input.ledger) ? input.ledger.value : null;
  const intervalLedger = bound(input.intervalLedger) ? input.intervalLedger.value : null;
  // Exact document-byte hashes bind closed references; canonical hashes bind individual raw records/ledger entries.
  let admission = null;
  let originalAdmissionVerified = false;
  let originalIntervalVerified = false;
  if (ledger !== null && execution !== null && verifyLedger(ledger).length === 0 && isIso(execution.startedAt)) {
    const effectiveAdmission = (at, history = ledger) => guardStart({ ledger: { ...history, admissions: history.admissions.filter((entry) => Date.parse(entry.decidedAt) <= Date.parse(at)) },
      manifestSha256: manifest.manifestSha256, now: new Date(at) });
    try {
      admission = effectiveAdmission(execution.startedAt);
      originalAdmissionVerified = execution.kind === 'STUDIO_OBS_009_EXECUTION_RECEIPT' && execution.mode === 'D_C'
        && execution.rawRunsSha256 === rawHash && execution.manifestSha256 === manifest.manifestSha256
        && execution.ledgerSha256 === input.ledger.sha256 && execution.admissionSeq === admission.seq
        && execution.admissionEntrySha256 === entryDigest(admission)
        && isRecord(admission.pinned) && Object.keys(admission.pinned).length > 0
        && execution.configurationSha256 === sha256Hex(canonicalJson({ enforcedCaps: admission.enforcedCaps, pinned: admission.pinned }))
        && typeof admission.priceSource?.source === 'string' && admission.priceSource.source.length > 0
        && Number.isFinite(admission.priceSource.pInPerMTok) && Number.isFinite(admission.priceSource.pOutPerMTok)
        && Number.isFinite(admission.remainingUsdAtAdmission?.value) && typeof admission.remainingUsdAtAdmission?.source === 'string'
        && Number.isFinite(admission.allocationUsd) && admission.allocationUsd > 0 && admission.allocationUsd <= admission.ceilingUsd
        && admission.allocationUsd <= admission.remainingUsdAtAdmission.value && admission.computed?.costBoundUsd <= admission.allocationUsd && typeof admission.admittedBy === 'string' && admission.admittedBy.length > 0
        && original.every((run) => run?.mode === 'D_C' && run.manifestSha256 === manifest.manifestSha256 && isIso(run.runStartedAt)
          && Date.parse(execution.startedAt) <= Date.parse(run.runStartedAt) && Date.parse(admission.admittedAt) < Date.parse(run.runStartedAt)
          && entryDigest(effectiveAdmission(run.runStartedAt)) === entryDigest(admission));
      // The start snapshot is retained. A separately bound original terminal history must extend it and
      // cover the actual original end; an endpoint ADMITTED cannot erase a STOP/re-admission in between.
      originalIntervalVerified = originalAdmissionVerified && intervalLedger !== null && isIso(execution.finishedAt)
        && Date.parse(execution.finishedAt) >= Date.parse(execution.startedAt) && verifyLedger(intervalLedger).length === 0
        && execution.intervalLedgerSha256 === input.intervalLedger.sha256
        && intervalLedger.admissions.length >= ledger.admissions.length
        && ledger.admissions.every((entry, i) => same(entry, intervalLedger.admissions[i]))
        && ledger.admissions.every((entry) => Date.parse(entry.decidedAt) <= Date.parse(execution.startedAt))
        && entryDigest(effectiveAdmission(execution.startedAt, intervalLedger)) === entryDigest(admission)
        && original.length > 0 && original.every((run) => isIso(run.runFinishedAt)
          && Date.parse(run.runStartedAt) <= Date.parse(run.runFinishedAt) && Date.parse(run.runFinishedAt) <= Date.parse(execution.finishedAt)
          && entryDigest(effectiveAdmission(run.runStartedAt, intervalLedger)) === entryDigest(admission))
        && !intervalLedger.admissions.some((entry) => entry.purpose === admission.purpose && entry.seq > admission.seq
          && Date.parse(entry.decidedAt) >= Date.parse(execution.startedAt) && Date.parse(entry.decidedAt) <= Date.parse(execution.finishedAt));
    } catch { originalAdmissionVerified = false; originalIntervalVerified = false; }
  }
  const adopted = adoption !== null && adoption.kind === 'INDEPENDENT_BENCHMARK_CAUSE_ADOPTION' && adoption.status === 'ADOPTED'
    && adoption.rawRunsSha256 === rawHash && adoption.overlaySha256 === overlayHash
    && adoption.manifestSha256 === manifest.manifestSha256 && adoption.executionReceiptSha256 === input.execution?.sha256
    && adoption.ledgerSha256 === input.ledger?.sha256 && adoption.independentOfAuthor === true
    && adoption.originalExecutionAndConfigurationReviewed === true && adoption.originalIntervalHistoryReviewed === true
    && adoption.intervalLedgerSha256 === input.intervalLedger?.sha256 && Array.isArray(adoption.accepted) && originalAdmissionVerified && originalIntervalVerified;
  if (!adopted) problem('REVIEW_ADOPTION_OR_ORIGINAL_ADMISSION_UNBOUND');
  const annotations = new Map();
  for (const annotation of overlay.annotations) {
    const ordinal = annotation?.rawOrdinal;
    if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > original.length || annotations.has(ordinal)) { problem('REVIEW_ORDINAL_MULTISET'); continue; }
    annotations.set(ordinal, annotation);
  }
  if (annotations.size !== original.length) problem('REVIEW_ORDINAL_MULTISET');
  const referencedReviews = [];
  const runs = original.map((raw, i) => {
    if (!isRecord(raw)) return raw;
    const run = clone(raw);
    const annotation = annotations.get(i + 1);
    const verified = new Set();
    causeCoverage.set(run, verified);
    run.causeAssessment = unknownAssessments(run);
    if (!isRecord(annotation) || Object.keys(annotation).some((key) => !['rawOrdinal', 'rawRecordSha256', 'manifestSha256', 'caseId', 'rep', 'attempt', 'causes'].includes(key))
      || annotation.rawRecordSha256 !== sha256Hex(canonicalJson(raw)) || annotation.manifestSha256 !== raw.manifestSha256
      || !same(identity(annotation), identity(raw)) || !isRecord(annotation.causes) || Object.keys(annotation.causes).some((key) => !ZERO_FIELDS.includes(key))) {
      problem('REVIEW_ANNOTATION_IDENTITY_OR_KEYS'); return run;
    }
    for (const field of ZERO_FIELDS) {
      const cause = annotation.causes[field];
      if (!isRecord(cause) || Object.keys(cause).some((key) => !['count', 'events', 'assessment'].includes(key))
        || !Number.isInteger(cause.count) || cause.count < (Number.isInteger(raw[field]) ? raw[field] : 0) || !Array.isArray(cause.events)
        || !Array.isArray(raw.details?.[field] ?? []) || !containsEvents(cause.events, raw.details?.[field] ?? [])) {
        problem(`REVIEW_CAUSE_FACT_REMOVAL_OR_SHAPE_${field}`); continue;
      }
      const candidate = { ...run, [field]: cause.count, details: { ...run.details, [field]: clone(cause.events) } };
      const assessment = cause.assessment;
      const reviewRef = reviewByHash.get(assessment?.evidenceSha256);
      const review = reviewRef?.value;
      const entry = manifest.cases.find((candidate) => candidate.id === raw.caseId);
      const accepted = adopted && adoption.accepted.some((row) => row.rawOrdinal === i + 1 && row.field === field && row.evidenceSha256 === reviewRef?.sha256);
      const eventReviewBound = accepted && Object.keys(assessment ?? {}).every((key) => ['status', 'evidenceSha256', 'manifestSha256', 'caseId', 'rep', 'attempt'].includes(key))
        && same(identity(assessment), identity(raw)) && assessment.manifestSha256 === raw.manifestSha256
        && review?.kind === 'STUDIO_OBS_009_CLOSED_CAUSE_REVIEW' && review.rawRunsSha256 === rawHash
        && review.rawOrdinal === i + 1 && review.rawRecordSha256 === annotation.rawRecordSha256 && review.manifestSha256 === raw.manifestSha256
        && same(identity(review), identity(raw)) && review.field === field
        && SHA256.test(review.scope?.observationEvidenceSha256 ?? '') && ['COMPLETE_REVIEWED_SCOPE', 'PARTIAL_REVIEWED_SCOPE'].includes(review.scope?.justificationCode)
        && entry?.stepText?.sha256 !== null && entry?.stepText?.sha256 !== undefined && review.scope.stepTextSha256 === entry.stepText.sha256
        && review.scope.expectedOutcomeSha256 === entry?.expectedOutcome?.sha256
        && review.scope.valueLocationsSha256 === sha256Hex(canonicalJson(entry?.rs1?.valueLocations ?? [])) && same(review.events, cause.events)
        && causeErrors(candidate, field).every((code) => code.startsWith('RUN_CAUSE_UNREVIEWED_'));
      const unchangedClaim = cause.count === (raw[field] ?? 0) && same(cause.events, raw.details?.[field] ?? []);
      if (!eventReviewBound && !unchangedClaim) { problem(`REVIEW_UNADOPTED_CAUSE_ADDITION_${field}`); continue; }
      run[field] = candidate[field]; run.details = candidate.details;
      if (eventReviewBound) {
        referencedReviews.push(reviewRef.sha256);
        if (assessment.status === 'VERIFIED' && review.scope.complete === true && review.scope.justificationCode === 'COMPLETE_REVIEWED_SCOPE') {
          run.causeAssessment[field] = clone(assessment); verified.add(field);
        }
      }
      // Incomplete scope still keeps confirmed count/events. It cannot acquire VERIFIED from a plausible hash.
    }
    return run;
  });
  const coverageComplete = runs.length > 0 && runs.every((run) => ZERO_FIELDS.every((field) => isVerified(run, field)));
  return { runs, problems, admission, provenance: {
    status: adopted && coverageComplete && problems.length === 0 ? 'BOUND_INDEPENDENT_QA_ADOPTION' : 'NON_ADOPTABLE_OR_PARTIAL_REVIEW', authenticatesReviewer: false,
    boundIndependentAdoption: adopted, coverageComplete,
    rawRunsSha256: rawHash, overlaySha256: overlayHash, adoptionSha256: input.adoption?.sha256 ?? null,
    executionReceiptSha256: input.execution?.sha256 ?? null, ledgerSha256: input.ledger?.sha256 ?? null,
    intervalLedgerSha256: input.intervalLedger?.sha256 ?? null, originalIntervalEnd: execution?.finishedAt ?? null, originalIntervalVerified,
    reviewRecordSha256: [...new Set(referencedReviews)], suppliedReviewRecordSha256: (input.reviews ?? []).map((ref) => ref?.sha256 ?? null), originalAdmissionVerified,
    originalAttempts: original.map((run, i) => ({ rawOrdinal: i + 1, rawRecordSha256: sha256Hex(canonicalJson(run)), manifestSha256: run?.manifestSha256 ?? null, mode: run?.mode ?? null, terminal: run?.session?.terminal ?? null, published: run?.session?.published ?? null, infrastructureExcluded: run?.infrastructureFailure !== null, ...identity(run) })),
    inputFileSha256: input.inputFileSha256 ?? null,
  } };
}

function causeSummary(population, field) {
  const items = population.flatMap((run) => (Array.isArray(run?.details?.[field]) ? run.details[field] : []).map((event, eventOrdinal) => {
    const safe = {};
    if (SHA256.test(event?.eventRef ?? '')) safe.eventRef = event.eventRef;
    if (field === 'rs1NonScalarReadGaps' && /^[a-z][a-z0-9-]{0,31}$/u.test(event?.elementKind ?? '')) safe.elementKind = event.elementKind;
    if (field !== 'rs1NonScalarReadGaps' && Number.isInteger(event?.step) && event.step >= 1 && event.step <= 1000) safe.step = event.step;
    if (field === 'authoredEchoUnobservableTargets' && /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/u.test(event?.slot ?? '')) safe.slot = event.slot;
    const expected = field === 'rs1NonScalarReadGaps' ? 2 : field === 'authoredEchoUnobservableTargets' ? 3 : 2;
    return { ...safe, ...(Object.keys(safe).length !== expected || Object.keys(event ?? {}).length !== expected ? { rejectedDetailOrdinal: eventOrdinal + 1 } : {}), ...identity(run) };
  }));
  const unknownIdentities = population.filter((run) => !isVerified(run, field)).map(identity);
  const confirmedTotal = population.reduce((sum, run) => sum + (Number.isInteger(run?.[field]) ? run[field] : 0), 0);
  return { unit: 'classified-events', confirmedTotal, total: population.length > 0 && unknownIdentities.length === 0 ? confirmedTotal : null,
    runsCounted: population.length, verifiedRuns: population.length - unknownIdentities.length, unknownRuns: unknownIdentities.length,
    items, unknownIdentities, affectedRuns: population.filter((run) => (run?.[field] ?? 0) > 0).map(identity) };
}

const sessionScopeKnown = (run) => run?.learnSessionsComplete === true && Array.isArray(run.learnSessions)
  && (run.learnSessions.length > 0 || (run.sessionId === undefined && run.session === undefined
    && ['modelProposals', 'inputTokens', 'outputTokens'].every((field) => run.usage?.[field] === undefined || run.usage[field] === null || run.usage[field] === 0)));

function chargeSummary(population, price) {
  const sessions = population.flatMap((run) => (Array.isArray(run?.learnSessions) ? run.learnSessions : []).map((session) => ({ ...session, ...identity(run) })));
  const references = new Map();
  for (const session of sessions) references.set(session.sessionId, (references.get(session.sessionId) ?? 0) + 1);
  const duplicateSessionIds = [...references].filter(([, count]) => count > 1).map(([id]) => id);
  const unknownAttempts = population.filter((run) => !sessionScopeKnown(run)
    || (run?.learnSessions ?? []).some((session) => duplicateSessionIds.includes(session.sessionId))).map(identity);
  const metric = (field) => {
    const known = sessions.filter((session) => Number.isInteger(session.usage?.[field]) && session.usage[field] >= 0);
    const knownSubtotal = known.reduce((sum, session) => sum + session.usage[field], 0);
    const complete = population.length > 0 && unknownAttempts.length === 0 && known.length === sessions.length && sessions.every((session) => TERMINAL.includes(session.session?.terminal));
    return { total: complete ? knownSubtotal : null, knownSubtotal, complete, knownSessions: known.length, unknownSessions: sessions.filter((session) => !Number.isInteger(session.usage?.[field]) || session.usage[field] < 0 || !TERMINAL.includes(session.session?.terminal)).length,
      unknownSessionIdentities: sessions.filter((session) => !Number.isInteger(session.usage?.[field]) || session.usage[field] < 0 || !TERMINAL.includes(session.session?.terminal)).map((session) => ({ ...identity(session), phase: session.phase, sessionId: session.sessionId })),
      p50: complete ? nearestRank(known.map((session) => session.usage[field]).sort((a, b) => a - b), 0.5) : null,
      p95: complete ? nearestRank(known.map((session) => session.usage[field]).sort((a, b) => a - b), 0.95) : null };
  };
  const logicalCounterClaims = Object.fromEntries(['modelProposals', 'inputTokens', 'outputTokens'].map((field) => {
    const known = population.filter((run) => Number.isInteger(run?.usage?.[field]) && run.usage[field] >= 0);
    return [field, { knownSubtotal: known.reduce((sum, run) => sum + run.usage[field], 0), knownAttempts: known.length,
      unknownAttemptIdentities: population.filter((run) => !Number.isInteger(run?.usage?.[field]) || run.usage[field] < 0).map(identity), basis: 'supplied-logical-counter-claims-not-session-coverage' }];
  }));
  const protective = sessions.filter((session) => Number.isFinite(session.budgetCharge?.amountUsd) && session.budgetCharge.amountUsd >= 0
    && ['PUBLIC_BUDGET_COUNTERS', 'recorded-reservations', 'reserved-ceiling'].includes(session.budgetCharge.basis));
  const unresolvedCharges = population.flatMap((run) => Array.isArray(run?.details?.unresolvedSessionCharges) ? run.details.unresolvedSessionCharges : [])
    .filter((charge) => Number.isFinite(charge.amountUsd) && charge.amountUsd >= 0 && ['PUBLIC_BUDGET_COUNTERS', 'recorded-reservations', 'reserved-ceiling'].includes(charge.basis));
  const protectiveSubtotal = protective.reduce((sum, session) => sum + session.budgetCharge.amountUsd, 0) + unresolvedCharges.reduce((sum, charge) => sum + charge.amountUsd, 0);
  const protectiveComplete = population.length > 0 && unknownAttempts.length === 0 && protective.length === sessions.length && unresolvedCharges.length === 0;
  const proposals = metric('modelProposals'); const input = metric('inputTokens'); const output = metric('outputTokens');
  const priceKnown = isRecord(price) && Number.isFinite(price.pInPerMTok) && price.pInPerMTok >= 0 && Number.isFinite(price.pOutPerMTok) && price.pOutPerMTok >= 0;
  return { basis: 'PUBLIC_BUDGET_COUNTERS', logicalAttempts: population.length, knownStartedSessions: duplicateSessionIds.length > 0 ? null : sessions.length, knownSessionReferences: sessions.length, duplicateSessionIds, unknownAttempts,
    proposals, input, output, logicalCounterClaims, knownConservativeChargeSubtotalUsd: priceKnown ? (input.knownSubtotal * price.pInPerMTok + output.knownSubtotal * price.pOutPerMTok) / 1_000_000 : null,
    protectiveStopCharges: { knownSubtotalUsd: protectiveSubtotal, totalUsd: protectiveComplete ? protectiveSubtotal : null, complete: protectiveComplete,
      unknownSessions: sessions.length - protective.length, unresolvedPotentialStarts: unresolvedCharges.length, bases: [...new Set([...protective.map((session) => session.budgetCharge.basis), ...unresolvedCharges.map((charge) => charge.basis)])] },
    conservativeChargeUsd: priceKnown && proposals.complete && input.complete && output.complete ? (input.total * price.pInPerMTok + output.total * price.pOutPerMTok) / 1_000_000 : null,
    actualWireCalls: null, actualProviderInputTokens: null, actualProviderOutputTokens: null, actualBilledCostUsd: null,
    actualEvidence: 'UNAVAILABLE: public proposal/reservation counters do not measure provider calls, usage or billed cost' };
}

export function validateRunRecord(run, manifest) {
  const errors = [];
  const err = (code) => { errors.push(code); };
  if (!isRecord(run)) return ['RUN_NOT_OBJECT'];
  const entry = manifest.cases.find((c) => c.id === run.caseId);
  if (entry === undefined) err('RUN_UNKNOWN_CASE');
  if (!Number.isInteger(run.rep) || run.rep < 1 || run.rep > 3) err('RUN_REP');
  if (!Number.isInteger(run.attempt) || run.attempt < 1) err('RUN_ATTEMPT');
  if (!isIso(run.runStartedAt) || !isIso(run.runFinishedAt)) err('RUN_TIMESTAMPS');
  if (manifest.manifestFrozenAt === null || manifest.manifestFrozenAt === undefined) err('MANIFEST_NOT_FROZEN');
  else if (isIso(run.runStartedAt) && Date.parse(run.runStartedAt) < Date.parse(manifest.manifestFrozenAt)) err('RUN_BEFORE_MANIFEST_FREEZE');
  if (run.manifestSha256 !== manifest.manifestSha256) err('RUN_MANIFEST_SHA256');
  for (const field of ZERO_FIELDS) if (!Number.isInteger(run[field]) || run[field] < 0) err(`RUN_ZERO_FIELD_MISSING_${field}`);
  for (const field of ZERO_FIELDS) errors.push(...causeErrors(run, field));
  if (run.learnSessionsComplete === true && !sessionScopeKnown(run)) err('RUN_LEARN_SESSION_COVERAGE');
  if (run.learnSessionsComplete !== undefined && typeof run.learnSessionsComplete !== 'boolean') err('RUN_LEARN_SESSION_COVERAGE');
  if (run.learnSessions !== undefined && (!Array.isArray(run.learnSessions) || run.learnSessions.length > 2
    || new Set(run.learnSessions.map((session) => session.sessionId)).size !== run.learnSessions.length
    || new Set(run.learnSessions.map((session) => session.phase)).size !== run.learnSessions.length
    || run.learnSessions.some((session) => !['base', 'incremental'].includes(session.phase) || typeof session.sessionId !== 'string'
      || (session.budgetCharge !== undefined && (!Number.isFinite(session.budgetCharge.amountUsd) || session.budgetCharge.amountUsd < 0 || !['PUBLIC_BUDGET_COUNTERS', 'recorded-reservations', 'reserved-ceiling'].includes(session.budgetCharge.basis)))
      || session.usage?.basis !== 'PUBLIC_BUDGET_COUNTERS' || ['modelProposals', 'inputTokens', 'outputTokens'].some((field) => session.usage[field] !== null && (!Number.isInteger(session.usage[field]) || session.usage[field] < 0))))) err('RUN_LEARN_SESSIONS');
  if (!['HARNESS_SELF_TEST', 'D_C'].includes(run.mode)) err('RUN_MODE');
  if (run.infrastructureFailure !== null && typeof run.infrastructureFailure !== 'string') err('RUN_INFRA_FIELD');
  if (run.infrastructureFailure === null && !isRecord(run.oracle)) err('RUN_ORACLE_MISSING');
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Scoring and accounting (benchmark.json)
// ---------------------------------------------------------------------------------------------
const isCompletion = (run) => run.infrastructureFailure === null && run.session?.terminal === 'SUCCEEDED' && run.session.published === true
  && (run.session.clarifications ?? 0) === 0 && run.oracle?.correct === true && run.oracle.falseSuccess !== true;

export function buildBenchmark({ manifest, runs: suppliedRuns, mode, generatedAt = new Date().toISOString(), admission = null, price = null, reviewInput = null, root = HERE, repoRoot = repoRootFrom(root) }) {
  const reviewed = projectReviewedInput(manifest, suppliedRuns, reviewInput);
  const runs = reviewed.runs;
  const problems = [...reviewed.problems];
  if (reviewInput !== null && mode === 'D_C') {
    for (const code of validateCorpusManifest(manifest, { root, repoRoot }).errors) problems.push({ caseId: null, rep: null, code: `REVIEW_MANIFEST_INVALID:${code}` });
  }
  if (reviewed.admission !== undefined && reviewed.admission !== null) { admission = reviewed.admission; price = reviewed.provenance.originalAdmissionVerified === true && reviewed.provenance.originalIntervalVerified === true && isRecord(admission.priceSource) ? admission.priceSource : null; }
  const byKey = new Map();
  for (const run of runs) {
    for (const code of validateRunRecord(run, manifest)) problems.push({ caseId: run?.caseId ?? null, rep: run?.rep ?? null, code });
    if (!isRecord(run)) continue;
    if (run.mode !== mode) problems.push({ caseId: run.caseId, rep: run.rep, code: 'RUN_MODE_MISMATCH' });
    const key = `${String(run.caseId)}#${String(run.rep)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(run);
  }
  // "No unreported retries": every earlier attempt must be an infrastructure failure, and attempts are contiguous.
  const credited = [];
  const infraLedger = [];
  for (const attempts of byKey.values()) {
    attempts.sort((a, b) => a.attempt - b.attempt);
    attempts.forEach((run, i) => {
      if (run.attempt !== i + 1) problems.push({ caseId: run.caseId, rep: run.rep, code: 'ATTEMPT_GAP' });
      if (i < attempts.length - 1) {
        if (run.infrastructureFailure === null) problems.push({ caseId: run.caseId, rep: run.rep, code: 'UNREPORTED_RETRY' });
        else infraLedger.push({ caseId: run.caseId, rep: run.rep, attempt: run.attempt, infrastructureFailure: run.infrastructureFailure, rerun: true });
      }
    });
    const last = attempts[attempts.length - 1];
    if (last.infrastructureFailure !== null) infraLedger.push({ caseId: last.caseId, rep: last.rep, attempt: last.attempt, infrastructureFailure: last.infrastructureFailure, rerun: false });
    else credited.push(last);
  }
  const classOf = new Map(manifest.cases.map((c) => [c.id, c.class]));
  const executedCases = new Set(credited.map((r) => r.caseId));
  const blockedUnrun = manifest.cases.filter((c) => c.status === 'EXTERNAL_BLOCKED' && !executedCases.has(c.id)).map((c) => c.id);
  const planned = new Set();
  for (const c of manifest.cases) for (let rep = 1; rep <= c.repetitions; rep += 1) planned.add(`${c.id}#${String(rep)}`);
  const missing = [...planned].filter((k) => !byKey.has(k) || byKey.get(k).every((r) => r.infrastructureFailure !== null)).filter((k) => !blockedUnrun.includes(k.split('#')[0]));
  // Gate (class P only; blocked staging cases that were never run reduce the denominator and make the result partial).
  const pRuns = credited.filter((r) => classOf.get(r.caseId) === 'P');
  const pPlannedAll = manifest.cases.filter((c) => c.class === 'P');
  const pPlannedRunnable = pPlannedAll.filter((c) => !blockedUnrun.includes(c.id));
  const arithmeticRunnable = gateArithmetic(pPlannedRunnable.length, 3, manifest.gate.completionThresholdPct);
  const completions = pRuns.filter(isCompletion).length;
  const failedRuns = pRuns.length - completions;
  const rate = pRuns.length === 0 ? null : completions / pRuns.length;
  // An excluded earlier attempt can still hit a hard gate; retries never erase observed facts.
  const falsePasses = runs.filter((r) => r?.oracle?.falseSuccess === true);
  const leaks = runs.filter((r) => (r?.secretOrPiiLeak ?? 0) > 0);
  const unknownCanaryRuns = runs.filter((run) => !completeCanaryObservation(run));
  const canaryObservation = { scope: 'LOCAL_CONSUMED_PUBLIC_HTTP_AND_DECLARED_TEXTS_ONLY', complete: runs.length > 0 && unknownCanaryRuns.length === 0,
    knownLeakRuns: leaks.length, totalLeakRuns: runs.length > 0 && unknownCanaryRuns.length === 0 ? leaks.length : null,
    unknownRuns: unknownCanaryRuns.map(identity), globalWireComplete: null };
  const scopes = { gateP: pRuns, creditedAllClasses: credited, allAttempts: runs };
  const accounting = Object.fromEntries(ZERO_FIELDS.map((field) => [field, Object.fromEntries(
    Object.entries(scopes).map(([scope, population]) => [scope, { ...causeSummary(population, field),
      ...(scope === 'gateP' ? { fullPlannedRuns: pPlannedAll.length * 3, runnablePlannedRuns: arithmeticRunnable.plannedRuns, missingRuns: missing, blockedUnrun } : {}) }]),
  )]));
  const charges = Object.fromEntries(Object.entries(scopes).map(([scope, population]) => [scope, chargeSummary(population, price)]));
  const reasons = [];
  let verdict;
  if (mode !== 'D_C') { verdict = 'NOT_EVIDENCE'; reasons.push('mode is HARNESS_SELF_TEST: a scripted provider is never D-C evidence'); }
  else if (problems.length > 0) { verdict = 'INVALID'; reasons.push('run records failed validation'); }
  else if (falsePasses.length > 0 || leaks.length > 0) { verdict = 'GATE_FAIL'; reasons.push('hard gate hit (false pass or secret/PII leak)'); }
  else if (unknownCanaryRuns.length > 0) { verdict = 'INCOMPLETE'; reasons.push('local canary observation is unavailable'); for (const run of unknownCanaryRuns) problems.push({ caseId: run?.caseId ?? null, rep: run?.rep ?? null, code: 'RUN_CANARY_OBSERVATION_UNAVAILABLE' }); }
  else if (missing.length > 0 || pRuns.length < arithmeticRunnable.plannedRuns) { verdict = 'INCOMPLETE'; reasons.push('planned runs are missing'); }
  else if (completions < arithmeticRunnable.minCompletions) { verdict = 'GATE_FAIL'; reasons.push(`completions ${String(completions)} < ${String(arithmeticRunnable.minCompletions)}`); }
  else if (blockedUnrun.length > 0) { verdict = 'PARTIAL'; reasons.push(`externally blocked cases unrun: ${blockedUnrun.join(', ')}`); }
  else verdict = 'GATE_PASS';
  const durations = credited.map((r) => Date.parse(r.runFinishedAt) - Date.parse(r.runStartedAt)).filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  const incrementalRuns = credited.filter((r) => manifest.cases.find((c) => c.id === r.caseId)?.block === 'incremental');
  return {
    schemaVersion: 2,
    kind: 'STUDIO_OBS_009_BENCHMARK',
    label: mode === 'D_C' ? 'D_C_CANDIDATE' : SELF_TEST_LABEL,
    harnessVersion: HARNESS_VERSION,
    generatedAt,
    manifestSha256: manifest.manifestSha256,
    comparisonClaim: COMPARISON_CLAIM,
    admissionStatus: admission === null ? null : admission.status,
    reviewProvenance: reviewed.provenance,
    evidenceStatus: 'COMPLETION_SUBGATE_ONLY_NOT_D_C_ACCEPTANCE',
    requiredActualEvidence: ['provider-wire-calls', 'provider-usage-and-billed-cost', 'MODEL-SIZING-section10', 'external-staging-security-human-proofs'],
    corpusInspection: {
      knownLocalCaseIds: manifest.cases.filter((c) => c.status === 'READY_LOCAL' && typeof c.rs1?.isRs1Case === 'boolean').map((c) => c.id),
      confirmedRs1CaseIds: manifest.cases.filter((c) => c.rs1?.isRs1Case === true).map((c) => c.id),
      unknownStagingCaseIds: manifest.cases.filter((c) => c.rs1?.isRs1Case === null || c.rs1?.state === 'UNKNOWN_UNTIL_STAGING_PAGES_ARE_READ').map((c) => c.id),
      knownLocalCount: manifest.cases.filter((c) => c.status === 'READY_LOCAL' && typeof c.rs1?.isRs1Case === 'boolean').length,
      confirmedRs1CaseCount: manifest.cases.filter((c) => c.rs1?.isRs1Case === true).length,
      unknownStagingCount: manifest.cases.filter((c) => c.rs1?.isRs1Case === null || c.rs1?.state === 'UNKNOWN_UNTIL_STAGING_PAGES_ARE_READ').length,
      globalRs1Total: manifest.cases.some((c) => c.rs1?.isRs1Case === null || c.rs1?.state === 'UNKNOWN_UNTIL_STAGING_PAGES_ARE_READ') ? null : manifest.cases.filter((c) => c.rs1?.isRs1Case === true).length,
      disclosure: 'D3 and both incremental cases use mixedVisible by corpus design; exact non-scalar reads are not exercised. Uninspected staging is unknown, not zero.',
    },
    gate: {
      scope: 'COMPLETION_AND_HARD_FACT_SUBGATE_ONLY', verdict, reasons,
      classP: {
        casesPlanned: pPlannedAll.length, casesRunnable: pPlannedRunnable.length, runsCredited: pRuns.length, completions, failedRuns,
        rate, thresholdPct: manifest.gate.completionThresholdPct,
        fullArithmetic: gateArithmetic(pPlannedAll.length, 3, manifest.gate.completionThresholdPct), runnableArithmetic: arithmeticRunnable,
        denominatorDefinition: 'class P runs, final non-infrastructure attempt, clarification-free completion with a correct independent oracle (adopted PO85506e3d / architectb602698e)',
      },
      blockedUnrun,
    },
    hardGates: { falsePasses: falsePasses.length, secretOrPiiLeaks: leaks.length, falsePassRuns: falsePasses.map((r) => ({ caseId: r.caseId, rep: r.rep, attempt: r.attempt })), leakRuns: leaks.map((r) => ({ caseId: r.caseId, rep: r.rep, attempt: r.attempt })) },
    classFN: {
      runs: credited.filter((r) => classOf.get(r.caseId) !== 'P').length,
      correct: credited.filter((r) => classOf.get(r.caseId) !== 'P' && r.oracle?.correct === true).length,
      denominatorDefinition: 'class F/N runs; reported, not gated except through the false-pass hard gate',
    },
    denominatorLedger: { plannedRuns: planned.size, creditedRuns: credited.length, infrastructureFailures: infraLedger, missingRuns: missing, blockedUnrunCases: blockedUnrun, problems },
    accounting,
    canaryObservation,
    charges,
    latency: { basis: 'known-valid-duration-samples', missingSamples: credited.length - durations.length, p50Ms: nearestRank(durations, 0.5), p95Ms: nearestRank(durations, 0.95), samples: durations.length, denominator: credited.length },
    modelCalls: { total: null, p50: null, p95: null, samples: 0, denominator: credited.length, basis: 'UNAVAILABLE: proposals are not actual provider wire calls', proposals: charges.creditedAllClasses.proposals },
    tokens: { input: charges.creditedAllClasses.input.total, output: charges.creditedAllClasses.output.total, denominator: credited.length, complete: charges.creditedAllClasses.input.complete && charges.creditedAllClasses.output.complete, basis: 'PUBLIC_BUDGET_COUNTERS' },
    costUsd: { total: null, basis: 'UNAVAILABLE: actual provider usage/billed cost not supplied', conservativeChargeUsd: charges.creditedAllClasses.conservativeChargeUsd, denominator: credited.length },
    incremental: incrementalRuns.map((r) => ({ caseId: r.caseId, rep: r.rep, prefixLearnedSteps: r.incremental?.prefixLearnedSteps ?? null, prefixReusedSteps: r.incremental?.prefixReusedSteps ?? null, relearnedFromStepNumber: r.incremental?.relearnedFromStepNumber ?? null, oracleCorrect: r.oracle?.correct ?? null })),
  };
}

/** Replay stability (consensus plan s11): >= 98 percent completion over 100 stable-fixture replays, one artifact hash. */
export function scoreReplayStability({ replays, required = 100, thresholdPct = 98, label = SELF_TEST_LABEL }) {
  const completed = replays.filter((r) => r.ok === true);
  const hashes = new Set(completed.map((r) => r.artifactHash));
  const rate = replays.length === 0 ? null : completed.length / required;
  const pass = replays.length === required && rate !== null && rate * 100 >= thresholdPct && hashes.size === 1;
  return { label, required, executed: replays.length, completed: completed.length, completionRate: rate, thresholdPct, distinctArtifactHashes: hashes.size, pass, verdict: label === SELF_TEST_LABEL ? 'NOT_EVIDENCE' : pass ? 'PASS' : 'FAIL' };
}

// ---------------------------------------------------------------------------------------------
// B7: proposals per session, measured from the fixture-provider evidence at the ceilings that ran
// ---------------------------------------------------------------------------------------------
/**
 * `documents` are parsed `model-budget-evidence-*-final.json` files. They record the declared fixture
 * ceiling per call and the session counters. This function can REFUTE the proposals-per-session assumption
 * (24 at the MODEL-SIZING totals; 7 at the earlier totals, which a caller can still pass as `production`)
 * and can never confirm it: a scripted provider shows what the orchestrator asks for, not what a real model
 * needs (retries, clarifications).
 */
export function measureProposals(documents, production = { perCallOutputTokens: 4096, outputTotal: 98304, inputTotal: 786432, csiDailyOutput: 640000, csiDailyInput: 5242880 }) {
  const maxProposals = Math.floor(production.outputTotal / production.perCallOutputTokens);
  const sessions = [];
  for (const doc of documents) {
    for (const session of doc.sessions) {
      const proposals = session.actualCounters.modelProposals;
      const reservedOutputAtFixture = session.actualCounters.modelOutputTokens;
      const reservedAtProduction = proposals * production.perCallOutputTokens;
      sessions.push({
        label: doc.label ?? null, sessionOrdinal: session.sessionOrdinal, fixtureCeilingPerCall: doc.declaredFixtureCeiling, proposals,
        reservedOutputAtFixtureCeiling: reservedOutputAtFixture, reservedInputTokens: session.actualCounters.modelInputTokens,
        productionPerCallOutput: production.perCallOutputTokens, reservedOutputAtProductionCeiling: reservedAtProduction,
        exceedsProductionOutputTotal: reservedAtProduction > production.outputTotal,
        productionOutputShare: reservedAtProduction / production.outputTotal,
        inputShareOfTotal: session.actualCounters.modelInputTokens / production.inputTotal,
        fullSessionsPerCsiDayOutput: Math.floor(production.csiDailyOutput / Math.max(1, reservedAtProduction)),
        fullSessionsPerCsiDayInput: Math.floor(production.csiDailyInput / Math.max(1, session.actualCounters.modelInputTokens)),
      });
    }
  }
  const peak = sessions.reduce((n, s) => Math.max(n, s.proposals), 0);
  const refuted = sessions.some((s) => s.proposals > maxProposals);
  return {
    kind: 'B7_PROPOSAL_MEASUREMENT', label: SELF_TEST_LABEL, provider: 'local fixture provider (scripted gateway), no model call',
    production, maxProposalsAtProductionCeilings: maxProposals, sessions, peakProposals: peak,
    verdict: refuted ? 'REFUTES_PROPOSALS_PER_SESSION_ASSUMPTION' : 'NOT_REFUTED_LOCALLY_NOT_CONFIRMED',
    caveat: 'A local run can refute the assumption but never confirm it. The fixture ran at the declared per-call ceiling, so the production-ceiling reservation is derived arithmetic ([I]), not a run at 4096.',
  };
}

// ---------------------------------------------------------------------------------------------
// Budget admission (B7/B8): append-only ledger, start guard, stop rule
// ---------------------------------------------------------------------------------------------
export class AdmissionError extends Error {
  constructor(code) { super(code); this.name = 'AdmissionError'; this.code = code; }
}

export function emptyLedger() {
  return { schemaVersion: 1, kind: 'BUDGET_ADMISSION_LEDGER', appendOnly: true, admissions: [] };
}

const entryDigest = (entry) => sha256Hex(canonicalJson(entry));

/** Chain and legality check: every entry names the digest of its predecessor, so an edit is detectable. */
export function verifyLedger(ledger) {
  const errors = [];
  if (!isRecord(ledger) || ledger.schemaVersion !== 1 || !Array.isArray(ledger.admissions)) return ['LEDGER_SHAPE'];
  let previous = null;
  let lastAt = null;
  ledger.admissions.forEach((entry, i) => {
    if (entry.seq !== i + 1) errors.push(`SEQ_${String(i + 1)}`);
    if (!ADMISSION_STATUSES.includes(entry.status)) errors.push(`STATUS_${String(i + 1)}`);
    if (!ADMISSION_PURPOSES.includes(entry.purpose)) errors.push(`PURPOSE_${String(i + 1)}`);
    if (entry.prevEntrySha256 !== previous) errors.push(`CHAIN_${String(i + 1)}`);
    if (!isIso(entry.decidedAt) || (lastAt !== null && Date.parse(entry.decidedAt) < lastAt)) errors.push(`TIME_${String(i + 1)}`);
    if (entry.status === 'ADMITTED' && !(isIso(entry.admittedAt) && Date.parse(entry.admittedAt) <= Date.parse(entry.decidedAt))) errors.push(`ADMITTED_AT_${String(i + 1)}`);
    previous = entryDigest(entry);
    if (isIso(entry.decidedAt)) lastAt = Date.parse(entry.decidedAt);
  });
  return errors;
}

/**
 * MODEL-SIZING (ruling-draft section 7 item 9): the admission token caps come from the PLANNED model calls, not
 * from `sessions x session totals`. Each planned proposal reserves at most `maxOutputTokensPerCall` output (a repair
 * is another proposal) and, for input, either `inputBytesPerCall` (bytes count as tokens) or one explicit cap that
 * the owner names. `contingencyFactor` is stated by the caller (the admission has used 1.5 for the benchmark).
 */
export function proposalCaps(plan, caps) {
  const positive = (value) => Number.isInteger(value) && value >= 1;
  const bad = () => new Error('ADMISSION_PROPOSAL_PLAN');
  if (!isRecord(plan) || !isRecord(caps) || !positive(caps.maxOutputTokensPerCall)) throw bad();
  if (!positive(plan.plannedProposals) || typeof plan.contingencyFactor !== 'number' || !(plan.contingencyFactor >= 1)) throw bad();
  if (typeof plan.basis !== 'string' || plan.basis === '') throw bad();
  const perCall = plan.inputBytesPerCall !== undefined;
  if (perCall === (plan.inputTokenCap !== undefined) || !positive(perCall ? plan.inputBytesPerCall : plan.inputTokenCap)) throw bad();
  const contingencyProposals = Math.ceil(plan.plannedProposals * plan.contingencyFactor);
  return {
    plannedProposals: plan.plannedProposals, contingencyFactor: plan.contingencyFactor, contingencyProposals,
    tokenCapOut: contingencyProposals * caps.maxOutputTokensPerCall,
    tokenCapIn: perCall ? contingencyProposals * plan.inputBytesPerCall : plan.inputTokenCap,
    capBasis: { output: 'contingencyProposals x maxOutputTokensPerCall', input: perCall ? 'contingencyProposals x inputBytesPerCall' : 'explicit input cap', plan: plan.basis },
  };
}

/**
 * Builds one dated admission decision. Nothing is typed in: sessions come from the manifest, token caps from the
 * proposal plan, cost from price x tokens. Unknown price -> ADMISSION_REFUSED_PRICE_UNKNOWN (both unknown
 * reads as price); unknown headroom -> ADMISSION_REFUSED_HEADROOM_UNKNOWN; a cost bound above the allocation or
 * the headroom -> ADMISSION_REFUSED_OVER_ALLOCATION. Only a complete, in-bounds record can read ADMITTED.
 */
export function computeAdmission({ purpose, manifest, price, headroomUsd, allocationUsd = null, ceilingUsd = 500, enforcedCaps, proposalPlan, perCsiPlan = null, measuredProposalsPerSession = null, pinned = null, admittedBy = null, now = new Date(), notAdmittedBecause = [] }) {
  if (!ADMISSION_PURPOSES.includes(purpose)) throw new Error('admission purpose');
  const plan = manifest === null || manifest === undefined ? null : sessionPlan(manifest);
  const caps = enforcedCaps;
  const planned = proposalCaps(proposalPlan, caps);
  const { tokenCapIn, tokenCapOut } = planned;
  const priceKnown = price !== null && price !== undefined && Number.isFinite(price.pInPerMTok) && Number.isFinite(price.pOutPerMTok);
  const headroomKnown = headroomUsd !== null && headroomUsd !== undefined && Number.isFinite(headroomUsd.value);
  const costBound = priceKnown && tokenCapIn !== null ? (tokenCapIn * price.pInPerMTok + tokenCapOut * price.pOutPerMTok) / 1_000_000 : null;
  let status;
  const reasons = [...notAdmittedBecause];
  if (!priceKnown) { status = 'ADMISSION_REFUSED_PRICE_UNKNOWN'; reasons.push('unrun, owner ED-01 gateway owner (TBD): no gateway price list'); }
  else if (!headroomKnown) { status = 'ADMISSION_REFUSED_HEADROOM_UNKNOWN'; reasons.push('unrun, owner user: remaining headroom R under the USD 500 wave authorization'); }
  else if (allocationUsd === null || costBound > allocationUsd || allocationUsd > headroomUsd.value || allocationUsd > ceilingUsd) { status = 'ADMISSION_REFUSED_OVER_ALLOCATION'; reasons.push('cost bound exceeds the allocation, or the allocation exceeds the headroom or the ceiling'); }
  else status = 'ADMITTED';
  if (status !== 'ADMITTED') reasons.push('B8 is unknown; nothing is converted from the 2026-10-04 call count (473 of 500 calls) into dollars');
  const decidedAt = now.toISOString();
  return {
    status, purpose, decidedAt,
    admittedAt: status === 'ADMITTED' ? decidedAt : null,
    admittedBy: status === 'ADMITTED' ? admittedBy : null,
    manifestSha256: manifest === null || manifest === undefined ? null : manifest.manifestSha256,
    ceilingUsd, ceilingScope: 'whole OBS wave (README), not a per-benchmark allowance',
    remainingUsdAtAdmission: headroomKnown ? headroomUsd : null,
    allocationUsd: status === 'ADMITTED' ? allocationUsd : null,
    stopThresholdUsd: status === 'ADMITTED' ? 0.8 * allocationUsd : null,
    priceSource: priceKnown ? price : null,
    computed: { plannedRuns: plan?.runs ?? null, plannedSessions: plan?.sessions ?? null, contingencySessions: plan?.contingencySessions ?? null, plannedProposals: planned.plannedProposals, contingencyFactor: planned.contingencyFactor, contingencyProposals: planned.contingencyProposals, tokenCapIn, tokenCapOut, capBasis: planned.capBasis, costBoundUsd: costBound },
    enforcedCaps: caps,
    perCsiPlan, measuredProposalsPerSession, pinned,
    notAdmittedBecause: reasons,
  };
}

/** Appends one decision. Existing entries are verified and never rewritten. */
export function appendAdmission(path, decision, { create = false } = {}) {
  let ledger;
  if (existsSync(path)) ledger = JSON.parse(readFileSync(path, 'utf8'));
  else if (create) ledger = emptyLedger();
  else throw new Error('LEDGER_MISSING');
  const before = verifyLedger(ledger);
  if (before.length > 0) throw new Error(`LEDGER_CORRUPT:${before.join(',')}`);
  const previous = ledger.admissions.at(-1);
  const entry = { seq: ledger.admissions.length + 1, prevEntrySha256: previous === undefined ? null : entryDigest(previous), ...decision };
  const next = { ...ledger, admissions: [...ledger.admissions, entry] };
  const after = verifyLedger(next);
  if (after.length > 0) throw new Error(`LEDGER_REJECTED:${after.join(',')}`);
  if (!next.admissions.slice(0, ledger.admissions.length).every((e, i) => canonicalJson(e) === canonicalJson(ledger.admissions[i]))) throw new Error('LEDGER_APPEND_ONLY_VIOLATION');
  const temp = `${path}.next`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(temp, path);
  return entry;
}

/** The start guard: a D_C run may begin only when the latest entry is ADMITTED for this very manifest. */
export function guardStart({ ledger, manifestSha256, purpose = 'ac7-benchmark', now = new Date() }) {
  if (verifyLedger(ledger).length > 0) throw new AdmissionError('LEDGER_CORRUPT');
  // One ledger carries entries for several purposes; only the latest entry for THIS purpose can open (or close) it.
  const latest = ledger.admissions.filter((e) => e.purpose === purpose).at(-1);
  if (latest === undefined) throw new AdmissionError(ledger.admissions.length === 0 ? 'ADMISSION_MISSING' : 'PURPOSE_MISMATCH');
  if (latest.status !== 'ADMITTED') throw new AdmissionError(`LATEST_NOT_ADMITTED:${latest.status}`);
  if (latest.manifestSha256 !== manifestSha256 || manifestSha256 === null) throw new AdmissionError('MANIFEST_MISMATCH');
  if (!(Date.parse(latest.admittedAt) < now.getTime())) throw new AdmissionError('ADMITTED_AT_NOT_BEFORE_NOW');
  return latest;
}

/**
 * Evaluated after every session. Stops at >= 80 percent of the allocation or at the first hard-gate hit;
 * the session that crosses completes, and the next one never starts. A session without reported usage costs
 * what it RECORDED as reserved (`modelProposals` x `perCallCeiling`, capped at the session totals), and only a
 * session with neither costs `reservedCeiling` (MODEL-SIZING: the session totals are now 3x larger, so they stay
 * the last resort and are no longer the normal fallback). Resuming needs a new dated ledger entry.
 */
export function createStopRule({ allocationUsd, price, stopFraction = 0.8, reservedCeiling, perCallCeiling = null }) {
  let spent = 0;
  let stopped = null;
  let sessions = 0;
  const observedReasons = new Set();
  const observeHardGate = ({ falsePass = false, leak = false }) => {
    if (falsePass || leak) { observedReasons.add('STOPPED_HARD_GATE'); stopped = 'STOPPED_HARD_GATE'; }
    return { stop: stopped !== null, reason: stopped, spentUsd: spent };
  };
  return {
    observeHardGate,
    record(session) {
      if (stopped !== null) throw new AdmissionError('SESSION_AFTER_STOP');
      sessions += 1;
      const known = Number.isInteger(session.inputTokens) && Number.isInteger(session.outputTokens);
      const recorded = !known && perCallCeiling !== null && Number.isInteger(session.modelProposals) && session.modelProposals >= 0;
      const input = known ? session.inputTokens : recorded ? Math.min(session.modelProposals * perCallCeiling.input, reservedCeiling.input) : reservedCeiling.input;
      const output = known ? session.outputTokens : recorded ? Math.min(session.modelProposals * perCallCeiling.output, reservedCeiling.output) : reservedCeiling.output;
      spent += (input * price.pInPerMTok + output * price.pOutPerMTok) / 1_000_000;
      if (spent >= stopFraction * allocationUsd) { observedReasons.add('STOPPED_BUDGET_80'); stopped = 'STOPPED_BUDGET_80'; }
      observeHardGate({ falsePass: session.falsePass === true, leak: session.leak === true });
      return { stop: stopped !== null, reason: stopped, spentUsd: spent, costBasis: known ? 'PUBLIC_BUDGET_COUNTERS' : recorded ? 'recorded-reservations' : 'reserved-ceiling' };
    },
    nextSessionAllowed() { return stopped === null; },
    state() { return { sessions, spentUsd: spent, stopped, stopThresholdUsd: stopFraction * allocationUsd, observedReasons: [...observedReasons] }; },
  };
}

// ---------------------------------------------------------------------------------------------
// Public API client and run driver
// ---------------------------------------------------------------------------------------------
const TERMINAL = ['SUCCEEDED', 'PUBLICATION_CONFLICT', 'FAILED', 'UNKNOWN_OUTCOME', 'CANCELLED', 'EXPIRED'];
const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });

function checkedDraftRevisions(value) {
  if (!isRecord(value) || !Number.isSafeInteger(value.sourceRevision) || value.sourceRevision <= 0
      || !Number.isSafeInteger(value.configurationRevision) || value.configurationRevision <= 0) throw new Error('Invalid draft revisions');
  return { sourceRevision: value.sourceRevision, configurationRevision: value.configurationRevision };
}

// Response validation belongs after withTextCapture, including malformed successful responses.
function checkedDraft(value, id) {
  if (!isRecord(value) || value.id !== id) throw new Error('Invalid draft identity');
  return { id, ...checkedDraftRevisions(value) };
}

const publicClientFactories = new WeakMap();
const publicErrorCodes = new Map([
  'INVALID_CONTRACT', 'UNAUTHENTICATED', 'FORBIDDEN_SCOPE', 'REVISION_CONFLICT', 'STALE_GENERATION',
  'TARGET_MISMATCH', 'AMBIGUOUS_TARGET', 'MISSING_SOURCE', 'BINDING_ORDER', 'SENSITIVE_SOURCE',
  'ORIGIN_NOT_ALLOWED', 'UNSUPPORTED_SURFACE', 'BUDGET_EXCEEDED', 'STALE_FENCE', 'IDEMPOTENCY_CONFLICT',
  'UNKNOWN_OUTCOME', 'PUBLICATION_CONFLICT', 'RUNTIME_INCOMPATIBLE', 'ASSERTION_FAILED', 'CANCELLED',
  'EXPIRED', 'SECRET_UNAVAILABLE', 'SECRET_USE_NOT_AUTHORIZED', 'SECRET_USE_REVOKED', 'VAULT_UNAVAILABLE',
  'LOGIN_REQUIRED', 'SECRET_TOO_LONG', 'POLICY_NOT_APPROVED', 'STALE_REVISION', 'CSI_IMMUTABLE',
  'LEARN_REQUIRED', 'TEST_DELETED', 'TEST_QUARANTINED', 'INVALID_AUTHORING', 'INVALID_STEPS',
  'INVALID_CONFIGURATION', 'SOURCE_TOO_MANY_STEPS', 'SOURCE_LINE_TOO_LONG', 'STUDIO_FORBIDDEN',
  'IDEMPOTENCY_KEY_REQUIRED', 'INVALID_IDEMPOTENCY_KEY', 'IDEMPOTENCY_KEY_REUSED',
  'AUTHORIZATION_REVOKED', 'RUN_ERROR', 'TARGET_DRIFT', 'TIMEOUT', 'START_TIMEOUT', 'CONTEXT_LOST',
].map((code) => [code, code]));
const publicErrorCode = (body) => {
  const code = isRecord(body) ? body.code ?? (isRecord(body.error) ? body.error.code : body.error) : null;
  return publicErrorCodes.get(code) ?? null;
};

/**
 * HTTP binding of the public routes in docs/specs/studio/openapi.yaml. [I] It was written from the OpenAPI
 * text only and has not been run against a live backend. In-memory transport tests exercise the adapter;
 * tokens are read by the caller, never logged, and never part of a run record.
 */
export function createPublicApiClient(options) { return boundPublicApiClient(options, null); }

function boundPublicApiClient({ baseUrl, token, transport = fetch, csiId, environmentId, applicationId }, observation) {
  const root = new URL(baseUrl);
  if (root.username || root.password || root.search || root.hash || (root.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(root.hostname))) throw new Error('Invalid API base URL');
  const call = async (method, path, body, extra = {}) => {
    observation?.attempt();
    let response;
    try {
      response = await transport(new URL(`${root.toString().replace(/\/$/u, '')}${path}`), {
        method, redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { observation?.unavailable(); throw new Error('Studio API unavailable'); }
    let text;
    try { text = await response.text(); }
    catch { observation?.unavailable(); throw new Error('Studio API response unavailable'); }
    observation?.body(text);
    // response.text already allocated the string; inspection adds no retained oversized body.
    if (text.length > 2_000_000) throw new Error('response exceeds bound');
    let parsed;
    try { parsed = text === '' ? null : JSON.parse(text); }
    catch { throw new Error('Studio API returned invalid JSON'); }
    if (!response.ok) throw Object.assign(new Error('Studio API refused the request'), { status: response.status, code: publicErrorCode(parsed) });
    return { status: response.status, body: parsed };
  };
  const idem = () => ({ 'idempotency-key': randomUUID() });
  const client = {
    createDraft: async (name, authoring) => (await call('POST', '/tests', { name, csiId, environment: environmentId, ...authoring.request })).body,
    readDraft: async (id) => (await call('GET', `/tests/${id}`)).body,
    updateDraft: async (id, name, authoring, revisions) => (await call('PUT', `/tests/${id}`, { name, csiId, environment: environmentId, ...authoring.request, ...checkedDraftRevisions(revisions) })).body,
    startSession: async (draft, extra = {}) => (await call('POST', '/guided-sessions', {
      schemaVersion: 3, testId: draft.id, sourceRevision: String(draft.sourceRevision), configurationRevision: String(draft.configurationRevision),
      environmentId, applicationId, versions: { contract: 3 }, ...extra,
    }, idem())).body,
    readSession: async (id) => (await call('GET', `/guided-sessions/${id}`)).body,
    readClarification: async (id) => { const r = await call('GET', `/guided-sessions/${id}/clarification`); return r.status === 204 ? null : r.body; },
    clarify: async (id, body) => (await call('POST', `/guided-sessions/${id}/clarify`, { schemaVersion: 3, ...body }, idem())).body,
    cancel: async (id) => (await call('POST', `/guided-sessions/${id}/cancel`, { schemaVersion: 3, reason: 'userRequested' }, idem())).body,
    finalize: async (id, revisions) => (await call('POST', `/guided-sessions/${id}/finalize`, { schemaVersion: 3, expectedSourceRevision: String(revisions.sourceRevision), expectedConfigurationRevision: String(revisions.configurationRevision) }, idem())).body,
    readResult: async (id) => (await call('GET', `/guided-sessions/${id}/result`)).body,
    execute: async (testId) => (await call('POST', `/tests/${testId}/execute`, undefined, idem())).body,
    readExecution: async (id) => (await call('GET', `/executions/${id}`)).body,
  };
  publicClientFactories.set(client, {
    methods: Object.getOwnPropertyDescriptors(client),
    bind: (observer) => boundPublicApiClient({ baseUrl, token, transport, csiId, environmentId, applicationId }, observer),
  });
  return client;
}

/** Builds the v2 authoring request from a case's step-text file, substituting `${fixtureOrigin}`. */
export function buildAuthoringRequest(stepText, vars) {
  const sub = (v) => fill(v, vars);
  return {
    request: {
      authoringSchemaVersion: 2,
      steps: stepText.authoring.steps.map((s) => ({ id: s.id, text: s.text, context: s.context })),
      variables: stepText.variables.map((v) => (v.kind === 'plain' ? { ...v, value: sub(v.value) } : { ...v })),
      configuration: { ...stepText.configuration },
    },
  };
}

function copiedCanaryEntries(value, optional = false) {
  if (optional && value === undefined) return [];
  try {
    // An optional operator union must preserve an invalid original container, plus any inspectable value.
    if (!Array.isArray(value)) return optional ? [value, undefined] : [value];
    return Array.from({ length: value.length }, (_entry, index) => { try { return value[index]; } catch { return undefined; } });
  } catch { return [undefined]; }
}

/** Run-owned transient capture. Raw HTTP strings are scanned synchronously and never queued. */
function withTextCapture(original, { secretCanaries, extraTexts }) {
  const texts = {}; const rawFindings = new Map(); const findings = new Map(); const prepared = [];
  let configuration = 'COMPLETE'; let values = [];
  try { if (!Array.isArray(secretCanaries)) configuration = 'UNAVAILABLE'; values = copiedCanaryEntries(secretCanaries); }
  catch { configuration = 'UNAVAILABLE'; }
  if (values.length === 0) configuration = 'UNAVAILABLE';
  values.forEach((value, index) => {
    try {
      if (typeof value !== 'string' || value.length === 0) { configuration = 'UNAVAILABLE'; return; }
      prepared.push({ variants: variantsOf(value), index, prefix: sha256Hex(value).slice(0, 12) });
    } catch { configuration = 'UNAVAILABLE'; }
  });
  let n = 0; let callSerial = 0; let lastExtraSerial = -1; let attempts = 0; let consumed = 0; let scanned = 0; let httpFailed = false; let valuesFailed = false;
  let extraAttempts = 0; let extraCompleted = 0; let extraFailed = extraTexts !== null && typeof extraTexts !== 'function';
  let disposed = false;
  const inspect = (text, label, target, cumulative = false) => {
    for (const canary of prepared) {
      let hits = 0;
      for (const variant of canary.variants) {
        let offset = 0;
        for (;;) { const at = text.indexOf(variant, offset); if (at === -1) break; hits += 1; offset = at + variant.length; }
      }
      if (hits === 0) continue;
      const key = `${label}#${String(canary.index)}#${canary.prefix}`; const previous = target.get(key)?.hits ?? 0;
      target.set(key, { label, canaryIndex: canary.index, canarySha256Prefix: canary.prefix, hits: cumulative ? previous + hits : Math.max(previous, hits) });
    }
  };
  const factory = publicClientFactories.get(original);
  const canRebind = () => {
    const descriptors = Object.getOwnPropertyDescriptors(original);
    return factory !== undefined && Reflect.ownKeys(descriptors).length === Reflect.ownKeys(factory.methods).length
      && Reflect.ownKeys(factory.methods).every((key) => descriptors[key]?.value === factory.methods[key].value && !descriptors[key]?.get && !descriptors[key]?.set);
  };
  let faithful = canRebind();
  const bound = faithful ? factory.bind({
    attempt: () => { attempts += 1; }, unavailable: () => { httpFailed = true; },
    body: (text) => { consumed += 1; try { if (disposed) { httpFailed = true; return; } inspect(text, 'publicHttp', rawFindings, true); scanned += 1; } catch { httpFailed = true; } },
  }) : original;
  const wrapped = {};
  for (const name of Object.keys(bound)) {
    wrapped[name] = async (...args) => {
      callSerial += 1;
      // Preserve mutable caller overrides, including a change while an earlier call awaited.
      if (faithful && !canRebind()) faithful = false;
      const receiver = faithful ? bound : original;
      const result = await receiver[name](...args);
      try { const text = result === undefined ? '' : JSON.stringify(result); if (typeof text !== 'string') valuesFailed = true; else texts[`${name}#${String((n += 1))}`] = text; }
      catch { valuesFailed = true; }
      return result;
    };
  }
  const row = () => ({
    scope: 'LOCAL_CONSUMED_PUBLIC_HTTP_AND_DECLARED_TEXTS_ONLY', inspectionConfiguration: configuration,
    publicHttp: !faithful ? 'UNOBSERVABLE' : httpFailed ? 'UNAVAILABLE' : 'COMPLETE',
    httpAttempts: faithful ? attempts : null, httpBodiesConsumed: faithful ? consumed : null, httpBodiesScanned: faithful ? scanned : null,
    fulfilledValues: valuesFailed ? 'UNAVAILABLE' : 'COMPLETE',
    extraTexts: extraTexts === null ? 'NOT_CONFIGURED' : extraFailed || extraAttempts === 0 ? 'UNAVAILABLE' : 'COMPLETE', extraAttempts, extraCompleted,
  });
  const snapshotFindings = () => {
    const all = new Map(findings);
    for (const [key, value] of rawFindings) all.set(key, { ...value });
    return [...all.values()].map((value) => ({ ...value }));
  };
  const observation = {
    async scan(phases, interrupt) {
      try { for (const [label, text] of Object.entries(texts)) inspect(text, label, findings); inspect(JSON.stringify(phases), 'receipts', findings); }
      catch { valuesFailed = true; }
      // A collector that caused interruption is not retried by catch recovery.
      if (typeof extraTexts === 'function' && !extraFailed && (!interrupt || lastExtraSerial !== callSerial)) {
        lastExtraSerial = callSerial; extraAttempts += 1;
        try {
          const supplied = await extraTexts();
          if (!isRecord(supplied)) extraFailed = true;
          else {
            let ordinal = 0;
            for (const label of Object.keys(supplied)) {
              ordinal += 1;
              let text;
              try { text = supplied[label]; } catch { extraFailed = true; continue; }
              if (typeof text !== 'string') { extraFailed = true; continue; }
              const safeLabel = ['backendLog', 'gateway', 'sse', 'audit', 'journal', 'rawOutput', 'manifest', 'closedUnit'].includes(label) ? label : `extraText#${String(ordinal)}`;
              inspect(text, safeLabel, findings);
            }
          }
          if (!extraFailed) extraCompleted += 1;
        } catch { extraFailed = true; }
      }
      const result = snapshotFindings();
      if (!interrupt && (httpFailed || valuesFailed || extraFailed)) throw new Error('Local observation unavailable');
      return { leaks: result.length, findings: result };
    },
    finish(run) {
      const fact = row();
      const unknown = configuration !== 'COMPLETE' || httpFailed || valuesFailed || extraFailed;
      run.details = { ...run.details, canaryObservation: [fact] };
      if (unknown && !(run.details.driverObservations ?? []).some((entry) => entry.code === 'OBSERVATION_UNAVAILABLE')) {
        run.details.driverObservations = [...(run.details.driverObservations ?? []), { phase: 'local-capture', code: 'OBSERVATION_UNAVAILABLE' }];
      }
      return run;
    },
    dispose() { disposed = true; prepared.length = 0; values.length = 0; rawFindings.clear(); findings.clear(); for (const key of Object.keys(texts)) Reflect.deleteProperty(texts, key); },
  };
  return { client: wrapped, texts, observation };
}

async function leakScan({ phases, observation, interrupt = false }) { return observation.scan(phases, interrupt); }

function completeCanaryObservation(run) {
  const rows = run?.details?.canaryObservation;
  if (!Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0])) return false;
  const value = rows[0];
  const keys = ['scope', 'inspectionConfiguration', 'publicHttp', 'httpAttempts', 'httpBodiesConsumed', 'httpBodiesScanned', 'fulfilledValues', 'extraTexts', 'extraAttempts', 'extraCompleted'];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) return false;
  return value.scope === 'LOCAL_CONSUMED_PUBLIC_HTTP_AND_DECLARED_TEXTS_ONLY' && value.inspectionConfiguration === 'COMPLETE'
    && value.publicHttp === 'COMPLETE' && value.fulfilledValues === 'COMPLETE'
    && Number.isSafeInteger(value.httpAttempts) && value.httpAttempts >= 0 && value.httpAttempts === value.httpBodiesConsumed && value.httpAttempts === value.httpBodiesScanned
    && Number.isSafeInteger(value.extraAttempts) && value.extraAttempts >= 0 && value.extraAttempts === value.extraCompleted
    && (value.extraTexts === 'NOT_CONFIGURED' && value.extraAttempts === 0 || value.extraTexts === 'COMPLETE' && value.extraAttempts > 0);
}

/** One guided session through the public API: start, poll, clarify only by script, cancel on timeout. */
async function learnSession({ client, draft, expected, extra = {}, receipts, cursorLabel, pollMs, timeoutMs, now, pause }) {
  const states = [];
  let clarifications = 0;
  const answers = [...(expected.script?.clarificationChoices ?? [])];
  const cursor = receipts.mark();
  const started = await client.startSession(draft, extra);
  const id = started.session.sessionId;
  const deadline = now().getTime() + timeoutMs;
  let view = started;
  for (;;) {
    view = await client.readSession(id);
    const state = view.session.state;
    if (states.at(-1) !== state) states.push(state);
    if (TERMINAL.includes(state)) break;
    if (state === 'AWAITING_CLARIFICATION') {
      const question = await client.readClarification(id);
      if (question !== null) {
        clarifications += 1;
        const choice = answers.shift();
        if (choice === undefined) { await client.cancel(id); states.push('CANCELLED'); view = await client.readSession(id); break; }
        await client.clarify(id, { clarificationId: question.clarificationId, choiceId: choice, generation: question.generation });
      }
    }
    if (now().getTime() > deadline) { await client.cancel(id); states.push('CANCELLED'); view = await client.readSession(id); break; }
    await pause(pollMs);
  }
  const result = await client.readResult(id);
  return { id, view, result, states, clarifications, phase: { label: cursorLabel, ...receipts.since(cursor) } };
}

function sessionObservation(learned, published) {
  if (!isRecord(learned.view?.session) || typeof learned.view.session.state !== 'string') return undefined;
  return {
    terminal: learned.view.session.state, observedStates: learned.states, published, clarifications: learned.clarifications,
    failureCode: publicErrorCode({ code: learned.result?.failure?.code ?? learned.result?.errorCode }), failedStepNumber: learned.result?.failure?.stepNumber ?? null,
  };
}

const budgetUsage = (counters) => {
  const value = (field) => Number.isInteger(counters?.[field]) && counters[field] >= 0 ? counters[field] : null;
  return { basis: 'PUBLIC_BUDGET_COUNTERS', modelProposals: value('modelProposals'), inputTokens: value('modelInputTokens'), outputTokens: value('modelOutputTokens') };
};
const learnPhase = (learned, phase, published = false) => ({ phase, sessionId: learned.id, session: sessionObservation(learned, published), usage: budgetUsage(learned.view.session.counters), observationComplete: true, hardGates: { falsePass: false, secretOrPiiLeak: 0 } });
const chargeLearn = (stopRule, session) => {
  const before = stopRule.state().spentUsd;
  const charge = stopRule.record({ ...session.usage, falsePass: session.hardGates.falsePass, leak: session.hardGates.secretOrPiiLeak > 0 });
  session.budgetCharge = { amountUsd: charge.spentUsd - before, basis: charge.costBasis };
  return charge;
};
const sumLearnUsage = (sessions) => Object.fromEntries(['modelProposals', 'inputTokens', 'outputTokens'].map((field) => [field,
  sessions.every((session) => TERMINAL.includes(session.session?.terminal) && Number.isInteger(session.usage[field])) ? sessions.reduce((sum, session) => sum + session.usage[field], 0) : null]));

function newRun({ entry, rep, attempt, mode, manifest, startedAt, finishedAt, observed, oracle, counters, sessionId, details = {}, incremental, learnSessions, learnSessionsComplete = true }) {
  const run = {
    caseId: entry.id, rep, attempt, mode, manifestSha256: manifest.manifestSha256,
    runStartedAt: startedAt.toISOString(), runFinishedAt: finishedAt.toISOString(), sessionId,
    session: observed.session, oracle, infrastructureFailure: null,
    usage: learnSessionsComplete === false ? { basis: 'PUBLIC_BUDGET_COUNTERS', modelProposals: null, inputTokens: null, outputTokens: null }
      : learnSessions === undefined ? budgetUsage(counters) : { basis: 'PUBLIC_BUDGET_COUNTERS', ...sumLearnUsage(learnSessions) },
    learnSessionsComplete, learnSessions: learnSessions ?? [{ phase: 'base', sessionId, session: observed.session, usage: budgetUsage(counters), hardGates: { falsePass: oracle.falseSuccess, secretOrPiiLeak: 0 } }],
    secretOrPiiLeak: 0, rs1NonScalarReadGaps: 0, authoredEchoUnobservableTargets: 0, focusMutationRefusedFills: 0, details,
    ...(incremental === undefined ? {} : { incremental }),
  };
  run.causeAssessment = unknownAssessments(run);
  return run;
}

/** Recover only public fields already held by the existing transient API capture. No new request/observer. */
async function interruptedRun({ entry, rep, attempt, mode, manifest, startedAt, captured, phases, knownSessions, attemptedStarts,
  chargedAtStart, spentAtStart, stopRule, now, observation, incremental = undefined, priorFindings = [], priorStopObservations = [] }) {
  const rows = Object.entries(captured).map(([label, text]) => {
    try { return { label, n: Number(label.split('#')[1]), body: JSON.parse(text) }; } catch { return { label, n: Number(label.split('#')[1]), body: null }; }
  });
  const starts = rows.filter((row) => row.label.startsWith('startSession#') && typeof row.body?.session?.sessionId === 'string');
  const sessions = [...knownSessions];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i]; const end = starts[i + 1]?.n ?? Infinity;
    const replies = rows.filter((row) => row.n >= start.n && row.n < end);
    const views = replies.filter((row) => row.label.startsWith('readSession#') && row.body?.session?.sessionId === start.body.session.sessionId);
    const view = views.at(-1)?.body ?? start.body;
    const result = replies.filter((row) => row.label.startsWith('readResult#')).at(-1)?.body ?? null;
    const learned = { id: start.body.session.sessionId, view, result,
      states: views.map((row) => row.body.session.state).filter((state, index, states) => typeof state === 'string' && (index === 0 || states[index - 1] !== state)),
      clarifications: replies.filter((row) => row.label.startsWith('readClarification#') && row.body !== null).length };
    const prior = sessions.find((session) => session.sessionId === learned.id);
    const recovered = learnPhase(learned, i === 0 ? 'base' : 'incremental', result?.publication?.status === 'PUBLISHED');
    recovered.observationComplete = false;
    if (prior === undefined) sessions.push(recovered);
    else { prior.session = recovered.session; prior.usage = recovered.usage; prior.observationComplete = false; }
  }
  const scopeComplete = starts.length === attemptedStarts;
  const unresolvedSessionCharges = [];
  if (stopRule !== null) {
    for (let i = 0; i < sessions.length; i += 1) {
      if (sessions[i].budgetCharge === undefined && stopRule.state().sessions - chargedAtStart < i + 1 && stopRule.nextSessionAllowed()) chargeLearn(stopRule, sessions[i]);
    }
    // An unacknowledged start is possible consumption, not an invented observed session or zero charge.
    if (!scopeComplete && stopRule.state().sessions - chargedAtStart < attemptedStarts && stopRule.nextSessionAllowed()) {
      const before = stopRule.state().spentUsd;
      const charge = stopRule.record({ inputTokens: null, outputTokens: null, modelProposals: null });
      unresolvedSessionCharges.push({ phase: attemptedStarts > 1 ? 'incremental' : 'base', amountUsd: charge.spentUsd - before, basis: charge.costBasis });
    }
  }
  const scan = await leakScan({ phases, observation, interrupt: true });
  const retainedFindings = new Map();
  for (const finding of [...priorFindings, ...scan.findings]) retainedFindings.set(`${finding.label}#${String(finding.canaryIndex)}#${finding.canarySha256Prefix}`, finding);
  const leaks = Math.max(retainedFindings.size, ...sessions.map((session) => session.hardGates.secretOrPiiLeak), 0);
  const falsePass = sessions.some((session) => session.hardGates.falsePass);
  if (stopRule !== null) stopRule.observeHardGate({ falsePass, leak: leaks > 0 });
  const partial = incremental === undefined ? undefined : { logicalStatus: 'INCOMPLETE', notCompletedBecause: null,
    ...(attemptedStarts < 2 ? { suffixStarted: false } : scopeComplete ? { suffixStarted: true } : {}) };
  const last = sessions.at(-1);
  const observed = { session: last?.session === undefined ? undefined : { ...last.session, ...(partial === undefined ? {} : { published: false }) } };
  const run = newRun({ entry, rep, attempt, mode, manifest, startedAt, finishedAt: now(), observed,
    oracle: { correct: false, falseSuccess: falsePass, failures: [partial === undefined ? 'run-observation-incomplete' : 'incremental-not-completed'] },
    counters: {}, sessionId: last?.sessionId, incremental: partial, learnSessions: sessions, learnSessionsComplete: scopeComplete });
  run.secretOrPiiLeak = leaks;
  run.details = { canaryFindings: [...retainedFindings.values()], driverObservations: [{ phase: attemptedStarts > 1 ? 'incremental' : 'base', code: 'OBSERVATION_UNAVAILABLE' }],
    unresolvedSessionCharges, protectiveChargeScope: [{ chargedSessionOrPotentialStartCount: stopRule === null ? 0 : stopRule.state().sessions - chargedAtStart,
      knownProtectiveSpendUsd: stopRule === null ? null : stopRule.state().spentUsd - spentAtStart }],
    stopObservations: [...priorStopObservations, ...(stopRule?.state().observedReasons ?? []).filter((reason) => !priorStopObservations.some((row) => row.reason === reason)).map((reason) => ({ phase: reason === 'STOPPED_BUDGET_80' ? attemptedStarts > 1 ? 'incremental' : 'base' : 'final-oracle', reason }))] };
  return observation.finish(run);
}

/**
 * Drives one run of one case through the public API and returns a run record. `receipts` is the fixture-owned
 * oracle channel: `mark()` returns a cursor, `since(cursor)` returns `{actions[], views[]}` after it.
 * A clarification is answered only when the case script names the choice; otherwise it is counted and the
 * session is cancelled (a class N case is not in the completion denominator). Finalize runs exactly once.
 */
export async function driveCase({ client: rawClient, entry, stepText, expected, vars, receipts, mode, manifest, rep = 1, attempt = 1, pollMs = 500, timeoutMs = 600_000, stopRule = null, now = () => new Date(), pause = sleep, replays = 2, secretCanaries = [], extraTexts = null }) {
  if (stopRule !== null && !stopRule.nextSessionAllowed()) throw new AdmissionError('SESSION_AFTER_STOP');
  const { client, texts: captured, observation } = withTextCapture(rawClient, { secretCanaries, extraTexts });
  const startedAt = now();
  const phases = {}; const knownSessions = []; let attemptedStarts = 0; let priorFindings = [];
  const chargedAtStart = stopRule?.state().sessions ?? 0; const spentAtStart = stopRule?.state().spentUsd ?? 0;
  try {
    const draft = await client.createDraft(`${entry.id} r${String(rep)}`, buildAuthoringRequest(stepText, vars));
    attemptedStarts = 1;
    const learned = await learnSession({ client, draft, expected, receipts, cursorLabel: 'run', pollMs, timeoutMs, now, pause });
    phases.run = { actions: learned.phase.actions, views: learned.phase.views };
    knownSessions.push(learnPhase(learned, 'base', learned.result?.publication?.status === 'PUBLISHED'));
    let result = learned.result;
    let published = false;
    if (learned.view.session.state === 'SUCCEEDED') {
      const cursor = receipts.mark();
      await client.finalize(learned.id, { sourceRevision: draft.sourceRevision, configurationRevision: draft.configurationRevision });
      phases.finalize = receipts.since(cursor);
      result = await client.readResult(learned.id);
      published = result.publication?.status === 'PUBLISHED';
      for (let i = 1; i <= replays && expected.receipts.phases[`replay${String(i)}`] !== undefined; i += 1) {
        const replayCursor = receipts.mark();
        const accepted = await client.execute(draft.id);
        for (let n = 0; n < 100; n += 1) {
          const execution = await client.readExecution(accepted.executionId);
          if (['PASSED', 'FAILED', 'ERROR', 'CANCELLED'].includes(execution.status)) break;
          await pause(pollMs);
        }
        phases[`replay${String(i)}`] = receipts.since(replayCursor);
      }
    }
    if (expected.receipts.phases.finalize !== undefined && phases.finalize === undefined) phases.finalize = { actions: [], views: [] };
    const observed = { session: sessionObservation({ ...learned, result }, published), receipts: { phases } };
    const oracle = evaluateOutcome(expected, observed, vars);
    knownSessions[0].session = observed.session; knownSessions[0].oracle = oracle; knownSessions[0].hardGates.falsePass = oracle.falseSuccess;
    const scan = await leakScan({ phases, observation });
    priorFindings = scan.findings; knownSessions[0].hardGates.secretOrPiiLeak = scan.leaks;
    const run = newRun({ entry, rep, attempt, mode, manifest, startedAt, finishedAt: now(), observed, oracle, counters: learned.view.session.counters ?? {}, sessionId: learned.id });
    run.secretOrPiiLeak = scan.leaks;
    run.learnSessions[0].hardGates.secretOrPiiLeak = scan.leaks;
    run.details = { canaryFindings: scan.findings };
    if (stopRule !== null) {
      chargeLearn(stopRule, run.learnSessions[0]);
      run.details.stopObservations = stopRule.state().observedReasons.map((reason) => ({ phase: 'base', reason }));
    }
    return observation.finish(run);
  } catch {
    return await interruptedRun({ entry, rep, attempt, mode, manifest, startedAt, captured, phases, knownSessions, attemptedStarts, chargedAtStart, spentAtStart, stopRule, now, secretCanaries, observation, priorFindings });
  } finally { observation.dispose(); }
}

/**
 * Incremental case (STUDIO-OBS-015 case file, consumed unchanged): learn and publish the base, change the
 * source value, apply the edited authoring, learn from the first changed step, publish. What is checked is only
 * what the public API shows: per-step `learnedFromThisRun` / `reusedFrom` in the result explanation, the
 * session counters around finalize, and the fixture receipts. Backend reservations per prefix step and the
 * merged-revision replay model calls are NOT observable here and stay with the backend ITs.
 */
export async function driveIncremental({ client: rawClient, entry, caseFile, expected, vars, receipts, switchSourceValue, mode, manifest, rep = 1, attempt = 1, pollMs = 500, timeoutMs = 900_000, stopRule = null, now = () => new Date(), pause = sleep, secretCanaries = [], extraTexts = null }) {
  if (stopRule !== null && !stopRule.nextSessionAllowed()) throw new AdmissionError('SESSION_AFTER_STOP');
  const { client, texts: captured, observation } = withTextCapture(rawClient, { secretCanaries, extraTexts });
  const startedAt = now();
  const findings = new Map();
  const scanPhase = async (observedPhases) => {
    const scan = await leakScan({ phases: observedPhases, observation });
    for (const finding of scan.findings) {
      const key = `${finding.label}#${String(finding.canaryIndex)}#${finding.canarySha256Prefix}`;
      const prior = findings.get(key);
      if (prior === undefined || prior.hits < finding.hits) findings.set(key, finding);
    }
    return scan;
  };
  const phases = {}; const sessions = []; const stopObservations = []; let attemptedStarts = 0;
  const chargedAtStart = stopRule?.state().sessions ?? 0; const spentAtStart = stopRule?.state().spentUsd ?? 0;
  try {
    const baseStep = { authoring: caseFile.base.authoring, variables: caseFile.base.variables, configuration: caseFile.base.configuration };
    const draft = await client.createDraft(`${entry.id} base r${String(rep)}`, buildAuthoringRequest(baseStep, vars));
    attemptedStarts = 1;
    const base = await learnSession({ client, draft, expected, receipts, cursorLabel: 'base', pollMs, timeoutMs, now, pause });
    phases.base = { actions: base.phase.actions, views: base.phase.views };
    sessions.push(learnPhase(base, 'base', base.result?.publication?.status === 'PUBLISHED'));
    const rememberStop = (phase) => {
      for (const reason of stopRule?.state().observedReasons ?? []) {
        if (!stopObservations.some((row) => row.reason === reason)) stopObservations.push({ phase, reason });
      }
    };
    // This independent base oracle expects only the base phase, not completion of the suffix.
    const baseExpected = { ...expected, incremental: undefined, session: { ...expected.session, published: sessions[0].session.published }, receipts: { ...expected.receipts, phases: { base: expected.receipts.phases.base } } };
    const baseVerdict = evaluateOutcome(baseExpected, { session: sessions[0].session, receipts: { phases } }, vars);
    sessions[0].oracle = baseVerdict; sessions[0].hardGates.falsePass = baseVerdict.falseSuccess;
    const baseScan = await scanPhase(phases);
    sessions[0].hardGates = { falsePass: baseVerdict.falseSuccess, secretOrPiiLeak: baseScan.leaks };
    sessions[0].oracle = baseVerdict;
    if (stopRule !== null) { chargeLearn(stopRule, sessions[0]); rememberStop('base'); }
    let published = false;
    let edit = null;
    let result = base.result;
    let incremental = { logicalStatus: 'INCOMPLETE', suffixStarted: false,
      notCompletedBecause: base.view.session.state !== 'SUCCEEDED' ? 'BASE_NOT_SUCCEEDED' : baseVerdict.falseSuccess || baseScan.leaks > 0 ? 'STOPPED_HARD_GATE' : stopRule?.state().stopped ?? null };
    const canContinue = () => base.view.session.state === 'SUCCEEDED' && !sessions.some((session) => session.hardGates.falsePass || session.hardGates.secretOrPiiLeak > 0)
      && (stopRule === null || stopRule.nextSessionAllowed());
    if (canContinue()) {
      const cursor = receipts.mark();
      await client.finalize(base.id, { sourceRevision: draft.sourceRevision, configurationRevision: draft.configurationRevision });
      const baseFinalization = receipts.since(cursor);
      const baseResult = await client.readResult(base.id);
      sessions[0].session.published = baseResult.publication?.status === 'PUBLISHED';
      const finalizedBase = evaluateOutcome({ ...baseExpected, session: { ...baseExpected.session, published: sessions[0].session.published } },
        { session: sessions[0].session, receipts: { phases: { base: phases.base, finalize: baseFinalization } } }, vars);
      sessions[0].oracle = finalizedBase; sessions[0].hardGates.falsePass ||= finalizedBase.falseSuccess;
      const afterFinalizeScan = await scanPhase({ ...phases, finalize: baseFinalization });
      sessions[0].hardGates.secretOrPiiLeak = Math.max(sessions[0].hardGates.secretOrPiiLeak, afterFinalizeScan.leaks);
      if (stopRule !== null) { stopRule.observeHardGate({ falsePass: finalizedBase.falseSuccess, leak: afterFinalizeScan.leaks > 0 }); rememberStop('base'); }
      if (canContinue() && sessions[0].session.published) {
        const currentDraft = checkedDraft(await client.readDraft(draft.id), draft.id);
        switchSourceValue();
        const current = { authoring: caseFile.current, variables: caseFile.base.variables, configuration: caseFile.base.configuration };
        const updated = checkedDraft(await client.updateDraft(draft.id, `${entry.id} edit r${String(rep)}`, buildAuthoringRequest(current, vars), {
          sourceRevision: currentDraft.sourceRevision, configurationRevision: currentDraft.configurationRevision,
        }), draft.id);
        // Update/finalization can reveal a late hard fact after the base was charged. Do not charge it again.
        const beforeSuffixScan = await scanPhase(phases);
        sessions[0].hardGates.secretOrPiiLeak = Math.max(sessions[0].hardGates.secretOrPiiLeak, beforeSuffixScan.leaks);
        if (stopRule !== null) { stopRule.observeHardGate({ leak: beforeSuffixScan.leaks > 0 }); rememberStop('base'); }
        if (canContinue()) {
          attemptedStarts = 2;
          edit = await learnSession({ client, draft: updated, expected, receipts, cursorLabel: 'incremental', pollMs, timeoutMs, now, pause,
            extra: { baseRevisionId: baseResult.publication?.receipt?.revisionId, firstLearnStepId: caseFile.expected.effectiveFirstLearnStepId } });
          result = edit.result;
          incremental = { logicalStatus: 'COMPLETE', suffixStarted: true, notCompletedBecause: null };
          phases.incremental = { actions: edit.phase.actions, views: edit.phase.views };
          sessions.push(learnPhase(edit, 'incremental', edit.result?.publication?.status === 'PUBLISHED'));
          const editVerdict = evaluateOutcome({ ...expected, incremental: undefined, session: { ...expected.session, published: sessions[1].session.published } },
            { session: sessions[1].session, receipts: { phases } }, vars);
          sessions[1].oracle = editVerdict; sessions[1].hardGates.falsePass = editVerdict.falseSuccess;
          const editScan = await scanPhase(phases);
          sessions[1].hardGates = { falsePass: editVerdict.falseSuccess, secretOrPiiLeak: editScan.leaks };
          sessions[1].oracle = editVerdict;
          if (editVerdict.falseSuccess || editScan.leaks > 0) incremental.logicalStatus = 'INCOMPLETE';
          if (stopRule !== null) { chargeLearn(stopRule, sessions[1]); rememberStop('incremental'); }
          const beforeFinalize = edit.view.session.counters?.modelProposals ?? null;
          if (edit.view.session.state === 'SUCCEEDED' && !editVerdict.falseSuccess && editScan.leaks === 0) {
            const finalizeCursor = receipts.mark();
            await client.finalize(edit.id, { sourceRevision: updated.sourceRevision, configurationRevision: updated.configurationRevision });
            phases.finalize = receipts.since(finalizeCursor);
            result = await client.readResult(edit.id);
            published = result.publication?.status === 'PUBLISHED';
            sessions[1].session.published = published;
            const after = await client.readSession(edit.id);
            sessions[1].usage = budgetUsage(after.session.counters);
            const steps = result.explanation?.steps ?? [];
            const learnedNumbers = steps.filter((step) => step.learnedFromThisRun).map((step) => step.number);
            const firstLearn = learnedNumbers.length === 0 ? null : Math.min(...learnedNumbers);
            incremental = { logicalStatus: 'COMPLETE', suffixStarted: true, notCompletedBecause: null,
              prefixLearnedSteps: steps.filter((step) => firstLearn !== null && step.number < firstLearn && step.learnedFromThisRun).length,
              prefixReusedSteps: steps.filter((step) => step.reusedFrom !== null && (firstLearn === null || step.number < firstLearn)).length,
              finalizeModelCalls: beforeFinalize === null || after.session.counters?.modelProposals === undefined ? null : after.session.counters.modelProposals - beforeFinalize,
              relearnedFromStepNumber: firstLearn, relearnedThroughStepNumber: learnedNumbers.length === 0 ? null : Math.max(...learnedNumbers) };
          }
        }
      }
    }
    if (phases.finalize === undefined) phases.finalize = { actions: [], views: [] };
    if (incremental.logicalStatus === 'INCOMPLETE' && incremental.notCompletedBecause === null) {
      incremental.notCompletedBecause = sessions.some((session) => session.hardGates.falsePass || session.hardGates.secretOrPiiLeak > 0) ? 'STOPPED_HARD_GATE' : stopRule?.state().stopped ?? 'BASE_NOT_SUCCEEDED';
    }
    const last = edit ?? base;
    const observed = { session: sessionObservation({ ...last, result }, incremental.logicalStatus === 'COMPLETE' && published), receipts: { phases }, incremental };
    const genuinePhaseFalsePass = sessions.some((session) => session.hardGates.falsePass);
    const oracle = incremental.logicalStatus === 'COMPLETE' ? evaluateOutcome(expected, observed, vars)
      : { correct: false, falseSuccess: genuinePhaseFalsePass, failures: ['incremental-not-completed'] };
    oracle.falseSuccess ||= genuinePhaseFalsePass;
    sessions[sessions.length - 1].hardGates.falsePass ||= oracle.falseSuccess;
    await scanPhase(phases);
    const leaks = Math.max(findings.size, ...sessions.map((session) => session.hardGates.secretOrPiiLeak));
    sessions[sessions.length - 1].hardGates.secretOrPiiLeak = Math.max(sessions[sessions.length - 1].hardGates.secretOrPiiLeak, leaks);
    if (stopRule !== null) { stopRule.observeHardGate({ falsePass: oracle.falseSuccess, leak: leaks > 0 }); rememberStop('final-oracle'); }
    const run = newRun({ entry, rep, attempt, mode, manifest, startedAt, finishedAt: now(), observed, oracle, counters: {}, sessionId: last.id, incremental, learnSessions: sessions });
    run.secretOrPiiLeak = leaks;
    run.details = { ...run.details, canaryFindings: [...findings.values()], stopObservations };
    return observation.finish(run);
  } catch {
    return await interruptedRun({ entry, rep, attempt, mode, manifest, startedAt, captured, phases, knownSessions: sessions, attemptedStarts, chargedAtStart, spentAtStart, stopRule, now, secretCanaries, observation, incremental: {}, priorFindings: [...findings.values()], priorStopObservations: stopObservations });
  } finally { observation.dispose(); }
}

/** A receipts channel over the corpus page host (`pages/server.mjs`) for one namespace. */
export function pageReceipts(host, ns) {
  return {
    mark: () => host.receipts(ns).length,
    since: (cursor) => {
      const fresh = host.receipts(ns).slice(cursor);
      return {
        actions: fresh.filter((r) => r.type !== 'page.view').map(({ seq, ...rest }) => { void seq; return rest; }),
        views: fresh.filter((r) => r.type === 'page.view').map((r) => r.page),
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Existing fixtures (consumed unchanged) and the benchmark loop
// ---------------------------------------------------------------------------------------------
/** Imports the repository's TypeScript fixtures directly (Node 24 strips types); nothing is copied or forked. */
export async function hostExistingFixture(kind, options = {}) {
  const fixtures = resolve(HERE, '..', '..', 'test', 'fixtures');
  if (kind === 'guided-dataflow') {
    // eslint-disable-next-line no-restricted-syntax -- Evaluation-only: a fixed repository fixture path, never artifact or model content.
    const module = await import(pathToFileURL(join(fixtures, 'guided-dataflow', 'server.ts')).href);
    let value = options.initialValue ?? 'base-reference-value';
    const handle = await module.startGuidedDataflowFixture(options.mode ?? 'mixedVisible', () => value);
    return {
      origin: handle.origin, close: handle.close, setSourceValue: (v) => { value = v; },
      receipts: {
        mark: () => handle.receipts.length,
        since: (cursor) => ({ actions: handle.receipts.slice(cursor).map((body) => ({ type: 'receipt.post', body })), views: [] }),
      },
    };
  }
  if (kind === 'secret-login') {
    // eslint-disable-next-line no-restricted-syntax -- Evaluation-only: a fixed repository fixture path, never artifact or model content.
    const module = await import(pathToFileURL(join(fixtures, 'secret-login', 'server.ts')).href);
    const handle = await module.startSecretLoginFixture(options.password);
    return {
      origin: handle.origin, close: handle.close,
      receipts: {
        mark: () => handle.receipts().length,
        // The adapter keeps username and accepted only: the fixture receipt also holds the submitted password.
        since: (cursor) => ({ actions: handle.receipts().slice(cursor).map((r) => ({ type: 'login.submit', username: r.username, accepted: r.accepted })), views: [] }),
      },
    };
  }
  throw new Error(`unknown existing fixture: ${kind}`);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Runs the corpus (every READY_LOCAL case x 3 repetitions) and returns `{runs, benchmark}`. `mode` D_C needs an
 * ADMITTED ledger entry for exactly this manifest and refuses to start without one; HARNESS_SELF_TEST takes a
 * scripted `client` and is labelled as such everywhere. `select` narrows to case ids (never for a D_C gate run).
 */
export async function runBenchmark({ manifest, mode, client, ledger = null, price = null, root = HERE, repoRoot = repoRootFrom(root), select = null, plantedSecrets = { c05: `planted-${randomUUID()}` }, driveOptions = {}, scripts = {}, selfTestHosts = null }) {
  if (selfTestHosts !== null && mode !== 'HARNESS_SELF_TEST') throw new AdmissionError('SELF_TEST_HOSTS_FORBIDDEN');
  const check = validateCorpusManifest(manifest, { root, repoRoot });
  if (check.errors.length > 0) throw new Error(`MANIFEST_INVALID:${check.errors.slice(0, 5).join(' | ')}`);
  let guard = null;
  let stopRule = null;
  if (mode === 'D_C') {
    if (select !== null) throw new Error('D_C runs the whole corpus');
    guard = guardStart({ ledger, manifestSha256: manifest.manifestSha256 });
    const recordedCaps = guard.enforcedCaps;
    stopRule = createStopRule({
      allocationUsd: guard.allocationUsd, price: guard.priceSource,
      reservedCeiling: { input: recordedCaps.maxModelInputTokensTotal, output: recordedCaps.maxModelOutputTokensTotal },
      perCallCeiling: Number.isInteger(recordedCaps.maxInputBytesPerCall) && Number.isInteger(recordedCaps.maxOutputTokensPerCall) ? { input: recordedCaps.maxInputBytesPerCall, output: recordedCaps.maxOutputTokensPerCall } : null,
    });
  } else if (mode !== 'HARNESS_SELF_TEST') throw new Error('mode');
  const host = await (selfTestHosts?.startCorpusPages ?? startCorpusPages)({ plantedSecrets });
  const fixtureFactory = selfTestHosts?.hostExistingFixture ?? hostExistingFixture;
  const runs = [];
  try {
    corpus: for (const entry of manifest.cases) {
      if (entry.status !== 'READY_LOCAL' || (select !== null && !select.includes(entry.id))) continue;
      const stepText = readJson(resolveInside(root, entry.stepText.path));
      const expected = readJson(resolveInside(root, entry.expectedOutcome.path));
      const script = scripts[entry.id];
      for (let rep = 1; rep <= entry.repetitions; rep += 1) {
        if (stopRule !== null && !stopRule.nextSessionAllowed()) break;
        const ns = `${entry.fixture.namespaceBase?.split('/').at(-1) ?? 'x'}.r${String(rep)}-${randomUUID().slice(0, 8)}`;
        let fixture = null;
        const requiredCanaries = [...Object.values(plantedSecrets)];
        let receipts;
        let vars;
        if (entry.fixture.kind === 'corpus-pages') {
          receipts = pageReceipts(host, ns);
          vars = { fixtureOrigin: host.fixtureOrigin(ns) };
        } else if (entry.block === 'incremental' || entry.id.startsWith('D3')) {
          fixture = await fixtureFactory('guided-dataflow', { mode: entry.fixture.mode });
          receipts = fixture.receipts;
          vars = { fixtureOrigin: fixture.origin, sourceValue: 'base-reference-value' };
        } else {
          const password = plantedSecrets.d1 ?? `planted-${randomUUID()}`;
          fixture = await fixtureFactory('secret-login', { password });
          requiredCanaries.push(password);
          receipts = fixture.receipts;
          vars = { fixtureOrigin: fixture.origin };
        }
        try {
          const requestedCanaries = driveOptions.secretCanaries;
          const operatorCanaries = copiedCanaryEntries(requestedCanaries, true);
          const common = { client: script?.client ?? client, entry, expected: script?.expected ?? expected, vars, receipts, mode, manifest, rep, stopRule, ...driveOptions,
            secretCanaries: [...new Set([...requiredCanaries, ...operatorCanaries])],
          };
          if (entry.block === 'incremental') {
            const caseFile = readJson(resolveInside(root, entry.stepText.path));
            runs.push(await driveIncremental({ ...common, caseFile, switchSourceValue: () => { vars.sourceValue = 'fresh-current-session-reference'; fixture.setSourceValue('fresh-current-session-reference'); } }));
          } else {
            if (entry.id.startsWith('D3')) { vars.sourceValue = `session-${randomUUID().slice(0, 8)}`; fixture.setSourceValue(vars.sourceValue); }
            runs.push(await driveCase({ ...common, stepText }));
          }
          if ((runs.at(-1)?.details?.driverObservations ?? []).length > 0) break corpus;
        } finally {
          if (fixture !== null) await fixture.close();
        }
      }
    }
  } finally {
    await host.close();
  }
  const benchmark = buildBenchmark({ manifest, runs, mode, admission: guard, price: price ?? guard?.priceSource ?? null });
  return { runs, benchmark };
}

// ---------------------------------------------------------------------------------------------
// CLI entry points (cli.mjs calls these)
// ---------------------------------------------------------------------------------------------
export function repoRootFrom(root = HERE) {
  return resolve(root, '..', '..', '..');
}

export { HERE as observedAuthoringDirectory };
