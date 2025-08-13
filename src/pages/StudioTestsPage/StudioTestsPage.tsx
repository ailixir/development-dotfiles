import React, { useEffect, useMemo, useState } from 'react';
import { Box, Card, CardContent, Chip, Divider, Grid, IconButton, InputAdornment, MenuItem, Pagination, Paper, Select, Stack, TextField, Tooltip, Typography, Skeleton, CircularProgress, Snackbar, Alert, Button, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel } from '@mui/material';
import { Add, Delete, PlayArrow, Refresh, Search, Science } from '@mui/icons-material';
import studioApi from '@/services/api/studioApi';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/store';

interface UITestItem {
  id: string;
  name: string;
  csiId: string;
  description?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

const pageSize = 9;

const StudioTestsPage: React.FC = () => {
  const [tests, setTests] = useState<UITestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  // CSI filter removed per request
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const searchContext = useAppSelector(state => state.dashboard.searchContext);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [lastOutcome, setLastOutcome] = useState<Record<string, 'success' | 'failed' | 'timeout'>>({});
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error'; id?: string }>({ open: false, message: '', severity: 'success' });
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', environment: 'Development', csiId: '', description: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = (await studioApi.listTests({})) as any;
      setTests(res.data || res || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (tests || []).filter((t) => {
      // Apply global CSI filter
      if (searchContext.csiId && t.csiId !== searchContext.csiId) {
        return false;
      }
      const matchesQ = !term || t.name.toLowerCase().includes(term) || t.description?.toLowerCase().includes(term);
      const matchesStatus = !status || t.status === status;
      return matchesQ && matchesStatus;
    });
  }, [tests, q, status, searchContext.csiId]);

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
            <TextField fullWidth select label="Status" size="medium" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="archived">Archived</MenuItem>
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
                            onClick={async () => {
                              try {
                                setRunning((r) => ({ ...r, [t.id]: true }));
                                const res = await studioApi.executeTest(t.id) as any;
                                const execId = res?.executionId;
                                const startedAt = Date.now();
                                // Poll until terminal or timeout ~6s
                                const poll = async () => {
                                  try {
                                    const exec = await studioApi.getExecution(execId) as any;
                                    if (exec?.status === 'completed' || exec?.status === 'failed' || exec?.status === 'timeout') {
                                      setRunning((r) => ({ ...r, [t.id]: false }));
                                      setLastOutcome((o) => ({ ...o, [t.id]: exec.status === 'completed' ? 'success' : exec.status }));
                                      setSnack({ open: true, message: `${t.name}: ${exec.status === 'completed' ? 'SUCCESS' : 'FAILED'}`, severity: exec.status === 'completed' ? 'success' : 'error', id: t.id });
                                      return;
                                    }
                                  } catch {}
                                  if (Date.now() - startedAt < 6500) {
                                    setTimeout(poll, 500);
                                  } else {
                                    setRunning((r) => ({ ...r, [t.id]: false }));
                                  }
                                };
                                if (execId) poll(); else setRunning((r) => ({ ...r, [t.id]: false }));
                              } catch {
                                setRunning((r) => ({ ...r, [t.id]: false }));
                              }
                            }}
                          >
                            {running[t.id] ? <CircularProgress size={16} /> : <PlayArrow fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <span><IconButton size="small" disabled={loading || !!running[t.id]} onClick={async () => { try { await studioApi.deleteTest(t.id); await load(); } catch {} }}><Delete fontSize="small" /></IconButton></span>
                      </Tooltip>
                    </Stack>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{t.description || <Skeleton width={220} />}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      size="small"
                      label={(t.status || 'draft')}
                      color={t.status === 'active' ? 'success' : t.status === 'archived' ? 'default' : 'warning'}
                      variant="outlined"
                    />
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
              const payload: any = { name: createForm.name, csiId: createForm.csiId, description: createForm.description, steps: [], environment: createForm.environment };
              const created = await studioApi.createTest(payload) as any;
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


