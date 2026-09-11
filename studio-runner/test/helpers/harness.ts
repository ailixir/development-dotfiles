/**
 * One assembled runner, all seams faked, for the behavioural suite.
 *
 * Everything non-deterministic is injected: the monotonic clock, the wall clock, the jitter
 * source and `sleep`. Retry schedules and delivery windows are therefore exact rather than
 * timing-dependent, and the suite runs in milliseconds without ever sleeping for real.
 */
import type { RunnerConfig } from '../../src/server/config.js';
import { CONFIG_PREFIX, loadConfig } from '../../src/server/config.js';
import { createApplication } from '../../src/server/application.js';
import type { RunnerApplication } from '../../src/server/application.js';
import type { CapacityPool } from '../../src/server/capacity.js';
import { createRecordingLogSink } from '../../src/server/logging.js';
import type { RecordingLogSink } from '../../src/server/logging.js';
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
}

export interface Harness {
  readonly app: RunnerApplication;
  readonly config: RunnerConfig;
  readonly http: FakeHttpClient;
  readonly launcher: FakeBrowserLauncher;
  readonly scratch: FakeScratchStore;
  readonly log: EventLog;
  readonly sink: RecordingLogSink;
  /** Advances the injected monotonic clock. */
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
  let clock = 0;
  let port = 0;

  const app = createApplication(config, {
    launcher,
    runtimeVersions: RUNTIME_VERSIONS,
    http,
    scratch,
    logSink: sink,
    pool: options.pool,
    now: options.now ?? ((): number => clock),
    // Fixed wall clock so a FINAL body is byte-comparable without a fake timer library.
    wallClock: () => new Date('2026-09-11T10:00:00.000Z'),
    sleep: (ms: number) => {
      sleeps.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    random: () => 0.5,
  });

  return {
    app,
    config,
    http,
    launcher,
    scratch,
    log,
    sink,
    sleeps,
    advance(ms: number): void {
      clock += ms;
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
