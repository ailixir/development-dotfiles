package com.citi.put.checks.studio.secrets;

import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Studio secret-resolution configuration (§8.5 — deployment configuration in one source, AC-9).
 *
 * <p>{@link Vault#provider()} has <b>no default anywhere</b>, and that absence is the criterion.
 * {@link StudioVaultConfiguration} refuses to start when it is missing or unrecognised rather than
 * falling back to anything, because a silent fallback to a fake vault is the single worst failure
 * mode this story could ship.
 *
 * @param vault which provider, and the fake's development seed
 * @param entitlements development secret-use policy, {@code principal|csi|environment -> "A,B"}
 */
@ConfigurationProperties(prefix = "studio.secrets")
public record StudioSecretsProperties(Vault vault, Map<String, String> entitlements) {

  /**
   * @param provider the enumerated provider name. No default — absent is a refusal to start
   * @param fake the fake provider's development seed, {@code KIND|csi|environment|name -> value}
   */
  public record Vault(String provider, Fake fake) {

    /**
     * @param entries the seed
     */
    public record Fake(Map<String, String> entries) {

      public Map<String, String> entriesOrEmpty() {
        return entries == null ? Map.of() : entries;
      }
    }

    public Fake fakeOrEmpty() {
      return fake == null ? new Fake(Map.of()) : fake;
    }
  }

  public Vault vaultOrEmpty() {
    return vault == null ? new Vault(null, null) : vault;
  }

  public Map<String, String> entitlementsOrEmpty() {
    return entitlements == null ? Map.of() : entitlements;
  }
}
