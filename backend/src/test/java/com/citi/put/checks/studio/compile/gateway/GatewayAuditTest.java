package com.citi.put.checks.studio.compile.gateway;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.google.cloud.vertexai.VertexAI;
import java.util.List;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

/**
 * Story 10.5 AC-9, AC-10, AC-11, AC-14: what the gateway is allowed to write down.
 *
 * <p>The secret canary is never handed to the client — it stands for the resolved value a caller
 * must keep out of the gateway. These assertions are the regression guard that keeps it that way.
 */
class GatewayAuditTest {

  private static final String GENERATE_CONTENT_PATH = ".*generateContent";

  private static WireMockServer wireMock;

  private ListAppender<ILoggingEvent> auditAppender;
  private ListAppender<ILoggingEvent> diagnosticAppender;
  private VertexAI vertexAi;

  @BeforeAll
  static void startWireMock() {
    wireMock = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    wireMock.start();
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    auditAppender = attach(GatewayAuditLogger.AUDIT_LOGGER);
    diagnosticAppender = attach(GatewayAuditLogger.class.getName());
  }

  @AfterEach
  void tearDown() {
    detach(GatewayAuditLogger.AUDIT_LOGGER, auditAppender);
    detach(GatewayAuditLogger.class.getName(), diagnosticAppender);
    if (vertexAi != null) {
      vertexAi.close();
      vertexAi = null;
    }
  }

  @Test
  void auditLineCarriesExactlyTheAgreedFields() throws Exception {
    stubOk(GatewayTestSupport.VALID_ARTIFACT);

    client().propose(GatewayTestSupport.request());

    String line = onlyAuditLine();
    assertThat(line)
        .contains("testId=11111111-2222-3333-4444-555555555555")
        .contains("csiId=CSI12345")
        .contains("principal=u-test-principal")
        .contains("compileRequestId=cr-0001")
        .contains("attempt=1")
        .contains("model=" + GatewayTestSupport.MODEL)
        .contains("promptVersion=prompt-2026.09.0")
        .contains("syntaxReferenceVersion=syntax-2026.09.0")
        .contains("latencyMs=")
        .contains("outcome=OK")
        .contains("inputBytes=")
        .contains("outputBytes=")
        .contains("retries=0");
  }

  @Test
  void auditLineNeverCarriesPromptOrResponseContent() throws Exception {
    stubOk(GatewayTestSupport.VALID_ARTIFACT);

    client().propose(GatewayTestSupport.request());

    String line = onlyAuditLine();
    assertThat(line)
        .doesNotContain(GatewayTestSupport.CANARY)
        .doesNotContain(GatewayTestSupport.SECRET_PLACEHOLDER)
        .doesNotContain("Go to ")
        .doesNotContain("PLAYWRIGHT SYNTAX REFERENCE")
        .doesNotContain("await page.goto");
  }

  @Test
  void placeholderReachesTheWireButTheResolvedValueNeverDoes() throws Exception {
    stubOk(GatewayTestSupport.VALID_ARTIFACT);

    client().propose(GatewayTestSupport.request());

    String captured =
        wireMock.getAllServeEvents().stream()
            .map(event -> event.getRequest().getBodyAsString())
            .collect(Collectors.joining("\n"));
    assertThat(captured).contains(GatewayTestSupport.SECRET_PLACEHOLDER);
    assertThat(captured).doesNotContain(GatewayTestSupport.CANARY);
    assertThat(logged(auditAppender)).doesNotContain(GatewayTestSupport.CANARY);
    assertThat(logged(diagnosticAppender)).doesNotContain(GatewayTestSupport.CANARY);
  }

