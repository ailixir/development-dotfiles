package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/** Provenance/policy classification, not an English parser or universal secret detector. */
public final class GuidedSourceClassifier {
  private static final Pattern TOKEN = Pattern.compile("<(var|secret)\\s+([A-Za-z0-9_.-]{1,64})>");
  private static final List<String> SLOTS =
      List.of("navigate.destination", "fill.value", "selectOption.value", "assert.expected");
  private final GuidedContracts contracts;
  private final GuidedTranslationProperties properties;
  private final CredentialPatternScreen screen;
  private final GuidedPromptAssembler prompts;

  public GuidedSourceClassifier(
      GuidedContracts contracts,
      GuidedTranslationProperties properties,
      CredentialPatternScreen screen) {
    this(contracts, properties, screen, new GuidedPromptAssembler(contracts));
  }

  public GuidedSourceClassifier(
      GuidedContracts contracts,
      GuidedTranslationProperties properties,
      CredentialPatternScreen screen,
      GuidedPromptAssembler prompts) {
    this.contracts = contracts;
    this.properties = properties;
    this.screen = screen;
    this.prompts = java.util.Objects.requireNonNull(prompts);
  }

  public void requireCurrentPolicy(JsonNode scope) {
    require(
        properties.permits(
            scope.path("applicationId").asText(), scope.path("environmentId").asText()),
        "FORBIDDEN_SCOPE",
        403);
  }

