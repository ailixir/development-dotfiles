/**
 * The guided session recording (STUDIO-OBS-013 AC-1, AC-2, AC-3, AC-5; architect ruling AR-1).
 *
 * One recording per guided session, on the session's one persistent context, through the replay
 * pipeline that already exists: `run/recording.ts` classifies the file, `run/evidenceUpload.ts`
 * uploads it with the bounded window, `run/manifest.ts` serializes the manifest with its
 * redact-twice serializer, and `run/timeline.ts` takes the ADR-002 §11.6 origin. Nothing here is a
 * second recorder, a second uploader or a second clock.
 *
 * ## The order on stop (AR-1 R3 "R13")
 *
 * `context.close()` (in the runtime) → classify → upload under the server-derivable key → write the
 * guided manifest → `recording-evidence` callback → delete the evidence directory. The runtime's
 * stop does not wait for any of it: teardown is "browser gone", and the backend accepts the fact
 * after the session is terminal, inside its settle grace (AR-1 R3 acceptance predicate 7-8).
 *
 * ## Honest states on the guided wire (AR-1 R1/R3)
 *
 * `STORED` only after the store acknowledged the video. A recorder that produced no playable file,
 * a context that was never recorded and a key that cannot be derived are `UNAVAILABLE`; a store
 * that refused or could not be reached is `FAILED`. The two faults are kept apart because the
 * backend authors different public text for them. Nothing fakes a video.
 *
 * ## No text on the wire
 *
 * The callback body and the manifest carry pattern-bounded IDs, integers, enums and one constant
 * disclosure. No object key, URL, timestamp, label, observation text or value is sent to the
 * backend (AR-1 R3 "forbidden"; AC-2). The keys appear only in the manifest written to the store.
 */
import { randomUUID } from 'node:crypto';
import { prepareRecordingScratch } from '../run/recordingScratch.js';
import { tmpdir } from 'node:os';
import { createRedactor } from '../executor/redaction.js';
import { openEvidenceWindow, uploadRecording, writeResultManifest } from '../run/evidenceUpload.js';
import { buildGuidedRecordingManifest, RESULT_MANIFEST_CONTENT_TYPE, serializeResultManifest } from '../run/manifest.js';
import { evidenceFor, inspectRecordingFile } from '../run/recording.js';
import { takeRunOrigin } from '../run/timeline.js';
/** Every key segment and the recording id (AR-1 R3/R5): no `/`, no `.`, so no traversal. */
export const GUIDED_RECORDING_SEGMENT = /^[A-Za-z0-9_-]{1,256}$/u;
/**
 * The server-derivable keys (AR-1 R5): `studio/{csiId}/guided/{sessionId}.webm` and
 * `….manifest.json`. The backend's `GuidedRecordingKeys` derives the same two strings from the same
 * two segments, and both are tested against one shared golden vector. A segment outside
 * {@link GUIDED_RECORDING_SEGMENT} derives nothing: the runner then uploads nothing and reports
 * `UNAVAILABLE` (fail closed), exactly where the backend would refuse.
 */
export function guidedRecordingKeys(csiId, sessionId) {
    if (typeof csiId !== 'string' || !GUIDED_RECORDING_SEGMENT.test(csiId) || !GUIDED_RECORDING_SEGMENT.test(sessionId))
        return null;
    const prefix = `studio/${csiId}/guided/${sessionId}`;
    return { videoKey: `${prefix}.webm`, manifestKey: `${prefix}.manifest.json` };
}
export const MAX_RECORDING_CALLBACK_ATTEMPTS = 3;
export function createGuidedRecorder(ports) {
    let scratch;
    const owned = () => scratch ??= ports.recordingScratch ? Promise.resolve(ports.recordingScratch) : prepareRecordingScratch({ workerId: 'embedded-recorder', journalDirectory: ports.evidenceRoot ?? process.env.TMPDIR ?? tmpdir(), ...(ports.evidenceRoot === undefined ? {} : { evidenceRoot: ports.evidenceRoot }) });
    return {
        async open(session) {
            const keys = guidedRecordingKeys(session.csiId, session.sessionId);
            let directory = null;
            if (keys) {
                try {
                    directory = await (await owned()).allocate();
                }
                catch {
                    directory = null;
                }
            }
            return new GuidedSessionRecording(ports, session.sessionId, keys, directory, session.maxSessionSeconds, () => owned());
        },
    };
}
/**
 * Unicode code point (scalar) order, the backend's `GuidedRecordingTimings.codePoints`
 * (ARCH015-03 T1). JS `<` compares UTF-16 code units, which puts an astral character before
 * U+E000..U+FFFF; the backend's strict-order check would then refuse the whole timing list.
 */
