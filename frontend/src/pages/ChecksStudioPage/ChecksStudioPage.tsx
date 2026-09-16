import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Snackbar,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Skeleton,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import {
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
  Schedule,
  AutoMode,
  ListAlt,
  PlaylistAdd,
  Clear,
  Refresh,
  ExpandMore,
  KeyboardArrowUp,
  KeyboardArrowDown,
  HelpOutline,
} from '@mui/icons-material';
import CodeTab from '@/components/studio/CodeTab';
import OnboardingCoach from '@/components/studio/OnboardingCoach';
import { useDispatch } from 'react-redux';
import { useAppSelector } from '@/store';
import { selectIsSourceEnabled } from '@store/slices/sourcesSlice';
import { selectIsFeatureEnabled } from '@store/slices/featuresSlice';
import { setExecutionLogs, setAllStepResults, setExecuting, setCurrentStep as setCurrentStepAction, setVideoUrl as setVideoUrlAction, clearLogs, updateConfiguration } from '@store/slices/studioSlice';
import {
  defaultConfiguration,
  isTerminalExecutionStatus,
  type ExecutionSnapshot,
  type TestRequest,
} from '@/types/studio/studioTypes';
import studioApi from '@/services/api/studioApi';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import SecretInput from '@/components/studio/SecretInput';
import { CompileReviewPanel } from '@/components/studio/review';
import { ExecutionProgressView, RunControl } from '@/components/studio/run';

type Scenario = {
  id: string;
  name: string;
  description: string;
  csiId: string;
  steps: string[];
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | string;
  createdAt?: string;
  updatedAt?: string;
  configuration?: any;
};

const StudioUnavailable: React.FC = () => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', textAlign: 'center', p: 4 }}>
    <Typography variant="h5" gutterBottom>Checks Studio</Typography>
    <Typography variant="body1" color="text.secondary">Checks Studio is not available in this environment.</Typography>
  </Box>
);

