import React from 'react';
import { Button, List, ListItem, ListItemText, Stack, Typography, useTheme, Skeleton, alpha, Alert } from '@mui/material';
import SectionBox from './SectionBox';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchReportsSnapshot } from '@/store/slices/dashboardSlice';
import { useNavigate } from 'react-router-dom';

interface ReportsSnapshotProps { maxHeight?: number | string }

const ReportsSnapshot: React.FC<ReportsSnapshotProps> = ({ maxHeight }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { data, loading, error } = useAppSelector((s) => s.dashboard.reports);

  return (
      <SectionBox
      title="Reports"
      accentColor={theme.palette.success.main}
      action={<Button size="small" onClick={() => navigate('/checks/reports')}>View all</Button>}
      maxHeight={maxHeight}
    >
      {loading === 'loading' ? (
        <Stack spacing={1.25}>
          {[...Array(4)].map((_, i) => (
            <Stack key={i} direction="row" spacing={1.5} alignItems="center">
              <Skeleton variant="text" width="50%" />
            </Stack>
          ))}
        </Stack>
      ) : loading === 'failed' ? (
        <Alert role="alert" severity="error" onClose={() => dispatch(fetchReportsSnapshot({ limit: 5 }))}>{error || 'Failed to load reports'}</Alert>
      ) : data.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No reports yet</Typography>
      ) : (
        <List dense disablePadding>
          {data.slice(0, 5).map((r) => (
            <ListItem
              key={r.id}
              sx={{ px: 0, borderRadius: 1, transition: 'background-color 120ms ease', '&:hover': { bgcolor: alpha(theme.palette.success.main, 0.04) } }}
              onClick={() => navigate(`/checks/reports/${r.id}`)}
              role="button"
              aria-label={`Open report ${r.name}`}
            >
              <ListItemText
                primary={<Typography variant="body2">{r.name}</Typography>}
                secondary={
                  <Typography variant="caption" color="text.secondary" aria-label={`Next ${r.nextScheduledAt ? new Date(r.nextScheduledAt).toLocaleString() : 'not scheduled'}; Last ${r.lastStatus || 'unknown'}`}>
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


