import React from 'react';
import { createRoot } from 'react-dom/client';

console.log('🚀 Starting application...');

const App: React.FC = () => {
  return (
    <div style={{ padding: '20px' }}>
      <h1>PUT Checks Module - Test</h1>
      <p>Current URL: {window.location.href}</p>
      <p>This is a simple test component to verify React is working.</p>
    </div>
  );
};

const container = document.getElementById('root');
console.log('📦 Root element found:', !!container);

if (container) {
  console.log('🔧 Creating root and rendering...');
  const root = createRoot(container);
  root.render(<App />);
  console.log('✅ App rendered successfully');
} else {
  console.error('❌ Root element not found!');
}