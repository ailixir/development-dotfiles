/**
 * AC-1, AC-5, AC-16, AC-21 — the parent half of the killable child.
 *
 * The spawn seam is injected, so everything here runs without a process and without a browser:
 * what the operating system would have been handed (module, arguments, environment), what crosses
 * the IPC channel, how step events reach 10.6's `RunReporter`, and what happens on each way out.
 *
 * The canary assertions are the ones AC-21 asks to be made *on the spawn arguments actually
 * passed* — which is only checkable if the spawn is a seam rather than an inline statement.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { StepReporter } from '../../src/executor/adapters/StepReporter.js';
import {
  DEFAULT_CHILD_MODULE_PATH,
  INHERITED_ENV_KEYS,
  createChildBrowserLauncher,
  createChildOwnedAdapter,
} from '../../src/run/launcher.js';
import { SCRATCH_SUBDIRECTORIES } from '../../src/run/scratchLayout.js';
import type { BrowserSession, LaunchOptions } from '../../src/server/adapters.js';
import { createFakeSpawner } from '../helpers/child.js';
import type { FakeChildProcess, FakeSpawner } from '../helpers/child.js';

const CANARY = 'canary-secret-value';

const scratchRoots: string[] = [];

function scratchPath(): string {
  const root = mkdtempSync(join(tmpdir(), 'studio-runner-launcher-'));
  scratchRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of scratchRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function launcherWith(spawner: FakeSpawner, overrides: Record<string, unknown> = {}) {
  return createChildBrowserLauncher({
    recording: { width: 1280, height: 720 },
    stepTimeoutMs: 30_000,
    launchTimeoutMs: 50,
    maxFailureMessageLength: 400,
    stopTimeoutMs: 20,
    spawner,
    childModulePath: '/dist/run/child.js',
    parentEnv: {
      PATH: '/usr/bin',
      HOME: '/home/pwuser',
      PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
      STUDIO_RUNNER_CALLBACK_IDENTITY: 'outbound-service-identity',
      STUDIO_RUNNER_SERVICE_IDENTITY: 'inbound-service-identity',
      AWS_SECRET_ACCESS_KEY: CANARY,
    },
    ...overrides,
  });
}

function options(path: string): LaunchOptions {
  return {
    browser: 'chromium',
    viewport: { width: 1280, height: 720 },
    totalRuntimeMs: 120_000,
    scratchPath: path,
  };
}

/** Answers the launch handshake as a healthy child would. */
function answerReady(child: FakeChildProcess, startedAt = '2026-09-11T10:00:00.000Z'): void {
  child.emit({ kind: 'ready', browserStartedAt: startedAt, startedAtMs: 0 });
}

async function launched(spawner: FakeSpawner, path: string): Promise<{
  session: BrowserSession;
  child: FakeChildProcess;
}> {
  const launcher = launcherWith(spawner);
  const pending = launcher.launch(options(path));
  const child = spawner.children[0];
  if (child === undefined) throw new Error('the launcher spawned nothing');
  answerReady(child);
  return { session: await pending, child };
}

