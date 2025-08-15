import React from 'react';
import { createRoot, Root } from 'react-dom/client';
// Lazy import to avoid eager shared consumption during bootstrap
const loadBootstrap = () => import('./bootstrap');
import { APP_CONFIG } from '@utils/constants/appConfig';

console.log('🚀 Main.tsx loaded');

// Entry point for standalone Vite development
const container = document.getElementById('root');
console.log('📦 Root container found:', !!container);

async function startApp() {
  if (!container) {
    console.error('❌ No root element found in HTML');
    return;
  }

  // Start MSW in development if enabled
  if (import.meta.env.DEV && APP_CONFIG.enableMSW) {
    try {
      console.log('🛠️ Starting MSW...');
      const { worker } = await import('@services/mocks/browser');
      await worker.start({
        serviceWorker: { url: '/mockServiceWorker.js' },
        onUnhandledRequest: 'warn',
      });
      console.log('✅ MSW ready');
    } catch (e) {
      console.warn('⚠️ MSW failed to start; falling back to network', e);
    }
  }

  try {
    // Initialize default share scope before consuming shared singletons
    try {
      const initSharing = (globalThis as any).__webpack_init_sharing__;
      if (typeof initSharing === 'function') {
        await initSharing('default');
      }
    } catch {}

    let root: Root;
    if (!(window as any).__REACT_ROOT__) {
      console.log('🔧 Creating React root...');
      root = createRoot(container);
      (window as any).__REACT_ROOT__ = root;
    } else {
      console.log('♻️ Reusing existing React root (HMR)...');
      root = (window as any).__REACT_ROOT__;
    }
    console.log('🎨 Rendering Bootstrap component...');
    const { default: Bootstrap } = await loadBootstrap();
    root.render(
      <React.StrictMode>
        <Bootstrap routingStrategy="browser" />
      </React.StrictMode>
    );
    console.log('✅ Bootstrap app rendered');
  } catch (error) {
    console.error('❌ Failed to render React app:', error);
  }
}

startApp();