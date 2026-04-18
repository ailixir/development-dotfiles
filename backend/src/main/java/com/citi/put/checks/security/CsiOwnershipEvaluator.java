package com.citi.put.checks.security;

import java.util.Set;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

@Component("csiOwnershipEvaluator")
public class CsiOwnershipEvaluator {

  private static final Set<String> ADMIN_ROLES = Set.of("checks-admin", "platform-admin");
  private static final Set<String> READ_ROLES = Set.of("owner", "contributor", "viewer");
  private static final Set<String> WRITE_ROLES = Set.of("owner");

  public boolean isAdmin(Authentication auth) {
    UserIdentity identity = extractIdentity(auth);
    if (identity == null) {
      return false;
    }
    return identity.roles().stream().anyMatch(ADMIN_ROLES::contains);
  }

  public boolean canRead(Authentication auth, String csiId) {
    if (isAdmin(auth)) {
      return true;
    }
    UserIdentity identity = extractIdentity(auth);
    if (identity == null) {
      return false;
    }
    return identity.csiOwnership().stream()
        .anyMatch(e -> e.csiId().equals(csiId) && READ_ROLES.contains(e.role()));
  }

  public boolean canWrite(Authentication auth, String csiId) {
    if (isAdmin(auth)) {
      return true;
    }
    UserIdentity identity = extractIdentity(auth);
    if (identity == null) {
      return false;
    }
    return identity.csiOwnership().stream()
        .anyMatch(e -> e.csiId().equals(csiId) && WRITE_ROLES.contains(e.role()));
  }

  public boolean canExecute(Authentication auth, String csiId) {
    return canWrite(auth, csiId);
  }

  private UserIdentity extractIdentity(Authentication auth) {
    if (auth instanceof BffAuthenticationToken bff) {
      return bff.getPrincipal();
    }
    return null;
  }
}
