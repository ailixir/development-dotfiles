import React from 'react';

/**
 * Starts Mock Service Worker before rendering, when it is enabled (story 10.1, AC-16).
 *
 * Two independent gates, and both have to open:
 *
 * 1. `process.env.MSW_BUNDLED` is a *build-time* constant. Webpack's DefinePlugin folds it to the
 *    literal `'false'` in a production build, so the parser drops the whole branch below, never
 *    creates the `import()` dependency and never emits an msw chunk. Development webpack, Vite dev
 *    and `vite build` with `VITE_ENABLE_MSW=true` fold it to `'true'`, so the mock is available.
 * 2. `process.env.VITE_ENABLE_MSW` is the *runtime* flag, default off. It has to be set explicitly,
 *    so the worker never activates by accident even in a build that carries it.
 *
 * Both gates are read through `process.env` and substituted by each bundler from the environment
 * (webpack `DefinePlugin`, Vite `define`). `import.meta.env` is deliberately not used: webpack has
 * no `import.meta.env` and folds it to an empty object, so a gate read through it is dead — it
 * evaluates false in every webpack build regardless of the flag.
 *
 * With either gate closed this component is a pass-through.
 */

const mswEnabled = (): boolean => process.env.VITE_ENABLE_MSW === 'true';

/**
 * Memoised at module scope because msw refuses a second `start()` on an already enabled worker,
 * and React StrictMode runs every effect twice in development — which is exactly where this runs.
 */
let started: Promise<void> | null = null;

const startStudioWorker = (): Promise<void> => {
  if (started) {
    return started;
  }
  // Must stay a literal comparison directly around the import(): that is what lets the bundler
  // fold the condition at parse time and leave the mocks out of the build entirely.
  if (process.env.MSW_BUNDLED === 'true') {
    started = import('@/services/mocks/studio/browser')
      .then(({ studioWorker }) =>
        studioWorker.start({
          // Anything the Studio handlers do not cover must still reach the real API.
          onUnhandledRequest: 'bypass',
          // Both dev servers serve `public/` from the origin root, and a service worker can only
          // claim a scope at or below its own path, so the root copy is the only one that works.
          serviceWorker: { url: '/mockServiceWorker.js' },
        }),
      )
      .then(() => undefined);
  } else {
    // The flag is on but this build does not carry the mocks. Render the real app rather than
    // hanging on a worker that can never start.
    started = Promise.resolve();
  }
  return started;
};

export const MswGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const enabled = mswEnabled();
  const [ready, setReady] = React.useState(!enabled);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    startStudioWorker()
      .catch((error) => {
        console.error('MswGate: could not start the mock service worker', error);
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!ready) {
    return null;
  }
  return <>{children}</>;
};

export default MswGate;
