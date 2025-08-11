import React, { useEffect, useState } from 'react';
import { Box, Card, CardActionArea, CardContent, Grid, Stack, Typography, alpha, useTheme } from '@mui/material';
import { useAppSelector } from '@/store';
import apiClient from '@/services/api/apiClient';

interface HealthSummary {
  csiId: string;
  totalChecks: number;
  passingChecks: number;
  failingChecks: number;
  warningChecks: number;
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

const StatusBadge: React.FC<{ status: HealthSummary['overallStatus'] }> = ({ status }) => {
  const theme = useTheme();
  const color = status === 'CRITICAL' ? theme.palette.error.main : status === 'WARNING' ? theme.palette.warning.main : theme.palette.success.main;
  return (
    <Box sx={{ fontSize: 12, fontWeight: 700, color, bgcolor: alpha(color, 0.08), px: 1, py: 0.25, borderRadius: 1, width: 'fit-content' }}>{status}</Box>
  );
};

const PinnedCSIs: React.FC = () => {
  const theme = useTheme();
  const pinned = useAppSelector((s) => s.dashboard.pinnedCsiIds);
  const [health, setHealth] = useState<Record<string, HealthSummary>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const entries = await Promise.all(
        pinned.map(async (id) => {
          try {
            const data = await apiClient.get<HealthSummary>(`/csi/${id}/health`);
            return [id, data] as const;
          } catch {
            return [id, undefined] as const;
          }
        })
      );
      if (!cancelled) {
        const map: Record<string, HealthSummary> = {};
        entries.forEach(([id, hs]) => {
          if (hs) map[id] = hs;
        });
        setHealth(map);
      }
    }
    if (pinned.length) load();
    return () => {
      cancelled = true;
    };
  }, [pinned]);

  if (pinned.length === 0) return null;

  return (
    <Box sx={{ p: 2, border: `1px solid ${theme.palette.divider}`, borderRadius: 1 }}>
      <Typography variant="h6" fontWeight={700} mb={1}>My CSIs</Typography>
      <Grid container spacing={2}>
        {pinned.map((id) => {
          const hs = health[id];
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={id}>
              <Card variant="outlined">
                <CardActionArea onClick={() => window.dispatchEvent(new Event('focus'))}>
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2" fontWeight={700}>{id}</Typography>
                        {hs && <StatusBadge status={hs.overallStatus} />}
                      </Stack>
                      <Stack direction="row" spacing={2}>
                        <Typography variant="caption" color="text.secondary">Passing: <Box component="span" sx={{ color: theme.palette.success.main, fontWeight: 700 }}>{hs?.passingChecks ?? '—'}</Box></Typography>
                        <Typography variant="caption" color="text.secondary">Warn: <Box component="span" sx={{ color: theme.palette.warning.main, fontWeight: 700 }}>{hs?.warningChecks ?? '—'}</Box></Typography>
                        <Typography variant="caption" color="text.secondary">Fail: <Box component="span" sx={{ color: theme.palette.error.main, fontWeight: 700 }}>{hs?.failingChecks ?? '—'}</Box></Typography>
                      </Stack>
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default PinnedCSIs;


