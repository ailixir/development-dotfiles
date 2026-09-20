package com.citi.put.checks.studio.compile.incremental;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Pure C0 planner. Baseline authorization/evidence must be established by the capture transaction.
 */
public final class CompilationPlanner {
  public enum Mode {
    FULL,
    INCREMENTAL,
    REUSE
  }

  public record Step(UUID id, String text) {
    public Step {
      Objects.requireNonNull(id);
      Objects.requireNonNull(text);
    }
  }

  public record Baseline(
      UUID revisionId,
      UUID requestId,
      List<Step> steps,
      List<String> code,
      String fingerprint,
      boolean reviewedScope,
      boolean successfulFullExecution,
      boolean configurationCompatible) {
    public Baseline {
      steps = List.copyOf(steps);
      code = List.copyOf(code);
      if (steps.size() != code.size()) {
        throw new IllegalArgumentException("Baseline source/code count differs");
      }
    }
  }

  public record Plan(Mode mode, String reason, List<UUID> writableIds, int reusedPrefix) {
    public Plan {
      writableIds = List.copyOf(writableIds);
    }
  }

  private CompilationPlanner() {}

  public static Plan plan(
      List<Step> current,
      boolean explicitFull,
      boolean enabled,
      boolean reliableMapping,
      boolean reviewedScope,
      String fingerprint,
      Baseline baseline) {
    requireUnique(current);
    if (explicitFull) {
      return full(current, "EXPLICIT_FULL");
    }
    if (!reliableMapping) {
      return full(current, "LEGACY_MAPPING");
    }
    if (baseline == null) {
      return full(current, enabled ? "NO_ELIGIBLE_BASELINE" : "INCREMENTAL_DISABLED");
    }
    requireUnique(baseline.steps());
    if (!baseline.configurationCompatible()) {
      return full(current, "FINGERPRINT_CHANGE");
    }
    if (!Objects.equals(fingerprint, baseline.fingerprint())) {
      return full(current, "FINGERPRINT_CHANGE");
    }
    if (!current.stream()
        .map(Step::id)
        .toList()
        .equals(baseline.steps().stream().map(Step::id).toList())) {
      return full(current, "STRUCTURAL_CHANGE");
    }
    int first = 0;
    while (first < current.size() && current.get(first).equals(baseline.steps().get(first))) {
      first++;
    }
    // Existing compatible configuration-only candidate reuse does not need a historical pass.
    if (first == current.size() && reviewedScope == baseline.reviewedScope()) {
      return new Plan(Mode.REUSE, "UNCHANGED_SOURCE", List.of(), first);
    }
    if (first == current.size()) {
      return full(current, "SCOPE_UNKNOWN");
    }
    if (!enabled) {
      return full(current, "INCREMENTAL_DISABLED");
    }
    if (!baseline.successfulFullExecution()) {
      return full(current, "NO_ELIGIBLE_BASELINE");
    }
    if (!reviewedScope || !baseline.reviewedScope()) {
      return full(current, "SCOPE_UNKNOWN");
    }
    if (first == 0) {
      return full(current, "ALL_STEPS_AFFECTED");
    }
    return new Plan(
        Mode.INCREMENTAL,
        "SCOPED_SUFFIX",
        current.subList(first, current.size()).stream().map(Step::id).toList(),
        first);
  }

  private static Plan full(List<Step> steps, String reason) {
    return new Plan(Mode.FULL, reason, steps.stream().map(Step::id).toList(), 0);
  }

  private static void requireUnique(List<Step> steps) {
    if (steps.isEmpty()
        || steps.size() > 100
        || steps.stream().map(Step::id).distinct().count() != steps.size()) {
      throw new IllegalArgumentException("Invalid ordered step identities");
    }
  }
}
