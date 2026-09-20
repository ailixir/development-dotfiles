package com.citi.put.checks.studio.compile;

import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.github.tomakehurst.wiremock.stubbing.Scenario;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Story 10.9 AC-11 — <b>exhausted repair yields {@code NEEDS_REVISION} with readable, bounded
 * reasons.</b>
 *
 * <p>Three properties, each with its own test: the document describes the <em>final</em> attempt
 * and not an accumulation of three; it carries {@code attempts} and {@code exhausted} under exactly
 * the names ADR-002 §16.2 fixes, so story 10.10 is not guessing; and it stays inside the caps 10.8
 * already owns even when every attempt returns a hostile verdict, with the truncation marker set
 * when it does not fit.
 */
class RepairExhaustionTest extends AbstractRepairPipelineTest {

  /**
   * The document describes <b>one</b> attempt, not three.
   *
   * <p>Each attempt's verdict carries a distinguishable marker, so "not accumulated" is decidable:
   * the stored document must contain the third marker and neither of the first two. A test that
   * only counted entries would pass against an implementation that concatenated three attempts'
   * diagnostics and then let the byte cap shed the overflow.
   */
  @Test
  void theStoredDocumentDescribesTheFinalAttemptAndNotAnAccumulationOfThree() {
    stubThreeDistinguishableRejections();

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("NEEDS_REVISION");

    String stored = storedDiagnosticsText();
    assertThat(stored)
        .as("attempt 3's reasons are the ones the author is shown")
        .contains("attempt-3-marker");
    assertThat(stored)
        .as(
            "earlier attempts describe artifacts the author never saw; accumulating them would"
                + " either breach the 64 KiB cap or make truncation the normal case")
        .doesNotContain("attempt-1-marker")
        .doesNotContain("attempt-2-marker");
  }

  /** AC-11 / ADR-002 §16.2 — {@code attempts} and {@code exhausted}, under exactly those names. */
  @Test
  void theExhaustedDocumentCarriesTheAttemptCountAndTheExhaustedMarker() {
    stubValidatorSequence(false, false, false);

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("NEEDS_REVISION");

    JsonNode document = storedDiagnostics();
    assertThat(document.has("attempts")).as("the key is spelled `attempts`").isTrue();
    assertThat(document.has("exhausted")).as("the key is spelled `exhausted`").isTrue();
    assertThat(document.path("attempts").isIntegralNumber()).isTrue();
    assertThat(document.path("attempts").asInt()).isEqualTo(1 + properties.repair().maxAttempts());
    assertThat(document.path("attempts").asInt()).isGreaterThanOrEqualTo(1);
    assertThat(document.path("exhausted").asBoolean())
        .as("the bound was reached and the artifact was still invalid")
        .isTrue();
  }

  /**
   * A draft that goes invalid on the first attempt and is never repaired — because repair is
   * configured off — records {@code attempts: 1}.
   *
   * <p>This exists so {@code attempts} is a measurement rather than a constant: with the bound at
   * two, every exhausted document says 3, and a field that only ever holds one value proves
   * nothing. The bounder is driven directly here, at the same seam the pipeline uses.
   */
  @Test
  void theAttemptCountIsAMeasurementAndNotAConstant() {
    var outcome =
        com.citi.put.checks.studio.compile.validator.ValidationOutcome.verdict(
            false, "2.0.0", java.util.List.of(), java.util.List.of());

    assertThat(bounder.bound(outcome, 2, 1, false))
        .contains("\"attempts\":1")
        .contains("\"exhausted\":false");
    assertThat(bounder.bound(outcome, 2, 2, false))
        .contains("\"attempts\":2")
        .contains("\"exhausted\":false");
    assertThat(bounder.bound(outcome, 2, 3, true))
        .contains("\"attempts\":3")
        .contains("\"exhausted\":true");
  }

