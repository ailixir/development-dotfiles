import '@testing-library/jest-dom';
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * ENV-2 / REL-002: the application's import-time bootstrap never leaves the process.
 *
 * `store/index.ts` dispatches `fetchSources()` and `fetchFeatures()` when it is first imported.
 * Test files start their mock servers in `beforeAll`, which runs after their imports, so those
 * two requests used to go to the real network at jsdom's origin, `http://localhost:3000`. On a
 * host where something listens there (on this one, an unrelated next-server that answers
 * `307 → /login`), both slices could be fulfilled with `undefined` at any later moment. If that
 * happened while a page was mounted, the page's selectors threw `reading 'find'`. So a test's
 * outcome depended on another process.
 *
 * Setup files share the module registry with the test file they run before. So the store is
 * imported here first, while a server that exists only for this purpose is listening. It answers
 * both requests with `404` in-process, and both slices settle on their fail-open defaults. That is
 * the state a host with nothing on `:3000` also reached, but now it is reached before any test
 * file code runs, not at some later moment. A `404` is used rather than a network error because
 * `apiClient` retries a failed GET twice with a 200 ms and then a 400 ms backoff, which would add
 * about 0.6 s to every file. It does not retry a `404`. The server is closed again before the
 * test file is imported, so it never overlaps a file's own server. Any other request made during
 * the import is refused as unhandled, so none can escape. `bootstrapIsolation.test.ts` asserts
 * all of this through the record below.
 *
 * A file that calls `vi.resetModules()` and then imports the store again gets a new store, and
 * that store's bootstrap is not covered here. Today only `studioRunTransport.node.test.tsx` does
 * that, and it points the base URL at its own real server first.
 */
export interface BootstrapIsolationRecord {
  readonly handled: string[];
  readonly unhandled: string[];
}

declare global {
  // eslint-disable-next-line no-var
  var __BOOTSTRAP_ISOLATION__: BootstrapIsolationRecord | undefined;
}

/** How long the two refusals may take to settle both slices before setup fails loudly. */
const BOOTSTRAP_SETTLE_TIMEOUT_MS = 10_000;

if (typeof window !== 'undefined') {
  const record: BootstrapIsolationRecord = { handled: [], unhandled: [] };
  globalThis.__BOOTSTRAP_ISOLATION__ = record;

  const refuse = () => new HttpResponse(null, { status: 404 });
  const bootstrapServer = setupServer(
    http.get('*/checks/sources', refuse),
    http.get('*/features', refuse),
  );
  bootstrapServer.events.on('request:match', ({ request }) => {
    record.handled.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  bootstrapServer.events.on('request:unhandled', ({ request }) => {
    record.unhandled.push(`${request.method} ${request.url}`);
  });

  // `apiClient` logs every failed request. These two failures are the intended ones, so only
  // their log lines are dropped, and only while the store is being imported.
  const consoleError = console.error;
  console.error = (...args: unknown[]) => {
    const detail = args[1] as { url?: unknown } | undefined;
    if (
      args[0] === 'API Error:' &&
      (detail?.url === '/checks/sources' || detail?.url === '/features')
    ) {
      return;
    }
    consoleError(...args);
  };

  bootstrapServer.listen({ onUnhandledRequest: 'error' });
  try {
    const { store } = await import('@/store');
    const isSettled = () => {
      const { sources, features } = store.getState();
      return sources.fetched && !sources.loading && features.fetched && !features.loading;
    };
    await new Promise<void>((resolve, reject) => {
      if (isSettled()) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        unsubscribe();
        const bound = `${BOOTSTRAP_SETTLE_TIMEOUT_MS} ms`;
        reject(new Error(`ENV-2: the store's import-time bootstrap did not settle in ${bound}`));
      }, BOOTSTRAP_SETTLE_TIMEOUT_MS);
      const unsubscribe = store.subscribe(() => {
        if (!isSettled()) return;
        clearTimeout(timer);
        unsubscribe();
        resolve();
      });
    });
  } finally {
    bootstrapServer.close();
    console.error = consoleError;
  }
}

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Clean up after each test case
afterEach(() => {
  cleanup();
});

// Global test utilities
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock window.matchMedia.
// Story 10.11b runs one file under `@vitest-environment node` (the real-socket SSE harness), where
// `window` does not exist. The guard keeps this shared setup usable from both environments; it is
// not a behaviour change for any jsdom suite.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  root: Element | null = null;
  rootMargin: string = '';
  thresholds: ReadonlyArray<number> = [];

  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
} as any;
