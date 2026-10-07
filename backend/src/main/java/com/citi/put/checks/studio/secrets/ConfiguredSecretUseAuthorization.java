package com.citi.put.checks.studio.secrets;

import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * The development entitlement policy behind {@link StudioSecretUseAuthorization} (AC-4, AC-5a).
 *
 * <p>This is <b>development configuration</b>, keyed {@code principal|csi|environment} and holding
 * the secret ids that principal may use there. It is not the production policy: PUT Core owns the
 * production secret-use policy (V6, CON-2), and the platform Vault's own token policy is `ED-02`'s.
 * Neither is connected on this branch, and inventing a principal entitlement model in their place
 * would be an Article IV violation. AC-5b is where the real policy, including the principal
 * dimension, is evaluated.
 *
 * <p>What this <em>does</em> give AC-4 is a decision that is genuinely separate from open execution
 * admission: the entitlement is per secret, so a principal who may start the test can still be
 * refused {@code LOGIN_PW}. That is the decision the seam exists to make.
 *
 * <p>Fail-closed at every gap: an unknown principal, an unknown CSI, an unknown environment or an
 * empty entitlement set all answer {@code false}.
 */
public final class ConfiguredSecretUseAuthorization implements StudioSecretUseAuthorization {

  private final Map<String, Set<String>> entitlements;

  public ConfiguredSecretUseAuthorization(Map<String, Set<String>> entitlements) {
    this.entitlements = Map.copyOf(entitlements);
  }

  @Override
  public boolean mayUse(String principal, String csiId, String environment, String secretId) {
    if (principal == null || csiId == null || environment == null || secretId == null) {
      return false;
    }
    return entitlements
        .getOrDefault(key(principal, csiId, environment), Set.of())
        .contains(secretId);
  }

  /** The key form, exposed so configuration and tests agree on one derivation. */
  public static String key(String principal, String csiId, String environment) {
    return principal + '|' + csiId + '|' + environment;
  }

  /** Parses {@code principal|csi|environment -> "A,B,C"} from development configuration. */
  public static Map<String, Set<String>> parse(Map<String, String> configured) {
    Map<String, Set<String>> parsed = new java.util.LinkedHashMap<>();
    configured.forEach(
        (key, value) -> {
          if (key.split("\\|", -1).length != 3) {
            throw new IllegalStateException(
                "studio.secrets.entitlements key '" + key + "' is not principal|csi|environment");
          }
          Set<String> ids = new LinkedHashSet<>();
          for (String id : value.split(",")) {
            String trimmed = id.trim();
            if (!trimmed.isEmpty()) {
              ids.add(trimmed);
            }
          }
          parsed.put(key, Set.copyOf(ids));
        });
    return Map.copyOf(parsed);
  }
}
