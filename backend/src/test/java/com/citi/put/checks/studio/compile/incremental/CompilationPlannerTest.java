package com.citi.put.checks.studio.compile.incremental;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CompilationPlannerTest {
  private static final UUID A = UUID.fromString("00000000-0000-0000-0000-000000000001");
  private static final UUID B = UUID.fromString("00000000-0000-0000-0000-000000000002");
  private static final UUID C = UUID.fromString("00000000-0000-0000-0000-000000000003");
  private static final List<CompilationPlanner.Step> SOURCE =
      List.of(
          new CompilationPlanner.Step(A, "Login"),
          new CompilationPlanner.Step(B, "Search"),
          new CompilationPlanner.Step(C, "Expect found"));
  private static final List<String> CODE =
      List.of(
          "await page.goto('https://example.com');",
          "await page.getByRole('button').click();",
          "await expect(page.getByText('Found')).toBeVisible();");

  private static CompilationPlanner.Baseline baseline(boolean scope, boolean passed) {
    return new CompilationPlanner.Baseline(
        UUID.randomUUID(), UUID.randomUUID(), SOURCE, CODE, "pins", scope, passed, true);
  }

  private static List<CompilationPlanner.Step> edit(int index) {
    return java.util.stream.IntStream.range(0, 3)
        .mapToObj(
            i ->
                i == index
                    ? new CompilationPlanner.Step(SOURCE.get(i).id(), "Changed")
                    : SOURCE.get(i))
        .toList();
  }

  private static CompilationPlanner.Plan plan(List<CompilationPlanner.Step> steps) {
    return CompilationPlanner.plan(steps, false, true, true, true, "pins", baseline(true, true));
  }

  @Test
  void finalEditReusesExactPrefixAndNeverClaimsExecutionReuse() throws Exception {
    var steps = edit(2);
    var plan = plan(steps);
    assertThat(plan.mode()).isEqualTo(CompilationPlanner.Mode.INCREMENTAL);
    assertThat(plan.writableIds()).containsExactly(C);
    String generated = "await expect(page.getByText('Missing')).not.toBeVisible();";
    String proposal =
        "{\"version\":1,\"kind\":\"PATCH\",\"steps\":[{\"stepId\":\""
            + C
            + "\",\"status\":\"GENERATED\",\"code\":\""
            + generated
            + "\"}]}";
    var result = IncrementalAssembler.assemble(steps, plan, baseline(true, true), proposal);
    var artifact = new ObjectMapper().readTree(result.artifactJson());
    assertThat(artifact.path("steps")).hasSize(3);
    assertThat(artifact.path("steps").get(0).path("code").textValue()).isEqualTo(CODE.get(0));
    assertThat(artifact.path("steps").get(1).path("code").textValue()).isEqualTo(CODE.get(1));
    assertThat(artifact.path("steps").get(2).path("code").textValue()).isEqualTo(generated);
    assertThat(artifact.path("steps").get(2).path("originalText").textValue()).isEqualTo("Changed");
  }

  @Test
  void middleEditRegeneratesEntireSuffixAndEarlyEditAllSteps() {
    assertThat(plan(edit(1)).writableIds()).containsExactly(B, C);
    assertThat(plan(edit(0)).mode()).isEqualTo(CompilationPlanner.Mode.FULL);
  }

  @Test
  void unknownScopeOrUnprovenLegacyBaselineNeverReusesPrefix() {
    assertThat(
            CompilationPlanner.plan(edit(2), false, true, true, false, "pins", baseline(true, true))
                .mode())
        .isEqualTo(CompilationPlanner.Mode.FULL);
    assertThat(
            CompilationPlanner.plan(edit(2), false, true, true, true, "pins", baseline(false, true))
                .mode())
        .isEqualTo(CompilationPlanner.Mode.FULL);
    assertThat(
            CompilationPlanner.plan(edit(2), false, true, true, true, "pins", baseline(true, false))
                .mode())
        .isEqualTo(CompilationPlanner.Mode.FULL);
    assertThat(
            CompilationPlanner.plan(edit(2), false, true, false, true, "pins", baseline(true, true))
                .mode())
        .isEqualTo(CompilationPlanner.Mode.FULL);
  }

  @Test
  void changedPinsStructuralEditsAndExplicitRebuildCannotReuse() {
    assertThat(
            CompilationPlanner.plan(SOURCE, true, true, true, true, "pins", baseline(true, true))
                .mode())
        .isEqualTo(CompilationPlanner.Mode.FULL);
    assertThat(
            CompilationPlanner.plan(SOURCE, false, true, true, true, "new", baseline(true, true))
                .mode())
        .isEqualTo(CompilationPlanner.Mode.FULL);
    assertThat(plan(List.of(SOURCE.get(1), SOURCE.get(0), SOURCE.get(2))).reason())
        .isEqualTo("STRUCTURAL_CHANGE");
    assertThatThrownBy(() -> plan(List.of(SOURCE.get(0), SOURCE.get(0))))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void unchangedConfigurationCandidateCanReuseWithoutPassingEvidenceEvenWhenFlagOff() {
    var plan =
        CompilationPlanner.plan(SOURCE, false, false, true, false, "pins", baseline(false, false));
    assertThat(plan.mode()).isEqualTo(CompilationPlanner.Mode.REUSE);
    assertThat(
            IncrementalAssembler.assemble(SOURCE, plan, baseline(false, false), null).executable())
        .isTrue();
  }

  @Test
  void flagOffReportsIncrementalDisabledAheadOfEveryIncompatibilityReason() {
    var reordered = List.of(SOURCE.get(1), SOURCE.get(0), SOURCE.get(2));
    // Contract §3: EXPLICIT_FULL, then INCREMENTAL_DISABLED, ahead of rank-4 incompatibilities.
    assertThat(
            CompilationPlanner.plan(
                    edit(2), false, false, false, true, "pins", baseline(true, true))
                .reason())
        .isEqualTo("INCREMENTAL_DISABLED");
    assertThat(
            CompilationPlanner.plan(
                    reordered, false, false, true, true, "pins", baseline(true, true))
                .reason())
        .isEqualTo("INCREMENTAL_DISABLED");
    assertThat(
            CompilationPlanner.plan(SOURCE, false, false, true, true, "new", baseline(true, true))
                .reason())
        .isEqualTo("INCREMENTAL_DISABLED");
    assertThat(
            CompilationPlanner.plan(SOURCE, false, false, true, false, "pins", baseline(true, true))
                .reason())
        .isEqualTo("INCREMENTAL_DISABLED");
    assertThat(
            CompilationPlanner.plan(edit(2), false, false, true, true, "pins", baseline(true, true))
                .reason())
        .isEqualTo("INCREMENTAL_DISABLED");
    assertThat(CompilationPlanner.plan(edit(2), false, false, true, true, "pins", null).reason())
        .isEqualTo("INCREMENTAL_DISABLED");
    assertThat(
            CompilationPlanner.plan(SOURCE, true, false, true, true, "pins", baseline(true, true))
                .reason())
        .isEqualTo("EXPLICIT_FULL");
    var unchanged =
        CompilationPlanner.plan(SOURCE, false, false, true, true, "pins", baseline(true, false));
    assertThat(unchanged.mode()).isEqualTo(CompilationPlanner.Mode.REUSE);
    assertThat(unchanged.reason()).isEqualTo("UNCHANGED_SOURCE");
  }

  @Test
  void flagOnKeepsTheIncompatibilityReasons() {
    assertThat(
            CompilationPlanner.plan(edit(2), false, true, false, true, "pins", baseline(true, true))
                .reason())
        .isEqualTo("LEGACY_MAPPING");
    assertThat(
            CompilationPlanner.plan(SOURCE, false, true, true, true, "new", baseline(true, true))
                .reason())
        .isEqualTo("FINGERPRINT_CHANGE");
    assertThat(CompilationPlanner.plan(edit(2), false, true, true, true, "pins", null).reason())
        .isEqualTo("NO_ELIGIBLE_BASELINE");
  }

  @Test
  void patchCannotWriteProtectedOmitDuplicateOrSupplySource() {
    var steps = edit(2);
    var plan = plan(steps);
    String valid =
        "{\"version\":1,\"kind\":\"PATCH\",\"steps\":[{\"stepId\":\""
            + C
            + "\",\"status\":\"GENERATED\",\"code\":\"await page.goto('https://example.com');\"}]}";
    for (String invalid :
        List.of(
            valid + " {}",
            valid + " false",
            valid.replace(C.toString(), A.toString()),
            valid.replace("PATCH", "FULL"),
            valid.replace("\"code\":", "\"originalText\":\"rewrite\",\"code\":"),
            valid.replace("\"version\":1", "\"version\":1,\"version\":1"),
            "{\"version\":1,\"kind\":\"PATCH\",\"steps\":[]}")) {
      assertThatThrownBy(
              () -> IncrementalAssembler.assemble(steps, plan, baseline(true, true), invalid))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void unsupportedMeansNoExecutablePartialArtifactOrOldCodeFallback() {
    String proposal =
        "{\"version\":1,\"kind\":\"PATCH\",\"steps\":[{\"stepId\":\""
            + C
            + "\",\"status\":\"UNSUPPORTED\",\"reason\":\"UNSUPPORTED_CAPABILITY\","
            + "\"message\":\"Second tab unavailable\"}]}";
    var result =
        IncrementalAssembler.assemble(edit(2), plan(edit(2)), baseline(true, true), proposal);
    assertThat(result.executable()).isFalse();
    assertThat(result.artifactJson()).isNull();
    assertThat(result.rejections()).hasSize(1);
  }

  @Test
  void staleRetainedSourceRejectedBeforeAssembly() {
    var wrong =
        new CompilationPlanner.Baseline(
            UUID.randomUUID(), UUID.randomUUID(), edit(0), CODE, "pins", true, true, true);
    var plan =
        new CompilationPlanner.Plan(
            CompilationPlanner.Mode.REUSE, "UNCHANGED_SOURCE", List.of(), 3);
    assertThatThrownBy(() -> IncrementalAssembler.assemble(SOURCE, plan, wrong, null))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
