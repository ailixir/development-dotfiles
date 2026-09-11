/**
 * One assembled runner, all seams faked, for the behavioural suite.
 *
 * Everything non-deterministic is injected: the monotonic clock, the wall clock, the jitter
 * source and `sleep`. Retry schedules and delivery windows are therefore exact rather than
 * timing-dependent, and the suite runs in milliseconds without ever sleeping for real.
 */
import type { BrowserLauncher, ScratchStore } from '../../src/server/adapters.js';
import type { RunOrigin } from '../../src/run/timeline.js';
import type { RunnerConfig } from '../../src/server/config.js';
import { CONFIG_PREFIX, loadConfig } from '../../src/server/config.js';
import { createApplication } from '../../src/server/application.js';
import type { RunnerApplication } from '../../src/server/application.js';
import type { CapacityPool } from '../../src/server/capacity.js';
import { createRecordingLogSink } from '../../src/server/logging.js';
import type { RecordingLogSink } from '../../src/server/logging.js';
import type { FakeScheduler } from './scheduler.js';
import { createFakeScheduler } from './scheduler.js';
import type { EventLog, FakeBrowserLauncher, FakeHttpClient, FakeScratchStore } from './runner.js';
import {
  createEventLog,
  createFakeBrowserLauncher,
  createFakeHttpClient,
  createFakeScratchStore,
} from './runner.js';

export const SERVICE_TOKEN = 'inbound-service-identity-stub';
export const CALLBACK_TOKEN = 'outbound-service-identity-stub';

/** Runtime versions as `runtime-versions.json` records them (architecture §4.6). */
export const RUNTIME_VERSIONS: Readonly<Record<string, unknown>> = {
  playwright: '1.63.0',
  node: 'v22.11.0',
  validatorSchema: '1.0.0',
  executor: '1.0.0',
  syntaxReference: '1.0.0',
};

export interface HarnessOptions {
  readonly env?: Record<string, string>;
  readonly pool?: CapacityPool;
  /** Overrides the monotonic clock; used to make a synchronous call look slow (AC-4). */
  readonly now?: () => number;
  /** Overrides how the in-process run origin is taken (10.12 AC-11.3). */
  readonly takeOrigin?: () => RunOrigin;
  /** Overrides the recorded runtime versions, so the §4.6 refusal can be driven (10.12 AC-2). */
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
}

export interface Harness {
  readonly app: RunnerApplication;
  readonly config: RunnerConfig;
  readonly http: FakeHttpClient;
  readonly launcher: FakeBrowserLauncher;
  readonly scratch: FakeScratchStore;
  readonly log: EventLog;
  readonly sink: RecordingLogSink;
  /** The clock and timer facility the run is driven on (10.13). */
  readonly scheduler: FakeScheduler;
  /** Advances the injected monotonic clock, firing any deadline that comes due. */
  advance(ms: number): void;
  readonly sleeps: readonly number[];
  start(): Promise<number>;
  stop(): Promise<void>;
  readonly port: number;
}

export function createHarness(options: HarnessOptions = {}): Harness {
  const config = loadConfig({
    [`${CONFIG_PREFIX}PORT`]: '0',
    [`${CONFIG_PREFIX}HOST`]: '127.0.0.1',
    [`${CONFIG_PREFIX}SERVICE_IDENTITY`]: SERVICE_TOKEN,
    [`${CONFIG_PREFIX}CALLBACK_IDENTITY`]: CALLBACK_TOKEN,
    [`${CONFIG_PREFIX}CALLBACK_BASE_URL`]: 'https://api.internal.example',
    [`${CONFIG_PREFIX}INSTANCE_ID`]: 'runner-a',
    [`${CONFIG_PREFIX}DRAIN_TIMEOUT_MS`]: '2000',
    ...options.env,
  });

  const log = createEventLog();
  const http = createFakeHttpClient(log);
  const launcher = createFakeBrowserLauncher(log);
  const scratch = createFakeScratchStore(log);
  const sink = createRecordingLogSink();
  const sleeps: number[] = [];
  const scheduler = options.scheduler ?? createFakeScheduler();
  let port = 0;

  const app = createApplication(config, {
    launcher: options.launcher ?? launcher,
    runtimeVersions: options.runtimeVersions ?? RUNTIME_VERSIONS,
    http,
    scratch: options.scratch ?? scratch,
    logSink: sink,
    pool: options.pool,
    now: options.now ?? scheduler.now,
    timers: scheduler,
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
    takeOrigin: options.takeOrigin,
  });

  return {
    app,
    config,
    http,
    launcher,
    scratch,
    log,
    sink,
    scheduler,
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
