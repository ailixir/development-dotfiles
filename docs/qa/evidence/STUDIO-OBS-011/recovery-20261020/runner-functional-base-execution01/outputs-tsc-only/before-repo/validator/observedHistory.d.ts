import type { ValidationBasis, MaterializationVersion, PreparationFact, EffectiveActionFact, OriginalAllocation, OriginalConsumerEdge } from '../executor/observedOperations.js';
export declare function historicalVersion(b: ValidationBasis, revision: number): MaterializationVersion;
export declare function validateHistoricalAction(b: ValidationBasis, fact: EffectiveActionFact, p: PreparationFact): void;
export declare function validateMaterializationHistory(b: ValidationBasis): void;
export declare function validateIncrementalHistory(b: ValidationBasis): void;
/** ARCH015-02: raw arrays remain committed; only a proven spent no-native edge is omitted. */
export declare function effectiveGraph(b: ValidationBasis): {
    allocations: OriginalAllocation[];
    consumerEdges: OriginalConsumerEdge[];
};
