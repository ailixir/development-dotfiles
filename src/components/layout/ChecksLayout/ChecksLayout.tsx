import React from 'react';
import { Box, useTheme, useMediaQuery } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@store/index';
import { setSidebarCollapsed } from '@store/slices/uiSlice';
import { useLayout } from '../LayoutProvider';
import { CHECKS_NAVIGATION } from '@utils/constants/navigationConfig';

// Mock PlatformSidebar component for development
// This will be replaced with the actual @put/core-components version
const MockPlatformSidebar: React.FC<any> = ({ 
  // currentModule, 
  currentPage, 
  onPageChange, 
  isCollapsed, 
  onToggleCollapse 
}) => (
  <Box
    sx={{
      position: 'fixed',
      left: 0,
      top: 0,
      height: '100vh',
      width: isCollapsed ? '80px' : '200px',
      backgroundColor: '#1a1a1a',
      color: 'white',
      p: 2,
      transition: 'width 0.3s ease',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <Box sx={{ mb: 3, textAlign: 'center' }}>
      <Box 
        component="button"
        onClick={onToggleCollapse}
        sx={{ 
          background: 'none', 
          border: '1px solid #333', 
          color: 'white', 
          p: 1, 
          borderRadius: 1,
          cursor: 'pointer',
          '&:hover': { backgroundColor: '#333' }
        }}
      >
        {isCollapsed ? '→' : '←'}
      </Box>
    </Box>
    
    {!isCollapsed && (
      <Box sx={{ mb: 2, fontSize: '1.1rem', fontWeight: 'bold' }}>
        Checks Module
      </Box>
    )}
    
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {CHECKS_NAVIGATION.map((item) => (
        <Box
          key={item.id}
          component="button"
          onClick={() => onPageChange(item.id, item.path)}
          sx={{
            background: currentPage === item.id ? '#0056c7' : 'none',
            border: 'none',
            color: 'white',
            p: 1.5,
            borderRadius: 1,
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            '&:hover': { 
              backgroundColor: currentPage === item.id ? '#0056c7' : '#333' 
            },
          }}
        >
          <Box sx={{ minWidth: '24px', fontSize: '1.2rem' }}>
            {item.icon === 'dashboard' && '📊'}
            {item.icon === 'checklist' && '✅'}
            {item.icon === 'add_circle' && '➕'}
            {item.icon === 'movie' && '🎬'}
            {item.icon === 'assessment' && '📈'}
          </Box>
          {!isCollapsed && (
            <Box sx={{ flex: 1 }}>
              <Box sx={{ fontSize: '0.9rem', fontWeight: 500 }}>
                {item.label}
              </Box>
              <Box sx={{ fontSize: '0.7rem', color: '#ccc', mt: 0.5 }}>
                {item.description}
              </Box>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  </Box>
);

interface ChecksLayoutProps {
  children: React.ReactNode;
}

export const ChecksLayout: React.FC<ChecksLayoutProps> = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const navigate = useNavigate();
  // const location = useLocation();
  const dispatch = useAppDispatch();
  
  const { deploymentMode } = useLayout();
  const { sidebarCollapsed, currentPage } = useAppSelector(state => state.ui);

  const handlePageChange = (_pageId: string, path: string) => {
    navigate(path);
  };

  const handleToggleCollapse = () => {
    dispatch(setSidebarCollapsed(!sidebarCollapsed));
  };

  // In federated mode, we might not show the sidebar depending on host configuration
  const shouldShowSidebar = deploymentMode === 'standalone' || !isMobile;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {shouldShowSidebar && (
        <MockPlatformSidebar
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
          marginLeft: shouldShowSidebar ? (isMobile ? 0 : sidebarCollapsed ? '80px' : '200px') : 0,
          transition: theme.transitions.create('margin-left', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
          padding: theme.spacing(3),
          backgroundColor: theme.palette.background.default,
          minHeight: '100vh',
          position: 'relative',
        }}
      >
        {children}
      </Box>
    </Box>
  );
};