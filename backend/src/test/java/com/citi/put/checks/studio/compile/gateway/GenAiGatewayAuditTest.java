package com.citi.put.checks.studio.compile.gateway;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

/** Redaction assertions on the production adapter, separately from legacy transport regressions. */
class GenAiGatewayAuditTest {
  @Test
  void actualProductionTransportAuditsSuccessMalformedAndEchoedErrorsWithoutSource()
      throws Exception {
    WireMockServer server =
        new WireMockServer(WireMockConfiguration.options().bindAddress("127.0.0.1").dynamicPort());
    List<Logger> loggers =
        List.of(
            (Logger) LoggerFactory.getLogger(GatewayAuditLogger.AUDIT_LOGGER),
            (Logger) LoggerFactory.getLogger(GatewayAuditLogger.class));
    ListAppender<ILoggingEvent> appender = new ListAppender<>();
    appender.start();
    loggers.forEach(logger -> logger.addAppender(appender));
    server.start();
    CompileRequest request = GatewayTestSupport.requestWithCanaryInSource();
    assertThat(String.join("\n", request.fencedSourceLines())).contains(GatewayTestSupport.CANARY);
    ObjectMapper mapper = new ObjectMapper();
    var envelope = mapper.createObjectNode().put("version", 1).put("kind", "FULL");
    var steps = envelope.putArray("steps");
    for (var id : request.writableStepIds()) {
      steps
          .addObject()
          .put("stepId", id.toString())
          .put("status", "GENERATED")
          .put("code", "await page.goto('https://example.invalid');");
    }
    try (GenAiLlmGatewayClient client =
        new GenAiLlmGatewayClient(
            GatewayTestSupport.properties("http://127.0.0.1:" + server.port()),
            GatewayTestSupport.parser(),
            new GatewayAuditLogger())) {
      for (GatewayOutcome expected :
          List.of(GatewayOutcome.OK, GatewayOutcome.PARSE_FAILURE, GatewayOutcome.TRANSPORT)) {
        server.resetAll();
        appender.list.clear();
        String modelText =
            expected == GatewayOutcome.OK ? envelope.toString() : GatewayTestSupport.CANARY;
        String body =
            expected == GatewayOutcome.TRANSPORT
                ? mapper
                    .createObjectNode()
                    .set(
                        "error",
                        mapper
                            .createObjectNode()
                            .put("code", 400)
                            .put("status", "INVALID_ARGUMENT")
                            .put("message", GatewayTestSupport.CANARY))
                    .toString()
                : GatewayTestSupport.generateContentBody(modelText);
        server.stubFor(
            post(urlPathMatching(".*generateContent"))
                .willReturn(
                    aResponse()
                        .withStatus(expected == GatewayOutcome.TRANSPORT ? 400 : 200)
                        .withHeader("Content-Type", "application/json")
                        .withBody(body)));
        CompileResponse response = client.propose(request);
        server.verify(1, postRequestedFor(urlPathMatching(".*generateContent")));
        assertThat(server.getAllServeEvents().getFirst().getRequest().getBodyAsString())
            .contains(GatewayTestSupport.CANARY);
        assertThat(response.outcome()).isEqualTo(expected);
        assertThat(appender.list).isNotEmpty();
        String logged =
            appender.list.stream()
                .map(ILoggingEvent::getFormattedMessage)
                .collect(java.util.stream.Collectors.joining("\n"));
        assertThat(logged)
            .contains("outcome=" + expected)
            .doesNotContain(
                GatewayTestSupport.CANARY,
                GatewayTestSupport.SECRET_PLACEHOLDER,
                "await page.goto",
                "PLAYWRIGHT SYNTAX REFERENCE");
        if (response.failureReason() != null) {
          assertThat(response.failureReason()).doesNotContain(GatewayTestSupport.CANARY);
        }
      }
    } finally {
      server.stop();
      loggers.forEach(logger -> logger.detachAppender(appender));
      appender.stop();
    }
  }
}
