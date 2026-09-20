package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.validator.RunnerDiagnostic;
import com.citi.put.checks.studio.compile.validator.ValidationOutcome;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Story 10.9 AC-22 — <b>a failed compile leaves a document a caller can read, with its truncation
 * flags intact.</b>
 *
 * <p>This file was named in the story as an escalation holder. ADR-002 §16 ruled before wave 4
 * closed, so AC-22's own first branch applies and the subject is no longer a missing field: it is
 * the <b>round trip</b>. A compile that fails writes a document through the producer that writes it
 * in production, the document is stored by the statement that stores it, and it is read back
 * through the route a caller actually calls.
 *
 * <p>Both failure shapes are driven. {@code compileError} comes from the <b>real pipeline</b>: the
 * {@code local} profile ships the disabled gateway, so {@code POST /tests/{id}/compile} produces a
 * genuine {@code GATEWAY_UNAVAILABLE} and the draft settles to {@code STALE} carrying the bounded
 * code — which is exactly the outage case the field exists for. {@code compileDiagnostics} comes
 * from the real {@code DiagnosticsBounder} and the real {@code publishInvalid}, because those are
 * the two components that produce and store it.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "checks.local-dev-auth.enabled=false")
@ActiveProfiles("local")
class DiagnosticsExposureEscalationTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String OWNER = "exposure-owner@citi.com";
  private static final String CSI_ID = "60416";
  private static final List<String> SOURCE = List.of("Go home", "Click \"Sign in\"");

  @Autowired private CompileStateService states;
  @Autowired private DiagnosticsBounder bounder;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private TestRestTemplate restTemplate;

  private UUID testId;

  @BeforeEach
  void setUp() {
    ConfirmFixtures.seedUser(jdbc, OWNER);
    ConfirmFixtures.seedCsi(jdbc, CSI_ID, OWNER);
    testId = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
  }

  // ── AC-22(e): the live round trip ────────────────────────────────────────

  /**
   * A failed compile leaves a document a caller reads back, with the truncation markers present at
   * <b>all three levels</b>.
   *
   * <p>The three levels are asserted separately because they answer different questions: the marker
   * on a clamped {@code message}/{@code excerpt} says this sentence was cut, the per-step {@code
   * truncated} says this step had more problems, and the document-level {@code truncated} with its
   * {@code truncationReason} says whole steps' reasons were dropped to fit. A client that rendered
   * this document without them would turn a bounded report into a false one.
   */
  @Test
  void afailedCompileLeavesADocumentTheRouteReturnsWithItsTruncationFlagsIntact()
      throws IOException {
    int stepCount = 60;
    List<String> manySteps = new ArrayList<>();
    for (int index = 0; index < stepCount; index++) {
      manySteps.add("Go to \"https://example.com/page-" + index + "\"");
    }
    UUID large = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, manySteps);

    CompileRequest request = states.beginCompile(large);
    states.publishInvalid(
        large, request, bounder.bound(hostileOutcome(stepCount), stepCount, 3, true));

    JsonNode draft = MAPPER.readTree(getTest(large).getBody());
    JsonNode document = draft.path("compileDiagnostics");

    assertThat(document.isMissingNode() || document.isNull())
        .as("the route must return the document, not omit it")
        .isFalse();
    assertThat(draft.path("compileStatus").asText()).isEqualTo("NEEDS_REVISION");

    // Level 3 — the document said it shed whole steps.
    assertThat(document.path("truncated").asBoolean())
        .as("a bounded document that shed steps must carry the document-level flag")
        .isTrue();
    assertThat(document.path("truncationReason").asText()).isEqualTo("TOTAL_BYTES");

    // Level 2 — at least one step said it lost diagnostics.
    assertThat(anyStepTruncated(document)).as("a step that lost diagnostics must say so").isTrue();

    // Level 1 — at least one message was clamped and ends with the visible marker.
    assertThat(anyClampedMessage(document))
        .as("a clamped message must end with the visible truncation marker")
        .isTrue();

    // Index alignment to the steps in the same body (ADR-002 §16.3).
    assertThat(document.path("steps")).hasSize(draft.path("steps").size());
    for (int index = 0; index < stepCount; index++) {
      assertThat(document.path("steps").get(index).path("stepIndex").asInt()).isEqualTo(index);
    }

    assertThat(document.path("attempts").asInt()).isEqualTo(3);
    assertThat(document.path("exhausted").asBoolean()).isTrue();
  }

  /**
   * AC-22(a) — the {@code compileError} half, produced by the real pipeline.
   *
   * <p>The {@code local} profile ships {@code DisabledLlmGatewayClient}, so this is a genuine
   * outage path rather than a hand-written document: the route accepts the compile, the pipeline
   * refuses it asynchronously, and the bounded code is what a caller reads back.
   */
  @Test
  void afailedGatewayLeavesABoundedCodeTheRouteReturns() throws IOException {
    assertThat(compileAs(testId).getStatusCode().value()).isEqualTo(202);
    awaitCompileStatus("STALE");

    JsonNode draft = MAPPER.readTree(getTest(testId).getBody());

    assertThat(draft.path("compileStatus").asText()).isEqualTo("STALE");
    assertThat(draft.path("compileError").isNull()).isFalse();
    assertThat(draft.path("compileError").path("code").asText()).isEqualTo("GATEWAY_UNAVAILABLE");
    assertThat(fieldNames(draft.path("compileError")))
        .as("a bounded code and nothing else — no prompt, no response body, no source text")
        .containsExactly("code");
    assertThat(draft.path("compileDiagnostics").isNull())
        .as("the two are mutually exclusive")
        .isTrue();
  }

  /**
   * AC-22(a) — the mutual exclusion the schema declares, across every transition that writes
   * either.
   */
  @Test
  void atMostOneOfTheTwoFieldsIsEverNonNull() throws IOException {
    // NEEDS_REVISION: diagnostics, no error.
    CompileRequest invalid = states.beginCompile(testId);
    states.publishInvalid(testId, invalid, bounder.bound(hostileOutcome(2), 2, 1, false));
    assertExactlyOne(getTest(testId), "compileDiagnostics");

    // STALE: error, no diagnostics.
    CompileRequest error = states.beginCompile(testId);
    states.publishError(testId, error, "{\"code\":\"GATEWAY_TIMEOUT\"}");
    assertExactlyOne(getTest(testId), "compileError");

    // AWAITING_CONFIRMATION: neither.
    CompileRequest candidate = states.beginCompile(testId);
    states.publishCandidate(
        testId,
        candidate,
        ConfirmFixtures.candidate(
            SOURCE, candidate.configurationRevision(), "await page.goto('https://a/');"));
    JsonNode awaiting = MAPPER.readTree(getTest(testId).getBody());
    assertThat(awaiting.path("compileError").isNull()).isTrue();
    assertThat(awaiting.path("compileDiagnostics").isNull()).isTrue();

    // COMPILING: neither, cleared by beginCompile's own single statement.
    states.beginCompile(testId);
    JsonNode compiling = MAPPER.readTree(getTest(testId).getBody());
    assertThat(compiling.path("compileError").isNull()).isTrue();
    assertThat(compiling.path("compileDiagnostics").isNull()).isTrue();
  }

  /**
   * AC-22(c) — {@code compileDiagnostics} is null on the list projection and {@code compileError}
   * is not.
   *
   * <p>One test for both halves against one draft, because a test that only asserted the presence
   * on {@code GET /tests/{id}} would not have caught the divergence this criterion exists to
   * declare.
   */
  @Test
  void theListProjectionOmitsTheDiagnosticsAndKeepsTheError() throws IOException {
    CompileRequest invalid = states.beginCompile(testId);
    states.publishInvalid(testId, invalid, bounder.bound(hostileOutcome(2), 2, 1, false));

    JsonNode single = MAPPER.readTree(getTest(testId).getBody());
    assertThat(single.path("compileDiagnostics").isNull())
        .as("present on GET /tests/{id}")
        .isFalse();

    JsonNode listed = listedDraft(testId);
    assertThat(listed.path("compileDiagnostics").isNull())
        .as("and absent from GET /tests — the bound is per draft, so a page would be megabytes")
        .isTrue();
    assertThat(listed.path("compileStatus").asText())
        .as("the list still tells a caller that reasons exist")
        .isEqualTo("NEEDS_REVISION");

    // The other half of the divergence: compileError stays on the list.
    UUID stale = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
    CompileRequest error = states.beginCompile(stale);
    states.publishError(stale, error, "{\"code\":\"GATEWAY_TIMEOUT\"}");

    JsonNode listedStale = listedDraft(stale);
    assertThat(listedStale.path("compileError").isNull())
        .as("compileError is a bounded code and stays on the list")
        .isFalse();
    assertThat(listedStale.path("compileError").path("code").asText()).isEqualTo("GATEWAY_TIMEOUT");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private void assertExactlyOne(ResponseEntity<String> response, String expected)
      throws IOException {
    JsonNode draft = MAPPER.readTree(response.getBody());
    String other = "compileError".equals(expected) ? "compileDiagnostics" : "compileError";
    assertThat(draft.path(expected).isNull()).as("%s is present", expected).isFalse();
    assertThat(draft.path(other).isNull()).as("%s is null", other).isTrue();
  }

  private static ValidationOutcome hostileOutcome(int stepCount) {
    List<ValidationOutcome.StepVerdict> steps = new ArrayList<>();
    for (int index = 0; index < stepCount; index++) {
      List<RunnerDiagnostic> diagnostics = new ArrayList<>();
      for (int d = 0; d < 40; d++) {
        diagnostics.add(
            new RunnerDiagnostic(
                "DENIED_NODE", index, "m".repeat(3_000), "CallExpression", "e".repeat(3_000)));
      }
      steps.add(new ValidationOutcome.StepVerdict(index, false, diagnostics));
    }
    return ValidationOutcome.verdict(false, "2.0.0", List.of(), steps);
  }

  private static boolean anyStepTruncated(JsonNode document) {
    for (JsonNode step : document.path("steps")) {
      if (step.path("truncated").asBoolean()) {
        return true;
      }
    }
    return false;
  }

  private static boolean anyClampedMessage(JsonNode document) {
    for (JsonNode step : document.path("steps")) {
      for (JsonNode diagnostic : step.path("diagnostics")) {
        if (diagnostic.path("message").asText().endsWith(DiagnosticsBounder.TRUNCATION_MARKER)) {
          return true;
        }
      }
    }
    return false;
  }

  private static Iterable<String> fieldNames(JsonNode node) {
    List<String> names = new ArrayList<>();
    node.fieldNames().forEachRemaining(names::add);
    return names;
  }

  private JsonNode listedDraft(UUID id) throws IOException {
    ResponseEntity<String> response =
        restTemplate.exchange(
            "/api/v1/studio/tests?csiId=" + CSI_ID + "&size=100",
            HttpMethod.GET,
            new HttpEntity<>(null, owner()),
            String.class);
    assertThat(response.getStatusCode().value()).isEqualTo(200);
    for (JsonNode draft : MAPPER.readTree(response.getBody()).path("data")) {
      if (id.toString().equals(draft.path("id").asText())) {
        return draft;
      }
    }
    throw new AssertionError("the draft " + id + " was not in the listing");
  }

  private ResponseEntity<String> getTest(UUID id) {
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + id,
        HttpMethod.GET,
        new HttpEntity<>(null, owner()),
        String.class);
  }

  private ResponseEntity<String> compileAs(UUID id) {
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + id + "/compile",
        HttpMethod.POST,
        new HttpEntity<>("", owner()),
        String.class);
  }

  private void awaitCompileStatus(String expected) {
    long deadline = System.nanoTime() + java.time.Duration.ofSeconds(30).toNanos();
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

  private static HttpHeaders owner() {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-User-Id", "uid-" + OWNER);
    headers.set("X-User-Email", OWNER);
    headers.set("X-User-Roles", "");
    headers.set("X-User-Csi-Ownership", CSI_ID + ":owner");
    return headers;
  }
}
