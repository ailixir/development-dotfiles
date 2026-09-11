/**
 * Public surface of the studio runner package.
 *
 * Story 10.2 ships the validator and the trusted executor; story 10.3 adds the runtime
 * compatibility check. The HTTP server (10.6), the real Playwright adapter (10.12) and evidence
 * upload (10.14) are added behind the same seams.
 */
export { validateArtifact } from './validator/index.js';
export type { ValidationResult, ValidatedStepResult } from './validator/index.js';
export {
  DEFAULT_BOUNDS,
  DIAGNOSTIC_CODES,
  EMPTY_REFERENCES,
  isDiagnosticCode,
  resolvePolicy,
} from './validator/index.js';
export type {
  Diagnostic,
  DiagnosticCode,
  ArtifactStep,
  ReferenceDeclarations,
  ValidationBounds,
  ValidationPolicy,
  ValidationPolicyInput,
} from './validator/index.js';
export * from './executor/index.js';
export * from './compat/index.js';
export {
  ARTIFACT_VERSION,
  EXECUTOR_VERSION,
  SYNTAX_REFERENCE_VERSION,
  VALIDATOR_PARSER,
  VALIDATOR_SCHEMA_VERSION,
} from './versions.js';
