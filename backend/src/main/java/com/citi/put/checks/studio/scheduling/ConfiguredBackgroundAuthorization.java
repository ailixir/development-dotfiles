package com.citi.put.checks.studio.scheduling;

import java.util.Arrays;
import java.util.List;
import java.util.Set;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** Explicit local/test fixture policy. Production and unknown profile combinations always deny. */
@Component
public class ConfiguredBackgroundAuthorization implements StudioBackgroundAuthorization {
  private final StudioSchedulingProperties properties;
  private final Environment environment;

  public ConfiguredBackgroundAuthorization(
      StudioSchedulingProperties properties, Environment environment) {
    this.properties = properties;
    this.environment = environment;
  }

  @Override
  public List<String> principals(String csiId, String targetEnvironment) {
    if (!localProfile() || !properties.isLocalGrantsEnabled()) {
      return List.of();
    }
    String configured =
        properties.getLocalGrants().getOrDefault(csiId + "|" + targetEnvironment, "");
    return Arrays.stream(configured.split(","))
        .map(String::strip)
        .filter(s -> !s.isEmpty())
        .distinct()
        .sorted()
        .toList();
  }

  @Override
  public boolean localOnly() {
    return localProfile() && properties.isLocalGrantsEnabled();
  }

  @Override
  public void require(String principal, String csiId, String targetEnvironment) {
    if (principal == null || !principals(csiId, targetEnvironment).contains(principal)) {
      throw new StudioScheduleException(
          403,
          "BACKGROUND_AUTHORIZATION_DENIED",
          "No approved background execution grant for this test");
    }
  }

  private boolean localProfile() {
    Set<String> profiles = Set.copyOf(Arrays.asList(environment.getActiveProfiles()));
    return (profiles.contains("local") || profiles.contains("test"))
        && Set.of("local", "test", "api", "worker").containsAll(profiles);
  }
}
