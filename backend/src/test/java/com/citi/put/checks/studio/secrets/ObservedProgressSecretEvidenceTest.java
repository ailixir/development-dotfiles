package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.internal.dto.RunnerStepState;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Raw proof boundaries; actual report CAS/child kill preservation remains an integration oracle.
 */
class ObservedProgressSecretEvidenceTest {
  private final ObjectMapper mapper = new ObjectMapper();

  private ObjectNode artifact() throws Exception {
    return (ObjectNode)
        mapper.readTree(
            ("{\"steps\":[{\"stepIndex\":0,\"stepId\":\"password-step\",\"operations\":[{\"coordina"
                + "te\":{\"stepId\":\"password-step\",\"ordinal\":0},\"operation\":{\"kind\":\"fill\",\""
                + "value\":{\"kind\":\"secretRef\",\"sourceInputId\":\"input-pass\"}}}]}],\"inputRecipes"
                + "\":[{\"inputId\":\"input-pass\",\"stepId\":\"password-step\",\"kind\":\"secretRef\","
                + "\"intendedSlot\":\"fill.value\",\"provenance\":{\"kind\":\"configuration\",\"referenc"
                + "eName\":\"PASS\"}}]}"));
  }

  private RunnerReport report(
      String kind, List<RunnerStepState> steps, Instant browser, Map<String, String> usage) {
    return new RunnerReport(
        UUID.randomUUID(),
        UUID.randomUUID(),
        UUID.randomUUID(),
        "worker",
        kind,
        2L,
        Instant.now(),
        browser,
        steps,
        List.of(),
        false,
        Map.of(),
        null,
        null,
        false,
        usage);
  }

  private RunnerStepState pass() {
    return new RunnerStepState(0, "PASS", 0.25, 10.75, 10.5, null);
  }

  @Test
  void genuineFractionalCompletedPasswordReceiptSupportsOnlyItsFrozenSecret() throws Exception {
    var body = report("PROGRESS", List.of(pass()), Instant.now(), Map.of("PASS", "USED"));
    assertThatCode(() -> ObservedProgressSecretEvidence.require(body, artifact()))
        .doesNotThrowAnyException();
    assertThatThrownBy(
            () ->
                ObservedProgressSecretEvidence.require(
                    report("PROGRESS", List.of(pass()), Instant.now(), Map.of("OTHER", "USED")),
                    artifact()))
        .hasMessageContaining("Invalid completed secret-use evidence");
  }

  @Test
  void reducedPayloadRetainsPositiveOnlyWhenItsCompletedPassReceiptSurvives() throws Exception {
    var body = reducedProgress(List.of(pass()), Map.of("PASS", "USED"));
    assertThatCode(() -> ObservedProgressSecretEvidence.require(body, artifact()))
        .doesNotThrowAnyException();
  }

  @Test
  void reducedPayloadCannotCarryPositiveWhoseCompletedPassReceiptWasShed() throws Exception {
    var body = reducedProgress(List.of(), Map.of("PASS", "USED"));
    assertThatThrownBy(() -> ObservedProgressSecretEvidence.require(body, artifact()))
        .hasMessageContaining("Invalid completed secret-use evidence");
    assertThatCode(
            () ->
                ObservedProgressSecretEvidence.require(
                    reducedProgress(List.of(), Map.of()), artifact()))
        .doesNotThrowAnyException();
  }

