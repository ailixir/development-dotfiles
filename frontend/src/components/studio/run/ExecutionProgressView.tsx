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
import type { ExecutionSnapshot, StepResult } from '@/types/studio/studioTypes';
import { executionErrorNarrative } from './executionErrorNarratives';
import { executionStatusLabel, isCancelledOutcome } from './executionStatus';
import { seekEligibility } from '@/components/studio/evidence/seekEligibility';

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
 */

export const NOT_ATTEMPTED = 'not attempted';
export const LOGS_TRUNCATED_STATEMENT =
  'Earlier log lines were dropped before this report reached you: the run produced more than the server retains.';
export const RERUN_LABEL = 'Run again';
export const SEEK_LABEL = 'Show in recording';
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

const StepTimings: React.FC<{ step: StepResult }> = ({ step }) => (
  <Stack direction="row" spacing={2}>
    <Typography variant="caption" data-testid={`step-offset-${step.stepIndex}`}>
      {timingText(step.offsetMs, 'starts at')}
    </Typography>
    <Typography variant="caption" data-testid={`step-duration-${step.stepIndex}`}>
      {timingText(step.durationMs, 'took')}
    </Typography>
  </Stack>
);

/** The seek control's accessible name, per step. The disabled wording reuses {@link NOT_ATTEMPTED}. */
export function seekControlLabel(step: Pick<StepResult, 'stepIndex' | 'offsetMs'>): string {
  const eligibility = seekEligibility(step);
  return eligibility.seekable
    ? `Jump to step ${step.stepIndex + 1} in the recording`
    : `Jump to step ${step.stepIndex + 1}: ${NOT_ATTEMPTED}`;
}

/**
 * Story 10.16a, AC-9 / AC-20. A step with a null `offsetMs` gets a **disabled** control: out of the
 * tab order, and named as not attempted rather than silently inert. Its handler also refuses on its
 * own, so the disabled attribute is not the only thing standing between a skipped step and a seek.
 */
const StepSeekControl: React.FC<{ step: StepResult; onSeekStep: (offsetMs: number) => void }> = ({
  step,
  onSeekStep,
}) => {
  const eligibility = seekEligibility(step);
  return (
    <Box>
      <Button
        size="small"
        variant="text"
        disabled={!eligibility.seekable}
        aria-label={seekControlLabel(step)}
        data-testid={`step-seek-${step.stepIndex}`}
        onClick={() => {
          if (eligibility.seekable) {
            onSeekStep(eligibility.offsetMs);
          }
        }}
      >
        {SEEK_LABEL}
      </Button>
    </Box>
  );
};

export const ExecutionProgressView: React.FC<ExecutionProgressViewProps> = ({
  snapshot,
  onRerun,
  onSeekStep,
  showLogs = true,
}) => {
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
  // A cancelled run is named, not explained as a failure: the person who pressed Stop caused it.
  // Its narrative is the contract's like every other code's (ADR-002 §29); only the region differs
  // — a status, not an alert — so the two facts render in the same slots either way.
  const cancelled = isCancelledOutcome(snapshot.status, code);
  const narrative = code !== null ? executionErrorNarrative(code) : null;

  return (
    <Box data-testid="execution-progress">
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Chip
          size="small"
          label={executionStatusLabel(snapshot.status, code)}
          data-testid="execution-status"
        />
      </Stack>

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

      {snapshot.status === 'ERROR' && code === null && (
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
            {narrative.offersRerun && (
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
              <StepTimings step={step} />
              {onSeekStep && <StepSeekControl step={step} onSeekStep={onSeekStep} />}
              {step.message && (
                <Typography variant="caption" data-testid={`step-message-${step.stepIndex}`}>
                  {step.message}
                </Typography>
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
                {/* `at` is nullable by contract; a line without a reading shows no time, not "null". */}
                {[entry.at, entry.level, entry.message].filter((part) => part !== null).join(' ')}
              </Typography>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
};

export default ExecutionProgressView;
