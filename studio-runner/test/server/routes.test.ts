/**
 * Routes, service identity, bounded bodies, validate and health/ready.
 *
 * AC-2a, AC-3, AC-4, AC-11. Everything here runs against the real TLS listener (STUDIO-OBS-009
 * AC-3: `node:https`, client certificate pinned) on an ephemeral port, because a handler called directly cannot show that identity is rejected *before
 * the body is read*.
 *
 * STUDIO-OBS-012A AC-3 deleted the artifact-1 validate and run routes. The identity, health/ready,
 * callback-destination and unknown-route cases are ported to `POST /v2/validate-observed` and
 * `POST /v2/runs`; the cases that asserted the artifact-1 validate body codes and the artifact-1
 * run-body refusal log line were deleted with the routes they described.
 */
import { afterEach, describe, expect, it } from 'vitest';

import fixture from '../../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json' with { type: 'json' };
import { createIdentityChecker } from '../../src/server/identity.js';
import { createHarness, SERVICE_TOKEN } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { OBSERVED_BUILD, OBSERVED_EXECUTION_ID, get, observedBody, observedJob, post } from '../helpers/runner.js';

/** A validation request this checkout's build accepts. */
const VALIDATION_REQUEST = JSON.stringify({ ...fixture.validationRequest, requiredBuild: OBSERVED_BUILD });

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

