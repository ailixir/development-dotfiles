import EmptyState from '@/components/shared/States/EmptyState';
import ErrorState from '@/components/shared/States/ErrorState';
import { useLatestLearningAttempts } from '@/components/studio/guided/useLatestLearningAttempts';
import { useUiTestAvailability } from '@/hooks/useUiTestAvailability';
import { checksApi } from '@/services/api/checksApi';
import { addNotification } from '@/store/slices/uiSlice';
import {
  Add,
  Api,
  AutoGraph,
  BugReport,
  Checklist,
  Delete,
  Edit,
  FilterList,
  MoreVert,
  PlayArrow,
  Schedule,
  Science,
  Search,
  Security,
  Storage
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Toolbar,
  Typography,
  useTheme
} from '@mui/material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { deleteCheck, executeCheck, fetchCheckById, fetchChecks, pauseCheck, resumeCheck } from '@store/slices/checksSlice';
import { fetchCSIs } from '@store/slices/csiSlice';
import { selectSources } from '@store/slices/sourcesSlice';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
// Visual skeleton: scope is now shown globally in ScopeBar; this page gets a left FiltersRail
import ScheduleDialog, { type ScheduleTarget } from '@components/scheduling/ScheduleDialog';
import {
  UI_TEST_TYPE,
  buildCatalogRows,
  checkRowIds,
  filterCatalogRows,
  isUiCatalogRow
} from './catalogRows';
import FiltersRail from './FiltersRail';
import UiTestCatalogRow from './UiTestCatalogRow';
import { UiTestCapNotice, UiTestEmptyState, UiTestLoadFailureNotice } from './UiTestCatalogNotices';
import { useUiTestCatalog } from './useUiTestCatalog';

const PREFS_KEY = 'checks:catalog:prefs';

/** Status filter values only UI tests have: one per readiness state other than READY (spec 9.3). */
const READINESS_STATUS_VALUES: readonly string[] = ['UNLEARNED', 'LEARNING', 'NEEDS_RELEARN'];

interface StoredCatalogPrefs {
  rowsPerPage?: number;
  searchQuery?: string;
  statusFilter?: string;
  typeFilter?: string;
}

/** Reads the stored table preferences once, before the first render, so no request goes out with defaults. */
function readStoredPrefs(): StoredCatalogPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const prefs = JSON.parse(raw);
    if (!prefs || typeof prefs !== 'object') return {};
    return {
      rowsPerPage: prefs.rowsPerPage ? prefs.rowsPerPage : undefined,
      searchQuery: typeof prefs.searchQuery === 'string' ? prefs.searchQuery : undefined,
      statusFilter: typeof prefs.statusFilter === 'string' ? prefs.statusFilter : undefined,
      typeFilter: typeof prefs.typeFilter === 'string' ? prefs.typeFilter : undefined
    };
  } catch {
    /* Storage is optional; retain the in-memory state when persistence is unavailable. */
    return {};
  }
}

/**
 * Compact cell controls below `sm` so the phone table (checkbox, name, status, actions) fits 390 px.
 * From `sm` up the values are MUI's own defaults, so the desktop layout is unchanged. Same values as the
 * UI test rows in UiTestCatalogRow.tsx.
 */
const compactCheckboxSx = { p: { xs: 0.5, sm: 1.125 } } as const;
const compactIconButtonSx = { p: { xs: '3px', sm: '5px' } } as const;
const compactChipSx = {
  fontSize: { xs: '0.6875rem', sm: '0.8125rem' },
  // Below sm a long label ("Needs re-learn") wraps instead of widening the Status column.
  height: { xs: 'auto', sm: 24 },
  '& .MuiChip-label': {
    px: { xs: 0.75, sm: 1 },
    py: { xs: '2px', sm: 0 },
    whiteSpace: { xs: 'normal', sm: 'nowrap' },
    textAlign: { xs: 'center', sm: 'left' },
  },
} as const;

const AllChecksPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const sources = useAppSelector(selectSources);
  const isSourceEnabled = (type: string) => {
    if (sources.length === 0) return true;
    const s = sources.find((src) => src.type === type);
    return s ? s.enabled : true;
  };
  
  const { data: checks, loading, error, executingChecks } = useAppSelector(state => state.checks);
  const { selectedCSI, tags: { selected: selectedTags, filterMode } } = useAppSelector(state => state.csi);
  const searchContext = useAppSelector(state => state.dashboard.searchContext);
  
  // Local state
  const [storedPrefs] = useState(readStoredPrefs);
  const [searchParams] = useSearchParams();
  const urlType = searchParams.get('type');
  const availability = useUiTestAvailability();
  const uiTestsOn = availability === 'on';
  const [searchQuery, setSearchQuery] = useState(storedPrefs.searchQuery ?? '');
  const [statusFilter, setStatusFilter] = useState<string>(storedPrefs.statusFilter ?? '');
  // The raw Type value. ?type=UI_TEST beats the stored one. A UI_TEST that availability does not (yet) allow is held here,
  // and only the effective value below is applied or written (DC-18).
  const [typeFilter, setTypeFilter] = useState<string>(
    urlType === UI_TEST_TYPE ? UI_TEST_TYPE : storedPrefs.typeFilter ?? ''
  );
  const handledUrlType = useRef(urlType);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(storedPrefs.rowsPerPage ?? 25);
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    dispatch(fetchChecks({ page: 1, limit: 100 }));
  }, [dispatch]);

  // A later ?type=UI_TEST (for example the Dashboard action while this page is open) is applied like the first one.
  useEffect(() => {
    if (handledUrlType.current === urlType) return;
    handledUrlType.current = urlType;
    if (urlType === UI_TEST_TYPE) setTypeFilter(UI_TEST_TYPE);
  }, [urlType]);

  // Return focus to trigger after closing schedule dialog
  useEffect(() => {
    if (!scheduleDialogOpen && lastFocusRef.current) {
      lastFocusRef.current.focus();
      lastFocusRef.current = null;
    }
  }, [scheduleDialogOpen]);

  // Note: toast handled via notifications when creating a check

  // Effective filter values. A UI test only type or status is applied when UI tests are on; otherwise it reads as
  // All Types / All Status (and is never written), whether it came from the URL or from the stored preferences.
  const effectiveType = uiTestsOn ? typeFilter : typeFilter === UI_TEST_TYPE ? '' : typeFilter;
  const effectiveStatus = uiTestsOn || !READINESS_STATUS_VALUES.includes(statusFilter) ? statusFilter : '';

  // Persist table preferences. Nothing is written while availability is unknown, so a held UI_TEST is not lost or leaked.
  useEffect(() => {
    if (availability === 'pending') return;
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ rowsPerPage, searchQuery, statusFilter: effectiveStatus, typeFilter: effectiveType })
      );
    } catch { /* Storage is optional; retain the in-memory state when persistence is unavailable. */ }
  }, [availability, rowsPerPage, searchQuery, effectiveStatus, effectiveType]);

  // UI tests: one Studio list request, only when availability is 'on'; the server applies system, environment and search.
  const uiTestCatalog = useUiTestCatalog({
    csiId: searchContext.csiId,
    environment: searchContext.environment,
    q: searchQuery
  });
  const csiList = useAppSelector((state) => state.csi.data);
  const csiLoadState = useAppSelector((state) => state.csi.loading);
  useEffect(() => {
    // UI test rows show the CSI name from the store; the store is filled here only if nothing has asked for it yet.
    if (uiTestsOn && csiLoadState === 'idle') dispatch(fetchCSIs());
  }, [dispatch, uiTestsOn, csiLoadState]);

  // Filter and search logic (check rows only: scope, tags and search)
  const scheduleTarget = useMemo<ScheduleTarget | null>(() => {
    const check = selectedCheck ? checks?.find((c) => c.id === selectedCheck) : undefined;
    return check ? { kind: 'check', id: check.id, name: check.name, schedule: check.schedule } : null;
  }, [checks, selectedCheck]);

  const filteredChecks = useMemo(() => {
    let result = checks || [];
    
    // Apply CSI filter from global search context
    if (searchContext.csiId) {
      result = result.filter(check => check.csiId === searchContext.csiId);
    }
    
    // Apply environment filter from global search context
    if (searchContext.environment) {
      result = result.filter(check => check.environment === searchContext.environment);
    }
    
    // Apply tag filter from global search context
    if (searchContext.tags && searchContext.tags.length > 0) {
      result = result.filter(check => {
        const has = (t: string) => check.tags.includes(t);
        return searchContext.tagMode === 'AND' ? searchContext.tags.every(has) : searchContext.tags.some(has);
      });
    }
    
    // Apply local tag filter (if still needed)
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
    
    return result;
  }, [checks, searchContext.csiId, searchContext.environment, searchContext.tags, searchContext.tagMode, selectedTags, filterMode, searchQuery]);

  // The merged catalog: check rows and UI test rows in one list, deduplicated (the UI test wins) and ordered.
  const tagFilterActive = (searchContext.tags?.length ?? 0) > 0 || (selectedTags?.length ?? 0) > 0;
  const filteredRows = useMemo(() => {
    const csiNames = new Map(csiList.map((csi) => [csi.id, csi.name]));
    const rows = buildCatalogRows({
      checks: filteredChecks,
      tests: uiTestCatalog.tests,
      csiNameOf: (csiId) => csiNames.get(csiId)
    });
    return filterCatalogRows(rows, { statusFilter: effectiveStatus, typeFilter: effectiveType, tagFilterActive });
  }, [filteredChecks, uiTestCatalog.tests, csiList, effectiveStatus, effectiveType, tagFilterActive]);

  // The UI test empty state: the Type filter is UI Test and the server has no UI test for the scope (a search that
  // matches nothing is a plain "no match", not "no UI tests yet").
  const showUiTestEmptyState =
    effectiveType === UI_TEST_TYPE &&
    !uiTestCatalog.loading &&
    !uiTestCatalog.error &&
    uiTestCatalog.tests.length === 0 &&
    !searchQuery.trim();

  // Pagination
  const paginatedRows = useMemo(() => {
    const startIndex = page * rowsPerPage;
    return filteredRows.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  // The failed-learn line (AC-04): one read per rendered page, for the visible UI test rows that are
  // UNLEARNED or NEEDS_RELEARN only. No such row means no request, and a row never reads for itself.
  const learningAttemptIds = useMemo(
    () =>
      paginatedRows
        .filter(isUiCatalogRow)
        .filter(({ test }) => test.readiness === 'UNLEARNED' || test.readiness === 'NEEDS_RELEARN')
        .map(({ test }) => test.id),
    [paginatedRows]
  );
  const { byTestId: latestAttempts } = useLatestLearningAttempts(learningAttemptIds);

  // Selection and bulk actions take check ids only; a UI test id never reaches them (FR-17).
  const visibleCheckIds = checkRowIds(paginatedRows);
  const allVisibleSelected = visibleCheckIds.length > 0 && visibleCheckIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleCheckIds.some((id) => selectedIds.includes(id));
  const uiTestIds = new Set(uiTestCatalog.tests.map((test) => test.id));
  const bulkIds = selectedIds.filter((id) => !uiTestIds.has(id));

  const toggleSelectAllVisible = (checked: boolean) => {
    if (checked) {
      const ids = Array.from(new Set([...selectedIds, ...visibleCheckIds]));
      setSelectedIds(ids);
    } else {
      const visibleIds = new Set(visibleCheckIds);
      setSelectedIds(selectedIds.filter((id) => !visibleIds.has(id)));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const resetSelection = () => setSelectedIds([]);

  const handleBulkExecute = async () => {
    if (bulkIds.length === 0) return;
    try {
      setBulkBusy(true);
      await checksApi.executeMultipleChecks(bulkIds);
      setSnackbar({ open: true, message: `Executed ${bulkIds.length} checks`, severity: 'success' });
      resetSelection();
      dispatch(fetchChecks({ page: 1, limit: 100 }));
    } catch {
      setSnackbar({ open: true, message: 'Bulk execute failed', severity: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (bulkIds.length === 0) return;
    try {
      setBulkBusy(true);
      const res = await checksApi.deleteMultipleChecks(bulkIds);
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
    if (bulkIds.length === 0) return;
    try {
      setBulkBusy(true);
      await Promise.all(bulkIds.map((id) => dispatch(pauseCheck(id)).unwrap().catch(() => null)));
      setSnackbar({ open: true, message: `Paused ${bulkIds.length} checks`, severity: 'success' });
      resetSelection();
    } catch {
      setSnackbar({ open: true, message: 'Bulk pause encountered errors', severity: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkResume = async () => {
    if (bulkIds.length === 0) return;
    try {
      setBulkBusy(true);
      await Promise.all(bulkIds.map((id) => dispatch(resumeCheck(id)).unwrap().catch(() => null)));
      setSnackbar({ open: true, message: `Resumed ${bulkIds.length} checks`, severity: 'success' });
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
    return <Chip label={config.label} color={config.color} size="small" sx={compactChipSx} />;
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
          <Typography variant="h4" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checklist sx={{ fontSize: 32, color: 'primary.main' }} />
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

      {/* Global search context indicator */}
      {(searchContext.csiId || searchContext.environment || searchContext.tags.length > 0) && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">Global filters active:</Typography>
            {searchContext.csiId && <Chip label={`CSI: ${searchContext.csiId}`} size="small" />}
            {searchContext.environment && <Chip label={`Env: ${searchContext.environment}`} size="small" />}
            {searchContext.tags.length > 0 && <Chip label={`Tags: ${searchContext.tags.length}`} size="small" />}
          </Stack>
        </Alert>
      )}

      {/* Search and quick controls */}
      <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, mb: 3 }}>
        <CardContent>
          <Grid container spacing={1} alignItems="center">
            <Grid item xs={12} md={5}>
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
                  value={effectiveStatus}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  label="Status"
                >
                  <MenuItem value="">All Status</MenuItem>
                  <MenuItem value="PASSING">Passing</MenuItem>
                  <MenuItem value="FAILING">Failing</MenuItem>
                  <MenuItem value="WARNING">Warning</MenuItem>
                  <MenuItem value="PENDING">Pending</MenuItem>
                  {uiTestsOn && <MenuItem value="UNLEARNED">Not learned</MenuItem>}
                  {uiTestsOn && <MenuItem value="LEARNING">Learning</MenuItem>}
                  {uiTestsOn && <MenuItem value="NEEDS_RELEARN">Needs re-learn</MenuItem>}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={effectiveType}
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
                  {uiTestsOn && <MenuItem value={UI_TEST_TYPE}>UI Test</MenuItem>}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  startIcon={<FilterList />}
                  sx={{ whiteSpace: 'nowrap' }}
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
      {bulkIds.length > 0 && (
        <Paper elevation={0} sx={{ mb: 2, border: `1px solid ${theme.palette.divider}` }}>
          <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2">{bulkIds.length} selected</Typography>
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
        {/* Results Summary: above both columns, so the filters rail and the table start on one line. */}
        <Grid item xs={12}>
          <Typography variant="body2" color="text.secondary">
            Showing {paginatedRows.length} of {filteredRows.length} checks
            {searchContext.csiId && ` (CSI: ${searchContext.csiId})`}
            {searchContext.environment && ` (Env: ${searchContext.environment})`}
            {searchContext.tags.length > 0 && ` (${searchContext.tags.length} global tag filters)`}
            {selectedCSI && ' (Local CSI scope active)'}
            {selectedTags.length > 0 && ` (${selectedTags.length} local tag filters)`}
          </Typography>
        </Grid>
        <Grid item xs={12} md={3} lg={3}>
          <FiltersRail />
        </Grid>
        <Grid item xs={12} md={9} lg={9}>
          {/* UI test list notices: the check rows stay when the Studio list fails or is cut */}
          {uiTestCatalog.error && <UiTestLoadFailureNotice onRetry={uiTestCatalog.retry} />}
          <UiTestCapNotice totalElements={uiTestCatalog.totalElements} />

          {/* Checks Table */}
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
        {(loading === 'loading' || uiTestCatalog.loading) && <LinearProgress />}
        
        <TableContainer data-testid="all-checks-table-container">
          <Table
            size="small"
            // md-lg: the table is only 570-660 px wide beside the filters rail, so cells keep 8 px side padding
            // there; Type and Last Execution then stay on one line without a horizontal scroll.
            sx={{ '& .MuiTableCell-root:not(.MuiTableCell-paddingCheckbox)': { px: { xs: 1, sm: 2, md: 1, xl: 2 } } }}
          >
            <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      sx={compactCheckboxSx}
                      indeterminate={!allVisibleSelected && someVisibleSelected}
                      checked={allVisibleSelected}
                      onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                      disabled={visibleCheckIds.length === 0}
                      inputProps={{ 'aria-label': 'select all visible checks' }}
                    />
                  </TableCell>
                <TableCell>Check Name</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, minWidth: 112 }}>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, whiteSpace: 'nowrap' }}>Last Execution</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading === 'loading' || uiTestCatalog.loading ? null : paginatedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    {showUiTestEmptyState ? (
                      <UiTestEmptyState />
                    ) : (
                      <EmptyState title="No checks match the current filters" description="Try clearing filters or create a new check." actionLabel="Create Check" onAction={() => navigate('/checks/create')} />
                    )}
                  </TableCell>
                </TableRow>
              )}
              {paginatedRows.map((row) => {
                if (isUiCatalogRow(row)) {
                  return <UiTestCatalogRow key={`ui-test-${row.test.id}`} row={row} attempt={latestAttempts.get(row.test.id)} onDeleted={() => uiTestCatalog.retry()} />;
                }
                const check = row.check;
                return (
                  <TableRow key={`check-${check.id}`} hover data-testid={`check-row-${check.id}`}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        sx={compactCheckboxSx}
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
                          sx={{ color: 'primary.main', textDecoration: 'none', overflowWrap: 'anywhere', '&:hover': { textDecoration: 'underline' } }}
                        >
                          {check.name}
                        </Typography>
                        {check.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                            {check.description}
                          </Typography>
                        )}
                        {/* Below md the Last Execution column is hidden; its value shows here instead. */}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          data-testid={`check-last-run-caption-${check.id}`}
                          sx={{ display: { xs: 'block', md: 'none' } }}
                        >
                          Last run: {check.lastExecution ? new Date(check.lastExecution).toLocaleString() : 'Never'}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        {getTypeIcon(check.type)}
                        <Typography variant="body2">{check.type}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" flexWrap="wrap" gap={0.5}>
                        {getStatusChip(check.status)}
                        {!isSourceEnabled(check.type) && (
                          <Chip label="Source disabled" size="small" variant="outlined" color="default" sx={compactChipSx} />
                        )}
                      </Stack>
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
                      <Stack direction="row" spacing={{ xs: 0, sm: 1 }} justifyContent="flex-end">
                        <IconButton
                          size="small"
                          sx={compactIconButtonSx}
                          data-testid={`check-execute-${check.id}`}
                          onClick={() => handleExecuteCheck(check.id)}
                          title={isSourceEnabled(check.type) ? 'Execute Now' : 'Source disabled'}
                          disabled={executingChecks.includes(check.id) || !isSourceEnabled(check.type)}
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
                          sx={compactIconButtonSx}
                          data-testid={`check-more-${check.id}`}
                          onClick={(e) => handleMenuClick(e, check.id)}
                        >
                          <MoreVert />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

            <TablePagination
              component="div"
              data-testid="all-checks-pagination"
              sx={{
                // Below sm the rows-per-page selector is hidden so the arrows are not clipped.
                '& .MuiTablePagination-selectLabel': { display: { xs: 'none', sm: 'block' } },
                '& .MuiTablePagination-input': { display: { xs: 'none', sm: 'inline-flex' } },
              }}
              count={filteredRows.length}
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
          Edit
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
          Delete
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
        target={scheduleTarget}
        onSaved={async () => {
          if (selectedCheck) await dispatch(fetchCheckById(selectedCheck)).unwrap();
        }}
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