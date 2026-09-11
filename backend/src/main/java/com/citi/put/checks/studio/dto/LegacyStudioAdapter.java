package com.citi.put.checks.studio.dto;

import com.citi.put.checks.studio.StudioValidationException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * The single place where every legacy Studio shape is converted to the frozen contract
 * (Architecture §8.3, AC-4).
 *
 * <ul>
 *   <li>{@code browser: "chrome"} becomes {@code chromium}; any other engine is rejected with
 *       {@code 400 INVALID_CONFIGURATION} at the controller boundary.
 *   <li>Structured {@code TestIR} steps become ordered {@code originalText}.
 *   <li>JSON-string {@code steps}/{@code variables} become typed fields.
 *   <li>Flattened {@code viewportWidth}/{@code viewportHeight} become {@code
 *       configuration.viewport}.
 *   <li>Execution status {@code COMPLETED} becomes {@code PASSED}; {@code TIMEOUT} becomes {@code
 *       ERROR} with {@code errorCode = TIMEOUT}.
 * </ul>
 *
 * <p>Conversion never validates: it only restructures. Validation happens once, at the controller
 * boundary, through {@link #validateForWrite(UITestRequest)}. Keeping the two apart is what lets
 * the service layer still reason about a draft that carries a no-longer-supported engine.
 */
public final class LegacyStudioAdapter {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private LegacyStudioAdapter() {}

  // ── steps ────────────────────────────────────────────────────────────────

  /**
   * Reads the stored or submitted step list in any of its historical shapes.
   *
   * <p>Accepted: a JSON array of strings, a JSON array of structured {@code TestIR} steps (the
   * ordered {@code originalText} is taken), or a JSON string containing either of those.
   */
  public static List<String> parseSteps(String json) {
    JsonNode node = readTree(json, "steps");
    return stepsFromNode(node);
  }

  /** Same conversion as {@link #parseSteps(String)} but starting from an already parsed node. */
  public static List<String> stepsFromNode(JsonNode node) {
    if (node == null || node.isNull() || node.isMissingNode()) {
      return List.of();
    }
    if (node.isTextual()) {
      return parseSteps(node.textValue());
    }
    if (!node.isArray()) {
      throw new StudioValidationException("INVALID_STEPS", "steps must be an array of lines");
    }
    List<String> steps = new ArrayList<>();
    for (JsonNode element : node) {
      if (element.isTextual()) {
        steps.add(element.textValue());
      } else if (element.isObject()) {
        // Legacy structured TestIR step: only the authored line survives into the contract.
        JsonNode originalText = element.path("originalText");
        if (originalText.isTextual()) {
          steps.add(originalText.textValue());
        } else {
          throw new StudioValidationException(
              "INVALID_STEPS", "legacy structured step is missing originalText");
        }
      } else {
        throw new StudioValidationException(
            "INVALID_STEPS", "steps must contain lines or legacy structured steps");
      }
    }
    return List.copyOf(steps);
  }

  public static String stepsToJson(List<String> steps) {
    ArrayNode array = MAPPER.createArrayNode();
    if (steps != null) {
      steps.forEach(array::add);
    }
    return array.toString();
  }

  // ── variables ────────────────────────────────────────────────────────────

  /**
   * Reads the stored or submitted variable list in any of its historical shapes.
   *
   * <p>Accepted: the typed form {@code {name, kind, value|secretId}}, the legacy nested form {@code
   * {name, value: {kind, value|ref}}}, or a JSON string containing either.
   */
  public static List<StudioVariable> parseVariables(String json) {
    return variablesFromNode(readTree(json, "variables"));
  }

  /** Same conversion as {@link #parseVariables(String)} but from an already parsed node. */
  public static List<StudioVariable> variablesFromNode(JsonNode node) {
    if (node == null || node.isNull() || node.isMissingNode()) {
      return List.of();
    }
    if (node.isTextual()) {
      return parseVariables(node.textValue());
    }
    if (!node.isArray()) {
      throw new StudioValidationException("INVALID_VARIABLES", "variables must be an array");
    }
    List<StudioVariable> variables = new ArrayList<>();
    for (JsonNode element : node) {
      if (!element.isObject()) {
        throw new StudioValidationException("INVALID_VARIABLES", "each variable must be an object");
      }
      variables.add(variableFromNode(element));
    }
    return List.copyOf(variables);
  }

  private static StudioVariable variableFromNode(JsonNode element) {
    String name = text(element.path("name"));
    JsonNode nested = element.path("value");
    if (nested.isObject()) {
      // Legacy nested form: {name, value: {kind: 'plain'|'secret', value|ref}}.
      String legacyKind = text(nested.path("kind"));
      if ("secret".equals(legacyKind) || StudioVariable.KIND_SECRET_REF.equals(legacyKind)) {
        String secretId = text(nested.path("secretId"));
        if (secretId == null) {
          secretId = text(nested.path("ref").path("id"));
        }
        return StudioVariable.secretRef(name, secretId);
      }
      return StudioVariable.plain(name, text(nested.path("value")));
    }
    String kind = text(element.path("kind"));
    if (StudioVariable.KIND_SECRET_REF.equals(kind) || "secret".equals(kind)) {
      return StudioVariable.secretRef(name, text(element.path("secretId")));
    }
    return StudioVariable.plain(name, text(nested));
  }

  public static String variablesToJson(List<StudioVariable> variables) {
    try {
      return MAPPER.writeValueAsString(variables == null ? List.of() : variables);
    } catch (JsonProcessingException e) {
      throw new StudioValidationException(
          "INVALID_VARIABLES", "variables could not be serialized: " + e.getOriginalMessage());
    }
  }

  // ── configuration ────────────────────────────────────────────────────────

  /**
   * Normalizes a browser value without judging it: {@code chrome} and a missing value become the
   * canonical {@code chromium}; anything else is returned untouched so the caller can decide.
   */
  public static String normalizeBrowser(String browser) {
    if (browser == null || browser.isBlank()) {
      return TestConfiguration.CANONICAL_BROWSER;
    }
    String trimmed = browser.trim();
    if (TestConfiguration.LEGACY_CHROME.equalsIgnoreCase(trimmed)) {
      return TestConfiguration.CANONICAL_BROWSER;
    }
    return trimmed;
  }

  /** Folds the flattened legacy viewport fields into the typed record. */
  public static Viewport viewport(Integer width, Integer height) {
    return new Viewport(
        width == null || width <= 0 ? Viewport.DEFAULT_WIDTH : width,
        height == null || height <= 0 ? Viewport.DEFAULT_HEIGHT : height);
  }

  // ── execution outcome ────────────────────────────────────────────────────

  /** {@code COMPLETED} is {@code PASSED}; {@code TIMEOUT} is {@code ERROR} (§8.2). */
  public static String normalizeStatus(String status) {
    if (ExecutionStatus.LEGACY_COMPLETED.equals(status)) {
      return ExecutionStatus.PASSED;
    }
    if (ExecutionStatus.LEGACY_TIMEOUT.equals(status)) {
      return ExecutionStatus.ERROR;
    }
    return status;
  }

  /**
   * Derives the error code a legacy status implies. A legacy {@code TIMEOUT} row carries no code of
   * its own, so the canonical {@code TIMEOUT} code is supplied; every other status keeps whatever
   * code was persisted.
   */
  public static String normalizeErrorCode(String status, String errorCode) {
    if (ExecutionStatus.LEGACY_TIMEOUT.equals(status) && errorCode == null) {
      return ExecutionErrorCode.TIMEOUT;
    }
    return errorCode;
  }

  // ── controller-boundary validation ───────────────────────────────────────

  /**
   * Rejects a payload the server will not persist. Called once, at the controller boundary.
   *
   * <p>Only the canonical engine survives: other engines are rejected before execution rather than
   * silently reinterpreted (Architecture §8.3).
   */
  public static void validateForWrite(UITestRequest request) {
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

  // ── helpers ──────────────────────────────────────────────────────────────

  private static JsonNode readTree(String json, String field) {
    if (json == null || json.isBlank()) {
      return null;
    }
    try {
      return MAPPER.readTree(json);
    } catch (JsonProcessingException e) {
      throw new StudioValidationException(
          "INVALID_" + field.toUpperCase(java.util.Locale.ROOT),
          field + " is not valid JSON: " + e.getOriginalMessage());
    }
  }

  private static String text(JsonNode node) {
    return node == null || !node.isTextual() ? null : node.textValue();
  }
}
