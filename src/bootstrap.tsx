import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { store } from '@store/index';
import { createTheme } from '@mui/material/styles';
// import { APP_CONFIG } from '@utils/constants/appConfig';

// MSW initialization is handled in main.tsx for Vite mode
// For Module Federation mode, the host should handle MSW initialization

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

// Create MUI theme
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0056C7', // Citibank blue
    },
    secondary: {
      main: '#F5F5F5',
    },
    background: {
      default: '#FAFAFA',
      paper: '#FFFFFF',
    },
  },
  typography: {
    fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
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
          <RouterComponent>
            <App />
          </RouterComponent>
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

// For standalone mode
if (process.env.NODE_ENV === 'development' && !(window as any).__POWERED_BY_MODULE_FEDERATION__) {
  const container = document.getElementById('root');
  if (container) {
    // Clear the loading state and render the app
    container.innerHTML = '';
    const root = createRoot(container);
    root.render(<Bootstrap />);
  }
}

export default Bootstrap;