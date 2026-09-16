/**
 * Reporting: what the runner sends, when, and how many times.
 *
 * AC-13 through AC-21. Two properties get special treatment because they are the ones a later
 * refactor is most likely to break quietly:
 *
 * - **AC-17 byte-identity** is asserted on the *raw bytes of every delivery attempt*, not on the
 *   object that produced them. A per-delivery timestamp would keep every object-level assertion
 *   green while breaking the API's ability to de-duplicate.
 * - **AC-20 redaction** is asserted on the *serialized request body and the string handed to the
 *   log sink*, not on the in-memory objects, because a field added later is only caught by
 *   inspecting the finished payload.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { createLogBuffer, DEFAULT_REPORT_BOUNDS, redactLogEntry } from '../../src/reporting/bounds.js';
import type { HttpOutcome, HttpRequest } from '../../src/reporting/httpClient.js';
import { createReportClient } from '../../src/reporting/reportClient.js';
import type { ReportBody } from '../../src/reporting/snapshot.js';
import { createRedactor, NULL_REDACTOR, REDACTION_PLACEHOLDER } from '../../src/executor/redaction.js';
import { createLogger, createRecordingLogSink } from '../../src/server/logging.js';
import { createHarness, SERVICE_TOKEN, until } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { post, validJob } from '../helpers/runner.js';

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

async function runOnce(runner: Harness, body = validJob()): Promise<void> {
  const response = await post(runner.port, '/v1/runs', JSON.stringify(body), SERVICE_TOKEN);
  expect(response.status).toBe(202);
  await until(() => runner.app.coordinator.inFlight === 0);
}

function reports(runner: Harness): ReportBody[] {
  return runner.http.reportRequests.map((request) => JSON.parse(request.body) as ReportBody);
}

describe('AC-13 — every report carries the full identity and a cumulative snapshot', () => {
  it('carries the identity, kind, timestamps, versions and cumulative steps', async () => {
    const runner = await start();
    await runOnce(runner);

    const all = reports(runner);
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (const report of all) {
      expect(report.executionId).toBe('exec-1');
      expect(report.attemptId).toBe('attempt-1');
      expect(report.admissionId).toMatch(/^adm-/u);
      expect(report.runnerInstanceId).toBe('runner-a');
      expect(report.reportedAt).toBe('2026-09-11T10:00:00.000Z');
      expect(report.runtimeVersions.playwright).toBe('1.63.0');
      expect(typeof report.logsTruncated).toBe('boolean');
    }

    const final = all.at(-1);
    expect(final?.kind).toBe('FINAL');
    expect(final?.outcome).toMatchObject({ result: 'PASSED' });
    expect(final?.evidence).toMatchObject({
      videoKey: 'studio/exec-1/video.webm',
      manifestKey: 'studio/exec-1/manifest.json',
    });
  });

  it('runnerSequence is strictly increasing within the attempt and never reused', async () => {
    const runner = await start();
    await runOnce(runner);

    const sequences = reports(runner).map((report) => report.runnerSequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(new Set(sequences).size).toBe(sequences.length);
    expect(sequences[0]).toBe(1);
  });

  it('starts a fresh sequence for a new attempt: the runner holds no cross-run state', async () => {
    const runner = await start();
    await runOnce(runner);
    const firstAttempt = reports(runner).map((report) => report.runnerSequence);

    // Reports accumulate across runs in the fake client; slice from here for the second run.
    const before = runner.http.reportRequests.length;
    await runOnce(runner, validJob({ executionId: 'exec-2', attemptId: 'attempt-2' }));
    const secondAttempt = reports(runner)
      .slice(before)
      .map((report) => report.runnerSequence);

    expect(firstAttempt[0]).toBe(1);
    expect(secondAttempt[0]).toBe(1);
  });

  it('progress is a full snapshot, not a delta: the last PROGRESS holds every step', async () => {
    const runner = await start();
    await runOnce(runner);

    const progress = reports(runner).filter((report) => report.kind === 'PROGRESS');
    const last = progress.at(-1);
    expect(last?.steps.map((step) => step.stepIndex)).toEqual([0, 1]);
    expect(last?.steps.every((step) => step.status !== 'RUNNING')).toBe(true);
  });
});

describe('AC-14a — STARTED is sent only once the browser has actually started', () => {
  it('sends STARTED after the launch and with a lower sequence than any step', async () => {
    const runner = await start();
    await runOnce(runner);

    const all = reports(runner);
    const started = all.find((report) => report.kind === 'STARTED');
    expect(started).toBeDefined();
    expect(started?.browserStartedAt).not.toBeNull();

    const stepSequences = all
      .filter((report) => report.kind !== 'STARTED' && report.steps.length > 0)
      .map((report) => report.runnerSequence);
    for (const sequence of stepSequences) {
      expect(started?.runnerSequence).toBeLessThan(sequence);
    }

    // The launch precedes the first report the browser could have caused.
    const events = runner.log.events;
    expect(events.indexOf('browser.launch')).toBeLessThan(events.lastIndexOf('report.request'));
  });

  it('sends no STARTED when the adapter never reports a launch', async () => {
    const runner = await start();
    runner.launcher.failNextLaunch(new Error('LaunchFailed: no browser here'));
    await runOnce(runner);

    const all = reports(runner);
    expect(all.some((report) => report.kind === 'STARTED')).toBe(false);
    // The run still finalizes: the API is told, rather than left waiting for a reaper.
    expect(all.at(-1)?.kind).toBe('FINAL');
    // 10.6's placeholder `RUN_ERROR` is replaced by the real set (AC-17, ADR-002 O-5): a launch
    // that failed is `BROWSER_LAUNCH_FAILED`, which is disjoint from every reaper-assigned
    // `ExecutionErrorCode` (§5.4).
    expect(all.at(-1)?.outcome).toMatchObject({
      result: 'ERROR',
      errorCode: 'BROWSER_LAUNCH_FAILED',
    });
    expect(all.at(-1)?.browserStartedAt).toBeNull();
  });
});

/**
 * **AC-14b is closed.** Story 10.6 left a skip here — "admission → real Chromium launch →
 * `STARTED`, deferred to story 10.12" — recorded as *skipped, never passed*. Story 10.12 supplied
 * the real Playwright adapter and the killable child, and the assertion now runs for real against
 * pinned Chromium in `test/fixtures-tier/real-chromium.test.ts`:
 *
 *   "AC-20 — admission → real Chromium launch → STARTED (closes 10.6 AC-14b)"
 *
 * It asserts what this placeholder could not: `browserStartedAt` is stamped only once Chromium has
 * actually started, the observed start is **measurably distinct** from the dispatch instant rather
 * than equal to it, the `STARTED` sequence number is lower than any step's, and a run whose launch
 * fails sends no `STARTED` at all.
 *
 * The skip is deleted rather than re-skipped, which is the whole point: a deferral that closes by
 * being deleted without its assertion running is worse than one left open.
 */

