import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, Chip, Stack, Skeleton, IconButton, Tooltip, LinearProgress, Alert } from '@mui/material';
import { Refresh, PlayArrow, Movie } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import studioApi from '@/services/api/studioApi';
import { useAppSelector } from '@/store';

type Status = 'running' | 'completed' | 'failed' | 'timeout';
interface RunItem {
  id: string;
  testId: string;
  testName?: string;
  csiId?: string;
  status: Status;
  startTime: string;
  endTime?: string;
  duration?: number;
  videoUrl?: string;
}

const colorFor = (status: string) => (status === 'completed' ? 'success' : status === 'running' ? 'info' : status === 'failed' ? 'error' : 'default');

const StudioRunsPage: React.FC = () => {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [allRuns, setAllRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();
  const searchContext = useAppSelector(state => state.dashboard.searchContext);

  const load = async () => {
    setLoading(true);
    try {
      const res = (await studioApi.listExecutions()) as any;
      const runsData = res.data || [];
      
      // Fetch test details to get csiId for each run
      const testsRes = (await studioApi.listTests({})) as any;
      const tests = testsRes.data || testsRes || [];
      const testMap = new Map(tests.map((t: any) => [t.id, t]));
      
      // Enrich runs with test data including csiId
      const enrichedRuns = runsData.map((run: any) => {
        const test = testMap.get(run.testId) as any;
        return {
          ...run,
          csiId: test?.csiId,
          testName: test?.name
        };
      });
      
      setAllRuns(enrichedRuns);
      setRuns(enrichedRuns);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Filter runs based on global search context
  useEffect(() => {
    if (searchContext.csiId) {
      setRuns(allRuns.filter(run => run.csiId === searchContext.csiId));
    } else {
      setRuns(allRuns);
    }
  }, [searchContext.csiId, allRuns]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Movie sx={{ fontSize: 32, color: 'primary.main' }} />
          Studio Runs
        </Typography>
        <Tooltip title="Refresh">
          <span>
            <IconButton onClick={load} disabled={loading}>
              <Refresh />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* Global search context indicator */}
      {searchContext.csiId && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">Global filter active:</Typography>
            <Chip label={`CSI: ${searchContext.csiId}`} size="small" />
            <Typography variant="body2" sx={{ ml: 2 }}>
              Showing {runs.length} of {allRuns.length} runs
            </Typography>
          </Stack>
        </Alert>
      )}
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
                        <Typography 
                          variant="subtitle1" 
                          fontWeight={600}
                          onClick={() => navigate(`/checks/studio/${r.testId}`)}
                          sx={{ 
                            cursor: 'pointer',
                            color: 'primary.main',
                            '&:hover': { textDecoration: 'underline' }
                          }}
                        >
                          {r.testName || r.testId}
                        </Typography>
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


