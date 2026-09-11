/**
 * The real `BrowserLauncher`: the parent half of the killable child (AC-1, AC-4, AC-5, AC-20).
 *
 * Story 10.6 shipped `BrowserLauncher` as a seam with a comment naming this story as its
 * supplier, and `src/main.ts` shipped `UNAVAILABLE_LAUNCHER`, which refused every launch. This is
 * the supplier, wired into the **existing** seam: `LaunchOptions` and `BrowserSession` keep their
 * shapes, and the coordinator's ordering — scratch after admission, `STARTED` after the launch
 * resolves — is untouched.
 *
 * ## `launch` resolving means Chromium started
 *
 * Not "a spawn succeeded" and not "a launch call began". The promise settles when the child has
 * started the browser, created the recording context and page, taken the run origin and sent
 * `ready`. That is what makes `browserStartedAt` an observation, and it is why AC-20's assertion —
 * that the observed start is *measurably distinct* from the dispatch instant — is a real one
 * rather than a tautology.
 *
 * ## Nothing job-shaped reaches the command line
 *
 * The child is forked with **no arguments** and a **minimal, enumerated environment**. Resolved
 * variables and secrets travel over the IPC channel and only there: never in `argv`, never in the
 * environment, never in a spawn command line (AC-21). The environment is built from an allowlist
 * rather than inherited from `process.env`, so the runner's own configuration — including its
 * outbound service identity — never enters the process that opens untrusted pages.
 *
 * ## What this story does and does not enforce
 *
 * The *start* deadline is a refusal and belongs to the coordinator (AC-4). The *total runtime*
 * deadline is enforcement and belongs to **10.13**: `totalRuntimeMs` is passed through to the
 * child, the child is a separate process with a pid, and `close` already has the ordered path and
 * the fallback kill it will need. Nothing here kills a hung tree, and nothing here pretends to.
 */

import { fork } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserAdapter } from '../executor/adapters/BrowserAdapter.js';
import type {
  BrowserLauncher,
  BrowserSession,
  LaunchOptions,
  SessionRunRequest,
  SessionRunResult,
} from '../server/adapters.js';
import { SCRATCH_SUBDIRECTORIES } from './scratchLayout.js';
import type { ChildMessage, ParentMessage, ProtocolStep } from './protocol.js';
import { PROTOCOL_VERSION, parseChildMessage } from './protocol.js';

/** A spawned child, reduced to what the launcher needs. Injected so the unit tier spawns none. */
export interface ChildProcessHandle {
  send(message: ParentMessage): void;
  onMessage(listener: (value: unknown) => void): void;
  onExit(listener: (code: number | null, signal: string | null) => void): void;
  kill(): void;
  readonly pid: number | null;
}

/** Exactly what is handed to the operating system. Asserted verbatim by AC-21's spawn test. */
export interface ChildSpawnRequest {
  readonly modulePath: string;
  /** Always empty. A job value on a command line is visible in `ps` to every process on the host. */
  readonly args: readonly string[];
  /** Enumerated, never inherited wholesale. */
  readonly env: Readonly<Record<string, string>>;
}

export interface ChildSpawner {
  spawn(request: ChildSpawnRequest): ChildProcessHandle;
}

export interface ChildLauncherOptions {
  /** Explicit recording geometry (§6.1, AC-7). */
  readonly recording: { readonly width: number; readonly height: number };
  /** Per-operation wall-clock bound handed to the adapter (§8.5, 30 s). */
  readonly stepTimeoutMs: number;
  /** Bound on the launch handshake. A child that never reports `ready` is a launch failure. */
  readonly launchTimeoutMs: number;
  readonly maxFailureMessageLength: number;
  readonly spawner?: ChildSpawner | undefined;
  readonly childModulePath?: string | undefined;
  /** Grace given to a child asked to stop before it is killed. */
  readonly stopTimeoutMs?: number | undefined;
  /** Environment the child inherits values from. Defaults to the runner's own process. */
  readonly parentEnv?: Readonly<Record<string, string | undefined>> | undefined;
}

