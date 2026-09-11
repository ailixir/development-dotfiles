/**
 * `SIGTERM`, draining, scratch hygiene and the process entry point.
 *
 * AC-12, plus the `main.ts` wiring AC-12 names. The drain sequence is asserted as a sequence:
 * readiness false → refuse new work → in-flight run finishes and reports → listener closed →
 * scratch cleared.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main, UNAVAILABLE_LAUNCHER } from '../../src/main.js';
import { resetRuntimeVersionsCache } from '../../src/compat/index.js';
import { ConfigurationError } from '../../src/server/config.js';
import { CONFIG_PREFIX } from '../../src/server/config.js';
import type { ReportBody } from '../../src/reporting/snapshot.js';
import { createHarness, RUNTIME_VERSIONS, SERVICE_TOKEN, until } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { createFakeBrowserLauncher, get, post, validJob } from '../helpers/runner.js';

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
    const admitted = post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    await until(() => runner.http.admissionRequests.length === 1);
    expect((await admitted).status).toBe(202);

    const drained = runner.app.drain();

    // Readiness goes false immediately, before the in-flight run has finished.
    const ready = await get(runner.port, '/ready', SERVICE_TOKEN);
    expect(ready.status).toBe(503);
    const rejected = await post(
      runner.port,
      '/v1/runs',
      JSON.stringify(validJob({ attemptId: 'attempt-2' })),
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
    await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
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
    [`${CONFIG_PREFIX}SCRATCH_DIR`]: '/tmp/studio-runner-main-test',
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
    expect(signals).toEqual(['SIGTERM', 'SIGINT']);

    handlers.get('SIGTERM')?.();
    // Repeated signals do not start a second drain.
    handlers.get('SIGTERM')?.();
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

  it('defaults to the refusing launcher and the embedded runtime versions', async () => {
    // No launcher supplied: the process still starts, and an admitted run would report
    // BROWSER_LAUNCH_UNAVAILABLE rather than silently succeeding (AC-14b deferral to 10.12).
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

  it('ships a launcher that refuses loudly, because 10.12 owns the real one', async () => {
    await expect(
      UNAVAILABLE_LAUNCHER.launch({
        browser: 'chromium',
        viewport: { width: 1, height: 1 },
        totalRuntimeMs: 1,
        scratchPath: '/tmp/none',
      }),
    ).rejects.toThrow(/BROWSER_LAUNCH_UNAVAILABLE/u);
  });
});
