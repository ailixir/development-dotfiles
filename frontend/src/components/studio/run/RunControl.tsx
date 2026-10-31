import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Alert, AlertTitle, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { PlayArrow, Stop } from '@mui/icons-material';
import type { GuidedStartRefusal, GuidedStartRequest } from '@/types/studio/studioGuidedTypes';
import {
  GuidedStartFeedback,
  guidedStartFeedbackView,
  type GuidedStartFeedbackInput,
} from '@/components/studio/guided/GuidedCompletion';
import { ReadinessChip } from '@/components/studio/guided/ReadinessChip';
import { guidedCopy, stepNumberIn } from '@/components/studio/guided/guidedNarratives';
import { LEARNED_LIMITS_CAPTION } from './runEnablement';
import { useRunGate, type LearnFromRequest, type RunSaveOutcome } from './useRunGate';

/**
 * The single Run entry point (story 10.11a; STUDIO-OBS-008 AC-2).
 *
 * Run saves the author's edits if there are any, re-reads the test, and then acts on the server's
 * readiness: `READY` replays the learned revision, `UNLEARNED` starts a guided learning session,
 * `NEEDS_RELEARN` starts a mixed-mode session from the server's first changed step, and `LEARNING`
 * keeps Run disabled while the session runs. The guided session itself is the page's
 * `useGuidedSession`, passed in as `startLearn`; this control owns only whether and how a start is
 * sent. A refused or unavailable start is shown inline as feedback, never as a session (architect P4).
 */
export const RUN_LABEL = 'Run Test';
export const STOP_LABEL = 'Stop';
export const STOPPING_LABEL = 'Stopping…';
export const SAVING_LABEL = 'Saving…';
export const STARTING_LABEL = 'Starting…';
/**
 * The widest the captions beside Run may grow, in px. A caption wraps inside this width instead of
 * widening the Run column and squeezing the editor header's title (STUDIO-UNIFY-001.6 AC-05, D6).
 */
export const RUN_CAPTION_MAX_WIDTH = 280;

