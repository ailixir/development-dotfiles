import React from 'react';
import { createRoot } from 'react-dom/client';
import Bootstrap from './bootstrap';

console.log('🚀 Starting MF dev application (webpack)...');

const container = document.getElementById('root');
console.log('📦 Root element found:', !!container);

async function start() {
  if (!container) {
    console.error('❌ Root element not found!');
    return;
  }

  // Start MSW in standalone MF dev so /api requests are mocked
  try {
    const { worker } = await import('@services/mocks/browser');
    await worker.start({
      serviceWorker: { url: '/mockServiceWorker.js' },
      onUnhandledRequest: 'bypass',
    });
    console.log('✅ MSW ready (webpack dev)');
    try {
      const RELOAD_FLAG = '__msw_first_run__';
      const hasReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
      if (navigator.serviceWorker && !navigator.serviceWorker.controller && !hasReloaded) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
        return;
      }
    } catch {}
  } catch (e) {
    console.warn('⚠️ MSW failed to start (webpack dev)', e);
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <Bootstrap routingStrategy="browser" />
    </React.StrictMode>
  );
  console.log('✅ Bootstrap rendered (MF dev)');
}

start();