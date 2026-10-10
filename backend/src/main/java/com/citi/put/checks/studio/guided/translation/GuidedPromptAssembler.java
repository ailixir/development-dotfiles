package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Only explicitly approved source and structural fields can cross the model boundary. */
public final class GuidedPromptAssembler {
  private final GuidedContracts contracts;
  private final String output;
  private final JsonNode schema;

  public GuidedPromptAssembler(GuidedContracts contracts) {
    this.contracts = contracts;
    output = resource("/studio/guided-output-contract.md");
    schema =
        contracts.parse(
            resource("/studio/observed-contracts/v2/guided-model-response.schema.json"));
  }

  public GuidedModelRequest assemble(
      String requestId,
      int attempt,
      GuidedModelRequest.Kind kind,
      JsonNode session,
      JsonNode progress,
      JsonNode state,
      JsonNode safeInputs,
      JsonNode remaining,
      JsonNode selectedSources,
      List<String> repairCodes,
      int maxOutputTokens) {
    ObjectNode context = contracts.object().put("schemaVersion", 2);
    context.set("sessionId", session.path("sessionId"));
    context.set("scopeHash", session.path("scopeHash"));
    for (String key : List.of("sourceRevision", "configurationRevision")) {
      context.set(key, session.path("scope").path(key));
    }
    JsonNode manifest = state.path("manifest");
    var steps = context.putArray("sourceSteps");
    for (JsonNode step : manifest.path("sourceSteps")) {
      steps
          .addObject()
          .setAll(java.util.Map.of("stepId", step.path("stepId"), "text", step.path("text")));
    }
    context.set("configurationReferences", manifest.path("configurationReferences"));
    context.set("authoringContext", manifest.path("authoringContext"));
    context.set("clarificationSelections", selectedSources);
    context.set("inputs", safeInputs);
    if (kind == GuidedModelRequest.Kind.SOURCE_PLAN) {
      var references = context.putArray("sourceReferences");
      state.path("plan").path("sourceReferences").forEach(references::add);
    }
    var obligations = context.putArray("obligations");
    for (JsonNode item : remaining) {
      ObjectNode safe = contracts.object();
      for (String key :
          List.of(
              "obligationId",
              "stepId",
              "occurrence",
              "operationKind",
              "targetIntent",
              "referenceIndex",
              "needId",
              "predicate")) {
        safe.set(key, item.path(key));
      }
      if (item.has("selectedLocator")) {
        safe.set("selectedLocator", item.path("selectedLocator"));
      }
      obligations.add(safe);
    }
    var needs = context.putArray("needs");
    for (JsonNode need : state.path("plan").path("needs")) {
      ObjectNode safe = contracts.object();
      for (String key : List.of("needId", "producerStepId", "consumers")) {
        safe.set(key, need.path(key));
      }
      safe.set(
          "bindingId",
          need.has("bindingId")
              ? need.path("bindingId")
              : com.fasterxml.jackson.databind.node.NullNode.instance);
      needs.add(safe);
    }
    context.set(
        "observation",
        progress.has("observation")
            ? progress.path("observation")
            : com.fasterxml.jackson.databind.node.NullNode.instance);
    context.set(
        "executionEvidence",
        progress.has("executionEvidence")
            ? progress.path("executionEvidence")
            : com.fasterxml.jackson.databind.node.NullNode.instance);
    int stepIndex = progress.path("stepIndex").asInt();
    context
        .putObject("coordinate")
        .put(
            "stepId",
            session
                .path("sourceSteps")
                .get(Math.min(stepIndex, session.path("sourceSteps").size() - 1))
                .path("stepId")
                .asText())
        .put("ordinal", progress.path("translationOrdinal").asInt());
    context.set(
        "authoredInputsHash",
        progress.has("authoredInputsHash")
            ? progress.path("authoredInputsHash")
            : com.fasterxml.jackson.databind.node.NullNode.instance);
    context.put("contextRevision", progress.path("contextRevision").asInt());
    var codes = context.putArray("repairCodes");
    repairCodes.forEach(codes::add);
    return new GuidedModelRequest(
        requestId,
        attempt,
        kind,
        new GuidedModelProjection(context),
        output,
        providerSchema(kind),
        maxOutputTokens);
  }

  /** Inline pinned local references, then project only provider-supported JSON-schema keywords. */
  public JsonNode providerSchema(GuidedModelRequest.Kind kind) {
    var alternatives = contracts.object().putArray("items");
    for (JsonNode candidate : schema.path("oneOf")) {
      JsonNode kindSchema = candidate.path("properties").path("kind");
      boolean matches = kindSchema.path("const").asText().equals(kind.name());
      for (JsonNode allowed : kindSchema.path("enum")) {
        matches |= allowed.asText().equals(kind.name());
      }
      if (matches) {
        alternatives.add(providerNode(candidate));
      }
    }
    JsonNode expanded =
        alternatives.size() == 1
            ? alternatives.get(0)
            : contracts.object().set("anyOf", alternatives);
    var counts = new java.util.LinkedHashMap<String, Integer>();
    var shapes = new java.util.LinkedHashMap<String, JsonNode>();
    countSchemas(expanded, counts, shapes);
    var names = new java.util.LinkedHashMap<String, String>();
    counts.forEach(
        (shape, count) -> {
          if (count > 1) {
            names.put(shape, "Shape" + names.size());
          }
        });
    ObjectNode compact = (ObjectNode) compactSchema(expanded, names, null);
    if (!names.isEmpty()) {
      ObjectNode definitions = compact.putObject("$defs");
      names.forEach(
          (shape, name) -> definitions.set(name, compactSchema(shapes.get(shape), names, shape)));
    }
    return compact;
  }

