import React, { useEffect, useMemo } from 'react';
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
  IconButton,
  useTheme,
  alpha,
  Stack,
} from '@mui/material';
import {
  CheckCircle,
  Error,
  Warning,
  Refresh,
  TrendingUp,
  Schedule,
  Speed,
  Api,
  Storage,
  AutoGraph,
  Security,
  BugReport,
  Science,
  ArrowForward,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchChecks } from '@store/slices/checksSlice';
import { useNavigate } from 'react-router-dom';
import { FilterBar } from '@components/common/FilterBar';

const DashboardPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data: checks, loading, error } = useAppSelector(state => state.checks);
  const { selectedCSI, tags: { selected: selectedTags } } = useAppSelector(state => state.csi);

  useEffect(() => {
    dispatch(fetchChecks({ page: 1, limit: 20 }));
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

  // Calculate metrics
  const metrics = useMemo(() => {
    const total = filteredChecks?.length || 0;
    const passing = filteredChecks?.filter(c => c.status === 'PASSING').length || 0;
    const failing = filteredChecks?.filter(c => c.status === 'FAILING').length || 0;
    const warning = filteredChecks?.filter(c => c.status === 'WARNING').length || 0;
    const uptime = total > 0 ? ((passing / total) * 100) : 0;
    
    return { total, passing, failing, warning, uptime };
  }, [filteredChecks]);

  // Check type distribution
  const checkTypes = useMemo(() => {
    const typeCount = (filteredChecks || []).reduce((acc, check) => {
      acc[check.type] = (acc[check.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return [
      { type: 'HTTP', count: typeCount.HTTP || 0, icon: Api, color: theme.palette.info.main },
      { type: 'TCP', count: typeCount.TCP || 0, icon: Storage, color: theme.palette.success.main },
      { type: 'SPLUNK', count: typeCount.SPLUNK || 0, icon: AutoGraph, color: theme.palette.warning.main },
      { type: 'GRAFANA', count: typeCount.GRAFANA || 0, icon: Speed, color: theme.palette.secondary.main },
      { type: 'ITRS', count: typeCount.ITRS || 0, icon: Security, color: theme.palette.error.main },
      { type: 'APPDYNAMICS', count: typeCount.APPDYNAMICS || 0, icon: BugReport, color: theme.palette.primary.main },
    ].filter(item => item.count > 0);
  }, [filteredChecks, theme.palette]);

  // Recent activity
  const recentActivity = useMemo(() => [
    { type: 'success', message: 'API health check passed', time: '2m', system: 'Trading' },
    { type: 'warning', message: 'Slow database response', time: '5m', system: 'Core Banking' },
    { type: 'error', message: 'Feed connection failed', time: '12m', system: 'Market Data' },
    { type: 'success', message: 'Gateway restored', time: '15m', system: 'Payments' },
  ], []);

  const handleRefresh = () => {
    dispatch(fetchChecks({ page: 1, limit: 20 }));
  };

  const getStatusIcon = (type: string, size = 20) => {
    const iconProps = { sx: { fontSize: size } };
    switch (type) {
      case 'success': return <CheckCircle {...iconProps} sx={{ ...iconProps.sx, color: theme.palette.success.main }} />;
      case 'warning': return <Warning {...iconProps} sx={{ ...iconProps.sx, color: theme.palette.warning.main }} />;
      case 'error': return <Error {...iconProps} sx={{ ...iconProps.sx, color: theme.palette.error.main }} />;
      default: return <Schedule {...iconProps} sx={{ ...iconProps.sx, color: theme.palette.info.main }} />;
    }
  };

  const MetricCard: React.FC<{
    title: string;
    value: number | string;
    total?: number;
    color: string;
    icon: React.ReactNode;
    trend?: number;
  }> = ({ title, value, total, color, icon, trend }) => (
    <Card 
      elevation={0}
      sx={{ 
        border: `1px solid ${theme.palette.divider}`,
        transition: 'all 0.2s ease',
        '&:hover': { 
          borderColor: color,
          boxShadow: `0 0 0 1px ${alpha(color, 0.1)}`,
        }
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            {title}
          </Typography>
          <Box sx={{ color, opacity: 0.8 }}>
            {icon}
          </Box>
        </Stack>
        
        <Typography variant="h4" fontWeight={600} sx={{ mb: 1 }}>
          {value}
          {total && (
            <Typography component="span" variant="h6" color="text.secondary" fontWeight={400}>
              /{total}
            </Typography>
          )}
        </Typography>

        {trend !== undefined && (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <TrendingUp sx={{ fontSize: 16, color: trend >= 0 ? 'success.main' : 'error.main' }} />
            <Typography variant="caption" color={trend >= 0 ? 'success.main' : 'error.main'}>
              {Math.abs(trend)}% vs last week
            </Typography>
          </Stack>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Box>
      {/* Clean Header */}
      <Box sx={{ mb: 4 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
          <Box>
            <Typography variant="h4" fontWeight={600} gutterBottom>
              Dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedCSI ? 'Filtered view for selected system' : 'System-wide health monitoring overview'}
            </Typography>
          </Box>
          <IconButton onClick={handleRefresh} disabled={loading === 'loading'}>
            <Refresh />
          </IconButton>
        </Stack>
        
        {/* Filter Bar */}
        <FilterBar />
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Error loading dashboard data: {error}
        </Alert>
      )}

      {/* Main Content Grid */}
      <Grid container spacing={3}>
        {/* Key Metrics */}
        <Grid item xs={12} lg={8}>
          <Grid container spacing={3}>
            <Grid item xs={6} md={3}>
              <MetricCard
                title="Passing"
                value={metrics.passing}
                total={metrics.total}
                color={theme.palette.success.main}
                icon={<CheckCircle />}
                trend={2.1}
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <MetricCard
                title="Failing"
                value={metrics.failing}
                total={metrics.total}
                color={theme.palette.error.main}
                icon={<Error />}
                trend={-1.5}
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <MetricCard
                title="Warning"
                value={metrics.warning}
                total={metrics.total}
                color={theme.palette.warning.main}
                icon={<Warning />}
                trend={0.3}
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <MetricCard
                title="Uptime"
                value={`${metrics.uptime.toFixed(1)}%`}
                color={theme.palette.info.main}
                icon={<TrendingUp />}
                trend={0.2}
              />
            </Grid>

            {/* System Overview */}
            <Grid item xs={12}>
              <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                    <Typography variant="h6" fontWeight={600}>
                      System Overview
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {metrics.total} active checks
                    </Typography>
                  </Stack>

                  {/* Health Status Bar */}
                  <Box mb={3}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="body2" color="text.secondary">Overall Health</Typography>
                      <Typography variant="body2" fontWeight={500}>{metrics.uptime.toFixed(1)}%</Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={metrics.uptime}
                      sx={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: alpha(theme.palette.grey[400], 0.2),
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 3,
                          backgroundColor: metrics.uptime > 95 ? theme.palette.success.main : 
                                         metrics.uptime > 85 ? theme.palette.warning.main : 
                                         theme.palette.error.main,
                        }
                      }}
                    />
                  </Box>

                  {/* Check Types Distribution */}
                  {checkTypes.length > 0 && (
                    <Grid container spacing={3}>
                      {checkTypes.map((item, index) => (
                        <Grid item xs={6} sm={4} md={2} key={index}>
                          <Stack alignItems="center" spacing={1}>
                            <Box
                              sx={{
                                width: 40,
                                height: 40,
                                borderRadius: 2,
                                backgroundColor: alpha(item.color, 0.1),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: item.color,
                              }}
                            >
                              <item.icon sx={{ fontSize: 20 }} />
                            </Box>
                            <Typography variant="h6" fontWeight={600}>
                              {item.count}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" textAlign="center">
                              {item.type}
                            </Typography>
                          </Stack>
                        </Grid>
                      ))}
                    </Grid>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>

        {/* Quick Actions Sidebar */}
        <Grid item xs={12} lg={4}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, height: 'fit-content' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} mb={3}>Quick Actions</Typography>
              
              <Stack spacing={2}>
                {[
                  { label: 'Create Check', path: '/checks/create', icon: <CheckCircle /> },
                  { label: 'Generate Report', path: '/checks/reports', icon: <AutoGraph /> },
                ].map((action, index) => (
                  <Paper
                    key={index}
                    sx={{
                      p: 2,
                      cursor: 'pointer',
                      border: `1px solid ${theme.palette.divider}`,
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        borderColor: theme.palette.primary.main,
                        backgroundColor: alpha(theme.palette.primary.main, 0.02),
                      }
                    }}
                    onClick={() => navigate(action.path)}
                  >
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Stack direction="row" alignItems="center" spacing={2}>
                        <Box sx={{ color: theme.palette.primary.main, opacity: 0.8 }}>
                          {action.icon}
                        </Box>
                        <Typography variant="body2" fontWeight={500}>
                          {action.label}
                        </Typography>
                      </Stack>
                      <ArrowForward sx={{ fontSize: 16, color: 'text.secondary' }} />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Activity - Full Width */}
        <Grid item xs={12}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h6" fontWeight={600}>Recent Activity</Typography>
                <Chip label="Live" size="small" color="primary" variant="outlined" />
              </Stack>
              
              <Grid container spacing={3}>
                {recentActivity.map((activity, index) => (
                  <Grid item xs={12} sm={6} md={3} key={index}>
                    <Paper
                      sx={{
                        p: 2,
                        border: `1px solid ${theme.palette.divider}`,
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          borderColor: alpha(theme.palette.primary.main, 0.5),
                          backgroundColor: alpha(theme.palette.background.paper, 0.8),
                        }
                      }}
                    >
                      <Stack spacing={2}>
                        <Stack direction="row" alignItems="center" spacing={2}>
                          <Box>
                            {getStatusIcon(activity.type, 20)}
                          </Box>
                          <Typography variant="body2" fontWeight={500} sx={{ flex: 1 }}>
                            {activity.message}
                          </Typography>
                        </Stack>
                        
                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                          <Chip 
                            label={activity.system} 
                            size="small" 
                            variant="outlined"
                            sx={{ fontSize: '0.7rem' }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {activity.time} ago
                          </Typography>
                        </Stack>
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;