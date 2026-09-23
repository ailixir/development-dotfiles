package com.citi.put.checks.studio.evidence;

/**
 * The object store could not be reached (story 10.15 AC-17).
 *
 * <p>This is the type that keeps <i>"the store answered and the key is not there"</i> apart from
 * <i>"the store could not be reached"</i>. The first is {@code Optional.empty()}; this is the
 * second, and the route may not answer it with {@code 404 No evidence for this execution}, which
 * would assert a fact about the run that the API has not observed.
 *
 * <p>Which status it <em>does</em> answer is ADR-002 §12 Class C — status-code semantics on a
 * public operation — and is escalated as <b>ESC-2</b> rather than invented. {@code
 * ExecutionVideoContractEscalationTest} carries that escalation, red, until an architect rules.
 */
public class VideoObjectStoreUnavailableException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public VideoObjectStoreUnavailableException(String message) {
    super(message);
  }

  public VideoObjectStoreUnavailableException(String message, Throwable cause) {
    super(message, cause);
  }
}
