import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Grid, IconButton, Stack, Typography, alpha, useTheme, Skeleton, Snackbar, Alert, Tooltip } from '@mui/material';
import { Close, Flag } from '@mui/icons-material';
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

interface CsiInfo {
  id: string;
  name: string;
}

const statusConfig = {
  HEALTHY:  { label: 'Healthy',  colorKey: 'success' as const },
  WARNING:  { label: 'Warning',  colorKey: 'warning' as const },
  CRITICAL: { label: 'Critical', colorKey: 'error'   as const },
};

const PinnedCSIs: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const pinned = useAppSelector((s) => s.dashboard.pinnedCsiIds);
  const [health, setHealth] = useState<Record<string, HealthSummary>>({});
  const [csiInfo, setCsiInfo] = useState<Record<string, CsiInfo>>({});
  const [unpinToastOpen, setUnpinToastOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const entries = await Promise.all(
        pinned.map(async (id) => {
          try {
            const [healthData, info] = await Promise.all([
              apiClient.get<HealthSummary>(`/csi/${id}/health`),
              apiClient.get<CsiInfo>(`/csi/${id}`),
            ]);
            return { id, health: healthData, info } as const;
          } catch {
            return { id, health: undefined, info: undefined } as const;
          }
        })
      );
      if (!cancelled) {
        const hMap: Record<string, HealthSummary> = {};
        const iMap: Record<string, CsiInfo> = {};
        entries.forEach(({ id, health: hs, info }) => {
          if (hs) hMap[id] = hs;
          if (info) iMap[id] = info;
        });
        setHealth(hMap);
        setCsiInfo(iMap);
      }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [pinned]);

  return (
    <SectionBox title="My CSIs" accentColor={theme.palette.info.main}>
      {pinned.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No pinned CSIs yet. Search for a CSI and click Pin to add it here.
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {pinned.map((id) => {
            const hs = health[id];
            const info = csiInfo[id];
            const isLoading = !hs;
            const cfg = hs ? statusConfig[hs.overallStatus] : null;
            const color = cfg ? theme.palette[cfg.colorKey].main : theme.palette.grey[400];

            return (
              <Grid item xs={12} sm={6} md={4} lg={3} key={id}>
                <Card
                  variant="outlined"
                  sx={{
                    borderLeft: `3px solid ${color}`,
                    transition: 'transform 150ms ease, box-shadow 200ms ease',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' },
                  }}
                >
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    {isLoading ? (
                      <Stack spacing={0.75}>
                        <Skeleton variant="text" width="40%" height={20} />
                        <Skeleton variant="text" width="70%" height={16} />
                        <Skeleton variant="rounded" width={60} height={20} />
                      </Stack>
                    ) : (
                      <Stack spacing={0.5}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 0.5 }}>
                              {id}
                            </Typography>
                            <Typography variant="subtitle2" fontWeight={700} noWrap>
                              {info?.name ?? id}
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={0} sx={{ ml: 1, flexShrink: 0 }}>
                            <Tooltip title="Set as search context">
                              <IconButton
                                size="small"
                                onClick={() => dispatch(setSearchContext({ csiId: id }))}
                                sx={{ color: 'text.secondary' }}
                              >
                                <Flag fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Unpin">
                              <IconButton
                                size="small"
                                onClick={() => { dispatch(unpinCsi(id)); setUnpinToastOpen(true); }}
                                sx={{ color: 'text.secondary' }}
                              >
                                <Close fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Box
                            sx={{
                              fontSize: 11,
                              fontWeight: 700,
                              color,
                              bgcolor: alpha(color, 0.08),
                              px: 1,
                              py: 0.25,
                              borderRadius: 1,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                            }}
                          >
                            {cfg?.label}
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {hs?.totalChecks ?? 0} check{hs?.totalChecks === 1 ? '' : 's'}
                          </Typography>
                        </Stack>
                      </Stack>
                    )}
                  </CardContent>
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
