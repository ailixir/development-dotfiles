import { createHash } from 'node:crypto';
import { allowedDomainListProblem } from '../allowedDomains.js';
import type { Observation } from '../guided/types.js';
import { DEADLINE_CEILING_MS, OBSERVATION_DEADLINE_MS } from './observationDeadline.js';
import type { ObservationConfig, ObservationExport } from './observationTypes.js';
import { OUTLINE_BYTES } from './perceive.js';

/** Schema limits.maxObservationBytes (v3 default and maximum): the canonical size cap of one observation. */
export const MAX_OBSERVATION_BYTES = 524_288;

/** canonical-v1, matching the frozen contract's non-ASCII vector. */
export function canonicalObservation(value: unknown): string {
  if (typeof value === 'string') {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw new Error('INVALID_UNICODE');
    return JSON.stringify(value);
  }
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalObservation).join(',')}]`;
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('INVALID_CONTRACT');
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${canonicalObservation(key)}:${canonicalObservation(item)}`).join(',')}}`;
}

/** A validated, defaulted observation config. Dead options of the old in-page collector (rules, role regions, controlValue grants, workLimits, node and depth limits) are gone. */
export interface ObservationOptions {
  readonly sessionId: string;
  readonly scopeHash: string;
  readonly allowedDomains: readonly string[];
  readonly knownSecrets: string[];
  readonly limits: { readonly outlineBytes: number; readonly bytes: number; readonly milliseconds: number };
}

export function observationOptions(config: ObservationConfig): ObservationOptions {
  canonicalObservation({ sessionId: config.sessionId, scopeHash: config.scopeHash, allowedDomains: [...config.allowedDomains], knownSecrets: [...config.knownSecrets] });
  const validText = (value: string): boolean => value.length > 0 && Array.from(value).length <= 256;
  if (!validText(config.sessionId) || !/^[a-f0-9]{64}$/u.test(config.scopeHash) || config.knownSecrets.length > 64 || config.knownSecrets.some(secret => secret.length > 4096)) throw new Error('INVALID_CONTRACT');
  if (allowedDomainListProblem(config.allowedDomains) !== null) throw new Error('INVALID_CONTRACT');
  const limit = (value: number | undefined, ceiling: number): number => {
    const resolved = value ?? ceiling;
    if (!Number.isInteger(resolved) || resolved < 1 || resolved > ceiling) throw new Error('INVALID_CONTRACT');
    return resolved;
  };
  return {
    sessionId: config.sessionId, scopeHash: config.scopeHash, allowedDomains: [...config.allowedDomains], knownSecrets: [...config.knownSecrets],
    limits: {
      outlineBytes: limit(config.limits?.outlineBytes, OUTLINE_BYTES),
      bytes: limit(config.limits?.bytes, MAX_OBSERVATION_BYTES),
      milliseconds: limit(config.limits?.milliseconds ?? OBSERVATION_DEADLINE_MS, DEADLINE_CEILING_MS),
    },
  };
}

export function exportObservation(observation: Observation, maxBytes: number): ObservationExport {
  const json = canonicalObservation(observation);
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > maxBytes) throw new Error('BUDGET_EXCEEDED');
  // Detach the public snapshot from local identity state. Consumers cannot mutate the hash input.
  const copy = JSON.parse(json) as Observation;
  const freeze = (value: object): void => { Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child as object); };
  freeze(copy);
  return Object.freeze({ observation: copy, json, bytes, observationHash: createHash('sha256').update(json).digest('hex') });
}
