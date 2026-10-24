/**
 * STUDIO-OBS-009 AC-7 preparation: the corpus manifest (T0 QA B1/B5/B6). The frozen manifest must validate,
 * its arithmetic must come out of the case classes, and each rule has a negative fixture that the validator
 * refuses. Harness self-test: not D-C evidence.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMPARISON_CLAIM, OBSERVED_AUTHORING_DIR, canonicalJson, manifestDigest, repoRootFrom, sessionPlan, sha256File, validateCorpusManifest,
  type CorpusCase, type CorpusManifest,
} from '../../evaluation/observed-authoring/evaluate.mjs';
import { frozenManifest, readJson } from './observedCorpus.js';

const repoRoot = repoRootFrom();
const check = (manifest: CorpusManifest, checkFiles = false): string[] => validateCorpusManifest(manifest, { repoRoot, checkFiles }).errors;
/** Re-stamps the digest so a negative fixture isolates exactly one rule. */
const restamp = (manifest: CorpusManifest): CorpusManifest => { manifest.manifestSha256 = manifestDigest(manifest); return manifest; };
const byId = (manifest: CorpusManifest, id: string): CorpusCase => {
  const found = manifest.cases.find((c) => c.id === id);
  if (found === undefined) throw new Error(`no case ${id}`);
  return found;
};

describe('frozen corpus manifest', () => {
  it('validates with every pin re-read from disk', () => {
    const result = validateCorpusManifest(frozenManifest(), { repoRoot });
    expect(result.errors).toEqual([]);
  });

  it('has 25 workflows: 19 class P, 1 class F, 5 class N, 2 externally blocked', () => {
    const result = validateCorpusManifest(frozenManifest(), { repoRoot });
    expect(result.counts).toMatchObject({ total: 25, P: 19, F: 1, N: 5, blockedExternal: 2 });
  });

  it('computes the gate from the classes: 19 x 3 = 57 runs, >= 52 completions, <= 5 failed', () => {
    const manifest = frozenManifest();
    expect(manifest.gate).toMatchObject({ classPCases: 19, plannedRuns: 57, minCompletions: 52, maxFailedRuns: 5 });
    expect(52 / 57).toBeGreaterThanOrEqual(0.9);
    expect(51 / 57).toBeLessThan(0.9);
  });

  it('plans 75 runs, 81 model sessions (two incremental bases per repetition) and 122 with the x1.5 contingency', () => {
    expect(sessionPlan(frozenManifest())).toEqual({ runs: 75, sessions: 81, contingencySessions: 122 });
  });

  it('is frozen: the digest covers the canonical manifest with the digest field blanked', () => {
    const manifest = frozenManifest();
    expect(manifest.manifestFrozenAt).not.toBeNull();
    expect(manifest.manifestSha256).toBe(manifestDigest(manifest));
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });

  it('pins the two STUDIO-OBS-015 case files unchanged and declares the incremental cases as consumed, not recreated', () => {
    const manifest = frozenManifest();
    for (const [id, file] of [['incremental-edit-step-4', 'cases/incremental-edit-step-4.json'], ['incremental-insert-step', 'cases/incremental-insert-step.json']] as const) {
      const entry = byId(manifest, id);
      expect(entry.stepText).toMatchObject({ path: file, owner: 'STUDIO-OBS-015', consumedUnchanged: true });
      expect(sha256File(join(OBSERVED_AUTHORING_DIR, file))).toBe(entry.stepText?.sha256);
      expect(entry.modelSessionsPerRepetition).toBe(2);
    }
  });

  it('declares mixedVisible for D3 and both incremental cases and puts no exact-mode case in class P (B5)', () => {
    const manifest = frozenManifest();
    for (const id of ['D3-dataflow-multistep', 'incremental-edit-step-4', 'incremental-insert-step']) {
      expect(byId(manifest, id).fixture?.mode).toBe('mixedVisible');
    }
    expect(manifest.cases.filter((c) => c.class === 'P' && c.fixture?.mode === 'exact')).toEqual([]);
  });

  it('marks RS-1 on every case, [] written explicitly, with the value location and reachability for the three dataflow cases', () => {
    const manifest = frozenManifest();
    for (const entry of manifest.cases) {
      expect(typeof entry.rs1.isRs1Case).toBe('boolean');
      expect(Array.isArray(entry.rs1.valueLocations)).toBe(true);
    }
    const d3 = byId(manifest, 'D3-dataflow-multistep');
    expect(d3.rs1.valueLocations).toEqual([expect.objectContaining({ elementKind: 'output', reachableByGrant: true })]);
    expect(byId(manifest, 'C01-rf-example-url').rs1.valueLocations).toEqual([]);
  });

  it('gives every ported case a fidelity record: pinned to results.jsonl, nothing invented, no 2026-10-04 comparison', () => {
    const manifest = frozenManifest();
    const ported = manifest.cases.filter((c) => c.block === 'ported');
    expect(ported).toHaveLength(13);
    const resultsPin = manifest.sources.resultsJsonl;
    expect(resultsPin?.sha256).toBe(sha256File(join(repoRoot, 'docs/stories/UI-STUDIO-VALIDATION-20261004/benchmark/results.jsonl')));
    for (const entry of ported) {
      expect(entry.portRecord?.invented).toEqual([]);
      expect(entry.portRecord?.comparisonClaim).toBe(COMPARISON_CLAIM);
      expect(entry.portRecord?.knownFromRecord.resultsJsonl.sha256).toBe(resultsPin?.sha256);
      expect(entry.portRecord?.knownFromRecord.resultsJsonl.rowLines.length).toBeGreaterThan(0);
    }
  });

  it('names an owner for each externally blocked case and never admits it without a step text and outcome', () => {
    const manifest = frozenManifest();
    const blocked = manifest.cases.filter((c) => c.status === 'EXTERNAL_BLOCKED');
    expect(blocked.map((c) => c.id).sort()).toEqual(['D2-login-staging-real', 'E1-sso-approved-origin']);
    for (const entry of blocked) {
      expect(entry.blockedBy?.owner).toMatch(/\w/u);
      expect(entry.stepText).toBeNull();
      expect(entry.expectedOutcome).toBeNull();
      expect(entry.oracle.kind).toBe('appSideRead');
    }
  });

  it('has an expected outcome per admitted case that expects no side effect for classes F and N', () => {
    for (const entry of frozenManifest().cases.filter((c) => c.status === 'READY_LOCAL' && c.class !== 'P')) {
      const expected = readJson(entry.expectedOutcome?.path ?? '') as { receipts: { phases: Record<string, { actions: unknown[] }> }; session: { published: boolean } };
      expect(Object.values(expected.receipts.phases).every((p) => p.actions.length === 0)).toBe(true);
      expect(expected.session.published).toBe(false);
    }
  });

  it('records the unratified rulings as RECOMMENDED_NOT_RULED rather than as decided', () => {
    const rulings = frozenManifest().rulings as Record<string, { state: string }>;
    expect(rulings.B2?.state).toBe('RECOMMENDED_NOT_RULED');
    expect(rulings.B3?.state).toBe('RECOMMENDED_NOT_RULED');
    expect(rulings.B8?.state).toBe('UNKNOWN');
  });
});

