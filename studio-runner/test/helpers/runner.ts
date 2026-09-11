/**
 * Fakes and helpers for the 10.6 suite.
 *
 * They live under `test/` rather than `src/` on purpose: a fake browser launcher has no business
 * being shipped inside the image whose entire job is to be the only thing that launches a real
 * browser, and keeping them out of `src/` also keeps them out of the coverage gate, so the
 * production coverage numbers mean what they say.
 *
 * ## The shared event log is the AC-6 ordering instrument
 *
 * @po flagged that AC-6's ordering is "only observable through adapters, so a reordering that
 * touches nothing fake would go unseen". The answer here is that **every** boundary the ordering
 * crosses writes into one shared array: the fake HTTP client (admission and report POSTs), the
 * fake scratch store (directory creation) and the fake browser launcher (launch). A reordering
 * that moved scratch creation before the CAS, or the `202` before the admission call, changes the
 * sequence in that array and fails an equality assertion — it is not merely "no adapter was
 * called", it is "the calls happened in this exact order".
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { connect } from 'node:net';
import type { Socket } from 'node:net';

import type { BrowserAdapter } from '../../src/executor/adapters/BrowserAdapter.js';
import { createFakeBrowserAdapter } from '../../src/executor/adapters/fake.js';
import type { FakeBrowserAdapter } from '../../src/executor/adapters/fake.js';
import type {
  BrowserLauncher,
  BrowserSession,
  LaunchOptions,
  RunScratch,
  ScratchStore,
} from '../../src/server/adapters.js';
import type { HttpClient, HttpOutcome, HttpRequest } from '../../src/reporting/httpClient.js';

// ── Shared ordered event log ──────────────────────────────────────────────────────────────────

export type RunEvent =
  | 'admission.request'
  | 'report.request'
  | 'scratch.create'
  | 'scratch.clear'
  | 'browser.launch'
  | 'browser.close';

export interface EventLog {
  readonly events: readonly RunEvent[];
  push(event: RunEvent): void;
  clear(): void;
}

export function createEventLog(): EventLog {
  const events: RunEvent[] = [];
  return {
    events,
    push(event: RunEvent): void {
      events.push(event);
    },
    clear(): void {
      events.length = 0;
    },
  };
}

// ── Fake HTTP client ──────────────────────────────────────────────────────────────────────────

export interface RecordedHttpRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export type OutcomeSource = HttpOutcome | ((request: HttpRequest, index: number) => HttpOutcome);

export interface FakeHttpClient extends HttpClient {
  /** Every request issued, in order, with the exact bytes handed over. */
  readonly requests: readonly RecordedHttpRequest[];
  readonly admissionRequests: readonly RecordedHttpRequest[];
  readonly reportRequests: readonly RecordedHttpRequest[];
  /** Outcome for the next admission call, or a function of (request, call index). */
  admissionOutcome: OutcomeSource;
  reportOutcome: OutcomeSource;
  /** Gate that holds an admission call open until released, for interleaving tests. */
  holdAdmission(): () => void;
}

const OK: HttpOutcome = { kind: 'response', status: 200, body: '{}' };

/**
 * @param onReportRequest observes a report request **at the instant it is handed to the
 *     transport**, before any outcome is produced. Story 10.14 AC-3's ordering assertion needs the
 *     `sendFinal` element of its sequence to come from here and not from the test's own hand: an
 *     entry the test appends after the run is last by construction and cannot discriminate
 *     anything (QA-2).
 */
export function createFakeHttpClient(
  log?: EventLog,
  onReportRequest?: (request: RecordedHttpRequest) => void,
): FakeHttpClient {
  const requests: RecordedHttpRequest[] = [];
  const admissionRequests: RecordedHttpRequest[] = [];
  const reportRequests: RecordedHttpRequest[] = [];
  let release: (() => void) | null = null;
  let gate: Promise<void> | null = null;

  const client: FakeHttpClient = {
    requests,
    admissionRequests,
    reportRequests,
    admissionOutcome: OK,
    reportOutcome: OK,
    holdAdmission(): () => void {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        release?.();
        gate = null;
        release = null;
      };
    },
    async send(request: HttpRequest): Promise<HttpOutcome> {
      const recorded: RecordedHttpRequest = {
        url: request.url,
        headers: request.headers,
        body: request.body,
      };
      requests.push(recorded);
      const isAdmission = request.url.endsWith('/admission');
      if (isAdmission) {
        admissionRequests.push(recorded);
        log?.push('admission.request');
        if (gate !== null) await gate;
        const source = client.admissionOutcome;
        return typeof source === 'function'
          ? source(request, admissionRequests.length - 1)
          : source;
      }
      reportRequests.push(recorded);
      log?.push('report.request');
      onReportRequest?.(recorded);
      const source = client.reportOutcome;
      return typeof source === 'function' ? source(request, reportRequests.length - 1) : source;
    },
  };
  return client;
}

