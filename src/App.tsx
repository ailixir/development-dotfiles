import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { LayoutProvider } from '@components/layout/LayoutProvider';
import { ChecksLayout } from '@components/layout/ChecksLayout';
import { ErrorBoundary } from '@components/shared/ErrorBoundary';

// Lazy load pages for better performance and code splitting
const DashboardPage = React.lazy(() => import('@pages/DashboardPage'));
const AllChecksPage = React.lazy(() => import('@pages/AllChecksPage'));
const CreateCheckPage = React.lazy(
  () => import('./pages/CreateCheckPage/CreateCheckPage')
);
const CheckDetailsPage = React.lazy(() => import('@pages/CheckDetailsPage'));
const ChecksStudioPage = React.lazy(() => import('@pages/ChecksStudioPage'));
const ReportsPage = React.lazy(() => import('@pages/ReportsPage'));

// Loading fallback component
const PageLoadingFallback: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '400px',
      gap: 2,
    }}
  >
    <CircularProgress size={40} />
    <Typography variant="body2" color="text.secondary">
      Loading page...
    </Typography>
  </Box>
);

// Module-level error boundary fallback
const ModuleErrorFallback: React.FC<{ error?: Error }> = ({ error }) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '50vh',
      p: 4,
      textAlign: 'center',
    }}
  >
    <Typography variant="h5" gutterBottom color="error">
      Checks Module Error
    </Typography>
    <Typography variant="body1" color="text.secondary" paragraph>
      The Checks module encountered an error and cannot be displayed.
    </Typography>
    {error && process.env.NODE_ENV === 'development' && (
      <Box
        component="pre"
        sx={{
          backgroundColor: '#f5f5f5',
          p: 2,
          borderRadius: 1,
          fontSize: '0.8rem',
          maxWidth: '100%',
          overflow: 'auto',
          mt: 2,
        }}
      >
        {error.message}
        {error.stack}
      </Box>
    )}
  </Box>
);

const App: React.FC = () => {
  return (
    <ErrorBoundary fallback={<ModuleErrorFallback />}>
      <LayoutProvider>
        <ChecksLayout>
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              {/* Dashboard - Default route */}
              <Route path="/checks" element={<DashboardPage />} />
              <Route path="/" element={<Navigate to="/checks" replace />} />
              
              {/* Check Management */}
              <Route path="/checks/all" element={<AllChecksPage />} />
              <Route path="/checks/create" element={<CreateCheckPage />} />
              <Route path="/checks/details/:id" element={<CheckDetailsPage />} />
              
              {/* Checks Studio */}
              <Route path="/checks/studio" element={<ChecksStudioPage />} />
              <Route path="/checks/studio/:id" element={<ChecksStudioPage />} />
              
              {/* Reports */}
              <Route path="/checks/reports" element={<ReportsPage />} />
              <Route path="/checks/reports/:id" element={<ReportsPage />} />
              
              {/* Catch all - redirect to dashboard */}
              <Route path="*" element={<Navigate to="/checks" replace />} />
            </Routes>
          </Suspense>
        </ChecksLayout>
      </LayoutProvider>
    </ErrorBoundary>
  );
};

export default App;