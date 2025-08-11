import React from 'react';
import { Box, Grid, Card, CardContent, Typography, Chip, Stack } from '@mui/material';
import { Api, Storage, AutoGraph, Security, BugReport, Science } from '@mui/icons-material';

const templates = [
  { icon: Api, title: 'HTTP/HTTPS Check', description: 'Monitor API endpoint availability and status code' },
  { icon: Storage, title: 'TCP Port Check', description: 'Verify TCP port connectivity' },
  { icon: AutoGraph, title: 'Splunk Log Query', description: 'Search logs for events and thresholds' },
  { icon: AutoGraph, title: 'Grafana Metric Threshold', description: 'Alert on metric threshold crossings' },
  { icon: Security, title: 'ITRS Sampler Status', description: 'Track ITRS sampler state' },
  { icon: BugReport, title: 'AppDynamics Health Rule', description: 'Watch APM health rule violations' },
  { icon: Science, title: 'UI Test (No Code)', description: 'Define browser steps using plain English' },
];

const ChecksTemplatesPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Templates</Typography>
      <Grid container spacing={2}>
        {templates.map(({ icon: Icon, title, description }) => (
          <Grid key={title} item xs={12} md={6} lg={4}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Icon />
                    <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">{description}</Typography>
                  <Stack direction="row" spacing={1}>
                    <Chip label="Use template" variant="outlined" />
                    <Chip label="Preview" variant="outlined" />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default ChecksTemplatesPage;


