package com.citi.put.checks.studio.secrets;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Fail-closed provider selection (AC-9).
 *
 * <p>Provider selection is intentionally fail closed. Shipped code contains only the disabled
 * provider and the real HashiCorp integration; test doubles live under the test source set.
 *
 * <ol>
 *   <li><b>Explicit default-off.</b> {@code application.yml} selects {@code none}; a real call is
 *       possible only when configuration explicitly selects {@code hashicorp}. Absent or
 *       unrecognised values are still a refusal to start, not a substitution.
 *   <li><b>It says so out loud.</b> The selected provider's name is logged at startup.
 * </ol>
 */
@Configuration
@EnableConfigurationProperties(StudioSecretsProperties.class)
public class StudioVaultConfiguration {

  private static final Logger LOGGER = LoggerFactory.getLogger(StudioVaultConfiguration.class);

  /** Every provider name this build knows. Anything else is a refusal to start. */
  public static final Set<String> KNOWN_PROVIDERS =
      Set.of(DisabledStudioVaultProvider.NAME, HashicorpStudioVaultProvider.NAME);

  /** The startup line AC-9 asserts on captured output, not on source text. */
  public static final String STARTUP_MESSAGE_PREFIX = "Studio vault provider selected: ";

  @Bean
  public StudioVaultProvider studioVaultProvider(StudioSecretsProperties properties) {
    String provider = properties.vaultOrEmpty().provider();
    if (provider == null || provider.isBlank()) {
      throw new IllegalStateException(
          "studio.secrets.vault.provider is not configured. There is deliberately no default: "
              + "a Studio execution that resolves secrets must name the vault it resolves them "
              + "from. Known providers: "
              + KNOWN_PROVIDERS);
    }
    String selected = provider.trim();
    if (!KNOWN_PROVIDERS.contains(selected)) {
      throw new IllegalStateException(
          "studio.secrets.vault.provider '"
              + selected
              + "' is not a provider this build knows. Known providers: "
              + KNOWN_PROVIDERS
              + ". It is not substituted with a default.");
    }

    if (HashicorpStudioVaultProvider.NAME.equals(selected)) {
      StudioSecretsProperties.Vault.Hashicorp hashicorp =
          properties.vaultOrEmpty().hashicorpOrEmpty();
      validateHashicorp(hashicorp);
      LOGGER.info("{}{}", STARTUP_MESSAGE_PREFIX, selected);
      return new HashicorpStudioVaultProvider(hashicorp, new ObjectMapper());
    }

    if (DisabledStudioVaultProvider.NAME.equals(selected)) {
      LOGGER.info(
          "{}{} — external secret resolution is disabled", STARTUP_MESSAGE_PREFIX, selected);
      return new DisabledStudioVaultProvider();
    }

    throw new IllegalStateException("Unreachable: provider '" + selected + "' has no factory");
  }

  private static void validateHashicorp(StudioSecretsProperties.Vault.Hashicorp properties) {
    requireText(properties.address(), "address");
    requireText(properties.tokenFile(), "token-file");
    if (properties.connectTimeoutOrDefault().isZero()
        || properties.connectTimeoutOrDefault().isNegative()
        || properties.requestTimeoutOrDefault().isZero()
        || properties.requestTimeoutOrDefault().isNegative()) {
      throw new IllegalStateException("HashiCorp Vault timeouts must be greater than zero");
    }
    if (properties.maxResponseBytesOrDefault() <= 0) {
      throw new IllegalStateException(
          "studio.secrets.vault.hashicorp.max-response-bytes must be greater than zero");
    }
    String template = properties.pathTemplateOrDefault();
    for (String placeholder : List.of("{csiId}", "{environment}", "{kind}", "{referenceName}")) {
      if (!template.contains(placeholder)) {
        throw new IllegalStateException(
            "studio.secrets.vault.hashicorp.path-template must contain " + placeholder);
      }
    }
    if (template.startsWith("/")
        || template.contains("..")
        || template.contains("?")
        || template.contains("#")) {
      throw new IllegalStateException(
          "studio.secrets.vault.hashicorp.path-template must be a relative Vault path");
    }
    URI address = URI.create(properties.address());
    boolean loopback =
        "localhost".equals(address.getHost())
            || "127.0.0.1".equals(address.getHost())
            || "::1".equals(address.getHost());
    if (!"https".equals(address.getScheme()) && !("http".equals(address.getScheme()) && loopback)) {
      throw new IllegalStateException(
          "studio.secrets.vault.hashicorp.address must use https outside loopback tests");
    }
    if (address.getUserInfo() != null
        || address.getQuery() != null
        || address.getFragment() != null) {
      throw new IllegalStateException("Vault address must not contain credentials or a query");
    }
    Path tokenFile = Path.of(properties.tokenFile());
    if (!Files.isReadable(tokenFile)) {
      throw new IllegalStateException("The configured Vault token file is not readable");
    }
  }

  private static void requireText(String value, String field) {
    if (value == null || value.isBlank()) {
      throw new IllegalStateException("studio.secrets.vault.hashicorp." + field + " is required");
    }
  }

  @Bean
  public StudioSecretUseAuthorization studioSecretUseAuthorization(
      StudioSecretsProperties properties) {
    return new ConfiguredSecretUseAuthorization(
        ConfiguredSecretUseAuthorization.parse(properties.entitlementsOrEmpty()));
  }
}
