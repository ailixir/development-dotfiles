import React from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Alert, AlertTitle } from '@mui/material';

const CheckDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Check Details
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        View and manage details for check: {id}
      </Typography>
      
      <Alert severity="info">
        <AlertTitle>Coming Soon</AlertTitle>
        The Check Details page is under development. This will show check configuration, execution history, and management options.
      </Alert>
    </Box>
  );
};

export default CheckDetailsPage;