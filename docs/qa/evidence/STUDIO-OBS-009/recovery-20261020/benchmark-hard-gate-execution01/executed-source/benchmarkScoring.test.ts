/**
 * STUDIO-OBS-009 AC-7 scoring and accounting (T0 QA B2/B7): the arithmetic comes out of the manifest, a partial
 * is never a pass, hard gates end the run, and the three accounting fields are present as zero. The run records
 * are synthetic UNIT-TEST INPUTS; nothing here is a benchmark result and a HARNESS_SELF_TEST run is never D-C evidence.
 */
import { describe, expect, it } from 'vitest';
import { SELF_TEST_LABEL, ZERO_FIELDS, buildBenchmark, scoreReplayStability, validateRunRecord, type RunRecord } from '../../evaluation/observed-authoring/evaluate.mjs';
import { frozenManifest, must, syntheticRuns } from './observedCorpus.js';

const manifest = frozenManifest();
const score = (runs: RunRecord[], mode: 'D_C' | 'HARNESS_SELF_TEST' = 'D_C') => buildBenchmark({ manifest, runs, mode, generatedAt: '2026-10-18T20:00:00.000Z' });

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
    for (const field of ZERO_FIELDS) expect(accounting[field as keyof typeof accounting]).toMatchObject({ total: 0, runsCounted: 69 });
  });

  it('counts RS-1 gaps inside the gate denominator and lists them with case, element kind and run number', () => {
    const runs = syntheticRuns(manifest, { mode: 'D_C' });
    const hit = must(runs.find((r) => r.caseId === 'D3-dataflow-multistep' && r.rep === 2));
    hit.rs1NonScalarReadGaps = 1;
    hit.details = { rs1NonScalarReadGaps: [{ elementKind: 'span' }] };
    const result = score(runs);
    expect(result.accounting.rs1NonScalarReadGaps).toMatchObject({ total: 1, items: [{ caseId: 'D3-dataflow-multistep', rep: 2, elementKind: 'span' }] });
    expect(result.gate.classP.runsCredited).toBe(51);
  });

  it('keeps an infrastructure-failed run visible and credits only its re-run; an unreported retry is a problem', () => {
    const runs = syntheticRuns(manifest, { mode: 'D_C' });
    const target = must(runs.find((r) => r.caseId === 'C01-rf-example-url' && r.rep === 1));
    const infra: RunRecord = { ...structuredClone(target), attempt: 1, infrastructureFailure: 'HOST_PORT_COLLISION' };
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
    expect(priced.costUsd.total).toBeGreaterThan(0);
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
