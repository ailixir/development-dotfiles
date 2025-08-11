import React from 'react';
import { Box, Typography, Grid, Card, CardContent, Chip, Stack } from '@mui/material';

const scheduled = [
  { id: '1', name: 'Daily Health Summary', nextRun: 'Today 6:00 PM', lastSent: 'Today 6:00 AM', status: 'active' },
  { id: '2', name: 'Weekly Executive Report', nextRun: 'Mon 9:00 AM', lastSent: 'Mon 9:00 AM', status: 'active' },
  { id: '3', name: 'Critical Alerts Digest', nextRun: 'In 4 hours', lastSent: '2 hours ago', status: 'paused' },
];

const ReportsScheduledPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Scheduled Reports</Typography>
      <Grid container spacing={2}>
        {scheduled.map((r) => (
          <Grid key={r.id} item xs={12} md={6} lg={4}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" fontWeight={600}>{r.name}</Typography>
                    <Chip label={r.status} size="small" color={r.status === 'paused' ? 'warning' : 'success'} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">Next: {r.nextRun} • Last sent: {r.lastSent}</Typography>
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


