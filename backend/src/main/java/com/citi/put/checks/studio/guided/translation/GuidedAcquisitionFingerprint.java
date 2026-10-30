package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.LinkedHashMap;
import java.util.Map;

/** Acquisition identity is semantic; the protocol observation hash remains byte-exact. */
public final class GuidedAcquisitionFingerprint {
  private GuidedAcquisitionFingerprint() {}

  public static String hash(JsonNode observation) {
    var json = new com.fasterxml.jackson.databind.ObjectMapper();
    if (!observation.isObject()) {
      return GuidedContracts.hash(json.createObjectNode().put("missing", true));
    }
    ObjectNode normalized = json.createObjectNode();
    for (String field :
        java.util.List.of("documentId", "origin", "scopeHash", "readRuleId", "coverage")) {
      normalized.set(
          field,
          observation.has(field)
              ? observation.path(field).deepCopy()
              : com.fasterxml.jackson.databind.node.NullNode.instance);
    }
    Map<String, String> refs = new LinkedHashMap<>();
    for (String ref : GuidedOutline.shownRefs(observation.path("outline").asText())) {
      refs.put(ref, "n" + refs.size());
    }
    var lines = normalized.putArray("outline");
    for (String raw : observation.path("outline").asText().split("\n", -1)) {
      var parsed = GuidedOutline.parse(raw);
      if (parsed.size() != 1) {
        lines.add(raw);
        continue;
      }
      var line = parsed.getFirst();
      var semantic = lines.addObject().put("indent", line.indent()).put("role", line.role());
      if (line.name() == null) {
        semantic.putNull("name");
      } else {
        semantic.put("name", line.name());
      }
      if (line.ref() == null) {
        semantic.putNull("ref");
      } else {
        semantic.put("ref", refs.get(line.ref()));
      }
      semantic.put("rest", line.rest());
    }
    var facts = normalized.putArray("facts");
    for (String ref : refs.keySet()) {
      ObjectNode fact = ((ObjectNode) observation.path("facts").path(ref)).deepCopy();
      if (fact.has("scopeRefs")) {
        normalizeRefs(fact, "scopeRefs", refs);
      }
      if (fact.path("readScope").isObject()) {
        normalizeRefs((ObjectNode) fact.path("readScope"), "sourceRefs", refs);
      }
      facts.add(fact);
    }
    return GuidedContracts.hash(normalized);
  }

  private static void normalizeRefs(ObjectNode owner, String field, Map<String, String> refs) {
    JsonNode prior = owner.path(field);
    var normalized = owner.putArray(field);
    for (JsonNode ref : prior) {
      normalized.add(refs.getOrDefault(ref.asText(), "MISSING"));
    }
  }
}
