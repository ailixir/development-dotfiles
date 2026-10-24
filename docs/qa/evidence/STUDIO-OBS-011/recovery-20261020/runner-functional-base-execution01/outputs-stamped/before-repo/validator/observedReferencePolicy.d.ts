import type { BuildIdentity, Profile, TrustedPolicy, Scope } from '../executor/observedOperations.js';
import type { ObservationApplicationPolicy, ObservationRule } from '../run/observationTypes.js';
export declare const OBSERVED_LIMITS: Readonly<{
    artifact: 1048576;
    policy: 524288;
    basis: 6291456;
    validation: 8388608;
    verdict: 65536;
    job: 4194304;
    launch: 131072;
    execute: 2097152;
    ready: 4096;
    step: 8192;
    result: 65536;
    trustedPolicy: 65536;
    inputs: 262144;
}>;
export type ObservedErrorCode = 'INVALID_CONTRACT' | 'EVIDENCE_MISMATCH' | 'OPERATION_MISMATCH' | 'REFERENCE_MISMATCH' | 'PROFILE_MISMATCH' | 'LIMIT_EXCEEDED' | 'AUTHORIZATION_EXPIRED' | 'POLICY_REFUSED' | 'TARGET_DRIFT' | 'READ_REFUSED' | 'REFERENCE_REFUSED' | 'ASSERTION_FAILED' | 'CANCELLED' | 'TIMEOUT' | 'OUTCOME_UNKNOWN' | 'INTERNAL_ERROR' | 'LOGIN_REQUIRED' | 'PASSWORD_CONTROL_READ_REFUSED';
export declare class ObservedRefusal extends Error {
    readonly code: ObservedErrorCode;
    readonly reason?: string | undefined;
    readonly noEffect: boolean;
    constructor(code: ObservedErrorCode, reason?: string | undefined, noEffect?: boolean);
}
export declare function demand(value: unknown, code?: ObservedErrorCode): asserts value;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function canonicalObserved(value: unknown): string;
export declare function hashObserved(value: unknown): string;
export declare function equalObserved(a: unknown, b: unknown): boolean;
export declare function boundedObserved(value: unknown, maxBytes: number): number;
export declare function parseObservedBytes(bytes: Uint8Array, maxBytes: number): unknown;
export declare function validateObserved<T>(name: string, value: unknown, maxBytes?: number): T;
export declare const OBSERVED_PROFILE: Profile;
export declare const OBSERVED_SCHEMA_BUNDLE_HASH: string;
export declare function assertProfile(value: unknown): asserts value is Profile;
export declare function assertBuild(value: unknown, expected: BuildIdentity): asserts value is BuildIdentity;
export declare function canonicalOrigin(value: string): string;
/** Normalize only the trusted mounted source projection, never an incoming launch frame. */
export declare function projectMountedPolicy(value: unknown): TrustedPolicy;
export declare function validateTrustedPolicy(value: unknown, scope: Scope): TrustedPolicy;
export declare function observationPolicy(policy: TrustedPolicy): {
    rules: readonly ObservationRule[];
    applicationPolicy?: ObservationApplicationPolicy;
};
export declare function equalsOriginalTargetIntent(a: string, b: string): boolean;
