import React, { Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
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
// Removed Scheduled and Analytics pages
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

const ModuleShell: React.FC = () => (
  <ErrorBoundary fallback={<ModuleErrorFallback />}>
    <LayoutProvider>
      <ChecksLayout>
        <Suspense fallback={<PageLoadingFallback />}>
          <Outlet />
        </Suspense>
      </ChecksLayout>
    </LayoutProvider>
  </ErrorBoundary>
);

const App: React.FC = () => {
  return (
    <Routes>
      {/* Host mount: explicit /checks base */}
      <Route path="/checks/*" element={<ModuleShell />}>
        <Route index element={<HomePage />} />
        <Route path="all" element={<AllChecksPage />} />
        <Route path="create" element={<CreateCheckPage />} />
        <Route path="details/:id" element={<CheckDetailsPage />} />
        <Route path="edit/:id" element={<EditCheckPage />} />
        <Route path="studio" element={<ChecksStudioPage />} />
        <Route path="studio/tests" element={<StudioTestsPage />} />
        <Route path="studio/runs" element={<StudioRunsPage />} />
        <Route path="studio/:id" element={<ChecksStudioPage />} />
        <Route path="reports" element={<ReportsHome />} />
        <Route path="reports/new" element={<ReportBuilder />} />
        <Route path="reports/:id" element={<ReportDetailsPage />} />
        <Route path="reports/:id/edit" element={<ReportBuilder />} />
        <Route path="csis" element={<Navigate to="." replace />} />
        <Route path="csis/:csiId" element={<Navigate to="." replace />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="schedules" element={<SchedulesPage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>

      {/* Layout route captures current base (e.g., /checks/* in host, or /* in standalone) */}
      <Route path="/*" element={<ModuleShell />}>
        {/* Home */}
        <Route index element={<HomePage />} />

        {/* Check Management */}
        <Route path="all" element={<AllChecksPage />} />
        <Route path="create" element={<CreateCheckPage />} />
        <Route path="details/:id" element={<CheckDetailsPage />} />
        <Route path="edit/:id" element={<EditCheckPage />} />

        {/* Checks Studio */}
        <Route path="studio" element={<ChecksStudioPage />} />
        <Route path="studio/tests" element={<StudioTestsPage />} />
        <Route path="studio/runs" element={<StudioRunsPage />} />
        <Route path="studio/:id" element={<ChecksStudioPage />} />

        {/* Reports */}
        <Route path="reports" element={<ReportsHome />} />
        <Route path="reports/new" element={<ReportBuilder />} />
        <Route path="reports/:id" element={<ReportDetailsPage />} />
        <Route path="reports/:id/edit" element={<ReportBuilder />} />

        {/* CSIs */}
        <Route path="csis" element={<Navigate to="." replace />} />
        <Route path="csis/:csiId" element={<Navigate to="." replace />} />

        {/* Activity & Schedules */}
        <Route path="activity" element={<ActivityPage />} />
        <Route path="schedules" element={<SchedulesPage />} />

        {/* Catch all - redirect to module home */}
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
    </Routes>
  );
};

export default App;