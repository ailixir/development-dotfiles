// Module Federation entry point for remote dev server standalone preview
async function bootstrap() {
  // Ensure default share scope is initialized before consuming shared modules
  try {
    const initSharing = (globalThis as any).__webpack_init_sharing__;
    if (typeof initSharing === 'function') {
      await initSharing('default');
    }
  } catch {}

  // Start MSW in webpack MF standalone preview
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { worker } = await import('@services/mocks/browser');
      await worker.start({
        serviceWorker: { url: '/mockServiceWorker.js' },
        onUnhandledRequest: 'bypass',
      });
      // Ensure SW takes control on first run (reload once)
      try {
        const RELOAD_FLAG = '__msw_first_run__';
        const hasReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
        if (navigator.serviceWorker && !navigator.serviceWorker.controller && !hasReloaded) {
          sessionStorage.setItem(RELOAD_FLAG, '1');
          window.location.reload();
          return;
        }
      } catch {}
      // Additionally, wait until the service worker is actually controlling the page
      try {
        if (navigator.serviceWorker && !navigator.serviceWorker.controller) {
          await new Promise<void>((resolve) => {
            const onCtrl = () => resolve();
            navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true } as any);
          });
        }
      } catch {}
    } catch (e) {
      console.warn('⚠️ MSW failed to start (webpack MF standalone)', e);
    }
  }

  const [ReactNS, ReactDomNS, RouterNS, ModuleNS] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('react-router-dom'),
    import('./ChecksModule'),
  ]);

  const React = ReactNS.default as typeof import('react');
  const { createRoot } = ReactDomNS as any;
  const { BrowserRouter } = RouterNS as any;
  const ChecksModule = ModuleNS.default as any;

  const container = document.getElementById('root');
  if (!container) return;

  const root = createRoot(container);
  root.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(
        BrowserRouter,
        { basename: '/' },
        React.createElement(ChecksModule, null)
      )
    )
  );
}

bootstrap();