import { prepareBrowserProfile } from './scratchLayout.js';
import { fileURLToPath } from 'node:url';
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
import { loadObservedBuild } from '../compat/runtime-versions.js';
import { playwrightBrowserFactory } from './browser.js';
export function startChild(processLike, observed = {}) {
    const channel = {
        onMessage(listener) {
            processLike.on('message', listener);
        },
        send(message) {
            processLike.send?.(message);
        },
        exit(code) {
            // The child leaves on every path: success, step failure, launch failure, error (AC-5).
            processLike.exit(code);
        },
    };
    attachChildRuntime({ channel, browsers: { launch(request) { prepareBrowserProfile(request.scratchPath); return playwrightBrowserFactory.launch(request); } }, ...observed });
}
// Not reachable under vitest: the module is imported by the fixtures tier, never invoked as the
// entry point there. `src/main.ts` guards its own entry the same way.
/* v8 ignore start */
if (process.send !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
    const build = loadObservedBuild();
    startChild(process, { ...(build ? { observedBuild: build } : {}) });
}
/* v8 ignore stop */
//# sourceMappingURL=child.js.map