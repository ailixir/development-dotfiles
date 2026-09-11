import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import type { TestDto } from '@/types/studio/studioTypes';
import { narrativeFor } from './compileStateNarratives';
import { compileErrorNarrative, isDeclaredCompileErrorCode } from './compileErrorCodes';
import { compileConflictNarrative, compileRejectionNarrative, confirmConflictNarrative } from './conflictNarratives';
import { UNSUPPORTED_WORKFLOW_HEADING, UNSUPPORTED_WORKFLOW_LIMITS } from './unsupportedWorkflows';
import { WATCH_GAVE_UP_MESSAGE } from './compilePollBounds';
import { DiagnosticsSummary, UNCLAMPED_TEXT_SX } from './DiagnosticsView';
import { StepReviewList } from './StepReviewList';
import { useCompileReview } from './useCompileReview';

/**
 * The review and confirmation surface (story 10.10).
 *
 * It lives in the Control Tower — the middle panel — because PRD §5.2 puts the readable summaries
 * and the confirmation beside the Run button. A fourth right-panel tab would put the review
 * behind the Proof tab, where a reader reaches Run without having passed the review; that is the
 * shape of a gate bypass even when the server still refuses.
 *
 * The five compile states render as five different sentences, with no fallback branch: see
 * `compileStateNarratives`. Confirmation sends exactly the four declared fields out of the one
 * response on screen, and a `409` returns the reader to a fresh, deliberate review rather than
 * re-sending. The epic's release ordering is blunt about the alternative: *"No temporary gate
 * bypass or production auto-confirmation is allowed."*
 */

export const CONFIRM_LABEL = 'Confirm this exact revision';
export const RECOMPILE_LABEL = 'Ask for the translation again';

export interface CompileReviewPanelProps {
  testId: string;
}

function needsReconfirmation(test: TestDto): boolean {
  // Read from the body, never from "the user typed something": a reload, a second tab and a
  // configuration-only change all produce this condition with no local edit behind them (§4.2).
  return test.confirmedRevisionId !== null && test.compileStatus !== 'READY';
}

