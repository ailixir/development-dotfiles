import React, { useEffect, useRef } from 'react';
import { Alert, AlertTitle, Box, Button, Stack, Typography } from '@mui/material';
import { PlayArrow, Stop } from '@mui/icons-material';
import { narrativeFor } from '@/components/studio/review/compileStateNarratives';
import { useRunGate } from './useRunGate';

/**
 * The Run control, governed by the server's readiness and by nothing else (story 10.11a).
 *
 * AC-1: enabled if and only if `compileStatus === 'READY'`, read from a `GET /tests/{id}` body,
 * over a total mapping with no `default:` branch and no `??` fallback. AC-2: the client's
 * English-grammar validator is not a term in that predicate anywhere — asserted on the requests
 * the mock server observes, because a source scan cannot see a gate reconstructed through a
 * differently-named local. AC-4: every refusal the execute route declares is rendered distinctly,
 * branched on `error` for the `409` and on the status for the `429` and the `503`.
 *
 * **Why this owns the button rather than advising the page.** The page previously computed its own
 * `disabled` expression beside its own `handleRunTest` guard, which is two places for the same
 * rule and is how the two came to disagree. The page now renders this control and passes it a
 * draft id; there is no `disabled` prop to override and no second predicate to drift from.
 *
 * The blocked explanation is story 10.10's, read through `narrativeFor`. Re-wording the five
 * states here would be a second hand-maintained copy of one vocabulary — the arrangement ADR-002
 * §18.3 exists to prevent — and the two surfaces would drift the moment one of them was edited.
 */
export const RUN_LABEL = 'Run Test';
export const STOP_LABEL = 'Stop';
export const STOPPING_LABEL = 'Stopping…';

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
  /** Rendered beside the control when the draft has no steps to run. */
  readonly hasSteps?: boolean;
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
  hasSteps = true,
  runRequest = 0,
}) => {
  const gate = useRunGate(testId, onAccepted);
  const blocked = gate.test ? narrativeFor(gate.test.compileStatus) : null;
  const runnable = gate.canRun && hasSteps;

  const servedRunRequest = useRef(0);
  useEffect(() => {
    if (runRequest <= servedRunRequest.current || !runnable || isRunning) return;
    servedRunRequest.current = runRequest;
    gate.run();
  }, [runRequest, runnable, isRunning, gate]);

  return (
    <Box>
      <Button
        variant="contained"
        size="large"
        startIcon={isRunning ? <Stop /> : <PlayArrow />}
        color={isRunning ? 'error' : 'success'}
        onClick={() => (isRunning ? onStop?.() : gate.run())}
        disabled={isRunning ? isStopping : !runnable}
        sx={{ minWidth: 140 }}
      >
        {isRunning ? (isStopping ? STOPPING_LABEL : STOP_LABEL) : RUN_LABEL}
      </Button>

      {!isRunning && blocked && !gate.enablement?.canRun && (
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid="run-blocked-reason"
          sx={{ display: 'block', mt: 1 }}
        >
          {blocked.whatIsBlocked}
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
