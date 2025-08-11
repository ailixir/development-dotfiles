import React from 'react';
import { Box, Typography, Card, CardContent, Grid, Chip, Stack, Skeleton } from '@mui/material';

const runs = [
  { id: 'run-001', name: 'Trading Platform Login Flow', status: 'passed', started: '2025-01-07 10:30', duration: '2.4s' },
  { id: 'run-002', name: 'Payment Gateway Test', status: 'running', started: '2025-01-07 10:32', duration: '—' },
  { id: 'run-003', name: 'Market Data Visualization', status: 'failed', started: '2025-01-07 10:28', duration: '3.1s' },
];

const colorFor = (status: string) => (status === 'passed' ? 'success' : status === 'running' ? 'info' : status === 'failed' ? 'error' : 'default');

const StudioRunsPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Studio Runs</Typography>
      <Grid container spacing={2}>
        {runs.map((r) => (
          <Grid key={r.id} item xs={12} md={6} lg={4}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" fontWeight={600}>{r.name}</Typography>
                    <Chip label={r.status} color={colorFor(r.status) as any} size="small" />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">Started: {r.started} • Duration: {r.duration}</Typography>
                  <Skeleton variant="rounded" height={120} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default StudioRunsPage;


