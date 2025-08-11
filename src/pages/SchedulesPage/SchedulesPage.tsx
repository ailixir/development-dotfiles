import React from 'react';
import { Box, Typography, Paper, Stack, Skeleton } from '@mui/material';

const SchedulesPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Schedules</Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>Calendar</Typography>
        <Stack spacing={1}>
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={40} />
          ))}
        </Stack>
      </Paper>
    </Box>
  );
};

export default SchedulesPage;


