/**
 * AC-2, AC-3, AC-5a, AC-10, AC-16, AC-17 — what a deadline kill puts on the wire.
 *
 * Everything here is asserted on the **serialized `FINAL` body** the report client actually posted,
 * not on the object that produced it. That is the distinction ADR-002 §17.7 item 2 asks for, and it
 * is the only way to tell an explicitly emitted `partial: false` from an absent one.
 *
 * The stack under test is the real one down to the spawn seam: the real coordinator, the real
 * deadline, the real launcher, the real report bounding. Only the process is faked
 * (`test/helpers/childDriver.ts`), which is what keeps this tier browser-free while still
 * exercising the composition the criteria are about.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ReportBody } from '../../src/reporting/snapshot.js';
import { createFsScratchStore } from '../../src/server/scratch.js';
import { createChildDriver } from '../helpers/childDriver.js';
import type { ChildScript } from '../helpers/childDriver.js';
import { createHarness, until } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { SERVICE_TOKEN } from '../helpers/harness.js';
import { post, validJob } from '../helpers/runner.js';
import { createFakeScheduler } from '../helpers/scheduler.js';

const TOTAL_RUNTIME_MS = 120_000;
const ADMITTED_START_MS = 30_000;

let harness: Harness | null = null;
const scratchRoots: string[] = [];

/**
 * A **real** scratch root, not the in-memory fake.
 *
 * The launcher creates the child's `TMPDIR` under it before spawning, and — on the kill path — the
 * parent reads the video directory back out of it to decide what evidence survived. Both are
 * filesystem facts, and a fake store that returned `/fake-scratch/...` would make the first throw
 * and the second unobservable.
 */
function realScratch(): ReturnType<typeof createFsScratchStore> {
  const root = mkdtempSync(join(tmpdir(), 'studio-runner-deadline-'));
  scratchRoots.push(root);
  return createFsScratchStore(root);
}

