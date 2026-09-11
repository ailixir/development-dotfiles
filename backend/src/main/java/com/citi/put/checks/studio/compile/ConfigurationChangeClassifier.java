package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.entity.UITest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Objects;
import org.springframework.stereotype.Component;

/**
 * Classifies a draft update as a source change, an execution-affecting configuration change, both,
 * or neither (Architecture §4.2, AC-7).
 *
 * <p>Step text drives {@code sourceRevision}. Environment, variable values/references, viewport,
 * timeout, browser and wait strategy drive {@code configurationRevision}. Name and description
 * drive neither and never invalidate a confirmation.
 *
 * <p>Target policy selection is also an execution-affecting change per §4.2, but no such field
 * exists on the test contract yet; it is introduced with the destination policy work and must be
 * added to {@link #classify} at that point.
 */
@Component
public class ConfigurationChangeClassifier {

  private final ObjectMapper objectMapper;

  public ConfigurationChangeClassifier(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  /**
   * Result of classifying an update.
   *
   * @param sourceChanged the ordered step text differs from the stored draft
   * @param configurationChanged at least one execution-affecting configuration field differs
   */
  public record Classification(boolean sourceChanged, boolean configurationChanged) {

    public boolean anyChanged() {
      return sourceChanged || configurationChanged;
    }
  }

  public Classification classify(UITest stored, UITestRequest request) {
    boolean sourceChanged = jsonDiffers(stored.getSteps(), request.steps(), "steps");
    boolean configurationChanged =
        jsonDiffers(stored.getVariables(), request.variables(), "variables")
            || !Objects.equals(stored.getEnvironment(), request.environment())
            || !Objects.equals(stored.getBrowser(), request.browser())
            || stored.getViewportWidth() != request.viewportWidth()
            || stored.getViewportHeight() != request.viewportHeight()
            || stored.getTimeoutSeconds() != request.timeoutSeconds()
            || !Objects.equals(stored.getWaitStrategy(), request.waitStrategy());
    return new Classification(sourceChanged, configurationChanged);
  }

  /**
   * Compares two JSON documents by value so that formatting-only differences do not advance a
   * revision. Array order is significant: the source is an ordered list of steps.
   */
  private boolean jsonDiffers(String stored, String incoming, String field) {
    if (stored == null || incoming == null) {
      return !Objects.equals(stored, incoming);
    }
    return !parse(stored, field).equals(parse(incoming, field));
  }

  private JsonNode parse(String json, String field) {
    try {
      return objectMapper.readTree(json);
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException(
          field + " is not valid JSON: " + e.getOriginalMessage(), e);
    }
  }
}
