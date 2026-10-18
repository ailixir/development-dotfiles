package com.citi.put.checks.studio.guided.session;

import org.springframework.security.core.Authentication;

/** Test-only service-call identity; authenticated HTTP transport is exercised separately. */
public final class GuidedInternalIdentityFixture {
  private GuidedInternalIdentityFixture() {}

  public static Authentication controller() {
    return new GuidedInternalSecurity.Identity("controller-1", "backend-controller");
  }
}
