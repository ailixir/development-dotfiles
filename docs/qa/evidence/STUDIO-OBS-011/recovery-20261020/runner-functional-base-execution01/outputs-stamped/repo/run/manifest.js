/** The schema version these bytes are written under. Read by the API before anything else. */
export const RESULT_MANIFEST_SCHEMA_VERSION = 1;
/** `application/json`, stated once so the store call and the fixture cannot disagree. */
export const RESULT_MANIFEST_CONTENT_TYPE = 'application/json';
/**
 * The guided-recording disclosure (STUDIO-OBS-013 AC-5, design R3 §4 "Video" residual).
 *
 * A constant: the manifest states the password-only masking rule and its one residual, and no
 * page, session or model text ever reaches it.
 */
export const GUIDED_RECORDING_DISCLOSURE = 'Password fills are rendered as masked dots (password-only rule). A page that later displays a secret in plain text is not protected by this recording.';
/** Property order is wire order, as for {@link buildResultManifest}. `evidencePartial` is carried. */
export function buildGuidedRecordingManifest(input) {
    return {
        schemaVersion: RESULT_MANIFEST_SCHEMA_VERSION,
        kind: 'guidedRecording',
        sessionId: input.sessionId,
        recordingId: input.recordingId,
        workerId: input.workerId,
        ownerFence: input.ownerFence,
        evidenceState: input.evidenceState,
        evidencePartial: input.evidencePartial,
        videoKey: input.videoKey,
        manifestKey: input.manifestKey,
        timings: input.timings.map((timing) => ({ ...timing })),
        disclosure: GUIDED_RECORDING_DISCLOSURE,
    };
}
/**
 * Builds the manifest body.
 *
 * `durationMs` is browser execution time and is derived from the two instants this runner already
 * holds — never from a third clock reading taken here, which would be the second origin §11.5
 * forbids. It is `null` until the browser actually started, because there is nothing to measure
 * from.
 *
 * Nothing in this function reads `outcome` to decide an evidence field, or an evidence field to
 * decide an outcome (§6.1, ADR-002 §17.4). `evidencePartial` is carried in verbatim.
 */
export function buildResultManifest(input) {
    return {
        schemaVersion: RESULT_MANIFEST_SCHEMA_VERSION,
        executionId: input.executionId,
        attemptId: input.attemptId,
        revisionId: input.revisionId,
        artifactHash: input.artifactHash,
        runnerInstanceId: input.runnerInstanceId,
        outcome: input.outcome.result,
        errorCode: input.outcome.errorCode,
        errorMessage: input.outcome.errorMessage,
        browserStartedAt: input.browserStartedAt,
        endedAt: input.endedAt,
        durationMs: durationMs(input.browserStartedAt, input.endedAt),
        runtimeVersions: stringValues(input.runtimeVersions),
        videoKey: input.videoKey,
        manifestKey: input.manifestKey,
        evidenceState: input.evidenceState,
        evidencePartial: input.evidencePartial,
    };
}
/**
 * Serializes the manifest once, redacted, as UTF-8 bytes.
 *
 * Two passes, in this order:
 *
 * 1. every string leaf, so a value containing a quote or a backslash is scrubbed **before** JSON
 *    escaping can hide it from a text search;
 * 2. the finished document, so a value that reached it through a key, a concatenation or a
 *    non-string leaf is still caught.
 *
 * The second pass alone would miss (1); the first alone would miss (2). Both are cheap.
 */
export function serializeResultManifest(manifest, redactor) {
    const scrubbed = redactStrings(manifest, redactor);
    const text = redactor.redact(JSON.stringify(scrubbed));
    return new TextEncoder().encode(text);
}
/** Walks the document and redacts every string leaf and every key. */
function redactStrings(value, redactor) {
    if (typeof value === 'string')
        return redactor.redact(value);
    if (Array.isArray(value))
        return value.map((entry) => redactStrings(entry, redactor));
    if (value !== null && typeof value === 'object') {
        const result = {};
        for (const [key, entry] of Object.entries(value)) {
            result[redactor.redact(key)] = redactStrings(entry, redactor);
        }
        return result;
    }
    return value;
}
/**
 * Runtime versions as strings.
 *
 * The record is open on the wire (§4.6) and a non-string value would make the committed fixture
 * ambiguous, so every entry is rendered here and the rendering is the one the API reads.
 */
function stringValues(source) {
    const result = {};
    for (const key of Object.keys(source).sort()) {
        const value = source[key];
        if (value === undefined || value === null)
            continue;
        // `runtimeVersions` is an open record on the wire (§4.6). A non-string entry is rendered
        // through JSON rather than through `String`, so an object never becomes "[object Object]" and
        // the committed fixture stays unambiguous.
        result[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return result;
}
function durationMs(browserStartedAt, endedAt) {
    if (browserStartedAt === null)
        return null;
    const started = Date.parse(browserStartedAt);
    const ended = Date.parse(endedAt);
    if (Number.isNaN(started) || Number.isNaN(ended))
        return null;
    const elapsed = ended - started;
    return elapsed < 0 ? null : elapsed;
}
//# sourceMappingURL=manifest.js.map