describe('AC-2a — service identity on all four routes', () => {
  const routes: readonly [string, string][] = [
    ['POST', '/v2/validate-observed'],
    ['POST', '/v2/runs'],
    ['GET', '/health'],
    ['GET', '/ready'],
  ];

  it.each(routes)('%s %s rejects a missing credential with 401 and a code only', async (method, path) => {
    const runner = await start();
    const response =
      method === 'GET'
        ? await get(runner.port, path, null)
        : await post(runner.port, path, observedBody(), null);

    expect(response.status).toBe(401);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.code).toBe('IDENTITY_MISSING');
    // A code and no job detail: no execution id, no attempt id, no artifact, no stack.
    expect(Object.keys(body)).toEqual(['code']);
    expect(response.body).not.toContain(OBSERVED_EXECUTION_ID);
  });

  it.each(routes)('%s %s rejects a wrong credential with 403', async (method, path) => {
    const runner = await start();
    const response =
      method === 'GET'
        ? await get(runner.port, path, 'not-the-token')
        : await post(runner.port, path, observedBody(), 'not-the-token');
    expect(response.status).toBe(403);
    expect((JSON.parse(response.body) as { code: string }).code).toBe('IDENTITY_REJECTED');
  });

  it('rejects a blank and a malformed credential distinctly', async () => {
    const runner = await start();
    const blank = await post(runner.port, '/v2/runs', '{}', '   ');
    expect(blank.status).toBe(401);
    const checker = createIdentityChecker(SERVICE_TOKEN);
    expect(checker.check('Basic abc')).toMatchObject({ status: 401, code: 'IDENTITY_MALFORMED' });
    expect(checker.check('Bearer')).toMatchObject({ code: 'IDENTITY_MALFORMED' });
    expect(checker.check(undefined)).toMatchObject({ code: 'IDENTITY_MISSING' });
    expect(checker.check('')).toMatchObject({ code: 'IDENTITY_MISSING' });
  });

  it('rejects before any handler work: no slot is reserved and no admission is issued', async () => {
    const runner = await start();
    await post(runner.port, '/v2/runs', observedBody(), 'wrong');
    expect(runner.app.pool.inUse).toBe(0);
    expect(runner.http.admissionRequests).toHaveLength(0);
    expect(runner.launcher.launches).toHaveLength(0);
    expect(runner.scratch.present).toEqual([]);
    expect(runner.log.events).toEqual([]);
  });

  it('refuses to build a checker for a blank configured credential', () => {
    expect(() => createIdentityChecker('   ')).toThrow(/must not be blank/u);
  });

  it('compares credentials of different lengths without throwing (constant-time digest)', () => {
    const checker = createIdentityChecker('short');
    expect(checker.check('Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe('AC-11 — health and ready are four distinct states', () => {
  it('healthy and ready when idle', async () => {
    const runner = await start();
    expect((await get(runner.port, '/health', SERVICE_TOKEN)).status).toBe(200);
    expect((await get(runner.port, '/ready', SERVICE_TOKEN)).status).toBe(200);
  });

  it('saturated: health 200, ready STILL 200, and /v2/runs answers 429', async () => {
    const runner = await start();
    const release = runner.http.holdAdmission();
    const first = post(runner.port, '/v2/runs', observedBody(), SERVICE_TOKEN);
    // The slot is held while the admission call is in flight.
    while (runner.http.admissionRequests.length === 0) await new Promise(setImmediate);

    const health = await get(runner.port, '/health', SERVICE_TOKEN);
    const ready = await get(runner.port, '/ready', SERVICE_TOKEN);
    const second = await post(runner.port, '/v2/runs', observedBody(), SERVICE_TOKEN);

    expect(health.status).toBe(200);
    // Capacity saturation alone keeps readiness TRUE. This is the distinction that matters:
    // a busy pod is healthy and must stay in its Service.
    expect(ready.status).toBe(200);
    expect((JSON.parse(ready.body) as { ready: boolean }).ready).toBe(true);
    expect(second.status).toBe(429);

    release();
    await first;
  });

  it('draining: health STILL 200, ready 503, and /v2/runs answers 503', async () => {
    const runner = await start();
    runner.app.pool.beginDrain();

    const health = await get(runner.port, '/health', SERVICE_TOKEN);
    const ready = await get(runner.port, '/ready', SERVICE_TOKEN);
    const run = await post(runner.port, '/v2/runs', observedBody(), SERVICE_TOKEN);

    expect(health.status).toBe(200);
    expect((JSON.parse(health.body) as { draining: boolean }).draining).toBe(true);
    expect(ready.status).toBe(503);
    expect((JSON.parse(ready.body) as { ready: boolean }).ready).toBe(false);
    expect(run.status).toBe(503);
    expect((JSON.parse(run.body) as { code: string }).code).toBe('RUNNER_DRAINING');
    // Draining refuses before the pool is even consulted, so no admission was issued.
    expect(runner.http.admissionRequests).toHaveLength(0);
  });
});

describe('AC-4 — POST /v2/validate-observed', () => {
  it('cannot reserve a capacity slot: it answers while the pool is fully saturated', async () => {
    const runner = await start();
    const release = runner.http.holdAdmission();
    const run = post(runner.port, '/v2/runs', observedBody(), SERVICE_TOKEN);
    while (runner.http.admissionRequests.length === 0) await new Promise(setImmediate);
    expect(runner.app.pool.inUse).toBe(1);

    const response = await post(runner.port, '/v2/validate-observed', VALIDATION_REQUEST, SERVICE_TOKEN);

    expect(response.status).toBe(200);
    expect((JSON.parse(response.body) as { ok: boolean }).ok).toBe(true);
    // Still exactly one slot in use: validate took none.
    expect(runner.app.pool.inUse).toBe(1);

    release();
    await run;
  });

  it('reports an over-budget validation rather than answering silently slowly', async () => {
    // The validator is synchronous and cannot be interrupted mid-call, so the wall-clock bound is
    // *reported* on the way out. A clock that jumps past the budget between the two reads is
    // exactly the situation the report exists for.
    let ticks = 0;
    const runner = await start({
      env: { STUDIO_RUNNER_VALIDATE_TIMEOUT_MS: '1' },
      now: () => {
        ticks += 1;
        return ticks * 1000;
      },
    });
    const response = await post(runner.port, '/v2/validate-observed', VALIDATION_REQUEST, SERVICE_TOKEN);
    expect(response.status).toBe(503);
    expect((JSON.parse(response.body) as { code: string }).code).toBe('VALIDATE_OVER_BUDGET');
    expect(runner.launcher.launches).toEqual([]);
  });
});

describe('AC-3 — the callback destination is deployment configuration only', () => {
  it.each([
    'callbackUrl',
    'callbackHost',
    'callbackPort',
    'reportUrl',
    'webhookUrl',
    'endpoint',
  ])('rejects a job carrying %s and sends nothing to it', async (key) => {
    const runner = await start();
    const attacker = 'https://attacker.example/collect';
    const response = await post(
      runner.port,
      '/v2/runs',
      JSON.stringify({ ...observedJob(), [key]: attacker }),
      SERVICE_TOKEN,
    );

    // The observed job is a closed schema: the key is refused before capacity, by code only.
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ code: 'INVALID_CONTRACT' });
    expect(response.body).not.toContain('attacker');
    // Nothing left for the attacker's URL — not an admission, not a report, nothing.
    expect(runner.http.requests).toEqual([]);
    for (const request of runner.http.requests) expect(request.url).not.toContain('attacker');
  });

  it('rejects any unknown job key, not only the callback-shaped ones', async () => {
    const runner = await start();
    const response = await post(
      runner.port,
      '/v2/runs',
      JSON.stringify({ ...observedJob(), reportingEndpointNobodyPredicted: 'https://elsewhere' }),
      SERVICE_TOKEN,
    );
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ code: 'INVALID_CONTRACT' });
    expect(runner.app.pool.inUse).toBe(0);
    expect(runner.http.requests).toEqual([]);
  });

  it('sends every outbound request to the configured destination with the credential in a header', async () => {
    const runner = await start();
    await post(runner.port, '/v2/runs', observedBody(), SERVICE_TOKEN);
    await runner.app.coordinator.awaitInFlight(5_000);
    expect(runner.http.admissionRequests).toHaveLength(1);
    expect(runner.http.reportRequests.length).toBeGreaterThan(0);
    for (const request of runner.http.requests) {
      expect(request.url.startsWith('https://api.internal.example/')).toBe(true);
      // No credential in any URL or query string.
      expect(request.url).not.toContain('?');
      expect(request.url).not.toContain('token');
      expect(request.headers.authorization).toMatch(/^Bearer /u);
    }
  });

  it('answers 404 with a code for an unknown route', async () => {
    const runner = await start();
    const response = await get(runner.port, '/v1/anything-else', SERVICE_TOKEN);
    expect(response.status).toBe(404);
    expect((JSON.parse(response.body) as { code: string }).code).toBe('NOT_FOUND');
  });

  it('serves none of the deleted artifact-1 routes (STUDIO-OBS-012A AC-3)', async () => {
    const runner = await start();
    for (const path of ['/v1/validate', '/v1/runs']) {
      const response = await post(runner.port, path, observedBody(), SERVICE_TOKEN);
      expect(response.status).toBe(404);
      expect(JSON.parse(response.body)).toEqual({ code: 'NOT_FOUND' });
    }
    expect(runner.http.requests).toEqual([]);
    expect(runner.app.pool.inUse).toBe(0);
  });

  it('rejects a non-JSON run body', async () => {
    const runner = await start();
    const response = await post(runner.port, '/v2/runs', 'nope', SERVICE_TOKEN);
    expect(response.status).toBe(400);
    expect((JSON.parse(response.body) as { code: string }).code).toBe('INVALID_CONTRACT');
    expect(runner.http.requests).toEqual([]);
  });
});

