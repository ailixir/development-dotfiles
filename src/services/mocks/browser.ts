import { setupWorker } from 'msw/browser';
import { handlers } from './handlers/index';

// Setup MSW worker with all handlers
export const worker = setupWorker(...handlers);

// Start worker and configure
export const startMocking = async () => {
  if (typeof window === 'undefined') {
    return;
  }

  await worker.start({
    onUnhandledRequest: 'warn',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  });

  console.log('🔶 MSW: Mock service worker started');
};

export default worker;
