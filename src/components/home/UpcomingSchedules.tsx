import React from 'react';
import { Box, List, ListItem, ListItemText, Typography, useTheme } from '@mui/material';
import SectionBox from './SectionBox';
import { useAppSelector } from '@/store';

interface UpcomingSchedulesProps { maxHeight?: number | string }

const UpcomingSchedules: React.FC<UpcomingSchedulesProps> = ({ maxHeight }) => {
  const theme = useTheme();
  const { data, loading } = useAppSelector((s) => s.dashboard.upcoming);
  const items = Array.isArray(data) ? data : [];

  return (
    <SectionBox title="Upcoming" accentColor={theme.palette.info.main} maxHeight={maxHeight}>
      {loading === 'loading' ? (
        <Typography variant="body2" color="text.secondary">Loading…</Typography>
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No upcoming schedules</Typography>
      ) : (
        <List dense disablePadding>
          {items.slice(0, 8).map((x: any) => (
            <ListItem key={`${x.checkId}-${x.nextExecution}`} sx={{ px: 0 }}>
              <ListItemText
                primary={<Typography variant="body2">{x.checkName}</Typography>}
                secondary={
                  <Typography variant="caption" color="text.secondary">
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


