/**
 * The closed error boundary (ADR-SC-007 WI-4, plan D-15; critique 1 item B1).
 *
 * Playwright errors are not data-free: a TimeoutError call log carries the outerHTML, attribute values, page-resident
 * field values and typed literals of the page. Nothing of such an error may leave the runner: every call site that
 * touches Playwright or CDP throws only a `ClosedActionError` (name 'ClosedActionError', message === code, no cause),
 * or one of the runner's own already-closed classes.
 *
 * This module is Playwright-free. It is the ONLY place that classifies an incoming error by its name or by a fixed
 * phrase test; the text of the incoming error is read only by those tests and is never copied anywhere.
 */

export const CLOSED_ACTION_CODES = [
  'TARGET_CHANGED', 'POLICY_DENIED', 'PASSWORD_CONTROL_READ_REFUSED', 'UNKNOWN_OUTCOME', 'CONTEXT_LOST', 'OBSERVATION_UNAVAILABLE',
  'OBSERVATION_DEADLINE', 'SCOPE_DENIED', 'INVALID_UNICODE', 'STALE_OBSERVATION', 'BUDGET_EXCEEDED', 'OPTION_NOT_PRESENT',
  'NO_DURABLE_LOCATOR', 'READ_NOT_ALLOWED', 'READ_REFUSED',
  // The password path keeps its existing closed vocabulary.
  'PASSWORD_TARGET_ABSENT', 'PASSWORD_TARGET_AMBIGUOUS', 'PASSWORD_FORM_ACTION_NOT_ALLOWED',
] as const;
export type ClosedActionCode = (typeof CLOSED_ACTION_CODES)[number];

/** Replay-side reason vocabulary (ObservedRefusal codes) that may also appear as a closed reason. */
export const CLOSED_REPLAY_REASONS = ['TARGET_DRIFT', 'READ_REFUSED', 'POLICY_REFUSED', 'OUTCOME_UNKNOWN', 'TIMEOUT', 'CANCELLED', 'INVALID_CONTRACT'] as const;

const CLOSED_SET: ReadonlySet<string> = new Set(CLOSED_ACTION_CODES);
const REPLAY_SET: ReadonlySet<string> = new Set([...CLOSED_ACTION_CODES, ...CLOSED_REPLAY_REASONS]);

export type FencePhase = 'preFence' | 'postFence';

export class ClosedActionError extends Error {
  readonly code: ClosedActionCode;
  constructor(code: ClosedActionCode) {
    super(code);
    this.name = 'ClosedActionError';
    this.code = code;
  }
}

/** Runner classes whose message is already a closed code. They pass the boundary unchanged. */
const OWN_CLOSED_CLASSES: ReadonlySet<string> = new Set(['ClosedActionError', 'ObservedRefusal', 'OriginNotAllowed', 'PasswordNoEffect', 'PasswordNoEffectError']);

const CLOSED_TARGET_PHRASES = ['Target page, context or browser has been closed', 'Target closed', 'Browser has been closed', 'browser has been closed', 'Session closed', 'Connection closed', 'Execution context was destroyed'];

/** Only loss of a previous private observation handle permits starting a fresh document identity. No incoming text is returned. */
export function detachedObservationState(error: unknown): boolean {
  return error instanceof Error && ['Could not find object with given id', 'Cannot find object with given id', 'Cannot find context with specified id', 'Cannot find execution context with given id', 'Execution context was destroyed']
    .some(phrase => error.message.includes(phrase));
}

/** The protocol said the document an observation was working on went away (a navigation committed): the text is only tested, never copied. */
export function pageLeftUnderObservation(error: unknown): boolean {
  return detachedObservationState(error) || (error instanceof Error && error.message.includes('Inspected target navigated or closed'));
}

const isCode = (value: string): value is ClosedActionCode => CLOSED_SET.has(value);

/**
 * Maps any thrown value to a closed error. A runner-owned closed error passes as itself; a plain Error whose message is
 * exactly one closed code is that code; a TimeoutError (by name) is TARGET_CHANGED before the fence and UNKNOWN_OUTCOME
 * after it; a closed target or browser is CONTEXT_LOST; everything else is TARGET_CHANGED before the fence and
 * UNKNOWN_OUTCOME after it. The incoming text is never copied.
 */
