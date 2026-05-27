import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Button,
  Stepper,
  Step,
  StepLabel,
  Grid,
  Chip,
  Autocomplete,
  Card,
  CardContent,
  Alert,
  AlertTitle,
  Paper,
  Stack,
  Snackbar,
  Fade,
  Typography,
  Divider,
  useTheme,
} from '@mui/material';
import {
  Save as SaveIcon,
  NavigateNext as NextIcon,
  NavigateBefore as BackIcon,
  PlayArrow,
  CheckCircleOutline,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchCSIs } from '@store/slices/csiSlice';
import { createCheck, updateCheck, fetchCheckById } from '@store/slices/checksSlice';
import { addNotification } from '@/store/slices/uiSlice';
import { useNavigate, useParams } from 'react-router-dom';
import WizardHeader from '@/components/checks/wizard/WizardHeader';
import CheckTypeSelector from '@/components/checks/wizard/CheckTypeSelector';
import { HttpConfig, TcpConfig, SplunkConfig, GrafanaConfig, ItrsConfig, AppDynamicsConfig, UiTestConfig } from '@/components/checks/wizard/configs';
import ReviewStep from '@/components/checks/wizard/ReviewStep';
import ScheduleEditor from '@/components/reports/ScheduleEditor';
import { parseCron, frequencyToCron } from '@/utils/cronNextRun';
import { schedulesApi } from '@/services/api/schedulesApi';

const WIZARD_FREQUENCIES = new Set(['hourly', 'daily', 'weekly', 'monthly', 'custom']);

const normalizeFrequency = (raw: string): 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom' => {
  const lower = raw.toLowerCase();
  if (WIZARD_FREQUENCIES.has(lower)) return lower as any;
  return 'custom';
};

const ValidIcon: React.FC<{ valid: boolean }> = ({ valid }) => valid ? <CheckCircleOutline sx={{ color: 'success.main', fontSize: 18, ml: 0.5 }} /> : null;

const environments = ['Development', 'Staging', 'Production', 'UAT'];

const steps = ['Basic Information', 'Check Configuration', 'Scheduling', 'Review'];

const CreateCheckPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data: csiEntities, loading: csiLoading } = useAppSelector(state => state.csi);
  const { data: checksData } = useAppSelector(state => state.checks);
  const { id: editId } = useParams<{ id?: string }>();

  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    name: '', description: '', checkType: '', csiId: '', environment: '', tags: [] as string[],
    endpoint: '', method: 'GET', expectedStatus: 200, timeout: 30, validateSSL: true, followRedirects: true, headers: {} as Record<string, string>,
    host: '', port: 80,
    splunkQuery: '', splunkIndex: '', timeRange: '15m', expectedCount: 0, countOperator: '>',
    grafanaDashboard: '', grafanaPanel: '', metric: '', threshold: 0, thresholdOperator: '<',
    itrsSampler: '', itrsExpectedStatus: 'OK',
    appDynamicsApp: '', healthRule: '',
    testSteps: [] as string[], browserType: 'chrome', screenSize: '1920x1080',
    frequency: '5m', enabled: true,
  });

  const [tagInput, setTagInput] = useState('');
  const saveTimeoutRef = useRef<number | null>(null);
  const [saveHint, setSaveHint] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [availableUITests, setAvailableUITests] = useState<Array<{ id: string; name: string }>>([]);
  const [schedule, setSchedule] = useState<{ enabled: boolean; frequency: 'hourly'|'daily'|'weekly'|'monthly'|'custom'; time?: string; cron?: string; timezone?: string; daysOfWeek?: number[]; daysOfMonth?: number[] }>({ enabled: true, frequency: 'hourly', time: '09:00', cron: '', timezone: 'EST', daysOfWeek: [], daysOfMonth: [] });

  useEffect(() => { dispatch(fetchCSIs()); }, [dispatch]);

  useEffect(() => {
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

  useEffect(() => {
    (async () => {
      try {
        if (formData.checkType === 'UI_TEST' && (formData as any).uiTestId) {
          const studio = (await import('@/services/api/studioApi')).default;
          const test = await studio.getTest((formData as any).uiTestId);
          const vars = (test as any).variables as Array<{ name: string; type: string } | undefined>;
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!formData.environment) setFormData((p) => ({ ...p, environment: 'Production' })); }, []);

  useEffect(() => {
    if (!autosaveEnabled) return;
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    setSaveHint('saving');
    saveTimeoutRef.current = window.setTimeout(() => {
      try { localStorage.setItem('checks:create:draft', JSON.stringify(formData)); setSaveHint('saved'); setTimeout(() => setSaveHint('idle'), 1200); } catch {}
    }, 400);
    return () => { if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current); };
  }, [formData, autosaveEnabled]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { try { const raw = localStorage.getItem('checks:create:draft'); if (raw) { const d = JSON.parse(raw); if (d && typeof d === 'object') setFormData((p) => ({ ...p, ...d })); } } catch {} }, []);

  useEffect(() => {
    (async () => {
      if (!editId) return;
      try {
        const existing = checksData?.find((c) => c.id === editId);
        const check = existing || await dispatch(fetchCheckById(editId)).unwrap();
        if (!check) return;
        setFormData((p) => ({
          ...p, name: check.name || '', description: check.description || '', checkType: check.type || '', csiId: check.csiId || '', environment: (check as any).environment || p.environment, tags: check.tags || [],
          ...(check.type === 'HTTP' ? { endpoint: (check.configuration as any)?.url || '', method: (check.configuration as any)?.method || 'GET', expectedStatus: (check.configuration as any)?.expectedStatusCode ?? 200, timeout: Math.round(((check.configuration as any)?.timeoutMs || 30000) / 1000), validateSSL: (check.configuration as any)?.verifyTls ?? true, followRedirects: (check.configuration as any)?.followRedirects ?? true, headers: (check.configuration as any)?.headers || {} } : {}),
          ...(check.type === 'TCP' ? { host: (check.configuration as any)?.host || '', port: (check.configuration as any)?.port || 80, timeout: Math.round(((check.configuration as any)?.timeoutMs || 5000) / 1000) } : {}),
          ...(check.type === 'SPLUNK' ? { splunkQuery: (check.configuration as any)?.query || '', timeRange: (check.configuration as any)?.timeRange || '15m', expectedCount: (check.configuration as any)?.expectedCount || 0, countOperator: (check.configuration as any)?.countOperator || '>', splunkIndex: (check.configuration as any)?.index || '' } : {}),
          ...(check.type === 'GRAFANA' ? { grafanaDashboard: (check.configuration as any)?.dashboard || (check.configuration as any)?.grafanaDashboard || '', grafanaPanel: (check.configuration as any)?.panel || (check.configuration as any)?.grafanaPanel || '', metric: (check.configuration as any)?.metric || '', threshold: (check.configuration as any)?.threshold || 0, thresholdOperator: (check.configuration as any)?.thresholdOperator || '<' } : {}),
          ...(check.type === 'ITRS' ? { itrsSampler: (check.configuration as any)?.sampler || (check.configuration as any)?.gateway || '', itrsExpectedStatus: (check.configuration as any)?.expectedStatus || 'OK' } : {}),
          ...(check.type === 'APPDYNAMICS' ? { appDynamicsApp: (check.configuration as any)?.application || '', healthRule: (check.configuration as any)?.healthRule || '' } : {}),
          ...(check.type === 'UI_TEST' ? { uiTestId: (check.configuration as any)?.uiTest?.testId || '', uiVariables: (check.configuration as any)?.uiTest?.variables || {}, timeout: Math.round((((check.configuration as any)?.uiTest?.overrides || {})?.timeout || 30000) / 1000) } : {}),
          enabled: check.schedule?.enabled ?? true,
          ...(check.schedule && (check.schedule as any).cron ? { cron: (check.schedule as any).cron } : {}),
        }));
        if (check.schedule) {
          const s = check.schedule as any;
          const freq = normalizeFrequency(s.frequency || '');
          setSchedule((prev) => ({
            ...prev,
            enabled: s.enabled ?? prev.enabled,
            frequency: freq,
            cron: s.cron || '',
            timezone: s.timezone || prev.timezone,
            ...(s.time ? { time: s.time } : {}),
            ...(s.daysOfWeek?.length ? { daysOfWeek: s.daysOfWeek } : {}),
            ...(s.daysOfMonth?.length ? { daysOfMonth: s.daysOfMonth } : {}),
          }));
        }
      } catch {}
    })();
  }, [editId, checksData, dispatch]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { try { const raw = localStorage.getItem('checks:create:draft'); if (!raw) return; const d = JSON.parse(raw); if (d && d.__fromTemplate && !snackbar.open) { setSnackbar({ open: true, message: `Prefilled from template: ${d.__fromTemplate}`, severity: 'success' }); delete d.__fromTemplate; localStorage.setItem('checks:create:draft', JSON.stringify(d)); } } catch {} }, []);

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleInputChange = (field: string) => (event: any) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }));
      setTagInput('');
    }
  };

  const getConfigurationForCheckType = () => {
    switch (formData.checkType) {
      case 'HTTP': return { type: 'HTTP', url: formData.endpoint, method: formData.method || 'GET', expectedStatusCode: formData.expectedStatus ?? 200, timeoutMs: (formData.timeout ?? 30) * 1000, verifyTls: formData.validateSSL ?? true, followRedirects: formData.followRedirects ?? true, headers: formData.headers || {} };
      case 'TCP': return { type: 'TCP', host: formData.host, port: Number(formData.port), timeoutMs: (formData.timeout ?? 5) * 1000 };
      case 'SPLUNK': return { type: 'SPLUNK', query: formData.splunkQuery, index: formData.splunkIndex, timeRange: formData.timeRange, expectedCount: formData.expectedCount, countOperator: formData.countOperator };
      case 'GRAFANA': return { type: 'GRAFANA', dashboard: formData.grafanaDashboard, panel: formData.grafanaPanel, metric: formData.metric, threshold: formData.threshold, thresholdOperator: formData.thresholdOperator };
      case 'ITRS': return { type: 'ITRS', sampler: formData.itrsSampler, expectedStatus: formData.itrsExpectedStatus };
      case 'APPDYNAMICS': return { type: 'APPDYNAMICS', application: formData.appDynamicsApp, healthRule: formData.healthRule };
      case 'UI_TEST': return { type: 'UI_TEST', uiTest: { testId: (formData as any).uiTestId || '', variables: (formData as any).uiVariables || {}, overrides: { ...(formData.timeout ? { timeout: formData.timeout * 1000 } : {}) } } };
      default: return {};
    }
  };

  const buildTestConnectionPayload = (): Record<string, unknown> | null => {
    switch (formData.checkType) {
      case 'HTTP': return { type: 'HTTP', url: formData.endpoint, method: formData.method || 'GET', expectedStatusCode: formData.expectedStatus ?? 200, timeoutMs: (formData.timeout ?? 30) * 1000, verifyTls: formData.validateSSL ?? true, followRedirects: formData.followRedirects ?? true, headers: formData.headers || {} };
      case 'TCP': return { type: 'TCP', host: formData.host, port: Number(formData.port), timeoutMs: (formData.timeout ?? 5) * 1000 };
      default: return null;
    }
  };

  const buildCheckPayload = () => ({
    name: formData.name, description: formData.description, type: formData.checkType, csiId: formData.csiId, environment: formData.environment, tags: formData.tags,
    configuration: getConfigurationForCheckType(),
    schedule: { enabled: schedule.enabled, frequency: schedule.frequency, ...(schedule.time ? { time: schedule.time } : {}), ...(schedule.cron ? { cron: schedule.cron } : {}), ...(schedule.daysOfWeek?.length ? { daysOfWeek: schedule.daysOfWeek } : {}), ...(schedule.daysOfMonth?.length ? { daysOfMonth: schedule.daysOfMonth } : {}), timezone: schedule.timezone },
  });

  const buildSchedulePayload = (checkId: string) => ({
    checkId,
    frequency: schedule.frequency,
    cronExpression: frequencyToCron(schedule.frequency, { time: schedule.time, daysOfWeek: schedule.daysOfWeek, daysOfMonth: schedule.daysOfMonth, cron: schedule.cron }),
    timezone: schedule.timezone || 'America/New_York',
    enabled: schedule.enabled,
  });

  const handleSave = async () => {
    if (!step0Valid || !step1Valid || !step2Valid) return;
    try {
      if (editId) {
        await dispatch(updateCheck({ id: editId, data: buildCheckPayload() as any })).unwrap();
        try {
          const existing = await schedulesApi.list({ checkId: editId, limit: 1 });
          const current = existing.data?.[0];
          if (current) {
            await schedulesApi.update(current.id, buildSchedulePayload(editId));
          } else {
            await schedulesApi.create(buildSchedulePayload(editId));
          }
        } catch {}
        dispatch(addNotification({ type: 'success', title: 'Update', message: 'Check updated successfully' }));
        navigate(`/checks/details/${editId}`);
      } else {
        const created = await dispatch(createCheck(buildCheckPayload() as any)).unwrap();
        try { localStorage.removeItem('checks:create:draft'); } catch {}
        try {
          await schedulesApi.create(buildSchedulePayload(created.id));
        } catch {}
        dispatch(addNotification({ type: 'success', title: 'Create', message: 'Check created successfully' }));
        navigate(`/checks/details/${created.id}`);
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to save check', severity: 'error' });
    }
  };

  const step0Valid = useMemo(() => Boolean(formData.checkType && formData.name.trim() && formData.csiId), [formData.checkType, formData.name, formData.csiId]);

  const step1Valid = useMemo(() => {
    switch (formData.checkType) {
      case 'HTTP': return Boolean(formData.endpoint && /^https?:\/\//i.test(formData.endpoint));
      case 'TCP': return Boolean(formData.host && Number(formData.port) > 0);
      case 'SPLUNK': return Boolean(formData.splunkQuery && formData.timeRange);
      case 'GRAFANA': return Boolean(formData.grafanaDashboard && formData.grafanaPanel && formData.metric);
      case 'ITRS': return Boolean(formData.itrsSampler && formData.itrsExpectedStatus);
      case 'APPDYNAMICS': return Boolean(formData.appDynamicsApp && formData.healthRule);
      case 'UI_TEST': return Boolean((formData as any).uiTestId && typeof (formData as any).uiTestId === 'string');
      default: return false;
    }
  }, [formData]);

  const step2Valid = useMemo(() => {
    if (!schedule.enabled) return true;
    if (schedule.frequency === 'custom') return parseCron(schedule.cron || '') !== null;
    return true;
  }, [schedule.enabled, schedule.frequency, schedule.cron]);

  const renderConfigForm = () => {
    const props = { formData, onChange: handleFieldChange };
    switch (formData.checkType) {
      case 'HTTP': return <HttpConfig {...props} />;
      case 'TCP': return <TcpConfig {...props} />;
      case 'SPLUNK': return <SplunkConfig {...props} />;
      case 'GRAFANA': return <GrafanaConfig {...props} />;
      case 'ITRS': return <ItrsConfig {...props} />;
      case 'APPDYNAMICS': return <AppDynamicsConfig {...props} />;
      case 'UI_TEST': return (
        <UiTestConfig {...props} availableTests={availableUITests} onValidateVariables={async () => {
          try {
            const studio = (await import('@/services/api/studioApi')).default;
            const testId = (formData as any).uiTestId;
            if (!testId) return;
            const res = await studio.validateVariables(testId, (formData as any).uiVariables || {});
            const ok = (res as any).isValid !== false;
            setSnackbar({ open: true, message: ok ? 'Variables look good' : `Missing: ${(res as any).missing?.join(', ')}`, severity: ok ? 'success' : 'error' });
          } catch { setSnackbar({ open: true, message: 'Validation failed', severity: 'error' }); }
        }} />
      );
      default: return <Alert severity="warning">Please select a check type in Step 1 to configure.</Alert>;
    }
  };

  const renderStep = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>What are you monitoring?</Typography>
            <CheckTypeSelector selectedType={formData.checkType} onSelect={(value) => handleFieldChange('checkType', value)} />

            <Fade in={Boolean(formData.checkType)} timeout={200}>
              <Box sx={{ mt: 3 }}>
                {formData.checkType && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Basic Information</Typography>
                    <Grid container spacing={3}>
                      <Grid item xs={12}>
                        <Stack direction="row" alignItems="center">
                          <TextField fullWidth label="Check Name" value={formData.name} onChange={handleInputChange('name')} placeholder="e.g., Trading API Health Check" required />
                          <ValidIcon valid={Boolean(formData.name.trim())} />
                        </Stack>
                      </Grid>
                      <Grid item xs={12}>
                        <TextField fullWidth multiline rows={2} label="Description" value={formData.description} onChange={handleInputChange('description')} placeholder="Describe what this check monitors and its business purpose" />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Stack direction="row" alignItems="center">
                          <Autocomplete
                            fullWidth
                            options={csiEntities || []}
                            loading={csiLoading === 'loading'}
                            getOptionLabel={(option) => `${option.id} - ${option.name}`}
                            value={csiEntities?.find(csi => csi.id === formData.csiId) || null}
                            onChange={(_, v) => handleFieldChange('csiId', v?.id || '')}
                            renderInput={(params) => <TextField {...params} label="CSI Entity" required />}
                          />
                          <ValidIcon valid={Boolean(formData.csiId)} />
                        </Stack>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth required>
                          <InputLabel>Environment</InputLabel>
                          <Select value={formData.environment} label="Environment" onChange={handleInputChange('environment')}>
                            {environments.map((env) => <MenuItem key={env} value={env}>{env}</MenuItem>)}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth label="Add Tags" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Type tag and press Enter"
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                          InputProps={{ endAdornment: <Button size="small" onClick={handleAddTag} disabled={!tagInput.trim()}>Add</Button> }}
                        />
                        {formData.tags.length > 0 && (
                          <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {formData.tags.map((tag) => <Chip key={tag} label={tag} onDelete={() => handleFieldChange('tags', formData.tags.filter(t => t !== tag))} size="small" color="primary" variant="outlined" />)}
                          </Box>
                        )}
                      </Grid>
                    </Grid>
                  </>
                )}
              </Box>
            </Fade>
          </Box>
        );

      case 1:
        return renderConfigForm();

      case 2:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Scheduling Configuration</Typography>
            </Grid>
            <Grid item xs={12} md={8}>
              <ScheduleEditor
                enabled={schedule.enabled} frequency={schedule.frequency} time={schedule.time} cron={schedule.cron} timezone={schedule.timezone} daysOfWeek={schedule.daysOfWeek} daysOfMonth={schedule.daysOfMonth}
                onChange={(n) => setSchedule((s) => ({ ...s, enabled: typeof n.enabled === 'boolean' ? n.enabled : s.enabled, frequency: (n.frequency as any) || s.frequency, time: n.time ?? s.time, cron: typeof n.cron === 'string' ? n.cron : s.cron, timezone: n.timezone || s.timezone, daysOfWeek: (n as any).daysOfWeek || s.daysOfWeek, daysOfMonth: (n as any).daysOfMonth || s.daysOfMonth }))}
              />
            </Grid>
            <Grid item xs={12}>
              <Alert severity="info">
                <AlertTitle>Scheduling Notes</AlertTitle>
                <Typography variant="body2">
                  Checks run on the selected frequency after creation. You can pause/resume anytime from the dashboard. Failed checks retry automatically. All execution history is preserved.
                </Typography>
              </Alert>
            </Grid>
          </Grid>
        );

      case 3:
        return (
          <ReviewStep
            formData={formData} schedule={schedule} csiEntities={csiEntities} availableUITests={availableUITests} editId={editId}
            onEditStep={(s) => setActiveStep(s)}
          />
        );

      default: return null;
    }
  };

  return (
    <Box>
      <WizardHeader editId={editId} checkName={formData.name} saveHint={saveHint} autosaveEnabled={autosaveEnabled} onAutosaveChange={setAutosaveEnabled} />

      <Card>
        <CardContent>
          <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
            {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
          </Stepper>

          <Fade in key={activeStep} timeout={200}>
            <Box sx={{ mb: 4 }}>
              {renderStep(activeStep)}
              {activeStep === 0 && !step0Valid && formData.checkType && (
                <Alert severity="warning" sx={{ mt: 2 }}>Name, Type, and CSI are required.</Alert>
              )}
              {activeStep === 1 && !step1Valid && (
                <Alert severity="warning" sx={{ mt: 2 }}>Please complete the required configuration for the selected type.</Alert>
              )}
            </Box>
          </Fade>

          <Box sx={{ display: 'flex', pt: 2 }}>
            <Button color="inherit" disabled={activeStep === 0} onClick={() => setActiveStep(s => s - 1)} startIcon={<BackIcon />} sx={{ mr: 1 }}>
              Back
            </Button>
            <Box sx={{ flex: '1 1 auto' }} />
            {activeStep < steps.length - 1 ? (
              <Button variant="contained" onClick={() => setActiveStep(s => s + 1)} endIcon={<NextIcon />} disabled={(activeStep === 0 && !step0Valid) || (activeStep === 1 && !step1Valid) || (activeStep === 2 && !step2Valid)}>
                Next
              </Button>
            ) : (
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" startIcon={<PlayArrow />} disabled={!step0Valid || !step1Valid || !buildTestConnectionPayload()} onClick={async () => {
                  const payload = buildTestConnectionPayload();
                  if (!payload) { setSnackbar({ open: true, message: `Test Connection is only available for HTTP and TCP checks`, severity: 'error' }); return; }
                  try {
                    const res = await fetch('/api/v1/checks/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    const text = await res.text();
                    let data: any = {};
                    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
                    if (res.ok && data.status === 'SUCCESS') {
                      setSnackbar({ open: true, message: `Test passed — ${data.durationMs != null ? `${data.durationMs}ms` : 'OK'}`, severity: 'success' });
                    } else {
                      setSnackbar({ open: true, message: `Test failed: ${data.error || data.message || 'Unknown error'}`, severity: 'error' });
                    }
                  } catch { setSnackbar({ open: true, message: 'Test failed — could not reach backend', severity: 'error' }); }
                }}>
                  Test Now
                </Button>
                <Button variant="contained" color="success" startIcon={<SaveIcon />} onClick={handleSave} disabled={!step0Valid || !step1Valid || !step2Valid}>
                  {editId ? 'Update Check' : 'Create Check'}
                </Button>
              </Stack>
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
