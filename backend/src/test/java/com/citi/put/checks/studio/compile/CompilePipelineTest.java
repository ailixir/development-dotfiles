package com.citi.put.checks.studio.compile;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.encoder.PatternLayoutEncoder;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.OutputStreamAppender;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayAuditLogger;
import com.citi.put.checks.studio.compile.gateway.GatewayErrorCode;
import com.citi.put.checks.studio.compile.gateway.GatewayOutcome;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
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
 * Story 10.8 AC-4, AC-9, AC-10, AC-13, AC-16, AC-17, AC-20, AC-29 — the pipeline end to end against
 * a stub gateway and a real HTTP runner stub, on a real PostgreSQL.
 *
 * <p>The runner is WireMock rather than a mocked client on purpose: several criteria assert that no
 * runner call was issued at all, and that assertion is only worth anything when it is made on the
 * wire.
 *
 * <p>AC-29 is asserted the same way, on captured output rather than on source text. Every test in
 * this class runs with a logback appender attached to the root logger, encoding each event — the
 * formatted message and the full throwable chain — into a byte buffer. What the assertions read is
 * what the sink was handed.
 */
@SpringBootTest
@ActiveProfiles("local")
class CompilePipelineTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String OWNER = "pipeline-owner@citi.com";
  private static final String CSI_ID = "60403";
  private static final List<String> STEPS =
      List.of("Go to \"https://example.com/login\"", "Click the \"Sign in\" button");

  /**
   * AC-29's canaries, one per way a value realistically reaches a log sink. Each is planted in a
   * different carrier and the value itself is what the assertion names when it leaks, so a failure
   * says which path opened rather than only that one did.
   */
  private static final String SOURCE_CANARY = "src-canary-7c1f42";

  private static final String ARTIFACT_CANARY = "artifact-canary-b9d3e0";
  private static final String RESOLVED_VALUE_CANARY = "resolved-canary-4a8e11";
  private static final String THROWN_MESSAGE_CANARY = "thrown-canary-2f55c7";
  private static final String NESTED_EXCERPT_CANARY = "nested-canary-e6b704";

  private static final Map<String, String> CANARIES =
      Map.of(
          "source line", SOURCE_CANARY,
          "artifact fragment", ARTIFACT_CANARY,
          "resolved variable value", RESOLVED_VALUE_CANARY,
          "exception message", THROWN_MESSAGE_CANARY,
          "nested diagnostic excerpt", NESTED_EXCERPT_CANARY);

  /** Logged through a compile-package logger so a silent or detached appender cannot pass. */
  private static final String SINK_PROBE = "log-sink-probe-0a1b2c";

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

  private ByteArrayOutputStream sink;
  private OutputStreamAppender<ILoggingEvent> sinkAppender;
  private Map<String, Level> restoreLevels;

  @BeforeEach
  void setUp() {
    attachLogSink();
    runner.resetAll();
    stubValidator(true);
    gateway.reset();
    seedUser();
    seedCsi();
    testId = seedTest(STEPS);
  }

  @AfterEach
  void detachLogSink() {
    LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
    context.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).detachAppender(sinkAppender);
    sinkAppender.stop();
    restoreLevels.forEach((name, level) -> context.getLogger(name).setLevel(level));
  }

  // ── AC-16: a successful compile is accepted for its caller and becomes READY ─

  @Test
  void aSuccessfulCompileIsAcceptedForTheCallerThatAskedForIt() {
    // Saving no longer compiles: a compile happens because the author pressed Run, and Run means
    // "prepare this and run it". Parking the result in AWAITING_CONFIRMATION asked the same
    // question twice, so the validated candidate is accepted for the requesting principal in the
    // same transaction that publishes it.
    pipeline.compile(testId, OWNER);

    awaitCompileStatus("READY");
    UUID candidate = column("current_candidate_revision_id", UUID.class);
    assertThat(candidate).isNotNull();
    assertThat(column("confirmed_revision_id", UUID.class))
        .as("the accepted candidate is the confirmed revision")
        .isEqualTo(candidate);
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_by FROM ui_test_revisions WHERE id = ?", String.class, candidate))
        .as("accepted on behalf of the principal that asked, never anonymously")
        .isEqualTo(OWNER);
  }

  @Test
  void arecompileOfUnchangedSourceResolvesToTheSameConfirmedRevision() {
    pipeline.compile(testId, OWNER);
    awaitCompileStatus("READY");
    UUID candidate = column("current_candidate_revision_id", UUID.class);
    assertThat(column("confirmed_revision_id", UUID.class)).isEqualTo(candidate);

    // A second compile of byte-identical source issues a second gateway call (there is no cache)
    // but resolves to the same immutable revision, so the confirmed revision does not move.
    pipeline.compile(testId, OWNER);
    awaitCompileStatus("READY");

    assertThat(column("confirmed_revision_id", UUID.class))
        .as("an identical artifact is the same revision, so nothing was re-approved")
        .isEqualTo(candidate);
  }

  // ── AC-11a: the provenance §8.1 requires ──────────────────────────────────

  @Test
  void theCandidateRevisionCarriesTheVersionsSectionEightPointOneRequires() throws Exception {
    pipeline.compile(testId, OWNER);
    awaitCompileStatus("READY");

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
  void authoringV2CompilePersistsTheDerivationVersionInColumnAndProvenance() throws Exception {
    String first = UUID.randomUUID().toString();
    String second = UUID.randomUUID().toString();
    String authoring =
        "{\"authoringSchemaVersion\":2,\"globalContext\":{\"entries\":[],"
            + "\"evidenceReferences\":[]},\"steps\":[{\"id\":\""
            + first
            + "\",\"text\":\"Go to \\\"https://example.com/login\\\"\","
            + "\"context\":{\"entries\":[],\"evidenceReferences\":[]}},{\"id\":\""
            + second
            + "\",\"text\":\"Verify the page heading says Example Domain\","
            + "\"context\":{\"entries\":[],\"evidenceReferences\":[]}}]}";
    String inputs =
        MAPPER.writeValueAsString(
            AuthoringRevisionIdentity.create(
                MAPPER.readValue(authoring, AuthoringV2Request.class), Map.of()));
    // A plain-English step outside the retired grammar reaches the model (ADR-SC-003).
    jdbc.update(
        "UPDATE ui_tests SET authoring=CAST(? AS jsonb),"
            + " authoring_revision_inputs=CAST(? AS jsonb), steps=CAST(? AS jsonb) WHERE id=?",
        authoring,
        inputs,
        MAPPER.writeValueAsString(
            List.of(
                "Go to \"https://example.com/login\"",
                "Verify the page heading says Example Domain")),
        testId);

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("READY");
    Map<String, Object> row =
        jdbc.queryForMap(
            "SELECT intent_derivation_version,provenance::text provenance,"
                + "reference_policy::text reference_policy FROM ui_test_revisions WHERE id="
                + " (SELECT current_candidate_revision_id FROM ui_tests WHERE id=?)",
            testId);
    assertThat(row.get("intent_derivation_version")).isEqualTo("2");
    assertThat(
            MAPPER
                .readTree(String.valueOf(row.get("provenance")))
                .path("intentDerivationVersion")
                .asText())
        .isEqualTo("2");
    assertThat(MAPPER.readTree(String.valueOf(row.get("reference_policy"))).path("steps"))
        .hasSize(2);
  }

  @Test
  void theStoredReferencesCarryNamesAndNoValues() throws Exception {
    jdbc.update(
        "UPDATE ui_tests SET variables = CAST(? AS jsonb) WHERE id = ?",
        "[{\"name\":\"USERNAME\",\"kind\":\"plain\",\"value\":\"alice-canary\"},"
            + "{\"name\":\"PASSWORD\",\"kind\":\"secretRef\",\"secretId\":\"LOGIN_PW\"}]",
        testId);

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("READY");

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
    // Story 10.9 changed this number and it is stated rather than quietly relaxed. This stub
    // rejects *every* artifact, so the compile now makes its two §4.3 repair attempts before
    // exhausting — three proposals and three validations, which is the bound RepairLoopTest owns.
    // The sibling below still verifies exactly one call, because a validator *failure* ends the
    // loop rather than spending a repair on it. What 10.8's assertion was protecting is unchanged
    // and is asserted above: an invalid artifact publishes no revision, clears the candidate, and
    // records index-aligned diagnostics.
    runner.verify(3, postRequestedFor(urlEqualTo("/v1/validate")));
  }

  // ── AC-20: the compile cache stays disabled in V1 ─────────────────────────

  @Test
  void twoCompilesOfByteIdenticalSourceIssueTwoGatewayCallsBecauseThereIsNoCache() {
    pipeline.compile(testId, OWNER);
    awaitCompileStatus("READY");
    pipeline.compile(testId, OWNER);
    awaitCompileStatus("READY");

    assertThat(gateway.calls())
        .as(
            "no cache, no memoization, no keyed reuse of a gateway response — §8.5 keeps the"
                + " compile cache disabled in V1")
        .isEqualTo(2);
  }

  @Test
  void insertOrReuseRevisionResolvesAnIdenticalArtifactAfterTheGatewayAnsweredAndIsNotACache() {
    pipeline.compile(testId, OWNER);
    awaitCompileStatus("READY");
    UUID first = column("current_candidate_revision_id", UUID.class);

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("READY");
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

  // ── AC-29: the bytes the log sink was actually handed ─────────────────────

  /**
   * The fixture's own guard. Every {@code doesNotContain} below is worthless if the appender is not
   * attached, is filtered out by a level, or renders nothing; this asserts the sink is live, that
   * it is reached through a compile-package logger, that a level as low as TRACE still arrives — so
   * a leak at DEBUG would be captured too — and that a formatted argument is rendered into the
   * captured bytes rather than left as a placeholder.
   */
  @Test
  void theCapturingSinkIsLiveAndRendersFormattedArgumentsAndThrowables() {
    org.slf4j.Logger logger = LoggerFactory.getLogger(CompilePipeline.class);
    logger.trace("probe argument={}", SOURCE_CANARY);
    logger.warn("probe throwable", new IllegalStateException(THROWN_MESSAGE_CANARY));

    String captured = captured();
    assertThat(captured)
        .as("the appender must be attached to the root logger for the whole class")
        .contains(SINK_PROBE)
        .as("a TRACE event from a compile-package logger must reach the buffer")
        .contains("probe argument=" + SOURCE_CANARY)
        .as("a throwable handed to a log site must be rendered into the captured bytes")
        .contains(THROWN_MESSAGE_CANARY)
        .contains("IllegalStateException");
  }

  @Test
  void aSuccessfulCompileHandsNoSourceArtifactOrResolvedValueToTheLogSink() {
    UUID id = seedTest(List.of("Go to \"https://example.com/" + SOURCE_CANARY + "\""));
    jdbc.update(
        "UPDATE ui_tests SET variables = CAST(? AS jsonb) WHERE id = ?",
        "[{\"name\":\"USERNAME\",\"kind\":\"plain\",\"value\":\"" + RESOLVED_VALUE_CANARY + "\"}]",
        id);
    gateway.answer(request -> ok(artifactWithCanaryCode(sourceOf(request))));

    pipeline.compile(id, OWNER);
    awaitCompileStatus(id, "READY");

    // Non-vacuity: all three values really travelled the compile path on this attempt.
    assertThat(runner.getAllServeEvents().get(0).getRequest().getBodyAsString())
        .as("the source and the artifact do reach the validator on the wire")
        .contains(SOURCE_CANARY)
        .contains(ARTIFACT_CANARY);
    assertThat(
            jdbc.queryForObject(
                "SELECT variables::text FROM ui_tests WHERE id = ?", String.class, id))
        .as("the resolved value is on the draft the attempt loaded")
        .contains(RESOLVED_VALUE_CANARY);

    assertNothingSecretReachedTheLogSink();
  }

  @Test
  void aGatewayFailureWhoseReasonQuotesTheSourceHandsNothingToTheLogSink() {
    UUID id = seedTest(List.of("Go to \"https://example.com/" + SOURCE_CANARY + "\""));
    gateway.answer(
        request ->
            CompileResponse.failure(
                GatewayOutcome.TRANSPORT,
                GatewayErrorCode.GATEWAY_TRANSPORT,
                "gateway rejected prompt: " + SOURCE_CANARY + " / " + ARTIFACT_CANARY,
                null,
                0,
                1L,
                0,
                0));

    pipeline.compile(id, OWNER);
    awaitCompileStatus(id, "STALE");

    assertCompileErrorIsExactly(id, GatewayErrorCode.GATEWAY_TRANSPORT.name());
    assertNothingSecretReachedTheLogSink();
  }

  /**
   * The exception path. A parse failure's message can quote the very artifact or source text that
   * caused it, and a throwable handed to a log sink carries that message and its whole cause chain
   * into the output. This drives a gateway that throws such an exception and reads the bytes.
   */
  @Test
  void aThrownExceptionQuotingTheSourceNeverReachesTheLogSink() {
    UUID id = seedTest(List.of("Go to \"https://example.com/" + SOURCE_CANARY + "\""));
    gateway.answer(
        request -> {
          throw new IllegalStateException(
              "cannot parse " + THROWN_MESSAGE_CANARY + " from " + ARTIFACT_CANARY,
              new IllegalArgumentException("caused by " + SOURCE_CANARY));
        });

    pipeline.compile(id, OWNER);
    awaitCompileStatus(id, "STALE");

    assertCompileErrorIsExactly(id, CompileErrorCode.COMPILE_INTERNAL_ERROR.name());
    assertThat(captured())
        .as("the attempt really did fail through the logging catch block")
        .contains("studio.compile.internal_error");
    assertNothingSecretReachedTheLogSink();
  }

  /**
   * The nested-object path. {@code ValidationOutcome} is a record holding records holding records,
   * so logging the outcome — or any of its step verdicts — renders the diagnostic excerpt through
   * the nested record's own {@code toString} without any forbidden identifier appearing at the log
   * site.
   */
  @Test
  void aDiagnosticExcerptNestedInsideTheValidationOutcomeNeverReachesTheLogSink() {
    stubValidatorRejectingWithCanaryExcerpt();

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("NEEDS_REVISION");

    assertThat(
            jdbc.queryForObject(
                "SELECT compile_diagnostics::text FROM ui_tests WHERE id = ?",
                String.class,
                testId))
        .as("the excerpt really was carried through the outcome and persisted")
        .contains(NESTED_EXCERPT_CANARY);
    assertNothingSecretReachedTheLogSink();
  }

  @Test
  void aCompileThatCouldNotEvenStartNeverLogsTheSourceItRefused() {
    List<String> overLimit = new java.util.ArrayList<>(lines(100));
    overLimit.add("Go to \"https://example.com/" + SOURCE_CANARY + "\"");
    UUID id = seedTest(overLimit);

    // The refusal travels to the caller as a 400 now that Run asks for the compile directly, so
    // there is no swallowed-and-logged enqueue failure to inspect. What must still hold is that
    // refusing the request logs none of the source it refused.
    Throwable refusal = catchThrowable(() -> pipeline.compile(id, OWNER));

    assertThat(refusal)
        .as("the compile really was refused, so the assertion below is not vacuous")
        .isNotNull();
    assertNothingSecretReachedTheLogSink();
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * Asserts on the bytes the appender wrote, not on the source of the log sites. A leak built from
   * a local variable under an innocent name, from a formatted argument, from a nested object's own
   * {@code toString} or from an exception message is caught here and by nothing that reads source
   * text.
   */
  private void assertNothingSecretReachedTheLogSink() {
    String captured = captured();
    assertThat(captured)
        .as("the sink produced no output at all — the appender is not live")
        .contains(SINK_PROBE);
    CANARIES.forEach(
        (carrier, value) ->
            assertThat(captured)
                .as("a %s reached the log sink: %s", carrier, value)
                .doesNotContain(value));
  }

  private String captured() {
    return new String(sink.toByteArray(), StandardCharsets.UTF_8);
  }

  /**
   * Attaches a real logback appender to the root logger and encodes each event into a byte buffer.
   *
   * <p>The encoder is the point. {@code %msg} renders every argument through its own {@code
   * toString}, so a nested object handed to a placeholder appears in the buffer exactly as it would
   * appear in a log file; {@code %ex{full}} renders the throwable, its message and its whole cause
   * chain. The two compile loggers are lowered to TRACE so that a leak emitted below the configured
   * threshold is captured rather than filtered away before the assertion can see it.
   */
  private void attachLogSink() {
    LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
    sink = new ByteArrayOutputStream();

    PatternLayoutEncoder encoder = new PatternLayoutEncoder();
    encoder.setContext(context);
    encoder.setPattern("%logger %level %msg%n%ex{full}");
    encoder.setCharset(StandardCharsets.UTF_8);
    encoder.start();

    sinkAppender = new OutputStreamAppender<>();
    sinkAppender.setContext(context);
    sinkAppender.setEncoder(encoder);
    sinkAppender.setOutputStream(sink);
    sinkAppender.setImmediateFlush(true);
    sinkAppender.start();
    context.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).addAppender(sinkAppender);

    restoreLevels = new LinkedHashMap<>();
    for (String name : List.of("com.citi.put.checks", GatewayAuditLogger.AUDIT_LOGGER)) {
      restoreLevels.put(name, context.getLogger(name).getLevel());
      context.getLogger(name).setLevel(Level.TRACE);
    }

    LoggerFactory.getLogger(CompilePipeline.class).trace("{} sink is live", SINK_PROBE);
  }

  private static List<String> sourceOf(
      com.citi.put.checks.studio.compile.gateway.CompileRequest request) {
    return request.fencedSourceLines().stream()
        .map(line -> line.substring(line.indexOf(": ") + 2))
        .map(
            quoted -> {
              try {
                return MAPPER.readValue(quoted, String.class);
              } catch (Exception e) {
                throw new AssertionError("the fence is not a JSON string literal", e);
              }
            })
        .toList();
  }

  private static String artifactWithCanaryCode(List<String> steps) {
    return artifactFor(steps)
        .replace(
            "await page.goto('https://example.com/login');",
            "await page.goto('https://example.com/" + ARTIFACT_CANARY + "');");
  }

  private static void stubValidatorRejectingWithCanaryExcerpt() {
    runner.resetAll();
    runner.stubFor(
        post(urlEqualTo("/v1/validate"))
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("content-type", "application/json")
                    .withBody(
                        "{\"ok\":false,\"validatorSchemaVersion\":\"1.0.0\",\"diagnostics\":[],"
                            + "\"steps\":[{\"stepIndex\":0,\"ok\":true,\"diagnostics\":[]},"
                            + "{\"stepIndex\":1,\"ok\":false,\"diagnostics\":"
                            + "[{\"code\":\"DENIED_NODE\",\"stepIndex\":1,\"message\":\"no\","
                            + "\"node\":\"ForStatement\",\"excerpt\":\""
                            + NESTED_EXCERPT_CANARY
                            + "\"}]}]}")));
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
