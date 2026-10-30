import {currentJob as declaredCurrentJob} from './currentWorlds.js';
/**
 * Fakes and helpers for the server suite (10.6), retargeted at `POST /v2/runs` by STUDIO-OBS-012A.
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
 *
 * ## The fake session is an observed one
 *
 * The artifact-1 in-process session (a fake `BrowserAdapter` the coordinator drove with
 * `executeSteps`) was deleted with the artifact-1 engine. A fake session now has the shape every
 * real one has — a `run` that reports the admitted observed job's steps through the coordinator's
 * reporter and can be killed — and a test steers it with a {@link FakeRunScript}: pass, fail at a
 * step, or hang in a step until the parent ends the run.
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { Socket } from 'node:net';
import { connect } from 'node:tls';
import { testTls } from './guidedTls.js';

import {publicationFixture as fixture} from './publicationFixture.js';
import type { BuildIdentity, ObservedJob } from '../../src/executor/observedOperations.js';
import type { StepReporter } from '../../src/executor/stepReporter.js';
import type { ObservedRunnerSupport } from '../../src/server/runCoordinator.js';
import { OBSERVED_SCHEMA_BUNDLE_HASH } from '../../src/validator/observedReferencePolicy.js';
import type {
  BrowserLauncher,
  BrowserSession,
  LaunchOptions,
  RunScratch,
  ScratchStore,
  SessionKillReason,
  SessionRecording,
  SessionRunResult,
} from '../../src/server/adapters.js';
import type { HttpClient, HttpOutcome, HttpRequest } from '../../src/reporting/httpClient.js';
import { ObservedPreReadyFailure } from '../../src/run/errors.js';
import { CANCELLED_MESSAGE, TOTAL_TIMEOUT_MESSAGE } from '../../src/run/launcher.js';

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
  /** `GET …/control` reads (ADR-002 §29), kept apart so report counts stay report counts. */
  readonly controlRequests: readonly RecordedHttpRequest[];
  /**
   * Outcome for the next admission call, or a function of (request, call index). Defaults to
   * {@link observedAdmissionReceipt}: a closed receipt echoing the request, which is what the API's
   * observed CAS answers when it grants the admission.
   */
  admissionOutcome: OutcomeSource;
  reportOutcome: OutcomeSource;
  controlOutcome: OutcomeSource;
  /** Gate that holds an admission call open until released, for interleaving tests. */
  holdAdmission(): () => void;
}

const OK: HttpOutcome = { kind: 'response', status: 200, body: '{}' };

/**
 * The API's answer to a granted observed admission: a closed receipt that echoes the request
 * byte-for-byte, with a start deadline 30 s and a run deadline 60 s out (on the real wall clock,
 * because `admitObserved` checks the receipt against `Date.now()`).
 */
