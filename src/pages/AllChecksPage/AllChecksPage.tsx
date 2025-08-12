import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Grid,
  TextField,
  InputAdornment,
  Chip,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Stack,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  FormControl,
  InputLabel,
  Select,
  useTheme,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  CircularProgress,
  Checkbox,
  Toolbar,
} from '@mui/material';
import {
  Search,
  FilterList,
  Add,
  MoreVert,
  CheckCircle,
  Error,
  Warning,
  Schedule,
  PlayArrow,
  Pause,
  Delete,
  Edit,
  Visibility,
  Api,
  Storage,
  AutoGraph,
  Security,
  BugReport,
  Science,
  Refresh,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchChecks, executeCheck, deleteCheck, pauseCheck, resumeCheck } from '@store/slices/checksSlice';
import { addNotification } from '@/store/slices/uiSlice';
import EmptyState from '@/components/shared/States/EmptyState';
import ErrorState from '@/components/shared/States/ErrorState';
import LoadingState from '@/components/shared/States/LoadingState';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { checksApi } from '@/services/api/checksApi';
// Visual skeleton: scope is now shown globally in ScopeBar; this page gets a left FiltersRail
import FiltersRail from './FiltersRail';
import ScheduleDialog from '@components/scheduling/ScheduleDialog';

const AllChecksPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  
  const { data: checks, loading, error, executingChecks, schedulingChecks } = useAppSelector(state => state.checks);
  const { selectedCSI, tags: { selected: selectedTags, filterMode } } = useAppSelector(state => state.csi);
  const location = useLocation();
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  const [persisted, setPersisted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    dispatch(fetchChecks({ page: 1, limit: 100 }));
  }, [dispatch]);

  // Return focus to trigger after closing schedule dialog
  useEffect(() => {
    if (!scheduleDialogOpen && lastFocusRef.current) {
      lastFocusRef.current.focus();
      lastFocusRef.current = null;
    }
  }, [scheduleDialogOpen]);

  // Note: toast handled via notifications when creating a check

  // Persist table preferences (e.g., rowsPerPage)
  useEffect(() => {
    if (!persisted) {
      try {
        const raw = localStorage.getItem('checks:catalog:prefs');
        if (raw) {
          const prefs = JSON.parse(raw);
          if (prefs?.rowsPerPage) setRowsPerPage(prefs.rowsPerPage);
          if (prefs?.searchQuery !== undefined) setSearchQuery(prefs.searchQuery);
          if (prefs?.statusFilter !== undefined) setStatusFilter(prefs.statusFilter);
          if (prefs?.typeFilter !== undefined) setTypeFilter(prefs.typeFilter);
        }
      } catch {}
      setPersisted(true);
    }
  }, [persisted]);

  useEffect(() => {
    try {
      localStorage.setItem('checks:catalog:prefs', JSON.stringify({ rowsPerPage, searchQuery, statusFilter, typeFilter }));
    } catch {}
  }, [rowsPerPage, searchQuery, statusFilter, typeFilter]);

  // Filter and search logic
  const filteredChecks = useMemo(() => {
    let result = checks || [];
    
    // Apply CSI filter
    if (selectedCSI) {
      result = result.filter(check => check.csiId === selectedCSI);
    }
    
    // Apply tag filter
    if (selectedTags && selectedTags.length > 0) {
      result = result.filter(check => {
        const has = (t: string) => check.tags.includes(t);
        return filterMode === 'AND' ? selectedTags.every(has) : selectedTags.some(has);
      });
    }
    
    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(check => 
        check.name.toLowerCase().includes(query) ||
        check.description?.toLowerCase().includes(query) ||
        check.csiName.toLowerCase().includes(query) ||
        check.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    // Apply status filter
    if (statusFilter) {
      result = result.filter(check => check.status === statusFilter);
    }
    
    // Apply type filter
    if (typeFilter) {
      result = result.filter(check => check.type === typeFilter);
    }
    
    return result;
  }, [checks, selectedCSI, selectedTags, searchQuery, statusFilter, typeFilter]);

  // Pagination
  const paginatedChecks = useMemo(() => {
    const startIndex = page * rowsPerPage;
    return filteredChecks.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredChecks, page, rowsPerPage]);

  const allVisibleSelected = paginatedChecks.length > 0 && paginatedChecks.every((c) => selectedIds.includes(c.id));
  const someVisibleSelected = paginatedChecks.some((c) => selectedIds.includes(c.id));

  const toggleSelectAllVisible = (checked: boolean) => {
    if (checked) {
      const ids = Array.from(new Set([...selectedIds, ...paginatedChecks.map((c) => c.id)]));
      setSelectedIds(ids);
    } else {
      const visibleIds = new Set(paginatedChecks.map((c) => c.id));
      setSelectedIds(selectedIds.filter((id) => !visibleIds.has(id)));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const resetSelection = () => setSelectedIds([]);

  const handleBulkExecute = async () => {
    if (selectedIds.length === 0) return;
    try {
      setBulkBusy(true);
      await checksApi.executeMultipleChecks(selectedIds);
      setSnackbar({ open: true, message: `Executed ${selectedIds.length} checks`, severity: 'success' });
      resetSelection();
      dispatch(fetchChecks({ page: 1, limit: 100 }));
    } catch {
      setSnackbar({ open: true, message: 'Bulk execute failed', severity: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      setBulkBusy(true);
      const res = await checksApi.deleteMultipleChecks(selectedIds);
      setSnackbar({ open: true, message: `Deleted ${res.succeeded.length} checks${res.failed.length ? `, failed ${res.failed.length}` : ''}` as any, severity: res.failed.length ? 'error' : 'success' });
      resetSelection();
      dispatch(fetchChecks({ page: 1, limit: 100 }));
    } catch {
      setSnackbar({ open: true, message: 'Bulk delete failed', severity: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkPause = async () => {
    if (selectedIds.length === 0) return;
    try {
      setBulkBusy(true);
      await Promise.all(selectedIds.map((id) => dispatch(pauseCheck(id)).unwrap().catch(() => null)));
      setSnackbar({ open: true, message: `Paused ${selectedIds.length} checks`, severity: 'success' });
      resetSelection();
    } catch {
      setSnackbar({ open: true, message: 'Bulk pause encountered errors', severity: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkResume = async () => {
    if (selectedIds.length === 0) return;
    try {
      setBulkBusy(true);
      await Promise.all(selectedIds.map((id) => dispatch(resumeCheck(id)).unwrap().catch(() => null)));
      setSnackbar({ open: true, message: `Resumed ${selectedIds.length} checks`, severity: 'success' });
      resetSelection();
    } catch {
      setSnackbar({ open: true, message: 'Bulk resume encountered errors', severity: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, checkId: string) => {
    setAnchorEl(event.currentTarget);
    setSelectedCheck(checkId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedCheck(null);
  };

  const handleExecuteCheck = async (checkId: string) => {
    try {
      await dispatch(executeCheck(checkId)).unwrap();
      dispatch(addNotification({ type: 'success', title: 'Execution', message: 'Check executed successfully' }));
    } catch (error) {
      dispatch(addNotification({ type: 'error', title: 'Execution', message: 'Failed to execute check' }));
    }
    handleMenuClose();
  };

  const handleDeleteCheck = async () => {
    if (!selectedCheck) return;
    
    try {
      await dispatch(deleteCheck(selectedCheck)).unwrap();
      dispatch(addNotification({ type: 'success', title: 'Delete', message: 'Check deleted successfully' }));
    } catch (error) {
      dispatch(addNotification({ type: 'error', title: 'Delete', message: 'Failed to delete check' }));
    }
    
    setDeleteDialogOpen(false);
    handleMenuClose();
  };

  const handlePauseCheck = async (checkId: string) => {
    try {
      await dispatch(pauseCheck(checkId)).unwrap();
      dispatch(addNotification({ type: 'success', title: 'Schedule', message: 'Check paused successfully' }));
    } catch (error) {
      dispatch(addNotification({ type: 'error', title: 'Schedule', message: 'Failed to pause check' }));
    }
    handleMenuClose();
  };

  const handleResumeCheck = async (checkId: string) => {
    try {
      await dispatch(resumeCheck(checkId)).unwrap();
      dispatch(addNotification({ type: 'success', title: 'Schedule', message: 'Check resumed successfully' }));
    } catch (error) {
      dispatch(addNotification({ type: 'error', title: 'Schedule', message: 'Failed to resume check' }));
    }
    handleMenuClose();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASSING': return <CheckCircle sx={{ color: theme.palette.success.main }} />;
      case 'FAILING': return <Error sx={{ color: theme.palette.error.main }} />;
      case 'WARNING': return <Warning sx={{ color: theme.palette.warning.main }} />;
      case 'PENDING': return <Schedule sx={{ color: theme.palette.info.main }} />;
      default: return <Schedule sx={{ color: theme.palette.grey[500] }} />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'HTTP': return <Api />;
      case 'TCP': return <Storage />;
      case 'SPLUNK': return <AutoGraph />;
      case 'GRAFANA': return <AutoGraph />;
      case 'ITRS': return <Security />;
      case 'APPDYNAMICS': return <BugReport />;
      case 'UI_TEST': return <Science />;
      default: return <Api />;
    }
  };

  const getStatusChip = (status: string) => {
    const configs = {
      PASSING: { color: 'success' as const, label: 'Passing' },
      FAILING: { color: 'error' as const, label: 'Failing' },
      WARNING: { color: 'warning' as const, label: 'Warning' },
      PENDING: { color: 'info' as const, label: 'Pending' },
      UNKNOWN: { color: 'default' as const, label: 'Unknown' },
    };
    const config = configs[status as keyof typeof configs] || configs.UNKNOWN;
    return <Chip label={config.label} color={config.color} size="small" />;
  };

  if (error) {
    return (
      <ErrorState message={`Error loading checks: ${error}`} onRetry={() => dispatch(fetchChecks({ page: 1, limit: 100 }))} />
    );
  }

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={600} gutterBottom>
            All Checks
          </Typography>
          <Typography variant="body2" color="text.secondary">
            View and manage all health checks across your systems
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate('/checks/create')}
            size="large"
          >
            Create Check
          </Button>
        </Stack>
      </Stack>

      {/* Search and quick controls */}
      <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                placeholder="Search checks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  label="Status"
                >
                  <MenuItem value="">All Status</MenuItem>
                  <MenuItem value="PASSING">Passing</MenuItem>
                  <MenuItem value="FAILING">Failing</MenuItem>
                  <MenuItem value="WARNING">Warning</MenuItem>
                  <MenuItem value="PENDING">Pending</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  label="Type"
                >
                  <MenuItem value="">All Types</MenuItem>
                  <MenuItem value="HTTP">HTTP</MenuItem>
                  <MenuItem value="TCP">TCP</MenuItem>
                  <MenuItem value="SPLUNK">Splunk</MenuItem>
                  <MenuItem value="GRAFANA">Grafana</MenuItem>
                  <MenuItem value="ITRS">ITRS</MenuItem>
                  <MenuItem value="APPDYNAMICS">AppDynamics</MenuItem>
                  <MenuItem value="UI_TEST">UI Test</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  startIcon={<Refresh />}
                  onClick={() => dispatch(fetchChecks({ page: 1, limit: 100 }))}
                >
                  Refresh
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<FilterList />}
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('');
                    setTypeFilter('');
                  }}
                >
                  Clear Filters
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Bulk actions toolbar */}
      {selectedIds.length > 0 && (
        <Paper elevation={0} sx={{ mb: 2, border: `1px solid ${theme.palette.divider}` }}>
          <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2">{selectedIds.length} selected</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={handleBulkExecute} disabled={bulkBusy}>Execute</Button>
              <Button size="small" variant="outlined" onClick={handleBulkPause} disabled={bulkBusy}>Pause</Button>
              <Button size="small" variant="outlined" onClick={handleBulkResume} disabled={bulkBusy}>Resume</Button>
              <Button size="small" color="error" variant="contained" onClick={handleBulkDelete} disabled={bulkBusy}>Delete</Button>
              <Button size="small" onClick={resetSelection} disabled={bulkBusy}>Clear</Button>
            </Stack>
          </Toolbar>
        </Paper>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={3} lg={3}>
          <FiltersRail />
        </Grid>
        <Grid item xs={12} md={9} lg={9}>
          {/* Results Summary */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Showing {paginatedChecks.length} of {filteredChecks.length} checks
            {selectedCSI && ' (CSI scope active)'}
            {selectedTags.length > 0 && ` (${selectedTags.length} tag filters)`}
          </Typography>

          {/* Checks Table */}
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
        {loading === 'loading' && <LinearProgress />}
        
        <TableContainer>
          <Table size="small">
            <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={!allVisibleSelected && someVisibleSelected}
                      checked={allVisibleSelected}
                      onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                      inputProps={{ 'aria-label': 'select all visible checks' }}
                    />
                  </TableCell>
                <TableCell>Check Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Last Execution</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading === 'loading' ? null : paginatedChecks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <EmptyState title="No checks match the current filters" description="Try clearing filters or create a new check." actionLabel="Create Check" onAction={() => navigate('/checks/create')} />
                  </TableCell>
                </TableRow>
              )}
              {paginatedChecks.map((check) => (
                <TableRow key={check.id} hover>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedIds.includes(check.id)}
                      onChange={() => toggleRow(check.id)}
                      inputProps={{ 'aria-label': `select ${check.name}` }}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack>
                      <Typography
                        component={RouterLink}
                        to={`/checks/details/${check.id}`}
                        variant="subtitle2"
                        fontWeight={600}
                        sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                      >
                        {check.name}
                      </Typography>
                      {check.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                          {check.description}
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      {getTypeIcon(check.type)}
                      <Typography variant="body2">{check.type}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {getStatusChip(check.status)}
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    <Typography variant="body2">
                      {check.lastExecution 
                        ? new Date(check.lastExecution).toLocaleString()
                        : 'Never'
                      }
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1}>
                      <IconButton
                        size="small"
                        onClick={() => handleExecuteCheck(check.id)}
                        title="Execute Now"
                        disabled={executingChecks.includes(check.id)}
                      >
                        {executingChecks.includes(check.id) ? (
                          <CircularProgress size={16} />
                        ) : (
                          <PlayArrow />
                        )}
                      </IconButton>
                      {/* Stop/Start schedule icon hidden per request */}
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuClick(e, check.id)}
                      >
                        <MoreVert />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

            <TablePagination
              component="div"
              count={filteredChecks.length}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
          </Card>
        </Grid>
      </Grid>

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {
          if (selectedCheck) navigate(`/checks/edit/${selectedCheck}`);
          handleMenuClose();
        }}>
          <Edit sx={{ mr: 1 }} />
          Edit Check
        </MenuItem>
        <MenuItem onClick={(e) => {
          lastFocusRef.current = (e.currentTarget as HTMLElement) || (document.activeElement as HTMLElement | null);
          setScheduleDialogOpen(true);
          setAnchorEl(null);
        }}>
          <Schedule sx={{ mr: 1 }} />
          Manage Schedule
        </MenuItem>
        <MenuItem onClick={() => {
          setDeleteDialogOpen(true);
          handleMenuClose();
        }}>
          <Delete sx={{ mr: 1, color: 'error.main' }} />
          Delete Check
        </MenuItem>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Check</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this check? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteCheck} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Schedule Dialog */}
      <ScheduleDialog
        open={scheduleDialogOpen}
        onClose={() => {
          setScheduleDialogOpen(false);
          setSelectedCheck(null);
        }}
        check={selectedCheck ? checks?.find(c => c.id === selectedCheck) || null : null}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AllChecksPage;