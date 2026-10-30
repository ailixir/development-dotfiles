package com.citi.put.checks.studio.guided.translation;

import com.fasterxml.jackson.databind.JsonNode;

/** Trusted structural failure annotation, with no page text heuristic or password value read. */
public final class LoginRequiredSignature {
  private LoginRequiredSignature() {}

  public static boolean matches(JsonNode observation) {
    if (observation.path("coverage").path("passwordControls").asInt() < 1) {
      return false;
    }
    // ADR-SC-007: the facts carry a role but no visible or actionable flag; a page with a password
    // control and a button is the login shape. (A page with only a disabled button is annotated
    // too,
    // a harmless widening of an annotation.)
    for (JsonNode fact : observation.path("facts")) {
      if (fact.path("role").asText().equals("button")) {
        return true;
      }
    }
    return false;
  }
}
