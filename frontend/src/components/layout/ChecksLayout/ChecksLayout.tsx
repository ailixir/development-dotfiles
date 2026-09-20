import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Stack, TextField, useTheme, useMediaQuery } from '@mui/material';
import CommandPalette from '@/components/home/CommandPalette';
import HelpDialog from './HelpDialog';
import { useLocation, useNavigate } from 'react-router-dom';
import { PlatformSidebar } from '@put/core-components';
import { useLayout } from '../LayoutProvider';
import { registerChecksNavigation, getCurrentPageId } from '../../../utils/navigation/navigationSetup';
import GlobalSearch from '@/components/home/GlobalSearch';
import Notifications from './Notifications';

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
  const [helpOpen, setHelpOpen] = useState(false);
  
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
  // Match vertical rhythm used by SidebarHeader: larger top padding when expanded
  const contentPaddingTop = 0; // px

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setPaletteOpen((v) => !v);
    }
    if (e.key === '?') {
      e.preventDefault();
      setHelpOpen(true);
    }
    // Quick nav shortcuts
    if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      navigate('/checks/create');
    }
    // Reduced motion preference: no-op shortcut but show how we'd adapt animations if needed
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  const showGlobalSearch = useMemo(() => {
    const p = location.pathname;
    if (p === '/' || p === '/checks') return true; // Home (standalone and host base)
    if (p === '/checks/all') return true; // Checks catalog
    if (p === '/checks/reports') return true; // Reports catalog
    if (p === '/checks/studio') return true; // Studio landing
    if (p.startsWith('/checks/studio/tests')) return true; // Studio Tests
    if (p.startsWith('/checks/studio/runs')) return true; // Studio Runs
    return false;
  }, [location.pathname]);

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
          // Avoid extra offset; host shell provides its own top spacing
          marginTop: 0,
          padding: shouldShowSidebar 
            ? `${contentPaddingTop}px 48px 24px 24px`
            : `${contentPaddingTop}px 24px 24px 24px`,
          transition: 'margin-left 300ms ease',
          '@media (max-width: 1024px)': {
            marginLeft: 0,
            width: '100%',
            padding: '24px',
          },
        }}
      >
          <Box component="div" id="checks-main" tabIndex={-1} sx={{ position: 'absolute', top: 0 }} />
          {showGlobalSearch && (
            <Stack spacing={2} sx={{ mb: 2 }}>
              <GlobalSearch />
            </Stack>
          )}
        {children}
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
          <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
          <Notifications />
      </Box>
    </Box>
  );
};