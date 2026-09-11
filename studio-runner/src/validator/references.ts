import type { ReferenceDeclarations, ValidationBounds } from './bounds.js';
import type { DiagnosticCollector } from './diagnostics.js';
import type { ArgumentKind } from './language.js';
import { SECRET_PERMITTED_ARGUMENT_KINDS } from './language.js';

/**
 * Reference rules (AC-9, architecture §4.5 "References", §9.2).
 *
 * A reference is a `vars.get('NAME')` or `vars.secret('ID')` call. Three independent checks
 * apply: the name must be declared for this artifact, a secret may only appear in an approved
 * argument position, and the set of references used by a step must equal the set of reference
 * tokens the corresponding source line mentions.
 *
 * The validator deliberately does not claim to detect secret *literals*: an inline credential
 * that never goes through `vars.secret` is invisible here and is the backend's concern (10.8).
 */

export type ReferenceKind = 'variable' | 'secret';

export interface ReferenceUsage {
  readonly kind: ReferenceKind;
  readonly name: string;
  readonly argumentKind: ArgumentKind;
}

/** Token form used in source lines (architecture §4.3): `<secret ID>` and `<var NAME>`. */
const SECRET_TOKEN = /<secret\s+([A-Za-z0-9_.-]{1,64})>/gu;
const VARIABLE_TOKEN = /<var\s+([A-Za-z0-9_.-]{1,64})>/gu;

export interface SourceTokens {
  readonly variables: ReadonlySet<string>;
  readonly secrets: ReadonlySet<string>;
}

function collect(pattern: RegExp, text: string): Set<string> {
  const found = new Set<string>();
  // A fresh RegExp per call keeps `lastIndex` state out of module scope.
  const scanner = new RegExp(pattern.source, pattern.flags);
  let match = scanner.exec(text);
  while (match !== null) {
    const name = match[1];
    if (name !== undefined) found.add(name);
    match = scanner.exec(text);
  }
  return found;
}

/** Extracts the reference tokens a source line mentions. */
export function extractSourceTokens(originalText: string): SourceTokens {
  return {
    variables: collect(VARIABLE_TOKEN, originalText),
    secrets: collect(SECRET_TOKEN, originalText),
  };
}

/** Records references as the argument walker meets them, so positions can be checked. */
export class ReferenceRecorder {
  readonly #usages: ReferenceUsage[] = [];

  record(usage: ReferenceUsage): void {
    this.#usages.push(usage);
  }

  usages(): readonly ReferenceUsage[] {
    return this.#usages;
  }
}

/** Checks the name of a reference at the point of use. Returns `false` when it is rejected. */
export function checkReferenceUse(
  usage: ReferenceUsage,
  declarations: ReferenceDeclarations,
  bounds: ValidationBounds,
  collector: DiagnosticCollector,
  excerpt: string,
): boolean {
  let ok = true;

  if (usage.name.length === 0 || usage.name.length > bounds.maxReferenceNameLength) {
    collector.add({
      code: 'REFERENCE_ARGUMENT_INVALID',
      message: `Reference name must be 1..${String(bounds.maxReferenceNameLength)} characters.`,
      excerpt,
    });
    return false;
  }

  const declared =
    usage.kind === 'secret' ? declarations.secrets : declarations.variables;
  if (!declared.includes(usage.name)) {
    ok = false;
    collector.add({
      code: 'REFERENCE_UNDECLARED',
      message: `${usage.kind === 'secret' ? 'Secret' : 'Variable'} reference "${usage.name}" is not declared for this artifact.`,
      excerpt,
    });
  }

  if (usage.kind === 'secret' && !SECRET_PERMITTED_ARGUMENT_KINDS.includes(usage.argumentKind)) {
    ok = false;
    collector.add({
      code: 'REFERENCE_POSITION_NOT_PERMITTED',
      message:
        'A secret reference is only accepted as the value argument of fill(); it is rejected in URLs, selectors, assertion arguments, key arguments and option values.',
      excerpt,
    });
  }

  return ok;
}

/**
 * Cross-checks the references a step used against the tokens its source line mentions (AC-9).
 * Both directions are errors: a token the code ignored, and a reference the line never asked for.
 */
export function checkStepReferenceAlignment(
  usages: readonly ReferenceUsage[],
  tokens: SourceTokens,
  collector: DiagnosticCollector,
): boolean {
  let ok = true;
  const usedVariables = new Set<string>();
  const usedSecrets = new Set<string>();
  for (const usage of usages) {
    if (usage.kind === 'secret') usedSecrets.add(usage.name);
    else usedVariables.add(usage.name);
  }

  for (const name of tokens.secrets) {
    if (!usedSecrets.has(name)) {
      ok = false;
      collector.add({
        code: 'REFERENCE_MISSING',
        message: `The source line mentions <secret ${name}> but the step code does not use vars.secret('${name}').`,
      });
    }
  }
  for (const name of tokens.variables) {
    if (!usedVariables.has(name)) {
      ok = false;
      collector.add({
        code: 'REFERENCE_MISSING',
        message: `The source line mentions <var ${name}> but the step code does not use vars.get('${name}').`,
      });
    }
  }
  for (const name of usedSecrets) {
    if (!tokens.secrets.has(name)) {
      ok = false;
      collector.add({
        code: 'REFERENCE_EXTRA',
        message: `The step code uses vars.secret('${name}') but the source line does not mention <secret ${name}>.`,
      });
    }
  }
  for (const name of usedVariables) {
    if (!tokens.variables.has(name)) {
      ok = false;
      collector.add({
        code: 'REFERENCE_EXTRA',
        message: `The step code uses vars.get('${name}') but the source line does not mention <var ${name}>.`,
      });
    }
  }

  return ok;
}
