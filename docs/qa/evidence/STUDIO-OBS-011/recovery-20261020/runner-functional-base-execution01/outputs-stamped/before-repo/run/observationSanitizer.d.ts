import type { CollectorOptions, Observation, ObservationConfig, ObservationExport } from './observationTypes.js';
/** canonical-v1, matching the frozen contract's non-ASCII vector. */
export declare function canonicalObservation(value: unknown): string;
export declare function observationOptions(config: ObservationConfig): CollectorOptions;
export declare function exportObservation(observation: Observation, maxBytes: number): ObservationExport;
