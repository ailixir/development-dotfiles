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
import { useDispatch } from 'react-redux';
import { useAppSelector } from '@/store';
import { selectIsSourceEnabled } from '@store/slices/sourcesSlice';
import { selectIsFeatureEnabled } from '@store/slices/featuresSlice';
import { setExecutionLogs, setAllStepResults, setExecuting, setCurrentStep as setCurrentStepAction, clearLogs } from '@store/slices/studioSlice';
import { formatLogTime, toStudioLogLines } from '@/utils/studio/logTime';
import {
  CANONICAL_BROWSER,
  defaultConfiguration,
  DEFAULT_STEP_TIMEOUT_SECONDS,
  isTerminalExecutionStatus,
  type AuthoringStep,
  type ExecutionSnapshot,
  type StudioVariable,
  type TestDetailDto,
  type TestDraftHeader,
  type TestUpdateRequest,
} from '@/types/studio/studioTypes';
import studioApi from '@/services/api/studioApi';
import {
  subscribeToExecution,
  type ExecutionSubscription,
  type TransportStatus,
} from '@/services/api/studioTransportWiring';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import SecretInput from '@/components/studio/SecretInput';
import {
  useStudioCapabilities,
  vaultSecretsEnabled,
} from '@/utils/config/studioCapabilities';
import {
  ExecutionProgressView,
  RunControl,
  executionStatusLabel,
  executionStatusTone,
  type LearnFromRequest,
} from '@/components/studio/run';
import { GuidedSeekControls, VideoEvidencePanel, useVideoSeek } from '@/components/studio/evidence';
import { availableQuickStartTemplates, type QuickStartTemplate } from '@/components/studio/templates';
import {
  GuidedClarification,
  GuidedCompletion,
  GuidedRunStatus,
  PlanExplanation,
  guidedCopy,
} from '@/components/studio/guided';
import {
  useGuidedSession,
  type UseGuidedSessionOptions,
} from '@/components/studio/guided/useGuidedSession';
import {
  ReferencePicker,
  insertAtSelection,
  secretsUnavailableText,
  type InsertedReference,
} from '@/components/studio/references';
import { isGuidedTerminalState } from '@/types/studio/studioGuidedTypes';
import { saveErrorMessage } from './saveErrorMessage';
import { authoredLiteralHintStep } from './authoredLiteralHint';
import { declareInsertedSecret, type EditableVariable } from './secretDeclaration';
import { StudioScheduleDialog } from '@/components/studio/scheduling/StudioScheduleDialog';
import { StudioScheduleSummary } from '@/components/studio/scheduling/StudioScheduleSummary';


function toEditableVariables(variables: StudioVariable[] | null | undefined): EditableVariable[] {
  return (variables ?? []).map((variable, index) => ({
    id: `var_${index}_${variable.name}`,
    name: variable.name,
    type: variable.kind === 'secretRef' ? 'secret' : 'plain',
    value: variable.kind === 'plain' ? variable.value ?? '' : undefined,
    secretId: variable.kind === 'secretRef' ? variable.secretId ?? undefined : undefined,
  }));
}

/**
 * The contract's typed variables. A `secretRef` carries its reference only.
 *
 * Ruling D-8: a `secretRef` always carries the Vault name it points at, and no write sends
 * `secretId` as null, empty or the alias. A secret row the author has not pointed at a secret yet
 * stays visible in the Variables dialog, incomplete, and is not sent until a secret is chosen.
 */
