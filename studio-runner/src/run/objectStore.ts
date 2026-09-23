/**
 * The runner's object store client — **write-only by construction** (story 10.14 AC-2, AC-5,
 * AC-18a; architecture §6.2, §9.2).
 *
 * ## One operation, and the type is the guarantee
 *
 * §6.2: *"Runner writes only this prefix; API/recovery read only. Runner has no Get/List
 * permissions."* That is a deployment fact about credentials (`ED-03`, story 10.18) and it is not
 * the only place it should be true. {@link ObjectStoreClient} exposes exactly one operation —
 * {@link ObjectStoreClient.put} — and no `get`, no `list`, no `head` and no `delete`. A caller
 * cannot read an object through this type, so a credential scope regression cannot be *used* by
 * this process even if it happens.
 *
 * This mirrors {@code ResultManifestStore}'s deliberate three-things-it-cannot-do on the API side,
 * and for the same reason: the narrow surface is the design, not a convention a reviewer enforces.
 *
 * ## The body is a file reference or bytes, never a whole-file buffer
 *
 * A recording is the largest thing this runner ever handles and the terminal path is the moment
 * with the least headroom. {@link ObjectBody} therefore has two shapes, and the video always takes
 * the first:
 *
 * - `{ kind: 'file', path }` — the client streams from the scratch file. Nothing reads it whole.
 * - `{ kind: 'bytes', data }` — for a body that is already a bounded in-memory value, which is the
 *   manifest and nothing else. Its bytes are serialized **once**, the same discipline
 *   `reportClient.deliverTerminal` applies to the `FINAL` body, for the same reason.
 *
 * A retry re-opens the file; it never holds a buffer between attempts (AC-5).
 *
 * ## Unreachable is not "the put failed"
 *
 * {@link ObjectStoreUnavailableError} exists for the same reason `ResultManifestStore.isAvailable`
 * does on the API side: an unreachable store must not be mistaken for a store that answered. Both
 * end the run with evidence `FAILED` and a delivered result (AC-4), but they are different facts
 * and the diagnostic says which one happened.
 */
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** What the caller hands the client. Never a `Buffer` of a recording (AC-5). */
export type ObjectBody =
  | {
      readonly kind: 'file';
      /** Absolute path inside the per-run scratch directory. Streamed, never read whole. */
      readonly path: string;
    }
  | {
      readonly kind: 'bytes';
      /** A bounded value serialized once by its producer. */
      readonly data: Uint8Array;
    };

export interface PutObjectRequest {
  /**
   * The key the **job** supplied, echoed.
   *
   * The runner never derives, computes, normalizes or defaults a key (§6.2, AC-1). This type
   * cannot be called with a key the job did not supply because no code path here builds one.
   */
  readonly key: string;
  readonly body: ObjectBody;
  readonly contentType: string;
}

/**
 * The whole surface. There is no read here and there is no way to add one without changing this
 * declaration, which is the point.
 */
export interface ObjectStoreClient {
  put(request: PutObjectRequest): Promise<void>;
}

/** Every operation this client is permitted to expose. Asserted at runtime by AC-2's test. */
export const PERMITTED_OBJECT_STORE_OPERATIONS = ['put'] as const;

/**
 * The store could not be reached at all — as distinct from a store that answered and refused.
 *
 * Story 10.14 AC-21 asserts the distinction through the real write path and test-only controlled
 * failure stores.
 */
export class ObjectStoreUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ObjectStoreUnavailableError';
  }
}

/** The store answered and refused the write. */
export class ObjectStorePutError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ObjectStorePutError';
  }
}

export interface LocalObjectStoreOptions {
  /**
   * Filesystem root the local compatible store writes under.
   *
   * `ED-03` (Sonic) is open: the real endpoint, its credentials and its lifecycle rules are story
   * 10.18's and 10.19's. Until then this is the compatible store the epic's `ED-03` fallback
   * names, and it is a real implementation rather than a stub — it streams, it is idempotent on
   * the same key and it fails the way a bucket fails.
   */
  readonly root: string;
}

/**
 * A local, filesystem-backed, S3-shaped compatible store (`ED-03` fallback).
 *
 * Idempotent by construction: a put writes to a temporary name in the destination directory and
 * renames over the key, so a retry of the same key with the same bytes leaves exactly **one**
 * object and never a suffixed second one (AC-5).
 */
