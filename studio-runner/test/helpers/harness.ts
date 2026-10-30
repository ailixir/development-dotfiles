import { TEST_DOMAINS } from './allowedDomains.js';
/**
 * One assembled runner, all seams faked, for the behavioural suite.
 *
 * Everything non-deterministic is injected: the monotonic clock, the wall clock, the jitter
 * source and `sleep`. Retry schedules and delivery windows are therefore exact rather than
 * timing-dependent, and the suite runs in milliseconds without ever sleeping for real.
 */
import type { BrowserLauncher, ScratchStore } from '../../src/server/adapters.js';
import type { DeadlineTimers } from '../../src/run/deadline.js';
import type { RunnerConfig } from '../../src/server/config.js';
import { CONFIG_PREFIX, loadConfig } from '../../src/server/config.js';
import { createApplication } from '../../src/server/application.js';
import type { EvidenceFileSystem } from '../../src/run/evidenceUpload.js';
import type { ObjectStoreClient } from '../../src/run/objectStore.js';
import type { RunnerApplication } from '../../src/server/application.js';
import type { CapacityPool } from '../../src/server/capacity.js';
import type { ObservedRunnerSupport } from '../../src/server/runCoordinator.js';
import { createRecordingLogSink } from '../../src/server/logging.js';
import { createFakeObjectStore } from './fakeObjectStore.js';
import { testFingerprint, testTls } from './guidedTls.js';
import type { RecordingLogSink } from '../../src/server/logging.js';
import type { FakeScheduler } from './scheduler.js';
import { createFakeScheduler } from './scheduler.js';
import type {
  EventLog,
  FakeBrowserLauncher,
  FakeHttpClient,
  FakeScratchStore,
  RecordedHttpRequest,
} from './runner.js';
import {
  OBSERVED_SUPPORT,
  createEventLog,
  createFakeBrowserLauncher,
  createFakeHttpClient,
  createFakeScratchStore,
} from './runner.js';

export const SERVICE_TOKEN = 'inbound-service-identity-stub';
export const CALLBACK_TOKEN = 'outbound-service-identity-stub';

/**
 * Runtime versions as `runtime-versions.json` records them (architecture §4.6): the Playwright pin
 * and the observed identities (STUDIO-OBS-009 AC-1 P2 a). The artifact-1 stamps are gone.
 */
export const RUNTIME_VERSIONS: Readonly<Record<string, unknown>> = {
  playwright: '1.63.0',
  node: 'v22.11.0',
  observedSchemaBundleHash: 'a'.repeat(64),
  observedReferenceBundleHash: 'b'.repeat(64),
  observedChromiumBuild: '1243',
  observedBrowserLauncherSha256: 'c'.repeat(64),
};

