package com.citi.put.checks.studio.compile;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
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
 * Story 10.8 AC-18 — the per-attempt budget, end to end through the pipeline.
 *
 * <p>Its own class because it needs a deployment configured with a budget short enough to observe,
 * and the bounds are validated against each other at startup: the budget must stay strictly greater
 * than the gateway's own request timeout, so both are lowered together.
 *
 * <p>The case that matters is the late one. A blocked gateway is released <em>after</em> the budget
 * has already abandoned the attempt, and the assertion is that nothing further happens: no
 * candidate, no validator call, no state change. This is belt-and-braces on top of 10.4's
 * conditional publish, and the braces are load-bearing — nothing about this draft moved on, so the
 * conditional publish would have matched its own guard and published.
 */
@SpringBootTest
@ActiveProfiles("local")
class CompileBudgetExpiryTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String OWNER = "budget-owner@citi.com";
  private static final String CSI_ID = "60405";
  private static final List<String> STEPS = List.of("Go to \"https://example.com/login\"");

  private static WireMockServer runner;

  static {
    runner = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    runner.start();
  }

  /** A gateway that blocks until released, and records whether it was ever released. */
  static final class HeldGateway implements LlmGatewayClient {

    private final CountDownLatch release = new CountDownLatch(1);
    private final CountDownLatch entered = new CountDownLatch(1);

    @Override
    public CompileResponse propose(
        com.citi.put.checks.studio.compile.gateway.CompileRequest request) {
      entered.countDown();
      try {
        if (!release.await(60, TimeUnit.SECONDS)) {
          throw new IllegalStateException("the held gateway was never released");
        }
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new IllegalStateException(e);
      }
      return CompileResponse.ok(
          artifact(),
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
    HeldGateway heldGateway() {
      return new HeldGateway();
    }
  }

  @DynamicPropertySource
  static void shortBudget(DynamicPropertyRegistry registry) {
    registry.add("studio.runner.base-url", () -> "http://localhost:" + runner.port());
    // All three, together: story 10.9 widened the budget to cover the whole request including its
    // repairs, so the startup rule is now
    //   budget > (1 + repair.max-attempts) x (gateway.request-timeout + runner.validate-timeout)
    // = 3 x (200ms + 10ms) = 630ms. The validate timeout has to come down with the others or the
    // context refuses to start — which is the AC-13 rule this class now also relies on, and which
    // is why the old pair of overrides was no longer sufficient.
    registry.add("studio.compile.gateway.request-timeout", () -> "200ms");
    registry.add("studio.runner.validate-timeout", () -> "10ms");
    registry.add("studio.compile.pipeline.attempt-budget", () -> "700ms");
  }

  @AfterAll
  static void stopRunner() {
    runner.stop();
  }

  @Autowired private CompilePipeline pipeline;
  @Autowired private HeldGateway gateway;
  @Autowired private JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void setUp() {
    runner.resetAll();
    runner.stubFor(
        post(urlEqualTo("/v1/validate"))
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("content-type", "application/json")
                    .withBody(
                        "{\"ok\":true,\"validatorSchemaVersion\":\"1.0.0\",\"diagnostics\":[],"
                            + "\"steps\":[{\"stepIndex\":0,\"ok\":true,\"diagnostics\":[]}]}")));
    seedUser();
    seedCsi();
    testId = seedTest();
  }

  @Test
  void anExpiredAttemptIsAbandonedAndItsLateResultChangesNothing() throws Exception {
    pipeline.compile(testId, OWNER);

    assertThat(gateway.entered.await(20, TimeUnit.SECONDS))
        .as("the attempt must reach the gateway and block there")
        .isTrue();

    awaitCompileStatus("STALE");
    assertThat(MAPPER.readTree(compileError()).path("code").asText())
        .isEqualTo(CompileErrorCode.COMPILE_BUDGET_EXCEEDED.name());
    UUID candidateAtExpiry = candidateRevisionId();
    String statusAtExpiry = compileStatus();

    // The late result: the stub is released only now, after the budget already gave up.
    gateway.release.countDown();
    Thread.sleep(1_500L);

    assertThat(compileStatus())
        .as("no further state change may follow an abandoned attempt")
        .isEqualTo(statusAtExpiry);
    assertThat(candidateRevisionId()).isEqualTo(candidateAtExpiry).isNull();
    assertThat(revisionCount())
        .as("no candidate revision may be written for an abandoned attempt")
        .isZero();
    runner.verify(0, postRequestedFor(urlEqualTo("/v1/validate")));
    assertThat(MAPPER.readTree(compileError()).path("code").asText())
        .as("the recorded code must still name the bound that actually fired")
        .isEqualTo(CompileErrorCode.COMPILE_BUDGET_EXCEEDED.name());
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private static String artifact() {
    ArrayNode steps = MAPPER.createArrayNode();
    var step = steps.addObject();
    step.put("stepIndex", 0);
    step.put("originalText", STEPS.get(0));
    step.put("code", "await page.goto('https://example.com/login');");
    var artifact = MAPPER.createObjectNode();
    artifact.put("version", CompilePins.SUPPORTED_ARTIFACT_VERSION);
    artifact.set("steps", steps);
    return artifact.toString();
  }

  private void awaitCompileStatus(String expected) {
    long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
    while (System.nanoTime() < deadline) {
      if (expected.equals(compileStatus())) {
        return;
      }
      try {
        Thread.sleep(25L);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new IllegalStateException(e);
      }
    }
    assertThat(compileStatus()).as("compile never reached %s", expected).isEqualTo(expected);
  }

  private String compileStatus() {
    return jdbc.queryForObject(
        "SELECT compile_status FROM ui_tests WHERE id = ?", String.class, testId);
  }

  private String compileError() {
    return jdbc.queryForObject(
        "SELECT compile_error::text FROM ui_tests WHERE id = ?", String.class, testId);
  }

  private UUID candidateRevisionId() {
    return jdbc.queryForObject(
        "SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId);
  }

  private int revisionCount() {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, testId);
  }

  private UUID seedTest() {
    UUID id = UUID.randomUUID();
    ArrayNode steps = MAPPER.createArrayNode();
    STEPS.forEach(steps::add);
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES (?, 'Budget draft', ?,"
            + " 'Production', 'chromium', CAST(? AS jsonb), CAST('[]' AS jsonb), ?, ?, ?)",
        id,
        CSI_ID,
        steps.toString(),
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private void seedUser() {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Budget Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Budget CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
