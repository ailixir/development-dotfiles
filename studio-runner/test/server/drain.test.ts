/**
 * `SIGTERM`, draining, scratch hygiene and the process entry point.
 *
 * AC-12, plus the `main.ts` wiring AC-12 names. The drain sequence is asserted as a sequence:
 * readiness false → refuse new work → in-flight run finishes and reports → listener closed →
 * scratch cleared.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as mainModule from '../../src/main.js';
import { createConfiguredLauncher, main } from '../../src/main.js';
import { resetRuntimeVersionsCache } from '../../src/compat/index.js';
import { ConfigurationError, loadConfig } from '../../src/server/config.js';
import { CONFIG_PREFIX } from '../../src/server/config.js';
import { packageRoot } from '../helpers/corpus.js';
import type { ReportBody } from '../../src/reporting/snapshot.js';
import { createHarness, RUNTIME_VERSIONS, SERVICE_TOKEN, until } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { createFakeBrowserLauncher, get, observedBody, post } from '../helpers/runner.js';
import { createApplication } from '../../src/server/application.js';
import { GuidedOwnership } from '../../src/guided/ownership.js';
import { prepareRecordingScratch } from '../../src/run/recordingScratch.js';
import { testFingerprint, testTls } from '../helpers/guidedTls.js';
import { isWindows } from '../helpers/platform.js';

/** The first drain signal the host wires: what a pod stop (posix) or a Ctrl+C (win32) delivers. */
const DRAIN_SIGNAL = isWindows ? 'SIGINT' : 'SIGTERM';

const tlsFile = (name: string): string => fileURLToPath(new URL(`../fixtures/guided-tls/${name}.fixture`, import.meta.url));

let harness: Harness | null = null;

async function start(options?: Parameters<typeof createHarness>[0]): Promise<Harness> {
  harness = createHarness(options);
  await harness.start();
  return harness;
}

afterEach(async () => {
  await harness?.stop();
  harness = null;
});

describe('AC-12 — SIGTERM drains without abandoning an admitted attempt', () => {
  it('flips readiness false, refuses new work, and lets the in-flight run report', async () => {
    const runner = await start();
    const releaseLaunch = runner.launcher.holdLaunch();
    const admitted = post(runner.port, '/v2/runs', observedBody(), SERVICE_TOKEN);
    await until(() => runner.http.admissionRequests.length === 1);
    expect((await admitted).status).toBe(202);

    const drained = runner.app.drain();

    // Readiness goes false immediately, before the in-flight run has finished.
    const ready = await get(runner.port, '/ready', SERVICE_TOKEN);
    expect(ready.status).toBe(503);
    const rejected = await post(
      runner.port,
      '/v2/runs',
      observedBody({ attemptId: '00000000-0000-4000-8000-000000000321' }),
      SERVICE_TOKEN,
    );
    expect(rejected.status).toBe(503);
    expect((JSON.parse(rejected.body) as { code: string }).code).toBe('RUNNER_DRAINING');
    // Health stays 200 while draining: the process is alive and finishing its work.
    expect((await get(runner.port, '/health', SERVICE_TOKEN)).status).toBe(200);

    releaseLaunch();
    const result = await drained;

    expect(result.completed).toBe(true);
    // The admitted attempt delivered its terminal report; it was not abandoned.
    const finals = runner.http.reportRequests.filter(
      (request) => (JSON.parse(request.body) as ReportBody).kind === 'FINAL',
    );
    expect(finals).toHaveLength(1);
    // Scratch is cleared on the drain path.
    expect(await runner.scratch.list()).toEqual([]);
    expect(runner.scratch.clearAllCount).toBeGreaterThanOrEqual(2);
  });

  it('reports the drain deadline rather than pretending it completed', async () => {
    const runner = await start({ env: { [`${CONFIG_PREFIX}DRAIN_TIMEOUT_MS`]: '5' } });
    const releaseLaunch = runner.launcher.holdLaunch();
    await post(runner.port, '/v2/runs', observedBody(), SERVICE_TOKEN);
    await until(() => runner.app.coordinator.inFlight === 1);

    const result = await runner.app.drain();
    expect(result.completed).toBe(false);
    expect(runner.app.logger.counters.snapshot()['runner.drain.deadline_exceeded']).toBe(1);

    releaseLaunch();
    await until(() => runner.app.coordinator.inFlight === 0);
  });

  it('drains immediately when nothing is in flight', async () => {
    const runner = await start();
    const result = await runner.app.drain();
    expect(result.completed).toBe(true);
    expect(runner.app.pool.draining).toBe(true);
  });

  /**
   * **Not testable here, and not faked.**
   *
   * AC-12's "never by abandoning an admitted attempt silently" is a property of the graceful
   * path. `SIGKILL` skips every line of `drain()`, and no assertion inside this process can
   * observe a process that no longer exists. Recovering an attempt whose runner vanished is the
   * running reaper's job and belongs to story 10.7; writing a test here that appeared to cover it
   * would be worse than having none.
   */
  it.skip('an admitted attempt survives SIGKILL — rests on story 10.7 reapers, not on this suite', () => {
    expect.unreachable("Story 10.7 owns the running reaper that resolves an abandoned attempt.");
  });
});

