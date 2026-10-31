package com.citi.put.checks.studio.authoring;

import com.citi.put.checks.studio.dto.AuthoringRevisionInputs;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.validation.VariableReferenceValidator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Pure canonical identity and boundary algorithms frozen by STUDIO-OBS-015. */
public final class IncrementalAuthoringIdentity {
  public static final Comparator<String> UTF8 =
      (left, right) ->
          Arrays.compareUnsigned(
              left.getBytes(StandardCharsets.UTF_8), right.getBytes(StandardCharsets.UTF_8));
  private static final ObjectMapper MAPPER =
      new ObjectMapper()
          .findAndRegisterModules()
          .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
          .disable(
              com.fasterxml.jackson.databind.DeserializationFeature
                  .ADJUST_DATES_TO_CONTEXT_TIME_ZONE);
  private static final GuidedContracts CONTRACTS = new GuidedContracts();

  private IncrementalAuthoringIdentity() {}

  public record Identity(
      AuthoringRevisionInputs inputs,
      ObjectNode references,
      ObjectNode stepReferences,
      ArrayNode globalReferences) {}

  /**
   * Resolve against exactly the current declarations; no URI interpretation or missing-value hash.
   */
  public static Identity resolve(AuthoringV2Request authoring, List<StudioVariable> variables) {
    Map<String, JsonNode> names = new HashMap<>();
    Map<String, JsonNode> secrets = new HashMap<>();
    Map<String, String> values = new HashMap<>();
    for (StudioVariable variable : variables) {
      ObjectNode declaration =
          MAPPER
              .createObjectNode()
              .put("referenceId", variable.name())
              .put("kind", variable.kind());
      if (variable.kind().equals("plain")) {
        if (variable.value() != null) {
          values.put(variable.name(), variable.value());
          declaration.put("valueHash", GuidedContracts.hash(MAPPER.valueToTree(variable.value())));
        }
      } else if (variable.kind().equals("secretRef")
          && variable.secretId() != null
          && variable.secretId().matches("[A-Za-z0-9_.-]{1,64}")
          && !List.of(".", "..").contains(variable.secretId())) {
        declaration.put("secretId", variable.secretId());
      } else {
        throw ambiguous();
      }
      if (names.putIfAbsent(variable.name(), declaration) != null) {
        throw ambiguous();
      }
      if (variable.kind().equals("secretRef")) {
        JsonNode direct = declaration.deepCopy();
        ((ObjectNode) direct).put("referenceId", variable.secretId());
        JsonNode previous = secrets.putIfAbsent(variable.secretId(), direct);
        if (previous != null && !previous.equals(direct)) {
          throw ambiguous();
        }
      }
    }
    for (var entry : secrets.entrySet()) {
      JsonNode named = names.get(entry.getKey());
      if (named != null
          && (!named.path("kind").asText().equals("secretRef")
              || !named.path("secretId").equals(entry.getValue().path("secretId")))) {
        throw ambiguous();
      }
    }
    AuthoringRevisionInputs inputs = AuthoringRevisionIdentity.create(authoring, values);
    return collect(authoring, inputs, names, secrets);
  }

  /** The base has no live declaration/value lookup: every identity comes from frozen columns. */
  public static Identity frozen(
      AuthoringV2Request authoring, AuthoringRevisionInputs inputs, JsonNode references) {
    if (references.path("authoringIdentityVersion").asInt() != 1
        || !references.path("authoredDeclarations").isArray()
        || !AuthoringRevisionIdentity.valid(authoring, inputs)) {
      throw incomplete();
    }
    Map<String, JsonNode> names = new HashMap<>(), secrets = new HashMap<>();
    for (JsonNode item : references.path("authoredDeclarations")) {
      String key = item.path("referenceId").asText();
      if (names.putIfAbsent(key, item) != null) {
        throw incomplete();
      }
      if (item.path("kind").asText().equals("secretRef")) {
        ObjectNode direct = item.deepCopy();
        direct.put("referenceId", item.path("secretId").asText());
        secrets.put(item.path("secretId").asText(), direct);
      }
    }
    Identity result;
    try {
      result = collect(authoring, inputs, names, secrets);
    } catch (GuidedSessionException failure) {
      throw incomplete();
    }
    if (!result
        .references()
        .path("authoredDeclarations")
        .equals(references.path("authoredDeclarations"))) {
      throw incomplete();
    }
    return result;
  }

  public record Snapshot(AuthoringV2Request authoring, Identity identity) {}

