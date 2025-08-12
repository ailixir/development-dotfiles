import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { LayoutProvider } from '@components/layout/LayoutProvider';
import { ChecksLayout } from '@components/layout/ChecksLayout';
import { ErrorBoundary } from '@components/shared/ErrorBoundary';

// Lazy load pages for better performance and code splitting
const HomePage = React.lazy(() => import('@pages/HomePage'));
const AllChecksPage = React.lazy(() => import('@pages/AllChecksPage'));
const CreateCheckPage = React.lazy(
  () => import('./pages/CreateCheckPage/CreateCheckPage')
);
const CheckDetailsPage = React.lazy(() => import('@pages/CheckDetailsPage'));
const EditCheckPage = React.lazy(() => import('@pages/CreateCheckPage')); // reuse create page in edit mode
const ChecksStudioPage = React.lazy(() => import('@pages/ChecksStudioPage'));
const ReportsPage = React.lazy(() => import('@pages/ReportsPage'));
const ReportsHome = React.lazy(() => import('./pages/Reports/ReportsHome'));
const ReportBuilder = React.lazy(() => import('./pages/Reports/ReportBuilder'));
const ReportDetailsPage = React.lazy(() => import('./pages/Reports/ReportDetailsPage'));
// CSIs directory and overview removed
const StudioRunsPage = React.lazy(() => import('@pages/StudioRunsPage'));
const StudioTestsPage = React.lazy(() => import('@pages/StudioTestsPage'));
const ReportsScheduledPage = React.lazy(() => import('@pages/ReportsScheduledPage'));
const ReportsAnalyticsPage = React.lazy(() => import('@pages/ReportsAnalyticsPage'));
const ActivityPage = React.lazy(() => import('@pages/ActivityPage'));
const SchedulesPage = React.lazy(() => import('@pages/SchedulesPage'));

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
              {/* Home - Default route */}
              <Route path="/checks" element={<Navigate to="/" replace />} />
              <Route path="/" element={<HomePage />} />
              
              {/* Check Management */}
              <Route path="/checks/all" element={<AllChecksPage />} />
              <Route path="/checks/create" element={<CreateCheckPage />} />
              <Route path="/checks/details/:id" element={<CheckDetailsPage />} />
              <Route path="/checks/edit/:id" element={<EditCheckPage />} />
              {/* Templates route removed per product decision */}
              
              {/* Checks Studio */}
              <Route path="/checks/studio" element={<ChecksStudioPage />} />
              <Route path="/checks/studio/tests" element={<StudioTestsPage />} />
              <Route path="/checks/studio/runs" element={<StudioRunsPage />} />
              <Route path="/checks/studio/:id" element={<ChecksStudioPage />} />
              
              {/* Reports */}
              <Route path="/checks/reports" element={<ReportsHome />} />
              <Route path="/checks/reports/new" element={<ReportBuilder />} />
              <Route path="/checks/reports/:id" element={<ReportDetailsPage />} />
              <Route path="/checks/reports/:id/edit" element={<ReportBuilder />} />
              <Route path="/checks/reports/scheduled" element={<ReportsScheduledPage />} />
              <Route path="/checks/reports/analytics" element={<ReportsAnalyticsPage />} />

              {/* CSIs */}
              <Route path="/checks/csis" element={<Navigate to="/" replace />} />
              <Route path="/checks/csis/:csiId" element={<Navigate to="/" replace />} />

              {/* Activity & Schedules */}
              <Route path="/checks/activity" element={<ActivityPage />} />
              <Route path="/checks/schedules" element={<SchedulesPage />} />
              
              {/* Catch all - redirect to home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ChecksLayout>
      </LayoutProvider>
    </ErrorBoundary>
  );
};

export default App;