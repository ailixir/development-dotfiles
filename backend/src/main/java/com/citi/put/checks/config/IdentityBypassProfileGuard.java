package com.citi.put.checks.config;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Refuses to start when any ED-02 identity bypass is open outside a development profile (Studio v1
 * WP10, plan ADD-2).
 *
 * <p>{@link IdentityBypassProperties} made the three bypasses default-closed (story 10.18b); that
 * leaves a single environment variable — {@code CHECKS_BYPASS_CORE_SERVICE=true} on a UAT or
 * production pod — between the application and a {@code checks-admin} identity for every
 * unauthenticated caller. This guard makes that configuration unbootable instead of merely
 * non-default, the same shape {@code StudioVaultConfiguration} applies to the fake vault.
 *
 * <p>An open bypass is allowed only when at least one of {@link #DEVELOPMENT_PROFILES} is active
 * <em>and</em> every active profile is a development or role profile. The role profiles ({@code
 * api}, {@code worker}) select what a pod runs, not where, so the chart's {@code api,dev} passes
 * and {@code api,staging} / {@code api,prod} — or {@code dev,prod} — do not.
 *
 * <p>A component rather than a check inside {@code SecurityConfig}, which is
 * {@code @Profile("!worker")}: a pod that cannot use the bypass should still not be able to carry
 * it silently.
 */
@Component
public class IdentityBypassProfileGuard {

  private static final Logger LOGGER = LoggerFactory.getLogger(IdentityBypassProfileGuard.class);

  /** The only profiles under which an identity bypass may be open. */
  public static final Set<String> DEVELOPMENT_PROFILES = Set.of("local", "dev", "test");

  /** Profiles that select a deployment role and say nothing about the environment. */
  public static final Set<String> ROLE_PROFILES = Set.of("api", "worker");

  public IdentityBypassProfileGuard(IdentityBypassProperties bypass, Environment environment) {
    List<String> open = openBypasses(bypass);
    if (open.isEmpty()) {
      return;
    }
    List<String> active = List.of(environment.getActiveProfiles());
    if (!isDevelopmentOnly(active)) {
      throw new IllegalStateException(
          "Identity bypass "
              + open
              + " is enabled under active profiles "
              + active
              + ". ED-02 bypasses grant checks-admin to callers the platform never authenticated"
              + " and are confined to "
              + DEVELOPMENT_PROFILES
              + " (optionally with "
              + ROLE_PROFILES
              + "). Refusing to start.");
    }
    LOGGER.warn(
        "Identity bypass {} is OPEN under development profiles {} (ED-02). Never deploy this.",
        open,
        active);
  }

  static boolean isDevelopmentOnly(List<String> active) {
    boolean anyDevelopment = active.stream().anyMatch(DEVELOPMENT_PROFILES::contains);
    boolean onlyDevelopmentOrRole =
        active.stream()
            .allMatch(
                profile ->
                    DEVELOPMENT_PROFILES.contains(profile) || ROLE_PROFILES.contains(profile));
    return anyDevelopment && onlyDevelopmentOrRole;
  }

  static List<String> openBypasses(IdentityBypassProperties bypass) {
    List<String> open = new ArrayList<>();
    if (bypass.coreService()) {
      open.add("checks.security.bypass.core-service");
    }
    if (bypass.identityHeaders()) {
      open.add("checks.security.bypass.identity-headers");
    }
    if (bypass.csiRead()) {
      open.add("checks.security.bypass.csi-read");
    }
    return List.copyOf(open);
  }
}
