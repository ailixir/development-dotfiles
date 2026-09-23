import type { SourceTokens } from './references.js';

/**
 * Structural reference policy (ADR-SC-003).
 *
 * The backend derives it from saved authoring data, never from English: `required` is the
 * `<var>`/`<secret>` tokens of a step plus the references its structured context selects, and
 * `allowed` adds the contextual defaults the step may fall back on. The validator enforces it in
 * place of the source-token rule: a `required` reference the code ignores is `REFERENCE_MISSING`,
 * and a reference outside `allowed` is `REFERENCE_EXTRA`.
 */
export const REFERENCE_POLICY_VERSION = 2;

export interface StepReferencePolicy {
  readonly required: SourceTokens;
  readonly allowed: SourceTokens;
}

export type ReferencePolicyResult =
  | { readonly ok: true; readonly steps: readonly StepReferencePolicy[] }
  | { readonly ok: false; readonly path?: string };

const DOCUMENT_KEYS = new Set(['version', 'steps']);
const STEP_KEYS = new Set(['stepIndex', 'required', 'allowed']);
const SET_KEYS = new Set(['variables', 'secrets']);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function closed(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  const present = Object.keys(value);
  return present.length === keys.size && present.every((key) => keys.has(key));
}

function names(value: unknown, maxNameLength: number): Set<string> | null {
  if (!Array.isArray(value)) return null;
  const found = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || item.length > maxNameLength) return null;
    found.add(item);
  }
  return found;
}

function referenceSet(value: unknown, maxNameLength: number): SourceTokens | null {
  if (!record(value) || !closed(value, SET_KEYS)) return null;
  const variables = names(value.variables, maxNameLength);
  const secrets = names(value.secrets, maxNameLength);
  return variables === null || secrets === null ? null : { variables, secrets };
}

function contains(outer: ReadonlySet<string>, inner: ReadonlySet<string>): boolean {
  for (const name of inner) if (!outer.has(name)) return false;
  return true;
}

/** Closed, bounded policy envelope: one entry per source line, and `allowed` ⊇ `required`. */
export function parseReferencePolicy(
  value: unknown,
  stepCount: number,
  maxBytes: number,
  maxNameLength: number,
): ReferencePolicyResult {
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return { ok: false };
  }
  if (bytes > maxBytes) return { ok: false };
  if (!record(value) || !closed(value, DOCUMENT_KEYS) || value.version !== REFERENCE_POLICY_VERSION) {
    return { ok: false };
  }
  if (!Array.isArray(value.steps) || value.steps.length !== stepCount) return { ok: false, path: '$.steps' };
  const steps: StepReferencePolicy[] = [];
  for (let index = 0; index < value.steps.length; index += 1) {
    const step: unknown = value.steps[index];
    const path = `$.steps[${String(index)}]`;
    if (!record(step) || !closed(step, STEP_KEYS) || step.stepIndex !== index) return { ok: false, path };
    const required = referenceSet(step.required, maxNameLength);
    const allowed = referenceSet(step.allowed, maxNameLength);
    if (required === null || allowed === null
      || !contains(allowed.variables, required.variables)
      || !contains(allowed.secrets, required.secrets)) {
      return { ok: false, path };
    }
    steps.push({ required, allowed });
  }
  return { ok: true, steps };
}