  @Test
  void gatewayErrorBodyEchoingTheRequestIsScrubbedBeforeLogging() throws Exception {
    List<String> sourceLines =
        List.of(
            "1. Type \"" + GatewayTestSupport.SECRET_PLACEHOLDER + "\" in the \"Password\" field");
    CompileRequest request = GatewayTestSupport.request(sourceLines);
    wireMock.stubFor(
        post(urlPathMatching(GENERATE_CONTENT_PATH))
            .willReturn(
                aResponse()
                    .withStatus(400)
                    .withHeader("Content-Type", "application/json")
                    .withBody(
                        "{\"error\":{\"code\":400,\"status\":\"INVALID_ARGUMENT\",\"message\":\""
                            + "rejected prompt: "
                            + sourceLines.get(0).replace("\"", "\\\"")
                            + "\"}}")));

    CompileResponse response = client().propose(request);

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.TRANSPORT);
    assertThat(response.failureReason())
        .startsWith("InvalidArgumentException (status=INVALID_ARGUMENT)")
        .doesNotContain(GatewayTestSupport.SECRET_PLACEHOLDER);
    assertThat(logged(diagnosticAppender)).doesNotContain(GatewayTestSupport.SECRET_PLACEHOLDER);
    assertThat(logged(auditAppender)).contains("outcome=TRANSPORT");
  }

  @Test
  void anExceptionMessageThatEchoesTheRequestIsRedacted() {
    List<String> sourceLines =
        List.of(
            "1. Type \"" + GatewayTestSupport.SECRET_PLACEHOLDER + "\" in the \"Password\" field");
    CompileRequest request = GatewayTestSupport.request(sourceLines);

    String scrubbed =
        GatewayErrorScrubber.scrub(
            new IllegalStateException("gateway rejected prompt: " + sourceLines.get(0)), request);

    assertThat(scrubbed)
        .startsWith("IllegalStateException: ")
        .contains("[REDACTED]")
        .doesNotContain(GatewayTestSupport.SECRET_PLACEHOLDER);
  }

  @Test
  void anOverlongExceptionMessageIsTruncated() {
    String longMessage = "x".repeat(5000);

    String scrubbed =
        GatewayErrorScrubber.scrub(
            new IllegalStateException(longMessage), GatewayTestSupport.request());

    assertThat(scrubbed).hasSizeLessThan(300).endsWith("...");
  }

  @Test
  void disabledClientAuditsWithoutTouchingTheNetwork() {
    CompileResponse response =
        new DisabledLlmGatewayClient(new GatewayAuditLogger())
            .propose(GatewayTestSupport.request());

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.DISABLED);
    assertThat(response.errorCode()).isEqualTo(GatewayErrorCode.GATEWAY_UNAVAILABLE);
    assertThat(response.provenance()).isNull();
    assertThat(onlyAuditLine()).contains("outcome=DISABLED").contains("model=null");
    assertThat(wireMock.getAllServeEvents()).isEmpty();
  }

  private LlmGatewayClient client() throws Exception {
    StudioGatewayProperties properties =
        GatewayTestSupport.properties("http://localhost:" + wireMock.port());
    vertexAi = GatewayTestSupport.vertexAi(properties);
    return new VertexLlmGatewayClient(
        properties, vertexAi, GatewayTestSupport.parser(), new GatewayAuditLogger());
  }

  private void stubOk(String modelText) {
    wireMock.stubFor(
        post(urlPathMatching(GENERATE_CONTENT_PATH))
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("Content-Type", "application/json")
                    .withBody(GatewayTestSupport.generateContentBody(modelText))));
  }

  private String onlyAuditLine() {
    assertThat(auditAppender.list).hasSize(1);
    assertThat(auditAppender.list.get(0).getLevel()).isEqualTo(Level.INFO);
    return auditAppender.list.get(0).getFormattedMessage();
  }

  private static String logged(ListAppender<ILoggingEvent> appender) {
    return appender.list.stream()
        .map(ILoggingEvent::getFormattedMessage)
        .collect(Collectors.joining("\n"));
  }

  private static ListAppender<ILoggingEvent> attach(String loggerName) {
    ListAppender<ILoggingEvent> appender = new ListAppender<>();
    appender.start();
    logger(loggerName).addAppender(appender);
    return appender;
  }

  private static void detach(String loggerName, ListAppender<ILoggingEvent> appender) {
    logger(loggerName).detachAppender(appender);
    appender.stop();
  }

  private static ch.qos.logback.classic.Logger logger(String name) {
    return ((LoggerContext) LoggerFactory.getILoggerFactory()).getLogger(name);
  }
}