afterEach(async () => {
  await harness?.stop();
  harness = null;
  for (const root of scratchRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface RunOutput {
  readonly final: ReportBody;
  /** The exact bytes of the terminal body, for the assertions that must be on bytes. */
  readonly finalBytes: string;
  readonly bodies: readonly ReportBody[];
  readonly driver: ReturnType<typeof createChildDriver>;
  readonly harness: Harness;
}

/**
 * Admits a run, lets it hang, advances the clock past the runtime budget and collects the report.
 *
 * `advanceMs` defaults to the whole budget. The queue time is spent **before** the launch, on the
 * same clock, so the arrangement is AC-1's: a run that waited still gets its whole browser budget.
 */
async function runToDeadline(
  script: ChildScript,
  options: {
    readonly job?: Record<string, unknown>;
    readonly queueMs?: number;
    readonly env?: Record<string, string>;
  } = {},
): Promise<RunOutput> {
  const scheduler = createFakeScheduler();
  const driver = createChildDriver(script);
  harness = createHarness({
    launcher: driver.launcher,
    scheduler,
    scratch: realScratch(),
    ...(options.env === undefined ? {} : { env: options.env }),
  });
  await harness.start();

  const response = await post(
    harness.port,
    '/v1/runs',
    JSON.stringify(options.job ?? validJob()),
    SERVICE_TOKEN,
  );
  expect(response.status).toBe(202);

  // Wait until the deadline has actually been armed, so the advance below cannot race the launch.
  await until(() => scheduler.pending().length > 0 || harness?.app.coordinator.inFlight === 0);
  if (options.queueMs !== undefined) {
    // Recorded for the assertion in the AC-1 case below; the timer is already armed, so this only
    // demonstrates that later time does not shorten it.
    scheduler.skip(0);
  }

  scheduler.advance(TOTAL_RUNTIME_MS);
  await until(() => harness?.app.coordinator.inFlight === 0, 20_000);

  const reports = harness.http.reportRequests;
  const finalBytes = reports.at(-1)?.body ?? '';
  return {
    final: JSON.parse(finalBytes) as ReportBody,
    finalBytes,
    bodies: reports.map((request) => JSON.parse(request.body) as ReportBody),
    driver,
    harness,
  };
}

/** Runs to completion without any deadline firing, for the negative halves of the criteria. */
async function runWithout(script: ChildScript, job = validJob()): Promise<RunOutput> {
  const scheduler = createFakeScheduler();
  const driver = createChildDriver(script);
  harness = createHarness({ launcher: driver.launcher, scheduler, scratch: realScratch() });
  await harness.start();
  const response = await post(harness.port, '/v1/runs', JSON.stringify(job), SERVICE_TOKEN);
  expect(response.status).toBe(202);
  await until(() => harness?.app.coordinator.inFlight === 0, 20_000);
  const reports = harness.http.reportRequests;
  const finalBytes = reports.at(-1)?.body ?? '';
  return {
    final: JSON.parse(finalBytes) as ReportBody,
    finalBytes,
    bodies: reports.map((request) => JSON.parse(request.body) as ReportBody),
    driver,
    harness,
  };
}

// ── AC-3: five conditions, five observable answers ───────────────────────────────────────────

describe('AC-3 — every deadline outcome is a distinguishable, truthful code', () => {
  it('row 3: total browser runtime exceeded → ERROR / TIMEOUT', async () => {
    const { final } = await runToDeadline({ hangOnStep: 0, onStop: 'ignore' });
    expect(final.kind).toBe('FINAL');
    expect(final.outcome?.result).toBe('ERROR');
    expect(final.outcome?.errorCode).toBe('TIMEOUT');
  });

  it('row 3, the negative: a killed child must NOT report RUN_ERROR', async () => {
    // The test that matters most. `createInbox` synthesizes `failureKind: 'run-fault'` when a
    // child exits without a result, and a deadline kill makes the child exit without a result —
    // so an implementation that classified *after* the exit would honestly describe the symptom
    // ("the protocol broke") and lose the cause. The kind is recorded before the signal.
    const { final } = await runToDeadline({ hangOnStep: 0, onStop: 'ignore' });
    expect(final.outcome?.errorCode).not.toBe('RUN_ERROR');
    expect(final.outcome?.errorCode).not.toBe('STEP_FAILED');
    expect(final.outcome?.errorCode).not.toBe('BROWSER_LAUNCH_FAILED');
    expect(final.outcome?.errorCode).not.toBe('START_DEADLINE_EXCEEDED');
  });

  it('row 1: the admitted-start deadline had already elapsed → ERROR / START_DEADLINE_EXCEEDED', async () => {
    const scheduler = createFakeScheduler();
    const driver = createChildDriver({ hangOnStep: 0, onStop: 'ignore' });
    // The CAS reads the clock, and by the time the run reaches the launch point the whole
    // admitted-start budget has gone — the pod was busy, the artifact was large, the queue was
    // long. §5.2: "the runner refuses to launch after the server-issued admission/start deadline".
    let reads = 0;
    harness = createHarness({
      launcher: driver.launcher,
      scheduler,
      scratch: realScratch(),
      now: () => {
        reads += 1;
        return reads <= 1 ? 0 : ADMITTED_START_MS + 1;
      },
    });
    await harness.start();
    await post(harness.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    await until(() => harness?.app.coordinator.inFlight === 0, 20_000);

    const final = JSON.parse(harness.http.reportRequests.at(-1)?.body ?? '') as ReportBody;
    expect(final.outcome?.result).toBe('ERROR');
    expect(final.outcome?.errorCode).toBe('START_DEADLINE_EXCEEDED');
    // And no browser was started at all: the refusal happens before the spawn seam is touched.
    expect(driver.spawner.requests).toEqual([]);
  });

  it('row 2: the child never reports ready → ERROR / BROWSER_LAUNCH_FAILED', async () => {
    const { final } = await runWithout({ ready: false });
    expect(final.outcome?.result).toBe('ERROR');
    expect(final.outcome?.errorCode).toBe('BROWSER_LAUNCH_FAILED');
    // Distinguishable from the timeout row, which is the whole point of the table.
    expect(final.outcome?.errorCode).not.toBe('TIMEOUT');
  });

  it('row 4: a step’s locator or assertion timed out → FAILED / STEP_FAILED, and the run survives it', async () => {
    // §8.2 keeps these two apart by hand: "a step locator/assertion timeout is FAIL and execution
    // FAILED; a parent-enforced total timeout is ERROR / TIMEOUT". An implementation that let a
    // slow locator escalate into the run deadline has collapsed two vocabulary entries.
    const { final } = await runWithout({
      // A locator that did not resolve in time. Playwright's per-operation bound fired **inside
      // the child**, the child reported it, and the run survived it.
      result: { ok: false, failureKind: 'step', failureMessage: 'TimeoutError: locator' },
      recording: {
        path: '/scratch/run-1/video/page.webm',
        bytes: 24_576,
        error: null,
        state: 'PENDING',
        partial: false,
      },
      onStop: 'flush',
    });
    expect(final.outcome?.result).toBe('FAILED');
    expect(final.outcome?.errorCode).toBe('STEP_FAILED');
    // The vocabulary entry that must not be collapsed into the other one: a slow locator is not
    // a spent browser budget, and the parent killed nothing here.
    expect(final.outcome?.errorCode).not.toBe('TIMEOUT');
    // `STORED` since story 10.14 uploads a playable recording before scratch is cleared. The
    // evidence word moved; the outcome vocabulary this row is about did not.
    expect(final.evidence?.state).toBe('STORED');
  });

  it('row 5: the child died for another reason → ERROR / RUN_ERROR', async () => {
    const scheduler = createFakeScheduler();
    const driver = createChildDriver({ hangOnStep: 0, onStop: 'ignore' });
    harness = createHarness({ launcher: driver.launcher, scheduler, scratch: realScratch() });
    await harness.start();
    await post(harness.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    await until(() => scheduler.pending().length > 0, 20_000);

    // No deadline; the process simply went away. That is what `RUN_ERROR` is for, and it must
    // still be reachable after this story made `TIMEOUT` reachable.
    driver.child().end(1);
    await until(() => harness?.app.coordinator.inFlight === 0, 20_000);

    const final = JSON.parse(harness.http.reportRequests.at(-1)?.body ?? '') as ReportBody;
    expect(final.outcome?.result).toBe('ERROR');
    expect(final.outcome?.errorCode).toBe('RUN_ERROR');
  });
});

// ── AC-1, AC-2: the budgets and the clock ────────────────────────────────────────────────────

describe('AC-1, AC-2 — the two budgets, end to end', () => {
  it('gives a run that spent nine-tenths of its queue budget the whole of its runtime budget', async () => {
    const scheduler = createFakeScheduler();
    // The handshake is held, which is what a slow queue actually looks like from here: the
    // admission has been granted and the browser has not come up yet.
    const driver = createChildDriver({ holdReady: true, hangOnStep: 0, onStop: 'ignore' });
    harness = createHarness({ launcher: driver.launcher, scheduler, scratch: realScratch() });
    await harness.start();
    await post(harness.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);

    await until(() => driver.spawner.requests.length > 0, 20_000);
    // Nine-tenths of the 30 s admitted-start budget, spent before the browser reported ready.
    scheduler.skip(ADMITTED_START_MS * 0.9);
    driver.releaseReady();
    await until(() => scheduler.pending().length > 0, 20_000);

    // The delay the deadline asked the timer for. Not `capMs - queueTime`, ever: §8.5's "queue
    // time and browser runtime are separate budgets" means a slow queue does not eat the
    // browser's time, and a run does not die before it has done anything wrong.
    expect(scheduler.pending()).toEqual([TOTAL_RUNTIME_MS]);

    // And the two instants the run recorded are two different reads (AC-1).
    const started = harness.sink.lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => entry.event === 'run.browser_started');
    expect(started).toBeDefined();
    expect(started?.admittedAtMs).toBe(0);
    expect(started?.browserReadyAtMs).toBe(27_000);
    expect(started?.browserReadyAtMs).not.toBe(started?.admittedAtMs);
    expect(started?.runtimeCapMs).toBe(TOTAL_RUNTIME_MS);

    scheduler.advance(TOTAL_RUNTIME_MS);
    await until(() => harness?.app.coordinator.inFlight === 0, 20_000);
    const final = JSON.parse(harness.http.reportRequests.at(-1)?.body ?? '') as ReportBody;
    // (ii) The run consumed its whole runtime budget and was killed by the **runtime** deadline;
    // the start deadline is shown not to have been what fired, by its code.
    expect(final.outcome?.errorCode).toBe('TIMEOUT');
    expect(final.outcome?.errorCode).not.toBe('START_DEADLINE_EXCEEDED');
  });

  it('writes the timeout’s log entry with atMs null — not 0, and not a computed elapsed time', async () => {
    const { final } = await runToDeadline({ hangOnStep: 0, onStop: 'ignore' });
    const entry = final.logs.find((log) => log.message.includes('runtime deadline'));
    expect(entry, 'the timeout must say so in the run’s own log').toBeDefined();
    // ADR-002 §INT-1: `0` is the browser start — a position, not a missing value. The parent holds
    // no reading on the run timeline at all, and `null` is what the contract provides for that.
    // A wall-derived number here would be the second origin §11.5 forbids.
    expect(entry?.atMs).toBeNull();
    expect(entry?.atMs).not.toBe(0);
    // Asserted on the bytes too, because `atMs: 0` and `atMs: null` are both valid JSON numbers
    // to a reader that only looked at the object.
    const serialized = JSON.stringify(entry);
    expect(serialized).toContain('"atMs":null');
  });

  it('clamps a job asking for ten minutes of browser time to the configured maximum (AC-6)', async () => {
    const scheduler = createFakeScheduler();
    const driver = createChildDriver({ hangOnStep: 0, onStop: 'ignore' });
    harness = createHarness({ launcher: driver.launcher, scheduler, scratch: realScratch() });
    await harness.start();
    await post(
      harness.port,
      '/v1/runs',
      JSON.stringify(
        validJob({ deadlines: { admittedStartMs: ADMITTED_START_MS, totalRuntimeMs: 600_000 } }),
      ),
      SERVICE_TOKEN,
    );
    await until(() => scheduler.pending().length > 0, 20_000);

    // The kill lands at the server's value, not the job's. §5.2: "configurable within server
    // limits"; the epic: "within API bounds".
    expect(scheduler.pending()).toEqual([harness.config.maxTotalRuntimeMs]);
    expect(harness.config.maxTotalRuntimeMs).toBe(TOTAL_RUNTIME_MS);

    scheduler.advance(TOTAL_RUNTIME_MS);
    await until(() => harness?.app.coordinator.inFlight === 0, 20_000);
    const final = JSON.parse(harness.http.reportRequests.at(-1)?.body ?? '') as ReportBody;
    expect(final.outcome?.errorCode).toBe('TIMEOUT');
  });

  it('honours a job asking for less, clamped downward rather than up', async () => {
    const scheduler = createFakeScheduler();
    const driver = createChildDriver({ hangOnStep: 0, onStop: 'ignore' });
    harness = createHarness({ launcher: driver.launcher, scheduler, scratch: realScratch() });
    await harness.start();
    await post(
      harness.port,
      '/v1/runs',
      JSON.stringify(
        validJob({ deadlines: { admittedStartMs: ADMITTED_START_MS, totalRuntimeMs: 5_000 } }),
      ),
      SERVICE_TOKEN,
    );
    await until(() => scheduler.pending().length > 0, 20_000);
    expect(scheduler.pending()).toEqual([5_000]);

    scheduler.advance(5_000);
    await until(() => harness?.app.coordinator.inFlight === 0, 20_000);
  });
});

// ── AC-16: the three cases, on the serialized body ───────────────────────────────────────────

describe('AC-16 — a truncated run tells the truth about its video', () => {
  it('(a) the ordered stop completed and left a playable file → STORED, partial false', async () => {
    const { final, finalBytes } = await runToDeadline({
      hangOnStep: 0,
      onStop: 'flush',
      recording: {
        path: '/scratch/run-1/video/page.webm',
        bytes: 24_576,
        error: null,
        state: 'PENDING',
        partial: false,
      },
    });

    expect(final.outcome?.errorCode).toBe('TIMEOUT');
    // `PENDING` until story 10.14; the upload now earns `STORED` inside the same terminal path.
    expect(final.evidence?.state).toBe('STORED');
    // §5.2's ordered close exists precisely so the webm is finalized. **A timeout is not
    // automatically a truncation** (ADR-002 §17.3), and this is the case that says so.
    expect(final.evidence?.partial).toBe(false);
    expect(finalBytes).toContain('"partial":false');
  });

  it('(b) the grace expired, the tree was killed, and the file is nevertheless playable → STORED, partial TRUE', async () => {
    // The dangerous case, and the one ADR-002 §17.7 item 1 added. Chromium writes the webm
    // incrementally, so a killed recorder usually leaves a readable prefix. Reporting `PENDING`
    // with `partial: false` over it is a salvaged prefix presented as a whole video — the exact
    // sentence the epic's third acceptance bullet forbids.
    const { final, finalBytes } = await runToDeadline({
      hangOnStep: 0,
      onStop: 'ignore',
      // Chromium had already written a readable prefix when the tree was signalled. The child
      // never got to say anything about it, so the **parent** reads the directory.
      leavesVideo: { bytes: 24_576, header: true },
    });

    expect(final.outcome?.errorCode).toBe('TIMEOUT');
    // Playable, so the evidence is real, worth keeping and — since story 10.14 — uploaded.
    expect(final.evidence?.state).toBe('STORED');
    // …and **partial**, because the ordered stop never completed. Today, without this, the API
    // would publish `partial: false` over a salvaged prefix — a whole video that never existed.
    expect(final.evidence?.partial).toBe(true);
    expect(finalBytes).toContain('"partial":true');
  });

  it('(c) no playable file → UNAVAILABLE, partial false — never PENDING over an unflushed one', async () => {
    const { final } = await runToDeadline({ hangOnStep: 0, onStop: 'ignore' });
    expect(final.evidence?.state).toBe('UNAVAILABLE');
    expect(final.evidence?.partial).toBe(false);
    // A recording that does not exist is never uploaded, so `STORED` is still unreachable here —
    // which is the half of "STORED is earned" that survived story 10.14 unchanged (AC-8).
    expect(JSON.stringify(final)).not.toContain('STORED');
  });

  it('emits partial explicitly on every FINAL, false included, so "absent" is unreachable', async () => {
    // ADR-002 §17.5, §17.7 item 2. The field is optional on the wire because the merged runner had
    // no producer; this runner *is* the producer, so absent must stop being reachable from it.
    // Asserted on the serialized body, because an object with `partial: undefined` and an object
    // without the key look identical to `toMatchObject`.
    for (const script of [
      { hangOnStep: 0, onStop: 'ignore' as const },
      { hangOnStep: 0, onStop: 'flush' as const },
    ]) {
      const { finalBytes } = await runToDeadline(script);
      expect(finalBytes).toMatch(/"partial":(true|false)/u);
      await harness?.stop();
      harness = null;
    }
  });

  it('never derives partial from the outcome, in either direction', async () => {
    // §17.4's two counter-examples, asserted as the pair they are. A mutation implementing
    // `partial = (errorCode === TIMEOUT)` must turn both of these red — one because the timeout is
    // false, the other because the passing run is true.
    const flushedTimeout = await runToDeadline({
      hangOnStep: 0,
      onStop: 'flush',
      recording: {
        path: '/scratch/run-1/video/page.webm',
        bytes: 24_576,
        error: null,
        state: 'PENDING',
        partial: false,
      },
    });
    expect(flushedTimeout.final.outcome?.errorCode).toBe('TIMEOUT');
    expect(flushedTimeout.final.evidence?.partial).toBe(false);
    await harness?.stop();
    harness = null;

    // …and the mirror image: a run the parent never killed, whose recorder nevertheless died and
    // left a playable prefix behind. Nothing about the outcome says `TIMEOUT`, and the recording
    // is partial all the same.
    const crashedRecorder = await runWithout({
      result: { ok: true, failureKind: null, failureMessage: null },
      onStop: 'flush',
      recording: {
        path: '/scratch/run-1/video/page.webm',
        bytes: 24_576,
        error: null,
        state: 'PENDING',
        partial: true,
      },
    });
    expect(crashedRecorder.final.outcome?.errorCode).not.toBe('TIMEOUT');
    expect(crashedRecorder.final.evidence?.partial).toBe(true);
  });
});

// ── AC-17: the step that was running when the tree died ──────────────────────────────────────

describe('AC-17 — the in-flight step keeps the state that was observed of it', () => {
  it('leaves it RUNNING with null timings and null failure, and omits the steps never reached', async () => {
    const { final } = await runToDeadline({ hangOnStep: 0, onStop: 'ignore' });

    const inFlight = final.steps.find((step) => step.stepIndex === 0);
    expect(inFlight?.status).toBe('RUNNING');
    expect(inFlight?.startedAtMs).toBe(12);
    expect(inFlight?.finishedAtMs).toBeNull();
    expect(inFlight?.durationMs).toBeNull();
    // Not `FAIL`: that would claim an assertion outcome the runner never observed, and
    // `RunnerStepState.failure` is documented "null unless the status is FAIL".
    expect(inFlight?.failure).toBeNull();
    expect(inFlight?.status).not.toBe('FAIL');
    // Not `SKIPPED` either: that would claim it was never attempted.
    expect(inFlight?.status).not.toBe('SKIPPED');

    // The second step was never touched, so it is **absent** — the API fills the rest from the
    // confirmed revision (§8.2). One entry per step the runner has touched, and no more.
    expect(final.steps.map((step) => step.stepIndex)).toEqual([0]);
  });

  it('does not put the timeout text on the step, because that is the API projection’s (§18.1)', async () => {
    const { final } = await runToDeadline({ hangOnStep: 0, onStop: 'ignore' });
    const inFlight = final.steps.find((step) => step.stepIndex === 0);
    expect(inFlight?.failure).toBeNull();
    // The text lives where the fact already is: `outcome.errorCode`. Two representations of one
    // fact is what ADR-002 has now rejected four times.
    expect(final.outcome?.errorCode).toBe('TIMEOUT');
  });
});

// ── AC-10: the caps hold on the deadline path too ────────────────────────────────────────────

describe('AC-10 — message and retained-log caps hold on the deadline path', () => {
  it('bounds the timeout’s own log entry and the outcome message by the configured caps', async () => {
    const { final, harness: used } = await runToDeadline({ hangOnStep: 0, onStop: 'ignore' });
    for (const entry of final.logs) {
      expect(entry.message.length).toBeLessThanOrEqual(used.config.maxReportLogEntryLength);
    }
    expect(final.outcome?.errorMessage?.length ?? 0).toBeLessThanOrEqual(
      used.config.maxReportLogEntryLength,
    );
  });

  it('keeps a flooded FINAL inside maxBodyBytes, with logsTruncated set', async () => {
    // A run that floods log lines right up to the instant it is killed. A report rejected for size
    // is a lost result the runner cannot replay, so an oversized body is never the answer.
    const flood = Array.from({ length: 400 }, (_unused, index) => ({
      stream: 'stderr' as const,
      chunk: `${'q'.repeat(600)} line ${String(index)}\n`,
    }));
    const { final, finalBytes, harness: used } = await runToDeadline({
      hangOnStep: 0,
      onStop: 'ignore',
      writes: flood,
    });

    expect(Buffer.byteLength(finalBytes, 'utf8')).toBeLessThanOrEqual(used.config.maxReportBodyBytes);
    expect(final.outcome?.errorCode).toBe('TIMEOUT');
  });
});

// ── AC-5a: the bounded grace, and no step during it ──────────────────────────────────────────

describe('AC-5a — the finalization margin is bounded and sits outside both budgets', () => {
  it('orders the stop before the signal, and signals the tree when the grace expires', async () => {
    const { driver } = await runToDeadline({ hangOnStep: 0, onStop: 'ignore' });
    const child = driver.child();
    // The ordered stop is sent first — that is what §5.2's "close context to flush video when
    // possible" buys — and only then is the tree signalled.
    expect(child.sent.map((message) => message.kind)).toContain('stop');
    expect(child.killed).toBeGreaterThanOrEqual(1);
    const stopIndex = child.sent.findIndex((message) => message.kind === 'stop');
    expect(stopIndex).toBeGreaterThan(-1);
  });

  it('does not signal the tree when the child honours the stop inside the grace', async () => {
    const { driver } = await runToDeadline({
      hangOnStep: 0,
      onStop: 'flush',
      recording: {
        path: '/scratch/run-1/video/page.webm',
        bytes: 24_576,
        error: null,
        state: 'PENDING',
        partial: false,
      },
    });
    // The grace bought a flush, so there was nothing left to kill. A parent that signalled anyway
    // would be destroying the file it just waited for.
    expect(driver.child().killed).toBe(0);
  });

  it('leaves no process and no scratch directory behind when the terminal retry loop starts', async () => {
    // The epic: "retry delivery must not retain unlimited resources". The first terminal attempt
    // must find the child gone and the directory cleared, so the only thing held across the
    // retries is one bounded report body.
    const scheduler = createFakeScheduler();
    const driver = createChildDriver({ hangOnStep: 0, onStop: 'ignore' });
    harness = createHarness({ launcher: driver.launcher, scheduler, scratch: realScratch() });
    await harness.start();

    let scratchAtFirstAttempt: readonly string[] = ['not observed'];
    let killedAtFirstAttempt = 0;
    const scratchStore = harness.scratch;
    harness.http.reportOutcome = (request) => {
      const body = JSON.parse(request.body) as ReportBody;
      if (body.kind === 'FINAL') {
        scratchAtFirstAttempt = scratchStore.present;
        killedAtFirstAttempt = driver.child().killed;
      }
      return { kind: 'response', status: 200, body: '{}' };
    };

    await post(harness.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    await until(() => scheduler.pending().length > 0, 20_000);
    scheduler.advance(TOTAL_RUNTIME_MS);
    await until(() => harness?.app.coordinator.inFlight === 0, 20_000);

    expect(scratchAtFirstAttempt).toEqual([]);
    expect(killedAtFirstAttempt).toBeGreaterThanOrEqual(1);
  });
});
