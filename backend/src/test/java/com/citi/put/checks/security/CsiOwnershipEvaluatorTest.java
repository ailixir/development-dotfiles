package com.citi.put.checks.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;

/**
 * Story 10.1 AC-14 — what "readable" means when a list endpoint scopes itself.
 *
 * <p>The distinction that matters here is between "unrestricted" and "nothing": an administrator
 * must see every CSI, while an identity with no grants must see an empty page. Collapsing the two
 * into one empty set would silently turn the second case into the first.
 */
class CsiOwnershipEvaluatorTest {

  private final CsiOwnershipEvaluator evaluator = new CsiOwnershipEvaluator();

  @Test
  void anAdministratorIsUnrestricted() {
    Optional<Set<String>> readable = evaluator.readableCsiIds(identity(List.of("checks-admin")));

    assertThat(readable).isEmpty();
    assertThat(evaluator.isAdmin(identity(List.of("platform-admin")))).isTrue();
    assertThat(evaluator.canRead(identity(List.of("checks-admin")), "60406")).isTrue();
    assertThat(evaluator.canWrite(identity(List.of("checks-admin")), "60406")).isTrue();
  }

  @Test
  void readersOwnersAndContributorsAreAllReadable() {
    Authentication auth =
        identity(
            List.of("user"),
            new CsiOwnershipEntry("60401", "owner"),
            new CsiOwnershipEntry("60402", "contributor"),
            new CsiOwnershipEntry("60403", "viewer"),
            new CsiOwnershipEntry("60404", "stranger"));

    assertThat(evaluator.readableCsiIds(auth)).contains(Set.of("60401", "60402", "60403"));
  }

  @Test
  void onlyOwnersMayWriteOrExecute() {
    Authentication auth =
        identity(
            List.of("user"),
            new CsiOwnershipEntry("60401", "owner"),
            new CsiOwnershipEntry("60402", "viewer"));

    assertThat(evaluator.canWrite(auth, "60401")).isTrue();
    assertThat(evaluator.canExecute(auth, "60401")).isTrue();
    assertThat(evaluator.canWrite(auth, "60402")).isFalse();
    assertThat(evaluator.canExecute(auth, "60402")).isFalse();
    assertThat(evaluator.canRead(auth, "60402")).isTrue();
    assertThat(evaluator.canRead(auth, "60999")).isFalse();
  }

  @Test
  void anIdentityWithNoGrantsIsRestrictedToNothingRatherThanToEverything() {
    Authentication auth = identity(List.of("user"));

    Optional<Set<String>> readable = evaluator.readableCsiIds(auth);

    assertThat(readable).isPresent();
    assertThat(readable.orElseThrow()).isEmpty();
  }

  @Test
  void anUnrecognisedAuthenticationReadsNothingAndWritesNothing() {
    Authentication anonymous =
        new AnonymousAuthenticationToken(
            "key", "anonymous", AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS"));

    assertThat(evaluator.isAdmin(anonymous)).isFalse();
    assertThat(evaluator.canRead(anonymous, "60401")).isFalse();
    assertThat(evaluator.canWrite(anonymous, "60401")).isFalse();
    assertThat(evaluator.readableCsiIds(anonymous)).contains(Set.of());
  }

  private static Authentication identity(List<String> roles, CsiOwnershipEntry... ownership) {
    return new BffAuthenticationToken(
        new UserIdentity("uid", "user@citi.com", "User", "Ops", roles, List.of(ownership)));
  }
}
