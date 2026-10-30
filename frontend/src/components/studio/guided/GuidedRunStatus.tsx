import { LinearProgress, Paper, Stack, Typography } from '@mui/material';
import type { GuidedSessionState, PublicSession } from '@/types/studio/studioGuidedTypes';
import { guidedCopy, stepNumberIn } from './guidedNarratives';

/**
 * The live line for a guided Run in flight (STUDIO-OBS-008 AC-3; architect P2).
 *
 *  - **N and M come only from the server's `progress`**: `activeStep.number` and `stepCount`. They
 *    are never inferred from counters, timers, the page's own step counter or the editor (plan B9,
 *    P2). With `activeStep: null` the line names no step: "Understanding this page." where the
 *    approved design has a step-less sentence, and nothing where it does not.
 *  - **k is the session's `firstLearnStepId`**, the boundary the server computed, resolved to its
 *    position in the current draft by stable ID. In `REPLAYING_PREFIX` the line is "Repeating saved
 *    steps 1–(k-1)…"; while learning in a mixed-mode session a second line says "Learning from step
 *    k". If the active step is before k, a drift switch has moved the boundary and the session view
 *    does not say where to, so the k line is not shown rather than shown wrong (P2: "Never infer
 *    drift j").
 *  - `AWAITING_CLARIFICATION` is carried by `GuidedClarification`, and the terminal states by
 *    `GuidedCompletion`; this component renders nothing for them.
 *  - No live region, `aria-current` or reduced-motion handling: descoped by the user, 2026-10-17
 *    (ADR-SC-006). The MUI progress bar is used as it comes.
 */

const LEARNING_STATES: readonly GuidedSessionState[] = ['OBSERVING', 'PROPOSING', 'ACTING'];

export interface GuidedRunStatusLines {
  /** The state's sentence, or `null` when this component shows nothing for the state. */
  readonly primary: string | null;
  /** "Learning from step k" in a mixed-mode session, or `null`. */
  readonly learningFrom: string | null;
}

export function guidedRunStatusLines(
  session: Pick<PublicSession, 'state' | 'progress' | 'firstLearnStepId'>,
  draftStepIds: readonly string[],
): GuidedRunStatusLines {
  const { state, progress } = session;
  const active = progress.activeStep;
  const k = stepNumberIn(draftStepIds, session.firstLearnStepId);

  let primary: string | null = null;
  switch (state) {
    case 'PREPARING':
      primary = guidedCopy('preparing');
      break;
    case 'REPLAYING_PREFIX':
      primary =
        k !== null && k >= 2
          ? guidedCopy('repeatingPrefix', { '(k-1)': k - 1 })
          : guidedCopy('repeatingPrefixNoBoundary');
      break;
    case 'OBSERVING':
    case 'PROPOSING':
      primary =
        active !== null
          ? guidedCopy('understanding', { N: active.number, M: progress.stepCount })
          : guidedCopy('understandingNoStep');
      break;
    case 'ACTING':
      primary =
        active !== null ? guidedCopy('running', { N: active.number, M: progress.stepCount }) : null;
      break;
    case 'FINALIZING':
      primary = guidedCopy('finalizing');
      break;
    default:
      primary = null;
  }

  const learningFrom =
    LEARNING_STATES.includes(state) &&
    k !== null &&
    (active === null || active.number >= k)
      ? guidedCopy('learningFrom', { k })
      : null;

  return { primary, learningFrom };
}

export interface GuidedRunStatusProps {
  readonly session: Pick<PublicSession, 'state' | 'progress' | 'firstLearnStepId'>;
  /** The current draft's stable step IDs, in order. Used only to number k. */
  readonly draftStepIds: readonly string[];
}

export function GuidedRunStatus({ session, draftStepIds }: GuidedRunStatusProps) {
  const { primary, learningFrom } = guidedRunStatusLines(session, draftStepIds);
  if (primary === null && learningFrom === null) {
    return null;
  }
  const active = session.progress.activeStep;
  const { stepCount } = session.progress;
  const determinate = active !== null && stepCount > 0;

  return (
    // An outlined card, like the "Run your test" block before a run and the plan after it.
    <Paper variant="outlined" data-testid="guided-run-status" data-state={session.state} sx={{ p: 2, minWidth: 0 }}>
      <Stack spacing={0.5}>
        {primary !== null && (
          <Typography variant="body2" data-testid="guided-run-status-line" sx={{ overflowWrap: 'anywhere' }}>
            {primary}
          </Typography>
        )}
        {learningFrom !== null && (
          <Typography
            variant="body2"
            color="text.secondary"
            data-testid="guided-run-status-learning-from"
          >
            {learningFrom}
          </Typography>
        )}
        <LinearProgress
          variant={determinate ? 'determinate' : 'indeterminate'}
          value={determinate ? Math.min(100, (active.number / stepCount) * 100) : undefined}
          sx={{ width: '100%' }}
        />
      </Stack>
    </Paper>
  );
}

export default GuidedRunStatus;
