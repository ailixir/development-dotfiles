/**
 * `POST /v1/runs` order of operations and admission verdicts.
 *
 * AC-6, AC-7, AC-8, AC-9, AC-10. The interleaved and two-instance races live in
 * `test/server/concurrency.test.ts`; this file establishes the single-request behaviour those
 * races depend on.
 *
 * **Ordering is asserted as a sequence, not as an absence.** @po's note on AC-6 is that "a
 * reordering that touches nothing fake would go unseen". Every boundary here writes into one
 * shared event log — the fake HTTP client, the fake scratch store and the fake launcher — so the
 * assertions below compare the *exact order* in which those boundaries were crossed. Moving
 * scratch creation ahead of the admission call changes the array and fails, even though the same
 * set of calls happened.
 */
import { afterEach, describe, expect, it } from 'vitest';

import type { HttpOutcome } from '../../src/reporting/httpClient.js';
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

async function submit(runner: Harness, body = validJob()): Promise<number> {
  const response = await post(runner.port, '/v1/runs', JSON.stringify(body), SERVICE_TOKEN);
  return response.status;
}

describe('AC-6 — order of operations', () => {
  it('crosses the boundaries in exactly this order: admission, scratch, launch', async () => {
    const runner = await start();
    expect(await submit(runner)).toBe(202);
    await until(() => runner.app.coordinator.inFlight === 0);

    // The CAS comes first. Scratch and the browser come after it, never before.
    expect(runner.log.events.slice(0, 3)).toEqual([
      'admission.request',
      'scratch.create',
      'browser.launch',
    ]);
    expect(runner.log.events.indexOf('admission.request')).toBeLessThan(
      runner.log.events.indexOf('scratch.create'),
    );
    expect(runner.log.events.indexOf('scratch.create')).toBeLessThan(
      runner.log.events.indexOf('browser.launch'),
    );
  });

  it('an invalid envelope reaches neither the pool nor the API', async () => {
    const runner = await start();
    expect(await submit(runner, validJob({ attemptId: '' }))).toBe(400);
    expect(runner.log.events).toEqual([]);
    expect(runner.app.pool.inUse).toBe(0);
  });

  it('an invalid artifact reaches neither the pool nor the API', async () => {
    const runner = await start();
    const status = await submit(
      runner,
      validJob({
        source: ['Evaluate'],
        artifact: {
          version: 1,
          steps: [{ stepIndex: 0, originalText: 'Evaluate', code: 'await page.evaluate("x");' }],
        },
        references: { variables: [], secrets: [] },
        resolvedSecrets: {},
      }),
    );
    expect(status).toBe(400);
    expect(runner.log.events).toEqual([]);
    expect(runner.http.requests).toEqual([]);
    expect(runner.app.pool.inUse).toBe(0);
  });

  const nonSuccess: readonly [string, HttpOutcome, number][] = [
    ['409 competing', { kind: 'response', status: 409, body: '{"code":"ADMISSION_COMPETING"}' }, 409],
    ['401', { kind: 'response', status: 401, body: '{}' }, 503],
    ['403', { kind: 'response', status: 403, body: '{}' }, 503],
    ['timeout', { kind: 'timeout' }, 503],
    ['transport loss', { kind: 'transport', reason: 'ECONNRESET' }, 503],
    ['500', { kind: 'response', status: 500, body: '' }, 503],
    ['503', { kind: 'response', status: 503, body: '' }, 503],
    ['307 redirect', { kind: 'response', status: 307, body: '' }, 503],
    ['308 redirect', { kind: 'response', status: 308, body: '' }, 503],
  ];

  it.each(nonSuccess)(
    'zero adapter calls for a %s admission outcome',
    async (_label, outcome, expected) => {
      const runner = await start();
      runner.http.admissionOutcome = outcome;
      expect(await submit(runner)).toBe(expected);

      // No browser, no child process, no scratch directory, no evidence key.
      expect(runner.launcher.launches).toEqual([]);
      expect(runner.scratch.present).toEqual([]);
      expect(runner.log.events).toEqual(['admission.request']);
      // The slot is released, so the next request is not wrongly refused.
      expect(runner.app.pool.inUse).toBe(0);
    },
  );
});

describe('AC-7 — admission identity belongs to this instance and this run', () => {
  it('keeps runnerInstanceId stable and generates a fresh admissionId per run', async () => {
    const runner = await start();
    await submit(runner, validJob({ executionId: 'exec-a', attemptId: 'attempt-a' }));
    await until(() => runner.app.coordinator.inFlight === 0);
    await submit(runner, validJob({ executionId: 'exec-b', attemptId: 'attempt-b' }));
    await until(() => runner.app.coordinator.inFlight === 0);

    const bodies = runner.http.admissionRequests.map(
      (request) => JSON.parse(request.body) as { runnerInstanceId: string; admissionId: string },
    );
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.runnerInstanceId).toBe('runner-a');
    expect(bodies[1]?.runnerInstanceId).toBe('runner-a');
    expect(bodies[0]?.admissionId).not.toBe(bodies[1]?.admissionId);
  });

  it('reports the recorded runtime versions on the admission request', async () => {
    const runner = await start();
    await submit(runner);
    const body = JSON.parse(runner.http.admissionRequests[0]?.body ?? '{}') as {
      runtimeVersions: Record<string, unknown>;
    };
    expect(body.runtimeVersions.playwright).toBe('1.63.0');
  });

  it.each(nonSuccessIdentities())(
    'never issues a second admission with a new admissionId after %s',
    async (_label, outcome) => {
      const runner = await start();
      runner.http.admissionOutcome = outcome;
      await submit(runner);
      // One attempt, one admission request. There is no second identity anywhere.
      expect(runner.http.admissionRequests).toHaveLength(1);
    },
  );
});

