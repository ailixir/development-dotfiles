import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardHeader,
  CardContent,
  Stack,
  Chip,
  Divider,
  Button,
  Skeleton,
  ChipProps,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  IconButton,
  Grid,
  Snackbar,
  Alert,
} from '@mui/material';
import { PlayArrow, Schedule, Edit, OpenInNew, RemoveRedEye } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchCheckById, executeCheck } from '@/store/slices/checksSlice';
import { checksApi } from '@/services/api/checksApi';
import type { ExecutionResult } from '@/types/checks/checkTypes';
import ScheduleDialog from '@components/scheduling/ScheduleDialog';

const CheckDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [history, setHistory] = useState<ExecutionResult[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [viewRunOpen, setViewRunOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<ExecutionResult | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  const { data: checks, loading, error, executingChecks, executionResults } = useAppSelector((s) => s.checks);
  const check = useMemo(() => checks.find((c) => c.id === id), [checks, id]);
  const isExecuting = !!(id && executingChecks.includes(id));
  const lastExec = id ? executionResults[id] : undefined;

  useEffect(() => {
    if (!id) return;
    // Ensure check is loaded
    if (!check) {
      dispatch(fetchCheckById(id));
    }
  }, [id, check, dispatch]);

  useEffect(() => {
    if (!id) return;
    // Load execution history locally (prototype)
    let cancelled = false;
    (async () => {
      try {
        setHistoryLoading(true);
        setHistoryError(null);
        const res = await checksApi.getCheckExecutions(id, 15);
        if (!cancelled) setHistory(res.data || []);
      } catch (e: any) {
        if (!cancelled) setHistoryError(e?.message || 'Failed to load history');
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const statusChipColor: ChipProps['color'] = useMemo(() => {
    switch (check?.status) {
      case 'PASSING': return 'success';
      case 'WARNING': return 'warning';
      case 'FAILING': return 'error';
      case 'PENDING': return 'default';
      default: return 'default';
    }
  }, [check?.status]);

  const onExecute = async () => {
    if (!id) return;
    try {
      await dispatch(executeCheck(id)).unwrap();
      const result = executionResults[id];
      setSnack({ open: true, message: result ? `Executed: ${result.status} in ${Math.round(result.duration)} ms` : 'Execution completed', severity: 'success' });
    } catch {
      setSnack({ open: true, message: 'Execution failed', severity: 'error' });
    }
  };

  return (
    <Box>
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Stack spacing={0.5}>
              <Typography variant="h4">Check Details</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                {check ? <Chip label={check.status} color={statusChipColor} size="small" /> : <Skeleton width={80} />}
                {check && <Chip label={`Type: ${check.type}`} size="small" />}
                {check && <Chip label={`CSI: ${check.csiName}`} size="small" />}
              </Stack>
              {check && check.tags && check.tags.length > 0 && (
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1, rowGap: 0.5 }}>
                  {check.tags.slice(0, 10).map((t) => (
                    <Chip key={t} label={t} size="small" />
                  ))}
                </Stack>
              )}
              <Stack direction="row" spacing={2}>
                <Typography variant="caption" color="text.secondary">Last run: {lastExec ? new Date(lastExec.endTime).toLocaleString() : '—'}</Typography>
                <Typography variant="caption" color="text.secondary">Avg duration: {history && history.length ? `${Math.round(history.reduce((a,c)=>a+(c.duration||0),0)/(history.length))/1} ms` : '—'}</Typography>
              </Stack>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<Schedule />} onClick={() => setScheduleOpen(true)}>
                Manage Schedule
              </Button>
              <Button variant="contained" color="success" startIcon={<PlayArrow />} onClick={onExecute} disabled={!id || isExecuting}>
                {isExecuting ? 'Executing…' : 'Execute Now'}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Stack spacing={3}>
            <Card variant="outlined">
              <CardHeader title="Overview" />
              <CardContent>
                {!check || loading === 'loading' ? (
                  <Skeleton variant="rounded" height={140} />
                ) : (
                  <>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Last Execution</Typography>
                        {lastExec ? (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Status: {lastExec.status}</Typography>
                            <Typography variant="body2">Duration: {Math.round(lastExec.duration)} ms</Typography>
                            <Typography variant="body2">Ended: {new Date(lastExec.endTime).toLocaleString()}</Typography>
                            {lastExec.error && <Typography variant="body2" color="error.main">Error: {lastExec.error}</Typography>}
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.secondary">No recent execution</Typography>
                        )}
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Configuration Snapshot</Typography>
                        {check.type === 'HTTP' && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Method: {check.configuration?.method || 'GET'}</Typography>
                            <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>URL: {check.configuration?.url || '—'}</Typography>
                            <Typography variant="body2">Expected Status: {check.configuration?.expectedStatus ?? '—'}</Typography>
                            {check.configuration?.timeout && <Typography variant="body2">Timeout: {check.configuration.timeout} ms</Typography>}
                          </Stack>
                        )}
                        {check.type === 'TCP' && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Host: {check.configuration?.host || '—'}</Typography>
                            <Typography variant="body2">Port: {check.configuration?.port ?? '—'}</Typography>
                          </Stack>
                        )}
                        {check.type === 'SPLUNK' && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Time Range: {check.configuration?.timeRange || 'last 15m'}</Typography>
                            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>Query: {check.configuration?.query || '—'}</Typography>
                            {check.configuration?.threshold && <Typography variant="body2">Threshold: {check.configuration.threshold.operator} {String(check.configuration.threshold.value)}</Typography>}
                          </Stack>
                        )}
                        {check.type === 'GRAFANA' && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Datasource: {check.configuration?.datasource || '—'}</Typography>
                            <Typography variant="body2">Window: {check.configuration?.duration || '—'}</Typography>
                          </Stack>
                        )}
                        {check.type === 'ITRS' && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Gateway: {check.configuration?.gateway || '—'}</Typography>
                            <Typography variant="body2">Sampler: {check.configuration?.sampler || '—'}</Typography>
                            <Typography variant="body2">Data Item: {check.configuration?.dataitem || '—'}</Typography>
                            {check.configuration?.expectedValue && <Typography variant="body2">Expected: {check.configuration.expectedValue}</Typography>}
                          </Stack>
                        )}
                        {check.type === 'APPDYNAMICS' && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Application: {check.configuration?.application || '—'}</Typography>
                            <Typography variant="body2">Health Rule: {check.configuration?.healthRule || '—'}</Typography>
                            {check.configuration?.tier && <Typography variant="body2">Tier: {check.configuration.tier}</Typography>}
                          </Stack>
                        )}
                        {check.type === 'UI_TEST' && check.configuration?.uiTest && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Studio Test: {check.configuration.uiTest.testId}</Typography>
                            {check.configuration.uiTest.variables && (
                              <Typography variant="body2" color="text.secondary">Vars: {Object.keys(check.configuration.uiTest.variables).length}</Typography>
                            )}
                            {check.configuration.uiTest.overrides?.browser && (
                              <Typography variant="body2">Browser: {check.configuration.uiTest.overrides.browser}</Typography>
                            )}
                            {check.configuration.uiTest.overrides?.viewport && (
                              <Typography variant="body2">Viewport: {check.configuration.uiTest.overrides.viewport.width}×{check.configuration.uiTest.overrides.viewport.height}</Typography>
                            )}
                          </Stack>
                        )}
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Schedule</Typography>
                        <Typography variant="body2">Enabled: {check.schedule.enabled ? 'Yes' : 'No'}</Typography>
                        {'frequency' in (check.schedule || {}) && (
                          <Typography variant="body2">Frequency: {check.schedule.frequency}</Typography>
                        )}
                        {'cron' in (check.schedule || {}) && check.schedule.cron && (
                          <Typography variant="body2">Cron: {check.schedule.cron}</Typography>
                        )}
                        <Typography variant="body2">Next: {check.nextExecution ? new Date(check.nextExecution).toLocaleString() : '—'}</Typography>
                      </Box>
                    </Stack>
                  </>
                )}
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardHeader title="Recent Runs" />
              <CardContent>
                {historyLoading && (
                  [...Array(5)].map((_, i) => (
                    <Skeleton key={i} variant="rounded" height={36} sx={{ mb: 1 }} />
                  ))
                )}
                {historyError && (
                  <Typography variant="body2" color="error.main">{historyError}</Typography>
                )}
                {history && history.length > 0 ? (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Ended</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Duration</TableCell>
                          <TableCell>Summary</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {history.map((h) => (
                          <TableRow key={h.id} hover>
                            <TableCell>{new Date(h.endTime).toLocaleString()}</TableCell>
                            <TableCell>{h.status}</TableCell>
                            <TableCell>{Math.round(h.duration)} ms</TableCell>
                            <TableCell>{h.output}</TableCell>
                            <TableCell align="right">
                              <Button size="small" onClick={() => { setSelectedRun(h); setViewRunOpen(true); }}>View output</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (!historyLoading && !historyError) ? (
                  <Typography variant="body2" color="text.secondary">No runs yet. Execute to generate a baseline.</Typography>
                ) : null}
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card variant="outlined" sx={{ position: 'sticky', top: 88 }}>
            <CardHeader title="Live Output" />
            <CardContent>
              {isExecuting ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    maxHeight: 420,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    bgcolor: '#0B0F14',
                    color: '#E5E7EB',
                    borderColor: '#1F2937',
                  }}
                >
                  Starting...
                </Paper>
              ) : lastExec ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    maxHeight: 420,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    bgcolor: '#0B0F14',
                    color: '#E5E7EB',
                    borderColor: '#1F2937',
                  }}
                >
                  {lastExec.output || 'No output.'}
                </Paper>
              ) : (
                <Typography variant="body2" color="text.secondary">No recent output.</Typography>
              )}
              {lastExec && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button size="small" onClick={async () => { try { await navigator.clipboard.writeText(lastExec.output || ''); setSnack({ open: true, message: 'Output copied', severity: 'success' }); } catch {} }}>Copy output</Button>
                  <Button size="small" onClick={() => { const w = window.open('', '_blank'); if (w) w.document.write(`<pre style='white-space:pre-wrap;font-family:ui-sans-serif,system-ui,Arial,sans-serif;padding:16px;'>${(lastExec.output || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`); }}>Open in window</Button>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={viewRunOpen} onClose={() => setViewRunOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Execution Output</DialogTitle>
        <DialogContent dividers>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              maxHeight: 520,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              bgcolor: '#0B0F14',
              color: '#E5E7EB',
              borderColor: '#1F2937',
            }}
          >
            {selectedRun?.output || 'No output'}
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewRunOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <ScheduleDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} check={check || null} />
      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnack((s) => ({ ...s, open: false }))} severity={snack.severity} sx={{ width: '100%' }} variant="filled">
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CheckDetailsPage;