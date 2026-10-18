import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  USER_CANCEL_BODY,
  clarifyBodyFor,
  finalizeBodyFrom,
  guidedErrorOf,
  httpStatusOf,
  newGuidedIdempotencyKey,
  startBodyFrom,
  studioGuidedApi,
  toGuidedStartRefusal,
} from './studioGuidedApi';
import studioApi from './studioApi';
import type { GuidedStartRequest } from '@/types/studio/studioGuidedTypes';

/**
 * AC-1: the guided transport. Each test states the request the contract requires and checks the
 * request that actually left the client: path, method, `Idempotency-Key`, and a body that is
 * exactly the contract's closed object. A recording server stands in for the API so the assertion
 * is on the wire, not on the client's own function.
 */

interface Recorded {
  method: string;
  path: string;
  key: string | null;
  body: unknown;
}

const seen: Recorded[] = [];
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  seen.length = 0;
  vi.restoreAllMocks();
});
afterAll(() => server.close());

const START: GuidedStartRequest = {
  schemaVersion: 3,
  testId: 'a0000000-0000-0000-0000-000000000001',
  sourceRevision: '4',
  configurationRevision: '1',
  environmentId: 'Production',
  applicationId: '60406',
  versions: { contract: 3 },
};

async function record(request: Request, path: string): Promise<void> {
  let body: unknown = null;
  const text = await request.clone().text();
  if (text) body = JSON.parse(text);
  seen.push({
    method: request.method,
    path,
    key: request.headers.get('Idempotency-Key'),
    body,
  });
}

function silenceClientErrorLog(): void {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}

describe('request shape: path, method, key, closed body', () => {
  it('start posts to /guided-sessions with the key and exactly the contract keys', async () => {
    server.use(
      http.post('*/api/v1/studio/guided-sessions', async ({ request }) => {
        await record(request, '/guided-sessions');
        return HttpResponse.json({ ok: true }, { status: 202 });
      }),
    );
    const wide = { ...START, extra: 'x', versions: { contract: 3, other: 1 } } as unknown as GuidedStartRequest;
    await studioGuidedApi.startSession(wide, 'start-key-1');
    expect(seen).toEqual([
      { method: 'POST', path: '/guided-sessions', key: 'start-key-1', body: { ...START } },
    ]);
  });

  it('start carries the two hints only when set', async () => {
    server.use(
      http.post('*/api/v1/studio/guided-sessions', async ({ request }) => {
        await record(request, '/guided-sessions');
        return HttpResponse.json({}, { status: 202 });
      }),
    );
    const base = '11111111-1111-4111-8111-111111111111';
    const step = '00000000-0000-4000-8000-000000000002';
    await studioGuidedApi.startSession({ ...START, baseRevisionId: base, firstLearnStepId: step }, 'k');
    await studioGuidedApi.startSession({ ...START, baseRevisionId: undefined }, 'k2');
    expect(seen[0].body).toEqual({ ...START, baseRevisionId: base, firstLearnStepId: step });
    expect(Object.keys(seen[1].body as object)).not.toContain('baseRevisionId');
    expect(Object.keys(seen[1].body as object)).not.toContain('firstLearnStepId');
  });

  it('clarify, cancel and finalize each post under their own path with the key', async () => {
    server.use(
      http.post('*/api/v1/studio/guided-sessions/:id/:action', async ({ request, params }) => {
        await record(request, `/guided-sessions/${String(params.id)}/${String(params.action)}`);
        return HttpResponse.json({}, { status: params.action === 'finalize' ? 200 : 202 });
      }),
    );
    await studioGuidedApi.clarify(
      's-1',
      clarifyBodyFor({ clarificationId: 'q-1', generation: 2 }, 'choice-1'),
      'clarify-key',
    );
    await studioGuidedApi.cancel('s-1', USER_CANCEL_BODY, 'cancel-key');
    await studioGuidedApi.finalize('s-1', finalizeBodyFrom(START), 'finalize-key');
    expect(seen).toEqual([
      {
        method: 'POST',
        path: '/guided-sessions/s-1/clarify',
        key: 'clarify-key',
        body: { schemaVersion: 3, clarificationId: 'q-1', choiceId: 'choice-1', generation: 2 },
      },
      {
        method: 'POST',
        path: '/guided-sessions/s-1/cancel',
        key: 'cancel-key',
        body: { schemaVersion: 3, reason: 'userRequested' },
      },
      {
        method: 'POST',
        path: '/guided-sessions/s-1/finalize',
        key: 'finalize-key',
        body: { schemaVersion: 3, expectedSourceRevision: '4', expectedConfigurationRevision: '1' },
      },
    ]);
  });

  it('finalize sends the closed three-key body even if handed a wider object', async () => {
    server.use(
      http.post('*/api/v1/studio/guided-sessions/:id/finalize', async ({ request }) => {
        await record(request, 'finalize');
        return HttpResponse.json({});
      }),
    );
    const wide = {
      schemaVersion: 3,
      expectedSourceRevision: '4',
      expectedConfigurationRevision: '1',
      sessionId: 'x',
      ownerFence: 1,
      learnedPlanHash: 'h',
    } as unknown as Parameters<typeof studioGuidedApi.finalize>[1];
    await studioGuidedApi.finalize('s-1', wide, 'k');
    expect(Object.keys(seen[0].body as object).sort()).toEqual(
      ['expectedConfigurationRevision', 'expectedSourceRevision', 'schemaVersion'].sort(),
    );
  });

  it('reads send no Idempotency-Key and use GET', async () => {
    server.use(
      http.get('*/api/v1/studio/guided-sessions/:id', async ({ request, params }) => {
        await record(request, `/guided-sessions/${String(params.id)}`);
        return HttpResponse.json({ schemaVersion: 3 });
      }),
    );
    await studioGuidedApi.readSession('s-1');
    expect(seen).toEqual([{ method: 'GET', path: '/guided-sessions/s-1', key: null, body: null }]);
  });

  it('encodes the session id into the path', async () => {
    server.use(
      http.get('*/api/v1/studio/guided-sessions/:id', async ({ request }) => {
        seen.push({ method: 'GET', path: new URL(request.url).pathname, key: null, body: null });
        return HttpResponse.json({});
      }),
    );
    await studioGuidedApi.readSession('a/b c');
    expect(seen[0].path).toBe('/api/v1/studio/guided-sessions/a%2Fb%20c');
  });

  it('refuses a missing or oversized Idempotency-Key before any request', async () => {
    server.use(
      http.post('*/api/v1/studio/guided-sessions', async ({ request }) => {
        await record(request, 'start');
        return HttpResponse.json({});
      }),
    );
    await expect(studioGuidedApi.startSession(START, '')).rejects.toThrow(/Idempotency-Key/);
    await expect(studioGuidedApi.startSession(START, 'k'.repeat(257))).rejects.toThrow(/Idempotency-Key/);
    expect(seen).toEqual([]);
    await studioGuidedApi.startSession(START, 'k'.repeat(256));
    expect(seen).toHaveLength(1);
  });
});