  /**
   * AC-11 — three successive hostile verdicts leave <b>one</b> bounded document inside the cap.
   *
   * <p>Each verdict carries thousands of oversized diagnostics, which is a validator response no
   * honest runner would send and therefore exactly the input the caps exist for. The assertions are
   * on the persisted bytes: within the total cap, one entry per original step, and the per-step,
   * message and excerpt caps honoured with visible markers.
   *
   * <p>The draft is deliberately large. Two steps of bounded diagnostics fit inside 64 KiB with
   * room to spare, so a two-step draft could never exercise the document-level flag and a test
   * built on one would assert the byte cap without ever reaching it.
   */
  @Test
  void threeHostileVerdictsLeaveOneBoundedDocumentWithinTheCap() {
    int stepCount = 80;
    java.util.List<String> manySteps =
        java.util.stream.IntStream.range(0, stepCount)
            .mapToObj(index -> "Go to \"https://example.com/page-" + index + "\"")
            .toList();
    UUID large = seedAnotherDraft(manySteps);
    gateway.reset(artifactFor(manySteps, "await page.goto('https://example.com');"));
    // Stay within the transport cap while exceeding every persisted diagnostics cap.
    stubValidatorAlways(hostileVerdict(stepCount));

    pipeline.compile(large, OWNER);
    awaitCompileStatus(large, "NEEDS_REVISION");

    String stored =
        jdbc.queryForObject(
            "SELECT compile_diagnostics::text FROM ui_tests WHERE id = ?", String.class, large);
    JsonNode document;
    try {
      document = MAPPER.readTree(stored);
    } catch (Exception e) {
      throw new AssertionError("compile_diagnostics is not JSON: " + stored, e);
    }

    assertThat(stored.getBytes(StandardCharsets.UTF_8).length)
        .as("the persisted document must be within the total byte cap")
        .isLessThanOrEqualTo(properties.diagnostics().maxTotalBytes());
    assertThat(document.path("steps"))
        .as("one entry per original step, index aligned, even after shedding")
        .hasSize(stepCount);
    assertThat(document.path("truncated").asBoolean())
        .as(
            "this document had to shed whole steps' diagnostics to fit, and truncation is explicit"
                + " at the document level, never silent")
        .isTrue();
    assertThat(document.path("truncationReason").asText()).isEqualTo("TOTAL_BYTES");
    assertThat(document.path("attempts").asInt()).isEqualTo(3);
    assertThat(document.path("exhausted").asBoolean()).isTrue();

    boolean anyStepMarkedTruncated = false;
    boolean anyClampedMessage = false;
    for (JsonNode step : document.path("steps")) {
      anyStepMarkedTruncated |= step.path("truncated").asBoolean();
      assertThat(step.path("diagnostics").size())
          .as("step %s exceeded the per-step cap", step.path("stepIndex"))
          .isLessThanOrEqualTo(properties.diagnostics().maxPerStep());
      for (JsonNode diagnostic : step.path("diagnostics")) {
        assertThat(diagnostic.path("message").asText())
            .hasSizeLessThanOrEqualTo(properties.diagnostics().maxMessageChars());
        assertThat(diagnostic.path("excerpt").asText())
            .hasSizeLessThanOrEqualTo(properties.diagnostics().maxExcerptChars());
        anyClampedMessage |=
            diagnostic.path("message").asText().endsWith(DiagnosticsBounder.TRUNCATION_MARKER);
      }
    }
    assertThat(anyStepMarkedTruncated).as("a step that lost diagnostics must say so").isTrue();
    assertThat(anyClampedMessage)
        .as("and a clamped message must end with the visible marker")
        .isTrue();
    assertThat(gateway.calls()).as("all three attempts really were made").isEqualTo(3);
  }

  /** Publication goes through {@code publishInvalid}: no revision row, candidate cleared. */
  @Test
  void exhaustionPublishesThroughPublishInvalidAndWritesNoRevision() {
    stubValidatorSequence(false, false, false);

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("NEEDS_REVISION");

    assertThat(revisionCount()).isZero();
    assertThat(currentCandidate()).isNull();
    assertThat(storedErrorCode())
        .as("a verdict is not a transport failure; compile_error stays null")
        .isNull();
  }

  // ── stubs ────────────────────────────────────────────────────────────────

  /** Three rejections whose messages differ, so which attempt was persisted is decidable. */
  private static void stubThreeDistinguishableRejections() {
    runner.resetAll();
    for (int index = 0; index < 3; index++) {
      String from = index == 0 ? Scenario.STARTED : "call-" + index;
      runner.stubFor(
          post(urlEqualTo("/v1/validate"))
              .inScenario("distinguishable")
              .whenScenarioStateIs(from)
              .willSetStateTo("call-" + (index + 1))
              .willReturn(
                  jsonBody(invalidVerdict("attempt-" + (index + 1) + "-marker", "for(;;)"))));
    }
  }

  /** Thousands of oversized diagnostics on every step — the input the caps exist for. */
  private static String hostileVerdict(int stepCount) {
    StringBuilder body =
        new StringBuilder(
            "{\"ok\":false,\"validatorSchemaVersion\":\"2.0.0\",\"diagnostics\":[],\"steps\":[");
    for (int step = 0; step < stepCount; step++) {
      if (step > 0) {
        body.append(',');
      }
      body.append("{\"stepIndex\":").append(step).append(",\"ok\":false,\"diagnostics\":[");
      for (int d = 0; d < 12; d++) {
        if (d > 0) {
          body.append(',');
        }
        body.append("{\"code\":\"DENIED_NODE\",\"stepIndex\":")
            .append(step)
            .append(",\"message\":\"")
            .append("m".repeat(600))
            .append("\",\"node\":\"CallExpression\",\"excerpt\":\"")
            .append("e".repeat(200))
            .append("\"}");
      }
      body.append("]}");
    }
    return body.append("]}").toString();
  }
}
