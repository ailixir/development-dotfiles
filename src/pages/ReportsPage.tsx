import React from 'react';
import { Container, Typography, Box } from '@mui/material';

const ReportsPage: React.FC = () => {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          Reports & Analytics
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Email reports with live preview and scheduling (Coming soon in Phase 4)
        </Typography>
      </Box>
    </Container>
  );
};

export default ReportsPage;