export function closePlaywrightError(error: unknown, phase: FencePhase): Error {
  if (typeof error === 'object' && error !== null) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string' && OWN_CLOSED_CLASSES.has(name)) return error as Error;
    if (error instanceof Error) {
      if (name === 'Error' && isCode(error.message)) return new ClosedActionError(error.message);
      if (name === 'TimeoutError') return new ClosedActionError(phase === 'preFence' ? 'TARGET_CHANGED' : 'UNKNOWN_OUTCOME');
      const text = error.message;
      if (typeof text === 'string' && CLOSED_TARGET_PHRASES.some(phrase => text.includes(phrase))) return new ClosedActionError('CONTEXT_LOST');
    }
  }
  return new ClosedActionError(phase === 'preFence' ? 'TARGET_CHANGED' : 'UNKNOWN_OUTCOME');
}

/** The reason an ObservedRefusal may carry: a closed code, or OUTCOME_UNKNOWN for anything else. Never the message. */
export function closedReason(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && REPLAY_SET.has(code)) return code;
    if (error instanceof Error && error.name === 'Error' && REPLAY_SET.has(error.message)) return error.message;
  }
  return 'OUTCOME_UNKNOWN';
}

/** The closed code that ended something, for a diagnostic line: a runner closed error, or a plain Error whose message is in the closed vocabulary; 'UNKNOWN' otherwise. */
export function closedCause(error: unknown): string {
  if (error instanceof ClosedActionError) return error.code;
  return error instanceof Error && error.name === 'Error' && REPLAY_SET.has(error.message) ? error.message : 'UNKNOWN';
}

/** Runs `work` and rethrows only closed errors. */
export async function closed<T>(phase: () => FencePhase, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw closePlaywrightError(error, phase());
  }
}

/**
 * Wraps a page-level step (wait, blank navigation) whose raw Playwright/CDP failures must not reach a result. A plain Error whose
 * message is already a closed code or replay reason (the step's own refusals) passes unchanged; the control's own cancellation
 * errors pass; everything else is closed after the step began: a closed target is CONTEXT_LOST, anything else UNKNOWN_OUTCOME.
 */
export async function closedPageStep<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Error && error.name === 'Error' && (isCode(error.message) || REPLAY_SET.has(error.message))) throw error;
    throw closePlaywrightError(error, 'postFence');
  }
}

/** The codes an observation may end with besides the deadline and unavailability; each passes as itself when a plain Error carries it. */
const OBSERVATION_PASSTHROUGH: ReadonlySet<string> = new Set(['INVALID_UNICODE', 'SCOPE_DENIED', 'BUDGET_EXCEEDED', 'STALE_OBSERVATION', 'CONTEXT_LOST']);

/**
 * Maps whatever an observation threw to a closed error (plan D-1 failure mapping). A runner-owned closed error passes as itself.
 * PRIVATE_INVENTORY_LIMIT (a page the private inventory cannot hold) is the deadline refusal. WI-2's plain PERCEPTION_UNAVAILABLE
 * (work-budget exhaustion, but also other causes) is reported as `perceptionUnavailable` so the caller can decide, with a probe of
 * the engine, between the deadline and unavailability; the returned error is OBSERVATION_UNAVAILABLE until the caller decides.
 * Everything else, a dead CDP included, is OBSERVATION_UNAVAILABLE. The incoming text is never copied.
 */
export function closeObservationError(error: unknown): { error: Error; perceptionUnavailable: boolean } {
  if (typeof error === 'object' && error !== null) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string' && OWN_CLOSED_CLASSES.has(name)) return { error: error as Error, perceptionUnavailable: false };
    if (error instanceof Error && name === 'Error') {
      if (error.message === 'PRIVATE_INVENTORY_LIMIT') return { error: new ClosedActionError('OBSERVATION_DEADLINE'), perceptionUnavailable: false };
      if (OBSERVATION_PASSTHROUGH.has(error.message)) return { error: new ClosedActionError(error.message as ClosedActionCode), perceptionUnavailable: false };
      if (error.message === 'PERCEPTION_UNAVAILABLE') return { error: new ClosedActionError('OBSERVATION_UNAVAILABLE'), perceptionUnavailable: true };
    }
  }
  return { error: new ClosedActionError('OBSERVATION_UNAVAILABLE'), perceptionUnavailable: false };
}
