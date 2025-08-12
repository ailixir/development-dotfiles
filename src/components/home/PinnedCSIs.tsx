import React, { useEffect, useState } from 'react';
import { Box, Card, CardActionArea, CardContent, Grid, Stack, Typography, alpha, useTheme, Skeleton, Button, Snackbar, Alert } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store';
import { unpinCsi, setSearchContext } from '@/store/slices/dashboardSlice';
import apiClient from '@/services/api/apiClient';
import SectionBox from './SectionBox';

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
  const dispatch = useAppDispatch();
  const pinned = useAppSelector((s) => s.dashboard.pinnedCsiIds);
  const [health, setHealth] = useState<Record<string, HealthSummary>>({});
  const [unpinToastOpen, setUnpinToastOpen] = useState(false);

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
    load();
    const interval = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pinned]);

  return (
    <SectionBox title="My CSIs" accentColor={theme.palette.info.main}>
      {pinned.length === 0 ? (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" color="text.secondary">
            You have no pinned CSIs. Select a CSI in search and click Pin to add it here.
          </Typography>
        </Stack>
      ) : (
      <Grid container spacing={2}>
        {pinned.map((id) => {
          const hs = health[id];
          const isLoading = !hs;
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={id}>
              <Card variant="outlined" sx={{ transition: 'transform 150ms ease, box-shadow 200ms ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 20px rgba(0,0,0,0.08)' } }}>
                <CardActionArea onClick={() => window.dispatchEvent(new Event('focus'))}>
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2" fontWeight={700}>{id}</Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          {!isLoading && hs && <StatusBadge status={hs.overallStatus} />}
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            role="button"
                            onClick={(e) => { e.stopPropagation(); dispatch(unpinCsi(id)); setUnpinToastOpen(true); }}
                            sx={{ cursor: 'pointer', textDecoration: 'underline', '&:hover': { color: theme.palette.text.primary } }}
                            aria-label={`Unpin ${id}`}
                          >
                            Unpin
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            role="button"
                            onClick={(e) => { e.stopPropagation(); dispatch(setSearchContext({ csiId: id })); }}
                            sx={{ cursor: 'pointer', textDecoration: 'underline', '&:hover': { color: theme.palette.text.primary } }}
                            aria-label={`Set ${id} as context`}
                          >
                            Set context
                          </Typography>
                        </Stack>
                      </Stack>
                      {isLoading ? (
                        <Stack spacing={0.75}>
                          <Skeleton variant="text" width="60%" />
                          <Skeleton variant="text" width="80%" />
                        </Stack>
                      ) : (
                        <Stack direction="row" spacing={2}>
                          <Typography variant="caption" color="text.secondary">Passing: <Box component="span" sx={{ color: theme.palette.success.main, fontWeight: 700 }}>{hs?.passingChecks ?? '—'}</Box></Typography>
                          <Typography variant="caption" color="text.secondary">Warn: <Box component="span" sx={{ color: theme.palette.warning.main, fontWeight: 700 }}>{hs?.warningChecks ?? '—'}</Box></Typography>
                          <Typography variant="caption" color="text.secondary">Fail: <Box component="span" sx={{ color: theme.palette.error.main, fontWeight: 700 }}>{hs?.failingChecks ?? '—'}</Box></Typography>
                        </Stack>
                      )}
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>
      )}
      <Snackbar open={unpinToastOpen} autoHideDuration={2000} onClose={() => setUnpinToastOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="info" onClose={() => setUnpinToastOpen(false)}>Removed from My CSIs</Alert>
      </Snackbar>
    </SectionBox>
  );
};

export default PinnedCSIs;


