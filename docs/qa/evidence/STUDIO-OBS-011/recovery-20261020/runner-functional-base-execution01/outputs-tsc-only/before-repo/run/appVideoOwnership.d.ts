import type { ReadStream } from 'node:fs';
import type { Launch3 } from '../executor/observedOperations.js';
import type { SessionRecording } from '../server/adapters.js';
export interface AppVideoOwner {
    readonly schemaVersion: 1;
    readonly kind: 'observed-app-video';
    readonly runId: string;
    readonly attemptId: string;
    readonly admissionId: string;
    readonly runnerInstanceId: string;
    readonly parentPid: number;
    readonly childPid: number;
    readonly scratchDev: string;
    readonly scratchIno: string;
    readonly videoBasename: string;
}
interface DirectoryPin {
    readonly path: string;
    readonly dev: bigint;
    readonly ino: bigint;
    readonly uid: bigint;
    readonly mode: bigint;
}
export interface AppVideoRegistry {
    readonly scratch: DirectoryPin;
    readonly private: DirectoryPin;
    readonly video: DirectoryPin;
}
export interface VerifiedVideoFile {
    readonly open: () => ReadStream;
    readonly bytes: number;
}
interface ReceiptPin {
    readonly dev: bigint;
    readonly ino: bigint;
    readonly uid: bigint;
    readonly content: string;
}
export type AppVideoSnapshot = {
    readonly kind: 'absent';
} | {
    readonly kind: 'invalid';
} | {
    readonly kind: 'owned';
    readonly owner: AppVideoOwner;
    readonly receipt: ReceiptPin;
    readonly registry: AppVideoRegistry;
    readonly path: string;
};
/** Parent-only, before spawn: exclusive registry freshness, no reusable stale receipt. */
export declare function createAppVideoRegistry(scratchPath: string): AppVideoRegistry;
export declare function validateAppVideoPath(scratchPath: string, path: string): string;
/** Child-only synchronous bounded publication: no timed-out async writer can recreate scratch. */
export declare function publishAppVideoOwner(launch: Launch3, path: string, live: () => void, pids?: {
    pid: number;
    ppid: number;
}): void;
/** One immutable cut before stop/kill. Absence at that cut cannot be repaired by late writes. */
export declare function sealAppVideoOwner(registry: AppVideoRegistry, launch: Launch3, childPid: number | null, parentPid?: number): AppVideoSnapshot;
/** Four-byte inspection only, after the parent has proved writer/process-tree quiescence. */
export declare function observeOwnedAppRecording(snapshot: AppVideoSnapshot, reportedPath: string | null | undefined, orderlyClose: boolean, quiescent: boolean): SessionRecording;
export {};