export interface RunControlProps {
  /** The draft to run. Null while no scenario is selected. */
  readonly testId: string | null;
  /** Whether a run is already on screen. The page owns this until story 10.11b lands. */
  readonly isRunning?: boolean;
  readonly onStop?: () => void;
  /**
   * True from the moment Stop asked the server to cancel until the run's terminal snapshot arrives.
   * Stop only asks: the run is not over until the server says so, so the control says "Stopping…"
   * and cannot be pressed again in that window.
   */
  readonly isStopping?: boolean;
  readonly onAccepted?: (executionId: string) => void;
  readonly onPreparingChange?: (preparing: boolean) => void;
  /** Rendered beside the control when the draft has no steps to run. */
  readonly hasSteps?: boolean;
  /** Visible editor state differs from the saved draft. Run saves it before running. */
  readonly isDirty?: boolean;
  /**
   * Persists the author's unsaved edits, so Run never dispatches unsaved content.
   *
   * The page owns saving — it holds the draft, its revisions and the conflict alert — so Run asks
   * it rather than holding a second save with a second idea of the revisions. Without this the
   * control falls back to refusing a dirty draft, which is the state this story removes.
   */
  readonly onSaveBeforeRun?: () => Promise<RunSaveOutcome>;
  /** Changes after Save so the control refreshes the server-held checklist without remounting. */
  readonly refreshToken?: string | number;
  /**
   * A programmatic request to run, as a monotonically increasing token.
   *
   * Two callers need one: `?autorun=1`, and the *"Run again"* affordance the terminal-error
   * surface offers for the three codes the document clears with a new execution. Both are routed
   * **through this control** rather than around it, so every activation path in the application
   * is governed by the same server-readiness predicate. The page previously called its own
   * `handleRunTest` on a timer for the deep link, which was a second activation path holding a
   * second copy of the gate — and the copy it held was the grammar one.
   *
   * A token rather than a boolean, because a re-run is a repeatable request and a boolean can
   * only be true once. Each new value fires at most one `gate.run()`, and only when the gate says
   * the draft is runnable.
   */
  readonly runRequest?: number;
  /**
   * `?autorun=1`, as its own request so "Run again" (`runRequest`) is unchanged (STUDIO-UNIFY-001,
   * DC-01). It is evaluated **once**, when the gate has read the test (answered or failed) and the
   * page has armed it with the draft's steps known. At that
   * moment it is served if Run is runnable and dropped if not; it never waits for a later change
   * (a learn ending, a refresh, a first typed step). A press of Run or Stop, a learn-from or "Run
   * again" request before then drops it too. `testId` names the test it was armed for.
   */
  readonly autorunRequest?: { readonly token: number; readonly testId: string } | null;
  /** The autorun request was served or dropped: the page forgets it. */
  readonly onAutorunSettled?: () => void;
  /**
   * Where the refusal alerts render (VAL-038). The control sits in the page
   * header, and a full alert there squeezes the title and pushes the actions around, so the page
   * gives it a full-width slot below the header. Without one the alerts render under the button.
   */
  readonly alertsContainer?: HTMLElement | null;
  /**
   * Where the three captions beside Run render: why a start was not made (`run-start-unavailable`),
   * why Run is disabled (`run-not-permitted`) and "Add a step" (`run-blocked-reason`). They are as tall
   * as the button again or more, so a header that must stay short gives them a slot of their own under
   * it (STUDIO-UNIFY-001.6 AC-05). Without one they render under the button, as before.
   */
  readonly captionContainer?: HTMLElement | null;
  /**
   * Starts a guided learning session: the page's `useGuidedSession(testId).startLearn`
   * (STUDIO-OBS-008 AC-2). Without it, a draft that needs learning cannot be run from here.
   */
  readonly startLearn?: (request: GuidedStartRequest) => Promise<void>;
  /** The server's refusal of the last guided start, shown inline as feedback (architect P4). */
  readonly guidedStartRefusal?: GuidedStartRefusal | null;
  /** "Open Variables" from a `MISSING_SOURCE` start refusal: the page's saved-inputs dialog. */
  readonly onOpenVariables?: () => void;
  /**
   * A request to learn from a named step ("Learn again from step N" after a replay drift), as a
   * monotonically increasing token, so it goes through this control's one gate like `runRequest`.
   */
  readonly learnRequest?: { readonly token: number; readonly request: LearnFromRequest } | null;
  /**
   * True while the page itself follows a guided session for this test. When the server says
   * `LEARNING` and this is false, the session is one the page cannot show (another tab or user), and
   * the control says so in visible text beside the disabled Run (ADR-SC-006; L5b-F1).
   */
  readonly followsLearningSession?: boolean;
  /**
   * True when the page follows a stored session whose read was refused before any view of it loaded
   * (`useGuidedSession().unreadable`). Learning never starts from here while it holds. Learn, relearn
   * and busy modes keep Run off with the caption. A READY replay stays enabled, and a learn-again
   * request is dropped with the caption shown (ruling w5-unreadable-and-alias §2-3).
   */
  readonly sessionUnreadable?: boolean;
}

