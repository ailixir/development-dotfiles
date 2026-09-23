package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.encoder.PatternLayoutEncoder;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.OutputStreamAppender;
import com.citi.put.checks.studio.compile.gateway.GatewayAuditLogger;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

/**
 * Story 10.9 AC-14 — <b>the repair prompt reads no resolved value and echoes no secret, on every
 * one of the three attempts.</b>
 *
 * <p>This extends 10.8 AC-5's canary test across the whole loop. The canary is planted in a stored
 * <em>secret</em> value on the draft, and the assertions are made on the bytes: what the HTTP
 * client sent to the validator, what the log sink was handed, and what was persisted — never on the
 * objects that produced them. A leak built from a local variable under an innocent name, from a
 * formatted argument or from a nested record's own {@code toString} is caught here and by nothing
 * that reads source text.
 *
 * <p>Four encodings are checked, because a value that survives a redaction pass often survives it
 * transformed: plain, URL-encoded, double-encoded and base64.
 */
class RepairRedactionTest extends AbstractRepairPipelineTest {

  private static final String SECRET_CANARY = "secret-canary-4e91a7";
  private static final String SINK_PROBE = "repair-sink-probe-51c0d3";

  private ByteArrayOutputStream sink;
  private OutputStreamAppender<ILoggingEvent> sinkAppender;
  private Map<String, Level> restoreLevels;

  @BeforeEach
  void attachLogSink() {
    LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
    sink = new ByteArrayOutputStream();

    PatternLayoutEncoder encoder = new PatternLayoutEncoder();
    encoder.setContext(context);
    // %msg renders every argument through its own toString, so a nested object handed to a
    // placeholder appears here exactly as it would in a log file; %ex{full} renders the throwable
    // and its whole cause chain.
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

  @AfterEach
  void detachLogSink() {
    LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
    context.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).detachAppender(sinkAppender);
    sinkAppender.stop();
    restoreLevels.forEach((name, level) -> context.getLogger(name).setLevel(level));
  }

  /** The fixture's own guard: every {@code doesNotContain} below is worthless without this. */
  @Test
  void theCapturingSinkIsLiveAndRendersFormattedArguments() {
    LoggerFactory.getLogger(CompilePipeline.class).trace("probe argument={}", SECRET_CANARY);

    assertThat(captured())
        .contains(SINK_PROBE)
        .as("a TRACE event from a compile-package logger must reach the buffer")
        .contains("probe argument=" + SECRET_CANARY);
  }

  /**
   * AC-14 — a canary planted in a stored secret value reaches no repair payload, no stored document
   * and no audit line, on any of the three attempts.
   *
   * <p>The non-vacuity guard is the second block: the canary really is on the draft the attempt
   * loaded, and all three attempts really were issued. Without it this would pass against a
   * pipeline that never ran.
   */
  @Test
  void noStoredSecretValueReachesAnyRepairPayloadDocumentOrAuditLine() {
    jdbc.update(
        "UPDATE ui_tests SET variables = CAST(? AS jsonb) WHERE id = ?",
        "[{\"name\":\"PASSWORD\",\"kind\":\"secretRef\",\"secretId\":\"LOGIN_PW\","
            + "\"value\":\""
            + SECRET_CANARY
            + "\"}]",
        testId);
    stubValidatorSequence(false, false, false);

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("NEEDS_REVISION");

    // Non-vacuity: the value is on the draft, and all three attempts happened.
    assertThat(
            jdbc.queryForObject(
                "SELECT variables::text FROM ui_tests WHERE id = ?", String.class, testId))
        .as("the canary is on the draft the attempts loaded")
        .contains(SECRET_CANARY);
    assertThat(gateway.calls()).isEqualTo(3);
    assertThat(gateway.attempts()).containsExactly(1, 2, 3);

    for (var request : gateway.seen()) {
      assertNoCanary(
          "the attempt " + request.attempt() + " prompt",
          String.join("\n", request.fencedSourceLines())
              + "\n"
              + request.outputContract()
              + "\n"
              + String.valueOf(request.repairDiagnostics()));
    }
    for (var event : runner.getAllServeEvents()) {
      assertNoCanary("the validator request body", event.getRequest().getBodyAsString());
    }
    assertNoCanary("the stored diagnostics document", storedDiagnosticsText());
    assertNoCanary("the log sink", captured());
    assertThat(captured())
        .as("the sink produced no output at all — the appender is not live")
        .contains(SINK_PROBE);
  }

