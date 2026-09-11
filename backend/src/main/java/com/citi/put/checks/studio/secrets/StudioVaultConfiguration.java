package com.citi.put.checks.studio.secrets;

import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * Fail-closed provider selection (AC-9).
 *
 * <p>Three controls, and the reason for all three is the same: a fake vault that can be reached
 * from a deployed profile is worse than no vault at all, and it is very much cheaper to make
 * impossible here than to detect later.
 *
 * <ol>
 *   <li><b>No default.</b> {@code studio.secrets.vault.provider} is enumerated and has no fallback
 *       value in {@code application.yml} or in code. Absent or unrecognised is a refusal to start,
 *       not a substitution.
 *   <li><b>The fake is confined.</b> `ED-02`'s fallback authorises development identities
 *       <em>"confined to local/mock operation"</em>. Selecting {@code fake} outside {@link
 *       #DEVELOPMENT_PROFILES} fails the context rather than quietly building it.
 *   <li><b>It says so out loud.</b> The selected provider's name is logged at startup and published
 *       on the info surface, so a deployment running on a fake vault announces it.
 * </ol>
 */
@Configuration
@EnableConfigurationProperties(StudioSecretsProperties.class)
public class StudioVaultConfiguration {

  private static final Logger LOGGER = LoggerFactory.getLogger(StudioVaultConfiguration.class);

  /** The only profiles from which the fake provider may be reached. */
  public static final Set<String> DEVELOPMENT_PROFILES = Set.of("test", "local", "dev");

  /** Every provider name this build knows. Anything else is a refusal to start. */
  public static final Set<String> KNOWN_PROVIDERS = Set.of(FakeStudioVaultProvider.NAME);

  /** The startup line AC-9 asserts on captured output, not on source text. */
  public static final String STARTUP_MESSAGE_PREFIX = "Studio vault provider selected: ";

  @Bean
  public StudioVaultProvider studioVaultProvider(
      StudioSecretsProperties properties, Environment environment) {
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

    if (FakeStudioVaultProvider.NAME.equals(selected)) {
      List<String> active = List.of(environment.getActiveProfiles());
      if (active.stream().noneMatch(DEVELOPMENT_PROFILES::contains)) {
        throw new IllegalStateException(
            "studio.secrets.vault.provider=fake is confined to "
                + DEVELOPMENT_PROFILES
                + " and the active profiles are "
                + active
                + ". A fake vault reachable from a deployed profile is worse than no vault.");
      }
      LOGGER.warn(
          "{}{} — this is a development vault holding development values, not a real vault "
              + "(ED-02). Active profiles: {}",
          STARTUP_MESSAGE_PREFIX,
          selected,
          active);
      return new FakeStudioVaultProvider(
          FakeStudioVaultProvider.parseSeed(
              properties.vaultOrEmpty().fakeOrEmpty().entriesOrEmpty()));
    }

    throw new IllegalStateException("Unreachable: provider '" + selected + "' has no factory");
  }

  @Bean
  public StudioSecretUseAuthorization studioSecretUseAuthorization(
      StudioSecretsProperties properties) {
    return new ConfiguredSecretUseAuthorization(
        ConfiguredSecretUseAuthorization.parse(properties.entitlementsOrEmpty()));
  }
}
