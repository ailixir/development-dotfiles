import React, { useState, useEffect, useCallback } from 'react';
import { Box, Stack, TextField, useTheme, useMediaQuery } from '@mui/material';
import CommandPalette from '@/components/home/CommandPalette';
import { useLocation, useNavigate } from 'react-router-dom';
import { PlatformSidebar } from '@put/core-components';
import { useLayout } from '../LayoutProvider';
import { registerChecksNavigation, getCurrentPageId } from '../../../utils/navigation/navigationSetup';
import ScopeBar from '@components/common/ScopeBar/ScopeBar';
import GlobalSearch from '@/components/home/GlobalSearch';

interface ChecksLayoutProps {
  children: React.ReactNode;
}

export const ChecksLayout: React.FC<ChecksLayoutProps> = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const navigate = useNavigate();
  const location = useLocation();
  const [currentPage, setCurrentPage] = useState('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  
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
  const sidebarSpace = shouldShowSidebar ? (sidebarCollapsed ? 100 : 320) : 0;

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setPaletteOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {shouldShowSidebar && (
        <PlatformSidebar
          key={`checks-sidebar-${currentPage}`}
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
          // Reserve space for the sidebar without causing overflow
          marginLeft: isMobile ? 0 : `${sidebarSpace}px`,
          width: isMobile ? '100%' : `calc(100% - ${sidebarSpace}px)`,
          marginTop: '80px',
          padding: shouldShowSidebar ? '24px 48px 24px 24px' : theme.spacing(3),
          transition: 'margin-left 300ms ease',
          '@media (max-width: 1024px)': {
            marginLeft: 0,
            width: '100%',
            padding: '24px',
          },
        }}
      >
          <Stack spacing={2} sx={{ mb: 2 }}>
            <GlobalSearch />
          </Stack>
        {children}
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </Box>
    </Box>
  );
};