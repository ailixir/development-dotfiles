/**
 * Configurable bounds for artifact validation (AC-10, architecture §4.5).
 *
 * These are configuration, not constants: every call site may override any of them, and the
 * defaults below are the documented package defaults (see README.md). Nothing in the validator
 * reads a hard-coded limit.
 */
export interface ValidationBounds {
  /** Maximum UTF-8 size of the serialized artifact, checked before parsing anything. */
  readonly maxArtifactBytes: number;
  /** Maximum number of steps in one artifact. */
  readonly maxSteps: number;
  /** Maximum UTF-16 length of a single step's `code` string. */
  readonly maxCodeLength: number;
  /** Maximum number of statements in one step. */
  readonly maxStatementsPerStep: number;
  /** Maximum AST nesting depth inside one statement. */
  readonly maxAstDepth: number;
  /** Maximum length of any accepted string literal argument. */
  readonly maxStringLength: number;
  /** Maximum length of a CSS selector passed to `locator()`. */
  readonly maxSelectorLength: number;
  /** Maximum length of a URL literal. */
  readonly maxUrlLength: number;
  /** Maximum length of a regular expression literal, including delimiters and flags. */
  readonly maxRegexLength: number;
  /** Maximum nesting of quantified groups tolerated inside a regular expression. */
  readonly maxRegexQuantifierNesting: number;
  /** Maximum number of keys in an options object literal. */
  readonly maxOptionKeys: number;
  /** Maximum number of diagnostics reported for one step before truncation. */
  readonly maxDiagnosticsPerStep: number;
  /** Maximum length of a diagnostic message. */
  readonly maxDiagnosticMessageLength: number;
  /** Maximum length of the source excerpt attached to a diagnostic. */
  readonly maxExcerptLength: number;
  /** Maximum length of a reference name (`vars.get`) or secret id (`vars.secret`). */
  readonly maxReferenceNameLength: number;
}

/** Documented package defaults (README.md "Bounds"). */
export const DEFAULT_BOUNDS: ValidationBounds = {
  maxArtifactBytes: 64 * 1024,
  maxSteps: 100,
  maxCodeLength: 2048,
  maxStatementsPerStep: 8,
  maxAstDepth: 24,
  maxStringLength: 1024,
  maxSelectorLength: 512,
  maxUrlLength: 2048,
  maxRegexLength: 256,
  maxRegexQuantifierNesting: 1,
  maxOptionKeys: 8,
  maxDiagnosticsPerStep: 10,
  maxDiagnosticMessageLength: 400,
  maxExcerptLength: 120,
  maxReferenceNameLength: 64,
};

/** Declared variable and secret references the artifact is allowed to name (AC-9). */
export interface ReferenceDeclarations {
  /** Names accepted by `vars.get('NAME')`. */
  readonly variables: readonly string[];
  /** Ids accepted by `vars.secret('ID')`. */
  readonly secrets: readonly string[];
}

export interface ValidationPolicy {
  readonly bounds: ValidationBounds;
}

export interface ValidationPolicyInput {
  readonly bounds?: Partial<ValidationBounds> | undefined;
  /** Exact runtime-policy timeout that is semantically equivalent to omission. */
  readonly defaultTimeoutMs?: number | undefined;
}

/** Merges caller overrides over the documented defaults. */
export function resolvePolicy(input?: ValidationPolicyInput): ValidationPolicy {
  return { bounds: { ...DEFAULT_BOUNDS, ...(input?.bounds ?? {}) } };
}

export const EMPTY_REFERENCES: ReferenceDeclarations = { variables: [], secrets: [] };
