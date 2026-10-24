/**
 * Recorded runtime versions (ADR-001 §4.2, architecture §4.6).
 *
 * The artifact-1 compatibility check (`isCompatible` / `assertCompatible`, `RUNTIME_INCOMPATIBLE`)
 * was deleted with the artifact-1 engine (STUDIO-OBS-012A AC-3). The observed path proves its
 * runtime through the build identity instead (`loadObservedBuild`, `assertBuild`).
 */
export { currentRuntimeVersions, loadRuntimeVersions, resetRuntimeVersionsCache, DEFAULT_RUNTIME_VERSIONS_FILE, } from './runtime-versions.js';
export type { RecordedRuntimeVersions, RuntimeVersions } from './runtime-versions.js';
