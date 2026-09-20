/** AWS S3 writer. The exposed port remains put-only; IAM enforces the same boundary remotely. */
import { createReadStream } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ObjectStorePutError } from './objectStore.js';
import type { ObjectStoreClient } from './objectStore.js';

export interface S3ObjectStoreOptions {
  readonly bucket: string;
  readonly region: string;
  readonly requestTimeoutMs: number;
  readonly credentialsDirectory?: string;
}

export function createS3ObjectStore(options: S3ObjectStoreOptions): {
  readonly store: ObjectStoreClient;
  readonly close: () => void;
} {
  // SDK default credentials support environment credentials, shared AWS config and workload roles.
  // The evidence uploader owns retries; disable the SDK's additional retry layer.
  const client = new S3Client({
    region: options.region,
    ...(options.credentialsDirectory ? { credentials: async () => {
      const directory = options.credentialsDirectory ?? '';
      const accessKeyId = (await readFile(join(directory, 'accessKeyId'), 'utf8')).trim();
      const secretAccessKey = (await readFile(join(directory, 'secretAccessKey'), 'utf8')).trim();
      if (!accessKeyId || !secretAccessKey) throw new Error('S3 credentials are empty');
      let sessionToken: string | undefined;
      try {
        sessionToken = (await readFile(join(directory, 'sessionToken'), 'utf8')).trim();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      // Mark file-backed credentials refreshable; otherwise the SDK memoizes non-expiring
      // credentials indefinitely and Kubernetes Secret rotation would never reach the signer.
      return { accessKeyId, secretAccessKey, expiration: new Date(Date.now() + 60_000),
        ...(sessionToken ? { sessionToken } : {}) };
    } } : {}),
    maxAttempts: 1,
    requestHandler: { connectionTimeout: options.requestTimeoutMs, requestTimeout: options.requestTimeoutMs },
    requestChecksumCalculation: 'WHEN_REQUIRED',
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
        } catch {
          // Never propagate an SDK error containing deployment details into execution evidence.
          throw new ObjectStorePutError('The S3 object could not be written.');
        } finally {
          stream?.destroy();
        }
      },
    },
  };
}
