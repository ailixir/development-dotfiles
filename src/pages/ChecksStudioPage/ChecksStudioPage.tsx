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
  GlobalStyles,
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
    description: 'Validates complete user authentication flow and dashboard loading',
    csiId: 'CSI-12345',
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
    description: 'End-to-end payment processing validation',
    csiId: 'CSI-67890',
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
    description: 'Real-time market data display and interaction validation',
    csiId: 'CSI-11111',
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
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [stepResults, setStepResults] = useState<{ [key: number]: 'passed' | 'failed' | 'pending' }>({});
  const [newScenarioForm, setNewScenarioForm] = useState({
    name: '',
    environment: 'Development',
    csiId: '',
    description: ''
  });
  
  const selectedScenarioData = mockTestScenarios.find(s => s.id === selectedScenario);
  
  // Calculate metrics
  const totalScenarios = mockTestScenarios.length;
  const passedScenarios = mockTestScenarios.filter(s => s.status === 'completed').length;
  const failedScenarios = mockTestScenarios.filter(s => s.status === 'failed').length;
  const successRate = Math.round((passedScenarios / totalScenarios) * 100);

  const handleRunTest = () => {
    setIsRunning(true);
    setCurrentStep(0);
    setShowVideoPlayer(true);
    setStepResults({});
    // Simulate test execution
    const interval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev < testSteps.length - 1) {
          // Mark current step as passed
          setStepResults(results => ({ ...results, [prev]: 'passed' }));
          setExecutionLogs(logs => [...logs, {
            timestamp: new Date().toLocaleTimeString(),
            message: `Executing: ${testSteps[prev + 1]}`,
            type: 'info'
          }]);
          return prev + 1;
        } else {
          // Mark final step as passed
          setStepResults(results => ({ ...results, [prev]: 'passed' }));
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

  const handleScenarioSelect = (scenarioId: string) => {
    setSelectedScenario(scenarioId);
    const scenario = mockTestScenarios.find(s => s.id === scenarioId);
    if (scenario) {
      setTestSteps(scenario.steps);
      setShowVideoPlayer(scenario.status === 'completed');
      setCurrentStep(0);
      setStepResults({});
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle sx={{ fontSize: 14 }} />;
      case 'running':
        return <CircularProgress size={14} />;
      case 'failed':
        return <Error sx={{ fontSize: 14 }} />;
      default:
        return <Schedule sx={{ fontSize: 14 }} />;
    }
  };

  const handleStepClick = (stepIndex: number) => {
    if (showVideoPlayer && !isRunning) {
      // Simulate jumping to step timestamp in video
      setVideoCurrentTime(stepIndex * 30); // 30 seconds per step simulation
      setCurrentStep(stepIndex);
    }
  };

  const handleCreateNewScenario = () => {
    // In a real implementation, this would call an API
    console.log('Creating new scenario:', newScenarioForm);
    setShowNewScenarioDialog(false);
    setNewScenarioForm({
      name: '',
      environment: 'Development',
      csiId: '',
      description: ''
    });
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
                  {totalScenarios} scenarios • {passedScenarios} passed • {failedScenarios} failed
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
                  {successRate}% success rate
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
                        '&:hover': { boxShadow: 2 },
                        bgcolor: selectedScenario === scenario.id ? alpha(theme.palette.primary.main, 0.02) : 'background.paper'
                      }}
                      onClick={() => handleScenarioSelect(scenario.id)}
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
                            icon={getStatusIcon(scenario.status)}
                            sx={{ fontSize: 11 }}
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                          {scenario.description}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {scenario.steps.length} steps • {scenario.environment} • {scenario.csiId}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          Last run: {new Date(scenario.lastRun).toLocaleString()}
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
                  {testSteps.map((step, index) => {
                    const stepResult = stepResults[index];
                    const isCurrentStep = index === currentStep;
                    const isPastStep = index < currentStep;
                    const isClickable = showVideoPlayer && !isRunning;
                    
                    return (
                      <ListItem
                        key={index}
                        sx={{
                          border: '1px solid',
                          borderColor: isCurrentStep && isRunning ? 'primary.main' : 
                                       stepResult === 'passed' ? 'success.main' :
                                       stepResult === 'failed' ? 'error.main' : 'divider',
                          borderRadius: 1,
                          mb: 1,
                          bgcolor: isCurrentStep && isRunning ? alpha(theme.palette.primary.main, 0.08) : 
                                   stepResult === 'passed' ? alpha(theme.palette.success.main, 0.05) :
                                   stepResult === 'failed' ? alpha(theme.palette.error.main, 0.05) : 'transparent',
                          transition: 'all 0.3s ease',
                          cursor: isClickable ? 'pointer' : 'default',
                          '&:hover': isClickable ? {
                            bgcolor: alpha(theme.palette.primary.main, 0.05),
                            boxShadow: 1
                          } : {}
                        }}
                        onClick={() => isClickable && handleStepClick(index)}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 1 }}>
                          <Avatar sx={{ 
                            width: 28, 
                            height: 28, 
                            fontSize: 12,
                            bgcolor: stepResult === 'passed' ? 'success.main' :
                                     stepResult === 'failed' ? 'error.main' :
                                     isCurrentStep && isRunning ? 'primary.main' : 'grey.300',
                            color: 'white'
                          }}>
                            {stepResult === 'passed' ? <CheckCircle sx={{ fontSize: 16 }} /> : 
                             stepResult === 'failed' ? <Error sx={{ fontSize: 16 }} /> :
                             isCurrentStep && isRunning ? <CircularProgress size={16} sx={{ color: 'white' }} /> :
                             index + 1}
                          </Avatar>
                        </Box>
                        <ListItemText 
                          primary={step}
                          secondary={isClickable ? 'Click to jump to this step in video' : undefined}
                          primaryTypographyProps={{
                            variant: 'body2',
                            sx: { 
                              fontWeight: isCurrentStep && isRunning ? 600 : 400,
                              color: stepResult === 'passed' ? 'success.main' :
                                     stepResult === 'failed' ? 'error.main' :
                                     isCurrentStep ? 'primary.main' : 'text.primary'
                            }
                          }}
                          secondaryTypographyProps={{
                            variant: 'caption',
                            sx: { color: 'text.secondary' }
                          }}
                        />
                        <ListItemSecondaryAction>
                          <Tooltip title="Remove step">
                            <IconButton 
                              size="small" 
                              onClick={(e) => {
                                e.stopPropagation();
                                removeTestStep(index);
                              }}
                              disabled={isRunning}
                            >
                              <Delete sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </ListItemSecondaryAction>
                      </ListItem>
                    );
                  })}
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
              {/* Video Player - Core PRD Feature */}
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
                {isRunning || isRecording ? (
                  <Box sx={{ textAlign: 'center', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <CameraAlt sx={{ fontSize: 48, color: 'primary.light', mb: 2 }} />
                    <Typography variant="h6" sx={{ mb: 1 }}>
                      Recording Test Execution
                    </Typography>
                    <Typography variant="body2" color="grey.300">
                      Step {currentStep + 1} of {testSteps.length}: {testSteps[currentStep]}
                    </Typography>
                    
                    {/* Recording indicator */}
                    <Box sx={{ 
                      position: 'absolute',
                      top: 16,
                      right: 16,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      color: 'error.light',
                      bgcolor: alpha('#000', 0.7),
                      px: 1.5,
                      py: 0.5,
                      borderRadius: 2
                    }}>
                      <FiberManualRecord sx={{ fontSize: 12, animation: 'pulse 2s infinite' }} />
                      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>RECORDING</Typography>
                    </Box>
                    
                    {/* Progress bar */}
                    <Box sx={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
                      <LinearProgress 
                        variant="determinate" 
                        value={((currentStep + 1) / testSteps.length) * 100}
                        sx={{ 
                          height: 4,
                          borderRadius: 2,
                          bgcolor: alpha('#fff', 0.2),
                          '& .MuiLinearProgress-bar': {
                            bgcolor: 'primary.light'
                          }
                        }}
                      />
                    </Box>
                  </Box>
                ) : showVideoPlayer ? (
                  <Box sx={{ textAlign: 'center', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <Box sx={{ 
                      width: '100%',
                      height: '100%',
                      background: `linear-gradient(45deg, 
                        ${alpha(theme.palette.primary.main, 0.1)} 25%, 
                        transparent 25%, 
                        transparent 50%, 
                        ${alpha(theme.palette.primary.main, 0.1)} 50%, 
                        ${alpha(theme.palette.primary.main, 0.1)} 75%, 
                        transparent 75%, 
                        transparent)`,
                      backgroundSize: '20px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column'
                    }}>
                      <PlayArrow sx={{ fontSize: 64, color: 'primary.light', mb: 2 }} />
                      <Typography variant="h6" sx={{ mb: 1 }}>
                        Test Video Available
                      </Typography>
                      <Typography variant="body2" color="grey.300">
                        {selectedScenarioData?.name} - {selectedScenarioData?.duration}
                      </Typography>
                      <Typography variant="caption" color="grey.400" sx={{ mt: 1 }}>
                        Click on steps to jump to specific moments
                      </Typography>
                    </Box>
                    
                    {/* Video timeline indicator */}
                    <Box sx={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="caption">
                          {Math.floor(videoCurrentTime / 60)}:{(videoCurrentTime % 60).toFixed(0).padStart(2, '0')}
                        </Typography>
                        <Typography variant="caption">
                          {selectedScenarioData?.duration || '0:00'}
                        </Typography>
                      </Box>
                      <LinearProgress 
                        variant="determinate" 
                        value={(videoCurrentTime / 180) * 100} // Assuming 3-minute max video
                        sx={{ 
                          height: 6,
                          borderRadius: 3,
                          bgcolor: alpha('#fff', 0.2),
                          '& .MuiLinearProgress-bar': {
                            bgcolor: 'info.light'
                          }
                        }}
                      />
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ textAlign: 'center' }}>
                    <VideoLibrary sx={{ fontSize: 48, color: 'grey.600', mb: 2 }} />
                    <Typography variant="h6" sx={{ mb: 1, color: 'grey.400' }}>
                      Visual Proof Arena
                    </Typography>
                    <Typography variant="body2" color="grey.500">
                      Run a test to generate synchronized video proof of execution
                    </Typography>
                    <Typography variant="caption" color="grey.600" sx={{ mt: 2, display: 'block' }}>
                      "From Checklist to Reality" - Watch your plain English commands come to life
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

      {/* Enhanced New Scenario Dialog */}
      <Dialog open={showNewScenarioDialog} onClose={() => setShowNewScenarioDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: 'primary.main' }}>
            <Science />
          </Avatar>
          <Box>
            <Typography variant="h6">Create New UI Test Scenario</Typography>
            <Typography variant="body2" color="text.secondary">
              Build no-code browser automation with plain English commands
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Scenario Name"
                  value={newScenarioForm.name}
                  onChange={(e) => setNewScenarioForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Trading Platform Login Validation"
                  required
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Environment</InputLabel>
                  <Select 
                    value={newScenarioForm.environment}
                    onChange={(e) => setNewScenarioForm(prev => ({ ...prev, environment: e.target.value }))}
                    label="Environment"
                  >
                    <MenuItem value="Development">Development</MenuItem>
                    <MenuItem value="Staging">Staging</MenuItem>
                    <MenuItem value="UAT">UAT</MenuItem>
                    <MenuItem value="Production">Production</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="CSI ID"
                  value={newScenarioForm.csiId}
                  onChange={(e) => setNewScenarioForm(prev => ({ ...prev, csiId: e.target.value }))}
                  placeholder="CSI-12345"
                  required
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Description"
                  value={newScenarioForm.description}
                  onChange={(e) => setNewScenarioForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this scenario validates and its business purpose"
                />
              </Grid>
              
              <Grid item xs={12}>
                <Alert severity="info">
                  <AlertTitle>Next Steps</AlertTitle>
                  After creating the scenario, you'll be able to add test steps using plain English commands like:
                  <br />• "Go to https://example.com"
                  <br />• "Click the Login button"
                  <br />• "Wait for Welcome message to appear"
                </Alert>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewScenarioDialog(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleCreateNewScenario}
            disabled={!newScenarioForm.name || !newScenarioForm.csiId}
            startIcon={<Save />}
          >
            Create Scenario
          </Button>
        </DialogActions>
      </Dialog>

      {/* Global CSS for animations - Using MUI's GlobalStyles */}
      <GlobalStyles
        styles={{
          '@keyframes pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.5 },
          },
        }}
      />
    </Box>
  );
};

export default ChecksStudioPage;