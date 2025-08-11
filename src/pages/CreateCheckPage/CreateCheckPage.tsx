import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  RadioGroup,
  Radio,
  FormLabel,
  Button,
  Stepper,
  Step,
  StepLabel,
  Grid,
  Chip,
  Autocomplete,
  Switch,
  Slider,
  Alert,
  AlertTitle,
  Divider,
  Paper,
  Avatar,
  Stack,
  useTheme,
  alpha,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Save as SaveIcon,
  Preview as PreviewIcon,
  NavigateNext as NextIcon,
  NavigateBefore as BackIcon,
  Api,
  Storage,
  AutoGraph,
  Security,
  BugReport,
  Science,
  Delete,
  DragIndicator,
  PlaylistAdd,
  CheckCircle,
  Warning,
  Info,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchCSIs } from '@store/slices/csiSlice';
import { createCheck } from '@store/slices/checksSlice';
import { useNavigate } from 'react-router-dom';

const checkTypes = [
  { 
    value: 'HTTP', 
    label: 'HTTP/HTTPS Check', 
    description: 'Monitor HTTP/HTTPS endpoints for availability and response validation',
    icon: Api,
    color: 'primary'
  },
  { 
    value: 'TCP', 
    label: 'TCP Port Check', 
    description: 'Verify TCP port connectivity and basic network health',
    icon: Storage,
    color: 'secondary'
  },
  { 
    value: 'SPLUNK', 
    label: 'Splunk Query', 
    description: 'Execute complex Splunk searches for log-based validation',
    icon: AutoGraph,
    color: 'success'
  },
  { 
    value: 'GRAFANA', 
    label: 'Grafana Metrics', 
    description: 'Monitor Grafana dashboards and metric thresholds',
    icon: AutoGraph,
    color: 'info'
  },
  { 
    value: 'ITRS', 
    label: 'ITRS Geneos', 
    description: 'Check ITRS sampler status and infrastructure monitoring',
    icon: Security,
    color: 'warning'
  },
  { 
    value: 'APPDYNAMICS', 
    label: 'AppDynamics APM', 
    description: 'Validate AppDynamics health rules and performance metrics',
    icon: BugReport,
    color: 'error'
  },
  { 
    value: 'UI_TEST', 
    label: 'UI Test (Checks Studio)', 
    description: 'No-code browser automation with plain English commands',
    icon: Science,
    color: 'secondary'
  },
];

const environments = ['Development', 'Staging', 'Production', 'UAT'];
const frequencies = [
  { value: '1m', label: '1 minute' },
  { value: '5m', label: '5 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '12h', label: '12 hours' },
  { value: '24h', label: '24 hours' },
];

const notificationChannels = [
  { value: 'email', label: 'Email' },
  { value: 'slack', label: 'Slack' },
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'pagerduty', label: 'PagerDuty' },
  { value: 'webhook', label: 'Webhook' },
];

const steps = ['Basic Information', 'Check Configuration', 'Scheduling & Alerts', 'Review & Create'];

const CreateCheckPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data: csiEntities, loading: csiLoading } = useAppSelector(state => state.csi);
  
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    // Basic Information
    name: '',
    description: '',
    checkType: '',
    csiId: '',
    environment: '',
    tags: [] as string[],
    
    // HTTP Configuration
    endpoint: '',
    method: 'GET',
    expectedStatus: 200,
    timeout: 30,
    retries: 3,
    validateSSL: true,
    followRedirects: true,
    headers: {} as Record<string, string>,
    
    // TCP Configuration
    host: '',
    port: 80,
    
    // Splunk Configuration
    splunkQuery: '',
    splunkIndex: '',
    timeRange: '15m',
    expectedCount: 0,
    countOperator: '>',
    
    // Grafana Configuration
    grafanaDashboard: '',
    grafanaPanel: '',
    metric: '',
    threshold: 0,
    thresholdOperator: '<',
    
    // ITRS Configuration
    itrsSampler: '',
    itrsExpectedStatus: 'OK',
    
    // AppDynamics Configuration
    appDynamicsApp: '',
    healthRule: '',
    
    // UI Test Configuration
    testSteps: [] as string[],
    browserType: 'chrome',
    screenSize: '1920x1080',
    
    // Scheduling & Alerts
    frequency: '5m',
    enabled: true,
    alertOnFailure: true,
    alertThreshold: 3,
    notificationChannels: [] as string[],
  });

  const [tagInput, setTagInput] = useState('');
  const [newStepInput, setNewStepInput] = useState('');
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');

  useEffect(() => {
    dispatch(fetchCSIs());
  }, [dispatch]);

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleInputChange = (field: string) => (event: any) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleAddTestStep = () => {
    if (newStepInput.trim()) {
      setFormData(prev => ({
        ...prev,
        testSteps: [...prev.testSteps, newStepInput.trim()]
      }));
      setNewStepInput('');
    }
  };

  const handleRemoveTestStep = (index: number) => {
    setFormData(prev => ({
      ...prev,
      testSteps: prev.testSteps.filter((_, i) => i !== index)
    }));
  };

  const handleAddHeader = () => {
    if (headerKey.trim() && headerValue.trim()) {
      setFormData(prev => ({
        ...prev,
        headers: { ...prev.headers, [headerKey.trim()]: headerValue.trim() }
      }));
      setHeaderKey('');
      setHeaderValue('');
    }
  };

  const handleRemoveHeader = (key: string) => {
    setFormData(prev => {
      const newHeaders = { ...prev.headers };
      delete newHeaders[key];
      return { ...prev, headers: newHeaders };
    });
  };

  const handleCreateCheck = async () => {
    try {
      // Transform form data to match API requirements
      const checkData = {
        name: formData.name,
        description: formData.description,
        type: formData.checkType,
        csiId: formData.csiId,
        environment: formData.environment,
        tags: formData.tags,
        configuration: getConfigurationForCheckType(),
        schedule: {
          enabled: formData.enabled,
          frequency: formData.frequency,
        },
        alerting: {
          enabled: formData.alertOnFailure,
          threshold: formData.alertThreshold,
          channels: formData.notificationChannels,
        },
      };

      await dispatch(createCheck(checkData as any)).unwrap();
      navigate('/checks');
    } catch (error) {
      console.error('Failed to create check:', error);
      // TODO: Add snackbar notification for error
    }
  };

  const getConfigurationForCheckType = () => {
    switch (formData.checkType) {
      case 'HTTP':
        return {
          endpoint: formData.endpoint,
          method: formData.method,
          expectedStatus: formData.expectedStatus,
          timeout: formData.timeout,
          retries: formData.retries,
          validateSSL: formData.validateSSL,
          followRedirects: formData.followRedirects,
          headers: formData.headers,
        };
      case 'TCP':
        return {
          host: formData.host,
          port: formData.port,
          timeout: formData.timeout,
        };
      case 'SPLUNK':
        return {
          query: formData.splunkQuery,
          index: formData.splunkIndex,
          timeRange: formData.timeRange,
          expectedCount: formData.expectedCount,
          countOperator: formData.countOperator,
        };
      case 'GRAFANA':
        return {
          dashboard: formData.grafanaDashboard,
          panel: formData.grafanaPanel,
          metric: formData.metric,
          threshold: formData.threshold,
          thresholdOperator: formData.thresholdOperator,
        };
      case 'ITRS':
        return {
          sampler: formData.itrsSampler,
          expectedStatus: formData.itrsExpectedStatus,
        };
      case 'APPDYNAMICS':
        return {
          application: formData.appDynamicsApp,
          healthRule: formData.healthRule,
        };
      case 'UI_TEST':
        return {
          steps: formData.testSteps,
          browserType: formData.browserType,
          screenSize: formData.screenSize,
        };
      default:
        return {};
    }
  };

  const getSelectedCheckType = () => checkTypes.find(type => type.value === formData.checkType);

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Grid container spacing={3}>
            {/* Header with check type selection */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Choose Check Type
              </Typography>
              <Grid container spacing={2}>
                {checkTypes.map((type) => {
                  const IconComponent = type.icon;
                  const isSelected = formData.checkType === type.value;
                  return (
                    <Grid item xs={12} sm={6} md={4} key={type.value}>
                      <Card 
                        variant={isSelected ? 'outlined' : 'elevation'}
                        sx={{ 
                          cursor: 'pointer',
                          border: isSelected ? 2 : 1,
                          borderColor: isSelected ? `${type.color}.main` : 'divider',
                          '&:hover': { 
                            boxShadow: 3,
                            borderColor: `${type.color}.main`,
                          },
                          height: '100%'
                        }}
                        onClick={() => setFormData(prev => ({ ...prev, checkType: type.value }))}
                      >
                        <CardContent sx={{ textAlign: 'center', p: 3 }}>
                          <Avatar 
                            sx={{ 
                              bgcolor: `${type.color}.main`, 
                              width: 56, 
                              height: 56, 
                              mx: 'auto', 
                              mb: 2 
                            }}
                          >
                            <IconComponent sx={{ fontSize: 32 }} />
                          </Avatar>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                            {type.label}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {type.description}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Grid>

            {formData.checkType && (
              <>
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                    Basic Information
                  </Typography>
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Check Name"
                    value={formData.name}
                    onChange={handleInputChange('name')}
                    placeholder={`e.g., ${getSelectedCheckType()?.label} for Trading Platform`}
                    required
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="Description"
                    value={formData.description}
                    onChange={handleInputChange('description')}
                    placeholder="Describe what this check monitors and its business purpose"
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <Autocomplete
                    options={csiEntities || []}
                    loading={csiLoading === 'loading'}
                    getOptionLabel={(option) => `${option.id} - ${option.name}`}
                    value={csiEntities?.find(csi => csi.id === formData.csiId) || null}
                    onChange={(_, newValue) => setFormData(prev => ({ ...prev, csiId: newValue?.id || '' }))}
                    renderInput={(params) => (
                      <TextField {...params} label="CSI Entity" required />
                    )}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth required>
                    <InputLabel>Environment</InputLabel>
                    <Select
                      value={formData.environment}
                      label="Environment"
                      onChange={handleInputChange('environment')}
                    >
                      {environments.map((env) => (
                        <MenuItem key={env} value={env}>
                          {env}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12}>
                  <Box>
                    <TextField
                      fullWidth
                      label="Add Tags"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder="Type tag and press Add"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      InputProps={{
                        endAdornment: (
                          <Button size="small" onClick={handleAddTag} disabled={!tagInput.trim()}>
                            Add
                          </Button>
                        ),
                      }}
                    />
                    <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {formData.tags.map((tag) => (
                        <Chip
                          key={tag}
                          label={tag}
                          onDelete={() => handleRemoveTag(tag)}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </Box>
                </Grid>
              </>
            )}
          </Grid>
        );

      case 1:
        const selectedType = getSelectedCheckType();
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Alert severity="info" sx={{ mb: 2 }}>
                <AlertTitle>Check Type: {selectedType?.label}</AlertTitle>
                {selectedType?.description}
              </Alert>
            </Grid>

            {/* HTTP Configuration */}
            {formData.checkType === 'HTTP' && (
              <>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Endpoint URL"
                    value={formData.endpoint}
                    onChange={handleInputChange('endpoint')}
                    placeholder="https://api.example.com/health"
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <FormLabel component="legend">HTTP Method</FormLabel>
                    <RadioGroup
                      row
                      value={formData.method}
                      onChange={handleInputChange('method')}
                    >
                      <FormControlLabel value="GET" control={<Radio />} label="GET" />
                      <FormControlLabel value="POST" control={<Radio />} label="POST" />
                      <FormControlLabel value="PUT" control={<Radio />} label="PUT" />
                      <FormControlLabel value="HEAD" control={<Radio />} label="HEAD" />
                    </RadioGroup>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Expected Status Code"
                    value={formData.expectedStatus}
                    onChange={handleInputChange('expectedStatus')}
                    InputProps={{ inputProps: { min: 100, max: 599 } }}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography gutterBottom>Timeout (seconds)</Typography>
                  <Slider
                    value={formData.timeout}
                    onChange={(_, value) => setFormData(prev => ({ ...prev, timeout: value as number }))}
                    valueLabelDisplay="auto"
                    step={5}
                    marks
                    min={5}
                    max={120}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Retry Attempts"
                    value={formData.retries}
                    onChange={handleInputChange('retries')}
                    InputProps={{ inputProps: { min: 0, max: 10 } }}
                  />
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mb: 2 }}>HTTP Headers</Typography>
                  <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                    <TextField
                      label="Header Name"
                      value={headerKey}
                      onChange={(e) => setHeaderKey(e.target.value)}
                      placeholder="Content-Type"
                    />
                    <TextField
                      label="Header Value"
                      value={headerValue}
                      onChange={(e) => setHeaderValue(e.target.value)}
                      placeholder="application/json"
                    />
                    <Button 
                      variant="outlined" 
                      onClick={handleAddHeader}
                      disabled={!headerKey.trim() || !headerValue.trim()}
                    >
                      Add
                    </Button>
                  </Box>
                  <Stack spacing={1}>
                    {Object.entries(formData.headers).map(([key, value]) => (
                      <Chip
                        key={key}
                        label={`${key}: ${value}`}
                        onDelete={() => handleRemoveHeader(key)}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                </Grid>

                <Grid item xs={12}>
                  <Box>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.validateSSL}
                          onChange={handleInputChange('validateSSL')}
                          color="primary"
                        />
                      }
                      label="Validate SSL Certificate"
                    />
                  </Box>
                  <Box>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.followRedirects}
                          onChange={handleInputChange('followRedirects')}
                          color="primary"
                        />
                      }
                      label="Follow HTTP Redirects"
                    />
                  </Box>
                </Grid>
              </>
            )}

            {/* TCP Configuration */}
            {formData.checkType === 'TCP' && (
              <>
                <Grid item xs={12} md={8}>
                  <TextField
                    fullWidth
                    label="Host/IP Address"
                    value={formData.host}
                    onChange={handleInputChange('host')}
                    placeholder="127.0.0.1 or hostname.example.com"
                    required
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Port"
                    value={formData.port}
                    onChange={handleInputChange('port')}
                    InputProps={{ inputProps: { min: 1, max: 65535 } }}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography gutterBottom>Connection Timeout (seconds)</Typography>
                  <Slider
                    value={formData.timeout}
                    onChange={(_, value) => setFormData(prev => ({ ...prev, timeout: value as number }))}
                    valueLabelDisplay="auto"
                    step={1}
                    marks
                    min={1}
                    max={30}
                  />
                </Grid>
              </>
            )}

            {/* Splunk Configuration */}
            {formData.checkType === 'SPLUNK' && (
              <>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={4}
                    label="Splunk Query"
                    value={formData.splunkQuery}
                    onChange={handleInputChange('splunkQuery')}
                    placeholder={`search index=trading earliest=-15m | stats count by status | where status="success"`}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Index (optional)"
                    value={formData.splunkIndex}
                    onChange={handleInputChange('splunkIndex')}
                    placeholder="trading, logs, metrics"
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Time Range</InputLabel>
                    <Select
                      value={formData.timeRange}
                      label="Time Range"
                      onChange={handleInputChange('timeRange')}
                    >
                      <MenuItem value="5m">Last 5 minutes</MenuItem>
                      <MenuItem value="15m">Last 15 minutes</MenuItem>
                      <MenuItem value="1h">Last hour</MenuItem>
                      <MenuItem value="24h">Last 24 hours</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Count Operator</InputLabel>
                    <Select
                      value={formData.countOperator}
                      label="Count Operator"
                      onChange={handleInputChange('countOperator')}
                    >
                      <MenuItem value=">">&gt; (greater than)</MenuItem>
                      <MenuItem value=">=">&gt;= (greater or equal)</MenuItem>
                      <MenuItem value="<">&lt; (less than)</MenuItem>
                      <MenuItem value="<=">&lt;= (less or equal)</MenuItem>
                      <MenuItem value="==">=== (equal to)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Expected Count"
                    value={formData.expectedCount}
                    onChange={handleInputChange('expectedCount')}
                    InputProps={{ inputProps: { min: 0 } }}
                  />
                </Grid>
              </>
            )}

            {/* Grafana Configuration */}
            {formData.checkType === 'GRAFANA' && (
              <>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Dashboard ID/Name"
                    value={formData.grafanaDashboard}
                    onChange={handleInputChange('grafanaDashboard')}
                    placeholder="trading-dashboard or d/abc123"
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Panel ID/Name"
                    value={formData.grafanaPanel}
                    onChange={handleInputChange('grafanaPanel')}
                    placeholder="CPU Usage or panel-id-5"
                    required
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Metric Query"
                    value={formData.metric}
                    onChange={handleInputChange('metric')}
                    placeholder="avg(cpu_usage_percent)"
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Threshold Operator</InputLabel>
                    <Select
                      value={formData.thresholdOperator}
                      label="Threshold Operator"
                      onChange={handleInputChange('thresholdOperator')}
                    >
                      <MenuItem value="<">Less than (&lt;)</MenuItem>
                      <MenuItem value="<=">Less or equal (&lt;=)</MenuItem>
                      <MenuItem value=">">Greater than (&gt;)</MenuItem>
                      <MenuItem value=">=">Greater or equal (&gt;=)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Threshold Value"
                    value={formData.threshold}
                    onChange={handleInputChange('threshold')}
                    inputProps={{ step: 0.1 }}
                  />
                </Grid>
              </>
            )}

            {/* ITRS Configuration */}
            {formData.checkType === 'ITRS' && (
              <>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="ITRS Sampler Path"
                    value={formData.itrsSampler}
                    onChange={handleInputChange('itrsSampler')}
                    placeholder="Gateway > ManagedEntity > Sampler > Dataview"
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Expected Status</InputLabel>
                    <Select
                      value={formData.itrsExpectedStatus}
                      label="Expected Status"
                      onChange={handleInputChange('itrsExpectedStatus')}
                    >
                      <MenuItem value="OK">OK</MenuItem>
                      <MenuItem value="WARNING">WARNING</MenuItem>
                      <MenuItem value="CRITICAL">CRITICAL</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </>
            )}

            {/* AppDynamics Configuration */}
            {formData.checkType === 'APPDYNAMICS' && (
              <>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Application Name"
                    value={formData.appDynamicsApp}
                    onChange={handleInputChange('appDynamicsApp')}
                    placeholder="Trading-Platform-Prod"
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Health Rule Name"
                    value={formData.healthRule}
                    onChange={handleInputChange('healthRule')}
                    placeholder="Database Connection Pool"
                    required
                  />
                </Grid>
              </>
            )}

            {/* UI Test Configuration */}
            {formData.checkType === 'UI_TEST' && (
              <>
                <Grid item xs={12}>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    <AlertTitle>Checks Studio - No Code UI Testing</AlertTitle>
                    Write test steps in plain English. Each step should be clear and specific.
                  </Alert>
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Browser Type</InputLabel>
                    <Select
                      value={formData.browserType}
                      label="Browser Type"
                      onChange={handleInputChange('browserType')}
                    >
                      <MenuItem value="chrome">Chrome</MenuItem>
                      <MenuItem value="firefox">Firefox</MenuItem>
                      <MenuItem value="safari">Safari</MenuItem>
                      <MenuItem value="edge">Edge</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Screen Size</InputLabel>
                    <Select
                      value={formData.screenSize}
                      label="Screen Size"
                      onChange={handleInputChange('screenSize')}
                    >
                      <MenuItem value="1920x1080">1920x1080 (Desktop)</MenuItem>
                      <MenuItem value="1366x768">1366x768 (Laptop)</MenuItem>
                      <MenuItem value="768x1024">768x1024 (Tablet)</MenuItem>
                      <MenuItem value="375x667">375x667 (Mobile)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PlaylistAdd />
                    Test Steps ({formData.testSteps.length})
                  </Typography>
                  
                  <TextField
                    fullWidth
                    label="Add Test Step"
                    value={newStepInput}
                    onChange={(e) => setNewStepInput(e.target.value)}
                    placeholder='e.g., "Go to https://example.com", "Click the Login button", "Wait for text Welcome to appear"'
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTestStep();
                      }
                    }}
                    InputProps={{
                      endAdornment: (
                        <Button size="small" onClick={handleAddTestStep} disabled={!newStepInput.trim()}>
                          Add Step
                        </Button>
                      ),
                    }}
                    sx={{ mb: 2 }}
                  />
                  
                  {formData.testSteps.length > 0 && (
                    <Paper variant="outlined" sx={{ p: 1 }}>
                      <List dense>
                        {formData.testSteps.map((step, index) => (
                          <ListItem key={index}>
                            <ListItemIcon>
                              <Avatar sx={{ width: 24, height: 24, fontSize: 12 }}>
                                {index + 1}
                              </Avatar>
                            </ListItemIcon>
                            <ListItemText primary={step} />
                            <IconButton
                              size="small"
                              onClick={() => handleRemoveTestStep(index)}
                              color="error"
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          </ListItem>
                        ))}
                      </List>
                    </Paper>
                  )}

                  {formData.testSteps.length === 0 && (
                    <Alert severity="info">
                      <Typography variant="body2">
                        Example steps:
                        <br />• "Go to https://www.citi.com"
                        <br />• "Click on Sign On button"
                        <br />• "Wait for User ID field to appear"
                        <br />• "Type 'testuser' in User ID field"
                        <br />• "Check that page title contains 'Login'"
                      </Typography>
                    </Alert>
                  )}
                </Grid>
              </>
            )}

            {!formData.checkType && (
              <Grid item xs={12}>
                <Alert severity="warning">
                  Please select a check type in the previous step to configure specific options.
                </Alert>
              </Grid>
            )}
          </Grid>
        );

      case 2:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Scheduling Configuration
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Check Frequency</InputLabel>
                <Select
                  value={formData.frequency}
                  label="Check Frequency"
                  onChange={handleInputChange('frequency')}
                >
                  {frequencies.map((freq) => (
                    <MenuItem key={freq.value} value={freq.value}>
                      {freq.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.enabled}
                    onChange={handleInputChange('enabled')}
                    color="primary"
                  />
                }
                label="Enable Check Immediately After Creation"
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Warning color="warning" />
                Alert Configuration
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.alertOnFailure}
                    onChange={handleInputChange('alertOnFailure')}
                    color="primary"
                  />
                }
                label="Send alerts when check fails"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Alert After N Consecutive Failures"
                value={formData.alertThreshold}
                onChange={handleInputChange('alertThreshold')}
                disabled={!formData.alertOnFailure}
                InputProps={{ inputProps: { min: 1, max: 10 } }}
                helperText="Prevents alert spam from transient failures"
              />
            </Grid>

            {formData.alertOnFailure && (
              <Grid item xs={12}>
                <Autocomplete
                  multiple
                  options={notificationChannels.map(channel => channel.value)}
                  value={formData.notificationChannels}
                  onChange={(_, newValue) => setFormData(prev => ({ ...prev, notificationChannels: newValue }))}
                  getOptionLabel={(option) => notificationChannels.find(ch => ch.value === option)?.label || option}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => {
                      const channel = notificationChannels.find(ch => ch.value === option);
                      return (
                        <Chip 
                          variant="outlined" 
                          label={channel?.label || option} 
                          {...getTagProps({ index })} 
                          key={option}
                        />
                      );
                    })
                  }
                  renderInput={(params) => (
                    <TextField 
                      {...params} 
                      label="Notification Channels" 
                      helperText="Select one or more channels to receive failure alerts"
                    />
                  )}
                />
              </Grid>
            )}

            <Grid item xs={12}>
              <Alert severity="info">
                <AlertTitle>Scheduling Notes</AlertTitle>
                <Typography variant="body2">
                  • Checks will run according to the selected frequency after creation
                  • You can pause/resume checks anytime from the Checks dashboard
                  • Failed checks will retry automatically based on your configuration
                  • All execution history and logs are preserved for analysis
                </Typography>
              </Alert>
            </Grid>
          </Grid>
        );

      case 3:
        const selectedCsi = csiEntities?.find(csi => csi.id === formData.csiId);
        const frequencyLabel = frequencies.find(f => f.value === formData.frequency)?.label;
        
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Alert severity="success" sx={{ mb: 3 }}>
                <AlertTitle>Ready to Create Check</AlertTitle>
                Review your configuration below. Once created, the check will be available in your dashboard.
              </Alert>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Info color="primary" />
                  Basic Information
                </Typography>
                <Stack spacing={1}>
                  <Typography><strong>Name:</strong> {formData.name || 'Not specified'}</Typography>
                  <Typography><strong>Type:</strong> {getSelectedCheckType()?.label}</Typography>
                  <Typography><strong>CSI Entity:</strong> {selectedCsi ? `${selectedCsi.id} - ${selectedCsi.name}` : 'Not selected'}</Typography>
                  <Typography><strong>Environment:</strong> {formData.environment || 'Not selected'}</Typography>
                  {formData.description && (
                    <Typography><strong>Description:</strong> {formData.description}</Typography>
                  )}
                  {formData.tags.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography component="span" sx={{ fontWeight: 'bold' }}>Tags:</Typography>
                      <Box sx={{ mt: 0.5 }}>
                        {formData.tags.map(tag => (
                          <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                        ))}
                      </Box>
                    </Box>
                  )}
                </Stack>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircle color="success" />
                  Scheduling & Alerts
                </Typography>
                <Stack spacing={1}>
                  <Typography><strong>Frequency:</strong> {frequencyLabel}</Typography>
                  <Typography><strong>Status:</strong> {formData.enabled ? 'Will start immediately' : 'Will remain disabled'}</Typography>
                  <Typography><strong>Alerts:</strong> {formData.alertOnFailure ? `After ${formData.alertThreshold} consecutive failures` : 'Disabled'}</Typography>
                  {formData.notificationChannels.length > 0 && (
                    <Typography><strong>Notification Channels:</strong> {formData.notificationChannels.map(ch => notificationChannels.find(c => c.value === ch)?.label).join(', ')}</Typography>
                  )}
                </Stack>
              </Paper>
            </Grid>

            {/* Configuration Details based on check type */}
            <Grid item xs={12}>
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  {getSelectedCheckType()?.label} Configuration
                </Typography>
                
                {formData.checkType === 'HTTP' && (
                  <Stack spacing={1}>
                    <Typography><strong>Endpoint:</strong> {formData.endpoint || 'Not specified'}</Typography>
                    <Typography><strong>Method:</strong> {formData.method}</Typography>
                    <Typography><strong>Expected Status:</strong> {formData.expectedStatus}</Typography>
                    <Typography><strong>Timeout:</strong> {formData.timeout} seconds</Typography>
                    <Typography><strong>Retries:</strong> {formData.retries}</Typography>
                    <Typography><strong>SSL Validation:</strong> {formData.validateSSL ? 'Enabled' : 'Disabled'}</Typography>
                    <Typography><strong>Follow Redirects:</strong> {formData.followRedirects ? 'Yes' : 'No'}</Typography>
                    {Object.keys(formData.headers).length > 0 && (
                      <Box>
                        <Typography sx={{ fontWeight: 'bold' }}>Headers:</Typography>
                        {Object.entries(formData.headers).map(([key, value]) => (
                          <Typography key={key} variant="body2" sx={{ ml: 2 }}>• {key}: {value}</Typography>
                        ))}
                      </Box>
                    )}
                  </Stack>
                )}

                {formData.checkType === 'TCP' && (
                  <Stack spacing={1}>
                    <Typography><strong>Host:</strong> {formData.host || 'Not specified'}</Typography>
                    <Typography><strong>Port:</strong> {formData.port}</Typography>
                    <Typography><strong>Timeout:</strong> {formData.timeout} seconds</Typography>
                  </Stack>
                )}

                {formData.checkType === 'SPLUNK' && (
                  <Stack spacing={1}>
                    <Typography><strong>Query:</strong></Typography>
                    <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.50' }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {formData.splunkQuery || 'Not specified'}
                      </Typography>
                    </Paper>
                    <Typography><strong>Index:</strong> {formData.splunkIndex || 'Default'}</Typography>
                    <Typography><strong>Time Range:</strong> {formData.timeRange}</Typography>
                    <Typography><strong>Expected Count:</strong> {formData.countOperator} {formData.expectedCount}</Typography>
                  </Stack>
                )}

                {formData.checkType === 'GRAFANA' && (
                  <Stack spacing={1}>
                    <Typography><strong>Dashboard:</strong> {formData.grafanaDashboard || 'Not specified'}</Typography>
                    <Typography><strong>Panel:</strong> {formData.grafanaPanel || 'Not specified'}</Typography>
                    <Typography><strong>Metric:</strong> {formData.metric || 'Not specified'}</Typography>
                    <Typography><strong>Threshold:</strong> {formData.thresholdOperator} {formData.threshold}</Typography>
                  </Stack>
                )}

                {formData.checkType === 'ITRS' && (
                  <Stack spacing={1}>
                    <Typography><strong>Sampler Path:</strong> {formData.itrsSampler || 'Not specified'}</Typography>
                    <Typography><strong>Expected Status:</strong> {formData.itrsExpectedStatus}</Typography>
                  </Stack>
                )}

                {formData.checkType === 'APPDYNAMICS' && (
                  <Stack spacing={1}>
                    <Typography><strong>Application:</strong> {formData.appDynamicsApp || 'Not specified'}</Typography>
                    <Typography><strong>Health Rule:</strong> {formData.healthRule || 'Not specified'}</Typography>
                  </Stack>
                )}

                {formData.checkType === 'UI_TEST' && (
                  <Stack spacing={1}>
                    <Typography><strong>Browser:</strong> {formData.browserType}</Typography>
                    <Typography><strong>Screen Size:</strong> {formData.screenSize}</Typography>
                    <Typography><strong>Test Steps:</strong> {formData.testSteps.length} steps defined</Typography>
                    {formData.testSteps.length > 0 && (
                      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Steps Preview:</Typography>
                        {formData.testSteps.slice(0, 3).map((step, index) => (
                          <Typography key={index} variant="body2">
                            {index + 1}. {step}
                          </Typography>
                        ))}
                        {formData.testSteps.length > 3 && (
                          <Typography variant="body2" color="text.secondary">
                            ... and {formData.testSteps.length - 3} more steps
                          </Typography>
                        )}
                      </Paper>
                    )}
                  </Stack>
                )}
              </Paper>
            </Grid>
          </Grid>
        );

      default:
        return 'Unknown step';
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AddIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          Create New Check
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Build comprehensive health checks for your applications and infrastructure using our multi-step wizard.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label, index) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Box sx={{ mb: 4 }}>
            {renderStepContent(activeStep)}
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
            <Button
              color="inherit"
              disabled={activeStep === 0}
              onClick={handleBack}
              startIcon={<BackIcon />}
              sx={{ mr: 1 }}
            >
              Back
            </Button>
            
            <Box sx={{ flex: '1 1 auto' }} />
            
            {activeStep < steps.length - 1 ? (
                          <Tooltip title="A check type must be selected to continue" arrow>
                            <span>
                              <Button 
                                variant="contained" 
                                onClick={handleNext}
                                endIcon={<NextIcon />}
                                disabled={activeStep === 0 && !formData.checkType}
                              >
                                Next
                              </Button>
                            </span>
                          </Tooltip>
            ) : (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button 
                  variant="outlined" 
                  startIcon={<PreviewIcon />}
                  onClick={() => console.log('Preview:', formData)}
                >
                  Preview
                </Button>
                <Tooltip title="Check Name, Type, and CSI Entity are required" arrow>
                  <span>
                    <Button 
                      variant="contained" 
                      color="success"
                      startIcon={<SaveIcon />}
                      onClick={handleCreateCheck}
                      disabled={!formData.name || !formData.checkType || !formData.csiId}
                    >
                      Create Check
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default CreateCheckPage;