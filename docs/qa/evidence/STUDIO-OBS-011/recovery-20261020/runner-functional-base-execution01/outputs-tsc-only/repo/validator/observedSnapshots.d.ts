import type { AuthoringSnapshotIdentity, Configuration, LearnedPlan, ValidationBasis } from '../executor/observedOperations.js';
/** Frozen source identity only. No current variable lookup or materialized value reconstruction. */
export declare function inputChains(identity: AuthoringSnapshotIdentity, configuration: Configuration): string[];
export declare function stepSnapshots(identity: AuthoringSnapshotIdentity, configuration: Configuration, plan: Pick<LearnedPlan, 'actions' | 'bindings'>): Record<string, string>;
/** Reconstruct current and immediate immutable base maps before any candidate hash exists. */
export declare function deriveSnapshotMaps(b: ValidationBasis, plan: Pick<LearnedPlan, 'actions' | 'bindings'>): Pick<LearnedPlan, 'stepSnapshotHashes' | 'reusedFrom' | 'incremental'>;
