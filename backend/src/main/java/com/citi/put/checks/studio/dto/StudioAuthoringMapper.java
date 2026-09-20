package com.citi.put.checks.studio.dto;

import com.citi.put.checks.studio.StudioService.AuthoringDraft;
import com.citi.put.checks.studio.StudioValidationException;
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

  public StudioAuthoringMapper(ObjectMapper mapper, Validator validator) {
    this.mapper = mapper;
    this.validator = validator;
  }

  public UITestRequest legacy(JsonNode body) {
    try {
      UITestRequest request = mapper.treeToValue(body, UITestRequest.class);
      if (request == null) {
        throw new StudioValidationException("INVALID_AUTHORING", "Request must be an object");
      }
      LegacyStudioAdapter.validateForWrite(request);
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
    AuthoringV2Request authoring;
    try {
      authoring = (AuthoringV2Request) StudioAuthoringValidation.read(mapper, validator, source);
    } catch (StudioAuthoringValidation.InvalidAuthoringException exception) {
      throw new StudioValidationException(
          exception.categories().getFirst().name(), "Invalid authoring source");
    }
    if (update) {
      for (String revision : Set.of("sourceRevision", "configurationRevision")) {
        JsonNode token = body.path(revision);
        if (!token.isIntegralNumber() || !token.canConvertToLong() || token.longValue() < 1) {
          throw new StudioValidationException(
              "INVALID_AUTHORING", "Positive revision tokens are required");
        }
      }
    }
    ObjectNode metadata = ((ObjectNode) body).deepCopy();
    metadata.remove(Set.of("authoringSchemaVersion", "globalContext"));
    metadata.set(
        "steps", mapper.valueToTree(authoring.steps().stream().map(AuthoringStep::text).toList()));
    return new ParsedWrite(legacy(metadata), authoring);
  }

  public ObjectNode response(AuthoringDraft draft) {
    ObjectNode result = mapper.valueToTree(draft.test());
    ObjectNode authoring = mapper.valueToTree(draft.authoring());
    result.setAll(authoring);
    return result;
  }

  /** An internal composition, not an independently maintained request schema. */
  public record ParsedWrite(UITestRequest metadata, AuthoringV2Request authoring) {}
}
