package com.citi.put.checks.studio.dto;

import java.util.Set;

/**
 * Terminal error codes carried next to {@code status = ERROR} (Architecture §5.4, §8.2).
 *
 * <p><b>Every value here is assigned by the API</b> — by its dispatcher or by its reapers — and
 * never by the runner. ADR-002 §6.1 leaves the runner's {@code outcome.errorCode} an open string
 * for exactly that reason and records the two sets as disjoint. {@link #values()} exists so that a
 * disjointness test reads this enumeration rather than a hardcoded copy of it that drifts.
 *
 * <p>A parent-enforced total timeout is {@code ERROR / TIMEOUT}. A step locator or assertion
 * timeout is not: that is a step {@code FAIL} and an execution {@code FAILED}.
 *
 * <p>{@link #AUTHORIZATION_REVOKED} and {@link #REFERENCE_UNAVAILABLE} were ratified by @po on
 * 2026-09-11 for story 10.7 AC-13a. §5.1.3 demands "a terminal ERROR with an explicit code" for a
 * revoked permission and a vanished reference at dispatch and names neither, so a name had to be
 * chosen. Each names the <em>condition the dispatcher actually observed</em> rather than its
 * consequence: {@code DISPATCH_FAILED} was available and is wrong, because it says the send failed
 * when in fact the send never happened.
 *
 * <p>{@code components.schemas.ExecutionErrorCode} in {@code docs/specs/studio/openapi.yaml}
 * declares the same set; {@code ErrorCodeVocabularyTest} compares it, this class and the V20 CHECK.
 *
 * <p><b>The one value a runner also names.</b> {@link #CANCELLED} joins {@link #TIMEOUT} as a value
 * the runner's open {@code outcome.errorCode} can carry. As with {@code TIMEOUT} the API assigns
 * its own copy rather than copying the runner's, and only where it can name the cause: a cancel
 * recorded on the ledger (ADR-002 §29).
 */
public final class ExecutionErrorCode {

  public static final String TIMEOUT = "TIMEOUT";
  public static final String DISPATCH_FAILED = "DISPATCH_FAILED";
  public static final String DISPATCH_UNKNOWN = "DISPATCH_UNKNOWN";
  public static final String START_TIMEOUT = "START_TIMEOUT";
  public static final String STALE = "STALE";
  public static final String DISPATCH_DISABLED = "DISPATCH_DISABLED";

  /** The dispatcher's recheck found the caller's CSI permission revoked (AC-13a, §5.1.3). */
  public static final String AUTHORIZATION_REVOKED = "AUTHORIZATION_REVOKED";

  /** A declared reference that preflighted at acceptance no longer resolves (AC-13a, §5.1.3). */
  public static final String REFERENCE_UNAVAILABLE = "REFERENCE_UNAVAILABLE";

  /**
   * A principal asked to cancel the execution and it ended because of that (Studio v1 WP4, ADR-002
   * §29). Assigned by the cancel route for queued work, by the admission refusal for a cancel that
   * landed before admission, by the running reaper for a cancel the runner never finished, and by
   * the report projection — only when a cancel was actually requested — for the runner's own {@code
   * CANCELLED} outcome. A runner cannot obtain it by naming it.
   */
  public static final String CANCELLED = "CANCELLED";

  public static final String SECRET_TOO_LONG = "SECRET_TOO_LONG";

  private static final Set<String> VALUES =
      Set.of(
          TIMEOUT,
          DISPATCH_FAILED,
          DISPATCH_UNKNOWN,
          START_TIMEOUT,
          STALE,
          DISPATCH_DISABLED,
          AUTHORIZATION_REVOKED,
          REFERENCE_UNAVAILABLE,
          CANCELLED,
          SECRET_TOO_LONG);

  /** Codes the reapers own. A dispatcher must never emit one of these (AC-13a disjointness). */
  private static final Set<String> REAPER_ASSIGNED = Set.of(START_TIMEOUT, STALE, TIMEOUT);

  private ExecutionErrorCode() {}

  /** The whole enumeration. Read this; never copy it. */
  public static Set<String> values() {
    return VALUES;
  }

  /** The subset the reapers assign, so the dispatch path can assert it emits none of them. */
  public static Set<String> reaperAssigned() {
    return REAPER_ASSIGNED;
  }
}
