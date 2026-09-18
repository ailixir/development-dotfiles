/**
 * Studio v1 WP4 — `DELETE /v1/runs/{id}` (ADR-002 §29, decision D4).
 *
 * The cancel reuses the deadline's stop path, so the arrangement is `deadline-outcome.test.ts`'s:
 * a **real listening server**, the real child launcher over a scripted child at the spawn seam,
 * and a real scratch root. What differs is who orders the stop — a caller, not the clock — and the
 * answer the run gives: `ERROR` / `CANCELLED`, neither a timeout nor a runner fault.
 *
 * The grace is observed on the real timer the launcher uses: a child that honours the stop is
 * never signalled, and a child that ignores it is signalled only once the grace has run out.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CANCELLED_MESSAGE } from '../../src/run/launcher.js';
import type { ReportBody } from '../../src/reporting/snapshot.js';
import { FINISHED_RUNS_REMEMBERED } from '../../src/server/runCoordinator.js';
import { createFsScratchStore } from '../../src/server/scratch.js';
import { createChildDriver } from '../helpers/childDriver.js';
import type { ChildScript } from '../helpers/childDriver.js';
import { createHarness, until, SERVICE_TOKEN } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { post, validJob } from '../helpers/runner.js';
import { createFakeScheduler } from '../helpers/scheduler.js';

/** The job's execution id, which is the path segment the API relays. */
const EXECUTION_ID = String(validJob().executionId);

/** Long enough to measure on a loaded machine, short enough not to slow the suite. */
const GRACE_MS = 250;

let harness: Harness | null = null;
const roots: string[] = [];

function realScratch(): ReturnType<typeof createFsScratchStore> {
  const root = mkdtempSync(join(tmpdir(), 'studio-runner-cancel-'));
  roots.push(root);
  return createFsScratchStore(root);
}

