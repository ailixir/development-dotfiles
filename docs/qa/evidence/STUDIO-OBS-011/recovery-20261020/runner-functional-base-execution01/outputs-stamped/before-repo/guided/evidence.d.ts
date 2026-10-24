import type { RecordingScratch } from '../run/recordingScratch.js';
import type { Clock } from '../executor/stepReporter.js';
import type { EvidenceFileSystem, EvidenceUploadBounds } from '../run/evidenceUpload.js';
import type { GuidedRecordingRequest } from '../run/guidedBrowser.js';
import type { GuidedRecordingState } from '../run/manifest.js';
import type { ObjectStoreClient } from '../run/objectStore.js';
import type { RecordingObservation } from '../run/recording.js';
import type { OriginSource } from '../run/timeline.js';
import type { ActionTiming, BridgeIdentity, BridgeRecordingEvidence } from './types.js';
/** Every key segment and the recording id (AR-1 R3/R5): no `/`, no `.`, so no traversal. */
export declare const GUIDED_RECORDING_SEGMENT: RegExp;
export interface GuidedRecordingKeys {
    readonly videoKey: string;
    readonly manifestKey: string;
}
/**
 * The server-derivable keys (AR-1 R5): `studio/{csiId}/guided/{sessionId}.webm` and
 * `….manifest.json`. The backend's `GuidedRecordingKeys` derives the same two strings from the same
 * two segments, and both are tested against one shared golden vector. A segment outside
 * {@link GUIDED_RECORDING_SEGMENT} derives nothing: the runner then uploads nothing and reports
 * `UNAVAILABLE` (fail closed), exactly where the backend would refuse.
 */
export declare function guidedRecordingKeys(csiId: string | null | undefined, sessionId: string): GuidedRecordingKeys | null;
/** The `recording-evidence` callback body (AR-1 R3 `bridge#/definitions/recordingEvidence`). */
export type RecordingEvidenceBody = BridgeRecordingEvidence;
export type RecordingEvidenceCallback = (route: 'recording-evidence', message: RecordingEvidenceBody, idempotencyKey: string) => Promise<void>;
export interface GuidedRecorderPorts {
    readonly store: ObjectStoreClient;
    readonly fileSystem: EvidenceFileSystem;
    readonly bounds: EvidenceUploadBounds;
    /** The runner's `RECORDING_WIDTH/HEIGHT`: the geometry replay records at. */
    readonly size: {
        readonly width: number;
        readonly height: number;
    };
    /** `STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS`, handed to `takeRunOrigin` unchanged (R4). */
    readonly calibrationOffsetMs: number;
    /** Always injected: the guided path has no `performance.now()` default (ADR-002 §11.6 item 1). */
    readonly originSource: OriginSource;
    /** Monotonic milliseconds for the upload window. */
    readonly now: () => number;
    readonly sleep: (ms: number) => Promise<void>;
    /** Parent of the per-session evidence directory; defaults to `TMPDIR`. Never the profile. */
    readonly evidenceRoot?: string;
    /** Prepared before worker readiness; lazy private ownership for embedded trusted callers. */
    readonly recordingScratch?: RecordingScratch;
    /** Same-body, same-key callback attempts, the first included. AR-1 R3: at most 3. */
    readonly callbackAttempts?: number;
    readonly callbackBackoffMs?: number;
    /** Test seam for the four-byte inspection; production uses `inspectRecordingFile`. */
    readonly inspect?: (path: string | null, orderlyClose: boolean) => Promise<RecordingObservation>;
}
export interface GuidedRecorder {
    /** Never throws: a session that cannot be recorded settles as `UNAVAILABLE`. */
    open(session: {
        readonly sessionId: string;
        readonly csiId: string | null;
        readonly maxSessionSeconds: number;
    }): Promise<GuidedSessionRecording>;
}
export declare const MAX_RECORDING_CALLBACK_ATTEMPTS = 3;
export declare function createGuidedRecorder(ports: GuidedRecorderPorts): GuidedRecorder;
interface Reading {
    readonly admissionId: string;
    readonly stepId: string;
    readonly ordinal: number;
    readonly startMs: number;
    endMs: number | null;
}
/** One dispatched action's reading pair. `end(true)` stamps the end once; `end(false)` forces `null`. */
export interface ActionStamp {
    end(known: boolean): void;
}
/**
 * Integer milliseconds, rounded once here because the guided wire forbids fractional lexemes
 * (AR-1 R2 "rounding"), sorted by the R2 order with ARCH015-03's final admissionId key, both
 * identifiers in code point order. Every item is `kind: action`: step items are derived by the
 * backend, and the reserved kinds belong to OBS-015.
 */
export declare function wireTimings(readings: readonly Reading[]): ActionTiming[];
/**
 * The scale assertion of ADR-002 §11.6 item 4, applied runner-side with the backend's bound
 * (AR-1 R2 "scaleGuard"): every reading lies inside the session (`0..maxSessionSeconds×1000`) and
 * no end precedes its start. A process-origin clock fails it at the first reading.
 */
export declare function timingScaleHolds(timings: readonly ActionTiming[], maxSessionSeconds: number): boolean;
export declare class GuidedSessionRecording {
    private readonly ports;
    readonly sessionId: string;
    readonly keys: GuidedRecordingKeys | null;
    readonly directory: string | null;
    private readonly maxSessionSeconds;
    private readonly scratch;
    /** Generated once per session recording; the callback key is `rec-` + this id. */
    readonly recordingId: `${string}-${string}-${string}-${string}-${string}`;
    private origin;
    private requested;
    private recorded;
    private readonly readings;
    private settlement;
    constructor(ports: GuidedRecorderPorts, sessionId: string, keys: GuidedRecordingKeys | null, directory: string | null, maxSessionSeconds: number, scratch: () => Promise<RecordingScratch>);
    /** The recorded-context request, or `null` when this session cannot be recorded at all. */
    launchRequest(): GuidedRecordingRequest | null;
    /** The session run clock, zeroed at recording-context readiness; `null` before or without it. */
    get clock(): Clock | null;
    /** Stamps a dispatched action immediately before its browser effect. IDs and times only. */
    begin(admissionId: string, stepId: string, ordinal: number): ActionStamp | null;
    /**
     * Settles once: classify → upload → manifest → callback → delete the directory. Never rejects,
     * and resolves with the state reported (or attempted) on the wire.
     */
    settle(input: {
        readonly identity: BridgeIdentity;
        readonly videoPath: string | null;
        readonly orderlyClose: boolean;
        readonly callback: RecordingEvidenceCallback;
    }): Promise<GuidedRecordingState>;
    private run;
    /** Byte-identical body under one key, at most {@link MAX_RECORDING_CALLBACK_ATTEMPTS} times. */
    private deliver;
}
export {};
