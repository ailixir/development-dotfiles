package com.citi.put.checks.studio.authoring;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Save-time authoring bounds (Story 10.8, AC-6; VAL-024).
 *
 * <p>The step count is rejected at the API with a {@code 400} and a stable code before anything is
 * written. A bound that is not positive fails startup rather than the first save. The per-step text
 * bound is a contract value ({@code AuthoringStep.MAX_TEXT_CHARS}), not a setting.
 *
 * @param maxSteps maximum number of source steps
 */
@ConfigurationProperties(prefix = "studio.authoring")
public record StudioAuthoringProperties(@DefaultValue("100") int maxSteps) {

  public StudioAuthoringProperties {
    if (maxSteps <= 0) {
      throw new IllegalStateException("studio.authoring.max-steps must be > 0 but was " + maxSteps);
    }
  }
}
