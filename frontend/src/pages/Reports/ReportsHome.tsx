import EmptyState from '@/components/shared/States/EmptyState';
import ErrorState from '@/components/shared/States/ErrorState';
import reportsApi from '@/services/api/reportsApi';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchChecks } from '@/store/slices/checksSlice';
import { deleteReportThunk, duplicateReport, fetchReports, pauseReport, resumeReport, runReportNow } from '@/store/slices/reportsSlice';
import { Add as AddIcon, Assessment, FilterList, MoreVert, Pause, PlayArrow, Preview, Search as SearchIcon, Send } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, Grid, IconButton, InputAdornment, InputLabel, LinearProgress, Menu, MenuItem, Paper, Select, Skeleton, Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Toolbar, Tooltip, Typography } from '@mui/material';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ReportsHome: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data, loading, error, lastFetched } = useAppSelector((s) => s.reports);
  const searchContext = useAppSelector((s) => s.dashboard.searchContext);
  const checksData = useAppSelector((s) => s.checks.data);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [templateFilter, setTemplateFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('Report Preview');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuReportId, setMenuReportId] = useState<string | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, 'ACTIVE' | 'PAUSED' | 'DRAFT'>>({});

  useEffect(() => {
    const freshMs = 60 * 1000;
    const last = lastFetched ? new Date(lastFetched).getTime() : 0;
    if (!last || Date.now() - last > freshMs) {
      dispatch(fetchReports(undefined));
    }
    // Also fetch checks to determine CSI relationships
    if (!checksData || checksData.length === 0) {
      dispatch(fetchChecks({ page: 1, limit: 100 }));
    }
  }, [dispatch, lastFetched, checksData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>('input[placeholder="Search reports..."]');
        el?.focus();
      }
      if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const first = (data && data.length > 0) ? data[0] : undefined;
        if (first) {
          setPreviewOpen(true);
          setPreviewTitle(first.name);
          setPreviewLoading(true);
          reportsApi.previewReport(first.id).then((resp) => setPreviewContent(resp.preview)).finally(() => setPreviewLoading(false));
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [data]);

  const filteredReports = useMemo(() => {
    let result = data || [];
    
    // Apply global CSI filter
    if (searchContext.csiId && checksData) {
      // Get all check IDs that belong to the selected CSI
      const csiCheckIds = checksData
        .filter(check => check.csiId === searchContext.csiId)
        .map(check => check.id);
      
      // Filter reports that either:
      // 1. Include checks from the selected CSI
      // 2. Have sections with rules that include the selected CSI
      result = result.filter((report) => {
        // Check if report has any checks from the selected CSI
        const hasChecksFromCSI = report.selectedChecks.some(checkId => 
          csiCheckIds.includes(checkId)
        );
        
        // Check if report has sections with rules that include the CSI
        const hasSectionWithCSI = (report as any).sections?.some((section: any) => 
          section.rule?.csiIds?.includes(searchContext.csiId)
        );
        
        return hasChecksFromCSI || hasSectionWithCSI;
      });
    }
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
    }
    if (statusFilter) {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (templateFilter) {
      result = result.filter((r) => (r as any).template === templateFilter);
    }
    return result;
  }, [data, searchQuery, statusFilter, templateFilter, searchContext.csiId, checksData]);

  const paginatedReports = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredReports.slice(start, start + rowsPerPage);
  }, [filteredReports, page, rowsPerPage]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3} sx={{ rowGap: 1 }}>
        <Box>
          <Typography variant="h4" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Assessment sx={{ fontSize: 32, color: 'primary.main' }} />
            All Reports
          </Typography>
          <Typography variant="body2" color="text.secondary">Create, preview, and manage scheduled reports</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/checks/reports/new')} size="large">Create Report</Button>
        </Stack>
      </Stack>

      {/* Global search context indicator */}
      {searchContext.csiId && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">Global filter active:</Typography>
            <Chip label={`CSI: ${searchContext.csiId}`} size="small" />
            <Typography variant="body2" sx={{ ml: 2 }}>
              Showing reports that include checks or rules for this CSI
            </Typography>
          </Stack>
        </Alert>
      )}

      <Card elevation={0} sx={{ border: theme => `1px solid ${theme.palette.divider}`, mb: 3 }}>
        <CardContent>
          <Grid container spacing={1} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField fullWidth placeholder="Search reports..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /> </InputAdornment>) }} />
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
                  <MenuItem value="">All Status</MenuItem>
                  <MenuItem value="ACTIVE">Active</MenuItem>
                  <MenuItem value="PAUSED">Paused</MenuItem>
                  <MenuItem value="DRAFT">Draft</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Template</InputLabel>
                <Select value={templateFilter} label="Template" onChange={(e) => setTemplateFilter(e.target.value)}>
                  <MenuItem value="">All Templates</MenuItem>
                  <MenuItem value="standard">Standard</MenuItem>
                  <MenuItem value="executive">Executive</MenuItem>
                  <MenuItem value="detailed">Detailed</MenuItem>
                  <MenuItem value="alert-digest">Alert Digest</MenuItem>
                  <MenuItem value="trend-analysis">Trend Analysis</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                 <Button variant="outlined" startIcon={<FilterList />} onClick={() => { setSearchQuery(''); setStatusFilter(''); setTemplateFilter(''); }}>Clear Filters</Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {selectedIds.length > 0 && (
        <Card elevation={0} sx={{ mb: 2, border: theme => `1px solid ${theme.palette.divider}` }}>
          <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2">{selectedIds.length} selected</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={async () => { await Promise.all(selectedIds.map(id => dispatch(pauseReport(id)))); setSelectedIds([]); setSnackbar({ open: true, message: 'Paused selected reports', severity: 'success' }); }}>Pause</Button>
              <Button size="small" variant="outlined" onClick={async () => { await Promise.all(selectedIds.map(id => dispatch(resumeReport(id)))); setSelectedIds([]); setSnackbar({ open: true, message: 'Resumed selected reports', severity: 'success' }); }}>Resume</Button>
              <Button size="small" color="error" variant="contained" onClick={() => { setSelectedReport(null); setDeleteDialogOpen(true); }}>Delete</Button>
              <Button size="small" onClick={() => setSelectedIds([])}>Clear</Button>
            </Stack>
          </Toolbar>
        </Card>
      )}

      <Card elevation={0} sx={{ border: theme => `1px solid ${theme.palette.divider}` }}>
        {loading === 'loading' && <LinearProgress />}
        {loading === 'failed' && (
          <Box sx={{ p: 2 }}>
            <ErrorState message={error || 'Failed to load reports'} onRetry={() => dispatch(fetchReports(undefined))} />
          </Box>
        )}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={paginatedReports.length > 0 && selectedIds.length > 0 && selectedIds.length < paginatedReports.length}
                    checked={paginatedReports.length > 0 && paginatedReports.every(r => selectedIds.includes(r.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const ids = Array.from(new Set([...selectedIds, ...paginatedReports.map(r => r.id)]));
                        setSelectedIds(ids);
                      } else {
                        const visibleIds = new Set(paginatedReports.map(r => r.id));
                        setSelectedIds(selectedIds.filter(id => !visibleIds.has(id)));
                      }
                    }}
                  />
                </TableCell>
                <TableCell>Report Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Schedule</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Recipients</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading === 'loading' ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 4 }}>
                    <Stack spacing={1}>
                      {[...Array(5)].map((_, idx) => (
                        <Stack key={idx} direction="row" spacing={2} alignItems="center">
                          <Skeleton variant="circular" width={24} height={24} />
                          <Skeleton variant="text" sx={{ flex: 1 }} height={20} />
                          <Skeleton variant="text" width={120} height={20} />
                        </Stack>
                      ))}
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : paginatedReports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <EmptyState title="No reports found" description="Adjust filters or create a new report to get started." actionLabel="Create Report" onAction={() => navigate('/checks/reports/new')} />
                  </TableCell>
                </TableRow>
              )}
              {paginatedReports.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell padding="checkbox">
                    <Checkbox checked={selectedIds.includes(r.id)} onChange={() => setSelectedIds(prev => prev.includes(r.id) ? prev.filter(x => x !== r.id) : [...prev, r.id])} />
                  </TableCell>
                  <TableCell>
                    <Stack>
                      <Typography onClick={() => navigate(`/checks/reports/${r.id}`)} variant="subtitle2" fontWeight={600} sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>{r.name}</Typography>
                      {r.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>{r.description}</Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const rowStatus = optimisticStatus[r.id] ?? r.status;
                      return (
                        <Chip label={rowStatus.charAt(0) + rowStatus.slice(1).toLowerCase()} size="small" color={rowStatus === 'ACTIVE' ? 'success' : rowStatus === 'PAUSED' ? 'warning' : 'default'} aria-label={`status ${rowStatus}`} />
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{r.schedule ? `${r.schedule.frequency} ${r.schedule.time ?? ''}` : '—'}</Typography>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    <Typography variant="body2">{r.recipients?.length ?? 0}</Typography>
                  </TableCell>
                   <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                    {r.status !== 'DRAFT' && (
                        <Tooltip title={r.status === 'PAUSED' ? 'Resume' : 'Pause'}>
                          <span>
                            <IconButton
                          size="small"
                          onClick={async () => {
                            try {
                              setStatusLoadingId(r.id);
                              const previous = r.status;
                              const next = previous === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
                              setOptimisticStatus((prev) => ({ ...prev, [r.id]: next as 'ACTIVE' | 'PAUSED' }));
                              const action = previous === 'PAUSED' ? resumeReport(r.id) : pauseReport(r.id);
                              try {
                                await dispatch(action).unwrap();
                              } catch {
                                // revert visual override on failure
                                setOptimisticStatus((prev) => ({ ...prev, [r.id]: previous as 'ACTIVE' | 'PAUSED' | 'DRAFT' }));
                              }
                            } finally {
                              setStatusLoadingId(null);
                              // clear override to reflect store state
                              setOptimisticStatus((prev) => { const { ...rest } = prev; return rest; });
                            }
                          }}
                          disabled={statusLoadingId === r.id}
                          aria-label={r.status === 'PAUSED' ? 'resume report' : 'pause report'}
                        >
                          {statusLoadingId === r.id ? (
                            <CircularProgress size={16} />
                          ) : r.status === 'PAUSED' ? (
                            <PlayArrow />
                          ) : (
                            <Pause />
                          )}
                        </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      <Tooltip title="Quick Preview">
                        <span>
                      <IconButton size="small" aria-label="quick preview" onClick={async () => {
                        try {
                          setPreviewLoading(true);
                          setPreviewLoadingId(r.id);
                          setPreviewOpen(true);
                          setPreviewTitle(r.name);
                          const resp = await reportsApi.previewReport(r.id);
                          try { (window as any).__REPORT_HTML_PREVIEW__ = resp?.html; } catch { /* The optional preview bridge must not prevent the API result from rendering. */ }
                          setPreviewContent(resp.preview || '');
                        } catch {
                          setPreviewContent('Failed to load preview');
                        } finally {
                          setPreviewLoading(false);
                          setPreviewLoadingId(null);
                        }
                      }}>
                        {previewLoadingId === r.id ? (<CircularProgress size={16} />) : (<Preview />)}
                      </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Send now">
                        <span>
                      <IconButton size="small" aria-label="send now" onClick={async () => {
                        try {
                          await dispatch(runReportNow(r.id)).unwrap();
                          setSnackbar({ open: true, message: 'Report sent (mock)', severity: 'success' });
                        } catch {
                          setSnackbar({ open: true, message: 'Send failed', severity: 'error' });
                        }
                      }}>
                        <Send />
                      </IconButton>
                        </span>
                      </Tooltip>
                      <IconButton size="small" onClick={(e) => { setMenuAnchorEl(e.currentTarget); setMenuReportId(r.id); }}>
                        <MoreVert />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={filteredReports.length} page={page} onPageChange={(_, newPage) => setPage(newPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }} rowsPerPageOptions={[10, 25, 50, 100]} />
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Report{selectedReport ? '' : 's'}</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete {selectedReport ? 'this report' : 'the selected reports'}? This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={async () => {
            try {
              if (selectedReport) {
                await dispatch(deleteReportThunk(selectedReport));
              } else {
                await Promise.all(selectedIds.map(id => dispatch(deleteReportThunk(id))));
                setSelectedIds([]);
              }
              setSnackbar({ open: true, message: 'Deleted successfully', severity: 'success' });
            } catch {
              setSnackbar({ open: true, message: 'Delete failed', severity: 'error' });
            } finally {
              setDeleteDialogOpen(false);
              setSelectedReport(null);
            }
          }}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Quick Preview Dialog */}
        <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth aria-labelledby="quick-preview-title">
        <DialogTitle id="quick-preview-title">{previewTitle}</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{new Date().toLocaleString()}</Typography>
            {previewLoading ? (
              <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">Loading…</Typography>
            ) : (
              <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
                <iframe
                  title="Report Quick Preview"
                  style={{ border: 'none', width: '100%', height: 520, background: '#f3f4f6' }}
                  srcDoc={(() => {
                    const anyWin = window as any;
                    if (typeof anyWin.__REPORT_HTML_PREVIEW__ === 'string' && anyWin.__REPORT_HTML_PREVIEW__.length > 0) return anyWin.__REPORT_HTML_PREVIEW__;
                    const safe = (previewContent || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    return `<!DOCTYPE html><html><body style="font-family:ui-sans-serif,system-ui,Helvetica,Arial,sans-serif;padding:16px;"><pre style="white-space:pre-wrap;margin:0;">${safe}</pre></body></html>`;
                  })()}
                />
              </Paper>
            )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>

      {/* Row Actions Menu */}
      <Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={() => { setMenuAnchorEl(null); setMenuReportId(null); }}>
        <MenuItem onClick={() => { if (menuReportId) navigate(`/checks/reports/${menuReportId}/edit`); setMenuAnchorEl(null); }}>Edit</MenuItem>
        
        <MenuItem onClick={async () => { if (menuReportId) await dispatch(duplicateReport(menuReportId)); setMenuAnchorEl(null); }}>Duplicate</MenuItem>
        <MenuItem onClick={() => { setSelectedReport(menuReportId); setDeleteDialogOpen(true); setMenuAnchorEl(null); }}>Delete</MenuItem>
      </Menu>
    </Box>
  );
};

export default ReportsHome;

