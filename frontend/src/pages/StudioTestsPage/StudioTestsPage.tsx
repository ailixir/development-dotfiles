import React, { useEffect, useMemo, useState } from 'react';
import { Box, Card, CardContent, Chip, Grid, IconButton, InputAdornment, MenuItem, Pagination, Paper, Select, Stack, TextField, Tooltip, Typography, Skeleton, Snackbar, Alert, Button, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, FormHelperText, InputLabel } from '@mui/material';
import { Add, Delete, PlayArrow, Search, Science } from '@mui/icons-material';
import studioApi from '@/services/api/studioApi';
import {
  defaultConfiguration,
  type TestDto,
  type TestRequest,
} from '@/types/studio/studioTypes';
import {
  executionStatusLabel,
  executionStatusTone,
} from '@/components/studio/run';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchCSIs } from '@/store/slices/csiSlice';

const pageSize = 9;

/** The last-run filter. `NEVER` is a draft with no run; the rest are the backend's outcomes. */
const LAST_RUN_FILTERS = ['PASSED', 'FAILED', 'ERROR'] as const;
const NEVER_RUN = 'NEVER';

function lastRunChipLabel(test: Pick<TestDto, 'lastRunStatus'>): string {
  return test.lastRunStatus ? `Previous run: ${executionStatusLabel(test.lastRunStatus)}` : 'No run history';
}

const StudioTestsPage: React.FC = () => {
  const [tests, setTests] = useState<TestDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [lastRun, setLastRun] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const searchContext = useAppSelector(state => state.dashboard.searchContext);
  const { data: registeredCsis, loading: csiLoading, error: csiError } = useAppSelector(state => state.csi);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error'; id?: string }>({ open: false, message: '', severity: 'success' });
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', csiId: '', environment: 'Development', description: '' });

  const suggestedCsiId = useMemo(() => {
    if (searchContext.csiId && registeredCsis.some((csi) => csi.id === searchContext.csiId)) {
      return searchContext.csiId;
    }
    return registeredCsis.length === 1 ? registeredCsis[0].id : '';
  }, [registeredCsis, searchContext.csiId]);
  const selectedCsiIsRegistered = csiLoading === 'succeeded'
    && !csiError
    && registeredCsis.some((csi) => csi.id === createForm.csiId);

  const load = async () => {
    setLoading(true);
    try {
      const res = await studioApi.listTests({});
      setTests(res.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    dispatch(fetchCSIs());
  }, [dispatch]);

  useEffect(() => {
    if (!createOpen || csiLoading !== 'succeeded') return;
    setCreateForm((form) => {
      if (registeredCsis.some((csi) => csi.id === form.csiId)) return form;
      return { ...form, csiId: suggestedCsiId };
    });
  }, [createOpen, csiLoading, registeredCsis, suggestedCsiId]);

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
            onClick={() => {
              setCreateForm((form) => ({ ...form, csiId: suggestedCsiId }));
              setCreateOpen(true);
            }}
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
                      onClick={() => !loading && navigate(`/checks/studio/${t.id}`)}
                      sx={{ 
                        cursor: loading ? 'default' : 'pointer',
                        color: loading ? 'text.primary' : 'primary.main',
                        '&:hover': { 
                          textDecoration: loading ? 'none' : 'underline'
                        }
                      }}
                    >
                      {t.name || <Skeleton width={160} />}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="Open test">
                        <span>
                          <IconButton
                            size="small"
                            disabled={loading}
                            aria-label={`Open ${t.name}`}
                            onClick={() => navigate(`/checks/studio/${t.id}`)}
                          >
                            <PlayArrow fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <span><IconButton size="small" disabled={loading} onClick={async () => { try { await studioApi.deleteTest(t.id); await load(); } catch { setSnack({ open: true, message: `${t.name}: could not be deleted`, severity: 'error', id: t.id }); } }}><Delete fontSize="small" /></IconButton></span>
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
                  {!loading && t.lastRunStatus && (
                    <Typography variant="caption" color="text.secondary">
                      This is run history and may describe an earlier saved version.
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Stack alignItems="center" sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Showing {paged.length} of {filtered.length} tests
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
            <FormControl fullWidth required error={csiLoading === 'succeeded' && !selectedCsiIsRegistered}>
              <InputLabel id="studio-test-system-label">System (CSI)</InputLabel>
              <Select
                labelId="studio-test-system-label"
                label="System (CSI)"
                value={selectedCsiIsRegistered ? createForm.csiId : ''}
                disabled={csiLoading === 'loading' || registeredCsis.length === 0}
                onChange={(e) => setCreateForm((form) => ({ ...form, csiId: String(e.target.value) }))}
              >
                {registeredCsis.map((csi) => (
                  <MenuItem key={csi.id} value={csi.id}>{csi.id} — {csi.name}</MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {csiLoading === 'loading'
                  ? 'Loading available systems…'
                  : csiError
                    ? 'Systems could not be loaded. Please try again.'
                    : registeredCsis.length === 0
                      ? 'No systems are available for new tests.'
                      : !selectedCsiIsRegistered
                        ? 'Choose the system this test belongs to.'
                        : 'The test will be saved under this system.'}
              </FormHelperText>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Environment</InputLabel>
              <Select label="Environment" value={createForm.environment} onChange={(e) => setCreateForm((f) => ({ ...f, environment: e.target.value as string }))}>
                <MenuItem value="Development">Development</MenuItem>
                <MenuItem value="Staging">Staging</MenuItem>
                <MenuItem value="UAT">UAT</MenuItem>
                <MenuItem value="Production">Production</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Description" fullWidth multiline minRows={2} value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} />
            <Typography variant="caption" color="text.secondary">You can add steps and variables in the Studio editor after creating the test.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!createForm.name.trim() || !selectedCsiIsRegistered || creating} onClick={async () => {
            try {
              setCreating(true);
              const payload: TestRequest = {
                name: createForm.name.trim(),
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
              setCreateForm({ name: '', csiId: '', environment: 'Development', description: '' });
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
