import React from 'react';
import { Button, List, ListItem, ListItemText, Stack, Typography, useTheme } from '@mui/material';
import SectionBox from './SectionBox';
import { useAppSelector } from '@/store';
import { useNavigate } from 'react-router-dom';

interface ReportsSnapshotProps { maxHeight?: number | string }

const ReportsSnapshot: React.FC<ReportsSnapshotProps> = ({ maxHeight }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { data, loading } = useAppSelector((s) => s.dashboard.reports);

  return (
    <SectionBox
      title="Reports"
      accentColor={theme.palette.success.main}
      action={<Button size="small" onClick={() => navigate('/checks/reports')}>Create report</Button>}
      maxHeight={maxHeight}
    >
      {loading === 'loading' ? (
        <Typography variant="body2" color="text.secondary">Loading…</Typography>
      ) : data.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No reports yet</Typography>
      ) : (
        <List dense disablePadding>
          {data.slice(0, 5).map((r) => (
            <ListItem key={r.id} sx={{ px: 0 }}>
              <ListItemText
                primary={<Typography variant="body2">{r.name}</Typography>}
                secondary={
                  <Typography variant="caption" color="text.secondary">
                    Next: {r.nextScheduledAt ? new Date(r.nextScheduledAt).toLocaleString() : '—'} • Last: {r.lastStatus || '—'}
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

export default ReportsSnapshot;


