import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, 
  Grid, 
  Typography, 
  Paper,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Alert,
  AlertTitle,
  IconButton,
  Tooltip,
  Avatar,
  AvatarGroup,
  Button,
  Stack,
  Divider,
  useTheme,
  alpha,
  Skeleton,
  Badge,
  CardActions,
} from '@mui/material';
import {
  CheckCircle,
  Error,
  Warning,
  Schedule,
  TrendingUp,
  TrendingDown,
  Dashboard as DashboardIcon,
  Refresh,
  MoreVert,
  ArrowUpward,
  ArrowDownward,
  AccessTime,
  Speed,
  CloudDone,
  CloudOff,
  Notifications,
  PlayArrow,
  Settings,
  Add,
  AutoGraph,
  Security,
  Storage,
  Api,
  BugReport,
  Code,
  Science,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchChecks } from '@store/slices/checksSlice';
import { useNavigate } from 'react-router-dom';
import CSIFilterBar from '@components/common/CSIFilterBar';

// Enhanced mock data with more realistic metrics
const mockMetrics = {
  totalChecks: 47,
  passingChecks: 39,
  failingChecks: 5,
  warningChecks: 3,
  scheduledChecks: 42,
  lastUpdated: new Date(),
  uptime: 99.2,
  uptimeChange: 0.3,
  responseTime: 145,
  responseTimeChange: -12,
  avgSuccessRate: 94.7,
  totalExecutions: 1247,
  activeIncidents: 2,
  pendingMaintenance: 1,
};

// Check type distribution data
const checkTypeData = [
  { type: 'HTTP', count: 18, icon: <Api />, color: '#3B82F6' },
  { type: 'TCP', count: 12, icon: <Storage />, color: '#10B981' },
  { type: 'Splunk', count: 7, icon: <AutoGraph />, color: '#F59E0B' },
  { type: 'Grafana', count: 4, icon: <Speed />, color: '#8B5CF6' },
  { type: 'ITRS', count: 3, icon: <Security />, color: '#EC4899' },
  { type: 'AppDynamics', count: 3, icon: <BugReport />, color: '#14B8A6' },
];

// Recent activity with more context
const recentActivity = [
  { 
    type: 'success', 
    message: 'Trading API health check passed',
    details: 'Response time: 89ms',
    time: '2 minutes ago',
    csi: 'Trading Platform'
  },
  { 
    type: 'warning', 
    message: 'Database connection slow',
    details: 'Latency increased by 40%',
    time: '5 minutes ago',
    csi: 'Banking Services'
  },
  { 
    type: 'error', 
    message: 'Market data feed failed',
    details: 'Connection timeout after 30s',
    time: '12 minutes ago',
    csi: 'Trading Platform'
  },
  { 
    type: 'success', 
    message: 'Payment gateway restored',
    details: 'All services operational',
    time: '15 minutes ago',
    csi: 'Payment Systems'
  },
  { 
    type: 'info', 
    message: 'Scheduled maintenance completed',
    details: 'SSL certificates renewed',
    time: '1 hour ago',
    csi: 'Infrastructure'
  },
];

// Critical systems status
const criticalSystems = [
  { name: 'Core Banking', status: 'operational', uptime: 99.99 },
  { name: 'Trading Engine', status: 'degraded', uptime: 98.2 },
  { name: 'Payment Gateway', status: 'operational', uptime: 99.95 },
  { name: 'Risk Management', status: 'operational', uptime: 100 },
];

const DashboardPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data: checks, loading, error } = useAppSelector(state => state.checks);
  const { selectedCSI } = useAppSelector(state => state.csi);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    dispatch(fetchChecks({ page: 1, limit: 20 }));
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, [dispatch]);

  // Filter checks based on selected CSI
  const filteredChecks = useMemo(() => {
    if (!selectedCSI || !checks) return checks;
    return checks.filter(check => check.csiId === selectedCSI);
  }, [checks, selectedCSI]);

  // Calculate CSI-specific metrics
  const csiMetrics = useMemo(() => {
    const checksToAnalyze = filteredChecks || [];
    const total = checksToAnalyze.length;
    const passing = checksToAnalyze.filter(c => c.status === 'PASSING').length;
    const failing = checksToAnalyze.filter(c => c.status === 'FAILING').length;
    const warning = checksToAnalyze.filter(c => c.status === 'WARNING').length;
    const scheduled = checksToAnalyze.filter(c => c.schedule.enabled).length;
    
    return {
      totalChecks: total,
      passingChecks: passing,
      failingChecks: failing,
      warningChecks: warning,
      scheduledChecks: scheduled,
      uptime: total > 0 ? ((passing / total) * 100) : 0,
      uptimeChange: 0.3,
      responseTime: 145,
      responseTimeChange: -12,
      avgSuccessRate: total > 0 ? ((passing / total) * 100) : 0,
      totalExecutions: total * 15, // Approximate
      activeIncidents: failing,
      pendingMaintenance: 1,
    };
  }, [filteredChecks]);

  // Calculate CSI-specific check type distribution
  const csiCheckTypeData = useMemo(() => {
    const checksToAnalyze = filteredChecks || [];
    const typeGroups = checksToAnalyze.reduce((acc, check) => {
      acc[check.type] = (acc[check.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const baseTypeData = [
      { type: 'HTTP', icon: <Api />, color: '#3B82F6' },
      { type: 'TCP', icon: <Storage />, color: '#10B981' },
      { type: 'SPLUNK', icon: <AutoGraph />, color: '#F59E0B' },
      { type: 'GRAFANA', icon: <Speed />, color: '#8B5CF6' },
      { type: 'ITRS', icon: <Security />, color: '#EC4899' },
      { type: 'APPDYNAMICS', icon: <BugReport />, color: '#14B8A6' },
      { type: 'UI_TEST', icon: <Code />, color: '#F97316' },
    ];

    return baseTypeData
      .map(item => ({ ...item, count: typeGroups[item.type] || 0 }))
      .filter(item => item.count > 0);
  }, [filteredChecks]);

  // Generate CSI-specific recent activity
  const csiRecentActivity = useMemo(() => {
    if (!selectedCSI || !filteredChecks?.length) return recentActivity;
    
    // Filter activities based on CSI or generate CSI-specific activities
    const csiName = filteredChecks[0]?.csiName || 'Unknown CSI';
    
    return recentActivity.filter(activity => 
      activity.csi === csiName || 
      activity.csi.includes('Trading Platform') || 
      activity.csi.includes('Infrastructure')
    ).slice(0, 5);
  }, [selectedCSI, filteredChecks]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchChecks({ page: 1, limit: 20 }));
    setTimeout(() => setRefreshing(false), 1000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational': return 'success';
      case 'degraded': return 'warning';
      case 'down': return 'error';
      default: return 'default';
    }
  };

  const MetricCard = ({ title, value, total, icon, color, percentage, trend }: any) => (
    <Card 
      sx={{ 
        height: '100%',
        background: `linear-gradient(135deg, ${alpha(color, 0.1)} 0%, ${alpha(color, 0.05)} 100%)`,
        borderTop: `3px solid ${color}`,
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: theme.shadows[8],
        }
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography color="text.secondary" variant="overline" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, my: 1, color }}>
              {value}
              {total && (
                <Typography component="span" variant="h5" sx={{ color: 'text.secondary', ml: 1 }}>
                  / {total}
                </Typography>
              )}
            </Typography>
            {percentage !== undefined && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={percentage}
                  sx={{ 
                    flexGrow: 1,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: alpha(color, 0.2),
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: color,
                      borderRadius: 3,
                    }
                  }}
                />
                <Typography variant="caption" sx={{ minWidth: 35, color: 'text.secondary' }}>
                  {percentage.toFixed(0)}%
                </Typography>
              </Box>
            )}
          </Box>
          <Avatar sx={{ bgcolor: alpha(color, 0.1), width: 56, height: 56 }}>
            {React.cloneElement(icon, { sx: { fontSize: 32, color } })}
          </Avatar>
        </Box>
        {trend !== undefined && (
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, gap: 0.5 }}>
            {trend > 0 ? (
              <ArrowUpward sx={{ fontSize: 16, color: 'success.main' }} />
            ) : (
              <ArrowDownward sx={{ fontSize: 16, color: 'error.main' }} />
            )}
            <Typography variant="body2" color={trend > 0 ? 'success.main' : 'error.main'}>
              {Math.abs(trend)}% from last week
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Box>
      {/* Enhanced Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
                <DashboardIcon sx={{ fontSize: 28 }} />
              </Avatar>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  Health Monitoring Dashboard
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedCSI ? 'CSI-specific operational health monitoring' : 'Centralized operational health monitoring across all Citi systems'}
                </Typography>
              </Box>
            </Box>
          </Box>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Refresh Data">
              <IconButton onClick={handleRefresh} disabled={refreshing}>
                <Refresh className={refreshing ? 'spinning' : ''} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Notifications">
              <IconButton>
                <Badge badgeContent={3} color="error">
                  <Notifications />
                </Badge>
              </IconButton>
            </Tooltip>
            <Tooltip title="Settings">
              <IconButton>
                <Settings />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Box>

      {/* CSI Filter Bar */}
      <CSIFilterBar 
        onCSIChange={(csiId) => {
          // CSI change is handled automatically by the Redux state
          // This callback can be used for additional side effects if needed
        }}
      />

      <Box sx={{ mb: 4 }}>
        {/* Live Status Bar */}
        <Paper 
          sx={{ 
            p: 2, 
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, transparent 100%)`,
            borderLeft: `4px solid ${theme.palette.primary.main}`
          }}
        >
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box 
                  sx={{ 
                    width: 12, 
                    height: 12, 
                    borderRadius: '50%', 
                    bgcolor: 'success.main',
                    animation: 'pulse 2s infinite'
                  }} 
                />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  System Status: Operational
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccessTime sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  Last updated: {currentTime.toLocaleTimeString()}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CloudDone sx={{ fontSize: 18, color: 'success.main' }} />
                <Typography variant="body2" color="text.secondary">
                  {csiMetrics.totalExecutions.toLocaleString()} executions today
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Speed sx={{ fontSize: 18, color: 'info.main' }} />
                <Typography variant="body2" color="text.secondary">
                  Avg response: {csiMetrics.responseTime}ms
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => {}}>
          <AlertTitle>Error Loading Dashboard Data</AlertTitle>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Metric Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Passing Checks"
            value={csiMetrics.passingChecks}
            total={csiMetrics.totalChecks}
            icon={<CheckCircle />}
            color={theme.palette.success.main}
            percentage={csiMetrics.totalChecks > 0 ? (csiMetrics.passingChecks / csiMetrics.totalChecks) * 100 : 0}
            trend={2.5}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Failing Checks"
            value={csiMetrics.failingChecks}
            total={csiMetrics.totalChecks}
            icon={<Error />}
            color={theme.palette.error.main}
            percentage={csiMetrics.totalChecks > 0 ? (csiMetrics.failingChecks / csiMetrics.totalChecks) * 100 : 0}
            trend={-1.2}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Warning Checks"
            value={csiMetrics.warningChecks}
            total={csiMetrics.totalChecks}
            icon={<Warning />}
            color={theme.palette.warning.main}
            percentage={csiMetrics.totalChecks > 0 ? (csiMetrics.warningChecks / csiMetrics.totalChecks) * 100 : 0}
            trend={0.8}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="System Uptime"
            value={`${csiMetrics.uptime.toFixed(1)}%`}
            icon={<TrendingUp />}
            color={theme.palette.info.main}
            percentage={csiMetrics.uptime}
            trend={csiMetrics.uptimeChange}
          />
        </Grid>

        {/* Critical Systems Status */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Security sx={{ color: 'primary.main' }} />
                Critical Systems Status
              </Typography>
              <Button variant="text" size="small" endIcon={<ArrowUpward />}>
                View All
              </Button>
            </Box>
            
            <Grid container spacing={2}>
              {criticalSystems.map((system, index) => (
                <Grid item xs={12} sm={6} key={index}>
                  <Card 
                    variant="outlined" 
                    sx={{ 
                      p: 2,
                      borderLeft: `3px solid ${
                        system.status === 'operational' ? theme.palette.success.main :
                        system.status === 'degraded' ? theme.palette.warning.main :
                        theme.palette.error.main
                      }`
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {system.name}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                          <Chip 
                            label={system.status.toUpperCase()} 
                            size="small"
                            color={getStatusColor(system.status) as any}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {system.uptime}% uptime
                          </Typography>
                        </Box>
                      </Box>
                      <IconButton size="small">
                        <MoreVert />
                      </IconButton>
                    </Box>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {/* Check Type Distribution */}
            <Box sx={{ mt: 4 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                {selectedCSI ? 'CSI Check Distribution by Type' : 'Check Distribution by Type'}
              </Typography>
              {csiCheckTypeData.length > 0 ? (
                <Grid container spacing={2}>
                  {csiCheckTypeData.map((item, index) => (
                    <Grid item xs={6} sm={4} md={2} key={index}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Avatar 
                          sx={{ 
                            bgcolor: alpha(item.color, 0.1),
                            color: item.color,
                            width: 48,
                            height: 48,
                            mx: 'auto',
                            mb: 1
                          }}
                        >
                          {item.icon}
                        </Avatar>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {item.count}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.type}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    {selectedCSI ? 'No checks found for selected CSI' : 'No check data available'}
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Recent Activity Feed */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, height: '100%', maxHeight: 520, overflow: 'auto' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Schedule sx={{ color: 'primary.main' }} />
                Recent Activity
              </Typography>
              <Chip label="Live" size="small" color="error" sx={{ animation: 'pulse 2s infinite' }} />
            </Box>
            
            <Stack spacing={2}>
              {csiRecentActivity.map((activity, index) => (
                <Card 
                  key={index}
                  variant="outlined"
                  sx={{ 
                    p: 2,
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.02),
                      borderColor: theme.palette.primary.main,
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Avatar 
                      sx={{ 
                        bgcolor: alpha(
                          activity.type === 'success' ? theme.palette.success.main :
                          activity.type === 'warning' ? theme.palette.warning.main :
                          activity.type === 'error' ? theme.palette.error.main :
                          theme.palette.info.main, 
                          0.1
                        ),
                        width: 36,
                        height: 36
                      }}
                    >
                      {activity.type === 'success' ? <CheckCircle sx={{ fontSize: 20, color: 'success.main' }} /> :
                       activity.type === 'warning' ? <Warning sx={{ fontSize: 20, color: 'warning.main' }} /> :
                       activity.type === 'error' ? <Error sx={{ fontSize: 20, color: 'error.main' }} /> :
                       <Schedule sx={{ fontSize: 20, color: 'info.main' }} />}
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {activity.message}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {activity.details}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <Chip label={activity.csi} size="small" variant="outlined" sx={{ height: 20 }} />
                        <Typography variant="caption" color="text.secondary">
                          • {activity.time}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Card>
              ))}
            </Stack>
          </Paper>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
              <PlayArrow sx={{ color: 'primary.main' }} />
              Quick Actions
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Card 
                  sx={{ 
                    p: 2,
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, transparent 100%)`,
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: theme.shadows[4],
                    }
                  }}
                  onClick={() => navigate('/checks/create')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: 'primary.main' }}>
                      <Add />
                    </Avatar>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Create Check
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Set up new monitoring
                      </Typography>
                    </Box>
                  </Box>
                </Card>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <Card 
                  sx={{ 
                    p: 2,
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.05)} 0%, transparent 100%)`,
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: theme.shadows[4],
                    }
                  }}
                  onClick={() => navigate('/checks/all')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: 'info.main' }}>
                      <DashboardIcon />
                    </Avatar>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        View Checks
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Manage all checks
                      </Typography>
                    </Box>
                  </Box>
                </Card>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <Card 
                  sx={{ 
                    p: 2,
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.05)} 0%, transparent 100%)`,
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: theme.shadows[4],
                    }
                  }}
                  onClick={() => navigate('/checks/studio')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: 'success.main' }}>
                      <Science />
                    </Avatar>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Checks Studio
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Test UI scenarios
                      </Typography>
                    </Box>
                  </Box>
                </Card>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <Card 
                  sx={{ 
                    p: 2,
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    background: `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.05)} 0%, transparent 100%)`,
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: theme.shadows[4],
                    }
                  }}
                  onClick={() => navigate('/checks/reports')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: 'warning.main' }}>
                      <AutoGraph />
                    </Avatar>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Reports
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Generate insights
                      </Typography>
                    </Box>
                  </Box>
                </Card>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* CSS for animations */}
      <style jsx global>{`
        @keyframes pulse {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
          100% {
            opacity: 1;
          }
        }
        
        .spinning {
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </Box>
  );
};

export default DashboardPage;