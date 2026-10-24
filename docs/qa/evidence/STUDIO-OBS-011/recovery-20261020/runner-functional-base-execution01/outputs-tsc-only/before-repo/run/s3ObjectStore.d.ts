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
export declare function createS3ObjectStore(options: S3ObjectStoreOptions): {
    readonly store: ObjectStoreClient;
    readonly close: () => void;
};
