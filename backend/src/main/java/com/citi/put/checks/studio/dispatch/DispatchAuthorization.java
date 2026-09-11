package com.citi.put.checks.studio.dispatch;

import java.util.UUID;

/**
 * The authorization recheck the dispatcher performs immediately before the send (AC-13a, §5.1.3).
 *
 * <p>Acceptance authorized the request when it arrived; the send happens later, on a different pod,
 * after a queue wait bounded only by the pending SLA. A permission revoked in between must stop the
 * run, and it must stop it as a <b>terminal {@code ERROR} with an explicit code</b> — never a
 * retry, never a silent skip. A retry would keep asking a question whose answer will not change; a
 * silent skip would leave a row that nobody ever finishes.
 *
 * <p>What is decidable today is checked here. Real per-principal CSI re-evaluation against the CSI
 * provider, and real secret-use authorization, need identity and vault integration that `ED-02`
 * gates and that stories 10.17 and 10.18 own.
 */
public interface DispatchAuthorization {

  /**
   * Whether this execution may still be dispatched.
   *
   * @return the policy identity this dispatch runs under when authorized
   * @throws AuthorizationRevokedException when it may not (AC-13a)
   */
  String recheck(UUID executionId, UUID testId, String csiId, String principal);

  /** The dispatcher observed the caller's authorization to be gone (AC-13a). */
  class AuthorizationRevokedException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public AuthorizationRevokedException(String message) {
      super(message);
    }
  }
}
