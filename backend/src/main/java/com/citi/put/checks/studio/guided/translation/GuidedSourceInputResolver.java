package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

/** Server provenance and exact source slicing; no model-created bytes or trust flags. */
public final class GuidedSourceInputResolver {
  private final GuidedContracts contracts;

  public GuidedSourceInputResolver(GuidedContracts contracts) {
    this.contracts = contracts;
  }

  public GuidedSourceReferenceValidator.Sources sources(JsonNode session, JsonNode manifest) {
    var steps = new LinkedHashMap<String, GuidedSourceReferenceValidator.Source>();
    for (JsonNode step : manifest.path("sourceSteps")) {
      var regions = new ArrayList<GuidedSourceReferenceValidator.ClassifiedRegion>();
      for (JsonNode region : step.path("regions")) {
        regions.add(
            new GuidedSourceReferenceValidator.ClassifiedRegion(
                region.path("startUtf16").asInt(), region.path("endUtf16").asInt()));
      }
      steps.put(
          step.path("stepId").asText(),
          new GuidedSourceReferenceValidator.Source(step.path("text").asText(), regions));
    }
    var configs = new LinkedHashMap<String, GuidedSourceReferenceValidator.ConfigurationValue>();
    manifest
        .path("configurationValues")
        .fields()
        .forEachRemaining(
            entry -> {
              JsonNode value = entry.getValue();
              configs.put(
                  entry.getKey(),
                  new GuidedSourceReferenceValidator.ConfigurationValue(
                      value.has("value") ? value.path("value").asText() : null,
                      value.path("stepId").asText(),
                      value.path("kind").asText(),
                      value.path("intendedSlot").asText(),
                      session.path("scopeHash").asText(),
                      !value.path("kind").asText().equals("secretRef"),
                      value.path("referenceName").asText()));
            });
    return new GuidedSourceReferenceValidator.Sources(
        manifest.path("sourceRevision").asText(),
        manifest.path("configurationRevision").asText(),
        steps,
        configs);
  }

  public void validate(JsonNode session, JsonNode manifest, JsonNode references) {
    require(references.isArray() && references.size() <= 200, "INVALID_CONTRACT", 422);
    var validator = new GuidedSourceReferenceValidator(contracts);
    var seen = new java.util.HashSet<String>();
    for (JsonNode reference : references) {
      require(seen.add(GuidedContracts.hash(reference)), "INVALID_CONTRACT", 422);
      validator.resolve(session, sources(session, manifest), reference);
    }
  }

  /** Safe correlation is provenance based; private values never enter the result. */
  public Map<Integer, String> allocationIds(JsonNode references, JsonNode context) {
    Map<Integer, String> result = new LinkedHashMap<>();
    for (int index = 0; index < references.size(); index++) {
      for (JsonNode input : context.path("authoredInputs").path("inputs")) {
        if (input.path("provenance").equals(references.get(index))) {
          result.put(index, input.path("inputId").asText());
        }
      }
      require(result.containsKey(index), "MISSING_SOURCE", 409);
    }
    return Map.copyOf(result);
  }
}
