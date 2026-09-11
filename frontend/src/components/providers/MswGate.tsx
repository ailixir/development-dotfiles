import React from 'react';

/**
 * Starts Mock Service Worker before rendering, when it is enabled (story 10.1, AC-16).
 *
 * Gated on `VITE_ENABLE_MSW` so the mock never activates by accident in a federated or deployed
 * build: the flag has to be set explicitly, and the worker module is only imported when it is.
 * When the flag is off this component is a pass-through and MSW is not in the bundle path at all.
 */

const mswEnabled = (): boolean => {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> })?.env ?? {};
    return env.VITE_ENABLE_MSW === 'true';
  } catch {
    return false;
  }
};

export const MswGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const enabled = mswEnabled();
  const [ready, setReady] = React.useState(!enabled);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    import('@/services/mocks/studio/browser')
      .then(({ studioWorker }) =>
        studioWorker.start({
          // Anything the Studio handlers do not cover must still reach the real API.
          onUnhandledRequest: 'bypass',
          serviceWorker: { url: `${import.meta.env?.BASE_URL ?? '/'}mockServiceWorker.js` },
        }),
      )
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
