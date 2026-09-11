package com.citi.put.checks.studio.compile;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.compile.validator.StudioRunnerProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.github.tomakehurst.wiremock.stubbing.Scenario;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * The shared fixture for story 10.9's repair tests: a scripted gateway, a real HTTP runner stub and
 * a real PostgreSQL.
 *
 * <p>The runner is WireMock rather than a mocked client for the reason 10.8 gave: several criteria
 * assert how many {@code /v1/validate} calls were issued and that assertion is only worth anything
 * when it is made on the wire.
 *
 * <p>One base class rather than four copies, because the annotations here are the application
 * context's cache key: {@code @Import} is keyed on the imported class set and
 * {@code @DynamicPropertySource} on the declaring method, so every subclass shares one context and
 * one embedded PostgreSQL instead of starting its own.
 */
@SpringBootTest
@ActiveProfiles("local")
@Import(RepairStubs.class)
abstract class AbstractRepairPipelineTest {

  protected static final ObjectMapper MAPPER = new ObjectMapper();
  protected static final String OWNER = "repair-owner@citi.com";
  protected static final String CSI_ID = "60412";
  protected static final List<String> SOURCE =
      List.of("Go to \"https://example.com/login\"", "Click the \"Sign in\" button");

  protected static WireMockServer runner;

  static {
    // A static initializer, not @BeforeAll: Zonky's EmbeddedDatabaseTestExecutionListener refreshes
    // the context in beforeTestClass, which runs before @BeforeAll, and @DynamicPropertySource is
    // resolved during that refresh.
    runner = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    runner.start();
    // Stopped by the JVM, deliberately NOT by an @AfterAll. An @AfterAll declared here is inherited
    // and runs once per *subclass*, so the first repair test class to finish would tear down the
    // server the remaining ones are still bound to — and they would fail with the validator
    // unreachable, which is a fixture defect wearing the costume of a product bug. This was
    // measured on the integrated suite before it was fixed: RepairBoundsTest passed, stopped the
    // server, and RepairExhaustionTest and RepairLoopTest then failed together while every one of
    // them passed in isolation.
    Runtime.getRuntime().addShutdownHook(new Thread(runner::stop));
  }

  @DynamicPropertySource
  static void runnerUrl(DynamicPropertyRegistry registry) {
    registry.add("studio.runner.base-url", () -> "http://localhost:" + runner.port());
    registry.add("studio.runner.service-identity-token", () -> "test-service-identity");
  }

  @Autowired protected CompilePipeline pipeline;
  @Autowired protected CompileStateService states;
  @Autowired protected ScriptedRepairGateway gateway;
  @Autowired protected StudioCompileProperties properties;
  @Autowired protected StudioRunnerProperties runnerProperties;
  @Autowired protected StudioGatewayProperties gatewayProperties;
  @Autowired protected DiagnosticsBounder bounder;
  @Autowired protected JdbcTemplate jdbc;

  protected UUID testId;

  @BeforeEach
  void seedDraft() {
    runner.resetAll();
    gateway.reset(artifactFor(SOURCE, "await page.goto('https://example.com/login');"));
    ConfirmFixtures.seedUser(jdbc, OWNER);
    ConfirmFixtures.seedCsi(jdbc, CSI_ID, OWNER);
    testId = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
  }

  // ── the validator stub ───────────────────────────────────────────────────

  /**
   * Stubs {@code /v1/validate} to answer a different verdict on each successive call.
   *
   * <p>A WireMock scenario rather than a counter in the test: the transitions are enforced by the
   * server, so a pipeline that issued a call the script did not expect gets no answer rather than
   * silently reusing the last one.
   *
   * @param ok one entry per expected call, in order
   */
  protected static void stubValidatorSequence(boolean... ok) {
    runner.resetAll();
    for (int index = 0; index < ok.length; index++) {
      String from = index == 0 ? Scenario.STARTED : "call-" + index;
      runner.stubFor(
          post(urlEqualTo("/v1/validate"))
              .inScenario("validate-sequence")
              .whenScenarioStateIs(from)
              .willSetStateTo("call-" + (index + 1))
              .willReturn(jsonBody(ok[index] ? validVerdict() : invalidVerdict())));
    }
  }

