import type { VideoStatus } from '@/types/studio/studioTypes';

/**
 * What the run's evidence state means, per `VideoStatus` (story 10.16a, AC-1, AC-2).
 *
 * Architecture §6.1 keeps the check outcome and the evidence state apart, and names five evidence
 * states that must not be collapsed into one "no video" message. Before this story the page showed
 * *"Visual proof will appear after run"* for `FAILED`, `UNAVAILABLE` and `EXPIRED` alike.
 *
 * The pattern is `executionErrorNarratives.ts`: an object literal typed `Record<VideoStatus, …>`,
 * so TypeScript rejects a missing key and an excess key, and a lookup that **throws** on anything
 * else, with no `??` fallback. `studioContract.test.ts` compares this record's keys with
 * `components.schemas.VideoStatus.enum` in `openapi.yaml`, in both directions (ADR-002 §18.3).
 *
 * `usesServerError` is true for exactly the two states architecture §6.1 describes as failures of
 * different kinds: `FAILED` (evidence production or upload failed) and `UNAVAILABLE` (the run has no
 * usable recording). For those two, `video.error` is shown verbatim when the server supplies it, and
 * `statement` only when it is `null`.
 */
export interface VideoEvidenceNarrative {
  /** The evidence region's accessible name. Distinct per state; AC-1 asserts it. */
  readonly title: string;
  /** What the reader is told when the server supplies no wording of its own. */
  readonly statement: string;
  /** True only where `video.error` is the server's explanation of this state. */
  readonly usesServerError: boolean;
}

export const VIDEO_EVIDENCE_NARRATIVES: Readonly<Record<VideoStatus, VideoEvidenceNarrative>> = {
  PROCESSING: {
    title: 'The recording is still being produced',
    statement:
      "The run's outcome may already be final, but its recording is not ready yet. It will appear here once the server has finished producing it.",
    usesServerError: false,
  },
  AVAILABLE: {
    title: 'The recording is available',
    statement: 'Play the recording here, or choose a step to jump to the moment it started.',
    usesServerError: false,
  },
  FAILED: {
    title: 'The recording could not be produced',
    statement:
      "Producing or uploading this run's recording failed. The run's outcome is not affected by this.",
    usesServerError: true,
  },
  UNAVAILABLE: {
    title: 'This run has no usable recording',
    statement: 'There is no usable recording for this run.',
    usesServerError: true,
  },
  EXPIRED: {
    title: 'The recording has expired',
    statement: "This run's recording is past its retention period and can no longer be played.",
    usesServerError: false,
  },
};

/**
 * AC-3: shown only beside an `AVAILABLE` recording whose body says `partial: true`.
 *
 * The wording is ADR-002 §17.3's ruling: the recording does not cover the whole browser session.
 * It says nothing about the test, because partiality says nothing about the outcome (§17.4).
 */
export const PARTIAL_RECORDING_QUALIFIER =
  'This recording is partial: it does not cover the whole browser session, because the recorder did not stop in an orderly way.';

/**
 * AC-12: the one message for a `<video>` that failed after being given an `AVAILABLE` URL.
 *
 * A media element exposes only a `MediaError.code`, never an HTTP status, so this wording cannot
 * depend on the cause and does not try to name one.
 */
export const PLAYBACK_FAILED_MESSAGE = 'The recording could not be played here.';

/** Rendered before any run is on screen. It is not one of the five states and does not pose as one. */
export const NO_RUN_EVIDENCE_MESSAGE = 'No run is on screen yet, so there is no recording to show.';

export const DOWNLOAD_RECORDING_LABEL = 'Download recording';

/**
 * Total lookup. A sixth value throws rather than rendering a generic panel that would hide which
 * of the five states is true.
 */
export function videoEvidenceNarrative(status: string): VideoEvidenceNarrative {
  // An own-property check, so an inherited name such as `toString` is not mistaken for a state.
  if (!Object.prototype.hasOwnProperty.call(VIDEO_EVIDENCE_NARRATIVES, status)) {
    throw new Error(
      `Unknown VideoStatus "${status}": the five values of architecture §6.1 are the whole set, ` +
        'and rendering an unknown one as a generic state would hide what happened to the recording.',
    );
  }
  return (VIDEO_EVIDENCE_NARRATIVES as Record<string, VideoEvidenceNarrative>)[status];
}
