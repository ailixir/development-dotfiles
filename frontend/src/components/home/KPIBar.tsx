import React from 'react';
import { Box, Chip, Grid, Stack, Typography, alpha, useTheme, Skeleton, Alert, Button } from '@mui/material';
import type { DashboardSummary } from '../../types/dashboard/dashboardTypes';
import { CheckCircle, Error, Warning, VolumeOff, HealthAndSafety } from '@mui/icons-material';
import SectionBox from './SectionBox';

interface KPIBarProps {
  summary: DashboardSummary | null | undefined;
  loading?: 'idle' | 'loading' | 'succeeded' | 'failed';
  error?: string | null;
}

const KPIBar: React.FC<KPIBarProps> = ({ summary, loading, error }) => {
  const theme = useTheme();
  const statusColor =
    summary?.overallStatus === 'CRITICAL'
      ? theme.palette.error.main
      : summary?.overallStatus === 'WARNING'
      ? theme.palette.warning.main
      : summary?.overallStatus === 'HEALTHY'
      ? theme.palette.success.main
      : theme.palette.text.secondary;

  const total = (summary?.counts?.passing || 0) + (summary?.counts?.warning || 0) + (summary?.counts?.failing || 0) + (summary?.counts?.muted || 0);
  const pct = (n: number) => (total > 0 ? n / total : 0);

  return (
    <SectionBox
      title="Overall Status"
      icon={<HealthAndSafety />}
      accentColor={statusColor}
    >
      {loading === 'failed' ? (
        <Alert role="alert" severity="error">
          {error || 'Failed to load summary'}
        </Alert>
      ) : !summary ? (
        <Stack spacing={2}>
          <Skeleton variant="text" width={140} height={28} />
          <Skeleton variant="rounded" height={16} />
          <Stack direction="row" spacing={1}>
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} variant="rounded" width={120} height={28} />
            ))}
          </Stack>
        </Stack>
      ) : (
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={2}>
            <Stack spacing={0.5} alignItems="center">
              <Chip
                label={summary.overallStatus}
                sx={{
                  width: 'fit-content',
                  fontWeight: 800,
                  fontSize: '24px',
                  bgcolor: alpha(statusColor, 0.12),
                  color: statusColor,
                }}
              />
              <Typography variant="caption" color="text.secondary">
                Updated {summary.lastUpdated ? new Date(summary.lastUpdated).toLocaleTimeString() : '—'}
              </Typography>
            </Stack>
          </Grid>
          <Grid item xs={12} md={10}>
            {/* Distribution bar */}
            <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', border: `1px solid ${alpha(statusColor, 0.2)}` }}>
              <Box sx={{ flex: pct(summary.counts.passing), bgcolor: theme.palette.success.main, minWidth: summary.counts.passing ? 8 : 0 }} />
              <Box sx={{ flex: pct(summary.counts.warning), bgcolor: theme.palette.warning.main, minWidth: summary.counts.warning ? 8 : 0 }} />
              <Box sx={{ flex: pct(summary.counts.failing), bgcolor: theme.palette.error.main, minWidth: summary.counts.failing ? 8 : 0 }} />
              <Box sx={{ flex: pct(summary.counts.muted), bgcolor: theme.palette.grey[400], minWidth: summary.counts.muted ? 8 : 0 }} />
            </Box>

            {/* KPI chips */}
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1.25 }}>
              <Chip
                icon={<CheckCircle />}
                label={`Passing: ${summary?.counts?.passing ?? 0}`}
                sx={{ bgcolor: alpha(theme.palette.success.main, 0.1), color: theme.palette.success.main }}
              />
              <Chip
                icon={<Warning />}
                label={`Degraded: ${summary?.counts?.warning ?? 0}`}
                sx={{ bgcolor: alpha(theme.palette.warning.main, 0.1), color: theme.palette.warning.main }}
              />
              <Chip
                icon={<Error />}
                label={`Failing: ${summary?.counts?.failing ?? 0}`}
                sx={{ bgcolor: alpha(theme.palette.error.main, 0.1), color: theme.palette.error.main }}
              />
              <Chip
                icon={<VolumeOff />}
                label={`Muted: ${summary?.counts?.muted ?? 0}`}
                sx={{ bgcolor: alpha(theme.palette.grey[500], 0.1), color: theme.palette.text.secondary }}
              />
            </Stack>
          </Grid>
        </Grid>
      )}
    </SectionBox>
  );
};

export default KPIBar;


