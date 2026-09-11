/**
 * Routes, service identity, bounded bodies, validate and health/ready.
 *
 * AC-2a, AC-3, AC-4, AC-5, AC-11. Everything here runs against a real `node:http` listener on an
 * ephemeral port, because a handler called directly cannot show that identity is rejected *before
 * the body is read*, and cannot show that an oversized body is refused while it arrives.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { createIdentityChecker } from '../../src/server/identity.js';
import { createHarness, SERVICE_TOKEN } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { get, post, validJob } from '../helpers/runner.js';

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
    ['POST', '/v1/validate'],
    ['POST', '/v1/runs'],
    ['GET', '/health'],
    ['GET', '/ready'],
  ];

  it.each(routes)('%s %s rejects a missing credential with 401 and a code only', async (method, path) => {
    const runner = await start();
    const response =
      method === 'GET'
        ? await get(runner.port, path, null)
        : await post(runner.port, path, JSON.stringify(validJob()), null);

    expect(response.status).toBe(401);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.code).toBe('IDENTITY_MISSING');
    // A code and no job detail: no execution id, no attempt id, no artifact, no stack.
    expect(Object.keys(body)).toEqual(['code']);
    expect(response.body).not.toContain('exec-1');
  });

  it.each(routes)('%s %s rejects a wrong credential with 403', async (method, path) => {
    const runner = await start();
    const response =
      method === 'GET'
        ? await get(runner.port, path, 'not-the-token')
        : await post(runner.port, path, JSON.stringify(validJob()), 'not-the-token');
    expect(response.status).toBe(403);
    expect((JSON.parse(response.body) as { code: string }).code).toBe('IDENTITY_REJECTED');
  });

  it('rejects a blank and a malformed credential distinctly', async () => {
    const runner = await start();
    const blank = await post(runner.port, '/v1/runs', '{}', '   ');
    expect(blank.status).toBe(401);
    const checker = createIdentityChecker(SERVICE_TOKEN);
    expect(checker.check('Basic abc')).toMatchObject({ status: 401, code: 'IDENTITY_MALFORMED' });
    expect(checker.check('Bearer')).toMatchObject({ code: 'IDENTITY_MALFORMED' });
    expect(checker.check(undefined)).toMatchObject({ code: 'IDENTITY_MISSING' });
    expect(checker.check('')).toMatchObject({ code: 'IDENTITY_MISSING' });
  });

  it('rejects before any handler work: no slot is reserved and no admission is issued', async () => {
    const runner = await start();
    await post(runner.port, '/v1/runs', JSON.stringify(validJob()), 'wrong');
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

  it('saturated: health 200, ready STILL 200, and /v1/runs answers 429', async () => {
    const runner = await start();
    const release = runner.http.holdAdmission();
    const first = post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    // The slot is held while the admission call is in flight.
    while (runner.http.admissionRequests.length === 0) await new Promise(setImmediate);

    const health = await get(runner.port, '/health', SERVICE_TOKEN);
    const ready = await get(runner.port, '/ready', SERVICE_TOKEN);
    const second = await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);

    expect(health.status).toBe(200);
    // Capacity saturation alone keeps readiness TRUE. This is the distinction that matters:
    // a busy pod is healthy and must stay in its Service.
    expect(ready.status).toBe(200);
    expect((JSON.parse(ready.body) as { ready: boolean }).ready).toBe(true);
    expect(second.status).toBe(429);

    release();
    await first;
  });

  it('draining: health STILL 200, ready 503, and /v1/runs answers 503', async () => {
    const runner = await start();
    runner.app.pool.beginDrain();

    const health = await get(runner.port, '/health', SERVICE_TOKEN);
    const ready = await get(runner.port, '/ready', SERVICE_TOKEN);
    const run = await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);

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

describe('AC-4, AC-5 — POST /v1/validate', () => {
  it('validates without launching anything or creating scratch state', async () => {
    const runner = await start();
    const job = validJob();
    const response = await post(
      runner.port,
      '/v1/validate',
      JSON.stringify({ artifact: job.artifact, source: job.source, references: job.references }),
      SERVICE_TOKEN,
    );

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as { ok: boolean; steps: { stepIndex: number }[] };
    expect(body.ok).toBe(true);
    expect(body.steps).toHaveLength(2);
    expect(runner.launcher.launches).toEqual([]);
    expect(runner.scratch.present).toEqual([]);
    expect(runner.http.requests).toEqual([]);
  });

  it('returns bounded per-step diagnostics and never echoes the artifact', async () => {
    const runner = await start();
    const response = await post(
      runner.port,
      '/v1/validate',
      JSON.stringify({
        artifact: {
          version: 1,
          steps: [{ stepIndex: 0, originalText: 'Evaluate', code: 'await page.evaluate("x");' }],
        },
        source: ['Evaluate'],
      }),
      SERVICE_TOKEN,
    );

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as {
      ok: boolean;
      steps: { diagnostics: { code: string }[] }[];
    };
    expect(body.ok).toBe(false);
    expect(body.steps[0]?.diagnostics.length).toBeGreaterThan(0);
    // Diagnostics carry codes. The artifact's code text is not echoed back wholesale.
    expect(response.body).not.toContain('await page.evaluate');
    // No operation list escapes: the caller gets diagnostics, never something executable.
    expect(response.body).not.toContain('"operations"');
  });

  it('cannot reserve a capacity slot: it answers while the pool is fully saturated', async () => {
    const runner = await start();
    const release = runner.http.holdAdmission();
    const run = post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    while (runner.http.admissionRequests.length === 0) await new Promise(setImmediate);
    expect(runner.app.pool.inUse).toBe(1);

    const job = validJob();
    const response = await post(
      runner.port,
      '/v1/validate',
      JSON.stringify({ artifact: job.artifact, source: job.source, references: job.references }),
      SERVICE_TOKEN,
    );

    expect(response.status).toBe(200);
    expect((JSON.parse(response.body) as { ok: boolean }).ok).toBe(true);
    // Still exactly one slot in use: validate took none.
    expect(runner.app.pool.inUse).toBe(1);

    release();
    await run;
  });

  it.each([
    ['not JSON at all', 'this is not json', 400, 'BODY_NOT_JSON'],
    ['a JSON array', '[1,2,3]', 400, 'BODY_NOT_OBJECT'],
    ['an unknown key', '{"artifact":{},"source":[],"policy":{}}', 400, 'BODY_UNKNOWN_KEY'],
    ['a non-string source', '{"artifact":{},"source":[1]}', 400, 'SOURCE_INVALID'],
  ])('rejects %s with %s', async (_label, body, status, code) => {
    const runner = await start();
    const response = await post(runner.port, '/v1/validate', body, SERVICE_TOKEN);
    expect(response.status).toBe(status);
    expect((JSON.parse(response.body) as { code: string }).code).toBe(code);
    // No stack trace, no file path.
    expect(response.body).not.toMatch(/at .*\.ts:/u);
    expect(response.body).not.toContain('/studio-runner/');
  });

  it('rejects an oversized body with 413 while it arrives', async () => {
    const runner = await start({ env: { STUDIO_RUNNER_MAX_REQUEST_BODY_BYTES: '512' } });
    const oversized = JSON.stringify({ artifact: { pad: 'x'.repeat(4096) }, source: [] });
    const response = await post(runner.port, '/v1/validate', oversized, SERVICE_TOKEN);
    expect(response.status).toBe(413);
    expect((JSON.parse(response.body) as { code: string }).code).toBe('BODY_TOO_LARGE');
  });

  it('rejects a source longer than the bound with 413', async () => {
    const runner = await start();
    const source = Array.from({ length: 101 }, (_value, index) => `Step ${String(index)}`);
    const response = await post(
      runner.port,
      '/v1/validate',
      JSON.stringify({ artifact: { version: 1, steps: [] }, source }),
      SERVICE_TOKEN,
    );
    expect(response.status).toBe(413);
    expect((JSON.parse(response.body) as { code: string }).code).toBe('SOURCE_TOO_MANY_STEPS');
  });

  it('reports an over-budget validation rather than answering silently slowly', async () => {
    // The validator is synchronous and cannot be interrupted mid-call, so the wall-clock bound is
    // enforced by the input bounds and *reported* on the way out. A clock that jumps past the
    // budget between the two reads is exactly the situation the report exists for.
    let ticks = 0;
    const runner = await start({
      env: { STUDIO_RUNNER_VALIDATE_TIMEOUT_MS: '1' },
      now: () => {
        ticks += 1;
        return ticks * 1000;
      },
    });
    const job = validJob();
    const response = await post(
      runner.port,
      '/v1/validate',
      JSON.stringify({ artifact: job.artifact, source: job.source, references: job.references }),
      SERVICE_TOKEN,
    );
    expect(response.status).toBe(503);
    expect((JSON.parse(response.body) as { code: string }).code).toBe('VALIDATE_OVER_BUDGET');
    expect(runner.app.logger.counters.snapshot()['runner.validate.over_budget']).toBe(1);
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
      '/v1/runs',
      JSON.stringify(validJob({ [key]: attacker })),
      SERVICE_TOKEN,
    );

    expect(response.status).toBe(400);
    const body = JSON.parse(response.body) as {
      code: string;
      detail: { code: string; field: string }[];
    };
    expect(body.code).toBe('JOB_INVALID');
    expect(body.detail).toContainEqual({ code: 'JOB_CALLBACK_NOT_PERMITTED', field: key });
    // Nothing left for the attacker's URL — not an admission, not a report, nothing.
    expect(runner.http.requests).toEqual([]);
    for (const request of runner.http.requests) expect(request.url).not.toContain('attacker');
  });

  it('rejects any unknown job key, not only the callback-shaped ones', async () => {
    const runner = await start();
    const response = await post(
      runner.port,
      '/v1/runs',
      JSON.stringify(validJob({ reportingEndpointNobodyPredicted: 'https://elsewhere' })),
      SERVICE_TOKEN,
    );
    expect(response.status).toBe(400);
    const body = JSON.parse(response.body) as { detail: { code: string; field: string }[] };
    expect(body.detail).toContainEqual({
      code: 'JOB_UNKNOWN_KEY',
      field: 'reportingEndpointNobodyPredicted',
    });
  });

  it('sends every outbound request to the configured destination with the credential in a header', async () => {
    const runner = await start();
    await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    expect(runner.http.admissionRequests).toHaveLength(1);
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

  it('rejects a non-JSON run body', async () => {
    const runner = await start();
    const response = await post(runner.port, '/v1/runs', 'nope', SERVICE_TOKEN);
    expect(response.status).toBe(400);
    expect((JSON.parse(response.body) as { code: string }).code).toBe('BODY_NOT_JSON');
    expect(runner.http.requests).toEqual([]);
  });
});
