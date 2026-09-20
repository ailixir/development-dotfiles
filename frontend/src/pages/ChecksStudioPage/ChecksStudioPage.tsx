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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  Select,
  MenuItem,
  Tooltip,
  Badge,
  useTheme,
  alpha,
  CircularProgress,
  GlobalStyles,
  Snackbar,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import {
  Add,
  Delete,
  Science,
  Code,
  CheckCircle,
  Error,
  Save,
  Settings,
  ListAlt,
  PlaylistAdd,
  Refresh,
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
import { setExecutionLogs, setAllStepResults, setExecuting, setCurrentStep as setCurrentStepAction, clearLogs } from '@store/slices/studioSlice';
import { formatLogTime, toStudioLogLines } from '@/utils/studio/logTime';
import {
  CANONICAL_BROWSER,
  defaultConfiguration,
  isTerminalExecutionStatus,
  type ExecutionSnapshot,
  type StudioVariable,
  type TestDto,
  type TestRequest,
} from '@/types/studio/studioTypes';
import studioApi from '@/services/api/studioApi';
import {
  subscribeToExecution,
  type ExecutionSubscription,
  type TransportStatus,
} from '@/services/api/studioTransportWiring';
import { useLocation, useParams } from 'react-router-dom';
import SecretInput from '@/components/studio/SecretInput';
import { CompileReviewPanel } from '@/components/studio/review';
import {
  ExecutionProgressView,
  RunControl,
  executionStatusLabel,
  executionStatusTone,
} from '@/components/studio/run';
import { VideoEvidencePanel, useVideoSeek } from '@/components/studio/evidence';

/** One row of the Variables dialog. `secret` rows hold a reference id, never a secret value. */
type EditableVariable = {
  id: string;
  name: string;
  type: 'plain' | 'secret';
  value?: string;
  secretId?: string;
};

function toEditableVariables(variables: StudioVariable[] | null | undefined): EditableVariable[] {
  return (variables ?? []).map((variable, index) => ({
    id: `var_${index}_${variable.name}`,
    name: variable.name,
    type: variable.kind === 'secretRef' ? 'secret' : 'plain',
    value: variable.kind === 'plain' ? variable.value ?? '' : undefined,
    secretId: variable.kind === 'secretRef' ? variable.secretId ?? undefined : undefined,
  }));
}

/** The contract's typed variables. A `secretRef` carries its reference only. */
function toContractVariables(rows: EditableVariable[]): StudioVariable[] {
  return rows
    .filter((row) => row.name.trim() !== '')
    .map((row) =>
      row.type === 'secret'
        ? { name: row.name.trim(), kind: 'secretRef', secretId: row.secretId ?? null }
        : { name: row.name.trim(), kind: 'plain', value: row.value ?? '' },
    );
}

export const SAVE_CONFLICT_TITLE = 'This test changed after you opened it';
export const SAVE_CONFLICT_STATEMENT =
  'A newer version of this test was saved (in another tab, or by someone else) after this page loaded it. Nothing was saved. Reload to get the latest version. Edits on this page that are not saved will be replaced.';
export const SAVE_REFUSED_TITLE = 'The server refused the save';
export const RELOAD_TEST_LABEL = 'Reload test';

type SaveOutcome = 'saved' | 'conflict' | 'error';

const StudioUnavailable: React.FC = () => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', textAlign: 'center', p: 4 }}>
    <Typography variant="h5" gutterBottom>Checks Studio</Typography>
    <Typography variant="body1" color="text.secondary">Checks Studio is not available in this environment.</Typography>
  </Box>
);

