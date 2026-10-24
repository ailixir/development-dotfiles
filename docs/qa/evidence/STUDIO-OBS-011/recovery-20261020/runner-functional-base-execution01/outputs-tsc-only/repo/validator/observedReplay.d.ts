import type { Execute3, Artifact3, BuildIdentity, InputRecipe, ValidationVerdict, ObservedJob, TrustedPolicy } from '../executor/observedOperations.js';
export interface ObservedHashes {
    sourceHash: string;
    configurationHash: string;
    authoringHash: string;
    learnedPlanHash: string;
    artifactHash: string;
    referencePolicyHash: string;
    operationEquivalenceHash: string;
    admissionProvenanceHash: string;
    publicationEvidenceHash: string;
    runAuthorizationHash: string;
    profileHash: string;
}
export interface DerivedObserved {
    artifact: Artifact3;
    hashes: ObservedHashes;
}
export declare function sortInputRecipes(inputs: readonly InputRecipe[], steps: readonly string[]): InputRecipe[];
export declare function deriveObservedArtifact(raw: unknown): DerivedObserved;
/** Actual packaged pure endpoint validator; all expected semantics come from original basis. */
export declare function validateObservedRequest(raw: unknown, build: BuildIdentity): ValidationVerdict;
/** Replay checks immutable structure/joins without pretending the historical basis is on the job. */
export declare function validateReplayArtifact(raw: unknown): Artifact3;
export declare function validateObservedJob(raw: unknown, build: BuildIdentity, policy: TrustedPolicy, now?: number): ObservedJob;
/** Transient check at the Execute3 value boundary; no Vault access or retained value state. */
export declare function assertResolvedSecretLiterals(message: Pick<Execute3, 'inputs' | 'steps' | 'secrets'>): void;
