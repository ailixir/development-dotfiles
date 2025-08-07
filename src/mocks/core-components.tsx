// Mock implementation of @put/core-components PlatformSidebar for development
// Only includes PlatformSidebar since platform shell components are handled by the host

import React from 'react';
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Box,
  Typography,
  Chip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  Dashboard as DashboardIcon,
  List as ListIcon,
  Add as AddIcon,
  PlayCircle as PlayIcon,
  Assessment as AssessmentIcon,
  HealthAndSafety as HealthIcon,
} from '@mui/icons-material';

// Mock types for PlatformSidebar
interface PageConfig {
  id: string;
  title: string;
  path: string;
  icon: string;
  description?: string;
  badge?: number | string;
  disabled?: boolean;
}

// Mock PlatformSidebar
interface PlatformSidebarProps {
  currentModule: string;
  currentPage: string;
  pages: PageConfig[];
  onPageChange: (pageId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse?: () => void;
}

export const PlatformSidebar: React.FC<PlatformSidebarProps> = ({
  currentPage,
  pages,
  onPageChange,
  isCollapsed,
  onToggleCollapse,
}) => {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'dashboard': return <DashboardIcon />;
      case 'list': return <ListIcon />;
      case 'add_circle': return <AddIcon />;
      case 'play_circle': return <PlayIcon />;
      case 'assessment': return <AssessmentIcon />;
      default: return <DashboardIcon />;
    }
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: isCollapsed ? 64 : 280,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: isCollapsed ? 64 : 280,
          boxSizing: 'border-box',
          borderRight: '1px solid rgba(0, 0, 0, 0.12)',
          backgroundColor: '#fafafa',
          transition: 'width 0.2s',
        },
      }}
    >
      <Box sx={{ p: 2, borderBottom: '1px solid rgba(0, 0, 0, 0.12)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HealthIcon color="primary" />
          {!isCollapsed && (
            <Typography variant="h6" component="div">
              Checks
            </Typography>
          )}
          {onToggleCollapse && (
            <IconButton onClick={onToggleCollapse} size="small" sx={{ ml: 'auto' }}>
              {isCollapsed ? <MenuIcon /> : <ChevronLeftIcon />}
            </IconButton>
          )}
        </Box>
      </Box>

      <List sx={{ pt: 1 }}>
        {pages.map((page) => (
          <ListItemButton
            key={page.id}
            selected={currentPage === page.id}
            onClick={() => onPageChange(page.id)}
            sx={{
              mx: 1,
              borderRadius: 1,
              '&.Mui-selected': {
                backgroundColor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': {
                  backgroundColor: 'primary.dark',
                },
                '& .MuiListItemIcon-root': {
                  color: 'primary.contrastText',
                },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: isCollapsed ? 'auto' : 40 }}>
              {getIcon(page.icon)}
            </ListItemIcon>
            {!isCollapsed && (
              <ListItemText 
                primary={page.title}
                secondary={page.description}
                secondaryTypographyProps={{ 
                  variant: 'caption',
                  sx: { opacity: 0.7 }
                }}
              />
            )}
            {!isCollapsed && page.badge && (
              <Chip 
                label={page.badge} 
                size="small" 
                color="secondary"
                sx={{ ml: 1 }}
              />
            )}
          </ListItemButton>
        ))}
      </List>
    </Drawer>
  );
};