export function observedAdmissionReceipt(request: HttpRequest): HttpOutcome {
  const body = JSON.parse(request.body) as { admissionId: string };
  const now = Date.now();
  return {
    kind: 'response',
    status: 200,
    body: JSON.stringify({
      schemaVersion: 3,
      kind: 'observed',
      admissionId: body.admissionId,
      request: body,
      admittedAt: new Date(now - 1).toISOString(),
      startDeadlineAt: new Date(now + 30_000).toISOString(),
      runDeadlineAt: new Date(now + 60_000).toISOString(),
    }),
  };
}

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
  const controlRequests: RecordedHttpRequest[] = [];
  let release: (() => void) | null = null;
  let gate: Promise<void> | null = null;

  const client: FakeHttpClient = {
    requests,
    admissionRequests,
    reportRequests,
    controlRequests,
    admissionOutcome: observedAdmissionReceipt,
    reportOutcome: OK,
    controlOutcome: { kind: 'response', status: 200, body: '{"cancelRequested":false}' },
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
      const isAdmission = request.url.endsWith('/observed-admission');
      if (isAdmission) {
        admissionRequests.push(recorded);
        log?.push('admission.request');
        if (gate !== null) await gate;
        const source = client.admissionOutcome;
        return typeof source === 'function'
          ? source(request, admissionRequests.length - 1)
          : source;
      }
      if (request.url.endsWith('/control')) {
        controlRequests.push(recorded);
        const control = client.controlOutcome;
        return typeof control === 'function'
          ? control(request, controlRequests.length - 1)
          : control;
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
 * The CAS itself is the API's; this fake plays its part here exactly as the fake browser and
 * storage adapters play theirs. The first admission for an attempt is granted with a closed
 * receipt; a different `admissionId` for the same attempt is refused `409`. The property under
 * test on the runner side is that the runner *obeys* the verdict and never acts on a non-success.
 */
export function singleWinnerAdmission(): (request: HttpRequest) => HttpOutcome {
  const owners = new Map<string, string>();
  return (request: HttpRequest): HttpOutcome => {
    const parsed = JSON.parse(request.body) as { attemptId: string; admissionId: string };
    const existing = owners.get(parsed.attemptId);
    if (existing === undefined || existing === parsed.admissionId) {
      owners.set(parsed.attemptId, parsed.admissionId);
      return observedAdmissionReceipt(request);
    }
    return { kind: 'response', status: 409, body: '{"code":"ADMISSION_COMPETING"}' };
  };
}

// ── Fake browser launcher ─────────────────────────────────────────────────────────────────────

/** How a fake session's run behaves. The default passes every step of the admitted job. */
export interface FakeRunScript {
  /** The step that fails; later steps are reported `SKIPPED` with null timings. */
  readonly failAt?: number | undefined;
  /** The closed error code the failing step and the result carry. Defaults to an assertion. */
  readonly errorCode?: string | undefined;
  /** The step the run hangs in until the parent ends it (`SessionRun.kill`). */
  readonly hangAt?: number | undefined;
  /** The recording the session reports. Defaults to a playable, complete one. */
  readonly recording?: SessionRecording | undefined;
  /** Whether the ordered stop the kill performs "completes". Defaults to true. */
  readonly orderedStop?: boolean | undefined;
}

/** A recording that flushed cleanly: playable, complete, not yet stored. */
export const FAKE_RECORDING: SessionRecording = {
  path: '/fake-scratch/video/app.webm',
  bytes: 24_576,
  error: null,
  state: 'PENDING',
  partial: false,
};

/** What a fake session saw happen to it. */
export interface FakeSession {
  readonly options: LaunchOptions;
  /** Every kill the parent ordered, by reason, in order. */
  readonly kills: SessionKillReason[];
  /** Steps the run reported as started, in order. */
  readonly started: number[];
  /** Whether the run is currently hanging in a step. */
  readonly hanging: boolean;
}

export interface FakeBrowserLauncher extends BrowserLauncher {
  readonly launches: readonly LaunchOptions[];
  readonly sessions: readonly FakeSession[];
  readonly closed: number;
  /** Makes the next launch reject, so the never-started path can be exercised (AC-14a). */
  failNextLaunch(error: Error): void;
  /** Holds the launch open until the returned function is called. */
  holdLaunch(): () => void;
  /** The script the next launched session runs. Sticky until replaced. */
  script: FakeRunScript;
}

/** The real launcher's classification of a kill (`src/run/launcher.ts`), mirrored. */
const KILL_KINDS: Readonly<Record<SessionKillReason, string>> = {
  'total-runtime': 'total-timeout',
  drain: 'run-fault',
  cancel: 'cancelled',
};

const KILL_TEXT: Readonly<Record<SessionKillReason, string>> = {
  'total-runtime': TOTAL_TIMEOUT_MESSAGE,
  drain: 'The runner drained while this run was still in flight; the browser process tree was stopped.',
  cancel: CANCELLED_MESSAGE,
};

/**
 * A launcher whose sessions run the admitted observed job in-process.
 *
 * Step readings are on a fake run clock (`10 * (stepIndex + 1)`, `+5` for the finish), the way the
 * child reports readings on its own scale and the parent passes them through. The kill classifies
 * the reason first and then ends the run, as the real launcher does (`src/run/launcher.ts`).
 */
export function createFakeBrowserLauncher(log?: EventLog): FakeBrowserLauncher {
  const launches: LaunchOptions[] = [];
  const sessions: FakeSession[] = [];
  let closed = 0;
  let failure: Error | null = null;
  let release: (() => void) | null = null;
  let gate: Promise<void> | null = null;

  const launcher: FakeBrowserLauncher = {
    launches,
    sessions,
    script: {},
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
      if (gate !== null) {
        // A held launch is abortable, as the real one is: the coordinator aborts the launch it is
        // waiting on for a cancel or a drain, and the session never starts.
        const signal = options.signal;
        await Promise.race([
          gate,
          new Promise<void>((resolve) => {
            signal?.addEventListener('abort', () => {
              resolve();
            }, { once: true });
          }),
        ]);
      }
      if (options.signal?.aborted === true) {
        throw new ObservedPreReadyFailure('CANCELLED', { path: null, bytes: null, error: null, state: 'UNAVAILABLE', partial: false });
      }
      if (failure !== null) {
        const error = failure;
        failure = null;
        throw error;
      }
      launches.push(options);
      log?.push('browser.launch');
      const script = launcher.script;
      const steps = options.observed.job.artifact.steps;
      let endRun: ((reason: SessionKillReason) => void) | null = null;
      let killReason: SessionKillReason | null = null;
      const session: FakeSession & { hanging: boolean } = {
        options,
        kills: [],
        started: [],
        hanging: false,
      };
      sessions.push(session);
      let closedOnce = false;
      return {
        close(): Promise<void> {
          if (!closedOnce) {
            closedOnce = true;
            closed += 1;
            log?.push('browser.close');
          }
          return Promise.resolve();
        },
        run: {
          origin: { browserStartedAt: new Date('2026-09-11T10:00:00.000Z'), startedAtMs: 0 },
          async execute({ reporter }: { reporter: StepReporter }): Promise<SessionRunResult> {
            const recording = script.recording ?? FAKE_RECORDING;
            const result = (ok: boolean, failureKind: string | null, failureMessage: string | null): SessionRunResult => ({
              ok,
              failureKind,
              failureMessage,
              recording,
              observedHosts: [],
              secretUse: {},
            });
            for (const step of steps) {
              const index = step.stepIndex;
              const startedAtMs = 10 * (index + 1);
              session.started.push(index);
              reporter.stepStarted({ stepIndex: index, startedAtMs });
              if (script.hangAt === index && killReason === null) {
                session.hanging = true;
                await new Promise<void>((resolve) => {
                  endRun = (): void => {
                    resolve();
                  };
                });
                session.hanging = false;
              }
              if (killReason !== null) {
                const failure = killReason === 'cancel' ? 'CANCELLED' : 'TIMEOUT';
                reporter.stepFinished({ stepIndex: index, status: 'FAIL', startedAtMs, finishedAtMs: startedAtMs + 5, durationMs: 5, failure });
                for (const later of steps.filter((entry) => entry.stepIndex > index)) {
                  reporter.stepFinished({ stepIndex: later.stepIndex, status: 'SKIPPED', startedAtMs: null, finishedAtMs: null, durationMs: null, failure: null });
                }
                return result(false, KILL_KINDS[killReason], KILL_TEXT[killReason]);
              }
              if (script.failAt === index) {
                const code = script.errorCode ?? 'ASSERTION_FAILED';
                reporter.stepFinished({ stepIndex: index, status: 'FAIL', startedAtMs, finishedAtMs: startedAtMs + 5, durationMs: 5, failure: code });
                for (const later of steps.filter((entry) => entry.stepIndex > index)) {
                  reporter.stepFinished({ stepIndex: later.stepIndex, status: 'SKIPPED', startedAtMs: null, finishedAtMs: null, durationMs: null, failure: null });
                }
                return result(false, code === 'ASSERTION_FAILED' ? 'step' : 'run-fault', code);
              }
              reporter.stepFinished({ stepIndex: index, status: 'PASS', startedAtMs, finishedAtMs: startedAtMs + 5, durationMs: 5, failure: null });
            }
            return result(true, null, null);
          },
          kill(reason: SessionKillReason): Promise<{ orderedStopCompleted: boolean }> {
            killReason ??= reason;
            session.kills.push(reason);
            endRun?.(reason);
            return Promise.resolve({ orderedStopCompleted: script.orderedStop ?? true });
          },
        },
      };
    },
  };
  return launcher;
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

/** The build identity this checkout's observed schema bundle produces. */
export const OBSERVED_BUILD: BuildIdentity = { ...fixture.build, schemaBundleHash: OBSERVED_SCHEMA_BUNDLE_HASH };

/** Runner support that validates and replays the fixture job. */
export const OBSERVED_SUPPORT: ObservedRunnerSupport = {
  build: OBSERVED_BUILD,
  
  validationEnabled: true,
  replayEnabled: true,
};

/** The fixture job's execution id, which is the path segment `DELETE /v2/runs/{id}` names. */
export const OBSERVED_EXECUTION_ID: string = fixture.job.binding.executionId;

/** The fixture job's attempt id. */
export const OBSERVED_ATTEMPT_ID: string = fixture.job.binding.attemptId;

/** The evidence keys the coordinator derives for a fixture job run with these ids. */
export function observedEvidenceKeys(
  executionId: string = OBSERVED_EXECUTION_ID,
  attemptId: string = OBSERVED_ATTEMPT_ID,
): { readonly videoKey: string; readonly manifestKey: string } {
  const prefix = `studio/${fixture.job.binding.csiId}/${fixture.job.binding.testId}/${executionId}/${attemptId}`;
  return { videoKey: `${prefix}.webm`, manifestKey: `${prefix}.result.json` };
}

/** The non-secret input values the fixture job carries; none may reach a log line. */
export const OBSERVED_INPUT_VALUES: readonly string[] = fixture.job.inputs
  .map((input) => input.value)
  .filter((value) => value.trim() !== '');

/**
 * A closed observed job the runner admits: the v3 contract fixture with this checkout's build and
 * a replay grant issued a moment ago. Three steps, no secrets.
 *
 * `executionId` / `attemptId` move the binding and the grant together, so two jobs can be distinct
 * runs (or the same attempt raced by two runners) without breaking the grant join.
 * `totalRuntimeMs` is the job's own runtime ask, which the coordinator clamps to the server limit.
 */
export function observedJob(
  overrides: { readonly executionId?: string; readonly attemptId?: string; readonly totalRuntimeMs?: number } = {},
): ObservedJob {
  return declaredCurrentJob(OBSERVED_BUILD,overrides);
}

/** {@link observedJob}, serialized for `POST /v2/runs`. */
export function observedBody(overrides: Parameters<typeof observedJob>[0] = {}): string {
  return JSON.stringify(observedJob(overrides));
}

// ── Raw HTTP helpers ──────────────────────────────────────────────────────────────────────────

export interface RawResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/**
 * Minimal HTTPS client for the real-server tests; `fetch` cannot interleave a body by hand. It presents the
 * test controller certificate, the one the harness pins.
 */
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
    const socket = connect(port, '127.0.0.1', { ...testTls, rejectUnauthorized: true }, () => {
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
        const socket = connect(port, '127.0.0.1', { ...testTls, rejectUnauthorized: true });
        sockets.push(socket);
        socket.setEncoding('utf8');
        // Registered in the same synchronous pass as `connect`, so the event cannot be missed. The
        // listener is TLS (STUDIO-OBS-009 AC-3): a connection is usable once the handshake is done.
        socket.on('secureConnect', () => {
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