describe('AC-15 — the StepReporter seam, and reporting asynchronous to execution', () => {
  it("carries the executor's outcomes to the wire unchanged, null timings included", async () => {
    const runner = await start();
    // Make step 0 fail so step 1 is SKIPPED with null timings.
    runner.launcher.holdLaunch()();
    const response = await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    expect(response.status).toBe(202);
    await until(() => runner.launcher.adapters.length === 1);
    // The adapter has already run by the time we get here for a passing run; assert the shape.
    await until(() => runner.app.coordinator.inFlight === 0);

    const final = reports(runner).at(-1);
    expect(final?.steps).toHaveLength(2);
    for (const step of final?.steps ?? []) {
      expect(['PASS', 'FAIL', 'SKIPPED']).toContain(step.status);
    }
  });

  it('reports SKIPPED steps with null timings when an earlier step fails', async () => {
    const runner = await start();
    // A goto to a URL the fake adapter is told to reject.
    const original = runner.launcher.launch.bind(runner.launcher);
    Object.assign(runner.launcher, {
      async launch(options: Parameters<typeof original>[0]) {
        const session = await original(options);
        const adapter = runner.launcher.adapters.at(-1);
        adapter?.failOn('goto', new Error('NavigationError: refused'));
        return session;
      },
    });

    await runOnce(runner);
    const final = reports(runner).at(-1);
    expect(final?.outcome).toMatchObject({ result: 'FAILED', errorCode: 'STEP_FAILED' });
    expect(final?.steps[0]?.status).toBe('FAIL');
    expect(final?.steps[1]).toMatchObject({
      status: 'SKIPPED',
      startedAtMs: null,
      finishedAtMs: null,
      durationMs: null,
      failure: null,
    });
  });

  it('a failing callback does not block, delay or alter a step', async () => {
    const runner = await start();
    // Every progress delivery fails; the run must still complete and report every step.
    runner.http.reportOutcome = (request: HttpRequest): HttpOutcome => {
      const body = JSON.parse(request.body) as ReportBody;
      return body.kind === 'FINAL'
        ? { kind: 'response', status: 200, body: '{}' }
        : { kind: 'response', status: 500, body: '' };
    };
    await runOnce(runner);

    const final = reports(runner).at(-1);
    expect(final?.kind).toBe('FINAL');
    expect(final?.outcome).toMatchObject({ result: 'PASSED' });
    expect(final?.steps).toHaveLength(2);
    // Each step ran exactly once despite every progress delivery failing.
    const adapter = runner.launcher.adapters[0];
    expect(adapter?.calls.filter((call) => call.method === 'goto')).toHaveLength(1);
  });
});

