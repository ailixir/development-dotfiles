import React, { useEffect } from 'react';
import { Box, Typography, Grid, Card, CardContent, Chip, Stack, Skeleton, Alert } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchReports } from '@/store/slices/reportsSlice';

const ReportsScheduledPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { data, loading, error } = useAppSelector((s) => s.reports);

  useEffect(() => {
    dispatch(fetchReports(undefined));
  }, [dispatch]);

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Scheduled Reports</Typography>
      <Grid container spacing={2}>
        {loading === 'loading' ? (
          [...Array(6)].map((_, i) => (
            <Grid key={i} item xs={12} md={6} lg={4}>
              <Skeleton variant="rounded" height={96} />
            </Grid>
          ))
        ) : error ? (
          <Grid item xs={12}>
            <Alert severity="error">{error}</Alert>
          </Grid>
        ) : data.length === 0 ? (
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary">No scheduled reports</Typography>
          </Grid>
        ) : data.map((r) => (
          <Grid key={r.id} item xs={12} md={6} lg={4}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" fontWeight={600}>{r.name}</Typography>
                    <Chip label={r.status} size="small" color={r.status === 'paused' ? 'warning' : 'success'} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">Next: {r.schedule?.time ?? '—'} • Last sent: {r.lastSent ? new Date(r.lastSent).toLocaleString() : '—'}</Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default ReportsScheduledPage;


