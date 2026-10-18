package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Strict, side-effect-free validation for the frozen authoring contract. */
public final class StudioAuthoringValidation {

  private StudioAuthoringValidation() {}

  /** Parses the single v2 request and rejects closed-shape and cross-record violations. */
  public static AuthoringV2Request read(
      ObjectMapper objectMapper, Validator validator, JsonNode node) {
    List<Category> structural = structuralCategories(node);
    if (!structural.isEmpty()) {
      throw new InvalidAuthoringException(structural);
    }

    ObjectMapper strict = objectMapper.copy();
    strict.enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    AuthoringV2Request authoring;
    try {
      authoring = strict.treeToValue(node, AuthoringV2Request.class);
    } catch (IOException | RuntimeException exception) {
      throw new InvalidAuthoringException(List.of(Category.UNSUPPORTED_FIELD), exception);
    }

    Set<ConstraintViolation<AuthoringV2Request>> violations = validator.validate(authoring);
    if (!violations.isEmpty()) {
      throw new InvalidAuthoringException(
          violations.stream()
              .map(StudioAuthoringValidation::categoryForViolation)
              .distinct()
              .toList());
    }
    return authoring;
  }

  private static List<Category> structuralCategories(JsonNode request) {
    LinkedHashSet<Category> categories = new LinkedHashSet<>();
    if (request == null
        || !request.isObject()
        || !request.path("authoringSchemaVersion").isInt()
        || request.path("authoringSchemaVersion").asInt() != 2) {
      return List.of(Category.INVALID_AUTHORING);
    }

    JsonNode steps = request.path("steps");
    boolean hasString = false;
    Set<UUID> stepIds = new HashSet<>();
    if (steps.isArray()) {
      for (JsonNode step : steps) {
        hasString |= step.isTextual();
        if (step.isObject()) {
          JsonNode id = step.get("id");
          if (id == null || !id.isTextual()) {
            categories.add(Category.MISSING_STEP_ID);
          } else {
            try {
              if (!stepIds.add(UUID.fromString(id.textValue()))) {
                categories.add(Category.DUPLICATE_STEP_ID);
              }
            } catch (IllegalArgumentException ignored) {
              // Bean/Jackson validation reports malformed UUIDs through the generic category.
            }
          }
          inspectStepContext(step.path("context"), categories);
        }
      }
    }
    if (hasString) {
      categories.add(Category.MIXED_STEP_SHAPES);
    }

    inspectGlobalContext(request.path("globalContext"), categories);
    inspectEvidenceReferences(request.path("globalContext"), stepIds, null, categories);
    if (steps.isArray()) {
      for (JsonNode step : steps) {
        if (step.isObject() && step.path("id").isTextual()) {
          UUID owner = parseUuid(step.path("id").textValue());
          inspectEvidenceReferences(step.path("context"), stepIds, owner, categories);
        }
      }
    }
    return List.copyOf(categories);
  }

  private static void inspectGlobalContext(JsonNode context, Set<Category> categories) {
    for (JsonNode entry : iterable(context.path("entries"))) {
      if ("secretRef".equals(entry.path("kind").textValue())) {
        categories.add(Category.INVALID_SECRET_PLACEMENT);
      }
      inspectDefault(entry, categories);
    }
  }

  private static void inspectStepContext(JsonNode context, Set<Category> categories) {
    for (JsonNode entry : iterable(context.path("entries"))) {
      inspectDefault(entry, categories);
    }
  }

  private static void inspectDefault(JsonNode entry, Set<Category> categories) {
    if ("default".equals(entry.path("kind").textValue())
        && "secretRef".equals(entry.path("value").path("kind").textValue())) {
      categories.add(Category.INVALID_REFERENCE_PLACEMENT);
    }
  }

  private static void inspectEvidenceReferences(
      JsonNode context, Set<UUID> stepIds, UUID owner, Set<Category> categories) {
    for (JsonNode evidence : iterable(context.path("evidenceReferences"))) {
      if ("observed".equals(evidence.path("source").textValue())) {
        categories.add(Category.FALSE_OBSERVED_PROVENANCE);
      }
      UUID referenced = parseUuid(evidence.path("stepId").textValue());
      if (referenced != null
          && (!stepIds.contains(referenced) || owner != null && !owner.equals(referenced))) {
        categories.add(Category.ORPHAN_STEP_ID);
      }
    }
  }

  private static Iterable<JsonNode> iterable(JsonNode node) {
    List<JsonNode> values = new ArrayList<>();
    if (node.isArray()) {
      node.forEach(values::add);
    }
    return values;
  }

  private static UUID parseUuid(String value) {
    try {
      return value == null ? null : UUID.fromString(value);
    } catch (IllegalArgumentException ignored) {
      return null;
    }
  }

  private static Category categoryForViolation(ConstraintViolation<AuthoringV2Request> violation) {
    String path = violation.getPropertyPath().toString();
    return path.matches("steps\\[.*].id") ? Category.MISSING_STEP_ID : Category.INVALID_AUTHORING;
  }

  public enum Category {
    MISSING_STEP_ID,
    DUPLICATE_STEP_ID,
    MIXED_STEP_SHAPES,
    ORPHAN_STEP_ID,
    UNSUPPORTED_FIELD,
    INVALID_SECRET_PLACEMENT,
    INVALID_REFERENCE_PLACEMENT,
    FALSE_OBSERVED_PROVENANCE,
    INVALID_AUTHORING
  }

  /** Validation exception with stable machine-readable categories. */
  public static final class InvalidAuthoringException extends IllegalArgumentException {

    private final List<Category> categories;

    public InvalidAuthoringException(List<Category> categories) {
      super("Invalid Studio authoring request: " + categories);
      this.categories = List.copyOf(categories);
    }

    public InvalidAuthoringException(List<Category> categories, Throwable cause) {
      super("Invalid Studio authoring request: " + categories, cause);
      this.categories = List.copyOf(categories);
    }

    public List<Category> categories() {
      return categories;
    }
  }
}