  public static Snapshot snapshot(JsonNode snapshot) {
    try {
      CONTRACTS.validate("v3/authoring-snapshot#/definitions/AuthoringSnapshotIdentity", snapshot);
      AuthoringV2Request authoring =
          MAPPER.treeToValue(snapshot.path("authoring"), AuthoringV2Request.class);
      var hashes = new ArrayList<AuthoringRevisionInputs.NonsecretReferenceHash>();
      for (JsonNode declaration : snapshot.path("authoredDeclarations")) {
        if (declaration.path("kind").asText().equals("plain")) {
          hashes.add(
              new AuthoringRevisionInputs.NonsecretReferenceHash(
                  declaration.path("referenceId").asText(),
                  declaration.path("valueHash").asText()));
        }
      }
      AuthoringRevisionInputs inputs =
          AuthoringRevisionIdentity.fromReferenceHashes(authoring, hashes);
      ObjectNode references = MAPPER.createObjectNode().put("authoringIdentityVersion", 1);
      references.putArray("variables");
      references.putArray("secrets");
      references.set("authoredDeclarations", snapshot.path("authoredDeclarations"));
      return new Snapshot(authoring, frozen(authoring, inputs, references));
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new GuidedSessionException("INVALID_CONTRACT", 422);
    }
  }

  private static Identity collect(
      AuthoringV2Request authoring,
      AuthoringRevisionInputs inputs,
      Map<String, JsonNode> names,
      Map<String, JsonNode> secrets) {
    Map<String, JsonNode> all = new LinkedHashMap<>();
    ArrayNode global =
        collectScope(MAPPER.valueToTree(authoring.globalContext()), null, names, secrets, all);
    ObjectNode stepReferences = MAPPER.createObjectNode();
    for (var step : authoring.steps()) {
      stepReferences.set(
          step.id().toString(),
          collectScope(MAPPER.valueToTree(step.context()), step.text(), names, secrets, all));
    }
    if (all.size() > 500) {
      throw new GuidedSessionException("BUDGET_EXCEEDED", 429);
    }
    Map<String, String> plain = new HashMap<>();
    for (var item : inputs.nonsecretReferencedValues()) {
      plain.put(item.referenceId(), item.valueHash());
    }
    for (JsonNode declaration : all.values()) {
      if (declaration.path("kind").asText().equals("plain")
          && !declaration
              .path("valueHash")
              .asText()
              .equals(plain.get(declaration.path("referenceId").asText()))) {
        throw incomplete();
      }
    }
    ObjectNode references = MAPPER.createObjectNode().put("authoringIdentityVersion", 1);
    references.putArray("variables");
    references.putArray("secrets");
    ArrayNode declarations = references.putArray("authoredDeclarations");
    all.keySet().stream().sorted(UTF8).forEach(key -> declarations.add(all.get(key).deepCopy()));
    return new Identity(inputs, references, stepReferences, global);
  }

  private static ArrayNode collectScope(
      JsonNode context,
      String text,
      Map<String, JsonNode> names,
      Map<String, JsonNode> secrets,
      Map<String, JsonNode> all) {
    Map<String, JsonNode> local = new HashMap<>();
    for (JsonNode entry : context.path("entries")) {
      String kind = entry.path("kind").asText();
      JsonNode reference = kind.equals("default") ? entry.path("value") : entry;
      String referenceKind = reference.path("kind").asText();
      if (referenceKind.equals("variableRef") || referenceKind.equals("secretRef")) {
        add(
            local,
            all,
            names.get(reference.path("referenceId").asText()),
            referenceKind.equals("secretRef") ? "secretRef" : "plain");
      }
    }
    if (text != null) {
      for (String key : VariableReferenceValidator.variableTokens(text)) {
        add(local, all, names.get(key), "plain");
      }
      for (String key : VariableReferenceValidator.secretTokens(text)) {
        add(local, all, secrets.get(key), "secretRef");
      }
    }
    ArrayNode result = MAPPER.createArrayNode();
    local.keySet().stream().sorted(UTF8).forEach(key -> result.add(local.get(key).deepCopy()));
    return result;
  }

  private static void add(
      Map<String, JsonNode> local, Map<String, JsonNode> all, JsonNode declaration, String kind) {
    if (declaration == null || (kind.equals("plain") && !declaration.hasNonNull("valueHash"))) {
      throw new GuidedSessionException(
          "MISSING_SOURCE", 409, "AUTHORING_REFERENCE_MISSING", false, null);
    }
    if (!declaration.path("kind").asText().equals(kind)) {
      throw ambiguous();
    }
    String key = declaration.path("referenceId").asText();
    JsonNode previous = all.putIfAbsent(key, declaration);
    if (previous != null && !previous.equals(declaration)) {
      throw ambiguous();
    }
    local.put(key, declaration);
  }