describe('AC-16 — progress delivery is best-effort and never re-runs work', () => {
  it('drops the first two deliveries and repairs the gap in the third', async () => {
    const runner = await start();
    let index = 0;
    runner.http.reportOutcome = (): HttpOutcome => {
      index += 1;
      return index <= 2
        ? { kind: 'response', status: 503, body: '' }
        : { kind: 'response', status: 200, body: '{}' };
    };
    await runOnce(runner);

    const all = reports(runner);
    const final = all.at(-1);
    // Every step is reported correctly despite the first two deliveries failing.
    expect(final?.steps.map((step) => step.stepIndex)).toEqual([0, 1]);
    expect(final?.steps.every((step) => step.status === 'PASS')).toBe(true);
    // Nothing ran twice.
    const adapter = runner.launcher.adapters[0];
    expect(adapter?.calls.filter((call) => call.method === 'goto')).toHaveLength(1);
    expect(adapter?.calls.filter((call) => call.method === 'fill')).toHaveLength(1);
    // The drops were recorded rather than retried.
    expect(runner.app.logger.counters.snapshot()['runner.report.progress_dropped']).toBe(2);
  });
});

describe('AC-17 — terminal delivery is retried byte-identically', () => {
  it('re-sends the exact same bytes on every attempt, timestamps included', async () => {
    const runner = await start();
    let finalAttempts = 0;
    runner.http.reportOutcome = (request: HttpRequest): HttpOutcome => {
      const body = JSON.parse(request.body) as ReportBody;
      if (body.kind !== 'FINAL') return { kind: 'response', status: 200, body: '{}' };
      finalAttempts += 1;
      return finalAttempts < 3
        ? { kind: 'response', status: 500, body: '' }
        : { kind: 'response', status: 200, body: '{}' };
    };
    await runOnce(runner);

    const finalBytes = runner.http.reportRequests
      .filter((request) => (JSON.parse(request.body) as ReportBody).kind === 'FINAL')
      .map((request) => request.body);

    expect(finalBytes).toHaveLength(3);
    // Literal byte equality of the serialized request bodies, not of the objects behind them.
    expect(finalBytes[1]).toBe(finalBytes[0]);
    expect(finalBytes[2]).toBe(finalBytes[0]);
    expect(Buffer.from(finalBytes[1] ?? '', 'utf8').equals(Buffer.from(finalBytes[0] ?? '', 'utf8'))).toBe(
      true,
    );

    // Nothing is recomputed per attempt: sequence and timestamp are identical across attempts.
    const parsed = finalBytes.map((bytes) => JSON.parse(bytes) as ReportBody);
    expect(new Set(parsed.map((body) => body.runnerSequence)).size).toBe(1);
    expect(new Set(parsed.map((body) => body.reportedAt)).size).toBe(1);
  });

  it('carries the per-delivery attempt counter in a header, never in the body', async () => {
    const runner = await start();
    let finalAttempts = 0;
    runner.http.reportOutcome = (request: HttpRequest): HttpOutcome => {
      const body = JSON.parse(request.body) as ReportBody;
      if (body.kind !== 'FINAL') return { kind: 'response', status: 200, body: '{}' };
      finalAttempts += 1;
      return finalAttempts < 2
        ? { kind: 'timeout' }
        : { kind: 'response', status: 200, body: '{}' };
    };
    await runOnce(runner);

    const finals = runner.http.reportRequests.filter(
      (request) => (JSON.parse(request.body) as ReportBody).kind === 'FINAL',
    );
    expect(finals.map((request) => request.headers['x-runner-delivery-attempt'])).toEqual(['1', '2']);
    for (const request of finals) expect(request.body).not.toContain('deliveryAttempt');
  });

  it('retries are bounded in count, use jitter, and stop at the bound', async () => {
    const runner = await start({
      env: {
        STUDIO_RUNNER_TERMINAL_DELIVERY_MAX_ATTEMPTS: '3',
        STUDIO_RUNNER_TERMINAL_DELIVERY_BACKOFF_MS: '100',
        STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS: '10000',
      },
    });
    runner.http.reportOutcome = (request: HttpRequest): HttpOutcome =>
      (JSON.parse(request.body) as ReportBody).kind === 'FINAL'
        ? { kind: 'response', status: 500, body: '' }
        : { kind: 'response', status: 200, body: '{}' };
    await runOnce(runner);

    const finals = runner.http.reportRequests.filter(
      (request) => (JSON.parse(request.body) as ReportBody).kind === 'FINAL',
    );
    expect(finals).toHaveLength(3);
    // random() is pinned at 0.5, so the jittered backoff is deterministic: base * attempt * 0.75.
    expect(runner.sleeps).toEqual([75, 150]);
    expect(runner.app.logger.counters.snapshot()['runner.report.terminal_abandoned']).toBe(1);
  });

  it('stops at the delivery-window deadline even with attempts left', async () => {
    const runner = await start({
      env: {
        STUDIO_RUNNER_TERMINAL_DELIVERY_MAX_ATTEMPTS: '10',
        STUDIO_RUNNER_TERMINAL_DELIVERY_BACKOFF_MS: '1000',
        STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS: '900',
      },
    });
    runner.http.reportOutcome = (request: HttpRequest): HttpOutcome =>
      (JSON.parse(request.body) as ReportBody).kind === 'FINAL'
        ? { kind: 'timeout' }
        : { kind: 'response', status: 200, body: '{}' };
    await runOnce(runner);

    const finals = runner.http.reportRequests.filter(
      (request) => (JSON.parse(request.body) as ReportBody).kind === 'FINAL',
    );
    // The first backoff (750 ms jittered) would land before the 900 ms deadline; the second
    // would not, so delivery stops rather than running past its window.
    expect(finals.length).toBeGreaterThanOrEqual(1);
    expect(finals.length).toBeLessThan(10);
  });

  it('stops immediately on acknowledgement', async () => {
    const runner = await start();
    await runOnce(runner);
    const finals = runner.http.reportRequests.filter(
      (request) => (JSON.parse(request.body) as ReportBody).kind === 'FINAL',
    );
    expect(finals).toHaveLength(1);
    expect(runner.app.logger.counters.snapshot()['runner.report.terminal_delivered']).toBe(1);
  });
});