  private void countSchemas(
      JsonNode node,
      java.util.Map<String, Integer> counts,
      java.util.Map<String, JsonNode> shapes) {
    if (node.isObject()) {
      String canonical = GuidedContracts.canonical(node);
      if (node.has("type") && canonical.length() > 120) {
        counts.merge(canonical, 1, Integer::sum);
        shapes.putIfAbsent(canonical, node);
      }
      node.elements().forEachRemaining(child -> countSchemas(child, counts, shapes));
    } else if (node.isArray()) {
      node.forEach(child -> countSchemas(child, counts, shapes));
    }
  }

  private JsonNode compactSchema(
      JsonNode node, java.util.Map<String, String> names, String defining) {
    if (node.isArray()) {
      var result = contracts.object().putArray("items");
      node.forEach(child -> result.add(compactSchema(child, names, defining)));
      return result;
    }
    if (!node.isObject()) {
      return node.deepCopy();
    }
    String canonical = GuidedContracts.canonical(node);
    if (names.containsKey(canonical) && !canonical.equals(defining)) {
      return contracts.object().put("$ref", "#/$defs/" + names.get(canonical));
    }
    ObjectNode result = contracts.object();
    node.fields()
        .forEachRemaining(
            entry -> result.set(entry.getKey(), compactSchema(entry.getValue(), names, defining)));
    return result;
  }

  public ObjectNode schemaProvenance() {
    ObjectNode pins =
        contracts
            .object()
            .put("strictSchemaHash", GuidedContracts.hash(schema))
            .put(
                "sourceSelectionSchemaHash",
                GuidedContracts.hash(
                    contracts.parse(
                        resource("/studio/observed-contracts/v2/source-selection.schema.json"))))
            .put(
                "planningContextHash",
                GuidedContracts.hash(
                    contracts.parse(
                        resource("/studio/observed-contracts/v2/planning-context.schema.json"))))
            .put(
                "outputContractHash",
                GuidedContracts.hash(contracts.object().put("contract", output)));
    ObjectNode provider = pins.putObject("providerSchemaHashes");
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      provider.put(kind.name(), GuidedContracts.hash(providerSchema(kind)));
    }
    return pins;
  }

  private JsonNode providerNode(JsonNode node) {
    if (node.isArray()) {
      var result = contracts.object().putArray("items");
      node.forEach(child -> result.add(providerNode(child)));
      return result;
    }
    if (!node.isObject()) {
      return node.deepCopy();
    }
    if (node.has("$ref")) {
      String reference = node.path("$ref").asText();
      String prefix = "https://checks.citi.example/contracts/observed/v2/";
      if (!reference.startsWith(prefix)) {
        throw new IllegalStateException("Unsupported pinned guided schema reference");
      }
      String[] local = reference.substring(prefix.length()).split("#", -1);
      if (local.length > 2
          || !local[0].matches("[a-z0-9-]+\\.schema\\.json")
          || local.length == 2 && !local[1].matches("/definitions/[A-Za-z0-9]+")) {
        throw new IllegalStateException("Unsupported pinned guided schema reference");
      }
      JsonNode referenced = contracts.parse(resource("/studio/observed-contracts/v2/" + local[0]));
      if (local.length == 2) {
        referenced = referenced.at(local[1]);
      }
      if (!referenced.isObject()) {
        throw new IllegalStateException("Missing pinned guided schema");
      }
      return providerNode(referenced);
    }
    ObjectNode result = contracts.object();
    node.fields()
        .forEachRemaining(
            entry -> {
              String key = entry.getKey();
              if (List.of(
                      "$schema",
                      "$id",
                      "title",
                      "description",
                      "allOf",
                      "if",
                      "then",
                      "else",
                      "not",
                      "pattern",
                      "uniqueItems",
                      "minLength",
                      "maxLength")
                  .contains(key)) {
                return;
              }
              if (key.equals("const")) {
                JsonNode value = entry.getValue();
                if (value.isTextual()) {
                  result.put("type", "string").putArray("enum").add(value);
                } else if (value.isIntegralNumber()) {
                  result.put("type", "integer").set("minimum", value);
                  result.set("maximum", value);
                } else if (value.isBoolean()) {
                  result.put("type", "boolean");
                } else if (value.isNull()) {
                  result.put("type", "null");
                }

              } else if (key.equals("properties")) {
                ObjectNode properties = result.putObject("properties");
                entry
                    .getValue()
                    .fields()
                    .forEachRemaining(
                        property ->
                            properties.set(property.getKey(), providerNode(property.getValue())));
              } else {
                result.set(key.equals("oneOf") ? "anyOf" : key, providerNode(entry.getValue()));
              }
            });
    return result;
  }

  private static String resource(String name) {
    try (var in = GuidedPromptAssembler.class.getResourceAsStream(name)) {
      if (in == null) {
        throw new IllegalStateException("Missing guided contract resource");
      }
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    } catch (IOException error) {
      throw new IllegalStateException("Cannot read guided contract resource");
    }
  }
}