  public static List<String> chains(
      AuthoringV2Request authoring, Identity identity, JsonNode configuration) {
    ObjectNode config =
        MAPPER.createObjectNode().put("domain", "studio.test-config").put("version", 1);
    for (String key :
        List.of("environment", "browser", "viewport", "timeoutSeconds", "waitStrategy")) {
      config.set(key, configuration.path(key));
    }
    config.put("globalContextHash", identity.inputs().globalContext());
    config.set("globalReferences", identity.globalReferences());
    String previous = GuidedContracts.hash(config);
    List<String> result = new ArrayList<>();
    for (var step : authoring.steps()) {
      ObjectNode input =
          MAPPER
              .createObjectNode()
              .put("domain", "studio.step-input")
              .put("version", 1)
              .put("stepId", step.id().toString())
              .put("text", step.text());
      input.set("context", MAPPER.valueToTree(step.context()));
      input.set("references", identity.stepReferences().path(step.id().toString()));
      ObjectNode chain =
          MAPPER
              .createObjectNode()
              .put("domain", "studio.step-chain")
              .put("version", 1)
              .put("stepId", step.id().toString())
              .put("stepInputHash", GuidedContracts.hash(input))
              .put("previous", previous);
      previous = GuidedContracts.hash(chain);
      result.add(previous);
    }
    return List.copyOf(result);
  }

  /** Returns a current-draft index; -1 means semantic READY, never UUID lexical ordering. */
  public static int boundary(
      AuthoringV2Request current,
      Identity currentIdentity,
      JsonNode currentConfiguration,
      AuthoringV2Request base,
      Identity baseIdentity,
      JsonNode baseConfiguration) {
    List<String> left = chains(current, currentIdentity, currentConfiguration);
    List<String> right = chains(base, baseIdentity, baseConfiguration);
    int size = Math.min(left.size(), right.size());
    for (int index = 0; index < size; index++) {
      if (!current.steps().get(index).id().equals(base.steps().get(index).id())
          || !left.get(index).equals(right.get(index))) {
        return index;
      }
    }
    return left.size() == right.size() ? -1 : Math.min(size, left.size() - 1);
  }

  /**
   * Projects learned semantics by producer/consumer step; evidence/admission identities excluded.
   */
  public static String learnedStepHash(JsonNode plan, String stepId) {
    ObjectNode content = MAPPER.createObjectNode();
    ArrayNode actions = content.putArray("actions");
    List<JsonNode> ordered = new ArrayList<>();
    plan.path("actions")
        .forEach(
            action -> {
              if (action.path("coordinate").path("stepId").asText().equals(stepId)) {
                ordered.add(action);
              }
            });
    ordered.sort(
        Comparator.comparingInt(action -> action.path("coordinate").path("ordinal").asInt()));
    for (JsonNode action : ordered) {
      ObjectNode copy = action.deepCopy();
      copy.remove("admissionId");
      actions.add(copy);
    }
    List<JsonNode> produced = new ArrayList<>(), consumed = new ArrayList<>();
    for (JsonNode binding : plan.path("bindings")) {
      if (binding.path("producer").path("stepId").asText().equals(stepId)) {
        ObjectNode copy = binding.deepCopy();
        copy.remove("consumers");
        ((ObjectNode) copy.path("provenance")).remove(List.of("sessionId", "producerAdmissionId"));
        produced.add(copy);
      }
      for (JsonNode edge : binding.path("consumers")) {
        if (edge.path("coordinate").path("stepId").asText().equals(stepId)) {
          ObjectNode copy = edge.deepCopy();
          copy.remove(List.of("producerAdmissionId", "consumerAdmissionId"));
          consumed.add(copy);
        }
      }
    }
    produced.sort(
        Comparator.comparingInt((JsonNode item) -> item.path("producer").path("ordinal").asInt())
            .thenComparing(item -> item.path("bindingId").asText(), UTF8));
    consumed.sort(
        Comparator.comparingInt((JsonNode item) -> item.path("coordinate").path("ordinal").asInt())
            .thenComparing(item -> item.path("bindingId").asText(), UTF8));
    ArrayNode producers = content.putArray("producedBindings"),
        consumers = content.putArray("consumedBindings");
    produced.forEach(producers::add);
    consumed.forEach(consumers::add);
    return GuidedContracts.hash(content);
  }

  public static ObjectNode snapshots(
      AuthoringV2Request authoring,
      Identity identity,
      JsonNode configuration,
      JsonNode learnedPlan) {
    ObjectNode result = MAPPER.createObjectNode();
    List<String> chains = chains(authoring, identity, configuration);
    for (int index = 0; index < authoring.steps().size(); index++) {
      String id = authoring.steps().get(index).id().toString();
      ObjectNode snapshot =
          MAPPER
              .createObjectNode()
              .put("domain", "studio.step-snapshot")
              .put("version", 1)
              .put("stepId", id)
              .put("inputChain", chains.get(index))
              .put("learnedStepHash", learnedStepHash(learnedPlan, id));
      result.put(id, GuidedContracts.hash(snapshot));
    }
    return result;
  }

  public static GuidedSessionException incomplete() {
    return new GuidedSessionException(
        "REVISION_CONFLICT", 409, "BASE_IDENTITY_INCOMPLETE", false, null);
  }

  private static GuidedSessionException ambiguous() {
    return new GuidedSessionException(
        "INVALID_CONTRACT", 422, "AUTHORING_REFERENCE_AMBIGUOUS", false, null);
  }
}
