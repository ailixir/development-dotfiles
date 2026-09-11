import type { ValidationBounds } from './bounds.js';
import type { DiagnosticCollector } from './diagnostics.js';
import { ARTIFACT_VERSION } from '../versions.js';

/** One entry of the source artifact (architecture §4.4). */
export interface ArtifactStep {
  readonly stepIndex: number;
  readonly originalText: string;
  readonly code: string;
}

const ARTIFACT_KEYS: readonly string[] = ['version', 'steps'];
const STEP_KEYS: readonly string[] = ['stepIndex', 'originalText', 'code'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** UTF-8 size of the artifact as it arrived, measured before anything is inspected. */
export function artifactByteLength(artifact: unknown): number {
  let serialized: unknown;
  try {
    serialized = JSON.stringify(artifact);
  } catch {
    // Unserializable input (cycles, BigInt) is treated as over-budget: it cannot be a valid
    // artifact and must not be walked.
    return Number.POSITIVE_INFINITY;
  }
  // `JSON.stringify(undefined)` is `undefined`; such input cannot be a valid artifact.
  if (typeof serialized !== 'string') return Number.POSITIVE_INFINITY;
  return new TextEncoder().encode(serialized).length;
}

export interface SchemaOutcome {
  readonly ok: boolean;
  /** Present only when every envelope rule passed. */
  readonly steps: readonly ArtifactStep[] | null;
}

/**
 * Validates the artifact envelope against the source lines (AC-5).
 *
 * Order matters: size first, then shape, then per-step alignment. Nothing here parses `code`;
 * the AST stage only runs on an envelope that already passed.
 */
export function validateArtifactSchema(
  artifact: unknown,
  source: readonly string[],
  bounds: ValidationBounds,
  artifactDiagnostics: DiagnosticCollector,
  stepDiagnostics: readonly DiagnosticCollector[],
): SchemaOutcome {
  const bytes = artifactByteLength(artifact);
  if (bytes > bounds.maxArtifactBytes) {
    artifactDiagnostics.add({
      code: 'ARTIFACT_TOO_LARGE',
      message: `Artifact is ${String(bytes)} bytes, over the ${String(bounds.maxArtifactBytes)} byte limit.`,
    });
    return { ok: false, steps: null };
  }

  if (!isPlainObject(artifact)) {
    artifactDiagnostics.add({
      code: 'ARTIFACT_NOT_OBJECT',
      message: 'Artifact must be a JSON object with exactly the keys "version" and "steps".',
    });
    return { ok: false, steps: null };
  }

  let ok = true;
  for (const key of Object.keys(artifact)) {
    if (!ARTIFACT_KEYS.includes(key)) {
      ok = false;
      artifactDiagnostics.add({
        code: 'ARTIFACT_UNKNOWN_KEY',
        message: `Unknown top-level artifact key "${key}".`,
      });
    }
  }

  if (artifact.version !== ARTIFACT_VERSION) {
    ok = false;
    artifactDiagnostics.add({
      code: 'ARTIFACT_VERSION_UNSUPPORTED',
      message: `Artifact version must be ${String(ARTIFACT_VERSION)}.`,
    });
  }

  const rawSteps = artifact.steps;
  if (!Array.isArray(rawSteps)) {
    artifactDiagnostics.add({
      code: 'ARTIFACT_STEPS_NOT_ARRAY',
      message: 'Artifact "steps" must be an array.',
    });
    return { ok: false, steps: null };
  }

  if (rawSteps.length > bounds.maxSteps) {
    artifactDiagnostics.add({
      code: 'ARTIFACT_STEP_LIMIT_EXCEEDED',
      message: `Artifact has ${String(rawSteps.length)} steps, over the ${String(bounds.maxSteps)} step limit.`,
    });
    return { ok: false, steps: null };
  }

  if (rawSteps.length !== source.length) {
    artifactDiagnostics.add({
      code: 'ARTIFACT_STEP_COUNT_MISMATCH',
      message: `Artifact has ${String(rawSteps.length)} steps but the source has ${String(source.length)} lines; exactly one entry per line is required.`,
    });
    return { ok: false, steps: null };
  }

  const steps: ArtifactStep[] = [];
  for (let index = 0; index < rawSteps.length; index += 1) {
    const collector = stepDiagnostics[index];
    if (collector === undefined) {
      ok = false;
      continue;
    }
    const parsed = validateStep(rawSteps[index], index, source[index] ?? '', bounds, collector);
    if (parsed === null) {
      ok = false;
    } else {
      steps.push(parsed);
    }
  }

  return ok ? { ok, steps } : { ok: false, steps: null };
}

function validateStep(
  raw: unknown,
  index: number,
  sourceLine: string,
  bounds: ValidationBounds,
  collector: DiagnosticCollector,
): ArtifactStep | null {
  if (!isPlainObject(raw)) {
    collector.add({ code: 'STEP_NOT_OBJECT', message: 'Step must be a JSON object.' });
    return null;
  }

  let ok = true;
  for (const key of Object.keys(raw)) {
    if (!STEP_KEYS.includes(key)) {
      ok = false;
      collector.add({ code: 'STEP_UNKNOWN_KEY', message: `Unknown step key "${key}".` });
    }
  }

  if (raw.stepIndex !== index) {
    ok = false;
    collector.add({
      code: 'STEP_INDEX_MISALIGNED',
      message: `stepIndex must equal the array position ${String(index)}.`,
    });
  }

  const originalText = raw.originalText;
  if (typeof originalText !== 'string' || originalText !== sourceLine) {
    ok = false;
    collector.add({
      code: 'STEP_TEXT_MISMATCH',
      message: 'originalText must be byte-identical to the corresponding source line.',
    });
  }

  const code = raw.code;
  if (typeof code !== 'string') {
    collector.add({ code: 'STEP_CODE_NOT_STRING', message: 'Step "code" must be a string.' });
    return null;
  }
  if (code.length > bounds.maxCodeLength) {
    ok = false;
    collector.add({
      code: 'STEP_CODE_TOO_LONG',
      message: `Step code is ${String(code.length)} characters, over the ${String(bounds.maxCodeLength)} character limit.`,
    });
  }

  if (!ok) return null;
  return { stepIndex: index, originalText: sourceLine, code };
}
