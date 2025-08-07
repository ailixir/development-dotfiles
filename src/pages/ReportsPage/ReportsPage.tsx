import React from 'react';
import { Box, Typography, Alert, AlertTitle, Paper, Grid } from '@mui/material';

const ReportsPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Reports
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Create and schedule email reports with live preview.
      </Typography>
      
      <Grid container spacing={2} sx={{ mt: 2 }}>
        {/* Left Panel - Report Controls */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '400px' }}>
            <Typography variant="h6" gutterBottom>
              Report Builder Controls
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Report configuration, check selection, and scheduling options...
            </Typography>
          </Paper>
        </Grid>

        {/* Right Panel - Live Preview */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '400px' }}>
            <Typography variant="h6" gutterBottom>
              Live Preview
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Real-time email preview with live updates...
            </Typography>
          </Paper>
        </Grid>
      </Grid>
      
      <Alert severity="info" sx={{ mt: 3 }}>
        <AlertTitle>Coming Soon</AlertTitle>
        The Report Builder with live preview is under development. This will provide a two-panel interface for creating scheduled email reports.
      </Alert>
    </Box>
  );
};

export default ReportsPage;