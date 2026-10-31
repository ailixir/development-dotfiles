/**
 * SC008-E6: the step receipt (stepHash, fenceCrossed, effects, effectsTruncated, offscreen, closedCode) travels from the executor's
 * stepFinished into RunnerStepState on every report the runner builds, byte for byte, and is absent for a step that carries none.
 */
import { describe, expect, it } from 'vitest';

import type { StepReceipt } from '../../src/executor/observedOperations.js';
import type { StepFinishedEvent } from '../../src/executor/stepReporter.js';
import { NULL_REDACTOR } from '../../src/executor/redaction.js';
import { validate } from '../../src/guided/contracts.js';
import { DEFAULT_REPORT_BOUNDS } from '../../src/reporting/bounds.js';
import { createRunReporter } from '../../src/reporting/reportingStepReporter.js';
import { createRunSnapshot, serializeBounded } from '../../src/reporting/snapshot.js';

const snapshot = () => createRunSnapshot({ identity: { executionId: 'execution', attemptId: 'attempt', admissionId: 'admission', runnerInstanceId: 'runner' }, bounds: DEFAULT_REPORT_BOUNDS, runtimeVersions: {}, wallClock: () => new Date('2026-10-10T00:00:00Z'), redactor: NULL_REDACTOR });
const receipt: StepReceipt = { closedCode: 'OUTCOME_UNKNOWN', stepHash: 'a'.repeat(64), fenceCrossed: true, effects: [{ method: 'click', completed: false }, { method: 'fill', completed: true }], effectsTruncated: false, offscreen: true };
const failed: StepFinishedEvent = { stepIndex: 1, status: 'FAIL', startedAtMs: 1.5, finishedAtMs: 2.75, durationMs: 1.25, failure: 'OUTCOME_UNKNOWN', receipt };
const client = { stopped: false, sentBodies: [], deliverProgress: () => Promise.resolve(), deliverTerminal: () => Promise.resolve() } as never;

describe('the receipt reaches the report', () => {
  it('copies the receipt of a finished step into the step entry of the progress report, unchanged', () => {
    const reporter = createRunReporter({ snapshot: snapshot(), client });
    reporter.browserStarted({ browserStartedAt: new Date('2026-10-10T00:00:00Z'), startedAtMs: 0 });
    reporter.stepStarted({ stepIndex: 1, startedAtMs: 1.5 });
    expect(reporter.built.at(-1)?.steps[0]).not.toHaveProperty('receipt');
    reporter.stepFinished(failed);
    const entry = reporter.built.at(-1)?.steps[0];
    expect(entry).toEqual({ stepIndex: 1, status: 'FAIL', startedAtMs: 1.5, finishedAtMs: 2.75, durationMs: 1.25, failure: 'OUTCOME_UNKNOWN', receipt });
  });

  it('leaves the key out for a step that carries no receipt, and keeps it through serialization', () => {
    const s = snapshot();
    s.markBrowserStarted(new Date('2026-10-10T00:00:00Z'));
    s.stepFinished({ stepIndex: 0, status: 'SKIPPED', startedAtMs: null, finishedAtMs: null, durationMs: null, failure: null });
    s.stepFinished({ stepIndex: 1, status: 'FAIL', startedAtMs: 1.5, finishedAtMs: 2.75, durationMs: 1.25, failure: 'OUTCOME_UNKNOWN', receipt });
    const body = s.build('FINAL', { result: 'FAILED', errorCode: 'OUTCOME_UNKNOWN', errorMessage: null }, { videoKey: null, manifestKey: null, state: 'UNAVAILABLE', partial: false });
    expect(body.steps[0]).not.toHaveProperty('receipt');
    const wire = JSON.parse(serializeBounded(body, DEFAULT_REPORT_BOUNDS)) as { steps: { receipt?: StepReceipt }[] };
    expect(wire.steps[1]?.receipt).toEqual(receipt);
  });

  it('carries method names and flags only: no argument, no text', () => {
    const reporter = createRunReporter({ snapshot: snapshot(), client });
    reporter.browserStarted({ browserStartedAt: new Date('2026-10-10T00:00:00Z'), startedAtMs: 0 });
    reporter.stepFinished(failed);
    const serialized = JSON.stringify(reporter.built.at(-1));
    expect(Object.keys((reporter.built.at(-1)?.steps[0] as { receipt: object }).receipt).sort()).toEqual(['closedCode', 'effects', 'effectsTruncated', 'fenceCrossed', 'offscreen', 'stepHash']);
    expect(serialized).not.toMatch(/https?:|password|CANARY/iu);
  });

  it('a step a cancel interrupted is SKIPPED with the child\'s CANCELLED receipt, and that receipt validates against the frozen step-receipt schema (which does not couple it to the step status)', () => {
    const cancelled: StepReceipt = { closedCode: 'CANCELLED', stepHash: 'b'.repeat(64), fenceCrossed: true, effects: [{ method: 'click', completed: false }], effectsTruncated: false, offscreen: false };
    expect(validate('step-receipt', cancelled)).toEqual(cancelled);
    expect(() => validate('step-receipt', { ...cancelled, errorCode: 'CANCELLED' })).toThrow('SCHEMA'); // the schema is closed: no stray key rides along
    const s = snapshot();
    s.markBrowserStarted(new Date('2026-10-10T00:00:00Z'));
    s.stepFinished({ stepIndex: 0, status: 'SKIPPED', startedAtMs: 1.5, finishedAtMs: null, durationMs: null, failure: 'stopped', receipt: cancelled });
    const body = s.build('FINAL', { result: 'ERROR', errorCode: 'RUN_ERROR', errorMessage: 'CANCELLED' }, { videoKey: null, manifestKey: null, state: 'UNAVAILABLE', partial: false });
    const wire = JSON.parse(serializeBounded(body, DEFAULT_REPORT_BOUNDS)) as { steps: { status: string; receipt: StepReceipt }[] };
    expect(wire.steps[0]).toMatchObject({ status: 'SKIPPED', receipt: cancelled });
    expect(validate('step-receipt', wire.steps[0]?.receipt)).toEqual(cancelled);
  });
});

