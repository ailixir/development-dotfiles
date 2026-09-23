import type { ReferenceDeclarations, ValidationPolicyInput } from './bounds.js';
import { resolvePolicy } from './bounds.js';
import type { Diagnostic } from './diagnostics.js';
import { DiagnosticCollector } from './diagnostics.js';
import { validateArtifactSchema } from './schema.js';
import { validateStepCode } from './ast.js';
import type { Operation } from '../executor/operations.js';
import { VALIDATOR_SCHEMA_VERSION } from '../versions.js';
import { parseReferencePolicy } from './referencePolicy.js';

export interface ValidatedStepResult {
  readonly stepIndex: number;
  readonly ok: boolean;
  /** Typed operation list for accepted steps; never source text (AC-11). */
  readonly operations: readonly Operation[] | null;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly validatorSchemaVersion: string;
  /** Diagnostics that belong to the artifact as a whole rather than to one step. */
  readonly diagnostics: readonly Diagnostic[];
  readonly steps: readonly ValidatedStepResult[];
}

/**
 * Validates a source artifact against the source lines it claims to compile (AC-11).
 *
 * Pure and browser-free: it reads no files, opens no sockets, launches nothing and evaluates
 * nothing. The output is either typed operations or diagnostics — never executable text.
 */
export function validateArtifact(
  artifact: unknown,
  source: readonly string[],
  references: ReferenceDeclarations,
  policy?: ValidationPolicyInput,
  referencePolicy?: unknown,
): ValidationResult {
  const { bounds } = resolvePolicy(policy);

  const artifactCollector = new DiagnosticCollector(bounds, null);
  const stepCollectors = source.map(
    (_line, index) => new DiagnosticCollector(bounds, index),
  );

  const schema = validateArtifactSchema(
    artifact,
    source,
    bounds,
    artifactCollector,
    stepCollectors,
  );

  // ADR-SC-003: an absent policy keeps the source-token reference rule; a malformed one rejects
  // the whole artifact rather than silently falling back to it.
  const parsedPolicy = referencePolicy === undefined
    ? null
    : parseReferencePolicy(referencePolicy, source.length, bounds.maxArtifactBytes, bounds.maxReferenceNameLength);
  if (parsedPolicy !== null && !parsedPolicy.ok) {
    artifactCollector.add({
      code: 'REFERENCE_POLICY_INVALID',
      message: parsedPolicy.path === undefined ? 'Reference policy is invalid.' : `Reference policy is invalid at ${parsedPolicy.path}.`,
    });
  }

  const operationsByStep = new Map<number, readonly Operation[]>();
  if (schema.steps !== null && (parsedPolicy === null || parsedPolicy.ok)) {
    for (const step of schema.steps) {
      const collector = stepCollectors[step.stepIndex];
      if (collector === undefined) continue;
      const stepPolicy = parsedPolicy?.ok ? parsedPolicy.steps[step.stepIndex] : undefined;
      const operations = validateStepCode(step, references, bounds, collector, stepPolicy);
      if (operations !== null && collector.isEmpty) operationsByStep.set(step.stepIndex, operations);
    }
  }

  const steps: ValidatedStepResult[] = stepCollectors.map((collector, index) => {
    const operations = operationsByStep.get(index) ?? null;
    const diagnostics = collector.list();
    return {
      stepIndex: index,
      ok: operations !== null && diagnostics.length === 0,
      operations: diagnostics.length === 0 ? operations : null,
      diagnostics,
    };
  });

  const artifactDiagnostics = artifactCollector.list();
  const ok =
    schema.ok && artifactDiagnostics.length === 0 && steps.every((step) => step.ok);

  return {
    ok,
    validatorSchemaVersion: VALIDATOR_SCHEMA_VERSION,
    diagnostics: artifactDiagnostics,
    steps,
  };
}

export { DEFAULT_BOUNDS, EMPTY_REFERENCES, resolvePolicy } from './bounds.js';
export type {
  ReferenceDeclarations,
  ValidationBounds,
  ValidationPolicy,
  ValidationPolicyInput,
} from './bounds.js';
export { DIAGNOSTIC_CODES, isDiagnosticCode } from './diagnostics.js';
export type { Diagnostic, DiagnosticCode } from './diagnostics.js';
export type { ArtifactStep } from './schema.js';
export type { StepReferencePolicy } from './referencePolicy.js';