/**
 * Environment variables the child may inherit, by name.
 *
 * `PLAYWRIGHT_BROWSERS_PATH` is how the pinned image tells the library where its browsers live
 * (ADR-001 §4.2); the rest is what a Node process needs to run at all. Nothing in the runner's own
 * `STUDIO_RUNNER_*` namespace is on this list — the browser process holds no runner configuration
 * and no service identity, which is the same posture §9.2 takes toward credentials.
 */
export const INHERITED_ENV_KEYS: readonly string[] = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'NODE_OPTIONS',
  'PLAYWRIGHT_BROWSERS_PATH',
  'DISPLAY',
  'XDG_RUNTIME_DIR',
];

/** Where the compiled child entry sits, relative to this module, once built. */
export const DEFAULT_CHILD_MODULE_PATH = fileURLToPath(new URL('./child.js', import.meta.url));

/**
 * The parent-side `BrowserAdapter` of a child-owned session.
 *
 * `BrowserSession` keeps its 10.6 shape, so a session has an `adapter`. A *real* session's
 * operations run in the child, next to the browser and on the child's run clock — driving them
 * from here would put every reading a round trip away from the thing it measures. Rather than
 * exposing a proxy that looks usable and silently spends the seek budget, this refuses and says
 * which path to use, so a future caller finds out at the first call rather than in a timing
 * report.
 */
export function createChildOwnedAdapter(): BrowserAdapter {
  const refuse = (): never => {
    throw new Error(
      'This session executes in its own process: use `session.run.execute(...)`. Driving the ' +
        'adapter from the parent would take every step reading a round trip away from the ' +
        'browser (ADR-002 §11.6).',
    );
  };
  return {
    goto: refuse,
    waitForURL: refuse,
    locate: refuse,
    click: refuse,
    fill: refuse,
    press: refuse,
    check: refuse,
    uncheck: refuse,
    hover: refuse,
    selectOption: refuse,
    expectVisible: refuse,
    expectContainText: refuse,
    expectValue: refuse,
    expectUrl: refuse,
    expectTitle: refuse,
  };
}

/** The default spawner: `fork`, no arguments, an enumerated environment, an IPC channel. */
export function createForkSpawner(): ChildSpawner {
  return {
    spawn(request: ChildSpawnRequest): ChildProcessHandle {
      const child = fork(request.modulePath, [...request.args], {
        env: { ...request.env },
        // stdout/stderr are inherited so the child's diagnostics reach the pod log; the contract
        // is not a debugging channel and the child writes nothing structured to the wire (§9.2).
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        serialization: 'json',
      });
      return {
        send(message: ParentMessage): void {
          if (child.connected) child.send(message);
        },
        onMessage(listener: (value: unknown) => void): void {
          child.on('message', listener);
        },
        onExit(listener: (code: number | null, signal: string | null) => void): void {
          child.on('exit', listener);
        },
        kill(): void {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        },
        get pid(): number | null {
          return child.pid ?? null;
        },
      };
    },
  };
}

function childEnvironment(
  parentEnv: Readonly<Record<string, string | undefined>>,
  scratchPath: string,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of INHERITED_ENV_KEYS) {
    const value = parentEnv[key];
    if (value !== undefined && value !== '') env[key] = value;
  }
  // Chromium's temporary output follows `TMPDIR` into the per-run scratch directory (AC-22).
  env.TMPDIR = join(scratchPath, SCRATCH_SUBDIRECTORIES.temp);
  // The browsers come from the image; a child must never fetch one at run time (ADR-001 §4.2).
  env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1';
  return env;
}

class LaunchFailure extends Error {
  readonly failureKind: string;

  constructor(failureKind: string, message: string) {
    super(message);
    this.name = 'LaunchFailure';
    this.failureKind = failureKind;
  }
}

export { LaunchFailure };

/**
 * Builds the real launcher.
 *
 * @param options recording geometry, timeouts and the two test seams (spawner, child module).
 */
