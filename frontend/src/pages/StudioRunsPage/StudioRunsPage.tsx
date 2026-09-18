import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, Chip, Stack, Skeleton, IconButton, Tooltip, LinearProgress, Alert } from '@mui/material';
import { Refresh, Movie } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import studioApi from '@/services/api/studioApi';
import { useAppSelector } from '@/store';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { executionStatusLabel, executionStatusTone } from '@/components/studio/run';
import { VideoEvidencePanel } from '@/components/studio/evidence';

/** One history row: the execution as the server reports it, plus the test's name for display. */
interface RunItem {
  readonly execution: ExecutionSnapshot;
  readonly testName: string | null;
}

/**
 * Browser time only, as the server measured it. Null while the run has not finished, and never
 * computed here from timestamps.
 */
function durationText(execution: ExecutionSnapshot): string {
  if (execution.durationMs !== null) {
    return `${Math.round(execution.durationMs / 1000)}s`;
  }
  return execution.status === 'PENDING' || execution.status === 'RUNNING' ? 'in progress' : '—';
}

const StudioRunsPage: React.FC = () => {
  const [allRuns, setAllRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const navigate = useNavigate();
  const searchContext = useAppSelector(state => state.dashboard.searchContext);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [executions, tests] = await Promise.all([
        studioApi.listExecutions(),
        studioApi.listTests({}),
      ]);
      const names = new Map((tests.data ?? []).map((test) => [test.id, test.name]));
      setAllRuns(
        (executions.data ?? []).map((execution) => ({
          execution,
          testName: names.get(execution.testId) ?? null,
        })),
      );
    } catch (error: unknown) {
      setLoadError((error as { message?: string })?.message || 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // The execution carries its own CSI, so the global CSI filter needs no second lookup.
  const runs = searchContext.csiId
    ? allRuns.filter((run) => run.execution.csiId === searchContext.csiId)
    : allRuns;

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
      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}
      <Grid container spacing={2}>
        {loading
          ? [...Array(6)].map((_, i) => (
              <Grid key={`s${i}`} item xs={12} md={6} lg={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Skeleton variant="text" width={180} />
                    <Skeleton variant="text" width={220} />
                    <Skeleton variant="rounded" height={120} />
                  </CardContent>
                </Card>
              </Grid>
            ))
          : runs.map(({ execution, testName }) => (
              <Grid key={execution.executionId} item xs={12} md={6} lg={4}>
                <Card variant="outlined" sx={{ display: 'flex' }} data-testid={`run-${execution.executionId}`}>
                  <CardContent sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Stack spacing={1} sx={{ flexGrow: 1 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography
                          variant="subtitle1"
                          fontWeight={600}
                          onClick={() => navigate(`/checks/studio/${execution.testId}`)}
                          sx={{
                            cursor: 'pointer',
                            color: 'primary.main',
                            '&:hover': { textDecoration: 'underline' }
                          }}
                        >
                          {testName ?? execution.testId}
                        </Typography>
                        <Chip
                          label={executionStatusLabel(execution.status, execution.errorCode)}
                          color={executionStatusTone(execution.status, execution.errorCode)}
                          size="small"
                          data-testid="run-status"
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Accepted: {new Date(execution.acceptedAt).toLocaleString()} • Duration: {durationText(execution)}
                      </Typography>
                      {execution.status === 'RUNNING' || execution.status === 'PENDING' ? (
                        <LinearProgress variant="indeterminate" sx={{ height: 6, borderRadius: 2 }} />
                      ) : (
                        // The evidence state from `video.status`, and a player only for an
                        // AVAILABLE recording served by the protected `/video` route.
                        <VideoEvidencePanel snapshot={execution} />
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
      </Grid>
      {!loading && !loadError && runs.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          No runs yet.
        </Typography>
      )}
    </Box>
  );
};

export default StudioRunsPage;
