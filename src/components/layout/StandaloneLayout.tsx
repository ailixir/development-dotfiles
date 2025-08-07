import React from 'react';
import { Box, useTheme } from '@mui/material';
// No platform shell components - these are handled by the host application

interface StandaloneLayoutProps {
  children: React.ReactNode;
}

const StandaloneLayout: React.FC<StandaloneLayoutProps> = ({ children }) => {
  const theme = useTheme();

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: theme.palette.background.default }}>
      {/* Platform shell components (header, welcome) are handled by the host application */}
      {/* This layout is only used when the module runs in standalone mode for development */}
      <Box
        component="main"
        sx={{
          minHeight: '100vh',
          padding: 0, // Let pages handle their own padding
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default StandaloneLayout;