afterEach(async () => {
  await harness?.stop();
  harness = null;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Response {
  readonly status: number;
  readonly body: { readonly code?: string };
}

/** `DELETE`, with no body, exactly as the worker's `HttpRunnerDispatchClient` sends it. */
function del(port: number, path: string, token: string | null): Promise<Response> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'DELETE',
        headers: token === null ? {} : { authorization: `Bearer ${token}` },
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () => {
          resolve({
            status: incoming.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { code?: string },
          });
        });
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

/** Admits one run whose child hangs in its first step, and returns once the run is under way. */
async function hangOne(
  script: ChildScript,
): Promise<{ driver: ReturnType<typeof createChildDriver>; runner: Harness }> {
  const scheduler = createFakeScheduler();
  const driver = createChildDriver(script, { stopTimeoutMs: GRACE_MS });
  const runner = createHarness({ launcher: driver.launcher, scheduler, scratch: realScratch() });
  harness = runner;
  await runner.start();
  const admitted = await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
  expect(admitted.status).toBe(202);
  // The runtime deadline is armed, so the browser is up and the step is hung.
  await until(() => scheduler.pending().length > 0, 20_000);
  return { driver, runner };
}

/**
 * Waits on the wall clock rather than on `until`'s tick budget. The grace is a real timer, and a
 * tick budget spent faster than the grace would fail for the budget's reason, not the code's.
 */
async function within(predicate: () => boolean, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Condition was not met within ${String(ms)} ms.`);
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

function finalReport(runner: Harness): ReportBody {
  return JSON.parse(runner.http.reportRequests.at(-1)?.body ?? '') as ReportBody;
}

function sentKinds(driver: ReturnType<typeof createChildDriver>): string[] {
  return driver.child().sent.map((message) => message.kind);
}

describe('a running run: ordered stop, bounded grace, then the process tree', () => {
  it('stops a child that honours the stop inside the grace, without a signal, and delivers ERROR / CANCELLED', async () => {
    const { driver, runner } = await hangOne({ hangOnStep: 0, onStop: 'flush' });

    const answered = await del(runner.port, `/v1/runs/${EXECUTION_ID}`, SERVICE_TOKEN);
    expect(answered.status).toBe(202);
    expect(answered.body.code).toBe('CANCELLING');

    await within(() => runner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);

    expect(sentKinds(driver)).toContain('stop');
    expect(driver.child().killed).toBe(0);
    const final = finalReport(runner);
    expect(final.kind).toBe('FINAL');
    expect(final.outcome?.result).toBe('ERROR');
    expect(final.outcome?.errorCode).toBe('CANCELLED');
    expect(final.outcome?.errorMessage).toBe(CANCELLED_MESSAGE);
    // The recorder flushed inside the grace, so the recording is whole, and it was uploaded.
    expect(final.evidence?.partial).toBe(false);
    expect(final.evidence?.state).toBe('STORED');
    // The cause is on the run's own log, written before the signal.
    expect(JSON.stringify(final.logs)).toContain('The run was cancelled');
  }, 20_000);

  it('kills the tree of a child that ignores the stop — only after the grace — and still delivers FINAL', async () => {
    const { driver, runner } = await hangOne({ hangOnStep: 0, onStop: 'ignore' });

    const orderedAt = Date.now();
    expect((await del(runner.port, `/v1/runs/${EXECUTION_ID}`, SERVICE_TOKEN)).status).toBe(202);
    await within(() => driver.child().killed > 0, GRACE_MS + 5_000);
    const killedAfterMs = Date.now() - orderedAt;

    // Not before the grace ran out, and not long after it either.
    expect(killedAfterMs).toBeGreaterThanOrEqual(GRACE_MS - 20);
    expect(killedAfterMs).toBeLessThan(GRACE_MS + 5_000);

    await within(() => runner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);
    const final = finalReport(runner);
    expect(final.outcome?.result).toBe('ERROR');
    expect(final.outcome?.errorCode).toBe('CANCELLED');
    // Neither the deadline's code nor the residual: the cause was recorded before the signal.
    expect(final.outcome?.errorCode).not.toBe('TIMEOUT');
    expect(final.outcome?.errorCode).not.toBe('RUN_ERROR');
  }, 20_000);

  it('orders exactly one stop however many times it is asked', async () => {
    const { driver, runner } = await hangOne({ hangOnStep: 0, onStop: 'ignore' });

    const first = await del(runner.port, `/v1/runs/${EXECUTION_ID}`, SERVICE_TOKEN);
    const second = await del(runner.port, `/v1/runs/${EXECUTION_ID}`, SERVICE_TOKEN);
    expect([first.status, second.status]).toEqual([202, 202]);

    await within(() => runner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);
    expect(sentKinds(driver).filter((kind) => kind === 'stop')).toHaveLength(1);
    expect(runner.http.reportRequests.filter((r) => r.body.includes('"FINAL"'))).toHaveLength(1);
  }, 20_000);
});

describe('a run cancelled before a step ran', () => {
  it('stops a browser that was still starting and never sends it a step', async () => {
    const scheduler = createFakeScheduler();
    const driver = createChildDriver(
      { holdReady: true, hangOnStep: 0, onStop: 'flush' },
      { stopTimeoutMs: GRACE_MS, launchTimeoutMs: 20_000 },
    );
    harness = createHarness({ launcher: driver.launcher, scheduler, scratch: realScratch() });
    const runner = harness;
    await runner.start();
    expect((await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN)).status).toBe(202);
    await until(() => driver.spawner.children.length > 0 && driver.scratchPath() !== null, 20_000);

    expect((await del(runner.port, `/v1/runs/${EXECUTION_ID}`, SERVICE_TOKEN)).status).toBe(202);
    driver.releaseReady();
    await within(() => runner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);

    expect(sentKinds(driver)).not.toContain('execute');
    expect(sentKinds(driver)).toContain('stop');
    const final = finalReport(runner);
    expect(final.outcome?.result).toBe('ERROR');
    expect(final.outcome?.errorCode).toBe('CANCELLED');
  }, 20_000);
});

describe('what the route answers when there is nothing to stop', () => {
  it('answers 404 RUN_NOT_FOUND for a run this runner never held', async () => {
    harness = createHarness();
    await harness.start();

    const answered = await del(harness.port, '/v1/runs/never-admitted-here', SERVICE_TOKEN);
    expect(answered.status).toBe(404);
    expect(answered.body.code).toBe('RUN_NOT_FOUND');
  });

  it('answers 409 RUN_FINISHED for a run that already delivered its outcome, and changes nothing', async () => {
    harness = createHarness();
    const runner = harness;
    await runner.start();
    expect((await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN)).status).toBe(202);
    runner.advance(1);
    await within(() => runner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);
    const reportsBefore = runner.http.reportRequests.length;
    const outcome = finalReport(runner).outcome?.result;

    const answered = await del(runner.port, `/v1/runs/${EXECUTION_ID}`, SERVICE_TOKEN);
    expect(answered.status).toBe(409);
    expect(answered.body.code).toBe('RUN_FINISHED');
    expect(runner.http.reportRequests).toHaveLength(reportsBefore);
    expect(finalReport(runner).outcome?.result).toBe(outcome);
    expect(FINISHED_RUNS_REMEMBERED).toBeGreaterThan(0);
  });

  it('refuses an unauthenticated DELETE on the head, before anything is looked up', async () => {
    harness = createHarness();
    await harness.start();

    expect((await del(harness.port, `/v1/runs/${EXECUTION_ID}`, null)).status).toBe(401);
    expect((await del(harness.port, `/v1/runs/${EXECUTION_ID}`, 'not-the-token')).status).toBe(403);
  });

  it('serves DELETE on one run only: the collection and a nested path are not routes', async () => {
    harness = createHarness();
    await harness.start();

    expect((await del(harness.port, '/v1/runs', SERVICE_TOKEN)).status).toBe(404);
    expect((await del(harness.port, `/v1/runs/${EXECUTION_ID}/steps`, SERVICE_TOKEN)).status).toBe(404);
    expect((await del(harness.port, '/v1/runs', SERVICE_TOKEN)).body.code).toBe('NOT_FOUND');
  });
});

describe('the grace the deployment runs with', () => {
  it('defaults to 5 s, decision D4', () => {
    const runner = createHarness();
    expect(runner.config.browserStopTimeoutMs).toBe(5_000);
  });
});