export function CompileReviewPanel({ testId }: CompileReviewPanelProps) {
  const review = useCompileReview(testId);
  const { test } = review;

  if (review.loading && !test) {
    return (
      <Box component="section" aria-label="Review and confirm" data-testid="compile-review-panel">
        <Typography variant="body2">Reading the draft…</Typography>
      </Box>
    );
  }

  if (!test) {
    return (
      <Box component="section" aria-label="Review and confirm" data-testid="compile-review-panel">
        <Alert severity="error">{review.loadError ?? 'The draft could not be read.'}</Alert>
      </Box>
    );
  }

  const narrative = narrativeFor(test.compileStatus);
  const hash = review.artifactHash;
  const hashBlocked = !hash || !hash.available;
  const confirmable =
    test.compileStatus === 'AWAITING_CONFIRMATION' && test.currentCandidateRevisionId !== null;
  // Deliberately **not** `&& !confirmInFlight`. A disabled attribute set after a second click has
  // already fired proves nothing, and a control that goes inert while a request is open hides
  // whether anything is guarding the second activation at all. The guard is the in-flight ref in
  // `useCompileReview`, which closes the window in the same synchronous turn as the activation;
  // this attribute would only decorate it. AC-13 counts requests for that reason.
  const confirmEnabled = confirmable && !hashBlocked;
  const showsStandingLimits =
    test.compileStatus === 'AWAITING_CONFIRMATION' || test.compileStatus === 'NEEDS_REVISION';

  return (
    <Box component="section" aria-label="Review and confirm" data-testid="compile-review-panel">
      {/* Compile-state changes are announced, not only redrawn (AC-18a). */}
      <Box
        role="status"
        aria-live="polite"
        data-testid="compile-state-live-region"
        sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
      >
        {narrative.title}
      </Box>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Box component="section" aria-label={narrative.title} data-testid="compile-state-region">
            <Typography variant="subtitle1" gutterBottom>
              {narrative.title}
            </Typography>
            <Typography variant="body2" sx={{ ...UNCLAMPED_TEXT_SX, mb: 0.5 }}>
              {narrative.whatIsTrue}
            </Typography>
            <Typography variant="body2" sx={{ ...UNCLAMPED_TEXT_SX, mb: 0.5 }}>
              {narrative.whatYouCanDo}
            </Typography>
            <Typography variant="body2" sx={UNCLAMPED_TEXT_SX}>
              {narrative.whatIsBlocked}
            </Typography>
          </Box>

          {test.compileStatus === 'READY' && test.confirmedRevisionId && (
            <Typography variant="caption" data-testid="confirmed-identity" sx={{ display: 'block', mt: 1 }}>
              The revision that runs: {test.confirmedRevisionId} (from your steps at version{' '}
              {test.sourceRevision}, settings at version {test.configurationRevision}).
            </Typography>
          )}

          {needsReconfirmation(test) && (
            <Alert severity="info" data-testid="needs-reconfirmation" sx={{ mt: 1 }}>
              This draft has moved since you last confirmed it. What runs today is still the
              revision you confirmed; anything newer needs a fresh read and a fresh confirmation.
            </Alert>
          )}

          {review.watchGaveUp && (
            <Alert severity="info" data-testid="watch-gave-up" sx={{ mt: 1 }}>
              {WATCH_GAVE_UP_MESSAGE}
            </Alert>
          )}
        </CardContent>
      </Card>

      {test.compileError && (
        <Alert severity="warning" data-testid="compile-error" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={UNCLAMPED_TEXT_SX}>
            {compileErrorNarrative(test.compileError.code)}
          </Typography>
          <Typography variant="caption" data-testid="compile-error-code" sx={{ display: 'block', mt: 0.5 }}>
            Reason given by the server: {test.compileError.code}
            {isDeclaredCompileErrorCode(test.compileError.code) ? '' : ' (not one this page knows)'}
          </Typography>
        </Alert>
      )}

      {test.compileDiagnostics && <DiagnosticsSummary diagnostics={test.compileDiagnostics} />}

      {showsStandingLimits && (
        <Alert severity="info" data-testid="unsupported-workflows" sx={{ mb: 2 }}>
          <Typography variant="subtitle2">{UNSUPPORTED_WORKFLOW_HEADING}</Typography>
          <ul style={{ margin: '4px 0 0', paddingLeft: '1.2rem' }}>
            {UNSUPPORTED_WORKFLOW_LIMITS.map((limit) => (
              <li key={limit}>
                <Typography variant="body2" sx={UNCLAMPED_TEXT_SX}>
                  {limit}
                </Typography>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <StepReviewList
        steps={test.steps}
        stepDiagnostics={test.compileDiagnostics ? test.compileDiagnostics.steps : null}
      />

      {review.conflict && (
        <Alert
          severity={review.conflict.code === 'STALE_CANDIDATE' ? 'warning' : 'error'}
          data-testid="conflict"
          sx={{ mt: 2 }}
        >
          <Typography variant="body2" sx={UNCLAMPED_TEXT_SX}>
            {
              (review.conflict.operation === 'confirm'
                ? confirmConflictNarrative(review.conflict.code)
                : compileConflictNarrative(review.conflict.code)
              ).explanation
            }
          </Typography>
          <Typography variant="caption" data-testid="conflict-message" sx={{ display: 'block', mt: 0.5 }}>
            What the server said: {review.conflict.message}
          </Typography>
        </Alert>
      )}

      {review.rejection && (
        <Alert severity="error" data-testid="compile-rejection" sx={{ mt: 2 }}>
          <Typography variant="body2" sx={UNCLAMPED_TEXT_SX}>
            {compileRejectionNarrative(review.rejection.code)}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
            What the server said: {review.rejection.message}
          </Typography>
        </Alert>
      )}

      {review.confirmInFlight && (
        <Typography variant="caption" data-testid="confirm-in-flight" sx={{ display: 'block', mt: 1 }}>
          Sending your confirmation…
        </Typography>
      )}

      {review.compileAccepted && (
        <Alert severity="info" data-testid="compile-accepted" sx={{ mt: 2 }}>
          Your request for a translation was taken. That is not a result: it may still end without
          anything runnable, and this page will say which.
        </Alert>
      )}

      {review.loadError && (
        <Alert severity="error" data-testid="load-error" sx={{ mt: 2 }}>
          {review.loadError}
        </Alert>
      )}

      <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          data-testid="confirm-control"
          disabled={!confirmEnabled}
          aria-busy={review.confirmInFlight}
          onClick={review.confirm}
        >
          {CONFIRM_LABEL}
        </Button>
        {test.compileStatus === 'STALE' && (
          <Button variant="outlined" data-testid="recompile-control" onClick={review.recompile}>
            {RECOMPILE_LABEL}
          </Button>
        )}
      </Stack>

      {confirmable && hashBlocked && (
        <Alert severity="warning" data-testid="confirm-blocked" sx={{ mt: 1 }}>
          <Typography variant="body2" sx={UNCLAMPED_TEXT_SX}>
            {hash && !hash.available ? hash.reason : ''}
          </Typography>
        </Alert>
      )}
    </Box>
  );
}

export default CompileReviewPanel;
