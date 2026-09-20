import React from 'react';
import { createRoot, Root } from 'react-dom/client';
// Lazy import to avoid eager shared consumption during bootstrap
const loadBootstrap = () => import('./bootstrap');
console.log('Main.tsx loaded');

// Entry point for standalone Vite development
const container = document.getElementById('root');
console.log('Root container found:', !!container);

async function startApp() {
  if (!container) {
    console.error('No root element found in HTML');
    return;
  }

  try {
    // Initialize default share scope before consuming shared singletons
    try {
      const initSharing = (globalThis as any).__webpack_init_sharing__;
      if (typeof initSharing === 'function') {
        await initSharing('default');
      }
    } catch { /* Environment initialization is optional; continue with the configured defaults. */ }

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