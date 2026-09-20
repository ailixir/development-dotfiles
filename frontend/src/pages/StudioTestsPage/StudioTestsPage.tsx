import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Card, CardContent, Chip, Grid, IconButton, InputAdornment, MenuItem, Pagination, Paper, Select, Stack, TextField, Tooltip, Typography, Skeleton, CircularProgress, Snackbar, Alert, Button, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel } from '@mui/material';
import { Add, Delete, PlayArrow, Search, Science } from '@mui/icons-material';
import studioApi from '@/services/api/studioApi';
import {
  subscribeToExecution,
  type ExecutionSubscription,
} from '@/services/api/studioTransportWiring';
import {
  defaultConfiguration,
  isTerminalExecutionStatus,
  type ExecutionSnapshot,
  type TestDto,
  type TestRequest,
} from '@/types/studio/studioTypes';
import {
  executeRefusalFor,
  executionStatusLabel,
  executionStatusTone,
  isCancelledOutcome,
} from '@/components/studio/run';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/store';

const pageSize = 9;

/** The last-run filter. `NEVER` is a draft with no run; the rest are the backend's outcomes. */
const LAST_RUN_FILTERS = ['PASSED', 'FAILED', 'ERROR'] as const;
const NEVER_RUN = 'NEVER';

function lastRunChipLabel(test: Pick<TestDto, 'lastRunStatus'>): string {
  return test.lastRunStatus ? `Last run: ${executionStatusLabel(test.lastRunStatus)}` : 'Never run';
}

/** How the outcome of a run started from this page is announced. */
function runOutcomeMessage(testName: string, snapshot: Pick<ExecutionSnapshot, 'status' | 'errorCode'>): string {
  return `${testName}: ${executionStatusLabel(snapshot.status, snapshot.errorCode)}`;
}

