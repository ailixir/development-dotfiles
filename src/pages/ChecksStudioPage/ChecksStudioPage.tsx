import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  IconButton,
  TextField,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  Stack,
  LinearProgress,
  Alert,
  AlertTitle,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Tooltip,
  Badge,
  useTheme,
  alpha,
  CircularProgress,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Pause,
  Add,
  Delete,
  Edit,
  Science,
  VideoLibrary,
  Code,
  CheckCircle,
  Error,
  Warning,
  Timer,
  Visibility,
  VisibilityOff,
  Save,
  Share,
  Download,
  Upload,
  Settings,
  BugReport,
  Speed,
  Memory,
  WebAsset,
  Mouse,
  Keyboard,
  TouchApp,
  CameraAlt,
  FiberManualRecord,
  Schedule,
  AutoMode,
  ManualMode,
  ListAlt,
  PlaylistAdd,
  Clear,
  Refresh,
} from '@mui/icons-material';

// Mock test scenarios data
const mockTestScenarios = [
  {
    id: '1',
    name: 'Trading Platform Login Flow',
    steps: [
      'Navigate to https://trading.citi.com',
      'Click on Login button',
      'Enter valid credentials',
      'Verify dashboard loads',
      'Check account balance display'
    ],
    status: 'completed',
    duration: '2.4s',
    lastRun: '2025-01-07T10:30:00Z',
    environment: 'Production',
  },
  {
    id: '2',
    name: 'Payment Gateway Test',
    steps: [
      'Open payment form',
      'Fill payment details',
      'Submit payment',
      'Verify confirmation page',
      'Check transaction status'
    ],
    status: 'running',
    duration: '1.8s',
    lastRun: '2025-01-07T10:32:00Z',
    environment: 'Staging',
  },
  {
    id: '3',
    name: 'Market Data Visualization',
    steps: [
      'Load market dashboard',
      'Select equity symbols',
      'Apply date filters',
      'Verify chart rendering',
      'Check real-time updates'
    ],
    status: 'failed',
    duration: '3.1s',
    lastRun: '2025-01-07T10:28:00Z',
    environment: 'Development',
  },
];