  /** Controlled protocol reduction; this validator fixture never claims browser effects. */
  private RunnerReport reducedProgress(List<RunnerStepState> steps, Map<String, String> usage) {
    var original = report("PROGRESS", steps, Instant.now(), usage);
    return new RunnerReport(
        original.executionId(),
        original.attemptId(),
        original.admissionId(),
        original.runnerInstanceId(),
        original.kind(),
        original.runnerSequence(),
        original.reportedAt(),
        original.browserStartedAt(),
        original.steps(),
        original.logs(),
        original.logsTruncated(),
        original.runtimeVersions(),
        original.outcome(),
        original.evidence(),
        true,
        original.secretUse());
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "missing",
        "duplicate",
        "backwards",
        "nonfinite",
        "negative",
        "mismatched-duration",
        "failure",
        "started-only",
        "failed",
        "skipped",
        "out-of-range",
        "no-origin"
      })
  void rawUnsupportedOrContradictoryReceiptsCannotSurviveProjectionAsPositiveUse(String mutation)
      throws Exception {
    List<RunnerStepState> steps = List.of(pass());
    Instant browser = Instant.now();
    switch (mutation) {
      case "missing" -> steps = List.of();
      case "duplicate" -> steps = List.of(pass(), pass());
      case "backwards" -> steps = List.of(new RunnerStepState(0, "PASS", 10.0, 9.0, 1.0, null));
      case "nonfinite" ->
          steps =
              List.of(
                  new RunnerStepState(
                      0, "PASS", 0.0, Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY, null));
      case "negative" ->
          steps = List.of(new RunnerStepState(0, "PASS", -0.001, 10.0, 10.001, null));
      case "mismatched-duration" ->
          steps = List.of(new RunnerStepState(0, "PASS", 0.25, 10.75, 10.51, null));
      case "failure" ->
          steps = List.of(new RunnerStepState(0, "PASS", 0.25, 10.75, 10.5, "untrusted"));
      case "started-only" ->
          steps = List.of(new RunnerStepState(0, "RUNNING", 0.25, null, null, null));
      case "failed" ->
          steps = List.of(new RunnerStepState(0, "FAIL", 0.25, 10.75, 10.5, "failure"));
      case "skipped" -> steps = List.of(new RunnerStepState(0, "SKIPPED", null, null, null, null));
      case "out-of-range" ->
          steps = List.of(new RunnerStepState(1, "PASS", 0.25, 10.75, 10.5, null));
      case "no-origin" -> browser = null;
      default -> throw new AssertionError("Unlisted mutation");
    }
    var body = report("PROGRESS", steps, browser, Map.of("PASS", "USED"));
    assertThatThrownBy(() -> ObservedProgressSecretEvidence.require(body, artifact()))
        .hasMessageContaining("Invalid completed secret-use evidence");
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "nonsecret",
        "wrong-step",
        "wrong-slot",
        "wrong-input",
        "wrong-reference",
        "duplicate-recipe",
        "wrong-coordinate"
      })
  void completedPassOnAnotherRecipeOrOperationCannotEstablishSecretUse(String mutation)
      throws Exception {
    var frozen = artifact();
    var recipe = (ObjectNode) frozen.path("inputRecipes").get(0);
    switch (mutation) {
      case "nonsecret" -> recipe.put("kind", "nonsecretText");
      case "wrong-step" -> recipe.put("stepId", "other-step");
      case "wrong-slot" -> recipe.put("intendedSlot", "assert.expected");
      case "wrong-input" -> recipe.put("inputId", "another-input");
      case "wrong-reference" ->
          ((ObjectNode) recipe.path("provenance")).put("referenceName", "OTHER");
      case "duplicate-recipe" ->
          ((com.fasterxml.jackson.databind.node.ArrayNode) frozen.path("inputRecipes"))
              .add(recipe.deepCopy());
      case "wrong-coordinate" ->
          ((ObjectNode) frozen.path("steps").get(0).path("operations").get(0).path("coordinate"))
              .put("stepId", "other-step");
      default -> throw new AssertionError("Unlisted mutation");
    }
    assertThatThrownBy(
            () ->
                ObservedProgressSecretEvidence.require(
                    report("PROGRESS", List.of(pass()), Instant.now(), Map.of("PASS", "USED")),
                    frozen))
        .hasMessageContaining("Invalid completed secret-use evidence");
  }

  @ParameterizedTest
  @ValueSource(strings = {"NOT_USED", "REFUSED"})
  void negativeUsageIsTerminalOnlyAndStartedNeverCarriesFacts(String status) {
    assertThatThrownBy(
            () -> report("PROGRESS", List.of(pass()), Instant.now(), Map.of("PASS", status)))
        .hasMessage("Invalid secret usage report kind");
    assertThatThrownBy(() -> report("STARTED", List.of(), Instant.now(), Map.of("PASS", "USED")))
        .hasMessage("Invalid secret usage report kind");
    assertThatCode(() -> report("FINAL", List.of(), null, Map.of("PASS", status)))
        .doesNotThrowAnyException();
  }
}
