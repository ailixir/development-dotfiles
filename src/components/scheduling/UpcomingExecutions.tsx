import React, { useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Button,
  Stack,
  useTheme,
  alpha,
  Divider,
  Skeleton,
} from '@mui/material';
import { Schedule, Refresh } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchUpcomingExecutions } from '@store/slices/checksSlice';
import { useNavigate } from 'react-router-dom';

interface UpcomingExecutionsProps {
  maxItems?: number;
  showActions?: boolean;
}

const UpcomingExecutions: React.FC<UpcomingExecutionsProps> = ({ 
  maxItems = 10,
  showActions = true 
}) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  
  const { upcomingExecutions, loading } = useAppSelector(state => state.checks);
  const executions = Array.isArray(upcomingExecutions) ? upcomingExecutions : [];
  
  useEffect(() => {
    dispatch(fetchUpcomingExecutions(maxItems));
  }, [dispatch, maxItems]);

  const handleRefresh = () => {
    dispatch(fetchUpcomingExecutions(maxItems));
  };

  const getTimeUntilExecution = (nextExecution: string): { text: string; color: string } => {
    const now = new Date();
    const execution = new Date(nextExecution);
    const diffMs = execution.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 0) {
      return { text: 'Overdue', color: theme.palette.error.main };
    } else if (diffMinutes < 5) {
      return { text: `${diffMinutes}m`, color: theme.palette.warning.main };
    } else if (diffMinutes < 60) {
      return { text: `${diffMinutes}m`, color: theme.palette.info.main };
    } else {
      const hours = Math.floor(diffMinutes / 60);
      const mins = diffMinutes % 60;
      return { 
        text: hours > 0 ? `${hours}h ${mins > 0 ? mins + 'm' : ''}` : `${mins}m`,
        color: theme.palette.text.secondary 
      };
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'critical': return theme.palette.error.main;
      case 'high': return theme.palette.warning.main;
      case 'medium': return theme.palette.info.main;
      case 'low': return theme.palette.success.main;
      default: return theme.palette.text.secondary;
    }
  };

  if (loading === 'loading') {
    return (
      <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} mb={2}>
            Upcoming Executions
          </Typography>
          <Stack spacing={2}>
            {[...Array(5)].map((_, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Skeleton variant="circular" width={24} height={24} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="40%" />
                </Box>
                <Skeleton variant="rectangular" width={60} height={24} />
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" fontWeight={600}>
            Upcoming Executions
          </Typography>
          {showActions && (
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Refresh />}
                onClick={handleRefresh}
              >
                Refresh
              </Button>
            </Stack>
          )}
        </Stack>

        {executions.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Schedule sx={{ fontSize: 48, color: theme.palette.text.secondary, mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No upcoming executions scheduled
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {executions.slice(0, maxItems).map((execution, index) => {
              const timeInfo = getTimeUntilExecution(execution.nextExecution);
              // Find priority from check data (would need to be included in API response)
              const priority = 'medium'; // Default priority
              
              return (
                <React.Fragment key={execution.checkId}>
                  <ListItem
                    disablePadding
                    sx={{
                      py: 2,
                      cursor: 'pointer',
                      borderRadius: 1,
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.04)
                      }
                    }}
                    onClick={() => navigate(`/checks/${execution.checkId}`)}
                  >
                    <ListItemIcon>
                      <Schedule sx={{ color: timeInfo.color }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography variant="subtitle2" fontWeight={600}>
                            {execution.checkName}
                          </Typography>
                          <Chip 
                            label={priority} 
                            size="small" 
                            sx={{ 
                              bgcolor: alpha(getPriorityColor(priority), 0.1),
                              color: getPriorityColor(priority),
                              height: 20,
                              fontSize: '0.75rem'
                            }} 
                          />
                        </Stack>
                      }
                      secondary={
                        <Stack direction="row" alignItems="center" spacing={2} mt={0.5}>
                          <Typography variant="caption" color="text.secondary">
                            {execution.csiName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            •
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(execution.nextExecution).toLocaleString()}
                          </Typography>
                        </Stack>
                      }
                    />
                    <Box sx={{ textAlign: 'right' }}>
                      <Chip
                        label={timeInfo.text}
                        size="small"
                        sx={{
                          bgcolor: alpha(timeInfo.color, 0.1),
                          color: timeInfo.color,
                          fontWeight: 600
                        }}
                      />
                    </Box>
                  </ListItem>
                  {index < Math.min(executions.length, maxItems) - 1 && (
                    <Divider variant="inset" component="li" />
                  )}
                </React.Fragment>
              );
            })}
          </List>
        )}

        {executions.length > maxItems && showActions && (
          <Box sx={{ textAlign: 'center', mt: 2, pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => navigate('/checks')}
            >
              View All ({executions.length} total)
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default UpcomingExecutions;