package com.citi.put.checks.studio.guided.translation;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Administrator-approved source sharing scope; no per-control author mappings. */
@ConfigurationProperties("studio.guided-authoring.translation")
public record GuidedTranslationProperties(
    @DefaultValue("false") boolean enabled,
    @DefaultValue("false") boolean allowAuthoredNonsecret,
    List<String> applications,
    List<String> environments,
    @DefaultValue("65536") int maxInputBytes,
    @DefaultValue("4096") int maxOutputTokens,
    @DefaultValue("60") int callSeconds,
    @DefaultValue("worker-1") String workerId,
    @DefaultValue("false") boolean verifySteps) {
  @org.springframework.boot.context.properties.bind.ConstructorBinding
  public GuidedTranslationProperties {
    applications = applications == null ? List.of() : List.copyOf(applications);
    environments = environments == null ? List.of() : List.copyOf(environments);
    if (maxInputBytes < 1
        || maxInputBytes > 131072
        || maxOutputTokens < 1
        || maxOutputTokens > 32000
        || callSeconds < 1
        || callSeconds > 600) {
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

  public boolean permits(String application, String environment) {
    return enabled
        && allowAuthoredNonsecret
        && applications.contains(application)
        && environments.contains(environment);
  }
}
