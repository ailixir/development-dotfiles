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
 * **There is no real browser here.** The `BrowserLauncher` below refuses, loudly and with a code,
 * because story 10.12 owns the real Playwright adapter and this story installs and launches no
 * browser. An admitted run therefore reports a terminal `ERROR` with `BROWSER_LAUNCH_UNAVAILABLE`
 * instead of silently succeeding — which is the honest state of the component today, and is what
 * AC-14b's deferral to 10.12 means in running code.
 */
import { fileURLToPath } from 'node:url';

import { currentRuntimeVersions } from './compat/index.js';
import type { BrowserLauncher, BrowserSession } from './server/adapters.js';
import { createApplication } from './server/application.js';
import type { RunnerApplication } from './server/application.js';
import { ConfigurationError, loadConfig } from './server/config.js';

/**
 * Placeholder launcher. Story 10.12 replaces it with the real Playwright adapter, the child
 * process, native video recording and the killable process tree.
 */
export const UNAVAILABLE_LAUNCHER: BrowserLauncher = {
  launch(): Promise<BrowserSession> {
    return Promise.reject(
      new Error(
        'BROWSER_LAUNCH_UNAVAILABLE: the real Playwright adapter is story 10.12. This story ' +
          'installs and launches no browser.',
      ),
    );
  },
};

export interface MainOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Registers a signal handler. Injected so the drain path is testable without real signals. */
  readonly onSignal: (signal: 'SIGTERM' | 'SIGINT', handler: () => void) => void;
  readonly write: (line: string) => void;
  readonly setExitCode: (code: number) => void;
  readonly launcher?: BrowserLauncher | undefined;
  readonly runtimeVersions?: Readonly<Record<string, unknown>> | undefined;
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
    if (error instanceof ConfigurationError) {
      for (const problem of error.problems) options.write(`configuration rejected: ${problem}`);
      options.setExitCode(78); // EX_CONFIG
      return { started: false };
    }
    throw error;
  }

  const application = createApplication(config, {
    launcher: options.launcher ?? UNAVAILABLE_LAUNCHER,
    runtimeVersions:
      options.runtimeVersions ?? ({ ...currentRuntimeVersions() } as Record<string, unknown>),
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
