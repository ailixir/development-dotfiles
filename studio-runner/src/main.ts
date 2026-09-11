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
import { createChildBrowserLauncher } from './run/index.js';
import type { BrowserLauncher } from './server/adapters.js';
import { createApplication } from './server/application.js';
import type { RunnerApplication } from './server/application.js';
import { ConfigurationError, loadConfig } from './server/config.js';
import type { RunnerConfig } from './server/config.js';

/**
 * The real launcher, built from configuration.
 *
 * Everything here is an enumerated configuration key (`src/server/config.ts`), so the recording
 * geometry and the two browser timeouts are chosen values rather than library defaults — §6.1
 * requires the recording resolution to be explicit, and §8.5 calls the timeouts starting values to
 * be tuned against staging measurements.
 */
export function createConfiguredLauncher(config: RunnerConfig): BrowserLauncher {
  return createChildBrowserLauncher({
    recording: { width: config.recordingWidth, height: config.recordingHeight },
    stepTimeoutMs: config.stepTimeoutMs,
    launchTimeoutMs: config.browserLaunchTimeoutMs,
    stopTimeoutMs: config.browserStopTimeoutMs,
    maxFailureMessageLength: config.maxReportLogEntryLength,
  });
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
}

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