describe('src/main.ts — process entry point', () => {
  /** A `runtime-versions.json` standing in for the one the build embeds in the image. */
  function runtimeVersionsFile(): string {
    const directory = mkdtempSync(join(tmpdir(), 'studio-runner-versions-'));
    const file = join(directory, 'runtime-versions.json');
    writeFileSync(file, JSON.stringify(RUNTIME_VERSIONS), 'utf8');
    resetRuntimeVersionsCache();
    return file;
  }

  const validEnv = (): Record<string, string> => ({
    [`${CONFIG_PREFIX}PORT`]: '0',
    [`${CONFIG_PREFIX}HOST`]: '127.0.0.1',
    [`${CONFIG_PREFIX}SERVICE_IDENTITY`]: SERVICE_TOKEN,
    [`${CONFIG_PREFIX}CALLBACK_IDENTITY`]: 'outbound',
    [`${CONFIG_PREFIX}CALLBACK_BASE_URL`]: 'https://api.internal.example',
    [`${CONFIG_PREFIX}SCRATCH_DIR`]: join(tmpdir(), 'studio-runner-main-test'),
    // The one listener is TLS in every deployment (STUDIO-OBS-009 AC-3): the four listener keys are required.
    [`${CONFIG_PREFIX}TLS_KEY_FILE`]: tlsFile('key'),
    [`${CONFIG_PREFIX}TLS_CERT_FILE`]: tlsFile('cert'),
    [`${CONFIG_PREFIX}TLS_CA_FILE`]: tlsFile('cert'),
    [`${CONFIG_PREFIX}CONTROLLER_CERTIFICATE_FINGERPRINT256`]: testFingerprint,
    // Allow-all is ON when unset (the default for now) and would add a WARN line to the startup output these tests count.
    [`${CONFIG_PREFIX}ALLOW_ALL_DOMAINS`]: 'false',
  });

  it('starts, listens and wires SIGTERM and SIGINT to the drain path', async () => {
    const signals: string[] = [];
    const handlers = new Map<string, () => void>();
    const result = await main({
      env: validEnv(),
      onSignal: (signal, handler) => {
        signals.push(signal);
        handlers.set(signal, handler);
      },
      write: () => undefined,
      setExitCode: () => undefined,
      launcher: createFakeBrowserLauncher(),
      runtimeVersionsFile: runtimeVersionsFile(),
    });

    expect(result.started).toBe(true);
    expect(result.port).toBeGreaterThan(0);
    // The host's drain signals (ADR-SC-009): posix SIGTERM and SIGINT; win32 has no SIGTERM to receive.
    expect(signals).toEqual(isWindows ? ['SIGINT', 'SIGBREAK', 'SIGHUP'] : ['SIGTERM', 'SIGINT']);

    handlers.get(DRAIN_SIGNAL)?.();
    // Repeated signals do not start a second drain.
    handlers.get(DRAIN_SIGNAL)?.();
    await until(() => result.application?.pool.draining === true);
    await result.application?.drain();
  });

  it('refuses to start on a rejected configuration and exits non-zero', async () => {
    const lines: string[] = [];
    let exitCode: number | null = null;
    const result = await main({
      env: { ...validEnv(), [`${CONFIG_PREFIX}DATABASE_URL`]: 'postgres://db.internal/checks' },
      onSignal: () => undefined,
      write: (line) => lines.push(line),
      setExitCode: (code) => {
        exitCode = code;
      },
      launcher: createFakeBrowserLauncher(),
      runtimeVersionsFile: runtimeVersionsFile(),
    });

    expect(result.started).toBe(false);
    expect(exitCode).toBe(78);
    expect(lines.join('\n')).toContain(`${CONFIG_PREFIX}DATABASE_URL`);
    // The value is never echoed into the startup output.
    expect(lines.join('\n')).not.toContain('postgres://db.internal/checks');
  });

  it('defaults to the real Chromium launcher and the embedded runtime versions', async () => {
    // No launcher supplied: the process still starts, and an admitted run would spawn the real
    // browser child. Nothing is launched here — the assertion is that startup wires a launcher
    // and does not fall back to a placeholder (10.12 AC-1).
    const result = await main({
      env: validEnv(),
      onSignal: () => undefined,
      write: () => undefined,
      setExitCode: () => undefined,
      runtimeVersionsFile: runtimeVersionsFile(),
    });
    expect(result.started).toBe(true);
    await result.application?.drain();
  });

  it('refuses to start where the process table cannot be read, before it listens (WP16)', async () => {
    // An image that lost `ps`: `readProcessTable` answers `[]`, and every tree kill would have
    // quietly become a kill of the fork alone.
    const lines: string[] = [];
    let exitCode: number | null = null;
    const result = await main({
      env: validEnv(),
      onSignal: () => {
        throw new Error('a refused start must not wire the drain');
      },
      write: (line) => lines.push(line),
      setExitCode: (code) => {
        exitCode = code;
      },
      launcher: createFakeBrowserLauncher(),
      runtimeVersionsFile: runtimeVersionsFile(),
      processTable: () => [],
    });

    expect(result).toEqual({ started: false });
    expect(exitCode).toBe(mainModule.PROCESS_TABLE_EXIT_CODE);
    expect(lines).toEqual([mainModule.PROCESS_TABLE_UNREADABLE]);
  });

  it('starts when the process table lists this process', async () => {
    const result = await main({
      env: validEnv(),
      onSignal: () => undefined,
      write: () => undefined,
      setExitCode: () => undefined,
      launcher: createFakeBrowserLauncher(),
      runtimeVersionsFile: runtimeVersionsFile(),
      processTable: () => [{ pid: process.pid, ppid: process.ppid }],
    });
    expect(result.started).toBe(true);
    await result.application?.drain();
  });

  it('AC-4: a runner started with STUDIO_RUNNER_VAULT_ADDRESS fails startup, names the key and never the value', async () => {
    const lines: string[] = [];
    let exitCode: number | null = null;
    const result = await main({
      env: { ...validEnv(), [`${CONFIG_PREFIX}VAULT_ADDRESS`]: 'https://vault.canary.internal:8200' },
      onSignal: () => {
        throw new Error('a refused start must not wire the drain');
      },
      write: (line) => lines.push(line),
      setExitCode: (code) => {
        exitCode = code;
      },
      launcher: createFakeBrowserLauncher(),
      runtimeVersionsFile: runtimeVersionsFile(),
    });
    expect(result).toEqual({ started: false });
    expect(exitCode).toBe(78);
    expect(lines.join('\n')).toContain(`${CONFIG_PREFIX}VAULT_ADDRESS`);
    expect(lines.join('\n')).not.toContain('vault.canary');
  });

  it('a listener that cannot bind ends with one closed line and exit 1, never a stack', async () => {
    const holder = createNetServer();
    await new Promise<void>((resolve) => { holder.listen(0, '127.0.0.1', resolve); });
    const taken = (holder.address() as AddressInfo).port;
    const lines: string[] = [];
    let exitCode: number | null = null;
    try {
      const result = await main({
        env: { ...validEnv(), [`${CONFIG_PREFIX}PORT`]: String(taken) },
        onSignal: () => {
          throw new Error('a failed start must not wire the drain');
        },
        write: (line) => lines.push(line),
        setExitCode: (code) => {
          exitCode = code;
        },
        launcher: createFakeBrowserLauncher(),
        runtimeVersionsFile: runtimeVersionsFile(),
      });
      expect(result).toEqual({ started: false });
      expect(exitCode).toBe(1);
      expect(lines).toEqual([mainModule.RUNNER_START_FAILED]);
    } finally {
      await new Promise<void>((resolve) => { holder.close(() => { resolve(); }); });
    }
  });

  it('does not launder a programming fault into a configuration exit code', async () => {
    // `loadConfig` contracts to throw only ConfigurationError. An environment whose own key
    // enumeration throws produces something else, and `main` must let it propagate rather than
    // report "the deployment mis-configured the pod".
    const hostile = new Proxy(
      {},
      {
        ownKeys(): never {
          throw new TypeError('environment enumeration failed');
        },
      },
    ) as Record<string, string | undefined>;

    let exitCode: number | null = null;
    await expect(
      main({
        env: hostile,
        onSignal: () => undefined,
        write: () => undefined,
        setExitCode: (code) => {
          exitCode = code;
        },
        launcher: createFakeBrowserLauncher(),
        runtimeVersionsFile: runtimeVersionsFile(),
      }),
    ).rejects.toThrow(TypeError);
    expect(exitCode).toBeNull();
    expect(new ConfigurationError(['x'])).toBeInstanceOf(Error);
  });

  /**
   * Story 10.12 removed `UNAVAILABLE_LAUNCHER` and wired the real Chromium child in its place
   * (AC-1). What 10.6 asserted — that the default launcher is *something definite* rather than a
   * silent success — still holds, and is now asserted of the real one: it is built from
   * configuration, and the recording geometry it is given is an explicitly configured value
   * rather than a library default (§6.1, AC-7).
   */
  it('builds the real Chromium launcher from configuration, with no unavailable placeholder', () => {
    const config = loadConfig(validEnv());
    expect(config.recordingWidth).toBe(1280);
    expect(config.recordingHeight).toBe(720);
    expect(typeof createConfiguredLauncher(config).launch).toBe('function');

    // Removed, not merely unused: the entry point exports no refusing placeholder any more, and
    // no declaration of one survives. (The module's own comment says where it went, which is why
    // this reads the declaration rather than grepping for the word.)
    expect(Object.keys(mainModule)).not.toContain('UNAVAILABLE_LAUNCHER');
    const source = readFileSync(join(packageRoot, 'src', 'main.ts'), 'utf8');
    expect(source).not.toMatch(/export const UNAVAILABLE_LAUNCHER/u);
    expect(source).not.toMatch(/BROWSER_LAUNCH_UNAVAILABLE:/u);
  });
});

