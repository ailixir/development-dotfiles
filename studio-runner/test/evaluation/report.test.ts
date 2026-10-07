/**
 * Story 10.26 AC-3: unit checks of the evaluation report's denominator and unavailability rules
 * (spec §5–§6). Fixture-backed end-to-end coverage lives in `fixture-run.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  buildReport, percentile, renderReport, reportExitCode,
  type PlannedTrial, type RunContext, type TrialRecord, type Usage,
} from '../../evaluation/report.mjs';

const RUN: RunContext = {
  tier: 'T3', purpose: 'development', concurrency: 4, pins: { validator: '2.0.0', executor: '2.0.0', playwright: '1.63.0' },
  sourceCommit: 'abc', dirtyBaselineDigest: 'def', manifestDigest: 'ghi', fixtureVersion: '1.0.0',
  budgets: { maxApiCalls: 100, maxTransportCalls: 90, maxElapsedMs: 60_000 }, apiCalls: 40, reservedTransportCalls: 36,
  elapsedMs: 1234, stoppedBy: null, peakInFlightCompiles: 3,
};
const usage = (extra: Record<string, number | null> = {}): Usage => ({
  proposalCount: 1, repairCount: 0, transportAttemptCount: 1, inputTokens: 10, outputTokens: 5, thinkingTokens: 2,
  cancellationOutcome: null, elapsedMs: 50, ...extra,
});
const pass = (id: string, extra: Partial<TrialRecord> = {}): TrialRecord => ({
  id, expectedClass: 'SUPPORTED', complete: true, requestedMode: 'FULL', elapsedMs: 100, compileMs: 60,
  executionStatus: 'PASSED', candidateProduced: true, usage: usage(), runtime: { validator: '2.0.0' },
  oracle: { correct: true, falseSuccess: false, failures: [] }, ...extra,
});
const plan = (id: string, expectedClass: PlannedTrial['expectedClass'] = 'SUPPORTED'): PlannedTrial =>
  ({ id, expectedClass, requestedMode: 'FULL', family: id });

describe('evaluation report denominators', () => {
  it('keeps unrun and refused supported trials in the correctness and coverage denominators', () => {
    const report = buildReport({
      trials: [pass('a'), { id: 'b', expectedClass: 'SUPPORTED', complete: false, admissionRefused: true }],
      planned: [plan('a'), plan('b'), plan('c')], run: RUN, capacityEvents: [],
    });
    expect(report.correctness.behavioralCorrectness).toMatchObject({ numerator: 1, denominator: 3 });
    expect(report.coverage.supportedCoverage).toMatchObject({ numerator: 1, denominator: 3 });
    expect(report.correctness.incompleteSupported).toBe(2);
    expect(reportExitCode(report)).toBe(2);
  });

  it('keeps planned-but-never-seen trials from plain planned IDs in every class denominator (REL-001)', () => {
    const report = buildReport({ trials: [pass('a')], planned: ['a', 'b'], run: RUN, capacityEvents: [] });
    expect(report.coverage.plannedByClass).toMatchObject({ SUPPORTED: 1, UNKNOWN: 1 });
    expect(report.correctness.behavioralCorrectness).toMatchObject({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(report.coverage.supportedCoverage).toMatchObject({ numerator: 1, denominator: 2 });
    expect(report.falseSuccess.perSupportedTrial.denominator).toBe(2);
    expect(report.unsupportedOutcomes.UNSUPPORTED.correctNonExecutable).toMatchObject({ numerator: 0, denominator: 1 });
    expect(report.unsupportedOutcomes.CLARIFICATION.correctNonExecutable).toMatchObject({ numerator: 0, denominator: 1 });
    expect(report.correctness.behavioralCorrectness.denominatorDefinition).toContain('never observed');
    expect(report.evidenceGaps).toContain('planned trials without expected class');
    expect(reportExitCode(report)).toBe(2);
  });

  it('reports false success per supported trial and per PASS execution, excluding correct deliberate failures', () => {
    const report = buildReport({
      trials: [pass('a'), pass('b', { oracle: { correct: false, falseSuccess: true, failures: ['domain-events'] } }),
        pass('c', { executionStatus: 'FAILED' })],
      planned: [plan('a'), plan('b'), plan('c')], run: RUN, capacityEvents: [],
    });
    expect(report.falseSuccess.count).toBe(1);
    expect(report.falseSuccess.perSupportedTrial).toMatchObject({ numerator: 1, denominator: 3 });
    expect(report.falseSuccess.perPassExecution).toMatchObject({ numerator: 1, denominator: 2 });
    expect(reportExitCode(report)).toBe(1);
  });

  it('separates correct non-executable handling from wrong acceptance per prelabelled class', () => {
    const report = buildReport({
      trials: [
        { id: 'u1', expectedClass: 'UNSUPPORTED', complete: true, elapsedMs: 1, candidateProduced: false, oracle: { correct: true, falseSuccess: false } },
        { id: 'u2', expectedClass: 'UNSUPPORTED', complete: true, elapsedMs: 1, candidateProduced: true, oracle: { correct: false, falseSuccess: false } },
      ],
      planned: [plan('u1', 'UNSUPPORTED'), plan('u2', 'UNSUPPORTED'), plan('c1', 'CLARIFICATION')], run: RUN, capacityEvents: [],
    });
    expect(report.unsupportedOutcomes.UNSUPPORTED.correctNonExecutable).toMatchObject({ numerator: 1, denominator: 2 });
    expect(report.unsupportedOutcomes.UNSUPPORTED.wrongAcceptance).toMatchObject({ numerator: 1, denominator: 2 });
    expect(report.unsupportedOutcomes.CLARIFICATION.correctNonExecutable).toMatchObject({ numerator: 0, denominator: 1 });
    expect(report.unsupportedOutcomes.CLARIFICATION.incomplete).toBe(1);
  });

  it('never reports a token or transport total when any completed trial lacks it, and includes baseline usage', () => {
    const complete = buildReport({
      trials: [pass('a', { baseline: { usage: usage() } }), pass('b')], planned: [plan('a'), plan('b')], run: RUN, capacityEvents: [],
    });
    expect(complete.budgets.tokens.input).toEqual({ total: 30, availableTrials: 2, denominator: 2 });
    const partial = buildReport({
      trials: [pass('a'), pass('b', { usage: usage({ inputTokens: null }) })], planned: [plan('a'), plan('b')], run: RUN, capacityEvents: [],
    });
    expect(partial.budgets.tokens.input).toEqual({ total: null, availableTrials: 1, denominator: 2 });
    expect(partial.budgets.cost).toBe('unavailable');
    expect(partial.budgets.transport).toMatchObject({ reservedCalls: 36, maxTransportCalls: 90, apiCalls: 40, maxApiCalls: 100 });
  });

  it('counts repair yield only when the repaired trial is also independently correct', () => {
    const report = buildReport({
      trials: [pass('a', { usage: usage({ repairCount: 2 }) }),
        pass('b', { usage: usage({ repairCount: 1 }), oracle: { correct: false, falseSuccess: true, failures: ['application-state'] } }),
        pass('c', { usage: usage({ repairCount: null }) })],
      planned: [plan('a'), plan('b'), plan('c')], run: RUN, capacityEvents: [],
    });
    expect(report.repairs.enteredRepair).toMatchObject({ numerator: 2, denominator: 2 });
    expect(report.repairs.repairTelemetryMissing).toBe(1);
    expect(report.repairs.repairYield).toMatchObject({ numerator: 1, denominator: 2 });
    expect(report.repairs.totalRepairs).toEqual({ total: 3, availableTrials: 2, denominator: 2 });
    expect(report.repairs.regressions).toBe('unavailable');
  });

  it('measures capacity recovery as time from refusal to the next accepted admission', () => {
    const report = buildReport({
      trials: [pass('a')], planned: [plan('a')], run: RUN,
      capacityEvents: [{ type: 'ACCEPTED', atMs: 1 }, { type: 'REFUSED', atMs: 10 }, { type: 'ACCEPTED', atMs: 35 }, { type: 'REFUSED', atMs: 40 }],
    });
    if (report.capacity === 'unavailable') throw new Error('capacity must be reported');
    expect(report.capacity).toMatchObject({ admissionsOffered: 4, admissionsAccepted: 2, admissionsRefused: 2 });
    expect(report.capacity.refusalRate).toMatchObject({ numerator: 2, denominator: 4 });
    expect(report.capacity.recovery).toMatchObject({ numerator: 1, denominator: 2, p50Ms: 25, maxMs: 25 });
    expect(buildReport({ trials: [pass('a')], planned: [plan('a')], run: RUN }).capacity).toBe('unavailable');
  });

  it('states latency at the configured concurrency with missing samples visible', () => {
    const trials = [10, 20, 30, 40].map((ms, i) => pass(`t${String(i)}`, { compileMs: ms }));
    const report = buildReport({ trials, planned: [...trials.map(t => plan(t.id)), plan('missing')], run: RUN, capacityEvents: [] });
    expect(report.latency.concurrency).toEqual({ configuredWorkers: 4, peakInFlightCompiles: 3 });
    expect(report.latency.compileToCandidate).toMatchObject({ samples: 4, denominator: 5, missingSamples: 1, p50Ms: 20, p95Ms: 40 });
    expect(percentile([], 0.5)).toBeNull();
  });

  it('without run context the pins are unavailable, the gap is listed and the exit is incomplete', () => {
    const report = buildReport({ trials: [pass('a')], planned: ['a'] });
    expect(report.pins.declared).toBe('unavailable');
    expect(report.pins.inference).toEqual({ generation: 'unavailable', model: 'unavailable', prompt: 'unavailable' });
    expect(report.evidenceGaps).toContain('run context (pins, budgets, concurrency) unavailable');
    expect(reportExitCode(report)).toBe(2);
    const markdown = renderReport(report);
    expect(markdown).toContain('Declared: unavailable');
    expect(markdown).toContain('Generation/model/prompt pins: unavailable');
    expect(markdown).toContain('releaseReady: false');
  });

  it('renders every ratio with its numerator, denominator and denominator definition', () => {
    const markdown = renderReport(buildReport({ trials: [pass('a')], planned: [plan('a'), plan('b')], run: RUN, capacityEvents: [] }));
    const ratioLines = markdown.split('\n').filter(l => / \d+\/\d+ \(/.test(l));
    expect(ratioLines.length).toBeGreaterThanOrEqual(12);
    for (const l of ratioLines) expect(l).toMatch(/denominator: \S/);
    expect(markdown).toContain('Behavioral correctness: 1/2 (50.0%)');
  });
});
