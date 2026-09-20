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
import { MswGate } from '@components/providers/MswGate';

// MSW is started by MswGate below, which is on this tree because main.tsx (the Vite standalone
// entry) renders Bootstrap and never touches ChecksModule.tsx. The gate holds the app back until
// the worker is active, so the first Studio request cannot escape to the network (story 10.1,
// AC-16). ChecksModule.tsx mounts its own gate for the Module Federation entry.

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
          <MswGate>
            <React.Suspense fallback={null}>
              <RouterComponent>
                <LazyApp />
              </RouterComponent>
            </React.Suspense>
          </MswGate>
        </ThemeProvider>
      </Provider>
    </QueryClientProvider>
  );
};

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