describe('status branches', () => {
  it('readResult answers final for 200 and pending for 202, and keeps the body either way', async () => {
    server.use(
      http.get('*/api/v1/studio/guided-sessions/:id/result', ({ params }) =>
        HttpResponse.json(
          { sessionId: String(params.id), outcome: params.id === 'pending' ? 'FINALIZING' : 'SUCCEEDED' },
          { status: params.id === 'pending' ? 202 : 200 },
        ),
      ),
    );
    const final = await studioGuidedApi.readResult('done');
    const pending = await studioGuidedApi.readResult('pending');
    expect(final).toMatchObject({ status: 'final', result: { sessionId: 'done', outcome: 'SUCCEEDED' } });
    expect(pending).toMatchObject({ status: 'pending', result: { sessionId: 'pending', outcome: 'FINALIZING' } });
  });

  it('readResult leaves a refusal body intact for the error normalizer', async () => {
    silenceClientErrorLog();
    server.use(
      http.get('*/api/v1/studio/guided-sessions/:id/result', () =>
        HttpResponse.json(
          { schemaVersion: 3, code: 'FORBIDDEN_SCOPE', requestId: 'r', retryable: false, messageCode: 'ACCESS_DENIED' },
          { status: 403 },
        ),
      ),
    );
    const failure = await studioGuidedApi.readResult('s').catch((error: unknown) => error);
    expect(httpStatusOf(failure)).toBe(403);
    expect(guidedErrorOf(failure)).toMatchObject({ code: 'FORBIDDEN_SCOPE', messageCode: 'ACCESS_DENIED' });
  });

  it('readClarification answers the question for 200 and null for 204', async () => {
    server.use(
      http.get('*/api/v1/studio/guided-sessions/:id/clarification', ({ params }) =>
        params.id === 'none'
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.json({ clarificationId: 'q-1' }),
      ),
    );
    expect(await studioGuidedApi.readClarification('asked')).toMatchObject({ clarificationId: 'q-1' });
    expect(await studioGuidedApi.readClarification('none')).toBeNull();
  });
});

