import React from 'react';
import { Box, Typography, Alert, AlertTitle, Paper, Grid } from '@mui/material';

const ChecksStudioPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Checks Studio
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Create and run UI tests with plain English commands and watch video playback.
      </Typography>
      
      <Grid container spacing={2} sx={{ mt: 2 }}>
        {/* Left Panel - Test Steps */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '400px' }}>
            <Typography variant="h6" gutterBottom>
              Test Steps (Your Checklist)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Write your test steps in plain English...
            </Typography>
          </Paper>
        </Grid>

        {/* Middle Panel - Control */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '400px' }}>
            <Typography variant="h6" gutterBottom>
              Control Tower
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Run Test button and live logs will appear here...
            </Typography>
          </Paper>
        </Grid>

        {/* Right Panel - Video */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '400px' }}>
            <Typography variant="h6" gutterBottom>
              Visual Proof (Video)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Video player with synchronized playback...
            </Typography>
          </Paper>
        </Grid>
      </Grid>
      
      <Alert severity="info" sx={{ mt: 3 }}>
        <AlertTitle>Coming Soon</AlertTitle>
        The Checks Studio three-panel interface is under development. This will provide a complete "From Checklist to Reality" UI testing experience.
      </Alert>
    </Box>
  );
};

export default ChecksStudioPage;