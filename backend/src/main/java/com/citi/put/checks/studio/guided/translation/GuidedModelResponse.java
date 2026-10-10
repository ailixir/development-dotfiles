package com.citi.put.checks.studio.guided.translation;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Objects;

/** Safe provider result: no raw response or exception text may be retained. */
public record GuidedModelResponse(
    Code code, JsonNode proposal, Integer inputTokens, Integer outputTokens, String providerModel) {
  public enum Code {
    OK,
    INVALID_RESPONSE,
    TOO_LARGE,
    BUSY,
    TIMEOUT,
    TRANSPORT,
    DISABLED
  }

  public GuidedModelResponse {
    Objects.requireNonNull(code);
    if ((code == Code.OK) != (proposal != null)
        || inputTokens != null && inputTokens < 0
        || outputTokens != null && outputTokens < 0) {
      throw new IllegalArgumentException("Invalid guided response");
    }
    proposal = proposal == null ? null : proposal.deepCopy();
  }

  @Override
  public JsonNode proposal() {
    return proposal == null ? null : proposal.deepCopy();
  }
}
