import type { BridgeNativeFenceEvent } from './types.js';
/** Append-only, data-free consumption records. Directory and record are fsynced before effects.
 * A partial write or damaged record poisons recovery; uncertainty never authorizes replay.
 */
export declare class GuidedJournal {
    private readonly directory;
    private readonly path;
    private readonly consumed;
    private poisoned;
    private writing;
    private written;
    private readonly native;
    private constructor();
    static open(directory: string, sessionId: string): Promise<GuidedJournal>;
    get recovered(): boolean;
    /** Synchronous reservation and fsync: InvocationControl cannot cross the native API boundary
     * while a durable transition is still pending. No recovery ever recreates this browser. */
    fence(event: BridgeNativeFenceEvent): void;
    consume(admission: unknown): Promise<void>;
}
