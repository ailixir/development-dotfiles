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
  Chip,
  List,
  ListItem,
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
  ListAlt,
  PlaylistAdd,
  Refresh,
  KeyboardArrowUp,
  KeyboardArrowDown,
  HelpOutline,
  PlayArrow,
} from '@mui/icons-material';
import OnboardingCoach from '@/components/studio/OnboardingCoach';
import CodeTab from '@/components/studio/CodeTab';
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
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import SecretInput from '@/components/studio/SecretInput';
import { STUDIO_CAPABILITIES } from '@/utils/config/studioCapabilities';
import {
  ExecutionProgressView,
  RunControl,
  executionStatusLabel,
  executionStatusTone,
} from '@/components/studio/run';
import { VideoEvidencePanel, useVideoSeek } from '@/components/studio/evidence';
import { PRODUCTION_ALPHA_TEMPLATES, type QuickStartTemplate } from '@/components/studio/templates';

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

/** Optional opposite-kind fields are serialized as null by Java and omitted by some clients. */
function comparableVariables(variables: StudioVariable[]): StudioVariable[] {
  return variables.map((variable) =>
    variable.kind === 'secretRef'
      ? {
          name: variable.name,
          kind: variable.kind,
          value: null,
          secretId: variable.secretId ?? null,
        }
      : {
          name: variable.name,
          kind: variable.kind,
          value: variable.value ?? '',
          secretId: null,
        },
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

function formatExecutionTime(durationMs: number): string {
  const totalSeconds = Math.max(0, durationMs) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
    : `${seconds.toFixed(1)}s`;
}

const ExecutionTime: React.FC<{ snapshot: ExecutionSnapshot; running: boolean }> = ({ snapshot, running }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || snapshot.durationMs !== null) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running, snapshot.durationMs]);

  const started = Date.parse(snapshot.startedAt ?? snapshot.acceptedAt);
  const elapsed = snapshot.durationMs ?? (Number.isFinite(started) ? now - started : 0);
  return (
    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
      <Typography variant="subtitle2">Execution</Typography>
      <Chip
        size="small"
        variant="outlined"
        label={`Time ${formatExecutionTime(elapsed)}`}
        aria-label={`Execution time ${formatExecutionTime(elapsed)}`}
        data-testid="execution-time"
      />
    </Stack>
  );
};

