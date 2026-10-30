package com.citi.put.checks.studio.guided.session;

import org.springframework.security.core.Authentication;

/**
 * The two authenticated internal identities of the guided protocol, for tests outside this package.
 * {@code GuidedInternalSecurity.Identity} is package-private on purpose: production builds it only
 * in the identity filter; a test builds the same token the filter would.
 */
public final class GuidedTestIdentities {
  private GuidedTestIdentities() {}

  /** The owning browser worker. */
  public static Authentication owningWorker() {
    return new GuidedInternalSecurity.Identity("worker-1", "owning-worker");
  }

  /** The backend controller that drives the translation. */
  public static Authentication backendController() {
    return new GuidedInternalSecurity.Identity("controller-1", "backend-controller");
  }
}
