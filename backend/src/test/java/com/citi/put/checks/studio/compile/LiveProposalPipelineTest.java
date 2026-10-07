package com.citi.put.checks.studio.compile;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.gateway.CompileRequest;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.github.tomakehurst.wiremock.stubbing.Scenario;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;
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
 * VAL-006 — a gateway client that <em>declares</em> it returns the proposal envelope (as {@code
 * GenAiLlmGatewayClient} does) must have its envelope assembled into an executable artifact before
 * {@code /v1/validate}.
 *
 * <p>This is the test that joins the two halves no earlier suite joined: every other pipeline test
 * uses a stub with {@code returnsProposalEnvelope() == false}, so the live seam — envelope in,
 * artifact to the validator — was never exercised. The validator is WireMock, so what is asserted
 * is the JSON actually put on the wire.
 */
@SpringBootTest
@ActiveProfiles("local")
class LiveProposalPipelineTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String OWNER = "live-proposal-owner@citi.com";
  private static final String CSI_ID = "60431";

  /**
   * Non-ASCII and inner spacing so "byte-identical" is not satisfied by a trimmed or ASCII copy.
   */
  private static final List<String> SOURCE =
      List.of(
          "Go to \"https://example.com/login\"",
          "Type \"café  naïve\" into the \"Search\" field",
          "Click the \"Sign in\" button");

  private static final WireMockServer RUNNER;

  static {
    // Static initializer for the same reason as AbstractRepairPipelineTest: the context (and its
    // @DynamicPropertySource) is resolved before any @BeforeAll would run.
    RUNNER = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    RUNNER.start();
    Runtime.getRuntime().addShutdownHook(new Thread(RUNNER::stop));
  }

  /** A stub that, like the live client, returns the model's envelope rather than an artifact. */
  static final class EnvelopeGateway implements LlmGatewayClient {

    private final List<CompileRequest> seen = new CopyOnWriteArrayList<>();
    private volatile Function<CompileRequest, String> script = request -> envelope(request, null);

    @Override
    public boolean returnsProposalEnvelope() {
      return true;
    }

    @Override
    public CompileResponse propose(CompileRequest request) {
      seen.add(request);
      return CompileResponse.ok(
          script.apply(request),
          new GatewayProvenance(
              "stub-model@1", "001", CompilePins.PROMPT_VERSION, "1.71.0", true, 0),
          0,
          12L,
          100,
          200);
    }

    void answer(Function<CompileRequest, String> next) {
      this.script = next;
    }

    void reset() {
      seen.clear();
      script = request -> envelope(request, null);
    }

    List<CompileRequest> seen() {
      return List.copyOf(seen);
    }
  }

  @TestConfiguration
  static class Stubs {
    @Bean
    @Primary
    EnvelopeGateway envelopeGateway() {
      return new EnvelopeGateway();
    }
  }

  @DynamicPropertySource
  static void runnerUrl(DynamicPropertyRegistry registry) {
    registry.add("studio.runner.base-url", () -> "http://localhost:" + RUNNER.port());
    registry.add("studio.runner.service-identity-token", () -> "test-service-identity");
  }

  @Autowired private CompilePipeline pipeline;
  @Autowired private EnvelopeGateway gateway;
  @Autowired private JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void seedDraft() {
    RUNNER.resetAll();
    gateway.reset();
    ConfirmFixtures.seedUser(jdbc, OWNER);
    ConfirmFixtures.seedCsi(jdbc, CSI_ID, OWNER);
    testId = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
  }

  // ── 1. the validator receives a server-assembled artifact ─────────────────

  @Test
  void anEnvelopeIsAssembledIntoAnArtifactBeforeValidation() throws Exception {
    stubValidatorSequence(true);

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("READY");

    assertThat(gateway.seen()).hasSize(1);
    assertThat(validateBodies()).hasSize(1);
    JsonNode artifact = validateBodies().get(0).path("artifact");

    assertThat(fieldNames(artifact))
        .as("the envelope's kind must never reach the validator")
        .containsExactlyInAnyOrder("version", "steps");
    assertThat(artifact.path("version").intValue()).isEqualTo(1);
    assertThat(artifact.path("steps")).hasSize(SOURCE.size());
    for (int index = 0; index < SOURCE.size(); index++) {
      JsonNode step = artifact.path("steps").get(index);
      assertThat(fieldNames(step))
          .as("step %d carries no stepId/status", index)
          .containsExactlyInAnyOrder("stepIndex", "originalText", "code");
      assertThat(step.path("stepIndex").intValue()).isEqualTo(index);
      assertThat(step.path("originalText").textValue())
          .as("originalText is the author's source line, byte for byte")
          .isEqualTo(SOURCE.get(index));
      assertThat(step.path("code").textValue()).isEqualTo(codeFor(index));
    }

    String stored =
        jdbc.queryForObject(
            "SELECT r.artifact::text FROM ui_test_revisions r JOIN ui_tests t"
                + " ON t.current_candidate_revision_id = r.id WHERE t.id = ?",
            String.class,
            testId);
    assertThat(MAPPER.readTree(stored).has("kind"))
        .as("the published candidate is the assembled artifact")
        .isFalse();
  }

  // ── 2. UNSUPPORTED is terminal: no validator, no repair ───────────────────

  @Test
  void anUnsupportedStepEndsTheCompileWithTheModelsReasonAndNoValidatorCall() throws Exception {
    stubValidatorSequence(true);
    gateway.answer(request -> envelope(request, 1));

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("NEEDS_REVISION");

    assertThat(gateway.seen()).as("no repair attempt").hasSize(1);
    assertThat(RUNNER.getAllServeEvents()).as("the validator is never called").isEmpty();

    JsonNode diagnostics = storedDiagnostics();
    assertThat(diagnostics.path("attempts").intValue()).isEqualTo(1);
    assertThat(diagnostics.path("exhausted").booleanValue()).isFalse();
    JsonNode rejected = diagnostics.path("steps").get(1);
    assertThat(rejected.path("ok").booleanValue()).isFalse();
    assertThat(rejected.path("diagnostics").get(0).path("code").textValue())
        .isEqualTo("UNSUPPORTED_CAPABILITY");
    assertThat(rejected.path("diagnostics").get(0).path("stepIndex").intValue()).isEqualTo(1);
    assertThat(rejected.path("diagnostics").get(0).path("message").textValue())
        .isEqualTo("Cannot type into that field.");
    assertThat(diagnostics.path("steps").get(0).path("ok").booleanValue()).isTrue();
    assertThat(diagnostics.path("steps").get(2).path("ok").booleanValue()).isTrue();
    assertThat(revisionCount()).isZero();
  }

  /**
   * VAL-033 — the model's refusal {@code message} is model text, and it is stored and shown to the
   * author. It is redacted with the repair-context redaction before it is persisted.
   */
  @Test
  void aRefusalMessageCarryingACredentialIsRedactedBeforeItIsStored() throws Exception {
    String token = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
    String assignment = "password=Hunter2Canary";
    stubValidatorSequence(true);
    gateway.answer(
        request ->
            envelope(request, 1)
                .replace(
                    "Cannot type into that field.",
                    "Cannot use " + token + " or " + assignment + " here."));

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("NEEDS_REVISION");

    String stored =
        jdbc.queryForObject(
            "SELECT compile_diagnostics::text FROM ui_tests WHERE id = ?", String.class, testId);
    assertThat(stored).doesNotContain(token).doesNotContain("Hunter2Canary");
    String message =
        storedDiagnostics()
            .path("steps")
            .get(1)
            .path("diagnostics")
            .get(0)
            .path("message")
            .asText();
    assertThat(message)
        .contains("[REDACTED:GITHUB_TOKEN]")
        .contains("[REDACTED:CREDENTIAL_ASSIGNMENT]")
        .startsWith("Cannot use ");
  }

  // ── 3. a repair carries the envelope and the same write set ───────────────

  @Test
  void aRepairCarriesTheRejectedEnvelopeAndTheSameStepIds() {
    stubValidatorSequence(false, true);

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("READY");

    List<CompileRequest> seen = gateway.seen();
    assertThat(seen).hasSize(2);
    assertThat(seen.get(1).attempt()).isEqualTo(2);
    assertThat(seen.get(1).proposalKind()).isEqualTo("FULL").isEqualTo(seen.get(0).proposalKind());
    assertThat(seen.get(1).writableStepIds()).isEqualTo(seen.get(0).writableStepIds());
    assertThat(seen.get(1).repairDiagnostics())
        .as("the repair carries the model's envelope, not the assembled artifact")
        .contains("\\\"kind\\\":\\\"FULL\\\"")
        .contains("\\\"stepId\\\":\\\"" + seen.get(0).writableStepIds().get(0) + "\\\"")
        .doesNotContain("originalText");
    assertThat(validateBodies()).hasSize(2);
    assertThat(validateBodies().get(1).path("artifact").has("kind")).isFalse();
  }

  // ── 4. an unassemblable envelope is a parse failure ───────────────────────

  @Test
  void whitespaceOnlyCodeIsAGatewayParseFailureWithNoValidatorCall() {
    stubValidatorSequence(true);
    gateway.answer(
        request ->
            envelope(request, null).replace("\"code\":\"" + codeFor(2) + "\"", "\"code\":\"   \""));

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("STALE");

    assertThat(storedErrorCode()).isEqualTo("GATEWAY_PARSE_FAILURE");
    assertThat(gateway.seen()).as("no repair attempt").hasSize(1);
    assertThat(RUNNER.getAllServeEvents()).as("the validator is never called").isEmpty();
  }

  // ── fixtures ──────────────────────────────────────────────────────────────

  private static String codeFor(int index) {
    return "await page.waitForTimeout(" + index + ");";
  }

  /** A FULL envelope over the request's writable IDs; {@code unsupported} marks one step. */
  static String envelope(CompileRequest request, Integer unsupported) {
    ObjectNode root = MAPPER.createObjectNode();
    root.put("version", 1);
    root.put("kind", request.proposalKind());
    ArrayNode steps = root.putArray("steps");
    List<UUID> ids = request.writableStepIds();
    for (int index = 0; index < ids.size(); index++) {
      ObjectNode step = steps.addObject().put("stepId", ids.get(index).toString());
      if (unsupported != null && unsupported == index) {
        step.put("status", "UNSUPPORTED")
            .put("reason", "UNSUPPORTED_CAPABILITY")
            .put("message", "Cannot type into that field.");
      } else {
        step.put("status", "GENERATED").put("code", codeFor(index));
      }
    }
    return root.toString();
  }

  private static void stubValidatorSequence(boolean... ok) {
    RUNNER.resetAll();
    for (int index = 0; index < ok.length; index++) {
      String from = index == 0 ? Scenario.STARTED : "call-" + index;
      RUNNER.stubFor(
          post(urlEqualTo("/v1/validate"))
              .inScenario("validate-sequence")
              .whenScenarioStateIs(from)
              .willSetStateTo("call-" + (index + 1))
              .willReturn(
                  aResponse()
                      .withStatus(200)
                      .withHeader("content-type", "application/json")
                      .withBody(verdict(ok[index]))));
    }
  }

  private static String verdict(boolean ok) {
    ObjectNode root = MAPPER.createObjectNode();
    root.put("ok", ok);
    root.put("validatorSchemaVersion", "2.0.0");
    root.putArray("diagnostics");
    ArrayNode steps = root.putArray("steps");
    for (int index = 0; index < SOURCE.size(); index++) {
      ObjectNode step = steps.addObject().put("stepIndex", index);
      boolean stepOk = ok || index != 1;
      step.put("ok", stepOk);
      ArrayNode diagnostics = step.putArray("diagnostics");
      if (!stepOk) {
        diagnostics
            .addObject()
            .put("code", "DENIED_NODE")
            .put("stepIndex", index)
            .put("message", "no")
            .put("node", "ForStatement")
            .put("excerpt", "for(;;)");
      }
    }
    return root.toString();
  }

  /** The {@code /v1/validate} request bodies, in call order. */
  private static List<JsonNode> validateBodies() {
    List<JsonNode> bodies = new ArrayList<>();
    RUNNER.getAllServeEvents().stream()
        .map(event -> event.getRequest().getBodyAsString())
        .forEach(
            body -> {
              try {
                bodies.add(MAPPER.readTree(body));
              } catch (Exception e) {
                throw new AssertionError("validate body is not JSON: " + body, e);
              }
            });
    // getAllServeEvents is most-recent first.
    java.util.Collections.reverse(bodies);
    return bodies;
  }

  private static List<String> fieldNames(JsonNode node) {
    List<String> names = new ArrayList<>();
    node.fieldNames().forEachRemaining(names::add);
    return names;
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

  private JsonNode storedDiagnostics() throws Exception {
    String stored =
        jdbc.queryForObject(
            "SELECT compile_diagnostics::text FROM ui_tests WHERE id = ?", String.class, testId);
    assertThat(stored).as("no diagnostics document was stored").isNotNull();
    return MAPPER.readTree(stored);
  }

  private String storedErrorCode() {
    String stored =
        jdbc.queryForObject(
            "SELECT compile_error::text FROM ui_tests WHERE id = ?", String.class, testId);
    try {
      return stored == null ? null : MAPPER.readTree(stored).path("code").asText();
    } catch (Exception e) {
      throw new AssertionError("compile_error is not JSON: " + stored, e);
    }
  }

  private int revisionCount() {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, testId);
  }
}
