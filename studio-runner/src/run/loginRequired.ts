import type { Observation } from '../guided/types.js';

/**
 * Trusted structural signature, never a text heuristic or a new failure trigger. A password control is present and at least one fact has
 * the role button. This NARROWS the old signature (which also counted any visible actionable input) and equals the Java
 * LoginRequiredSignature that WI-3 ports (visible / actionable are not in the facts).
 */
export function loginRequiredSignature(observation: { readonly coverage: Pick<Observation['coverage'], 'passwordControls'>; readonly facts: Readonly<Record<string, { readonly role: string }>> }): boolean {
  return observation.coverage.passwordControls >= 1 && Object.values(observation.facts).some(fact => fact.role === 'button');
}
