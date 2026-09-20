package com.citi.put.checks.studio.compile.incremental;

import com.citi.put.checks.studio.compile.CompilePins;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Treats every model response as untrusted; executable positions and source are server-owned. */
public final class IncrementalAssembler {
  private static final ObjectMapper MAPPER =
      new ObjectMapper()
          .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
          .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

  public record Rejection(UUID stepId, String status, String reason, String message) {}

  public record Result(String artifactJson, List<Rejection> rejections) {
    public Result {
      rejections = List.copyOf(rejections);
    }

    public boolean executable() {
      return artifactJson != null && rejections.isEmpty();
    }
  }

  private IncrementalAssembler() {}

  public static Result assemble(
      List<CompilationPlanner.Step> current,
      CompilationPlanner.Plan plan,
      CompilationPlanner.Baseline baseline,
      String proposal) {
    Map<UUID, String> generated = new LinkedHashMap<>();
    List<Rejection> rejected = new ArrayList<>();
    if (plan.mode() != CompilationPlanner.Mode.REUSE) {
      JsonNode root;
      try {
        root = MAPPER.readTree(proposal);
      } catch (java.io.IOException | IllegalArgumentException e) {
        throw new IllegalArgumentException("Invalid proposal JSON");
      }
      String kind = plan.mode() == CompilationPlanner.Mode.FULL ? "FULL" : "PATCH";
      if (!keys(root, Set.of("version", "kind", "steps"))
          || !root.path("version").isIntegralNumber()
          || !root.path("version").canConvertToInt()
          || root.path("version").intValue() != 1
          || !root.path("kind").isTextual()
          || !kind.equals(root.path("kind").textValue())
          || !root.path("steps").isArray()
          || root.path("steps").size() != plan.writableIds().size()) {
        throw new IllegalArgumentException("Invalid proposal envelope");
      }
      Set<UUID> seen = new HashSet<>();
      for (JsonNode step : root.path("steps")) {
        UUID id;
        try {
          id = UUID.fromString(step.path("stepId").textValue());
        } catch (IllegalArgumentException | NullPointerException e) {
          throw new IllegalArgumentException("Invalid proposal step identity");
        }
        if (!id.toString().equals(step.path("stepId").textValue())
            || !plan.writableIds().contains(id)
            || !seen.add(id)) {
          throw new IllegalArgumentException("Proposal exceeds frozen write scope");
        }
        String status = step.path("status").textValue();
        if ("GENERATED".equals(status)) {
          if (!keys(step, Set.of("stepId", "status", "code"))
              || !boundedText(step.path("code"), 2000)) {
            throw new IllegalArgumentException("Invalid generated step");
          }
          generated.put(id, step.path("code").textValue());
        } else {
          String reason = step.path("reason").textValue();
          if (!keys(step, Set.of("stepId", "status", "reason", "message"))
              || !("UNSUPPORTED".equals(status) && "UNSUPPORTED_CAPABILITY".equals(reason)
                  || "CLARIFICATION".equals(status) && "AMBIGUOUS_INTENT".equals(reason))
              || !boundedText(step.path("message"), 400)) {
            throw new IllegalArgumentException("Invalid unsupported outcome");
          }
          rejected.add(new Rejection(id, status, reason, step.path("message").textValue()));
        }
      }
    } else if (proposal != null) {
      throw new IllegalArgumentException("Reuse must not consume inference output");
    }
    if (!rejected.isEmpty()) {
      return new Result(null, rejected);
    }
    ObjectNode artifact =
        MAPPER.createObjectNode().put("version", CompilePins.SUPPORTED_ARTIFACT_VERSION);
    ArrayNode steps = artifact.putArray("steps");
    for (int index = 0; index < current.size(); index++) {
      CompilationPlanner.Step source = current.get(index);
      String code;
      if (index < plan.reusedPrefix()) {
        if (baseline == null
            || index >= baseline.steps().size()
            || !source.equals(baseline.steps().get(index))) {
          throw new IllegalArgumentException("Reused source does not match pinned baseline");
        }
        code = baseline.code().get(index);
      } else {
        code = generated.get(source.id());
        if (code == null) {
          throw new IllegalArgumentException("Missing generated step");
        }
      }
      steps
          .addObject()
          .put("stepIndex", index)
          .put("originalText", source.text())
          .put("code", code);
    }
    return new Result(artifact.toString(), List.of());
  }

  private static boolean boundedText(JsonNode value, int limit) {
    return value.isTextual() && !value.textValue().isBlank() && value.textValue().length() <= limit;
  }

  private static boolean keys(JsonNode node, Set<String> expected) {
    if (node == null || !node.isObject()) {
      return false;
    }
    Set<String> keys = new HashSet<>();
    node.fieldNames().forEachRemaining(keys::add);
    return keys.equals(expected);
  }
}
