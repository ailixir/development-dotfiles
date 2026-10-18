/**
 * Studio v1 WP4 — `DELETE /v2/runs/{id}` (ADR-002 §29, decision D4).
 *
 * The cancel reuses the deadline's stop path, so the arrangement is `deadline-outcome.test.ts`'s:
 * a **real listening server**, the real child launcher over a scripted child at the spawn seam,
 * and a real scratch root. What differs is who orders the stop — a caller, not the clock — and the
 * answer the run gives: `ERROR` / `CANCELLED`, neither a timeout nor a runner fault.
 *
 * The grace is observed on the real timer the launcher uses: a child that honours the stop is
 * never signalled, and a child that ignores it is signalled only once the grace has run out.
 *
 * STUDIO-OBS-012A AC-3 moved the cancel to `DELETE /v2/runs/{id}` with the artifact-1 run route's
 * deletion; the runs here are observed jobs and the scripted child speaks the observed protocol.
 * D1's rewrite of a child-reported `FAIL` into `SKIPPED` was artifact-1 only (the observed child
 * reports the interrupted step itself, with its closed code) and its case was deleted.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CANCELLED_MESSAGE } from '../../src/run/launcher.js';
import type { ReportBody } from '../../src/reporting/snapshot.js';
import {
  CONTROL_POLL_INTERVAL_MS,
  FINISHED_RUNS_REMEMBERED,
  STOPPED_STEP_MESSAGE,
} from '../../src/server/runCoordinator.js';
import { createFsScratchStore } from '../../src/server/scratch.js';
import { createChildDriver, scriptedStartMs } from '../helpers/childDriver.js';
import type { ChildScript } from '../helpers/childDriver.js';
import { createHarness, until, SERVICE_TOKEN } from '../helpers/harness.js';
import { testTls } from '../helpers/guidedTls.js';
import type { Harness } from '../helpers/harness.js';
import { OBSERVED_EXECUTION_ID, observedBody, post } from '../helpers/runner.js';
import { createFakeScheduler } from '../helpers/scheduler.js';

/** The job's execution id, which is the path segment the API relays. */
const EXECUTION_ID = OBSERVED_EXECUTION_ID;

/** Long enough to measure on a loaded machine, short enough not to slow the suite. */
const GRACE_MS = 250;

let harness: Harness | null = null;
const roots: string[] = [];
/** A second pod, for the multi-pod scenario; stopped alongside the first. */
let secondPod: Harness | null = null;

function realScratch(): ReturnType<typeof createFsScratchStore> {
  const root = mkdtempSync(join(tmpdir(), 'studio-runner-cancel-'));
  roots.push(root);
  return createFsScratchStore(root);
}

