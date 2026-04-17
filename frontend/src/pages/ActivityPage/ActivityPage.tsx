import React from 'react';
import { Box, Typography, Paper, Stack, Skeleton, Divider } from '@mui/material';

const ActivityPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Activity</Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Stream</Typography>
        <Stack spacing={1} sx={{ mb: 2 }}>
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={32} />
          ))}
        </Stack>
        <Divider />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          Facets are visual-only for now
        </Typography>
      </Paper>
    </Box>
  );
};

export default ActivityPage;


