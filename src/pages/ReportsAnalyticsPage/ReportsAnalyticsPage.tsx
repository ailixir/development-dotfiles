import React from 'react';
import { Box, Typography, Grid, Card, CardContent, LinearProgress, alpha } from '@mui/material';

const ReportsAnalyticsPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Reports Analytics</Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Open Rate</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>87.3%</Typography>
              <LinearProgress variant="determinate" value={87.3} sx={{ mt: 1, height: 6, borderRadius: 3, backgroundColor: (t) => alpha(t.palette.success.main, 0.2) }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Click Rate</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'info.main' }}>45.2%</Typography>
              <LinearProgress variant="determinate" value={45.2} sx={{ mt: 1, height: 6, borderRadius: 3, backgroundColor: (t) => alpha(t.palette.info.main, 0.2) }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Delivery Success</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'warning.main' }}>99.1%</Typography>
              <LinearProgress variant="determinate" value={99.1} sx={{ mt: 1, height: 6, borderRadius: 3, backgroundColor: (t) => alpha(t.palette.warning.main, 0.2) }} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ReportsAnalyticsPage;


