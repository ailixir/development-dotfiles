import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Card,
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
  Tooltip,
  IconButton,
} from '@mui/material';
import { PlayArrow, Schedule, Edit, OpenInNew } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchCheckById, executeCheck } from '@/store/slices/checksSlice';
import { checksApi } from '@/services/api/checksApi';
import type { ExecutionResult } from '@/types/checks/checkTypes';
import ScheduleDialog from '@components/scheduling/ScheduleDialog';

const CheckDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [tab, setTab] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [history, setHistory] = useState<ExecutionResult[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

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
    } catch {
      // noop - errors are reflected in slice error; could add toast
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Check Details
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">ID: {id}</Typography>
            {check && (
              <>
                <Chip label={`Type: ${check.type}`} size="small" />
                <Chip label={`CSI: ${check.csiName}`} size="small" />
              </>
            )}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<Schedule />} onClick={() => setScheduleOpen(true)}>
            Manage Schedule
          </Button>
          <Button variant="contained" color="success" startIcon={<PlayArrow />} onClick={onExecute} disabled={!id || isExecuting}>
            {isExecuting ? 'Executing…' : 'Execute Now'}
          </Button>
        </Stack>
      </Stack>

      <Card variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="check details tabs">
          <Tab label="Overview" />
          <Tab label="History" />
          <Tab label="Configuration" />
          <Tab label="Schedule" />
          <Tab label="Links" />
        </Tabs>
        <Divider />
        <CardContent>
          {tab === 0 && (
            <Stack spacing={2}>
              {!check || loading === 'loading' ? (
                <Skeleton variant="rounded" height={140} />
              ) : (
                <>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip label={check.status} color={statusChipColor} size="small" />
                    <Chip label={`Type: ${check.type}`} size="small" />
                    <Chip label={`CSI: ${check.csiName}`} size="small" />
                    {check.tags?.slice(0, 4).map((t) => (
                      <Chip key={t} label={t} size="small" />
                    ))}
                  </Stack>
                  <Divider />
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
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Why {check.status === 'FAILING' ? 'failing' : check.status === 'WARNING' ? 'degraded' : 'healthy'}?</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {check.status === 'FAILING' && 'Latest run indicates a threshold violation or error returned by the upstream system.'}
                        {check.status === 'WARNING' && 'Recent runs are approaching configured thresholds. Investigate performance or capacity.'}
                        {check.status === 'PASSING' && 'All recent checks succeeded within configured thresholds.'}
                        {check.status === 'PENDING' && 'No successful runs yet. Execute to generate a baseline.'}
                      </Typography>
                    </Box>
                  </Stack>
                </>
              )}
            </Stack>
          )}
          {tab === 1 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Execution History</Typography>
              {historyLoading && (
                [...Array(5)].map((_, i) => (
                  <Skeleton key={i} variant="rounded" height={36} sx={{ mb: 1 }} />
                ))
              )}
              {historyError && (
                <Typography variant="body2" color="error.main">{historyError}</Typography>
              )}
              {history && history.length > 0 && (
                <Table size="small" aria-label="execution history table">
                  <TableHead>
                    <TableRow>
                      <TableCell>Ended</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Duration</TableCell>
                      <TableCell>Summary</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {history.map((h) => (
                      <TableRow key={h.id} hover>
                        <TableCell>{new Date(h.endTime).toLocaleString()}</TableCell>
                        <TableCell>{h.status}</TableCell>
                        <TableCell>{Math.round(h.duration)} ms</TableCell>
                        <TableCell>{h.output}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {history && history.length === 0 && !historyLoading && !historyError && (
                <Typography variant="body2" color="text.secondary">No history yet.</Typography>
              )}
            </Box>
          )}
          {tab === 2 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Configuration
              </Typography>
              {!check || loading === 'loading' ? (
                <Skeleton variant="rounded" height={200} />
              ) : (
                <Stack spacing={1}>
                  {check.type === 'UI_TEST' && check.configuration?.uiTest ? (
                    <>
                      <Stack direction="row" spacing={1}>
                        <Typography variant="body2" sx={{ minWidth: 180, color: 'text.secondary' }}>Studio Test</Typography>
                        <Typography variant="body2">{check.configuration.uiTest.testId}</Typography>
                      </Stack>
                      {check.configuration.uiTest.variables && (
                        <>
                          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>Variables</Typography>
                          <Table size="small" aria-label="ui test variables">
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ width: 220 }}>Name</TableCell>
                                <TableCell sx={{ width: 140 }}>Type</TableCell>
                                <TableCell>Value</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {Object.entries(check.configuration.uiTest.variables).map(([name, v]: any) => (
                                <TableRow key={name}>
                                  <TableCell>{name}</TableCell>
                                  <TableCell>{v.kind}</TableCell>
                                  <TableCell>{v.kind === 'secret' ? '••••' + (v.secretId?.slice(-4) || '') : String(v.value ?? '')}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </>
                      )}
                    </>
                  ) : (
                    Object.entries(check.configuration || {}).map(([k, v]) => (
                      <Stack key={k} direction="row" spacing={1}>
                        <Typography variant="body2" sx={{ minWidth: 180, color: 'text.secondary' }}>{k}</Typography>
                        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</Typography>
                      </Stack>
                    ))
                  )}
                </Stack>
              )}
            </Box>
          )}
          {tab === 3 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Schedule
              </Typography>
              {!check || loading === 'loading' ? (
                <Skeleton variant="rounded" height={120} />
              ) : (
                <Stack spacing={1}>
                  <Typography variant="body2">Enabled: {check.schedule.enabled ? 'Yes' : 'No'}</Typography>
                  {'frequency' in (check.schedule || {}) && (
                    <Typography variant="body2">Frequency: {check.schedule.frequency}</Typography>
                  )}
                  {'cron' in (check.schedule || {}) && check.schedule.cron && (
                    <Typography variant="body2">Cron: {check.schedule.cron}</Typography>
                  )}
                  <Typography variant="body2">Next: {check.nextExecution ? new Date(check.nextExecution).toLocaleString() : '—'}</Typography>
                  <Button size="small" variant="outlined" startIcon={<Edit />} onClick={() => setScheduleOpen(true)} sx={{ mt: 1 }}>
                    Edit Schedule
                  </Button>
                </Stack>
              )}
            </Box>
          )}
          {tab === 4 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Links
              </Typography>
              {!check ? (
                <Skeleton variant="rounded" height={80} />
              ) : (
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {/* Placeholder external tool links based on type */}
                  {check.type === 'SPLUNK' && (
                    <Tooltip title="Open Splunk (placeholder)">
                      <span>
                        <Button size="small" variant="text" endIcon={<OpenInNew />} disabled>
                          View in Splunk
                        </Button>
                      </span>
                    </Tooltip>
                  )}
                  {check.type === 'GRAFANA' && (
                    <Tooltip title="Open Grafana (placeholder)">
                      <span>
                        <Button size="small" variant="text" endIcon={<OpenInNew />} disabled>
                          View in Grafana
                        </Button>
                      </span>
                    </Tooltip>
                  )}
                  {check.type === 'ITRS' && (
                    <Tooltip title="Open ITRS (placeholder)">
                      <span>
                        <Button size="small" variant="text" endIcon={<OpenInNew />} disabled>
                          View in ITRS
                        </Button>
                      </span>
                    </Tooltip>
                  )}
                  {check.type === 'APPDYNAMICS' && (
                    <Tooltip title="Open AppDynamics (placeholder)">
                      <span>
                        <Button size="small" variant="text" endIcon={<OpenInNew />} disabled>
                          View in AppDynamics
                        </Button>
                      </span>
                    </Tooltip>
                  )}
                  {check.type === 'HTTP' && (
                    <Tooltip title="Open Endpoint (placeholder)">
                      <span>
                        <Button size="small" variant="text" endIcon={<OpenInNew />} disabled>
                          Open Endpoint
                        </Button>
                      </span>
                    </Tooltip>
                  )}
                </Stack>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      <ScheduleDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} check={check || null} />
    </Box>
  );
};

export default CheckDetailsPage;