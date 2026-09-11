/**
 * AC-10, AC-11 — the run timeline **on the wire**, through the assembled runner.
 *
 * `test/run/timeline.test.ts` asserts the origin is taken correctly. This asserts the readings
 * that origin produces survive to a serialized report body, which is where ADR-002's invariant
 * actually has to hold: the API derives `at = browserStartedAt + atMs` and 10.16 seeks a video by
 * `offsetMs`, so a correct origin that is dropped between the clock and the callback would be no
 * better than no origin at all.
 *
 * The assertions are made on the bytes the runner hands to its HTTP client, not on intermediate
 * objects — the same posture `test/contract.test.ts` takes, and for the same reason.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { takeProcessOriginForFalsification } from '../../src/run/timeline.js';
import { DEFAULT_REPORT_BOUNDS } from '../../src/reporting/bounds.js';
import { createRunSnapshot } from '../../src/reporting/snapshot.js';
import type { ReportBody } from '../../src/reporting/snapshot.js';
import { createHarness, SERVICE_TOKEN, until } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { post, validJob } from '../helpers/runner.js';
import { NULL_REDACTOR } from '../../src/executor/redaction.js';

let harness: Harness | null = null;

async function start(options?: Parameters<typeof createHarness>[0]): Promise<Harness> {
  harness = createHarness(options);
  await harness.start();
  return harness;
}

afterEach(async () => {
  await harness?.stop();
  harness = null;
});

function reports(runner: Harness): ReportBody[] {
  return runner.http.reportRequests.map((request) => JSON.parse(request.body) as ReportBody);
}

async function runOnce(runner: Harness): Promise<void> {
  const response = await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
  expect(response.status).toBe(202);
  await until(() => runner.app.coordinator.inFlight === 0);
}

/**
 * The bound AC-11.3 names.
 *
 * It is a *scale* assertion, not a precision one: the point is that a reading is an offset from
 * the browser start rather than from process start, and those two differ by orders of magnitude,
 * not by milliseconds. A tighter bound would be measuring the machine.
 */
const SMALL_BOUND_MS = 250;

describe('AC-11.3 — every reading in the report is on the run timeline', () => {
  it('puts the first step reading and the STARTED log entry within a small bound of 0', async () => {
    const runner = await start();
    await runOnce(runner);

    const bodies = reports(runner);
    const started = bodies.find((body) => body.kind === 'STARTED');
    expect(started).toBeDefined();

    // The browser-start line is a reading that happens to be 0 (AC-10), not a literal.
    const browserStartLine = started?.logs.find((entry) => entry.message === 'browser started');
    expect(browserStartLine?.atMs).toBe(0);

    const final = bodies.at(-1);
    expect(final?.kind).toBe('FINAL');
    const firstStep = final?.steps[0];
    expect(firstStep?.startedAtMs).toBeGreaterThanOrEqual(0);
    expect(firstStep?.startedAtMs ?? Number.NaN).toBeLessThan(SMALL_BOUND_MS);

    // Every log reading in the same report lies on the same origin, is non-negative, and `null`
    // still means "no reading" rather than "the browser start" (ADR-002 §4.1).
    for (const entry of final?.logs ?? []) {
      if (entry.atMs === null) continue;
      expect(entry.atMs).toBeGreaterThanOrEqual(0);
      expect(entry.atMs).toBeLessThan(SMALL_BOUND_MS);
    }
    // The terminal run line is not a reading: nothing was sampled to produce it.
    expect(final?.logs.at(-1)?.atMs).toBeNull();
  });

  it('FAILS with a process-origin clock — the same run, the defect reinstated', async () => {
    // AC-11.3 requires the assertion above to go red when the run clock is replaced by a
    // process-origin one. This is that run, with the substitution made deliberately, so the guard
    // is one that has been seen to fail.
    const uptimeMs = 87_432.5;
    let reads = 0;
    const runner = await start({
      takeOrigin: () =>
        takeProcessOriginForFalsification({
          monotonicNow: () => uptimeMs + reads++,
          wallNow: () => new Date('2026-09-11T10:00:00.000Z'),
        }),
    });
    await runOnce(runner);

    const final = reports(runner).at(-1);
    expect(final?.steps[0]?.startedAtMs ?? Number.NaN).toBeGreaterThan(SMALL_BOUND_MS);
  });

  it('keeps SKIPPED timings null rather than filing them at the browser start', async () => {
    const runner = await start();
    const original = runner.launcher.launch.bind(runner.launcher);
    Object.assign(runner.launcher, {
      async launch(options: Parameters<typeof original>[0]) {
        const session = await original(options);
        runner.launcher.adapters.at(-1)?.failOn('goto', new Error('NavigationError: refused'));
        return session;
      },
    });
    await runOnce(runner);

    const final = reports(runner).at(-1);
    expect(final?.steps[1]).toMatchObject({
      status: 'SKIPPED',
      startedAtMs: null,
      finishedAtMs: null,
      durationMs: null,
    });
  });
});

describe('AC-11.4 — a report with browserStartedAt: null carries no reading', () => {
  it('nulls every reading on the serialized FINAL body of a failed launch', async () => {
    const runner = await start();
    runner.launcher.failNextLaunch(new Error('LaunchFailed: no browser here'));
    await runOnce(runner);

    // The bytes, not the object: this is the invariant ADR-002 §11.2 states of the wire.
    const raw = runner.http.reportRequests.at(-1)?.body ?? '';
    const final = JSON.parse(raw) as ReportBody;

    expect(final.kind).toBe('FINAL');
    expect(final.browserStartedAt).toBeNull();
    expect(final.steps).toEqual([]);
    for (const entry of final.logs) {
      expect(entry.atMs).toBeNull();
    }
    // And no `STARTED` at all: a run whose launch failed never reported one (AC-20).
    expect(reports(runner).some((body) => body.kind === 'STARTED')).toBe(false);
  });

  it('is enforced by the producer, not by the call sites that happen to have nothing to say', () => {
    // The call sites *today* have nothing to report before a launch, which would make the
    // invariant true by accident. The snapshot enforces it instead: a reading appended before the
    // browser start is stripped on the way out, because it is on a scale the wire cannot name.
    const snapshot = createRunSnapshot({
      identity: {
        executionId: 'e',
        attemptId: 'a',
        admissionId: 'd',
        runnerInstanceId: 'r',
      },
      bounds: DEFAULT_REPORT_BOUNDS,
      runtimeVersions: {},
      redactor: NULL_REDACTOR,
      wallClock: () => new Date(0),
    });

    snapshot.stepStarted(0, 12.5);
    snapshot.appendLog({ atMs: 12.5, level: 'info', message: 'a reading with no origin' });

    const before = snapshot.build('PROGRESS');
    expect(before.browserStartedAt).toBeNull();
    expect(before.steps).toEqual([]);
    expect(before.logs.map((entry) => entry.atMs)).toEqual([null]);

    // Once the origin exists, the same snapshot reports readings again — so the stripping is the
    // invariant and not a bug that happens to look like one.
    snapshot.markBrowserStarted(new Date(1_000));
    const after = snapshot.build('PROGRESS');
    expect(after.browserStartedAt).not.toBeNull();
    expect(after.steps[0]?.startedAtMs).toBe(12.5);
    expect(after.logs[0]?.atMs).toBe(12.5);
  });
});
