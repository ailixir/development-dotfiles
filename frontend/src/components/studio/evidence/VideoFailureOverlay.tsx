import { useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';

/** Plain sentences for the closed codes a replay step can fail with; the code is still shown after it. */
const STEP_FAILURE_SENTENCES: Readonly<Record<string, string>> = {
  ASSERTION_FAILED: 'What this step checks for was not on the page.',
  TIMEOUT: 'The page did not respond in time for this step.',
  TARGET_DRIFT: 'The page was not where this step expects it. It may have changed since the test was learned.',
  LOGIN_REQUIRED: 'The site asked to sign in before this step could run.',
  POLICY_REFUSED: 'A safety rule refused this step.',
  READ_REFUSED: 'A safety rule refused what this step tried to read.',
  REFERENCE_REFUSED: 'A safety rule refused a value this step uses.',
  OUTCOME_UNKNOWN: 'The step ran out of time partway, so its result is unknown.',
  CANCELLED: 'The run was stopped during this step.',
  NAVIGATION_HTTP_ERROR: 'The page this step opened returned an HTTP error (for example 403 Access Denied or 404 Not Found).',
  INTERNAL_ERROR: 'Studio hit an internal error during this step.',
};

/** The plain sentence for a step failure code, or undefined for a code (or free text) with none. */
export function stepFailureSentence(code: string | null): string | undefined {
  return code === null ? undefined : STEP_FAILURE_SENTENCES[code];
}

/**
 * The failed step's reason, low over the video: above the native control bar (~70px in Chromium), so
 * the controls stay usable and the top of the recorded page, where most evidence sits, stays visible.
 * Dismissal lasts while the overlay is mounted: the panel unmounts it when the playhead goes back
 * before the failure.
 */
export function VideoFailureOverlay({ stepIndex, message }: { stepIndex: number; message: string | null }) {
  const [dismissed, setDismissed] = useState(false);
  const sentence = stepFailureSentence(message);
  if (dismissed) {
    return null;
  }
  return (
    <Box
      data-testid="video-failure-overlay"
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 72,
        px: 1.5,
        py: 1,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        bgcolor: 'rgba(0, 0, 0, 0.75)',
        color: 'common.white',
        borderLeft: 4,
        borderColor: 'error.main',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ color: 'error.light' }}>
          {`Step ${stepIndex + 1} failed`}
        </Typography>
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
          {sentence ?? message ?? 'This step failed.'}
        </Typography>
        {sentence !== undefined && (
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            {message}
          </Typography>
        )}
      </Box>
      <IconButton size="small" onClick={() => setDismissed(true)} sx={{ color: 'common.white' }} title="Dismiss">
        <Close fontSize="small" />
      </IconButton>
    </Box>
  );
}

export default VideoFailureOverlay;
