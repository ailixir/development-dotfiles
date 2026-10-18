package com.citi.put.checks.studio.dispatch;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Binds the runner endpoint and refuses an unusable one at startup rather than on first use. */
@Configuration
@EnableConfigurationProperties(StudioRunnerProperties.class)
public class StudioRunnerConfiguration {

  /**
   * Validates the runner configuration during context refresh.
   *
   * @param runner the runner endpoint configuration
   * @return a marker bean, so the validation runs at startup
   */
  @Bean
  public StudioRunnerValidated studioRunnerValidated(StudioRunnerProperties runner) {
    runner.validate();
    return new StudioRunnerValidated();
  }

  /** Marker for the startup validation; carries no behaviour. */
  public static final class StudioRunnerValidated {}
}
