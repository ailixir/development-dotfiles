package com.citi.put.checks.studio.compile.gateway;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.matchingJsonPath;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.CompileBudget;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class GenAiLlmGatewayClientTest {
  private final WireMockServer server =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  GenAiLlmGatewayClientTest() {
    server.start();
  }

  @AfterEach
  void stop() {
    server.stop();
  }

  private CompileRequest request() {
    return GatewayTestSupport.request(List.of("Go to example"));
  }

  private String proposal(CompileRequest request) {
    return "{\"version\":1,\"kind\":\"FULL\",\"steps\":[{\"stepId\":\""
        + request.writableStepIds().getFirst()
        + "\",\"status\":\"GENERATED\",\"code\":\"await page.goto('https://example.invalid');\"}]}";
  }

  private GenAiLlmGatewayClient client() throws Exception {
    return new GenAiLlmGatewayClient(
        GatewayTestSupport.properties(
            server.baseUrl(), Duration.ofSeconds(10), 1, 262144, 262144, 2),
        GatewayTestSupport.parser(),
        new GatewayAuditLogger());
  }

  @Test
  void sendsSchemaTokensAndCapturesUnavailableUsageTruthfully() throws Exception {
    CompileRequest request = request();
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson(GatewayTestSupport.generateContentBody(proposal(request)))));
    try (GenAiLlmGatewayClient client = client()) {
      CompileResponse response = client.propose(request, new CompileBudget(Duration.ofSeconds(5)));
      assertThat(response.isOk()).isTrue();
      assertThat(response.provenance().sdkVersion()).isEqualTo("1.71.0");
      assertThat(response.provenance().finishReason()).isEqualTo("STOP");
      assertThat(response.provenance().usageAvailable()).isFalse();
      assertThat(response.provenance().inputTokens()).isNull();
      server.verify(
          1,
          postRequestedFor(urlPathMatching(".*generateContent"))
              .withRequestBody(
                  matchingJsonPath("$.generationConfig.maxOutputTokens", equalTo("8192")))
              .withRequestBody(matchingJsonPath("$.generationConfig.responseJsonSchema")));
    }
  }

  @Test
  void rejectsTruncationEvenWhenTextContainsValidEnvelope() throws Exception {
    CompileRequest request = request();
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(
                okJson(
                    GatewayTestSupport.generateContentBody(proposal(request))
                        .replace("STOP", "MAX_TOKENS"))));
    try (GenAiLlmGatewayClient client = client()) {
      assertThat(client.propose(request).outcome()).isEqualTo(GatewayOutcome.PARSE_FAILURE);
      server.verify(1, postRequestedFor(urlPathMatching(".*generateContent")));
    }
  }

  @Test
  void retriesAreBoundedWithoutSdkAmplification() throws Exception {
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(
                aResponse()
                    .withStatus(503)
                    .withHeader("Content-Type", "application/json")
                    .withBody(
                        "{\"error\":{\"code\":503,\"message\":\"unavailable\",\"status\":\"UNAVAILABLE\"}}")));
    try (GenAiLlmGatewayClient client = client()) {
      CompileBudget budget = new CompileBudget(Duration.ofSeconds(5));
      assertThat(client.propose(request(), budget).outcome()).isEqualTo(GatewayOutcome.TRANSPORT);
      assertThat(budget.transports()).isEqualTo(3);
      server.verify(3, postRequestedFor(urlPathMatching(".*generateContent")));
    }
  }

  @Test
  void cancellationStopsActualTransportAndRecoversSingleCapacity() throws Exception {
    CompileRequest request = request();
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(
                okJson(GatewayTestSupport.generateContentBody(proposal(request)))
                    .withFixedDelay(10000)));
    try (GenAiLlmGatewayClient client = client()) {
      CompileBudget budget = new CompileBudget(Duration.ofSeconds(20));
      CompletableFuture<CompileResponse> first =
          CompletableFuture.supplyAsync(() -> client.propose(request, budget));
      long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
      while (server.getAllServeEvents().isEmpty() && System.nanoTime() < until) {
        Thread.sleep(10);
      }
      budget.cancel();
      assertThat(first.get(2, TimeUnit.SECONDS).isOk()).isFalse();
      server.resetAll();
      server.stubFor(
          post(urlPathMatching(".*generateContent"))
              .willReturn(okJson(GatewayTestSupport.generateContentBody(proposal(request)))));
      assertThat(client.propose(request, new CompileBudget(Duration.ofSeconds(3))).isOk()).isTrue();
      server.verify(1, postRequestedFor(urlPathMatching(".*generateContent")));
    }
  }

  @Test
  void activeCallUsesRemainingDeadlineAndDoesNotRetryTimeout() throws Exception {
    CompileRequest request = request();
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(
                okJson(GatewayTestSupport.generateContentBody(proposal(request)))
                    .withFixedDelay(5000)));
    try (GenAiLlmGatewayClient client = client()) {
      long start = System.nanoTime();
      CompileBudget budget = new CompileBudget(Duration.ofMillis(150));
      assertThat(client.propose(request, budget).outcome()).isEqualTo(GatewayOutcome.TIMEOUT);
      assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(2));
      assertThat(budget.transports()).isEqualTo(1);
      server.resetAll();
      server.stubFor(
          post(urlPathMatching(".*generateContent"))
              .willReturn(okJson(GatewayTestSupport.generateContentBody(proposal(request)))));
      assertThat(client.propose(request, new CompileBudget(Duration.ofSeconds(3))).isOk()).isTrue();
    }
  }

  @Test
  void recordsPresentVendorUsageAcrossTheSharedRequest() throws Exception {
    CompileRequest request = request();
    String body = GatewayTestSupport.generateContentBody(proposal(request));
    body =
        body.substring(0, body.length() - 1)
            + ",\"usageMetadata\":{\"promptTokenCount\":15,\"candidatesTokenCount\":9}}";
    server.stubFor(post(urlPathMatching(".*generateContent")).willReturn(okJson(body)));
    try (GenAiLlmGatewayClient client = client()) {
      CompileBudget budget = new CompileBudget(Duration.ofSeconds(5));
      CompileResponse response = client.propose(request, budget);
      assertThat(response.isOk()).isTrue();
      assertThat(response.provenance().usageAvailable()).isTrue();
      assertThat(budget.usage().inputTokens()).isEqualTo(15L);
      assertThat(budget.usage().outputTokens()).isEqualTo(9L);
      assertThat(budget.usage().outputBytes()).isPositive();
    }
  }

  @Test
  void expiredBudgetNeverStartsTransport() throws Exception {
    try (GenAiLlmGatewayClient client = client()) {
      CompileBudget budget = new CompileBudget(Duration.ofMillis(1));
      Thread.sleep(5);
      assertThat(client.propose(request(), budget).outcome()).isEqualTo(GatewayOutcome.TIMEOUT);
      assertThat(server.getAllServeEvents()).isEmpty();
    }
  }
}
