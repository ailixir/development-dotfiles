/**
 * The one object-store composition (STUDIO-OBS-013 AC-3, AR-1 R3 "R13").
 *
 * Extracted from `server/application.ts` so the replay runner and the guided worker build their
 * store from the same evidence settings (`loadEvidenceConfig` / `loadConfig` in
 * `server/config.ts`) and the same two clients (`objectStore.ts`, `s3ObjectStore.ts`). There is no
 * second store implementation and no second set of settings: a guided recording goes to the same
 * bucket (Sonic in deployed environments, GA plan ED-03) or the same local root as a replay
 * recording, with the same bounded attempts and window.
 */
import { readFile, stat } from 'node:fs/promises';

import type { EvidenceConfig } from '../server/config.js';
import type { EvidenceFileSystem, EvidenceUploadBounds } from './evidenceUpload.js';
import { createLocalObjectStore } from './objectStore.js';
import type { ObjectStoreClient } from './objectStore.js';
import { createS3ObjectStore } from './s3ObjectStore.js';

export type ObjectStoreSettings = Pick<
  EvidenceConfig,
  | 'objectStoreDir'
  | 'objectStoreProvider'
  | 'objectStoreEndpoint'
  | 'objectStoreRegion'
  | 'objectStoreBucket'
  | 'objectStoreForcePathStyle'
  | 'objectStoreCredentialsDirectory'
  | 'objectStoreAccessKeyIdFile'
  | 'objectStoreSecretAccessKeyFile'
  | 'objectStoreWindowMs'
>;

export interface ConfiguredObjectStore {
  readonly store: ObjectStoreClient;
  /** Releases the S3 client's sockets. A no-op for the filesystem store. */
  readonly close: () => void;
}

/** `s3` selects the S3-compatible client; `filesystem` (alias `local`) the local root. */
export function createConfiguredObjectStore(settings: ObjectStoreSettings): ConfiguredObjectStore {
  if (settings.objectStoreProvider === 's3') {
    return createS3ObjectStore({
      bucket: settings.objectStoreBucket,
      region: settings.objectStoreRegion,
      endpoint: settings.objectStoreEndpoint,
      forcePathStyle: settings.objectStoreForcePathStyle,
      credentialsDirectory: settings.objectStoreCredentialsDirectory,
      accessKeyIdFile: settings.objectStoreAccessKeyIdFile,
      secretAccessKeyFile: settings.objectStoreSecretAccessKeyFile,
      requestTimeoutMs: settings.objectStoreWindowMs,
    });
  }
  return { store: createLocalObjectStore({ root: settings.objectStoreDir }), close: () => undefined };
}

/** The bounded attempts/window/backoff the uploader obeys, from the same settings. */
export function evidenceBoundsFrom(
  settings: Pick<EvidenceConfig, 'objectStoreMaxAttempts' | 'objectStoreWindowMs' | 'objectStoreBackoffMs'>,
): EvidenceUploadBounds {
  return {
    maxAttempts: settings.objectStoreMaxAttempts,
    windowMs: settings.objectStoreWindowMs,
    backoffMs: settings.objectStoreBackoffMs,
  };
}

/**
 * The production filesystem port for the uploader.
 *
 * `readFile` is wired and never called — the uploader streams from a path and the store client
 * opens it. Declaring the capability is what makes "zero whole-file reads at any recording size" a
 * counted fact rather than a claim (story 10.14 AC-5).
 */
export const NODE_EVIDENCE_FILE_SYSTEM: EvidenceFileSystem = {
  stat: async (path: string): Promise<{ readonly size: number }> => ({
    size: (await stat(path)).size,
  }),
  readFile: (path: string): Promise<Uint8Array> => readFile(path),
};
