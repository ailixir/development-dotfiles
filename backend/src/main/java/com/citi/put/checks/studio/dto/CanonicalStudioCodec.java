package com.citi.put.checks.studio.dto;

import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.authoring.AuthoringLimits;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** Strict codec for the single authoring generation's denormalized storage mirrors. */
public final class CanonicalStudioCodec {
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private CanonicalStudioCodec() {}

  public static List<String> parseSteps(String json) {
    return stepsFromNode(read(json, "INVALID_STEPS"));
  }

  public static List<String> stepsFromNode(JsonNode node) {
    if (node == null || node.isNull()) {
      return List.of();
    }
    require(node.isArray(), "INVALID_STEPS");
    List<String> result = new ArrayList<>();
    for (JsonNode step : node) {
      require(step.isTextual(), "INVALID_STEPS");
      result.add(step.textValue());
    }
    return List.copyOf(result);
  }

  public static String stepsToJson(List<String> steps) {
    return MAPPER.valueToTree(steps == null ? List.of() : steps).toString();
  }

  public static List<StudioVariable> parseVariables(String json) {
    return variablesFromNode(read(json, "INVALID_VARIABLES"));
  }

  public static List<StudioVariable> variablesFromNode(JsonNode node) {
    if (node == null || node.isNull()) {
      return List.of();
    }
    require(node.isArray(), "INVALID_VARIABLES");
    List<StudioVariable> result = new ArrayList<>();
    Set<String> names = new HashSet<>();
    for (JsonNode variable : node) {
      require(variable.isObject(), "INVALID_VARIABLES");
      variable
          .fieldNames()
          .forEachRemaining(
              field ->
                  require(
                      Set.of("name", "kind", "value", "secretId").contains(field),
                      "INVALID_VARIABLES"));
      String name = text(variable, "name");
      require(
          name != null && !name.isEmpty() && name.codePointCount(0, name.length()) <= 64,
          "INVALID_VARIABLES");
      require(names.add(name), "INVALID_AUTHORING");
      String kind = text(variable, "kind");
      if (StudioVariable.KIND_PLAIN.equals(kind)) {
        require(
            !variable.hasNonNull("secretId")
                && (!variable.hasNonNull("value") || variable.path("value").isTextual()),
            "INVALID_VARIABLES");
        result.add(StudioVariable.plain(name, text(variable, "value")));
      } else {
        String secretId = text(variable, "secretId");
        require(
            StudioVariable.KIND_SECRET_REF.equals(kind)
                && !variable.hasNonNull("value")
                && secretId != null
                && secretId.matches("[A-Za-z0-9_.-]{1,64}")
                && !secretId.equals(".")
                && !secretId.equals(".."),
            "INVALID_VARIABLES");
        result.add(StudioVariable.secretRef(name, secretId));
      }
    }
    return List.copyOf(result);
  }

  public static String variablesToJson(List<StudioVariable> variables) {
    JsonNode node = MAPPER.valueToTree(variables == null ? List.of() : variables);
    variablesFromNode(node);
    return node.toString();
  }

  public static String normalizeBrowser(String browser) {
    String value = browser == null ? TestConfiguration.CANONICAL_BROWSER : browser;
    require(TestConfiguration.CANONICAL_BROWSER.equals(value), "INVALID_CONFIGURATION");
    return value;
  }

  public static Viewport viewport(Integer width, Integer height) {
    return new Viewport(
        width == null ? Viewport.DEFAULT_WIDTH : width,
        height == null ? Viewport.DEFAULT_HEIGHT : height);
  }

  public static void validateForWrite(UITestRequest request) {
    List<String> steps = request.steps() == null ? List.of() : request.steps();
    for (int index = 0; index < steps.size(); index++) {
      String step = steps.get(index);
      if (step == null || step.isBlank()) {
        throw new StudioValidationException(
            AuthoringLimits.INVALID_STEPS, AuthoringLimits.blankStepMessage(index));
      }
    }
    Integer timeoutSeconds =
        request.configuration() == null ? null : request.configuration().timeoutSeconds();
    if (timeoutSeconds != null
        && (timeoutSeconds < TestConfiguration.MIN_TIMEOUT_SECONDS
            || timeoutSeconds > TestConfiguration.MAX_TIMEOUT_SECONDS)) {
      throw new StudioValidationException(
          "INVALID_CONFIGURATION",
          "timeoutSeconds is "
              + timeoutSeconds
              + "; it must be between "
              + TestConfiguration.MIN_TIMEOUT_SECONDS
              + " and "
              + TestConfiguration.MAX_TIMEOUT_SECONDS
              + " seconds.");
    }
    String browser = request.configuration() == null ? null : request.configuration().browser();
    if (!Objects.equals(TestConfiguration.CANONICAL_BROWSER, browser)) {
      throw new StudioValidationException(
          "INVALID_CONFIGURATION",
          "browser '"
              + browser
              + "' is not supported; the canonical engine is '"
              + TestConfiguration.CANONICAL_BROWSER
              + "'");
    }
  }

  private static JsonNode read(String json, String code) {
    if (json == null) {
      return null;
    }
    try {
      return MAPPER.readTree(json);
    } catch (JsonProcessingException exception) {
      throw new StudioValidationException(code, "Invalid canonical storage document");
    }
  }

  private static String text(JsonNode node, String key) {
    return node.path(key).isTextual() ? node.path(key).textValue() : null;
  }

  private static void require(boolean valid, String code) {
    if (!valid) {
      throw new StudioValidationException(code, "Invalid canonical Studio shape");
    }
  }
}
