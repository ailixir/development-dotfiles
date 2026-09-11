package com.citi.put.checks.studio.secrets;

import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Test-side control over the two seams story 10.17 introduces.
 *
 * <p>The production implementations are both immutable-after-construction, which is the right shape
 * for them: a vault whose policy can change under a running application and an entitlement set that
 * can be edited at runtime are both things this system should not have. Several criteria, though,
 * are precisely about change <em>between</em> two moments — a rotation between acceptance and
 * dispatch (AC-8), an entitlement withdrawn in the same window (AC-7a), a reference deleted from
 * the vault (AC-7a) — and none of those can be arranged against something that cannot change.
 *
 * <p>So these are mutable, they live only in the test tree, and they are deliberately thin: the
 * entitlement fixture answers exactly the question {@link ConfiguredSecretUseAuthorization}
 * answers, fail-closed at every gap, so a test that passes against it is not passing against a more
 * permissive thing than production has.
 */
public final class StudioSecretFixtures {

  private StudioSecretFixtures() {}

  /**
   * An entitlement set a test can grant from and revoke from, with production's fail-closed rule.
   */
  public static final class MutableSecretUseAuthorization implements StudioSecretUseAuthorization {

    private final Map<String, Set<String>> entitlements = new ConcurrentHashMap<>();

    @Override
    public boolean mayUse(String principal, String csiId, String environment, String secretId) {
      if (principal == null || csiId == null || environment == null || secretId == null) {
        return false;
      }
      return entitlements
          .getOrDefault(
              ConfiguredSecretUseAuthorization.key(principal, csiId, environment), Set.of())
          .contains(secretId);
    }

    public MutableSecretUseAuthorization grant(
        String principal, String csiId, String environment, String secretId) {
      entitlements
          .computeIfAbsent(
              ConfiguredSecretUseAuthorization.key(principal, csiId, environment),
              key -> new LinkedHashSet<>())
          .add(secretId);
      return this;
    }

    public void revoke(String principal, String csiId, String environment, String secretId) {
      Set<String> ids =
          entitlements.get(ConfiguredSecretUseAuthorization.key(principal, csiId, environment));
      if (ids != null) {
        ids.remove(secretId);
      }
    }

    public void clear() {
      entitlements.clear();
    }
  }
}
