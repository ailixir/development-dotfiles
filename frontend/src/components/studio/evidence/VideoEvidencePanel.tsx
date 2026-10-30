import { forwardRef, useEffect, useState } from 'react';
import { Alert, Box, Stack, Typography } from '@mui/material';
import type { ExecutionErrorCode, ExecutionSnapshot, VideoEvidence, VideoStatus } from '@/types/studio/studioTypes';
import { studioGuidedApi } from '@/services/api/studioGuidedApi';
import {
  NO_RUN_EVIDENCE_MESSAGE,
  PARTIAL_RECORDING_QUALIFIER,
  PLAYBACK_FAILED_MESSAGE,
  RUN_IN_PROGRESS_EVIDENCE_MESSAGE,
  stoppedRunRecordingStatement,
  videoEvidenceNarrative,
} from './videoEvidenceNarratives';
import { studioVideoUrl } from './studioVideoUrl';
import { formatEvidenceInstant } from './formatEvidenceInstant';

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
 *
 * **Two recordings, one panel** (STUDIO-OBS-008 AC-7). The input is either a replay `snapshot` (the
 * proof of a learn, and every later Run) or the `guided` recording of a learning attempt that did not
 * publish; which one is discriminated by the prop that is present, so the existing replay call sites
 * are unchanged. A guided Run is never dressed up as a replay snapshot:
 *
 *  - its state is `result.evidence.video`, read by the same narratives (PLAYBACK-COPY, neutral
 *    guided wording, is descoped by the user, 2026-10-17, so the existing wording is used as is);
 *  - its URL is `studioGuidedApi.videoPath(sessionId)` (`getGuidedSessionVideo`, D-2), built only
 *    for `AVAILABLE`, through the same `studioVideoUrl` composition;
 *  - it carries no replay `errorCode`, so the stopped-run line, which is keyed on that code, is never
 *    claimed for it.
 *
 * A recording with no status at all (a reaper-closed replay, 015 H9 observation) shows the
 * `UNAVAILABLE` narrative (D-10) instead of failing the panel.
 */

/**
 * The guided half of the input: the session and the recording of its learning attempt. It exists only
 * for a learn that did not publish (`result.evidence.video` non-null); a published learn has no
 * learning recording, and its proof is the replay execution (`result.proof`).
 */
export interface GuidedVideoEvidence {
  readonly sessionId: string;
  readonly result: {
    readonly executionId: string;
    readonly evidence: { readonly video: VideoEvidence };
  };
}

export type VideoEvidencePanelProps =
  | {
      /** Null before any run is on screen. */
      readonly snapshot: ExecutionSnapshot | null;
      readonly guided?: undefined;
      /** Round 067 D7: a Run is live, so a null snapshot means "not yet", not "no run". */
      readonly runInProgress?: boolean;
    }
  | {
      readonly guided: GuidedVideoEvidence;
      readonly snapshot?: undefined;
      readonly runInProgress?: undefined;
    };

/** What the panel renders, whichever recording it is. */
interface EvidenceSource {
  readonly video: VideoEvidence;
  readonly status: VideoStatus;
  readonly playbackUrl: string | null;
  readonly executionId: string;
  readonly errorCode: ExecutionErrorCode | null;
}

/** D-10 / 015 H9: a recording the server gave no status is shown as having no usable recording. */
function statusOf(video: VideoEvidence): VideoStatus {
  return (video.status as VideoStatus | null | undefined) ?? 'UNAVAILABLE';
}

function evidenceSource(props: VideoEvidencePanelProps): EvidenceSource | null {
  if (props.guided !== undefined) {
    const { sessionId, result } = props.guided;
    const { video } = result.evidence;
    const status = statusOf(video);
    return {
      video,
      status,
      playbackUrl: status === 'AVAILABLE' ? studioGuidedApi.videoPath(sessionId) : null,
      executionId: result.executionId,
      errorCode: null,
    };
  }
  const { snapshot } = props;
  if (snapshot === null) {
    return null;
  }
  const status = statusOf(snapshot.video);
  return {
    video: snapshot.video,
    status,
    playbackUrl:
      status === 'AVAILABLE' && snapshot.videoPath !== null ? studioVideoUrl(snapshot.videoPath) : null,
    executionId: snapshot.executionId,
    errorCode: snapshot.errorCode,
  };
}

export const VideoEvidencePanel = forwardRef<HTMLVideoElement, VideoEvidencePanelProps>(
  function VideoEvidencePanel(props, videoRef) {
    const source = evidenceSource(props);
    const playbackUrl = source?.playbackUrl ?? null;

    const [playbackFailed, setPlaybackFailed] = useState(false);
    // A new recording starts with no failure carried over from the previous one.
    useEffect(() => {
      setPlaybackFailed(false);
    }, [playbackUrl]);

    if (source === null && props.runInProgress === true) {
      return (
        <Box data-testid="video-evidence-pending-run">
          <Typography variant="body2" color="text.secondary">
            {RUN_IN_PROGRESS_EVIDENCE_MESSAGE}
          </Typography>
        </Box>
      );
    }

    if (source === null) {
      return (
        <Box data-testid="video-evidence-empty">
          <Typography variant="body2" color="text.secondary">
            {NO_RUN_EVIDENCE_MESSAGE}
          </Typography>
        </Box>
      );
    }

    const { video, status } = source;
    const narrative = videoEvidenceNarrative(status);
    const statement =
      narrative.usesServerError && video.error !== null ? video.error : narrative.statement;
    const isAvailable = status === 'AVAILABLE';
    const isPartial = isAvailable && video.partial;
    // Keyed on the run outcome, not on `partial`: an orderly stop leaves `partial: false`.
    const stoppedRunStatement = isAvailable ? stoppedRunRecordingStatement(source.errorCode) : null;
    const expiry =
      (status === 'AVAILABLE' || status === 'EXPIRED') && video.expiresAt !== null
        ? formatEvidenceInstant(video.expiresAt)
        : null;

    return (
      <Box
        component="section"
        role="region"
        aria-label={narrative.title}
        data-testid="video-evidence"
        data-video-status={status}
        data-evidence-kind={props.guided !== undefined ? 'guided' : 'replay'}
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
          {expiry !== null && (
            <Typography variant="caption" color="text.secondary" data-testid="video-evidence-expiry">
              {status === 'EXPIRED'
                ? `Expired on ${expiry}`
                : `Available until ${expiry}`}
            </Typography>
          )}
          {playbackUrl !== null && (
            <video
              ref={videoRef}
              key={playbackUrl}
              src={playbackUrl}
              controls
              preload="metadata"
              aria-label={`Recording of execution ${source.executionId}`}
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
