import React from 'react';
import { Container, Typography, Box } from '@mui/material';

const CheckDetailsPage: React.FC = () => {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          Check Details
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          View check details and execution history (Coming soon in Phase 2)
        </Typography>
      </Box>
    </Container>
  );
};

export default CheckDetailsPage;
