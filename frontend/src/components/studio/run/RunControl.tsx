import React, { useEffect, useRef } from 'react';
import { Alert, AlertTitle, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { PlayArrow, Stop } from '@mui/icons-material';
import { compileErrorNarrative } from '../review/compileErrorCodes';
import { useRunGate, type RunSaveOutcome } from './useRunGate';

/**
 * The single Run entry point.
 *
 * Run prepares and then runs: it saves the author's edits if there are any, asks the server to
 * translate the saved revision if it has no fresh artifact, and then dispatches it. Saving no
 * longer translates in the background, so there is no state in which the author is told to save
 * again and wait — the button they already pressed is doing the work, and it says so while it does.
 */
export const RUN_LABEL = 'Run Test';
export const STOP_LABEL = 'Stop';
export const STOPPING_LABEL = 'Stopping…';
export const SAVING_LABEL = 'Saving…';
export const PREPARING_LABEL = 'Preparing…';
export const STARTING_LABEL = 'Starting…';
/** Shown when a compile started elsewhere is still settling, so Run must wait rather than act. */
export const WAITING_LABEL = 'Getting ready…';

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
  /** Visible editor state differs from the saved draft. Run saves it before preparing. */
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
}) => {
  const gate = useRunGate(testId, onAccepted, refreshToken, {
    saveBeforeRun: onSaveBeforeRun,
    isDirty,
  });
  const runnable = gate.canRun && hasSteps;

  /** A compile is settling and this control did not start it — there is nothing to press. */
  const waiting = gate.action === 'wait' && gate.phase === 'idle';

  const busyLabel = (() => {
    switch (gate.phase) {
      case 'saving':
        return SAVING_LABEL;
      case 'compiling':
        return PREPARING_LABEL;
      case 'starting':
        return STARTING_LABEL;
      case 'idle':
      default:
        return waiting ? WAITING_LABEL : null;
    }
  })();

  const compileMessage = (() => {
    const outcome = gate.compileOutcome;
    if (!outcome) return null;
    switch (outcome.kind) {
      case 'needsRevision':
        return {
          title: 'Some steps need attention',
          body: 'The translation of your checklist was refused. Check the steps listed below, then run again.',
        };
      case 'failed':
        return {
          title: 'Your test could not be prepared',
          body: outcome.error
            ? compileErrorNarrative(outcome.error.code)
            : 'Preparing this test did not finish. Your saved checklist is unchanged — run again to retry.',
        };
      case 'refused':
        return { title: 'This test could not be prepared', body: outcome.message };
      case 'timedOut':
      default:
        return {
          title: 'Preparing took too long',
          body: 'Your saved checklist is unchanged. Run again to retry.',
        };
    }
  })();

  useEffect(() => {
    onPreparingChange?.(gate.executeInFlight && !isRunning);
    return () => onPreparingChange?.(false);
  }, [gate.executeInFlight, isRunning, onPreparingChange]);

  const servedRunRequest = useRef(0);
  useEffect(() => {
    if (runRequest <= servedRunRequest.current || !runnable || isRunning) return;
    servedRunRequest.current = runRequest;
    gate.run();
  }, [runRequest, runnable, isRunning, gate]);

  const stopLabel = isStopping ? STOPPING_LABEL : STOP_LABEL;

  return (
    <Box>
      <Button
        aria-label={isRunning ? stopLabel : RUN_LABEL}
        variant="contained"
        size="medium"
        startIcon={
          isRunning ? (
            <Stop />
          ) : busyLabel ? (
            <CircularProgress aria-label="Preparing test" size={16} color="inherit" />
          ) : (
            <PlayArrow />
          )
        }
        color={isRunning ? 'error' : 'success'}
        onClick={() => (isRunning ? onStop?.() : gate.run())}
        disabled={isRunning ? isStopping : !runnable}
        sx={{ minWidth: 132, minHeight: 42, whiteSpace: 'nowrap' }}
      >
        {isRunning ? stopLabel : (busyLabel ?? RUN_LABEL)}
      </Button>

      {!isRunning && !hasSteps && (
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid="run-blocked-reason"
          sx={{ display: 'block', mt: 1 }}
        >
          Add a step to run this test.
        </Typography>
      )}

      {!isRunning && hasSteps && waiting && (
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid="run-blocked-reason"
          sx={{ display: 'block', mt: 1 }}
        >
          Getting your saved test ready…
        </Typography>
      )}

      {!isRunning && gate.preparationMessage && (
        <Typography variant="caption" role="status" sx={{ display: 'block', mt: 1 }}>
          {gate.preparationMessage}
        </Typography>
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

      {compileMessage && !gate.refusal && (
        <Alert severity="warning" role="alert" data-testid="run-compile-outcome" sx={{ mt: 2 }}>
          <AlertTitle data-testid="run-compile-outcome-title">{compileMessage.title}</AlertTitle>
          <Typography variant="body2" data-testid="run-compile-outcome-body">
            {compileMessage.body}
          </Typography>
        </Alert>
      )}

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
    </Box>
  );
};

export default RunControl;
