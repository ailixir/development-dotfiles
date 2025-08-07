import React from 'react';
import { createRoot } from 'react-dom/client';
import Bootstrap from './bootstrap';

console.log('🚀 Main.tsx loaded - starting without MSW');

// Entry point for standalone Vite development
const container = document.getElementById('root');
console.log('📦 Root container found:', !!container);

if (!container) {
  console.error('❌ No root element found in HTML');
} else {
  try {
    console.log('🔧 Creating React root...');
    const root = createRoot(container);
    
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