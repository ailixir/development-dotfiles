import React from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  List,
  ListItem,
  Stack,
  Typography,
} from '@mui/material';
import {
  isTerminalExecutionStatus,
  type ExecutionSnapshot,
  type StepResult,
  type TestDetailDto,
} from '@/types/studio/studioTypes';
import { displayLogMessage, logEntryTime } from '@/utils/studio/logTime';
import {
  executionErrorNarrative,
  learnAgainOffered,
  replayFailureNarrative,
  type ReplayFailureNarrative,
} from './executionErrorNarratives';
import { executionStatusLabel, isCancelledOutcome } from './executionStatus';
import { seekEligibility } from '@/components/studio/evidence/seekEligibility';
import { guidedCopy, stepNumberIn } from '@/components/studio/guided/guidedNarratives';
import {
  InlineCopy,
  LoginRequiredNotice,
  loginNoticeFrom,
  loginNoticeSentences,
} from '@/components/studio/guided/LoginRequiredNotice';

/**
 * What a snapshot says, rendered without turning a bounded report into a false one
 * (story 10.11a, AC-6, AC-18, AC-19).
 *
 * The snapshot arrives as a prop rather than being fetched here. `GET /executions/{id}` and the
 * SSE `execution.snapshot` event carry exactly the same payload (architecture §5.5), so this
 * surface is the renderer both transports share and story 10.11b substitutes its transport
 * *above* it without touching a line of it.
 *
 * Three obligations, and each has a way of going quietly wrong that this epic has already found:
 *
 *  - **Timings are the snapshot's, unaltered (AC-19).** `offsetMs` and `durationMs` are rendered
 *    as they arrive — no rounding, no re-basing, no defaulting. ADR-002 §INT-5 is explicit that
 *    the API applies no calibration and *"never re-bases readings against the first one it sees"*,
 *    and §8.2 gives skipped and unstarted steps **null** timings. A `?? 0` on either field would
 *    silently claim an unattempted step began at the recording origin, and story **10.16's step
 *    seek reads these values** — its accuracy is measured against them.
 *  - **The log bound is stated (AC-18).** ADR-002 §16.5: *"a client that renders this document
 *    without rendering those flags turns a bounded report into a false one."* Every entry the
 *    snapshot carries is rendered, and `logsTruncated` renders an explicit statement that earlier
 *    lines were dropped. A client-side "show the last N" with no statement is the defect.
 *  - **A terminal `ERROR` says what happened to the browser and who can clear it (AC-6).** Before
 *    this story `errorCode` was rendered nowhere at all, which is why ADR-002 §15.5 could record
 *    the frontend union's drift as having no runtime effect.
 *  - **A named replay cause comes first (STUDIO-OBS-008 T0 ruling A1.6).** A non-null
 *    `replayFailure` selects the narrative before `status` and `errorCode`: the same login notice the
 *    guided result uses, or "Step N no longer matches the page…". Nothing is read from step messages,
 *    logs or status. "Learn again from step N" is offered only under the three A1 conditions
 *    ({@link learnAgainOffered}); otherwise the sentence stands alone.
 */

export const NOT_ATTEMPTED = 'not attempted';
export const LOGS_TRUNCATED_STATEMENT =
  'Earlier log lines were dropped before this report reached you: the run produced more than the server retains.';
export const STEP_WAITING_WORD = 'Waiting to start';
export const STEP_RUNNING_WORD = 'Running';
export const RERUN_LABEL = 'Run again';
/**
 * The replay per-step seek's visible label (STUDIO-OBS-008 AC-7): "Seek to step N", the same cited
 * copy the guided recording's per-step seek uses (`guidedNarratives.ts` `seekToStep`). It replaced
 * the 10.16a label "Show in recording" (L5b-F1, 2026-10-17).
 */
function seekStepLabel(stepIndex: number): string {
  return guidedCopy('seekToStep', { N: stepIndex + 1 });
}
/** VAL-025: the failed step's pointer to the evidence of where the browser was. */
export const WATCH_FAILURE_LABEL = 'Watch the recording at this step';
export const UNNAMED_ERROR_STATEMENT =
  'The run ended in an error the server could not name, so there is nothing here to explain it. Nothing about the browser can be concluded from this.';

