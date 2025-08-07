import React, { useEffect } from 'react';
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
} from '@mui/material';
import {
  CheckCircle,
  Error,
  Warning,
  Schedule,
  TrendingUp,
  Dashboard as DashboardIcon,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchChecks } from '@store/slices/checksSlice';

// Mock data for dashboard metrics
const mockMetrics = {
  totalChecks: 47,
  passingChecks: 39,
  failingChecks: 5,
  warningChecks: 3,
  scheduledChecks: 42,
  lastUpdated: new Date().toISOString(),
  uptime: 99.2,
  responseTime: 145,
};

const DashboardPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { data: _checks, loading, error } = useAppSelector(state => state.checks);

  useEffect(() => {
    // Fetch initial checks data
    dispatch(fetchChecks({ page: 1, limit: 20 }));
  }, [dispatch]);

  const statusCards = [
    {
      title: 'Passing Checks',
      value: mockMetrics.passingChecks,
      total: mockMetrics.totalChecks,
      icon: <CheckCircle sx={{ fontSize: 40, color: 'success.main' }} />,
      color: 'success.main',
      percentage: (mockMetrics.passingChecks / mockMetrics.totalChecks) * 100,
    },
    {
      title: 'Failing Checks',
      value: mockMetrics.failingChecks,
      total: mockMetrics.totalChecks,
      icon: <Error sx={{ fontSize: 40, color: 'error.main' }} />,
      color: 'error.main',
      percentage: (mockMetrics.failingChecks / mockMetrics.totalChecks) * 100,
    },
    {
      title: 'Warning Checks',
      value: mockMetrics.warningChecks,
      total: mockMetrics.totalChecks,
      icon: <Warning sx={{ fontSize: 40, color: 'warning.main' }} />,
      color: 'warning.main',
      percentage: (mockMetrics.warningChecks / mockMetrics.totalChecks) * 100,
    },
    {
      title: 'Scheduled Checks',
      value: mockMetrics.scheduledChecks,
      total: mockMetrics.totalChecks,
      icon: <Schedule sx={{ fontSize: 40, color: 'info.main' }} />,
      color: 'info.main',
      percentage: (mockMetrics.scheduledChecks / mockMetrics.totalChecks) * 100,
    },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <DashboardIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" component="h1">
            Health Monitoring Dashboard
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          Centralized operational health monitoring across all Citi systems
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Last updated: {new Date().toLocaleString()}
        </Typography>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle>Error Loading Dashboard Data</AlertTitle>
          {error}
        </Alert>
      )}

      {/* Loading State */}
      {loading === 'loading' && (
        <Box sx={{ mb: 3 }}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Loading dashboard data...
          </Typography>
        </Box>
      )}

      <Grid container spacing={3}>
        {/* Status Cards */}
        {statusCards.map((card, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  {card.icon}
                  <Box sx={{ ml: 2, flex: 1 }}>
                    <Typography variant="h4" component="div" sx={{ color: card.color }}>
                      {card.value}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {card.title}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      {card.percentage.toFixed(1)}% of total
                    </Typography>
                  </Box>
                  <LinearProgress 
                    variant="determinate" 
                    value={card.percentage}
                    sx={{ 
                      height: 6, 
                      borderRadius: 3,
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: card.color,
                      }
                    }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}

        {/* System Overview */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3, height: '400px' }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TrendingUp />
              System Health Overview
            </Typography>
            
            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" color="text.secondary" paragraph>
                Overall system uptime: <strong>{mockMetrics.uptime}%</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Average response time: <strong>{mockMetrics.responseTime}ms</strong>
              </Typography>
              
              <Box sx={{ mt: 4 }}>
                <Alert severity="info">
                  <AlertTitle>Dashboard Status</AlertTitle>
                  This is a high-fidelity mockup of the Checks Dashboard. 
                  Real-time metrics and charts will be available in the production version.
                </Alert>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Recent Activity */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, height: '400px' }}>
            <Typography variant="h6" gutterBottom>
              Recent Activity
            </Typography>
            
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { type: 'success', message: 'Trade API check passed', time: '2 minutes ago' },
                { type: 'warning', message: 'Database connection slow', time: '5 minutes ago' },
                { type: 'error', message: 'Market data feed failed', time: '12 minutes ago' },
                { type: 'success', message: 'Payment gateway check passed', time: '15 minutes ago' },
              ].map((activity, index) => (
                <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Chip 
                    size="small" 
                    label={activity.type.toUpperCase()}
                    color={
                      activity.type === 'success' ? 'success' : 
                      activity.type === 'warning' ? 'warning' : 'error'
                    }
                  />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2">{activity.message}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {activity.time}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Quick Actions
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Get started with the PUT Checks platform:
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Chip 
                label="Create New Check" 
                color="primary" 
                variant="outlined" 
                clickable 
              />
              <Chip 
                label="View All Checks" 
                color="primary" 
                variant="outlined" 
                clickable 
              />
              <Chip 
                label="Open Checks Studio" 
                color="secondary" 
                variant="outlined" 
                clickable 
              />
              <Chip 
                label="Generate Report" 
                color="secondary" 
                variant="outlined" 
                clickable 
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;