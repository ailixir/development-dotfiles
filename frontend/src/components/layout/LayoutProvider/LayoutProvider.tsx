import React, { createContext, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@store/index';
import { setDeploymentMode, setCurrentPage } from '@store/slices/uiSlice';
import { DeploymentMode } from '@/types/common/commonTypes';

interface LayoutContextType {
  deploymentMode: DeploymentMode;
  sidebarCollapsed: boolean;
  currentPath: string;
  currentPage: string;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export const useLayout = (): LayoutContextType => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
};

interface LayoutProviderProps {
  children: React.ReactNode;
}

export const LayoutProvider: React.FC<LayoutProviderProps> = ({ children }) => {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const { deploymentMode, sidebarCollapsed, currentPage } = useAppSelector(state => state.ui);

  useEffect(() => {
    // Detect deployment mode based on environment or indicators
    const detectDeploymentMode = (): DeploymentMode => {
      // The Vite standalone entry marks itself, whatever port the dev server picked
      if (window.__CHECKS_STANDALONE__) return 'standalone';

      // Check for Module Federation indicators
      const isModuleFederation = 
        // Check if we're running on a different port than the typical host
        window.location.port === '3000' || 
        // Check if we're in an iframe (host integration)
        window.parent !== window ||
        // Check for MF specific globals
        !!(window as any).__webpack_require__ ||
        // Check if we're not on the default Vite dev port
        (window.location.port !== '5173' && window.location.hostname === 'localhost');
      
      return isModuleFederation ? 'federated' : 'standalone';
    };

    const mode = detectDeploymentMode();
    dispatch(setDeploymentMode(mode));

    if (process.env.NODE_ENV === 'development') {
      console.log(`🏗️ Layout Provider: Deployment mode detected as "${mode}"`);
      console.log('Environment info:', {
        port: window.location.port,
        hostname: window.location.hostname,
        isInIframe: window.parent !== window,
        hasModuleFederation: !!(window as any).__webpack_require__,
      });
    }
  }, [dispatch]);

  useEffect(() => {
    // Update current page based on route
    const getCurrentPageFromPath = (path: string): string => {
      if (path === '/checks' || path === '/') return 'dashboard';
      if (path.startsWith('/checks/all') || path.startsWith('/checks/ui-tests')) return 'all-checks';
      if (path.startsWith('/checks/create') || path.startsWith('/checks/prototype')) return 'create-check';
      if (path.startsWith('/checks/reports')) return 'reports';
      return 'dashboard';
    };

    const newPage = getCurrentPageFromPath(location.pathname);
    if (newPage !== currentPage) {
      dispatch(setCurrentPage(newPage));
    }
  }, [location.pathname, currentPage, dispatch]);

  const contextValue: LayoutContextType = {
    deploymentMode,
    sidebarCollapsed,
    currentPath: location.pathname,
    currentPage,
  };

  return (
    <LayoutContext.Provider value={contextValue}>
      {children}
    </LayoutContext.Provider>
  );
};