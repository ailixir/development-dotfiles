package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.gateway.GatewayErrorCode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Story 10.9 AC-10a and AC-12 — <b>the bounded repair loop against the stub gateway.</b>
 *
 * <h2>What the call counts here prove, and what they do not</h2>
 *
 * <p>Stated plainly because @po named it during validation: these tests count calls into a stub
 * this story controls. They therefore establish a property of <b>the pipeline</b> — that it issues
 * at most {@code 1 + repair.max-attempts} proposals and the same number of {@code /v1/validate}
 * calls, numbers the attempts 1, 2, 3 without repeating, carries the previous attempt's bounded
 * diagnostics into each repair, and settles in the state the last verdict implies. The validator
 * half is measured on the wire through WireMock, so that count is not a stub's self-report.
 *
 * <p>They establish <b>nothing</b> about a real model: not that a repair prompt ever produces a
 * better artifact, not that R2D2 accepts this request shape, and not that the translation quality
 * is measurable. Those are AC-10b and AC-15b, deferred behind {@code ED-01} to story 10.19, and
 * recorded as <b>skipped, not passed</b>.
 */
class RepairLoopTest extends AbstractRepairPipelineTest {

  // ── AC-10a: the four shapes ──────────────────────────────────────────────

  @Test
  void validOnTheFirstAttemptIssuesOneProposalAndOneValidation() {
    stubValidatorSequence(true);

    pipeline.compile(testId, OWNER);

    awaitCompileStatus("AWAITING_CONFIRMATION");
    assertThat(gateway.calls()).isEqualTo(1);
    assertThat(validateCalls()).isEqualTo(1);
    assertThat(gateway.attempts()).containsExactly(1);
  }

  @Test
  void validAfterTheFirstRepairIssuesTwoProposalsAndTwoValidations() {
    stubValidatorSequence(false, true);

    pipeline.compile(testId, OWNER);

    awaitCompileStatus("AWAITING_CONFIRMATION");
    assertThat(gateway.calls()).isEqualTo(2);
    assertThat(validateCalls()).isEqualTo(2);
    assertThat(gateway.attempts()).containsExactly(1, 2);
  }

  @Test
  void validAfterTheSecondRepairIssuesThreeProposalsAndThreeValidations() {
    stubValidatorSequence(false, false, true);

    pipeline.compile(testId, OWNER);

    awaitCompileStatus("AWAITING_CONFIRMATION");
    assertThat(gateway.calls()).isEqualTo(3);
    assertThat(validateCalls()).isEqualTo(3);
    assertThat(gateway.attempts()).containsExactly(1, 2, 3);
  }

  /**
   * Never valid: three attempts and then {@code NEEDS_REVISION}. A fourth would be a bound that was
   * not enforced, so the validator script has exactly three entries and a fourth call would receive
   * no stubbed answer at all.
   */
  @Test
  void neverValidStopsAtThreeAttemptsAndNeedsRevision() {
    stubValidatorSequence(false, false, false);

    pipeline.compile(testId, OWNER);

    awaitCompileStatus("NEEDS_REVISION");
    assertThat(gateway.calls())
        .as("at most 1 + %d proposals (§4.3)", properties.repair().maxAttempts())
        .isEqualTo(3);
    assertThat(validateCalls()).isEqualTo(3);
    assertThat(gateway.attempts()).containsExactly(1, 2, 3);
    assertThat(revisionCount()).as("an invalid artifact is never written as a revision").isZero();
  }

  /**
   * The bound is the configured one, read from configuration rather than restated as a literal.
   *
   * <p>A test that hardcoded "3" would keep passing after somebody changed {@code
   * repair.max-attempts} and forgot it.
   */
  @Test
  void theCallCountIsTheConfiguredBoundAndNotALiteral() {
    assertThat(properties.repair().maxAttempts())
        .as("architecture §4.3 fixes the repair bound at two")
        .isEqualTo(2);

    stubValidatorSequence(false, false, false);
    pipeline.compile(testId, OWNER);
    awaitCompileStatus("NEEDS_REVISION");

    assertThat(gateway.calls()).isEqualTo(1 + properties.repair().maxAttempts());
  }

  // ── AC-10a: the repair carries the previous attempt's reasons ────────────

  /**
   * Each repair carries the bounded diagnostics of the attempt that just failed — and the first
   * attempt carries none.
   *
   * <p>The second half is what makes the first non-vacuous: a pipeline that attached the same
   * document to every attempt, or none to any, would satisfy a check that only looked at attempt 3.
   */
  @Test
  void everyRepairCarriesThePreviousAttemptsBoundedDiagnosticsAndTheFirstCarriesNone() {
    stubValidatorSequence(false, false, false);

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("NEEDS_REVISION");

    List<String> carried =
        gateway.seen().stream()
            .map(com.citi.put.checks.studio.compile.gateway.CompileRequest::repairDiagnostics)
            .toList();

    assertThat(carried.get(0)).as("attempt 1 has nothing to repair from").isNull();
    assertThat(carried.get(1)).as("attempt 2 carries attempt 1's reasons").isNotNull();
    assertThat(carried.get(2)).as("attempt 3 carries attempt 2's reasons").isNotNull();
    assertThat(carried.get(1)).contains("\"attempts\":1").contains("\"exhausted\":false");
    assertThat(carried.get(2)).contains("\"attempts\":2").contains("\"exhausted\":false");
    assertThat(carried.get(1))
        .as("the carried document is the bounded one, index aligned to the original steps")
        .contains("\"stepIndex\":1")
        .contains("DENIED_NODE");
  }