afterEach(async () => {
  await harness?.stop();
  harness = null;
  await secondPod?.stop();
  secondPod = null;
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
        // The one listener is TLS with a pinned client certificate (STUDIO-OBS-009 AC-3).
        ...testTls,
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
  configure: (runner: Harness) => void = () => undefined,
): Promise<{ driver: ReturnType<typeof createChildDriver>; runner: Harness }> {
  const scheduler = createFakeScheduler();
  const driver = createChildDriver(script, { stopTimeoutMs: GRACE_MS });
  const runner = createHarness({ launcher: driver.launcher, scheduler, scratch: realScratch() });
  harness = runner;
  configure(runner);
  await runner.start();
  const admitted = await post(runner.port, '/v2/runs', observedBody(), SERVICE_TOKEN);
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

    const answered = await del(runner.port, `/v2/runs/${EXECUTION_ID}`, SERVICE_TOKEN);
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
    // The scripted child owns no app video, so there is nothing to upload — and nothing is
    // claimed partial: a recording that does not exist is not a partial one (ADR-002 §17.3).
    expect(final.evidence?.partial).toBe(false);
    expect(final.evidence?.state).toBe('UNAVAILABLE');
    // The cause is on the run's own log, written before the signal.
    expect(JSON.stringify(final.logs)).toContain('The run was cancelled');
  }, 20_000);

  it('kills the tree of a child that ignores the stop — only after the grace — and still delivers FINAL', async () => {
    const { driver, runner } = await hangOne({ hangOnStep: 0, onStop: 'ignore' });

    const orderedAt = Date.now();
    expect((await del(runner.port, `/v2/runs/${EXECUTION_ID}`, SERVICE_TOKEN)).status).toBe(202);
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

    const first = await del(runner.port, `/v2/runs/${EXECUTION_ID}`, SERVICE_TOKEN);
    const second = await del(runner.port, `/v2/runs/${EXECUTION_ID}`, SERVICE_TOKEN);
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
    expect((await post(runner.port, '/v2/runs', observedBody(), SERVICE_TOKEN)).status).toBe(202);
    await until(() => driver.spawner.children.length > 0 && driver.scratchPath() !== null, 20_000);

    expect((await del(runner.port, `/v2/runs/${EXECUTION_ID}`, SERVICE_TOKEN)).status).toBe(202);
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

    const answered = await del(harness.port, '/v2/runs/never-admitted-here', SERVICE_TOKEN);
    expect(answered.status).toBe(404);
    expect(answered.body.code).toBe('RUN_NOT_FOUND');
  });

  it('answers 409 RUN_FINISHED for a run that already delivered its outcome, and changes nothing', async () => {
    harness = createHarness();
    const runner = harness;
    await runner.start();
    expect((await post(runner.port, '/v2/runs', observedBody(), SERVICE_TOKEN)).status).toBe(202);
    runner.advance(1);
    await within(() => runner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);
    const reportsBefore = runner.http.reportRequests.length;
    const outcome = finalReport(runner).outcome?.result;

    const answered = await del(runner.port, `/v2/runs/${EXECUTION_ID}`, SERVICE_TOKEN);
    expect(answered.status).toBe(409);
    expect(answered.body.code).toBe('RUN_FINISHED');
    expect(runner.http.reportRequests).toHaveLength(reportsBefore);
    expect(finalReport(runner).outcome?.result).toBe(outcome);
    expect(FINISHED_RUNS_REMEMBERED).toBeGreaterThan(0);
  });

  it('refuses an unauthenticated DELETE on the head, before anything is looked up', async () => {
    harness = createHarness();
    await harness.start();

    expect((await del(harness.port, `/v2/runs/${EXECUTION_ID}`, null)).status).toBe(401);
    expect((await del(harness.port, `/v2/runs/${EXECUTION_ID}`, 'not-the-token')).status).toBe(403);
  });

  it('serves DELETE on one run only: the collection and a nested path are not routes', async () => {
    harness = createHarness();
    await harness.start();

    expect((await del(harness.port, '/v2/runs', SERVICE_TOKEN)).status).toBe(404);
    expect((await del(harness.port, `/v2/runs/${EXECUTION_ID}/steps`, SERVICE_TOKEN)).status).toBe(404);
    expect((await del(harness.port, '/v2/runs', SERVICE_TOKEN)).body.code).toBe('NOT_FOUND');
    // The deleted artifact-1 cancel route is not served either.
    expect((await del(harness.port, `/v1/runs/${EXECUTION_ID}`, SERVICE_TOKEN)).status).toBe(404);
  });
});

describe('the grace the deployment runs with', () => {
  it('defaults to 5 s, decision D4', () => {
    const runner = createHarness();
    expect(runner.config.browserStopTimeoutMs).toBe(5_000);
  });
});

// ── The pull half (ADR-002 §29): the pod that holds the run learns the cancel itself ──────────

const CANCEL_ACK = { kind: 'response', status: 200, body: '{"cancelRequested":true}' } as const;

