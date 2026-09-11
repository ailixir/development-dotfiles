/**
 * AC-23 — concurrency proven by holding real state open and by **interleaving**.
 *
 * Story 10.4's QA round set the bar: sequential happy-path calls that merely *happen* to arrive
 * one after another prove nothing. Where 10.4 held a database row lock open, this story holds the
 * capacity slot and the in-flight admission open, and drives genuinely concurrent HTTP requests
 * whose bodies are delivered interleaved.
 *
 * Each case names the guard it falsifies. Two of them are accompanied by an explicit
 * **falsification test**: the guard is neutralised through an existing dependency-injection seam
 * — no production code is modified or made test-aware — and the assertion is that the suite then
 * *fails*. A concurrency test that cannot be made to fail is a concurrency test that proves
 * nothing.
 */
import { afterEach, describe, expect, it } from 'vitest';

import type { ReportBody } from '../../src/reporting/snapshot.js';
import type { CapacityPool, CapacitySlot } from '../../src/server/capacity.js';
import { createCapacityPool } from '../../src/server/capacity.js';
import { createHarness, SERVICE_TOKEN, until } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { post, postInterleaved, singleWinnerAdmission, validJob } from '../helpers/runner.js';

const started: Harness[] = [];

async function start(options?: Parameters<typeof createHarness>[0]): Promise<Harness> {
  const runner = createHarness(options);
  await runner.start();
  started.push(runner);
  return runner;
}

afterEach(async () => {
  for (const runner of started.splice(0)) await runner.stop();
});

function bodies(count: number): string[] {
  return Array.from({ length: count }, (_value, index) =>
    JSON.stringify(validJob({ attemptId: `attempt-${String(index)}`, executionId: `exec-${String(index)}` })),
  );
}

describe('Case 1 — a held slot refuses the next request without issuing an admission', () => {
  it('returns 429 while the slot is held by an in-flight run', async () => {
    const runner = await start();
    const release = runner.http.holdAdmission();
    const first = post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    await until(() => runner.http.admissionRequests.length === 1);

    const second = await post(
      runner.port,
      '/v1/runs',
      JSON.stringify(validJob({ attemptId: 'attempt-2' })),
      SERVICE_TOKEN,
    );

    expect(second.status).toBe(429);
    // Still one admission request: the refusal was decided without contacting the API.
    expect(runner.http.admissionRequests).toHaveLength(1);

    release();
    await first;
  });
});

describe('Case 2 — interleaved acquire: N concurrent requests, exactly one 202', () => {
  it('yields one 202 and one admission request from eight interleaved HTTP requests', async () => {
    const runner = await start();
    // The slot is held open by gating the launch, not the admission: every request still gets a
    // response, and the winner keeps the single slot for the whole test.
    const release = runner.launcher.holdLaunch();

    const responses = await postInterleaved(runner.port, '/v1/runs', bodies(8), SERVICE_TOKEN);

    const accepted = responses.filter((response) => response.status === 202);
    const refused = responses.filter((response) => response.status === 429);
    expect(accepted).toHaveLength(1);
    expect(refused).toHaveLength(7);
    // Exactly one admission request was issued for eight concurrent requests.
    expect(runner.http.admissionRequests).toHaveLength(1);
    // Seven of the eight reached no adapter at all.
    expect(runner.launcher.launches.length).toBeLessThanOrEqual(1);
    expect(runner.scratch.present.length).toBeLessThanOrEqual(1);

    release();
    await until(() => runner.app.coordinator.inFlight === 0);
  });

  /**
   * The same race with the event loop taken out of the argument.
   *
   * The HTTP case above proves the observable behaviour, but Node delivers eight loopback
   * requests across several event-loop turns, so it does not *guarantee* that two acquires ever
   * raced within one turn. Calling `submit` eight times in a single synchronous burst does: every
   * call reaches the capacity decision before any of them has yielded. This is the falsifiable
   * form of AC-10's "no `await` between observing free capacity and holding the slot".
   */
  it('eight submits in one synchronous burst yield exactly one 202', async () => {
    const runner = await start();
    const release = runner.launcher.holdLaunch();

    const decisions = await Promise.all(
      bodies(8).map((body) => runner.app.coordinator.submit(JSON.parse(body) as unknown)),
    );

    expect(decisions.filter((decision) => decision.status === 202)).toHaveLength(1);
    expect(decisions.filter((decision) => decision.status === 429)).toHaveLength(7);
    expect(runner.http.admissionRequests).toHaveLength(1);

    release();
    await until(() => runner.app.coordinator.inFlight === 0);
  });

  /**
   * Falsification. `CapacityPool` is already a dependency-injection seam, so a read-then-write
   * pool can be substituted without the production code knowing a test exists. With the guard
   * neutralised the burst above admits eight runs against a pool of one — which is exactly what
   * the real assertion is sensitive to.
   */
  it('FAILS with the guard neutralised: a read-then-write pool admits eight', async () => {
    const runner = await start({ pool: readThenWritePool(1) });
    const release = runner.launcher.holdLaunch();

    const decisions = await Promise.all(
      bodies(8).map((body) => runner.app.coordinator.submit(JSON.parse(body) as unknown)),
    );

    expect(decisions.filter((decision) => decision.status === 202).length).toBeGreaterThan(1);
    expect(runner.http.admissionRequests.length).toBeGreaterThan(1);

    release();
    await until(() => runner.app.coordinator.inFlight === 0);
  });
});

