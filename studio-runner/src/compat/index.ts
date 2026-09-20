/**
 * Runtime compatibility (architecture §4.6, story 10.3).
 *
 * `isCompatible` answers whether a confirmed artifact may run on this runner; `assertCompatible`
 * is the guard callers place before any adapter call so an incompatible artifact never reaches a
 * browser. The backend maps `RUNTIME_INCOMPATIBLE` to `409 RUNTIME_INCOMPATIBLE` (10.8).
 */
export {
  assertCompatible,
  isCompatible,
  COMPATIBILITY_FIELDS,
  COMPATIBILITY_RULES,
  RUNNER_VERSIONS,
  RUNTIME_INCOMPATIBLE,
  RuntimeIncompatibleError,
} from './compatibility.js';
export type {
  ArtifactProvenance,
  CompatibilityResult,
  CompatibilityRule,
  FieldMismatch,
  RuntimeVersions,
} from './compatibility.js';
export {
  currentRuntimeVersions,
  loadRuntimeVersions,
  resetRuntimeVersionsCache,
  DEFAULT_RUNTIME_VERSIONS_FILE,
} from './runtime-versions.js';
export type { RecordedRuntimeVersions } from './runtime-versions.js';