const ChecksStudioPageInner: React.FC = () => {
  const theme = useTheme();
  const [scenarios, setScenarios] = useState<TestDto[] | null>(null);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [scenariosLoading, setScenariosLoading] = useState<boolean>(true);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const isRunning = useAppSelector((s: any) => s.studio.isExecuting);
  const currentStep = Math.max(0, useAppSelector((s: any) => s.studio.currentStep));
  const [testSteps, setTestSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState('');
  const reduxLogs = useAppSelector((s: any) => s.studio.executionLogs);
  const executionLogs = useMemo(() => (reduxLogs || []).map((l: any) => ({
    timestamp: formatLogTime(l.timestamp),
    message: l.message,
    type: l.level === 'error' ? 'error' : 'info',
  })), [reduxLogs]);
  /**
   * Story 10.16a, AC-21 — the one playback path. The media element is `VideoEvidencePanel`'s, and a
   * step seek sets its `currentTime` to that step's `offsetMs / 1000` through this bridge. The
   * legacy player, its missing-file fallback, the store-held playback source and the index-derived
   * seek are retired (architecture §6.4: *"No synthetic index-times-ten mapping remains."*).
   */
  const { videoRef, seekToOffset } = useVideoSeek();
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
  const [saveSnack, setSaveSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  /** A `409` from `PUT /tests/{id}`. Cleared by a successful save or by reloading the test. */
  const [saveConflict, setSaveConflict] = useState<{ code: string; message: string } | null>(null);
  /** Stop asked the server to cancel, and the run's terminal snapshot has not arrived yet. */
  const [isStopping, setIsStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  // Removed legacy interval-based simulator in favor of API polling
  const [validation,
    setValidation] = useState<{ results: Array<{ stepIndex: number; isValid: boolean; suggestion: string | null }>; isValid: boolean; loading: boolean; error?: string }>
    ({ results: [], isValid: true, loading: false });
  const [variablesList, setVariablesList] = useState<EditableVariable[]>([]);
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
  const location = useLocation();
  const params = useParams();
  const selectedScenarioData = scenarios?.find(s => s.id === selectedScenario) || null;
  const dispatch = useDispatch();

  /** Puts a draft the server returned into the editor. The server's copy is the only draft. */
  const loadDraftIntoEditor = useCallback((test: TestDto) => {
    setTestSteps(test.steps || []);
    setVariablesList(toEditableVariables(test.variables));
  }, []);

  const replaceScenario = useCallback((updated: TestDto) => {
    setScenarios((previous) =>
      previous ? previous.map((test) => (test.id === updated.id ? updated : test)) : [updated],
    );
  }, []);

  // Load the drafts from `GET /studio/tests`. This is the real API, or MSW when the standalone dev
  // server runs with `VITE_ENABLE_MSW=true` (see `MswGate`).
  useEffect(() => {
    let mounted = true;
    (async () => {
      setScenariosLoading(true);
      setScenariosError(null);
      try {
        const res = await studioApi.listTests();
        if (!mounted) return;
        const list = res.data;
        setScenarios(list);
        const urlId = params.id;
        const query = new URLSearchParams(location.search);
        const autorun = query.get('autorun') === '1';
        let chosen = list?.[0];
        if (urlId) {
          const byId = list?.find((t) => t.id === urlId);
          if (byId) chosen = byId;
        }
        if (chosen) {
          setSelectedScenario(chosen.id);
          loadDraftIntoEditor(chosen);
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
      const res = await studioApi.listTests();
      setScenarios(res.data);
    } catch (e: any) {
      setScenariosError(e?.message || 'Failed to load scenarios');
    } finally {
      setScenariosLoading(false);
    }
  }, []);

  /**
   * Story 10.11b, AC-7/AC-8. The 700 ms `setInterval` that used to live here is gone: every
   * execution snapshot now arrives through the one transport abstraction in the API service layer,
   * and this component holds a subscription handle and nothing else. It opens no connection, keeps
   * no timer, and never reads `GET /executions/{id}` itself — the SSE assessment's rule that *"the
   * component should not create unmanaged network connections."*
   */
  const subscriptionRef = useRef<ExecutionSubscription | null>(null);
  const currentExecutionIdRef = useRef<string | null>(null);
  const [transportStatus, setTransportStatus] = useState<TransportStatus | null>(null);
  const [accessDenied, setAccessDenied] = useState<number | null>(null);
  const closeSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.close();
      subscriptionRef.current = null;
    }
  }, []);

  // AC-13: no subscription outlives the component that asked for it.
  useEffect(() => () => closeSubscription(), [closeSubscription]);

  /**
   * The seam between the two halves of story 10.11, and the only run entry point on this page.
   *
   * **10.11a owns whether a run may start.** `RunControl` holds the gate (`compileStatus ===
   * 'READY'`, read from `GET /tests/{id}`) and owns the single `POST /tests/{id}/execute`; the page
   * has no `handleRunTest`, no `validation.isValid` gate and no execute call of its own, because a
   * second call site is a second dispatch path and one of them would be ungated.
   *
   * **10.11b owns what happens after the server accepts.** The 700 ms `setInterval` that 10.11a
   * deliberately left standing — it was AC-8's to remove, not AC-2's — is removed here: this
   * callback subscribes through the transport abstraction and holds nothing else. The snapshot is
   * still lifted into page state, so 10.11a's `ExecutionProgressView` renders it unchanged; that
   * is the substitution its own comment anticipated.
   */
  const beginRun = useCallback((executionId: string) => {
    dispatch(setExecuting(true));
    dispatch(setCurrentStepAction(0));
    dispatch(clearLogs());
    dispatch(setExecutionLogs([{ timestamp: new Date().toISOString(), level: 'info', message: 'Starting UI test execution' } as any]));
    setSnapshot(null);
    currentExecutionIdRef.current = executionId;
    closeSubscription();
    setAccessDenied(null);
    setIsStopping(false);
    setStopError(null);
    subscriptionRef.current = subscribeToExecution(executionId, {
      onSnapshot: (exec) => {
        setSnapshot(exec);
        if (Array.isArray(exec.stepResults)) {
          dispatch(setAllStepResults(exec.stepResults.map((r) => ({ stepIndex: r.stepIndex, status: r.status })) as any));
        }
        const runningIndex = exec.stepResults?.findIndex((r) => r.status === 'RUNNING') ?? -1;
        const passedCount = exec.stepResults?.filter((r) => r.status === 'PASS').length ?? 0;
        dispatch(setCurrentStepAction(runningIndex >= 0 ? runningIndex : Math.max(0, passedCount - 1)));
        if (Array.isArray(exec.logs)) {
          dispatch(setExecutionLogs(toStudioLogLines(exec.logs)));
        }
        // The *run* stops being in flight on a terminal outcome. The **stream** does not close
        // here: §5.4 row 5 keeps it open while evidence is still being produced, and that rule
        // belongs to the transport (AC-13), not to this component.
        if (isTerminalExecutionStatus(exec.status)) {
          dispatch(setExecuting(false));
          setIsStopping(false);
        }
      },
      onStatus: (status) => setTransportStatus(status),
      onAccessDenied: ({ status }) => {
        setAccessDenied(status);
        dispatch(setExecuting(false));
        setIsStopping(false);
      },
      onClosed: () => {
        subscriptionRef.current = null;
        dispatch(setExecuting(false));
        setIsStopping(false);
      },
    });
  }, [closeSubscription, dispatch]);

  /*
   * Story 10.11a, AC-3(a): the client-side Python regeneration that used to run here on every
   * step change is gone. PRD §5.3 retires Python export from the Studio plan and architecture
   * §8.3 retires client generation as an authoritative path; §4.4 makes the server's artifact the
   * only executable truth. The effect is removed rather than disabled, because a disabled effect
   * is one flag away from being a live one again.
   */

  /*
   * No draft content is kept in the browser. Steps and variables live in the test on the server,
   * and they are saved with `PUT /tests/{id}` under the draft's revisions. The global
   * `studio:steps` and `studio:variables` copies were removed: a copy from another test could
   * override the test opened by URL, and variables were written but never read back. Only the
   * onboarding coach's position is kept locally, because it is not test content.
   */
  useEffect(() => {
    try { localStorage.setItem('studio:coachStep', String(coachStep)); } catch { /* storage unavailable: the coach just restarts */ }
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
    // AC-13: a scenario switch performed **while a stream is open** must leave no connection
    // behind. Counted at the server, not by trusting this line.
    closeSubscription();
    setTransportStatus(null);
    setAccessDenied(null);
    setIsStopping(false);
    setStopError(null);
    setSaveConflict(null);
    dispatch(setExecuting(false));
    setSelectedScenario(scenarioId);
    const scenario = scenarios?.find(s => s.id === scenarioId);
    if (scenario) {
      loadDraftIntoEditor(scenario);
      dispatch(setCurrentStepAction(0));
      dispatch(setAllStepResults([] as any));
      dispatch(clearLogs());
    }
  };

  /**
   * Story 10.11b, AC-13 — the scenario switch, made reachable.
   *
   * `handleScenarioSelect` already existed and already did the right thing; nothing in the rendered
   * tree called it, so the route (`/checks/studio/:id`, `App.tsx:114`) — which is this app's own way
   * of choosing a draft — changed without the page noticing. A stream opened for one draft would
   * have outlived the switch to another, which is precisely the accumulation AC-13 counts at the
   * server.
   *
   * **`SCEN-1`, from @qa's gate.** The trigger is the route **changing**, not the route *differing
   * from the selection*. Those are not the same predicate: a reload of the list can leave the
   * selection on one draft while the route still carries another id, and a "differs from" test
   * fires there and snaps the selection **back**, overwriting `testSteps`. `lastRouteId` is what
   * makes this a change detector, and it is the whole of the remedy.
   */
  const lastRouteId = useRef<string | undefined>(params.id);
  useEffect(() => {
    const next = params.id;
    if (next === lastRouteId.current) return;
    if (!next || !scenarios) return;
    // An id the list does not carry is not consumed: a later reload may bring it, and until then
    // the route change has not happened as far as this page is concerned.
    if (!scenarios.some((scenario) => scenario.id === next)) return;
    lastRouteId.current = next;
    if (next === selectedScenario) return;
    handleScenarioSelect(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, scenarios, selectedScenario]);

  /** The recording can be sought only when the panel has mounted one (AC-4's gate, AC-8). */
  const hasPlayableRecording =
    snapshot !== null && snapshot.video.status === 'AVAILABLE' && snapshot.videoPath !== null;
  const handleSeekStep = useCallback(
    (offsetMs: number) => {
      seekToOffset(offsetMs);
      // The player lives on the Proof tab; show it so the reader sees the moment they asked for.
      setRightTab(2);
    },
    [seekToOffset],
  );

  /**
   * Saves the open draft with `PUT /tests/{id}` (Studio v1, D9).
   *
   * Save never creates a test: a draft is created once, on the Tests page, and every later save
   * updates that one row. The request carries the `sourceRevision` and `configurationRevision` this
   * page last read, so the server refuses a save made over a newer version with `409
   * STALE_REVISION` instead of overwriting it. The CSI is the draft's own and is never defaulted:
   * the server keeps a draft's CSI fixed after creation. The browser is always the canonical
   * engine, whatever an older draft recorded.
   */
  const saveDraft = useCallback(async (): Promise<SaveOutcome> => {
    const test = selectedScenarioData;
    if (!test) return 'error';
    const body: TestRequest = {
      name: test.name,
      description: test.description ?? null,
      csiId: test.csiId,
      environment: test.environment,
      steps: testSteps,
      variables: toContractVariables(variablesList),
      configuration: { ...defaultConfiguration(), ...test.configuration, browser: CANONICAL_BROWSER },
      sourceRevision: test.sourceRevision,
      configurationRevision: test.configurationRevision,
    };
    setIsSaving(true);
    try {
      const updated = await studioApi.updateTest(test.id, body);
      replaceScenario(updated);
      setSaveConflict(null);
      setSaveSnack({ open: true, message: 'Test saved', severity: 'success' });
      return 'saved';
    } catch (error: unknown) {
      const failure = error as {
        response?: { status?: number; data?: { error?: string; message?: string } };
        message?: string;
      };
      if (failure.response?.status === 409) {
        setSaveConflict({
          code: failure.response.data?.error ?? '',
          message: failure.response.data?.message ?? '',
        });
        return 'conflict';
      }
      setSaveSnack({ open: true, message: failure.message || 'Failed to save', severity: 'error' });
      return 'error';
    } finally {
      setIsSaving(false);
    }
  }, [replaceScenario, selectedScenarioData, testSteps, variablesList]);

  /** The conflict's way out: read the draft again and put the server's version in the editor. */
  const reloadSelectedTest = useCallback(async () => {
    const id = selectedScenarioData?.id;
    if (!id) return;
    try {
      const fresh = await studioApi.getTest(id);
      replaceScenario(fresh);
      loadDraftIntoEditor(fresh);
      setSaveConflict(null);
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message;
      setSaveSnack({ open: true, message: message || 'Failed to reload the test', severity: 'error' });
    }
  }, [loadDraftIntoEditor, replaceScenario, selectedScenarioData?.id]);

  /**
   * Stop asks the server to cancel the run, and nothing more. The run is over only when its
   * terminal snapshot arrives (`ERROR` with `errorCode: CANCELLED`, or whatever outcome it reached
   * first), so the live transport stays open and the control reads "Stopping…" until then. A `409`
   * means the run had already ended; its terminal snapshot is on its way through the same transport.
   */
  const handleStop = useCallback(async () => {
    const executionId = currentExecutionIdRef.current;
    if (!executionId || isStopping) return;
    setIsStopping(true);
    setStopError(null);
    try {
      await studioApi.cancelExecution(executionId);
    } catch (error: unknown) {
      const failure = error as { response?: { status?: number }; message?: string };
      if (failure.response?.status === 409) return;
      setIsStopping(false);
      setStopError(failure.message || 'The run could not be stopped');
    }
  }, [isStopping]);

  const addTestStep = () => {
    if (newStep.trim()) {
      // Stop any live subscription before mutating steps
      closeSubscription();
      dispatch(setExecuting(false));
      setTestSteps(prev => [...prev, newStep]);
      setNewStep('');
    }
  };

  const removeTestStep = (index: number) => {
    closeSubscription();
    dispatch(setExecuting(false));
    setTestSteps(prev => prev.filter((_, i) => i !== index));
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
                  try { localStorage.removeItem('studio:coachStep'); } catch { /* storage unavailable */ }
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
                        <Chip
                          label={selectedScenarioData.lastRunStatus ? `Last run: ${executionStatusLabel(selectedScenarioData.lastRunStatus)}` : 'Never run'}
                          size="small"
                          color={selectedScenarioData.lastRunStatus ? executionStatusTone(selectedScenarioData.lastRunStatus) : 'default'}
                          data-testid="test-last-run-status"
                          sx={{ fontSize: 11 }}
                        />
                        <Button size="small" variant="text" onClick={() => { window.location.href = '/checks/studio/tests'; }}>Change…</Button>
                      </Stack>
                    </Stack>
                    {selectedScenarioData.description && (
                      <Typography variant="caption" color="text.secondary">{selectedScenarioData.description}</Typography>
                    )}
                    {(selectedScenarioData.updatedAt || selectedScenarioData.createdAt) && (
                      <Typography variant="caption" color="text.secondary">Updated: {new Date((selectedScenarioData.updatedAt || selectedScenarioData.createdAt) as string).toLocaleString()}</Typography>
                    )}
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
                {/* The coach position (not test content) is kept in localStorage */}
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
                      Examples: Go to &quot;https://put.internal.citi.com&quot; <br />• Click &quot;Sign On&quot; <br />• Type &quot;&lt;var USERNAME&gt;&quot; in the &quot;User ID&quot; field <br />• Wait for &quot;Welcome&quot; (use tokens: &lt;var NAME&gt;, &lt;secret SECRET_ID&gt;)
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
                        }}
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
                          secondary={isInvalid ? (validationEntry?.suggestion || 'Invalid step') : undefined}
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
                    onStop={handleStop}
                    isStopping={isStopping}
                  />
                  <Button
                    variant="outlined"
                    startIcon={<Save />}
                    disabled={isRunning || isSaving || !selectedScenarioData}
                    onClick={() => { void saveDraft(); }}
                  >
                    Save
                  </Button>
                </Stack>

                {saveConflict !== null && (
                  <Box sx={{ mt: 2 }}>
                    <Alert
                      severity="warning"
                      role="alert"
                      data-testid="save-conflict"
                      action={
                        <Button color="inherit" size="small" onClick={() => { void reloadSelectedTest(); }}>
                          {RELOAD_TEST_LABEL}
                        </Button>
                      }
                    >
                      <AlertTitle>
                        {saveConflict.code === 'STALE_REVISION' ? SAVE_CONFLICT_TITLE : SAVE_REFUSED_TITLE}
                      </AlertTitle>
                      {saveConflict.code === 'STALE_REVISION'
                        ? SAVE_CONFLICT_STATEMENT
                        : saveConflict.message || 'The save conflicts with the test as the server holds it.'}
                    </Alert>
                  </Box>
                )}
                {stopError !== null && (
                  <Box sx={{ mt: 2 }}>
                    <Alert severity="error" role="alert" data-testid="stop-error">
                      {stopError}
                    </Alert>
                  </Box>
                )}

                {/*
                  * AC-11(i): the transport's own state, labelled as transport. A dropped connection
                  * is not a failed test, so this region's accessible name is deliberately distinct
                  * from every `ExecutionStatus` narrative — `studioTransport.node.test.ts` asserts
                  * that rather than assuming it.
                  */}
                {accessDenied !== null && (
                  <Box sx={{ mt: 2 }}>
                    <Alert severity="error" role="status" aria-label="Live progress feed access refused">
                      <AlertTitle>Live progress feed access refused</AlertTitle>
                      The server refused this browser access to the run&apos;s progress
                      ({accessDenied}). Nothing further is requested. Ask the CSI owner for access.
                    </Alert>
                  </Box>
                )}
                {accessDenied === null &&
                  transportStatus !== null &&
                  (transportStatus.phase === 'reconnecting' ||
                    transportStatus.phase === 'falling-back') && (
                    <Box sx={{ mt: 2 }}>
                      <Alert severity="info" role="status" aria-label={transportStatus.label}>
                        {transportStatus.label}
                      </Alert>
                    </Box>
                  )}

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
                  {/* Keyed by revision: a save changes the draft on the server, so the review re-reads it. */}
                  <CompileReviewPanel
                    key={`${selectedScenarioData.id}:${selectedScenarioData.sourceRevision}:${selectedScenarioData.configurationRevision}`}
                    testId={selectedScenarioData.id}
                  />
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
                    onSeekStep={hasPlayableRecording ? handleSeekStep : undefined}
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
                {/*
                  Story 10.16a — the run's evidence state, and the page's only media element (AC-2, AC-4,
                  AC-21). It renders from the snapshot's `video` and `videoPath`, never from the
                  check outcome and never from the store.
                */}
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <VideoEvidencePanel ref={videoRef} snapshot={snapshot} />
                </Paper>
              </Box>

              {/* Variables inline panel removed in favor of Variables dialog */}
            </CardContent>
          </Card>
        </Grid>

        {/* Right Panel removed: Proof is integrated as a tab */}
      </Grid>

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

      {/* Variables Dialog */}
      <Dialog open={variablesOpen} onClose={() => setVariablesOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Variables</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Configure variables referenced in your steps using &lt;var NAME&gt; or &lt;secret SECRET_ID&gt;.
            Variables are saved with the test, together with its steps. A secret is stored as a
            reference only; its value never reaches this page.
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
          <Button onClick={() => setVariablesOpen(false)}>Close</Button>
          <Button
            variant="contained"
            disabled={isSaving || isRunning || !selectedScenarioData}
            onClick={async () => {
              // One save path: the whole draft goes through `PUT /tests/{id}`. A conflict closes
              // the dialog so the page's conflict message and its Reload action are visible.
              const outcome = await saveDraft();
              if (outcome !== 'error') setVariablesOpen(false);
            }}
          >
            Save
          </Button>
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