import { forwardRef, useEffect, useState } from 'react';
import { Alert, Box, Stack, Typography } from '@mui/material';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import {
  NO_RUN_EVIDENCE_MESSAGE,
  PARTIAL_RECORDING_QUALIFIER,
  PLAYBACK_FAILED_MESSAGE,
  stoppedRunRecordingStatement,
  videoEvidenceNarrative,
} from './videoEvidenceNarratives';
import { studioVideoUrl } from './studioVideoUrl';

/**
 * The run's evidence, and the only playback surface on the Studio page (story 10.16a, AC-2 – AC-4,
 * AC-12, AC-20).
 *
 * Rules this component keeps:
 *
 *  - **The state comes from `video.status` alone**, never from the check outcome. A terminal outcome
 *    with `PROCESSING` evidence is still being produced (architecture §6.1, §5.4 row 5).
 *  - **`partial` is read from `video.partial`, and only beside an `AVAILABLE` recording**. It is
 *    never derived from the outcome (ADR-002 §17.3, §17.4).
 *  - **The stopped-run line is read from `errorCode`, only beside an `AVAILABLE` recording, and
 *    never from `partial`.** A deadline (`TIMEOUT`) or a Stop (`CANCELLED`) is an orderly stop that
 *    flushes the recording, so the body says `partial: false` and the video simply ends early. The
 *    line says why it ends there. It is independent of the partial qualifier, and both render when
 *    both are true (§17.3, §17.4).
 *  - **A `<video>` exists only when `video.status === 'AVAILABLE'` and `videoPath !== null`.** For
 *    every other state, nothing in this tree carries the route's URL. The element is not mounted
 *    and hidden; it is not mounted.
 *  - **There is no download affordance.** It was retired at the product owner's request: the native
 *    player's controls already offer one. Nothing here composes a `download=true` URL.
 *  - **No JSON body of this route is ever read** (AC-11). Playback is a browser-native request; it
 *    never goes through `apiClient` or `fetch`.
 *  - **A media error renders one fixed message** whatever `MediaError.code` says. The element
 *    exposes no HTTP status, so a cause-specific explanation would be invented (AC-12).
 *  - **No `crossOrigin` attribute.** `anonymous` would strip the ambient session §6.3 relies on,
 *    and whether `use-credentials` is needed cross-host is SPK-02's question, not this story's.
 */
export interface VideoEvidencePanelProps {
  /** Null before any run is on screen. */
  readonly snapshot: ExecutionSnapshot | null;
}

export const VideoEvidencePanel = forwardRef<HTMLVideoElement, VideoEvidencePanelProps>(
  function VideoEvidencePanel({ snapshot }, videoRef) {
    const playbackUrl =
      snapshot !== null && snapshot.video.status === 'AVAILABLE' && snapshot.videoPath !== null
        ? studioVideoUrl(snapshot.videoPath)
        : null;

    const [playbackFailed, setPlaybackFailed] = useState(false);
    // A new recording starts with no failure carried over from the previous one.
    useEffect(() => {
      setPlaybackFailed(false);
    }, [playbackUrl]);

    if (snapshot === null) {
      return (
        <Box data-testid="video-evidence-empty">
          <Typography variant="body2" color="text.secondary">
            {NO_RUN_EVIDENCE_MESSAGE}
          </Typography>
        </Box>
      );
    }

    const { video } = snapshot;
    const narrative = videoEvidenceNarrative(video.status);
    const statement =
      narrative.usesServerError && video.error !== null ? video.error : narrative.statement;
    const isAvailable = video.status === 'AVAILABLE';
    const isPartial = isAvailable && video.partial;
    // Keyed on the run outcome, not on `partial`: an orderly stop leaves `partial: false`.
    const stoppedRunStatement = isAvailable ? stoppedRunRecordingStatement(snapshot.errorCode) : null;
    const showsExpiry =
      (video.status === 'AVAILABLE' || video.status === 'EXPIRED') && video.expiresAt !== null;

    return (
      <Box
        component="section"
        role="region"
        aria-label={narrative.title}
        data-testid="video-evidence"
        data-video-status={video.status}
      >
        <Stack spacing={1}>
          <Typography variant="subtitle2" component="h3" data-testid="video-evidence-title">
            {narrative.title}
          </Typography>
          <Typography variant="body2" data-testid="video-evidence-statement">
            {statement}
          </Typography>
          {stoppedRunStatement !== null && (
            <Typography variant="body2" data-testid="video-evidence-stopped-run">
              {stoppedRunStatement}
            </Typography>
          )}
          {isPartial && (
            <Typography variant="body2" color="warning.main" data-testid="video-evidence-partial">
              {PARTIAL_RECORDING_QUALIFIER}
            </Typography>
          )}
          {showsExpiry && (
            <Typography variant="caption" color="text.secondary" data-testid="video-evidence-expiry">
              {video.status === 'EXPIRED'
                ? `Expired on ${video.expiresAt}`
                : `Available until ${video.expiresAt}`}
            </Typography>
          )}
          {playbackUrl !== null && (
            <video
              ref={videoRef}
              key={playbackUrl}
              src={playbackUrl}
              controls
              preload="metadata"
              aria-label={`Recording of execution ${snapshot.executionId}`}
              data-testid="video-evidence-player"
              style={{ width: '100%', maxHeight: 360, backgroundColor: 'black' }}
              onError={() => setPlaybackFailed(true)}
            />
          )}
          {playbackUrl !== null && playbackFailed && (
            <Alert severity="warning" data-testid="video-playback-failed">
              {PLAYBACK_FAILED_MESSAGE}
            </Alert>
          )}
        </Stack>
      </Box>
    );
  },
);

export default VideoEvidencePanel;