export function createLocalObjectStore(options: LocalObjectStoreOptions): ObjectStoreClient {
  const root = resolve(options.root);

  return {
    async put(request: PutObjectRequest): Promise<void> {
      const target = resolveKey(root, request.key);
      try {
        await mkdir(dirname(target), { recursive: true });
      } catch (error) {
        throw new ObjectStoreUnavailableError(
          'The object store root could not be opened for writing.',
          { cause: error },
        );
      }
      // One fixed temporary name per key, not a random one: a retry reuses it and cannot leave a
      // second object behind if the process dies between the write and the rename.
      const staging = `${target}.partial`;
      try {
        if (request.body.kind === 'bytes') {
          await writeFile(staging, request.body.data);
        } else {
          await pipeline(createReadStream(request.body.path), createWriteStream(staging));
        }
        await rename(staging, target);
      } catch (error) {
        throw new ObjectStorePutError(`The object at key ${request.key} was not written.`, {
          cause: error,
        });
      }
    },
  };
}

export interface S3ObjectStoreOptions {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly forcePathStyle: boolean;
  readonly accessKeyIdFile: string;
  readonly secretAccessKeyFile: string;
  readonly requestTimeoutMs: number;
}

/**
 * Sonic/S3 writer. Its public surface remains the one-operation {@link ObjectStoreClient}; SDK
 * retries are disabled because the evidence uploader already owns the bounded retry window.
 * Credentials are re-read from mounted files for every SDK refresh, allowing rotation without
 * placing secret material in the process environment or configuration object.
 */
export function createS3ObjectStore(options: S3ObjectStoreOptions): ObjectStoreClient {
  const client = new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    forcePathStyle: options.forcePathStyle,
    maxAttempts: 1,
    // S3-compatible stores do not universally implement AWS's optional aws-chunked trailer
    // checksums. Sign the request normally, but send the actual file bytes unless required.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: async () => ({
      accessKeyId: await readCredential(options.accessKeyIdFile, 'access key id'),
      secretAccessKey: await readCredential(options.secretAccessKeyFile, 'secret access key'),
    }),
  });

  return {
    async put(request: PutObjectRequest): Promise<void> {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, options.requestTimeoutMs);
      try {
        const contentLength =
          request.body.kind === 'file' ? (await stat(request.body.path)).size : request.body.data.length;
        await client.send(
          new PutObjectCommand({
            Bucket: options.bucket,
            Key: request.key,
            Body:
              request.body.kind === 'file'
                ? createReadStream(request.body.path)
                : request.body.data,
            ContentLength: contentLength,
            ContentType: request.contentType,
          }),
          { abortSignal: controller.signal },
        );
      } catch (error) {
        if (isUnreachable(error)) {
          throw new ObjectStoreUnavailableError('The object store is unreachable.', {
            cause: error,
          });
        }
        throw new ObjectStorePutError(`The object at key ${request.key} was not written.`, {
          cause: error,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

async function readCredential(path: string, label: string): Promise<string> {
  try {
    const value = (await readFile(path, 'utf8')).trim();
    if (value === '') throw new Error('empty credential file');
    return value;
  } catch (error) {
    throw new ObjectStoreUnavailableError(`The mounted object-store ${label} is unavailable.`, {
      cause: error,
    });
  }
}

function isUnreachable(error: unknown): boolean {
  const unavailable = new Set([
    'AbortError',
    'TimeoutError',
    'CredentialsProviderError',
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EAI_AGAIN',
  ]);
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined && current !== null; depth += 1) {
    if (current instanceof ObjectStoreUnavailableError) return true;
    if (typeof current !== 'object') return false;
    const shaped = current as { readonly name?: unknown; readonly code?: unknown; readonly cause?: unknown };
    if (
      (typeof shaped.name === 'string' && unavailable.has(shaped.name)) ||
      (typeof shaped.code === 'string' && unavailable.has(shaped.code))
    ) {
      return true;
    }
    current = shaped.cause;
  }
  return false;
}

/** Resolves a key under the root and refuses one that would escape it. */
function resolveKey(root: string, key: string): string {
  const target = resolve(join(root, key));
  if (target !== root && !target.startsWith(root + sep)) {
    throw new ObjectStorePutError('The object key resolves outside the store root.');
  }
  return target;
}
