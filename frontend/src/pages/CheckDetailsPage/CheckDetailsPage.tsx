import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardHeader,
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
  Tooltip,
  IconButton,
  Grid,
  Snackbar,
  Alert,
  AppBar,
  Toolbar,
} from '@mui/material';
import { PlayArrow, Schedule, Campaign, OpenInFull, ContentCopy, Close, CloseFullscreen, Edit, Person } from '@mui/icons-material';
import { createCommsTemplateFromCheckDetails } from '@/utils/commsBridge';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchCheckById, executeCheck } from '@/store/slices/checksSlice';
import { checksApi } from '@/services/api/checksApi';
import type { ExecutionResult } from '@/types/checks/checkTypes';
import ScheduleDialog, { type ScheduleTarget } from '@components/scheduling/ScheduleDialog';
import ScheduleOverview from '@components/scheduling/ScheduleOverview';

const TERMINAL_SX = {
  p: 2,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 13,
  lineHeight: 1.7,
  bgcolor: '#0B0F14',
  color: '#E5E7EB',
  borderColor: '#1F2937',
  borderRadius: 1,
  userSelect: 'text',
} as const;

const statusColor = (status: string): ChipProps['color'] => {
  switch (status) {
    case 'SUCCESS': case 'PASSING': return 'success';
    case 'WARNING': return 'warning';
    case 'FAILURE': case 'FAILING': case 'TIMEOUT': return 'error';
    default: return 'default';
  }
};

const statusLabel = (status: string) => status.charAt(0) + status.slice(1).toLowerCase();

interface ExecutionMetaProps { exec: ExecutionResult; compact?: boolean }
const ExecutionMeta: React.FC<ExecutionMetaProps> = ({ exec, compact }) => (
  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={compact ? {} : { mb: 2 }}>
    <Chip size="small" label={statusLabel(exec.status)} color={statusColor(exec.status)} />
    <Chip size="small" label={`${Math.round(exec.duration)} ms`} variant="outlined" />
    <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center' }}>
      {new Date(exec.endTime).toLocaleString()}
    </Typography>
    {exec.error && <Typography variant="caption" color="error.main" sx={{ wordBreak: 'break-word' }}>{exec.error}</Typography>}
  </Stack>
);

const CheckDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [history, setHistory] = useState<ExecutionResult[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [outputViewerOpen, setOutputViewerOpen] = useState(false);
  const [outputViewerExec, setOutputViewerExec] = useState<ExecutionResult | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  const { data: checks, loading, executingChecks, executionResults } = useAppSelector((s) => s.checks);
  const check = useMemo(() => checks.find((c) => c.id === id), [checks, id]);
  const scheduleTarget = useMemo<ScheduleTarget | null>(
    () => (check ? { kind: 'check', id: check.id, name: check.name, schedule: check.schedule } : null),
    [check],
  );
  const isExecuting = !!(id && executingChecks.includes(id));
  const lastExec = id ? executionResults[id] : undefined;

  useEffect(() => {
    if (id) dispatch(fetchCheckById(id));
  }, [id, dispatch]);

  const loadHistory = async () => {
    if (!id) return;
    try {
      setHistoryLoading(true);
      setHistoryError(null);
      const res = await checksApi.getCheckExecutions(id, 15);
      setHistory(res.data || []);
    } catch (e: any) {
      setHistoryError(e?.message || 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [id, lastExec?.id]);

  const statusChipColor = useMemo(() => statusColor(check?.status || ''), [check?.status]);

  const onExecute = async () => {
    if (!id) return;
    try {
      const { result } = await dispatch(executeCheck(id)).unwrap();
      setSnack({ open: true, message: `Executed: ${result.status} in ${Math.round(result.duration)} ms`, severity: 'success' });
    } catch {
      setSnack({ open: true, message: 'Execution failed', severity: 'error' });
    }
  };

  const copyOutput = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setSnack({ open: true, message: 'Output copied', severity: 'success' }); } catch { /* Clipboard permissions may deny this optional copy; keep the original output available. */ }
  };

  const avgDuration = history && history.length ? Math.round(history.reduce((a, c) => a + (c.duration || 0), 0) / history.length) : null;

  const openOutputViewer = (exec: ExecutionResult | null) => {
    setOutputViewerExec(exec);
    setOutputViewerOpen(true);
  };

  const terminal = TERMINAL_SX;

  return (
    <Box>
      {/* Header */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack spacing={0.5}>
              <Typography variant="h4" fontWeight={700}>{check?.name || 'Check Details'}</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                {check ? <Chip label={statusLabel(check.status)} color={statusChipColor} size="small" /> : <Skeleton width={80} />}
                {check && <Chip label={check.type} size="small" variant="outlined" />}
                {check && <Typography variant="body2" color="text.secondary">CSI: {check.csiName}</Typography>}
                {check?.assignedTo && (
                  <Chip size="small" icon={<Person />} label={`Assigned: ${check.assignedTo.split('@')[0]}`} color="info" variant="outlined" />
                )}
              </Stack>
              <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">Last run: {lastExec ? new Date(lastExec.endTime).toLocaleString() : check?.lastExecution ? new Date(check.lastExecution).toLocaleString() : '—'}</Typography>
                {avgDuration !== null && <Typography variant="caption" color="text.secondary">Avg duration: {avgDuration} ms</Typography>}
              </Stack>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Tooltip title="Edit Check">
                <span>
                  <Button size="small" variant="outlined" startIcon={<Edit />} onClick={() => navigate(`/checks/edit/${id}`)}>Edit</Button>
                </span>
              </Tooltip>
              <Tooltip title="Manage Schedule">
                <span>
                  <Button size="small" variant="outlined" startIcon={<Schedule />} onClick={() => setScheduleOpen(true)}>Schedule</Button>
                </span>
              </Tooltip>
              <Tooltip title="Execute now">
                <span>
                  <Button size="small" variant="contained" startIcon={<PlayArrow />} onClick={onExecute} disabled={!id || isExecuting}>
                    {isExecuting ? 'Running...' : 'Execute'}
                  </Button>
                </span>
              </Tooltip>
              {check && (
                <Tooltip title="Send to Comms">
                  <IconButton
                    color="primary"
                    onClick={() => {
                      const payload = createCommsTemplateFromCheckDetails({ id: check.id, name: check.name, status: check.status, csiId: check.csiId, csiName: check.csiName, type: check.type, tags: check.tags, configuration: check.configuration as unknown as Record<string, unknown> });
                      const handoffKey = `put:handoff:comms:${Date.now()}:${Math.random().toString(36).slice(2)}`;
                      try { sessionStorage.setItem(handoffKey, JSON.stringify(payload)); sessionStorage.setItem('put:handoff:comms:latest', JSON.stringify(payload)); } catch { /* Storage is optional; retain the in-memory state when persistence is unavailable. */ }
                      navigate(`/comms?handoff=${encodeURIComponent(handoffKey)}`);
                    }}
                  >
                    <Campaign />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {/* Left Panel */}
        <Grid item xs={12} md={5}>
          <Stack spacing={3}>
            {/* Overview */}
            <Card variant="outlined">
              <CardHeader title="Overview" />
              <CardContent>
                {!check || loading === 'loading' ? (
                  <Skeleton variant="rounded" height={120} />
                ) : (
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} key="overview-config">
                      <Stack spacing={1}>
                        <Typography variant="body2">Type: {check.type}</Typography>
                        {check.type === 'HTTP' && (
                          <>
                            <Typography variant="body2">Method: {check.configuration?.method || 'GET'}</Typography>
                            <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>URL: {check.configuration?.url || '—'}</Typography>
                            <Typography variant="body2">Expected: {check.configuration?.expectedStatusCode ?? check.configuration?.expectedStatus ?? '—'}</Typography>
                          </>
                        )}
                        {check.type === 'TCP' && (
                          <>
                            <Typography variant="body2">Host: {check.configuration?.host || '—'}</Typography>
                            <Typography variant="body2">Port: {check.configuration?.port ?? '—'}</Typography>
                          </>
                        )}
                        {check.type === 'SPLUNK' && (
                          <>
                            <Typography variant="body2">Range: {check.configuration?.timeRange || 'last 15m'}</Typography>
                            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>Query: {check.configuration?.query || '—'}</Typography>
                          </>
                        )}
                        {check.type === 'GRAFANA' && (
                          <>
                            <Typography variant="body2">Datasource: {check.configuration?.datasource || '—'}</Typography>
                            <Typography variant="body2">Window: {check.configuration?.duration || '—'}</Typography>
                          </>
                        )}
                        {check.type === 'ITRS' && (
                          <>
                            <Typography variant="body2">Gateway: {check.configuration?.gateway || '—'}</Typography>
                            <Typography variant="body2">Sampler: {check.configuration?.sampler || '—'}</Typography>
                          </>
                        )}
                        {check.type === 'APPDYNAMICS' && (
                          <>
                            <Typography variant="body2">App: {check.configuration?.application || '—'}</Typography>
                            <Typography variant="body2">Rule: {check.configuration?.healthRule || '—'}</Typography>
                          </>
                        )}
                      </Stack>
                    </Grid>
                    <Grid item xs={12} sm={6} key="overview-schedule">
                      <Stack spacing={1}>
                        <ScheduleOverview schedule={check.schedule} nextExecution={check.nextExecution} />
                        <Typography variant="body2">Owner: {check.createdBy || '—'}</Typography>
                      </Stack>
                    </Grid>
                    {check.tags && check.tags.length > 0 && (
                      <Grid item xs={12} key="overview-tags">
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Tags</Typography>
                        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ rowGap: 0.5 }}>
                          {check.tags.map((t) => <Chip key={t} label={t} size="small" />)}
                        </Stack>
                      </Grid>
                    )}
                  </Grid>
                )}
              </CardContent>
            </Card>

            {/* Recent Runs */}
            <Card variant="outlined">
              <CardHeader title="Recent Runs" />
              <CardContent>
                {historyLoading && [...Array(3)].map((_, i) => <Skeleton key={i} variant="rounded" height={36} sx={{ mb: 1 }} />)}
                {historyError && <Typography variant="body2" color="error.main">{historyError}</Typography>}
                {history && history.length > 0 ? (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Time</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Duration</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {history.map((h) => (
                          <TableRow key={h.id} hover>
                            <TableCell>{new Date(h.endTime).toLocaleString()}</TableCell>
                            <TableCell>
                              <Chip size="small" label={statusLabel(h.status)} color={statusColor(h.status)} />
                            </TableCell>
                            <TableCell>{Math.round(h.duration)} ms</TableCell>
                            <TableCell align="right">
                              <Button size="small" onClick={() => openOutputViewer(h)}>View output</Button>
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

        {/* Right Panel — Live Output */}
        <Grid item xs={12} md={7}>
          <Card variant="outlined" sx={{ position: 'sticky', top: 88 }}>
            <CardHeader
              title="Live Output"
              action={
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Copy output">
                    <span>
                      <IconButton size="small" disabled={!lastExec?.output} onClick={() => lastExec?.output && copyOutput(lastExec.output)}>
                        <ContentCopy fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Maximize">
                    <span>
                      <IconButton size="small" disabled={!lastExec?.output} onClick={() => lastExec && openOutputViewer(lastExec)}>
                        <OpenInFull fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              }
            />
            <CardContent>
              {lastExec && <ExecutionMeta exec={lastExec} />}
              <Paper variant="outlined" sx={{ ...terminal, maxHeight: 520 }}>
                {isExecuting ? 'Starting...' : lastExec?.output || 'No output. Execute the check to see results.'}
              </Paper>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Fullscreen output viewer — unified for history rows + live expand */}
      <Dialog
        open={outputViewerOpen}
        onClose={() => setOutputViewerOpen(false)}
        fullScreen
        PaperProps={{ sx: { bgcolor: 'background.default' } }}
      >
        <AppBar position="sticky" color="default" elevation={1} sx={{ bgcolor: 'background.paper' }}>
          <Toolbar variant="dense" sx={{ gap: 1 }}>
            <CloseFullscreen fontSize="small" color="action" />
            <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
              {check?.name || 'Check Output'}
            </Typography>
            {outputViewerExec && <ExecutionMeta exec={outputViewerExec} compact />}
            <Tooltip title="Copy output">
              <span>
                <IconButton size="small" disabled={!outputViewerExec?.output} onClick={() => outputViewerExec?.output && copyOutput(outputViewerExec.output)}>
                  <ContentCopy fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Close">
              <IconButton size="small" onClick={() => setOutputViewerOpen(false)}>
                <Close fontSize="small" />
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 3, flex: 1, overflow: 'auto' }}>
          <Paper variant="outlined" sx={{ ...terminal, minHeight: '80vh' }}>
            {outputViewerExec?.output || 'No output'}
          </Paper>
        </Box>
      </Dialog>

      <ScheduleDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        target={scheduleTarget}
        onSaved={async () => {
          if (id) await dispatch(fetchCheckById(id)).unwrap();
        }}
      />
      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnack((s) => ({ ...s, open: false }))} severity={snack.severity} sx={{ width: '100%' }} variant="filled">
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CheckDetailsPage;
