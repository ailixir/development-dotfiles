import type { InvocationControl } from '../executor/observedReplay.js';
import type { Action, BridgePressInheritance, BridgeAssertSourceBinding, Observation, ResolvedTarget } from '../guided/types.js';
import type { ActionProfileName } from './actionBudget.js';

/**
 * The runner side of ADR-SC-007: what an observation session exposes to the guided runtime and to the replay adapter.
 * The wire shapes (Observation, ResolvedTarget, Locator, TargetIdentity) are generated from the closed v3 contracts
 * (src/guided/types.ts) and are referenced by name; nothing here copies a schema.
 */

/** Trusted application-level read grant: visible text in the application region of one whitelist entry. */
export interface ObservationReadGrant {
  policyRuleId: string;
  /** The whitelist entry this grant belongs to; it applies to pages whose `location.hostname` falls under it. */
  domain: string;
  region: { kind: 'application' };
  visibleText: { classification: 'permittedBusinessData' };
}
export interface ObservationReadProfile {
  policyRuleId: string;
  allowStructuralDiscovery: boolean;
  /** Positive grants only, from the runner's constant read profile (`observationReadProfile`), never a mounted file. */
  readGrants?: ObservationReadGrant[];
}

/** The projection focus of an observation: the step text and target intents the outline is keyed by (ADR D1). */
export interface ObservationFocus { stepText: string; targetIntents: readonly string[] }

export interface ObservationConfig {
  sessionId: string; scopeHash: string; allowedDomains: readonly string[]; knownSecrets: readonly string[];
  readProfile?: ObservationReadProfile;
  /** `outlineBytes` default WI-3 limits.maxOutlineBytes; `bytes` the canonical observation cap; `milliseconds` the collection deadline (default OBSERVATION_DEADLINE_MS). */
  limits?: { outlineBytes?: number; bytes?: number; milliseconds?: number };
}

export interface ObservationExport {
  readonly observation: Observation; readonly json: string; readonly bytes: number;
  readonly observationHash: string;
}

export interface PasswordTarget { kind: 'passwordControl'; documentId: string; generation: number }

/** The closed reasons prepareTarget throws (as a ClosedActionError with this code). */
export type PrepareReason = 'TARGET_CHANGED' | 'OPTION_NOT_PRESENT' | 'NO_DURABLE_LOCATOR' | 'READ_NOT_ALLOWED';

export interface InvocationIdentity {
  admissionId: string; requestDigest: string; operationHash: string;
  coordinate: Action['coordinate']; authority: string;
}
export interface PrepareTargetRequest {
  assertSourceBinding?: BridgeAssertSourceBinding;
  pressInheritance?: BridgePressInheritance | null;
  continuityAuthority?: string;

  ref: string; documentId: string; generation: number; origin: string;
  operation: Action['operation'];
  /** The authored literal of a selectOption (G1 applies to it); null for every other operation and for binding-sourced values. */
  authoredLiteral: string | null;
  /** Prefix replay: the learned target. It is not synthesized; it is re-resolved, agreed with the gated fact (a disagreeing identity is NO_DURABLE_LOCATOR, never normalised), and bound like a synthesized one. */
  frozen?: ResolvedTarget;
}

export interface ResolveTargetRequest {
  resolved: ResolvedTarget; origin: string; operation: Action['operation'];
  /** The grant id a learned read was admitted under; null for every other operation. */
  readRuleId: string | null;
}
export type ResolveTargetResult =
  | { kind: 'READY' }
  | { kind: 'ABSENT' }
  | { kind: 'REFUSED'; code: 'TARGET_DRIFT' | 'READ_REFUSED' | 'POLICY_REFUSED' };

/** The value is confined to the guided worker; never expose it in IPC or diagnostics. */
export interface TargetInvocation {
  preparationId?: string;
  assertSourceBinding?: BridgeAssertSourceBinding;
  invocationIdentity?: InvocationIdentity;
  pressInheritance?: BridgePressInheritance | null;
  resolved: ResolvedTarget;
  operation: Action['operation'];
  resolvedValue: string | null;
  origin: string;
  maxValueBytes: number;
  readRuleId: string | null;
  profile: ActionProfileName;
  /** Learn: the observation identity the prepare binding must belong to. */
  expect?: { documentId: string; generation: number };
}
export interface TargetInvocationResult { value?: string; assertionPassed?: boolean }

export interface ObservationSession {
  /** `settle` keeps the observation only once the page stayed unchanged for a short while (learning); replay observes once, as is. `deadlineMs` lowers the collection deadline (never raises it). */
  observe(maxBytes?: number, settle?: boolean, focus?: ObservationFocus, deadlineMs?: number): Promise<ObservationExport>;
  /** Ref -> synthesized, verified, agreed ResolvedTarget; records the verified-element binding of plan D-16. Throws a ClosedActionError(PrepareReason). */
  prepareTarget(request: PrepareTargetRequest): Promise<ResolvedTarget>;
  /** Replay / prefix: the frozen locator through the public API; no observation is needed. */
  resolveTarget(request: ResolveTargetRequest): Promise<ResolveTargetResult>;
  /** Prefix replay: the ref of the held observation that names this target, or null when the held perception does not show it (the runtime answers WAIT). */
  refForTarget(resolved: ResolvedTarget): Promise<string | null>;
  /** The one executor for learn and replay (plan D-3). */
  invoke(request: TargetInvocation, control?: InvocationControl): Promise<TargetInvocationResult>;
  preparePassword?(target: PasswordTarget, origin: string): Promise<void>;
  fillPassword?(target: PasswordTarget, origin: string, allowedOrigins: readonly string[], value: string, control?: InvocationControl): Promise<void>;
  withhold?(values: readonly string[]): Promise<void>;
  navigate?(target: { documentId: string; generation: number }, origin: string, destination: string): Promise<void>;
  assertPage?(target: { documentId: string; generation: number }, origin: string, predicate: 'url' | 'title', expected: string): Promise<boolean>;
  pageMatches?(target: { documentId: string; generation: number }, origin: string): Promise<boolean>;
  /** Promotes only the exact invocation that the authenticated successful callback committed. */
  commitInvocation?(identity: InvocationIdentity): void;
  /** Successful callback/replay handoff, using the pending exact invoked read, never value attribution. */
  commitRead?(bindingId: string, producer?: { identity: InvocationIdentity; preparationId: string }): void;
  revokeReads?(): void;
  clearContinuity?(): void;
  dispose(): Promise<void>;
}