export interface HarnessOptions {
  readonly env?: Record<string, string>;
  readonly pool?: CapacityPool;
  /** Overrides the monotonic clock; used to make a synchronous call look slow (AC-4). */
  readonly now?: () => number;
  /**
   * The observed support the application runs with. Defaults to {@link OBSERVED_SUPPORT}, which
   * admits `observedJob()`; a test of the disabled family passes its own.
   */
  readonly observed?: ObservedRunnerSupport;
  /** Overrides the recorded runtime versions the reports carry. */
  readonly runtimeVersions?: Readonly<Record<string, unknown>>;
  /** Substitutes the browser launcher; the fixtures tier passes the real Chromium one (AC-20). */
  readonly launcher?: BrowserLauncher;
  /** Substitutes the scratch store; the fixtures tier passes a real filesystem one (AC-22). */
  readonly scratch?: ScratchStore;
  /**
   * Drives the monotonic clock **and** the runtime deadline's timer from one place (10.13 AC-1).
   *
   * When supplied, `advance` fires whatever the deadline scheduled, so "the kill was ordered
   * exactly `totalRuntimeMs` after the browser start" is an assertion rather than a sleep.
   */
  readonly scheduler?: FakeScheduler;
  /** The control read's own timers (ADR-002 §29). Never advanced unless a test does it. */
  readonly controlScheduler?: FakeScheduler;
  /**
   * Real timers for the control read, in place of the fake `controlScheduler` (Studio v1 WP11).
   *
   * The fixtures tier's cancel tests measure the **real** 2 s poll, which a scheduler nobody
   * advances can never show. When this is supplied the app polls on it, and the harness's
   * `controlScheduler` is a detached fake that the app never sees — advancing it does nothing.
   */
  readonly controlTimers?: DeadlineTimers;
  /** Substitutes the object store; story 10.14's ordering and failure-path tests pass their own. */
  readonly objectStore?: ObjectStoreClient;
  /** Substitutes the uploader's filesystem port, so whole-file reads can be counted (AC-5). */
  readonly evidenceFileSystem?: EvidenceFileSystem;
  /**
   * Observes every log line **as it is written**.
   *
   * The recorded sink is read after the fact, which is fine for content and useless for order: an
   * ordering test interleaving pod-log events with store calls needs both at emission time, on one
   * clock. Story 10.14 AC-3 is decided on that interleaving.
   */
  readonly onLogLine?: (line: string) => void;
  /**
   * Observes each report request as the runner hands it to the transport.
   *
   * Story 10.14 AC-3 asserts a sequence whose last element is the terminal delivery. That element
   * has to be produced by the thing that delivers; a `journal.push('sendFinal')` executed by the
   * test after the run is last whatever the runner did (QA-2).
   */
  readonly onReportRequest?: (request: RecordedHttpRequest) => void;
}

export interface Harness {
  readonly app: RunnerApplication;
  readonly config: RunnerConfig;
  readonly http: FakeHttpClient;
  readonly launcher: FakeBrowserLauncher;
  readonly scratch: FakeScratchStore;
  /** The store the terminal path wrote to. A fake by default (story 10.14 AC-18a). */
  readonly objectStore: ObjectStoreClient;
  readonly log: EventLog;
  readonly sink: RecordingLogSink;
  /** The clock and timer facility the run is driven on (10.13). */
  readonly scheduler: FakeScheduler;
  /** The control read's scheduler, separate so the deadline suites never see a poll. */
  readonly controlScheduler: FakeScheduler;
  /** Advances the injected monotonic clock, firing any deadline that comes due. */
  advance(ms: number): void;
  readonly sleeps: readonly number[];
  start(): Promise<number>;
  stop(): Promise<void>;
  readonly port: number;
}

/**
 * The filesystem the uploader is given in the unit tier.
 *
 * `stat` answers for any path, because the fake session's recording path names no real file, and
 * `readFile` is present and counted: the uploader must never call it at any recording size
 * (story 10.14 AC-5).
 */
export const FAKE_EVIDENCE_FILE_SYSTEM: EvidenceFileSystem = {
  stat: (): Promise<{ readonly size: number }> => Promise.resolve({ size: 24_576 }),
  readFile: (): Promise<Uint8Array> => {
    throw new Error('the uploader must not read a recording whole');
  },
};

