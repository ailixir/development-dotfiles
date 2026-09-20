import React from 'react';
import { createRoot } from 'react-dom/client';

console.log('🚀 Starting MF dev application (webpack)...');

const container = document.getElementById('root');
console.log('📦 Root element found:', !!container);

async function start() {
  if (!container) {
    console.error('❌ Root element not found!');
    return;
  }

  // Initialize default share scope before consuming shared singletons
  try {
    const initSharing = (globalThis as any).__webpack_init_sharing__;
    if (typeof initSharing === 'function') {
      await initSharing('default');
    }
  } catch { /* Environment initialization is optional; continue with the configured defaults. */ }

  const { default: Bootstrap } = await import('./bootstrap');
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <Bootstrap routingStrategy="browser" />
    </React.StrictMode>
  );
  console.log('✅ Bootstrap rendered (MF dev)');
}

start();