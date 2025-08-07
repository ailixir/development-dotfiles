import React, { useState, useEffect } from 'react';
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
  Avatar,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Stack,
  Divider,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Checkbox,
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  useTheme,
  alpha,
  Switch,
  FormControlLabel,
  Badge,
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
  GetApp,
  Refresh,
  TrendingUp,
  Settings,
  Api,
  Storage,
  AutoGraph,
  Speed,
  Security,
  BugReport,
  Domain,
  LocationOn,
  AccessTime,
  Person,
  CalendarToday,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchChecks } from '@store/slices/checksSlice';

// Mock checks data with comprehensive details
const mockChecks = [
  {
    id: '1',
    name: 'Trading API Health Check',
    type: 'HTTP',
    status: 'passing',
    csi: 'Trading Platform',
    environment: 'Production',
    url: 'https://api.trading.citi.com/health',
    frequency: '5 minutes',
    lastRun: '2025-01-07T10:30:00Z',
    nextRun: '2025-01-07T10:35:00Z',
    responseTime: 89,
    uptime: 99.9,
    owner: 'trading-team@citi.com',
    created: '2024-12-01',
    enabled: true,
  },
  {
    id: '2',
    name: 'Database Connection Monitor',
    type: 'TCP',
    status: 'warning',
    csi: 'Banking Services',
    environment: 'Production',
    url: 'db.banking.citi.com:5432',
    frequency: '2 minutes',
    lastRun: '2025-01-07T10:32:00Z',
    nextRun: '2025-01-07T10:34:00Z',
    responseTime: 245,
    uptime: 98.2,
    owner: 'platform-team@citi.com',
    created: '2024-11-15',
    enabled: true,
  },
  {
    id: '3',
    name: 'Market Data Feed Monitor',
    type: 'Splunk',
    status: 'failing',
    csi: 'Trading Platform',
    environment: 'Production',
    url: 'splunk://market-data-feed',
    frequency: '1 minute',
    lastRun: '2025-01-07T10:33:00Z',
    nextRun: '2025-01-07T10:34:00Z',
    responseTime: 0,
    uptime: 87.3,
    owner: 'market-data@citi.com',
    created: '2024-10-20',
    enabled: false,
  },
  {
    id: '4',
    name: 'Payment Gateway Status',
    type: 'HTTP',
    status: 'passing',
    csi: 'Payment Systems',
    environment: 'Production',
    url: 'https://payments.citi.com/status',
    frequency: '3 minutes',
    lastRun: '2025-01-07T10:31:00Z',
    nextRun: '2025-01-07T10:34:00Z',
    responseTime: 156,
    uptime: 99.95,
    owner: 'payments@citi.com',
    created: '2024-09-10',
    enabled: true,
  },
];

const AllChecksPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data: _checks, loading } = useAppSelector(state => state.checks);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    dispatch(fetchChecks({ page: 1, limit: 50 }));
  }, [dispatch]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passing': return <CheckCircle sx={{ color: 'success.main' }} />;
      case 'failing': return <Error sx={{ color: 'error.main' }} />;
      case 'warning': return <Warning sx={{ color: 'warning.main' }} />;
      default: return <Schedule sx={{ color: 'text.secondary' }} />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'HTTP': return <Api sx={{ color: '#3B82F6' }} />;
      case 'TCP': return <Storage sx={{ color: '#10B981' }} />;
      case 'Splunk': return <AutoGraph sx={{ color: '#F59E0B' }} />;
      case 'Grafana': return <Speed sx={{ color: '#8B5CF6' }} />;
      case 'ITRS': return <Security sx={{ color: '#EC4899' }} />;
      case 'AppDynamics': return <BugReport sx={{ color: '#14B8A6' }} />;
      default: return <Domain sx={{ color: 'text.secondary' }} />;
    }
  };

  const filteredChecks = mockChecks.filter(check => {
    const matchesSearch = check.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         check.csi.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         check.url.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus.length === 0 || selectedStatus.includes(check.status);
    const matchesType = selectedType.length === 0 || selectedType.includes(check.type);
    const matchesEnvironment = selectedEnvironment.length === 0 || selectedEnvironment.includes(check.environment);
    
    return matchesSearch && matchesStatus && matchesType && matchesEnvironment;
  });

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelected = filteredChecks.map(check => check.id);
      setSelected(newSelected);
      return;
    }
    setSelected([]);
  };

  const handleCheckClick = (event: React.MouseEvent<unknown>, id: string) => {
    const selectedIndex = selected.indexOf(id);
    let newSelected: string[] = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selected, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selected.slice(1));
    } else if (selectedIndex === selected.length - 1) {
      newSelected = newSelected.concat(selected.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selected.slice(0, selectedIndex),
        selected.slice(selectedIndex + 1)
      );
    }
    setSelected(newSelected);
  };

  const isSelected = (id: string) => selected.indexOf(id) !== -1;

  const statusCounts = {
    passing: mockChecks.filter(c => c.status === 'passing').length,
    failing: mockChecks.filter(c => c.status === 'failing').length,
    warning: mockChecks.filter(c => c.status === 'warning').length,
    total: mockChecks.length,
  };

  return (
    <Box>
      {/* Enhanced Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Avatar sx={{ bgcolor: 'info.main', width: 48, height: 48 }}>
                <Domain sx={{ fontSize: 28 }} />
              </Avatar>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  All Checks
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Manage and monitor all health checks across your systems
                </Typography>
              </Box>
            </Box>
          </Box>
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<GetApp />}
              size="small"
            >
              Export
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => {}}
            >
              Create Check
            </Button>
          </Stack>
        </Box>

        {/* Status Summary Cards */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.1)} 0%, ${alpha(theme.palette.success.main, 0.05)} 100%)`,
              borderTop: `3px solid ${theme.palette.success.main}`
            }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="text.secondary" variant="overline" sx={{ fontWeight: 600 }}>
                      Passing Checks
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>
                      {statusCounts.passing}
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={(statusCounts.passing / statusCounts.total) * 100}
                      sx={{ 
                        mt: 1,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: alpha(theme.palette.success.main, 0.2),
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: theme.palette.success.main,
                        }
                      }}
                    />
                  </Box>
                  <CheckCircle sx={{ fontSize: 48, color: 'success.main', opacity: 0.7 }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.1)} 0%, ${alpha(theme.palette.error.main, 0.05)} 100%)`,
              borderTop: `3px solid ${theme.palette.error.main}`
            }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="text.secondary" variant="overline" sx={{ fontWeight: 600 }}>
                      Failing Checks
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'error.main' }}>
                      {statusCounts.failing}
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={(statusCounts.failing / statusCounts.total) * 100}
                      sx={{ 
                        mt: 1,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: alpha(theme.palette.error.main, 0.2),
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: theme.palette.error.main,
                        }
                      }}
                    />
                  </Box>
                  <Error sx={{ fontSize: 48, color: 'error.main', opacity: 0.7 }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.1)} 0%, ${alpha(theme.palette.warning.main, 0.05)} 100%)`,
              borderTop: `3px solid ${theme.palette.warning.main}`
            }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="text.secondary" variant="overline" sx={{ fontWeight: 600 }}>
                      Warning Checks
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'warning.main' }}>
                      {statusCounts.warning}
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={(statusCounts.warning / statusCounts.total) * 100}
                      sx={{ 
                        mt: 1,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: alpha(theme.palette.warning.main, 0.2),
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: theme.palette.warning.main,
                        }
                      }}
                    />
                  </Box>
                  <Warning sx={{ fontSize: 48, color: 'warning.main', opacity: 0.7 }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
              borderTop: `3px solid ${theme.palette.primary.main}`
            }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="text.secondary" variant="overline" sx={{ fontWeight: 600 }}>
                      Total Checks
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {statusCounts.total}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <TrendingUp sx={{ fontSize: 16, color: 'success.main' }} />
                      <Typography variant="caption" color="success.main">
                        +12% this month
                      </Typography>
                    </Box>
                  </Box>
                  <Domain sx={{ fontSize: 48, color: 'primary.main', opacity: 0.7 }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* Main Content */}
      <Paper sx={{ overflow: 'hidden' }}>
        {/* Toolbar */}
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search checks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={8}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Button
                    variant={showFilters ? "contained" : "outlined"}
                    size="small"
                    startIcon={<FilterList />}
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    Filters
                  </Button>
                  {selected.length > 0 && (
                    <Chip 
                      label={`${selected.length} selected`} 
                      onDelete={() => setSelected([])}
                      color="primary"
                    />
                  )}
                </Stack>
                
                <Stack direction="row" spacing={1}>
                  <Tooltip title="Refresh">
                    <IconButton size="small">
                      <Refresh />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Settings">
                    <IconButton size="small">
                      <Settings />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>
            </Grid>
          </Grid>

          {/* Filter Panel */}
          {showFilters && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                      multiple
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value as string[])}
                      input={<OutlinedInput label="Status" />}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {(selected as string[]).map((value) => (
                            <Chip key={value} label={value} size="small" />
                          ))}
                        </Box>
                      )}
                    >
                      {['passing', 'failing', 'warning'].map((status) => (
                        <MenuItem key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Type</InputLabel>
                    <Select
                      multiple
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value as string[])}
                      input={<OutlinedInput label="Type" />}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {(selected as string[]).map((value) => (
                            <Chip key={value} label={value} size="small" />
                          ))}
                        </Box>
                      )}
                    >
                      {['HTTP', 'TCP', 'Splunk', 'Grafana', 'ITRS', 'AppDynamics'].map((type) => (
                        <MenuItem key={type} value={type}>
                          {type}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Environment</InputLabel>
                    <Select
                      multiple
                      value={selectedEnvironment}
                      onChange={(e) => setSelectedEnvironment(e.target.value as string[])}
                      input={<OutlinedInput label="Environment" />}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {(selected as string[]).map((value) => (
                            <Chip key={value} label={value} size="small" />
                          ))}
                        </Box>
                      )}
                    >
                      {['Production', 'Staging', 'Development'].map((env) => (
                        <MenuItem key={env} value={env}>
                          {env}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Box>
          )}
        </Box>

        {/* Data Table */}
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    color="primary"
                    indeterminate={selected.length > 0 && selected.length < filteredChecks.length}
                    checked={filteredChecks.length > 0 && selected.length === filteredChecks.length}
                    onChange={handleSelectAllClick}
                  />
                </TableCell>
                <TableCell>Check Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>CSI</TableCell>
                <TableCell>Environment</TableCell>
                <TableCell>Response Time</TableCell>
                <TableCell>Uptime</TableCell>
                <TableCell>Last Run</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredChecks
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((check) => {
                  const isItemSelected = isSelected(check.id);
                  return (
                    <TableRow
                      hover
                      key={check.id}
                      selected={isItemSelected}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          color="primary"
                          checked={isItemSelected}
                          onChange={(event) => handleCheckClick(event, check.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                              {check.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {check.url}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={getStatusIcon(check.status)}
                          label={check.status.toUpperCase()}
                          size="small"
                          color={
                            check.status === 'passing' ? 'success' :
                            check.status === 'failing' ? 'error' :
                            'warning'
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {getTypeIcon(check.type)}
                          <Typography variant="body2">{check.type}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{check.csi}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={check.environment}
                          size="small"
                          variant="outlined"
                          color={check.environment === 'Production' ? 'error' : 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
                          <Typography variant="body2">
                            {check.responseTime > 0 ? `${check.responseTime}ms` : '-'}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {check.uptime}%
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={check.uptime}
                            size="small"
                            sx={{
                              height: 4,
                              borderRadius: 2,
                              backgroundColor: alpha(theme.palette.success.main, 0.2),
                              '& .MuiLinearProgress-bar': {
                                backgroundColor: check.uptime >= 99 ? theme.palette.success.main :
                                              check.uptime >= 95 ? theme.palette.warning.main :
                                              theme.palette.error.main,
                              }
                            }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CalendarToday sx={{ fontSize: 16, color: 'text.secondary' }} />
                          <Typography variant="body2">
                            {new Date(check.lastRun).toLocaleString()}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
                          <Typography variant="body2">{check.owner}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5}>
                          <Tooltip title="View Details">
                            <IconButton size="small">
                              <Visibility />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton size="small">
                              <Edit />
                            </IconButton>
                          </Tooltip>
                          <IconButton
                            size="small"
                            onClick={(event) => {
                              setAnchorEl(event.currentTarget);
                              setSelectedCheck(check.id);
                            }}
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

        {/* Pagination */}
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={filteredChecks.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(event, newPage) => setPage(newPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
        />

        {/* Context Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
        >
          <MenuItem onClick={() => setAnchorEl(null)}>
            <PlayArrow sx={{ mr: 1 }} />
            Run Check
          </MenuItem>
          <MenuItem onClick={() => setAnchorEl(null)}>
            <Pause sx={{ mr: 1 }} />
            Pause Check
          </MenuItem>
          <MenuItem onClick={() => setAnchorEl(null)}>
            <Edit sx={{ mr: 1 }} />
            Edit Check
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => setAnchorEl(null)} sx={{ color: 'error.main' }}>
            <Delete sx={{ mr: 1 }} />
            Delete Check
          </MenuItem>
        </Menu>
      </Paper>
    </Box>
  );
};

export default AllChecksPage;