describe('AC-21 — nothing job-shaped reaches the command line or the environment', () => {
  it('spawns with no arguments at all', async () => {
    const spawner = createFakeSpawner();
    await launched(spawner, scratchPath());
    // A job value on a command line is visible in `ps` to every process on the host.
    expect(spawner.requests[0]?.args).toEqual([]);
    expect(spawner.requests[0]?.modulePath).toBe('/dist/run/child.js');
  });

  it('builds the child environment from an allowlist, not from process.env', async () => {
    const spawner = createFakeSpawner();
    await launched(spawner, scratchPath());
    const env = spawner.requests[0]?.env ?? {};

    expect(env.PATH).toBe('/usr/bin');
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe('/ms-playwright');
    // The browser process holds no runner configuration and no service identity, which is the
    // same posture §9.2 takes toward credentials.
    expect(Object.keys(env).some((key) => key.startsWith('STUDIO_RUNNER_'))).toBe(false);
    expect(JSON.stringify(env)).not.toContain(CANARY);
    expect(Object.keys(env).sort()).toEqual(
      [
        ...INHERITED_ENV_KEYS.filter((key) => key in (spawner.requests[0]?.env ?? {})),
        'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD',
        'TMPDIR',
      ].sort(),
    );
  });

  it('points the browser’s temporary output at the per-run scratch directory', async () => {
    const spawner = createFakeSpawner();
    const path = scratchPath();
    await launched(spawner, path);
    expect(spawner.requests[0]?.env.TMPDIR).toBe(join(path, SCRATCH_SUBDIRECTORIES.temp));
  });

  it('carries resolved values over the IPC channel and only there', async () => {
    const spawner = createFakeSpawner();
    const path = scratchPath();
    const { session, child } = await launched(spawner, path);

    const run = session.run;
    expect(run).toBeDefined();
    const pending = run?.execute({
      steps: [{ stepIndex: 0, operations: [] }],
      variables: {},
      secrets: { PW: CANARY },
      reporter: silentReporter(),
    });
    child.emit({
      kind: 'result',
      ok: true,
      executorVersion: '1.0.0',
      failureKind: null,
      failureMessage: null,
      recording: { path: null, bytes: null, error: null, state: 'UNAVAILABLE' },
      observedHosts: [],
    });
    child.end();
    await pending;

    // Present on the channel — the page needs the value — and absent everywhere a bystander could
    // read it.
    const execute = child.sent.find((message) => message.kind === 'execute');
    expect(JSON.stringify(execute)).toContain(CANARY);
    expect(JSON.stringify(spawner.requests[0])).not.toContain(CANARY);
  });
});

describe('AC-1, AC-20 — launch resolving means Chromium started', () => {
  it('waits for the child’s ready before resolving, and carries the paired reads', async () => {
    const spawner = createFakeSpawner();
    const launcher = launcherWith(spawner);
    const pending = launcher.launch(options(scratchPath()));

    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    // Spawned, but not started: the promise is still open.
    expect(spawner.children).toHaveLength(1);
    expect(settled).toBe(false);

    const spawned = spawner.children[0];
    if (spawned === undefined) throw new Error('the launcher spawned nothing');
    answerReady(spawned);
    const session = await pending;
    expect(session.run?.origin.browserStartedAt.toISOString()).toBe('2026-09-11T10:00:00.000Z');
    expect(session.run?.origin.startedAtMs).toBe(0);
    // The readings are taken on the child's clock and pass through unchanged; the parent never
    // re-derives an origin (ADR-002 §11.5).
    expect(session.run?.origin.clock).toBeNull();
  });

  it('sends the launch message with the explicitly configured recording geometry', async () => {
    const spawner = createFakeSpawner();
    const path = scratchPath();
    const { child } = await launched(spawner, path);
    expect(child.sent[0]).toMatchObject({
      kind: 'launch',
      browser: 'chromium',
      recording: { width: 1280, height: 720 },
      scratchPath: path,
      totalRuntimeMs: 120_000,
    });
  });

  it('fails the launch when the child never reports a start', async () => {
    const spawner = createFakeSpawner();
    const launcher = launcherWith(spawner);
    await expect(launcher.launch(options(scratchPath()))).rejects.toThrow(/did not start within/u);
    expect(spawner.children[0]?.killed).toBe(1);
  });

  it('fails the launch when the child exits before reporting a start', async () => {
    const spawner = createFakeSpawner();
    const launcher = launcherWith(spawner);
    const pending = launcher.launch(options(scratchPath()));
    spawner.children[0]?.end(1);
    await expect(pending).rejects.toThrow(/exited before it reported a start/u);
  });

  it('classifies a sandbox failure reported before ready', async () => {
    const spawner = createFakeSpawner();
    const launcher = launcherWith(spawner);
    const pending = launcher.launch(options(scratchPath()));
    spawner.children[0]?.emit({
      kind: 'result',
      ok: false,
      executorVersion: '',
      failureKind: 'sandbox-unavailable',
      failureMessage: 'No usable sandbox!',
      recording: { path: null, bytes: null, error: null, state: 'UNAVAILABLE' },
      observedHosts: [],
    });
    await expect(pending).rejects.toMatchObject({ failureKind: 'sandbox-unavailable' });
  });
});

