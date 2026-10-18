/**
 * A Node HTTP server that answers `/api/v1/**` from the MSW handlers in `src` (STUDIO-OBS-008, P5).
 *
 * It is loaded by `e2e/start-servers.mjs` through the Vite server's `ssrLoadModule`, so the handlers
 * resolve the app's `@services/...` aliases. The browser never sees MSW: it calls the Vite app's
 * `/api/v1`, Vite's proxy forwards here, and `getResponse` (msw's own resolver, with no global
 * interception) picks the handler. There is no service worker and none is registered.
 *
 * A request no handler claims gets **502** with an `E2E_UNHANDLED_REQUEST` body. It is never passed
 * through to a real network, and it is recorded, so a spec can see what the page asked for that the
 * mocks do not cover.
 *
 * Test controls, all under `/__test/` and not themselves recorded:
 *
 * - `GET /__test/health`
 * - `GET /__test/scenario` and `POST /__test/scenario {"name": "<scenario>"}` select a scenario. Selecting
 *   one resets the Studio mock state and clears the request log. An unknown name is a 400.
 * - `GET /__test/requests[?method=GET][&path=/api/v1/studio/tests]` returns the recorded requests;
 *   `path` is a prefix match. `DELETE /__test/requests` clears the log.
 *
 * Only request metadata is recorded (method, path, query, status, whether a handler answered, the
 * `Range` header, the body length). Request bodies are never stored, because Studio bodies can carry
 * secret references.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getResponse, type RequestHandler } from 'msw';
import { resetStudioMocks, studioHandlers } from '@services/mocks/studio/handlers';
import { setGuidedScenario } from '@services/mocks/studio/guidedHandlers';
import { learnWithQuestion, loginRequired } from '@services/mocks/studio/guidedFixtures';

export interface RecordedRequest {
  seq: number;
  scenario: string;
  method: string;
  path: string;
  query: string;
  /** False when no handler answered and the proxy returned 502. */
  handled: boolean;
  status: number;
  range: string | null;
  bodyBytes: number;
}

export interface MswProxy {
  port: number;
  close(): Promise<void>;
}

interface Scenario {
  handlers: RequestHandler[];
  /**
   * Runs right after `resetStudioMocks()` when the scenario is selected. `resetStudioMocks()` puts the
   * guided script back to a plain full learn, so a scenario that changes the script must set it here.
   * The guided script is process-global, which is safe because the harness runs one worker.
   */
  apply?: () => void;
}

/** Scenario name to what answers while it is selected. Later lanes add entries here. */
const scenarios: Record<string, Scenario> = {
  default: { handlers: studioHandlers as RequestHandler[] },
  /** A full learn that asks one focused question at step index 1, with page-derived choice labels. */
  'guided-clarification-page': {
    handlers: studioHandlers as RequestHandler[],
    apply: () => setGuidedScenario(learnWithQuestion('PAGE_CHOICE', 1)),
  },
  /** The first Run fails LOGIN_REQUIRED and the draft has no login steps. */
  'guided-login-required-no-login-steps': {
    handlers: studioHandlers as RequestHandler[],
    apply: () => setGuidedScenario(loginRequired(false)),
  },
  /** The first Run fails LOGIN_REQUIRED although the draft has login steps. */
  'guided-login-required-login-steps-failed': {
    handlers: studioHandlers as RequestHandler[],
    apply: () => setGuidedScenario(loginRequired(true)),
  },
};

const API_PREFIX = '/api/v1/';
const TEST_PREFIX = '/__test/';

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
  });
  response.end(text);
}

function toFetchRequest(request: IncomingMessage, origin: string, body: Buffer): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else headers.set(name, value);
  }
  const method = request.method ?? 'GET';
  const carriesBody = method !== 'GET' && method !== 'HEAD' && body.length > 0;
  return new Request(new URL(request.url ?? '/', origin), {
    method,
    headers,
    body: carriesBody ? new Uint8Array(body) : undefined,
  });
}

export async function startMswProxy(options: { host: string; port: number }): Promise<MswProxy> {
  let scenario = 'default';
  let seq = 0;
  let requests: RecordedRequest[] = [];
  const origin = `http://${options.host}:${options.port}`;

  const handleControl = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> => {
    const method = request.method ?? 'GET';
    if (url.pathname === '/__test/health' && method === 'GET') {
      sendJson(response, 200, { ok: true, scenario });
    } else if (url.pathname === '/__test/scenario' && method === 'GET') {
      sendJson(response, 200, { name: scenario, known: Object.keys(scenarios) });
    } else if (url.pathname === '/__test/scenario' && method === 'POST') {
      let name: unknown;
      try {
        name = (JSON.parse((await readBody(request)).toString('utf8')) as { name?: unknown }).name;
      } catch {
        name = undefined;
      }
      if (typeof name !== 'string' || !Object.hasOwn(scenarios, name)) {
        sendJson(response, 400, { error: 'UNKNOWN_SCENARIO', known: Object.keys(scenarios) });
        return;
      }
      scenario = name;
      resetStudioMocks();
      scenarios[name].apply?.();
      requests = [];
      sendJson(response, 200, { name: scenario });
    } else if (url.pathname === '/__test/requests' && method === 'GET') {
      const wantMethod = url.searchParams.get('method')?.toUpperCase();
      const wantPath = url.searchParams.get('path');
      sendJson(response, 200, {
        requests: requests.filter(
          (item) =>
            (!wantMethod || item.method === wantMethod) &&
            (!wantPath || item.path.startsWith(wantPath)),
        ),
      });
    } else if (url.pathname === '/__test/requests' && method === 'DELETE') {
      requests = [];
      sendJson(response, 200, { cleared: true });
    } else {
      sendJson(response, 404, { error: 'UNKNOWN_TEST_ROUTE', path: url.pathname });
    }
  };

  const server: Server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', origin);
      if (url.pathname.startsWith(TEST_PREFIX)) {
        await handleControl(request, response, url);
        return;
      }

      const body = await readBody(request);
      const record: RecordedRequest = {
        seq: (seq += 1),
        scenario,
        method: request.method ?? 'GET',
        path: url.pathname,
        query: url.search,
        handled: false,
        status: 502,
        range: typeof request.headers.range === 'string' ? request.headers.range : null,
        bodyBytes: body.length,
      };
      requests.push(record);

      const mocked = url.pathname.startsWith(API_PREFIX)
        ? await getResponse(scenarios[scenario].handlers, toFetchRequest(request, origin, body))
        : undefined;
      if (mocked === undefined) {
        sendJson(response, 502, {
          error: 'E2E_UNHANDLED_REQUEST',
          message: `No MSW handler in scenario '${scenario}' answers ${record.method} ${url.pathname}`,
        });
        return;
      }

      record.handled = true;
      record.status = mocked.status;
      const payload = Buffer.from(await mocked.arrayBuffer());
      const headers: Record<string, string | string[]> = {};
      mocked.headers.forEach((value, name) => {
        if (name !== 'set-cookie' && name !== 'transfer-encoding') headers[name] = value;
      });
      const cookies = mocked.headers.getSetCookie();
      if (cookies.length > 0) headers['set-cookie'] = cookies;
      headers['content-length'] = String(payload.length);
      response.writeHead(mocked.status, headers);
      response.end(request.method === 'HEAD' ? undefined : payload);
    })().catch((error: unknown) => {
      if (!response.headersSent) {
        sendJson(response, 500, { error: 'E2E_PROXY_FAILURE', message: String(error) });
      } else {
        response.destroy();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