export interface ExecutionProgressViewProps {
  readonly snapshot: ExecutionSnapshot | null;
  /** The Studio Logs tab supplies its own console, so it can suppress this plain log rendering. */
  readonly showLogs?: boolean;
  /** Offered only where the document clears the condition with *"a new execution"* — AC-6. */
  readonly onRerun?: () => void;
  /**
   * Story 10.16a, AC-8 – AC-10. When present, every step gets a seek control. It is called with the
   * step's `offsetMs` exactly as the snapshot carries it, and never for a step whose `offsetMs` is
   * null. The caller passes it only when there is a recording to seek.
   */
  readonly onSeekStep?: (offsetMs: number) => void;
  /**
   * STUDIO-OBS-008 (T0 ruling A1.6): the editor a replay's named cause acts on. The Studio page
   * passes it; a surface without an editor (the runs drawer) does not, and then the cause is worded
   * with the snapshot's own step numbers and offers no action.
   */
  readonly replayContext?: ReplayFailureContext;
}

/** What the page lends the replay-failure narrative (T0 ruling A1.6). */
export interface ReplayFailureContext {
  /** The current draft's stable step IDs, in order. N is the step's 1-based position here. */
  readonly draftStepIds: readonly string[];
  /** The test as `GET /tests/{id}` served it, for the "Learn again" conditions. */
  readonly test: Pick<TestDetailDto, 'readiness' | 'confirmedRevisionId'> | null;
  /** "Go to step N": the page moves focus to that step's editor row. */
  readonly onGoToStep: (stepId: string) => void;
  /** "Open Variables": the page opens its saved-inputs dialog. */
  readonly onOpenVariables: () => void;
  /** "Learn again from step N": a guided start from that step on the confirmed revision. */
  readonly onLearnAgain: (stepId: string, revisionId: string) => void;
  /** True while a Run is being prepared or is in flight. */
  readonly disabled?: boolean;
}

/**
 * A timing slot, rendered from the snapshot and from nothing else.
 *
 * Null is *not attempted*, in words. It is never `0`, never `0ms`, and never absent-but-implied:
 * the epic's own finding is that an absent slot and a zero slot read the same to a reviewer and
 * differently to a seek bar.
 */
function timingText(value: number | null, label: string): string {
  return value === null ? NOT_ATTEMPTED : `${label} ${value}ms`;
}

/**
 * In a snapshot that has not ended, a step that is still `PENDING` or `RUNNING` has no reading to
 * show, so it says so with one word instead of two "not attempted" slots. "Not attempted" stays
 * what it always was: the words for a step a finished run never reached (and the seek control's
 * 10.16a name, {@link seekControlLabel}).
 */
