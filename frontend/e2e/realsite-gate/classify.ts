/**
 * Infrastructure-failure classification for a learn attempt (ADR-SC-007 pass rule 1, AC2).
 *
 * Precedence is strict: a terminal session errorCode other than MODEL_UNAVAILABLE is never
 * infrastructure, whatever the last model attempt's rejection_reason says. GuidedModelResponse.Reason
 * .failureCode() is the single product mapping of every availability reason (BUSY, TIMEOUT,
 * TRANSPORT_STALL/CONNECT/HTTP_429/HTTP_503/HTTP_5XX/OTHER, ...) to MODEL_UNAVAILABLE. The release
 * gate retains non-timeout infrastructure retries; a timeout cannot be retried into a counted pass.
 */

export type FailureClass = 'OK' | 'INFRA' | 'GROUNDING' | 'OTHER';

export const INFRA_ERROR_CODE = 'MODEL_UNAVAILABLE';

/** Grounding failures: they fail the test, no retry. */
export const GROUNDING_CODES: readonly string[] = [
  'UNSUPPORTED_SURFACE',
  'TARGET_DRIFT',
  'OUTCOME_UNKNOWN',
  'MISSING_SOURCE',
  'ASSERTION_FAILED',
  'BUDGET_EXCEEDED',
];

/** Availability reasons retained for historical records; TIMEOUT is a current nonretryable failure. */
export const INFRA_SUBCLASSES: readonly string[] = [
  'BUSY',
  'TIMEOUT',
  'DISABLED',
  'TRANSPORT_CREDENTIAL',
  'TRANSPORT_CONNECT',
  'TRANSPORT_HTTP_429',
  'TRANSPORT_HTTP_503',
  'TRANSPORT_HTTP_5XX',
  'TRANSPORT_OTHER',
  'TRANSPORT_STALL',
];

export interface StartRefusal {
  status: number;
  /** The problem body's code, when the body carried one. */
  problemCode: string | null;
}

export interface LearnFailureInput {
  /** Harness timing failure has precedence even over a late successful product receipt. */
  timingFailure?: string | null;
  /** True when the attempt ended in a learned session with the receipt. */
  succeeded: boolean;
  /** Terminal session errorCode from /guided-sessions/latest, null when none. */
  errorCode: string | null;
  /** The last model attempt's rejection_reason; sub-class only. */
  lastRejectionReason: string | null;
  /** Set when Run Test was refused before any session existed. */
  startRefusal: StartRefusal | null;
  sessionCreated: boolean;
}

export interface Classified {
  cls: FailureClass;
  subClass: string | null;
}

export function classifyLearn(input: LearnFailureInput): Classified {
  if (input.timingFailure != null) return { cls: 'OTHER', subClass: input.timingFailure };
  if (input.lastRejectionReason === 'TIMEOUT' || input.errorCode === 'TIMEOUT') return { cls: 'OTHER', subClass: 'TIMEOUT' };
  if (input.succeeded) return { cls: 'OK', subClass: null };
  if (!input.sessionCreated) {
    const refusal = input.startRefusal;
    if (refusal !== null && (refusal.status === 429 || refusal.status === 503) && refusal.problemCode === INFRA_ERROR_CODE) {
      return { cls: 'INFRA', subClass: `START_${refusal.status}` };
    }
    return { cls: 'OTHER', subClass: refusal === null ? 'NO_SESSION' : `START_${refusal.status}` };
  }
  if (input.errorCode === INFRA_ERROR_CODE) {
    const reason = input.lastRejectionReason;
    return { cls: 'INFRA', subClass: reason !== null && INFRA_SUBCLASSES.includes(reason) ? reason : 'UNSPECIFIED' };
  }
  if (input.errorCode !== null && GROUNDING_CODES.includes(input.errorCode)) {
    return { cls: 'GROUNDING', subClass: input.errorCode };
  }
  return { cls: 'OTHER', subClass: input.errorCode };
}

export type RetryDecision = 'DONE' | 'RETRY' | 'FAIL' | 'INFRA_EXHAUSTED';

/** What to do after the attempts so far (classes in order). At most one infra retry, learn only. */
export function nextAfter(classes: readonly FailureClass[]): RetryDecision {
  const last = classes[classes.length - 1];
  if (last === undefined) throw new Error('nextAfter needs at least one attempt');
  if (last === 'OK') return 'DONE';
  if (last !== 'INFRA') return 'FAIL';
  return classes.length === 1 ? 'RETRY' : 'INFRA_EXHAUSTED';
}
