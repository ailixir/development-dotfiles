/**
 * AC-13, AC-14, AC-15 — what the rest of the pod is doing while a child is hung.
 *
 * The epic's first acceptance bullet is three claims in one sentence: *"Hung child is terminated,
 * next run succeeds, and validator/control endpoints remain responsive."* Each is asserted here on
 * a **real listening server**, with a real hung child at the spawn seam, and the responsiveness one
 * is measured **during the hang** rather than after it — which is the only arrangement that can
 * tell a responsive parent from one that happened to be idle by the time it was asked.
 *
 * ## AC-14's bound is derived, not chosen
 *
 * The criterion says "a bounded time" and leaves the number open. Inventing one here would be
 * inventing a requirement, so the bound is read from the deployment's own configuration:
 * `STUDIO_RUNNER_VALIDATE_TIMEOUT_MS`. §4.5 groups `/health`, `/ready` and `/v1/validate` as one
 * set — *"control/validation endpoints have separate bounded resources"* — and that key is the
 * only enumerated bound the runner holds over any member of the set. It bounds the heaviest one:
 * a full artifact revalidation. `/health` and `/ready` do strictly less work on the same event
 * loop, so a deployment that accepts that bound for the heavy member accepts it for the light
 * ones, and a control plane inside it is a control plane within the budget its own configuration
 * already names.
 *
 * The test therefore reads `config.validateTimeoutMs` rather than restating a number, so a
 * deployment that tightens the bound tightens the assertion with it — an assertion and a constant
 * authored in the same breath would only be checking that one literal equals another.
 *
 * What the bound is *not* is a claim that the event loop was never blocked at all. It is the claim
 * the criterion makes: the control endpoints answer, `/ready` stays true, validation still works
 * and a second run is refused rather than queued — while a browser child sits there doing nothing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ReportBody } from '../../src/reporting/snapshot.js';
import { createFsScratchStore } from '../../src/server/scratch.js';
import { createChildDriver } from '../helpers/childDriver.js';
import { createHarness, until, SERVICE_TOKEN } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { get, post, validJob } from '../helpers/runner.js';
import { createFakeScheduler } from '../helpers/scheduler.js';
import type { FakeScheduler } from '../helpers/scheduler.js';

const TOTAL_RUNTIME_MS = 120_000;

let harness: Harness | null = null;
const roots: string[] = [];

function realScratch(): ReturnType<typeof createFsScratchStore> {
  const root = mkdtempSync(join(tmpdir(), 'studio-runner-hung-'));
  roots.push(root);
  return createFsScratchStore(root);
}

afterEach(async () => {
  await harness?.stop();
  harness = null;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Hung {
  readonly harness: Harness;
  readonly scheduler: FakeScheduler;
  readonly driver: ReturnType<typeof createChildDriver>;
}

/** Admits one run, lets its child hang, and returns before the deadline has fired. */
async function hangOne(options: { readonly writes?: boolean } = {}): Promise<Hung> {
  const scheduler = createFakeScheduler();
  const driver = createChildDriver({
    hangOnStep: 0,
    onStop: 'ignore',
    // A chatty hung browser: the relay must not be a way to stall the parent either.
    writes: options.writes === true
      ? Array.from({ length: 200 }, (_unused, index) => ({
          stream: 'stderr' as const,
          chunk: `[chromium] noisy line ${String(index)} ${'n'.repeat(300)}\n`,
        }))
      : [],
  });
  harness = createHarness({ launcher: driver.launcher, scheduler, scratch: realScratch() });
  await harness.start();

  const admitted = await post(harness.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
  expect(admitted.status).toBe(202);
  // The deadline is armed, so the child is up and hung and nothing has fired yet.
  await until(() => scheduler.pending().length > 0, 20_000);

  return { harness, scheduler, driver };
}

/** Wall-clock duration of one request, measured where a caller would measure it. */
async function timed<T>(work: () => Promise<T>): Promise<{ value: T; elapsedMs: number }> {
  const started = Date.now();
  const value = await work();
  return { value, elapsedMs: Date.now() - started };
}

describe('AC-14 — the control endpoints stay responsive while a child is hung', () => {
  it('answers /health and /ready within the bound the deployment configures, during the hang', async () => {
    const { harness: runner, scheduler } = await hangOne();
    // Derived, not chosen: see the file header. Read from the loaded configuration so a tightened
    // deployment tightens this assertion too.
    const boundMs = runner.config.validateTimeoutMs;
    expect(boundMs).toBeGreaterThan(0);

    const health = await timed(() => get(runner.port, '/health', SERVICE_TOKEN));
    const ready = await timed(() => get(runner.port, '/ready', SERVICE_TOKEN));

    expect(health.value.status).toBe(200);
    expect(health.elapsedMs).toBeLessThan(boundMs);
    // Saturation is not unreadiness. 10.6's rule is untouched: a busy pod is healthy and stays in
    // its Service, and conflating the two makes Kubernetes evict a pod for being busy.
    expect(ready.value.status).toBe(200);
    expect((JSON.parse(ready.value.body) as { ready: boolean }).ready).toBe(true);
    expect(ready.elapsedMs).toBeLessThan(boundMs);

    // Still hung: the deadline has not fired, so this was measured *during* the hang.
    expect(scheduler.pending()).toEqual([TOTAL_RUNTIME_MS]);
    expect(runner.app.coordinator.inFlight).toBe(1);

    scheduler.advance(TOTAL_RUNTIME_MS);
    await until(() => runner.app.coordinator.inFlight === 0, 20_000);
    // Four times the bound under test. `validateTimeoutMs` defaults to 5 000 ms, which is exactly
    // vitest's default `testTimeout` — so without this the framework kills the test first and the
    // `elapsedMs` assertion below can never be the thing that fires (QA LOW-1).
  }, 20_000);

  it('validates an artifact normally while the browser child is hung', async () => {
    const { harness: runner, scheduler } = await hangOne();
    const boundMs = runner.config.validateTimeoutMs;

    const validated = await timed(() =>
      post(
        runner.port,
        '/v1/validate',
        JSON.stringify({
          artifact: {
            version: 1,
            steps: [
              {
                stepIndex: 0,
                originalText: 'Go to "https://example.com/login"',
                code: "await page.goto('https://example.com/login');",
              },
            ],
          },
          source: ['Go to "https://example.com/login"'],
          references: { variables: [], secrets: [] },
        }),
        SERVICE_TOKEN,
      ),
    );

    expect(validated.value.status).toBe(200);
    expect((JSON.parse(validated.value.body) as { ok: boolean }).ok).toBe(true);
    expect(validated.elapsedMs).toBeLessThan(boundMs);
    // §4.5: the validation endpoint has separate bounded resources. A fully saturated runner still
    // answers it, and a *hung* one is just a saturated one that will not recover on its own.
    expect(runner.app.coordinator.inFlight).toBe(1);
    expect(scheduler.pending()).toEqual([TOTAL_RUNTIME_MS]);

    scheduler.advance(TOTAL_RUNTIME_MS);
    await until(() => runner.app.coordinator.inFlight === 0, 20_000);
  }, 20_000);

  it('answers a second POST /v1/runs with 429 and Retry-After rather than blocking on the hang', async () => {
    const { harness: runner, scheduler } = await hangOne();
    const boundMs = runner.config.validateTimeoutMs;

    const second = await timed(() =>
      post(
        runner.port,
        '/v1/runs',
        JSON.stringify(validJob({ attemptId: 'attempt-2' })),
        SERVICE_TOKEN,
      ),
    );

    expect(second.value.status).toBe(429);
    expect((JSON.parse(second.value.body) as { code: string }).code).toBe('CAPACITY_SATURATED');
    expect(second.value.headers['retry-after']).toBe(String(runner.config.retryAfterSeconds));
    // Refused, not queued: a `429` is a definite non-acceptance, decidable before the runner talks
    // to the API at all — so it cannot be waiting on the hung child to answer it.
    expect(second.elapsedMs).toBeLessThan(boundMs);
    expect(runner.http.admissionRequests).toHaveLength(1);

    scheduler.advance(TOTAL_RUNTIME_MS);
    await until(() => runner.app.coordinator.inFlight === 0, 20_000);
  }, 20_000);

  it('stays responsive while the hung child floods its captured output', async () => {
    // The relay is new, it runs on the parent's event loop, and it is exactly the kind of thing
    // that turns "the child is hung" into "the parent is hung".
    //
    // **The flood is written *inside* the measurement window, deliberately** (QA LOW-1). The first
    // version of this test pre-loaded the output at launch and then timed a `/health` request
    // afterwards — so the relay had already finished its work before the clock started, and a
    // relay that blocked for six seconds still produced a fast `/health`. It failed only because
    // six seconds exceeded vitest's default five-second `testTimeout`, which means the *framework*
    // was the discriminator and the `elapsedMs` assertion could never fire. Raising the timeout
    // alone would have made the mutation survive silently, which is worse.
    //
    // Issuing the request first and flooding on the same tick puts the relay's work between the
    // request and its response, which is the only arrangement in which "the relay cannot delay a
    // control endpoint" is a claim this assertion can refute.
    const { harness: runner, scheduler, driver } = await hangOne();
    const boundMs = runner.config.validateTimeoutMs;

    const pending = timed(() => get(runner.port, '/health', SERVICE_TOKEN));
    for (let index = 0; index < 200; index += 1) {
      driver.write('stderr', `[chromium] noisy line ${String(index)} ${'n'.repeat(300)}\n`);
    }
    const health = await pending;

    expect(health.value.status).toBe(200);
    expect(health.elapsedMs).toBeLessThan(boundMs);

    // And the flood was bounded rather than relayed wholesale.
    const relayed = runner.sink.lines.filter((line) => line.includes('run.child_output'));
    expect(relayed.length).toBeGreaterThan(0);
    expect(relayed.length).toBeLessThanOrEqual(501);

    scheduler.advance(TOTAL_RUNTIME_MS);
    await until(() => runner.app.coordinator.inFlight === 0, 20_000);
  }, 20_000);
});

describe('AC-13 — the slot is released and the next run succeeds', () => {
  it('admits and completes a second run immediately after a killed one', async () => {
    const { harness: runner, scheduler } = await hangOne();
    expect(runner.app.pool.inUse).toBe(1);

    scheduler.advance(TOTAL_RUNTIME_MS);
    await until(() => runner.app.coordinator.inFlight === 0, 20_000);

    const killed = JSON.parse(runner.http.reportRequests.at(-1)?.body ?? '') as ReportBody;
    expect(killed.outcome?.errorCode).toBe('TIMEOUT');

    // Capacity is back at its configured size. This is the assertion that catches a leaked slot,
    // a leaked timer, a leaked scratch name and a leaked `/dev/shm` handle in one place — which is
    // why the criterion is "the next run succeeds" rather than "the counter returned to 1".
    expect(runner.app.pool.inUse).toBe(0);
    expect(runner.app.pool.size).toBe(1);

    // A second run, admitted immediately, executing end to end on a child that behaves.
    const secondDriver = createChildDriver({
      result: { ok: true, failureKind: null, failureMessage: null },
      onStop: 'flush',
    });
    const secondScheduler = createFakeScheduler();
    await runner.stop();
    harness = createHarness({
      launcher: secondDriver.launcher,
      scheduler: secondScheduler,
      scratch: realScratch(),
    });
    await harness.start();
    const admitted = await post(
      harness.port,
      '/v1/runs',
      JSON.stringify(validJob({ attemptId: 'attempt-2' })),
      SERVICE_TOKEN,
    );
    expect(admitted.status).toBe(202);
    await until(() => harness?.app.coordinator.inFlight === 0, 20_000);

    const final = JSON.parse(harness.http.reportRequests.at(-1)?.body ?? '') as ReportBody;
    expect(final.kind).toBe('FINAL');
    expect(final.outcome?.result).toBe('PASSED');
    // `PENDING` until story 10.14 gave the terminal path an upload; a playable recording that the
    // store acknowledged is `STORED`. What this case is about — the second run works at all after
    // a killed one — is unchanged.
    expect(final.evidence?.state).toBe('STORED');
    // And it is not partial: this run's recorder closed in an orderly way.
    expect(final.evidence?.partial).toBe(false);
    // No leaked timer from the killed run fired into this one.
    expect(harness.app.pool.inUse).toBe(0);
  });

  it('clears scratch on the kill path, so the next run inherits nothing', async () => {
    const { harness: runner, scheduler } = await hangOne();
    scheduler.advance(TOTAL_RUNTIME_MS);
    await until(() => runner.app.coordinator.inFlight === 0, 20_000);
    await expect(runner.scratch.list()).resolves.toEqual([]);
  });
});

describe('AC-15 — drain on SIGTERM finishes or ends admitted work; it never orphans it', () => {
  it('kills a run still hung when the drain deadline expires, and reports it', async () => {
    const scheduler = createFakeScheduler();
    const driver = createChildDriver({ hangOnStep: 0, onStop: 'ignore' });
    harness = createHarness({
      launcher: driver.launcher,
      scheduler,
      scratch: realScratch(),
      // Short enough that the drain deadline is reached inside the test's own patience.
      env: { STUDIO_RUNNER_DRAIN_TIMEOUT_MS: '30' },
    });
    await harness.start();
    await post(harness.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    await until(() => scheduler.pending().length > 0, 20_000);

    const drained = await harness.app.drain();

    // The drain did not complete on its own — the run was hung — so the run was **ended**.
    expect(drained.completed).toBe(false);
    expect(driver.child().killed).toBeGreaterThanOrEqual(1);
    expect(harness.app.coordinator.inFlight).toBe(0);

    // Reported rather than abandoned. A runner that exits holding a browser is the state §5.4's
    // running reaper has to guess at, and "the runner vanished" is a worse answer than any code.
    const final = JSON.parse(harness.http.reportRequests.at(-1)?.body ?? '') as ReportBody;
    expect(final.kind).toBe('FINAL');
    expect(final.outcome?.result).toBe('ERROR');
    // **Not** `TIMEOUT`: the run did not exceed its browser budget, the pod is leaving. Collapsing
    // the two conditions into one code would be a false statement about the test.
    expect(final.outcome?.errorCode).toBe('RUN_ERROR');
    expect(final.logs.some((entry) => entry.message.includes('drained'))).toBe(true);

    // Nothing left running and nothing left on disk.
    await expect(harness.scratch.list()).resolves.toEqual([]);
    expect(harness.app.pool.inUse).toBe(0);
  });

  it('lets a run that finishes inside the drain window finish, without killing it', async () => {
    const scheduler = createFakeScheduler();
    const driver = createChildDriver({
      result: { ok: true, failureKind: null, failureMessage: null },
      onStop: 'flush',
    });
    harness = createHarness({ launcher: driver.launcher, scheduler, scratch: realScratch() });
    await harness.start();
    await post(harness.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    await until(() => harness?.app.coordinator.inFlight === 0, 20_000);

    const drained = await harness.app.drain();
    expect(drained.completed).toBe(true);
    // §9.3's "drain admitted work on SIGTERM" is *finish* first, *end* only as a last resort.
    expect(driver.child().killed).toBe(0);

    const final = JSON.parse(harness.http.reportRequests.at(-1)?.body ?? '') as ReportBody;
    expect(final.outcome?.result).toBe('PASSED');
  });
});