function compareCodePoints(a, b) {
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        const x = a.codePointAt(i) ?? 0;
        const y = b.codePointAt(j) ?? 0;
        if (x !== y)
            return x - y;
        i += x > 0xffff ? 2 : 1;
        j += y > 0xffff ? 2 : 1;
    }
    return (a.length - i) - (b.length - j);
}
/**
 * Integer milliseconds, rounded once here because the guided wire forbids fractional lexemes
 * (AR-1 R2 "rounding"), sorted by the R2 order with ARCH015-03's final admissionId key, both
 * identifiers in code point order. Every item is `kind: action`: step items are derived by the
 * backend, and the reserved kinds belong to OBS-015.
 */
export function wireTimings(readings) {
    return [...readings]
        .map(r => ({ ...r, startMs: Math.round(r.startMs), endMs: r.endMs === null ? null : Math.round(r.endMs) }))
        .sort((a, b) => a.startMs - b.startMs || a.ordinal - b.ordinal || compareCodePoints(a.stepId, b.stepId) || compareCodePoints(a.admissionId, b.admissionId))
        .map((r) => ({ kind: 'action', stepId: r.stepId, admissionId: r.admissionId, ordinal: r.ordinal, startMs: r.startMs, endMs: r.endMs }));
}
/**
 * The scale assertion of ADR-002 §11.6 item 4, applied runner-side with the backend's bound
 * (AR-1 R2 "scaleGuard"): every reading lies inside the session (`0..maxSessionSeconds×1000`) and
 * no end precedes its start. A process-origin clock fails it at the first reading.
 */
