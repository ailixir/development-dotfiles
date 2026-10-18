/**
 * STUDIO-OBS-009 B6 / AC-9 local half: the independent outcome oracle and its mutation controls, applied to the
 * corpus's own expected outcomes. The positive control proves the oracle can say yes; each applicable mutant
 * (wrong target, reversed assertion, dropped submit, literal substitution) must be rejected. Harness self-test.
 */
import { describe, expect, it } from 'vitest';
import {
  MUTATION_KINDS, checkIsolation, evaluateOutcome, idealObservation, mutateObservation, oracleMutationControl, scanCanaries,
  type ExpectedOutcome, type Observation,
} from '../../evaluation/observed-authoring/evaluate.mjs';
import { expectedOf, frozenManifest } from './observedCorpus.js';

const admitted = frozenManifest().cases.filter((c) => c.status === 'READY_LOCAL');
const VARS = { sourceValue: 'v-1' };

describe('corpus oracles', () => {
  it.each(admitted.map((c) => [c.id, c] as const))('%s: accepts the ideal observation and rejects every applicable mutant', (_id, entry) => {
    const control = oracleMutationControl(expectedOf(entry), VARS);
    expect(control.positiveAccepted).toBe(true);
    const applicable = Object.entries(control.mutants).filter(([, m]) => m.applicable);
    expect(applicable.length).toBeGreaterThanOrEqual(2);
    for (const [kind, mutant] of applicable) expect(mutant.rejected, kind).toBe(true);
    expect(control.ok).toBe(true);
  });

  it('exercises all four mutation kinds somewhere in the corpus', () => {
    const seen = new Set<string>();
    for (const entry of admitted) {
      for (const [kind, mutant] of Object.entries(oracleMutationControl(expectedOf(entry), VARS).mutants)) if (mutant.applicable) seen.add(kind);
    }
    expect([...seen].sort()).toEqual([...MUTATION_KINDS].sort());
  });
});

describe('evaluateOutcome', () => {
  const expectedP = (): ExpectedOutcome => expectedOf(admitted.find((c) => c.id === 'C04-account-save') ?? (() => { throw new Error('C04'); })());
  const expectedN = (): ExpectedOutcome => expectedOf(admitted.find((c) => c.id === 'C09-negation-trap') ?? (() => { throw new Error('C09'); })());
  const expectedF = (): ExpectedOutcome => expectedOf(admitted.find((c) => c.id === 'C08-intended-assertion-fail') ?? (() => { throw new Error('C08'); })());

  it('does not take the system\'s own PASSED as the answer: a published SUCCEEDED run with the wrong receipts is a false success', () => {
    const expected = expectedP();
    const wrong: Observation = idealObservation(expected);
    const phase = wrong.receipts.phases.run;
    if (phase) phase.actions = [{ type: 'login.accepted', account: 'synthetic-user' }, { type: 'form.saved', account: 'other' }];
    const verdict = evaluateOutcome(expected, wrong);
    expect(verdict.correct).toBe(false);
    expect(verdict.falseSuccess).toBe(true);
    expect(verdict.failures).toContain('actions-run');
  });

  it('is not a false success when the system honestly fails a class P case', () => {
    const expected = expectedP();
    const failed = idealObservation(expected);
    failed.session = { ...failed.session, terminal: 'FAILED', published: false, failureCode: 'TARGET_MISMATCH' };
    const verdict = evaluateOutcome(expected, failed);
    expect(verdict.correct).toBe(false);
    expect(verdict.falseSuccess).toBe(false);
  });

  it('treats a published plan on a class N case as a false pass, and an executed action on N as a false pass even when the run fails', () => {
    const expected = expectedN();
    const published = idealObservation(expected);
    published.session = { ...published.session, terminal: 'SUCCEEDED', published: true };
    expect(evaluateOutcome(expected, published)).toMatchObject({ correct: false, falseSuccess: true });
    const acted = idealObservation(expected);
    const phase = acted.receipts.phases.run;
    if (phase) phase.actions = [{ type: 'record.delete', id: '1' }];
    expect(evaluateOutcome(expected, acted)).toMatchObject({ correct: false, falseSuccess: true });
  });

  it('accepts an honest refusal on a class N case and requires the clarification to be observed when the case says so', () => {
    const expected = expectedOf(admitted.find((c) => c.id === 'C12-clarify-click-button') ?? (() => { throw new Error('C12'); })());
    const good = idealObservation(expected);
    expect(evaluateOutcome(expected, good).correct).toBe(true);
    const guessed = idealObservation(expected);
    guessed.session = { ...guessed.session, terminal: 'FAILED', observedStates: ['FAILED'] };
    expect(evaluateOutcome(expected, guessed).failures).toContain('must-observe-AWAITING_CLARIFICATION');
  });

  it('requires class F to fail at the named step with the named code, and calls a PASS a false pass', () => {
    const expected = expectedF();
    expect(evaluateOutcome(expected, idealObservation(expected)).correct).toBe(true);
    const passed = idealObservation(expected);
    passed.session = { ...passed.session, terminal: 'SUCCEEDED', published: true, failureCode: null, failedStepNumber: null };
    expect(evaluateOutcome(expected, passed)).toMatchObject({ correct: false, falseSuccess: true });
    const wrongStep = idealObservation(expected);
    wrongStep.session = { ...wrongStep.session, failedStepNumber: 1 };
    expect(evaluateOutcome(expected, wrongStep).failures).toContain('failed-step');
  });

  it('refuses a view of a page the case does not list and a missing required view', () => {
    const expected = expectedP();
    const stray = idealObservation(expected);
    stray.receipts.phases.run?.views.push('elsewhere');
    expect(evaluateOutcome(expected, stray).failures).toContain('view-unlisted-page');
    const skipped = idealObservation(expected);
    if (skipped.receipts.phases.run) skipped.receipts.phases.run.views = [];
    expect(evaluateOutcome(expected, skipped).failures).toContain('view-required-trial');
  });

  it('resolves ${sourceValue} templates per session for the dataflow protocol (submit once, finalize adds none, two replays one each)', () => {
    const d3 = expectedOf(admitted.find((c) => c.id === 'D3-dataflow-multistep') ?? (() => { throw new Error('D3'); })());
    expect(Object.keys(d3.receipts.phases)).toEqual(['run', 'finalize', 'replay1', 'replay2']);
    const good = idealObservation(d3, { sourceValue: 'session-9' });
    expect(evaluateOutcome(d3, good, { sourceValue: 'session-9' }).correct).toBe(true);
    expect(evaluateOutcome(d3, good, { sourceValue: 'another-session' }).correct).toBe(false);
    const finalizeAdds = structuredClone(good);
    const finalize = finalizeAdds.receipts.phases.finalize;
    if (finalize) finalize.actions = [{ type: 'receipt.post', body: 'session-9' }];
    expect(evaluateOutcome(d3, finalizeAdds, { sourceValue: 'session-9' }).failures).toContain('actions-finalize');
  });

  it('checks the incremental counters: prefix steps reused and not relearned, finalize adds no model call, k..n relearned', () => {
    const inc = expectedOf(admitted.find((c) => c.id === 'incremental-edit-step-4') ?? (() => { throw new Error('inc'); })());
    const good = idealObservation(inc, {});
    expect(evaluateOutcome(inc, good, {}).correct).toBe(true);
    const relearnedPrefix = structuredClone(good);
    relearnedPrefix.incremental = { ...relearnedPrefix.incremental, prefixLearnedSteps: 2 };
    expect(evaluateOutcome(inc, relearnedPrefix, {}).failures).toContain('incremental-prefixLearnedSteps');
    const shortRange = structuredClone(good);
    shortRange.incremental = { ...shortRange.incremental, relearnedThroughStepNumber: 9 };
    expect(evaluateOutcome(inc, shortRange, {}).failures).toContain('incremental-relearned-range');
    const missing = structuredClone(good);
    delete missing.incremental;
    expect(evaluateOutcome(inc, missing, {}).failures).toContain('incremental-missing');
  });

  it('returns invalid-oracle-input, never a pass, for a malformed observation', () => {
    expect(evaluateOutcome(expectedP(), {} as Observation)).toEqual({ correct: false, falseSuccess: false, failures: ['invalid-oracle-input'] });
  });

  it('marks a dropped submit as not applicable where the case expects neither an action nor a view', () => {
    const expected = expectedN();
    const result = mutateObservation('droppedSubmit', idealObservation(expected), expected);
    expect(result.applicable).toBe(false);
  });
});