const ChecksStudioPageInner: React.FC = () => {
  const theme = useTheme();
  const [scenarios, setScenarios] = useState<TestDto[] | null>(null);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [scenariosLoading, setScenariosLoading] = useState<boolean>(true);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const isRunning = useAppSelector((s: any) => s.studio.isExecuting);
  const currentStep = useAppSelector((s: any) => s.studio.currentStep);
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
  const [isPreparing, setIsPreparing] = useState(false);
  const editorLocked = isRunning || isPreparing;
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
  const [variablesList, setVariablesList] = useState<EditableVariable[]>([]);
  const [environment, setEnvironment] = useState('');
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
  const navigate = useNavigate();
  const params = useParams();
  const selectedScenarioData = scenarios?.find(s => s.id === selectedScenario) || null;
  const dispatch = useDispatch();

  /** Puts a draft the server returned into the editor. The server's copy is the only draft. */
  const loadDraftIntoEditor = useCallback((test: TestDto) => {
    setTestSteps(test.steps || []);
    setVariablesList(toEditableVariables(test.variables));
    setEnvironment(test.environment);
  }, []);

  const isDirty = useMemo(() => {
    if (!selectedScenarioData) return false;
    return (
      JSON.stringify(testSteps) !== JSON.stringify(selectedScenarioData.steps ?? []) ||
      JSON.stringify(comparableVariables(toContractVariables(variablesList))) !==
        JSON.stringify(comparableVariables(selectedScenarioData.variables ?? [])) ||
      environment !== selectedScenarioData.environment
    );
  }, [environment, selectedScenarioData, testSteps, variablesList]);

  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  /**
   * Puts a Quick Start template into the editor.
   *
   * Steps are replaced; reference rows are **merged**. A template declares the `<var>` / `<secret>`
   * names its steps mention so the first compile does not fail on an undeclared reference, but a
   * row the author already configured (a chosen vault entry, a filled-in value) is left exactly as
   * it is. The template names what is needed, it does not overwrite what is already known.
   */
  const applyTemplate = useCallback((template: QuickStartTemplate) => {
    setTestSteps([...template.steps]);
    setVariablesList((rows) => {
      const known = new Set(rows.map((row) => row.name.trim()));
      const added = template.variables
        .filter((variable) => !known.has(variable.name))
        .map((variable) => ({
          id: `tpl_${template.id}_${variable.name}`,
          name: variable.name,
          type: variable.type,
          value: variable.type === 'plain' ? variable.value ?? '' : undefined,
          secretId: undefined,
        }));
      return [...rows, ...added];
    });
    setTemplatesOpen(false);
  }, []);

  const requestNavigation = useCallback((action: () => void) => {
    if (!isDirty) {
      action();
      return;
    }
    pendingNavigationRef.current = action;
    setLeaveDialogOpen(true);
  }, [isDirty]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  const replaceScenario = useCallback((updated: TestDto) => {
    setScenarios((previous) =>
      previous ? previous.map((test) => (test.id === updated.id ? updated : test)) : [updated],
    );
  }, []);

  // Load drafts from the real `GET /studio/tests` API. Fixtures are test-only and never install a
  // browser service worker or replace this page's transport at runtime.
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
    dispatch(clearLogs());
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
        dispatch(setCurrentStepAction(runningIndex >= 0 ? runningIndex : passedCount - 1));
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
      // The player lives on the Proof tab; show it when a reader asks to seek.
      setRightTab(1);
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
      environment,
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
  }, [environment, replaceScenario, selectedScenarioData, testSteps, variablesList]);

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
      <Paper
        variant="outlined"
        sx={{
          mb: 3,
          px: { xs: 2, md: 3 },
          py: 2,
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
          alignItems: { xs: 'stretch', lg: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" minWidth={0}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
            <Science aria-hidden="true" />
          </Avatar>
          <Box minWidth={0}>
            <Button
              size="small"
              variant="text"
              onClick={() => requestNavigation(() => navigate('/checks/studio/tests'))}
              sx={{ px: 0, minWidth: 0 }}
            >
              Studio Tests
            </Button>
            <Typography variant="h5" component="h1" fontWeight={700} noWrap>
              {selectedScenarioData?.name ?? 'Checks Studio'}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              {environment && <Chip size="small" variant="outlined" label={environment} />}
              <Chip
                size="small"
                color={isDirty ? 'warning' : 'success'}
                variant={isDirty ? 'filled' : 'outlined'}
                label={isDirty ? 'Unsaved changes' : 'Saved'}
                data-testid="studio-save-state"
              />
            </Stack>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="flex-end" flexWrap="wrap" useFlexGap>
          <Button
            variant="text"
            size="small"
            onClick={() => setTemplatesOpen(true)}
            disabled={editorLocked}
            sx={{ minHeight: 42, whiteSpace: 'nowrap' }}
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
              sx={{ width: 42, height: 42 }}
            >
              <HelpOutline />
            </IconButton>
          </Tooltip>
          <Button
            variant={isDirty ? 'contained' : 'outlined'}
            startIcon={<Save />}
            disabled={editorLocked || isSaving || !selectedScenarioData}
            onClick={() => { void saveDraft(); }}
            sx={{ minHeight: 42, whiteSpace: 'nowrap' }}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
          <RunControl
            testId={selectedScenarioData?.id ?? null}
            refreshToken={`${selectedScenarioData?.sourceRevision ?? 0}:${selectedScenarioData?.configurationRevision ?? 0}:${selectedScenarioData?.compileStatus ?? ''}:${selectedScenarioData?.confirmedRevisionId ?? ''}`}
            isRunning={isRunning}
            onPreparingChange={setIsPreparing}
            isDirty={isDirty}
            onSaveBeforeRun={saveDraft}
            hasSteps={testSteps.length > 0}
            runRequest={runRequest}
            onAccepted={(executionId) => {
              setRightTab(0);
              beginRun(executionId);
            }}
            onStop={handleStop}
            isStopping={isStopping}
          />
        </Stack>
      </Paper>

      {/* Two-panel Studio: checklist/configuration on the left, run evidence on the right. */}
      <Grid container spacing={3} sx={{ minHeight: '600px' }}>
        {/* Left Panel - Test Scenarios & Steps */}
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<ListAlt sx={{ color: 'primary.main' }} />}
              title="Test setup"
              subheader="Write your steps in plain English, then press Run"
            />
            <CardContent sx={{ flex: 1, overflow: 'auto', p: 0 }}>
              {/* Current Test Summary */}
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                {scenariosLoading ? (
                  <Typography variant="body2" color="text.secondary">Loading test…</Typography>
                ) : selectedScenarioData ? (
                  <Stack spacing={0.5}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{selectedScenarioData.name}</Typography>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                        <Chip
                          label={selectedScenarioData.lastRunStatus ? `Previous run: ${executionStatusLabel(selectedScenarioData.lastRunStatus)}` : 'No run history'}
                          size="small"
                          color={selectedScenarioData.lastRunStatus ? executionStatusTone(selectedScenarioData.lastRunStatus) : 'default'}
                          data-testid="test-last-run-status"
                          sx={{ fontSize: 11 }}
                        />
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
                    <Button size="small" variant="contained" onClick={() => navigate('/checks/studio/tests')}>Open Tests</Button>
                  </Stack>
                )}
              </Box>

              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'stretch' }}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Environment"
                    value={environment}
                    disabled={editorLocked || !selectedScenarioData}
                    onChange={(event) => setEnvironment(event.target.value)}
                    sx={{ flex: '1 1 260px', minWidth: 0 }}
                  >
                    {['Development', 'Staging', 'Production'].map((option) => (
                      <MenuItem key={option} value={option}>{option}</MenuItem>
                    ))}
                  </TextField>
                  <Button
                    aria-label="Variables"
                    variant="outlined"
                    size="medium"
                    onClick={() => setVariablesOpen(true)}
                    disabled={editorLocked || !selectedScenarioData}
                    sx={{ flex: '0 0 auto', whiteSpace: 'nowrap', minHeight: 40 }}
                  >
                    Variables
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Plain variables are available. Vault-backed secrets are disabled in this alpha.
                </Typography>
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
                    <Badge badgeContent={isRunning && currentStep >= 0 ? `${currentStep + 1}/${testSteps.length}` : null} color="primary">
                      <PlaylistAdd sx={{ color: 'text.secondary' }} />
                    </Badge>
                  </Stack>
                </Box>

                 {testSteps.length === 0 && !scenariosLoading && (
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="body2" fontWeight={600}>Add your first step</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Name every control in quotes and finish with something to check:
                      <br />• Go to &quot;https://www.saucedemo.com/&quot;
                      <br />• Type &quot;&lt;var USERNAME&gt;&quot; in the &quot;Username&quot; field
                      <br />• Click the &quot;Login&quot; button
                      <br />• Check that the URL contains &quot;/inventory.html&quot;
                      <br />A name in &lt;var NAME&gt; or &lt;secret NAME&gt; has to match a row in Variables.
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
                          alignItems: 'flex-start',
                          gap: 1,
                          px: 1.5,
                          py: 1,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5, flexShrink: 0 }}>
                          <Avatar sx={{ 
                            width: 32,
                            height: 32,
                            fontSize: 13,
                            bgcolor: stepResult === 'passed' ? 'success.main' :
                                     stepResult === 'failed' ? 'error.main' :
                                     isCurrentStep && isRunning ? 'primary.main' : 'grey.300',
                            color: 'white'
                          }}>
                            {stepResult === 'passed' ? <CheckCircle sx={{ fontSize: 16 }} /> : 
                             stepResult === 'failed' ? <Error sx={{ fontSize: 16 }} /> :
                             isCurrentStep && isRunning ? <CircularProgress aria-label={`Running step ${index + 1}`} size={16} sx={{ color: 'white' }} /> :
                             index + 1}
                          </Avatar>
                        </Box>
                        <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                          <TextField
                            variant="standard"
                            fullWidth
                            multiline
                            minRows={2}
                            maxRows={8}
                            inputProps={{ 'aria-label': `Step ${index + 1}` }}
                            value={step}
                            disabled={editorLocked}
                            onChange={(e) => {
                              const next = [...testSteps];
                              next[index] = e.target.value;
                              setTestSteps(next);
                            }}
                            InputProps={{
                              disableUnderline: false,
                              sx: {
                                alignItems: 'flex-start',
                                fontSize: '0.875rem',
                                lineHeight: 1.45,
                                fontWeight: isCurrentStep && isRunning ? 600 : 400,
                                color: stepResult === 'passed' ? 'success.main' :
                                       stepResult === 'failed' ? 'error.main' :
                                       isCurrentStep ? 'primary.main' : 'text.primary',
                              }
                            }}
                          />
                        </Box>
                        <Stack
                          direction="row"
                          spacing={0.25}
                          sx={{ flexShrink: 0, '& .MuiIconButton-root': { width: 36, height: 36 } }}
                        >
                          <Tooltip title="Move up">
                            <span>
                              <IconButton aria-label={`Move step ${index + 1} up`} size="small" disabled={editorLocked || index === 0} onClick={(e) => {
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
                              <IconButton aria-label={`Move step ${index + 1} down`} size="small" disabled={editorLocked || index === testSteps.length - 1} onClick={(e) => {
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
                                aria-label={`Remove step ${index + 1}`}
                                size="small" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeTestStep(index);
                                }}
                                disabled={editorLocked}
                              >
                                <Delete sx={{ fontSize: 16 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </ListItem>
                    );
                  })}
                </List>

                {/* Add Step */}
                <Box sx={{ mt: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    multiline
                    minRows={2}
                    maxRows={6}
                    label="Add a test step"
                    placeholder="Add new test step..."
                    value={newStep}
                    disabled={editorLocked}
                    onChange={(e) => setNewStep(e.target.value)}
                    helperText="Press Ctrl+Enter (or Cmd+Enter) to add the step."
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        addTestStep();
                      }
                    }}
                    InputProps={{
                      endAdornment: (
                        <IconButton aria-label="Add step" size="small" onClick={addTestStep} disabled={editorLocked || !newStep.trim()}>
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

        {/* Right panel - Logs, Proof, and Source */}
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<PlayArrow sx={{ color: 'primary.main' }} />}
              title="Run & proof"
              subheader="Execution and evidence"
              action={
                <Tooltip title="Refresh test information">
                  <span>
                    <IconButton size="small" onClick={reloadScenarios} disabled={scenariosLoading} aria-label="Refresh test information">
                      <Refresh />
                    </IconButton>
                  </span>
                </Tooltip>
              }
            />
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 0 }}>
              <Tabs
                value={rightTab}
                onChange={(_, value) => setRightTab(value)}
                variant="scrollable"
                scrollButtons="auto"
                aria-label="Execution details"
                sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}
              >
                <Tab label="Logs" id="studio-tab-logs" aria-controls="studio-panel-logs" />
                <Tab label="Proof" id="studio-tab-proof" aria-controls="studio-panel-proof" />
                <Tab label="Code" id="studio-tab-code" aria-controls="studio-panel-code" />
              </Tabs>

              <Box sx={{ p: 2, flex: 1 }}>
                {saveConflict !== null && (
                  <Alert
                    severity="warning"
                    role="alert"
                    data-testid="save-conflict"
                    sx={{ mb: 2 }}
                    action={<Button color="inherit" size="small" onClick={() => { void reloadSelectedTest(); }}>{RELOAD_TEST_LABEL}</Button>}
                  >
                    <AlertTitle>{saveConflict.code === 'STALE_REVISION' ? SAVE_CONFLICT_TITLE : SAVE_REFUSED_TITLE}</AlertTitle>
                    {saveConflict.code === 'STALE_REVISION'
                      ? SAVE_CONFLICT_STATEMENT
                      : saveConflict.message || 'The save conflicts with the test as the server holds it.'}
                  </Alert>
                )}
                {stopError !== null && <Alert severity="error" sx={{ mb: 2 }}>{stopError}</Alert>}
                {accessDenied !== null && (
                  <Alert severity="error" role="status" aria-label="Live progress feed access refused" sx={{ mb: 2 }}>
                    <AlertTitle>Live progress unavailable</AlertTitle>
                    Access to this run&apos;s progress was refused ({accessDenied}). Reload the test or contact support.
                  </Alert>
                )}
                {accessDenied === null && transportStatus !== null &&
                  (transportStatus.phase === 'reconnecting' || transportStatus.phase === 'falling-back') && (
                    <Alert severity="info" role="status" aria-label={transportStatus.label} sx={{ mb: 2 }}>
                      The run is continuing. Reconnecting to live progress…
                    </Alert>
                  )}

                <Box
                  role="tabpanel"
                  id="studio-panel-logs"
                  aria-labelledby="studio-tab-logs"
                  hidden={rightTab !== 0}
                >
                  {isDirty ? (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      <AlertTitle>Save before running</AlertTitle>
                      Run always uses the saved checklist. Save these changes to make Run available.
                    </Alert>
                  ) : !snapshot && !isRunning ? (
                    <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', mb: 2 }}>
                      <PlayArrow color="primary" sx={{ fontSize: 44 }} />
                      <Typography variant="h6" component="h2">
                        Run your test
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Run saves your steps, prepares them, and records proof.
                      </Typography>
                      {selectedScenarioData?.lastRunStatus && (
                        <Stack spacing={0.5} alignItems="center" sx={{ mt: 2 }}>
                          <Chip
                            size="small"
                            color={executionStatusTone(selectedScenarioData.lastRunStatus)}
                            label={`Previous run: ${executionStatusLabel(selectedScenarioData.lastRunStatus)}`}
                          />
                          <Typography variant="caption" color="text.secondary">
                            Run history may describe an earlier saved version.
                          </Typography>
                        </Stack>
                      )}
                    </Paper>
                  ) : null}

                  {isRunning && currentStep < 0 && (
                    <Box sx={{ mb: 2 }}>
                      <LinearProgress aria-label="Waiting for execution progress" />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Run accepted. Waiting for the browser to start.
                      </Typography>
                    </Box>
                  )}
                  {isRunning && currentStep >= 0 && (
                    <Box sx={{ mb: 2 }}>
                      <LinearProgress
                        aria-label="Test execution progress"
                        variant="determinate"
                        value={testSteps.length ? ((currentStep + 1) / testSteps.length) * 100 : 0}
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Running step {Math.min(currentStep + 1, testSteps.length)} of {testSteps.length}
                      </Typography>
                    </Box>
                  )}
                  {snapshot && (
                    <Box sx={{ mb: 2 }}>
                      <ExecutionTime snapshot={snapshot} running={isRunning} />
                      <ExecutionProgressView
                        snapshot={snapshot}
                        showLogs={false}
                        onRerun={() => setRunRequest((token) => token + 1)}
                        onSeekStep={hasPlayableRecording ? handleSeekStep : undefined}
                      />
                    </Box>
                  )}
                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Code sx={{ fontSize: 18 }} /> Live execution logs
                  </Typography>
                  <Paper variant="outlined" sx={{ minHeight: 360, maxHeight: 520, overflow: 'auto', bgcolor: 'grey.900', color: 'white', fontFamily: 'monospace', fontSize: '0.8rem', p: 1.5 }}>
                    {executionLogs.map((log: { timestamp: string; message: string; type: 'info' | 'error' | 'success' }, index: number) => (
                      <Box key={`${log.timestamp}-${index}`} sx={{ mb: 0.75, display: 'flex', gap: 1 }}>
                        <Typography component="span" sx={{ color: 'grey.400', minWidth: 64, fontFamily: 'inherit', fontSize: 'inherit' }}>{log.timestamp}</Typography>
                        <Typography component="span" sx={{ color: log.type === 'error' ? 'error.light' : 'white', fontFamily: 'inherit', fontSize: 'inherit' }}>{log.message}</Typography>
                      </Box>
                    ))}
                    {executionLogs.length === 0 && <Box sx={{ color: 'grey.400' }}>No logs yet. Run the test to see live output.</Box>}
                  </Paper>
                </Box>

                <Box role="tabpanel" id="studio-panel-proof" aria-labelledby="studio-tab-proof" hidden={rightTab !== 1}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <VideoEvidencePanel ref={videoRef} snapshot={snapshot} />
                  </Paper>
                </Box>

                <Box role="tabpanel" id="studio-panel-code" aria-labelledby="studio-tab-code" hidden={rightTab !== 2}>
                  <CodeTab
                    testId={selectedScenarioData?.id ?? null}
                    active={rightTab === 2}
                    refreshToken={`${selectedScenarioData?.sourceRevision ?? 0}:${selectedScenarioData?.configurationRevision ?? 0}:${selectedScenarioData?.compileStatus ?? ''}`}
                  />
                </Box>

              </Box>
            </CardContent>
          </Card>
        </Grid>
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
            Configure variables referenced in your steps using &lt;var NAME&gt;. Variables are saved
            with the test, together with its steps. Vault-backed secret references are unavailable
            in this production alpha.
          </Typography>
          <Paper variant="outlined" sx={{ p: 1, overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 180 }}>Name</TableCell>
                  <TableCell sx={{ width: 140 }}>Type</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell align="right" sx={{ width: 80 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {variablesList.map((v, i) => (
                  <TableRow key={v.id} hover>
                    <TableCell>
                      <TextField inputProps={{ 'aria-label': `Variable ${i + 1} name` }} size="small" value={v.name} onChange={(e) => {
                        const next = [...variablesList];
                        next[i] = { ...v, name: e.target.value.toUpperCase() };
                        setVariablesList(next);
                      }} placeholder="USERNAME" fullWidth />
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" fullWidth>
                        <Select inputProps={{ 'aria-label': `Variable ${i + 1} type` }} value={v.type} onChange={(e) => {
                          const next = [...variablesList];
                          next[i] = { ...v, type: e.target.value as 'plain' | 'secret' };
                          setVariablesList(next);
                        }}>
                          <MenuItem value="plain">Plain</MenuItem>
                          {STUDIO_CAPABILITIES.vaultSecrets && (
                            <MenuItem value="secret">Secret</MenuItem>
                          )}
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell>
                      {v.type === 'plain' ? (
                        <TextField inputProps={{ 'aria-label': `Variable ${i + 1} value` }} size="small" value={v.value || ''} onChange={(e) => {
                          const next = [...variablesList];
                          next[i] = { ...v, value: e.target.value };
                          setVariablesList(next);
                        }} placeholder="value" fullWidth />
                      ) : (
                        STUDIO_CAPABILITIES.vaultSecrets ? (
                          <SecretInput label="Select secret" value={v.secretId ? { id: v.secretId } : null} onChange={(ref) => {
                            const next = [...variablesList];
                            next[i] = { ...v, secretId: ref?.id };
                            setVariablesList(next);
                          }} />
                        ) : (
                          <Alert severity="info">Vault secrets are unavailable in this alpha.</Alert>
                        )
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton aria-label={`Remove variable ${v.name || i + 1}`} size="small" onClick={() => {
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
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>Use in steps as: &lt;var NAME&gt;</Typography>
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
            disabled={isSaving || editorLocked || !selectedScenarioData}
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
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            A starting checklist you edit, not a finished test. Each one names the controls it
            expects and ends by checking something, so a run that passes has actually proved
            something. Replace the addresses and labels with your application&apos;s own.
          </Typography>
          <Stack spacing={1} mt={2}>
            {PRODUCTION_ALPHA_TEMPLATES.map((template) => (
              <Paper key={template.id} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={700}>{template.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {template.purpose}
                </Typography>
                <Box component="ol" sx={{ pl: 2.5, my: 1.5 }}>
                  {template.steps.map((step, index) => (
                    <Typography
                      key={`${template.id}-${index}`}
                      component="li"
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'list-item', fontFamily: 'monospace' }}
                    >
                      {step}
                    </Typography>
                  ))}
                </Box>
                {template.variables.length > 0 && (
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                    {template.variables.map((variable) => (
                      <Chip
                        key={variable.name}
                        size="small"
                        variant="outlined"
                        color={variable.type === 'secret' ? 'warning' : 'default'}
                        label={
                          variable.type === 'secret'
                            ? `${variable.name} (point this at a vault entry)`
                            : `${variable.name} (needs a value)`
                        }
                      />
                    ))}
                  </Stack>
                )}
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => requestNavigation(() => applyTemplate(template))}
                >
                  Use this template
                </Button>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplatesOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={leaveDialogOpen} onClose={() => setLeaveDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Save changes before continuing?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Your latest checklist, environment, or secret-reference changes have not been saved.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            color="error"
            onClick={() => {
              setLeaveDialogOpen(false);
              const action = pendingNavigationRef.current;
              pendingNavigationRef.current = null;
              action?.();
            }}
          >
            Discard changes
          </Button>
          <Button onClick={() => setLeaveDialogOpen(false)}>Keep editing</Button>
          <Button
            variant="contained"
            onClick={async () => {
              const outcome = await saveDraft();
              if (outcome !== 'saved') return;
              setLeaveDialogOpen(false);
              const action = pendingNavigationRef.current;
              pendingNavigationRef.current = null;
              action?.();
            }}
          >
            Save and continue
          </Button>
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
