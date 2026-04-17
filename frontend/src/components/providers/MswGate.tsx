import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { ensureMswWorkerReady } from '@/services/mocks/initMsw';

export const MswGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await ensureMswWorkerReady();
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '240px',
          gap: 2,
        }}
      >
        <CircularProgress size={32} />
        <Typography variant="body2" color="text.secondary">
          Preparing mock API...
        </Typography>
      </Box>
    );
  }

  return <>{children}</>;
};


