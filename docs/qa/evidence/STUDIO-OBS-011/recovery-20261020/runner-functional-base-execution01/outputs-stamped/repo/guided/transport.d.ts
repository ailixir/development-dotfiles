import type { ServerOptions } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ClaimPort } from './ownership.js';
import type { GuidedRuntimeOptions } from './runtime.js';
export interface GuidedJwtPolicy {
    issuer: string;
    publicKey: string;
    subject: string;
}
export declare function verifyGuidedJwt(authorization: string | undefined, policy: GuidedJwtPolicy, audience: string, role: string): void;
/**
 * The guided bridge without a listener (STUDIO-OBS-009 AC-1). The one runner listener
 * (`src/server/server.ts`) hands every `/internal/v2/studio/guided-sessions/...` request to
 * {@link GuidedBridge.handle}; the bridge owns the peer pin, the JWT and the session ownership, and
 * owns no socket.
 */
export interface GuidedBridgeOptions extends GuidedRuntimeOptions {
    claim: ClaimPort;
    controllerJwt: GuidedJwtPolicy;
    /** Bind the service certificate as well as the issuer JWT to the controller. */
    controllerCertificateFingerprint256: string;
    capacity?: number;
}
/** What `createGuidedServer` additionally takes: the TLS material of the listener it wraps. */
export interface GuidedServerOptions extends GuidedBridgeOptions {
    tls: Pick<ServerOptions, 'key' | 'cert' | 'ca'>;
}
export interface GuidedBridge {
    /** One bridge request. Every refusal is a closed answer; nothing is thrown to the caller. */
    handle(req: IncomingMessage, res: ServerResponse): void;
    /**
     * Stops every owned session with `CONTEXT_LOST` and waits for the recordings to settle. Rejects
     * `CONTEXT_LOST` when any stop could not be confirmed (the slot is then held until the process ends).
     */
    closeSessions(): Promise<void>;
}
export declare function guidedDispatchIdentity(body: unknown): {
    digest: string;
    secretIdentity: string;
};
/** Closed refusal vocabulary of the guided bridge: the source of truth for bridge#/definitions/refusal
 * (STUDIO-OBS-014 AR-2 r14-stops ruling 2), whose `code` enum is this list plus the POLICY_DENIED fallback. */
export declare const GUIDED_REFUSAL_CODES: readonly ["AUTH_DENIED", "IDEMPOTENCY_CONFLICT", "SCHEMA", "IDENTITY_MISMATCH", "CAPACITY", "CONTEXT_LOST", "ALREADY_CONSUMED", "BUSY", "TARGET_CHANGED", "PREPARATION_DENIED", "ADMISSION_DENIED", "BINDING_UNAVAILABLE", "BINDING_DENIED", "BINDING_ORDER", "ACTION_ORDER", "CONTEXT_REVISION", "INPUT_IDENTITY", "BUDGET_EXCEEDED"];
export declare const GUIDED_REFUSAL_REASONS: readonly ["PASSWORD_TARGET_ABSENT", "PASSWORD_TARGET_AMBIGUOUS", "PASSWORD_FORM_ACTION_NOT_ALLOWED", "PASSWORD_CONTROL_READ_REFUSED"];
export declare function createGuidedBridge(options: GuidedBridgeOptions): GuidedBridge;
/**
 * The bridge wrapped in a listener of its own, with the timeouts of the one runner listener. Not used by
 * the runner process (`main.ts` serves the bridge on the one listener); kept for the tiers that drive the
 * bridge on its own socket.
 */
export declare function createGuidedServer(options: GuidedServerOptions): {
    server: import("https").Server<typeof IncomingMessage, typeof ServerResponse>;
    close(): Promise<void>;
};
export interface GuidedCallbackOptions {
    baseUrl: string;
    tls: Pick<ServerOptions, 'key' | 'cert' | 'ca'>;
    token: () => Promise<string>;
    controllerCertificateFingerprint256: string;
}
export declare function guidedCallback(options: GuidedCallbackOptions): GuidedRuntimeOptions['callback'];
export declare function guidedClaimClient(options: GuidedCallbackOptions): ClaimPort;
