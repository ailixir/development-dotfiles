import type { InvocationControl } from '../executor/observedReplay.js';
import type { Observation } from '../guided/types.js';

/**
 * The runner side of ADR-SC-007: what an observation session exposes to the guided runtime and to the replay adapter.
 * The wire shapes (Observation, ResolvedTarget, Locator, TargetIdentity) are generated from the closed v3 contracts
 * (src/guided/types.ts) and are referenced by name; nothing here copies a schema.
 */

/** The projection focus of an observation: the step text and target intents the outline is keyed by (ADR D1). */
export interface ObservationFocus { stepText: string; targetIntents: readonly string[] }

export interface ObservationConfig {
  sessionId: string; scopeHash: string; allowedDomains: readonly string[]; knownSecrets: readonly string[];
  /** `outlineBytes` default WI-3 limits.maxOutlineBytes; `bytes` the canonical observation cap; `milliseconds` the collection deadline (default OBSERVATION_DEADLINE_MS). */
  limits?: { outlineBytes?: number; bytes?: number; milliseconds?: number };
}

export interface ObservationExport {
  readonly observation: Observation; readonly json: string; readonly bytes: number;
  readonly observationHash: string;
}

export interface PasswordTarget { kind: 'passwordControl'; documentId: string; generation: number }

export interface ObservationSession {
  /** `settle` keeps the observation only once the page stayed unchanged for a short while (learning); replay observes once, as is. `deadlineMs` lowers the collection deadline (never raises it). */
  observe(maxBytes?: number, settle?: boolean, focus?: ObservationFocus, deadlineMs?: number): Promise<ObservationExport>;
  preparePassword?(target: PasswordTarget, origin: string): Promise<void>;
  fillPassword?(target: PasswordTarget, origin: string, allowedOrigins: readonly string[], value: string, control?: InvocationControl): Promise<void>;
  withhold?(values: readonly string[]): Promise<void>;
  /** A value a step captured: it is masked in every later observation, like any value read from the page. */
  commitCapture(value: string): void;
  /** Step code ran: the held observation, and with it every pre-code stamp, is no longer usable. The next observe() recertifies. */
  invalidate(): void;
  /** The held observation still describes this document: no navigation since, same document identity and generation, same page origin. Mutations do not matter. */
  documentCurrent(target: { documentId: string; generation: number }, origin: string): boolean;
  /** Counts the main frame's new documents (a navigation that is not a history change); E8's secret-bearing window ends when it changes. */
  documentEpoch(): number;
  dispose(): Promise<void>;
}
