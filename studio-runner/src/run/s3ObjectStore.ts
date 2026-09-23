/**
 * S3 writer for AWS S3 and S3-compatible stores such as Sonic. The exposed port remains put-only;
 * IAM (or the store's bucket policy) enforces the same boundary remotely.
 *
 * Retries are owned by the evidence uploader's bounded window, so the SDK's own retry layer is
 * disabled. Errors never carry SDK detail (endpoint, credential or request material) into
 * execution evidence: a store that could not be reached is an {@link ObjectStoreUnavailableError},
 * anything else an {@link ObjectStorePutError}, and both use fixed messages.
 */
import { createReadStream } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ObjectStorePutError, ObjectStoreUnavailableError } from './objectStore.js';
import type { ObjectStoreClient } from './objectStore.js';

export interface S3ObjectStoreOptions {
  readonly bucket: string;
  readonly region: string;
  readonly requestTimeoutMs: number;
  /**
   * Endpoint of an S3-compatible store (Sonic). Omitted or empty selects the SDK's default AWS
   * endpoint resolution.
   */
  readonly endpoint?: string;
  /** Path-style addressing, which S3-compatible stores commonly require. SDK default when omitted. */
  readonly forcePathStyle?: boolean;
  /**
   * Mounted credential directory holding `accessKeyId`, `secretAccessKey` and optionally
   * `sessionToken`. Mutually exclusive with the two explicit file paths below.
   */
  readonly credentialsDirectory?: string;
  readonly accessKeyIdFile?: string;
  readonly secretAccessKeyFile?: string;
}

/** Fixed messages: no SDK, endpoint or credential detail may reach execution evidence. */
const WRITE_FAILED = 'The S3 object could not be written.';
const UNREACHABLE = `${WRITE_FAILED} The object store is unreachable.`;

/** Error names and codes that mean the store was never reached, as opposed to refusing a write. */
const UNREACHABLE_MARKERS = new Set([
  'AbortError',
  'TimeoutError',
  'CredentialsProviderError',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
]);

interface CredentialFiles {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

function credentialFiles(options: S3ObjectStoreOptions): CredentialFiles | undefined {
  if (options.credentialsDirectory) {
    const directory = options.credentialsDirectory;
    return {
      accessKeyId: join(directory, 'accessKeyId'),
      secretAccessKey: join(directory, 'secretAccessKey'),
      sessionToken: join(directory, 'sessionToken'),
    };
  }
  if (options.accessKeyIdFile && options.secretAccessKeyFile) {
    return { accessKeyId: options.accessKeyIdFile, secretAccessKey: options.secretAccessKeyFile };
  }
  return undefined;
}

export function createS3ObjectStore(options: S3ObjectStoreOptions): {
  readonly store: ObjectStoreClient;
  readonly close: () => void;
} {
  const files = credentialFiles(options);
  // Without mounted files the SDK default chain applies (environment credentials, shared AWS
  // config, workload roles).
  const client = new S3Client({
    region: options.region,
    ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    ...(options.forcePathStyle === undefined ? {} : { forcePathStyle: options.forcePathStyle }),
    ...(files ? { credentials: () => readMountedCredentials(files) } : {}),
    maxAttempts: 1,
    requestHandler: { connectionTimeout: options.requestTimeoutMs, requestTimeout: options.requestTimeoutMs },
    // S3-compatible stores do not universally implement AWS's optional aws-chunked trailer
    // checksums. Sign the request normally, but send the actual file bytes unless required.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return {
    close: () => { client.destroy(); },
    store: {
      async put(request): Promise<void> {
        let stream: ReadStream | undefined;
        try {
          const length = request.body.kind === 'file'
            ? (await stat(request.body.path)).size : request.body.data.byteLength;
          const body = request.body.kind === 'file'
            ? (stream = createReadStream(request.body.path)) : request.body.data;
          await client.send(new PutObjectCommand({
            Bucket: options.bucket,
            Key: request.key,
            Body: body,
            ContentLength: length,
            ContentType: request.contentType,
          }), { abortSignal: request.signal ?? AbortSignal.timeout(options.requestTimeoutMs) });
        } catch (error) {
          // Never propagate an SDK error containing deployment details into execution evidence.
          if (isUnreachable(error)) throw new ObjectStoreUnavailableError(UNREACHABLE);
          throw new ObjectStorePutError(WRITE_FAILED);
        } finally {
          stream?.destroy();
        }
      },
    },
  };
}

/** Re-read on every SDK refresh so a rotated Secret reaches the signer without a restart. */
async function readMountedCredentials(files: CredentialFiles): Promise<{
  accessKeyId: string; secretAccessKey: string; sessionToken?: string; expiration: Date;
}> {
  try {
    const accessKeyId = (await readFile(files.accessKeyId, 'utf8')).trim();
    const secretAccessKey = (await readFile(files.secretAccessKey, 'utf8')).trim();
    if (!accessKeyId || !secretAccessKey) throw new Error('S3 credentials are empty');
    let sessionToken: string | undefined;
    if (files.sessionToken !== undefined) {
      try {
        sessionToken = (await readFile(files.sessionToken, 'utf8')).trim();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    // Mark file-backed credentials refreshable; otherwise the SDK memoizes non-expiring
    // credentials indefinitely and Kubernetes Secret rotation would never reach the signer.
    return { accessKeyId, secretAccessKey, expiration: new Date(Date.now() + 60_000),
      ...(sessionToken ? { sessionToken } : {}) };
  } catch {
    // Unreadable mounted credentials mean the store cannot be reached, not that it refused.
    const unavailable = new Error('The mounted object-store credentials are unavailable.');
    unavailable.name = 'CredentialsProviderError';
    throw unavailable;
  }
}

function isUnreachable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined && current !== null; depth += 1) {
    if (typeof current !== 'object') return false;
    const shaped = current as { readonly name?: unknown; readonly code?: unknown; readonly cause?: unknown };
    if (
      (typeof shaped.name === 'string' && UNREACHABLE_MARKERS.has(shaped.name)) ||
      (typeof shaped.code === 'string' && UNREACHABLE_MARKERS.has(shaped.code))
    ) {
      return true;
    }
    current = shaped.cause;
  }
  return false;
}
