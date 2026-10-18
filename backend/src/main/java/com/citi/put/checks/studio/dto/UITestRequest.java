package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/** Private metadata composition for the single context-aware authoring write. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record UITestRequest(
    String name,
    String description,
    String csiId,
    String environment,
    List<String> steps,
    List<StudioVariable> variables,
    TestConfiguration configuration,
    Long sourceRevision,
    Long configurationRevision) {
  public UITestRequest {
    steps = steps == null ? List.of() : List.copyOf(steps);
    variables = variables == null ? List.of() : List.copyOf(variables);
    TestConfiguration defaults = TestConfiguration.defaults();
    configuration =
        configuration == null
            ? defaults
            : new TestConfiguration(
                configuration.browser() == null ? defaults.browser() : configuration.browser(),
                configuration.viewport() == null ? defaults.viewport() : configuration.viewport(),
                configuration.timeoutSeconds() == null
                    ? defaults.timeoutSeconds()
                    : configuration.timeoutSeconds(),
                configuration.waitStrategy() == null
                    ? defaults.waitStrategy()
                    : configuration.waitStrategy());
  }
}
