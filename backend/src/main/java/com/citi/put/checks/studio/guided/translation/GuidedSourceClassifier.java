package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.compile.CredentialPatternScreen;
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

  public GuidedSourceClassifier(
      GuidedContracts contracts,
      GuidedTranslationProperties properties,
      CredentialPatternScreen screen) {
    this.contracts = contracts;
    this.properties = properties;
    this.screen = screen;
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
    Map<String, JsonNode> declared = new HashMap<>();
    var secretIds = new HashSet<String>();
    for (JsonNode variable : current.path("variables")) {
      String kind = variable.path("kind").asText();
      require(SetKinds.allowed(kind), "INVALID_CONTRACT", 422);
      if (kind.equals("plain")) {
        require(
            variable.path("name").isTextual()
                && declared.putIfAbsent(variable.path("name").textValue(), variable) == null,
            "INVALID_CONTRACT",
            422);
      } else {
        JsonNode identifier =
            variable.hasNonNull("secretId") ? variable.path("secretId") : variable.path("name");
        require(identifier.isTextual(), "INVALID_CONTRACT", 422);
        secretIds.add(identifier.textValue());
      }
    }
    require(declared.keySet().stream().noneMatch(secretIds::contains), "FORBIDDEN_SCOPE", 403);
    ObjectNode result = contracts.object();
    for (String field : List.of("testId", "sourceRevision", "configurationRevision")) {
      result.set(field, current.path(field));
    }
    result.put("policy", "INPUT-POLICY-01-A");
    result.set("schemaPins", new GuidedPromptAssembler(contracts).schemaProvenance());
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
      // Reuse the canonical reference parser; the matching regex below only masks its exact spans.
      require(
          com.citi.put.checks.studio.validation.VariableReferenceValidator.variableTokens(text)
                  .stream()
                  .allMatch(declared::containsKey)
              && secretIds.containsAll(
                  com.citi.put.checks.studio.validation.VariableReferenceValidator.secretTokens(
                      text)),
          "FORBIDDEN_SCOPE",
          403);
      ObjectNode item = steps.addObject().put("stepId", id).put("text", text);
      var regions = item.putArray("regions");
      var token = TOKEN.matcher(text);
      int previous = 0;
      var used = new HashSet<String>();
      while (token.find()) {
        if (previous < token.start()) {
          regions.addObject().put("startUtf16", previous).put("endUtf16", token.start());
        }
        String name = token.group(2);
        require(
            token.group(1).equals("var") ? declared.containsKey(name) : secretIds.contains(name),
            "FORBIDDEN_SCOPE",
            403);
        if (token.group(1).equals("var")) {
          used.add(name);
        }
        previous = token.end();
      }
      if (previous < text.length()) {
        regions.addObject().put("startUtf16", previous).put("endUtf16", text.length());
      }
      for (JsonNode entry : step.path("context").path("entries")) {
        if (entry.path("kind").asText().equals("variableRef")) {
          require(entry.path("referenceId").isTextual(), "FORBIDDEN_SCOPE", 403);
          String name = entry.path("referenceId").asText();
          require(
              declared.containsKey(name)
                  && declared.get(name).path("kind").asText().equals("plain"),
              "FORBIDDEN_SCOPE",
              403);
          used.add(name);
        }
      }
      safeContext(step.path("context"), id, contexts);
      for (String name : used.stream().sorted().toList()) {
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
