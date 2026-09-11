package com.citi.put.checks.studio.compile;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayErrorCode;
import com.citi.put.checks.studio.compile.gateway.GatewayOutcome;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
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
 * Story 10.8 AC-4, AC-9, AC-10, AC-13, AC-16, AC-17, AC-20 — the pipeline end to end against a stub
 * gateway and a real HTTP runner stub, on a real PostgreSQL.
 *
 * <p>The runner is WireMock rather than a mocked client on purpose: several criteria assert that no
 * runner call was issued at all, and that assertion is only worth anything when it is made on the
 * wire.
 */
@SpringBootTest
@ActiveProfiles("local")
class CompilePipelineTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String OWNER = "pipeline-owner@citi.com";
  private static final String CSI_ID = "60403";
  private static final List<String> STEPS =
      List.of("Go to \"https://example.com/login\"", "Click the \"Sign in\" button");

  private static WireMockServer runner;

  /** A gateway whose answer each test chooses, and which counts every call it receives. */
  static final class ScriptedGateway implements LlmGatewayClient {

    private final AtomicReference<
            Function<com.citi.put.checks.studio.compile.gateway.CompileRequest, CompileResponse>>
        script = new AtomicReference<>();
    private final AtomicInteger calls = new AtomicInteger();
    private final List<String> seenRequestIds = new CopyOnWriteArrayList<>();

    @Override
    public CompileResponse propose(
        com.citi.put.checks.studio.compile.gateway.CompileRequest request) {
      calls.incrementAndGet();
      seenRequestIds.add(request.compileRequestId());
      return script.get().apply(request);
    }

    void answer(
        Function<com.citi.put.checks.studio.compile.gateway.CompileRequest, CompileResponse> next) {
      script.set(next);
    }

    void reset() {
      calls.set(0);
      seenRequestIds.clear();
      script.set(request -> ok(artifactFor(STEPS)));
    }

    int calls() {
      return calls.get();
    }
  }

  @TestConfiguration
  static class Stubs {
    @Bean
    @Primary
    ScriptedGateway scriptedGateway() {
      return new ScriptedGateway();
    }
  }

  static {
    // A static initializer, not @BeforeAll: Zonky's EmbeddedDatabaseTestExecutionListener refreshes
    // the application context in beforeTestClass, which runs *before* @BeforeAll, and
    // @DynamicPropertySource is resolved during that refresh. A @BeforeAll here would hand the
    // binder a null server.
    runner = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    runner.start();
  }

  @AfterAll
  static void stopRunner() {
    runner.stop();
  }

  @DynamicPropertySource
  static void runnerUrl(DynamicPropertyRegistry registry) {
    registry.add("studio.runner.base-url", () -> "http://localhost:" + runner.port());
    registry.add("studio.runner.service-identity-token", () -> "test-service-identity");
  }

  @Autowired private CompilePipeline pipeline;
  @Autowired private CompileStateService states;
  @Autowired private ScriptedGateway gateway;
  @Autowired private JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void setUp() {
    runner.resetAll();
    stubValidator(true);
    gateway.reset();
    seedUser();
    seedCsi();
    testId = seedTest(STEPS);
  }

  // ── AC-16: a successful compile becomes AWAITING_CONFIRMATION, never READY ─

  @Test
  void aSuccessfulCompileAwaitsConfirmationAndNeverConfirmsItself() {
    pipeline.compile(testId, OWNER);

    awaitCompileStatus("AWAITING_CONFIRMATION");
    assertThat(column("current_candidate_revision_id", UUID.class)).isNotNull();
    assertThat(column("confirmed_revision_id", UUID.class))
        .as("no path in this story sets READY; only CompileStateService.confirm does")
        .isNull();
  }

  @Test
  void arecompileOfAnAlreadyConfirmedTestLeavesTheConfirmedRevisionAlone() {
    pipeline.compile(testId, OWNER);
    awaitCompileStatus("AWAITING_CONFIRMATION");
    UUID candidate = column("current_candidate_revision_id", UUID.class);
    states.confirm(
        testId,
        candidate,
        artifactHash(candidate),
        sourceRevision(),
        configurationRevision(),
        OWNER);
    assertThat(column("confirmed_revision_id", UUID.class)).isEqualTo(candidate);

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("AWAITING_CONFIRMATION");

    assertThat(column("confirmed_revision_id", UUID.class))
        .as("a recompile proposes; it does not approve")
        .isEqualTo(candidate);
  }

  // ── AC-11a: the provenance §8.1 requires ──────────────────────────────────

  @Test
  void theCandidateRevisionCarriesTheVersionsSectionEightPointOneRequires() throws Exception {
    pipeline.compile(testId, OWNER);
    awaitCompileStatus("AWAITING_CONFIRMATION");

    JsonNode provenance =
        MAPPER.readTree(
            jdbc.queryForObject(
                "SELECT provenance::text FROM ui_test_revisions WHERE id ="
                    + " (SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?)",
                String.class,
                testId));

    assertThat(provenance.path("model").asText()).isEqualTo("stub-model@1");
    assertThat(provenance.path("promptVersion").asText()).isEqualTo(CompilePins.PROMPT_VERSION);
    assertThat(provenance.path("syntaxReferenceVersion").asText())
        .isEqualTo(CompilePins.SYNTAX_REFERENCE_VERSION);
    assertThat(provenance.path("languagePolicyVersion").asText()).isEqualTo("1.0.0");
    assertThat(provenance.path("validatorSchemaVersion").asText())
        .as("the version the validator reported it actually ran, not the one we hoped for")
        .isEqualTo("1.0.0");
    assertThat(provenance.path("executorVersion").asText()).isEqualTo("1.0.0");
    assertThat(provenance.path("playwrightVersion").asText()).isEqualTo("1.63.0");
    assertThat(provenance.path("artifactSchemaVersion").asInt())
        .isEqualTo(CompilePins.SUPPORTED_ARTIFACT_VERSION);

    assertThat(
            jdbc.queryForObject(
                "SELECT artifact_schema_version FROM ui_test_revisions WHERE id ="
                    + " (SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?)",
                Integer.class,
                testId))
        .isEqualTo(CompilePins.SUPPORTED_ARTIFACT_VERSION);
  }

  @Test
  void theStoredReferencesCarryNamesAndNoValues() throws Exception {
    jdbc.update(
        "UPDATE ui_tests SET variables = CAST(? AS jsonb) WHERE id = ?",
        "[{\"name\":\"USERNAME\",\"kind\":\"plain\",\"value\":\"alice-canary\"},"
            + "{\"name\":\"PASSWORD\",\"kind\":\"secretRef\",\"secretId\":\"LOGIN_PW\"}]",
        testId);

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("AWAITING_CONFIRMATION");

    String references =
        jdbc.queryForObject(
            "SELECT \"references\"::text FROM ui_test_revisions WHERE id ="
                + " (SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?)",
            String.class,
            testId);
    JsonNode parsed = MAPPER.readTree(references);

    assertThat(parsed.path("variables").get(0).asText()).isEqualTo("USERNAME");
    assertThat(parsed.path("secrets").get(0).asText()).isEqualTo("LOGIN_PW");
    assertThat(references).doesNotContain("alice-canary");

    String configuration =
        jdbc.queryForObject(
            "SELECT configuration::text FROM ui_test_revisions WHERE id ="
                + " (SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?)",
            String.class,
            testId);
    assertThat(configuration)
        .as("a plain variable's value is still someone's data and outlives the draft here")
        .doesNotContain("alice-canary");

    assertThat(runner.getAllServeEvents().get(0).getRequest().getBodyAsString())
        .doesNotContain("alice-canary");
  }

  // ── AC-9: every non-OK gateway outcome routes to publishError ─────────────

  @Test
  void everyGatewayErrorCodeBecomesAStaleDraftCarryingThatCodeAndNothingElse() {
    for (GatewayErrorCode code : GatewayErrorCode.values()) {
      UUID id = seedTest(STEPS);
      gateway.answer(
          request ->
              CompileResponse.failure(
                  outcomeFor(code), code, "a reason the draft must never see", null, 0, 1L, 0, 0));

      pipeline.compile(id, OWNER);

      awaitCompileStatus(id, "STALE");
      assertCompileErrorIsExactly(id, code.name());
      assertThat(
              jdbc.queryForObject(
                  "SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?",
                  UUID.class,
                  id))
          .as("publishError clears the candidate (10.4's ISSUE-001 fix)")
          .isNull();
      assertThat(
              jdbc.queryForObject(
                  "SELECT steps::text FROM ui_tests WHERE id = ?", String.class, id))
          .as("the authored draft itself is untouched and stays saved")
          .contains("https://example.com/login");
    }
  }

  @Test
  void aFailedGatewayCallNeverReachesTheValidator() {
    gateway.answer(
        request ->
            CompileResponse.failure(
                GatewayOutcome.TIMEOUT,
                GatewayErrorCode.GATEWAY_TIMEOUT,
                "timeout",
                null,
                0,
                1L,
                0,
                0));

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("STALE");

    runner.verify(0, postRequestedFor(urlEqualTo("/v1/validate")));
  }

  // ── AC-10: schema validity is not executability ───────────────────────────

  @Test
  void aSchemaValidVersionTwoArtifactIsNeverValidatedOrPersisted() {
    gateway.answer(request -> ok(artifactFor(STEPS).replace("\"version\":1", "\"version\":2")));

    pipeline.compile(testId, OWNER);

    awaitCompileStatus("STALE");
    assertCompileErrorIsExactly(testId, "GATEWAY_PARSE_FAILURE");
    runner.verify(0, postRequestedFor(urlEqualTo("/v1/validate")));
    assertThat(revisionCount(testId))
        .as("a V2 artifact is never written as a candidate revision")
        .isZero();
  }

  // ── AC-13: ok:false is a verdict ──────────────────────────────────────────

  @Test
  void aRejectedArtifactBecomesNeedsRevisionWithIndexAlignedDiagnosticsAndNoError()
      throws Exception {
    stubValidatorRejecting();

    pipeline.compile(testId, OWNER);

    awaitCompileStatus("NEEDS_REVISION");
    assertThat(
            jdbc.queryForObject(
                "SELECT compile_error::text FROM ui_tests WHERE id = ?", String.class, testId))
        .as("a 200 {ok:false} is a verdict, not a transport failure")
        .isNull();
    assertThat(revisionCount(testId))
        .as("an invalid artifact can never become confirmable, so no revision row exists")
        .isZero();
    assertThat(column("current_candidate_revision_id", UUID.class)).isNull();

    JsonNode diagnostics =
        MAPPER.readTree(
            jdbc.queryForObject(
                "SELECT compile_diagnostics::text FROM ui_tests WHERE id = ?",
                String.class,
                testId));
    assertThat(diagnostics.path("steps"))
        .as("one entry per original step, index aligned")
        .hasSize(STEPS.size());
    assertThat(diagnostics.path("steps").get(1).path("stepIndex").asInt()).isEqualTo(1);
    assertThat(diagnostics.path("artifact"))
        .as("artifact-level diagnostics are kept separate from step diagnostics")
        .hasSize(1);
    runner.verify(1, postRequestedFor(urlEqualTo("/v1/validate")));
  }

  // ── AC-20: the compile cache stays disabled in V1 ─────────────────────────

  @Test
  void twoCompilesOfByteIdenticalSourceIssueTwoGatewayCallsBecauseThereIsNoCache() {
    pipeline.compile(testId, OWNER);
    awaitCompileStatus("AWAITING_CONFIRMATION");
    pipeline.compile(testId, OWNER);
    awaitCompileStatus("AWAITING_CONFIRMATION");

    assertThat(gateway.calls())
        .as(
            "no cache, no memoization, no keyed reuse of a gateway response — §8.5 keeps the"
                + " compile cache disabled in V1")
        .isEqualTo(2);
  }

  @Test
  void insertOrReuseRevisionResolvesAnIdenticalArtifactAfterTheGatewayAnsweredAndIsNotACache() {
    pipeline.compile(testId, OWNER);
    awaitCompileStatus("AWAITING_CONFIRMATION");
    UUID first = column("current_candidate_revision_id", UUID.class);

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("AWAITING_CONFIRMATION");
    UUID second = column("current_candidate_revision_id", UUID.class);

    assertThat(second)
        .as("identical artifact identity resolves to the same row rather than duplicating it")
        .isEqualTo(first);
    assertThat(revisionCount(testId)).isEqualTo(1);
    assertThat(gateway.calls())
        .as("and the gateway was still asked both times — that is the whole difference")
        .isEqualTo(2);
  }

  // ── AC-6: limits are enforced before a compile request is begun ───────────

  @Test
  void anOverLimitDraftIsRejectedWithoutBeginningACompile() {
    UUID id = seedTest(lines(101));
    String statusBefore = compileStatus(id);
    UUID requestBefore =
        jdbc.queryForObject("SELECT compile_request_id FROM ui_tests WHERE id = ?", UUID.class, id);

    assertThatThrownBy(() -> pipeline.compile(id, OWNER))
        .isInstanceOf(StudioValidationException.class)
        .extracting(e -> ((StudioValidationException) e).getCode())
        .isEqualTo(AuthoringLimits.TOO_MANY_STEPS);

    assertThat(compileStatus(id)).isEqualTo(statusBefore);
    assertThat(
            jdbc.queryForObject(
                "SELECT compile_request_id FROM ui_tests WHERE id = ?", UUID.class, id))
        .as("beginCompile must not have been called")
        .isEqualTo(requestBefore);
    assertThat(gateway.calls()).isZero();
    runner.verify(0, postRequestedFor(urlEqualTo("/v1/validate")));
  }

  @Test
  void anInlineCredentialIsRejectedBeforeGatewaySubmission() {
    UUID id = seedTest(List.of("Go home", "Use AKIAIOSFODNN7EXAMPLE to sign in"));

    assertThatThrownBy(() -> pipeline.compile(id, OWNER))
        .isInstanceOf(StudioValidationException.class)
        .extracting(e -> ((StudioValidationException) e).getCode())
        .isEqualTo(CredentialPatternScreen.INLINE_CREDENTIAL);

    assertThat(gateway.calls()).isZero();
  }

  // ── AC-12a: the validator being unavailable is a retryable compile failure ─

  @Test
  void aValidatorFiveHundredLeavesTheDraftStaleAndRetryableWithoutASecondCall() {
    runner.resetAll();
    runner.stubFor(post(urlEqualTo("/v1/validate")).willReturn(aResponse().withStatus(500)));

    pipeline.compile(testId, OWNER);

    awaitCompileStatus("STALE");
    assertCompileErrorIsExactly(testId, "VALIDATOR_UNAVAILABLE");
    runner.verify(1, postRequestedFor(urlEqualTo("/v1/validate")));
  }

  // ── helpers ───────────────────────────────────────────────────────────────

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

  static CompileResponse ok(String artifactJson) {
    return CompileResponse.ok(
        artifactJson,
        new GatewayProvenance("stub-model@1", "001", CompilePins.PROMPT_VERSION, "1.52.0", true, 0),
        0,
        12L,
        100,
        200);
  }

  static String artifactFor(List<String> steps) {
    StringBuilder artifact = new StringBuilder("{\"version\":1,\"steps\":[");
    for (int index = 0; index < steps.size(); index++) {
      if (index > 0) {
        artifact.append(',');
      }
      artifact
          .append("{\"stepIndex\":")
          .append(index)
          .append(",\"originalText\":")
          .append(new com.fasterxml.jackson.databind.node.TextNode(steps.get(index)))
          .append(",\"code\":\"await page.goto('https://example.com/login');\"}");
    }
    return artifact.append("]}").toString();
  }

  private static void stubValidator(boolean ok) {
    runner.stubFor(
        post(urlEqualTo("/v1/validate"))
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("content-type", "application/json")
                    .withBody(
                        "{\"ok\":"
                            + ok
                            + ",\"validatorSchemaVersion\":\"1.0.0\",\"diagnostics\":[],"
                            + "\"steps\":[{\"stepIndex\":0,\"ok\":true,\"diagnostics\":[]},"
                            + "{\"stepIndex\":1,\"ok\":true,\"diagnostics\":[]}]}")));
  }

  private static void stubValidatorRejecting() {
    runner.resetAll();
    runner.stubFor(
        post(urlEqualTo("/v1/validate"))
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("content-type", "application/json")
                    .withBody(
                        "{\"ok\":false,\"validatorSchemaVersion\":\"1.0.0\","
                            + "\"diagnostics\":[{\"code\":\"ARTIFACT_STEP_COUNT\","
                            + "\"stepIndex\":null,\"message\":\"step count\",\"node\":null,"
                            + "\"excerpt\":null}],"
                            + "\"steps\":[{\"stepIndex\":0,\"ok\":true,\"diagnostics\":[]},"
                            + "{\"stepIndex\":1,\"ok\":false,\"diagnostics\":"
                            + "[{\"code\":\"DENIED_NODE\",\"stepIndex\":1,\"message\":\"no\","
                            + "\"node\":\"ForStatement\",\"excerpt\":\"for(;;)\"}]}]}")));
  }

  /**
   * {@code compile_error} carries the bounded, scrubbed code and <em>nothing else</em> — asserted
   * on the parsed document rather than its text, because {@code jsonb::text} reformats what was
   * written and an exact string comparison would be asserting PostgreSQL's whitespace.
   */
  private void assertCompileErrorIsExactly(UUID id, String code) {
    String stored =
        jdbc.queryForObject(
            "SELECT compile_error::text FROM ui_tests WHERE id = ?", String.class, id);
    JsonNode error;
    try {
      error = MAPPER.readTree(stored);
    } catch (Exception e) {
      throw new AssertionError("compile_error is not a JSON document: " + stored, e);
    }
    assertThat(error.properties())
        .as("%s: compile_error must carry the code and no reason, prompt or response text", code)
        .hasSize(1);
    assertThat(error.path("code").asText()).as("%s", code).isEqualTo(code);
  }

  private void awaitCompileStatus(String expected) {
    awaitCompileStatus(testId, expected);
  }

  /**
   * Polls until the asynchronous attempt has published. Deliberately not a sleep: the attempt is
   * off the request thread by design, so the test has to wait for a state change rather than for a
   * duration somebody guessed.
   */
  private void awaitCompileStatus(UUID id, String expected) {
    long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
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

  private String compileStatus(UUID id) {
    return jdbc.queryForObject(
        "SELECT compile_status FROM ui_tests WHERE id = ?", String.class, id);
  }

  private <T> T column(String name, Class<T> type) {
    return jdbc.queryForObject("SELECT " + name + " FROM ui_tests WHERE id = ?", type, testId);
  }

  private String artifactHash(UUID revisionId) {
    return jdbc.queryForObject(
        "SELECT artifact_hash FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
  }

  private long sourceRevision() {
    return jdbc.queryForObject(
        "SELECT source_revision FROM ui_tests WHERE id = ?", Long.class, testId);
  }

  private long configurationRevision() {
    return jdbc.queryForObject(
        "SELECT configuration_revision FROM ui_tests WHERE id = ?", Long.class, testId);
  }

  private int revisionCount(UUID id) {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, id);
  }

  private static List<String> lines(int count) {
    return java.util.stream.IntStream.range(0, count)
        .mapToObj(index -> "Go to \"https://example.com/page-" + index + "\"")
        .toList();
  }

  private UUID seedTest(List<String> steps) {
    UUID id = UUID.randomUUID();
    com.fasterxml.jackson.databind.node.ArrayNode stepsJson = MAPPER.createArrayNode();
    steps.forEach(stepsJson::add);
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES (?, 'Pipeline draft', ?,"
            + " 'Production', 'chromium', CAST(? AS jsonb), CAST('[]' AS jsonb), ?, ?, ?)",
        id,
        CSI_ID,
        stepsJson.toString(),
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private void seedUser() {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Pipeline Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Pipeline CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