const ChecksStudioPage: React.FC = () => {
  const theme = useTheme();
  const [selectedScenario, setSelectedScenario] = useState<string | null>(mockTestScenarios[0]?.id || null);
  const [isRecording, setIsRecording] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [testSteps, setTestSteps] = useState<string[]>([
    'Navigate to https://trading.citi.com',
    'Click on Login button',
    'Enter valid credentials',
    'Verify dashboard loads'
  ]);
  const [newStep, setNewStep] = useState('');
  const [showNewScenarioDialog, setShowNewScenarioDialog] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<{ timestamp: string; message: string; type: 'info' | 'success' | 'error' }[]>([
    { timestamp: '10:30:12', message: 'Test execution started', type: 'info' },
    { timestamp: '10:30:13', message: 'Browser initialized successfully', type: 'success' },
    { timestamp: '10:30:14', message: 'Navigating to target URL...', type: 'info' },
    { timestamp: '10:30:15', message: 'Page loaded in 1.2s', type: 'success' },
  ]);
  
  const selectedScenarioData = mockTestScenarios.find(s => s.id === selectedScenario);

  const handleRunTest = () => {
    setIsRunning(true);
    setCurrentStep(0);
    // Simulate test execution
    const interval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev < testSteps.length - 1) {
          setExecutionLogs(logs => [...logs, {
            timestamp: new Date().toLocaleTimeString(),
            message: `Executing: ${testSteps[prev + 1]}`,
            type: 'info'
          }]);
          return prev + 1;
        } else {
          setIsRunning(false);
          setExecutionLogs(logs => [...logs, {
            timestamp: new Date().toLocaleTimeString(),
            message: 'Test execution completed successfully',
            type: 'success'
          }]);
          clearInterval(interval);
          return prev;
        }
      });
    }, 1500);
  };

  const addTestStep = () => {
    if (newStep.trim()) {
      setTestSteps([...testSteps, newStep]);
      setNewStep('');
    }
  };

  const removeTestStep = (index: number) => {
    setTestSteps(testSteps.filter((_, i) => i !== index));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'running': return 'info';
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
              <Avatar sx={{ bgcolor: 'success.main', width: 48, height: 48 }}>
                <Science sx={{ fontSize: 28 }} />
              </Avatar>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  Checks Studio
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  From Checklist to Reality - Create and run UI tests with plain English commands
                </Typography>
              </Box>
            </Box>
          </Box>
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<Upload />}
              size="small"
            >
              Import
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setShowNewScenarioDialog(true)}
            >
              New Scenario
            </Button>
          </Stack>
        </Box>

        {/* Status Bar */}
        <Paper sx={{ p: 2, background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.05)} 0%, transparent 100%)` }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box 
                  sx={{ 
                    width: 12, 
                    height: 12, 
                    borderRadius: '50%', 
                    bgcolor: isRunning ? 'success.main' : 'grey.400',
                    animation: isRunning ? 'pulse 2s infinite' : 'none'
                  }} 
                />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Studio Status: {isRunning ? 'Running Test' : 'Ready'}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BugReport sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {mockTestScenarios.length} scenarios available
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Timer sx={{ fontSize: 18, color: 'info.main' }} />
                <Typography variant="body2" color="text.secondary">
                  Avg runtime: 2.1s
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircle sx={{ fontSize: 18, color: 'success.main' }} />
                <Typography variant="body2" color="text.secondary">
                  94% success rate
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Box>

      {/* Main Three-Panel Interface */}
      <Grid container spacing={3} sx={{ minHeight: '600px' }}>
        {/* Left Panel - Test Scenarios & Steps */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<ListAlt sx={{ color: 'primary.main' }} />}
              title="Test Scenarios & Steps"
              subheader="Your testing checklist"
              action={
                <IconButton size="small">
                  <Refresh />
                </IconButton>
              }
            />
            <CardContent sx={{ flex: 1, overflow: 'auto', p: 0 }}>
              {/* Scenario Selector */}
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                  Select Scenario
                </Typography>
                <Stack spacing={1}>
                  {mockTestScenarios.map((scenario) => (
                    <Card 
                      key={scenario.id}
                      variant={selectedScenario === scenario.id ? 'outlined' : 'elevation'}
                      sx={{ 
                        cursor: 'pointer',
                        border: selectedScenario === scenario.id ? 2 : 1,
                        borderColor: selectedScenario === scenario.id ? 'primary.main' : 'divider',
                        '&:hover': { boxShadow: 2 }
                      }}
                      onClick={() => {
                        setSelectedScenario(scenario.id);
                        setTestSteps(scenario.steps);
                      }}
                    >
                      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {scenario.name}
                          </Typography>
                          <Chip 
                            label={scenario.status} 
                            size="small"
                            color={getStatusColor(scenario.status) as any}
                            icon={scenario.status === 'running' ? <CircularProgress size={12} /> : undefined}
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {scenario.steps.length} steps • {scenario.environment}
                        </Typography>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Box>

              {/* Test Steps */}
              <Box sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Test Steps ({testSteps.length})
                  </Typography>
                  <Badge badgeContent={isRunning ? `${currentStep + 1}/${testSteps.length}` : null} color="primary">
                    <PlaylistAdd sx={{ color: 'text.secondary' }} />
                  </Badge>
                </Box>

                <List dense>
                  {testSteps.map((step, index) => (
                    <ListItem
                      key={index}
                      sx={{
                        border: '1px solid',
                        borderColor: index === currentStep && isRunning ? 'primary.main' : 'divider',
                        borderRadius: 1,
                        mb: 1,
                        bgcolor: index === currentStep && isRunning ? alpha(theme.palette.primary.main, 0.05) : 'transparent',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 1 }}>
                        <Avatar sx={{ 
                          width: 24, 
                          height: 24, 
                          fontSize: 12,
                          bgcolor: index < currentStep && isRunning ? 'success.main' : 
                                   index === currentStep && isRunning ? 'primary.main' : 'grey.300'
                        }}>
                          {index < currentStep && isRunning ? <CheckCircle sx={{ fontSize: 16 }} /> : index + 1}
                        </Avatar>
                      </Box>
                      <ListItemText 
                        primary={step}
                        primaryTypographyProps={{
                          variant: 'body2',
                          sx: { 
                            fontWeight: index === currentStep && isRunning ? 600 : 400,
                            color: index < currentStep && isRunning ? 'success.main' : 'text.primary'
                          }
                        }}
                      />
                      <ListItemSecondaryAction>
                        <IconButton size="small" onClick={() => removeTestStep(index)}>
                          <Delete sx={{ fontSize: 16 }} />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>

                {/* Add Step */}
                <Box sx={{ mt: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Add new test step..."
                    value={newStep}
                    onChange={(e) => setNewStep(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addTestStep()}
                    InputProps={{
                      endAdornment: (
                        <IconButton size="small" onClick={addTestStep} disabled={!newStep.trim()}>
                          <Add />
                        </IconButton>
                      )
                    }}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Middle Panel - Control Tower */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<Settings sx={{ color: 'warning.main' }} />}
              title="Control Tower"
              subheader="Test execution & monitoring"
              action={
                <Stack direction="row" spacing={1}>
                  <Tooltip title={isRecording ? "Stop Recording" : "Start Recording"}>
                    <IconButton 
                      size="small" 
                      color={isRecording ? "error" : "default"}
                      onClick={() => setIsRecording(!isRecording)}
                    >
                      <FiberManualRecord />
                    </IconButton>
                  </Tooltip>
                  <IconButton size="small">
                    <Settings />
                  </IconButton>
                </Stack>
              }
            />
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
              {/* Control Buttons */}
              <Box sx={{ mb: 3 }}>
                <Stack direction="row" spacing={2} justifyContent="center">
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={isRunning ? <Stop /> : <PlayArrow />}
                    onClick={() => isRunning ? setIsRunning(false) : handleRunTest()}
                    color={isRunning ? "error" : "success"}
                    disabled={testSteps.length === 0}
                    sx={{ minWidth: 120 }}
                  >
                    {isRunning ? 'Stop' : 'Run Test'}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<Save />}
                    disabled={isRunning}
                  >
                    Save
                  </Button>
                </Stack>

                {/* Progress */}
                {isRunning && (
                  <Box sx={{ mt: 2 }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={(currentStep / testSteps.length) * 100}
                      sx={{ 
                        height: 8,
                        borderRadius: 4,
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 4,
                        }
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                      Step {currentStep + 1} of {testSteps.length}
                    </Typography>
                  </Box>
                )}
              </Box>

              <Divider sx={{ mb: 2 }} />

              {/* Execution Logs */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Code sx={{ fontSize: 18 }} />
                  Live Execution Logs
                </Typography>
                
                <Paper 
                  variant="outlined" 
                  sx={{ 
                    height: 280, 
                    overflow: 'auto', 
                    bgcolor: 'grey.900',
                    color: 'white',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    p: 1
                  }}
                >
                  {executionLogs.map((log, index) => (
                    <Box key={index} sx={{ mb: 0.5, display: 'flex', gap: 1 }}>
                      <Typography 
                        component="span" 
                        sx={{ 
                          color: 'grey.400',
                          minWidth: 60,
                          fontFamily: 'monospace',
                          fontSize: 'inherit'
                        }}
                      >
                        {log.timestamp}
                      </Typography>
                      <Typography 
                        component="span"
                        sx={{ 
                          color: log.type === 'success' ? 'success.light' : 
                                 log.type === 'error' ? 'error.light' : 'white',
                          fontFamily: 'monospace',
                          fontSize: 'inherit'
                        }}
                      >
                        {log.message}
                      </Typography>
                    </Box>
                  ))}
                  {isRunning && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.light' }}>
                      <CircularProgress size={12} sx={{ color: 'primary.light' }} />
                      <Typography sx={{ fontFamily: 'monospace', fontSize: 'inherit' }}>
                        Executing...
                      </Typography>
                    </Box>
                  )}
                </Paper>
              </Box>

              {/* Test Configuration */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Test Configuration
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Chip label="Chrome 120" size="small" variant="outlined" />
                  <Chip label="1920x1080" size="small" variant="outlined" />
                  <Chip label="Fast Network" size="small" variant="outlined" />
                </Stack>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Right Panel - Video Playback */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<VideoLibrary sx={{ color: 'info.main' }} />}
              title="Visual Proof"
              subheader="Synchronized video playback"
              action={
                <Stack direction="row" spacing={1}>
                  <IconButton size="small">
                    <Download />
                  </IconButton>
                  <IconButton size="small">
                    <Share />
                  </IconButton>
                </Stack>
              }
            />
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
              {/* Video Player */}
              <Paper 
                variant="outlined"
                sx={{ 
                  height: 320,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'grey.900',
                  color: 'white',
                  position: 'relative',
                  overflow: 'hidden',
                  mb: 2
                }}
              >
                {isRunning ? (
                  <Box sx={{ textAlign: 'center' }}>
                    <CameraAlt sx={{ fontSize: 48, color: 'primary.light', mb: 1 }} />
                    <Typography variant="body2">
                      Recording in Progress...
                    </Typography>
                    <Box sx={{ 
                      position: 'absolute',
                      top: 16,
                      right: 16,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      color: 'error.light'
                    }}>
                      <FiberManualRecord sx={{ fontSize: 16, animation: 'pulse 2s infinite' }} />
                      <Typography variant="caption">REC</Typography>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ textAlign: 'center' }}>
                    <VideoLibrary sx={{ fontSize: 48, color: 'grey.600', mb: 1 }} />
                    <Typography variant="body2" color="grey.400">
                      Run a test to see video playback
                    </Typography>
                  </Box>
                )}
              </Paper>

              {/* Video Controls */}
              <Box sx={{ mb: 2 }}>
                <Stack direction="row" justifyContent="center" spacing={1}>
                  <IconButton disabled={!isRunning}>
                    <PlayArrow />
                  </IconButton>
                  <IconButton disabled={!isRunning}>
                    <Pause />
                  </IconButton>
                  <IconButton disabled={!isRunning}>
                    <Stop />
                  </IconButton>
                </Stack>
                
                <LinearProgress 
                  variant="determinate" 
                  value={isRunning ? (currentStep / testSteps.length) * 100 : 0}
                  sx={{ mt: 1, height: 4, borderRadius: 2 }}
                />
              </Box>

              <Divider sx={{ mb: 2 }} />

              {/* Test Results */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                  Test Results & Metrics
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                      <Typography variant="h6" color="success.main" sx={{ fontWeight: 700 }}>
                        2.4s
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Duration
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={6}>
                    <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                      <Typography variant="h6" color="primary.main" sx={{ fontWeight: 700 }}>
                        4/4
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Steps Passed
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Stack spacing={1}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Speed sx={{ fontSize: 16, color: 'info.main' }} />
                          <Typography variant="caption">Load Time: 1.2s</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Memory sx={{ fontSize: 16, color: 'warning.main' }} />
                          <Typography variant="caption">Memory: 45MB</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <WebAsset sx={{ fontSize: 16, color: 'success.main' }} />
                          <Typography variant="caption">DOM Elements: 247</Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  </Grid>
                </Grid>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* New Scenario Dialog */}
      <Dialog open={showNewScenarioDialog} onClose={() => setShowNewScenarioDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Test Scenario</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="Scenario Name"
              placeholder="e.g., Login Flow Test"
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Environment</InputLabel>
              <Select label="Environment" defaultValue="Development">
                <MenuItem value="Development">Development</MenuItem>
                <MenuItem value="Staging">Staging</MenuItem>
                <MenuItem value="Production">Production</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Description"
              placeholder="Describe what this scenario tests..."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewScenarioDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => setShowNewScenarioDialog(false)}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* CSS for animations */}
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </Box>
  );
};

export default ChecksStudioPage;