export function createChildBrowserLauncher(options: ChildLauncherOptions): BrowserLauncher {
  const spawner = options.spawner ?? createForkSpawner();
  const modulePath = options.childModulePath ?? DEFAULT_CHILD_MODULE_PATH;
  const stopTimeoutMs = options.stopTimeoutMs ?? 5_000;
  const parentEnv = options.parentEnv ?? process.env;

  return {
    async launch(launchOptions: LaunchOptions): Promise<BrowserSession> {
      // Chromium's temp directory has to exist before it is pointed at (AC-22).
      mkdirSync(join(launchOptions.scratchPath, SCRATCH_SUBDIRECTORIES.temp), { recursive: true });

      const child = spawner.spawn({
        modulePath,
        // Empty, always. Nothing about the job is visible in a process listing (AC-21).
        args: [],
        env: childEnvironment(parentEnv, launchOptions.scratchPath),
      });

      const inbox = createInbox(child);

      child.send({
        kind: 'launch',
        protocolVersion: PROTOCOL_VERSION,
        runId: launchOptions.scratchPath,
        browser: launchOptions.browser,
        viewport: launchOptions.viewport,
        recording: options.recording,
        scratchPath: launchOptions.scratchPath,
        // Passed on, never enforced here: the total-runtime deadline is 10.13's.
        totalRuntimeMs: launchOptions.totalRuntimeMs,
      });

      const ready = await inbox.awaitReady(options.launchTimeoutMs);
      if (ready.kind !== 'ready') {
        child.kill();
        throw new LaunchFailure(
          ready.failureKind,
          ready.message,
        );
      }

      let stopped = false;
      const stop = async (): Promise<void> => {
        if (stopped) return;
        stopped = true;
        child.send({ kind: 'stop' });
        const exited = await inbox.awaitExit(stopTimeoutMs);
        // 10.13 owns killing a hung process *tree* under a deadline; this is the ordered close
        // path's fallback, so a child that ignores `stop` still cannot outlive its run.
        if (!exited) child.kill();
      };

      return {
        adapter: createChildOwnedAdapter(),
        close: stop,
        run: {
          origin: {
            browserStartedAt: new Date(ready.browserStartedAt),
            startedAtMs: ready.startedAtMs,
            // The readings are taken on the child's clock and pass through unchanged; the parent
            // never re-derives an origin (ADR-002 §11.5).
            clock: null,
          },
          async execute(request: SessionRunRequest): Promise<SessionRunResult> {
            const steps: ProtocolStep[] = request.steps.map((step) => ({
              stepIndex: step.stepIndex,
              operations: [...step.operations],
            }));
            inbox.forwardStepsTo(request.reporter);
            child.send({
              kind: 'execute',
              protocolVersion: PROTOCOL_VERSION,
              stepTimeoutMs: options.stepTimeoutMs,
              steps,
              variables: request.variables,
              secrets: request.secrets,
              maxFailureMessageLength:
                request.maxFailureMessageLength ?? options.maxFailureMessageLength,
            });
            const result = await inbox.awaitResult();
            await stop();
            return {
              ok: result.ok,
              failureKind: result.failureKind,
              failureMessage: result.failureMessage,
              recording: result.recording,
              observedHosts: result.observedHosts,
            };
          },
        },
      };
    },
  };
}

type ReadyOutcome =
  | { readonly kind: 'ready'; readonly browserStartedAt: string; readonly startedAtMs: number }
  | { readonly kind: 'failed'; readonly failureKind: string; readonly message: string };

interface Inbox {
  awaitReady(timeoutMs: number): Promise<ReadyOutcome>;
  awaitResult(): Promise<Extract<ChildMessage, { kind: 'result' }>>;
  awaitExit(timeoutMs: number): Promise<boolean>;
  forwardStepsTo(reporter: SessionRunRequest['reporter']): void;
}