describe('the owning runner pulls the cancel, whatever pod the DELETE reached', () => {
  it('stops the run when the control read says cancelRequested, on the same path as DELETE', async () => {
    const { driver, runner } = await hangOne({ hangOnStep: 0, onStop: 'flush' });
    expect(runner.http.controlRequests).toHaveLength(0);

    runner.http.controlOutcome = CANCEL_ACK;
    runner.controlScheduler.advance(CONTROL_POLL_INTERVAL_MS);
    await within(() => runner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);

    const read = runner.http.controlRequests[0];
    expect(read?.url).toBe(
      `https://api.internal.example/internal/studio/executions/${EXECUTION_ID}/control`,
    );
    expect(read?.headers.authorization).toBe(`Bearer ${runner.config.callbackIdentityToken}`);
    expect(sentKinds(driver)).toContain('stop');
    expect(finalReport(runner).outcome?.errorCode).toBe('CANCELLED');
  }, 20_000);

  it('reads every interval while nothing is cancelled, and never before the first interval', async () => {
    const { runner } = await hangOne({ hangOnStep: 0, onStop: 'flush' });

    runner.controlScheduler.advance(CONTROL_POLL_INTERVAL_MS - 1);
    expect(runner.http.controlRequests).toHaveLength(0);
    runner.controlScheduler.advance(1);
    await within(() => runner.http.controlRequests.length === 1, 5_000);
    runner.controlScheduler.advance(CONTROL_POLL_INTERVAL_MS);
    await within(() => runner.http.controlRequests.length === 2, 5_000);
    expect(runner.app.coordinator.inFlight).toBe(1);

    runner.scheduler.advance(120_000);
    await within(() => runner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);
  }, 20_000);

  it('stops the run when a progress acknowledgement carries cancelRequested', async () => {
    // Not `hangOne`: its wait for the armed deadline races the stop this test is about.
    const driver = createChildDriver({ hangOnStep: 0, onStop: 'flush' }, { stopTimeoutMs: GRACE_MS });
    const runner = createHarness({ launcher: driver.launcher, scratch: realScratch() });
    harness = runner;
    // Every report the API acknowledges says a cancel is recorded: the first one to land stops the
    // run, with no DELETE and no control read at all.
    runner.http.reportOutcome = CANCEL_ACK;
    await runner.start();
    expect((await post(runner.port, '/v2/runs', observedBody(), SERVICE_TOKEN)).status).toBe(202);

    await within(() => runner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);

    expect(runner.http.controlRequests).toHaveLength(0);
    expect(sentKinds(driver)).toContain('stop');
    expect(finalReport(runner).outcome?.errorCode).toBe('CANCELLED');
  }, 20_000);

  it('stops polling once the run has ended', async () => {
    const { runner } = await hangOne({ hangOnStep: 0, onStop: 'flush' });
    expect(runner.controlScheduler.pending()).toEqual([CONTROL_POLL_INTERVAL_MS]);

    runner.scheduler.advance(120_000);
    await within(() => runner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);

    expect(runner.controlScheduler.pending()).toEqual([]);
    runner.controlScheduler.advance(CONTROL_POLL_INTERVAL_MS * 5);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(runner.http.controlRequests).toHaveLength(0);
  }, 20_000);

  it('two pods: the DELETE lands on the wrong one (404) and the owner still stops through the poll', async () => {
    // The API's view, shared by both pods: a cancel is recorded or it is not.
    let recorded = false;
    const answer = (): { kind: 'response'; status: 200; body: string } => ({
      kind: 'response',
      status: 200,
      body: JSON.stringify({ cancelRequested: recorded }),
    });
    const { driver, runner: owner } = await hangOne({ hangOnStep: 0, onStop: 'flush' }, (pod) => {
      pod.http.controlOutcome = answer;
    });
    const other = createHarness({ scratch: realScratch() });
    secondPod = other;
    other.http.controlOutcome = answer;
    await other.start();

    // The API records the cancel and relays it through the Service, which picks the other pod.
    recorded = true;
    const relayed = await del(other.port, `/v2/runs/${EXECUTION_ID}`, SERVICE_TOKEN);
    expect(relayed.status).toBe(404);
    expect(relayed.body.code).toBe('RUN_NOT_FOUND');
    expect(sentKinds(driver)).not.toContain('stop');

    // Within one interval the owner reads the flag and stops on the same path.
    owner.controlScheduler.advance(CONTROL_POLL_INTERVAL_MS);
    await within(() => owner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);

    expect(sentKinds(driver)).toContain('stop');
    const final = finalReport(owner);
    expect(final.outcome?.result).toBe('ERROR');
    expect(final.outcome?.errorCode).toBe('CANCELLED');
    expect(other.http.reportRequests).toHaveLength(0);
  }, 20_000);
});

// ── Decision D1: a step the kill left RUNNING is SKIPPED with the stop text ─────────────────

function stepZero(body: ReportBody): ReportBody['steps'][number] | undefined {
  return body.steps.find((step) => step.stepIndex === 0);
}

describe('D1 — the step a cancel interrupted is reported SKIPPED with the stop text', () => {
  it('turns a step still RUNNING when the grace ran out into SKIPPED on the FINAL, with no finish', async () => {
    const { driver, runner } = await hangOne({ hangOnStep: 0, onStop: 'ignore' });

    expect((await del(runner.port, `/v2/runs/${EXECUTION_ID}`, SERVICE_TOKEN)).status).toBe(202);
    await within(() => runner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);

    expect(driver.child().killed).toBeGreaterThan(0);
    expect(stepZero(finalReport(runner))).toEqual({
      stepIndex: 0,
      status: 'SKIPPED',
      startedAtMs: scriptedStartMs(0),
      finishedAtMs: null,
      durationMs: null,
      failure: STOPPED_STEP_MESSAGE,
    });
  }, 20_000);

  it('is the cancel’s rule only: a deadline kill leaves the step as the child reported it', async () => {
    // §18.1 has the API name a TIMEOUT step still RUNNING; D1 decides nothing about deadlines.
    const flushed = await hangOne({ hangOnStep: 0, onStop: 'flush' });
    flushed.runner.scheduler.advance(120_000);
    await within(() => flushed.runner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);
    expect(finalReport(flushed.runner).outcome?.errorCode).toBe('TIMEOUT');
    expect(stepZero(finalReport(flushed.runner))?.status).toBe('FAIL');
    await flushed.runner.stop();
    harness = null;

    const killed = await hangOne({ hangOnStep: 0, onStop: 'ignore' });
    killed.runner.scheduler.advance(120_000);
    await within(() => killed.runner.app.coordinator.inFlight === 0, GRACE_MS + 5_000);
    expect(finalReport(killed.runner).outcome?.errorCode).toBe('TIMEOUT');
    expect(stepZero(finalReport(killed.runner))?.status).toBe('RUNNING');
  }, 20_000);
});
