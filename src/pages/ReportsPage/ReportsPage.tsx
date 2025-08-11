import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Button,
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Avatar,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormGroup,
  Tabs,
  Tab,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Badge,
  useTheme,
  alpha,
} from '@mui/material';
import {
  AutoGraph,
  Schedule,
  Email,
  Add,
  Edit,
  Delete,
  Share,
  Download,
  Preview,
  Send,
  Settings,
  CheckCircle,
  Error,
  Warning,
  BarChart,
  PieChart,
  TrendingUp,
  CalendarToday,
  AccessTime,
  Group,
  Visibility,
  Assessment,
  Dashboard,
  DataUsage,
  Timeline,
  Analytics,
  InsertChart,
  ShowChart,
  DonutLarge,
  Refresh,
  Save,
  FileCopy,
} from '@mui/icons-material';

// Mock reports data
const mockReports = [
  {
    id: '1',
    name: 'Daily Health Summary',
    description: 'Daily overview of all system health checks',
    frequency: 'Daily at 8:00 AM',
    recipients: ['platform-team@citi.com', 'ops@citi.com'],
    lastSent: '2025-01-07T08:00:00Z',
    status: 'active',
    includeCharts: true,
    checks: ['Trading API', 'Database', 'Payment Gateway'],
    template: 'executive-summary'
  },
  {
    id: '2',
    name: 'Weekly Executive Report',
    description: 'Weekly executive summary with trends and insights',
    frequency: 'Weekly on Monday at 9:00 AM',
    recipients: ['executives@citi.com'],
    lastSent: '2025-01-06T09:00:00Z',
    status: 'active',
    includeCharts: true,
    checks: ['All Checks'],
    template: 'executive-dashboard'
  },
  {
    id: '3',
    name: 'Critical Alerts Digest',
    description: 'Real-time digest of critical system alerts',
    frequency: 'Every 4 hours',
    recipients: ['oncall@citi.com', 'sre@citi.com'],
    lastSent: '2025-01-07T10:00:00Z',
    status: 'paused',
    includeCharts: false,
    checks: ['Critical Systems Only'],
    template: 'alert-digest'
  }
];

