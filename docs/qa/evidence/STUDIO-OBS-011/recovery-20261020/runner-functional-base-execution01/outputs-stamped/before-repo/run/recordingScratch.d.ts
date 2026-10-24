export declare const RECORDING_SCRATCH_LIMITS: Readonly<{
    candidates: 128;
    metadataBytes: number;
    entries: 512;
    depth: 4;
    deadlineMs: 5000;
    reclaimed: 16;
}>;
export interface RecordingScratch {
    allocate(): Promise<string>;
    close(): Promise<void>;
    dispose(directory: string): Promise<void>;
    readonly report: Readonly<{
        inspected: number;
        reclaimed: number;
        skipped: number;
        bounded: boolean;
    }>;
}
interface Options {
    workerId: string;
    journalDirectory: string;
    evidenceRoot?: string;
    /** Trusted test seams; neither is sourced from a request or mounted application policy. */
    limits?: Partial<Record<keyof typeof RECORDING_SCRATCH_LIMITS, number>>;
    probe?: (pid: number) => 'dead' | 'live' | 'unknown';
    now?: () => number;
    afterQuarantine?: () => Promise<void>;
    removeFile?: (path: string) => Promise<void>;
}
export declare function prepareRecordingScratch(options: Options): Promise<RecordingScratch>;
export {};