function nonSuccessIdentities(): readonly [string, HttpOutcome][] {
  return [
    ['409', { kind: 'response', status: 409, body: '{}' }],
    ['401', { kind: 'response', status: 401, body: '{}' }],
    ['timeout', { kind: 'timeout' }],
    ['500', { kind: 'response', status: 500, body: '' }],
  ];
}

describe('AC-8 — a definite refusal stops the run', () => {
  it('409 answers 409 and is explicit about non-acceptance', async () => {
    const runner = await start();
    runner.http.admissionOutcome = {
      kind: 'response',
      status: 409,
      body: '{"code":"ADMISSION_COMPETING"}',
    };
    const response = await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    expect(response.status).toBe(409);
    expect((JSON.parse(response.body) as { code: string }).code).toBe('ADMISSION_COMPETING');
    expect(runner.app.logger.counters.snapshot()['runner.admission.refused']).toBe(1);
  });

  it.each([401, 403])('%s answers 503 ADMISSION_REJECTED and releases the slot', async (status) => {
    const runner = await start();
    runner.http.admissionOutcome = { kind: 'response', status, body: '{}' };
    const response = await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    expect(response.status).toBe(503);
    expect((JSON.parse(response.body) as { code: string }).code).toBe('ADMISSION_REJECTED');
    expect(runner.app.pool.inUse).toBe(0);
  });
});

describe('AC-9 — an ambiguous outcome is not permission to replay', () => {
  const ambiguous: readonly [string, HttpOutcome, string][] = [
    ['a 10 s timeout', { kind: 'timeout' }, 'ADMISSION_AMBIGUOUS_TIMEOUT'],
    ['connection loss', { kind: 'transport', reason: 'ECONNRESET' }, 'ADMISSION_AMBIGUOUS_TRANSPORT'],
    ['a 500', { kind: 'response', status: 500, body: '' }, 'ADMISSION_AMBIGUOUS_SERVER_ERROR'],
    ['a 502', { kind: 'response', status: 502, body: '' }, 'ADMISSION_AMBIGUOUS_SERVER_ERROR'],
    // A followed redirect is a second admission POST wearing a different name.
    ['a 307 redirect', { kind: 'response', status: 307, body: '' }, 'ADMISSION_AMBIGUOUS_REDIRECT'],
    ['a 308 redirect', { kind: 'response', status: 308, body: '' }, 'ADMISSION_AMBIGUOUS_REDIRECT'],
  ];

  it.each(ambiguous)(
    'issues exactly one admission request for %s and starts nothing',
    async (_label, outcome, code) => {
      const runner = await start();
      runner.http.admissionOutcome = outcome;
      const response = await post(
        runner.port,
        '/v1/runs',
        JSON.stringify(validJob()),
        SERVICE_TOKEN,
      );

      expect(response.status).toBe(503);
      expect((JSON.parse(response.body) as { code: string }).code).toBe(code);
      // Exactly one. Not zero, not two.
      expect(runner.http.admissionRequests).toHaveLength(1);
      expect(runner.launcher.launches).toEqual([]);
      expect(runner.scratch.present).toEqual([]);
      expect(runner.app.pool.inUse).toBe(0);
    },
  );

  it('records the ambiguity as a structured audit line plus a counter', async () => {
    const runner = await start();
    runner.http.admissionOutcome = { kind: 'timeout' };
    await submit(runner);

    expect(runner.app.logger.counters.snapshot()['runner.admission.ambiguous']).toBe(1);
    const line = runner.sink.lines.find((entry) => entry.includes('admission.ambiguous'));
    expect(line).toBeDefined();
    const parsed = JSON.parse(line ?? '{}') as Record<string, unknown>;
    expect(parsed.reason).toBe('TIMEOUT');
    expect(parsed.attemptId).toBe('attempt-1');
    // Identity fields only: no job values reached the audit line.
    expect(line).not.toContain('canary-secret-value');
  });

  it('the HTTP client never follows a redirect, so a 307 cannot become a second POST', async () => {
    const runner = await start();
    runner.http.admissionOutcome = { kind: 'response', status: 307, body: '' };
    await submit(runner);
    expect(runner.http.requests).toHaveLength(1);
  });
});

describe('AC-10 — capacity saturation is a definite non-acceptance', () => {
  it('returns 429 with Retry-After and never contacts the API', async () => {
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
    expect((JSON.parse(second.body) as { code: string }).code).toBe('CAPACITY_SATURATED');
    expect(second.headers['retry-after']).toBe('5');
    // 429 is decidable before the runner talks to the API at all.
    expect(runner.http.admissionRequests).toHaveLength(1);
    expect(runner.scratch.present).toEqual([]);
    expect(runner.launcher.launches).toEqual([]);

    release();
    await first;
  });

  it('honours a larger configured pool', async () => {
    const runner = await start({ env: { STUDIO_RUNNER_POOL_SIZE: '2' } });
    const release = runner.http.holdAdmission();
    const first = post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    const second = post(
      runner.port,
      '/v1/runs',
      JSON.stringify(validJob({ attemptId: 'attempt-2' })),
      SERVICE_TOKEN,
    );
    await until(() => runner.http.admissionRequests.length === 2);
    const third = await post(
      runner.port,
      '/v1/runs',
      JSON.stringify(validJob({ attemptId: 'attempt-3' })),
      SERVICE_TOKEN,
    );
    expect(third.status).toBe(429);
    release();
    await Promise.all([first, second]);
  });
});
