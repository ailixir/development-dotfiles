package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.compile.gateway.CompileRequest;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Converts historical handwritten artifact fixtures to the new model envelope at the stub boundary.
 */
final class ProposalFixtures {
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private ProposalFixtures() {}

  static CompileResponse fromArtifact(CompileRequest request, CompileResponse response) {
    if (!response.isOk()) {
      return response;
    }
    return CompileResponse.ok(
        envelope(request, response.artifactJson()),
        response.provenance(),
        response.retries(),
        response.latencyMs(),
        response.inputBytes(),
        response.outputBytes());
  }

  static String envelope(CompileRequest request, String artifact) {
    try {
      JsonNode input = MAPPER.readTree(artifact);
      if (input.has("kind")) {
        return artifact;
      }
      var root = MAPPER.createObjectNode();
      // Preserve deliberately invalid versions rather than sanitizing negative fixtures.
      root.set("version", input.path("version"));
      root.put("kind", request.proposalKind());
      var steps = root.putArray("steps");
      for (JsonNode step : input.path("steps")) {
        int index = step.path("stepIndex").asInt(-1);
        var generated = steps.addObject();
        generated.put(
            "stepId",
            index >= 0 && index < request.writableStepIds().size()
                ? request.writableStepIds().get(index).toString()
                : "invalid-fixture-step-id");
        generated.put("status", "GENERATED");
        generated.set("code", step.path("code"));
      }
      return root.toString();
    } catch (java.io.IOException malformedFixture) {
      return artifact;
    }
  }
}