/**
 * A pool with the wrong shape: it observes free capacity, yields to the event loop, and only then
 * takes the slot.
 *
 * `setImmediate` stands in for whatever innocent `await` a read-then-write implementation would
 * have between observing and holding — a body parse, a clock read, a log line. The size of the
 * window is not the point; that there *is* one is. Every `await` in a single-threaded server is a
 * window in which a second request observes the same free slot.
 */
function readThenWritePool(size: number): CapacityPool {
  let inUse = 0;
  let draining = false;
  let nextId = 0;
  const pool = {
    get size(): number {
      return size;
    },
    get inUse(): number {
      return inUse;
    },
    get draining(): boolean {
      return draining;
    },
    beginDrain(): void {
      draining = true;
    },
    tryAcquire(): CapacitySlot | null {
      if (draining || inUse >= size) return null;
      // The window: capacity was observed free, and the slot is taken a turn later.
      nextId += 1;
      const id = nextId;
      let released = false;
      setImmediate(() => {
        inUse += 1;
      });
      return {
        id,
        get released(): boolean {
          return released;
        },
        release(): void {
          if (released) return;
          released = true;
          inUse -= 1;
        },
      };
    },
  };
  return pool;
}

describe('Case 3 — two instances, one attempt: exactly one browser launch (AC-7b)', () => {
  it('one runner wins, the other gets 409, launches nothing and never re-attempts', async () => {
    const cas = singleWinnerAdmission();
    const runnerA = await start({ env: { STUDIO_RUNNER_INSTANCE_ID: 'runner-a' } });
    const runnerB = await start({ env: { STUDIO_RUNNER_INSTANCE_ID: 'runner-b' } });
    runnerA.http.admissionOutcome = cas;
    runnerB.http.admissionOutcome = cas;

    const job = JSON.stringify(validJob({ attemptId: 'contested-attempt' }));
    // Both in flight simultaneously against one single-winner CAS.
    const [responseA, responseB] = await Promise.all([
      post(runnerA.port, '/v1/runs', job, SERVICE_TOKEN),
      post(runnerB.port, '/v1/runs', job, SERVICE_TOKEN),
    ]);

    const statuses = [responseA.status, responseB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([202, 409]);

    await until(
      () => runnerA.app.coordinator.inFlight === 0 && runnerB.app.coordinator.inFlight === 0,
    );

    const launches = runnerA.launcher.launches.length + runnerB.launcher.launches.length;
    expect(launches).toBe(1);

    const loser = responseA.status === 409 ? runnerA : runnerB;
    // The loser launched nothing, created no scratch and no evidence key.
    expect(loser.launcher.launches).toEqual([]);
    expect(loser.scratch.present).toEqual([]);
    expect(loser.log.events).toEqual(['admission.request']);
    // It released its slot and did not re-attempt admission under any identity.
    expect(loser.app.pool.inUse).toBe(0);
    expect(loser.http.admissionRequests).toHaveLength(1);
  });

  /**
   * Falsification for the *runner-side* property. `AdmissionClient` is a seam, so wrapping it to
   * map `409 → ADMITTED` neutralises "obey the CAS verdict" without touching production code. If
   * the runner did not actually obey the verdict, the assertion above would be green for the
   * wrong reason — here it produces two launches for one attempt.
   */
  it('FAILS with the verdict ignored: a runner that treats 409 as success launches too', async () => {
    const cas = singleWinnerAdmission();
    const runnerA = await start({ env: { STUDIO_RUNNER_INSTANCE_ID: 'runner-a' } });
    const runnerB = await start({ env: { STUDIO_RUNNER_INSTANCE_ID: 'runner-b' } });
    runnerA.http.admissionOutcome = cas;
    runnerB.http.admissionOutcome = cas;
    disobeyAdmissionVerdict(runnerB);

    const job = JSON.stringify(validJob({ attemptId: 'contested-attempt' }));
    await Promise.all([
      post(runnerA.port, '/v1/runs', job, SERVICE_TOKEN),
      post(runnerB.port, '/v1/runs', job, SERVICE_TOKEN),
    ]);
    await until(
      () => runnerA.app.coordinator.inFlight === 0 && runnerB.app.coordinator.inFlight === 0,
    );

    const launches = runnerA.launcher.launches.length + runnerB.launcher.launches.length;
    expect(launches).toBe(2);
  });
});

/**
 * Rewrites the fake HTTP client's admission verdict so a `409` comes back as a `200`.
 *
 * This neutralises the runner-side obedience property at the transport, which is the closest a
 * test can get to "the runner ignored the CAS" without editing the runner.
 */
function disobeyAdmissionVerdict(runner: Harness): void {
  const original = runner.http.admissionOutcome;
  runner.http.admissionOutcome = (request, index) => {
    const outcome = typeof original === 'function' ? original(request, index) : original;
    if (outcome.kind === 'response' && outcome.status === 409) {
      return { kind: 'response', status: 200, body: '{}' };
    }
    return outcome;
  };
}

describe('Case 4 — /v1/validate stays responsive while the slot is held', () => {
  it('answers validate concurrently with an in-flight admission', async () => {
    const runner = await start();
    const release = runner.http.holdAdmission();
    const run = post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    await until(() => runner.http.admissionRequests.length === 1);

    const job = validJob();
    const validations = await Promise.all(
      Array.from({ length: 4 }, () =>
        post(
          runner.port,
          '/v1/validate',
          JSON.stringify({ artifact: job.artifact, source: job.source, references: job.references }),
          SERVICE_TOKEN,
        ),
      ),
    );

    for (const response of validations) expect(response.status).toBe(200);
    // Validate took no slot: the single slot is still the run's.
    expect(runner.app.pool.inUse).toBe(1);

    release();
    await run;
  });
});

describe('Case 5 — SIGTERM during the in-flight run drains without abandoning it', () => {
  it('finishes and reports the admitted run while refusing everything new', async () => {
    const runner = await start();
    const releaseLaunch = runner.launcher.holdLaunch();
    await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    await until(() => runner.app.coordinator.inFlight === 1);

    const drained = runner.app.drain();
    const refused = await Promise.all(
      bodies(3).map((body) => post(runner.port, '/v1/runs', body, SERVICE_TOKEN)),
    );
    for (const response of refused) expect(response.status).toBe(503);

    releaseLaunch();
    expect((await drained).completed).toBe(true);
    expect(
      runner.http.reportRequests.filter(
        (request) => (JSON.parse(request.body) as ReportBody).kind === 'FINAL',
      ),
    ).toHaveLength(1);
  });
});

describe('Case 6 — a FINAL retry racing the drain deadline resolves once', () => {
  it('delivers byte-identical attempts and settles exactly one terminal result', async () => {
    const runner = await start({
      env: {
        STUDIO_RUNNER_TERMINAL_DELIVERY_MAX_ATTEMPTS: '4',
        STUDIO_RUNNER_TERMINAL_DELIVERY_BACKOFF_MS: '10',
        STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS: '10000',
        STUDIO_RUNNER_DRAIN_TIMEOUT_MS: '5000',
      },
    });
    let finalAttempts = 0;
    runner.http.reportOutcome = (request) => {
      const body = JSON.parse(request.body) as ReportBody;
      if (body.kind !== 'FINAL') return { kind: 'response', status: 200, body: '{}' };
      finalAttempts += 1;
      return finalAttempts < 3
        ? { kind: 'transport', reason: 'ECONNRESET' }
        : { kind: 'response', status: 200, body: '{}' };
    };

    const releaseLaunch = runner.launcher.holdLaunch();
    await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    await until(() => runner.app.coordinator.inFlight === 1);

    const drained = runner.app.drain();
    releaseLaunch();
    expect((await drained).completed).toBe(true);

    const finals = runner.http.reportRequests.filter(
      (request) => (JSON.parse(request.body) as ReportBody).kind === 'FINAL',
    );
    expect(finals).toHaveLength(3);
    // The bytes of each delivery attempt are compared, not the objects behind them.
    expect(finals[1]?.body).toBe(finals[0]?.body);
    expect(finals[2]?.body).toBe(finals[0]?.body);
    // One terminal result settled, not three.
    expect(runner.app.logger.counters.snapshot()['runner.report.terminal_delivered']).toBe(1);
  });
});

describe('Case 7 — an ambiguous admission racing SIGTERM', () => {
  it('starts no browser and still issues exactly one admission request', async () => {
    const runner = await start();
    const release = runner.http.holdAdmission();
    runner.http.admissionOutcome = { kind: 'timeout' };

    const submission = post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    await until(() => runner.http.admissionRequests.length === 1);

    // SIGTERM arrives while the ambiguous admission is still open.
    const drained = runner.app.drain();
    release();

    const response = await submission;
    expect(response.status).toBe(503);
    expect((JSON.parse(response.body) as { code: string }).code).toBe(
      'ADMISSION_AMBIGUOUS_TIMEOUT',
    );
    await drained;

    expect(runner.http.admissionRequests).toHaveLength(1);
    expect(runner.launcher.launches).toEqual([]);
    expect(runner.scratch.present).toEqual([]);
    expect(runner.app.logger.counters.snapshot()['runner.admission.ambiguous']).toBe(1);
  });
});

describe('the pool itself', () => {
  it('hands out no more than `size` slots and releases idempotently', () => {
    const pool = createCapacityPool(2);
    const first = pool.tryAcquire();
    const second = pool.tryAcquire();
    expect(pool.tryAcquire()).toBeNull();
    expect(pool.inUse).toBe(2);

    first?.release();
    first?.release();
    expect(pool.inUse).toBe(1);
    expect(pool.tryAcquire()).not.toBeNull();
    second?.release();
  });

  it('hands out nothing once draining, and draining is not saturation', () => {
    const pool = createCapacityPool(1);
    expect(pool.draining).toBe(false);
    pool.beginDrain();
    expect(pool.tryAcquire()).toBeNull();
    expect(pool.draining).toBe(true);
    // Saturation is `inUse >= size`; draining is a separate flag with a separate answer.
    expect(pool.inUse).toBe(0);
  });

  it('refuses a nonsensical size rather than defaulting to something', () => {
    expect(() => createCapacityPool(0)).toThrow(RangeError);
    expect(() => createCapacityPool(1.5)).toThrow(RangeError);
  });
});

/**
 * Type-level check that the neutralised pool really is a `CapacityPool`.
 *
 * If the falsification used a loosely shaped object it would prove nothing about the real seam:
 * the point is that production code accepted it without knowing a test exists.
 */
const poolShape: (size: number) => CapacityPool = readThenWritePool;
void poolShape;