  public ObjectNode classify(JsonNode current, JsonNode scope) {
    requireCurrentPolicy(scope);
    require(
        current.path("sourceRevision").equals(scope.path("sourceRevision"))
            && current.path("configurationRevision").equals(scope.path("configurationRevision"))
            && current.path("csiId").equals(scope.path("csiId"))
            && current.path("environment").equals(scope.path("environmentId")),
        "REVISION_CONFLICT",
        409);
    JsonNode authoring = current.path("authoring");
    require(
        authoring.path("authoringSchemaVersion").asInt() == 2
            && authoring.path("steps").isArray()
            && !authoring.path("steps").isEmpty(),
        "RUNTIME_INCOMPATIBLE",
        409);
    com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.Identity identity;
    try {
      identity =
          com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.resolve(
              new com.fasterxml.jackson.databind.ObjectMapper()
                  .findAndRegisterModules()
                  .disable(
                      com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                  .treeToValue(authoring, com.citi.put.checks.studio.dto.AuthoringV2Request.class),
              com.citi.put.checks.studio.dto.CanonicalStudioCodec.variablesFromNode(
                  current.path("variables")));
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          "INVALID_CONTRACT", 422);
    }
    Map<String, JsonNode> declared = new HashMap<>();
    for (JsonNode variable : current.path("variables")) {
      if (variable.path("kind").asText().equals("plain")) {
        declared.put(variable.path("name").asText(), variable);
      }
    }
    ObjectNode result = contracts.object();
    for (String field : List.of("testId", "sourceRevision", "configurationRevision")) {
      result.set(field, current.path(field));
    }
    result.put("policy", "INPUT-POLICY-01-A");
    result.set("authoringSnapshot", authoring.deepCopy());
    result.put("authoringIdentityVersion", 1);
    result.set("authoredDeclarations", identity.references().path("authoredDeclarations"));
    result.set(
        "authoringRevisionInputs",
        new com.fasterxml.jackson.databind.ObjectMapper().valueToTree(identity.inputs()));
    result.set("schemaPins", prompts.schemaProvenance());
    var steps = result.putArray("sourceSteps");
    var configs = result.putArray("configurationReferences");
    var privateConfigs = result.putObject("configurationValues");
    var contexts = result.putArray("authoringContext");
    safeContext(authoring.path("globalContext"), "global", contexts);
    var ids = new HashSet<String>();
    for (JsonNode step : authoring.path("steps")) {
      require(
          step.path("id").isTextual() && step.path("text").isTextual(), "INVALID_CONTRACT", 422);
      String id = step.path("id").asText(), text = step.path("text").asText();
      try {
        UUID.fromString(id);
      } catch (IllegalArgumentException error) {
        throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
            "INVALID_CONTRACT", 422);
      }
      require(ids.add(id) && !text.isBlank() && text.length() <= 4000, "INVALID_CONTRACT", 422);
      screen.requireNoInlineCredentials(List.of(text));
      ObjectNode item = steps.addObject().put("stepId", id).put("text", text);
      var regions = item.putArray("regions");
      var token = TOKEN.matcher(text);
      int previous = 0;
      var used = new HashSet<String>();
      var usedSecrets = new HashSet<String>();
      while (token.find()) {
        if (previous < token.start()) {
          regions.addObject().put("startUtf16", previous).put("endUtf16", token.start());
        }
        String name = token.group(2);
        previous = token.end();
      }
      if (previous < text.length()) {
        regions.addObject().put("startUtf16", previous).put("endUtf16", text.length());
      }
      var references = new java.util.ArrayList<JsonNode>();
      identity.globalReferences().forEach(references::add);
      identity.stepReferences().path(id).forEach(references::add);
      for (JsonNode reference : references) {
        if (reference.path("kind").asText().equals("plain")) {
          used.add(reference.path("referenceId").asText());
        } else {
          usedSecrets.add(reference.path("secretId").asText());
        }
      }
      safeContext(step.path("context"), id, contexts);
      for (String name :
          usedSecrets.stream()
              .sorted(com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.UTF8)
              .toList()) {
        String reference =
            "cfg-"
                + UUID.nameUUIDFromBytes(
                    (id + ":secret:" + name + ":fill.value").getBytes(StandardCharsets.UTF_8));
        ObjectNode config =
            configs
                .addObject()
                .put("referenceId", reference)
                .put("stepId", id)
                .put("referenceName", name)
                .put("kind", "secretRef")
                .put("intendedSlot", "fill.value");
        privateConfigs.set(reference, config.deepCopy());
      }
      for (String name :
          used.stream()
              .sorted(com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.UTF8)
              .toList()) {
        JsonNode saved = declared.get(name).get("value");
        require(saved != null && saved.isTextual(), "MISSING_SOURCE", 409);
        // Empty text is an intentional clear-input value; null/missing is never coerced to text.
        String value = saved.textValue();
        for (String slot : SLOTS) {
          String reference =
              "cfg-"
                  + UUID.nameUUIDFromBytes(
                      (id + ":" + name + ":" + slot).getBytes(StandardCharsets.UTF_8));
          ObjectNode config =
              configs
                  .addObject()
                  .put("referenceId", reference)
                  .put("stepId", id)
                  .put("referenceName", name)
                  .put(
                      "kind", slot.equals("navigate.destination") ? "destination" : "nonsecretText")
                  .put("intendedSlot", slot);
          privateConfigs.set(reference, config.deepCopy().put("value", value));
        }
      }
    }
    require(steps.size() <= 100 && configs.size() <= 200, "BUDGET_EXCEEDED", 429);
    return result;
  }

  private void safeContext(
      JsonNode context, String step, com.fasterxml.jackson.databind.node.ArrayNode result) {
    for (JsonNode entry : context.path("entries")) {
      if (entry.path("kind").asText().equals("text")) {
        require(entry.path("value").isTextual(), "INVALID_CONTRACT", 422);
        String value = entry.path("value").asText();
        screen.requireNoInlineCredentials(List.of(value));
        require(value.length() <= 4000, "BUDGET_EXCEEDED", 429);
        if (!value.isEmpty()) {
          result.addObject().put("stepId", step).put("text", value);
        }
      }
    }
  }

  private static final class SetKinds {
    static boolean allowed(String kind) {
      return kind.equals("plain") || kind.equals("secretRef");
    }
  }
}