describe('AC-16 — step events reach 10.6’s reporter, across the process boundary', () => {
  it('forwards the executor’s outcomes unchanged, null timings included', async () => {
    const spawner = createFakeSpawner();
    const { session, child } = await launched(spawner, scratchPath());
    const started: unknown[] = [];
    const finished: unknown[] = [];
    const reporter: StepReporter = {
      stepStarted: (event) => started.push(event),
      stepFinished: (event) => finished.push(event),
    };

    const pending = session.run?.execute({
      steps: [{ stepIndex: 0, operations: [] }],
      variables: {},
      secrets: {},
      reporter,
    });

    child.emit({ kind: 'step-started', stepIndex: 0, startedAtMs: 1.25 });
    child.emit({
      kind: 'step-finished',
      stepIndex: 0,
      status: 'FAIL',
      startedAtMs: 1.25,
      finishedAtMs: 9.5,
      durationMs: 8.25,
      failure: 'AssertionFailed: nope',
    });
    child.emit({
      kind: 'step-finished',
      stepIndex: 1,
      status: 'SKIPPED',
      startedAtMs: null,
      finishedAtMs: null,
      durationMs: null,
      failure: null,
    });
    child.emit({
      kind: 'result',
      ok: false,
      executorVersion: '1.0.0',
      failureKind: 'step',
      failureMessage: null,
      recording: { path: '/video.webm', bytes: 4096, error: null, state: 'PENDING' },
      observedHosts: ['127.0.0.1:8123'],
    });
    child.end();
    const result = await pending;

    expect(started).toEqual([{ stepIndex: 0, startedAtMs: 1.25 }]);
    expect(finished).toHaveLength(2);
    expect(finished[1]).toMatchObject({ status: 'SKIPPED', startedAtMs: null, durationMs: null });
    expect(result).toMatchObject({ ok: false, failureKind: 'step' });
    expect(result?.observedHosts).toEqual(['127.0.0.1:8123']);
  });

  it('a slow or failing reporter cannot block or alter a step', async () => {
    const spawner = createFakeSpawner();
    const { session, child } = await launched(spawner, scratchPath());
    const seen: number[] = [];
    const reporter: StepReporter = {
      stepStarted(event): void {
        seen.push(event.startedAtMs);
        throw new Error('the callback is having a bad day');
      },
      stepFinished(): void {
        throw new Error('so is this one');
      },
    };

    const pending = session.run?.execute({
      steps: [{ stepIndex: 0, operations: [] }],
      variables: {},
      secrets: {},
      reporter,
    });
    // The reporter throws on every event; the run still reaches a result, and the readings the
    // child took are the ones that were reported.
    expect(() => {
      child.emit({ kind: 'step-started', stepIndex: 0, startedAtMs: 3.5 });
    }).toThrow();
    child.emit({
      kind: 'result',
      ok: true,
      executorVersion: '1.0.0',
      failureKind: null,
      failureMessage: null,
      recording: { path: null, bytes: null, error: null, state: 'UNAVAILABLE' },
      observedHosts: [],
    });
    child.end();
    expect(await pending).toMatchObject({ ok: true });
    expect(seen).toEqual([3.5]);
  });

  it('reports a run fault when the child exits without a result', async () => {
    const spawner = createFakeSpawner();
    const { session, child } = await launched(spawner, scratchPath());
    const pending = session.run?.execute({
      steps: [],
      variables: {},
      secrets: {},
      reporter: silentReporter(),
    });
    child.end(137);
    expect(await pending).toMatchObject({ ok: false, failureKind: 'run-fault' });
  });
});