/**
 * STUDIO-OBS-009 D1-T2 (ruling Q5): the guided half and the replay half are one drain. They run
 * concurrently, after `pool.beginDrain()` and before the listener closes; an unconfirmed guided stop
 * is exit code 1 and a clean one is 0; the replay half's own result and code do not change.
 */
describe('STUDIO-OBS-009 AC-1 — one SIGTERM drain for both halves', () => {
  const dirs: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function guidedApplication() {
    const root = mkdtempSync(join(tmpdir(), 'studio-runner-drain-'));
    dirs.push(root);
    const config = loadConfig({
      [`${CONFIG_PREFIX}PORT`]: '0',
      [`${CONFIG_PREFIX}HOST`]: '127.0.0.1',
      [`${CONFIG_PREFIX}SERVICE_IDENTITY`]: SERVICE_TOKEN,
      [`${CONFIG_PREFIX}CALLBACK_IDENTITY`]: 'outbound',
      [`${CONFIG_PREFIX}CALLBACK_BASE_URL`]: 'https://api.internal.example',
      [`${CONFIG_PREFIX}SCRATCH_DIR`]: join(root, 'scratch'),
      [`${CONFIG_PREFIX}OBJECT_STORE_DIR`]: join(root, 'objects'),
    });
    const journalDirectory = join(root, 'journal');
    const app = createApplication(config, {
      listener: { tls: testTls, controllerCertificateFingerprint256: testFingerprint },
      guided: {
        workerId: 'worker-one',
        capacity: 1,
        journalDirectory,
        controllerJwt: { issuer: 'fixture-issuer', subject: 'controller', publicKey: testTls.cert.toString() },
        callbackBaseUrl: 'https://127.0.0.1:9',
        callbackToken: () => Promise.resolve('token'),
        launch: () => Promise.reject(new Error('no browser in the drain test')),
        recordingScratch: await prepareRecordingScratch({ workerId: 'worker-one', journalDirectory, evidenceRoot: root }),
      },
      launcher: createFakeBrowserLauncher(),
      runtimeVersions: {},
      logSink: { write: () => undefined },
    });
    await app.start();
    return app;
  }

  const settled = async (promise: Promise<unknown>): Promise<boolean> => {
    let done = false;
    void promise.then(() => { done = true; }, () => { done = true; });
    for (let tick = 0; tick < 20; tick += 1) await new Promise<void>((resolve) => { setImmediate(resolve); });
    return done;
  };

  it('starts the guided stop while the replay half is still waiting, and finishes only when both are done', async () => {
    const app = await guidedApplication();
    let releaseReplay: (completed: boolean) => void = () => undefined;
    let releaseGuided: () => void = () => undefined;
    vi.spyOn(app.coordinator, 'awaitInFlight').mockImplementation(
      () => new Promise<boolean>((resolve) => { releaseReplay = resolve; }),
    );
    const guidedClose = vi.spyOn(GuidedOwnership.prototype, 'close').mockImplementation(
      () => new Promise<void>((resolve) => { releaseGuided = resolve; }),
    );

    const drained = app.drain();
    // Replay is still in flight and the guided close has already begun: they are concurrent.
    expect(app.pool.draining).toBe(true);
    await settled(drained);
    expect(guidedClose).toHaveBeenCalledTimes(1);

    releaseReplay(true);
    expect(await settled(drained)).toBe(false); // the guided half still holds the drain open
    expect(app.server.raw.listening).toBe(true); // and the listener is closed only after both halves

    releaseGuided();
    expect(await drained).toEqual({ completed: true, guidedClosed: true });
    expect(app.server.raw.listening).toBe(false);
  });

  it('is not held up by a replay run that is still reporting when the guided stop finishes first', async () => {
    const app = await guidedApplication();
    let releaseReplay: (completed: boolean) => void = () => undefined;
    vi.spyOn(app.coordinator, 'awaitInFlight').mockImplementation(
      () => new Promise<boolean>((resolve) => { releaseReplay = resolve; }),
    );
    vi.spyOn(GuidedOwnership.prototype, 'close').mockResolvedValue(undefined);
    const drained = app.drain();
    expect(await settled(drained)).toBe(false);
    releaseReplay(true);
    expect(await drained).toEqual({ completed: true, guidedClosed: true });
  });

  it('reports an unconfirmed guided stop as guidedClosed false, still closes the listener, and leaves the replay result alone', async () => {
    const app = await guidedApplication();
    vi.spyOn(GuidedOwnership.prototype, 'close').mockRejectedValue(new Error('CONTEXT_LOST'));
    const result = await app.drain();
    expect(result).toEqual({ completed: true, guidedClosed: false });
    expect(app.server.raw.listening).toBe(false);
    expect(app.logger.counters.snapshot()['runner.guided.close.unconfirmed']).toBe(1);
  });

  it('a runner without guided mode reports guidedClosed true and never touches guided ownership', async () => {
    const close = vi.spyOn(GuidedOwnership.prototype, 'close');
    const runner = createHarness();
    await runner.start();
    try {
      expect(await runner.app.drain()).toEqual({ completed: true, guidedClosed: true });
      expect(close).not.toHaveBeenCalled();
    } finally {
      await runner.stop();
    }
  });

  it('main turns an unconfirmed guided stop into exit code 1 and a clean one into no code at all', async () => {
    const root = mkdtempSync(join(tmpdir(), 'studio-runner-main-drain-'));
    dirs.push(root);
    writeFileSync(join(root, 'token'), 'token', 'utf8');
    const env = {
      [`${CONFIG_PREFIX}PORT`]: '0',
      [`${CONFIG_PREFIX}HOST`]: '127.0.0.1',
      [`${CONFIG_PREFIX}SERVICE_IDENTITY`]: SERVICE_TOKEN,
      [`${CONFIG_PREFIX}CALLBACK_IDENTITY`]: 'outbound',
      [`${CONFIG_PREFIX}CALLBACK_BASE_URL`]: 'https://api.internal.example',
      [`${CONFIG_PREFIX}SCRATCH_DIR`]: join(root, 'scratch'),
      [`${CONFIG_PREFIX}OBJECT_STORE_DIR`]: join(root, 'objects'),
      [`${CONFIG_PREFIX}TLS_KEY_FILE`]: tlsFile('key'),
      [`${CONFIG_PREFIX}TLS_CERT_FILE`]: tlsFile('cert'),
      [`${CONFIG_PREFIX}TLS_CA_FILE`]: tlsFile('cert'),
      [`${CONFIG_PREFIX}CONTROLLER_CERTIFICATE_FINGERPRINT256`]: testFingerprint,
      [`${CONFIG_PREFIX}GUIDED_ENABLED`]: 'true',
      [`${CONFIG_PREFIX}GUIDED_WORKER_ID`]: 'worker-one',
      [`${CONFIG_PREFIX}GUIDED_JOURNAL_DIR`]: join(root, 'journal'),
      [`${CONFIG_PREFIX}GUIDED_CONTROLLER_ISSUER`]: 'fixture-issuer',
      [`${CONFIG_PREFIX}GUIDED_CONTROLLER_SUBJECT`]: 'controller',
      [`${CONFIG_PREFIX}GUIDED_CONTROLLER_PUBLIC_KEY_FILE`]: tlsFile('cert'),
      [`${CONFIG_PREFIX}GUIDED_CALLBACK_BASE_URL`]: 'https://127.0.0.1:9',
      [`${CONFIG_PREFIX}GUIDED_CALLBACK_TOKEN_FILE`]: join(root, 'token'),
      [`${CONFIG_PREFIX}GUIDED_CAPACITY`]: '1',
    };
    for (const unconfirmed of [true, false]) {
      vi.restoreAllMocks();
      vi.spyOn(GuidedOwnership.prototype, 'close').mockImplementation(() => (unconfirmed ? Promise.reject(new Error('CONTEXT_LOST')) : Promise.resolve()));
      const handlers = new Map<string, () => void>();
      let exitCode: number | null = null;
      const result = await main({
        env,
        onSignal: (signal, handler) => { handlers.set(signal, handler); },
        write: () => undefined,
        setExitCode: (code) => { exitCode = code; },
        launcher: createFakeBrowserLauncher(),
        runtimeVersionsFile: (() => { const file = join(root, 'runtime-versions.json'); writeFileSync(file, JSON.stringify(RUNTIME_VERSIONS), 'utf8'); resetRuntimeVersionsCache(); return file; })(),
        guidedSeams: {
          assertBuild: () => undefined,
          launchTree: () => true,
          launch: () => Promise.reject(new Error('no browser')),
          sweep: (options) => prepareRecordingScratch({ ...options, evidenceRoot: root }),
        },
      });
      expect(result.started).toBe(true);
      handlers.get(DRAIN_SIGNAL)?.();
      await until(() => result.application?.pool.draining === true);
      await until(() => !(result.application?.server.raw.listening ?? true));
      await until(() => exitCode === (unconfirmed ? 1 : null) && result.application?.server.raw.listening === false);
      expect(exitCode).toBe(unconfirmed ? 1 : null);
    }
  });
});
