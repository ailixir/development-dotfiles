package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayErrorCode;
import com.citi.put.checks.studio.compile.gateway.GatewayOutcome;
import com.citi.put.checks.studio.compile.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.compile.validator.StudioRunnerProperties;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/**
 * Story 10.9 AC-13 — <b>the bounds the repair loop must stay inside.</b>
 *
 * <h2>One full attempt must fit; the repairs need not</h2>
 *
 * <p>The budget is shared by every proposal, repair and validation of one request, and each gateway
 * call is capped at {@code min(request-timeout, remaining)} and cancelled when the budget expires
 * (C0 &sect;5, VAL-007). So the rule is no longer the worst case of every attempt taking its full
 * deadline, {@code (1 + repairs) x (request-timeout + validate-timeout)}, which C0 &sect;5 orders
 * removed. It is that one complete attempt fits:
 *
 * <pre>
 *   gateway.request-timeout + runner.validate-timeout &lt; pipeline.attempt-budget
 *   150s + 10s &lt; 240s
 * </pre>
 *
 * <p>None of the inputs is a literal here: the shipped values are bound from the records' own
 * {@code @DefaultValue}s and the configured values from {@code application.yml}.
 */
class RepairBoundsTest extends AbstractRepairPipelineTest {

  /**
   * The shipped defaults: one full attempt fits, and the startup validation does not demand the
   * removed all-repairs arithmetic.
   */
  @Test
  void oneFullAttemptFitsTheShippedBudgetAndTheRemovedArithmeticIsNotEnforced() {
    StudioCompileProperties shipped = shippedCompile();
    StudioGatewayProperties gateway = shippedGateway();
    StudioRunnerProperties runner = shippedRunner();

    long oneAttemptMs = gateway.requestTimeout().toMillis() + runner.validateTimeout().toMillis();
    long allRepairsMs = (1L + shipped.repair().maxAttempts()) * oneAttemptMs;

    assertThat(shipped.pipeline().attemptBudget().toMillis())
        .as("the shipped budget must fit one full attempt of %dms", oneAttemptMs)
        .isGreaterThan(oneAttemptMs);
    assertThatCode(() -> shipped.validate(gateway, runner))
        .as("the shipped defaults must satisfy their own startup rules")
        .doesNotThrowAnyException();
    assertThatCode(
            () ->
                withBudget(shipped, Duration.ofMillis(oneAttemptMs + 1)).validate(gateway, runner))
        .as("a budget that fits one attempt but not %dms of repairs still starts", allRepairsMs)
        .doesNotThrowAnyException();
  }

  /**
   * The running deployment's own values, not the record defaults.
   *
   * <p>This context binds {@code application.yml}, so it is the configured budget that is checked
   * against the configured timeouts. The record-default test above would keep passing if {@code
   * application.yml} diverged from the defaults; this one would not.
   */
  @Test
  void theConfiguredDeploymentFitsOneFullAttemptInTheBudget() {
    long oneAttemptMs = gatewayRequestTimeoutMs() + runnerProperties.validateTimeout().toMillis();

    assertThat(properties.pipeline().attemptBudget().toMillis())
        .as(
            "the deployed budget must exceed one full attempt: %dms + %dms = %dms",
            gatewayRequestTimeoutMs(), runnerProperties.validateTimeout().toMillis(), oneAttemptMs)
        .isGreaterThan(oneAttemptMs);
  }

  /** AC-18 — the sweep threshold must strictly exceed the budget, at exactly that boundary. */
  @Test
  void theSweepThresholdMustStrictlyExceedTheBudgetAtExactlyThatBoundary() {
    StudioCompileProperties shipped = shippedCompile();
    StudioGatewayProperties gateway = shippedGateway();
    StudioRunnerProperties runner = shippedRunner();
    Duration budget = shipped.pipeline().attemptBudget();

    assertThatThrownBy(() -> withThreshold(shipped, budget).validate(gateway, runner))
        .as("a threshold equal to the budget could take a compile that is still running")
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("abandonment.threshold");

    assertThatCode(() -> withThreshold(shipped, budget.plusMillis(1)).validate(gateway, runner))
        .doesNotThrowAnyException();
    assertThat(properties.abandonment().threshold())
        .as("and the deployed threshold clears the deployed budget")
        .isGreaterThan(properties.pipeline().attemptBudget());
  }

