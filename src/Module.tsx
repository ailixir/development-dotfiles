import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline, Box, CircularProgress } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { store } from '@store/index';
import { theme } from './theme';
import { ChecksLayout } from '@components/layout/ChecksLayout';

// Lazy load pages for code splitting
const HomePage = React.lazy(() => import('@pages/HomePage'));
const DashboardPage = React.lazy(() => import('@pages/DashboardPage'));
const AllChecksPage = React.lazy(() => import('@pages/AllChecksPage'));
const CreateCheckPage = React.lazy(() => import('@pages/CreateCheckPage'));
const CheckDetailsPage = React.lazy(() => import('@pages/CheckDetailsPage'));
const ChecksStudioPage = React.lazy(() => import('@pages/ChecksStudioPage'));
const ChecksTemplatesPage = React.lazy(() => import('@pages/ChecksTemplatesPage'));
const CSIsDirectoryPage = React.lazy(() => import('@pages/CSIsDirectoryPage'));
const CSIOverviewPage = React.lazy(() => import('@pages/CSIOverviewPage'));
const ReportsPage = React.lazy(() => import('@pages/ReportsPage'));
const SchedulesPage = React.lazy(() => import('@pages/SchedulesPage'));
const ActivityPage = React.lazy(() => import('@pages/ActivityPage'));
const StudioRunsPage = React.lazy(() => import('@pages/StudioRunsPage'));
const StudioTestsPage = React.lazy(() => import('@pages/StudioTestsPage'));

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

// Loading component
const LoadingFallback: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '400px',
      width: '100%',
    }}
  >
    <CircularProgress />
  </Box>
);

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
            <ChecksLayout>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  {/* Home/Dashboard Routes */}
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="home" element={<HomePage />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  
                  {/* Checks Management Routes */}
                  <Route path="all" element={<AllChecksPage />} />
                  <Route path="create" element={<CreateCheckPage />} />
                  <Route path="check/:checkId" element={<CheckDetailsPage />} />
                  <Route path="templates" element={<ChecksTemplatesPage />} />
                  
                  {/* CSI Routes */}
                  <Route path="csi">
                    <Route index element={<CSIsDirectoryPage />} />
                    <Route path=":csiId" element={<CSIOverviewPage />} />
                  </Route>
                  
                  {/* Studio Routes */}
                  <Route path="studio">
                    <Route index element={<ChecksStudioPage />} />
                    <Route path="runs" element={<StudioRunsPage />} />
                    <Route path="tests" element={<StudioTestsPage />} />
                  </Route>
                  
                  {/* Reports Routes */}
                  <Route path="reports/*" element={<ReportsPage />} />
                  
                  {/* Other Routes */}
                  <Route path="schedules" element={<SchedulesPage />} />
                  <Route path="activity" element={<ActivityPage />} />
                  
                  {/* Catch all - redirect to dashboard */}
                  <Route path="*" element={<Navigate to="dashboard" replace />} />
                </Routes>
              </Suspense>
            </ChecksLayout>
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