describe('AC-18 — a 409 on any report stops reporting for that run', () => {
  it('stops on a 409 during progress and never escalates to a new admission', async () => {
    const runner = await start();
    runner.http.reportOutcome = { kind: 'response', status: 409, body: '{}' };
    await runOnce(runner);

    // Exactly one report left the process: the first one, which came back 409.
    expect(runner.http.reportRequests).toHaveLength(1);
    // No new admission, no relaunch.
    expect(runner.http.admissionRequests).toHaveLength(1);
    expect(runner.launcher.launches).toHaveLength(1);
    expect(runner.app.logger.counters.snapshot()['runner.report.ownership_lost']).toBe(1);
    // The slot and the scratch are released.
    expect(runner.app.pool.inUse).toBe(0);
    expect(runner.scratch.present).toEqual([]);
  });

  it('records the outcome in the audit log and nowhere durable', async () => {
    const runner = await start();
    runner.http.reportOutcome = { kind: 'response', status: 409, body: '{}' };
    await runOnce(runner);

    const line = runner.sink.lines.find((entry) => entry.includes('report.ownership_lost'));
    expect(line).toBeDefined();
    // There is no runner-side durable store: scratch is the only thing on disk and it is gone.
    expect(await runner.scratch.list()).toEqual([]);
    expect(runner.scratch.written).toEqual([]);
  });

  it('stops on a 409 to the terminal report without retrying it', async () => {
    const runner = await start();
    runner.http.reportOutcome = (request: HttpRequest): HttpOutcome =>
      (JSON.parse(request.body) as ReportBody).kind === 'FINAL'
        ? { kind: 'response', status: 409, body: '{}' }
        : { kind: 'response', status: 200, body: '{}' };
    await runOnce(runner);

    const finals = runner.http.reportRequests.filter(
      (request) => (JSON.parse(request.body) as ReportBody).kind === 'FINAL',
    );
    expect(finals).toHaveLength(1);
  });
});