export const RunControl: React.FC<RunControlProps> = ({
  testId,
  isRunning = false,
  onStop,
  isStopping = false,
  onAccepted,
  onPreparingChange,
  hasSteps = true,
  isDirty = false,
  onSaveBeforeRun,
  refreshToken,
  runRequest = 0,
  autorunRequest = null,
  onAutorunSettled,
  alertsContainer,
  captionContainer,
  startLearn,
  guidedStartRefusal = null,
  onOpenVariables,
  learnRequest = null,
  followsLearningSession = false,
  sessionUnreadable = false,
}) => {
  const gate = useRunGate(testId, onAccepted, refreshToken, {
    saveBeforeRun: onSaveBeforeRun,
    isDirty,
    isRunning,
    startLearn,
  });
  // A replay posts `POST /tests/{id}/execute` and never touches the guided session, so only the modes
  // that start learning are blocked by an unreadable stored session (W5-1).
  const runnable = gate.canRun && hasSteps && !(sessionUnreadable && gate.mode !== 'replay');
  /** A learn-again request arrived while the stored session was unreadable: dropped, and said so. */
  const [learnBlocked, setLearnBlocked] = useState(false);

  /**
   * The readiness chip (AC-3, D-4): "Learned · ready to repeat", or the `NEEDS_RELEARN` sentence
   * naming k. Hidden while the editor holds unsaved edits, because saving them can change the steps
   * and so the readiness (UX-A11Y-001); and while a run is on screen, which speaks for itself.
   */
  const chipTest = !isDirty && !isRunning ? gate.test : null;

  /** `LEARNING`, and not a session this page is following: state and consequence, in text. */
  const learningElsewhere = gate.mode === 'busy' && !isRunning && !followsLearningSession;

  /** A start the client stopped itself, or the server refused: inline feedback, not a state (P4). */
  const startFeedback: GuidedStartFeedbackInput | null =
    gate.learnBlock?.kind === 'unavailable'
      ? { kind: 'unavailable', code: gate.learnBlock.code }
      : guidedStartRefusal !== null && gate.phase === 'idle'
        ? { kind: 'refusal', refusal: guidedStartRefusal }
        : null;

  /**
   * Learning could not start and nothing was started. Run stays enabled, because capabilities are
   * read only after the press (`useRunGate`), so a caption beside it says what to do next
   * (STUDIO-UNIFY-001.5 AC-01). It is absent whenever no such refusal is on screen.
   */
  const startUnavailable = startFeedback !== null && guidedStartFeedbackView(startFeedback).unavailable;

  const busyLabel = (() => {
    switch (gate.phase) {
      case 'saving':
        return SAVING_LABEL;
      case 'starting':
        return STARTING_LABEL;
      case 'idle':
      default:
        return null;
    }
  })();

  useEffect(() => {
    onPreparingChange?.(gate.executeInFlight && !isRunning);
    return () => onPreparingChange?.(false);
  }, [gate.executeInFlight, isRunning, onPreparingChange]);

  /**
   * The autorun token last served or dropped. A user activation (Run, Stop, a re-run, a learn-from)
   * marks the pending token consumed, so nothing is sent for it afterwards.
   */
  const settledAutorun = useRef(0);
  const autorunTokenRef = useRef(autorunRequest?.token ?? 0);
  autorunTokenRef.current = autorunRequest?.token ?? autorunTokenRef.current;
  const dropAutorun = () => {
    if (autorunTokenRef.current > settledAutorun.current) {
      settledAutorun.current = autorunTokenRef.current;
      onAutorunSettled?.();
    }
  };
  const onAutorunSettledRef = useRef(onAutorunSettled);
  onAutorunSettledRef.current = onAutorunSettled;
  useEffect(() => {
    if (autorunRequest === null || autorunRequest.token <= settledAutorun.current) return;
    // Armed for another test (the route moved on): the page drops it; nothing is consumed here.
    if (autorunRequest.testId !== testId) return;
    // Not settled yet: the test read must have answered or failed.
    if (gate.loading || !gate.readDone) return;
    settledAutorun.current = autorunRequest.token;
    onAutorunSettledRef.current?.();
    if (!runnable || isRunning) return;
    setLearnBlocked(false);
    gate.run();
  }, [autorunRequest, testId, gate, runnable, isRunning]);

  const servedRunRequest = useRef(0);
  useEffect(() => {
    if (runRequest <= servedRunRequest.current || !runnable || isRunning) return;
    servedRunRequest.current = runRequest;
    dropAutorun();
    setLearnBlocked(false);
    gate.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runRequest, runnable, isRunning, gate]);

  const servedLearnRequest = useRef(0);
  useEffect(() => {
    if (learnRequest === null || learnRequest.token <= servedLearnRequest.current || isRunning) return;
    // The token is consumed either way, so a request dropped while unreadable never fires later,
    // when the session reads: nothing starts on its own (W5-11).
    servedLearnRequest.current = learnRequest.token;
    dropAutorun();
    if (sessionUnreadable) {
      setLearnBlocked(true);
      return;
    }
    setLearnBlocked(false);
    gate.learnFrom(learnRequest.request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnRequest, isRunning, sessionUnreadable, gate]);

  const stopLabel = isStopping ? STOPPING_LABEL : STOP_LABEL;

  const alerts = (
    <>
      {gate.refusal && (
        <Alert
          severity={gate.refusal.narrative.scope === 'platform' ? 'warning' : 'error'}
          role="alert"
          aria-label={gate.refusal.narrative.title}
          data-testid={
            gate.refusal.narrative.scope === 'platform'
              ? 'run-refusal-platform-banner'
              : 'run-refusal'
          }
          sx={{ mt: 2 }}
        >
          <AlertTitle data-testid="run-refusal-title">{gate.refusal.narrative.title}</AlertTitle>
          <Stack spacing={0.5}>
            <Typography variant="body2" data-testid="run-refusal-explanation">
              {gate.refusal.narrative.explanation}
            </Typography>
            <Typography variant="body2" data-testid="run-refusal-remedy">
              {gate.refusal.narrative.whoClearsIt}
            </Typography>
            {gate.refusal.serverMessage && (
              <Typography
                variant="caption"
                color="text.secondary"
                data-testid="run-refusal-server-message"
              >
                {`The server said: ${gate.refusal.serverMessage}`}
              </Typography>
            )}
          </Stack>
        </Alert>
      )}
      {startFeedback !== null && (
        <Box sx={{ mt: 2 }}>
          <GuidedStartFeedback
            input={startFeedback}
            onLearnFromFirstStep={() => gate.learnFrom({ kind: 'firstStep' })}
            onOpenVariables={() => onOpenVariables?.()}
            disabled={isRunning || gate.phase !== 'idle' || sessionUnreadable}
          />
        </Box>
      )}
      {gate.learnBlock?.kind === 'mismatch' && (
        <Alert severity="warning" data-testid="guided-start-mismatch" sx={{ mt: 2 }}>
          {guidedCopy('revisionNotReady')}
        </Alert>
      )}
    </>
  );

  /** The captions beside Run: in place under the button, or in the page's caption slot. */
  const captions = (
    <>
      {startUnavailable && (
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid="run-start-unavailable"
          sx={{ display: 'block', mt: 1, maxWidth: RUN_CAPTION_MAX_WIDTH, overflowWrap: 'anywhere' }}
        >
          {guidedCopy('startUnavailableCaption')}
        </Typography>
      )}

      {!isRunning && !hasSteps && (
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid="run-blocked-reason"
          sx={{ display: 'block', mt: 1, maxWidth: RUN_CAPTION_MAX_WIDTH, overflowWrap: 'anywhere' }}
        >
          Add a step to run this test.
        </Typography>
      )}
    </>
  );

  return (
    <Box sx={{ maxWidth: { lg: RUN_CAPTION_MAX_WIDTH } }}>
      <Button
        aria-label={isRunning ? stopLabel : RUN_LABEL}
        variant="contained"
        size="medium"
        startIcon={
          isRunning ? (
            <Stop />
          ) : busyLabel ? (
            // Decorative: the button text and the role="status" message already say what is happening.
            <CircularProgress aria-hidden="true" size={16} color="inherit" />
          ) : (
            <PlayArrow />
          )
        }
        color={isRunning ? 'error' : 'success'}
        onClick={() => {
          dropAutorun();
          if (isRunning) {
            onStop?.();
            return;
          }
          setLearnBlocked(false);
          gate.run();
        }}
        disabled={isRunning ? isStopping : !runnable}
        data-run-mode={gate.mode ?? 'loading'}
        sx={{ minWidth: 132, minHeight: 42, whiteSpace: 'nowrap' }}
      >
        {isRunning ? stopLabel : (busyLabel ?? RUN_LABEL)}
      </Button>

      {/* A portal is not a ReactNode to Box's `children` type; the Fragment keeps it one (.5 AC-11). */}
      {captionContainer ? <>{createPortal(captions, captionContainer)}</> : captions}

      {sessionUnreadable && !isRunning && (gate.mode !== 'replay' || learnBlocked) && (
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid="run-session-unreadable"
          sx={{ display: 'block', mt: 1, overflowWrap: 'anywhere' }}
        >
          {guidedCopy('sessionUnreadable')}
        </Typography>
      )}

      {learningElsewhere && (
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid="run-learning-elsewhere"
          sx={{ display: 'block', mt: 1, overflowWrap: 'anywhere' }}
        >
          {guidedCopy('learningElsewhere')}
        </Typography>
      )}

      {chipTest !== null && (
        // From `lg` the chip takes no width in the Run column: it hangs from the column's right edge
        // and grows leftward, so it never moves Run or the buttons beside it. Below `lg` it flows.
        <Box
          sx={{
            mt: 1,
            display: 'flex',
            justifyContent: { xs: 'flex-start', lg: 'flex-end' },
            width: { xs: 'auto', lg: 0 },
            ml: { lg: 'auto' },
          }}
        >
          <Box sx={{ flexShrink: 0, width: { lg: 'max-content' }, maxWidth: { xs: '100%', lg: RUN_CAPTION_MAX_WIDTH } }}>
            <ReadinessChip test={chipTest} draftStepIds={chipTest.steps.map((step) => step.id)} />
          </Box>
        </Box>
      )}

      {chipTest !== null && chipTest.readiness === 'READY' && (
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid="learned-limits"
          sx={{ display: 'block', mt: 1, maxWidth: RUN_CAPTION_MAX_WIDTH, overflowWrap: 'anywhere' }}
        >
          {LEARNED_LIMITS_CAPTION}
        </Typography>
      )}

      {chipTest !== null && chipTest.readiness === 'RECORDED' && chipTest.verification && (
        <Stack spacing={1} sx={{ mt: 1, maxWidth: RUN_CAPTION_MAX_WIDTH }} data-testid="recorded-actions">
          <Typography variant="caption" color="text.secondary" data-testid="recorded-diagnostic-note">
            {guidedCopy('recordedDiagnosticNote')}
          </Typography>
          {chipTest.verification.state === 'INCOMPLETE' && (
            <Button
              size="small"
              variant="outlined"
              data-testid="verify-again"
              disabled={gate.phase !== 'idle'}
              onClick={() => {
                dropAutorun();
                gate.verify();
              }}
            >
              {guidedCopy('verifyAgain')}
            </Button>
          )}
          {chipTest.verification.state === 'FAILED' &&
            stepNumberIn(
              chipTest.steps.map((step) => step.id),
              chipTest.verification.firstUnverifiedStepId,
            ) !== null && (
              <Button
                size="small"
                variant="outlined"
                data-testid="relearn-from-step"
                disabled={gate.phase !== 'idle' || sessionUnreadable}
                onClick={() => {
                  dropAutorun();
                  gate.learnFrom({ kind: 'recorded', stepId: chipTest.verification!.firstUnverifiedStepId });
                }}
              >
                {guidedCopy('relearnFromStep', {
                  n: stepNumberIn(
                    chipTest.steps.map((step) => step.id),
                    chipTest.verification.firstUnverifiedStepId,
                  )!,
                })}
              </Button>
            )}
        </Stack>
      )}

      {!isRunning && gate.preparationMessage && (
        <Box data-testid="run-preparation" sx={{ mt: 1 }}>
          <Typography variant="caption" role="status" component="span">
            {gate.preparationMessage}
          </Typography>
        </Box>
      )}

      {gate.loadError && !gate.refusal && (
        <Typography
          variant="caption"
          color="error"
          data-testid="run-load-error"
          sx={{ display: 'block', mt: 1 }}
        >
          {gate.loadError}
        </Typography>
      )}

      {/*
        A portal is not a ReactNode to the `children` prop type MUI's Box declares, so a bare portal
        child logged "Failed prop type ... at RunControl" on every editor mount; a Fragment around
        it is one (STUDIO-UNIFY-001.5 AC-11).
      */}
      {alertsContainer ? <>{createPortal(alerts, alertsContainer)}</> : alerts}
    </Box>
  );
};

export default RunControl;
