import React from 'react';
import { Box, Grid, Card, CardContent, Typography, Chip, Stack, Paper, Divider } from '@mui/material';

// Static CSI directory placeholder per UI implementation plan
const CSIsDirectoryPage: React.FC = () => {
  const placeholderCSIs = [
    { id: '172087', name: 'Automated Management of Production', bu: 'Technology Infrastructure', criticality: 'CRITICAL', tags: ['application:automation-platform', 'team:devops'] },
    { id: '168942', name: 'Core Banking Platform', bu: 'Consumer Banking', criticality: 'CRITICAL', tags: ['application:core-banking', 'team:core-systems'] },
    { id: '174523', name: 'Trading Platform Services', bu: 'Markets & Securities', criticality: 'CRITICAL', tags: ['application:trading-platform', 'team:platform-engineering'] },
    { id: '169834', name: 'Payment Gateway Infrastructure', bu: 'Payments', criticality: 'CRITICAL', tags: ['application:payment-gateway', 'team:payments-team'] },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>CSIs</Typography>
          <Typography variant="body2" color="text.secondary">Directory of CSI systems with health badges and tags</Typography>
        </Box>
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Facets</Typography>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="caption" color="text.secondary">Business Unit</Typography>
            <Stack spacing={0.5} sx={{ mt: 1, mb: 2 }}>
              {['Technology Infrastructure', 'Consumer Banking', 'Markets & Securities', 'Payments'].map(bu => (
                <Chip key={bu} label={bu} size="small" variant="outlined" />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">Criticality</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 2, flexWrap: 'wrap' }}>
              {['CRITICAL', 'HIGH', 'MEDIUM'].map(c => (
                <Chip key={c} label={c} size="small" variant="outlined" />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">Tags</Typography>
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              {[...Array(6)].map((_, i) => (
                <Paper key={i} variant="outlined" sx={{ height: 18 }} />
              ))}
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={9}>
          <Grid container spacing={2}>
            {placeholderCSIs.map(csi => (
              <Grid item xs={12} md={6} key={csi.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="subtitle1" fontWeight={600}>{csi.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{csi.id} • {csi.bu}</Typography>
                      <Stack direction="row" spacing={1}>
                        <Chip label={csi.criticality} color="error" size="small" variant="outlined" />
                        {csi.tags.slice(0, 2).map(t => (
                          <Chip key={t} label={t} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CSIsDirectoryPage;