// Mock analytics data
const mockAnalytics = {
  totalReportsSent: 1247,
  avgOpenRate: 87.3,
  avgClickRate: 45.2,
  mostPopularTemplate: 'executive-summary',
  topRecipient: 'platform-team@citi.com',
  deliverySuccess: 99.1,
  trends: [
    { period: 'Last 7 days', reports: 42, opens: 38, clicks: 19 },
    { period: 'Last 30 days', reports: 186, opens: 162, clicks: 84 },
    { period: 'Last 90 days', reports: 548, opens: 478, clicks: 248 }
  ]
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`report-tabpanel-${index}`}
      aria-labelledby={`report-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const ReportsPage: React.FC = () => {
  const theme = useTheme();
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedReport, setSelectedReport] = useState<string | null>(mockReports[0]?.id || null);
  const [showNewReportDialog, setShowNewReportDialog] = useState(false);
  const [reportConfig, setReportConfig] = useState({
    name: '',
    description: '',
    frequency: 'daily',
    recipients: '',
    includeCharts: true,
    template: 'executive-summary',
    checks: [] as string[]
  });

  const selectedReportData = mockReports.find(r => r.id === selectedReport);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'paused': return 'warning';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box>
      {/* Enhanced Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Avatar sx={{ bgcolor: 'warning.main', width: 48, height: 48 }}>
                <AutoGraph sx={{ fontSize: 28 }} />
              </Avatar>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  Reports & Analytics
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Scope-aware reporting. Selections reflect your current CSI/tag scope.
                </Typography>
              </Box>
            </Box>
          </Box>
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<FileCopy />}
              size="small"
            >
              Templates
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setShowNewReportDialog(true)}
            >
              New Report
            </Button>
          </Stack>
        </Box>

        {/* Analytics Overview */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
              borderTop: `3px solid ${theme.palette.primary.main}`
            }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="text.secondary" variant="overline" sx={{ fontWeight: 600 }}>
                      Reports Sent
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {mockAnalytics.totalReportsSent.toLocaleString()}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                      <TrendingUp sx={{ fontSize: 16, color: 'success.main' }} />
                      <Typography variant="caption" color="success.main">+8% this month</Typography>
                    </Box>
                  </Box>
                  <Email sx={{ fontSize: 48, color: 'primary.main', opacity: 0.7 }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.1)} 0%, ${alpha(theme.palette.success.main, 0.05)} 100%)`,
              borderTop: `3px solid ${theme.palette.success.main}`
            }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="text.secondary" variant="overline" sx={{ fontWeight: 600 }}>
                      Open Rate
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>
                      {mockAnalytics.avgOpenRate}%
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={mockAnalytics.avgOpenRate}
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
                  <Visibility sx={{ fontSize: 48, color: 'success.main', opacity: 0.7 }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.1)} 0%, ${alpha(theme.palette.info.main, 0.05)} 100%)`,
              borderTop: `3px solid ${theme.palette.info.main}`
            }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="text.secondary" variant="overline" sx={{ fontWeight: 600 }}>
                      Click Rate
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'info.main' }}>
                      {mockAnalytics.avgClickRate}%
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={mockAnalytics.avgClickRate}
                      sx={{ 
                        mt: 1,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: alpha(theme.palette.info.main, 0.2),
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: theme.palette.info.main,
                        }
                      }}
                    />
                  </Box>
                  <Assessment sx={{ fontSize: 48, color: 'info.main', opacity: 0.7 }} />
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
                      Delivery Success
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'warning.main' }}>
                      {mockAnalytics.deliverySuccess}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {mockAnalytics.mostPopularTemplate} most used
                    </Typography>
                  </Box>
                  <CheckCircle sx={{ fontSize: 48, color: 'warning.main', opacity: 0.7 }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* Main Content with Tabs */}
      <Paper sx={{ overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={selectedTab} onChange={handleTabChange} aria-label="reports tabs">
            <Tab label="Report Builder" icon={<Settings />} />
            <Tab label="Scheduled Reports" icon={<Schedule />} />
            <Tab label="Analytics" icon={<Analytics />} />
          </Tabs>
        </Box>

        {/* Report Builder Tab */}
        <TabPanel value={selectedTab} index={0}>
          <Grid container spacing={3} sx={{ p: 3, minHeight: '600px' }}>
            {/* Left Panel - Configuration */}
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardHeader
                  avatar={<Settings sx={{ color: 'primary.main' }} />}
                  title="Report Configuration"
                  subheader="Customize your report settings"
                  action={
                    <IconButton size="small">
                      <Save />
                    </IconButton>
                  }
                />
                <CardContent sx={{ flex: 1, overflow: 'auto' }}>
                  <Stack spacing={3}>
                    {/* Basic Settings */}
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                        Basic Information
                      </Typography>
                      <TextField
                        fullWidth
                        label="Report Name"
                        placeholder="e.g., Daily Health Summary"
                        value={reportConfig.name}
                        onChange={(e) => setReportConfig({...reportConfig, name: e.target.value})}
                        sx={{ mb: 2 }}
                      />
                      <TextField
                        fullWidth
                        multiline
                        rows={3}
                        label="Description"
                        placeholder="Describe what this report covers..."
                        value={reportConfig.description}
                        onChange={(e) => setReportConfig({...reportConfig, description: e.target.value})}
                      />
                    </Box>

                    <Divider />

                    {/* Schedule Settings */}
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                        Schedule & Recipients
                      </Typography>
                      <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>Frequency</InputLabel>
                        <Select
                          value={reportConfig.frequency}
                          label="Frequency"
                          onChange={(e) => setReportConfig({...reportConfig, frequency: e.target.value})}
                        >
                          <MenuItem value="hourly">Every Hour</MenuItem>
                          <MenuItem value="daily">Daily</MenuItem>
                          <MenuItem value="weekly">Weekly</MenuItem>
                          <MenuItem value="monthly">Monthly</MenuItem>
                        </Select>
                      </FormControl>
                      <TextField
                        fullWidth
                        label="Recipients"
                        placeholder="email1@citi.com, email2@citi.com"
                        value={reportConfig.recipients}
                        onChange={(e) => setReportConfig({...reportConfig, recipients: e.target.value})}
                      />
                    </Box>

                    <Divider />

                    {/* Content Settings */}
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                        Content & Format
                      </Typography>
                      <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>Template</InputLabel>
                        <Select
                          value={reportConfig.template}
                          label="Template"
                          onChange={(e) => setReportConfig({...reportConfig, template: e.target.value})}
                        >
                          <MenuItem value="executive-summary">Executive Summary</MenuItem>
                          <MenuItem value="detailed-report">Detailed Report</MenuItem>
                          <MenuItem value="alert-digest">Alert Digest</MenuItem>
                          <MenuItem value="trend-analysis">Trend Analysis</MenuItem>
                        </Select>
                      </FormControl>

                      <FormControlLabel
                        control={
                          <Switch
                            checked={reportConfig.includeCharts}
                            onChange={(e) => setReportConfig({...reportConfig, includeCharts: e.target.checked})}
                          />
                        }
                        label="Include Charts and Visualizations"
                        sx={{ mb: 2 }}
                      />

                      {/* Check Selection */}
                      <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                        Include Checks
                      </Typography>
                      <FormGroup>
                        <FormControlLabel control={<Checkbox defaultChecked />} label="Trading Platform Checks" />
                        <FormControlLabel control={<Checkbox defaultChecked />} label="Banking Services Checks" />
                        <FormControlLabel control={<Checkbox />} label="Payment Systems Checks" />
                        <FormControlLabel control={<Checkbox />} label="Infrastructure Checks" />
                      </FormGroup>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {/* Right Panel - Live Preview */}
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardHeader
                  avatar={<Preview sx={{ color: 'info.main' }} />}
                  title="Live Preview"
                  subheader="Real-time email preview"
                  action={
                    <Stack direction="row" spacing={1}>
                      <IconButton size="small">
                        <Send />
                      </IconButton>
                      <IconButton size="small">
                        <Download />
                      </IconButton>
                    </Stack>
                  }
                />
                <CardContent sx={{ flex: 1, overflow: 'auto' }}>
                  {/* Email Preview */}
                  <Paper 
                    variant="outlined" 
                    sx={{ 
                      height: '100%',
                      p: 3,
                      bgcolor: '#FAFAFA',
                      border: '2px dashed',
                      borderColor: 'divider',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    {/* Email Header */}
                    <Box sx={{ mb: 3, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {reportConfig.name || 'Report Preview'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        From: noreply@citi.com | {new Date().toLocaleDateString()}
                      </Typography>
                    </Box>

                    {/* Email Body Preview */}
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body1" sx={{ mb: 2 }}>
                        {reportConfig.description || 'Your automated health monitoring report is ready.'}
                      </Typography>

                      {/* Sample Content */}
                      <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={6}>
                          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: alpha(theme.palette.success.main, 0.1) }}>
                            <Typography variant="h4" color="success.main" sx={{ fontWeight: 700 }}>
                              42
                            </Typography>
                            <Typography variant="caption">Passing Checks</Typography>
                          </Paper>
                        </Grid>
                        <Grid item xs={6}>
                          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: alpha(theme.palette.error.main, 0.1) }}>
                            <Typography variant="h4" color="error.main" sx={{ fontWeight: 700 }}>
                              3
                            </Typography>
                            <Typography variant="caption">Failed Checks</Typography>
                          </Paper>
                        </Grid>
                      </Grid>

                      {reportConfig.includeCharts && (
                        <Box sx={{ mb: 3 }}>
                          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                            System Health Trends
                          </Typography>
                          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.100' }}>
                            <ShowChart sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                            <Typography variant="caption" color="text.secondary">
                              Chart visualization will appear here
                            </Typography>
                          </Paper>
                        </Box>
                      )}

                      {/* Sample Table */}
                      <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Check Name</TableCell>
                              <TableCell>Status</TableCell>
                              <TableCell>Response Time</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            <TableRow>
                              <TableCell>Trading API</TableCell>
                              <TableCell>
                                <Chip label="Passing" size="small" color="success" />
                              </TableCell>
                              <TableCell>89ms</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell>Database</TableCell>
                              <TableCell>
                                <Chip label="Warning" size="small" color="warning" />
                              </TableCell>
                              <TableCell>245ms</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </TableContainer>

                      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        This is a preview of your email report. The actual report will contain live data.
                      </Typography>
                    </Box>
                  </Paper>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Scheduled Reports Tab */}
        <TabPanel value={selectedTab} index={1}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
              Active Scheduled Reports
            </Typography>
            
            <Grid container spacing={3}>
              {mockReports.map((report) => (
                <Grid item xs={12} md={6} lg={4} key={report.id}>
                  <Card 
                    variant="outlined"
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      '&:hover': {
                        boxShadow: 4,
                        transform: 'translateY(-2px)'
                      }
                    }}
                    onClick={() => setSelectedReport(report.id)}
                  >
                    <CardHeader
                      avatar={<Email sx={{ color: 'primary.main' }} />}
                      title={report.name}
                      subheader={report.frequency}
                      action={
                        <Stack direction="row" spacing={0.5}>
                          <Chip 
                            label={report.status} 
                            size="small" 
                            color={getStatusColor(report.status) as any}
                          />
                          <IconButton size="small">
                            <Edit />
                          </IconButton>
                        </Stack>
                      }
                    />
                    <CardContent>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {report.description}
                      </Typography>
                      
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" color="text.secondary">
                          Recipients ({report.recipients.length})
                        </Typography>
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                          {report.recipients.slice(0, 2).map((email, index) => (
                            <Chip key={index} label={email} size="small" variant="outlined" />
                          ))}
                          {report.recipients.length > 2 && (
                            <Chip label={`+${report.recipients.length - 2} more`} size="small" variant="outlined" />
                          )}
                        </Stack>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                          Last sent: {new Date(report.lastSent).toLocaleDateString()}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        </TabPanel>

        {/* Analytics Tab */}
        <TabPanel value={selectedTab} index={2}>
          <Box sx={{ p: 3 }}>
            <Grid container spacing={3}>
              {/* Engagement Analytics */}
              <Grid item xs={12} md={8}>
                <Card>
                  <CardHeader
                    avatar={<Timeline sx={{ color: 'primary.main' }} />}
                    title="Engagement Analytics"
                    subheader="Email open and click trends"
                    action={
                      <IconButton size="small">
                        <Refresh />
                      </IconButton>
                    }
                  />
                  <CardContent>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>Period</TableCell>
                            <TableCell align="center">Reports Sent</TableCell>
                            <TableCell align="center">Opens</TableCell>
                            <TableCell align="center">Clicks</TableCell>
                            <TableCell align="center">Open Rate</TableCell>
                            <TableCell align="center">Click Rate</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {mockAnalytics.trends.map((trend, index) => (
                            <TableRow key={index}>
                              <TableCell>{trend.period}</TableCell>
                              <TableCell align="center">{trend.reports}</TableCell>
                              <TableCell align="center">{trend.opens}</TableCell>
                              <TableCell align="center">{trend.clicks}</TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={`${((trend.opens / trend.reports) * 100).toFixed(1)}%`}
                                  size="small"
                                  color="success"
                                />
                              </TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={`${((trend.clicks / trend.reports) * 100).toFixed(1)}%`}
                                  size="small"
                                  color="info"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>

              {/* Performance Metrics */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardHeader
                    avatar={<DataUsage sx={{ color: 'warning.main' }} />}
                    title="Performance Metrics"
                    subheader="Key performance indicators"
                  />
                  <CardContent>
                    <Stack spacing={3}>
                      <Box>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          Most Popular Template
                        </Typography>
                        <Chip 
                          label={mockAnalytics.mostPopularTemplate} 
                          color="primary" 
                          sx={{ width: '100%' }}
                        />
                      </Box>

                      <Box>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          Top Recipient
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {mockAnalytics.topRecipient}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          Delivery Success Rate
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress 
                            variant="determinate" 
                            value={mockAnalytics.deliverySuccess}
                            sx={{ flex: 1, height: 8, borderRadius: 4 }}
                          />
                          <Typography variant="caption" sx={{ minWidth: 35 }}>
                            {mockAnalytics.deliverySuccess}%
                          </Typography>
                        </Box>
                      </Box>

                      <Divider />

                      <Box>
                        <Typography variant="body2" sx={{ mb: 2, fontWeight: 600 }}>
                          Quick Actions
                        </Typography>
                        <Stack spacing={1}>
                          <Button variant="outlined" size="small" startIcon={<Download />}>
                            Export Data
                          </Button>
                          <Button variant="outlined" size="small" startIcon={<Settings />}>
                            Configure Tracking
                          </Button>
                        </Stack>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        </TabPanel>
      </Paper>

      {/* New Report Dialog */}
      <Dialog open={showNewReportDialog} onClose={() => setShowNewReportDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create New Report</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Report Name"
                  placeholder="e.g., Weekly Health Summary"
                  sx={{ mb: 2 }}
                />
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Description"
                  placeholder="Describe what this report covers..."
                  sx={{ mb: 2 }}
                />
                <FormControl fullWidth>
                  <InputLabel>Template</InputLabel>
                  <Select label="Template" defaultValue="executive-summary">
                    <MenuItem value="executive-summary">Executive Summary</MenuItem>
                    <MenuItem value="detailed-report">Detailed Report</MenuItem>
                    <MenuItem value="alert-digest">Alert Digest</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Frequency</InputLabel>
                  <Select label="Frequency" defaultValue="daily">
                    <MenuItem value="hourly">Hourly</MenuItem>
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  fullWidth
                  label="Recipients"
                  placeholder="email1@citi.com, email2@citi.com"
                  sx={{ mb: 2 }}
                />
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="Include Charts and Visualizations"
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewReportDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => setShowNewReportDialog(false)}>
            Create Report
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ReportsPage;