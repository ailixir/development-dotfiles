/**
 * The browser child's process entry (AC-5).
 *
 * Deliberately thin, the same way `src/main.ts` is: bind the IPC channel to the runtime and get
 * out of the way. Everything worth testing lives in `src/run/childRuntime.ts` and is tested there
 * against a fake browser factory, which is what keeps the unit tier browser-free (AC-25) while
 * `test/fixtures-tier/` drives this exact file against real Chromium.
 *
 * This is the **only** module that puts the Playwright factory and the run logic together;
 * `childRuntime.ts` never imports the browser library, so the confinement AC-1 asserts survives
 * the wiring.
 */

import { attachChildRuntime } from './childRuntime.js';
import type { ChildChannel } from './childRuntime.js';
import { playwrightBrowserFactory } from './browser.js';
import type { ChildMessage } from './protocol.js';

/** Binds the runtime to a Node process. Exported so a test can drive it with a fake process. */
export interface ChildProcessLike {
  on(event: 'message', listener: (value: unknown) => void): unknown;
  send?: ((message: unknown) => boolean) | undefined;
  exit(code?: number): never;
}

export function startChild(processLike: ChildProcessLike): void {
  const channel: ChildChannel = {
    onMessage(listener: (value: unknown) => void): void {
      processLike.on('message', listener);
    },
    send(message: ChildMessage): void {
      processLike.send?.(message);
    },
    exit(code: number): void {
      // The child leaves on every path: success, step failure, launch failure, error (AC-5).
      processLike.exit(code);
    },
  };
  attachChildRuntime({ channel, browsers: playwrightBrowserFactory });
}

// Not reachable under vitest: the module is imported by the fixtures tier, never invoked as the
// entry point there. `src/main.ts` guards its own entry the same way.
/* v8 ignore start */
if (process.send !== undefined) {
  startChild(process as unknown as ChildProcessLike);
}
/* v8 ignore stop */