  // ── AC-12: a repaired draft goes back through the same gate ──────────────

  /**
   * AC-12 — a schema-valid {@code version: 2} artifact returned by a <em>repair</em> is rejected
   * exactly as 10.8 AC-10 rejects it on the first attempt.
   *
   * <p>Attempt 1 returns a valid v1 artifact that the validator refuses; attempt 2 returns a v2
   * artifact. The v2 document must never reach the validator and must never be written as a
   * revision — so the validator call count stays at one, which is the whole assertion.
   */
  @Test
  void aVersionTwoArtifactFromARepairIsRejectedByThePinAndNeverValidated() {
    stubValidatorSequence(false, true);
    String v1 = artifactFor(SOURCE, "await page.goto('https://example.com/login');");
    gateway.answer(
        request ->
            request.attempt() == 1
                ? ScriptedRepairGateway.ok(v1)
                : ScriptedRepairGateway.ok(v1.replace("\"version\":1", "\"version\":2")));

    pipeline.compile(testId, OWNER);

    awaitCompileStatus("STALE");
    assertThat(storedErrorCode()).isEqualTo(GatewayErrorCode.GATEWAY_PARSE_FAILURE.name());
    assertThat(gateway.calls()).as("the repair was issued").isEqualTo(2);
    assertThat(validateCalls())
        .as("but its v2 artifact was never sent to /v1/validate")
        .isEqualTo(1);
    assertThat(revisionCount()).isZero();
    assertThat(currentCandidate()).isNull();
  }

  /**
   * AC-12 — a successful repair becomes {@code AWAITING_CONFIRMATION} and <b>never</b> {@code
   * READY}.
   */
  @Test
  void asuccessfulRepairAwaitsConfirmationAndNeverConfirmsItself() {
    stubValidatorSequence(false, true);

    pipeline.compile(testId, OWNER);

    awaitCompileStatus("AWAITING_CONFIRMATION");
    assertThat(currentCandidate()).isNotNull();
    assertThat(confirmedRevision())
        .as("no path in the repair loop sets READY; only CompileStateService.confirm does")
        .isNull();
  }

  /**
   * AC-12 — <b>there is no call path from the repair loop to {@code CompileStateService.confirm}
   * </b>, and this fails on the reference rather than on the call.
   *
   * <p>A behavioural test can only show that the loop did not confirm on the paths it exercised. A
   * source scan shows that no path exists at all, which is the property the criterion states. The
   * scan is guarded against vacuity: it asserts it really read the pipeline's source and that the
   * string it is looking for does occur elsewhere in the package, so a typo in the needle cannot
   * pass as an absence.
   */
  @Test
  void noClassOnTheCompilePathReferencesTheConfirmTransition() throws IOException {
    Path compilePackage =
        Path.of("src", "main", "java", "com", "citi", "put", "checks", "studio", "compile");
    List<Path> scanned;
    try (Stream<Path> files = Files.walk(compilePackage)) {
      scanned =
          files
              .filter(path -> path.toString().endsWith(".java"))
              .filter(path -> !path.getFileName().toString().equals("CompileStateService.java"))
              .toList();
    }
    assertThat(scanned).as("the scan must actually cover the compile package").isNotEmpty();
    assertThat(scanned)
        .as("and it must cover the class that runs the loop")
        .anyMatch(path -> path.getFileName().toString().equals("CompilePipeline.java"));

    String needle = ".confirm(";
    assertThat(
            Files.readString(
                compilePackage.resolve("CompileStateService.java"), StandardCharsets.UTF_8))
        .as(
            "non-vacuity: the transition this scan looks for really is spelled this way, so an"
                + " absence below is an absence and not a typo")
        .contains("public UUID confirm(");

    for (Path file : scanned) {
      String source =
          Files.readString(file, StandardCharsets.UTF_8)
              .replaceAll("(?s)/\\*.*?\\*/", " ")
              .replaceAll("(?m)^\\s*//.*$", " ");
      assertThat(source)
          .as(
              "%s reaches CompileStateService.confirm; a repaired draft must be confirmed by a"
                  + " principal calling the route, never by the loop that produced it",
              file)
          .doesNotContain("compileStateService" + needle)
          .doesNotContain("states" + needle);
    }
  }
}
