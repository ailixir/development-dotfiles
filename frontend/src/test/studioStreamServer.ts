import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Story 10.11b — a **real** HTTP server for the transport tests.
 *
 * The SSE assessment names the alternative and rejects it: *"a buffered mock-controller response
 * does not prove SSE delivery."* So there is no mock here. There is a `node:http` server, a real
 * socket, a real chunked `text/event-stream`, and the production transport module as the client.
 *
 * Everything the tests assert on — the request line, the absence of a credential, how many stream
 * connections are open, whether a response has ended — is read from this server, never from a
 * callback the client was kind enough to invoke.
 */

export interface RecordedRequest {
  readonly method: string;
  /** The raw request line target, exactly as it arrived. */
  readonly url: string;
  readonly path: string;
  readonly query: string;
  readonly headers: http.IncomingHttpHeaders;
}

export interface StreamConnection {
  readonly index: number;
  readonly executionId: string;
  /** Write one `execution.snapshot` frame and flush it. */
  write(payload: unknown, options?: { id?: number; event?: string }): void;
  /** Write a comment frame — the heartbeat. Keeps the response open without delivering anything. */
  comment(text?: string): void;
  /** End the response deliberately, as the server's bounded lifetime does. */
  end(): void;
  /** Destroy the socket without a clean close, as a dropped connection does. */
  destroy(): void;
  /** The response object's own state. AC-9 reads this, rather than inferring it from the client. */
  readonly finished: boolean;
}

export interface SnapshotAnswer {
  readonly status: number;
  readonly body?: unknown;
}

export interface StudioTestServerOptions {
  /** Called once per stream connection. */
  onStream?(connection: StreamConnection, request: RecordedRequest): void;
  /** Answers `GET /studio/executions/{id}`. Defaults to 404. */
  onSnapshot?(executionId: string, request: RecordedRequest): SnapshotAnswer;
  /** Answers the events route *before* a stream is opened; return a status to refuse it. */
  refuseStream?(executionId: string, request: RecordedRequest): number | null;
  /** Anything else the surface under test needs. Return true once handled. */
  onOther?(request: RecordedRequest, res: http.ServerResponse): boolean;
}

export interface StudioTestServer {
  /** The value to configure as `APP_CONFIG.apiBaseUrl`. */
  readonly baseUrl: string;
  readonly origin: string;
  readonly requests: RecordedRequest[];
  /** Request lines for the events route only. */
  streamRequests(): RecordedRequest[];
  /** Request lines for the snapshot route only. */
  snapshotRequests(): RecordedRequest[];
  countOf(method: string, pathFragment: string): number;
  /** How many stream connections have ever been opened. */
  readonly streamsOpened: number;
  /** How many of those have finished. AC-13 asserts `opened - closed === 0`. */
  readonly streamsClosed: number;
  readonly openStreams: StreamConnection[];
  close(): Promise<void>;
}

const EVENTS_SUFFIX = '/events';

export async function startStudioTestServer(
  options: StudioTestServerOptions = {},
): Promise<StudioTestServer> {
  const requests: RecordedRequest[] = [];
  const connections: StreamConnection[] = [];
  let opened = 0;
  let closed = 0;

  const server = http.createServer((req, res) => {
    const raw = req.url ?? '';
    const [path, query = ''] = raw.split('?');
    const record: RecordedRequest = {
      method: req.method ?? 'GET',
      url: raw,
      path,
      query,
      headers: req.headers,
    };
    requests.push(record);

    // The MFE and the API are on different hosts in production, and jsdom enforces CORS on XHR, so
    // the test server behaves the way an exact-origin credentialed route has to.
    const origin = req.headers.origin;
    if (typeof origin === 'string') {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.writeHead(204).end();
      return;
    }

    const executionsMatch = /\/studio\/executions\/([^/]+)(\/events)?$/.exec(path);

    if (executionsMatch && executionsMatch[2] === EVENTS_SUFFIX) {
      const executionId = decodeURIComponent(executionsMatch[1]);
      const refusal = options.refuseStream?.(executionId, record) ?? null;
      if (refusal !== null) {
        res.writeHead(refusal, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'FORBIDDEN', message: 'refused by the test server' }));
        return;
      }
      opened += 1;
      const index = opened;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      // A first flush, so the client's connection reaches `open` before any frame is written.
      res.write(': open\n\n');

      const connection: StreamConnection = {
        index,
        executionId,
        write(payload, writeOptions) {
          const id = writeOptions?.id;
          const event = writeOptions?.event ?? 'execution.snapshot';
          const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
          const head = id === undefined ? '' : `id: ${id}\n`;
          res.write(`${head}event: ${event}\ndata: ${data}\n\n`);
        },
        comment(text = 'ping') {
          res.write(`: ${text}\n\n`);
        },
        end() {
          res.end();
        },
        destroy() {
          req.destroy();
          res.destroy();
        },
        get finished() {
          return res.writableEnded;
        },
      };
      connections.push(connection);
      res.on('close', () => {
        closed += 1;
        const at = connections.indexOf(connection);
        if (at >= 0) {
          connections.splice(at, 1);
        }
      });
      options.onStream?.(connection, record);
      return;
    }

    if (executionsMatch) {
      const executionId = decodeURIComponent(executionsMatch[1]);
      const answer = options.onSnapshot?.(executionId, record) ?? { status: 404 };
      res.writeHead(answer.status, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          answer.body ?? { error: 'NOT_FOUND', message: `no snapshot for ${executionId}` },
        ),
      );
      return;
    }

    if (options.onOther?.(record, res)) {
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'NOT_FOUND', message: path }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;

  return {
    baseUrl: `${origin}/api/v1`,
    origin,
    requests,
    streamRequests: () => requests.filter((entry) => entry.path.endsWith(EVENTS_SUFFIX)),
    snapshotRequests: () =>
      requests.filter(
        (entry) => /\/studio\/executions\/[^/]+$/.test(entry.path) && entry.method === 'GET',
      ),
    countOf: (method, pathFragment) =>
      requests.filter(
        (entry) => entry.method === method && entry.path.includes(pathFragment),
      ).length,
    get streamsOpened() {
      return opened;
    },
    get streamsClosed() {
      return closed;
    },
    get openStreams() {
      return [...connections];
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const connection of [...connections]) {
          connection.destroy();
        }
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** Waits for a condition, polling on a short tick. Fails loudly rather than hanging forever. */
export async function until(
  predicate: () => boolean,
  what: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for: ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
