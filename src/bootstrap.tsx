import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Module Federation bootstrap
const ChecksModule = () => {
  return <App />;
};

// Export the module for remote consumption
export { ChecksModule };
export default ChecksModule;

// If running standalone, render directly
if (typeof document !== 'undefined' && document.getElementById('root')) {
  // Start MSW for development
  async function enableMocking() {
    const { ENV_CONFIG } = await import('./utils/env');
    if (!ENV_CONFIG.enableMSW) {
      return;
    }

    const { worker } = await import('./services/mocks/browser');
    
    return worker.start({
      onUnhandledRequest: 'warn',
    });
  }

  enableMocking().then(() => {
    const container = document.getElementById('root');
    if (!container) throw new Error('Failed to find the root element');
    
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <ChecksModule />
      </React.StrictMode>
    );
  });
}