describe('AC-19 — outbound bounds and the retained-log drop policy', () => {
  it('drops the oldest entries and keeps the newest when the cap is reached', () => {
    const buffer = createLogBuffer(3, 100);
    for (let index = 0; index < 5; index += 1) {
      // `append` takes a branded already-redacted entry since ADR-002 O-16, and `redactLogEntry`
      // is the only thing that mints one. The redactor here is the **null** one deliberately:
      // this test is about the drop policy, and choosing which redactor to apply is the caller's
      // decision — what the brand removes is the option of applying none.
      buffer.append(redactLogEntry({ atMs: index, level: 'info', message: `entry-${String(index)}` }, NULL_REDACTOR));
    }
    // Newest retained, oldest dropped. Asserted rather than left implicit.
    expect(buffer.entries().map((entry) => entry.message)).toEqual([
      'entry-2',
      'entry-3',
      'entry-4',
    ]);
    expect(buffer.truncated).toBe(true);
    expect(buffer.dropped).toBe(2);
  });

  it('refuses an entry that did not come through a redactor, at run time too (ADR-002 O-16)', () => {
    // The compile-time half of O-16 is the brand on `append`'s parameter and it cannot be
    // exercised by a test — a test that does not compile is not a test. This is the half that can
    // be: the caller who defeats the type with `as unknown as` finds the buffer refuses anyway,
    // which is the shape story 10.17's AC-22 repair established one level up — *fails to compile
    // **and** throws*.
    const buffer = createLogBuffer(3, 100);
    const unbranded = { atMs: 0, level: 'error', message: 'typed hunter2' } as unknown as Parameters<
      typeof buffer.append
    >[0];
    expect(() => {
      buffer.append(unbranded);
    }).toThrow(TypeError);
    // Nothing was retained, so the refusal is a refusal and not a warning.
    expect(buffer.entries()).toHaveLength(0);
    // The control: the same entry through `redactLogEntry` is accepted.
    buffer.append(redactLogEntry({ atMs: 0, level: 'error', message: 'typed hunter2' }, NULL_REDACTOR));
    expect(buffer.entries()).toHaveLength(1);
  });

  it('truncates an oversized entry so one entry cannot defeat the count cap', () => {
    const buffer = createLogBuffer(10, 8);
    buffer.append(redactLogEntry({ atMs: 0, level: 'warn', message: 'x'.repeat(50) }, NULL_REDACTOR));
    expect(buffer.entries()[0]?.message).toHaveLength(8);
    expect(buffer.truncated).toBe(false);
  });

  it('never emits a body over the configured size', async () => {
    // 700 bytes sits above the irreducible identity floor and below a full snapshot, so the
    // reduction path is exercised rather than skipped.
    const runner = await start({ env: { STUDIO_RUNNER_MAX_REPORT_BODY_BYTES: '700' } });
    await runOnce(runner);
    for (const request of runner.http.reportRequests) {
      expect(Buffer.byteLength(request.body, 'utf8')).toBeLessThanOrEqual(700);
    }
    // A reduced payload says so rather than pretending it is complete.
    const final = reports(runner).at(-1);
    expect(final?.payloadReduced).toBe(true);
  });

  it('carries a bounded retained log and flags truncation on a real run', async () => {
    const runner = await start({ env: { STUDIO_RUNNER_MAX_REPORT_LOG_ENTRIES: '2' } });
    await runOnce(runner);

    const final = reports(runner).at(-1);
    // Newest retained: the last thing that happened is the run outcome.
    expect(final?.logs).toHaveLength(2);
    expect(final?.logs.at(-1)?.message).toBe('run PASSED');
    expect(final?.logsTruncated).toBe(true);
  });

  it('keeps the whole log when it fits under the cap', async () => {
    const runner = await start();
    await runOnce(runner);
    const final = reports(runner).at(-1);
    expect(final?.logsTruncated).toBe(false);
    expect(final?.logs.map((entry) => entry.message)).toEqual([
      'browser started',
      'step 0 started',
      'step 0 PASS',
      'step 1 started',
      'step 1 PASS',
      'run PASSED',
    ]);
  });

  it('truncates an over-long log entry to the configured length', async () => {
    const runner = await start({ env: { STUDIO_RUNNER_MAX_REPORT_LOG_ENTRY_LENGTH: '6' } });
    await runOnce(runner);
    const final = reports(runner).at(-1);
    for (const entry of final?.logs ?? []) expect(entry.message.length).toBeLessThanOrEqual(6);
  });

  it('bounds the reported step count', async () => {
    const runner = await start({ env: { STUDIO_RUNNER_MAX_REPORT_STEPS: '1' } });
    await runOnce(runner);
    for (const report of reports(runner)) expect(report.steps.length).toBeLessThanOrEqual(1);
  });
});

