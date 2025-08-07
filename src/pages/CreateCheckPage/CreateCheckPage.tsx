import React from 'react';
import { Box, Typography, Alert, AlertTitle } from '@mui/material';

const CreateCheckPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Create New Check
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Build new health checks for your applications and infrastructure.
      </Typography>
      
      <Alert severity="info">
        <AlertTitle>Coming Soon</AlertTitle>
        The Check Builder is under development. This will include a multi-step wizard for creating all 6 check types.
      </Alert>
    </Box>
  );
};

export default CreateCheckPage;