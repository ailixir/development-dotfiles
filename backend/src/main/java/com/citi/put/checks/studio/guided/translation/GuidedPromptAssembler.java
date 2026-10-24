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
  private final java.util.Map<String, JsonNode> schemaInputs;
  private final java.util.Map<GuidedModelRequest.Kind, JsonNode> providerSchemas;
  private final ObjectNode provenance;
  private final PreparationCapability preparationCapability;

  public GuidedPromptAssembler(GuidedContracts contracts) {
    this(contracts, false);
  }

  private GuidedPromptAssembler(GuidedContracts contracts, boolean productionFactory) {
    this.contracts = contracts;
    output = resource("/studio/guided-output-contract.md");
    schema =
        contracts.parse(
            resource("/studio/observed-contracts/v3/guided-model-response.schema.json"));
    java.util.Map<String, JsonNode> inputs = new java.util.HashMap<>();
    inputs.put("guided-model-response.schema.json", schema);
    inputs.put(
        "source-selection.schema.json",
        contracts.parse(resource("/studio/observed-contracts/v3/source-selection.schema.json")));
    inputs.put(
        "planning-context.schema.json",
        contracts.parse(resource("/studio/observed-contracts/v3/planning-context.schema.json")));
    var providers =
        new java.util.EnumMap<GuidedModelRequest.Kind, JsonNode>(GuidedModelRequest.Kind.class);
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      providers.put(kind, buildProviderSchema(kind, inputs));
    }
    schemaInputs = java.util.Map.copyOf(inputs);
    providerSchemas = java.util.Map.copyOf(providers);
    provenance = buildSchemaProvenance();
    preparationCapability = productionFactory ? new PreparationCapability(this) : null;
  }

  static GuidedPromptAssembler createForProductionFactory(GuidedContracts contracts) {
    return new GuidedPromptAssembler(contracts, true);
  }

  PreparationCapability preparationCapability() {
    return preparationCapability;
  }

  static final class PreparationCapability {
    private final GuidedPromptAssembler owner;

    private PreparationCapability(GuidedPromptAssembler owner) {
      this.owner = owner;
    }

    boolean ownedBy(GuidedPromptAssembler candidate) {
      return owner == candidate;
    }
  }

  public static String maskSecretTokens(String text) {
    var matcher = java.util.regex.Pattern.compile("<secret\\s+[A-Za-z0-9_.-]{1,64}>").matcher(text);
    var safe = new StringBuilder(text);
    while (matcher.find()) {
      for (int i = matcher.start(); i < matcher.end(); i++) {
        safe.setCharAt(i, ' ');
      }
    }
    return safe.toString();
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
    ObjectNode context =
        buildPositiveContext(
            kind, session, progress, state, safeInputs, remaining, selectedSources, repairCodes);
    return new GuidedModelRequest(
        requestId,
        attempt,
        kind,
        new GuidedModelProjection(context),
        output,
        providerSchema(kind),
        maxOutputTokens);
  }

  ObjectNode buildPositiveContext(
      GuidedModelRequest.Kind kind,
      JsonNode session,
      JsonNode progress,
      JsonNode state,
      JsonNode safeInputs,
      JsonNode remaining,
      JsonNode selectedSources,
      List<String> repairCodes) {
    ObjectNode context = contracts.object().put("schemaVersion", 3);
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
          .setAll(
              java.util.Map.of(
                  "stepId",
                  step.path("stepId"),
                  "text",
                  com.fasterxml.jackson.databind.node.TextNode.valueOf(
                      maskSecretTokens(step.path("text").asText()))));
    }
    context.set("configurationReferences", manifest.path("configurationReferences"));
    context.set("authoringContext", manifest.path("authoringContext"));
    context.set("clarificationSelections", selectedSources);
    context.set("inputs", safeInputs);
    if (kind == GuidedModelRequest.Kind.SOURCE_PLAN && progress.has("learningWindow")) {
      context.set("learningWindow", progress.path("learningWindow"));
    }
    if (kind == GuidedModelRequest.Kind.SOURCE_PLAN) {
      var references = context.putArray("sourceReferences");
      if (state.hasNonNull("plan")) {
        state.path("plan").path("sourceReferences").forEach(ref -> references.add(ref.deepCopy()));
      } else if (!progress.has("learningWindow")
          && selectedSources.isArray()
          && selectedSources.isEmpty()) {
        references.addAll(new GuidedAuthoredUriCandidates(contracts).candidates(session, manifest));
      }
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
              "scopeIntent",
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
    return context;
  }

  static final class PreparedProjection {
    private final PreparationCapability capability;
    private final ObjectNode context;
    private final String contextJson;
    private final String key;
    private final int attempt;
    private final GuidedModelRequest.Kind kind;
    private final int outputCap;
    private final GuidedModelRequest request;
    private final int wireBytes;
    private final String failureCode;
    private final int failureStatus;

    private PreparedProjection(
        PreparationCapability capability,
        ObjectNode context,
        String key,
        int attempt,
        GuidedModelRequest.Kind kind,
        int outputCap,
        GuidedModelRequest request,
        int wireBytes,
        String failureCode,
        int failureStatus) {
      this.capability = capability;
      this.context = context;
      this.contextJson = context.toString();
      this.key = key;
      this.attempt = attempt;
      this.kind = kind;
      this.outputCap = outputCap;
      this.request = request;
      this.wireBytes = wireBytes;
      this.failureCode = failureCode;
      this.failureStatus = failureStatus;
    }

    private boolean matches(
        ObjectNode fresh,
        String actualKey,
        int actualAttempt,
        GuidedModelRequest.Kind actualKind,
        int actualOutputCap) {
      return java.util.Objects.equals(key, actualKey)
          && attempt == actualAttempt
          && kind == actualKind
          && outputCap == actualOutputCap
          && context.equals(fresh)
          && contextJson.equals(fresh.toString());
    }

    Integer bytesFor(GuidedModelRequest completed) {
      return request != null && completed == request ? wireBytes : null;
    }
  }

  PreparedProjection preparePure(
      PreparationCapability capability,
      ObjectNode context,
      String key,
      int attempt,
      GuidedModelRequest.Kind kind,
      int outputCap) {
    if (capability == null || capability != preparationCapability || !capability.ownedBy(this)) {
      return null;
    }
    try {
      ObjectNode owned = context.deepCopy();
      try {
        // Metadata comes from this immutable epoch, never the provenance observation getter.
        GuidedModelRequest request =
            new GuidedModelRequest(
                key,
                attempt,
                kind,
                new GuidedModelProjection(owned),
                output,
                providerSchemas.get(kind),
                outputCap);
        ObjectNode payload =
            contracts
                .object()
                .put("kind", request.kind().name())
                .put("requestId", request.requestId())
                .put("attempt", request.attempt());
        payload.set("context", request.projection().document());
        ObjectNode wire =
            contracts
                .object()
                .put("contents", payload.toString())
                .put("systemInstruction", request.outputContract());
        wire.set("responseJsonSchema", request.responseSchema());
        int bytes = wire.toString().getBytes(StandardCharsets.UTF_8).length + 2048;
        return new PreparedProjection(
            capability, owned, key, attempt, kind, outputCap, request, bytes, null, 0);
      } catch (com.citi.put.checks.studio.guided.session.GuidedSessionException failure) {
        String fixed = failure.getMessage();
        if (!(fixed.equals("INVALID_CONTRACT") && failure.status() == 422
            || fixed.equals("RUNTIME_INCOMPATIBLE") && failure.status() == 409)) {
          return null;
        }
        return new PreparedProjection(
            capability,
            owned,
            key,
            attempt,
            kind,
            outputCap,
            null,
            0,
            fixed.equals("INVALID_CONTRACT") ? "INVALID_CONTRACT" : "RUNTIME_INCOMPATIBLE",
            failure.status());
      }
    } catch (RuntimeException unavailable) {
      return null; // No raw failure retained; actual guarded original computation decides.
    }
    // Error deliberately propagates. It never becomes an optimization or product success.
  }

  GuidedModelRequest completePreparedOrOriginal(
      PreparationCapability capability,
      PreparedProjection prepared,
      String key,
      int attempt,
      GuidedModelRequest.Kind kind,
      JsonNode session,
      JsonNode progress,
      JsonNode state,
      JsonNode safeInputs,
      JsonNode remaining,
      JsonNode selectedSources,
      List<String> repairs,
      int outputCap) {
    if (capability == null
        || capability != preparationCapability
        || !capability.ownedBy(this)
        || prepared == null
        || prepared.capability != capability) {
      return assemble(
          key,
          attempt,
          kind,
          session,
          progress,
          state,
          safeInputs,
          remaining,
          selectedSources,
          repairs,
          outputCap);
    }
    ObjectNode fresh =
        buildPositiveContext(
            kind, session, progress, state, safeInputs, remaining, selectedSources, repairs);
    if (!prepared.matches(fresh, key, attempt, kind, outputCap)) {
      return assemble(
          key,
          attempt,
          kind,
          session,
          progress,
          state,
          safeInputs,
          remaining,
          selectedSources,
          repairs,
          outputCap);
    }
    // Replayed only at the original planning validation point, after all fresh input refusals.
    if (prepared.failureCode != null) {
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          prepared.failureCode, prepared.failureStatus);
    }
    JsonNode actualSchema = providerSchema(kind); // Original fresh request-metadata observation.
    if (!output.equals(prepared.request.outputContract())
        || !actualSchema.equals(prepared.request.responseSchema())
        || !actualSchema.toString().equals(prepared.request.responseSchema().toString())) {
      return assemble(
          key,
          attempt,
          kind,
          session,
          progress,
          state,
          safeInputs,
          remaining,
          selectedSources,
          repairs,
          outputCap);
    }
    return prepared.request;
  }

  /** Inline pinned local references, then project only provider-supported JSON-schema keywords. */
  public JsonNode providerSchema(GuidedModelRequest.Kind kind) {
    return providerSchemas.get(kind).deepCopy();
  }

  private JsonNode buildProviderSchema(
      GuidedModelRequest.Kind kind, java.util.Map<String, JsonNode> inputs) {
    var alternatives = contracts.object().putArray("items");
    for (JsonNode candidate : schema.path("oneOf")) {
      JsonNode kindSchema = candidate.path("properties").path("kind");
      boolean matches = kindSchema.path("const").asText().equals(kind.name());
      for (JsonNode allowed : kindSchema.path("enum")) {
        matches |= allowed.asText().equals(kind.name());
      }
      if (matches) {
        alternatives.add(providerNode(candidate, inputs));
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
    } else {
      if (node.isArray()) {
        node.forEach(child -> countSchemas(child, counts, shapes));
      }
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
    return provenance.deepCopy();
  }

  private ObjectNode buildSchemaProvenance() {
    ObjectNode pins =
        contracts
            .object()
            .put("strictSchemaHash", GuidedContracts.hash(schema))
            .put(
                "sourceSelectionSchemaHash",
                GuidedContracts.hash(schemaInputs.get("source-selection.schema.json")))
            .put(
                "planningContextHash",
                GuidedContracts.hash(schemaInputs.get("planning-context.schema.json")))
            .put(
                "outputContractHash",
                GuidedContracts.hash(contracts.object().put("contract", output)));
    ObjectNode provider = pins.putObject("providerSchemaHashes");
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      provider.put(kind.name(), GuidedContracts.hash(providerSchemas.get(kind)));
    }
    return pins;
  }

  private JsonNode providerNode(JsonNode node, java.util.Map<String, JsonNode> inputs) {
    if (node.isArray()) {
      var result = contracts.object().putArray("items");
      node.forEach(child -> result.add(providerNode(child, inputs)));
      return result;
    }
    if (!node.isObject()) {
      return node.deepCopy();
    }
    if (node.has("$ref")) {
      String reference = node.path("$ref").asText();
      String prefix = "https://checks.citi.example/contracts/observed/v3/";
      if (!reference.startsWith(prefix)) {
        throw new IllegalStateException("Unsupported pinned guided schema reference");
      }
      String[] local = reference.substring(prefix.length()).split("#", -1);
      if (local.length > 2
          || !local[0].matches("[a-z0-9-]+\\.schema\\.json")
          || local.length == 2 && !local[1].matches("/definitions/[A-Za-z0-9]+")) {
        throw new IllegalStateException("Unsupported pinned guided schema reference");
      }
      JsonNode referenced =
          inputs.computeIfAbsent(
              local[0], name -> contracts.parse(resource("/studio/observed-contracts/v3/" + name)));
      if (local.length == 2) {
        referenced = referenced.at(local[1]);
      }
      if (!referenced.isObject()) {
        throw new IllegalStateException("Missing pinned guided schema");
      }
      return providerNode(referenced, inputs);
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
                      // Large array caps can make Vertex reject its generation grammar (400).
                      // The pinned local schema still enforces every cardinality limit.
                      "maxItems",
                      "minLength",
                      "maxLength")
                  .contains(key)) {
                return;
              }
              if (key.equals("const")) {
                JsonNode value = entry.getValue();
                if (value.isTextual()) {
                  result.put("type", "string").putArray("enum").add(value);
                } else {
                  if (value.isIntegralNumber()) {
                    result.put("type", "integer").set("minimum", value);
                    result.set("maximum", value);
                  } else {
                    if (value.isBoolean()) {
                      result.put("type", "boolean");
                    } else {
                      if (value.isNull()) {
                        result.put("type", "null");
                      }
                    }
                  }
                }

              } else {
                if (key.equals("properties")) {
                  ObjectNode properties = result.putObject("properties");
                  entry
                      .getValue()
                      .fields()
                      .forEachRemaining(
                          property ->
                              properties.set(
                                  property.getKey(), providerNode(property.getValue(), inputs)));
                } else {
                  result.set(
                      key.equals("oneOf") ? "anyOf" : key, providerNode(entry.getValue(), inputs));
                }
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