/**
 * ADR-002 §INT-1 — an `atMs` is a position on the run timeline, never a stand-in for "unknown".
 *
 * These are the assertions this story did not have. `sendFinal` shipped the terminal line with
 * `atMs: 0`, and nothing could see it: `0` is a valid number, the type system accepts it, the
 * contract's conformance check accepts it, and every assertion in this file passed over it. The
 * only thing wrong with it was what it *means* — `0` is the browser start, the first frame of the
 * recording, which is where the run's own result line was being filed.
 *
 * So none of these assert a shape. Shape is what the contract test covers, and shape is precisely
 * what let this through. They assert the correspondence between a log line and the reading it
 * claims to sit on, which is the property the 500 ms step-seek target of §6.4 rests on.
 *
 * The clock is made to tick on every read, so a genuine reading can never be `0` and the origin
 * is distinguishable from an accident. Under the harness default — a monotonic clock frozen at
 * `0` until something sleeps — every line in a run reads `0` legitimately, and these assertions
 * would pass over a run filed entirely at the browser start. That is the same blindness one layer
 * down, and it is why the clock is overridden here rather than left alone.
 */
describe('ADR-002 §INT-1 — log lines carry timeline positions, not placeholders', () => {
  /** Monotonic, and never returns the origin: under it, `0` can only be the browser start. */
  function tickingClock(): () => number {
    let reading = 0;
    return (): number => {
      reading += 1;
      return reading;
    };
  }

  it('files the terminal run line with no reading, rather than at the browser start', async () => {
    const runner = await start({ now: tickingClock() });
    await runOnce(runner);

    const entries = reports(runner).at(-1)?.logs ?? [];
    const terminal = entries.at(-1);
    expect(terminal?.message).toBe('run PASSED');
    // The run's result is not something the runner read off a clock, so it holds no position.
    expect(terminal?.atMs).toBeNull();
    // And the origin belongs to exactly one line — the one that *is* the origin.
    expect(entries.filter((entry) => entry.atMs === 0).map((entry) => entry.message)).toEqual([
      'browser started',
    ]);
  });

  it('positions every step line on the reading that step itself reported', async () => {
    const runner = await start({ now: tickingClock() });
    await runOnce(runner);

    const final = reports(runner).at(-1);
    const positions = new Map((final?.logs ?? []).map((entry) => [entry.message, entry.atMs]));
    expect(final?.steps.length).toBeGreaterThan(0);
    for (const step of final?.steps ?? []) {
      const index = String(step.stepIndex);
      // The step line and the step carry the same reading: they seek to the same frame.
      expect(positions.get(`step ${index} started`)).toBe(step.startedAtMs);
      expect(positions.get(`step ${index} ${step.status}`)).toBe(step.finishedAtMs);
      // Readings, not the origin — which is what makes the assertion above say something.
      expect(step.startedAtMs ?? 0).toBeGreaterThan(0);
    }
  });

  it('gives a skipped step no position, because it has no reading to be positioned by', async () => {
    const runner = await start({ now: tickingClock() });
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
    expect(final?.steps[1]).toMatchObject({ status: 'SKIPPED', startedAtMs: null });
    const skipped = (final?.logs ?? []).find((entry) => entry.message.startsWith('step 1 SKIPPED'));
    expect(skipped).toBeDefined();
    expect(skipped?.atMs).toBeNull();
  });
});

