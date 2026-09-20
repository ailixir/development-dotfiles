import { MswGate } from '@components/providers/MswGate';
import { Box, CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { store } from '@store/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { Provider } from 'react-redux';
import App from './App';
import { theme } from './theme';

// Use the Vite app's route configuration to ensure identical routes

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

// Loading component (kept for potential future suspense boundaries)

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Checks Module Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <h2>Something went wrong in the Checks module</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </Box>
      );
    }

    return this.props.children;
  }
}

interface ChecksModuleProps {
  basename?: string;
  isStandalone?: boolean;
  onNavigate?: (path: string) => void;
}

/**
 * Main Module Component for Module Federation
 * This component is exposed to the host application
 */
const ChecksModule: React.FC<ChecksModuleProps> = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <MswGate>
              <App />
            </MswGate>
          </ThemeProvider>
        </Provider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

// Export for Module Federation
export default ChecksModule;

// Also export as named export for flexibility
export { ChecksModule };


