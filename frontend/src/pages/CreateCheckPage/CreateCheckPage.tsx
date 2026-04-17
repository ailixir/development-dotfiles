import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Snackbar,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import {
  Add as AddIcon,
  Save as SaveIcon,
  
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
  Edit,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchCSIs } from '@store/slices/csiSlice';
import { createCheck } from '@store/slices/checksSlice';
import { addNotification } from '@/store/slices/uiSlice';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchCheckById } from '@/store/slices/checksSlice';
import { checksApi } from '@/services/api/checksApi';
import SecretInput from '@/components/studio/SecretInput';
import ScheduleEditor from '@/components/reports/ScheduleEditor';

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
  { value: '5m', label: 'Every 5 minutes' },
  { value: '15m', label: 'Every 15 minutes' },
  { value: '30m', label: 'Every 30 minutes' },
  { value: '1h', label: 'Hourly' },
  { value: '6h', label: 'Every 6 hours' },
  { value: '12h', label: 'Every 12 hours' },
  { value: '24h', label: 'Daily' },
  { value: '1w', label: 'Weekly' },
  { value: '1mo', label: 'Monthly' },
  { value: 'custom', label: 'Custom (cron…)'},
];

const notificationChannels = [
  { value: 'email', label: 'Email' },
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'webhook', label: 'Webhook' },
];

const steps = ['Basic Information', 'Check Configuration', 'Scheduling & Alerts', 'Review'];

const CreateCheckPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data: csiEntities, loading: csiLoading } = useAppSelector(state => state.csi);
  const { data: checksData } = useAppSelector(state => state.checks);
  const { id: editId } = useParams<{ id?: string }>();
  
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
  const saveTimeoutRef = useRef<number | null>(null);
  const [saveHint, setSaveHint] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [autosaveEnabled, setAutosaveEnabled] = useState<boolean>(true);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [availableUITests, setAvailableUITests] = useState<Array<{ id: string; name: string }>>([]);
  const [schedule, setSchedule] = useState<{ enabled: boolean; frequency: 'hourly'|'daily'|'weekly'|'monthly'|'custom'; time?: string; cron?: string; timezone?: string; daysOfWeek?: number[]; daysOfMonth?: number[] }>({ enabled: true, frequency: 'hourly', time: '09:00', cron: '', timezone: 'EST', daysOfWeek: [], daysOfMonth: [] });

  useEffect(() => {
    dispatch(fetchCSIs());
  }, [dispatch]);

  useEffect(() => {
    // Load Studio tests for selection if UI_TEST selected
    (async () => {
      try {
        if (formData.checkType === 'UI_TEST') {
          const studio = (await import('@/services/api/studioApi')).default;
          const res = (await studio.listTests({})) as any;
          const data = res?.data || res || [];
          setAvailableUITests(data.map((t: any) => ({ id: t.id, name: t.name })));
        }
      } catch {}
    })();
  }, [formData.checkType]);

  // When a UI test is selected, seed required variables if metadata available
  useEffect(() => {
    (async () => {
      try {
        if (formData.checkType === 'UI_TEST' && (formData as any).uiTestId) {
          const studio = (await import('@/services/api/studioApi')).default;
          const test = await studio.getTest((formData as any).uiTestId);
          const vars = (test as any).variables as Array<{ name: string; type: string; required?: boolean } | undefined>;
          if (Array.isArray(vars) && vars.length > 0) {
            setFormData((prev) => {
              const existing = (prev as any).uiVariables || {};
              const next = { ...existing } as Record<string, any>;
              for (const v of vars) {
                if (!v || !v.name) continue;
                const key = v.name.toUpperCase();
                if (next[key]) continue;
                if (v.type === 'secret') next[key] = { kind: 'secret', secretId: '' };
                else if (v.type === 'number') next[key] = { kind: 'number', value: '' };
                else if (v.type === 'boolean') next[key] = { kind: 'boolean', value: false };
                else next[key] = { kind: 'plain', value: '' };
              }
              return { ...prev, uiVariables: next } as any;
            });
          }
        }
      } catch {}
    })();
  }, [(formData as any).uiTestId, formData.checkType]);

  // Smart defaults: prefill env/tag from typical usage
  useEffect(() => {
    if (!formData.environment) {
      setFormData((p) => ({ ...p, environment: 'Production' }));
    }
  // one-time init
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave draft to localStorage
  useEffect(() => {
    if (!autosaveEnabled) return;
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    setSaveHint('saving');
    saveTimeoutRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem('checks:create:draft', JSON.stringify(formData));
        setSaveHint('saved');
        setTimeout(() => setSaveHint('idle'), 1200);
      } catch {}
    }, 400);
    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
  }, [formData, autosaveEnabled]);

  // Hydrate from draft (first mount)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('checks:create:draft');
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft && typeof draft === 'object') {
          setFormData((p) => ({ ...p, ...draft }));
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If editing, hydrate from existing check
  useEffect(() => {
    (async () => {
      if (!editId) return;
      try {
        const existing = checksData?.find((c) => c.id === editId);
        const check = existing || await dispatch(fetchCheckById(editId)).unwrap();
        if (!check) return;
        setFormData((p) => ({
          ...p,
          name: check.name || '',
          description: check.description || '',
          checkType: check.type || '',
          csiId: check.csiId || '',
          environment: (check as any).environment || p.environment,
          tags: check.tags || [],
          ...(check.type === 'HTTP' ? {
            endpoint: (check.configuration as any)?.url || (check.configuration as any)?.endpoint || '',
            method: (check.configuration as any)?.method || 'GET',
            expectedStatus: (check.configuration as any)?.expectedStatus || 200,
            timeout: Math.round(((check.configuration as any)?.timeout || 30000) / 1000),
            headers: (check.configuration as any)?.headers || {},
          } : {}),
          ...(check.type === 'TCP' ? {
            host: (check.configuration as any)?.host || '',
            port: (check.configuration as any)?.port || 80,
          } : {}),
          ...(check.type === 'SPLUNK' ? {
            splunkQuery: (check.configuration as any)?.query || '',
            timeRange: (check.configuration as any)?.timeRange || '15m',
            expectedCount: (check.configuration as any)?.expectedCount || 0,
            countOperator: (check.configuration as any)?.countOperator || '>',
            splunkIndex: (check.configuration as any)?.index || '',
          } : {}),
          ...(check.type === 'GRAFANA' ? {
            grafanaDashboard: (check.configuration as any)?.dashboard || (check.configuration as any)?.grafanaDashboard || '',
            grafanaPanel: (check.configuration as any)?.panel || (check.configuration as any)?.grafanaPanel || '',
            metric: (check.configuration as any)?.metric || '',
            threshold: (check.configuration as any)?.threshold || 0,
            thresholdOperator: (check.configuration as any)?.thresholdOperator || '>'
          } : {}),
          ...(check.type === 'ITRS' ? {
            itrsSampler: (check.configuration as any)?.sampler || (check.configuration as any)?.gateway || '',
            itrsExpectedStatus: (check.configuration as any)?.expectedStatus || 'OK',
          } : {}),
          ...(check.type === 'APPDYNAMICS' ? {
            appDynamicsApp: (check.configuration as any)?.application || '',
            healthRule: (check.configuration as any)?.healthRule || '',
          } : {}),
          ...(check.type === 'UI_TEST' ? {
            uiTestId: (check.configuration as any)?.uiTest?.testId || '',
            uiVariables: (check.configuration as any)?.uiTest?.variables || {},
            timeout: Math.round((((check.configuration as any)?.uiTest?.overrides || {})?.timeout || 30000) / 1000),
          } : {}),
          enabled: check.schedule?.enabled ?? true,
          frequency: (check.schedule as any)?.frequency || '5m',
          ...(check.schedule && (check.schedule as any).cron ? { cron: (check.schedule as any).cron } : {}),
        }));
      } catch {}
    })();
  }, [editId, checksData, dispatch]);

  // Notify if prefilled from template
  useEffect(() => {
    try {
      const raw = localStorage.getItem('checks:create:draft');
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft && draft.__fromTemplate && !snackbar.open) {
        setSnackbar({ open: true, message: `Prefilled from template: ${draft.__fromTemplate}` as any, severity: 'success' });
        delete draft.__fromTemplate;
        localStorage.setItem('checks:create:draft', JSON.stringify(draft));
      }
    } catch {}
  }, []);

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
          enabled: schedule.enabled,
          frequency: schedule.frequency,
          ...(schedule.time ? { time: schedule.time } : {}),
          ...(schedule.cron ? { cron: schedule.cron } : {}),
          ...(schedule.daysOfWeek && schedule.daysOfWeek.length ? { daysOfWeek: schedule.daysOfWeek } : {}),
          ...(schedule.daysOfMonth && schedule.daysOfMonth.length ? { daysOfMonth: schedule.daysOfMonth } : {}),
          timezone: schedule.timezone,
        },
        alerting: {
          enabled: formData.alertOnFailure,
          threshold: formData.alertThreshold,
          channels: formData.notificationChannels,
        },
      };

      await dispatch(createCheck(checkData as any)).unwrap();
      try { localStorage.removeItem('checks:create:draft'); } catch {}
      dispatch(addNotification({ type: 'success', title: 'Create', message: 'Check created successfully' }));
      navigate('/checks/all');
    } catch (error) {
      console.error('Failed to create check:', error);
      setSnackbar({ open: true, message: 'Failed to create check', severity: 'error' });
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
          uiTest: {
            testId: (formData as any).uiTestId || '',
            variables: (formData as any).uiVariables || {},
            overrides: {
              ...(formData.timeout ? { timeout: formData.timeout * 1000 } : {}),
            },
          },
        };
      default:
        return {};
    }
  };

  const getSelectedCheckType = () => checkTypes.find(type => type.value === formData.checkType);

  // Validation helpers
  const step0Valid = useMemo(() => {
    return Boolean(formData.checkType && formData.name.trim() && formData.csiId);
  }, [formData.checkType, formData.name, formData.csiId]);

  const step1Valid = useMemo(() => {
    switch (formData.checkType) {
      case 'HTTP':
        return Boolean(formData.endpoint && /^https?:\/\//i.test(formData.endpoint));
      case 'TCP':
        return Boolean(formData.host && Number(formData.port) > 0);
      case 'SPLUNK':
        return Boolean(formData.splunkQuery && formData.timeRange);
      case 'GRAFANA':
        return Boolean(formData.grafanaDashboard && formData.grafanaPanel && formData.metric);
      case 'ITRS':
        return Boolean(formData.itrsSampler && formData.itrsExpectedStatus);
      case 'APPDYNAMICS':
        return Boolean(formData.appDynamicsApp && formData.healthRule);
      case 'UI_TEST':
        return Boolean((formData as any).uiTestId && typeof (formData as any).uiTestId === 'string');
      default:
        return false;
    }
  }, [formData]);

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Grid container spacing={3}>
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

            
          </Grid>
        );

      case 1:
        const selectedType = getSelectedCheckType();
        return (
          <Grid container spacing={3}>
            {/* Check Type banner removed per request */}

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
                {/* Banner removed per request */}

                {/* Removed browser and screen size controls as they are not required here */}

                <Grid item xs={12} md={8}>
                  <FormControl fullWidth required>
                    <InputLabel>Studio Test</InputLabel>
                    <Select
                      value={(formData as any).uiTestId || ''}
                      label="Studio Test"
                      onChange={(e) => setFormData((p) => ({ ...p, uiTestId: e.target.value }))}
                    >
                      {availableUITests.map((t) => (
                        <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Optional overrides removed per request */}

                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Variables (Parameters)</Typography>
                  <Paper variant="outlined" sx={{ p: 1 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ width: 220 }}>Name</TableCell>
                          <TableCell sx={{ width: 160 }}>Type</TableCell>
                          <TableCell>Value / Secret</TableCell>
                          <TableCell align="right" sx={{ width: 80 }}>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {Object.entries(((formData as any).uiVariables || {}) as Record<string, any>).map(([name, v]: any) => (
                          <TableRow key={name} hover>
                            <TableCell>
                              <TextField size="small" fullWidth label="Name" value={name} disabled />
                            </TableCell>
                            <TableCell>
                              <FormControl size="small" fullWidth>
                                <Select value={v?.kind || 'plain'} onChange={(e) => {
                                  setFormData((p) => ({ ...p, uiVariables: { ...(p as any).uiVariables, [name]: { ...(v || {}), kind: e.target.value } } }));
                                }}>
                                  <MenuItem value="plain">Plain</MenuItem>
                                  <MenuItem value="number">Number</MenuItem>
                                  <MenuItem value="boolean">Boolean</MenuItem>
                                  <MenuItem value="secret">Secret</MenuItem>
                                </Select>
                              </FormControl>
                            </TableCell>
                            <TableCell>
                              {v?.kind === 'secret' ? (
                                <SecretInput label="Select secret" value={v?.secretId ? { id: v.secretId } : null} onChange={(ref) => {
                                  setFormData((p) => ({ ...p, uiVariables: { ...(p as any).uiVariables, [name]: { ...(v || {}), secretId: ref?.id } } }));
                                }} />
                              ) : (
                                <TextField size="small" fullWidth label="Value" value={v?.value ?? ''} onChange={(e) => {
                                  setFormData((p) => ({ ...p, uiVariables: { ...(p as any).uiVariables, [name]: { ...(v || {}), value: e.target.value } } }));
                                }} />
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <IconButton size="small" onClick={() => {
                                const next = { ...(formData as any).uiVariables };
                                delete (next as any)[name];
                                setFormData((p) => ({ ...p, uiVariables: next }));
                              }}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell colSpan={4}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <TextField size="small" label="New variable name" value={headerKey} onChange={(e) => setHeaderKey(e.target.value)} sx={{ maxWidth: 240 }} />
                              <Button size="small" disabled={!headerKey.trim()} onClick={() => {
                                const name = headerKey.trim().toUpperCase();
                                setHeaderKey('');
                                setFormData((p) => ({ ...p, uiVariables: { ...(p as any).uiVariables, [name]: { kind: 'plain', value: '' } } }));
                              }}>Add variable</Button>
                              <Typography variant="caption" color="text.secondary">Use in Studio steps as &lt;var NAME&gt; or &lt;secret SECRET_ID&gt;</Typography>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </Paper>
                </Grid>
                <Grid item xs={12}>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" onClick={async () => {
                      try {
                        const studio = (await import('@/services/api/studioApi')).default;
                        const testId = (formData as any).uiTestId;
                        if (!testId) return;
                        const vars = (formData as any).uiVariables || {};
                        const res = await studio.validateVariables(testId, vars);
                        const ok = (res as any).isValid !== false;
                        setSnackbar({ open: true, message: ok ? 'Variables look good' : `Missing: ${(res as any).missing?.join(', ')}`, severity: ok ? 'success' : 'error' });
                      } catch {
                        setSnackbar({ open: true, message: 'Validation failed', severity: 'error' });
                      }
                    }}>Validate variables</Button>
                  </Stack>
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

            <Grid item xs={12} md={8}>
              <ScheduleEditor
                enabled={schedule.enabled}
                frequency={schedule.frequency}
                time={schedule.time}
                cron={schedule.cron}
                timezone={schedule.timezone}
                daysOfWeek={schedule.daysOfWeek}
                daysOfMonth={schedule.daysOfMonth}
                onChange={(n) => setSchedule((s) => ({
                  ...s,
                  enabled: typeof n.enabled === 'boolean' ? n.enabled : s.enabled,
                  frequency: (n.frequency as any) || s.frequency,
                  time: n.time || s.time,
                  cron: n.cron || s.cron,
                  timezone: n.timezone || s.timezone,
                  daysOfWeek: (n as any).daysOfWeek || s.daysOfWeek,
                  daysOfMonth: (n as any).daysOfMonth || s.daysOfMonth,
                }))}
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
                  • Checks will run according to the selected frequency after creation<br />
                  • You can pause/resume checks anytime from the Checks dashboard<br />
                  • Failed checks will retry automatically based on your configuration<br />
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
              <Alert severity="success" sx={{ mb: 2 }}>
                <AlertTitle>{editId ? 'Review & Update' : 'Review & Create'}</AlertTitle>
                Double-check details below. Use Edit actions to jump back to a section.
              </Alert>
            </Grid>

            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Basic Info</Typography>
                  <Button size="small" startIcon={<Edit fontSize="small" />} onClick={() => setActiveStep(0)}>Edit</Button>
                </Stack>
                <List dense>
                  <ListItem disableGutters>
                    <ListItemText primary="Name" secondary={formData.name || 'Not specified'} />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="Type" secondary={getSelectedCheckType()?.label || '—'} />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="CSI" secondary={selectedCsi ? `${selectedCsi.id} - ${selectedCsi.name}` : 'Not selected'} />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="Environment" secondary={formData.environment || 'Not selected'} />
                  </ListItem>
                  {formData.description && (
                    <ListItem disableGutters>
                      <ListItemText primary="Description" secondary={formData.description} />
                    </ListItem>
                  )}
                  {formData.tags.length > 0 && (
                    <ListItem disableGutters>
                      <ListItemText primary="Tags" secondary={formData.tags.join(', ')} />
                    </ListItem>
                  )}
                </List>
              </Paper>
            </Grid>

            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Configuration</Typography>
                  <Button size="small" startIcon={<Edit fontSize="small" />} onClick={() => setActiveStep(1)}>Edit</Button>
                </Stack>

                {formData.checkType === 'HTTP' && (
                  <List dense>
                    <ListItem disableGutters><ListItemText primary="Endpoint" secondary={formData.endpoint || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Method" secondary={formData.method} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Expected Status" secondary={formData.expectedStatus} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Timeout" secondary={`${formData.timeout}s`} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Retries" secondary={formData.retries} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="SSL Validation" secondary={formData.validateSSL ? 'Enabled' : 'Disabled'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Follow Redirects" secondary={formData.followRedirects ? 'Yes' : 'No'} /></ListItem>
                  </List>
                )}

                {formData.checkType === 'TCP' && (
                  <List dense>
                    <ListItem disableGutters><ListItemText primary="Host" secondary={formData.host || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Port" secondary={formData.port} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Timeout" secondary={`${formData.timeout}s`} /></ListItem>
                  </List>
                )}

                {formData.checkType === 'SPLUNK' && (
                  <>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Query</Typography>
                    <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.50', mb: 1 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{formData.splunkQuery || '—'}</Typography>
                    </Paper>
                    <List dense>
                      <ListItem disableGutters><ListItemText primary="Index" secondary={formData.splunkIndex || 'Default'} /></ListItem>
                      <ListItem disableGutters><ListItemText primary="Time Range" secondary={formData.timeRange} /></ListItem>
                      <ListItem disableGutters><ListItemText primary="Expected Count" secondary={`${formData.countOperator} ${formData.expectedCount}`} /></ListItem>
                    </List>
                  </>
                )}

                {formData.checkType === 'GRAFANA' && (
                  <List dense>
                    <ListItem disableGutters><ListItemText primary="Dashboard" secondary={formData.grafanaDashboard || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Panel" secondary={formData.grafanaPanel || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Metric" secondary={formData.metric || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Threshold" secondary={`${formData.thresholdOperator} ${formData.threshold}`} /></ListItem>
                  </List>
                )}

                {formData.checkType === 'ITRS' && (
                  <List dense>
                    <ListItem disableGutters><ListItemText primary="Sampler Path" secondary={formData.itrsSampler || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Expected Status" secondary={formData.itrsExpectedStatus} /></ListItem>
                  </List>
                )}

                {formData.checkType === 'APPDYNAMICS' && (
                  <List dense>
                    <ListItem disableGutters><ListItemText primary="Application" secondary={formData.appDynamicsApp || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Health Rule" secondary={formData.healthRule || '—'} /></ListItem>
                  </List>
                )}

                {formData.checkType === 'UI_TEST' && (
                  <>
                    <List dense>
                      <ListItem disableGutters><ListItemText primary="Studio Test" secondary={(() => {
                        const t = availableUITests.find((t) => t.id === (formData as any).uiTestId);
                        return t?.name || (formData as any).uiTestId || 'Not selected';
                      })()} /></ListItem>
                      {formData.timeout && (
                        <ListItem disableGutters><ListItemText primary="Timeout override" secondary={`${formData.timeout}s`} /></ListItem>
                      )}
                    </List>
                    {Object.keys(((formData as any).uiVariables || {})).length > 0 && (
                      <>
                        <Typography variant="body2" sx={{ fontWeight: 600, mt: 1 }}>Variables</Typography>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ width: 220 }}>Name</TableCell>
                              <TableCell sx={{ width: 140 }}>Type</TableCell>
                              <TableCell>Value</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {Object.entries(((formData as any).uiVariables || {}) as Record<string, any>).map(([name, v]) => (
                              <TableRow key={name}>
                                <TableCell>{name}</TableCell>
                                <TableCell>{v?.kind || 'plain'}</TableCell>
                                <TableCell>{v?.kind === 'secret' ? (v?.secretId ? `••••${String(v.secretId).slice(-4)}` : '—') : (String(v?.value ?? ''))}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </>
                    )}
                  </>
                )}
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Scheduling & Alerts</Typography>
                  <Button size="small" startIcon={<Edit fontSize="small" />} onClick={() => setActiveStep(2)}>Edit</Button>
                </Stack>
                <List dense>
                  <ListItem disableGutters>
                    <ListItemText primary="Frequency" secondary={frequencyLabel} />
                  </ListItem>
                  {formData.frequency === '1w' && (
                    <ListItem disableGutters>
                      <ListItemText primary="Day of Week" secondary={(formData as any).dayOfWeek?.toUpperCase() || 'MON'} />
                    </ListItem>
                  )}
                  {formData.frequency === '1mo' && (
                    <ListItem disableGutters>
                      <ListItemText primary="Day of Month" secondary={(formData as any).dayOfMonth ?? 1} />
                    </ListItem>
                  )}
                  {formData.frequency === 'custom' && (
                    <ListItem disableGutters>
                      <ListItemText primary="Cron" secondary={(formData as any).cron || '—'} />
                    </ListItem>
                  )}
                  <ListItem disableGutters>
                    <ListItemText primary="Enabled" secondary={formData.enabled ? 'Yes' : 'No'} />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="Alerts" secondary={formData.alertOnFailure ? `After ${formData.alertThreshold} consecutive failures` : 'Disabled'} />
                  </ListItem>
                  {formData.notificationChannels.length > 0 && (
                    <ListItem disableGutters>
                      <ListItemText primary="Channels" secondary={formData.notificationChannels.map(ch => notificationChannels.find(c => c.value === ch)?.label).join(', ')} />
                    </ListItem>
                  )}
                </List>
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
          {editId ? (
            <>
              <Edit sx={{ fontSize: 32, color: 'primary.main' }} />
              Edit Check{formData.name ? `: ${formData.name}` : ''}
            </>
          ) : (
            <>
              <AddIcon sx={{ fontSize: 32, color: 'primary.main' }} />
              Create Check
            </>
          )}
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="body1" color="text.secondary">
            Build comprehensive health checks for your applications and infrastructure using our multi-step wizard.
          </Typography>
          <Typography variant="caption" color={saveHint === 'saving' ? 'text.secondary' : 'success.main'}>
            {saveHint === 'saving' ? 'Saving draft…' : saveHint === 'saved' ? 'Draft saved' : ''}
          </Typography>
          <FormControlLabel
            sx={{ ml: 2 }}
            control={<Switch checked={autosaveEnabled} onChange={(e) => setAutosaveEnabled(e.target.checked)} />}
            label="Autosave"
          />
        </Stack>
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
            {/* Inline validation hints */}
            {activeStep === 0 && !step0Valid && (
              <Alert severity="warning" sx={{ mt: 2 }}>Name, Type, and CSI are required.</Alert>
            )}
            {activeStep === 1 && !step1Valid && (
              <Alert severity="warning" sx={{ mt: 2 }}>Please complete the required configuration for the selected type.</Alert>
            )}
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
                                disabled={(activeStep === 0 && !step0Valid) || (activeStep === 1 && !step1Valid)}
                              >
                                Next
                              </Button>
                            </span>
                          </Tooltip>
            ) : (
              <Box sx={{ display: 'flex', gap: 1 }}>
                  {/* Preview button removed per request */}
                <Tooltip title="Check Name, Type, and CSI Entity are required" arrow>
                  <span>
                    <Button 
                      variant="contained" 
                      color="success"
                      startIcon={<SaveIcon />}
                      onClick={async () => {
                        if (!step0Valid || !step1Valid) return;
                        try {
                          if (editId) {
                            const checkData: any = {
                              name: formData.name,
                              description: formData.description,
                              type: formData.checkType,
                              csiId: formData.csiId,
                              environment: formData.environment,
                              tags: formData.tags,
                              configuration: getConfigurationForCheckType(),
                              schedule: {
                                enabled: schedule.enabled,
                                frequency: schedule.frequency,
                                ...(schedule.time ? { time: schedule.time } : {}),
                                ...(schedule.cron ? { cron: schedule.cron } : {}),
                                ...(schedule.daysOfWeek && schedule.daysOfWeek.length ? { daysOfWeek: schedule.daysOfWeek } : {}),
                                ...(schedule.daysOfMonth && schedule.daysOfMonth.length ? { daysOfMonth: schedule.daysOfMonth } : {}),
                                timezone: schedule.timezone,
                              },
                              alerting: {
                                enabled: formData.alertOnFailure,
                                threshold: formData.alertThreshold,
                                channels: formData.notificationChannels,
                              },
                            };
                            await checksApi.updateCheck(editId, checkData);
                            dispatch(addNotification({ type: 'success', title: 'Update', message: 'Check updated successfully' }));
                            navigate(`/checks/details/${editId}`);
                          } else {
                            await handleCreateCheck();
                          }
                        } catch (e) {
                          setSnackbar({ open: true, message: 'Failed to save check', severity: 'error' });
                        }
                      }}
                      disabled={!step0Valid || !step1Valid}
                    >
                      {editId ? 'Update Check' : 'Create Check'}
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default CreateCheckPage;