describe('AC-9 isolation and AC-10 canary scan (local halves)', () => {
  it('two sessions with the same secret id under CSI A and B each see only their own value', () => {
    expect(checkIsolation([
      { csiId: 'A', ownValue: 'value-a', observedValues: ['value-a'] },
      { csiId: 'B', ownValue: 'value-b', observedValues: ['value-b', 'value-b'] },
    ])).toEqual({ isolated: true, failures: [] });
  });

  it('rejects a cross-read and a foreign value, and identical own values', () => {
    const crossRead = checkIsolation([
      { csiId: 'A', ownValue: 'value-a', observedValues: ['value-a', 'value-b'] },
      { csiId: 'B', ownValue: 'value-b', observedValues: ['value-b'] },
    ]);
    expect(crossRead.isolated).toBe(false);
    expect(crossRead.failures).toContain('cross-read:A<-B');
    expect(checkIsolation([{ csiId: 'A', ownValue: 'x', observedValues: ['x'] }, { csiId: 'B', ownValue: 'x', observedValues: ['x'] }]).failures).toContain('own-values-not-distinct');
  });

  it('finds a planted secret canary in raw, JSON-escaped, URL-encoded and base64 form, and never echoes the canary', () => {
    const canary = 'planted/secret "canary" 4711';
    const texts = {
      diagnostics: 'ok', rawOutput: `value=${canary}`, journal: `{"v":${JSON.stringify(canary)}}`,
      sse: `data: ${encodeURIComponent(canary)}`, audit: Buffer.from(canary, 'utf8').toString('base64'),
    };
    const result = scanCanaries({ texts, secretCanaries: [canary] });
    expect(result.leaks).toBe(4);
    expect(result.findings.map((f) => f.label).sort()).toEqual(['audit', 'journal', 'rawOutput', 'sse']);
    expect(JSON.stringify(result)).not.toContain('4711');
  });

  it('is clean on clean text and requires the authored non-secret positive canary where asked (INPUT-POLICY-01 A)', () => {
    const clean = scanCanaries({ texts: { a: 'nothing here' }, secretCanaries: ['never-present'] });
    expect(clean.leaks).toBe(0);
    const missingPositive = scanCanaries({ texts: { a: 'nothing' }, secretCanaries: [], positiveCanary: 'authored-literal-日本語', requirePositive: true });
    expect(missingPositive.positiveCanaryOk).toBe(false);
    const present = scanCanaries({ texts: { gateway: 'send authored-literal-日本語 to the model' }, secretCanaries: [], positiveCanary: 'authored-literal-日本語', requirePositive: true });
    expect(present.positiveCanaryOk).toBe(true);
  });
});
