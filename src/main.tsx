import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import Bootstrap from './bootstrap';

console.log('🚀 Main.tsx loaded - starting without MSW');

// Entry point for standalone Vite development
const container = document.getElementById('root');
console.log('📦 Root container found:', !!container);

if (!container) {
  console.error('❌ No root element found in HTML');
} else {
  try {
    // Store root instance to avoid recreating during HMR
    let root: Root;
    
    // Check if we already have a root instance (HMR case)
    if (!(window as any).__REACT_ROOT__) {
      console.log('🔧 Creating React root...');
      root = createRoot(container);
      (window as any).__REACT_ROOT__ = root;
    } else {
      console.log('♻️ Reusing existing React root (HMR)...');
      root = (window as any).__REACT_ROOT__;
    }
    
    console.log('🎨 Rendering Bootstrap component...');
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