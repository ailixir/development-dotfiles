package com.citi.put.checks.studio.readiness;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.dispatch.DispatchOutcome;
import com.citi.put.checks.studio.dispatch.RunJob;
import com.citi.put.checks.studio.dispatch.RunnerDispatchClient;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Story 10.8 AC-28(b); ADR-SC-005 "Tests" — <b>replay is model-free</b>: zero guided model calls
 * across readiness, the execute refusal of an unlearned test and a real HTTP dispatch of an
 * observed replay job.
 *
 * <p>The compile de-ready cases this class used to hold (a confirmed artifact-1 draft staying
 * runnable through an optional recompile) retired with the compile path; what carries forward is
 * the counting oracle. A counting guided gateway records every model call, and the zero is asserted
 * after each step, so "zero calls" is a measurement rather than an absence of opportunity. {@link
 * #injectedProviderCallsFalsifyTheZeroCallOracle()} proves the oracle can fail.
 */
@SpringBootTest
@ActiveProfiles("local")
class DeReadyCarryForwardTest {

  private static final List<String> STEPS =
      List.of(
          "Go to \"" + ObservedPublicationFixture.ORIGIN + "/login\"",
          "Click the \"Sign in\" button");

  static final class CountingGuidedGateway
      implements com.citi.put.checks.studio.guided.translation.GuidedLlmGatewayClient {
    final AtomicInteger calls = new AtomicInteger();

    @Override
    public com.citi.put.checks.studio.guided.translation.GuidedModelResponse propose(
        com.citi.put.checks.studio.guided.translation.GuidedModelRequest request,
        com.citi.put.checks.studio.guided.translation.GuidedCallBudget budget) {
      calls.incrementAndGet();
      return new com.citi.put.checks.studio.guided.translation.GuidedModelResponse(
          com.citi.put.checks.studio.guided.translation.GuidedModelResponse.Code.DISABLED,
          null,
          null,
          null,
          null);
    }
  }

  /** The runner's observed run route, counting what it receives. */
  static final class RuntimeReceipt implements AutoCloseable {
    final com.sun.net.httpserver.HttpServer server;
    final AtomicInteger calls = new AtomicInteger();

    RuntimeReceipt() throws java.io.IOException {
      server =
          com.sun.net.httpserver.HttpServer.create(
              new java.net.InetSocketAddress("127.0.0.1", 0), 0);
      server.createContext(
          "/v2/runs",
          exchange -> {
            exchange.getRequestBody().readAllBytes();
            calls.incrementAndGet();
            exchange.sendResponseHeaders(202, -1);
            exchange.close();
          });
      server.start();
    }

    @Override
    public void close() {
      server.stop(0);
    }
  }

  @TestConfiguration
  static class StubGateway {
    @Bean
    @Primary
    CountingGuidedGateway countingGuidedGateway() {
      return new CountingGuidedGateway();
    }

    @Bean(destroyMethod = "close")
    RuntimeReceipt runtimeReceipt() throws java.io.IOException {
      return new RuntimeReceipt();
    }

    @Bean
    @Primary
    RunnerDispatchClient observedRunner(
        RuntimeReceipt receipt,
        ObjectMapper mapper,
        com.citi.put.checks.studio.StudioExecutionProperties properties) {
      return new com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient(
          mapper,
          properties,
          new com.citi.put.checks.studio.dispatch.StudioRunnerProperties(
              "http://127.0.0.1:" + receipt.server.getAddress().getPort(),
              "controlled-runtime",
              java.time.Duration.ofSeconds(2)));
    }
  }

  @Autowired private ExecutionReadinessService readiness;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private CountingGuidedGateway guided;
  @Autowired private RuntimeReceipt receipt;
  @Autowired private RunnerDispatchClient runner;
  @Autowired private com.citi.put.checks.studio.StudioService studio;

  private UUID testId;

  @BeforeEach
  void setUp() {
    ReadinessFixtures.seedUser(jdbc, ReadinessFixtures.OWNER);
    ReadinessFixtures.seedCsi(jdbc, ReadinessFixtures.CSI_ID);
    testId = ReadinessFixtures.seedDraft(jdbc, STEPS);
    guided.calls.set(0);
    receipt.calls.set(0);
  }

  // ── AC-28(b): no model call anywhere on the execute path ──────────────────

  @Test
  void noGatewayCallHappensAcrossReadinessInAnyOfTheDeReadyStates() {
    assertThat(readiness.readiness(testId)).isEqualTo(StudioReadiness.UNLEARNED);
    ReadinessFixtures.learningSession(jdbc, testId, "PROPOSING");
    assertThat(readiness.readiness(testId)).isEqualTo(StudioReadiness.LEARNING);
    // Learned, then edited: the canonical de-ready state of the single path.
    new ObservedPublicationFixture(jdbc).publish(testId, List.of(), List.of());
    // A counter-only bump is no longer an edit (OBS-015: semantic identity, not counters); change
    // the learned text itself.
    jdbc.update(
        "UPDATE ui_tests SET source_revision = source_revision + 1,"
            + " steps = CAST('[\"Go somewhere else\"]' AS jsonb) WHERE id = ?",
        testId);
    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.code()).isEqualTo(ReadinessVerdict.LEARN_REQUIRED);
    assertThat(verdict.message()).contains("no longer match the text that was learned");
    assertThat(readiness.readiness(testId)).isEqualTo(StudioReadiness.LEARNING);

    assertNoProviders();
  }

  @Test
  void ordinaryAcceptanceReadinessAndRealHttpDispatchCallNeitherProvider() throws Exception {
    var identity =
        com.citi.put.checks.studio.StudioExecutionFixtures.identity(
            ReadinessFixtures.OWNER, ReadinessFixtures.CSI_ID, "owner");
    int executions = count("ui_test_executions");
    int ledger = count("studio_dispatch_ledger");

    // Execute never learns: an unlearned test is refused before any write and any model call.
    assertThatThrownBy(() -> studio.executeTest(testId, identity, UUID.randomUUID().toString()))
        .isInstanceOf(StudioConflictException.class)
        .extracting(error -> ((StudioConflictException) error).getCode())
        .isEqualTo(ReadinessVerdict.LEARN_REQUIRED);
    assertThat(count("ui_test_executions")).isEqualTo(executions);
    assertThat(count("studio_dispatch_ledger")).isEqualTo(ledger);
    assertNoProviders();

    // The one run family's real HTTP send reaches the runner and no provider.
    RunJob observed =
        RunJob.observed(
            new ObjectMapper()
                .readTree(
                    Files.readString(
                        Path.of(
                            "..",
                            "docs",
                            "specs",
                            "studio-observed-authoring",
                            "contracts",
                            "v3",
                            "publication-fixtures.json")))
                .path("examples")
                .path("ObservedJob")
                .path("value"),
            Map.of(),
            Map.of());
    assertThat(runner.send(observed).kind()).isEqualTo(DispatchOutcome.Kind.ACCEPTED);
    assertThat(receipt.calls.get()).isEqualTo(1);
    assertNoProviders();
  }

  @Test
  void injectedProviderCallsFalsifyTheZeroCallOracle() {
    guided.propose(null, null);
    assertThatThrownBy(this::assertNoProviders).isInstanceOf(AssertionError.class);
  }

  private void assertNoProviders() {
    assertThat(guided.calls.get()).as("guided model calls on the replay path").isZero();
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
  }
}