  /**
   * AC-14 — the opaque reference is what travels, on the repair attempts as on the first.
   *
   * <p>The compiler compiles a reference, not a value (§9.2). The declared <em>name</em> reaching
   * the validator is the point: it is what lets the validator check that {@code vars.secret} calls
   * correspond to the source, and it is not a value.
   */
  @Test
  void theReferenceTravelsAndTheValueDoesNot() {
    jdbc.update(
        "UPDATE ui_tests SET steps = CAST(? AS jsonb), variables = CAST(? AS jsonb) WHERE id = ?",
        "[\"Type <secret LOGIN_PW> into the password field\",\"Check the password field is visible\"]",
        "[{\"name\":\"PASSWORD\",\"kind\":\"secretRef\",\"secretId\":\"LOGIN_PW\","
            + "\"value\":\""
            + SECRET_CANARY
            + "\"}]",
        testId);
    stubValidatorSequence(false, true);

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("READY");

    assertThat(gateway.seen()).hasSize(2);
    for (var request : gateway.seen()) {
      assertThat(String.join("\n", request.fencedSourceLines()))
          .as("attempt %s carries the opaque reference", request.attempt())
          .contains("<secret LOGIN_PW>");
      assertNoCanary(
          "attempt " + request.attempt(), String.join("\n", request.fencedSourceLines()));
    }
    assertThat(runner.getAllServeEvents().get(0).getRequest().getBodyAsString())
        .as("the declared reference name reaches the validator; the value never does")
        .contains("LOGIN_PW");
  }

  /**
   * AC-14 — no secrets service and no vault client is reachable from the compile path.
   *
   * <p>Asserted structurally, because "was not called on this run" is weaker than "cannot be
   * called": neither prompt assembler has a constructor parameter, field or method through which
   * one could arrive.
   */
  @Test
  void neitherPromptAssemblerCanReachASecretsServiceAtAll() {
    assertThat(PromptAssembler.class.getDeclaredConstructors())
        .allSatisfy(c -> assertThat(c.getParameterTypes()).isEmpty());
    assertThat(PromptAssembler.class.getDeclaredFields())
        .allSatisfy(
            f ->
                assertThat(f.getType().getName())
                    .as("PromptAssembler.%s", f.getName())
                    .isIn("java.lang.String"));
    assertThat(
            java.util.Arrays.stream(RepairPromptAssembler.class.getDeclaredFields())
                .filter(f -> !java.lang.reflect.Modifier.isStatic(f.getModifiers())))
        .as("the repair assembler holds no instance state and no collaborator at all")
        .isEmpty();
    assertThat(RepairPromptAssembler.class.getDeclaredConstructors())
        .allSatisfy(c -> assertThat(c.getParameterTypes()).isEmpty());
  }

  /**
   * Story 10.45 AC 8 (NFR-5, CPLX SECURITY) — the repair now carries the <b>rejected proposal</b>,
   * and that proposal is redacted: no stored resolved value and no credential-shaped material
   * reaches any repair payload through it.
   *
   * <p>Non-vacuity: the proposal marker proves attempt 1's proposal really is in each repair, and
   * the redaction token proves the credential really was in it and was replaced, not dropped with
   * the rest of the proposal.
   */
  @Test
  void theRejectedProposalInEveryRepairIsRedactedAndCarriesNoResolvedValue() {
    String proposalMarker = "rejected-proposal-marker-3d9a";
    String awsKey = "AKIAIOSFODNN7EXAMPLE";
    String githubToken = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
    jdbc.update(
        "UPDATE ui_tests SET variables = CAST(? AS jsonb) WHERE id = ?",
        "[{\"name\":\"PASSWORD\",\"kind\":\"secretRef\",\"secretId\":\"LOGIN_PW\","
            + "\"value\":\""
            + SECRET_CANARY
            + "\"}]",
        testId);
    stubValidatorSequence(false, false, false);
    gateway.answer(
        request ->
            ScriptedRepairGateway.ok(
                artifactFor(
                    SOURCE,
                    "await page.goto('https://example.com/"
                        + proposalMarker
                        + "?k="
                        + awsKey
                        + "&t="
                        + githubToken
                        + "');")));

    pipeline.compile(testId, OWNER);
    awaitCompileStatus("NEEDS_REVISION");

    assertThat(gateway.attempts()).containsExactly(1, 2, 3);
    for (var request : gateway.seen().subList(1, 3)) {
      String repair = request.repairDiagnostics();
      assertThat(repair)
          .as("attempt %s carries the rejected proposal", request.attempt())
          .contains(proposalMarker)
          .contains("Rejected proposal")
          .contains("[REDACTED:AWS_ACCESS_KEY_ID]")
          .contains("[REDACTED:GITHUB_TOKEN]")
          .doesNotContain(awsKey)
          .doesNotContain(githubToken);
      assertNoCanary("the attempt " + request.attempt() + " repair context", repair);
    }
  }

