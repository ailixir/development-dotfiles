package com.citi.put.checks.studio.compile;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.github.tomakehurst.wiremock.stubbing.Scenario;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Story 10.9 AC-13 — <b>the budget covers the whole request including its repairs, and a late
 * result from an abandoned repair is dropped in process.</b>
 *
 * <p>Its own context, for the reason 10.8's {@code CompileBudgetExpiryTest} needed one: observing a
 * budget expiry requires a deployment configured with a budget short enough to watch, and the
 * bounds are validated against each other at startup — so the gateway timeout and the {@code
 * /v1/validate} timeout come down with it, and the arithmetic {@code budget > (1 + repairs) x
 * (gatewayTimeout + validateTimeout)} still has to hold.
 *
 * <p>The case that matters is the late one. The gateway blocks on the <b>second</b> attempt until
 * after the budget has abandoned the request, and the assertion is that nothing further happens
 * when it finally returns: no candidate, no third proposal, no further validator call, no state
 * change. This is belt-and-braces on top of 10.4's conditional publish, and the braces are
 * load-bearing — nothing about this draft moved on, so the conditional publish would have matched
 * its own guard and published.
 */
@SpringBootTest
@ActiveProfiles("local")
class RepairBudgetExpiryTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String OWNER = "repair-budget-owner@citi.com";
  private static final String CSI_ID = "60413";
  private static final List<String> SOURCE = List.of("Go to \"https://example.com/login\"");

  private static WireMockServer runner;

  static {
    runner = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    runner.start();
  }

  @AfterAll
  static void stopRunner() {
    runner.stop();
  }

  @DynamicPropertySource
  static void shortBudget(DynamicPropertyRegistry registry) {
    registry.add("studio.runner.base-url", () -> "http://localhost:" + runner.port());
    // All four together. The startup rule is
    //   budget > (1 + repair.max-attempts) x (gateway.request-timeout + runner.validate-timeout)
    // = 3 x (200ms + 500ms) = 2100ms, so 2500ms is the smallest round budget that satisfies the
    // rule and is still short enough to observe. The context refuses to start if this drifts,
    // which is itself the AC-13 rule under test.
    //
    // The validate timeout is 500ms rather than something smaller because attempt 1 really does
    // make an HTTP round trip here: a 10ms read deadline would abandon it as VALIDATOR_UNAVAILABLE
    // and the loop would never reach the repair this test is about.
    registry.add("studio.compile.gateway.request-timeout", () -> "200ms");
    registry.add("studio.runner.validate-timeout", () -> "500ms");
    registry.add("studio.compile.pipeline.attempt-budget", () -> "2500ms");
    registry.add("studio.compile.repair.max-attempts", () -> "2");
  }

  /** Answers attempt 1 immediately and blocks on attempt 2 until released. */
  static final class HeldOnRepairGateway implements LlmGatewayClient {

    private final CountDownLatch release = new CountDownLatch(1);
    private final CountDownLatch enteredRepair = new CountDownLatch(1);
    private final AtomicInteger calls = new AtomicInteger();

    @Override
    public CompileResponse propose(
        com.citi.put.checks.studio.compile.gateway.CompileRequest request) {
      calls.incrementAndGet();
      if (request.attempt() == 1) {
        return ProposalFixtures.fromArtifact(request, ok());
      }
      enteredRepair.countDown();
      try {
        if (!release.await(60, TimeUnit.SECONDS)) {
          throw new IllegalStateException("the held repair was never released");
        }
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new IllegalStateException(e);
      }
      return ProposalFixtures.fromArtifact(request, ok());
    }

    int calls() {
      return calls.get();
    }

    private static CompileResponse ok() {
      return CompileResponse.ok(
          ConfirmFixtures.artifactFor(SOURCE, "await page.goto('https://example.com/login');"),
          new GatewayProvenance(
              "stub-model@1", "001", CompilePins.PROMPT_VERSION, "1.52.0", true, 0),
          0,
          1L,
          10,
          20);
    }
  }

  @TestConfiguration
  static class Stubs {
    @Bean
    @Primary
    HeldOnRepairGateway heldOnRepairGateway() {
      return new HeldOnRepairGateway();
    }
  }

  @Autowired private CompilePipeline pipeline;
  @Autowired private HeldOnRepairGateway gateway;
  @Autowired private JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void setUp() {
    runner.resetAll();
    // Attempt 1 is refused, so the loop goes on to the repair the gateway then holds.
    runner.stubFor(
        post(urlEqualTo("/v1/validate"))
            .inScenario("held")
            .whenScenarioStateIs(Scenario.STARTED)
            .willSetStateTo("after-first")
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("content-type", "application/json")
                    .withBody(
                        "{\"ok\":false,\"validatorSchemaVersion\":\"2.0.0\",\"diagnostics\":[],"
                            + "\"steps\":[{\"stepIndex\":0,\"ok\":false,\"diagnostics\":"
                            + "[{\"code\":\"DENIED_NODE\",\"stepIndex\":0,\"message\":\"no\","
                            + "\"node\":\"ForStatement\",\"excerpt\":\"for(;;)\"}]}]}")));
    ConfirmFixtures.seedUser(jdbc, OWNER);
    ConfirmFixtures.seedCsi(jdbc, CSI_ID, OWNER);
    testId = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
  }

  /**
   * The budget expires <b>inside the loop</b>, during a repair, and its late result changes
   * nothing.
   *
   * <p>Every assertion after the release is the point of the test. The abandoned attempt really
   * does finish — the latch guarantees it — and it must publish nothing, not even a conditional
   * publish that would have matched its own guard.
   */
  @Test
  void anExpiryDuringARepairIsAbandonedAndItsLateResultChangesNothing() throws Exception {
    pipeline.compile(testId, OWNER);

    assertThat(gateway.enteredRepair.await(20, TimeUnit.SECONDS))
        .as("the loop must actually reach the repair, or this test proves nothing")
        .isTrue();

    awaitCompileStatus("STALE");
    assertThat(errorCode())
        .as("the budget is the bound that fired, and it names itself")
        .isEqualTo(CompileErrorCode.COMPILE_BUDGET_EXCEEDED.name());

    Map<String, Object> settled = compileState();
    int validateCallsAtSettlement = runner.getAllServeEvents().size();

    gateway.release.countDown();
    Thread.sleep(750L);

    assertThat(compileState())
        .as("the abandoned repair finished and published nothing")
        .isEqualTo(settled);
    assertThat(runner.getAllServeEvents().size())
        .as("and it never spent a validator call on a result it could no longer publish")
        .isEqualTo(validateCallsAtSettlement);
    assertThat(revisionCount()).isZero();
    assertThat(gateway.calls())
        .as("the loop stopped at the abandoned repair; no third proposal was issued")
        .isEqualTo(2);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private Map<String, Object> compileState() {
    return jdbc.queryForMap(
        "SELECT compile_status, compile_request_id, compile_error::text, compile_started_at,"
            + " current_candidate_revision_id, confirmed_revision_id FROM ui_tests WHERE id = ?",
        testId);
  }

  private String errorCode() {
    String stored =
        jdbc.queryForObject(
            "SELECT compile_error::text FROM ui_tests WHERE id = ?", String.class, testId);
    try {
      return MAPPER.readTree(stored).path("code").asText();
    } catch (Exception e) {
      throw new AssertionError("compile_error is not JSON: " + stored, e);
    }
  }

  private int revisionCount() {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, testId);
  }

  private void awaitCompileStatus(String expected) {
    long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    String observed = null;
    while (System.nanoTime() < deadline) {
      observed =
          jdbc.queryForObject(
              "SELECT compile_status FROM ui_tests WHERE id = ?", String.class, testId);
      if (expected.equals(observed)) {
        return;
      }
      try {
        Thread.sleep(25L);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new IllegalStateException(e);
      }
    }
    assertThat(observed).as("compile never reached %s", expected).isEqualTo(expected);
  }
}
