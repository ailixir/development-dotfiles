/**
 * The terminal evidence upload (story 10.14 AC-4, AC-5, AC-8, AC-9; architecture §5.3, §6.1, §6.2).
 *
 * ## Three rules, and each of them is a criterion
 *
 * 1. **`STORED` is earned.** The state moves to `STORED` only after the store has acknowledged the
 *    object write — never before, never optimistically, never because a file was playable (AC-8).
 * 2. **`partial` travels through unchanged.** The value the stop observation produced is carried
 *    onto the `FINAL` verbatim. Nothing here recomputes it, clears it on success, or derives it
 *    from the uploaded object's size or duration (AC-9, ADR-002 §17.7 item 4).
 * 3. **A storage failure never costs the result.** Nothing in this module throws out of the
 *    terminal path. Every failure becomes evidence `FAILED` with a redacted diagnostic and the
 *    result is delivered anyway (AC-4, §6.1 *"Upload failure never overwrites a known assertion
 *    outcome"*).
 *
 * ## The budget is the window the file exists in
 *
 * Story 10.13 moved `runScratch.clear()` **ahead** of the delivery window on purpose, and the
 * video lives in scratch. So the upload budget is not "the runner's total": it is the window
 * between `reporter.settled()` and `runScratch.clear()`, and both the video and the manifest are
 * bounded by one deadline taken once when that window opens. A slow bucket cannot push the run
 * past the API's recovery deadline because it cannot outlive this window.
 *
 * ## Nothing unbounded is retained between attempts
 *
 * The video is handed to the store as a **file reference** and streamed; a retry re-opens the file
 * and holds nothing across the gap. The manifest's bytes are serialized once by its producer and
 * the same array is handed to every attempt. {@link EvidenceFileSystem} declares a whole-file read
 * this module never performs, so "zero whole-file reads, at any recording size" is a number a test
 * can read rather than a property a reviewer has to take on trust.
 */
import type { Redactor } from '../executor/redaction.js';
import type { ObjectStoreClient } from './objectStore.js';
import { ObjectStoreUnavailableError } from './objectStore.js';
import type { RunnerEvidenceState } from './recording.js';
import type {VerifiedVideoFile} from './appVideoOwnership.js';

/**
 * The filesystem capabilities this module is given.
 *
 * `readFile` is declared **and never called**. That is deliberate: AC-5's original clause — *"peak
 * retained bytes do not scale with the recording's size"* — named no mechanism and so could not
 * fail. Declaring the capability the uploader must not use turns it into a counted fact: a test
 * hands in a counting implementation and asserts zero, at the baseline fixture size and at ten
 * times it. An implementation that buffers the recording increments it.
 */
export interface EvidenceFileSystem {
  stat(path: string): Promise<{ readonly size: number }>;
  readFile(path: string): Promise<Uint8Array>;
}

export interface EvidenceUploadBounds {
  /** Attempts per object, the first included. Never unbounded. */
  readonly maxAttempts: number;
  /** Wall-clock window for the whole evidence phase — video and manifest together. */
  readonly windowMs: number;
  /** Base backoff between attempts; linear, because the window is the real bound. */
  readonly backoffMs: number;
}

export interface EvidenceUploadPorts {
  readonly store: ObjectStoreClient;
  readonly fileSystem: EvidenceFileSystem;
  readonly bounds: EvidenceUploadBounds;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly redactor: Redactor;
}

/** The window both objects share. Taken once, when `reporter.settled()` has returned. */
export interface EvidenceWindow {
  readonly deadlineAtMs: number;
}

export function openEvidenceWindow(ports: EvidenceUploadPorts): EvidenceWindow {
  return { deadlineAtMs: ports.now() + ports.bounds.windowMs };
}

export interface VideoUploadRequest {
  readonly verifiedFile?:VerifiedVideoFile;
  /** The key the **job** supplied. This module never derives, defaults or normalizes one. */
  readonly videoKey: string;
  /** The scratch path of the recording, or `null` when none was produced. */
  readonly path: string | null;
  /** What the recorder observed. `PENDING` is the only state an upload is attempted from. */
  readonly state: RunnerEvidenceState;
  /** The stop observation's verdict. Carried, never recomputed. */
  readonly partial: boolean;
}

