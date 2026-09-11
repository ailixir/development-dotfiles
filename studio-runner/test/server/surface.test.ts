/**
 * The package's public surface after story 10.6, plus the logging and snapshot edges the
 * behavioural suite does not reach directly.
 *
 * `src/index.ts` is what the rest of the system imports. A re-export that silently disappears in
 * a refactor breaks a consumer at build time and nowhere else, so the surface is asserted here.
 */
import { describe, expect, it } from 'vitest';

import * as packageSurface from '../../src/index.js';
import * as reportingSurface from '../../src/reporting/index.js';
import * as serverSurface from '../../src/server/index.js';
import { createCounters, createLogger, createRecordingLogSink, createStdoutSink } from '../../src/server/logging.js';
import { createRedactor } from '../../src/executor/redaction.js';
import { createRunSnapshot, serializeBounded } from '../../src/reporting/snapshot.js';
import { DEFAULT_REPORT_BOUNDS, boundSteps, byteLength } from '../../src/reporting/bounds.js';
import { PERMITTED_DESTINATIONS } from '../../src/server/config.js';

describe('package surface', () => {
  it('exports the server and reporting surfaces from the package entry point', () => {
    for (const name of [
      'createApplication',
      'createCapacityPool',
      'createIdentityChecker',
      'createRunCoordinator',
      'createRunnerServer',
      'loadConfig',
    ]) {
      expect(packageSurface, name).toHaveProperty(name);
      expect(serverSurface).toHaveProperty(name);
    }
    for (const name of [
      'createAdmissionClient',
      'createReportClient',
      'createRunReporter',
      'createRunSnapshot',
      'createFetchHttpClient',
      'validateEnvelope',
    ]) {
      expect(packageSurface, name).toHaveProperty(name);
      expect(reportingSurface).toHaveProperty(name);
    }
  });

  it('still exports what stories 10.2 and 10.3 shipped', () => {
    for (const name of ['validateArtifact', 'executeSteps', 'createRedactor', 'isCompatible']) {
      expect(packageSurface).toHaveProperty(name);
    }
  });

  it('names the three destinations the runner may talk to, and no fourth', () => {
    expect([...PERMITTED_DESTINATIONS]).toEqual(['callback-api', 'object-store', 'target-page']);
  });
});

describe('logging', () => {
  it('serializes first and redacts second, so an unenumerated field is still scrubbed', () => {
    const sink = createRecordingLogSink();
    const logger = createLogger({ sink, clock: () => 'T' }).withRedactor(
      createRedactor(['top-secret']),
    );

    logger.info('event', { executionId: 'exec-1', fieldNobodyEnumerated: 'top-secret' });

    expect(sink.lines).toHaveLength(1);
    expect(sink.lines[0]).toContain('[REDACTED]');
    expect(sink.lines[0]).not.toContain('top-secret');
    expect(sink.lines[0]).toContain('"executionId":"exec-1"');
  });

  it('supports every level and keeps counters across derived loggers', () => {
    const sink = createRecordingLogSink();
    const counters = createCounters();
    const logger = createLogger({ sink, counters });

    logger.info('a');
    logger.warn('b');
    logger.error('c');
    logger.record('warn', 'd', 'metric.one');
    logger.withRedactor(createRedactor([])).record('error', 'e', 'metric.one');

    expect(sink.lines).toHaveLength(5);
    expect(counters.snapshot()['metric.one']).toBe(2);
    counters.increment('metric.two', 5);
    expect(counters.snapshot()['metric.two']).toBe(5);
  });

  it('has a stdout sink for the platform log collector', () => {
    expect(typeof createStdoutSink().write).toBe('function');
  });
});

describe('snapshot and bounds edges', () => {
  const identity = {
    executionId: 'exec-1',
    attemptId: 'attempt-1',
    admissionId: 'adm-1',
    runnerInstanceId: 'runner-a',
  };

  it('marks the browser start once, and only once', () => {
    let tick = 0;
    const snapshot = createRunSnapshot({
      identity,
      bounds: DEFAULT_REPORT_BOUNDS,
      runtimeVersions: {},
      wallClock: () => {
        tick += 1;
        return new Date(tick * 1000);
      },
    });

    snapshot.markBrowserStarted();
    const first = snapshot.build('STARTED').browserStartedAt;
    snapshot.markBrowserStarted();
    expect(snapshot.build('PROGRESS').browserStartedAt).toBe(first);
  });

  it('records a RUNNING step and replaces it with the finished outcome', () => {
    const snapshot = createRunSnapshot({
      identity,
      bounds: DEFAULT_REPORT_BOUNDS,
      runtimeVersions: {},
      wallClock: () => new Date(0),
    });

    snapshot.stepStarted(0, 10);
    expect(snapshot.build('PROGRESS').steps[0]?.status).toBe('RUNNING');

    snapshot.stepFinished({
      stepIndex: 0,
      status: 'PASSED',
      startedAtMs: 10,
      finishedAtMs: 20,
      durationMs: 10,
      failure: null,
    });
    const report = snapshot.build('PROGRESS');
    expect(report.steps[0]?.status).toBe('PASSED');
    // Two builds so far in this test, so the second consumes sequence 2. `build` is the only
    // thing that advances it, which is what keeps it strictly increasing (AC-13).
    expect(report.runnerSequence).toBe(2);
    expect(snapshot.lastSequence).toBe(2);
  });

  it('appends bounded log entries through the snapshot', () => {
    const snapshot = createRunSnapshot({
      identity,
      bounds: { ...DEFAULT_REPORT_BOUNDS, maxLogEntries: 1 },
      runtimeVersions: {},
      wallClock: () => new Date(0),
    });
    snapshot.appendLog({ atMs: 1, level: 'info', message: 'first' });
    snapshot.appendLog({ atMs: 2, level: 'info', message: 'second' });
    const report = snapshot.build('PROGRESS');
    expect(report.logs.map((entry) => entry.message)).toEqual(['second']);
    expect(report.logsTruncated).toBe(true);
  });

  it('emits the minimal form when the bound sits below the irreducible floor', () => {
    const snapshot = createRunSnapshot({
      identity,
      bounds: DEFAULT_REPORT_BOUNDS,
      runtimeVersions: { playwright: '1.63.0' },
      wallClock: () => new Date(0),
    });
    snapshot.appendLog({ atMs: 1, level: 'info', message: 'x'.repeat(200) });
    snapshot.stepStarted(0, 1);
    const body = snapshot.build('FINAL', { result: 'PASSED', errorCode: null, errorMessage: null });

    const serialized = serializeBounded(body, { ...DEFAULT_REPORT_BOUNDS, maxBodyBytes: 10 });
    const parsed = JSON.parse(serialized) as { logs: unknown[]; steps: unknown[] };
    expect(parsed.logs).toEqual([]);
    expect(parsed.steps).toEqual([]);
  });

  it('bounds a step list and measures UTF-8 length', () => {
    expect(boundSteps([1, 2, 3], 2)).toEqual([1, 2]);
    expect(boundSteps([1, 2], 5)).toEqual([1, 2]);
    expect(byteLength('é')).toBe(2);
  });
});
