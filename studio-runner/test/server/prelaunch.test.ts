/**
 * AC-4 — the start deadline is a refusal, not a race.
 *
 * The criterion is about an **absence**, observed *at the spawn seam* rather than inferred from
 * missing output. The harness's fake launcher is that seam: it records every launch it is asked
 * for, so "no Chromium process is created" is the assertion `launches` stayed empty while the run
 * still produced a definite terminal code.
 *
 * The AC-2 runtime-compatibility cases were deleted with the artifact-1 compatibility check
 * (STUDIO-OBS-012A AC-3); the observed path proves its runtime through the build identity at
 * admission. The runs are observed jobs on `POST /v2/runs`, whose admitted-start budget is the
 * receipt's start deadline (30 s out in the harness's fake API).
 */
import { afterEach, describe, expect, it } from 'vitest';

import { RUNNER_ERROR_CODES } from '../../src/run/errors.js';
import type { ReportBody } from '../../src/reporting/snapshot.js';
import { createHarness, SERVICE_TOKEN, until } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { observedBody, post } from '../helpers/runner.js';

let harness: Harness | null = null;

afterEach(async () => {
  await harness?.stop();
  harness = null;
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

    const response = await post(runner.port, '/v2/runs', observedBody(), SERVICE_TOKEN);
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
        // Well inside the budget. The budget is computed from the receipt on the real wall clock,
        // so it is a few milliseconds under 30 s by the time the run reads it.
        now += 29_000;
        return await original(runId);
      },
    });

    const response = await post(runner.port, '/v2/runs', observedBody(), SERVICE_TOKEN);
    expect(response.status).toBe(202);
    await until(() => runner.app.coordinator.inFlight === 0);
    expect(runner.launcher.launches).toHaveLength(1);
  });

  it('does not enforce the total runtime deadline, which is story 10.13', async () => {
    const runner = createHarness();
    harness = runner;
    await runner.start();
    const response = await post(runner.port, '/v2/runs', observedBody({ totalRuntimeMs: 1 }), SERVICE_TOKEN);
    expect(response.status).toBe(202);
    await until(() => runner.app.coordinator.inFlight === 0);

    // Passed through to the launcher, not acted on. 10.13 owns the enforcement and the kill.
    expect(runner.launcher.launches[0]?.totalRuntimeMs).toBe(1);
    const bodies = runner.http.reportRequests.map((request) => JSON.parse(request.body) as ReportBody);
    expect(bodies.at(-1)?.outcome?.errorCode).not.toBe('TIMEOUT');
  });
});
