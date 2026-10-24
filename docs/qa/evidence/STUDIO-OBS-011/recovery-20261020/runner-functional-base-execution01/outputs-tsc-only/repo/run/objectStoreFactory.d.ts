import type { EvidenceConfig } from '../server/config.js';
import type { EvidenceFileSystem, EvidenceUploadBounds } from './evidenceUpload.js';
import type { ObjectStoreClient } from './objectStore.js';
export type ObjectStoreSettings = Pick<EvidenceConfig, 'objectStoreDir' | 'objectStoreProvider' | 'objectStoreEndpoint' | 'objectStoreRegion' | 'objectStoreBucket' | 'objectStoreForcePathStyle' | 'objectStoreCredentialsDirectory' | 'objectStoreAccessKeyIdFile' | 'objectStoreSecretAccessKeyFile' | 'objectStoreWindowMs'>;
export interface ConfiguredObjectStore {
    readonly store: ObjectStoreClient;
    /** Releases the S3 client's sockets. A no-op for the filesystem store. */
    readonly close: () => void;
}
/** `s3` selects the S3-compatible client; `filesystem` (alias `local`) the local root. */
export declare function createConfiguredObjectStore(settings: ObjectStoreSettings): ConfiguredObjectStore;
/** The bounded attempts/window/backoff the uploader obeys, from the same settings. */
export declare function evidenceBoundsFrom(settings: Pick<EvidenceConfig, 'objectStoreMaxAttempts' | 'objectStoreWindowMs' | 'objectStoreBackoffMs'>): EvidenceUploadBounds;
/**
 * The production filesystem port for the uploader.
 *
 * `readFile` is wired and never called — the uploader streams from a path and the store client
 * opens it. Declaring the capability is what makes "zero whole-file reads at any recording size" a
 * counted fact rather than a claim (story 10.14 AC-5).
 */
export declare const NODE_EVIDENCE_FILE_SYSTEM: EvidenceFileSystem;