const StudioTestsPage: React.FC = () => {
  const [tests, setTests] = useState<TestDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [lastRun, setLastRun] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const searchContext = useAppSelector(state => state.dashboard.searchContext);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  /** One live subscription per test run from this page. All are closed when the page unmounts. */
  const subscriptions = useRef<Map<string, ExecutionSubscription>>(new Map());
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error'; id?: string }>({ open: false, message: '', severity: 'success' });
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', environment: 'Development', csiId: '', description: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await studioApi.listTests({});
      setTests(res.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const open = subscriptions.current;
    return () => {
      open.forEach((subscription) => subscription.close());
      open.clear();
    };
  }, []);

  const finishRun = (testId: string) => {
    subscriptions.current.get(testId)?.close();
    subscriptions.current.delete(testId);
    setRunning((r) => ({ ...r, [testId]: false }));
  };

  /**
   * Runs a draft and reports its outcome. The outcome comes through the same live transport the
   * Studio page uses (SSE, with polling as the fallback), and the run counts as ended only on a
   * status in the shared terminal set. A transport that gives up without a terminal status is
   * reported as "could not follow the run", not as a failed test.
   */
  const runTest = async (test: TestDto) => {
    setRunning((r) => ({ ...r, [test.id]: true }));
    let executionId: string;
    try {
      executionId = (await studioApi.executeTest(test.id)).executionId;
    } catch (error: unknown) {
      const failure = error as {
        response?: { status?: number; data?: { error?: string; message?: string } };
        message?: string;
      };
      const refusal = executeRefusalFor(
        failure.response?.status ?? null,
        failure.response?.data?.error ?? null,
      );
      setRunning((r) => ({ ...r, [test.id]: false }));
      setSnack({
        open: true,
        message: `${test.name}: ${refusal?.title ?? failure.message ?? 'the run could not be started'}`,
        severity: 'error',
        id: test.id,
      });
      return;
    }
    let settled = false;
    subscriptions.current.get(test.id)?.close();
    const subscription = subscribeToExecution(executionId, {
      onSnapshot: (snapshot) => {
        if (settled || !isTerminalExecutionStatus(snapshot.status)) return;
        settled = true;
        const outcome = snapshot.status as TestDto['lastRunStatus'];
        setTests((previous) =>
          previous.map((candidate) =>
            candidate.id === test.id
              ? { ...candidate, lastRunStatus: outcome, lastRunAt: snapshot.endedAt ?? candidate.lastRunAt }
              : candidate,
          ),
        );
        setSnack({
          open: true,
          message: runOutcomeMessage(test.name, snapshot),
          severity:
            snapshot.status === 'PASSED' || isCancelledOutcome(snapshot.status, snapshot.errorCode)
              ? 'success'
              : 'error',
          id: test.id,
        });
        finishRun(test.id);
      },
      onClosed: () => {
        if (settled) return;
        settled = true;
        setSnack({
          open: true,
          message: `${test.name}: the run was started, but its outcome could not be followed here. See Runs.`,
          severity: 'error',
          id: test.id,
        });
        finishRun(test.id);
      },
    });
    if (!settled) {
      subscriptions.current.set(test.id, subscription);
    }
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (tests || []).filter((t) => {
      // Apply global CSI filter
      if (searchContext.csiId && t.csiId !== searchContext.csiId) {
        return false;
      }
      const matchesQ = !term || t.name.toLowerCase().includes(term) || t.description?.toLowerCase().includes(term);
      const matchesLastRun =
        !lastRun || (lastRun === NEVER_RUN ? t.lastRunStatus === null : t.lastRunStatus === lastRun);
      return matchesQ && matchesLastRun;
    });
  }, [tests, q, lastRun, searchContext.csiId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Science sx={{ fontSize: 32, color: 'primary.main' }} />
          Studio Tests
        </Typography>
        <Stack direction="row" spacing={1}>
          
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateOpen(true)}
            size="large"
          >
            Create Test
          </Button>
        </Stack>
      </Stack>

      {/* Global search context indicator */}
      {searchContext.csiId && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">Global filter active:</Typography>
            <Chip label={`CSI: ${searchContext.csiId}`} size="small" />
          </Stack>
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={1} alignItems="center">
          <Grid item xs={12} md={9}>
            <TextField fullWidth placeholder="Search by name, description…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField fullWidth select label="Last run" size="medium" value={lastRun} onChange={(e) => { setLastRun(e.target.value); setPage(1); }}>
              <MenuItem value="">All</MenuItem>
              {LAST_RUN_FILTERS.map((outcome) => (
                <MenuItem key={outcome} value={outcome}>{executionStatusLabel(outcome)}</MenuItem>
              ))}
              <MenuItem value={NEVER_RUN}>Never run</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2}>
        {(loading ? [...Array(pageSize)].map((_, i) => ({ id: `s${i}` })) : paged).map((t: any) => (
          <Grid key={t.id} item xs={12} md={6} lg={4}>
            <Card variant="outlined" sx={{ height: 200, display: 'flex' }}>
              <CardContent sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography 
                      variant="subtitle1" 
                      fontWeight={600}
                      onClick={() => !loading && !running[t.id] && navigate(`/checks/studio/${t.id}`)}
                      sx={{ 
                        cursor: loading || running[t.id] ? 'default' : 'pointer',
                        color: loading || running[t.id] ? 'text.primary' : 'primary.main',
                        '&:hover': { 
                          textDecoration: loading || running[t.id] ? 'none' : 'underline' 
                        }
                      }}
                    >
                      {t.name || <Skeleton width={160} />}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title={running[t.id] ? 'Running…' : 'Run'}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={loading || !!running[t.id]}
                            aria-label={`Run ${t.name}`}
                            onClick={() => { void runTest(t); }}
                          >
                            {running[t.id] ? <CircularProgress size={16} /> : <PlayArrow fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <span><IconButton size="small" disabled={loading || !!running[t.id]} onClick={async () => { try { await studioApi.deleteTest(t.id); await load(); } catch { setSnack({ open: true, message: `${t.name}: could not be deleted`, severity: 'error', id: t.id }); } }}><Delete fontSize="small" /></IconButton></span>
                      </Tooltip>
                    </Stack>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{t.description || <Skeleton width={220} />}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {!loading && (
                      <Chip
                        size="small"
                        label={lastRunChipLabel(t)}
                        color={t.lastRunStatus ? executionStatusTone(t.lastRunStatus) : 'default'}
                        variant="filled"
                        data-testid={`last-run-${t.id}`}
                      />
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>Updated {t.updatedAt ? new Date(t.updatedAt).toLocaleString() : ''}</Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Stack alignItems="center" sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Showing {paged.length} of {filtered.length} tests
          {searchContext.csiId && ` (filtered by CSI: ${searchContext.csiId})`}
        </Typography>
        <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} size="small" />
      </Stack>

      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnack((s) => ({ ...s, open: false }))} severity={snack.severity} sx={{ width: '100%' }} variant="filled"
          action={
            <Button color="inherit" size="small" onClick={() => { if (snack.id) navigate(`/checks/studio/${snack.id}`); }}>
              View
            </Button>
          }
        >
          {snack.message}
        </Alert>
      </Snackbar>

      {/* New Test Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New UI Test</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Name" fullWidth value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} required />
            <FormControl fullWidth>
              <InputLabel>Environment</InputLabel>
              <Select label="Environment" value={createForm.environment} onChange={(e) => setCreateForm((f) => ({ ...f, environment: e.target.value as string }))}>
                <MenuItem value="Development">Development</MenuItem>
                <MenuItem value="Staging">Staging</MenuItem>
                <MenuItem value="UAT">UAT</MenuItem>
                <MenuItem value="Production">Production</MenuItem>
              </Select>
            </FormControl>
            <TextField label="CSI ID" fullWidth placeholder="123456" value={createForm.csiId} onChange={(e) => setCreateForm((f) => ({ ...f, csiId: e.target.value }))} />
            <TextField label="Description" fullWidth multiline minRows={2} value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} />
            <Typography variant="caption" color="text.secondary">You can add steps and variables in the Studio editor after creating the test.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!createForm.name || creating} onClick={async () => {
            try {
              setCreating(true);
              const payload: TestRequest = {
                name: createForm.name,
                csiId: createForm.csiId,
                description: createForm.description,
                environment: createForm.environment,
                steps: [],
                variables: [],
                configuration: defaultConfiguration(),
              };
              const created = await studioApi.createTest(payload);
              setSnack({ open: true, message: 'Test created', severity: 'success', id: created?.id });
              setCreateOpen(false);
              setCreateForm({ name: '', environment: 'Development', csiId: '', description: '' });
              await load();
            } catch (e) {
              setSnack({ open: true, message: 'Failed to create test', severity: 'error' });
            } finally {
              setCreating(false);
            }
          }}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StudioTestsPage;