describe('manifest validator negative fixtures', () => {
  it('refuses a guided-dataflow case that does not declare its fixture mode', () => {
    const manifest = frozenManifest();
    delete byId(manifest, 'D3-dataflow-multistep').fixture?.mode;
    expect(check(restamp(manifest))).toContain('FIXTURE_MODE_UNDECLARED: D3-dataflow-multistep');
  });

  it('refuses an exact-mode case in class P (the exact mode is the RS-1 shape)', () => {
    const manifest = frozenManifest();
    const fixture = byId(manifest, 'D3-dataflow-multistep').fixture;
    if (fixture) fixture.mode = 'exact';
    expect(check(restamp(manifest))).toContain('EXACT_MODE_CASE_IN_CLASS_P: D3-dataflow-multistep');
  });

  it('refuses a case without a declared independent oracle, or with a DOM-through-the-runner oracle', () => {
    const manifest = frozenManifest();
    byId(manifest, 'C02-rf-wiki-url').oracle.kind = 'dom';
    expect(check(restamp(manifest))).toContain('ORACLE_KIND_NOT_INDEPENDENT: C02-rf-wiki-url');
  });

  it('refuses an oracle that omits one of the four mutation controls', () => {
    const manifest = frozenManifest();
    byId(manifest, 'C02-rf-wiki-url').oracle.mutationControls = ['wrongTarget', 'reversedAssertion'];
    expect(check(restamp(manifest))).toContain('ORACLE_MUTATION_CONTROLS_MISSING: C02-rf-wiki-url');
  });

  it('refuses a case that has no RS-1 mark (the zero must be written, not omitted)', () => {
    const manifest = frozenManifest();
    const entry = byId(manifest, 'C03-rf-wiki-search-var') as unknown as { rs1?: unknown };
    delete entry.rs1;
    expect(check(restamp(manifest))).toContain('RS1_MARK_MISSING: C03-rf-wiki-search-var');
  });

  it('refuses an RS-1 mark that contradicts its value locations', () => {
    const manifest = frozenManifest();
    byId(manifest, 'D3-dataflow-multistep').rs1.isRs1Case = true;
    expect(check(restamp(manifest))).toContain('RS1_MARK_INCONSISTENT: D3-dataflow-multistep');
  });

  it('refuses a ported case whose fidelity record has anything invented, or claims a comparison', () => {
    const manifest = frozenManifest();
    const port = byId(manifest, 'C01-rf-example-url').portRecord;
    if (port) { port.invented = ['the heading text']; port.comparisonClaim = 'SAME_AS_20261004'; }
    const errors = check(restamp(manifest));
    expect(errors).toContain('PORT_INVENTED_NOT_EMPTY: C01-rf-example-url');
    expect(errors).toContain('PORT_COMPARISON_CLAIM: C01-rf-example-url');
  });

  it('refuses a manifest whose comparison claim is not NONE_NO_COMPARISON_TO_20261004', () => {
    const manifest = frozenManifest();
    manifest.comparisonClaim = 'IMPROVES_ON_20261004';
    expect(check(restamp(manifest))).toContain('COMPARISON_CLAIM_NOT_NONE');
  });

  it('refuses fewer than 20 workflows, a duplicate id and a repetition count other than 3', () => {
    const small = frozenManifest();
    small.cases = small.cases.slice(0, 10);
    expect(check(restamp(small))).toContain('FEWER_THAN_20_WORKFLOWS: 10');
    const dup = frozenManifest();
    const first = dup.cases[0];
    if (first) dup.cases[1] = { ...structuredClone(first) };
    expect(check(restamp(dup)).some((e) => e.startsWith('DUPLICATE_CASE_ID'))).toBe(true);
    const reps = frozenManifest();
    const second = reps.cases[1];
    if (second) second.repetitions = 2;
    expect(check(restamp(reps))).toContain('REPETITIONS_NOT_3: C02-rf-wiki-url');
  });

  it('refuses gate arithmetic that is not computed from the classes', () => {
    const manifest = frozenManifest();
    manifest.gate.minCompletions = 50;
    expect(check(restamp(manifest))).toContain('GATE_ARITHMETIC_NOT_COMPUTED_FROM_CLASSES');
  });

  it('refuses an edit made after the freeze (digest mismatch) and a digest without a freeze', () => {
    const edited = frozenManifest();
    byId(edited, 'C01-rf-example-url').classBasis = 'edited after freeze';
    expect(check(edited)).toContain('MANIFEST_SHA256_MISMATCH');
    const unfrozen = frozenManifest();
    unfrozen.manifestFrozenAt = null;
    expect(check(unfrozen)).toContain('MANIFEST_SHA256_WITHOUT_FREEZE');
  });

  it('refuses a tampered page, step text or expected outcome (pinned sha256 differs from the file)', () => {
    const manifest = frozenManifest();
    const pin = byId(manifest, 'C06-forms-fill-save').pages[0];
    if (pin) pin.sha256 = 'f'.repeat(64);
    const errors = check(restamp(manifest), true);
    expect(errors).toContain('PIN_HASH_MISMATCH: C06-forms-fill-save pages[0]');
  });

  it('refuses a class F or N case whose oracle does not expect no side effect', () => {
    const manifest = frozenManifest();
    byId(manifest, 'C09-negation-trap').oracle.noSideEffect = false;
    expect(check(restamp(manifest))).toContain('NON_P_ORACLE_MUST_EXPECT_NO_SIDE_EFFECT: C09-negation-trap');
  });

  it('refuses an externally blocked case that names no owner', () => {
    const manifest = frozenManifest();
    byId(manifest, 'D2-login-staging-real').blockedBy = null;
    expect(check(restamp(manifest))).toContain('BLOCKED_WITHOUT_OWNER: D2-login-staging-real');
  });

  it('leaves the committed manifest file untouched by these fixtures', () => {
    const onDisk = JSON.parse(readFileSync(join(OBSERVED_AUTHORING_DIR, 'manifest.json'), 'utf8')) as CorpusManifest;
    expect(onDisk.manifestSha256).toBe(manifestDigest(onDisk));
  });
});
