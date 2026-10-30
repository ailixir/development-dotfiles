/**
 * The identity check of ADR-SC-007 D4 (plan D-3 step d): after a locator resolved to exactly one element, the role and
 * accessible name of that element must still equal the identity recorded at prepare. The input is the first line of
 * locator.ariaSnapshot(), whose textbox lines carry the field's current VALUE after the colon: the snapshot is parsed
 * here and ONLY {role, name} leave this function. The raw text is never logged, thrown or returned.
 */
import type { TargetIdentity } from '../guided/types.js';
import type { Locator } from './locatorSynth.js';

export interface ParsedIdentity { readonly role: string; readonly name: string | null }

/** Tiers whose locator can match a different element of the same shape after a page change. */
export const IDENTITY_TIERS: readonly string[] = ['attribute', 'filterHas', 'nth'];

/**
 * Critique 1 item C15 (extension of ADR D4): a scoped locator whose LAST step carries no name (a role step without a name,
 * or a tag step) is a unique nameless element inside a scope: the same false-pass risk, so the identity check applies.
 */
export function identityRequired(tier: string, locator: Locator): boolean {
  if (IDENTITY_TIERS.includes(tier)) return true;
  if (tier !== 'scoped') return false;
  const last = locator[locator.length - 1];
  if (!last) return false;
  return (last.by === 'role' && last.name === undefined) || last.by === 'tag';
}

const FIRST_LINE = /^- ([A-Za-z][A-Za-z0-9-]*)(?: ("(?:[^"\\]|\\.)*"))?/u;
const collapse = (text: string): string => text.replace(/\s+/gu, ' ').trim();

/** Parses the first line of an aria snapshot into {role, name}; null when it has an unexpected shape. */
export function parseAriaIdentity(snapshot: string): ParsedIdentity | null {
  if (typeof snapshot !== 'string') return null;
  const newline = snapshot.indexOf('\n');
  const first = newline === -1 ? snapshot : snapshot.slice(0, newline);
  const match = FIRST_LINE.exec(first);
  if (!match) return null;
  const role = match[1] ?? '';
  const literal = match[2];
  if (literal === undefined) return { role, name: null };
  try {
    const parsed: unknown = JSON.parse(literal);
    return typeof parsed === 'string' ? { role, name: collapse(parsed) } : null;
  } catch {
    return null;
  }
}

/** Role equal; name equal after whitespace collapse unless the recorded name is null (not checked). */
export function identityMatches(identity: TargetIdentity, parsed: ParsedIdentity | null): boolean {
  if (parsed === null) return false;
  if (identity.role !== parsed.role) return false;
  if (identity.name === null) return true;
  return parsed.name !== null && collapse(identity.name) === parsed.name;
}
