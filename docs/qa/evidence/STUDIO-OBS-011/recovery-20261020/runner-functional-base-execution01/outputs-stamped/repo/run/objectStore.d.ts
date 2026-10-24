import type { VerifiedVideoFile } from './appVideoOwnership.js';
/** What the caller hands the client. Never a `Buffer` of a recording (AC-5). */
export type ObjectBody = {
    readonly kind: 'file';
    /** Absolute path inside the per-run scratch directory. Streamed, never read whole. */
    readonly path: string;
    /** Trusted observed exact-file opener; no public request/job property. */
    readonly verifiedFile?: VerifiedVideoFile;
} | {
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
    /** Deadline shared by video and manifest upload. */
    readonly signal?: AbortSignal;
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
export declare const PERMITTED_OBJECT_STORE_OPERATIONS: readonly ["put"];
/**
 * The store could not be reached at all — as distinct from a store that answered and refused.
 *
 * Story 10.14 AC-21 asserts the distinction through the real write path and test-only controlled
 * failure stores.
 */
export declare class ObjectStoreUnavailableError extends Error {
    constructor(message: string, options?: {
        cause?: unknown;
    });
}
/** The store answered and refused the write. */
export declare class ObjectStorePutError extends Error {
    constructor(message: string, options?: {
        cause?: unknown;
    });
}
export interface LocalObjectStoreOptions {
    /**
     * Filesystem root the local compatible store writes under.
     *
     * Local development shares this directory with the API and worker. Remote deployments use
     * the AWS S3 adapter instead. Keep this directory outside disposable runner scratch.
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
export declare function createLocalObjectStore(options: LocalObjectStoreOptions): ObjectStoreClient;
