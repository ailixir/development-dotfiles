import React from 'react';
import { Box, Typography, Alert, AlertTitle } from '@mui/material';

const AllChecksPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        All Checks
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Manage and monitor all health checks across your systems.
      </Typography>
      
      <Alert severity="info">
        <AlertTitle>Coming Soon</AlertTitle>
        The All Checks page is under development. This will include check listing, filtering, and bulk operations.
      </Alert>
    </Box>
  );
};

export default AllChecksPage;