import type { ReferenceDeclarations, ValidationPolicyInput } from './bounds.js';
import { resolvePolicy } from './bounds.js';
import type { Diagnostic, DiagnosticCode } from './diagnostics.js';
import { DiagnosticCollector } from './diagnostics.js';
import { validateArtifactSchema } from './schema.js';
import { validateStepCode } from './ast.js';
import type { Operation } from '../executor/operations.js';
import { VALIDATOR_SCHEMA_VERSION } from '../versions.js';
import { expectedReferences, operationsCorrespond, parseExpectedIntent } from './expectedIntent.js';

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
  expectedIntent?: unknown,
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

  const expected = expectedIntent === undefined
    ? null
    : parseExpectedIntent(expectedIntent, source.length, bounds.maxArtifactBytes);
  if (expected !== null && !expected.ok) {
    artifactCollector.add({
      code: expected.code as DiagnosticCode,
      message: expected.path === undefined ? 'Expected intent is invalid.' : `Expected intent is invalid at ${expected.path}.`,
    });
  }

  const operationsByStep = new Map<number, readonly Operation[]>();
  if (schema.steps !== null && (expected === null || expected.ok)) {
    for (const step of schema.steps) {
      const collector = stepCollectors[step.stepIndex];
      if (collector === undefined) continue;
      const expectedStep = expected?.ok ? expected.intent.steps[step.stepIndex] : undefined;
      const refs = expectedStep === undefined ? undefined : expectedReferences(expectedStep.operations);
      const operations = validateStepCode(step, references, bounds, collector, refs);
      if (operations !== null && expectedStep !== undefined && !operationsCorrespond(operations, expectedStep.operations, policy?.defaultTimeoutMs)) {
        collector.add({ code: 'EXPECTED_INTENT_MISMATCH', message: 'Parsed operations do not exactly match expected intent.' });
      }
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
export type { ExpectedIntent, ExpectedIntentStep } from './expectedIntent.js';
