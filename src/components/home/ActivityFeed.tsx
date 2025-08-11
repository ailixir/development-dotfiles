import React from 'react';
import { Box, Chip, List, ListItem, ListItemText, Stack, Typography, useTheme } from '@mui/material';
import SectionBox from './SectionBox';
import { useAppSelector } from '@/store';

interface ActivityFeedProps { maxHeight?: number | string }

const ActivityFeed: React.FC<ActivityFeedProps> = ({ maxHeight }) => {
  const theme = useTheme();
  const { data, loading } = useAppSelector((s) => s.dashboard.activity);

  return (
    <SectionBox title="Activity (24h)" accentColor={theme.palette.primary.main} maxHeight={maxHeight}>
      {loading === 'loading' ? (
        <Typography variant="body2" color="text.secondary">Loading…</Typography>
      ) : data.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No recent activity</Typography>
      ) : (
        <List dense disablePadding>
          {data.slice(0, 12).map((e) => (
            <ListItem key={e.id} sx={{ px: 0 }}>
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" label={e.type} variant="outlined" />
                    <Typography variant="body2">{e.title}</Typography>
                  </Stack>
                }
                secondary={
                  <Typography variant="caption" color="text.secondary">
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


