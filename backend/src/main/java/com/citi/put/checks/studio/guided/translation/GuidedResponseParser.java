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

  /** Opt-in local attribution; the old entry point and its mock dispatch remain unchanged. */
  JsonNode parse(
      GuidedModelRequest request, byte[] response, GuidedRefusalDiagnostics.Capture capture) {
    if (capture == GuidedRefusalDiagnostics.Capture.NONE) {
      return parse(request, response);
    }
    JsonNode result;
    try {
      require(response != null && response.length <= 65536, "INVALID_CONTRACT", 422);
      result = contracts.parseWire(response);
    } catch (RuntimeException failure) {
      GuidedRefusalDiagnostics.record(capture, GuidedRefusalDiagnostics.Gate.WIRE_CANONICAL);
      throw failure;
    }
    try {
      contracts.validate("v3/guided-model-response", result);
    } catch (RuntimeException failure) {
      GuidedRefusalDiagnostics.record(capture, GuidedRefusalDiagnostics.Gate.STRICT_SCHEMA);
      throw failure;
    }
    try {
      require(
          result.path("kind").asText().equals(request.kind().name())
              && result.path("requestId").asText().equals(request.requestId()),
          "INVALID_CONTRACT",
          422);
    } catch (RuntimeException failure) {
      GuidedRefusalDiagnostics.record(capture, GuidedRefusalDiagnostics.Gate.REQUEST_IDENTITY);
      throw failure;
    }
    return result;
  }
}