function toContractVariables(rows: EditableVariable[]): StudioVariable[] {
  return rows
    .filter((row) => row.name.trim() !== '')
    .filter((row) => row.type !== 'secret' || (row.secretId ?? '').trim() !== '')
    .map((row) =>
      row.type === 'secret'
        ? { name: row.name.trim(), kind: 'secretRef', secretId: (row.secretId ?? '').trim() }
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

/**
 * A step the author inserts gets a new stable ID here, at the moment of insertion (OpenAPI intro
 * rules; STUDIO-OBS-008 item a). Editing and reordering keep a step's ID, and deleting drops it, so
 * a save sends the server the identity it needs to compute the first changed step.
 */
const newAuthoringStep = (text: string): AuthoringStep => ({ id: crypto.randomUUID(), text });

/** Identity and text only: the editor never edits a step's context, so that is all a change can be in. */
const stepsKey = (steps: readonly AuthoringStep[]): string =>
  JSON.stringify(steps.map((step) => [step.id, step.text]));

/** The DOM id of a step's text field, so a refusal can link to the line it is about. */
const stepInputId = (index: number) => `studio-step-input-${index}`;

/** The never-learned empty state, verbatim from the UX panel 2026-10-09 single-path state model. */
export const NEVER_LEARNED_EMPTY_STATE =
  'Write your steps, then press Run. The first Run works through them on the live page and saves what it learned. Later Runs repeat it in seconds.';

/** Optional knobs for tests; the routed page passes none and uses the hook's defaults. */
export interface ChecksStudioPageProps {
  /** Poll and retry timing of the guided session (`useGuidedSession`). */
  readonly guidedOptions?: UseGuidedSessionOptions;
}

/** Where "Insert reference" puts a token: the step being edited last, or the "Add a test step" field. */
type InsertTarget = { readonly kind: 'new' } | { readonly kind: 'step'; readonly stepId: string };

const ChecksStudioPageInner: React.FC<ChecksStudioPageProps> = ({ guidedOptions }) => {
  const theme = useTheme();
  /** The list projection: names, readiness and run history. It carries no step IDs. */
  const [scenarios, setScenarios] = useState<TestDraftHeader[] | null>(null);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [scenariosLoading, setScenariosLoading] = useState<boolean>(true);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const isRunning = useAppSelector((s: any) => s.studio.isExecuting);
  const currentStep = useAppSelector((s: any) => s.studio.currentStep);
  const [testSteps, setTestSteps] = useState<AuthoringStep[]>([]);
  /**
   * The last `GET /tests/{id}` or save answer for the selected draft. It is the only source of the
   * stable step IDs, the global context and the revisions a save must carry back.
   */
  const [draft, setDraft] = useState<TestDetailDto | null>(null);
  /** The draft the author chose last, so a slow read for an earlier choice cannot overwrite the editor. */
  const latestSelectionRef = useRef<string | null>(null);
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
  const { videoRef, seekToOffset, recordingDurationMs } = useVideoSeek();
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
  /**
   * STUDIO-OBS-008 AC-2: the one guided session this page follows for the selected test, mounted
   * once. It starts, polls, reads the question, finalizes automatically at `FINALIZING` and reads the
   * result; the components below only render what it holds.
   */
  const guided = useGuidedSession(selectedScenario, guidedOptions);
  const guidedView = guided.view;
  const guidedState = guidedView?.session.state ?? null;
  const guidedActive = guidedState !== null && !isGuidedTerminalState(guidedState);
  const guidedTerminal = guidedState !== null && isGuidedTerminalState(guidedState);
  /**
   * The finalize was refused or is waiting for a new sign-in: the Run reads "Steps not ready to
   * repeat." and no longer "Saving what this run learned…" beside it (W5 UX-16).
   */
  const finalizeHeld =
    guidedState === 'FINALIZING' && (guided.pending === 'NOT_READY' || guided.pending === 'REAUTHENTICATION_REQUIRED');
  /**
   * Which Run the Proof tab shows. A replay accepted after a guided session (or after a refused
   * guided start) replaces it on screen; a newer guided session or refusal shows again. Derived, so
   * the first state of a new session is on screen from the render that receives it.
   */
  const [supersededByReplay, setSupersededByReplay] = useState<{
    sessionId: string | null;
    refusal: typeof guided.startRefusal;
  }>({ sessionId: null, refusal: null });
  const guidedSessionId = guidedView?.session.sessionId ?? null;
  /** The session this page follows for the test, known from the pointer before its first read. */
  const followedSessionId = useAppSelector((state) =>
    selectedScenario ? (state.studio.guidedSessionByTestId[selectedScenario] ?? null) : null,
  );
  const guidedVisible = guidedView !== null && guidedSessionId !== supersededByReplay.sessionId;
  const visibleStartRefusal =
    guided.startRefusal !== null && guided.startRefusal !== supersededByReplay.refusal ? guided.startRefusal : null;
  /** A replay in flight, or a guided session that has not ended. Either locks the editor. */
  const running = isRunning || guidedActive;
  const editorLocked = running || isPreparing;
  /** STUDIO-OBS-008 AC-5: the server's capability for this saved test, never a build switch. */
  const capabilities = useStudioCapabilities(selectedScenario);
  const secretsOn = vaultSecretsEnabled(capabilities);
  const secretsNotice = secretsUnavailableText(capabilities);
  const quickStartTemplates = availableQuickStartTemplates(secretsOn);
  const draftStepIds = useMemo(() => testSteps.map((step) => step.id), [testSteps]);
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
  /** The secret ID whose insert was refused because a variable of that name exists (W5-2). */
  const [referenceRefusal, setReferenceRefusal] = useState<string | null>(null);
  const [environment, setEnvironment] = useState('');
  const [rightTab, setRightTab] = useState<'proof' | 'logs'>('proof');
  const [coachStep, setCoachStep] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('studio:coachStep');
      return saved ? Number(saved) : 0;
    } catch { return 0; }
  });
  const [forceCoach, setForceCoach] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const openVariables = useCallback(() => setVariablesOpen(true), []);

  // W5 UX-02: a guided Run's status, question and result are on the Proof tab. No focus moves. The
  // effects are keyed on identities, so an author who opens Logs is not pulled back on every poll,
  // only by a new session or a new question.
  useEffect(() => {
    if (guidedSessionId !== null) setRightTab('proof');
  }, [guidedSessionId]);
  const questionKey =
    guided.clarification === null ? null : `${guided.clarification.clarificationId}:${guided.clarification.generation}`;
  useEffect(() => {
    if (questionKey !== null) setRightTab('proof');
  }, [questionKey]);

  /**
   * "Go to step N" and "None of these — I'll edit step N" move focus to that step's editor row
   * (AC-4; T0 ruling A3). The step is found by stable ID in the current draft. A request waits while
   * the editor is locked (a session still running) and is dropped if the step is not there.
   */
  const [focusRequest, setFocusRequest] = useState<{ stepId: string; token: number } | null>(null);
  const requestStepFocus = useCallback((stepId: string) => {
    setFocusRequest((previous) => ({ stepId, token: (previous?.token ?? 0) + 1 }));
  }, []);
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
  const loadDraftIntoEditor = useCallback((test: TestDetailDto) => {
    setDraft(test);
    setTestSteps(test.steps);
    setVariablesList(toEditableVariables(test.variables));
    setEnvironment(test.environment);
  }, []);

  const isDirty = useMemo(() => {
    if (!draft || draft.id !== selectedScenario) return false;
    return (
      stepsKey(testSteps) !== stepsKey(draft.steps) ||
      JSON.stringify(comparableVariables(toContractVariables(variablesList))) !==
        JSON.stringify(comparableVariables(draft.variables ?? [])) ||
      environment !== draft.environment
    );
  }, [draft, environment, selectedScenario, testSteps, variablesList]);

  /**
   * VAL-036: text typed in "Add a test step" but not yet added. Save and Run add it as a step
   * first, so the author never runs (or saves) a checklist without the step they just wrote.
   */
  const hasPendingStep = newStep.trim() !== '';
  /** VAL-038: the run outcome alerts render here, full width below the header. */
  const [runAlertsSlot, setRunAlertsSlot] = useState<HTMLDivElement | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (focusRequest === null || editorLocked) return;
    setFocusRequest(null);
    const index = testSteps.findIndex((step) => step.id === focusRequest.stepId);
    if (index < 0) return;
    const input = document.getElementById(stepInputId(index));
    if (input instanceof HTMLElement) {
      input.focus();
      input.scrollIntoView?.({ block: 'center' });
    }
  }, [editorLocked, focusRequest, testSteps]);

  /**
   * Puts a Quick Start template into the editor.
   *
   * Steps are replaced; reference rows are **merged**. A template declares the `<var>` / `<secret>`
   * names its steps mention so the first Run does not fail on an undeclared reference, but a
   * row the author already configured (a chosen vault entry, a filled-in value) is left exactly as
   * it is. The template names what is needed, it does not overwrite what is already known.
   */
  const applyTemplate = useCallback((template: QuickStartTemplate) => {
    setTestSteps(template.steps.map(newAuthoringStep));
    setVariablesList((rows) => {
      const known = new Set(rows.map((row) => row.name.trim()));
      const added = template.variables
        .filter((variable) => !known.has(variable.name))
        .map((variable) => ({
          id: `tpl_${template.id}_${variable.name}`,
          name: variable.name,
          type: variable.type,
          value: variable.type === 'plain' ? variable.value ?? '' : undefined,
          // A template's secret NAME is the Vault name the token resolves by (D-8).
          secretId: variable.type === 'secret' ? variable.name : undefined,
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

  const replaceScenario = useCallback((updated: TestDetailDto) => {
    setScenarios((previous) =>
      previous ? previous.map((test) => (test.id === updated.id ? updated : test)) : [updated],
    );
    setDraft(updated);
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
          latestSelectionRef.current = chosen.id;
          // The list carries no step IDs; the single read does, and the editor is built on it.
          const detail = await studioApi.getTest(chosen.id);
          if (!mounted) return;
          loadDraftIntoEditor(detail);
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
   * **10.11a owns whether a run may start.** `RunControl` holds the gate (`readiness ===
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
    setSupersededByReplay({ sessionId: guidedSessionId, refusal: guided.startRefusal });
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
  }, [closeSubscription, dispatch, guidedSessionId, guided.startRefusal]);

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
    setSupersededByReplay({ sessionId: null, refusal: null });
    setFocusRequest(null);
    setReferenceRefusal(null);
    dispatch(setExecuting(false));
    setSelectedScenario(scenarioId);
    latestSelectionRef.current = scenarioId;
    const scenario = scenarios?.find(s => s.id === scenarioId);
    if (scenario) {
      // The previous draft's steps must not stay on screen while the next one is read.
      setDraft(null);
      setTestSteps([]);
      dispatch(setCurrentStepAction(0));
      dispatch(setAllStepResults([] as any));
      dispatch(clearLogs());
      studioApi.getTest(scenarioId).then(
        (detail) => {
          if (latestSelectionRef.current === scenarioId) loadDraftIntoEditor(detail);
        },
        (error: unknown) => {
          if (latestSelectionRef.current !== scenarioId) return;
          const message = (error as { message?: string })?.message;
          setSaveSnack({ open: true, message: message || 'Failed to load the test', severity: 'error' });
        },
      );
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
      setRightTab('proof');
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
   * engine, and the per-step timeout is always the default, whatever an older draft recorded:
   * authors do not set it, so a save normalises a stored value to the default.
   */
  const saveDraft = useCallback(async (): Promise<SaveOutcome> => {
    const test = draft;
    if (!test) return 'error';
    // VAL-036: a step still sitting in the add field is added before the draft is saved.
    const steps = newStep.trim() ? [...testSteps, newAuthoringStep(newStep)] : testSteps;
    if (steps !== testSteps) {
      setTestSteps(steps);
      setNewStep('');
    }
    // The v2 write: every step under the ID it was read or inserted with, and the global context
    // the editor never touches handed back unchanged, or the server would drop it.
    const body: TestUpdateRequest = {
      authoringSchemaVersion: 2,
      name: test.name,
      description: test.description ?? null,
      csiId: test.csiId,
      environment,
      steps,
      ...(test.globalContext ? { globalContext: test.globalContext } : {}),
      variables: toContractVariables(variablesList),
      configuration: {
        ...defaultConfiguration(),
        ...test.configuration,
        browser: CANONICAL_BROWSER,
        timeoutSeconds: DEFAULT_STEP_TIMEOUT_SECONDS,
      },
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
      // VAL-027: an author-facing 400 shows the server's own message; anything else stays generic.
      setSaveSnack({ open: true, message: saveErrorMessage(error), severity: 'error' });
      return 'error';
    } finally {
      setIsSaving(false);
    }
  }, [draft, environment, newStep, replaceScenario, testSteps, variablesList]);

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
   * A guided session this page followed has just ended: read the test again, because its readiness
   * may have changed (learned, or still not ready). This is a read, never a run: learning completion
   * and finalization never cause a second execution (AC-2).
   */
  const [guidedRefresh, setGuidedRefresh] = useState(0);
  const previousGuidedState = useRef<typeof guidedState>(null);
  useEffect(() => {
    const previous = previousGuidedState.current;
    previousGuidedState.current = guidedState;
    if (guidedState === null || !isGuidedTerminalState(guidedState)) return;
    if (previous === null || isGuidedTerminalState(previous)) return;
    const id = latestSelectionRef.current;
    if (!id) return;
    studioApi.getTest(id).then(
      (fresh) => {
        if (latestSelectionRef.current !== id) return;
        replaceScenario(fresh);
        setGuidedRefresh((count) => count + 1);
      },
      () => undefined,
    );
  }, [guidedState, replaceScenario]);

  /**
   * W5-1 (ruling `w5-unreadable-and-alias.md` §2): the followed session's read was refused before any
   * view of it loaded, so the hook keeps the pointer and starts nothing. A fresh `GET /tests/{id}`,
   * sent after that refusal, that answers `UNLEARNED` or `NEEDS_RELEARN` proves the session is no
   * longer live (a live one reads `LEARNING`, or `READY` for a learn-again), so the pointer is dropped
   * and the gate reads again. `LEARNING`, `READY` or a failed read change nothing. One read per
   * unreadable transition or "Refresh test information" press: no timer, no poll. It never calls
   * `replaceScenario`, which would overwrite a dirty draft, and never reuses an earlier body.
   */
  const [unreadableRecheck, setUnreadableRecheck] = useState(0);
  const followedSessionRef = useRef<string | null>(null);
  followedSessionRef.current = followedSessionId;
  const unreadableRef = useRef(false);
  unreadableRef.current = guided.unreadable;
  const { clear: clearGuided } = guided;
  useEffect(() => {
    if (!guided.unreadable) return;
    const id = selectedScenario;
    const sid = followedSessionId;
    if (!id || !sid) return;
    studioApi.getTest(id).then(
      (fresh) => {
        // The answer must still be about the test and the session it was asked for.
        if (latestSelectionRef.current !== id || followedSessionRef.current !== sid || !unreadableRef.current) return;
        if (fresh.readiness === 'UNLEARNED' || fresh.readiness === 'NEEDS_RELEARN') {
          clearGuided();
          setGuidedRefresh((count) => count + 1);
        }
      },
      () => undefined,
    );
    // One read per unreadable transition or Refresh press (ruling §2 "Re-check"); no timer, no poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guided.unreadable, unreadableRecheck]);

  /** One answer or cancel at a time for the pending question, so neither is sent twice. */
  const [questionBusy, setQuestionBusy] = useState(false);
  const { answer: answerGuided, cancel: cancelGuided } = guided;
  const answerQuestion = useCallback(
    async (choiceId: string) => {
      setQuestionBusy(true);
      try {
        await answerGuided(choiceId);
      } finally {
        setQuestionBusy(false);
      }
    },
    [answerGuided],
  );
  /**
   * T0 ruling A3: "None of these — I'll edit step N", and declining a side-effect confirmation,
   * cancel the session with `reason: userRequested` under its one stable key, and only then move
   * focus to step N's editor row. Never a `clarify`, never a second cancel, never a new start. The
   * server's answer is shown as it is (the existing `CANCELLED` narrative, or whatever state the
   * session had already reached).
   */
  const noneOfThese = useCallback(
    async (stepId: string) => {
      setQuestionBusy(true);
      try {
        await cancelGuided();
      } finally {
        setQuestionBusy(false);
      }
      requestStepFocus(stepId);
    },
    [cancelGuided, requestStepFocus],
  );

  /** Stop during a guided session cancels it, once; the session's own terminal state ends it. */
  const [guidedStopping, setGuidedStopping] = useState(false);
  useEffect(() => {
    if (!guidedActive) setGuidedStopping(false);
  }, [guidedActive]);
  const stopGuided = useCallback(() => {
    if (guidedStopping) return;
    setGuidedStopping(true);
    void cancelGuided();
  }, [cancelGuided, guidedStopping]);

  /**
   * "Learn again from step N" after a replay drift (T0 ruling A1.6): a request to the one Run gate,
   * which saves if needed, re-reads the test, re-checks the A1 conditions and only then starts.
   */
  const [learnRequest, setLearnRequest] = useState<{ token: number; request: LearnFromRequest } | null>(null);
  const learnAgain = useCallback((stepId: string, revisionId: string) => {
    setLearnRequest((previous) => ({
      token: (previous?.token ?? 0) + 1,
      request: { kind: 'drift', stepId, revisionId },
    }));
  }, []);

  /**
   * "Insert reference" (AC-5(b)) puts a `<var NAME>` or `<secret ID>` token at the caret of the step
   * edited last, or of the "Add a test step" field. A secret also gets its declaration, a `secretRef`
   * whose `secretId` is that Vault name, unless the test already declares one (D-8).
   */
  const insertTargetRef = useRef<InsertTarget>({ kind: 'new' });
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const trackCaret = useCallback(
    (target: InsertTarget) =>
      (event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const field = event.currentTarget;
        insertTargetRef.current = target;
        selectionRef.current = {
          start: field.selectionStart ?? field.value.length,
          end: field.selectionEnd ?? field.value.length,
        };
      },
    [],
  );
  const insertReference = useCallback(
    (reference: InsertedReference) => {
      // W5-2: a secret whose ID is already the name of another declaration is refused before anything
      // is inserted, because the backend refuses such a set at start (no token, no row, no alias).
      let declared: EditableVariable[] | null = null;
      if (reference.kind === 'secret') {
        const outcome = declareInsertedSecret(variablesList, reference.name);
        if (!outcome.ok) {
          setReferenceRefusal(reference.name);
          return;
        }
        declared = outcome.rows;
      }
      setReferenceRefusal(null);
      const target = insertTargetRef.current;
      const selection = selectionRef.current;
      const place = (text: string) => {
        const placed = insertAtSelection(
          text,
          selection?.start ?? text.length,
          selection?.end ?? text.length,
          reference.token,
        );
        selectionRef.current = { start: placed.caret, end: placed.caret };
        return placed.text;
      };
      const step = target.kind === 'step' ? testSteps.find((candidate) => candidate.id === target.stepId) : undefined;
      if (step) {
        const text = place(step.text);
        setTestSteps((previous) =>
          previous.map((candidate) => (candidate.id === step.id ? { ...candidate, text } : candidate)),
        );
      } else {
        insertTargetRef.current = { kind: 'new' };
        setNewStep((previous) => place(previous));
      }
      // F-L5b-4: declared by secretId (D-8 kept).
      if (declared !== null) setVariablesList(declared);
    },
    [testSteps, variablesList],
  );
  const plainVariableNames = useMemo(
    () => variablesList.filter((row) => row.type === 'plain').map((row) => row.name.trim()).filter(Boolean),
    [variablesList],
  );

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
      setTestSteps(prev => [...prev, newAuthoringStep(newStep)]);
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
              UI Tests
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
          <Button disabled={!selectedScenarioData} onClick={() => setScheduleOpen(true)} sx={{ minHeight: 42 }}>Manage schedule</Button>
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
            refreshToken={`${selectedScenarioData?.sourceRevision ?? 0}:${selectedScenarioData?.configurationRevision ?? 0}:${selectedScenarioData?.readiness ?? ''}:${selectedScenarioData?.confirmedRevisionId ?? ''}:${guidedRefresh}`}
            isRunning={running}
            onPreparingChange={setIsPreparing}
            isDirty={isDirty || hasPendingStep}
            onSaveBeforeRun={saveDraft}
            hasSteps={testSteps.length > 0 || hasPendingStep}
            runRequest={runRequest}
            onAccepted={(executionId) => {
              setRightTab('proof');
              beginRun(executionId);
            }}
            onStop={guidedActive ? stopGuided : handleStop}
            isStopping={guidedActive ? guidedStopping : isStopping}
            alertsContainer={runAlertsSlot}
            startLearn={guided.startLearn}
            guidedStartRefusal={visibleStartRefusal}
            onOpenVariables={openVariables}
            learnRequest={learnRequest}
            followsLearningSession={followedSessionId !== null && !guidedTerminal}
            sessionUnreadable={guided.unreadable}
          />
        </Stack>
      </Paper>
      {selectedScenarioData && <Box sx={{ mb: 2 }}><StudioScheduleSummary testId={selectedScenarioData.id}
        refreshToken={`${selectedScenarioData.sourceRevision}:${selectedScenarioData.configurationRevision}:${selectedScenarioData.confirmedRevisionId ?? ''}`} /></Box>}
      <StudioScheduleDialog test={scheduleOpen ? selectedScenarioData : null} dirty={isDirty || hasPendingStep} onClose={() => setScheduleOpen(false)} />

      {/* VAL-038: Run's outcome alerts, full width so the header keeps its title and actions. */}
      <Box
        ref={setRunAlertsSlot}
        data-testid="run-alerts-slot"
        sx={{ mt: -2, mb: 3, '&:empty': { display: 'none' } }}
      />

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
                {secretsNotice !== null && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }} data-testid="secrets-availability">
                    {secretsNotice}
                  </Typography>
                )}
              </Box>

              {/* Test Steps */}
              <Box sx={{ p: 2 }}>
                {/* Onboarding coach - Step 0 */}
                {/* Lightweight onboarding to guide the flow */}
                {/* The coach position (not test content) is kept in localStorage */}
                {coachStep === 0 && (
                  <OnboardingCoach
                    step={0}
                    onNext={() => setCoachStep(1)}
                    onDismiss={() => setCoachStep(99)}
                    capabilities={capabilities}
                  />
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
                    <Typography variant="body2" data-testid="never-learned-empty-state" sx={{ mb: 1 }}>
                      {NEVER_LEARNED_EMPTY_STATE}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Name every control in quotes and finish with something to check:
                      <br />• Go to &quot;https://www.saucedemo.com/&quot;
                      <br />• Type &quot;&lt;var USERNAME&gt;&quot; in the &quot;Username&quot; field
                      <br />• Click the &quot;Login&quot; button
                      <br />• Check that the URL contains &quot;/inventory.html&quot;
                      <br />
                      {secretsOn
                        ? 'A name in <var NAME> or <secret NAME> has to match a row in Variables.'
                        : 'A name in <var NAME> has to match a row in Variables.'}
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
                        key={step.id}
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
                            inputProps={{
                              'aria-label': `Step ${index + 1}`,
                              id: stepInputId(index),
                              'data-step-id': step.id,
                              onSelect: trackCaret({ kind: 'step', stepId: step.id }),
                              onFocus: trackCaret({ kind: 'step', stepId: step.id }),
                            }}
                            value={step.text}
                            disabled={editorLocked}
                            onChange={(e) => {
                              const next = [...testSteps];
                              next[index] = { ...next[index], text: e.target.value };
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
                    helperText="Press Enter to add the step. Shift+Enter starts a new line."
                    inputProps={{
                      onSelect: trackCaret({ kind: 'new' }),
                      onFocus: trackCaret({ kind: 'new' }),
                    }}
                    onKeyDown={(event) => {
                      // VAL-036: Enter adds the step; Shift+Enter keeps the multiline newline.
                      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
                      event.preventDefault();
                      addTestStep();
                    }}
                    InputProps={{
                      endAdornment: (
                        <IconButton aria-label="Add step" size="small" onClick={addTestStep} disabled={editorLocked || !newStep.trim()}>
                          <Add />
                        </IconButton>
                      )
                    }}
                  />
                  <Box sx={{ mt: 1 }}>
                    <ReferencePicker
                      testId={selectedScenarioData?.id ?? null}
                      variableNames={plainVariableNames}
                      capabilities={capabilities}
                      onInsert={insertReference}
                      disabled={editorLocked || !selectedScenarioData}
                    />
                    {referenceRefusal !== null && (
                      <Typography
                        variant="caption"
                        color="error"
                        data-testid="reference-insert-refused"
                        sx={{ display: 'block', mt: 1, overflowWrap: 'anywhere' }}
                      >
                        {guidedCopy('secretNameTaken', { ID: referenceRefusal })}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Right panel - Proof, Logs, and Source */}
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<PlayArrow sx={{ color: 'primary.main' }} />}
              title="Run & proof"
              subheader="Execution and evidence"
              action={
                <Tooltip title="Refresh test information">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => {
                        if (guided.unreadable) setUnreadableRecheck((count) => count + 1);
                        void reloadScenarios();
                      }}
                      disabled={scenariosLoading}
                      aria-label="Refresh test information"
                    >
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
                <Tab value="proof" label="Proof" id="studio-tab-proof" aria-controls="studio-panel-proof" />
                <Tab value="logs" label="Logs" id="studio-tab-logs" aria-controls="studio-panel-logs" />
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

                <Box role="tabpanel" id="studio-panel-proof" aria-labelledby="studio-tab-proof" hidden={rightTab !== 'proof'}>
                  {isDirty || hasPendingStep ? (
                    <Alert severity="info" sx={{ mb: 2 }} data-testid="run-unsaved-notice">
                      <AlertTitle>Unsaved changes</AlertTitle>
                      Run will save them first, then run the saved checklist.
                    </Alert>
                  ) : !snapshot && !running && !guidedVisible ? (
                    <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', mb: 2 }}>
                      <PlayArrow color="primary" sx={{ fontSize: 44 }} />
                      <Typography variant="h6" component="h2">
                        Run your test
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Run saves your steps and records proof.
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

                  {guidedVisible && guidedView ? (
                    /*
                     * STUDIO-OBS-008: the guided Run on screen. Live state (AC-3), the one pending
                     * question (AC-3, A3), how it ended (AC-3, AC-4, AC-6), the plan as learned
                     * (AC-6) and its recording with named seeks (AC-7). Pending, re-authentication and
                     * a refused finalize read as not ready, never as published (AC-2).
                     */
                    <Stack spacing={2} data-testid="guided-run" sx={{ mb: 2, minWidth: 0 }}>
                      {(guided.pending === 'NOT_READY' || guided.pending === 'REAUTHENTICATION_REQUIRED') && (
                        <Alert severity="info" data-testid="guided-pending" data-pending={guided.pending}>
                          {guidedCopy('notReadyNow')}
                        </Alert>
                      )}
                      {!finalizeHeld && <GuidedRunStatus session={guidedView.session} draftStepIds={draftStepIds} />}
                      {guidedState === 'AWAITING_CLARIFICATION' && guided.clarification !== null && (
                        <GuidedClarification
                          clarification={guided.clarification}
                          step={guidedView.session.progress.activeStep}
                          onAnswer={(choiceId) => { void answerQuestion(choiceId); }}
                          onNoneOfThese={(stepId) => { void noneOfThese(stepId); }}
                          disabled={questionBusy}
                        />
                      )}
                      {guidedTerminal && guided.result !== null && (
                        <>
                          <GuidedCompletion
                            input={{
                              kind: 'guided',
                              result: guided.result,
                              firstLearnStepId: guidedView.session.firstLearnStepId ?? null,
                            }}
                            draftStepIds={draftStepIds}
                            onGoToStep={requestStepFocus}
                            onOpenVariables={openVariables}
                            authoredLiteralHintStep={authoredLiteralHintStep(guided.result, testSteps)}
                          />
                          <PlanExplanation result={guided.result} />
                        </>
                      )}
                      <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
                        {guided.result !== null ? (
                          <Stack spacing={1.5}>
                            <VideoEvidencePanel
                              ref={videoRef}
                              guided={{ sessionId: guided.result.sessionId, result: guided.result }}
                            />
                            <GuidedSeekControls
                              result={guided.result}
                              onSeek={handleSeekStep}
                              recording={{ durationMs: recordingDurationMs }}
                            />
                          </Stack>
                        ) : (
                          <VideoEvidencePanel ref={videoRef} snapshot={null} />
                        )}
                      </Paper>
                    </Stack>
                  ) : (
                    <>
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
                          {snapshot.status === 'PASSED' && (
                            <Box sx={{ mb: 1.5 }}>
                              <GuidedCompletion
                                input={{ kind: 'replay', snapshot }}
                                draftStepIds={draftStepIds}
                                onGoToStep={requestStepFocus}
                                onOpenVariables={openVariables}
                              />
                            </Box>
                          )}
                          <ExecutionProgressView
                            snapshot={snapshot}
                            showLogs={false}
                            onRerun={() => setRunRequest((token) => token + 1)}
                            onSeekStep={hasPlayableRecording ? handleSeekStep : undefined}
                            replayContext={{
                              draftStepIds,
                              test: draft,
                              onGoToStep: requestStepFocus,
                              onOpenVariables: openVariables,
                              onLearnAgain: learnAgain,
                              disabled: editorLocked,
                            }}
                          />
                        </Box>
                      )}
                      <Paper variant="outlined" sx={{ p: 2 }}>
                        <VideoEvidencePanel ref={videoRef} snapshot={snapshot} />
                      </Paper>
                    </>
                  )}
                </Box>

                <Box role="tabpanel" id="studio-panel-logs" aria-labelledby="studio-tab-logs" hidden={rightTab !== 'logs'}>
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
            with the test, together with its steps.
          </Typography>
          {secretsNotice !== null && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} data-testid="variables-secrets-availability">
              {secretsNotice}
            </Typography>
          )}
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
                          {(secretsOn || v.type === 'secret') && (
                            <MenuItem value="secret" disabled={!secretsOn}>Secret</MenuItem>
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
                        secretsOn ? (
                          <SecretInput label="Select secret" testId={selectedScenario} value={v.secretId ? { id: v.secretId } : null} onChange={(ref) => {
                            const next = [...variablesList];
                            next[i] = { ...v, secretId: ref?.id };
                            setVariablesList(next);
                          }} />
                        ) : (
                          <Alert severity="info">{secretsNotice}</Alert>
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
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      {secretsOn ? 'Use in steps as: <var NAME> or <secret SECRET_ID>' : 'Use in steps as: <var NAME>'}
                    </Typography>
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
            {quickStartTemplates.map((template) => (
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

const ChecksStudioPage: React.FC<ChecksStudioPageProps> = (props) => {
  const uiTestEnabled = useAppSelector(selectIsSourceEnabled('UI_TEST'));
  const studioFeatureEnabled = useAppSelector(selectIsFeatureEnabled('STUDIO'));
  if (!uiTestEnabled || !studioFeatureEnabled) return <StudioUnavailable />;
  return <ChecksStudioPageInner {...props} />;
};

export default ChecksStudioPage;
