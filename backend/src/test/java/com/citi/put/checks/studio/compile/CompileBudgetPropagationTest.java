package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.gateway.CompileRequest;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayErrorCode;
import com.citi.put.checks.studio.compile.gateway.GatewayOutcome;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
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
 * VAL-007 / C0 &sect;5 — the pipeline hands the request-owned budget to the gateway, so the
 * executor's deadline timer cancels an in-flight call and the call gives its capacity slot back.
 *
 * <p>The stub behaves like {@code GenAiLlmGatewayClient}: called without a budget it makes its own
 * per-call one of {@link SlowGateway#OWN_TIMEOUT}, and it holds one permit of a one-permit bulkhead
 * until its budget is cancelled or its own timeout passes. A pipeline that called the budget-less
 * overload would leave the call — and the permit — held for the full 30 seconds after the 700ms
 * compile budget had already given up, which is the zombie permit F5 describes.
 */
@SpringBootTest
@ActiveProfiles("local")
class CompileBudgetPropagationTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String OWNER = "propagation-owner@citi.com";
  private static final String CSI_ID = "60433";
  private static final List<String> STEPS = List.of("Go to \"https://example.com/login\"");
  private static final Duration ATTEMPT_BUDGET = Duration.ofMillis(700);

  private static final WireMockServer RUNNER;

  static {
    RUNNER = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    RUNNER.start();
  }

  /**
   * A slow gateway with a one-permit bulkhead, released only by cancellation or its own timeout.
   */
  static final class SlowGateway implements LlmGatewayClient {

    static final Duration OWN_TIMEOUT = Duration.ofSeconds(30);

    final Semaphore capacity = new Semaphore(1);
    final CountDownLatch entered = new CountDownLatch(1);
    final CountDownLatch returned = new CountDownLatch(1);
    volatile CompileBudget received;

    @Override
    public CompileResponse propose(CompileRequest request) {
      return propose(request, new CompileBudget(OWN_TIMEOUT));
    }

    @Override
    public CompileResponse propose(CompileRequest request, CompileBudget budget) {
      if (!capacity.tryAcquire()) {
        return failure(GatewayOutcome.BUSY, GatewayErrorCode.GATEWAY_BUSY);
      }
      received = budget;
      Runnable deregister = null;
      try {
        CountDownLatch cancelled = new CountDownLatch(1);
        deregister = budget.onCancel(cancelled::countDown);
        entered.countDown();
        cancelled.await(OWN_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
        return failure(GatewayOutcome.TIMEOUT, GatewayErrorCode.GATEWAY_TIMEOUT);
      } catch (CancellationException expired) {
        return failure(GatewayOutcome.TIMEOUT, GatewayErrorCode.GATEWAY_TIMEOUT);
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
        return failure(GatewayOutcome.TIMEOUT, GatewayErrorCode.GATEWAY_TIMEOUT);
      } finally {
        if (deregister != null) {
          deregister.run();
        }
        capacity.release();
        returned.countDown();
      }
    }

    private static CompileResponse failure(GatewayOutcome outcome, GatewayErrorCode code) {
      return CompileResponse.failure(outcome, code, "held", null, 0, 1L, 10, 0);
    }
  }

  @TestConfiguration
  static class Stubs {
    @Bean
    @Primary
    SlowGateway slowGateway() {
      return new SlowGateway();
    }
  }

  @DynamicPropertySource
  static void shortBudget(DynamicPropertyRegistry registry) {
    registry.add("studio.runner.base-url", () -> "http://localhost:" + RUNNER.port());
    registry.add("studio.runner.service-identity-token", () -> "test-service-identity");
    registry.add("studio.compile.pipeline.attempt-budget", () -> ATTEMPT_BUDGET.toMillis() + "ms");
  }

  @AfterAll
  static void stopRunner() {
    RUNNER.stop();
  }

  @Autowired private CompilePipeline pipeline;
  @Autowired private SlowGateway gateway;
  @Autowired private JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void seed() {
    RUNNER.resetAll();
    ConfirmFixtures.seedUser(jdbc, OWNER);
    ConfirmFixtures.seedCsi(jdbc, CSI_ID, OWNER);
    testId = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, STEPS);
  }

  @Test
  void anExpiredBudgetCancelsTheInFlightCallAndReleasesItsCapacitySlot() throws Exception {
    long started = System.nanoTime();
    pipeline.compile(testId, OWNER);

    assertThat(gateway.entered.await(20, TimeUnit.SECONDS))
        .as("the attempt must reach the gateway and hold a permit there")
        .isTrue();
    assertThat(gateway.capacity.availablePermits()).as("the call holds the only permit").isZero();

    assertThat(gateway.returned.await(5, TimeUnit.SECONDS))
        .as(
            "the %dms compile budget must cancel the call long before its own %ds timeout",
            ATTEMPT_BUDGET.toMillis(), SlowGateway.OWN_TIMEOUT.toSeconds())
        .isTrue();
    assertThat(Duration.ofNanos(System.nanoTime() - started))
        .isLessThan(SlowGateway.OWN_TIMEOUT.dividedBy(3));
    assertThat(gateway.capacity.availablePermits())
        .as("the cancelled call gave its capacity slot back")
        .isEqualTo(1);
    assertThat(gateway.received.isCancelled())
        .as("the gateway received the request-owned budget the deadline timer cancelled")
        .isTrue();

    awaitCompileStatus("STALE");
    assertThat(MAPPER.readTree(compileError()).path("code").asText())
        .as("the recorded code names the bound that fired")
        .isEqualTo(CompileErrorCode.COMPILE_BUDGET_EXCEEDED.name());
    assertThat(RUNNER.getAllServeEvents()).as("the validator is never called").isEmpty();
  }

  private void awaitCompileStatus(String expected) {
    long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
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

  private String compileError() {
    return jdbc.queryForObject(
        "SELECT compile_error::text FROM ui_tests WHERE id = ?", String.class, testId);
  }
}
