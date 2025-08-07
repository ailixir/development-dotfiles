import React from 'react';
import { Container, Typography, Box } from '@mui/material';

const ChecksStudioPage: React.FC = () => {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          Checks Studio
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          UI Testing Studio with three-panel interface (Coming soon in Phase 3)
        </Typography>
      </Box>
    </Container>
  );
};

export default ChecksStudioPage;
