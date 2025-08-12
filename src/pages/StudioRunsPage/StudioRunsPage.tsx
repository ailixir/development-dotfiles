import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, Chip, Stack, Skeleton, IconButton, Tooltip, LinearProgress, Button } from '@mui/material';
import { Refresh, PlayArrow, Visibility } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import studioApi from '@/services/api/studioApi';

type Status = 'running' | 'completed' | 'failed' | 'timeout';
interface RunItem {
  id: string;
  testId: string;
  status: Status;
  startTime: string;
  endTime?: string;
  duration?: number;
  videoUrl?: string;
}

const colorFor = (status: string) => (status === 'completed' ? 'success' : status === 'running' ? 'info' : status === 'failed' ? 'error' : 'default');

const StudioRunsPage: React.FC = () => {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const res = (await studioApi.listExecutions()) as any;
      setRuns(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>Studio Runs</Typography>
        <Tooltip title="Refresh">
          <span>
            <IconButton onClick={load} disabled={loading}>
              <Refresh />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Grid container spacing={2}>
        {(loading ? [...Array(6)].map((_, i) => ({ id: `s${i}` })) : runs).map((r: any) => (
          <Grid key={r.id} item xs={12} md={6} lg={4}>
            <Card variant="outlined" sx={{ display: 'flex' }}>
              <CardContent sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                <Stack spacing={1} sx={{ flexGrow: 1 }}>
                  {loading ? (
                    <>
                      <Skeleton variant="text" width={180} />
                      <Skeleton variant="text" width={220} />
                      <Skeleton variant="rounded" height={120} />
                    </>
                  ) : (
                    <>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle1" fontWeight={600}>{r.testId}</Typography>
                        <Chip label={r.status} color={colorFor(r.status) as any} size="small" />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Started: {new Date(r.startTime).toLocaleString()} • Duration: {r.duration ? `${Math.round(r.duration/1000)}s` : (r.status === 'running' ? 'in progress' : '—')}
                      </Typography>
                      {r.status === 'running' ? (
                        <LinearProgress variant="indeterminate" sx={{ height: 6, borderRadius: 2 }} />
                      ) : (
                        <Box sx={{
                          minHeight: 120,
                          flexGrow: 1,
                          bgcolor: 'grey.900',
                          color: 'grey.300',
                          borderRadius: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.9rem',
                        }}>
                          {r.videoUrl ? 'Video available' : 'No video'}
                        </Box>
                      )}
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Tooltip title="View in Studio">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => navigate(`/checks/studio/${r.testId}`)}
                            >
                              <Visibility fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default StudioRunsPage;


