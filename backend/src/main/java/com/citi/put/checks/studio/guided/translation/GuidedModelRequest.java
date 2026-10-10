package com.citi.put.checks.studio.guided.translation;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Objects;

/** A guided authoring request, deliberately incompatible with FULL/PATCH compilation. */
public record GuidedModelRequest(
    String requestId,
    int attempt,
    Kind kind,
    GuidedModelProjection projection,
    String outputContract,
    JsonNode responseSchema,
    int maxOutputTokens) {
  public enum Kind {
    SOURCE_PLAN,
    NEXT_ACTION,
    VERIFY_STEP
  }

  public GuidedModelRequest {
    Objects.requireNonNull(requestId);
    Objects.requireNonNull(kind);
    Objects.requireNonNull(projection);
    Objects.requireNonNull(outputContract);
    Objects.requireNonNull(responseSchema);
    if (requestId.isBlank()
        || requestId.length() > 256
        || attempt < 1
        || attempt > 3
        || maxOutputTokens < 1
        || maxOutputTokens > 32000) {
      throw new IllegalArgumentException("Invalid guided request bounds");
    }
    responseSchema = responseSchema.deepCopy();
  }

  @Override
  public JsonNode responseSchema() {
    return responseSchema.deepCopy();
  }
}
