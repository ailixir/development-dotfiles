package com.citi.put.checks.studio.compile.gateway;

import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.citi.put.checks.studio.compile.CompileBudget;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

/**
 * Story 10.45 AC 4 (FR-13): per-proposal usage is recorded completely, and a count the vendor did
 * not report is {@code null}, never {@code 0}, both on provenance and on the audit line.
 */
class UsageCaptureTest {
  private final WireMockServer server =
      new WireMockServer(WireMockConfiguration.options().bindAddress("127.0.0.1").dynamicPort());
  private final Logger auditLogger =
      (Logger) LoggerFactory.getLogger(GatewayAuditLogger.AUDIT_LOGGER);
  private final ListAppender<ILoggingEvent> appender = new ListAppender<>();

  @BeforeEach
  void start() {
    server.start();
    appender.start();
    auditLogger.addAppender(appender);
  }

  @AfterEach
  void stop() {
    server.stop();
    auditLogger.detachAppender(appender);
    appender.stop();
  }

  @Test
  void recordsThoughtsCachedAndTotalTokensWhenReported() throws Exception {
    CompileRequest request = request();
    CompileResponse response =
        propose(
            request,
            withUsage(
                request,
                "{\"promptTokenCount\":1200,\"candidatesTokenCount\":80,"
                    + "\"thoughtsTokenCount\":310,\"cachedContentTokenCount\":1024,"
                    + "\"totalTokenCount\":1590}"),
            properties(true));

    assertThat(response.isOk()).isTrue();
    GatewayProvenance provenance = response.provenance();
    assertThat(provenance.inputTokens()).isEqualTo(1200);
    assertThat(provenance.outputTokens()).isEqualTo(80);
    assertThat(provenance.thoughtsTokens()).isEqualTo(310);
    assertThat(provenance.cachedContentTokens()).isEqualTo(1024);
    assertThat(provenance.totalTokens()).isEqualTo(1590);
    assertThat(provenance.usageAvailable()).isTrue();
    assertThat(provenance.finishReason()).isEqualTo("STOP");
    assertThat(provenance.maxOutputTokens())
        .isEqualTo(StudioGatewayProperties.DEFAULT_MAX_OUTPUT_TOKENS);
    assertThat(provenance.thinkingLevel()).isEqualTo("MEDIUM");

    assertThat(auditLine())
        .contains(
            "inputTokens=1200",
            "outputTokens=80",
            "thoughtsTokens=310",
            "cachedContentTokens=1024",
            "totalTokens=1590",
            "usageAvailable=true",
            "thinkingLevel=MEDIUM",
            "finishReason=STOP");
  }

  @Test
  void absentCachedContentCountIsNullNotZero() throws Exception {
    CompileRequest request = request();
    CompileResponse response =
        propose(
            request,
            withUsage(
                request,
                "{\"promptTokenCount\":1200,\"candidatesTokenCount\":80,"
                    + "\"thoughtsTokenCount\":310,\"totalTokenCount\":1590}"),
            properties(true));

    assertThat(response.isOk()).isTrue();
    assertThat(response.provenance().cachedContentTokens()).isNull();
    assertThat(response.provenance().thoughtsTokens()).isEqualTo(310);
    assertThat(auditLine())
        .contains("cachedContentTokens=null")
        .doesNotContain("cachedContentTokens=0");
  }

  @Test
  void noVendorUsageRecordsNullCountsAndUsageUnavailable() throws Exception {
    CompileRequest request = request();
    CompileBudget budget = new CompileBudget(Duration.ofSeconds(5));
    CompileResponse response =
        propose(
            request,
            GatewayTestSupport.generateContentBody(proposal(request)),
            properties(true),
            budget);

    assertThat(response.isOk()).isTrue();
    GatewayProvenance provenance = response.provenance();
    assertThat(provenance.usageAvailable()).isFalse();
    assertThat(provenance.inputTokens()).isNull();
    assertThat(provenance.outputTokens()).isNull();
    assertThat(provenance.thoughtsTokens()).isNull();
    assertThat(provenance.cachedContentTokens()).isNull();
    assertThat(provenance.totalTokens()).isNull();
    assertThat(budget.usage().usageAvailable()).isFalse();
    assertThat(budget.usage().inputTokens()).isNull();
    assertThat(auditLine())
        .contains(
            "usageAvailable=false",
            "inputTokens=null",
            "outputTokens=null",
            "thoughtsTokens=null",
            "cachedContentTokens=null",
            "totalTokens=null")
        .doesNotContain("Tokens=0");
  }

  @Test
  void partialCoreUsageIsUnavailableButKeepsTheReportedCounts() throws Exception {
    CompileRequest request = request();
    CompileResponse response =
        propose(
            request,
            withUsage(request, "{\"promptTokenCount\":1200,\"totalTokenCount\":1200}"),
            properties(true));

    GatewayProvenance provenance = response.provenance();
    assertThat(provenance.usageAvailable()).isFalse();
    assertThat(provenance.inputTokens()).isEqualTo(1200);
    assertThat(provenance.outputTokens()).isNull();
    assertThat(provenance.totalTokens()).isEqualTo(1200);
  }

