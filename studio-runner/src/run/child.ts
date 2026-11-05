import { prepareBrowserProfile } from './scratchLayout.js';
import { host } from './host/index.js';
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
import { loadObservedBuild } from '../compat/runtime-versions.js';
import { ALLOW_ALL_DOMAINS_ENV_KEY, ALLOWED_DOMAINS_ENV_KEY, resolveAllowedDomains } from '../allowedDomains.js';
import { playwrightBrowserFactory } from './browser.js';
import type { ObservedChildMessage } from './protocol.js';
import type { ChildRuntimeDependencies } from './childRuntime.js';

/** Binds the runtime to a Node process. Exported so a test can drive it with a fake process. */
export interface ChildProcessLike {
  on(event: 'message', listener: (value: unknown) => void): unknown;
  send?: ((message: unknown) => boolean) | undefined;
  exit(code?: number): never;
}

export function startChild(processLike: ChildProcessLike, allowedDomains: readonly string[], observed: Pick<ChildRuntimeDependencies, 'observedBuild'|'publishAppVideoOwner'> = {}): void {
  const channel: ChildChannel = {
    onMessage(listener: (value: unknown) => void): void {
      processLike.on('message', listener);
    },
    send(message: ObservedChildMessage): void {
      processLike.send?.(message);
    },
    exit(code: number): void {
      // The child leaves on every path: success, step failure, launch failure, error (AC-5).
      processLike.exit(code);
    },
  };
  attachChildRuntime({ channel, allowedDomains, browsers: { launch(request) { prepareBrowserProfile(request.scratchPath); return playwrightBrowserFactory.launch(request); } }, ...observed });
}

// Not reachable under vitest: the module is imported by the fixtures tier, never invoked as the
// entry point there. `src/main.ts` guards its own entry the same way.
/* v8 ignore start */
if (process.send !== undefined && host.process.isEntryPoint(import.meta.url)) {
  const build=loadObservedBuild();
  // The launcher always writes the whitelist (empty denies everything) and the allow-all key (an unset key would mean on); a malformed value is a launcher fault, so the child does not start.
  const domains=resolveAllowedDomains(process.env[ALLOWED_DOMAINS_ENV_KEY],process.env[ALLOW_ALL_DOMAINS_ENV_KEY]);
  if('problem' in domains)process.exit(78);
  startChild(process as unknown as ChildProcessLike,domains.entries,{...(build?{observedBuild:build}:{})});
}
/* v8 ignore stop */
