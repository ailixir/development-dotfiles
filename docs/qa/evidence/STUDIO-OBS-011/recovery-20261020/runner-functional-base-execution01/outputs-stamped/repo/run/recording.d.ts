/**
 * The runner's evidence states — now the contract's four (story 10.14 AC-8).
 *
 * `STORED` is **earned**: it is written by `uploadRecording` after the store acknowledges the put,
 * never before, never optimistically, and never because a file was playable. Nothing in this module
 * returns it.
 */
export type RunnerEvidenceState = 'PENDING' | 'STORED' | 'FAILED' | 'UNAVAILABLE';
/** What a recorder alone can observe. `STORED` is not reachable from here (AC-8). */
export type RecordedEvidenceState = Exclude<RunnerEvidenceState, 'STORED'>;
/** The smallest file that can be a webm at all: EBML header plus a cluster (§6.1, AC-7). */
export declare const MIN_PLAYABLE_RECORDING_BYTES = 512;
/** EBML magic. Every Matroska/WebM file starts with it. */
export declare const WEBM_MAGIC: Uint8Array<ArrayBuffer>;
export interface RecordingOutcome {
    /** Path inside the per-run scratch directory, or `null` when no file was produced. */
    readonly path: string | null;
    /** Size in bytes. The epic's "explicit readable recording size" is a reported number. */
    readonly bytes: number | null;
    /** Redacted diagnostic; `null` unless the recording could not be produced or flushed. */
    readonly error: string | null;
    /** What a recorder can observe. `STORED` is the uploader's word and is unreachable here. */
    readonly state: RecordedEvidenceState;
    /**
     * Whether the recording covers only part of the browser session it was recording.
     *
     * See {@link partialFor}. Emitted on every `FINAL`, `false` included (ADR-002 §17.7 item 2).
     */
    readonly partial: boolean;
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
    /**
     * Whether the **recorder was closed in an orderly way** (ADR-002 §17.3).
     *
     * In the child this is "`context.close()` resolved"; in the parent, on a deadline kill, it is
     * "the ordered stop completed within `browserStopTimeoutMs`" — the fact §17.7 names as the
     * distinguishing one, recorded **before** the signal. It is an observation of how the recording
     * *ended*, and it is the only input {@link partialFor} takes besides the evidence state.
     */
    readonly orderlyClose: boolean;
}
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
export declare function partialFor(state: RecordedEvidenceState, orderlyClose: boolean): boolean;
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
export declare function evidenceFor(observation: RecordingObservation): RecordingOutcome;
/** Whether a buffer begins with the EBML magic. Reads the first four bytes, never the file. */
export declare function hasWebmHeader(head: Uint8Array): boolean;
/**
 * Reads the produced file: its size and whether it begins with a readable webm header.
 *
 * Four bytes, never the file. Shared by the replay child (`childRuntime.ts`) and the guided
 * session recording (`guided/evidence.ts`, STUDIO-OBS-013 AC-1) so both classify a recording with
 * the same observation and the same {@link evidenceFor}.
 */
export declare function inspectRecordingFile(path: string | null, orderlyClose?: boolean): Promise<RecordingObservation>;
