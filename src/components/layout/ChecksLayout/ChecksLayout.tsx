import React, { useState, useEffect } from 'react';
import { Box, useTheme, useMediaQuery } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { PlatformSidebar } from '@put/core-components';
import { useLayout } from '../LayoutProvider';
import { registerChecksNavigation, getCurrentPageId } from '../../../utils/navigation/navigationSetup';

interface ChecksLayoutProps {
  children: React.ReactNode;
}

export const ChecksLayout: React.FC<ChecksLayoutProps> = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const navigate = useNavigate();
  const location = useLocation();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const { deploymentMode } = useLayout();

  // Register navigation on component mount
  useEffect(() => {
    registerChecksNavigation();
  }, []);

  // Update current page when location changes
  useEffect(() => {
    const pageId = getCurrentPageId(location.pathname);
    setCurrentPage(pageId);
  }, [location.pathname]);

  const handlePageChange = (pageId: string, path: string) => {
    setCurrentPage(pageId);
    navigate(path);
  };

  const handleToggleCollapse = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
  };

  // In federated mode, we might not show the sidebar depending on host configuration
  const shouldShowSidebar = deploymentMode === 'standalone' || !isMobile;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {shouldShowSidebar && (
        <PlatformSidebar
          currentModule="checks"
          currentPage={currentPage}
          onPageChange={handlePageChange}
          isCollapsed={isMobile ? false : sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      )}
      
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          backgroundColor: theme.palette.background.default,
          minHeight: '100vh',
          // Apply proper spacing based on sidebar state
          marginLeft: shouldShowSidebar ? (sidebarCollapsed ? '100px' : '320px') : 0,
          marginTop: '80px',
          padding: shouldShowSidebar ? '24px 48px 24px 24px' : theme.spacing(3),
          transition: 'margin-left 300ms ease',
          '@media (max-width: 1024px)': {
            marginLeft: 0,
            padding: '24px',
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
};