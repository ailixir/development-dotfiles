package com.citi.put.checks.studio.secrets;

import com.citi.put.checks.studio.internal.InternalCallbackCodes;
import com.citi.put.checks.studio.internal.InternalCallbackException;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.internal.dto.RunnerStepState;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Raw completed receipts and frozen recipes establish use before projection can round or merge. */
public final class ObservedProgressSecretEvidence {
  private ObservedProgressSecretEvidence() {}

  public static void require(RunnerReport report, JsonNode artifact) {
    if (!RunnerReport.PROGRESS.equals(report.kind()) || report.secretUse().isEmpty()) {
      return;
    }
    if (report.browserStartedAt() == null
        || report.outcome() != null
        || report.evidence() != null
        || report.secretUse().values().stream().anyMatch(value -> !"USED".equals(value))) {
      throw invalid();
    }
    JsonNode steps = artifact.path("steps"), recipes = artifact.path("inputRecipes");
    if (!steps.isArray() || !recipes.isArray() || report.steps() == null) {
      throw invalid();
    }
    Map<String, JsonNode> byInput = new HashMap<>();
    for (JsonNode recipe : recipes) {
      String id = recipe.path("inputId").asText();
      if (id.isEmpty() || byInput.putIfAbsent(id, recipe) != null) {
        throw invalid();
      }
    }
    int prior = -1;
    Set<String> proven = new HashSet<>();
    for (RunnerStepState receipt : report.steps()) {
      if (receipt == null
          || receipt.stepIndex() == null
          || receipt.stepIndex() <= prior
          || receipt.stepIndex() < 0
          || receipt.stepIndex() >= steps.size()) {
        throw invalid();
      }
      prior = receipt.stepIndex();
      if (!"PASS".equals(receipt.status())) {
        continue;
      }
      if (receipt.failure() != null
          || !reading(receipt.startedAtMs())
          || !reading(receipt.finishedAtMs())
          || !reading(receipt.durationMs())
          || receipt.finishedAtMs() < receipt.startedAtMs()
          || Math.abs(receipt.durationMs() - (receipt.finishedAtMs() - receipt.startedAtMs()))
              >= 0.001) {
        throw invalid();
      }
      JsonNode frozen = steps.get(receipt.stepIndex());
      if (frozen.path("stepIndex").asInt(-1) != receipt.stepIndex()
          || frozen.path("stepId").asText().isEmpty()
          || !frozen.path("operations").isArray()) {
        throw invalid();
      }
      for (JsonNode action : frozen.path("operations")) {
        for (JsonNode use : action.path("operation").path("uses")) {
          if (!use.path("kind").asText().equals("secret")) {
            continue;
          }
          String name = use.path("id").asText();
          boolean declared = false;
          for (JsonNode recipe : byInput.values()) {
            declared |=
                recipe.path("kind").asText().equals("secretRef")
                    && recipe.path("stepId").equals(frozen.path("stepId"))
                    && recipe.path("provenance").path("kind").asText().equals("configuration")
                    && recipe.path("provenance").path("referenceName").asText().equals(name);
          }
          if (!declared
              || !action.path("coordinate").path("stepId").equals(frozen.path("stepId"))
              || !StudioVaultProvider.isValidSecretName(name)) {
            throw invalid();
          }
          proven.add(name);
        }
      }
    }
    if (!proven.containsAll(report.secretUse().keySet())) {
      throw invalid();
    }
  }

  private static boolean reading(Double value) {
    return value != null && Double.isFinite(value) && value >= 0;
  }

  private static InternalCallbackException invalid() {
    return InternalCallbackException.badRequest(
        InternalCallbackCodes.INVALID_REPORT, "Invalid completed secret-use evidence");
  }
}
