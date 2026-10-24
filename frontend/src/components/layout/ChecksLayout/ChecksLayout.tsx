import CommandPalette from '@/components/home/CommandPalette';
import GlobalSearch from '@/components/home/GlobalSearch';
import { Box, Button, Drawer, IconButton, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Close, Menu } from '@mui/icons-material';
import { PlatformSidebar } from '@put/core-components';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCurrentPageId, registerChecksNavigation } from '../../../utils/navigation/navigationSetup';
import { useLayout } from '../LayoutProvider';
import HelpDialog from './HelpDialog';
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
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
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
    setMobileNavigationOpen(false);
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
  }, [navigate]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  const showGlobalSearch = useMemo(() => {
    const p = location.pathname;
    if (p === '/' || p === '/checks') return true; // Home (standalone and host base)
    if (p === '/checks/all') return true; // Checks catalog
    if (p === '/checks/reports') return true; // Reports catalog
    if (p.startsWith('/checks/studio/tests')) return true; // Studio Tests
    return false;
  }, [location.pathname]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Box
        component="a"
        href="#checks-main"
        onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
          // A hash href moves the viewport but not focus, and jsdom does not even do that. The
          // landmark carries tabIndex={-1} precisely so it can take focus here.
          event.preventDefault();
          document.getElementById('checks-main')?.focus();
        }}
        sx={{
          position: 'fixed',
          left: 16,
          top: -48,
          zIndex: 1300,
          px: 2,
          py: 1,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: 1,
          '&:focus': { top: 16 },
        }}
      >
        Skip to main content
      </Box>
      {shouldShowSidebar && !isMobile && (
        <PlatformSidebar
          key={`checks-sidebar-${currentPage}`}
          currentModule="checks"
          currentPage={currentPage}
          onPageChange={handlePageChange}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      )}
      {shouldShowSidebar && isMobile && (
        <Drawer open={mobileNavigationOpen} onClose={() => setMobileNavigationOpen(false)} PaperProps={{ sx: { width: 300, maxWidth: '85vw' } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>Navigation</Typography>
            <IconButton aria-label="Close navigation" onClick={() => setMobileNavigationOpen(false)}><Close /></IconButton>
          </Stack>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <PlatformSidebar
              currentModule="checks"
              currentPage={currentPage}
              onPageChange={handlePageChange}
              isCollapsed={false}
              showCollapseToggle={false}
              style={{ position: 'relative', top: 0, left: 0, width: '100%', height: '100%', margin: 0, marginTop: 0, borderRadius: 0, boxShadow: 'none' }}
            />
          </Box>
        </Drawer>
      )}
      
        <Box
        component="main"
        id="checks-main"
        tabIndex={-1}
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
          {shouldShowSidebar && isMobile && <Button startIcon={<Menu />} aria-expanded={mobileNavigationOpen} onClick={() => setMobileNavigationOpen(true)} sx={{ mb: 2 }}>Navigation</Button>}
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
