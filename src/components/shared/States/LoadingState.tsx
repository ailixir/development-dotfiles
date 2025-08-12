import React from 'react';
import { Box, LinearProgress, Stack, Typography } from '@mui/material';

interface LoadingStateProps {
  label?: string;
}

const LoadingState: React.FC<LoadingStateProps> = ({ label = 'Loading…' }) => {
  return (
    <Box sx={{ py: 3 }}>
      <Stack spacing={1} alignItems="center">
        <LinearProgress sx={{ width: '100%', maxWidth: 480, height: 6, borderRadius: 3 }} />
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Stack>
    </Box>
  );
};

export default LoadingState;


