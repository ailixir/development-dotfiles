import React from 'react';
import { Box, List, ListItem, ListItemText, Typography, useTheme, Skeleton, Stack, alpha, Alert, Button } from '@mui/material';
import SectionBox from './SectionBox';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchUpcomingSchedules } from '@/store/slices/dashboardSlice';

interface UpcomingSchedulesProps { maxHeight?: number | string }

const UpcomingSchedules: React.FC<UpcomingSchedulesProps> = ({ maxHeight }) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, loading, error } = useAppSelector((s) => s.dashboard.upcoming);
  const items = Array.isArray(data) ? data : [];

  return (
    <SectionBox title="Upcoming" accentColor={theme.palette.info.main} maxHeight={maxHeight}>
      {loading === 'loading' ? (
        <Stack spacing={1.25}>
          {[...Array(6)].map((_, i) => (
            <Stack key={i} direction="row" spacing={1.5} alignItems="center">
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="30%" />
            </Stack>
          ))}
        </Stack>
      ) : loading === 'failed' ? (
        <Alert role="alert" severity="error" action={<Button color="inherit" size="small" onClick={() => dispatch(fetchUpcomingSchedules({ limit: 10 }))}>Retry</Button>}>
          {error || 'Failed to load upcoming schedules'}
        </Alert>
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No upcoming schedules</Typography>
      ) : (
        <List dense disablePadding>
          {items.slice(0, 8).map((x: any) => (
            <ListItem
              key={`${x.checkId}-${x.nextExecution}`}
              sx={{ px: 0, borderRadius: 1, transition: 'background-color 120ms ease', '&:hover': { bgcolor: alpha(theme.palette.info.main, 0.04) } }}
            >
              <ListItemText
                primary={<Typography variant="body2">{x.checkName}</Typography>}
                secondary={
                  <Typography variant="caption" color="text.secondary" aria-label={`${x.csiName} scheduled at ${new Date(x.nextExecution).toLocaleString()}`}>
                    {x.csiName} • {new Date(x.nextExecution).toLocaleString()}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </SectionBox>
  );
};

export default UpcomingSchedules;


