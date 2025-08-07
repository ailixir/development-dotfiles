import React, { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoadingFallback from '@/components/common/LoadingFallback';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import LayoutProvider from '@/components/layout/LayoutProvider';

// Lazy load pages for better performance
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const CheckListPage = lazy(() => import('@/pages/CheckListPage'));
const CheckDetailsPage = lazy(() => import('@/pages/CheckDetailsPage'));
const CheckBuilderPage = lazy(() => import('@/pages/CheckBuilderPage'));
const ChecksStudioPage = lazy(() => import('@/pages/ChecksStudioPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const ChecksRoutes: React.FC = () => {
  return (
    <ErrorBoundary>
      <React.Suspense fallback={<LoadingFallback message="Loading page..." />}>
        <LayoutProvider>
          <Routes>
            {/* Default route redirects to dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            {/* Module routes */}
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/list" element={<CheckListPage />} />
            <Route path="/new" element={<CheckBuilderPage />} />
            <Route path="/studio" element={<ChecksStudioPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            
            {/* Dynamic routes */}
            <Route path="/:id" element={<CheckDetailsPage />} />
            <Route path="/:id/edit" element={<CheckBuilderPage />} />
            
            {/* 404 page */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </LayoutProvider>
      </React.Suspense>
    </ErrorBoundary>
  );
};

export default ChecksRoutes;
