package com.citi.put.checks.studio.dispatch;

import java.time.Duration;

/**
 * The runner's response, classified into exactly three outcomes and no fourth (AC-15).
 *
 * <p>The classification is the safety property, not a convenience:
 *
 * <ul>
 *   <li>{@link Kind#ACCEPTED} — {@code 202}. The admitted path continues; the API waits for the
 *       admission CAS and the {@code STARTED} report.
 *   <li>{@link Kind#DEFINITE_REFUSAL} — the runner definitely did not accept and no browser
 *       started. A {@code 429} is retryable within the pending deadline, with a fresh {@code
 *       attempt_id}; any other definite refusal is terminal.
 *   <li>{@link Kind#AMBIGUOUS} — a timeout, a connection loss, any {@code 5xx} or a {@code 3xx}
 *       redirect. <b>These are not permission to resend.</b> A browser may already be running, so a
 *       second send would be a duplicate effect. The row stays {@code DISPATCHING} and recovery
 *       resolves it against admission, progress and manifest state.
 * </ul>
 */
public record DispatchOutcome(Kind kind, boolean retryable, Duration retryAfter, String detail) {

  /** The three outcomes. There is deliberately no fourth. */
  public enum Kind {
    ACCEPTED,
    DEFINITE_REFUSAL,
    AMBIGUOUS
  }

  public static DispatchOutcome accepted() {
    return new DispatchOutcome(Kind.ACCEPTED, false, null, null);
  }

  /** A {@code 429}: definite non-acceptance, retryable within {@code pending_deadline_at}. */
  public static DispatchOutcome refusedRetryable(Duration retryAfter) {
    return new DispatchOutcome(Kind.DEFINITE_REFUSAL, true, retryAfter, "runner refused with 429");
  }

  /** A definite non-acceptance the runner will answer the same way next time. */
  public static DispatchOutcome refusedTerminal(String detail) {
    return new DispatchOutcome(Kind.DEFINITE_REFUSAL, false, null, detail);
  }

  public static DispatchOutcome ambiguous(String detail) {
    return new DispatchOutcome(Kind.AMBIGUOUS, false, null, detail);
  }
}
