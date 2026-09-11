/**
 * AC-2, AC-4 — nothing launches before revalidation, and the start deadline is a refusal.
 *
 * Both criteria are about an **absence**, and AC-2 is explicit that the absence must be observed
 * *at the spawn seam* rather than inferred from missing output. The harness's fake launcher is
 * that seam: it records every launch it is asked for, so "no Chromium process is created" is the
 * assertion `launches` stayed empty while the run still produced a definite terminal code.
 *
 * "Rejects incompatible artifacts before browser launch" (§4.5) and "produces the documented error
 * rather than silent reinterpretation" (10.3) are the same sentence read from two sides.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { RUNNER_ERROR_CODES } from '../../src/run/errors.js';
import type { ReportBody } from '../../src/reporting/snapshot.js';
import { createHarness, RUNTIME_VERSIONS, SERVICE_TOKEN, until } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { post, validJob } from '../helpers/runner.js';

let harness: Harness | null = null;

afterEach(async () => {
  await harness?.stop();
  harness = null;
});

async function runJob(
  options: Parameters<typeof createHarness>[0],
  job: Record<string, unknown>,
): Promise<{ runner: Harness; final: ReportBody | undefined }> {
  harness = createHarness(options);
  await harness.start();
  const response = await post(harness.port, '/v1/runs', JSON.stringify(job), SERVICE_TOKEN);
  expect(response.status).toBe(202);
  await until(() => harness?.app.coordinator.inFlight === 0);
  const bodies = harness.http.reportRequests.map((request) => JSON.parse(request.body) as ReportBody);
  return { runner: harness, final: bodies.at(-1) };
}

describe('AC-2 — runtime compatibility is checked before any browser process exists', () => {
  it('launches when the recorded runtime and the running one agree', async () => {
    // The control. Without it the refusal below would be indistinguishable from a runner that
    // never launches anything.
    const { runner, final } = await runJob({}, validJob());
    expect(runner.launcher.launches).toHaveLength(1);
    expect(final?.outcome?.result).toBe('PASSED');
  });

  it('creates no browser when they disagree, and reports RUNTIME_INCOMPATIBLE', async () => {
    // §4.6: a confirmed revision runs on the runtime it was validated under, or not at all. The
    // job envelope is closed and carries no provenance, so what the runner compares is the record
    // the **image** was built from against what this build actually is — a stale `dist/`, a
    // half-applied upgrade or a mixed image, caught before a browser starts.
    const { runner, final } = await runJob(
      { runtimeVersions: { ...RUNTIME_VERSIONS, executor: '9.9.9' } },
      validJob(),
    );

    // Observed at the spawn seam: the launcher was never asked (AC-2), rather than inferred from
    // an absence of output.
    expect(runner.launcher.launches).toHaveLength(0);
    expect(final?.outcome).toMatchObject({
      result: 'ERROR',
      errorCode: RUNNER_ERROR_CODES.RUNTIME_INCOMPATIBLE,
    });
    // The documented error, not a silent reinterpretation (10.3 acceptance).
    expect(final?.outcome?.errorMessage).toMatch(/will not be reinterpreted/u);
    // Slot released, scratch cleared, no reading anywhere.
    expect(runner.scratch.present).toEqual([]);
    expect(runner.app.pool.inUse).toBe(0);
    expect(final?.browserStartedAt).toBeNull();
    expect(final?.steps).toEqual([]);
  });

  it('refuses an unreadable record rather than treating it as compatible', async () => {
    const { runner, final } = await runJob({ runtimeVersions: {} }, validJob());
    expect(runner.launcher.launches).toHaveLength(0);
    expect(final?.outcome?.errorCode).toBe(RUNNER_ERROR_CODES.RUNTIME_INCOMPATIBLE);
  });
});

describe('AC-4 — the start deadline is a refusal, not a race', () => {
  it('creates no browser when the admitted-start deadline has already elapsed', async () => {
    let now = 0;
    const runner = createHarness({ now: () => now });
    harness = runner;
    await runner.start();

    // The API granted the admission; by the time the run reaches the launch point the 30 s
    // §8.5 starting value has passed. §5.2: "the runner refuses to launch after the
    // server-issued admission/start deadline."
    const original = runner.scratch.create.bind(runner.scratch);
    Object.assign(runner.scratch, {
      async create(runId: string) {
        now += 30_001;
        return await original(runId);
      },
    });

    const response = await post(
      runner.port,
      '/v1/runs',
      JSON.stringify(validJob({ deadlines: { admittedStartMs: 30_000, totalRuntimeMs: 120_000 } })),
      SERVICE_TOKEN,
    );
    expect(response.status).toBe(202);
    await until(() => runner.app.coordinator.inFlight === 0);

    expect(runner.launcher.launches).toHaveLength(0);
    const bodies = runner.http.reportRequests.map((request) => JSON.parse(request.body) as ReportBody);
    const final = bodies.at(-1);
    expect(final?.outcome).toMatchObject({
      result: 'ERROR',
      errorCode: RUNNER_ERROR_CODES.START_DEADLINE_EXCEEDED,
    });
    // The terminal report says so, in words a human reading an incident can act on.
    expect(final?.outcome?.errorMessage).toMatch(/admitted-start deadline/u);
    // No STARTED at all, no readings, scratch cleared, slot released.
    expect(bodies.some((body) => body.kind === 'STARTED')).toBe(false);
    expect(final?.browserStartedAt).toBeNull();
    expect(final?.steps).toEqual([]);
    expect(runner.scratch.present).toEqual([]);
    expect(runner.app.pool.inUse).toBe(0);
  });

  it('launches when the deadline has not elapsed, so the refusal is not unconditional', async () => {
    let now = 0;
    const runner = createHarness({ now: () => now });
    harness = runner;
    await runner.start();
    const original = runner.scratch.create.bind(runner.scratch);
    Object.assign(runner.scratch, {
      async create(runId: string) {
        now += 29_999;
        return await original(runId);
      },
    });

    const response = await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    expect(response.status).toBe(202);
    await until(() => runner.app.coordinator.inFlight === 0);
    expect(runner.launcher.launches).toHaveLength(1);
  });

  it('does not enforce the total runtime deadline, which is story 10.13', async () => {
    const runner = createHarness();
    harness = runner;
    await runner.start();
    const response = await post(
      runner.port,
      '/v1/runs',
      JSON.stringify(validJob({ deadlines: { admittedStartMs: 30_000, totalRuntimeMs: 1 } })),
      SERVICE_TOKEN,
    );
    expect(response.status).toBe(202);
    await until(() => runner.app.coordinator.inFlight === 0);

    // Passed through to the launcher, not acted on. 10.13 owns the enforcement and the kill.
    expect(runner.launcher.launches[0]?.totalRuntimeMs).toBe(1);
    const bodies = runner.http.reportRequests.map((request) => JSON.parse(request.body) as ReportBody);
    expect(bodies.at(-1)?.outcome?.errorCode).not.toBe('TIMEOUT');
  });
});