const StepTimings: React.FC<{ step: StepResult; runEnded: boolean }> = ({ step, runEnded }) => {
  if (!runEnded && (step.status === 'PENDING' || step.status === 'RUNNING')) {
    return (
      <Typography variant="caption" data-testid={`step-waiting-${step.stepIndex}`}>
        {step.status === 'RUNNING' ? STEP_RUNNING_WORD : STEP_WAITING_WORD}
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={2}>
      <Typography variant="caption" data-testid={`step-offset-${step.stepIndex}`}>
        {timingText(step.offsetMs, 'starts at')}
      </Typography>
      <Typography variant="caption" data-testid={`step-duration-${step.stepIndex}`}>
        {timingText(step.durationMs, 'took')}
      </Typography>
    </Stack>
  );
};

/**
 * The seek control's accessible name, per step: its visible label, and for a step with no reading the
 * visible label followed by {@link NOT_ATTEMPTED} (story 10.16a AC-9: named as not attempted rather
 * than silently inert). Before L5b-F1 it read "Jump to step N in the recording".
 */
export function seekControlLabel(step: Pick<StepResult, 'stepIndex' | 'offsetMs'>): string {
  const eligibility = seekEligibility(step);
  return eligibility.seekable
    ? seekStepLabel(step.stepIndex)
    : `${seekStepLabel(step.stepIndex)}: ${NOT_ATTEMPTED}`;
}

/**
 * Story 10.16a, AC-9 / AC-20. A step with a null `offsetMs` gets a **disabled** control: out of the
 * tab order, and named as not attempted rather than silently inert. Its handler also refuses on its
 * own, so the disabled attribute is not the only thing standing between a skipped step and a seek.
 */
const StepSeekControl: React.FC<{
  step: StepResult;
  onSeekStep: (offsetMs: number) => void;
  /** Round 067 D2: this step's control was the last one used on this run. */
  active: boolean;
  onUsed: () => void;
}> = ({ step, onSeekStep, active, onUsed }) => {
  const eligibility = seekEligibility(step);
  return (
    <Box>
      <Button
        size="small"
        variant={active ? 'outlined' : 'text'}
        disabled={!eligibility.seekable}
        aria-label={seekControlLabel(step)}
        data-testid={`step-seek-${step.stepIndex}`}
        data-seek-active={active ? 'true' : undefined}
        // Text variant: no side padding, so the label sits on the column's left edge with the step's text.
        sx={{ px: active ? 0.75 : 0, minWidth: 0 }}
        onClick={() => {
          if (eligibility.seekable) {
            onUsed();
            onSeekStep(eligibility.offsetMs);
          }
        }}
      >
        {seekStepLabel(step.stepIndex)}
      </Button>
      {active && (
        <Typography variant="caption" color="text.secondary" display="block" data-testid={`step-seek-marker-${step.stepIndex}`}>
          {guidedCopy('seekMarkerStep', { N: step.stepIndex + 1 })}
        </Typography>
      )}
    </Box>
  );
};

/**
 * VAL-025. A failed step points the author to the recording only when there is one to watch
 * (`video.status` is `AVAILABLE`) and the step has a reading to seek to; the caller's `onSeekStep`
 * switches to the Proof tab and seeks, the same path as the per-step seek control.
 */
function failureSeekOffset(snapshot: ExecutionSnapshot, step: StepResult): number | null {
  if (step.status !== 'FAIL' || snapshot.video.status !== 'AVAILABLE') return null;
  const eligibility = seekEligibility(step);
  return eligibility.seekable ? eligibility.offsetMs : null;
}

const WatchFailureControl: React.FC<{
  snapshot: ExecutionSnapshot;
  step: StepResult;
  onSeekStep: (offsetMs: number) => void;
}> = ({ snapshot, step, onSeekStep }) => {
  const offsetMs = failureSeekOffset(snapshot, step);
  if (offsetMs === null) return null;
  return (
    <Box>
      <Button
        size="small"
        variant="outlined"
        color="error"
        aria-label={`${WATCH_FAILURE_LABEL} (step ${step.stepIndex + 1})`}
        data-testid={`step-watch-failure-${step.stepIndex}`}
        onClick={() => onSeekStep(offsetMs)}
      >
        {WATCH_FAILURE_LABEL}
      </Button>
    </Box>
  );
};

/** `width: 100%` below `sm`, `auto` from it up: actions stack on a narrow screen (AC-8 a). */
const narrowFullWidth = { width: { xs: '100%', sm: 'auto' } } as const;

/**
 * The replay's named cause (T0 ruling A1.6). Login reuses the guided `LoginRequiredNotice` through
 * the one adapter; drift says "Step N no longer matches the page…". Both carry a "Seek to step N"
 * control on the existing replay seek path (`seekEligibility` + `onSeekStep`), shown only when the
 * failing step has a reading on an available recording.
 */
const ReplayFailureNotice: React.FC<{
  snapshot: ExecutionSnapshot;
  narrative: ReplayFailureNarrative;
  context?: ReplayFailureContext;
  onSeekStep?: (offsetMs: number) => void;
}> = ({ snapshot, narrative, context, onSeekStep }) => {
  const { failure } = narrative;
  const draftNumber = context ? stepNumberIn(context.draftStepIds, failure.stepId) : null;
  // Without an editor, or for a step the draft no longer has, the snapshot's own numbering is used:
  // it is the numbering of the step list rendered just below.
  const shownNumber = draftNumber ?? failure.stepIndex + 1;

  const step = snapshot.stepResults.find((candidate) => candidate.stepIndex === failure.stepIndex);
  const seek =
    onSeekStep && step && snapshot.video.status === 'AVAILABLE' ? seekEligibility(step) : null;
  const seekControl =
    seek && seek.seekable ? (
      <Button
        size="small"
        variant="outlined"
        data-testid="replay-failure-seek"
        onClick={() => onSeekStep?.(seek.offsetMs)}
        sx={narrowFullWidth}
      >
        {guidedCopy('seekToStep', { N: shownNumber })}
      </Button>
    ) : null;

  if (narrative.kind === 'login') {
    const notice = loginNoticeFrom(narrative.failure);
    if (context) {
      return (
        <Box data-testid="replay-failure" data-kind="login" sx={{ mb: 2 }}>
          <LoginRequiredNotice
            notice={notice}
            draftStepIds={context.draftStepIds}
            onGoToStep={context.onGoToStep}
            onOpenVariables={context.onOpenVariables}
            disabled={context.disabled}
          />
          {seekControl && <Box sx={{ mt: 1 }}>{seekControl}</Box>}
        </Box>
      );
    }
    return (
      <Alert severity="warning" data-testid="replay-failure" data-kind="login" sx={{ mb: 2 }}>
        <Stack spacing={1}>
          {loginNoticeSentences(notice, shownNumber).map((sentence) => (
            <Typography key={sentence} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              <InlineCopy text={sentence} />
            </Typography>
          ))}
          {seekControl}
        </Stack>
      </Alert>
    );
  }

  const offerLearnAgain =
    context !== undefined &&
    snapshot.revisionId !== null &&
    learnAgainOffered(context.test, snapshot, context.draftStepIds);
  return (
    <Alert
      severity="error"
      data-testid="replay-failure"
      data-kind="drift"
      sx={{ mb: 2, '& .MuiAlert-message': { width: '100%', minWidth: 0 } }}
    >
      <Stack spacing={1}>
        <Typography variant="body2" data-testid="replay-drift" sx={{ overflowWrap: 'anywhere' }}>
          {guidedCopy('replayDrift', { N: shownNumber })}
        </Typography>
        {context !== undefined && draftNumber === null && (
          // W5 UX-07: the run's step N is not the editor's step N when the step is gone from the draft.
          <Typography variant="body2" data-testid="replay-drift-step-gone" sx={{ overflowWrap: 'anywhere' }}>
            {guidedCopy('loginStepGone')}
          </Typography>
        )}
        {(offerLearnAgain || seekControl) && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} data-testid="replay-failure-actions">
            {offerLearnAgain && context && (
              <Button
                size="small"
                variant="outlined"
                disabled={context.disabled}
                onClick={() => context.onLearnAgain(failure.stepId, snapshot.revisionId as string)}
                sx={narrowFullWidth}
              >
                {guidedCopy('learnAgainFromStep', { N: shownNumber })}
              </Button>
            )}
            {seekControl}
          </Stack>
        )}
      </Stack>
    </Alert>
  );
};

