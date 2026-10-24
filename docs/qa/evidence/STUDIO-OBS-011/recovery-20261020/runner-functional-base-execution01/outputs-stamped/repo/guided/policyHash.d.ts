import type { ObservationApplicationPolicy } from '../run/observationTypes.js';
/** sha256 over the canonical JSON of the closed policy projection the runner receives. It must equal
 * the backend's `GuidedContracts.hash` over the same projection byte for byte (AR-2 h, stop S-5). */
export declare function observationPolicyHash(policy: ObservationApplicationPolicy): string;
export interface PolicyBinding {
    readonly applicationPolicy: ObservationApplicationPolicy;
    readonly policyHash: string;
}
/** Validates the context's policy against its frozen hash and, for a later context of the same
 * session, against the binding already in force. Any failure is the existing bridge refusal
 * `IDENTITY_MISMATCH` (AR-2 a); the caller has applied nothing yet. Returns a detached copy. */
export declare function bindContextPolicy(context: object, inForce?: PolicyBinding): PolicyBinding;
