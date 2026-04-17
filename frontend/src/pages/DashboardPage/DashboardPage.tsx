import React, { useEffect, useMemo, useState } from 'react';
import { 
  Box, 
  Grid, 
  Typography, 
  Paper,
  Card,
  CardContent,
  Chip,
  Alert,
  IconButton,
  useTheme,
  alpha,
  Stack,
  Avatar,
  Button,
  Tooltip,
  Badge,
  Fade,
  Grow,
  CircularProgress,
  Divider,
} from '@mui/material';
import { keyframes } from '@emotion/react';
import {
  CheckCircle,
  Error,
  Warning,
  Refresh,
  TrendingUp,
  TrendingDown,
  Schedule,
  Speed,
  Api,
  // Storage,
  AutoGraph,
  Security,
  BugReport,
  Science,
  ArrowForward,
  Business,
  Groups,
  Category,
  // Visibility,
  PlayArrow,
  Timer,
  // CloudSync,
  // IntegrationInstructions,
  Hub,
  Insights,
  // AccountTree,
  HealthAndSafety,
  Assessment,
  NotificationsActive,
  Timeline,
  // DataUsage,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchChecks } from '@store/slices/checksSlice';
import { useNavigate } from 'react-router-dom';
// Page-level FilterBar removed per global Scope Bar adoption in layout
import { parseTag } from '@utils/tagUtils';
import type { CSI } from '@/types/csi/csiTypes';
import UpcomingExecutions from '@components/scheduling/UpcomingExecutions';

// Mock real-time data for demonstration
const mockRealTimeData = {
  executionsPerMinute: 47,
  averageResponseTime: 145,
  activeIncidents: 2,
  scheduledMaintenance: 1,
};

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
`;

const DashboardPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  
  const { data: checks, loading, error } = useAppSelector(state => state.checks);
  const { selectedCSI, tags: { selected: selectedTags }, data: csiData } = useAppSelector(state => state.csi);
  
  const [refreshing, setRefreshing] = useState(false);
  const [pulseAnimation, setPulseAnimation] = useState(true);

  useEffect(() => {
    dispatch(fetchChecks({ page: 1, limit: 100 }));
    // Simulate real-time updates
    const interval = setInterval(() => {
      setPulseAnimation(prev => !prev);
    }, 3000);
    return () => clearInterval(interval);
  }, [dispatch]);

  // Filter checks based on selected CSI and tags
  const filteredChecks = useMemo(() => {
    let result = checks || [];
    
    if (selectedCSI) {
      result = result.filter(check => check.csiId === selectedCSI);
    }
    
    if (selectedTags && selectedTags.length > 0) {
      result = result.filter(check => 
        selectedTags.every(tag => check.tags.includes(tag))
      );
    }
    
    return result;
  }, [checks, selectedCSI, selectedTags]);

  // Get selected CSI details
  const selectedCSIDetails = useMemo(() => {
    if (!selectedCSI || !Array.isArray(csiData)) return null;
    return (csiData as CSI[]).find((csi: CSI) => csi.id === selectedCSI) || null;
  }, [selectedCSI, csiData]);

  // Calculate comprehensive metrics
  const metrics = useMemo(() => {
    const total = filteredChecks?.length || 0;
    const passing = filteredChecks?.filter(c => c.status === 'PASSING').length || 0;
    const failing = filteredChecks?.filter(c => c.status === 'FAILING').length || 0;
    const warning = filteredChecks?.filter(c => c.status === 'WARNING').length || 0;
    const pending = filteredChecks?.filter(c => c.status === 'PENDING').length || 0;
    const uptime = total > 0 ? ((passing / total) * 100) : 0;
    
    // Calculate trends (mock data for demo)
    const weeklyTrend = uptime > 95 ? 2.3 : uptime > 85 ? 0.5 : -1.2;
    const mttr = failing > 0 ? 24.5 : 0; // Mean Time To Resolve in minutes
    
    return { total, passing, failing, warning, pending, uptime, weeklyTrend, mttr };
  }, [filteredChecks]);

  // Group checks by integration tool
  const integrationMetrics = useMemo(() => {
    const tools: Record<string, { count: number; icon: React.ElementType; color: 'primary' | 'warning' | 'info' | 'success' | 'error' | 'secondary' }>
      = {
        'HTTP/TCP': { count: 0, icon: Api, color: 'primary' },
        'Splunk': { count: 0, icon: AutoGraph, color: 'warning' },
        'Grafana': { count: 0, icon: Speed, color: 'info' },
        'ITRS': { count: 0, icon: Security, color: 'success' },
        'AppDynamics': { count: 0, icon: BugReport, color: 'error' },
        'UI Tests': { count: 0, icon: Science, color: 'secondary' },
      };

    filteredChecks.forEach(check => {
      switch (check.type) {
        case 'HTTP':
        case 'TCP':
          tools['HTTP/TCP'].count += 1;
          break;
        case 'SPLUNK':
          tools['Splunk'].count += 1;
          break;
        case 'GRAFANA':
          tools['Grafana'].count += 1;
          break;
        case 'ITRS':
          tools['ITRS'].count += 1;
          break;
        case 'APPDYNAMICS':
          tools['AppDynamics'].count += 1;
          break;
        case 'UI_TEST':
          tools['UI Tests'].count += 1;
          break;
      }
    });

    return Object.entries(tools).filter(([_, data]) => data.count > 0);
  }, [filteredChecks]);

  // Get recent critical events
  const criticalEvents = useMemo(() => {
    const events: Array<{ type: 'error' | 'warning'; title: string; description: string; csi: string; time: string; checkId: string }>= [];
    
    filteredChecks.filter(c => c.status === 'FAILING').slice(0, 3).forEach(check => {
      events.push({
        type: 'error',
        title: 'Check Failed',
        description: check.name,
        csi: check.csiName,
        time: '2m ago',
        checkId: check.id
      });
    });
    
    filteredChecks.filter(c => c.status === 'WARNING').slice(0, 2).forEach(check => {
      events.push({
        type: 'warning',
        title: 'Performance Degradation',
        description: check.name,
        csi: check.csiName,
        time: '5m ago',
        checkId: check.id
      });
    });

    return events;
  }, [filteredChecks]);

  // Extract team and LOB information from tags
  const organizationMetrics = useMemo(() => {
    const teams = new Set<string>();
    const lobs = new Set<string>();
    const applications = new Set<string>();

    filteredChecks.forEach(check => {
      check.tags.forEach(tag => {
        const parsed = parseTag(tag);
        if (parsed) {
          if (parsed.prefix === 'team') teams.add(parsed.value);
          if (parsed.prefix === 'lob') lobs.add(parsed.value);
          if (parsed.prefix === 'application') applications.add(parsed.value);
        }
      });
    });

    return {
      teams: teams.size,
      lobs: lobs.size,
      applications: applications.size
    };
  }, [filteredChecks]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchChecks({ page: 1, limit: 100 }));
    setTimeout(() => setRefreshing(false), 1000);
  };

  const getHealthColor = (value: number) => {
    if (value >= 95) return theme.palette.success.main;
    if (value >= 85) return theme.palette.warning.main;
    return theme.palette.error.main;
  };

  const getHealthLabel = (value: number) => {
    if (value >= 95) return 'Excellent';
    if (value >= 85) return 'Good';
    if (value >= 70) return 'Fair';
    return 'Critical';
  };

  return (
    <Box>
      {/* Modern Header with CSI Context */}
      <Fade in timeout={600}>
        <Box sx={{ mb: 4 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2} mb={3}>
            <Box flex={1}>
              {/* Title with Health Indicator */}
              <Stack direction="row" alignItems="center" spacing={2} mb={1}>
                <Avatar 
                  sx={{ 
                    bgcolor: getHealthColor(metrics.uptime),
                    width: 48,
                    height: 48,
                    animation: pulseAnimation ? `${pulse} 2s infinite` : 'none'
                  }}
                >
                  <HealthAndSafety />
                </Avatar>
                <Box>
                  <Typography variant="h4" fontWeight={700}>
                    Operational Health Dashboard
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedCSIDetails ? (
                      <>
                        <Chip 
                          label={selectedCSIDetails.name} 
                          size="small" 
                          sx={{ mr: 1 }} 
                          color="primary"
                          variant="outlined"
                        />
                        {selectedCSIDetails.businessUnit}
                      </>
                    ) : (
                      'Centralized orchestration view across all systems'
                    )}
                  </Typography>
                </Box>
              </Stack>
            </Box>

            {/* Real-time Status Indicator */}
            <Stack direction="row" spacing={2} alignItems="center">
              <Badge 
                badgeContent="LIVE" 
                color="success" 
                variant="dot"
                sx={{
                  '& .MuiBadge-badge': {
                    animation: `${pulse} 2s infinite`,
                  }
                }}
              >
                <Chip 
                  icon={<Timer />}
                  label={`${mockRealTimeData.executionsPerMinute} checks/min`}
                  variant="outlined"
                />
              </Badge>
              <Tooltip title="Refresh Dashboard">
                <span>
                  <IconButton 
                    onClick={handleRefresh} 
                    disabled={loading === 'loading' || refreshing}
                    sx={{
                      bgcolor: 'background.paper',
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    {refreshing ? <CircularProgress size={20} /> : <Refresh />}
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Stack>
          
          {/* Scope is handled globally via ScopeBar in layout */}
        </Box>
      </Fade>

      {/* Error Alert */}
      {error && (
        <Grow in>
          <Alert severity="error" sx={{ mb: 3 }}>
            Error loading dashboard data: {error}
          </Alert>
        </Grow>
      )}

      {/* Main Dashboard Grid */}
      <Grid container spacing={3}>
        
        {/* Health Score Card - Hero Metric */}
        <Grid item xs={12} md={4}>
          <Grow in timeout={800}>
            <Card 
              elevation={0}
              sx={{ 
                border: `2px solid ${getHealthColor(metrics.uptime)}`,
                background: `linear-gradient(135deg, ${alpha(getHealthColor(metrics.uptime), 0.05)} 0%, transparent 100%)`,
                height: '100%'
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Stack spacing={3}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="overline" color="text.secondary" fontWeight={600}>
                        OVERALL HEALTH SCORE
                      </Typography>
                      <Typography variant="h2" fontWeight={700} color={getHealthColor(metrics.uptime)}>
                        {metrics.uptime.toFixed(1)}%
                      </Typography>
                      <Typography variant="h6" color="text.secondary" fontWeight={400}>
                        {getHealthLabel(metrics.uptime)}
                      </Typography>
                    </Box>
                    <Avatar sx={{ bgcolor: alpha(getHealthColor(metrics.uptime), 0.1), width: 64, height: 64 }}>
                      <Assessment sx={{ fontSize: 32, color: getHealthColor(metrics.uptime) }} />
                    </Avatar>
                  </Stack>

                  {/* Trend Indicator */}
                  <Stack direction="row" alignItems="center" spacing={1}>
                    {metrics.weeklyTrend >= 0 ? (
                      <TrendingUp color="success" />
                    ) : (
                      <TrendingDown color="error" />
                    )}
                    <Typography variant="body2" color={metrics.weeklyTrend >= 0 ? 'success.main' : 'error.main'}>
                      {Math.abs(metrics.weeklyTrend)}% vs last week
                    </Typography>
                  </Stack>

                  <Divider />

                  {/* Quick Stats */}
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">
                        Active Checks
                      </Typography>
                      <Typography variant="h6" fontWeight={600}>
                        {metrics.total}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">
                        Avg Response
                      </Typography>
                      <Typography variant="h6" fontWeight={600}>
                        {mockRealTimeData.averageResponseTime}ms
                      </Typography>
                    </Grid>
                  </Grid>
                </Stack>
              </CardContent>
            </Card>
          </Grow>
        </Grid>

        {/* Check Status Distribution */}
        <Grid item xs={12} md={8}>
          <Grow in timeout={900}>
            <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight={600} mb={3}>
                  Check Status Distribution
                </Typography>
                
                <Grid container spacing={3}>
                  <Grid item xs={6} sm={3}>
                    <Paper 
                      sx={{ 
                        p: 2, 
                        textAlign: 'center',
                        bgcolor: alpha(theme.palette.success.main, 0.05),
                        border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`
                      }}
                    >
                      <CheckCircle sx={{ fontSize: 32, color: 'success.main', mb: 1 }} />
                      <Typography variant="h4" fontWeight={700} color="success.main">
                        {metrics.passing}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Passing
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Paper 
                      sx={{ 
                        p: 2, 
                        textAlign: 'center',
                        bgcolor: alpha(theme.palette.error.main, 0.05),
                        border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`
                      }}
                    >
                      <Error sx={{ fontSize: 32, color: 'error.main', mb: 1 }} />
                      <Typography variant="h4" fontWeight={700} color="error.main">
                        {metrics.failing}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Failing
                      </Typography>
                      {metrics.mttr > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          MTTR: {metrics.mttr}m
                        </Typography>
                      )}
                    </Paper>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Paper 
                      sx={{ 
                        p: 2, 
                        textAlign: 'center',
                        bgcolor: alpha(theme.palette.warning.main, 0.05),
                        border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`
                      }}
                    >
                      <Warning sx={{ fontSize: 32, color: 'warning.main', mb: 1 }} />
                      <Typography variant="h4" fontWeight={700} color="warning.main">
                        {metrics.warning}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Warning
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Paper 
                      sx={{ 
                        p: 2, 
                        textAlign: 'center',
                        bgcolor: alpha(theme.palette.info.main, 0.05),
                        border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`
                      }}
                    >
                      <Schedule sx={{ fontSize: 32, color: 'info.main', mb: 1 }} />
                      <Typography variant="h4" fontWeight={700} color="info.main">
                        {metrics.pending}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Pending
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>

                {/* Health Bar Visualization */}
                <Box mt={3}>
                  <Stack direction="row" spacing={0.5} sx={{ height: 8, borderRadius: 1, overflow: 'hidden' }}>
                    {metrics.total > 0 && (
                      <>
                        <Box 
                          sx={{ 
                            flex: metrics.passing / metrics.total,
                            bgcolor: 'success.main',
                            minWidth: metrics.passing > 0 ? 20 : 0
                          }} 
                        />
                        <Box 
                          sx={{ 
                            flex: metrics.warning / metrics.total,
                            bgcolor: 'warning.main',
                            minWidth: metrics.warning > 0 ? 20 : 0
                          }} 
                        />
                        <Box 
                          sx={{ 
                            flex: metrics.failing / metrics.total,
                            bgcolor: 'error.main',
                            minWidth: metrics.failing > 0 ? 20 : 0
                          }} 
                        />
                        <Box 
                          sx={{ 
                            flex: metrics.pending / metrics.total,
                            bgcolor: 'grey.400',
                            minWidth: metrics.pending > 0 ? 20 : 0
                          }} 
                        />
                      </>
                    )}
                  </Stack>
                </Box>
              </CardContent>
            </Card>
          </Grow>
        </Grid>

        {/* Integration Tools Overview */}
        <Grid item xs={12} lg={8}>
          <Grow in timeout={1000}>
            <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                  <Typography variant="h6" fontWeight={600}>
                    Cross-Tool Integration Status
                  </Typography>
                  <Chip 
                    icon={<Hub />}
                    label="Orchestration Layer"
                    size="small"
                    variant="outlined"
                  />
                </Stack>

                <Grid container spacing={2}>
                  {integrationMetrics.map(([tool, data], index) => {
                    const IconComponent = data.icon;
                    return (
                      <Grid item xs={6} sm={4} md={2} key={tool}>
                        <Fade in timeout={1100 + index * 100}>
                          <Paper
                            sx={{
                              p: 2,
                              textAlign: 'center',
                              border: `1px solid ${theme.palette.divider}`,
                              cursor: 'pointer',
                              transition: 'all 0.3s ease',
                              '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow: theme.shadows[4],
                                borderColor: theme.palette[data.color as 'primary'].main,
                              }
                            }}
                            onClick={() => navigate('/checks')}
                          >
                            <Avatar 
                              sx={{ 
                                bgcolor: alpha(theme.palette[data.color as 'primary'].main, 0.1),
                                width: 48,
                                height: 48,
                                mx: 'auto',
                                mb: 1
                              }}
                            >
                              <IconComponent sx={{ color: theme.palette[data.color as 'primary'].main }} />
                            </Avatar>
                            <Typography variant="h5" fontWeight={700}>
                              {data.count}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {tool}
                            </Typography>
                          </Paper>
                        </Fade>
                      </Grid>
                    );
                  })}
                </Grid>

                {/* Organization Metrics */}
                <Box mt={3} p={2} bgcolor={alpha(theme.palette.primary.main, 0.02)} borderRadius={2}>
                  <Grid container spacing={3}>
                    <Grid item xs={4}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Groups color="primary" />
                        <Box>
                          <Typography variant="h6" fontWeight={600}>
                            {organizationMetrics.teams}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Teams
                          </Typography>
                        </Box>
                      </Stack>
                    </Grid>
                    <Grid item xs={4}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Business color="primary" />
                        <Box>
                          <Typography variant="h6" fontWeight={600}>
                            {organizationMetrics.lobs}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Lines of Business
                          </Typography>
                        </Box>
                      </Stack>
                    </Grid>
                    <Grid item xs={4}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Category color="primary" />
                        <Box>
                          <Typography variant="h6" fontWeight={600}>
                            {organizationMetrics.applications}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Applications
                          </Typography>
                        </Box>
                      </Stack>
                    </Grid>
                  </Grid>
                </Box>
              </CardContent>
            </Card>
          </Grow>
        </Grid>

        {/* Critical Events & Quick Actions */}
        <Grid item xs={12} lg={4}>
          <Stack spacing={3}>
            {/* Upcoming Executions */}
            <Grow in timeout={1000}>
              <Box>
                <UpcomingExecutions maxItems={5} />
              </Box>
            </Grow>

            {/* Critical Events */}
            {criticalEvents.length > 0 && (
              <Grow in timeout={1100}>
                <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                      <Typography variant="h6" fontWeight={600}>
                        Critical Events
                      </Typography>
                      <Badge badgeContent={criticalEvents.length} color="error">
                        <NotificationsActive color="action" />
                      </Badge>
                    </Stack>

                    <Stack spacing={2}>
                      {criticalEvents.slice(0, 3).map((event, index) => (
                        <Fade in timeout={1200 + index * 100} key={index}>
                          <Paper
                            sx={{
                              p: 2,
                              border: `1px solid ${
                                event.type === 'error' ? theme.palette.error.main : theme.palette.warning.main
                              }`,
                              bgcolor: alpha(
                                event.type === 'error' ? theme.palette.error.main : theme.palette.warning.main,
                                0.05
                              ),
                              cursor: 'pointer',
                              '&:hover': {
                                bgcolor: alpha(
                                  event.type === 'error' ? theme.palette.error.main : theme.palette.warning.main,
                                  0.1
                                ),
                              }
                            }}
                            onClick={() => navigate(`/checks/details/${event.checkId}`)}
                          >
                            <Stack spacing={1}>
                              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                <Typography variant="subtitle2" fontWeight={600}>
                                  {event.title}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {event.time}
                                </Typography>
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                {event.description}
                              </Typography>
                              <Chip 
                                label={event.csi} 
                                size="small" 
                                variant="outlined"
                                sx={{ width: 'fit-content' }}
                              />
                            </Stack>
                          </Paper>
                        </Fade>
                      ))}
                    </Stack>

                    {criticalEvents.length > 3 && (
                      <Button 
                        fullWidth 
                        sx={{ mt: 2 }}
                        endIcon={<ArrowForward />}
                        onClick={() => navigate('/checks')}
                      >
                        View All Events
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </Grow>
            )}

            {/* Quick Actions */}
            <Grow in timeout={1200}>
              <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h6" fontWeight={600} mb={2}>
                    Quick Actions
                  </Typography>
                  
                  <Stack spacing={2}>
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<Science />}
                    onClick={() => navigate('/checks/studio')}
                      sx={{
                        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                        py: 1.5
                      }}
                    >
                      Open Checks Studio
                    </Button>
                    
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<PlayArrow />}
                      onClick={() => navigate('/checks/create')}
                    >
                      Create New Check
                    </Button>
                    
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<Assessment />}
                      onClick={() => navigate('/checks/reports')}
                    >
                      Generate Report
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grow>
          </Stack>
        </Grid>

        {/* System Insights Footer */}
        <Grid item xs={12}>
          <Grow in timeout={1300}>
            <Paper 
              sx={{ 
                p: 3,
                border: `1px solid ${theme.palette.divider}`,
                background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.02)} 0%, transparent 100%)`
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Insights color="primary" />
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600}>
                      System Insights
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Powered by unified orchestration across ITRS, Grafana, Splunk, and AppDynamics
                    </Typography>
                  </Box>
                </Stack>
                
                <Stack direction="row" spacing={3}>
                  <Tooltip title="Active Incidents">
                    <Chip 
                      icon={<Warning />}
                      label={`${mockRealTimeData.activeIncidents} Active`}
                      color="warning"
                      variant="outlined"
                    />
                  </Tooltip>
                  <Tooltip title="Scheduled Maintenance">
                    <Chip 
                      icon={<Schedule />}
                      label={`${mockRealTimeData.scheduledMaintenance} Scheduled`}
                      color="info"
                      variant="outlined"
                    />
                  </Tooltip>
                  <Tooltip title="View Timeline">
                    <IconButton onClick={() => navigate('/checks')}>
                      <Timeline />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Paper>
          </Grow>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;