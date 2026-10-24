import { GuidedRuntime } from './runtime.js';
import type { GuidedRuntimeOptions } from './runtime.js';
import type { AssignmentReceipt, BridgeIdentity, CommandsClaim, Session, BridgeContextAcknowledgement } from './types.js';
export type ClaimPort = (command: CommandsClaim, key: string, timeoutMs: number, signal: AbortSignal) => Promise<Session>;
export interface OwnershipOptions extends GuidedRuntimeOptions {
    claim: ClaimPort;
    capacity?: number;
}
/** Assignment is a reservation, never a fabricated owner grant. Only a complete authenticated
 * worker claim acknowledgement supplies local authority, and it can only expire or stop. */
export declare class GuidedOwnership {
    private readonly options;
    private readonly entries;
    constructor(options: OwnershipOptions);
    private occupied;
    private live;
    private cancelTimers;
    private invalidate;
    private schedule;
    private checkGrant;
    private requestClaim;
    private acquire;
    assign(value: unknown): Promise<AssignmentReceipt>;
    private receipt;
    private renew;
    getRuntime(message: BridgeIdentity): GuidedRuntime;
    context(value: unknown, deliveryId?: string): Promise<BridgeIdentity | BridgeContextAcknowledgement>;
    private stopEntry;
    stop(value: unknown): Promise<AssignmentReceipt | BridgeIdentity>;
    close(): Promise<void>;
}