describe('STUDIO-OBS-009 AC-1 — the guided bridge is not routed on a runner without guided mode', () => {
  it('answers a guided session path with the replay 404 NOT_FOUND, before any JWT work', async () => {
    const runner = await start();
    const path = '/internal/v2/studio/guided-sessions/00000000-0000-4000-8000-000000000001/assign';
    const served = await post(runner.port, path, '{}', SERVICE_TOKEN);
    expect(served.status).toBe(404);
    expect(JSON.parse(served.body)).toEqual({ code: 'NOT_FOUND' });
    // A token that is not even shaped like a JWT gets the same answer: nothing verified it.
    const garbage = await post(runner.port, path, '{}', 'not.a.jwt');
    expect(garbage.status).toBe(404);
    expect(JSON.parse(garbage.body)).toEqual({ code: 'NOT_FOUND' });
  });

  it('keeps /ready at exactly its four fields and /health at its two (D1-T3 baseline: no guided field)', async () => {
    const runner = await start();
    const ready = await get(runner.port, '/ready', SERVICE_TOKEN);
    expect(Object.keys(JSON.parse(ready.body) as object).sort()).toEqual(['draining', 'inUse', 'ready', 'size']);
    const health = await get(runner.port, '/health', SERVICE_TOKEN);
    expect(JSON.parse(health.body)).toEqual({ status: 'ok', draining: false });
  });
});