  /**
   * AC-13 — a {@code GATEWAY_BUSY} on a <b>repair</b> call ends the loop and does not silently
   * consume a further attempt.
   *
   * <p>The call count is the assertion. A pipeline that treated a bounded refusal as "try the next
   * repair" would reach three proposals and report whatever the third attempt produced, turning one
   * refusal into three and hiding which bound fired.
   */
  @Test
  void agatewayBusyOnARepairEndsTheLoopWithThatCodeAndNoFurtherAttempt() {
    stubValidatorSequence(false, true);
    String artifact = artifactFor(SOURCE, "await page.goto('https://example.com/login');");
    gateway.answer(
        request ->
            request.attempt() == 1
                ? ScriptedRepairGateway.ok(artifact)
                : CompileResponse.failure(
                    GatewayOutcome.BUSY,
                    GatewayErrorCode.GATEWAY_BUSY,
                    "bulkhead full",
                    null,
                    0,
                    1L,
                    0,
                    0));

    pipeline.compile(testId, OWNER);

    awaitCompileStatus("STALE");
    assertThat(storedErrorCode()).isEqualTo(GatewayErrorCode.GATEWAY_BUSY.name());
    assertThat(gateway.calls())
        .as("the refusal ended the loop; a third proposal would have consumed a repair for nothing")
        .isEqualTo(2);
    assertThat(validateCalls())
        .as("and the refused repair never reached the validator")
        .isEqualTo(1);
    assertThat(currentCandidate()).isNull();
  }

  /**
   * AC-13 — every gateway failure mode on a repair call routes to {@code publishError -> STALE},
   * retryable, carrying that code and nothing else.
   *
   * <p>Driven across the whole {@code GatewayErrorCode} enum rather than a chosen few, so a code
   * added later is covered the day it is added.
   *
   * <p>The {@code GATEWAY_PARSE_FAILURE} driven here carries no parser rejection code, as an
   * unusable finish reason does not, so it stays terminal. A strict-parser envelope rejection is
   * the one parse failure that consumes a repair (VAL-019b); {@code RepairLoopTest} covers it.
   */
  @Test
  void everyGatewayFailureModeOnARepairIsARetryableStaleCarryingThatCode() {
    String artifact = artifactFor(SOURCE, "await page.goto('https://example.com/login');");
    for (GatewayErrorCode code : GatewayErrorCode.values()) {
      java.util.UUID id = seedAnotherDraft(SOURCE);
      stubValidatorSequence(false, true);
      gateway.reset(artifact);
      gateway.answer(
          request ->
              request.attempt() == 1
                  ? ScriptedRepairGateway.ok(artifact)
                  : CompileResponse.failure(
                      outcomeFor(code),
                      code,
                      "a reason the draft must never see",
                      null,
                      0,
                      1L,
                      0,
                      0));

      pipeline.compile(id, OWNER);

      awaitCompileStatus(id, "STALE");
      assertThat(errorCodeOf(id)).as("%s on a repair", code).isEqualTo(code.name());
      assertThat(gateway.calls()).as("%s ended the loop at attempt 2", code).isEqualTo(2);
      assertThat(
              jdbc.queryForObject(
                  "SELECT steps::text FROM ui_tests WHERE id = ?", String.class, id))
          .as("the authored draft itself is untouched and stays saved")
          .contains("example.com/login");
    }
  }

