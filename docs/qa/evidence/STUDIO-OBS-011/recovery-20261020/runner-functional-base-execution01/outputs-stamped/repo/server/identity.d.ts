import type { Socket } from 'node:net';
export type IdentityVerdict = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly status: 401 | 403;
    readonly code: string;
};
/** Header carrying the restricted service identity. Never a query parameter (AC-3). */
export declare const IDENTITY_HEADER = "authorization";
export interface IdentityChecker {
    /** Verdict for one request's raw header value. `undefined` means the header was absent. */
    check(headerValue: string | undefined): IdentityVerdict;
}
export declare function createIdentityChecker(expectedToken: string): IdentityChecker;
export type PeerVerdict = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly status: 401;
    readonly code: 'PEER_REJECTED';
};
/** Who may call a route: the controller only, or the controller or this runner's own certificate. */
export type PeerAudience = 'controller' | 'controller-or-self';
export interface PeerPin {
    /** Verdict for the connection a request arrived on. A plaintext socket is never accepted. */
    check(socket: Socket, audience: PeerAudience): PeerVerdict;
}
/**
 * Pins the client certificate to its SHA-256 fingerprint. Both fingerprints are public values, so
 * the comparison needs no constant-time treatment; the CA chain was already verified by the handshake
 * (`socket.authorized`), and this narrows "any certificate the CA issued" to "the one we named".
 */
export declare function createPeerPin(controllerFingerprint256: string, ownFingerprint256: string): PeerPin;
