import axios from 'axios';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { apiClient } from './apiClient';

/**
 * STUDIO-UNIFY-001.5 AC-10: a cancelled request is not an error. A recording server counts the
 * requests that reach it, so "sent once" is observed on the wire, and `console.error` is spied so
 * "not logged" is observed on the output. Genuine failures keep their logging and GET retry.
 */

const server = setupServer();
let hits = 0;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  hits = 0;
  vi.restoreAllMocks();
});
afterAll(() => server.close());

function errorSpy() {
  return vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

function apiErrorCalls(spy: ReturnType<typeof errorSpy>) {
  return spy.mock.calls.filter(([first]) => first === 'API Error:');
}

/** Resolves once the server has received the request, so the cancel arrives mid-flight. */
function slowHandler(path: string) {
  let received!: () => void;
  const arrived = new Promise<void>((resolve) => {
    received = resolve;
  });
  server.use(
    http.get(`*${path}`, async () => {
      hits += 1;
      received();
      await delay(1500);
      return HttpResponse.json({ ok: true });
    }),
  );
  return arrived;
}

describe('apiClient cancelled requests (AC-10)', () => {
  it('does not log or retry a GET aborted through an AbortController signal', async () => {
    const spy = errorSpy();
    const arrived = slowHandler('/cancel-signal');
    const controller = new AbortController();

    const pending = apiClient.get('/cancel-signal', { signal: controller.signal });
    const outcome = pending.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await arrived;
    controller.abort();

    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('canceled');
    expect((error as { response?: unknown }).response).toBeUndefined();

    // Wait past the first retry backoff (200 ms): a retry would have reached the server by now.
    await new Promise((r) => setTimeout(r, 450));
    expect(hits).toBe(1);
    expect(apiErrorCalls(spy)).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not log or retry a GET cancelled with an axios cancel token', async () => {
    const spy = errorSpy();
    const arrived = slowHandler('/cancel-token');
    const source = axios.CancelToken.source();

    const outcome = apiClient.get('/cancel-token', { cancelToken: source.token }).then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await arrived;
    source.cancel('superseded');

    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('superseded');

    await new Promise((r) => setTimeout(r, 450));
    expect(hits).toBe(1);
    expect(apiErrorCalls(spy)).toHaveLength(0);
  });

  it('does not log or retry a GET whose signal was already aborted before sending', async () => {
    const spy = errorSpy();
    server.use(
      http.get('*/cancel-early', () => {
        hits += 1;
        return HttpResponse.json({ ok: true });
      }),
    );
    const controller = new AbortController();
    controller.abort();

    await expect(apiClient.get('/cancel-early', { signal: controller.signal })).rejects.toThrow('canceled');

    await new Promise((r) => setTimeout(r, 450));
    expect(hits).toBe(0);
    expect(apiErrorCalls(spy)).toHaveLength(0);
  });
});

describe('apiClient genuine failures are unchanged (AC-10)', () => {
  it('logs a 500 GET on every attempt and retries it twice', async () => {
    const spy = errorSpy();
    server.use(
      http.get('*/boom', () => {
        hits += 1;
        return HttpResponse.json({ error: 'server down' }, { status: 500 });
      }),
    );

    const error = await apiClient.get('/boom').then(
      () => undefined,
      (e: unknown) => e as Error & { response?: { status: number } },
    );

    expect(hits).toBe(3);
    expect(apiErrorCalls(spy)).toHaveLength(3);
    expect(error?.message).toBe('server down');
    expect(error?.response?.status).toBe(500);
  });

  it('logs a 404 GET once and does not retry it', async () => {
    const spy = errorSpy();
    server.use(
      http.get('*/missing', () => {
        hits += 1;
        return HttpResponse.json({ message: 'no such check' }, { status: 404 });
      }),
    );

    const error = await apiClient.get('/missing').then(
      () => undefined,
      (e: unknown) => e as Error & { response?: { status: number } },
    );

    expect(hits).toBe(1);
    expect(apiErrorCalls(spy)).toHaveLength(1);
    expect(error?.message).toBe('no such check');
    expect(error?.response?.status).toBe(404);
  });

  it('logs a network error GET on every attempt and retries it twice', async () => {
    const spy = errorSpy();
    server.use(
      http.get('*/offline', () => {
        hits += 1;
        return HttpResponse.error();
      }),
    );

    const error = await apiClient.get('/offline').then(
      () => undefined,
      (e: unknown) => e as Error & { response?: unknown },
    );

    expect(hits).toBe(3);
    expect(apiErrorCalls(spy)).toHaveLength(3);
    expect(error).toBeInstanceOf(Error);
    expect(error?.response).toBeUndefined();
  });
});
