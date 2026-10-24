package com.citi.put.checks.studio.guided.translation;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Administrator-approved source sharing scope; no per-control author mappings.
 *
 * <p>{@code sendTimeoutSeconds} caps one provider send. It only takes effect while it is shorter
 * than the call budget left after authentication ({@code callSeconds}); a call budget at or below
 * the cap makes every overrun a terminal TIMEOUT rather than a retried stall.
 */
@ConfigurationProperties("studio.guided-authoring.translation")
public record GuidedTranslationProperties(
    @DefaultValue("true") boolean enabled,
    @DefaultValue("true") boolean allowAuthoredNonsecret,
    List<String> applications,
    List<String> environments,
    @DefaultValue("65536") int maxInputBytes,
    @DefaultValue("4096") int maxOutputTokens,
    @DefaultValue("60") int callSeconds,
    @DefaultValue("worker-1") String workerId,
    @DefaultValue("false") boolean verifySteps,
    @DefaultValue("2000") int transientBackoffMillis,
    @DefaultValue("50") int sendTimeoutSeconds) {
  @org.springframework.boot.context.properties.bind.ConstructorBinding
  public GuidedTranslationProperties {
    applications = applications == null ? List.of() : List.copyOf(applications);
    environments = environments == null ? List.of() : List.copyOf(environments);
    if (maxInputBytes < 1
        || maxInputBytes > 131072
        || maxOutputTokens < 1
        || maxOutputTokens > 32000
        || callSeconds < 1
        || callSeconds > 600
        || transientBackoffMillis < 0
        || transientBackoffMillis > 30000
        || sendTimeoutSeconds < 1
        || sendTimeoutSeconds > 600) {
      throw new IllegalArgumentException("Invalid guided translation bounds");
    }
  }

  public GuidedTranslationProperties(
      boolean enabled,
      boolean allowAuthoredNonsecret,
      List<String> applications,
      List<String> environments,
      int maxInputBytes,
      int maxOutputTokens,
      int callSeconds,
      String workerId,
      boolean verifySteps,
      int transientBackoffMillis) {
    this(
        enabled,
        allowAuthoredNonsecret,
        applications,
        environments,
        maxInputBytes,
        maxOutputTokens,
        callSeconds,
        workerId,
        verifySteps,
        transientBackoffMillis,
        50);
  }

  public GuidedTranslationProperties(
      boolean enabled,
      boolean allowAuthoredNonsecret,
      List<String> applications,
      List<String> environments,
      int maxInputBytes,
      int maxOutputTokens,
      int callSeconds,
      String workerId) {
    this(
        enabled,
        allowAuthoredNonsecret,
        applications,
        environments,
        maxInputBytes,
        maxOutputTokens,
        callSeconds,
        workerId,
        false);
  }

  public GuidedTranslationProperties(
      boolean enabled,
      boolean allowAuthoredNonsecret,
      List<String> applications,
      List<String> environments,
      int maxInputBytes,
      int maxOutputTokens,
      int callSeconds,
      String workerId,
      boolean verifySteps) {
    this(
        enabled,
        allowAuthoredNonsecret,
        applications,
        environments,
        maxInputBytes,
        maxOutputTokens,
        callSeconds,
        workerId,
        verifySteps,
        2000);
  }

  public boolean permits(String application, String environment) {
    return enabled
        && allowAuthoredNonsecret
        && applications.contains(application)
        && environments.contains(environment);
  }
}
