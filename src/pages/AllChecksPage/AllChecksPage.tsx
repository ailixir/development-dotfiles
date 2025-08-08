import React, { useState, useEffect, useMemo } from 'react';
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
import { fetchChecks, executeCheck, deleteCheck } from '@store/slices/checksSlice';
import { useNavigate } from 'react-router-dom';
import { FilterBar } from '@components/common/FilterBar';

const AllChecksPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  
  const { data: checks, loading, error } = useAppSelector(state => state.checks);
  const { selectedCSI, tags: { selected: selectedTags } } = useAppSelector(state => state.csi);
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  useEffect(() => {
    dispatch(fetchChecks({ page: 1, limit: 100 }));
  }, [dispatch]);

  // Filter and search logic
  const filteredChecks = useMemo(() => {
    let result = checks || [];
    
    // Apply CSI filter
    if (selectedCSI) {
      result = result.filter(check => check.csiId === selectedCSI);
    }
    
    // Apply tag filter
    if (selectedTags && selectedTags.length > 0) {
      result = result.filter(check => 
        selectedTags.every(tag => check.tags.includes(tag))
      );
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
      setSnackbar({ open: true, message: 'Check executed successfully', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: 'Failed to execute check', severity: 'error' });
    }
    handleMenuClose();
  };

  const handleDeleteCheck = async () => {
    if (!selectedCheck) return;
    
    try {
      await dispatch(deleteCheck(selectedCheck)).unwrap();
      setSnackbar({ open: true, message: 'Check deleted successfully', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: 'Failed to delete check', severity: 'error' });
    }
    
    setDeleteDialogOpen(false);
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
      <Box>
        <Alert severity="error" sx={{ mb: 3 }}>
          Error loading checks: {error}
        </Alert>
      </Box>
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
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => navigate('/checks/create')}
          size="large"
        >
          Create Check
        </Button>
      </Stack>

      {/* Filter Bar */}
      <FilterBar />

      {/* Search and Filters */}
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

      {/* Results Summary */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Showing {paginatedChecks.length} of {filteredChecks.length} checks
        {selectedCSI && ' (filtered by CSI)'}
        {selectedTags.length > 0 && ` (filtered by ${selectedTags.length} tags)`}
      </Typography>

      {/* Checks Table */}
      <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
        {loading === 'loading' && <LinearProgress />}
        
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Check Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>CSI</TableCell>
                <TableCell>Last Execution</TableCell>
                <TableCell>Schedule</TableCell>
                <TableCell>Tags</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedChecks.map((check) => (
                <TableRow key={check.id} hover>
                  <TableCell>
                    <Stack>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {check.name}
                      </Typography>
                      {check.description && (
                        <Typography variant="caption" color="text.secondary">
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
                  <TableCell>
                    <Stack>
                      <Typography variant="body2" fontWeight={500}>
                        {check.csiId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {check.csiName}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {check.lastExecution 
                        ? new Date(check.lastExecution).toLocaleString()
                        : 'Never'
                      }
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={check.schedule.enabled ? check.schedule.frequency : 'Disabled'}
                      size="small"
                      variant={check.schedule.enabled ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {check.tags.slice(0, 3).map((tag) => (
                        <Chip key={tag} label={tag} size="small" variant="outlined" />
                      ))}
                      {check.tags.length > 3 && (
                        <Chip label={`+${check.tags.length - 3}`} size="small" variant="outlined" />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1}>
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/checks/${check.id}`)}
                        title="View Details"
                      >
                        <Visibility />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleExecuteCheck(check.id)}
                        title="Execute Now"
                      >
                        <PlayArrow />
                      </IconButton>
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

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {
          if (selectedCheck) navigate(`/checks/${selectedCheck}`);
          handleMenuClose();
        }}>
          <Visibility sx={{ mr: 1 }} />
          View Details
        </MenuItem>
        <MenuItem onClick={() => {
          if (selectedCheck) navigate(`/checks/edit/${selectedCheck}`);
          handleMenuClose();
        }}>
          <Edit sx={{ mr: 1 }} />
          Edit Check
        </MenuItem>
        <MenuItem onClick={() => {
          if (selectedCheck) handleExecuteCheck(selectedCheck);
        }}>
          <PlayArrow sx={{ mr: 1 }} />
          Execute Now
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