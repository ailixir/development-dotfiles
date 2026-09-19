import type { ValidationBounds } from './bounds.js';

/**
 * Every rejection class the validator can emit.
 *
 * This list is the mechanical contract behind AC-18/AC-20: the adversarial corpus must contain
 * at least one fixture whose `expectedClass` is each of these codes, and a test fails when a
 * code has no fixture. Adding a denial to the validator therefore forces a fixture.
 */
export const DIAGNOSTIC_CODES = [
  // ── artifact envelope (§4.4) ──
  'ARTIFACT_NOT_OBJECT',
  'ARTIFACT_UNKNOWN_KEY',
  'ARTIFACT_VERSION_UNSUPPORTED',
  'ARTIFACT_TOO_LARGE',
  'ARTIFACT_STEPS_NOT_ARRAY',
  'ARTIFACT_STEP_COUNT_MISMATCH',
  'ARTIFACT_STEP_LIMIT_EXCEEDED',
  // ── step envelope ──
  'STEP_NOT_OBJECT',
  'STEP_UNKNOWN_KEY',
  'STEP_INDEX_MISALIGNED',
  'STEP_TEXT_MISMATCH',
  'STEP_CODE_NOT_STRING',
  'STEP_CODE_TOO_LONG',
  // ── program shape (§4.5) ──
  'SYNTAX_ERROR',
  'STATEMENT_LIMIT_EXCEEDED',
  'AST_DEPTH_EXCEEDED',
  'STATEMENT_NOT_EXPRESSION',
  'STATEMENT_DECLARATION',
  'STATEMENT_LOOP',
  'STATEMENT_CONDITIONAL',
  'STATEMENT_IMPORT',
  'STATEMENT_NOT_AWAITED',
  'EXPRESSION_ASSIGNMENT',
  'EXPRESSION_FUNCTION',
  'EXPRESSION_NEW',
  'EXPRESSION_SPREAD',
  'EXPRESSION_COMPUTED_MEMBER',
  'EXPRESSION_OPTIONAL_CHAIN',
  'EXPRESSION_TEMPLATE_SUBSTITUTION',
  'EXPRESSION_NOT_PERMITTED',
  'UNSUPPORTED_TYPESCRIPT',
  // ── permitted surface ──
  'RECEIVER_NOT_PERMITTED',
  'METHOD_NOT_PERMITTED',
  'PROTOTYPE_ACCESS',
  'LOCATOR_CHAIN_INVALID',
  'SELECTOR_NOT_CSS',
  // ── argument schemas ──
  'ARGUMENT_COUNT',
  'ARGUMENT_TYPE',
  'ARGUMENT_TOO_LONG',
  'ARGUMENT_VALUE_NOT_PERMITTED',
  'OPTION_UNKNOWN_KEY',
  'OPTION_NOT_OBJECT',
  'OPTION_VALUE_TYPE',
  'OPTION_COMPUTED_KEY',
  'OPTION_ACCESSOR',
  'OPTION_SHORTHAND',
  'OPTION_LIMIT_EXCEEDED',
  'REGEX_TOO_LONG',
  'REGEX_UNSAFE',
  'REGEX_FLAGS_NOT_PERMITTED',
  'REGEX_INVALID',
  // ── references (§9.2) ──
  'REFERENCE_METHOD_UNKNOWN',
  'REFERENCE_ARGUMENT_INVALID',
  'REFERENCE_UNDECLARED',
  'REFERENCE_POSITION_NOT_PERMITTED',
  'REFERENCE_MISSING',
  'REFERENCE_EXTRA',
  // ── compiler intent correspondence (ADR-003) ──
  'EXPECTED_INTENT_INVALID',
  'EXPECTED_INTENT_VERSION_UNSUPPORTED',
  'EXPECTED_INTENT_TOO_LARGE',
  'EXPECTED_INTENT_STEP_COUNT_MISMATCH',
  'EXPECTED_INTENT_DUPLICATE_STEP',
  'EXPECTED_INTENT_STEP_INVALID',
  'EXPECTED_INTENT_OPERATION_INVALID',
  'EXPECTED_INTENT_MISMATCH',
  // ── reporting ──
  'DIAGNOSTICS_TRUNCATED',
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set<string>(DIAGNOSTIC_CODES);

export function isDiagnosticCode(value: string): value is DiagnosticCode {
  return CODE_SET.has(value);
}

export interface Diagnostic {
  readonly code: DiagnosticCode;
  /** `null` for artifact-level problems that belong to no single step. */
  readonly stepIndex: number | null;
  readonly message: string;
  /** Syntax kind of the offending node, when the problem is a node. */
  readonly node: string | null;
  /**
   * Bounded excerpt of the offending node only (AC-15). The validator never echoes the whole
   * step code, and the excerpt is truncated to `maxExcerptLength`.
   */
  readonly excerpt: string | null;
}

export interface DiagnosticInput {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly node?: string | undefined;
  readonly excerpt?: string | undefined;
}

function truncate(value: string, max: number): string {
  if (max <= 0) return '';
  // Collapse newlines so a diagnostic stays one readable line.
  const flat = value.replace(/\s+/gu, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Collects diagnostics for one scope (the artifact, or one step) under the configured bounds.
 * Once the per-step cap is reached further diagnostics are dropped and a single truncation
 * notice is appended, so a hostile artifact cannot inflate a report.
 */
export class DiagnosticCollector {
  readonly #bounds: ValidationBounds;
  readonly #stepIndex: number | null;
  readonly #items: Diagnostic[] = [];
  #dropped = 0;

  constructor(bounds: ValidationBounds, stepIndex: number | null) {
    this.#bounds = bounds;
    this.#stepIndex = stepIndex;
  }

  get length(): number {
    return this.#items.length + this.#dropped;
  }

  get isEmpty(): boolean {
    return this.length === 0;
  }

  add(input: DiagnosticInput): void {
    if (this.#items.length >= this.#bounds.maxDiagnosticsPerStep) {
      this.#dropped += 1;
      return;
    }
    this.#items.push({
      code: input.code,
      stepIndex: this.#stepIndex,
      message: truncate(input.message, this.#bounds.maxDiagnosticMessageLength),
      node: input.node ?? null,
      excerpt:
        input.excerpt === undefined ? null : truncate(input.excerpt, this.#bounds.maxExcerptLength),
    });
  }

  list(): Diagnostic[] {
    if (this.#dropped === 0) return [...this.#items];
    const notice: Diagnostic = {
      code: 'DIAGNOSTICS_TRUNCATED',
      stepIndex: this.#stepIndex,
      message: `${String(this.#dropped)} further diagnostics were suppressed by maxDiagnosticsPerStep.`,
      node: null,
      excerpt: null,
    };
    return [...this.#items, notice];
  }
}
