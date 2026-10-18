package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;

/** Strict local validation remains authoritative over the provider schema projection. */
public final class GuidedResponseParser {
  private final GuidedContracts contracts;

  public GuidedResponseParser(GuidedContracts contracts) {
    this.contracts = contracts;
  }

  public JsonNode parse(GuidedModelRequest request, byte[] response) {
    require(response != null && response.length <= 65536, "INVALID_CONTRACT", 422);
    JsonNode result = contracts.parseWire(response);
    contracts.validate("v3/guided-model-response", result);
    require(
        result.path("kind").asText().equals(request.kind().name())
            && result.path("requestId").asText().equals(request.requestId()),
        "INVALID_CONTRACT",
        422);
    return result;
  }
}
