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
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
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
    return client(properties(StudioGatewayProperties.ThinkingLevel.MEDIUM, true, true));
  }

  private GenAiLlmGatewayClient client(StudioGatewayProperties properties) throws Exception {
    return new GenAiLlmGatewayClient(
        properties, GatewayTestSupport.parser(), new GatewayAuditLogger());
  }

  private StudioGatewayProperties properties(
      StudioGatewayProperties.ThinkingLevel level,
      boolean systemInstruction,
      boolean thinkingConfig) {
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
        level,
        new StudioGatewayProperties.ProviderFeatures(systemInstruction, thinkingConfig));
  }

  /** Sends one request through a fresh stub and returns the JSON body that reached the wire. */
  private JsonNode wireBody(StudioGatewayProperties properties, CompileRequest request)
      throws Exception {
    server.resetAll();
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson(GatewayTestSupport.generateContentBody(proposal(request)))));
    try (GenAiLlmGatewayClient client = client(properties)) {
      assertThat(client.propose(request, new CompileBudget(Duration.ofSeconds(5))).isOk()).isTrue();
    }
    assertThat(server.getAllServeEvents()).hasSize(1);
    return new ObjectMapper()
        .readTree(server.getAllServeEvents().getFirst().getRequest().getBodyAsString());
  }

  private static CompileRequest otherTest() {
    return new CompileRequest(
        UUID.fromString("99999999-8888-7777-6666-555555555555"),
        "CSI67890",
        "u-other-principal",
        "cr-0002",
        1,
        List.of("0: \"Open the dashboard\"", "1: \"Click Refresh\""),
        "PLAYWRIGHT SYNTAX REFERENCE (stub body)",
        "syntax-2026.09.0",
        "Return a JSON artifact conforming to the artifact contract.",
        "prompt-2026.09.0");
  }

  private String proposalFor(CompileRequest request) {
    StringBuilder steps = new StringBuilder();
    for (UUID id : request.writableStepIds()) {
      if (!steps.isEmpty()) {
        steps.append(',');
      }
      steps
          .append("{\"stepId\":\"")
          .append(id)
          .append("\",\"status\":\"GENERATED\",\"code\":\"await page.reload();\"}");
    }
    return "{\"version\":1,\"kind\":\"FULL\",\"steps\":[" + steps + "]}";
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
                  matchingJsonPath(
                      "$.generationConfig.maxOutputTokens",
                      equalTo(String.valueOf(StudioGatewayProperties.DEFAULT_MAX_OUTPUT_TOKENS))))
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

  @Test
  void staticPrefixTravelsAsSystemInstructionAndPerRequestLinesFollowIt() throws Exception {
    CompileRequest request = request();
    JsonNode body =
        wireBody(properties(StudioGatewayProperties.ThinkingLevel.MEDIUM, true, true), request);

    assertThat(body.at("/systemInstruction/parts/0/text").asText())
        .isEqualTo(request.outputContract() + "\n\n" + request.syntaxReference())
        .doesNotContain(request.proposalKind())
        .doesNotContain(request.writableStepIds().getFirst().toString())
        .doesNotContain("Go to example");
    assertThat(body.at("/contents")).hasSize(1);
    String contents = body.at("/contents/0/parts/0/text").asText();
    assertThat(contents)
        .startsWith(request.fencedSourceLines().getFirst())
        .contains("Required envelope kind: FULL")
        .contains(request.writableStepIds().getFirst().toString())
        .doesNotContain(request.outputContract())
        .doesNotContain(request.syntaxReference());
    assertThat(contents.indexOf("Go to example"))
        .isLessThan(contents.indexOf("Required envelope kind"));
  }

  @Test
  void twoDifferentTestsSendByteIdenticalSystemInstructions() throws Exception {
    StudioGatewayProperties properties =
        properties(StudioGatewayProperties.ThinkingLevel.MEDIUM, true, true);
    CompileRequest first = request();
    JsonNode firstBody = wireBody(properties, first);
    CompileRequest second = otherTest();
    server.resetAll();
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson(GatewayTestSupport.generateContentBody(proposalFor(second)))));
    try (GenAiLlmGatewayClient client = client(properties)) {
      assertThat(client.propose(second, new CompileBudget(Duration.ofSeconds(5))).isOk()).isTrue();
    }
    JsonNode secondBody =
        new ObjectMapper()
            .readTree(server.getAllServeEvents().getFirst().getRequest().getBodyAsString());

    assertThat(secondBody.at("/systemInstruction").toString())
        .isEqualTo(firstBody.at("/systemInstruction").toString());
    assertThat(secondBody.at("/contents").toString())
        .isNotEqualTo(firstBody.at("/contents").toString());
  }

  @Test
  void thinkingLevelIsSentExplicitlyAndNeverWithABudget() throws Exception {
    JsonNode body =
        wireBody(properties(StudioGatewayProperties.ThinkingLevel.MEDIUM, true, true), request());

    JsonNode thinking = body.at("/generationConfig/thinkingConfig");
    assertThat(thinking.path("thinkingLevel").asText()).isEqualTo("MEDIUM");
    assertThat(thinking.has("thinkingBudget")).isFalse();
    assertThat(body.toString()).doesNotContain("thinkingBudget").doesNotContain("MINIMAL");

    JsonNode low =
        wireBody(properties(StudioGatewayProperties.ThinkingLevel.LOW, true, true), request());
    assertThat(low.at("/generationConfig/thinkingConfig/thinkingLevel").asText()).isEqualTo("LOW");
  }

  @Test
  void systemInstructionSwitchOffSendsTheIdenticalStaticBytesFirstInContents() throws Exception {
    CompileRequest request = request();
    JsonNode split =
        wireBody(properties(StudioGatewayProperties.ThinkingLevel.MEDIUM, true, true), request);
    JsonNode degraded =
        wireBody(properties(StudioGatewayProperties.ThinkingLevel.MEDIUM, false, true), request);

    assertThat(degraded.has("systemInstruction")).isFalse();
    assertThat(degraded.at("/contents")).hasSize(1);
    assertThat(degraded.at("/contents/0/parts/0/text").asText())
        .isEqualTo(
            split.at("/systemInstruction/parts/0/text").asText()
                + "\n\n"
                + split.at("/contents/0/parts/0/text").asText());
    assertThat(degraded.at("/generationConfig/thinkingConfig/thinkingLevel").asText())
        .isEqualTo("MEDIUM");
  }

  @Test
  void thinkingConfigSwitchOffOmitsTheFieldAndRecordsProviderDefault() throws Exception {
    StudioGatewayProperties properties =
        properties(StudioGatewayProperties.ThinkingLevel.MEDIUM, true, false);
    JsonNode body = wireBody(properties, request());

    assertThat(body.at("/generationConfig").has("thinkingConfig")).isFalse();
    assertThat(body.has("systemInstruction")).isTrue();
    try (GenAiLlmGatewayClient client = client(properties)) {
      assertThat(new ObjectMapper().readTree(client.compilationSettings()).path("thinkingLevel"))
          .hasToString("\"PROVIDER_DEFAULT\"");
    }
  }

  @Test
  void compilationSettingsCarryTheThinkingLevel() throws Exception {
    String medium;
    String low;
    try (GenAiLlmGatewayClient client =
        client(properties(StudioGatewayProperties.ThinkingLevel.MEDIUM, true, true))) {
      medium = client.compilationSettings();
    }
    try (GenAiLlmGatewayClient client =
        client(properties(StudioGatewayProperties.ThinkingLevel.LOW, true, true))) {
      low = client.compilationSettings();
    }

    assertThat(new ObjectMapper().readTree(medium).path("thinkingLevel").asText())
        .isEqualTo("MEDIUM");
    assertThat(new ObjectMapper().readTree(low).path("thinkingLevel").asText()).isEqualTo("LOW");
    assertThat(low).isNotEqualTo(medium);
  }
}
