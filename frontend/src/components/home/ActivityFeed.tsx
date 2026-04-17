import React from 'react';
import { Box, Chip, List, ListItem, ListItemText, Stack, Typography, useTheme, Skeleton, alpha, Alert, Button } from '@mui/material';
import SectionBox from './SectionBox';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchActivity } from '@/store/slices/dashboardSlice';

interface ActivityFeedProps { maxHeight?: number | string }

const ActivityFeed: React.FC<ActivityFeedProps> = ({ maxHeight }) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, loading, error } = useAppSelector((s) => s.dashboard.activity);
  const items = Array.isArray(data) ? data : [];

  return (
    <SectionBox title="Activity (24h)" accentColor={theme.palette.primary.main} maxHeight={maxHeight}>
      {loading === 'loading' ? (
        <Stack spacing={1.25}>
          {[...Array(6)].map((_, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Skeleton variant="rounded" width={60} height={24} />
              <Skeleton variant="text" width="60%" />
            </Box>
          ))}
        </Stack>
      ) : loading === 'failed' ? (
        <Alert role="alert" severity="error" action={<Button color="inherit" size="small" onClick={() => dispatch(fetchActivity({ scope: 'ALL', hours: 24 }))}>Retry</Button>}>
          {error || 'Failed to load activity'}
        </Alert>
      ) : items.length === 0 ? (
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">No recent activity</Typography>
          <Button size="small" variant="outlined" onClick={() => dispatch(fetchActivity({ scope: 'ALL', hours: 24 }))}>Refresh Now</Button>
        </Stack>
      ) : (
        <List dense disablePadding>
          {items.slice(0, 12).map((e) => (
            <ListItem
              key={e.id}
              sx={{
                px: 0,
                borderRadius: 1,
                transition: 'background-color 120ms ease, transform 120ms ease',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
              }}
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" label={e.type} variant="outlined" />
                    <Typography variant="body2">{e.title}</Typography>
                  </Stack>
                }
                secondary={
                  <Typography variant="caption" color="text.secondary" aria-label={`${e.description || ''} ${e.csiName || ''} at ${new Date(e.timestamp).toLocaleString()}`}>
                    {e.description} • {e.csiName || ''} • {new Date(e.timestamp).toLocaleString()}
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

export default ActivityFeed;


