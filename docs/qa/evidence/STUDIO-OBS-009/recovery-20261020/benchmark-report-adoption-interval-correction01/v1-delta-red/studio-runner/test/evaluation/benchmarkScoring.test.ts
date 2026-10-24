/**
 * STUDIO-OBS-009 AC-7 scoring and accounting (T0 QA B2/B7): the arithmetic comes out of the manifest, a partial
 * is never a pass, hard gates end the run, and the three accounting fields are present as zero. The run records
 * are synthetic UNIT-TEST INPUTS; nothing here is a benchmark result and a HARNESS_SELF_TEST run is never D-C evidence.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// eslint-disable-next-line no-restricted-imports -- Unit-only existing offline CLI, no provider/backend/native call.
import { spawnSync } from 'node:child_process';
import { SELF_TEST_LABEL, ZERO_FIELDS, buildBenchmark, canonicalJson, guardStart, repoRootFrom, sha256Hex, scoreReplayStability, validateRunRecord, type Benchmark, type ReviewDocument, type ReviewInput, type RunRecord } from '../../evaluation/observed-authoring/evaluate.mjs';
import { frozenManifest, must, reviewedInput, syntheticRuns } from './observedCorpus.js';

const manifest = frozenManifest();
const score = (runs: RunRecord[], mode: 'D_C' | 'HARNESS_SELF_TEST' = 'D_C') => buildBenchmark({ manifest, runs, mode, generatedAt: '2026-10-18T20:00:00.000Z', reviewInput: mode === 'D_C' ? reviewedInput(manifest, runs) : null });

describe('gate arithmetic on the corpus with the two staging cases unrun', () => {
  it('is PARTIAL (never a pass) at 51 runs when every run completes: the denominator drops to 17 x 3 and the floor to 46', () => {
    const result = score(syntheticRuns(manifest, { mode: 'D_C' }));
    expect(result.gate.classP).toMatchObject({ casesPlanned: 19, casesRunnable: 17, runsCredited: 51, completions: 51 });
    expect(result.gate.classP.runnableArithmetic).toMatchObject({ plannedRuns: 51, minCompletions: 46, maxFailedRuns: 5 });
    expect(result.gate.classP.fullArithmetic).toMatchObject({ plannedRuns: 57, minCompletions: 52, maxFailedRuns: 5 });
    expect(result.gate.verdict).toBe('PARTIAL');
    expect(result.gate.blockedUnrun.sort()).toEqual(['D2-login-staging-real', 'E1-sso-approved-origin']);
  });

  it('still reports PARTIAL at exactly 46 of 51 (90.2 percent) and GATE_FAIL at 45 of 51', () => {
    expect(score(syntheticRuns(manifest, { mode: 'D_C', failP: 5 })).gate).toMatchObject({ verdict: 'PARTIAL', classP: { completions: 46 } });
    const fail = score(syntheticRuns(manifest, { mode: 'D_C', failP: 6 }));
    expect(fail.gate.verdict).toBe('GATE_FAIL');
    expect(fail.gate.reasons[0]).toContain('45 < 46');
  });

  it('reports INCOMPLETE when planned runs are missing instead of dividing by what ran', () => {
    const result = score(syntheticRuns(manifest, { mode: 'D_C', dropP: 3 }));
    expect(result.gate.verdict).toBe('INCOMPLETE');
    expect(result.denominatorLedger.missingRuns).toHaveLength(3);
  });

  it('the full 57-run arithmetic is 52 of 57 = 91.2 percent passing and 51 of 57 = 89.5 percent failing', () => {
    const full = score(syntheticRuns(manifest, { mode: 'D_C' })).gate.classP.fullArithmetic;
    expect(full.minCompletions).toBe(52);
    expect(52 / full.plannedRuns).toBeGreaterThanOrEqual(0.9);
    expect(51 / full.plannedRuns).toBeLessThan(0.9);
  });
});

describe('completion without clarification', () => {
  it('does not credit a class P run that needed a clarification, even when the oracle is satisfied (no reclassification as ambiguous)', () => {
    const runs = syntheticRuns(manifest, { mode: 'D_C' });
    const asked = must(runs.find((r) => r.caseId === 'C06-forms-fill-save' && r.rep === 1));
    if (asked.session) asked.session.clarifications = 1;
    const result = score(runs);
    expect(result.gate.classP).toMatchObject({ runsCredited: 51, completions: 50, failedRuns: 1 });
    expect(result.gate.verdict).toBe('PARTIAL');
  });
});

describe('hard gates', () => {
  it('a false pass fails the gate even with every other run completing', () => {
    const result = score(syntheticRuns(manifest, { mode: 'D_C', falsePassCase: 'C08-intended-assertion-fail' }));
    expect(result.gate.verdict).toBe('GATE_FAIL');
    expect(result.hardGates).toMatchObject({ falsePasses: 1, falsePassRuns: [{ caseId: 'C08-intended-assertion-fail', rep: 1 }] });
  });

  it('a secret or PII leak fails the gate', () => {
    const result = score(syntheticRuns(manifest, { mode: 'D_C', leakCase: 'D1-login-secret-fixture' }));
    expect(result.gate.verdict).toBe('GATE_FAIL');
    expect(result.hardGates.secretOrPiiLeaks).toBe(1);
  });

  it.each([
    { observation: 'false pass', caseId: 'C08-intended-assertion-fail', falsePass: true, leak: 0 },
    { observation: 'secret or PII leak', caseId: 'D1-login-secret-fixture', falsePass: false, leak: 1 },
  ])('retains an earlier $observation after a clean final attempt is credited', ({ caseId, falsePass, leak }) => {
    const runs = syntheticRuns(manifest, { mode: 'D_C' });
    const target = must(runs.find((r) => r.caseId === caseId && r.rep === 1));
    const infra: RunRecord = {
      ...structuredClone(target), attempt: 1, infrastructureFailure: 'HOST_PORT_COLLISION',
      oracle: { correct: false, falseSuccess: falsePass, failures: ['synthetic-earlier-attempt'] },
      secretOrPiiLeak: leak,
    };
    if (infra.learnSessions) infra.learnSessions = infra.learnSessions.map((session) => ({ ...session, sessionId: `${session.sessionId}-earlier` }));
    target.attempt = 2;
    const result = score([infra, ...runs]);
    expect(result.denominatorLedger.problems).toEqual([]);
    expect(result.denominatorLedger.creditedRuns).toBe(69);
    expect(result.denominatorLedger.infrastructureFailures).toEqual([
      { caseId, rep: 1, attempt: 1, infrastructureFailure: 'HOST_PORT_COLLISION', rerun: true },
    ]);
    expect(result.gate.classP).toMatchObject({ runsCredited: 51, completions: 51, failedRuns: 0 });
    expect(result.gate.verdict).toBe('GATE_FAIL');
    expect(result.hardGates).toEqual({
      falsePasses: falsePass ? 1 : 0, secretOrPiiLeaks: leak,
      falsePassRuns: falsePass ? [{ caseId, rep: 1, attempt: 1 }] : [],
      leakRuns: leak > 0 ? [{ caseId, rep: 1, attempt: 1 }] : [],
    });
  });
});

describe('labels and honesty rules', () => {
  it('a HARNESS_SELF_TEST run is labelled and its verdict is NOT_EVIDENCE whatever it scores', () => {
    const result = score(syntheticRuns(manifest, { mode: 'HARNESS_SELF_TEST' }), 'HARNESS_SELF_TEST');
    expect(result.label).toBe(SELF_TEST_LABEL);
    expect(result.gate.verdict).toBe('NOT_EVIDENCE');
    expect(result.comparisonClaim).toBe('NONE_NO_COMPARISON_TO_20261004');
  });

  it('never reports a pass when a record mixes modes', () => {
    const runs = syntheticRuns(manifest, { mode: 'D_C' });
    const first = runs[0];
    if (first) first.mode = 'HARNESS_SELF_TEST';
    const result = score(runs);
    expect(result.gate.verdict).toBe('INVALID');
    expect(result.denominatorLedger.problems.some((p) => p.code === 'RUN_MODE_MISMATCH')).toBe(true);
  });

  it('refuses a run that started before the manifest freeze, and one that names another manifest', () => {
    const early = must(syntheticRuns(manifest, { mode: 'D_C' })[0]);
    early.runStartedAt = '2026-10-18T00:00:00.000Z';
    expect(validateRunRecord(early, manifest)).toContain('RUN_BEFORE_MANIFEST_FREEZE');
    const other = must(syntheticRuns(manifest, { mode: 'D_C' })[0]);
    other.manifestSha256 = 'e'.repeat(64);
    expect(validateRunRecord(other, manifest)).toContain('RUN_MANIFEST_SHA256');
  });

  it.each(ZERO_FIELDS)('refuses a run record that omits %s (written as 0 when none, never omitted)', (field) => {
    const run = must(syntheticRuns(manifest, { mode: 'D_C' })[0]) as unknown as Record<string, unknown>;
    Reflect.deleteProperty(run, field);
    expect(validateRunRecord(run, manifest)).toContain(`RUN_ZERO_FIELD_MISSING_${field}`);
  });

  it('writes the three accounting fields as explicit zeros with their denominators', () => {
    const accounting = score(syntheticRuns(manifest, { mode: 'D_C' })).accounting;
    for (const field of ZERO_FIELDS) expect(accounting[field as keyof typeof accounting]).toMatchObject({ gateP: { total: 0, runsCounted: 51 }, creditedAllClasses: { total: 0, runsCounted: 69 }, allAttempts: { total: 0, runsCounted: 69 } });
  });

  it('counts RS-1 gaps inside the gate denominator and lists them with case, element kind and run number', () => {
    const runs = syntheticRuns(manifest, { mode: 'D_C' });
    const hit = must(runs.find((r) => r.caseId === 'D3-dataflow-multistep' && r.rep === 2));
    hit.rs1NonScalarReadGaps = 1;
    hit.details = { rs1NonScalarReadGaps: [{ elementKind: 'span', eventRef: 'a'.repeat(64) }] };
    const result = score(runs);
    expect(result.accounting.rs1NonScalarReadGaps).toMatchObject({ gateP: { total: 1, items: [{ caseId: 'D3-dataflow-multistep', rep: 2, attempt: 1, elementKind: 'span' }] } });
    expect(result.gate.classP.runsCredited).toBe(51);
  });

  it('keeps an infrastructure-failed run visible and credits only its re-run; an unreported retry is a problem', () => {
    const runs = syntheticRuns(manifest, { mode: 'D_C' });
    const target = must(runs.find((r) => r.caseId === 'C01-rf-example-url' && r.rep === 1));
    const infra: RunRecord = { ...structuredClone(target), attempt: 1, infrastructureFailure: 'HOST_PORT_COLLISION' };
    if (infra.learnSessions) infra.learnSessions = infra.learnSessions.map((session) => ({ ...session, sessionId: `${session.sessionId}-earlier` }));
    target.attempt = 2;
    const reported = score([infra, ...runs]);
    expect(reported.denominatorLedger.infrastructureFailures).toEqual([expect.objectContaining({ caseId: 'C01-rf-example-url', infrastructureFailure: 'HOST_PORT_COLLISION', rerun: true })]);
    expect(reported.gate.classP.runsCredited).toBe(51);
    expect(reported.gate.classP).toMatchObject({ completions: 51, failedRuns: 0 });
    expect(reported.denominatorLedger.creditedRuns).toBe(69);
    expect(reported.gate.verdict).toBe('PARTIAL');
    expect(reported.hardGates).toEqual({ falsePasses: 0, secretOrPiiLeaks: 0, falsePassRuns: [], leakRuns: [] });
    const silent: RunRecord = { ...structuredClone(target), attempt: 1, infrastructureFailure: null };
    const hidden = score([silent, ...runs]);
    expect(hidden.denominatorLedger.problems.some((p) => p.code === 'UNREPORTED_RETRY')).toBe(true);
    expect(hidden.gate.verdict).toBe('INVALID');
  });

  it('publishes p50/p95 latency, model calls, tokens and cost with denominators; cost stays unavailable without a price', () => {
    const result = score(syntheticRuns(manifest, { mode: 'D_C' }));
    expect(result.latency.samples).toBe(69);
    expect(result.latency.p50Ms).not.toBeNull();
    expect(result.latency.p95Ms ?? -1).toBeGreaterThanOrEqual(result.latency.p50Ms ?? 0);
    expect(result.modelCalls.denominator).toBe(69);
    expect(result.tokens.complete).toBe(true);
    expect(result.costUsd.total).toBeNull();
    expect(result.costUsd.basis).toContain('UNAVAILABLE');
    const priced = buildBenchmark({ manifest, runs: syntheticRuns(manifest, { mode: 'D_C' }), mode: 'D_C', price: { pInPerMTok: 1, pOutPerMTok: 2 } });
    expect(priced.costUsd.total).toBeNull();
    expect(priced.costUsd.conservativeChargeUsd).toBeGreaterThan(0);
    expect(priced.tokens.basis).toBe('PUBLIC_BUDGET_COUNTERS');
  });

  it('reports class F and N separately, outside the completion denominator', () => {
    const result = score(syntheticRuns(manifest, { mode: 'D_C' }));
    expect(result.classFN).toMatchObject({ runs: 18, correct: 18 });
    expect(result.gate.classP.runsCredited).toBe(51);
  });
});

describe('replay stability (consensus plan s11): >= 98 percent over 100 replays with one artifact hash', () => {
  const replays = (ok: number, hashes: string[] = ['h']) => Array.from({ length: 100 }, (_v, i) => ({ ok: i < ok, artifactHash: hashes[i % hashes.length] ?? 'h' }));

  it('passes at 98 of 100 with one hash, fails at 97, fails when the hash drifts, fails when fewer than 100 replays ran', () => {
    expect(scoreReplayStability({ replays: replays(98), label: 'candidate' }).pass).toBe(true);
    expect(scoreReplayStability({ replays: replays(97), label: 'candidate' }).pass).toBe(false);
    expect(scoreReplayStability({ replays: replays(100, ['a', 'b']), label: 'candidate' })).toMatchObject({ pass: false, distinctArtifactHashes: 2 });
    expect(scoreReplayStability({ replays: replays(100).slice(0, 99), label: 'candidate' }).pass).toBe(false);
  });

  it('labels a self-test run NOT_EVIDENCE even when it passes', () => {
    expect(scoreReplayStability({ replays: replays(100) })).toMatchObject({ label: SELF_TEST_LABEL, verdict: 'NOT_EVIDENCE', pass: true });
  });
});

const reseal = <T>(reference: ReviewDocument<T>): void => { reference.fileText = canonicalJson(reference.value); reference.sha256 = sha256Hex(reference.fileText); };
const refreshOverlay = (input: ReviewInput): void => {
  input.overlayText = canonicalJson(input.overlay);
  if (input.adoption) { input.adoption.value.overlaySha256 = sha256Hex(input.overlayText); reseal(input.adoption); }
};

describe('reviewed cause accounting: groups 1, 2, 3 and 6 (synthetic inputs only)', () => {
  it('group1: an unreviewed generic budget failure is UNKNOWN rather than an observed zero', () => {
    const runs = syntheticRuns(manifest, { mode: 'D_C' });
    const first = must(runs[0]);
    if (first.session) { first.session.failureCode = 'BUDGET_EXCEEDED'; first.session.terminal = 'FAILED'; first.session.published = false; }
    first.oracle = { correct: false, falseSuccess: false, failures: ['synthetic-budget'] };
    const result = buildBenchmark({ manifest, runs, mode: 'D_C' });
    expect(result.gate.verdict).toBe('INVALID'); // Defining old semantic RED: PARTIAL, despite no review.
    expect(result.accounting.rs1NonScalarReadGaps.gateP).toMatchObject({ total: null, confirmedTotal: 0, unknownRuns: 51 });
    expect(result.corpusInspection).toMatchObject({ knownLocalCount: 23, confirmedRs1CaseCount: 0, unknownStagingCount: 2, globalRs1Total: null, unknownStagingCaseIds: ['D2-login-staging-real', 'E1-sso-approved-origin'] });
    expect(result.accounting.rs1NonScalarReadGaps.gateP.unknownIdentities).toContainEqual({ caseId: first.caseId, rep: first.rep, attempt: first.attempt });
    const reviewed = score(runs);
    expect(reviewed.accounting.rs1NonScalarReadGaps.gateP).toMatchObject({ total: 0, verifiedRuns: 51, unknownRuns: 0 });
    expect(reviewed.gate.classP.completions).toBe(50);
  });

  it('group1: plausible VERIFIED hashes cannot replace actual bound independent adoption', () => {
    const runs = syntheticRuns(manifest, { mode: 'D_C' });
    const input = reviewedInput(manifest, runs);
    input.adoption = null;
    const result = buildBenchmark({ manifest, runs, mode: 'D_C', reviewInput: input });
    expect(result.gate.verdict).toBe('INVALID');
    expect(result.accounting.rs1NonScalarReadGaps.allAttempts.total).toBeNull();
    const stale = reviewedInput(manifest, runs);
    const annotation = must(stale.overlay.annotations[0]);
    annotation.rawRecordSha256 = 'f'.repeat(64);
    refreshOverlay(stale);
    expect(buildBenchmark({ manifest, runs, mode: 'D_C', reviewInput: stale }).gate.verdict).toBe('INVALID');
  });

  it.each([
    { field: 'rs1NonScalarReadGaps', event: { eventRef: 'a'.repeat(64), elementKind: 'span' } },
    { field: 'authoredEchoUnobservableTargets', event: { eventRef: 'b'.repeat(64), step: 2, slot: 'value' } },
    { field: 'focusMutationRefusedFills', event: { eventRef: 'c'.repeat(64), step: 2 } },
  ] as const)('group2: $field binds real event references and preserves a failed class-P run', ({ field, event }) => {
    const runs = syntheticRuns(manifest, { mode: 'D_C' });
    const hit = must(runs.find((run) => run.caseId === 'D3-dataflow-multistep' && run.rep === 1));
    hit[field] = 1; hit.details = { [field]: [event] };
    if (hit.session) { hit.session.terminal = 'FAILED'; hit.session.published = false; hit.session.clarifications = 1; }
    hit.oracle = { correct: false, falseSuccess: false, failures: ['synthetic-cause'] };
    const malformed = structuredClone(hit); malformed.details = { [field]: [{ ...event, caseId: 'forged' }] };
    expect(validateRunRecord(malformed, manifest)).toContain(`RUN_CAUSE_EVENT_${field}`); // Old validator accepts the forged identity.
    const result = score(runs);
    expect(result.gate.classP).toMatchObject({ runsCredited: 51, completions: 50, failedRuns: 1 });
    expect(result.accounting[field].gateP).toMatchObject({ total: 1, runsCounted: 51, items: [{ ...event, caseId: hit.caseId, rep: 1, attempt: 1 }] });
    expect(result.hardGates).toMatchObject({ falsePasses: 0 });
  });

  it('group2: distinct same-element events survive incomplete scope while count/ref inconsistencies are refused', () => {
    const runs = syntheticRuns(manifest, { mode: 'D_C' });
    const first = must(runs[0]); first.rs1NonScalarReadGaps = 2;
    first.details = { rs1NonScalarReadGaps: [{ eventRef: 'a'.repeat(64), elementKind: 'span' }, { eventRef: 'b'.repeat(64), elementKind: 'span' }] };
    const mismatch = structuredClone(first); mismatch.rs1NonScalarReadGaps = 1;
    expect(validateRunRecord(mismatch, manifest)).toContain('RUN_CAUSE_DETAILS_rs1NonScalarReadGaps');
    const repeated = structuredClone(first); repeated.details = { rs1NonScalarReadGaps: [must(first.details.rs1NonScalarReadGaps?.[0]), must(first.details.rs1NonScalarReadGaps?.[0])] };
    expect(validateRunRecord(repeated, manifest)).toContain('RUN_CAUSE_EVENT_rs1NonScalarReadGaps');
    const input = reviewedInput(manifest, runs);
    const annotation = must(input.overlay.annotations[0]);
    const cause = annotation.causes.rs1NonScalarReadGaps;
    const review = must(input.reviews.find((ref) => ref.sha256 === cause.assessment.evidenceSha256));
    review.value.scope.complete = false; review.value.scope.justificationCode = 'PARTIAL_REVIEWED_SCOPE'; reseal(review);
    cause.assessment.status = 'UNKNOWN'; cause.assessment.evidenceSha256 = review.sha256;
    if (input.adoption) { const accepted = must(input.adoption.value.accepted.find((row) => row.rawOrdinal === 1 && row.field === 'rs1NonScalarReadGaps')); accepted.evidenceSha256 = review.sha256; }
    refreshOverlay(input);
    const result = buildBenchmark({ manifest, runs, mode: 'D_C', reviewInput: input });
    expect(result.accounting.rs1NonScalarReadGaps.gateP).toMatchObject({ confirmedTotal: 2, total: null, unknownRuns: 1 });
    expect(result.accounting.rs1NonScalarReadGaps.gateP.items).toHaveLength(2);
  });

  it('group3: final-P, credited-all and every supplied attempt have separate cause denominators', () => {
    const runs = syntheticRuns(manifest, { mode: 'D_C' });
    const target = must(runs.find((run) => run.caseId === 'C01-rf-example-url' && run.rep === 1));
    const earlier: RunRecord = { ...structuredClone(target), infrastructureFailure: 'HOST_PORT_COLLISION', rs1NonScalarReadGaps: 1,
      details: { rs1NonScalarReadGaps: [{ eventRef: 'd'.repeat(64), elementKind: 'span' }] } };
    if (earlier.learnSessions) earlier.learnSessions = earlier.learnSessions.map((session) => ({ ...session, sessionId: `${session.sessionId}-earlier` }));
    target.attempt = 2;
    const negative = must(runs.find((run) => run.caseId === 'C09-negation-trap' && run.rep === 1));
    negative.rs1NonScalarReadGaps = 1; negative.details = { rs1NonScalarReadGaps: [{ eventRef: 'e'.repeat(64), elementKind: 'div' }] };
    const result = score([earlier, ...runs]);
    const represented = result.accounting.rs1NonScalarReadGaps as unknown as { allAttempts?: { items: unknown[] }; items?: unknown[] };
    expect(represented.allAttempts?.items ?? represented.items).toHaveLength(2); // Old final-only reduction has only the F/N event.
    expect(result.accounting.rs1NonScalarReadGaps).toMatchObject({
      gateP: { total: 0, runsCounted: 51, fullPlannedRuns: 57, runnablePlannedRuns: 51 },
      creditedAllClasses: { total: 1, runsCounted: 69 }, allAttempts: { total: 2, runsCounted: 70 },
    });
    expect(result.accounting.rs1NonScalarReadGaps.allAttempts.items).toContainEqual({ eventRef: 'd'.repeat(64), elementKind: 'span', caseId: target.caseId, rep: 1, attempt: 1 });
    expect(result.gate.classP).toMatchObject({ runsCredited: 51, completions: 51 });
  });

  it('group6: immutable originals defeat hard-fact laundering and the offline branch writes fresh files without a client', () => {
    const clean = syntheticRuns(manifest, { mode: 'D_C' });
    const target = must(clean.find((run) => run.caseId === 'C01-rf-example-url' && run.rep === 1));
    const bad: RunRecord = { ...structuredClone(target), attempt: 1, infrastructureFailure: 'HOST_PORT_COLLISION', secretOrPiiLeak: 1,
      oracle: { correct: false, falseSuccess: true, failures: ['synthetic-earlier-hard-facts'] }, rs1NonScalarReadGaps: 1,
      details: { rs1NonScalarReadGaps: [{ eventRef: 'f'.repeat(64), elementKind: 'span' }], canaryFindings: [{ label: 'synthetic-closed' }] } };
    if (bad.learnSessions) bad.learnSessions = bad.learnSessions.map((session) => ({ ...session, sessionId: `${session.sessionId}-earlier` }));
    target.attempt = 2;
    const original = [bad, ...clean];
    const input = reviewedInput(manifest, original);
    const laundered = structuredClone(clean); must(laundered[0]).attempt = 1;
    const result = buildBenchmark({ manifest, runs: laundered, mode: 'D_C', reviewInput: input });
    expect(result.hardGates.falsePasses).toBe(1); // Defining old semantic RED: supplied cleaned records erase the original fact.
    expect(result.hardGates.secretOrPiiLeaks).toBe(1);
    expect(result.gate.verdict).toBe('INVALID');
    const legitimate = buildBenchmark({ manifest, runs: original, mode: 'D_C', reviewInput: input });
    expect(legitimate.gate.verdict).toBe('GATE_FAIL');
    expect(legitimate.gate.classP.completions).toBe(51);
    const duplicateOriginal = [bad, ...original];
    const duplicated = buildBenchmark({ manifest, runs: duplicateOriginal, mode: 'D_C', reviewInput: reviewedInput(manifest, duplicateOriginal) });
    expect(duplicated.gate.verdict).toBe('INVALID'); expect(duplicated.hardGates.falsePasses).toBe(2);
    const changes: ((review: ReviewInput) => void)[] = [
      (review) => { review.overlay.annotations.shift(); },
      (review) => { review.overlay.annotations.push(structuredClone(must(review.overlay.annotations[0]))); },
      (review) => { must(review.overlay.annotations[0]).rawOrdinal = 999; },
      (review) => { must(review.overlay.annotations[0]).attempt = 9; },
      (review) => { must(review.overlay.annotations[0]).causes.rs1NonScalarReadGaps = { ...must(review.overlay.annotations[0]).causes.rs1NonScalarReadGaps, count: 0, events: [] }; },
      ...['oracle', 'secretOrPiiLeak', 'session', 'infrastructureFailure', 'mode', 'usage', 'learnSessionsComplete'].map((key) => (review: ReviewInput) => { Object.assign(must(review.overlay.annotations[0]), { [key]: null }); }),
    ];
    for (const change of changes) {
      const altered = structuredClone(input); change(altered); refreshOverlay(altered);
      const refused = buildBenchmark({ manifest, runs: original, mode: 'D_C', reviewInput: altered });
      expect(refused.gate.verdict).toBe('INVALID');
      expect(refused.hardGates).toMatchObject({ falsePasses: 1, secretOrPiiLeaks: 1 });
    }
    // GREEN wiring control follows the defining assertion above; absent-command/setup errors never count as RED.
    const dir = mkdtempSync(join(tmpdir(), 'benchmark-review-'));
    try {
      const single = [must(syntheticRuns(manifest, { mode: 'D_C' })[0])];
      const closed = reviewedInput(manifest, single);
      const writeRef = (name: string, text: string) => { const path = join(dir, name); writeFileSync(path, text); return { path, sha256: sha256Hex(text) }; };
      const raw = writeRef('raw.jsonl', closed.rawRunsText); const annotations = writeRef('annotations.json', closed.overlayText);
      const manifestPath = join(dir, 'manifest.json'); writeFileSync(manifestPath, JSON.stringify(manifest));
      const config = { manifest: manifestPath, corpusRoot: join(repoRootFrom(), 'studio-runner/evaluation/observed-authoring'), mode: 'D_C', apiBaseUrl: 'not-a-url', rawRuns: raw, causeAnnotations: annotations,
        reviews: closed.reviews.map((review, i) => writeRef(`review-${String(i)}.json`, review.fileText)),
        independentQaAdoption: writeRef('adoption.json', must(closed.adoption ?? undefined).fileText), originalExecution: writeRef('execution.json', must(closed.execution ?? undefined).fileText), admissionLedger: writeRef('ledger.json', must(closed.ledger ?? undefined).fileText), intervalAdmissionLedger: writeRef('interval-ledger.json', must(closed.intervalLedger ?? undefined).fileText) };
      const configPath = join(dir, 'config.json'); writeFileSync(configPath, JSON.stringify(config)); const destination = join(dir, 'fresh');
      const argv = [join(repoRootFrom(), 'studio-runner/evaluation/cli.mjs'), 'benchmark-report', configPath, destination];
      const execute = () => spawnSync(process.execPath, argv, { encoding: 'utf8', env: { ...process.env, STUDIO_EVAL_API_TOKEN: '' }, timeout: 10_000 });
      const first = execute(); expect(first.error).toBeUndefined(); expect(first.status).toBe(2);
      const bytes = readFileSync(join(destination, 'benchmark.json'), 'utf8'); const offline = JSON.parse(bytes) as Benchmark;
      expect(offline.gate.verdict).toBe('INCOMPLETE'); expect(offline.reviewProvenance.status).toBe('BOUND_INDEPENDENT_QA_ADOPTION');
      expect(execute().status).toBe(2); expect(readFileSync(join(destination, 'benchmark.json'), 'utf8')).toBe(bytes);
      expect(sha256Hex(readFileSync(raw.path, 'utf8'))).toBe(raw.sha256);
      expect(offline.modelCalls.total).toBeNull(); expect(offline.costUsd.total).toBeNull();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('group6: later admission cannot retroactively authorize original execution or promote a self-test', () => {
    const runs = syntheticRuns(manifest, { mode: 'D_C' }); const input = reviewedInput(manifest, runs);
    const bindInterval = (review: ReviewInput, change: (history: NonNullable<ReviewInput['intervalLedger']>['value']) => void): void => {
      const history = must(review.intervalLedger ?? undefined); const receipt = must(review.execution ?? undefined); const adopted = must(review.adoption ?? undefined);
      change(history.value); reseal(history); receipt.value.intervalLedgerSha256 = history.sha256; reseal(receipt);
      adopted.value.intervalLedgerSha256 = history.sha256; adopted.value.executionReceiptSha256 = receipt.sha256; reseal(adopted);
    };
    const legitimate = buildBenchmark({ manifest, runs, mode: 'D_C', reviewInput: input });
    expect(legitimate.reviewProvenance.status).toBe('BOUND_INDEPENDENT_QA_ADOPTION');
    expect(legitimate.reviewProvenance.boundIndependentAdoption).toBe(true); expect(legitimate.gate.verdict).toBe('PARTIAL');
    const ledger = must(input.ledger ?? undefined); const execution = must(input.execution ?? undefined); const adoption = must(input.adoption ?? undefined);
    const entry = must(ledger.value.admissions[0]);
    entry.decidedAt = '2026-10-18T20:00:00.000Z'; entry.admittedAt = entry.decidedAt; reseal(ledger);
    execution.value.ledgerSha256 = ledger.sha256; execution.value.admissionEntrySha256 = sha256Hex(canonicalJson(entry)); reseal(execution);
    adoption.value.ledgerSha256 = ledger.sha256; adoption.value.executionReceiptSha256 = execution.sha256; reseal(adoption);
    bindInterval(input, (history) => { history.admissions = structuredClone(ledger.value.admissions); });
    expect(guardStart({ ledger: ledger.value, manifestSha256: manifest.manifestSha256, now: new Date('2026-10-18T21:00:00.000Z') }).status).toBe('ADMITTED');
    expect(buildBenchmark({ manifest, runs, mode: 'D_C', reviewInput: input }).gate.verdict).toBe('INVALID');
    for (const status of ['STOPPED_HARD_GATE', 'ADMISSION_REFUSED_PRICE_UNKNOWN', 'ADMITTED'] as const) {
      const intervened = reviewedInput(manifest, runs);
      const history = must(intervened.ledger ?? undefined); const receipt = must(intervened.execution ?? undefined); const accepted = must(intervened.adoption ?? undefined);
      const first = must(history.value.admissions[0]); const decidedAt = new Date(Date.parse(receipt.value.startedAt) + 1000).toISOString();
      history.value.admissions.push({ ...first, seq: 2, prevEntrySha256: sha256Hex(canonicalJson(first)), decidedAt, admittedAt: status === 'ADMITTED' ? decidedAt : null, status });
      reseal(history); receipt.value.ledgerSha256 = history.sha256; reseal(receipt);
      accepted.value.ledgerSha256 = history.sha256; accepted.value.executionReceiptSha256 = receipt.sha256; reseal(accepted);
      bindInterval(intervened, (terminal) => { terminal.admissions = structuredClone(history.value.admissions); });
      expect(buildBenchmark({ manifest, runs, mode: 'D_C', reviewInput: intervened }).gate.verdict).toBe('INVALID');
    }
    // BR-C2-01: start snapshot stays original; only the separately bound terminal history has the tail.
    const hardRuns = structuredClone(runs); const hard = must(hardRuns[0]);
    hard.oracle = { correct: false, falseSuccess: true, failures: ['synthetic-original-hard-fact'] }; hard.secretOrPiiLeak = 1;
    const finalRun = hardRuns.reduce((last, run) => Date.parse(run.runStartedAt) > Date.parse(last.runStartedAt) ? run : last, hard);
    const tailAt = Date.parse(finalRun.runStartedAt) + 1;
    expect(Date.parse(finalRun.runFinishedAt)).toBeGreaterThan(tailAt + 1);
    const unchangedStartHash = must(reviewedInput(manifest, hardRuns).ledger ?? undefined).sha256;
    for (const status of ['STOPPED_HARD_GATE', 'ADMISSION_REFUSED_PRICE_UNKNOWN', 'ADMITTED', 'STOP_THEN_READMIT'] as const) {
      const tail = reviewedInput(manifest, hardRuns);
      bindInterval(tail, (history) => {
        const prior = must(history.admissions.at(-1)); const decidedAt = new Date(tailAt).toISOString();
        const next = { ...prior, seq: prior.seq + 1, prevEntrySha256: sha256Hex(canonicalJson(prior)), decidedAt,
          admittedAt: status === 'ADMITTED' ? decidedAt : null, status: status === 'STOP_THEN_READMIT' ? 'STOPPED_HARD_GATE' : status };
        history.admissions.push(next);
        if (status === 'STOP_THEN_READMIT') {
          const readmittedAt = new Date(tailAt + 1).toISOString();
          history.admissions.push({ ...prior, seq: next.seq + 1, prevEntrySha256: sha256Hex(canonicalJson(next)), decidedAt: readmittedAt, admittedAt: readmittedAt, status: 'ADMITTED' });
        }
      });
      expect(must(tail.ledger ?? undefined).sha256).toBe(unchangedStartHash);
      const refused = buildBenchmark({ manifest, runs: hardRuns, mode: 'D_C', reviewInput: tail });
      expect(refused.reviewProvenance.boundIndependentAdoption).toBe(false); // Defining v1 delta RED: true despite the final-run interruption.
      expect(refused.gate.verdict).toBe('INVALID'); expect(refused.hardGates).toMatchObject({ falsePasses: 1, secretOrPiiLeaks: 1 });
      expect(refused.reviewProvenance.originalAttempts).toHaveLength(hardRuns.length);
    }
    for (const distinction of ['OTHER_PURPOSE', 'AFTER_ORIGINAL_END'] as const) {
      const allowed = reviewedInput(manifest, hardRuns); const receipt = must(allowed.execution ?? undefined);
      bindInterval(allowed, (history) => {
        const prior = must(history.admissions.at(-1));
        history.admissions.push({ ...prior, seq: prior.seq + 1, prevEntrySha256: sha256Hex(canonicalJson(prior)), status: 'STOPPED_HARD_GATE', admittedAt: null,
          purpose: distinction === 'OTHER_PURPOSE' ? 'ac8-schema-probe' : prior.purpose,
          decidedAt: new Date(distinction === 'OTHER_PURPOSE' ? tailAt : Date.parse(receipt.value.finishedAt ?? '') + 1).toISOString() });
      });
      const bound = buildBenchmark({ manifest, runs: hardRuns, mode: 'D_C', reviewInput: allowed });
      expect(bound.reviewProvenance.status).toBe('BOUND_INDEPENDENT_QA_ADOPTION'); expect(bound.gate.verdict).toBe('GATE_FAIL');
      expect(bound.hardGates).toMatchObject({ falsePasses: 1, secretOrPiiLeaks: 1 });
    }
    const incompleteBindings: ((review: ReviewInput) => void)[] = [
      (review) => { delete must(review.execution ?? undefined).value.finishedAt; },
      (review) => { must(review.execution ?? undefined).value.finishedAt = finalRun.runStartedAt; },
      (review) => { delete must(review.execution ?? undefined).value.intervalLedgerSha256; },
      (review) => { review.intervalLedger = null; },
      (review) => { const history = must(review.intervalLedger ?? undefined); history.fileText += ' '; },
      (review) => { must(review.adoption ?? undefined).value.originalIntervalHistoryReviewed = false; },
      (review) => { must(review.adoption ?? undefined).value.intervalLedgerSha256 = 'f'.repeat(64); },
    ];
    for (const change of incompleteBindings) {
      const unknown = reviewedInput(manifest, hardRuns); change(unknown);
      const receipt = must(unknown.execution ?? undefined); const accepted = must(unknown.adoption ?? undefined);
      reseal(receipt); accepted.value.executionReceiptSha256 = receipt.sha256; reseal(accepted);
      const refused = buildBenchmark({ manifest, runs: hardRuns, mode: 'D_C', reviewInput: unknown });
      expect(refused.reviewProvenance.boundIndependentAdoption).toBe(false); expect(refused.gate.verdict).toBe('INVALID');
      expect(refused.accounting.rs1NonScalarReadGaps.allAttempts.total).toBeNull(); expect(refused.hardGates).toMatchObject({ falsePasses: 1, secretOrPiiLeaks: 1 });
    }
    const missingRawEnd = structuredClone(hardRuns); Reflect.deleteProperty(must(missingRawEnd[0]), 'runFinishedAt');
    expect(validateRunRecord(must(missingRawEnd[0]), manifest)).toContain('RUN_TIMESTAMPS');
    const invalidEnd = buildBenchmark({ manifest, runs: missingRawEnd, mode: 'D_C', reviewInput: reviewedInput(manifest, missingRawEnd) });
    expect(invalidEnd.gate.verdict).toBe('INVALID'); expect(invalidEnd.hardGates).toMatchObject({ falsePasses: 1, secretOrPiiLeaks: 1 });
    const wrongManifest = reviewedInput(manifest, runs);
    const oldLedger = must(wrongManifest.ledger ?? undefined); const oldExecution = must(wrongManifest.execution ?? undefined); const oldAdoption = must(wrongManifest.adoption ?? undefined);
    const oldEntry = must(oldLedger.value.admissions[0]); oldEntry.manifestSha256 = 'e4785112885541c03f7ebed2b08bdc878a183d8e692b62140fa4491560df285b'; reseal(oldLedger);
    oldExecution.value.ledgerSha256 = oldLedger.sha256; oldExecution.value.admissionEntrySha256 = sha256Hex(canonicalJson(oldEntry)); reseal(oldExecution);
    oldAdoption.value.ledgerSha256 = oldLedger.sha256; oldAdoption.value.executionReceiptSha256 = oldExecution.sha256; reseal(oldAdoption);
    bindInterval(wrongManifest, (history) => { history.admissions = structuredClone(oldLedger.value.admissions); });
    expect(buildBenchmark({ manifest, runs, mode: 'D_C', reviewInput: wrongManifest }).gate.verdict).toBe('INVALID');
    const self = syntheticRuns(manifest, { mode: 'HARNESS_SELF_TEST' });
    expect(buildBenchmark({ manifest, runs: self, mode: 'D_C', reviewInput: reviewedInput(manifest, self) }).gate.verdict).toBe('INVALID');
    expect(buildBenchmark({ manifest, runs: self, mode: 'HARNESS_SELF_TEST' }).gate.verdict).toBe('NOT_EVIDENCE');
  });
});