export interface EvidenceUploadOutcome {
  readonly state: RunnerEvidenceState;
  readonly partial: boolean;
  /** Redacted diagnostic, or `null`. Never an outcome and never an error code. */
  readonly error: string | null;
  /** Bytes the store acknowledged, or `null`. Reported, never used to derive `partial`. */
  readonly bytes: number | null;
  /** Attempts actually made. `0` when no upload was attempted at all. */
  readonly attempts: number;
}

/**
 * Uploads the recording, or honestly declines to.
 *
 * A run whose recording was never playable is never uploaded at all — `UNAVAILABLE` stays
 * `UNAVAILABLE` and the store is not called once. A recorder that failed stays `FAILED` for the
 * same reason: there is nothing to store.
 */
export async function uploadRecording(
  ports: EvidenceUploadPorts,
  window: EvidenceWindow,
  request: VideoUploadRequest,
): Promise<EvidenceUploadOutcome> {
  const carried = request.partial;
  if (request.state !== 'PENDING' || request.path === null) {
    return { state: request.state, partial: carried, error: null, bytes: null, attempts: 0 };
  }

  let bytes: number | null = null;
  try {
    bytes = request.verifiedFile?.bytes??(await ports.fileSystem.stat(request.path)).size;
  } catch (error) {
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
    body: { kind: 'file', path: request.path,...(request.verifiedFile?{verifiedFile:request.verifiedFile}:{}) },
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

export interface ManifestWriteResult {
  readonly ok: boolean;
  /** Redacted diagnostic, or `null`. The loss of a manifest is a diagnostic, not an outcome. */
  readonly error: string | null;
  readonly attempts: number;
}

/**
 * Writes the terminal manifest at the job's key.
 *
 * The bytes are produced once by `serializeResultManifest` and the same array is handed to every
 * attempt, so a retry writes the **same key with the same bytes** and never a second object or a
 * suffixed one.
 */
export async function writeResultManifest(
  ports: EvidenceUploadPorts,
  window: EvidenceWindow,
  manifestKey: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<ManifestWriteResult> {
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

interface PutAttempt {
  readonly ok: boolean;
  readonly attempts: number;
  readonly error: unknown;
}

/**
 * Bounded on both axes, and idempotent.
 *
 * The attempt count bounds a store that fails fast; the window bounds a store that hangs. Neither
 * alone is enough: five instant failures and one attempt that never returns are different hazards.
 */
async function putWithBoundedRetry(
  ports: EvidenceUploadPorts,
  window: EvidenceWindow,
  request: Parameters<ObjectStoreClient['put']>[0],
): Promise<PutAttempt> {
  let attempts = 0;
  let lastError: unknown = null;
  while (attempts < ports.bounds.maxAttempts) {
    if (ports.now() >= window.deadlineAtMs) {
      return {
        ok: false,
        attempts,
        error:
          lastError ??
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
    } catch (error) {
      lastError = error;
      if (attempts >= ports.bounds.maxAttempts) break;
      const backoff = ports.bounds.backoffMs * attempts;
      const remaining = window.deadlineAtMs - ports.now();
      if (remaining <= 0) break;
      await ports.sleep(Math.min(backoff, remaining));
    }
  }
  return { ok: false, attempts, error: lastError };
}

/** A redacted, bounded diagnostic. It never becomes an outcome and never an error code (§6.1). */
function diagnostic(redactor: Redactor, prefix: string, error: unknown): string {
  const cause =
    error instanceof ObjectStoreUnavailableError
      ? 'the object store was unreachable'
      : error instanceof Error
        ? `${error.name}: ${error.message}`
        : 'unknown';
  const text = redactor.redact(`${prefix}: ${cause}`).replace(/\s+/gu, ' ').trim();
  return text.length <= 400 ? text : `${text.slice(0, 399)}…`;
}
