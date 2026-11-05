/**
 * The guided child's process entry (SC008-E15): one per learning session, forked by `guidedChildLauncher.ts` with the same confined
 * environment, no arguments and no interpreter flags as the replay child.
 *
 * Deliberately thin, like `child.ts` and `main.ts`: bind process IPC to the service and get out of the way. The service itself is
 * `guidedChildService.ts`; this is the only module that hands it the real browser launch.
 */
import { launchGuidedBrowser } from './browser.js';
import { serveGuidedChild } from './guidedChildService.js';
import { host } from './host/index.js';

// Not reachable under vitest: the module is imported by the fixtures tier, never invoked as the entry point there.
/* v8 ignore start */
if (process.send !== undefined && host.process.isEntryPoint(import.meta.url)) {
  serveGuidedChild({
    send: frame => { process.send?.(frame); },
    onMessage: listener => { process.on('message', listener); },
    onDisconnect: listener => { process.on('disconnect', listener); },
    exit: () => { process.exit(0); },
  }, { launch: launchGuidedBrowser });
}
/* v8 ignore stop */
