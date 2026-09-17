/**
 * The real outbound HTTP client (AC-3, AC-9).
 *
 * Exercised against a local `node:http` responder rather than a mocked `fetch`, because the two
 * properties that matter here are properties of the transport: **exactly one request** and
 * **redirects are not followed**. A mocked `fetch` would assert that the code asked for
 * `redirect: 'manual'`; a real server asserts that a `307` produced one request and not two.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFetchHttpClient } from '../../src/reporting/httpClient.js';
import type { HttpRequest } from '../../src/reporting/httpClient.js';

interface Responder {
  readonly port: number;
  readonly hits: readonly { readonly url: string; readonly body: string }[];
  close(): Promise<void>;
}

const responders: Responder[] = [];

function listen(
  handler: (request: IncomingMessage, response: ServerResponse, body: string) => void,
): Promise<Responder> {
  const hits: { url: string; body: string }[] = [];
  return new Promise<Responder>((resolve) => {
    const server: Server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        hits.push({ url: request.url ?? '', body });
        handler(request, response, body);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      const responder: Responder = {
        port: address.port,
        hits,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => {
              done();
            });
          }),
      };
      responders.push(responder);
      resolve(responder);
    });
  });
}

afterEach(async () => {
  // The F-3 test fakes `setTimeout`. If it times out, its own `finally` never runs.
  vi.useRealTimers();
  for (const responder of responders.splice(0)) await responder.close();
});

/**
 * Polls on `setImmediate` and measures with `performance.now()`, so it keeps working while
 * `setTimeout` is faked. Fails with its own message inside Vitest's 5 s test timeout. The slowest
 * arrival the F-3 probe measured was about 54 ms, at load 85, so 3 s is ample.
 */
async function untilRealTime(condition: () => boolean, what: string, boundMs = 3_000) {
  const started = performance.now();
  while (!condition()) {
    if (performance.now() - started > boundMs) {
      throw new Error(`timed out after ${String(boundMs)} ms waiting for ${what}`);
    }
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

function request(port: number, path = '/admission'): HttpRequest {
  return {
    url: `http://127.0.0.1:${String(port)}${path}`,
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer stub' },
    body: '{"attemptId":"attempt-1"}',
    timeoutMs: 2000,
  };
}

describe('fetch-backed HTTP client', () => {
  it('sends the exact bytes it was given and returns the response', async () => {
    const responder = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    });

    const outcome = await createFetchHttpClient().send(request(responder.port));

    expect(outcome).toEqual({ kind: 'response', status: 200, body: '{"ok":true}' });
    expect(responder.hits).toHaveLength(1);
    expect(responder.hits[0]?.body).toBe('{"attemptId":"attempt-1"}');
  });

  it('returns a 5xx as a response rather than throwing or retrying', async () => {
    const responder = await listen((_request, response) => {
      response.writeHead(503);
      response.end('unavailable');
    });

    const outcome = await createFetchHttpClient().send(request(responder.port));

    expect(outcome).toMatchObject({ kind: 'response', status: 503 });
    // One request. The client has no retry loop, so a 5xx cannot become two admissions.
    expect(responder.hits).toHaveLength(1);
  });

  it.each([307, 308])(
    'does not follow a %d redirect: one request, not two',
    async (status) => {
      const responder = await listen((incoming, response) => {
        if (incoming.url === '/admission') {
          response.writeHead(status, { location: '/elsewhere' });
          response.end();
          return;
        }
        response.writeHead(200);
        response.end('{"followed":true}');
      });

      const outcome = await createFetchHttpClient().send(request(responder.port));

      expect(outcome.kind).toBe('response');
      if (outcome.kind === 'response') expect(outcome.status).toBe(status);
      // The redirect target was never contacted.
      expect(responder.hits.map((hit) => hit.url)).toEqual(['/admission']);
    },
  );

  it('reports a timeout as ambiguous, not as a failure to send', async () => {
    const responder = await listen(() => {
      // Never responds. The client's deadline is what ends this.
    });

    /*
     * F-3: the deadline fires only once the server holds the whole request.
     *
     * With a real 25 ms timer this test failed now and then (1–2 in about 30 default-tier runs).
     * A probe measured why: in every failure the server had not yet parsed the request when the
     * client returned `timeout`. Connection setup had outlasted the deadline, and in one case the
     * request never arrived at all. That is a race between the deadline and the request's
     * arrival, not a defect in the client, and it is not the case this test is named for.
     *
     * So the client's own `setTimeout` is faked, and nothing else. The test waits in real time
     * until the request has arrived, then moves the fake clock by the client's 25 ms. The code
     * path is the production one (timer, abort, aborted signal, `timeout`). Only the moment the
     * timer fires is now chosen by the test.
     */
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = createFetchHttpClient().send({
        ...request(responder.port),
        timeoutMs: 25,
      });

      await untilRealTime(() => responder.hits.length === 1, 'the server to receive the request');
      vi.advanceTimersByTime(25);
      const outcome = await pending;

      expect(outcome).toEqual({ kind: 'timeout' });
      // The request did reach the server: this is the dangerous case, where admission may have
      // been granted and the runner will never know (AC-9).
      expect(responder.hits).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a connection failure as a transport outcome', async () => {
    const responder = await listen((_request, response) => {
      response.end();
    });
    const port = responder.port;
    await responder.close();
    responders.splice(responders.indexOf(responder), 1);

    const outcome = await createFetchHttpClient().send(request(port));

    expect(outcome.kind).toBe('transport');
  });
});