  @Test
  void usageIsRecordedOnARejectedProposalToo() throws Exception {
    CompileRequest request = request();
    String body =
        withUsage(
                request,
                "{\"promptTokenCount\":1200,\"candidatesTokenCount\":32768,"
                    + "\"thoughtsTokenCount\":900,\"totalTokenCount\":34868}")
            .replace("\"STOP\"", "\"MAX_TOKENS\"");
    CompileResponse response = propose(request, body, properties(true));

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.PARSE_FAILURE);
    assertThat(response.provenance().finishReason()).isEqualTo("MAX_TOKENS");
    assertThat(response.provenance().thoughtsTokens()).isEqualTo(900);
    assertThat(response.provenance().cachedContentTokens()).isNull();
    assertThat(auditLine()).contains("thoughtsTokens=900", "finishReason=MAX_TOKENS");
  }

  @Test
  void recordsProviderDefaultWhenThinkingConfigIsSwitchedOff() throws Exception {
    CompileRequest request = request();
    CompileResponse response =
        propose(
            request,
            withUsage(request, "{\"promptTokenCount\":10,\"candidatesTokenCount\":5}"),
            properties(false));

    assertThat(response.provenance().thinkingLevel())
        .isEqualTo(StudioGatewayProperties.PROVIDER_DEFAULT_THINKING_LEVEL);
    assertThat(auditLine()).contains("thinkingLevel=PROVIDER_DEFAULT");
  }

  @Test
  void auditLineCarriesCountsButNoStepText() throws Exception {
    CompileRequest request = GatewayTestSupport.requestWithCanaryInSource();
    propose(
        request,
        withUsage(
            request,
            "{\"promptTokenCount\":1,\"candidatesTokenCount\":1,\"thoughtsTokenCount\":1}"),
        properties(true));

    assertThat(auditLine())
        .contains("thoughtsTokens=1")
        .doesNotContain(GatewayTestSupport.CANARY, "await page.goto");
  }

  private CompileRequest request() {
    return GatewayTestSupport.request(List.of("Go to example"));
  }

  private static String proposal(CompileRequest request) {
    StringBuilder steps = new StringBuilder();
    for (var id : request.writableStepIds()) {
      if (!steps.isEmpty()) {
        steps.append(',');
      }
      steps
          .append("{\"stepId\":\"")
          .append(id)
          .append("\",\"status\":\"GENERATED\",")
          .append("\"code\":\"await page.goto('https://example.invalid');\"}");
    }
    return "{\"version\":1,\"kind\":\"FULL\",\"steps\":[" + steps + "]}";
  }

  private static String withUsage(CompileRequest request, String usageMetadata) {
    String body = GatewayTestSupport.generateContentBody(proposal(request));
    return body.substring(0, body.length() - 1) + ",\"usageMetadata\":" + usageMetadata + "}";
  }

  private StudioGatewayProperties properties(boolean thinkingConfig) {
    StudioGatewayProperties base =
        GatewayTestSupport.properties(
            server.baseUrl(), Duration.ofSeconds(10), 1, 262144, 262144, 2);
    return new StudioGatewayProperties(
        base.endpoint(),
        base.project(),
        base.location(),
        base.model(),
        base.credentials(),
        base.requestTimeout(),
        base.maxConcurrency(),
        base.maxInputBytes(),
        base.maxOutputBytes(),
        base.maxOutputTokens(),
        base.structuredOutput(),
        base.temperature(),
        base.retry(),
        base.artifactSchema(),
        StudioGatewayProperties.ThinkingLevel.MEDIUM,
        new StudioGatewayProperties.ProviderFeatures(true, thinkingConfig));
  }

  private CompileResponse propose(
      CompileRequest request, String body, StudioGatewayProperties properties) throws Exception {
    return propose(request, body, properties, new CompileBudget(Duration.ofSeconds(5)));
  }

  private CompileResponse propose(
      CompileRequest request, String body, StudioGatewayProperties properties, CompileBudget budget)
      throws Exception {
    server.resetAll();
    appender.list.clear();
    server.stubFor(post(urlPathMatching(".*generateContent")).willReturn(okJson(body)));
    try (GenAiLlmGatewayClient client =
        new GenAiLlmGatewayClient(
            properties, GatewayTestSupport.parser(), new GatewayAuditLogger())) {
      return client.propose(request, budget);
    }
  }

  private String auditLine() {
    List<String> lines =
        appender.list.stream()
            .map(ILoggingEvent::getFormattedMessage)
            .filter(line -> line.startsWith("studio.gateway.call "))
            .toList();
    assertThat(lines).hasSize(1);
    return lines.getFirst();
  }
}
