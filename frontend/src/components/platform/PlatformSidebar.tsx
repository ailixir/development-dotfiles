import { useEffect, useState, type ReactNode } from 'react';
import {
  AssessmentOutlined,
  ChevronLeft,
  ChevronRight,
  ChecklistOutlined,
  HomeOutlined,
  MonitorHeartOutlined,
  MovieOutlined,
  ScienceOutlined,
} from '@mui/icons-material';
import {
  Box,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import { navigationRegistry, type PlatformNavigationItem } from './navigationRegistry';

interface PlatformSidebarProps {
  currentModule: string;
  currentPage: string;
  onPageChange: (pageId: string, path: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: (collapsed: boolean) => void;
}

const iconFor = (name: string) => {
  const icons: Record<string, ReactNode> = {
    home: <HomeOutlined />,
    checklist: <ChecklistOutlined />,
    assessment: <AssessmentOutlined />,
    science: <ScienceOutlined />,
    movie: <MovieOutlined />,
    monitor_heart: <MonitorHeartOutlined />,
  };
  return icons[name] ?? <MonitorHeartOutlined />;
};

export const PlatformSidebar = ({
  currentModule,
  currentPage,
  onPageChange,
  isCollapsed,
  onToggleCollapse,
}: PlatformSidebarProps) => {
  const [, refresh] = useState(0);
  const module = navigationRegistry.get(currentModule);

  useEffect(() => navigationRegistry.subscribe(() => refresh((value) => value + 1)), []);

  const renderItem = (item: PlatformNavigationItem, nested = false) => {
    const selected = currentPage === item.id;
    return (
      <Box key={item.id}>
        <Tooltip title={isCollapsed ? item.label : ''} placement="right">
          <ListItemButton
            selected={selected}
            onClick={() => onPageChange(item.id, item.path)}
            sx={{
              borderRadius: 1,
              mb: 0.5,
              minHeight: 44,
              px: isCollapsed ? 1.5 : nested ? 2.5 : 1.5,
              justifyContent: isCollapsed ? 'center' : 'flex-start',
            }}
          >
            <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 40, color: 'inherit' }}>
              {iconFor(item.icon)}
            </ListItemIcon>
            {!isCollapsed && <ListItemText primary={item.label} secondary={nested ? undefined : item.description} />}
          </ListItemButton>
        </Tooltip>
        {!isCollapsed && item.children?.map((child) => renderItem(child, true))}
      </Box>
    );
  };

  const width = isCollapsed ? 100 : 320;
  return (
    <Box
      component="aside"
      aria-label="Checks navigation"
      sx={{
        width,
        flexShrink: 0,
        position: 'fixed',
        inset: '0 auto 0 0',
        zIndex: 1200,
        overflowY: 'auto',
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        transition: 'width 300ms ease',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', minHeight: 72, px: 1.5 }}>
        {!isCollapsed && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MonitorHeartOutlined color="primary" />
            <Typography variant="h6">{module?.moduleLabel ?? 'Checks'}</Typography>
          </Box>
        )}
        <IconButton aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={() => onToggleCollapse(!isCollapsed)}>
          {isCollapsed ? <ChevronRight /> : <ChevronLeft />}
        </IconButton>
      </Box>
      <Divider />
      <List sx={{ p: 1 }}>{module?.navigation.map((item) => renderItem(item))}</List>
    </Box>
  );
};