describe('refusals', () => {
  async function refusalOf(status: number, body: unknown, headers?: Record<string, string>) {
    silenceClientErrorLog();
    server.use(
      http.post('*/api/v1/studio/guided-sessions', () => HttpResponse.json(body as never, { status, headers })),
    );
    return toGuidedStartRefusal(await studioGuidedApi.startSession(START, 'k').catch((error: unknown) => error));
  }

  it('carries the v3 body of a 409 as it came', async () => {
    const refusal = await refusalOf(409, {
      schemaVersion: 3,
      code: 'REVISION_CONFLICT',
      requestId: 'r-1',
      retryable: false,
      messageCode: 'BASE_IDENTITY_INCOMPLETE',
    });
    expect(refusal).toEqual({
      httpStatus: 409,
      error: {
        schemaVersion: 3,
        code: 'REVISION_CONFLICT',
        requestId: 'r-1',
        retryable: false,
        messageCode: 'BASE_IDENTITY_INCOMPLETE',
      },
      platformCode: null,
      retryAfterSeconds: null,
    });
  });

  it('reads Retry-After from a retryable budget refusal', async () => {
    const refusal = await refusalOf(
      429,
      { schemaVersion: 3, code: 'BUDGET_EXCEEDED', requestId: 'r', retryable: true, messageCode: 'CSI_DAILY_TOKENS_EXHAUSTED' },
      { 'Retry-After': '3600' },
    );
    expect(refusal).toMatchObject({ httpStatus: 429, retryAfterSeconds: 3600 });
    expect(refusal?.error?.messageCode).toBe('CSI_DAILY_TOKENS_EXHAUSTED');
  });

  it('has no Retry-After for a per-session bound', async () => {
    const refusal = await refusalOf(429, {
      schemaVersion: 3,
      code: 'BUDGET_EXCEEDED',
      requestId: 'r',
      retryable: false,
      messageCode: 'BUDGET_EXCEEDED',
    });
    expect(refusal?.retryAfterSeconds).toBeNull();
    expect(refusal?.error?.retryable).toBe(false);
  });

  it('reports the platform envelope code when there is no v3 body', async () => {
    const refusal = await refusalOf(
      429,
      { error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } },
      { 'Retry-After': '5' },
    );
    expect(refusal).toEqual({ httpStatus: 429, error: null, platformCode: 'RATE_LIMITED', retryAfterSeconds: 5 });
  });

  it('does not treat a body that misses a required v3 field as a v3 error', async () => {
    const refusal = await refusalOf(409, { schemaVersion: 3, code: 'REVISION_CONFLICT' });
    expect(refusal?.error).toBeNull();
  });

  it('keeps the closed LOGIN_REQUIRED detail', async () => {
    const refusal = await refusalOf(409, {
      schemaVersion: 3,
      code: 'LOGIN_REQUIRED',
      requestId: 'r',
      retryable: false,
      messageCode: 'LOGIN_REQUIRED',
      detail: { stepId: 's', loginStepsPresent: true },
    });
    expect(refusal?.error?.detail).toEqual({ stepId: 's', loginStepsPresent: true });
  });

  it('produces no refusal for a call that got no response', async () => {
    silenceClientErrorLog();
    server.use(http.post('*/api/v1/studio/guided-sessions', () => HttpResponse.error()));
    const failure = await studioGuidedApi.startSession(START, 'k').catch((error: unknown) => error);
    expect(httpStatusOf(failure)).toBeNull();
    expect(toGuidedStartRefusal(failure)).toBeNull();
  });
});

describe('helpers', () => {
  it('startBodyFrom rebuilds the closed object', () => {
    expect(startBodyFrom({ ...START, extra: 1 } as unknown as GuidedStartRequest)).toEqual(START);
  });

  it('newGuidedIdempotencyKey yields distinct keys within the contract length', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newGuidedIdempotencyKey()));
    expect(keys.size).toBe(50);
    for (const key of keys) {
      expect(key.length).toBeGreaterThanOrEqual(1);
      expect(key.length).toBeLessThanOrEqual(256);
    }
  });

  it('videoPath is an origin-rooted URL built from the session id, with no query', () => {
    const url = studioGuidedApi.videoPath('s/1');
    expect(url).toBe(`${window.location.origin}/api/v1/studio/guided-sessions/s%2F1/video`);
    expect(new URL(url).search).toBe('');
  });
});

describe('capabilities', () => {
  it('getCapabilities reads the test-scoped route once, with no retry on a failure', async () => {
    silenceClientErrorLog();
    let calls = 0;
    server.use(
      http.get('*/api/v1/studio/tests/:id/capabilities', () => {
        calls += 1;
        return HttpResponse.json({ error: 'X' }, { status: 503 });
      }),
    );
    const failure = await studioApi
      .getCapabilities('a0000000-0000-0000-0000-000000000001')
      .catch((error: unknown) => error);
    expect(httpStatusOf(failure)).toBe(503);
    expect(calls).toBe(1);
  });
});
