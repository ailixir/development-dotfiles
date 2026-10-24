import { ObjectStoreUnavailableError } from './objectStore.js';
export function openEvidenceWindow(ports) {
    return { deadlineAtMs: ports.now() + ports.bounds.windowMs };
}
/**
 * Uploads the recording, or honestly declines to.
 *
 * A run whose recording was never playable is never uploaded at all — `UNAVAILABLE` stays
 * `UNAVAILABLE` and the store is not called once. A recorder that failed stays `FAILED` for the
 * same reason: there is nothing to store.
 */
export async function uploadRecording(ports, window, request) {
    const carried = request.partial;
    if (request.state !== 'PENDING' || request.path === null) {
        return { state: request.state, partial: carried, error: null, bytes: null, attempts: 0 };
    }
    let bytes = null;
    try {
        bytes = request.verifiedFile?.bytes ?? (await ports.fileSystem.stat(request.path)).size;
    }
    catch (error) {
        return {
            state: 'FAILED',
            partial: carried,
            error: diagnostic(ports.redactor, 'The recording could not be opened for upload', error),
            bytes: null,
            attempts: 0,
        };
    }
    const attempt = await putWithBoundedRetry(ports, window, {
        key: request.videoKey,
        // A file reference, never a buffer: the client streams it and a retry re-opens it (AC-5).
        body: { kind: 'file', path: request.path, ...(request.verifiedFile ? { verifiedFile: request.verifiedFile } : {}) },
        contentType: 'video/webm',
    });
    if (!attempt.ok) {
        return {
            state: 'FAILED',
            partial: carried,
            error: diagnostic(ports.redactor, 'The recording was not stored', attempt.error),
            bytes,
            attempts: attempt.attempts,
        };
    }
    // `STORED` only here, and `partial` is the value that came in. There is deliberately no
    // expression below in which `bytes`, `attempt` or `outcome` influences `partial` (AC-9).
    return { state: 'STORED', partial: carried, error: null, bytes, attempts: attempt.attempts };
}
/**
 * Writes the terminal manifest at the job's key.
 *
 * The bytes are produced once by `serializeResultManifest` and the same array is handed to every
 * attempt, so a retry writes the **same key with the same bytes** and never a second object or a
 * suffixed one.
 */
export async function writeResultManifest(ports, window, manifestKey, bytes, contentType) {
    const attempt = await putWithBoundedRetry(ports, window, {
        key: manifestKey,
        body: { kind: 'bytes', data: bytes },
        contentType,
    });
    return {
        ok: attempt.ok,
        error: attempt.ok
            ? null
            : diagnostic(ports.redactor, 'The terminal result manifest was not stored', attempt.error),
        attempts: attempt.attempts,
    };
}
/**
 * Bounded on both axes, and idempotent.
 *
 * The attempt count bounds a store that fails fast; the window bounds a store that hangs. Neither
 * alone is enough: five instant failures and one attempt that never returns are different hazards.
 */
async function putWithBoundedRetry(ports, window, request) {
    let attempts = 0;
    let lastError = null;
    while (attempts < ports.bounds.maxAttempts) {
        if (ports.now() >= window.deadlineAtMs) {
            return {
                ok: false,
                attempts,
                error: lastError ??
                    new Error('The evidence window closed before the object could be written.'),
            };
        }
        attempts += 1;
        try {
            await ports.store.put({
                ...request,
                signal: AbortSignal.timeout(Math.max(1, Math.ceil(window.deadlineAtMs - ports.now()))),
            });
            return { ok: true, attempts, error: null };
        }
        catch (error) {
            lastError = error;
            if (attempts >= ports.bounds.maxAttempts)
                break;
            const backoff = ports.bounds.backoffMs * attempts;
            const remaining = window.deadlineAtMs - ports.now();
            if (remaining <= 0)
                break;
            await ports.sleep(Math.min(backoff, remaining));
        }
    }
    return { ok: false, attempts, error: lastError };
}
/** A redacted, bounded diagnostic. It never becomes an outcome and never an error code (§6.1). */
function diagnostic(redactor, prefix, error) {
    const cause = error instanceof ObjectStoreUnavailableError
        ? 'the object store was unreachable'
        : error instanceof Error
            ? `${error.name}: ${error.message}`
            : 'unknown';
    const text = redactor.redact(`${prefix}: ${cause}`).replace(/\s+/gu, ' ').trim();
    return text.length <= 400 ? text : `${text.slice(0, 399)}…`;
}
//# sourceMappingURL=evidenceUpload.js.map