/**
 * A single-winner compare-and-set standing in for the API's ledger (AC-7b).
 *
 * The CAS itself is story 10.7's; this fake plays its part here exactly as the fake browser and
 * storage adapters play theirs. The property under test on the runner side is that the runner
 * *obeys* the verdict and never acts on a non-success.
 */
export function singleWinnerAdmission(): (request: HttpRequest) => HttpOutcome {
  const owners = new Map<string, string>();
  return (request: HttpRequest): HttpOutcome => {
    const parsed = JSON.parse(request.body) as { attemptId: string; admissionId: string };
    const existing = owners.get(parsed.attemptId);
    if (existing === undefined) {
      owners.set(parsed.attemptId, parsed.admissionId);
      return { kind: 'response', status: 200, body: '{}' };
    }
    if (existing === parsed.admissionId) {
      // Duplicate identical admission is idempotent (architecture §5.1.4).
      return { kind: 'response', status: 200, body: '{}' };
    }
    return { kind: 'response', status: 409, body: '{"code":"ADMISSION_COMPETING"}' };
  };
}

// ── Fake browser launcher ─────────────────────────────────────────────────────────────────────

export interface FakeBrowserLauncher extends BrowserLauncher {
  readonly launches: readonly LaunchOptions[];
  readonly adapters: readonly FakeBrowserAdapter[];
  readonly closed: number;
  /** Makes the next launch reject, so the never-started path can be exercised (AC-14a). */
  failNextLaunch(error: Error): void;
  /** Holds the launch open until the returned function is called. */
  holdLaunch(): () => void;
}

export function createFakeBrowserLauncher(log?: EventLog): FakeBrowserLauncher {
  const launches: LaunchOptions[] = [];
  const adapters: FakeBrowserAdapter[] = [];
  let closed = 0;
  let failure: Error | null = null;
  let release: (() => void) | null = null;
  let gate: Promise<void> | null = null;

  return {
    launches,
    adapters,
    get closed(): number {
      return closed;
    },
    failNextLaunch(error: Error): void {
      failure = error;
    },
    holdLaunch(): () => void {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        release?.();
        gate = null;
        release = null;
      };
    },
    async launch(options: LaunchOptions): Promise<BrowserSession> {
      if (gate !== null) await gate;
      if (failure !== null) {
        const error = failure;
        failure = null;
        throw error;
      }
      launches.push(options);
      log?.push('browser.launch');
      const adapter = createFakeBrowserAdapter();
      adapters.push(adapter);
      return {
        adapter: adapter as BrowserAdapter,
        close(): Promise<void> {
          closed += 1;
          log?.push('browser.close');
          return Promise.resolve();
        },
      };
    },
  };
}

// ── Fake scratch store ────────────────────────────────────────────────────────────────────────

export interface FakeScratchStore extends ScratchStore {
  /** Directory names currently present. A failed run must leave this empty (AC-21). */
  readonly present: readonly string[];
  /** Everything ever written into a scratch directory, so AC-21 can inspect it. */
  readonly written: readonly { readonly runId: string; readonly content: string }[];
  readonly clearAllCount: number;
}

export function createFakeScratchStore(log?: EventLog): FakeScratchStore {
  const present = new Set<string>();
  const written: { runId: string; content: string }[] = [];
  let clearAllCount = 0;

  return {
    get present(): readonly string[] {
      return [...present];
    },
    written,
    get clearAllCount(): number {
      return clearAllCount;
    },
    create(runId: string): Promise<RunScratch> {
      present.add(runId);
      log?.push('scratch.create');
      return Promise.resolve({
        path: `/fake-scratch/${runId}`,
        clear(): Promise<void> {
          present.delete(runId);
          log?.push('scratch.clear');
          return Promise.resolve();
        },
      });
    },
    clearAll(): Promise<void> {
      clearAllCount += 1;
      present.clear();
      return Promise.resolve();
    },
    list(): Promise<readonly string[]> {
      return Promise.resolve([...present]);
    },
  };
}

// ── Job bodies ────────────────────────────────────────────────────────────────────────────────

/** A job whose artifact validates and whose two steps reach the fake adapter. */
export function validJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    executionId: 'exec-1',
    attemptId: 'attempt-1',
    revisionId: 'rev-1',
    artifactHash: 'sha256:abc',
    csi: 'CSI-1234',
    videoKey: 'studio/exec-1/video.webm',
    manifestKey: 'studio/exec-1/manifest.json',
    source: ['Go to "https://example.com/login"', 'Type "<secret PW>" in the password field'],
    artifact: {
      version: 1,
      steps: [
        {
          stepIndex: 0,
          originalText: 'Go to "https://example.com/login"',
          code: "await page.goto('https://example.com/login');",
        },
        {
          stepIndex: 1,
          originalText: 'Type "<secret PW>" in the password field',
          code: "await page.getByTestId('password').fill(vars.secret('PW'));",
        },
      ],
    },
    references: { variables: [], secrets: ['PW'] },
    resolvedVars: {},
    resolvedSecrets: { PW: 'canary-secret-value' },
    configuration: {
      browser: 'chromium',
      viewport: { width: 1280, height: 720 },
      timeoutSeconds: 30,
      waitStrategy: 'load',
    },
    deadlines: { admittedStartMs: 30_000, totalRuntimeMs: 120_000 },
    ...overrides,
  };
}