export function timingScaleHolds(timings, maxSessionSeconds) {
    const bound = maxSessionSeconds * 1000;
    return timings.every(t => Number.isSafeInteger(t.startMs) && t.startMs >= 0 && t.startMs <= bound && (t.endMs === null || (Number.isSafeInteger(t.endMs) && t.endMs >= t.startMs && t.endMs <= bound)));
}
export class GuidedSessionRecording {
    ports;
    sessionId;
    keys;
    directory;
    maxSessionSeconds;
    scratch;
    /** Generated once per session recording; the callback key is `rec-` + this id. */
    recordingId = randomUUID();
    origin = null;
    requested = false;
    recorded = false;
    readings = [];
    settlement = null;
    constructor(ports, sessionId, keys, directory, maxSessionSeconds, scratch) {
        this.ports = ports;
        this.sessionId = sessionId;
        this.keys = keys;
        this.directory = directory;
        this.maxSessionSeconds = maxSessionSeconds;
        this.scratch = scratch;
    }
    /** The recorded-context request, or `null` when this session cannot be recorded at all. */
    launchRequest() {
        if (!this.keys || this.directory === null || this.requested)
            return null;
        this.requested = true;
        return {
            dir: this.directory,
            size: { width: this.ports.size.width, height: this.ports.size.height },
            ready: (recording) => {
                // One origin per session, never re-taken (AR-1 R4). A second readiness is ignored.
                if (this.origin)
                    return;
                this.recorded = recording;
                this.origin = takeRunOrigin(this.ports.originSource, this.ports.calibrationOffsetMs);
            },
        };
    }
    /** The session run clock, zeroed at recording-context readiness; `null` before or without it. */
    get clock() { return this.recorded ? this.origin?.clock ?? null : null; }
    /** Stamps a dispatched action immediately before its browser effect. IDs and times only. */
    begin(admissionId, stepId, ordinal) {
        const clock = this.clock;
        if (!clock || this.settlement || this.readings.length >= 200)
            return null;
        const reading = { admissionId, stepId, ordinal, startMs: clock.now(), endMs: null };
        this.readings.push(reading);
        let ended = false;
        return {
            end: (known) => {
                // An unobserved completion always wins: UNKNOWN_OUTCOME carries endMs null (AR-1 R2).
                if (!known) {
                    ended = true;
                    reading.endMs = null;
                    return;
                }
                if (ended)
                    return;
                ended = true;
                reading.endMs = clock.now();
            },
        };
    }
    /**
     * Settles once: classify → upload → manifest → callback → delete the directory. Never rejects,
     * and resolves with the state reported (or attempted) on the wire.
     */
    settle(input) {
        this.settlement ??= this.run(input).catch(() => 'UNAVAILABLE');
        return this.settlement;
    }
    async run(input) {
        let state = 'UNAVAILABLE';
        let partial = false;
        try {
            const redactor = createRedactor([]);
            const ports = { store: this.ports.store, fileSystem: this.ports.fileSystem, bounds: this.ports.bounds, now: this.ports.now, sleep: this.ports.sleep, redactor };
            const window = openEvidenceWindow(ports);
            if (this.keys && this.requested && this.recorded) {
                const inspected = await (this.ports.inspect ?? inspectRecordingFile)(input.videoPath, input.orderlyClose)
                    .catch(() => ({ attempted: true, path: null, bytes: null, header: false, error: 'RECORDING_FAILED', orderlyClose: input.orderlyClose }));
                const observed = evidenceFor(inspected);
                if (observed.state === 'PENDING') {
                    const uploaded = await uploadRecording(ports, window, { videoKey: this.keys.videoKey, path: observed.path, state: 'PENDING', partial: observed.partial });
                    state = uploaded.state === 'STORED' ? 'STORED' : 'FAILED';
                    partial = state === 'STORED' && uploaded.partial;
                }
                // A recorder that produced no playable file is UNAVAILABLE on the guided wire (AR-1).
            }
            let timings = state === 'STORED' ? wireTimings(this.readings) : [];
            if (!timingScaleHolds(timings, this.maxSessionSeconds))
                timings = [];
            if (this.keys) {
                const manifest = buildGuidedRecordingManifest({ sessionId: input.identity.sessionId, recordingId: this.recordingId, workerId: input.identity.workerId, ownerFence: input.identity.ownerFence, evidenceState: state, evidencePartial: partial, videoKey: this.keys.videoKey, manifestKey: this.keys.manifestKey, timings });
                // A lost manifest is a diagnostic, never an evidence state (as for replay, §6.1).
                await writeResultManifest(ports, window, this.keys.manifestKey, serializeResultManifest(manifest, redactor), RESULT_MANIFEST_CONTENT_TYPE);
            }
            await this.deliver(input, { ...input.identity, recordingId: this.recordingId, state, partial, timings });
            return state;
        }
        finally {
            if (this.directory !== null)
                await (await this.scratch()).dispose(this.directory).catch(() => undefined);
        }
    }
    /** Byte-identical body under one key, at most {@link MAX_RECORDING_CALLBACK_ATTEMPTS} times. */
    async deliver(input, body) {
        const attempts = Math.min(MAX_RECORDING_CALLBACK_ATTEMPTS, Math.max(1, this.ports.callbackAttempts ?? MAX_RECORDING_CALLBACK_ATTEMPTS));
        const key = `rec-${this.recordingId}`;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                await input.callback('recording-evidence', body, key);
                return;
            }
            catch {
                if (attempt < attempts)
                    await this.ports.sleep((this.ports.callbackBackoffMs ?? 1000) * attempt);
            }
        }
    }
}
//# sourceMappingURL=evidence.js.map