describe('AC-5 — the session closes the child on every path', () => {
  it('asks the child to stop and does not kill one that leaves', async () => {
    const spawner = createFakeSpawner();
    const { session, child } = await launched(spawner, scratchPath());
    const closing = session.close();
    child.end();
    await closing;
    expect(child.sent.at(-1)).toEqual({ kind: 'stop' });
    expect(child.killed).toBe(0);
  });

  it('kills a child that ignores stop', async () => {
    const spawner = createFakeSpawner();
    const { session, child } = await launched(spawner, scratchPath());
    await session.close();
    expect(child.killed).toBe(1);
  });

  it('is idempotent, so close after execute does not stop twice', async () => {
    const spawner = createFakeSpawner();
    const { session, child } = await launched(spawner, scratchPath());
    const pending = session.run?.execute({
      steps: [],
      variables: {},
      secrets: {},
      reporter: silentReporter(),
    });
    child.emit({
      kind: 'result',
      ok: true,
      executorVersion: '1.0.0',
      failureKind: null,
      failureMessage: null,
      recording: { path: null, bytes: null, error: null, state: 'UNAVAILABLE' },
      observedHosts: [],
    });
    child.end();
    await pending;
    await session.close();
    expect(child.sent.filter((message) => message.kind === 'stop')).toHaveLength(1);
  });
});

describe('AC-1 — the parent does not drive the adapter of a child-owned session', () => {
  it('keeps the BrowserSession shape and refuses with the reason, not silently', async () => {
    const spawner = createFakeSpawner();
    const { session } = await launched(spawner, scratchPath());
    // It throws synchronously, which is what a caller wants: the mistake surfaces at the call
    // site rather than as an unhandled rejection somewhere downstream.
    expect(() => session.adapter.goto('http://127.0.0.1/')).toThrow(/executes in its own process/u);
  });

  it('refuses every method, so no operation is quietly a no-op', async () => {
    const adapter = createChildOwnedAdapter();
    const handle = { kind: 'locator-handle' } as const;
    const calls: Promise<unknown>[] = [
      Promise.resolve().then(() => adapter.locate({ segments: [] })),
      Promise.resolve().then(() => adapter.click(handle)),
      Promise.resolve().then(() => adapter.fill(handle, 'x')),
      Promise.resolve().then(() => adapter.press(handle, 'Enter')),
      Promise.resolve().then(() => adapter.check(handle)),
      Promise.resolve().then(() => adapter.uncheck(handle)),
      Promise.resolve().then(() => adapter.hover(handle)),
      Promise.resolve().then(() => adapter.selectOption(handle, 'x')),
      Promise.resolve().then(() => adapter.expectVisible(handle)),
      Promise.resolve().then(() => adapter.expectContainText(handle, { kind: 'string', value: 'x' })),
      Promise.resolve().then(() => adapter.expectValue(handle, { kind: 'string', value: 'x' })),
      Promise.resolve().then(() => adapter.expectUrl({ kind: 'string', value: 'x' })),
      Promise.resolve().then(() => adapter.expectTitle({ kind: 'string', value: 'x' })),
      Promise.resolve().then(() => adapter.waitForURL({ kind: 'string', value: 'x' })),
    ];
    for (const call of calls) await expect(call).rejects.toThrow(/session\.run\.execute/u);
  });
});

describe('the default child module path points at the compiled entry', () => {
  it('resolves child.js next to the launcher', () => {
    expect(DEFAULT_CHILD_MODULE_PATH.endsWith(join('run', 'child.js'))).toBe(true);
  });
});

function silentReporter(): StepReporter {
  return { stepStarted: () => undefined, stepFinished: () => undefined };
}