// ── Raw HTTP helpers ──────────────────────────────────────────────────────────────────────────

export interface RawResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** Minimal HTTP client for the real-server tests; `fetch` cannot interleave a body by hand. */
export function post(
  port: number,
  path: string,
  body: string,
  token: string | null,
): Promise<RawResponse> {
  return rawRequest(port, buildRequest('POST', path, body, token));
}

export function get(port: number, path: string, token: string | null): Promise<RawResponse> {
  return rawRequest(port, buildRequest('GET', path, null, token));
}

export function buildRequest(
  method: string,
  path: string,
  body: string | null,
  token: string | null,
): { head: string; body: string } {
  const payload = body ?? '';
  const head = [
    `${method} ${path} HTTP/1.1`,
    'host: localhost',
    'connection: close',
    'content-type: application/json',
    `content-length: ${String(Buffer.byteLength(payload, 'utf8'))}`,
    ...(token === null ? [] : [`authorization: Bearer ${token}`]),
    '',
    '',
  ].join('\r\n');
  return { head, body: payload };
}

export function parseResponse(raw: string): RawResponse {
  const separator = raw.indexOf('\r\n\r\n');
  const headText = separator === -1 ? raw : raw.slice(0, separator);
  const body = separator === -1 ? '' : raw.slice(separator + 4);
  const lines = headText.split('\r\n');
  const status = Number(/^HTTP\/1\.\d (\d{3})/u.exec(lines[0] ?? '')?.[1] ?? '0');
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const index = line.indexOf(':');
    if (index > 0) headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return { status, headers, body };
}

function rawRequest(port: number, request: { head: string; body: string }): Promise<RawResponse> {
  return new Promise<RawResponse>((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      // One write: a route that answers before reading the body (the 401/403 path, AC-2a) ends
      // its response while an unflushed upload is still in the socket, and Node then closes the
      // connection under it. Sending the whole request at once removes that race from the
      // *client*, rather than making the server read a body it has already decided to refuse.
      socket.write(request.head + request.body);
    });
    let raw = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      raw += chunk;
    });
    socket.on('end', () => {
      resolve(parseResponse(raw));
    });
    socket.on('error', reject);
  });
}

/**
 * Opens `count` connections, writes all the request heads, then writes every body's first half,
 * then every body's second half.
 *
 * This is what "interleaved rather than sequenced" means concretely: at the moment the first
 * request completes and reaches the handler, every other request is already in flight with its
 * body partially delivered. A read-then-write capacity guard has its window open here; an atomic
 * acquire does not.
 */
export function postInterleaved(
  port: number,
  path: string,
  bodies: readonly string[],
  token: string,
): Promise<readonly RawResponse[]> {
  const sockets: Socket[] = [];
  const raw: string[] = bodies.map(() => '');
  const settled: Promise<RawResponse>[] = [];
  let connected = 0;
  let begin: () => void = () => undefined;

  for (const [index] of bodies.entries()) {
    settled.push(
      new Promise<RawResponse>((resolve, reject) => {
        const socket = connect(port, '127.0.0.1');
        sockets.push(socket);
        socket.setEncoding('utf8');
        // Registered in the same synchronous pass as `connect`, so the event cannot be missed.
        socket.on('connect', () => {
          connected += 1;
          if (connected === bodies.length) begin();
        });
        socket.on('data', (chunk: string) => {
          raw[index] = (raw[index] ?? '') + chunk;
        });
        socket.on('end', () => {
          resolve(parseResponse(raw[index] ?? ''));
        });
        socket.on('error', reject);
      }),
    );
  }

  begin = (): void => {
    const halves = bodies.map((body) => {
      const buffer = Buffer.from(body, 'utf8');
      const middle = Math.floor(buffer.length / 2);
      return [buffer.subarray(0, middle), buffer.subarray(middle)] as const;
    });
    // All heads first: every connection is now a request the server is waiting on.
    for (const [index, socket] of sockets.entries()) {
      socket.write(buildRequest('POST', path, bodies[index] ?? '', token).head);
    }
    // Then every first half, then every second half, so no request completes before the others
    // have started arriving.
    for (const [index, socket] of sockets.entries()) socket.write(halves[index]?.[0] ?? Buffer.alloc(0));
    for (const [index, socket] of sockets.entries()) socket.write(halves[index]?.[1] ?? Buffer.alloc(0));
  };

  return Promise.all(settled);
}

/** Starts a throwaway server so the raw helpers can be exercised against a known responder. */
export function echoServer(status: number, body: string): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((_request, response) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address !== null ? address.port : 0 });
    });
  });
}
