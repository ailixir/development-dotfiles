package com.citi.put.checks.studio.internal;

/**
 * Refusal codes for the two internal callback routes.
 *
 * <p>These are transport-level answers to the runner and are deliberately <b>not</b> {@code
 * ExecutionErrorCode} values: that enumeration is the API's terminal execution vocabulary, assigned
 * by the dispatcher and the reapers, and the two sets must stay disjoint (AC-16).
 */
public final class InternalCallbackCodes {

  /** The execution id is not one this API knows. Answered 409, never 404 (AC-17). */
  public static final String EXECUTION_UNKNOWN = "EXECUTION_UNKNOWN";

  /** A newer attempt supersedes the one this call carries. */
  public static final String ATTEMPT_SUPERSEDED = "ATTEMPT_SUPERSEDED";

  /** The attempt is already owned by a different (runnerInstanceId, admissionId). */
  public static final String ADMISSION_OWNED = "ADMISSION_OWNED";

  /** The row passed its pending deadline before admission arrived. */
  public static final String ADMISSION_EXPIRED = "ADMISSION_EXPIRED";

  /** The execution is already settled; a late report can never rewrite finalized history. */
  public static final String EXECUTION_SETTLED = "EXECUTION_SETTLED";

  /** The report's sequence is lower than the one already applied. */
  public static final String SEQUENCE_REGRESSED = "SEQUENCE_REGRESSED";

  /** The report does not describe a transition the current state permits. */
  public static final String TRANSITION_REJECTED = "TRANSITION_REJECTED";

  /** The body is over the configured callback bound (§5.4). Answered 413; changes nothing. */
  public static final String REPORT_TOO_LARGE = "REPORT_TOO_LARGE";

  /** The body is not a report this API will act on. */
  public static final String INVALID_REPORT = "INVALID_REPORT";

  private InternalCallbackCodes() {}
}
