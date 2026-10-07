package com.citi.put.checks.studio.secrets;

import java.time.Duration;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Studio secret-resolution configuration (§8.5 — deployment configuration in one source, AC-9).
 *
 * <p>The shipped configuration names the explicit default-off provider {@code none}; only {@code
 * hashicorp} can make a real KV v2 call. Missing or unrecognised values fail startup rather than
 * silently substituting a provider.
 *
 * @param vault which provider and its real transport configuration
 * @param entitlements development secret-use policy, {@code principal|csi|environment -> "A,B"}
 */
@ConfigurationProperties(prefix = "studio.secrets")
public record StudioSecretsProperties(Vault vault, Map<String, String> entitlements) {

  /**
   * @param provider the enumerated provider name; absent is a refusal to start
   * @param hashicorp HashiCorp Vault transport configuration
   */
  public record Vault(String provider, Hashicorp hashicorp) {

    /** HashiCorp Vault KV v2 transport configuration. Authentication is a mounted token file. */
    public record Hashicorp(
        String address,
        String namespace,
        String mount,
        String pathTemplate,
        String valueKey,
        String tokenFile,
        Duration connectTimeout,
        Duration requestTimeout,
        Integer maxResponseBytes) {

      public String mountOrDefault() {
        return mount == null || mount.isBlank() ? "secret" : mount;
      }

      /**
       * The default renders, for a secret, {@code studio/60406/Production/<testId>/secrets/NAME}.
       * The test id scopes a secret to the test it was saved for.
       */
      public static final String DEFAULT_PATH_TEMPLATE =
          "studio/{csiId}/{environment}/{testId}/{kind}/{referenceName}";

      public String pathTemplateOrDefault() {
        return pathTemplate == null || pathTemplate.isBlank()
            ? DEFAULT_PATH_TEMPLATE
            : pathTemplate;
      }

      public String valueKeyOrDefault() {
        return valueKey == null || valueKey.isBlank() ? "value" : valueKey;
      }

      public Duration connectTimeoutOrDefault() {
        return connectTimeout == null ? Duration.ofSeconds(2) : connectTimeout;
      }

      public Duration requestTimeoutOrDefault() {
        return requestTimeout == null ? Duration.ofSeconds(5) : requestTimeout;
      }

      public int maxResponseBytesOrDefault() {
        return maxResponseBytes == null ? 64 * 1024 : maxResponseBytes;
      }
    }

    public Hashicorp hashicorpOrEmpty() {
      return hashicorp == null
          ? new Hashicorp(null, null, null, null, null, null, null, null, null)
          : hashicorp;
    }
  }

  public Vault vaultOrEmpty() {
    return vault == null ? new Vault(null, null) : vault;
  }

  public Map<String, String> entitlementsOrEmpty() {
    return entitlements == null ? Map.of() : entitlements;
  }
}