  /** {@code VALIDATOR_UNAVAILABLE} on a repair's validator call ends the loop the same way. */
  @Test
  void avalidatorOutageOnARepairEndsTheLoopWithValidatorUnavailable() {
    runner.resetAll();
    runner.stubFor(
        com.github.tomakehurst.wiremock.client.WireMock.post(
                com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo("/v1/validate"))
            .inScenario("outage")
            .whenScenarioStateIs(com.github.tomakehurst.wiremock.stubbing.Scenario.STARTED)
            .willSetStateTo("second")
            .willReturn(jsonBody(invalidVerdict())));
    runner.stubFor(
        com.github.tomakehurst.wiremock.client.WireMock.post(
                com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo("/v1/validate"))
            .inScenario("outage")
            .whenScenarioStateIs("second")
            .willReturn(
                com.github.tomakehurst.wiremock.client.WireMock.aResponse().withStatus(500)));

    pipeline.compile(testId, OWNER);

    awaitCompileStatus("STALE");
    assertThat(storedErrorCode()).isEqualTo(CompileErrorCode.VALIDATOR_UNAVAILABLE.name());
    assertThat(gateway.calls()).isEqualTo(2);
    assertThat(validateCalls()).as("exactly one call per attempt, and no retry").isEqualTo(2);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private String errorCodeOf(java.util.UUID id) {
    String stored =
        jdbc.queryForObject(
            "SELECT compile_error::text FROM ui_tests WHERE id = ?", String.class, id);
    try {
      return MAPPER.readTree(stored).path("code").asText();
    } catch (Exception e) {
      throw new AssertionError("compile_error is not JSON: " + stored, e);
    }
  }

  /**
   * Story 10.45 AC 8 — the rejected proposal a repair carries is bounded at {@link
   * RepairPromptAssembler#MAX_REJECTED_PROPOSAL_BYTES} UTF-8 bytes, with the same explicit
   * truncation marker the diagnostics use, and a proposal under the cap is carried whole.
   */
  @Test
  void theRejectedProposalIsCappedWithAnExplicitMarkerAndNeverSplitsACharacter() {
    int cap = RepairPromptAssembler.MAX_REJECTED_PROPOSAL_BYTES;
    // Four-byte code points, so a byte-naive cut would split one.
    String oversized = "\uD83D\uDE00".repeat(cap);

    String bounded = RepairPromptAssembler.boundRejectedProposal(oversized);

    assertThat(bounded.getBytes(java.nio.charset.StandardCharsets.UTF_8).length)
        .isLessThanOrEqualTo(cap);
    assertThat(bounded).endsWith(DiagnosticsBounder.TRUNCATION_MARKER);
    String kept =
        bounded.substring(0, bounded.length() - DiagnosticsBounder.TRUNCATION_MARKER.length());
    assertThat(kept.codePoints()).allMatch(codePoint -> codePoint == 0x1F600);

    String small = "{\"version\":1,\"kind\":\"FULL\",\"steps\":[]}";
    assertThat(RepairPromptAssembler.boundRejectedProposal(small)).isEqualTo(small);
  }

  private long gatewayRequestTimeoutMs() {
    // The autowired bean, not the record defaults: the gateway is disabled in this profile, but its
    // properties bean still carries the deadline application.yml configured, and that is the value
    // the deployed budget has to clear. Reading the defaults here instead would have made this
    // test a second copy of the one above.
    return gatewayProperties.requestTimeout().toMillis();
  }

  private static GatewayOutcome outcomeFor(GatewayErrorCode code) {
    return switch (code) {
      case GATEWAY_UNAVAILABLE -> GatewayOutcome.DISABLED;
      case GATEWAY_BUSY -> GatewayOutcome.BUSY;
      case GATEWAY_TIMEOUT -> GatewayOutcome.TIMEOUT;
      case GATEWAY_TRANSPORT -> GatewayOutcome.TRANSPORT;
      case GATEWAY_PARSE_FAILURE -> GatewayOutcome.PARSE_FAILURE;
      case COMPILE_INPUT_TOO_LARGE, GATEWAY_OUTPUT_TOO_LARGE -> GatewayOutcome.TOO_LARGE;
    };
  }

  private static StudioCompileProperties withBudget(StudioCompileProperties base, Duration budget) {
    return new StudioCompileProperties(
        new StudioCompileProperties.Pipeline(base.pipeline().concurrency(), budget),
        base.authoring(),
        base.diagnostics(),
        base.repair(),
        base.abandonment());
  }

  private static StudioCompileProperties withThreshold(
      StudioCompileProperties base, Duration threshold) {
    return new StudioCompileProperties(
        base.pipeline(),
        base.authoring(),
        base.diagnostics(),
        base.repair(),
        new StudioCompileProperties.Abandonment(
            base.abandonment().enabled(),
            threshold,
            base.abandonment().batchSize(),
            base.abandonment().intervalMs()));
  }

  /** The bounds this backend ships, bound from the records' own {@code @DefaultValue}s. */
  private static StudioCompileProperties shippedCompile() {
    return new Binder(new MapConfigurationPropertySource(Map.of()))
        .bindOrCreate("studio.compile", StudioCompileProperties.class);
  }

  private static StudioGatewayProperties shippedGateway() {
    return new Binder(new MapConfigurationPropertySource(Map.of()))
        .bindOrCreate("studio.compile.gateway", StudioGatewayProperties.class);
  }

  private static StudioRunnerProperties shippedRunner() {
    return new Binder(new MapConfigurationPropertySource(Map.of()))
        .bindOrCreate("studio.runner", StudioRunnerProperties.class);
  }
}
