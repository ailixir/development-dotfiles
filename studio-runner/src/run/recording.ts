/**
 * The recording lifecycle and the runner's evidence vocabulary (AC-7, AC-8, AC-9).
 *
 * ## Evidence is not outcome
 *
 * Architecture §6.1: *"Upload failure never overwrites a known assertion outcome."* A run whose
 * assertions passed and whose video did not flush is a `PASSED` run with failed evidence, and
 * that has to be true on the wire, not merely in prose. Nothing in this module ever returns or
 * influences a `RunOutcome`: it answers one question — what state is the evidence in — and the
 * child and the coordinator keep the two apart by construction.
 *
 * ## The three words this story may use
 *
 * `PENDING`, `FAILED`, `UNAVAILABLE`. **`STORED` is not this story's word**: storage is 10.14, so
 * `PENDING` is the honest state for a playable recording nobody has uploaded yet, and the type
 * below cannot express `STORED` at all — which is a stronger guarantee than a review comment
 * saying not to emit it (AC-9).
 *
 * The recording lives and dies in scratch. Until 10.14 uploads it, the file is deleted with the
 * rest of the per-run directory (AC-22), and saying so plainly is better than implying a file
 * survives.
 */

/**
 * The runner's evidence states.
 *
 * Deliberately a narrower type than the contract's `RunnerEvidence.state`, which also admits
 * `STORED`. The contract describes what the field may ever hold across the whole epic; this type
 * describes what *this* producer may put there today.
 */
export type RunnerEvidenceState = 'PENDING' | 'FAILED' | 'UNAVAILABLE';

/** The smallest file that can be a webm at all: EBML header plus a cluster (§6.1, AC-7). */
export const MIN_PLAYABLE_RECORDING_BYTES = 512;

/** EBML magic. Every Matroska/WebM file starts with it. */
export const WEBM_MAGIC = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]);

export interface RecordingOutcome {
  /** Path inside the per-run scratch directory, or `null` when no file was produced. */
  readonly path: string | null;
  /** Size in bytes. The epic's "explicit readable recording size" is a reported number. */
  readonly bytes: number | null;
  /** Redacted diagnostic; `null` unless the recording could not be produced or flushed. */
  readonly error: string | null;
  readonly state: RunnerEvidenceState;
}

export interface RecordingObservation {
  /** Whether recording was configured at all. `false` means nothing was ever attempted. */
  readonly attempted: boolean;
  readonly path: string | null;
  readonly bytes: number | null;
  /** A readable EBML header was found at the start of the file. */
  readonly header: boolean;
  /** Whatever went wrong while producing or flushing it. */
  readonly error: string | null;
}

/**
 * Turns what the child observed into the evidence state, and nothing else.
 *
 * - a playable file, not yet stored → `PENDING` (storage is 10.14);
 * - recording was attempted and produced no playable file → `FAILED`;
 * - recording was never attempted, so there is nothing to have failed → `UNAVAILABLE`.
 *
 * "Playable" is checked, not assumed: a non-trivial size **and** a readable webm header. A
 * zero-byte or truncated file that reported `PENDING` would tell the API an upload is coming for
 * something that cannot be played.
 */
export function evidenceFor(observation: RecordingObservation): RecordingOutcome {
  if (!observation.attempted) {
    return { path: null, bytes: null, error: observation.error, state: 'UNAVAILABLE' };
  }

  const playable =
    observation.error === null &&
    observation.path !== null &&
    observation.header &&
    observation.bytes !== null &&
    observation.bytes >= MIN_PLAYABLE_RECORDING_BYTES;

  if (playable) {
    return {
      path: observation.path,
      bytes: observation.bytes,
      error: null,
      // Not `STORED`: this story uploads nothing (AC-9).
      state: 'PENDING',
    };
  }

  return {
    path: observation.path,
    bytes: observation.bytes,
    error:
      observation.error ??
      (observation.path === null
        ? 'The recording context produced no file.'
        : `The recording file is not playable (${String(observation.bytes ?? 0)} bytes, ` +
          `header ${observation.header ? 'present' : 'absent'}).`),
    state: 'FAILED',
  };
}

/** Whether a buffer begins with the EBML magic. Reads the first four bytes, never the file. */
export function hasWebmHeader(head: Uint8Array): boolean {
  if (head.length < WEBM_MAGIC.length) return false;
  return WEBM_MAGIC.every((byte, index) => head[index] === byte);
}
