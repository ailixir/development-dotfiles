package com.citi.put.checks.studio.compile.gateway;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.matchingJsonPath;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.citi.put.checks.studio.compile.CompileBudget;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.github.tomakehurst.wiremock.stubbing.Scenario;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

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

  /** VAL-004: socket deadlines come from request-timeout, never OkHttp's 10s defaults. */
  @Test
  void transportSocketTimeoutsDeriveFromRequestTimeout() {
    StudioGatewayProperties base =
        GatewayTestSupport.properties(
            server.baseUrl(), Duration.ofSeconds(60), 1, 262144, 262144, 2);
    okhttp3.OkHttpClient http = GenAiLlmGatewayClient.transportBuilder(base).build();
    assertThat(http.connectTimeoutMillis()).isEqualTo(60_000);
    assertThat(http.readTimeoutMillis()).isEqualTo(60_000);
    assertThat(http.writeTimeoutMillis()).isEqualTo(60_000);
    assertThat(http.callTimeoutMillis()).isEqualTo(60_000);
    assertThat(http.retryOnConnectionFailure()).isFalse();
  }

  /** VAL-004: a model answer slower than OkHttp's 10s read default still succeeds. */
  @Test
  void responseSlowerThanOkHttpDefaultReadTimeoutSucceeds() throws Exception {
    CompileRequest request = request();
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(
                okJson(GatewayTestSupport.generateContentBody(proposal(request)))
                    .withFixedDelay(11_000)));
    StudioGatewayProperties base =
        GatewayTestSupport.properties(
            server.baseUrl(), Duration.ofSeconds(30), 1, 262144, 262144, 2);
    try (GenAiLlmGatewayClient client = client(base)) {
      CompileResponse response = client.propose(request, new CompileBudget(Duration.ofSeconds(30)));
      assertThat(response.outcome()).isEqualTo(GatewayOutcome.OK);
      server.verify(1, postRequestedFor(urlPathMatching(".*generateContent")));
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

  @Test
  void compilationSettingsRecordProviderSchemaVersionTwo() throws Exception {
    try (GenAiLlmGatewayClient client = client()) {
      assertThat(
              new ObjectMapper()
                  .readTree(client.compilationSettings())
                  .path("providerSchemaVersion")
                  .asInt())
          .isEqualTo(2);
    }
  }

  @Test
  void theWireSchemaIsThePerStatusAnyOf() throws Exception {
    JsonNode items =
        wireBody(properties(StudioGatewayProperties.ThinkingLevel.LOW, true, true), request())
            .at("/generationConfig/responseJsonSchema/properties/steps/items");

    assertThat(items.has("anyOf")).isTrue();
    assertThat(items.path("anyOf").get(0).path("required").toString())
        .isEqualTo("[\"stepId\",\"status\",\"code\"]");
    assertThat(items.path("anyOf").get(1).path("required").toString())
        .isEqualTo("[\"stepId\",\"status\",\"reason\",\"message\"]");
  }

  /** Loopback properties with the given bounds; everything else is the shared default. */
  private StudioGatewayProperties limits(
      int maxConcurrency, int maxInputBytes, int maxOutputBytes, int maxRetries) {
    return GatewayTestSupport.properties(
        server.baseUrl(),
        Duration.ofSeconds(10),
        maxConcurrency,
        maxInputBytes,
        maxOutputBytes,
        maxRetries);
  }

  private void stubUnavailable(String state, String next) {
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .inScenario("unavailable")
            .whenScenarioStateIs(state)
            .willReturn(
                aResponse()
                    .withStatus(503)
                    .withHeader("Content-Type", "application/json")
                    .withBody(
                        "{\"error\":{\"code\":503,\"message\":\"unavailable\",\"status\":\"UNAVAILABLE\"}}"))
            .willSetStateTo(next));
  }

  /** Story 10.51 TEST-001 (seam doc §4 row 2): the input bound is checked before any socket. */
  @Test
  void oversizedInputIsRejectedBeforeAnyNetworkCall() throws Exception {
    CompileRequest request = request();
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson(GatewayTestSupport.generateContentBody(proposal(request)))));
    try (GenAiLlmGatewayClient client = client(limits(1, 32, 262144, 2))) {
      CompileBudget budget = new CompileBudget(Duration.ofSeconds(5));
      CompileResponse response = client.propose(request, budget);

      assertThat(response.outcome()).isEqualTo(GatewayOutcome.TOO_LARGE);
      assertThat(response.errorCode()).isEqualTo(GatewayErrorCode.COMPILE_INPUT_TOO_LARGE);
      assertThat(response.provenance()).isNull();
      assertThat(response.inputBytes()).isGreaterThan(32);
      assertThat(budget.transports()).isZero();
      assertThat(server.getAllServeEvents()).isEmpty();
    }
  }

  /** Story 10.51 TEST-001: a full gateway answers BUSY at once and sends nothing. */
  @Test
  void saturatedConcurrencyFailsFastWithoutTransport() throws Exception {
    CompileRequest request = request();
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(
                okJson(GatewayTestSupport.generateContentBody(proposal(request)))
                    .withFixedDelay(1500)));
    try (GenAiLlmGatewayClient client = client(limits(1, 262144, 262144, 0))) {
      CompletableFuture<CompileResponse> first =
          CompletableFuture.supplyAsync(
              () -> client.propose(request, new CompileBudget(Duration.ofSeconds(10))));
      long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
      while (server.getAllServeEvents().isEmpty() && System.nanoTime() < until) {
        Thread.sleep(10);
      }
      assertThat(server.getAllServeEvents()).as("first call in flight").hasSize(1);

      CompileBudget budget = new CompileBudget(Duration.ofSeconds(10));
      CompileResponse rejected = client.propose(request, budget);

      assertThat(rejected.outcome()).isEqualTo(GatewayOutcome.BUSY);
      assertThat(rejected.errorCode()).isEqualTo(GatewayErrorCode.GATEWAY_BUSY);
      assertThat(rejected.provenance()).isNull();
      assertThat(budget.transports()).isZero();
      assertThat(first.get(10, TimeUnit.SECONDS).outcome()).isEqualTo(GatewayOutcome.OK);
      assertThat(server.getAllServeEvents()).hasSize(1);
    }
  }

  /** Story 10.51 TEST-001: model output over the byte cap is discarded, never parsed. */
  @Test
  void oversizedOutputIsDiscarded() throws Exception {
    CompileRequest request = request();
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson(GatewayTestSupport.generateContentBody(proposal(request)))));
    try (GenAiLlmGatewayClient client = client(limits(1, 262144, 16, 2))) {
      CompileResponse response = client.propose(request, new CompileBudget(Duration.ofSeconds(5)));

      assertThat(response.outcome()).isEqualTo(GatewayOutcome.TOO_LARGE);
      assertThat(response.errorCode()).isEqualTo(GatewayErrorCode.GATEWAY_OUTPUT_TOO_LARGE);
      assertThat(response.artifactJson()).isNull();
      assertThat(response.outputBytes()).isGreaterThan(16);
      server.verify(1, postRequestedFor(urlPathMatching(".*generateContent")));
    }
  }

  /** Story 10.51 TEST-002: retries are counted and stop at the configured bound. */
  @Test
  void retryCountIsReportedAndBounded() throws Exception {
    CompileRequest request = request();
    stubUnavailable(Scenario.STARTED, "second");
    stubUnavailable("second", "third");
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .inScenario("unavailable")
            .whenScenarioStateIs("third")
            .willReturn(okJson(GatewayTestSupport.generateContentBody(proposal(request)))));
    try (GenAiLlmGatewayClient client = client(limits(1, 262144, 262144, 2))) {
      CompileResponse recovered = client.propose(request, new CompileBudget(Duration.ofSeconds(5)));
      assertThat(recovered.outcome()).isEqualTo(GatewayOutcome.OK);
      assertThat(recovered.retries()).isEqualTo(2);
      server.verify(3, postRequestedFor(urlPathMatching(".*generateContent")));

      server.resetAll();
      stubUnavailable(Scenario.STARTED, Scenario.STARTED);
      CompileResponse exhausted = client.propose(request, new CompileBudget(Duration.ofSeconds(5)));
      assertThat(exhausted.outcome()).isEqualTo(GatewayOutcome.TRANSPORT);
      assertThat(exhausted.errorCode()).isEqualTo(GatewayErrorCode.GATEWAY_TRANSPORT);
      assertThat(exhausted.retries()).isEqualTo(2);
      server.verify(3, postRequestedFor(urlPathMatching(".*generateContent")));
    }
  }

  /**
   * Story 10.51 TEST-002: no sampling parameter leaves the process (javadoc of generationConfig).
   */
  @Test
  void noSamplingParametersAreSentOnTheWire() throws Exception {
    JsonNode body =
        wireBody(properties(StudioGatewayProperties.ThinkingLevel.MEDIUM, true, true), request());

    assertThat(body.at("/generationConfig").isObject()).isTrue();
    assertThat(body.toString()).doesNotContain("temperature", "topP", "topK", "candidateCount");
  }

  /**
   * Story 10.51 TEST-002: a response with no candidates is a parse failure that leaks no source.
   */
  @Test
  void responseWithoutCandidatesIsAParseFailureThatLeaksNoSource() throws Exception {
    CompileRequest request = GatewayTestSupport.requestWithCanaryInSource();
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson("{\"candidates\":[],\"modelVersion\":\"stub-model-001\"}")));
    List<Logger> loggers =
        List.of(
            (Logger) LoggerFactory.getLogger(GatewayAuditLogger.AUDIT_LOGGER),
            (Logger) LoggerFactory.getLogger(GatewayAuditLogger.class));
    ListAppender<ILoggingEvent> appender = new ListAppender<>();
    appender.start();
    loggers.forEach(logger -> logger.addAppender(appender));
    try (GenAiLlmGatewayClient client = client()) {
      CompileResponse response = client.propose(request, new CompileBudget(Duration.ofSeconds(5)));

      assertThat(server.getAllServeEvents().getFirst().getRequest().getBodyAsString())
          .as("negative control: the source really left with the request")
          .contains(GatewayTestSupport.CANARY, GatewayTestSupport.SECRET_PLACEHOLDER);
      assertThat(response.outcome()).isEqualTo(GatewayOutcome.PARSE_FAILURE);
      assertThat(response.failureReason())
          .isNotBlank()
          .doesNotContain(GatewayTestSupport.CANARY, GatewayTestSupport.SECRET_PLACEHOLDER);
      String logged =
          appender.list.stream()
              .map(ILoggingEvent::getFormattedMessage)
              .collect(Collectors.joining("\n"));
      assertThat(logged)
          .contains("outcome=PARSE_FAILURE")
          .doesNotContain(GatewayTestSupport.CANARY, GatewayTestSupport.SECRET_PLACEHOLDER);
    } finally {
      loggers.forEach(logger -> logger.detachAppender(appender));
      appender.stop();
    }
  }
}
