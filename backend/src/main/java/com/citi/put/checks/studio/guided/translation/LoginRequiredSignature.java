package com.citi.put.checks.studio.guided.translation;

import com.fasterxml.jackson.databind.JsonNode;

/** Trusted structural failure annotation, with no page text heuristic or password value read. */
public final class LoginRequiredSignature {
  private LoginRequiredSignature() {}

  public static boolean matches(JsonNode observation) {
    if (observation.path("coverage").path("passwordControls").asInt() < 1) {
      return false;
    }
    for (JsonNode node : observation.path("nodes")) {
      if (node.path("visible").asBoolean()
          && node.path("actionable").asBoolean()
          && (java.util.Set.of("button", "input").contains(node.path("elementType").asText())
              || node.path("role").asText().equals("button"))) {
        return true;
      }
    }
    return false;
  }
}