/**
 * Demultiplexes the child's messages.
 *
 * Step events are forwarded **synchronously** to 10.6's `RunReporter` as they arrive, which is
 * what keeps AC-16's property true across the process boundary: the reporter's deliveries are
 * detached, so a slow or failing callback cannot block, delay or alter a step — and now it cannot
 * do so from the other side of a pipe either.
 */
function createInbox(child: ChildProcessHandle): Inbox {
  let reporter: SessionRunRequest['reporter'] | null = null;
  let onReady: ((outcome: ReadyOutcome) => void) | null = null;
  let onResult: ((message: Extract<ChildMessage, { kind: 'result' }>) => void) | null = null;
  let pendingReady: ReadyOutcome | null = null;
  let pendingResult: Extract<ChildMessage, { kind: 'result' }> | null = null;
  let exited = false;
  const exitListeners: (() => void)[] = [];

  child.onExit(() => {
    exited = true;
    for (const listener of exitListeners.splice(0)) listener();
    const failure: ReadyOutcome = {
      kind: 'failed',
      failureKind: 'browser-launch',
      message: 'The browser child process exited before it reported a start.',
    };
    if (pendingReady === null) {
      pendingReady = failure;
      onReady?.(failure);
    }
    if (pendingResult === null && onResult !== null) {
      onResult({
        kind: 'result',
        ok: false,
        executorVersion: '',
        failureKind: 'run-fault',
        failureMessage: 'The browser child process exited before it reported a result.',
        recording: { path: null, bytes: null, error: null, state: 'UNAVAILABLE' },
        observedHosts: [],
      });
      onResult = null;
    }
  });

  child.onMessage((value: unknown) => {
    const message = parseChildMessage(value);
    if (message === null) return;
    switch (message.kind) {
      case 'ready': {
        const outcome: ReadyOutcome = {
          kind: 'ready',
          browserStartedAt: message.browserStartedAt,
          startedAtMs: message.startedAtMs,
        };
        pendingReady ??= outcome;
        onReady?.(outcome);
        return;
      }
      case 'step-started':
        reporter?.stepStarted({
          stepIndex: message.stepIndex,
          startedAtMs: message.startedAtMs,
        });
        return;
      case 'step-finished':
        reporter?.stepFinished({
          stepIndex: message.stepIndex,
          status: message.status,
          startedAtMs: message.startedAtMs,
          finishedAtMs: message.finishedAtMs,
          durationMs: message.durationMs,
          failure: message.failure,
        });
        return;
      case 'result':
        if (pendingReady === null) {
          // A result before `ready` is a launch that never happened.
          pendingReady = {
            kind: 'failed',
            failureKind: message.failureKind ?? 'browser-launch',
            message: message.failureMessage ?? 'The browser did not start.',
          };
          onReady?.(pendingReady);
        }
        pendingResult ??= message;
        onResult?.(message);
        return;
    }
  });

  return {
    forwardStepsTo(next: SessionRunRequest['reporter']): void {
      reporter = next;
    },

    awaitReady(timeoutMs: number): Promise<ReadyOutcome> {
      if (pendingReady !== null) return Promise.resolve(pendingReady);
      return new Promise<ReadyOutcome>((resolve) => {
        const timer = setTimeout(() => {
          onReady = null;
          resolve({
            kind: 'failed',
            failureKind: 'browser-launch',
            message: `The browser did not start within ${String(timeoutMs)}ms.`,
          });
        }, timeoutMs);
        onReady = (outcome): void => {
          clearTimeout(timer);
          onReady = null;
          resolve(outcome);
        };
      });
    },

    awaitResult(): Promise<Extract<ChildMessage, { kind: 'result' }>> {
      if (pendingResult !== null) return Promise.resolve(pendingResult);
      return new Promise<Extract<ChildMessage, { kind: 'result' }>>((resolve) => {
        onResult = (message): void => {
          onResult = null;
          resolve(message);
        };
      });
    },

    awaitExit(timeoutMs: number): Promise<boolean> {
      if (exited) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          resolve(false);
        }, timeoutMs);
        exitListeners.push(() => {
          clearTimeout(timer);
          resolve(true);
        });
      });
    },
  };
}
