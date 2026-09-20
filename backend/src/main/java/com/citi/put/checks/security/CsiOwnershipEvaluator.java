package com.citi.put.checks.security;

import java.util.LinkedHashSet;
import java.util.Optional;
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

  /**
   * The CSIs this identity may read, used to scope list endpoints <em>before</em> pagination
   * (Architecture §9.1).
   *
   * <p>An empty {@link Optional} means unrestricted — the caller is an administrator. A present but
   * empty set means the caller may read nothing, which is a legitimate answer and must yield an
   * empty page rather than an unfiltered one.
   */
  public Optional<Set<String>> readableCsiIds(Authentication auth) {
    if (isAdmin(auth)) {
      return Optional.empty();
    }
    UserIdentity identity = extractIdentity(auth);
    if (identity == null) {
      return Optional.of(Set.of());
    }
    Set<String> readable = new LinkedHashSet<>();
    identity.csiOwnership().stream()
        .filter(e -> READ_ROLES.contains(e.role()))
        .forEach(e -> readable.add(e.csiId()));
    return Optional.of(Set.copyOf(readable));
  }

  private UserIdentity extractIdentity(Authentication auth) {
    if (auth instanceof BffAuthenticationToken bff) {
      return bff.getPrincipal();
    }
    return null;
  }
}
