import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Grid, Skeleton, Stack, TextField, Typography, Select, MenuItem, InputLabel, FormControl, Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, Toolbar, Alert, Snackbar, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, LinearProgress, InputAdornment, Menu, CircularProgress } from '@mui/material';
import { Search as SearchIcon, FilterList, Add as AddIcon, Visibility, Edit as EditIcon, ContentCopy, Pause, PlayArrow, Delete as DeleteIcon, Preview, MoreVert } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchReports, pauseReport, resumeReport, duplicateReport, deleteReportThunk, sendTestReport } from '@/store/slices/reportsSlice';
import reportsApi from '@/services/api/reportsApi';
import { useNavigate } from 'react-router-dom';

const ReportsHome: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data, loading, error } = useAppSelector((s) => s.reports);
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

  useEffect(() => {
    dispatch(fetchReports(undefined));
  }, [dispatch]);

  const filteredReports = useMemo(() => {
    let result = data || [];
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
  }, [data, searchQuery, statusFilter, templateFilter]);

  const paginatedReports = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredReports.slice(start, start + rowsPerPage);
  }, [filteredReports, page, rowsPerPage]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={600} gutterBottom>All Reports</Typography>
          <Typography variant="body2" color="text.secondary">Create, preview, and manage scheduled reports</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/checks/reports/new')} size="large">Create Report</Button>
        </Stack>
      </Stack>

      <Card elevation={0} sx={{ border: theme => `1px solid ${theme.palette.divider}`, mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField fullWidth placeholder="Search reports..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }} />
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
                  <MenuItem value="">All Status</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="paused">Paused</MenuItem>
                  <MenuItem value="draft">Draft</MenuItem>
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
            <Grid item xs={12} md={4}>
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
              <Button size="small" variant="outlined" onClick={async () => { await Promise.all(selectedIds.map(id => dispatch(duplicateReport(id)))); setSelectedIds([]); setSnackbar({ open: true, message: 'Duplicated selected reports', severity: 'success' }); }}>Duplicate</Button>
              <Button size="small" color="error" variant="contained" onClick={() => { setSelectedReport(null); setDeleteDialogOpen(true); }}>Delete</Button>
              <Button size="small" onClick={() => setSelectedIds([])}>Clear</Button>
            </Stack>
          </Toolbar>
        </Card>
      )}

      <Card elevation={0} sx={{ border: theme => `1px solid ${theme.palette.divider}` }}>
        {loading === 'loading' && <LinearProgress />}
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
              {loading === 'loading' ? null : paginatedReports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" color="text.secondary">No reports match the current filters</Typography>
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
                    <Chip label={r.status} size="small" color={r.status === 'active' ? 'success' : r.status === 'paused' ? 'warning' : 'default'} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{r.schedule ? `${r.schedule.frequency} ${r.schedule.time ?? ''}` : '—'}</Typography>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    <Typography variant="body2">{r.recipients?.length ?? 0}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1}>
                      <IconButton size="small" title="Quick Preview" onClick={async () => {
                        try {
                          setPreviewLoading(true);
                          setPreviewLoadingId(r.id);
                          setPreviewOpen(true);
                          setPreviewTitle(r.name);
                          const resp = await reportsApi.previewReport(r.id);
                          setPreviewContent(resp.preview);
                        } catch {
                          setPreviewContent('Failed to load preview');
                        } finally {
                          setPreviewLoading(false);
                          setPreviewLoadingId(null);
                        }
                      }}>
                        {previewLoadingId === r.id ? (<CircularProgress size={16} />) : (<Preview />)}
                      </IconButton>
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
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{previewTitle}</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{new Date().toLocaleString()}</Typography>
          {previewLoading ? (
            <Typography variant="body2" color="text.secondary">Loading…</Typography>
          ) : (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace' }}>{previewContent}</pre>
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
        <MenuItem onClick={() => { if (menuReportId) navigate(`/checks/reports/${menuReportId}`); setMenuAnchorEl(null); }}>View Details</MenuItem>
        <MenuItem onClick={() => { if (menuReportId) navigate(`/checks/reports/${menuReportId}/edit`); setMenuAnchorEl(null); }}>Edit</MenuItem>
        <MenuItem onClick={async () => { if (!menuReportId) return; const r = filteredReports.find(x => x.id === menuReportId); if (r?.status === 'paused') { await dispatch(resumeReport(menuReportId)); } else { await dispatch(pauseReport(menuReportId)); } setMenuAnchorEl(null); }}>Pause/Resume</MenuItem>
        <MenuItem onClick={async () => { if (menuReportId) await dispatch(duplicateReport(menuReportId)); setMenuAnchorEl(null); }}>Duplicate</MenuItem>
        <MenuItem onClick={() => { setSelectedReport(menuReportId); setDeleteDialogOpen(true); setMenuAnchorEl(null); }}>Delete</MenuItem>
      </Menu>
    </Box>
  );
};

export default ReportsHome;

