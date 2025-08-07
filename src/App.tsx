import React, { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Provider as ReduxProvider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { theme } from '@/styles/theme';
import { store } from '@/store/store';
import { queryClient } from '@/utils/queryClient';
import ChecksRoutes from '@/routes/ChecksRoutes';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import LoadingFallback from '@/components/common/LoadingFallback';

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <BrowserRouter>
              <Suspense fallback={<LoadingFallback />}>
                <ChecksRoutes />
              </Suspense>
            </BrowserRouter>
            {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
          </ThemeProvider>
        </QueryClientProvider>
      </ReduxProvider>
    </ErrorBoundary>
  );
};

export default App;
