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
 * ## The four words, and where the fourth is earned
 *
 * `PENDING`, `FAILED`, `UNAVAILABLE` — and, since story 10.14, `STORED`.
 *
 * Story 10.13 narrowed this type to three on purpose, because storage was 10.14's and a type that
 * cannot express `STORED` is a stronger guarantee than a review comment saying not to emit it.
 * 10.14 widens it **here and only here**, and nothing in this module can produce the new word: it
 * is set in exactly one place, `uploadRecording` in `src/run/evidenceUpload.ts`, and only after the
 * store has acknowledged the object write (AC-8). `PENDING` remains what a recorder produces — a
 * playable recording nobody has uploaded **yet**.
 *
 * The recording still lives and dies in scratch. Story 10.14 uploads it **before**
 * `runScratch.clear()` runs, which is the ordering AC-3 makes normative: 10.13 moved the scratch
 * clear ahead of the delivery window deliberately, so "before the result is delivered" and "while
 * the file still exists" are different instants and only the second one is useful.
 */
import { open } from 'node:fs/promises';
/** The smallest file that can be a webm at all: EBML header plus a cluster (§6.1, AC-7). */
export const MIN_PLAYABLE_RECORDING_BYTES = 512;
/** EBML magic. Every Matroska/WebM file starts with it. */
export const WEBM_MAGIC = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]);
/**
 * Whether a recording is partial — **from how it ended, never from how the run ended**.
 *
 * ADR-002 §17.3: *"the recording does not cover the whole browser session it was recording"*.
 * Frames are missing relative to what the browser actually did, because the recorder was not
 * closed in an orderly way. It is a fact about the **recording**, never about the run.
 *
 * Two cases make the difference concrete, and §17.4 names them as the counter-examples that kill
 * the cheap inference `partial = (errorCode === TIMEOUT)`:
 *
 * - a deadline kill whose ordered stop **flushed cleanly** is `partial: false` — §5.2's ordered
 *   close exists precisely so the webm is finalized, and a timeout is not automatically a
 *   truncation;
 * - a recorder that died on a **passing** run is `partial: true`.
 *
 * The signature is the guarantee: this function cannot read an outcome, an error code or a step
 * status, because it is not given one. §17.4 forbids deriving `partial` from `outcome` in either
 * direction, by either component, and the cheapest way to keep that true is to make the derivation
 * impossible to write here.
 *
 * Partiality is meaningful only where a playable object exists (§17.3). `FAILED` and `UNAVAILABLE`
 * are `false`, because a recording that does not exist is not a partial one.
 *
 * The parameter is deliberately {@link RecordedEvidenceState} and not {@link RunnerEvidenceState}:
 * once story 10.14 widened the vocabulary, calling this with `STORED` would return `false` and
 * silently clear a truthful `partial` on every successful upload — the single most likely accident
 * in that story (AC-9). Narrowing the parameter makes that call a type error rather than a bug.
 */
export function partialFor(state, orderlyClose) {
    if (state !== 'PENDING')
        return false;
    return !orderlyClose;
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
export function evidenceFor(observation) {
    if (!observation.attempted) {
        return {
            path: null,
            bytes: null,
            error: observation.error,
            state: 'UNAVAILABLE',
            partial: false,
        };
    }
    const playable = observation.error === null &&
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
            // A playable file the recorder never closed in an orderly way is a salvaged prefix, and
            // saying `false` here is the sentence the epic's third acceptance bullet forbids.
            partial: partialFor('PENDING', observation.orderlyClose),
        };
    }
    return {
        path: observation.path,
        bytes: observation.bytes,
        error: observation.error ??
            (observation.path === null
                ? 'The recording context produced no file.'
                : `The recording file is not playable (${String(observation.bytes ?? 0)} bytes, ` +
                    `header ${observation.header ? 'present' : 'absent'}).`),
        state: 'FAILED',
        partial: false,
    };
}
/** Whether a buffer begins with the EBML magic. Reads the first four bytes, never the file. */
export function hasWebmHeader(head) {
    if (head.length < WEBM_MAGIC.length)
        return false;
    return WEBM_MAGIC.every((byte, index) => head[index] === byte);
}
/**
 * Reads the produced file: its size and whether it begins with a readable webm header.
 *
 * Four bytes, never the file. Shared by the replay child (`childRuntime.ts`) and the guided
 * session recording (`guided/evidence.ts`, STUDIO-OBS-013 AC-1) so both classify a recording with
 * the same observation and the same {@link evidenceFor}.
 */
export async function inspectRecordingFile(path, orderlyClose = true) {
    if (path === null) {
        return { attempted: true, path: null, bytes: null, header: false, error: null, orderlyClose };
    }
    try {
        const file = await open(path, 'r');
        let stats, head;
        try {
            stats = await file.stat();
            head = Buffer.alloc(4);
            await file.read(head, 0, 4, 0);
        }
        finally {
            await file.close();
        }
        return {
            attempted: true,
            path,
            bytes: stats.size,
            header: hasWebmHeader(head.subarray(0, 4)),
            error: null,
            orderlyClose,
        };
    }
    catch (error) {
        return {
            attempted: true,
            path,
            bytes: null,
            header: false,
            error: error instanceof Error ? error.name : 'unknown',
            orderlyClose,
        };
    }
}
//# sourceMappingURL=recording.js.map