describe('AC-20 — the secret canary appears in no form on any outbound byte', () => {
  const CANARY = 'canary-secret-value';

  it('appears in no report body, in no log line and in no error message', async () => {
    const runner = await start();
    // Make the run fail with a message that embeds the secret, so the failure path is exercised.
    const original = runner.launcher.launch.bind(runner.launcher);
    Object.assign(runner.launcher, {
      async launch(options: Parameters<typeof original>[0]) {
        const session = await original(options);
        runner.launcher.adapters
          .at(-1)
          ?.failOn('fill', new Error(`FillFailed: value was ${CANARY}`));
        return session;
      },
    });
    await runOnce(runner);

    const variants = [
      CANARY,
      encodeURIComponent(CANARY),
      encodeURI(CANARY),
      encodeURIComponent(encodeURIComponent(CANARY)),
      Buffer.from(CANARY, 'utf8').toString('base64'),
      Buffer.from(CANARY, 'utf8').toString('base64').replace(/=+$/u, ''),
      Buffer.from(CANARY, 'utf8').toString('base64url'),
    ];

    // The assertion is on the bytes that leave, not on the objects behind them.
    for (const request of runner.http.requests) {
      for (const variant of variants) {
        expect(request.body, `variant leaked into ${request.url}`).not.toContain(variant);
      }
    }
    for (const line of runner.sink.lines) {
      for (const variant of variants) expect(line).not.toContain(variant);
    }

    // The failure did reach the wire — the test is not green because nothing happened.
    const final = reports(runner).at(-1);
    expect(final?.steps[0]?.status === 'FAIL' || final?.outcome?.result !== 'PASSED').toBe(true);
  });

  it('never records job values, resolved values or artifact source text in a log line', async () => {
    const runner = await start();
    await runOnce(runner);
    for (const line of runner.sink.lines) {
      expect(line).not.toContain('await page.goto');
      expect(line).not.toContain('resolvedSecrets');
      expect(line).not.toContain('https://example.com/login');
    }
  });

  it('redacts a value added to the payload later, because it redacts the finished bytes', async () => {
    // Asserted against the report client directly, with a body **no upstream redactor has ever
    // seen**. In the end-to-end tests above the canary is already scrubbed by the executor's own
    // redaction of step failure text before it reaches the snapshot, so those tests would stay
    // green with the outbound pass deleted. Here the pass in `freezeBytes` is the only thing
    // between this body and the wire: remove `redactor.redact(...)` and this test goes red.
    const sent: string[] = [];
    const client = createReportClient({
      http: {
        send(request: HttpRequest): Promise<HttpOutcome> {
          sent.push(request.body);
          return Promise.resolve({ kind: 'response', status: 200, body: '{}' });
        },
      },
      baseUrl: 'https://api.internal.example',
      identityToken: 'outbound-identity',
      bounds: DEFAULT_REPORT_BOUNDS,
      logger: createLogger({ sink: createRecordingLogSink(), clock: () => 'T' }),
      redactor: createRedactor([CANARY]),
      timeoutMs: 1000,
      terminal: { windowMs: 10_000, maxAttempts: 3, backoffMs: 10 },
      now: () => 0,
      sleep: () => Promise.resolve(),
      random: () => 0.5,
    });

    // `fieldAddedLater` is the field nobody enumerated: it is not on `ReportBody`, nothing in the
    // runner produces it, and it survives `JSON.stringify` all the same. That is exactly the shape
    // of the regression AC-20 is written against — a field added next year by someone who never
    // read this file.
    const body = {
      executionId: 'exec-1',
      attemptId: 'attempt-1',
      admissionId: 'adm-1',
      runnerInstanceId: 'runner-a',
      kind: 'FINAL',
      runnerSequence: 1,
      reportedAt: '2026-09-11T10:00:00.000Z',
      browserStartedAt: null,
      steps: [],
      logs: [],
      logsTruncated: false,
      runtimeVersions: { playwright: '1.63.0' },
      outcome: { result: 'FAILED', errorCode: 'STEP_FAILED', errorMessage: `FillFailed: ${CANARY}` },
      evidence: { videoKey: `studio/${CANARY}/video.webm`, manifestKey: null, state: 'PENDING' },
      fieldAddedLater: CANARY,
    } as unknown as ReportBody;

    // The canary really is in the object handed over, in three places including the unnamed one.
    expect(JSON.stringify(body).split(CANARY)).toHaveLength(4);

    const result = await client.deliverTerminal(body);
    expect(result.kind).toBe('ACKNOWLEDGED');
    expect(sent).toHaveLength(1);

    for (const bytes of [...sent, ...client.sentBodies]) {
      expect(bytes).not.toContain(CANARY);
      expect(bytes).toContain(REDACTION_PLACEHOLDER);
      // Named explicitly: the unenumerated field is scrubbed, not merely absent.
      expect(bytes).toContain(`"fieldAddedLater":"${REDACTION_PLACEHOLDER}"`);
    }
  });

  it('scrubs the canary from a launch failure that never reaches a step reporter', async () => {
    // The end-to-end complement of the test above: a failure raised before any step exists, so
    // the message travels through the run loop rather than the executor's step path.
    const runner = await start();
    const original = runner.launcher.launch.bind(runner.launcher);
    Object.assign(runner.launcher, {
      async launch(options: Parameters<typeof original>[0]) {
        await original(options);
        throw new Error(`LaunchFailed: ${CANARY}`);
      },
    });
    await runOnce(runner);
    for (const request of runner.http.reportRequests) {
      expect(request.body).not.toContain(CANARY);
    }
  });
});

