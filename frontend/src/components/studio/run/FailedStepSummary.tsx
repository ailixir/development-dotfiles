import { Alert, AlertTitle, Typography } from '@mui/material';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { stepFailureSentence } from '@/components/studio/evidence/VideoFailureOverlay';

/**
 * A `FAILED` run carries no error code; its narrative is the first failing step (§8.2). The step's text,
 * then the plain sentence for its code (the same one the video overlay shows), then the code itself.
 */
export function FailedStepSummary({ snapshot }: { snapshot: ExecutionSnapshot }) {
  if (snapshot.status !== 'FAILED' || snapshot.errorCode !== null) return null;
  const failed = snapshot.stepResults.find((step) => step.status === 'FAIL');
  if (!failed) return null;
  const sentence = stepFailureSentence(failed.message);
  return (
    <Alert severity="error" variant="outlined" data-testid="run-failed-step">
      <AlertTitle>Failed at step {failed.stepIndex + 1}</AlertTitle>
      <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{failed.originalText}</Typography>
      {sentence !== undefined && (
        <Typography variant="body2" sx={{ mt: 0.5 }} data-testid="run-failed-step-sentence">{sentence}</Typography>
      )}
      {failed.message && (
        <Typography
          variant={sentence !== undefined ? 'caption' : 'body2'}
          color={sentence !== undefined ? 'text.secondary' : undefined}
          component="div"
          sx={{ mt: 0.5, overflowWrap: 'anywhere' }}
          data-testid="run-failed-step-message"
        >
          {failed.message}
        </Typography>
      )}
    </Alert>
  );
}

export default FailedStepSummary;