  /** Stubs {@code /v1/validate} to answer the same body every time. */
  protected static void stubValidatorAlways(String body) {
    runner.resetAll();
    runner.stubFor(post(urlEqualTo("/v1/validate")).willReturn(jsonBody(body)));
  }

  protected static com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder jsonBody(
      String body) {
    return aResponse()
        .withStatus(200)
        .withHeader("content-type", "application/json")
        .withBody(body);
  }

  protected static String validVerdict() {
    return "{\"ok\":true,\"validatorSchemaVersion\":\"1.0.0\",\"diagnostics\":[],"
        + "\"steps\":[{\"stepIndex\":0,\"ok\":true,\"diagnostics\":[]},"
        + "{\"stepIndex\":1,\"ok\":true,\"diagnostics\":[]}]}";
  }

  protected static String invalidVerdict() {
    return invalidVerdict("no", "for(;;)");
  }

  protected static String invalidVerdict(String message, String excerpt) {
    return "{\"ok\":false,\"validatorSchemaVersion\":\"1.0.0\","
        + "\"diagnostics\":[{\"code\":\"ARTIFACT_STEP_COUNT\",\"stepIndex\":null,"
        + "\"message\":\"step count\",\"node\":null,\"excerpt\":null}],"
        + "\"steps\":[{\"stepIndex\":0,\"ok\":true,\"diagnostics\":[]},"
        + "{\"stepIndex\":1,\"ok\":false,\"diagnostics\":"
        + "[{\"code\":\"DENIED_NODE\",\"stepIndex\":1,\"message\":\""
        + message
        + "\",\"node\":\"ForStatement\",\"excerpt\":\""
        + excerpt
        + "\"}]}]}";
  }

  protected static int validateCalls() {
    return runner.getAllServeEvents().size();
  }

  // ── reads ────────────────────────────────────────────────────────────────

  protected static String artifactFor(List<String> steps, String code) {
    return ConfirmFixtures.artifactFor(steps, code);
  }

  protected void awaitCompileStatus(String expected) {
    awaitCompileStatus(testId, expected);
  }

  /** Polls until the asynchronous attempt has published; never a sleep of a guessed duration. */
  protected void awaitCompileStatus(UUID id, String expected) {
    long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    String observed = null;
    while (System.nanoTime() < deadline) {
      observed = compileStatus(id);
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
    assertThat(observed)
        .as("compile never reached %s for test %s", expected, id)
        .isEqualTo(expected);
  }

  protected String compileStatus(UUID id) {
    return jdbc.queryForObject(
        "SELECT compile_status FROM ui_tests WHERE id = ?", String.class, id);
  }

  protected JsonNode storedDiagnostics() {
    String stored =
        jdbc.queryForObject(
            "SELECT compile_diagnostics::text FROM ui_tests WHERE id = ?", String.class, testId);
    assertThat(stored).as("no diagnostics document was stored").isNotNull();
    try {
      return MAPPER.readTree(stored);
    } catch (Exception e) {
      throw new AssertionError("compile_diagnostics is not JSON: " + stored, e);
    }
  }

  protected String storedDiagnosticsText() {
    return jdbc.queryForObject(
        "SELECT compile_diagnostics::text FROM ui_tests WHERE id = ?", String.class, testId);
  }

  protected String storedErrorCode() {
    String stored =
        jdbc.queryForObject(
            "SELECT compile_error::text FROM ui_tests WHERE id = ?", String.class, testId);
    if (stored == null) {
      return null;
    }
    try {
      return MAPPER.readTree(stored).path("code").asText();
    } catch (Exception e) {
      throw new AssertionError("compile_error is not JSON: " + stored, e);
    }
  }

  protected int revisionCount() {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, testId);
  }

  protected UUID currentCandidate() {
    return jdbc.queryForObject(
        "SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId);
  }

  protected UUID confirmedRevision() {
    return jdbc.queryForObject(
        "SELECT confirmed_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId);
  }

  /** Kept so subclasses can seed extra drafts without re-deriving the insert. */
  protected UUID seedAnotherDraft(List<String> source) {
    return ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, source);
  }

  /** Unused directly; present so the timestamp import stays meaningful for subclasses. */
  protected static Timestamp now() {
    return Timestamp.from(Instant.now());
  }
}
