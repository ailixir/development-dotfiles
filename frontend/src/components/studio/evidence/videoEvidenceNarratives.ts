import type { ExecutionErrorCode, VideoStatus } from '@/types/studio/studioTypes';
import { guidedCopy } from '@/components/studio/guided/guidedNarratives';

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
 * A recording that ends where the run was stopped, keyed on the **run outcome** and never on
 * `partial`.
 *
 * When a run hits its total time cap (`TIMEOUT`) or is stopped on request (`CANCELLED`), the runner
 * performs an orderly stop and flushes the recording. ADR-002 §17.3: *"A deadline kill whose
 * ordered stop flushed cleanly is not partial."* So the body says `partial: false`, and the reader
 * gets a clean-looking video that simply ends early, with nothing on the page saying why. These two
 * lines say why.
 *
 * They are distinct from {@link PARTIAL_RECORDING_QUALIFIER} on purpose, and the two can both be
 * true: a stopped run whose recorder then also died is `partial: true` **and** stopped. Neither
 * line is derived from the other's condition (§17.4).
 *
 * The set is exactly the two codes under which the runner had a browser and stopped it in an
 * orderly way. Every other code either never started a browser or lost it without a stop
 * (`executionErrorNarratives.ts`), so there is no recording end to explain. `satisfies` keeps both
 * members inside the contract's vocabulary: dropping either from `EXECUTION_ERROR_CODES` fails the
 * type-check here.
 */
export const STOPPED_RUN_ERROR_CODES = ['TIMEOUT', 'CANCELLED'] as const satisfies readonly ExecutionErrorCode[];

export type StoppedRunErrorCode = (typeof STOPPED_RUN_ERROR_CODES)[number];

/** Shown only beside an `AVAILABLE` recording. The reader is told where the recording ends, and why. */
export const STOPPED_RUN_RECORDING_STATEMENTS: Readonly<Record<StoppedRunErrorCode, string>> = {
  TIMEOUT:
    'The recording ends where the run was stopped: the run reached its total time cap, so nothing after that point was captured.',
  CANCELLED:
    'The recording ends where the run was stopped on request, so nothing after the stop was captured.',
};

function isStoppedRunErrorCode(code: ExecutionErrorCode | null): code is StoppedRunErrorCode {
  return code !== null && (STOPPED_RUN_ERROR_CODES as readonly ExecutionErrorCode[]).includes(code);
}

/**
 * The stopped-run line for a run outcome, or `null` where there is none to give: a run that ended
 * without a code, and every code that is not an orderly stop. Null is the ordinary case here, not a
 * fallback, which is why this lookup does not throw the way {@link videoEvidenceNarrative} does.
 */
export function stoppedRunRecordingStatement(errorCode: ExecutionErrorCode | null): string | null {
  return isStoppedRunErrorCode(errorCode) ? STOPPED_RUN_RECORDING_STATEMENTS[errorCode] : null;
}

/**
 * AC-12: the one message for a `<video>` that failed after being given an `AVAILABLE` URL.
 *
 * A media element exposes only a `MediaError.code`, never an HTTP status, so this wording cannot
 * depend on the cause and does not try to name one.
 */
export const PLAYBACK_FAILED_MESSAGE = 'The recording could not be played here.';

/** Rendered before any run is on screen. It is not one of the five states and does not pose as one. */
export const NO_RUN_EVIDENCE_MESSAGE = 'No run is on screen yet, so there is no recording to show.';

/**
 * Round 067 D7: rendered while a Run is live and has no result on screen yet. Like
 * {@link NO_RUN_EVIDENCE_MESSAGE}, it is not one of the five states and does not pose as one.
 */
export const RUN_IN_PROGRESS_EVIDENCE_MESSAGE = guidedCopy('runInProgressEvidence');

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