const ChecksStudioPageInner: React.FC = () => {
  const theme = useTheme();
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [scenariosLoading, setScenariosLoading] = useState<boolean>(true);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const isRunning = useAppSelector((s: any) => s.studio.isExecuting);
  const currentStep = Math.max(0, useAppSelector((s: any) => s.studio.currentStep));
  const [testSteps, setTestSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState('');
  const [showNewScenarioDialog, setShowNewScenarioDialog] = useState(false);
  const reduxLogs = useAppSelector((s: any) => s.studio.executionLogs);
  const executionLogs = useMemo(() => (reduxLogs || []).map((l: any) => ({
    timestamp: new Date(l.timestamp).toLocaleTimeString(),
    message: l.message,
    type: l.level === 'error' ? 'error' : 'info',
  })), [reduxLogs]);
  const showVideoPlayer = !!useAppSelector((s: any) => s.studio.videoUrl);
  const videoUrl = useAppSelector((s: any) => s.studio.videoUrl);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stepResultsArr = useAppSelector((s: any) => s.studio.stepResults) as Array<{ stepIndex: number; status: 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL' }>;
  const stepResultsMap = useMemo(() => {
    const map: Record<number, 'passed' | 'failed' | 'pending'> = {};
    (stepResultsArr || []).forEach((r) => {
      map[r.stepIndex] = r.status === 'PASS' ? 'passed' : r.status === 'FAIL' ? 'failed' : 'pending';
    });
    return map;
  }, [stepResultsArr]);
  const [isSaving, setIsSaving] = useState(false);
  /** The last snapshot the API returned, rendered by `ExecutionProgressView` (AC-18, AC-19). */
  const [snapshot, setSnapshot] = useState<ExecutionSnapshot | null>(null);
  /** Programmatic run requests: `?autorun=1` and the terminal-error surface's re-run. */
  const [runRequest, setRunRequest] = useState(0);
  const [autosave, setAutosave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveSnack, setSaveSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [helpOpen, setHelpOpen] = useState(false);
  // Removed legacy interval-based simulator in favor of API polling
  const [validation,
    setValidation] = useState<{ results: Array<{ stepIndex: number; isValid: boolean; suggestion: string | null }>; isValid: boolean; loading: boolean; error?: string }>
    ({ results: [], isValid: true, loading: false });
  const config = useAppSelector((s: any) => s.studio.testConfiguration);
  const [variablesList, setVariablesList] = useState<Array<{ id: string; name: string; type: 'plain' | 'secret'; value?: string; secretId?: string }>>([]);
  const [rightTab, setRightTab] = useState(0);
  const [coachStep, setCoachStep] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('studio:coachStep');
      return saved ? Number(saved) : 0;
    } catch { return 0; }
  });
  const [forceCoach, setForceCoach] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [variablesOpen, setVariablesOpen] = useState(false);

  // Subtle auto-advance for onboarding
  useEffect(() => {
    if (!forceCoach && coachStep === 0 && testSteps.length > 0) setCoachStep(1);
  }, [forceCoach, coachStep, testSteps.length]);
  useEffect(() => {
    if (coachStep === 1 && isRunning) setCoachStep(2);
  }, [coachStep, isRunning]);
  useEffect(() => {
    if (coachStep === 2 && !isRunning && (stepResultsArr || []).length > 0) setCoachStep(99);
  }, [coachStep, isRunning, stepResultsArr]);
  const [newScenarioForm, setNewScenarioForm] = useState({
    name: '',
    environment: 'Development',
    csiId: '',
    description: ''
  });
  
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const selectedScenarioData = scenarios?.find(s => s.id === selectedScenario) || null;
  const dispatch = useDispatch();
  
  // Calculate metrics (simple derived)
  const totalScenarios = scenarios?.length || 0;
  const passedScenarios = 0;
  const failedScenarios = 0;
  const successRate = totalScenarios ? Math.round((passedScenarios / totalScenarios) * 100) : 0;

  // Load scenarios from API (MSW-backed)
  useEffect(() => {
    let mounted = true;
    (async () => {
      setScenariosLoading(true);
      setScenariosError(null);
      try {
        const res = (await studioApi.listTests()) as any;
        if (!mounted) return;
        const list = res.data || res;
        setScenarios(list);
        const urlId = params.id;
        const query = new URLSearchParams(location.search);
        const autorun = query.get('autorun') === '1';
        let chosen = list?.[0];
        if (urlId) {
          const byId = list?.find((t: any) => t.id === urlId);
          if (byId) chosen = byId;
        }
        if (chosen) {
          setSelectedScenario(chosen.id);
          setTestSteps(chosen.steps || []);
          if (autorun) {
            // Routed through `RunControl`, so the deep link is governed by the same server
            // readiness predicate as the button and cannot start a run the server would refuse.
            setRunRequest((token) => token + 1);
          }
        }
      } catch (e: any) {
        if (!mounted) return;
        setScenariosError(e?.message || 'Failed to load scenarios');
      } finally {
        if (mounted) setScenariosLoading(false);
      }
    })();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadScenarios = useCallback(async () => {
    setScenariosLoading(true);
    setScenariosError(null);
    try {
      const res = (await studioApi.listTests()) as any;
      const list = res.data || res;
      setScenarios(list);
    } catch (e: any) {
      setScenariosError(e?.message || 'Failed to load scenarios');
    } finally {
      setScenariosLoading(false);
    }
  }, []);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentExecutionIdRef = useRef<string | null>(null);
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  /**
   * Story 10.11a — the page no longer decides whether a run may start.
   *
   * `RunControl` owns the gate (`compileStatus === 'READY'`, read from `GET /tests/{id}`) and owns
   * the `POST /tests/{id}/execute`. What is left here is what happens **after** the server has
   * accepted a run, and the 700 ms interval below is explicitly **not** this story's to remove —
   * AC-8 belongs to story 10.11b, which replaces it with the streaming transport. Leaving it in
   * place and leaving it visible is the honest state between the two halves.
   */
  const beginRun = useCallback((executionId: string) => {
    dispatch(setExecuting(true));
    dispatch(setCurrentStepAction(0));
    dispatch(setVideoUrlAction(null as any));
    dispatch(clearLogs());
    dispatch(setExecutionLogs([{ timestamp: new Date().toISOString(), level: 'info', message: 'Starting UI test execution' } as any]));
    setSnapshot(null);
    currentExecutionIdRef.current = executionId;
    stopPolling();
    {
      pollingRef.current = setInterval(async () => {
        try {
          const exec = (await studioApi.getExecution(currentExecutionIdRef.current as string)) as any;
          setSnapshot(exec as ExecutionSnapshot);
          if (Array.isArray(exec.stepResults)) {
            dispatch(setAllStepResults(exec.stepResults.map((r: any) => ({ stepIndex: r.stepIndex, status: r.status }))));
          }
          const runningIndex = exec.stepResults?.findIndex((r: any) => r.status === 'RUNNING') ?? -1;
          const passedCount = exec.stepResults?.filter((r: any) => r.status === 'PASS').length ?? 0;
          dispatch(setCurrentStepAction(runningIndex >= 0 ? runningIndex : Math.max(0, passedCount - 1)));
          // logs
          if (Array.isArray(exec.logs)) {
            dispatch(setExecutionLogs(exec.logs as any));
          }
          // videoPath is the protected API path; the pre-10.1 raw videoUrl is read only so that
          // history written before the contract still plays back.
          const videoSource = exec.videoPath ?? exec.videoUrl;
          if (videoSource) {
            dispatch(setVideoUrlAction(videoSource));
          }
          // Terminal statuses are PASSED | FAILED | ERROR; a timeout is ERROR with a code. The two
          // legacy values are still accepted so old rows stop the poller instead of hanging it.
          if (isTerminalExecutionStatus(exec.status) || exec.status === 'COMPLETED' || exec.status === 'TIMEOUT') {
            dispatch(setExecuting(false));
            stopPolling();
          }
        } catch (e) {
          // stop on polling error
          dispatch(setExecuting(false));
          stopPolling();
        }
      }, 700);
    }
  }, [stopPolling, dispatch]);

  /*
   * Story 10.11a, AC-3(a): the client-side Python regeneration that used to run here on every
   * step change is gone. PRD §5.3 retires Python export from the Studio plan and architecture
   * §8.3 retires client generation as an authoritative path; §4.4 makes the server's artifact the
   * only executable truth. The effect is removed rather than disabled, because a disabled effect
   * is one flag away from being a live one again.
   */

  // Hydrate steps from localStorage (once)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('studio:steps');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every((s: any) => typeof s === 'string')) {
          // Avoid redundant state updates
          if (JSON.stringify(parsed) !== JSON.stringify(testSteps)) {
            setTestSteps(parsed as string[]);
          }
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist steps to localStorage
  useEffect(() => {
    localStorage.setItem('studio:steps', JSON.stringify(testSteps));
  }, [testSteps]);
  useEffect(() => {
    try { localStorage.setItem('studio:coachStep', String(coachStep)); } catch {}
  }, [coachStep]);

  // Debounced validation on steps change
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        setValidation((v) => ({ ...v, loading: true, error: undefined }));
        const res = await studioApi.validateSteps(testSteps);
        if (!cancelled) setValidation({ results: res.results, isValid: res.isValid, loading: false });
      } catch (err: any) {
        if (!cancelled) setValidation({ results: [], isValid: false, loading: false, error: err?.message || 'Validation failed' });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [testSteps]);

  const handleScenarioSelect = (scenarioId: string) => {
    stopPolling();
    dispatch(setExecuting(false));
    setSelectedScenario(scenarioId);
    const scenario = scenarios?.find(s => s.id === scenarioId);
    if (scenario) {
      setTestSteps(scenario.steps || []);
      dispatch(setVideoUrlAction(null as any));
      dispatch(setCurrentStepAction(0));
      dispatch(setAllStepResults([] as any));
      dispatch(clearLogs());
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle sx={{ fontSize: 14 }} />;
      case 'RUNNING':
        return <CircularProgress size={14} />;
      case 'FAILED':
        return <Error sx={{ fontSize: 14 }} />;
      default:
        return <Schedule sx={{ fontSize: 14 }} />;
    }
  };

  const handleStepClick = (stepIndex: number) => {
    if (showVideoPlayer && !isRunning) {
      // Simulate jumping to step timestamp in video
      const t = stepIndex * 10;
      setVideoCurrentTime(t);
      try { videoRef.current && (videoRef.current.currentTime = t); } catch {}
      dispatch(setCurrentStepAction(stepIndex));
    }
  };

  /**
   * A draft, expressed in the frozen contract's own shape (story 10.11a, AC-3a).
   *
   * This used to go through `buildDefaultTestIR` — the legacy English-grammar parser — and then
   * back out through `toTestRequest`. The parser's output was never read on this path: every
   * caller overrode `steps` with the author's own lines, so the parse was work whose only result
   * was that this module imported the retired grammar path. `legacyTestIr`'s own comment says the
   * editor builds a `TestIR` only *"while the grammar and Python paths are retired by 10.11"*.
   * They are retired here. The module and its parser are **not deleted** — that is a separate
   * change with separate callers to check — they are simply no longer on this page's path.
   */
  const draftRequest = useCallback(
    (overrides: Partial<TestRequest> & { name: string }): TestRequest => ({
      name: overrides.name,
      description: overrides.description ?? null,
      csiId: overrides.csiId ?? null,
      environment: overrides.environment ?? 'Development',
      steps: overrides.steps ?? [],
      variables: overrides.variables ?? [],
      configuration: overrides.configuration ?? defaultConfiguration(),
      sourceRevision: null,
      configurationRevision: null,
    }),
    [],
  );

  const handleCreateNewScenario = async () => {
    try {
      const created = await studioApi.createTest(
        draftRequest({
          name: newScenarioForm.name || 'Untitled Test',
          csiId: newScenarioForm.csiId,
          description: newScenarioForm.description,
          environment: newScenarioForm.environment,
        }),
      );
      setSaveSnack({ open: true, message: 'Scenario created', severity: 'success' });
      setShowNewScenarioDialog(false);
      setNewScenarioForm({ name: '', environment: 'Development', csiId: '', description: '' });
      // reload and select new scenario if id present
      await reloadScenarios();
      if ((created as any).id) {
        setSelectedScenario((created as any).id);
        setTestSteps((created as any).steps || []);
      }
    } catch (e: any) {
      setSaveSnack({ open: true, message: e?.message || 'Failed to create scenario', severity: 'error' });
    }
  };

  const addTestStep = () => {
    if (newStep.trim()) {
      // Stop any ongoing polling before mutating steps
      stopPolling();
      dispatch(setExecuting(false));
      setTestSteps(prev => [...prev, newStep]);
      setNewStep('');
    }
  };

  const removeTestStep = (index: number) => {
    stopPolling();
    dispatch(setExecuting(false));
    setTestSteps(prev => prev.filter((_, i) => i !== index));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'success';
      case 'RUNNING': return 'info';
      case 'FAILED': return 'error';
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
                  Scope-aware UI tests. Your current CSI/tag scope is applied across the module.
                </Typography>
              </Box>
            </Box>
          </Box>
          <Stack direction="row" spacing={2}>
            {/* New Scenario moved to Studio Tests page (+) */}
            
            <Button
              variant="text"
              size="small"
              onClick={() => setTemplatesOpen(true)}
            >
              Templates
            </Button>
            <Tooltip title="Show guide">
              <IconButton
                size="small"
                onClick={() => {
                  setForceCoach(true);
                  setCoachStep(0);
                  try { localStorage.removeItem('studio:coachStep'); } catch {}
                }}
                aria-label="Show guide"
              >
                <HelpOutline />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {/* Removed status banner per request */}
      </Box>

      {/* Two-Panel Interface (Proof as a tab in the middle panel) */}
      <Grid container spacing={3} sx={{ minHeight: '600px' }}>
        {/* Left Panel - Test Scenarios & Steps */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<ListAlt sx={{ color: 'primary.main' }} />}
              title="Steps"
              subheader="Your testing checklist"
            />
            <CardContent sx={{ flex: 1, overflow: 'auto', p: 0 }}>
              {/* Current Test Summary */}
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                {scenariosLoading ? (
                  <Typography variant="body2" color="text.secondary">Loading test…</Typography>
                ) : selectedScenarioData ? (
                  <Stack spacing={0.5}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{selectedScenarioData.name}</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={(selectedScenarioData.status || 'DRAFT').charAt(0) + (selectedScenarioData.status || 'DRAFT').slice(1).toLowerCase()} size="small" color={getStatusColor(selectedScenarioData.status || '') as any} icon={getStatusIcon(selectedScenarioData.status || '')} sx={{ fontSize: 11 }} />
                        <Button size="small" variant="text" onClick={() => { window.location.href = '/checks/studio/tests'; }}>Change…</Button>
                      </Stack>
                    </Stack>
                    {selectedScenarioData.description && (
                      <Typography variant="caption" color="text.secondary">{selectedScenarioData.description}</Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">Updated: {new Date(selectedScenarioData.updatedAt || selectedScenarioData.createdAt || Date.now()).toLocaleString()}</Typography>
                  </Stack>
                ) : (
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="body2">No test selected.</Typography>
                    <Button size="small" variant="contained" onClick={() => { window.location.href = '/checks/studio/tests'; }}>Open Tests</Button>
                  </Stack>
                )}
              </Box>

              {/* Test Steps */}
              <Box sx={{ p: 2 }}>
                {/* Onboarding coach - Step 0 */}
                {/* Lightweight onboarding to guide the flow */}
                {/* Persisted via localStorage */}
                {coachStep === 0 && (
                  <OnboardingCoach step={0} onNext={() => setCoachStep(1)} onDismiss={() => setCoachStep(99)} />
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Test Steps ({testSteps.length})
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button size="small" variant="outlined" onClick={() => setVariablesOpen(true)}>Variables</Button>
                    <Badge badgeContent={isRunning ? `${currentStep + 1}/${testSteps.length}` : null} color="primary">
                      <PlaylistAdd sx={{ color: 'text.secondary' }} />
                    </Badge>
                  </Stack>
                </Box>

                 {testSteps.length === 0 && !scenariosLoading && (
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="body2" fontWeight={600}>Add your first step</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Examples: Go to "https://put.internal.citi.com" <br />• Click "Sign On" <br />• Type "&lt;var USERNAME&gt;" in the "User ID" field <br />• Wait for "Welcome" (use tokens: &lt;var NAME&gt;, &lt;secret SECRET_ID&gt;)
                    </Typography>
                  </Paper>
                )}
                  {scenariosLoading && (
                    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                      <Typography variant="body2">Loading scenarios…</Typography>
                    </Paper>
                  )}
                  {scenariosError && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      <AlertTitle>Failed to load scenarios</AlertTitle>
                      {scenariosError}
                    </Alert>
                  )}

                <List dense>
                  {testSteps.map((step, index) => {
                    const stepResult = stepResultsMap[index];
                    const isCurrentStep = index === currentStep;
                    const isPastStep = index < currentStep;
                    const isClickable = showVideoPlayer && !isRunning;
                    const validationEntry = validation.results.find((r) => r.stepIndex === index);
                    const isInvalid = validationEntry ? !validationEntry.isValid : false;
                    
                    return (
                      <ListItem
                        key={index}
                        sx={{
                          border: '1px solid',
                          borderColor: isInvalid ? 'error.main' : isCurrentStep && isRunning ? 'primary.main' : 
                                       stepResult === 'passed' ? 'success.main' :
                                       stepResult === 'failed' ? 'error.main' : 'divider',
                          borderRadius: 1,
                          mb: 1,
                          bgcolor: isCurrentStep && isRunning ? alpha(theme.palette.primary.main, 0.08) : 
                                   stepResult === 'passed' ? alpha(theme.palette.success.main, 0.05) :
                                   stepResult === 'failed' ? alpha(theme.palette.error.main, 0.05) : isInvalid ? alpha(theme.palette.error.main, 0.03) : 'transparent',
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
                          sx={{ pr: 12 }}
                          primary={
                            <TextField
                              variant="standard"
                              fullWidth
                              value={step}
                              onChange={(e) => {
                                const next = [...testSteps];
                                next[index] = e.target.value;
                                setTestSteps(next);
                              }}
                              onBlur={() => {
                                // Optional: trigger validation/save on blur
                              }}
                              InputProps={{
                                disableUnderline: false,
                                sx: {
                                  fontSize: '0.875rem',
                                  fontWeight: isCurrentStep && isRunning ? 600 : 400,
                                  color: stepResult === 'passed' ? 'success.main' :
                                         stepResult === 'failed' ? 'error.main' : isInvalid ? 'error.main' :
                                         isCurrentStep ? 'primary.main' : 'text.primary',
                                }
                              }}
                            />
                          }
                          secondary={isInvalid ? (validationEntry?.suggestion || 'Invalid step') : isClickable ? 'Click to jump to this step in video' : undefined}
                          secondaryTypographyProps={{
                            variant: 'caption',
                            sx: { color: 'text.secondary' }
                          }}
                        />
                        <ListItemSecondaryAction>
                          <Tooltip title="Move up">
                            <span>
                              <IconButton size="small" disabled={index === 0} onClick={(e) => {
                                e.stopPropagation();
                                const next = [...testSteps];
                                const [moved] = next.splice(index, 1);
                                next.splice(index - 1, 0, moved);
                                setTestSteps(next);
                              }}>
                                <KeyboardArrowUp fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Move down">
                            <span>
                              <IconButton size="small" disabled={index === testSteps.length - 1} onClick={(e) => {
                                e.stopPropagation();
                                const next = [...testSteps];
                                const [moved] = next.splice(index, 1);
                                next.splice(index + 1, 0, moved);
                                setTestSteps(next);
                              }}>
                                <KeyboardArrowDown fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Remove step">
                            <span>
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
                            </span>
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
                  {!validation.isValid && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      {validation.results.filter((r) => !r.isValid).length} step(s) this editor does not
                      recognise. This is a hint while you write; whether the draft can run is the
                      server&apos;s decision and is shown on the Run control.
                    </Typography>
                  )}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Middle Panel - Control Tower (Run, Logs, Code, Proof) */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<Settings sx={{ color: 'warning.main' }} />}
              title="Control Tower"
              subheader="Test execution & monitoring"
              action={
                <Stack direction="row" spacing={1}>
                  <Tooltip title="Reload scenarios">
                    <span>
                      <IconButton size="small" onClick={reloadScenarios} disabled={scenariosLoading} aria-label="Reload scenarios">
                        <Refresh />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              }
            />
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
              {/* Control Buttons */}
              <Box sx={{ mb: 3 }}>
                {coachStep === 1 && (
                  <OnboardingCoach step={1} onNext={() => setCoachStep(2)} onDismiss={() => setCoachStep(99)} />)
                }
                <Stack direction="row" spacing={2} justifyContent="center">
                   {null}
                  <RunControl
                    testId={selectedScenarioData?.id ?? null}
                    isRunning={isRunning}
                    hasSteps={testSteps.length > 0}
                    runRequest={runRequest}
                    onAccepted={beginRun}
                    onStop={() => {
                      dispatch(setExecuting(false));
                      stopPolling();
                    }}
                  />
                  <Button
                    variant="outlined"
                    startIcon={<Save />}
                    disabled={isRunning || isSaving}
                    onClick={async () => {
                      try {
                        setIsSaving(true);
                        await studioApi.createTest(
                          draftRequest({
                            name: selectedScenarioData?.name || 'Untitled Test',
                            csiId: selectedScenarioData?.csiId || 'CSI-00000',
                            steps: testSteps,
                          }),
                        );
                        setSaveSnack({ open: true, message: 'Scenario saved', severity: 'success' });
                      } catch (e: any) {
                        setSaveSnack({ open: true, message: e?.message || 'Failed to save', severity: 'error' });
                      } finally {
                        setIsSaving(false);
                      }
                    }}
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

              {/*
                Story 10.10 — review and confirmation, in the Control Tower beside Run (PRD §5.2).
                A fourth right-panel tab would put the review behind Proof, where a reader reaches
                Run without having passed it. The prop surface is one draft id on purpose: 10.11
                rewrites this file's transport and should not have to rewrite the review panel.
              */}
              {selectedScenarioData?.id && (
                <Box sx={{ mb: 2 }}>
                  <CompileReviewPanel testId={selectedScenarioData.id} />
                </Box>
              )}

              <Divider sx={{ mb: 2 }} />

              <Tabs value={rightTab} onChange={(_, v) => setRightTab(v)} sx={{ mb: 1 }}>
                <Tab label="Logs" />
                <Tab label="Code" />
                <Tab label="Proof" />
              </Tabs>

              {/* Execution Logs */}
              <Box sx={{ flex: 1, display: rightTab === 0 ? 'block' : 'none' }}>
                {coachStep === 2 && (
                  <OnboardingCoach step={2} onNext={() => setCoachStep(99)} onDismiss={() => setCoachStep(99)} />
                )}
                {/*
                  Story 10.11a — what the snapshot says, rendered without turning a bounded report
                  into a false one: step timings exactly as they arrive (AC-19), the retained-log
                  bound stated (AC-18), and a terminal `ERROR` that names what happened to the
                  browser and who can clear it (AC-6). The snapshot is a prop, so story 10.11b
                  substitutes the transport above this without touching the renderer.
                */}
                <Box sx={{ mb: 2 }}>
                  <ExecutionProgressView
                    snapshot={snapshot}
                    onRerun={() => setRunRequest((token) => token + 1)}
                  />
                </Box>

                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Code sx={{ fontSize: 18 }} />
                  Live Execution Logs
                </Typography>
                
                <Paper 
                  variant="outlined" 
                  sx={{ 
                    height: 480, 
                    overflow: 'auto', 
                    bgcolor: 'grey.900',
                    color: 'white',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    p: 1
                  }}
                >
                  {validation.loading && (
                    <Box sx={{ mb: 0.5, color: 'info.light' }}>Validating steps…</Box>
                  )}
                  {validation.error && (
                    <Box sx={{ mb: 0.5, color: 'error.light' }}>Validation error: {validation.error}</Box>
                  )}
                   {executionLogs.map((log: { timestamp: string; message: string; type: 'info' | 'error' | 'success' }, index: number) => (
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
                  {executionLogs.length === 0 && !isRunning && !validation.loading && (
                    <Box sx={{ color: 'grey.400' }}>No logs yet. Run the test to see live output.</Box>
                  )}
                </Paper>
              </Box>

              {/* Code Tab */}
               <Box sx={{ mt: 2, display: rightTab === 1 ? 'block' : 'none' }}>
                <CodeTab />
              </Box>

              {/* Proof Tab */}
              <Box sx={{ mt: 2, display: rightTab === 2 ? 'block' : 'none' }}>
                <Paper 
                  variant="outlined" 
                  sx={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.900', color: 'white', position: 'relative', overflow: 'hidden' }}
                >
                  {isRunning && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.light' }}>
                      <CircularProgress size={16} sx={{ color: 'primary.light' }} />
                      <Typography variant="body2">Recording…</Typography>
                    </Box>
                  )}
                  {!isRunning && showVideoPlayer ? (
                    <video 
                      ref={videoRef}
                      src={videoUrl || '/assets/videos/sample-ui-test.mp4'} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      controls 
                      preload="metadata"
                      onTimeUpdate={(e) => setVideoCurrentTime((e.target as HTMLVideoElement).currentTime)}
                    />
                  ) : null}
                  {!isRunning && !showVideoPlayer && (
                    <Typography variant="body2" color="grey.300">Visual proof will appear after run</Typography>
                  )}
                </Paper>
              </Box>

              {/* Variables inline panel removed in favor of Variables dialog */}
            </CardContent>
          </Card>
        </Grid>

        {/* Right Panel removed: Proof is integrated as a tab */}
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
                  placeholder="123456"
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
                  <br />• "Go to https://put.internal.citi.com"
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

      <Snackbar
        open={saveSnack.open}
        autoHideDuration={2500}
        onClose={() => setSaveSnack((s) => ({ ...s, open: false }))}
        message={saveSnack.message}
      />

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Keyboard Shortcuts</DialogTitle>
        <DialogContent>
          <Stack spacing={1} mt={1}>
            <Typography variant="body2">Cmd/Ctrl+S — Save draft locally</Typography>
            <Typography variant="body2">R — Run test</Typography>
            <Typography variant="body2">. — Stop run</Typography>
            <Typography variant="body2">? — Open this help</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Variables Dialog */}
      <Dialog open={variablesOpen} onClose={() => setVariablesOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Variables</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Configure variables referenced in your steps using &lt;var NAME&gt; or &lt;secret SECRET_ID&gt;.
          </Typography>
          <Paper variant="outlined" sx={{ p: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 180 }}>Name</TableCell>
                  <TableCell sx={{ width: 140 }}>Type</TableCell>
                  <TableCell>Value / Secret</TableCell>
                  <TableCell align="right" sx={{ width: 80 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {variablesList.map((v, i) => (
                  <TableRow key={v.id} hover>
                    <TableCell>
                      <TextField size="small" value={v.name} onChange={(e) => {
                        const next = [...variablesList];
                        next[i] = { ...v, name: e.target.value.toUpperCase() };
                        setVariablesList(next);
                      }} placeholder="USERNAME" fullWidth />
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" fullWidth>
                        <Select value={v.type} onChange={(e) => {
                          const next = [...variablesList];
                          next[i] = { ...v, type: e.target.value as 'plain' | 'secret' };
                          setVariablesList(next);
                        }}>
                          <MenuItem value="plain">Plain</MenuItem>
                          <MenuItem value="secret">Secret</MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell>
                      {v.type === 'plain' ? (
                        <TextField size="small" value={v.value || ''} onChange={(e) => {
                          const next = [...variablesList];
                          next[i] = { ...v, value: e.target.value };
                          setVariablesList(next);
                        }} placeholder="value" fullWidth />
                      ) : (
                        <SecretInput label="Select secret" value={v.secretId ? { id: v.secretId } : null} onChange={(ref) => {
                          const next = [...variablesList];
                          next[i] = { ...v, secretId: ref?.id };
                          setVariablesList(next);
                        }} />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => {
                        const next = variablesList.filter((_, idx) => idx !== i);
                        setVariablesList(next);
                      }}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4}>
                    <Button size="small" startIcon={<Add />} onClick={() => setVariablesList((prev) => [...prev, { id: `var_${Date.now()}`, name: '', type: 'plain', value: '' }])}>Add variable</Button>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>Use in steps as: &lt;var NAME&gt; or &lt;secret SECRET_ID&gt;</Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVariablesOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => {
            // Persisted only. There is no client-side code generation left to refresh (AC-3a).
            try { localStorage.setItem('studio:variables', JSON.stringify(variablesList)); } catch {}
            setVariablesOpen(false);
          }}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Templates Dialog */}
      <Dialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Quick Start Templates</DialogTitle>
        <DialogContent>
          <Stack spacing={1} mt={1}>
            <Button
              variant="outlined"
              onClick={() => {
                setTestSteps([
                  'Go to "https://online.citi.com"',
                  'Click "Sign On"',
                  'Type "<var USERNAME>" in the "User ID" field',
                  'Type "<secret sec_abc123>" in the "Password" field',
                  'Click "Continue"',
                  'Wait for "Welcome"',
                ]);
                setTemplatesOpen(false);
              }}
            >Login flow</Button>
            <Button
              variant="outlined"
              onClick={() => {
                setTestSteps([
                  'Go to "https://put.internal.citi.com"',
                  'Wait for "Dashboard"',
                  'Check url contains "dashboard"',
                ]);
                setTemplatesOpen(false);
              }}
            >Content check</Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplatesOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const ChecksStudioPage: React.FC = () => {
  const uiTestEnabled = useAppSelector(selectIsSourceEnabled('UI_TEST'));
  const studioFeatureEnabled = useAppSelector(selectIsFeatureEnabled('STUDIO'));
  if (!uiTestEnabled || !studioFeatureEnabled) return <StudioUnavailable />;
  return <ChecksStudioPageInner />;
};

export default ChecksStudioPage;