describe('AC-21 — ephemeral values never persist', () => {
  it('writes no job value to scratch and leaves the directory empty after a failed run', async () => {
    const runner = await start();
    runner.launcher.failNextLaunch(new Error('LaunchFailed'));
    await runOnce(runner);

    expect(await runner.scratch.list()).toEqual([]);
    expect(runner.scratch.written).toEqual([]);
    // The scratch directory was created and then cleared, on the error path.
    expect(runner.log.events).toContain('scratch.create');
    expect(runner.log.events).toContain('scratch.clear');
  });

  it('leaves no pending report buffer holding a job value', async () => {
    const runner = await start();
    runner.http.reportOutcome = { kind: 'response', status: 500, body: '' };
    await runOnce(runner);

    // Every byte ever queued for delivery is inspectable; none of them carries a value.
    for (const request of runner.http.requests) {
      expect(request.body).not.toContain('canary-secret-value');
      expect(request.body).not.toContain('resolvedSecrets');
      expect(request.body).not.toContain('resolvedVars');
    }
  });

  it('clears scratch at startup as well as on exit', async () => {
    const runner = await start();
    // `start()` clears scratch before listening, so a pod killed mid-run inherits nothing.
    expect(runner.scratch.clearAllCount).toBeGreaterThanOrEqual(1);
  });
});
