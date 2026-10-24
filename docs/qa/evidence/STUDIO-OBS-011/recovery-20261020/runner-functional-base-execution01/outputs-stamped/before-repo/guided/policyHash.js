/** STUDIO-OBS-014 AC-1 (architect ruling AR-2): the governed observation application policy reaches
 * the guided worker only inside the backend-frozen runner context, bound by `policyHash`. The worker
 * recomputes the hash over the policy it is about to apply and refuses a mismatch before the first
 * observation. Pure: no I/O, no clock, no page input. */
import { hash, insist } from './contracts.js';
const SHA256_HEX = /^[a-f0-9]{64}$/u;
/** sha256 over the canonical JSON of the closed policy projection the runner receives. It must equal
 * the backend's `GuidedContracts.hash` over the same projection byte for byte (AR-2 h, stop S-5). */
export function observationPolicyHash(policy) {
    return hash(policy);
}
/** Validates the context's policy against its frozen hash and, for a later context of the same
 * session, against the binding already in force. Any failure is the existing bridge refusal
 * `IDENTITY_MISMATCH` (AR-2 a); the caller has applied nothing yet. Returns a detached copy. */
export function bindContextPolicy(context, inForce) {
    try {
        // `object`, not a weak type: a generated RunnerContext must be accepted whether or not it
        // declares the two fields yet (TS2559), and their values are checked here, not trusted.
        const { applicationPolicy, policyHash } = context;
        insist(typeof policyHash === 'string' && SHA256_HEX.test(policyHash));
        insist(typeof applicationPolicy === 'object' && applicationPolicy !== null && !Array.isArray(applicationPolicy));
        const policy = applicationPolicy;
        insist(observationPolicyHash(policy) === policyHash);
        if (inForce)
            insist(inForce.policyHash === policyHash);
        return { applicationPolicy: structuredClone(policy), policyHash };
    }
    catch {
        throw new Error('IDENTITY_MISMATCH');
    }
}
//# sourceMappingURL=policyHash.js.map