/**
 * Process entry point (AC-12, ADR-001 §3, `Dockerfile` line 51).
 *
 * The `Dockerfile` has carried `CMD ["node", "dist/main.js"]` with a note deferring this file to
 * story 10.6 since the image was written; this is that file. It is deliberately thin — load
 * configuration, build the application, listen, wire `SIGTERM` to the drain — because everything
 * worth testing lives in `src/server/application.ts` and is tested there.
 *
 * **Configuration failure is a startup failure.** `loadConfig` rejects any unrecognised key in
 * the runner's namespace, so a mounted database URL or vault address stops the pod from starting
 * rather than sitting unread in the environment (AC-22c). The process reports the problems and
 * exits non-zero; it does not start degraded.
 *
 * **The browser is real from story 10.12 onward.** `UNAVAILABLE_LAUNCHER` — the placeholder that
 * refused every launch with `BROWSER_LAUNCH_UNAVAILABLE` — is gone, replaced by
 * `createChildBrowserLauncher`: a Chromium child process, sandboxed, recording native webm into
 * the per-run scratch directory, reporting step timings on one run-scoped clock zeroed at the
 * browser start. `launcher` stays an injectable dependency so the behavioural suite keeps running
 * against 10.6's in-process fake and `npm test` launches no browser (AC-25).
 */
import { fileURLToPath } from 'node:url';

import { currentRuntimeVersions } from './compat/index.js';
import { canEnumerateProcessTree, createChildBrowserLauncher, readProcessTable } from './run/index.js';
import type { ChildLauncherOptions, ProcessRow } from './run/index.js';
import type { BrowserLauncher } from './server/adapters.js';
import { createApplication } from './server/application.js';
import type { RunnerApplication } from './server/application.js';
import { ConfigurationError, loadConfig } from './server/config.js';
import type { RunnerConfig } from './server/config.js';

/**
 * What the production path is allowed to hand the launcher: everything except the test seams.
 *
 * `ChildLauncherOptions` carries three injection points — `spawner`, `childModulePath` and
 * `parentEnv` — that exist so the unit tier can spawn no process, fork no real child and read no
 * real environment. Each is also honoured in production if supplied, so each is a way to replace
 * the forked module, the process that forks it, or the environment it is given, from a caller
 * rather than from a diff to `src/run/launcher.ts`.
 *
 * Removing them is not an option: the seams are what keep `npm test` browser-free (AC-25). So the
 * production path is typed *without* them instead. Object-literal excess-property checking turns
 * supplying one below into a compile error rather than a habit — and `test/run/production-seams.
 * test.ts` asserts the same property over the options actually constructed, including a
 * key-for-key equality that also catches a seam added to `ChildLauncherOptions` later. Story 10.13
 * is the next change to this constructor, which is why the guard is written now.
 */
type ProductionLauncherOptions = Omit<
  ChildLauncherOptions,
  'spawner' | 'childModulePath' | 'parentEnv'
>;

/**
 * The real launcher, built from configuration.
 *
 * Everything here is an enumerated configuration key (`src/server/config.ts`), so the recording
 * geometry and the two browser timeouts are chosen values rather than library defaults — §6.1
 * requires the recording resolution to be explicit, and §8.5 calls the timeouts starting values to
 * be tuned against staging measurements. No seam is supplied, so production always forks
 * `DEFAULT_CHILD_MODULE_PATH` through the real `fork`, with the environment the allowlist builds.
 */
export function createConfiguredLauncher(config: RunnerConfig): BrowserLauncher {
  const options: ProductionLauncherOptions = {
    recording: { width: config.recordingWidth, height: config.recordingHeight },
    stepTimeoutMs: config.stepTimeoutMs,
    launchTimeoutMs: config.browserLaunchTimeoutMs,
    stopTimeoutMs: config.browserStopTimeoutMs,
    maxFailureMessageLength: config.maxReportLogEntryLength,
    // ADR-002 §26.3: applied in the child's `takeRunOrigin`, carried there by the launch message.
    seekOriginCalibrationMs: config.seekOriginCalibrationMs,
  };
  return createChildBrowserLauncher(options);
}

export interface MainOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Registers a signal handler. Injected so the drain path is testable without real signals. */
  readonly onSignal: (signal: 'SIGTERM' | 'SIGINT', handler: () => void) => void;
  readonly write: (line: string) => void;
  readonly setExitCode: (code: number) => void;
  readonly launcher?: BrowserLauncher | undefined;
  /**
   * Where to read `runtime-versions.json` from. Defaults to the copy the build embedded next to
   * the compiled entry points; a parameter only so a test can point it at a known record.
   */
  readonly runtimeVersionsFile?: string | undefined;
  /**
   * Reads the process table. Injected only so a test can stand in for an image without `ps`;
   * production always reads the real one (`src/run/tree.ts`).
   */
  readonly processTable?: (() => readonly ProcessRow[]) | undefined;
}

/**
 * What the runner says when it cannot enumerate a process tree (Studio v1 WP16), and the exit code
 * it leaves with (`EX_UNAVAILABLE`). Value-free: it names the tool, never the environment.
 */
export const PROCESS_TABLE_UNREADABLE =
  'process table unreadable: `ps -A -o pid=,ppid=` did not list this process. The runner stops a ' +
  'cancelled or timed-out browser by enumerating its process tree, and without `ps` (procps) it ' +
  'would signal the fork alone and orphan Chromium. Refusing to start.';
export const PROCESS_TABLE_EXIT_CODE = 69;

export interface MainResult {
  readonly started: boolean;
  readonly port?: number;
  readonly application?: RunnerApplication;
}

export async function main(options: MainOptions): Promise<MainResult> {
  let config;
  try {
    config = loadConfig(options.env);
  } catch (error) {
    // `loadConfig` throws only `ConfigurationError`. Anything else is a programming fault and
    // must not be laundered into an exit code that claims the deployment mis-configured the pod.
    if (!(error instanceof ConfigurationError)) throw error;
    for (const problem of error.problems) options.write(`configuration rejected: ${problem}`);
    options.setExitCode(78); // EX_CONFIG
    return { started: false };
  }

  // **The in-image `ps` guard** (Studio v1 WP16). Checked before anything listens, so a pod on an
  // image that lost `procps` never becomes ready rather than serving runs it cannot stop.
  if (!canEnumerateProcessTree((options.processTable ?? readProcessTable)())) {
    options.write(PROCESS_TABLE_UNREADABLE);
    options.setExitCode(PROCESS_TABLE_EXIT_CODE);
    return { started: false };
  }

  const application = createApplication(config, {
    launcher: options.launcher ?? createConfiguredLauncher(config),
    runtimeVersions: { ...currentRuntimeVersions(options.runtimeVersionsFile) } as Record<
      string,
      unknown
    >,
  });

  const port = await application.start();

  let draining = false;
  const drain = (): void => {
    if (draining) return;
    draining = true;
    void application.drain();
  };
  options.onSignal('SIGTERM', drain);
  options.onSignal('SIGINT', drain);

  return { started: true, port, application };
}

// Not reachable under vitest: the module is imported, never invoked as the entry point.
/* v8 ignore start */
if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  void main({
    env: process.env,
    onSignal: (signal, handler) => {
      process.on(signal, handler);
    },
    write: (line) => process.stderr.write(`${line}\n`),
    setExitCode: (code) => {
      process.exitCode = code;
    },
  });
}
/* v8 ignore stop */
