/**
 * Runtime compatibility of a confirmed artifact (architecture §4.6, story 10.3 AC-7/AC-8).
 *
 * §4.6: "Runtime upgrades revalidate compatibility and run a fixture corpus before release …
 * Do not silently reinterpret it." A confirmed revision carries the versions it was validated
 * under; before the runner touches a browser it compares them with the versions it is actually
 * running and refuses the mismatch instead of reinterpreting the same source under a different
 * language policy, reference corpus or executor contract.
 *
 * This module is pure: it compares two records and returns a verdict. It launches nothing and
 * calls no adapter — that is the point of checking before execution rather than during it.
 */

import {
  EXECUTOR_VERSION,
  SYNTAX_REFERENCE_VERSION,
  VALIDATOR_SCHEMA_VERSION,
} from '../versions.js';
import { currentRuntimeVersions } from './runtime-versions.js';

/** The documented error code for an artifact that cannot run on this runtime (AC-7). */
export const RUNTIME_INCOMPATIBLE = 'RUNTIME_INCOMPATIBLE';

/** Versions recorded on a confirmed revision when its artifact was validated (§4.6, §8.4). */
export interface ArtifactProvenance {
  /** `VALIDATOR_SCHEMA_VERSION` at validation time: the accepted language + its parser. */
  readonly validatorSchema: string;
  /** `EXECUTOR_VERSION` at validation time: the trusted operation contract. */
  readonly executor: string;
  /** The exact `playwright` package version the artifact was validated against. */
  readonly playwright: string;
  /** `SYNTAX_REFERENCE_VERSION`: the reference corpus the proposal was made against. */
  readonly syntaxReference: string;
}

/** The same four fields, read from the running `runtime-versions.json`. */
export type RuntimeVersions = ArtifactProvenance;

/**
 * How each field is compared.
 *
 * - `exact` — any difference is incompatible. Used where a difference changes what the *same*
 *   source means: the accepted-language schema (and its parser) and the syntax reference the
 *   artifact was proposed against.
 * - `backwardCompatibleMinor` — the documented compatible range: same major, and the running
 *   `minor.patch` at or above the recorded one. A higher major is a breaking change to the
 *   operation contract; an older runtime than the artifact was validated on may lack operations
 *   the artifact uses, so downgrades are incompatible too.
 */
export type CompatibilityRule = 'exact' | 'backwardCompatibleMinor';

/**
 * The rule table — the documented decision of story 10.3.
 *
 * Playwright starts at `exact`: the browser image is pinned to the package version (ADR-001 §4.2)
 * and nothing has yet measured which Playwright deltas leave the accepted language's behaviour
 * unchanged. Relax it to a range only with evidence from the fixture tier, in the same PR that
 * records that evidence (see `README.md` § "Runtime upgrade procedure").
 */
export const COMPATIBILITY_RULES: Readonly<Record<keyof ArtifactProvenance, CompatibilityRule>> = {
  validatorSchema: 'exact',
  syntaxReference: 'exact',
  playwright: 'exact',
  executor: 'backwardCompatibleMinor',
};

/** The fields compared, in the order they are reported. */
export const COMPATIBILITY_FIELDS: readonly (keyof ArtifactProvenance)[] = [
  'validatorSchema',
  'syntaxReference',
  'playwright',
  'executor',
];

export interface FieldMismatch {
  readonly field: keyof ArtifactProvenance;
  /** The version recorded on the artifact. */
  readonly recorded: string;
  /** The version this runner is running. */
  readonly running: string;
  readonly rule: CompatibilityRule;
}

export interface CompatibilityResult {
  readonly ok: boolean;
  /** Human-readable explanation, or `null` when compatible. Never contains artifact content. */
  readonly reason: string | null;
  /** `RUNTIME_INCOMPATIBLE` when `ok` is false, `null` otherwise. */
  readonly code: typeof RUNTIME_INCOMPATIBLE | null;
  readonly mismatches: readonly FieldMismatch[];
}

/** The versions this build of the runner is running, minus the Playwright pin. */
export const RUNNER_VERSIONS = {
  validatorSchema: VALIDATOR_SCHEMA_VERSION,
  syntaxReference: SYNTAX_REFERENCE_VERSION,
  executor: EXECUTOR_VERSION,
} as const;

interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

function parseSemver(value: string): Semver | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (match === null) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function satisfies(rule: CompatibilityRule, recorded: string, running: string): boolean {
  if (recorded === running) return true;
  switch (rule) {
    case 'exact':
      return false;
    case 'backwardCompatibleMinor': {
      const from = parseSemver(recorded);
      const to = parseSemver(running);
      // An unparseable version is never assumed compatible: fail closed.
      if (from === null || to === null) return false;
      if (from.major !== to.major) return false;
      if (to.minor !== from.minor) return to.minor > from.minor;
      return to.patch >= from.patch;
    }
  }
}

/**
 * Compares an artifact's recorded provenance with the runtime actually running (AC-7).
 *
 * Callers MUST check this before any adapter call; an incompatible result carries the code
 * `RUNTIME_INCOMPATIBLE` and the differing fields, which the backend maps to
 * `409 RUNTIME_INCOMPATIBLE` on execute (contract in 10.1, mapping in 10.8).
 */
export function isCompatible(
  provenance: ArtifactProvenance,
  runtime: RuntimeVersions = currentRuntimeVersions(),
): CompatibilityResult {
  const mismatches: FieldMismatch[] = [];

  for (const field of COMPATIBILITY_FIELDS) {
    const rule = COMPATIBILITY_RULES[field];
    const recorded = provenance[field];
    const running = runtime[field];
    if (!satisfies(rule, recorded, running)) {
      mismatches.push({ field, recorded, running, rule });
    }
  }

  if (mismatches.length === 0) {
    return { ok: true, reason: null, code: null, mismatches: [] };
  }

  const detail = mismatches
    .map(
      (mismatch) =>
        `${mismatch.field}: artifact ${mismatch.recorded} vs runtime ${mismatch.running} ` +
        `(${mismatch.rule})`,
    )
    .join('; ');

  return {
    ok: false,
    reason:
      'This revision was validated on a different runtime and will not be reinterpreted: ' +
      `${detail}.`,
    code: RUNTIME_INCOMPATIBLE,
    mismatches,
  };
}

/** Thrown by `assertCompatible`. Carries the code and the differing fields, never artifact text. */
export class RuntimeIncompatibleError extends Error {
  readonly code = RUNTIME_INCOMPATIBLE;
  readonly mismatches: readonly FieldMismatch[];

  constructor(result: CompatibilityResult) {
    super(result.reason ?? RUNTIME_INCOMPATIBLE);
    this.name = 'RuntimeIncompatibleError';
    this.mismatches = result.mismatches;
  }
}

/**
 * Guard for callers: throws `RuntimeIncompatibleError` when the artifact cannot run here.
 *
 * Placed before execution so that an incompatible artifact produces no adapter call at all
 * (AC-7). Server-side enforcement remains authoritative (architecture §4.6, story 10.8).
 */
export function assertCompatible(
  provenance: ArtifactProvenance,
  runtime: RuntimeVersions = currentRuntimeVersions(),
): void {
  const result = isCompatible(provenance, runtime);
  if (!result.ok) throw new RuntimeIncompatibleError(result);
}