  /**
   * AC-14 — the audit line records the <b>real</b> attempt number, and never a request body.
   *
   * <p>Driven against {@link GatewayAuditLogger} directly, because that is the component that
   * produces the line: the scripted stub in this context replaces the Vertex client, so a test that
   * only watched the pipeline's output would be asserting that a logger nobody called emitted
   * nothing. The assertion is on the bytes the sink was handed.
   *
   * <p>Both halves matter. {@code attempt=} must carry 1, 2 and 3 across a repaired request — a
   * line that always said 1 would make the audit stream unable to distinguish a one-shot compile
   * from a repaired one. And no part of the request body may appear: the source lines, the output
   * contract, the syntax reference and the repair diagnostics are all present on the object the
   * logger is handed, and none of them is a field it reads (§4.3, §4.7).
   */
  @Test
  void theAuditLineRecordsTheRealAttemptNumberAndNoRequestBody() {
    String sourceMarker = "audit-source-marker-77b2";
    String diagnosticsMarker = "audit-diagnostics-marker-1f4c";
    GatewayAuditLogger audit = new GatewayAuditLogger();

    for (int attempt = 1; attempt <= 3; attempt++) {
      var request =
          new com.citi.put.checks.studio.compile.gateway.CompileRequest(
              UUID.randomUUID(),
              CSI_ID,
              OWNER,
              UUID.randomUUID().toString(),
              attempt,
              List.of("0: \"Go to " + sourceMarker + "\""),
              "syntax reference " + sourceMarker,
              CompilePins.SYNTAX_REFERENCE_VERSION,
              "output contract " + sourceMarker,
              CompilePins.PROMPT_VERSION,
              attempt == 1 ? null : "{\"steps\":[{\"message\":\"" + diagnosticsMarker + "\"}]}");
      audit.audit(request, "stub-model@1", ScriptedRepairGateway.ok("{\"version\":1}"));
    }

    String captured = captured();
    List<String> auditLines =
        captured.lines().filter(line -> line.contains("studio.gateway.call")).toList();

    assertThat(auditLines)
        .as("three calls were audited, so the assertions below are not vacuous")
        .hasSize(3);
    assertThat(auditLines.get(0)).contains("attempt=1");
    assertThat(auditLines.get(1))
        .as("a repair's audit line must say which attempt it was")
        .contains("attempt=2");
    assertThat(auditLines.get(2)).contains("attempt=3");
    assertThat(captured)
        .as("no source text, prompt or reference body reaches the audit stream")
        .doesNotContain(sourceMarker)
        .as("and neither do the repair diagnostics the repair prompt carried")
        .doesNotContain(diagnosticsMarker);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * Plain, URL-encoded, double-encoded and base64 — a redaction pass often survives transformed.
   */
  private static void assertNoCanary(String carrier, String haystack) {
    if (haystack == null) {
      return;
    }
    String urlEncoded = java.net.URLEncoder.encode(SECRET_CANARY, StandardCharsets.UTF_8);
    String doubleEncoded = java.net.URLEncoder.encode(urlEncoded, StandardCharsets.UTF_8);
    String base64 =
        Base64.getEncoder().encodeToString(SECRET_CANARY.getBytes(StandardCharsets.UTF_8));
    assertThat(haystack)
        .as("%s carried the secret value in plain form", carrier)
        .doesNotContain(SECRET_CANARY)
        .as("%s carried it URL-encoded", carrier)
        .doesNotContain(urlEncoded)
        .as("%s carried it double-encoded", carrier)
        .doesNotContain(doubleEncoded)
        .as("%s carried it base64-encoded", carrier)
        .doesNotContain(base64);
  }

  private String captured() {
    return new String(sink.toByteArray(), StandardCharsets.UTF_8);
  }
}
