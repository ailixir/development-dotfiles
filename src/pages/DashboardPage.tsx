import React from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Dashboard as DashboardIcon,
} from '@mui/icons-material';

const DashboardPage: React.FC = () => {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          <DashboardIcon sx={{ mr: 2, verticalAlign: 'middle' }} />
          Checks Dashboard
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Monitor and manage all your operational health checks
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <CheckIcon color="success" sx={{ mr: 2 }} />
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Total Checks
                  </Typography>
                  <Typography variant="h4">
                    0
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Welcome to PUT Checks Module
              </Typography>
              <Typography variant="body1" color="text.secondary">
                This is the operational health monitoring module. The implementation is in progress.
                Phase 1.2 infrastructure setup is complete!
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};

export default DashboardPage;
