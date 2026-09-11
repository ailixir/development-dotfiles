package com.citi.put.checks.studio.dispatch;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;

/**
 * Reads the declared reference <em>names</em> off a confirmed revision (§9.2).
 *
 * <p>The revision's {@code "references"} column holds declarations and never values, which is the
 * whole point of the column: names persist, values do not. This reader therefore cannot leak one,
 * because there is nothing in its input to leak.
 */
public final class ExecutionReferences {

  private ExecutionReferences() {}

  /** Declared names, in declaration order, from any of the shapes the column has carried. */
  public static List<String> declaredNames(ObjectMapper mapper, String referencesJson) {
    if (referencesJson == null || referencesJson.isBlank()) {
      return List.of();
    }
    JsonNode node;
    try {
      node = mapper.readTree(referencesJson);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException("Stored revision references are not readable JSON", e);
    }
    List<String> names = new ArrayList<>();
    collect(node, names);
    return List.copyOf(names);
  }

  private static void collect(JsonNode node, List<String> names) {
    if (node == null || node.isNull() || node.isMissingNode()) {
      return;
    }
    if (node.isTextual()) {
      names.add(node.textValue());
      return;
    }
    if (node.isArray()) {
      node.forEach(element -> collect(element, names));
      return;
    }
    if (node.isObject()) {
      JsonNode name = node.path("name");
      if (name.isTextual()) {
        names.add(name.textValue());
        return;
      }
      JsonNode reference = node.path("reference");
      if (reference.isTextual()) {
        names.add(reference.textValue());
        return;
      }
      node.fields().forEachRemaining(entry -> collect(entry.getValue(), names));
    }
  }
}