export const ExecutionProgressView: React.FC<ExecutionProgressViewProps> = ({
  snapshot,
  onRerun,
  onSeekStep,
  showLogs = true,
  replayContext,
}) => {
  // Round 067 D2: the step seek control last used, keyed by execution so a new run starts with none.
  const [lastSeek, setLastSeek] = React.useState<{ executionId: string; stepIndex: number } | null>(null);
  if (!snapshot) {
    return (
      <Box data-testid="execution-progress-empty">
        <Typography variant="body2" color="text.secondary">
          No run is on screen yet.
        </Typography>
      </Box>
    );
  }

  // An error region exists only for a code the server actually sent. A null code on any other
  // status renders nothing at all — §8.2 puts a step locator or assertion timeout at `FAIL`/
  // `FAILED` with no code, and inventing a region for it would name a cause the server did not.
  const code = snapshot.errorCode;
  // T0 ruling A1.6: a named replay cause is chosen before `status` and `errorCode`.
  const replayFailure = replayFailureNarrative(snapshot);
  // A cancelled run is named, not explained as a failure: the person who pressed Stop caused it.
  // Its narrative is the contract's like every other code's (ADR-002 §29); only the region differs
  // — a status, not an alert — so the two facts render in the same slots either way.
  const cancelled = replayFailure === null && isCancelledOutcome(snapshot.status, code);
  const narrative = replayFailure === null && code !== null ? executionErrorNarrative(code) : null;

  return (
    <Box data-testid="execution-progress">
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Chip
          size="small"
          label={executionStatusLabel(snapshot.status, code)}
          data-testid="execution-status"
        />
      </Stack>

      {replayFailure !== null && (
        <ReplayFailureNotice
          snapshot={snapshot}
          narrative={replayFailure}
          context={replayContext}
          onSeekStep={onSeekStep}
        />
      )}

      {cancelled && narrative && (
        <Alert
          severity="info"
          role="status"
          aria-label="Run cancelled"
          data-testid="execution-cancelled"
          sx={{ mb: 2 }}
        >
          <AlertTitle data-testid="execution-error-title">{narrative.title}</AlertTitle>
          <Stack spacing={0.5}>
            <Typography variant="body2" data-testid="execution-error-browser">
              {narrative.browserClaim}
            </Typography>
            <Typography variant="body2" data-testid="execution-error-remedy">
              {narrative.remedyOwner}
            </Typography>
          </Stack>
        </Alert>
      )}

      {replayFailure === null && snapshot.status === 'ERROR' && code === null && (
        <Alert severity="error" sx={{ mb: 2 }} data-testid="execution-error-unnamed">
          <Typography variant="body2">{UNNAMED_ERROR_STATEMENT}</Typography>
        </Alert>
      )}

      {narrative && !cancelled && (
        <Alert
          severity="error"
          role="alert"
          aria-label={narrative.title}
          data-testid="execution-error"
          sx={{ mb: 2 }}
        >
          <AlertTitle data-testid="execution-error-title">{narrative.title}</AlertTitle>
          <Stack spacing={0.5}>
            <Typography variant="body2" data-testid="execution-error-browser">
              {narrative.browserClaim}
            </Typography>
            <Typography variant="body2" data-testid="execution-error-remedy">
              {narrative.remedyOwner}
            </Typography>
            {narrative.offersRerun && onRerun && (
              <Box>
                <Button size="small" variant="outlined" onClick={onRerun}>
                  {RERUN_LABEL}
                </Button>
              </Box>
            )}
          </Stack>
        </Alert>
      )}

      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Steps
      </Typography>
      <List dense disablePadding data-testid="execution-steps">
        {snapshot.stepResults.map((step) => (
          <ListItem key={step.stepIndex} disableGutters alignItems="flex-start">
            <Stack spacing={0.25} sx={{ width: '100%' }}>
              <Typography variant="body2" data-testid={`step-text-${step.stepIndex}`}>
                {`${step.stepIndex + 1}. ${step.originalText}`}
              </Typography>
              <Typography variant="caption" data-testid={`step-status-${step.stepIndex}`}>
                {step.status}
              </Typography>
              <StepTimings step={step} runEnded={isTerminalExecutionStatus(snapshot.status)} />
              {onSeekStep && failureSeekOffset(snapshot, step) === null && (
                <StepSeekControl
                  step={step}
                  onSeekStep={onSeekStep}
                  active={lastSeek?.executionId === snapshot.executionId && lastSeek.stepIndex === step.stepIndex}
                  onUsed={() => setLastSeek({ executionId: snapshot.executionId, stepIndex: step.stepIndex })}
                />
              )}
              {step.message && (
                <Typography variant="caption" data-testid={`step-message-${step.stepIndex}`}>
                  {step.message}
                </Typography>
              )}
              {onSeekStep && (
                <WatchFailureControl snapshot={snapshot} step={step} onSeekStep={onSeekStep} />
              )}
            </Stack>
          </ListItem>
        ))}
      </List>

      {showLogs && (
        <>
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>
            Logs
          </Typography>
          {snapshot.logsTruncated && (
            <Typography
              variant="caption"
              color="warning.main"
              data-testid="logs-truncated-statement"
              sx={{ display: 'block', mb: 0.5 }}
            >
              {LOGS_TRUNCATED_STATEMENT}
            </Typography>
          )}
          <Box data-testid="execution-logs">
            {snapshot.logs.map((entry, index) => (
              <Typography
                key={`${entry.at}-${index}`}
                variant="caption"
                component="div"
                data-testid={`log-line-${index}`}
              >
                {/* `at` is nullable by contract; a line without a reading shows no time, not "null".
                    The closing line takes the run's end time, and steps count from 1 like the list. */}
                {[logEntryTime(entry, snapshot.endedAt), entry.level, displayLogMessage(entry)]
                  .filter((part) => part !== null)
                  .join(' ')}
              </Typography>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
};

export default ExecutionProgressView;
