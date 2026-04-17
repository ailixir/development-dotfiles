import React from 'react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Lazy import to avoid eager shared consumption of shared singletons
const LazyApp = React.lazy(() => import('./App'));
import { store } from '@store/index';
import { theme } from './theme';

// MSW initialization is handled in main.tsx for Vite mode
// For Module Federation mode, the host should handle MSW initialization

// Mark platform shell integration
if (typeof window !== 'undefined') {
  (window as any).__CHECKS_MODULE__ = true;
}

// Initialize React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

interface BootstrapProps {
  routingStrategy?: 'browser' | 'memory';
  initialEntries?: string[];
  basename?: string;
}

const Bootstrap: React.FC<BootstrapProps> = ({ 
  routingStrategy = 'browser',
  initialEntries = ['/checks'],
  basename = ''
}) => {
  const RouterComponent = routingStrategy === 'memory' 
    ? ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter initialEntries={initialEntries}>
          {children}
        </MemoryRouter>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <BrowserRouter basename={basename}>
          {children}
        </BrowserRouter>
      );

  return (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <React.Suspense fallback={null}>
            <RouterComponent>
              <LazyApp />
            </RouterComponent>
          </React.Suspense>
        </ThemeProvider>
      </Provider>
    </QueryClientProvider>
  );
};

// MSW initialization is handled in main.tsx for Vite mode
// For Module Federation mode, the host should handle MSW initialization

// For Module Federation - expose the component
if (typeof window !== 'undefined') {
  // Mark as Module Federation powered
  (window as any).__CHECKS_MODULE_FEDERATION__ = true;
  
  // Expose for host applications
  (window as any).ChecksModule = Bootstrap;
}

// Note: Standalone rendering is handled by main.tsx for Vite development
// This bootstrap file focuses on providing the component for Module Federation

export default Bootstrap;