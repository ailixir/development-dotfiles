import type { AccountHandle, AdmissionReceipt, Scope } from '../executor/observedOperations.js';
import { demand, equalObserved, hashObserved, ObservedRefusal, validateObserved } from '../validator/observedReferencePolicy.js';
/** Capabilities never cross IPC. Only compiled trusted providers can construct their contents. */
export interface ConsumedAccount {
    readonly capability: object;
}
export interface PreparedAccount {
    readonly capability: object;
}
export interface AppliedAccount {
    readonly capability: object;
}
export interface RecordedContextCapability {
    readonly identity: object;
    readonly scope: Scope;
    installCookies(cookies: readonly {
        name: string;
        value: string;
        domain: string;
        path: string;
        expires: number;
        httpOnly: boolean;
        secure: boolean;
        sameSite: 'Strict' | 'Lax' | 'None';
    }[]): Promise<void>;
    enter(destination: string): Promise<void>;
}
export interface ObservedAccountProvider {
    consume(handle: AccountHandle, admission: AdmissionReceipt, signal: AbortSignal): Promise<ConsumedAccount>;
    prepare(consumed: ConsumedAccount, signal: AbortSignal): Promise<PreparedAccount>;
    apply(prepared: PreparedAccount, context: RecordedContextCapability, signal: AbortSignal): Promise<AppliedAccount>;
    dispose(capability: ConsumedAccount | PreparedAccount | AppliedAccount): Promise<void>;
}
export type ObservedAccountRegistry = ReadonlyMap<string, ObservedAccountProvider>;
/** OBS-007 registers reviewed connectivity in this compiled startup module; no dynamic loader. */
export const compiledObservedAccountRegistry: ObservedAccountRegistry = new Map();
export function accountProvider(registry: ObservedAccountRegistry, handle: AccountHandle): ObservedAccountProvider {
    validateObserved('replay-account', handle, 8192);
    const provider = registry.get(handle.authorization.providerId);
    demand(provider, 'ACCOUNT_UNAVAILABLE');
    return provider;
}
export function validateAccountReceipt(handle: AccountHandle, receipt: AdmissionReceipt, now = Date.now()): void {
    const a = handle.authorization, r = receipt.request;
    demand(a.executionId === r.executionId && a.attemptId === r.attemptId && a.revisionDigest === r.revisionDigest && a.scopeHash === r.scopeHash && a.grantId === r.accountGrantId && hashObserved(a.scope) === a.scopeHash, 'INVALID_CONTRACT');
    demand(Date.parse(a.issuedAt) <= now && Date.parse(a.expiresAt) > now && Date.parse(receipt.startDeadlineAt) > now, 'AUTHORIZATION_EXPIRED');
}
/** A single irreversible attempt. Cancellation cannot revive it or cause a consume/apply retry. */
export class ObservedAccountLifecycle {
    private state: 'NEW' | 'CONSUMED' | 'PREPARED' | 'APPLIED' | 'DISPOSED' = 'NEW';
    private readonly disposedCapabilities=new WeakSet();
    private current: ConsumedAccount | PreparedAccount | AppliedAccount | null = null;
    constructor(private readonly provider: ObservedAccountProvider, private readonly signal: AbortSignal) { }
    private live(): void { demand(!this.signal.aborted && this.state !== 'DISPOSED', 'CANCELLED'); }
    private async retain<T extends ConsumedAccount | PreparedAccount | AppliedAccount>(work: Promise<T>, next: 'CONSUMED' | 'PREPARED' | 'APPLIED'): Promise<T> {
        let value: T;
        try {
            value = await work;
        }
        catch {
            throw new ObservedRefusal(this.signal.aborted ? 'CANCELLED' : 'ACCOUNT_UNKNOWN');
        }
        if (this.signal.aborted || this.state === 'DISPOSED') {
            await this.disposeCapability(value);
            throw new ObservedRefusal('CANCELLED');
        }
        this.current = value;
        this.state = next;
        return value;
    }
    async prepare(handle: AccountHandle, receipt: AdmissionReceipt): Promise<void> {
        this.live();
        demand(this.state === 'NEW', 'ACCOUNT_UNKNOWN');
        validateAccountReceipt(handle, receipt);
        // Consume is issued once even when the provider rejects or its acknowledgement is lost.
        this.state = 'CONSUMED';
        const consumed = await this.retain(this.provider.consume(handle, receipt, this.signal), 'CONSUMED');
        this.live();
        await this.retain(this.provider.prepare(consumed, this.signal), 'PREPARED');
    }
    async apply(context: RecordedContextCapability, scope: Scope): Promise<void> {
        this.live();
        demand(this.state === 'PREPARED' && this.current && equalObserved(context.scope, scope), 'ACCOUNT_UNKNOWN');
        const prepared = this.current;
        this.state = 'APPLIED';
        await this.retain(this.provider.apply(prepared, context, this.signal), 'APPLIED');
    }
    private async disposeCapability(value:ConsumedAccount|PreparedAccount|AppliedAccount):Promise<void>{if(this.disposedCapabilities.has(value.capability))return;this.disposedCapabilities.add(value.capability);await this.provider.dispose(value).catch(()=>undefined);}
    async dispose(): Promise<void> { const value = this.current; this.current = null; this.state = 'DISPOSED'; if (value)
        await this.disposeCapability(value); }
}
