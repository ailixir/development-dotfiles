import React, { useEffect, useState } from 'react';
import { Alert, Accordion, AccordionDetails, AccordionSummary, Box, Card, CardContent, Chip, Grid, IconButton, LinearProgress, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { ExpandMore, Movie, Refresh } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import studioApi from '@/services/api/studioApi';
import { useAppSelector } from '@/store';
import StudioProofVideo from '@/components/studio/StudioProofVideo';
import { normalizeExecutionLogs, type StudioExecutionLog } from '@/utils/studio/executionView';

type Status = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PASSED' | 'FAILED' | 'ERROR' | 'TIMEOUT';
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
  posterUrl?: string;
  logs: StudioExecutionLog[];
}

const colorFor = (status: Status) =>
  status === 'PASSED' || status === 'COMPLETED'
    ? 'success'
    : status === 'RUNNING'
      ? 'info'
      : status === 'FAILED' || status === 'ERROR'
        ? 'error'
        : 'default';

const StudioRunsPage: React.FC = () => {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [allRuns, setAllRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const searchContext = useAppSelector(state => state.dashboard.searchContext);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await studioApi.listExecutions()) as any;
      const runsData = res.data || [];
      
      // Fetch test details to get csiId for each run
      const testsRes = (await studioApi.listTests({})) as any;
      const tests = testsRes.data || testsRes || [];
      const testMap = new Map(tests.map((t: any) => [t.id, t]));
      
      // Enrich runs with test data including csiId
      const enrichedRuns: RunItem[] = runsData.map((run: any) => {
        const test = testMap.get(run.testId) as any;
        return {
          id: run.id,
          testId: run.testId,
          status: run.status,
          startTime: run.startedAt,
          endTime: run.endedAt,
          duration: run.durationMs,
          videoUrl: run.videoUrl,
          posterUrl: run.screenshotUrls?.[0],
          logs: normalizeExecutionLogs(run.logs),
          csiId: test?.csiId,
          testName: test?.name,
        };
      });
      
      enrichedRuns.sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime));
      setAllRuns(enrichedRuns);
      setRuns(enrichedRuns);
    } catch {
      setError('Could not load runs. Use Refresh to try again.');
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
            <IconButton onClick={load} disabled={loading} aria-label="Refresh runs">
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
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!loading && !error && runs.length === 0 && <Alert severity="info">No runs found for this scope. Open a test in Studio to start a run.</Alert>}
      <Grid container spacing={2} alignItems="flex-start">
        {(loading ? [...Array(6)].map((_, i) => ({ id: `s${i}` })) : runs).map((r: any) => (
          <Grid key={r.id} item xs={12} lg={6}>
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
                      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                        <Typography 
                          variant="subtitle1" 
                          fontWeight={600}
                          component={Link}
                          to={`/checks/studio/${r.testId}`}
                          sx={{ 
                            cursor: 'pointer',
                            color: 'primary.main',
                            textDecoration: 'none',
                            overflowWrap: 'anywhere',
                            '&:hover': { textDecoration: 'underline' }
                          }}
                        >
                          {r.testName || r.testId}
                        </Typography>
                        <Chip sx={{ flexShrink: 0 }} label={r.status === 'COMPLETED' ? 'Passed' : r.status.charAt(0) + r.status.slice(1).toLowerCase()} color={colorFor(r.status)} size="small" />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Started: {new Date(r.startTime).toLocaleString()} • Duration: {r.duration ? `${Math.round(r.duration/1000)}s` : (r.status === 'RUNNING' ? 'in progress' : '—')}
                      </Typography>
                      {r.status === 'RUNNING' ? (
                        <LinearProgress variant="indeterminate" sx={{ height: 6, borderRadius: 2 }} />
                      ) : (
                        <StudioProofVideo
                          videoUrl={r.videoUrl}
                          posterUrl={r.posterUrl}
                          title={r.testName || 'Studio test'}
                          height={220}
                          emptyMessage="No video was captured for this run."
                          errorMessage="Video unavailable. The recording may have expired or its storage is unreachable."
                        />
                      )}
                      <Accordion disableGutters elevation={0} sx={{ '&::before': { display: 'none' } }}>
                        <AccordionSummary expandIcon={<ExpandMore />} aria-controls={`${r.id}-logs`}>
                          <Typography variant="body2" fontWeight={600}>
                            Execution logs ({r.logs.length})
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails id={`${r.id}-logs`}>
                          <Box sx={{ maxHeight: 180, overflow: 'auto', bgcolor: 'grey.900', color: 'grey.100', borderRadius: 1, p: 1.5, fontFamily: 'monospace' }}>
                            {r.logs.length ? r.logs.map((log: StudioExecutionLog, index: number) => (
                              <Typography key={`${log.timestamp}-${index}`} component="div" variant="caption" sx={{ color: log.level === 'error' ? 'error.light' : log.level === 'success' ? 'success.light' : 'inherit', fontFamily: 'inherit' }}>
                                {new Date(log.timestamp).toLocaleTimeString()} — {log.message}
                              </Typography>
                            )) : (
                              <Typography variant="caption" color="grey.400">No execution logs were recorded.</Typography>
                            )}
                          </Box>
                        </AccordionDetails>
                      </Accordion>
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
