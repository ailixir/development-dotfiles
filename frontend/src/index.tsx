// Module Federation entry point for remote dev server standalone preview
async function bootstrap() {
  // Ensure default share scope is initialized before consuming shared modules
  try {
    const initSharing = (globalThis as any).__webpack_init_sharing__;
    if (typeof initSharing === 'function') {
      await initSharing('default');
    }
  } catch {}

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