export function createHarness(options: HarnessOptions = {}): Harness {
  const config = loadConfig({
    [`${CONFIG_PREFIX}PORT`]: '0',
    [`${CONFIG_PREFIX}HOST`]: '127.0.0.1',
    [`${CONFIG_PREFIX}SERVICE_IDENTITY`]: SERVICE_TOKEN,
    [`${CONFIG_PREFIX}CALLBACK_IDENTITY`]: CALLBACK_TOKEN,
    [`${CONFIG_PREFIX}CALLBACK_BASE_URL`]: 'https://api.internal.example',
    [`${CONFIG_PREFIX}INSTANCE_ID`]: 'runner-a',
    [`${CONFIG_PREFIX}DRAIN_TIMEOUT_MS`]: '2000',
    [`${CONFIG_PREFIX}ALLOWED_DOMAINS`]: TEST_DOMAINS.join(','),
    // Allow-all is ON when unset (the default for now); the unit tiers exercise the list.
    [`${CONFIG_PREFIX}ALLOW_ALL_DOMAINS`]: 'false',
    // The suites that drive capacity and the total-runtime clamp were written against one slot and 120 s; they say so here.
    [`${CONFIG_PREFIX}POOL_SIZE`]: '1',
    [`${CONFIG_PREFIX}MAX_TOTAL_RUNTIME_MS`]: '120000',
    ...options.env,
  });

  const log = createEventLog();
  const http = createFakeHttpClient(log, options.onReportRequest);
  const launcher = createFakeBrowserLauncher(log);
  const scratch = createFakeScratchStore(log);
  const recorded = createRecordingLogSink();
  const observe = options.onLogLine;
  const sink: RecordingLogSink =
    observe === undefined
      ? recorded
      : {
          lines: recorded.lines,
          write(line: string): void {
            recorded.write(line);
            observe(line);
          },
        };
  // Story 10.14: the terminal path now uploads the recording and writes the manifest before
  // scratch is cleared. The default harness gives it a working store and a filesystem that
  // reports a size for whatever path the fake session claims, so a run whose recorder produced a
  // playable file reaches `STORED` — which is what a working deployment does. Tests that need a
  // failing store, an unreachable one or a call log pass their own.
  const objectStore =
    options.objectStore ??
    createFakeObjectStore({
      // The fake session's recording path names no real file; resolving it synthetically keeps
      // these tests about the terminal path. The ordering, canary and retained-bytes tests use a
      // store that streams a real temp file instead.
      resolveFile: () => Promise.resolve(new TextEncoder().encode('webm-bytes')),
    }).client;
  const evidenceFileSystem = options.evidenceFileSystem ?? FAKE_EVIDENCE_FILE_SYSTEM;
  const sleeps: number[] = [];
  const scheduler = options.scheduler ?? createFakeScheduler();
  const controlScheduler = options.controlScheduler ?? createFakeScheduler();
  let port = 0;

  const app = createApplication(config, {
    // The one listener is TLS with a pinned client certificate (STUDIO-OBS-009 AC-3); the suite's raw
    // helpers (`post`, `get`, `postInterleaved`) present the same test certificate.
    listener: { tls: testTls, controllerCertificateFingerprint256: testFingerprint },
    launcher: options.launcher ?? launcher,
    runtimeVersions: options.runtimeVersions ?? RUNTIME_VERSIONS,
    http,
    scratch: options.scratch ?? scratch,
    logSink: sink,
    pool: options.pool,
    now: options.now ?? scheduler.now,
    timers: scheduler,
    controlTimers: options.controlTimers ?? controlScheduler,
    // Fixed wall clock so a FINAL body is byte-comparable without a fake timer library.
    wallClock: () => new Date('2026-09-11T10:00:00.000Z'),
    sleep: (ms: number) => {
      sleeps.push(ms);
      // The retry backoff moves the same clock everything else is measured on; a deadline armed
      // before a terminal retry must therefore still be able to come due during one.
      scheduler.advance(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    observed: options.observed ?? OBSERVED_SUPPORT,
    objectStore,
    evidenceFileSystem,
  });

  return {
    app,
    config,
    http,
    launcher,
    scratch,
    objectStore,
    log,
    sink,
    scheduler,
    controlScheduler,
    sleeps,
    advance(ms: number): void {
      scheduler.advance(ms);
    },
    get port(): number {
      return port;
    },
    async start(): Promise<number> {
      port = await app.start();
      return port;
    },
    async stop(): Promise<void> {
      await app.server.close();
    },
  };
}

/** Waits until `predicate` holds or the microtask budget runs out. */
export async function until(predicate: () => boolean, ticks = 2000): Promise<void> {
  for (let index = 0; index < ticks; index += 1) {
    if (predicate()) return;
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
  throw new Error('Condition was not met before the tick budget ran out.');
}
