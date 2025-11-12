import { APP_CONFIG } from '@/utils/constants/appConfig';

let mswReadyPromise: Promise<void> | null = null;

export async function ensureMswWorkerReady(): Promise<void> {
  if (mswReadyPromise) {
    return mswReadyPromise;
  }

  mswReadyPromise = (async () => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV === 'production') return;
    if (!APP_CONFIG.enableMSW) return;

    try {
      const { worker } = await import('./browser');
      await worker.start({
        serviceWorker: { url: '/mockServiceWorker.js' },
        onUnhandledRequest: 'bypass',
      });

      // Ensure SW takes control on first run (reload once) and/or wait for control
      try {
        const RELOAD_FLAG = '__msw_first_run__';
        if (navigator.serviceWorker) {
          const hasController = !!navigator.serviceWorker.controller;
          if (!hasController) {
            const hasReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
            if (!hasReloaded) {
              sessionStorage.setItem(RELOAD_FLAG, '1');
              window.location.reload();
              return;
            }
            await new Promise<void>((resolve) => {
              const timeout = setTimeout(() => resolve(), 1500);
              navigator.serviceWorker.addEventListener(
                'controllerchange',
                () => {
                  clearTimeout(timeout);
                  resolve();
                },
                { once: true } as any
              );
            });
          }
        }
      } catch {
        // no-op
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('⚠️ MSW failed to start (hosted via shell)', e);
    }
  })();

  return mswReadyPromise;
}


