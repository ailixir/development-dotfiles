import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, useTheme, useMediaQuery } from '@mui/material';
import { PlatformSidebar } from '@put/core-components';

import { 
  CHECKS_NAVIGATION, 
  CHECKS_MODULE_INFO,
  getCurrentPageFromPath 
} from '@/utils/navigation';

interface ChecksLayoutProps {
  children: React.ReactNode;
}

const ChecksLayout: React.FC<ChecksLayoutProps> = ({ children }) => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isMobile);
  const [currentPage, setCurrentPage] = useState<string>('dashboard');

  // Update current page when location changes
  useEffect(() => {
    const pageId = getCurrentPageFromPath(location.pathname);
    setCurrentPage(pageId);
  }, [location.pathname]);

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    setSidebarCollapsed(isMobile);
  }, [isMobile]);

  // Handle page changes from sidebar
  const handlePageChange = (pageId: string) => {
    const page = CHECKS_NAVIGATION.find(p => p.id === pageId);
    if (page) {
      navigate(page.path);
    }
  };

  // Handle sidebar toggle
  const handleToggleSidebar = () => {
    setSidebarCollapsed(prev => !prev);
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <PlatformSidebar
        currentModule={CHECKS_MODULE_INFO.id}
        currentPage={currentPage}
        pages={CHECKS_NAVIGATION}
        onPageChange={handlePageChange}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
      />

      {/* Main content area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: theme.transitions.create(['margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        {/* Page content - no header, handled by platform shell */}
        <Box
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            backgroundColor: theme.palette.background.default,
            padding: 0, // Let individual pages handle their own padding
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default ChecksLayout;
