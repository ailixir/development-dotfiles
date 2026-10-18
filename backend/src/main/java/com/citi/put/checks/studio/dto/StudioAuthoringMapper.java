package com.citi.put.checks.studio.dto;

import com.citi.put.checks.studio.StudioService.AuthoringDraft;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.authoring.AuthoringLimits;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.validation.Validator;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Explicit v2 negotiation composes the existing metadata and authoring DTOs on the same routes. */
@Component
public class StudioAuthoringMapper {
  private static final Set<String> FIELDS =
      Set.of(
          "authoringSchemaVersion",
          "globalContext",
          "steps",
          "name",
          "description",
          "csiId",
          "environment",
          "variables",
          "configuration",
          "sourceRevision",
          "configurationRevision");
  private final ObjectMapper mapper;
  private final Validator validator;
  private final AuthoringLimits authoringLimits;

  public StudioAuthoringMapper(
      ObjectMapper mapper, Validator validator, AuthoringLimits authoringLimits) {
    this.mapper = mapper;
    this.validator = validator;
    this.authoringLimits = authoringLimits;
  }

  private UITestRequest metadata(JsonNode body) {
    try {
      UITestRequest request =
          mapper
              .copy()
              .enable(
                  com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
              .treeToValue(body, UITestRequest.class);
      if (request == null) {
        throw new StudioValidationException("INVALID_AUTHORING", "Request must be an object");
      }
      // VAL-024: the step-count and line-length bounds apply at save, first, so an over-limit draft
      // is refused with a stable code before anything is written.
      authoringLimits.requireSaveable(request.steps());
      CanonicalStudioCodec.validateForWrite(request);
      CanonicalStudioCodec.variablesToJson(request.variables());
      return request;
    } catch (JsonProcessingException exception) {
      throw new StudioValidationException("INVALID_AUTHORING", "Invalid draft request");
    }
  }

  public ParsedWrite read(JsonNode body, boolean update) {
    if (body == null || !body.isObject()) {
      throw new StudioValidationException("INVALID_AUTHORING", "Request must be an object");
    }
    body.fieldNames()
        .forEachRemaining(
            field -> {
              if (!FIELDS.contains(field)) {
                throw new StudioValidationException(
                    "UNSUPPORTED_FIELD", "Unsupported field: " + field);
              }
            });
    if (!body.path("authoringSchemaVersion").isInt()
        || body.path("authoringSchemaVersion").intValue() != 2) {
      throw new StudioValidationException("INVALID_AUTHORING", "authoringSchemaVersion must be 2");
    }
    ObjectNode source = mapper.createObjectNode();
    source.set("authoringSchemaVersion", body.get("authoringSchemaVersion"));
    source.set("steps", body.get("steps"));
    if (body.has("globalContext")) {
      source.set("globalContext", body.get("globalContext"));
    }
    if (body.path("steps").isArray()) {
      java.util.List<String> lines = new java.util.ArrayList<>();
      boolean canonical = true;
      for (JsonNode step : body.path("steps")) {
        canonical &= step.isObject() && step.path("text").isTextual();
        lines.add(step.path("text").asText());
      }
      if (canonical) {
        authoringLimits.requireSaveable(lines);
      }
    }
    AuthoringV2Request authoring;
    try {
      authoring = StudioAuthoringValidation.read(mapper, validator, source);
    } catch (StudioAuthoringValidation.InvalidAuthoringException exception) {
      throw new StudioValidationException(
          exception.categories().getFirst().name(), "Invalid authoring source");
    }
    if (update) {
      // A fixed order, so a body missing both names the same field every time.
      for (String revision : java.util.List.of("sourceRevision", "configurationRevision")) {
        JsonNode token = body.path(revision);
        if (!token.isIntegralNumber() || !token.canConvertToLong() || token.longValue() < 1) {
          throw new StudioValidationException(
              "INVALID_AUTHORING", revision + " must be a positive integer");
        }
      }
    }
    ObjectNode metadata = ((ObjectNode) body).deepCopy();
    metadata.remove(Set.of("authoringSchemaVersion", "globalContext"));
    metadata.set(
        "steps", mapper.valueToTree(authoring.steps().stream().map(AuthoringStep::text).toList()));
    return new ParsedWrite(metadata(metadata), authoring);
  }

  public ObjectNode response(AuthoringDraft draft) {
    ObjectNode result = mapper.valueToTree(draft.test());
    ObjectNode authoring = mapper.valueToTree(draft.authoring());
    result.setAll(authoring);
    if (draft.readinessReason() != null) {
      result.put("readinessReason", draft.readinessReason());
    }
    return result;
  }

  /** An internal composition, not an independently maintained request schema. */
  public record ParsedWrite(UITestRequest metadata, AuthoringV2Request authoring) {}
}
