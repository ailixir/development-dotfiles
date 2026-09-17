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
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { StepReporter } from '../../src/executor/adapters/StepReporter.js';
import {
  CODE_LOADING_ENV_PREFIXES,
  DEFAULT_CHILD_MODULE_PATH,
  INHERITED_ENV_KEYS,
  assertNoCodeLoadingKeys,
  createChildBrowserLauncher,
  createChildOwnedAdapter,
  isCodeLoadingEnvKey,
} from '../../src/run/launcher.js';
import { parseLaunchMessage } from '../../src/run/protocol.js';
import { SCRATCH_SUBDIRECTORIES } from '../../src/run/scratchLayout.js';
import type { BrowserSession, LaunchOptions } from '../../src/server/adapters.js';
import { packageRoot } from '../helpers/corpus.js';
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
    seekOriginCalibrationMs: 0,
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

  /**
   * AC-6a / SEC-1 — nothing the child inherits may **load code**.
   *
   * `NODE_OPTIONS` was on the allowlist. Node reads `--require`, `--import` and
   * `--experimental-loader` out of it, so one Deployment environment entry plus a readable file ran
   * arbitrary code inside the browser child before `child.js` did — enough to wrap
   * `chromium.launchPersistentContext`, rewrite `chromiumSandbox: true` to `false` and add a
   * disabling flag, with **no diff in this repository** for the lint rule or the repo-wide scan in
   * `test/run/sandbox.test.ts` to catch. §9.3 forbids exactly that: disabling the sandbox silently
   * to make something run.
   *
   * The rule is therefore stated over the *class*, not over the name that was found. A denylist of
   * the variables someone thought of is what failed — `NODE_OPTIONS` was reviewed onto the
   * allowlist by people who knew what it did.
   */
  it('lets no code-loading variable through, as a class rather than by name', async () => {
    const spawner = createFakeSpawner();
    const launcher = launcherWith(spawner, {
      parentEnv: {
        PATH: '/usr/bin',
        HOME: '/home/pwuser',
        PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
        // Set the way a Deployment manifest would set them: every family, all at once.
        NODE_OPTIONS: '--import file:///tmp/preload.mjs',
        NODE_PATH: '/tmp/shim',
        NODE_REPL_EXTERNAL_MODULE: '/tmp/shim.js',
        LD_PRELOAD: '/tmp/shim.so',
        LD_AUDIT: '/tmp/audit.so',
        DYLD_INSERT_LIBRARIES: '/tmp/shim.dylib',
        OPENSSL_CONF: '/tmp/openssl.cnf',
      },
    });
    const pending = launcher.launch(options(scratchPath()));
    const child = spawner.children[0];
    if (child === undefined) throw new Error('the launcher spawned nothing');
    answerReady(child);
    await pending;

    const env = spawner.requests[0]?.env ?? {};
    expect(Object.keys(env).filter((key) => isCodeLoadingEnvKey(key))).toEqual([]);
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.LD_PRELOAD).toBeUndefined();
    expect(env.DYLD_INSERT_LIBRARIES).toBeUndefined();
    // What the child genuinely needs is still there: the rule removed a capability, not the run.
    expect(env.PATH).toBe('/usr/bin');
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe('/ms-playwright');
  });

  it('keeps the allowlist itself free of them, so the list and the class rule agree', () => {
    expect(INHERITED_ENV_KEYS.filter((key) => isCodeLoadingEnvKey(key))).toEqual([]);
    expect(INHERITED_ENV_KEYS).not.toContain('NODE_OPTIONS');
    // Families, not names, so a variable Node or a loader adds later is covered by the namespace
    // it is born into rather than by an amendment nobody remembers to make.
    expect(CODE_LOADING_ENV_PREFIXES.every((prefix) => prefix.endsWith('_'))).toBe(true);
  });

  it('recognises each family, and sweeps up nothing the child actually needs', () => {
    for (const key of [
      'NODE_OPTIONS',
      'NODE_PATH',
      'NODE_REPL_EXTERNAL_MODULE',
      'LD_PRELOAD',
      'LD_AUDIT',
      'LD_LIBRARY_PATH',
      'DYLD_INSERT_LIBRARIES',
      'DYLD_LIBRARY_PATH',
      'OPENSSL_CONF',
      // Case is not a defence: environment lookup is case-insensitive on some platforms.
      'node_options',
    ]) {
      expect(isCodeLoadingEnvKey(key), key).toBe(true);
    }
    for (const key of [
      ...INHERITED_ENV_KEYS,
      'TMPDIR',
      'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD',
    ]) {
      expect(isCodeLoadingEnvKey(key), key).toBe(false);
    }
  });

  /**
   * The falsification. Without it, the assertions above are indistinguishable from a guard that
   * never fires — and the property they defend is one nothing else in the package would notice
   * losing, because losing it changes no behaviour until someone sets the variable.
   */
  it('refuses the launch outright if the allowlist ever regrows one', () => {
    const asBuilt = { PATH: '/usr/bin', TMPDIR: '/scratch/run-1/tmp' };
    expect(() => {
      assertNoCodeLoadingKeys(asBuilt);
    }).not.toThrow();
    // Exactly the environment re-adding NODE_OPTIONS to INHERITED_ENV_KEYS would construct.
    expect(() => {
      assertNoCodeLoadingKeys({ ...asBuilt, NODE_OPTIONS: '--import file:///tmp/preload.mjs' });
    }).toThrow(/NODE_OPTIONS/u);
    expect(() => {
      assertNoCodeLoadingKeys({ ...asBuilt, LD_PRELOAD: '/tmp/shim.so' });
    }).toThrow(/LD_PRELOAD/u);
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

  it('carries the calibration the child reported applying onto the session origin (story 10.32 AC-4)', async () => {
    const spawner = createFakeSpawner();
    const pending = launcherWith(spawner).launch(options(scratchPath()));
    const spawned = spawner.children[0];
    if (spawned === undefined) throw new Error('the launcher spawned nothing');
    spawned.emit({
      kind: 'ready',
      browserStartedAt: '2026-09-11T10:00:00.000Z',
      startedAtMs: 0,
      calibrationOffsetMs: 7,
    });
    const session = await pending;
    expect(session.run?.origin.calibrationOffsetMs).toBe(7);
  });

  it('sends the launch message with the explicitly configured recording geometry', async () => {
    const spawner = createFakeSpawner();
    const path = scratchPath();
    const { child } = await launched(spawner, path);
    expect(child.sent[0]).toMatchObject({
      kind: 'launch',
      browser: 'chromium',
      recording: { width: 1280, height: 720 },
      seekOriginCalibrationMs: 0,
      scratchPath: path,
      totalRuntimeMs: 120_000,
    });
  });

  it('sends a launch message the child’s own parser accepts, carrying the calibration (story 10.32 AC-3)', async () => {
    // The message production sends, read by the parser the child applies. Removing the key from
    // `ACCEPTED_LAUNCH_KEYS` while still sending it makes this an `unknownKey` refusal.
    const spawner = createFakeSpawner();
    const { child } = await launched(spawner, scratchPath());
    const parsed = parseLaunchMessage(child.sent[0]);
    expect(parsed.ok ? [] : parsed.problems).toEqual([]);
    expect(parsed.ok && parsed.message.seekOriginCalibrationMs).toBe(0);
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
    // The reporter throws on every event. Nothing escapes: this runs inside the IPC message
    // handler, and an exception here would surface as an uncaught exception in the **parent** —
    // the process serving /health, /ready and /v1/validate for everything else.
    expect(() => {
      child.emit({ kind: 'step-started', stepIndex: 0, startedAtMs: 3.5 });
    }).not.toThrow();
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

  it('reports a run fault when the child died before anyone asked for a result', async () => {
    // The ordering that hangs if the exit is only *delivered* and never *recorded*: the child is
    // gone before `execute` is called, so there is no listener to hand the failure to. A run that
    // never reports is the state a reaper exists to clean up; the runner must not create one.
    const spawner = createFakeSpawner();
    const { session, child } = await launched(spawner, scratchPath());
    child.end(9);
    const result = await session.run?.execute({
      steps: [],
      variables: {},
      secrets: {},
      reporter: silentReporter(),
    });
    expect(result).toMatchObject({ ok: false, failureKind: 'run-fault' });
    expect(result?.failureMessage).toMatch(/exited before it reported a result/u);
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

/**
 * AC-19 (story 10.13) — the guards that live in this constructor, re-falsified after it changed.
 *
 * Story 10.13 is the change QA's MED-2 predicted ("10.13 is the next change to that constructor"),
 * and it changed two things production depends on: what `stdio` the spawner asks for, and whether
 * the child leads a process group. The guards around those are therefore restated as assertions
 * here rather than assumed to have survived.
 */
describe('AC-19 — this story left the production seams no wider than it found them', () => {
  it('keeps INHERITED_ENV_KEYS **exactly** as it was, as a set and not as a subset', () => {
    // Exact-set, per @po's tightening: an appended key is a red build rather than a passing one.
    // A `toContain` here would let a future story widen the browser child's trust boundary by
    // addition, which is precisely the move SEC-1 was.
    expect([...INHERITED_ENV_KEYS]).toEqual([
      'PATH',
      'HOME',
      'LANG',
      'LC_ALL',
      'PLAYWRIGHT_BROWSERS_PATH',
      'DISPLAY',
      'XDG_RUNTIME_DIR',
    ]);
    expect(INHERITED_ENV_KEYS).toHaveLength(7);
  });

  it('hands the operating system exactly the allowlist plus the two literals, and nothing else', async () => {
    const spawner = createFakeSpawner();
    await launched(spawner, scratchPath());
    // The whole constructed environment, key for key. **Nothing in this story required a new
    // environment variable**; if an implementation had found it needed one, AC-19's instruction
    // was to stop and say so rather than to append here.
    expect(Object.keys(spawner.requests[0]?.env ?? {}).sort()).toEqual(
      ['HOME', 'PATH', 'PLAYWRIGHT_BROWSERS_PATH', 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD', 'TMPDIR'].sort(),
    );
  });

  it('re-checks the constructed environment on every launch, not once at startup', () => {
    // The class guard is stated over what is actually handed to the operating system, so it covers
    // the allowlist and the two literals alike — including a key a future story adds.
    expect(() => {
      assertNoCodeLoadingKeys({ PATH: '/usr/bin', NODE_OPTIONS: '--import x' });
    }).toThrow(/code-loading variables/u);
    expect(() => {
      assertNoCodeLoadingKeys({ PATH: '/usr/bin', TMPDIR: '/scratch/tmp' });
    }).not.toThrow();
  });

  it('asks for piped stdio and its own process group, and still for no interpreter flags', () => {
    // Read off the source of the one function that talks to `fork`. `test/run/production-seams.
    // test.ts` drives the same function with `node:child_process` mocked and asserts `execArgv`
    // and the environment on the actual call; what is asserted here is the pair of options this
    // story changed, side by side with the one it must not have.
    const source = readFileSync(join(packageRoot, 'src', 'run', 'launcher.ts'), 'utf8');
    // `inherit` is gone: §9.2 requires scrubbing every outbound diagnostic *before persistence*,
    // and a pod log is persistence (AC-8).
    expect(source).toContain("stdio: ['ignore', 'pipe', 'pipe', 'ipc']");
    expect(source).not.toContain("'inherit'");
    // The child leads its own group. Necessary but, as the fixtures tier established, not
    // sufficient — Playwright starts the browser in a group of its own, so `src/run/tree.ts`
    // enumerates. Asserted here so a future removal of `detached` is visible.
    expect(source).toContain('detached: true');
    // Unchanged, and it is the other half of the environment allowlist (SEC-1).
    expect(source).toContain('execArgv: []');
  });

  it('never disables the sandbox, and adds no key, field or path that could', () => {
    // Comments are stripped first, exactly as `test/run/sandbox.test.ts`'s repo-wide scan does:
    // a source file is allowed to *name* a disabling flag in order to say it must never appear,
    // and a scan that could not tell the two apart would be one nobody could write around.
    const executable = (path: string): string =>
      readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .split('\n')
        .map((line) => line.replace(/(^|[^:])\/\/.*$/u, '$1'))
        .join('\n');

    // Assembled at run time, never written out: `test/run/sandbox.test.ts`'s repo-wide scan reads
    // every file in this package, and a literal here would trip it. Excluding this file from that
    // scan instead would be widening the gate, which is the one thing AC-19 forbids.
    const disablingFlags = [
      ['--no', '-sandbox'].join(''),
      ['--disable-setuid', '-sandbox'].join(''),
      ['--disable-gpu', '-sandbox'].join(''),
    ];

    const browser = executable(join(packageRoot, 'src', 'run', 'browser.ts'));
    expect(browser).toContain('chromiumSandbox: true');
    expect(browser).not.toContain('chromiumSandbox: false');
    for (const flag of disablingFlags) {
      expect(browser, 'the sandbox must never be disabled to make a deadline test run').not.toContain(flag);
    }
    // The three modules this story adds are the obvious place a disabling flag would appear to
    // "make the kill test run". None of them mentions the option at all, which is stronger than
    // setting it correctly: there is no code path through the deadline, the tree or the relay
    // that reaches the sandbox decision.
    for (const file of ['launcher.ts', 'tree.ts', 'deadline.ts', 'outputRelay.ts']) {
      const source = executable(join(packageRoot, 'src', 'run', file));
      expect(source, file).not.toContain('chromiumSandbox');
      for (const flag of disablingFlags) expect(source, file).not.toContain(flag);
    }
  });
});
