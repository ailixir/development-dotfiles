package com.citi.put.checks.studio.guided.translation;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.citi.put.checks.studio.gateway.GenAiGatewayTransport;
import com.citi.put.checks.studio.gateway.StudioGatewayConfig;
import com.citi.put.checks.studio.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;

/** Actual SDK HTTP request/response boundaries; no mock gateway can satisfy these assertions. */
class GuidedGatewayPrivacyTest {
  static final ObjectMapper JSON = new ObjectMapper();
  static final String STEP = "11111111-1111-4111-8111-111111111111";
  static final String AUTHORED = "permitted-authored-日本語-🧭";
  static final List<String> FORBIDDEN =
      List.of(
          "saved-variable-canary",
          "account-canary",
          "secret-canary",
          "runtime-capture-canary",
          "cookie-canary");
  private final WireMockServer server =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());
  @TempDir java.nio.file.Path temporary;

  GuidedGatewayPrivacyTest() {
    server.start();
  }

  @AfterEach
  void stop() {
    server.stop();
  }

  static GuidedCallBudget budget(Duration duration) {
    return new GuidedCallBudget(Instant.now().plus(duration), Clock.systemUTC());
  }

  static ObjectNode projection() {
    ObjectNode node = JSON.createObjectNode();
    node.put("schemaVersion", 3)
        .put("sessionId", "synthetic-session")
        .put("scopeHash", "a".repeat(64))
        .put("sourceRevision", "1")
        .put("configurationRevision", "1");
    node.putArray("sourceSteps")
        .addObject()
        .put("stepId", STEP)
        .put("text", "Fill Search with \"" + AUTHORED + "\"");
    for (String array :
        List.of(
            "configurationReferences",
            "inputs",
            "obligations",
            "needs",
            "repairCodes",
            "authoringContext",
            "clarificationSelections")) {
      node.putArray(array);
    }
    node.putNull("observation")
        .putNull("executionEvidence")
        .putNull("authoredInputsHash")
        .put("contextRevision", 0);
    node.putObject("coordinate").put("stepId", STEP).put("ordinal", 0);
    return node;
  }

  static GuidedModelRequest request(GuidedModelRequest.Kind kind, ObjectNode context, int attempt) {
    ObjectNode schema = JSON.createObjectNode().put("type", "object");
    schema
        .putObject("properties")
        .putObject("kind")
        .put("type", "string")
        .putArray("enum")
        .add(kind.name());
    schema.putArray("required").add("kind");
    return new GuidedModelRequest(
        "synthetic-request",
        attempt,
        kind,
        new GuidedModelProjection(context),
        "Return only the approved guided JSON envelope.",
        schema,
        1024);
  }

  /** Real classifier + positive-field assembler, with private canaries in their actual inputs. */
  static GuidedModelRequest classifiedRequest(GuidedModelRequest.Kind kind, int attempt) {
    var contracts = new GuidedContracts();
    ObjectNode current =
        JSON.createObjectNode()
            .put("testId", "synthetic-test")
            .put("csiId", "CSI-test")
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("environment", "fixture");
    var authoring = current.putObject("authoring").put("authoringSchemaVersion", 2);
    var source =
        authoring
            .putArray("steps")
            .addObject()
            .put("id", STEP)
            .put(
                "text",
                "Fill Search with \""
                    + AUTHORED
                    + "\" then use <var SEARCH> and <secret PASSWORD>");
    source
        .putObject("context")
        .putArray("entries")
        .addObject()
        .put("kind", "text")
        .put("value", "Use the main Search field");
    var variables = current.putArray("variables");
    variables.addObject().put("name", "SEARCH").put("kind", "plain").put("value", FORBIDDEN.get(0));
    variables
        .addObject()
        .put("name", "PASSWORD")
        .put("kind", "secretRef")
        .put("secretId", "PASSWORD");
    current.putObject("account").put("token", FORBIDDEN.get(1));
    ObjectNode scope =
        JSON.createObjectNode()
            .put("applicationId", "fixture-app")
            .put("environmentId", "fixture")
            .put("csiId", "CSI-test")
            .put("sourceRevision", "1")
            .put("configurationRevision", "1");
    var classifier =
        new GuidedSourceClassifier(
            contracts,
            new GuidedTranslationProperties(
                true,
                true,
                List.of("fixture-app"),
                List.of("fixture"),
                65536,
                1024,
                60,
                "fixture-worker"),
            new CredentialPatternScreen());
    ObjectNode manifest = classifier.classify(current, scope);
    assertThat(manifest.path("configurationValues").toString()).contains(FORBIDDEN.getFirst());
    var session =
        JSON.createObjectNode()
            .put("sessionId", "synthetic-session")
            .put("scopeHash", "a".repeat(64));
    session.set("scope", scope);
    session.set("sourceSteps", manifest.path("sourceSteps"));
    session.put("accountToken", FORBIDDEN.get(1));
    // A v3 secretRef declaration carries only its secretId (the codec refuses a value), so the
    // secret canary is planted in the session's private inputs rather than the declaration.
    session.put("secretValue", FORBIDDEN.get(2));
    var state = JSON.createObjectNode();
    state.set("manifest", manifest);
    var progress =
        JSON.createObjectNode()
            .put("stepIndex", 0)
            .put("translationOrdinal", 0)
            .put("contextRevision", 0)
            .put("runtimeCapture", FORBIDDEN.get(3))
            .put("cookie", FORBIDDEN.get(4))
            .put("error", String.join(" ", FORBIDDEN));
    var safeInputs = JSON.createArrayNode();
    safeInputs
        .addObject()
        .put("inputId", "opaque-input")
        .put("sourceStepId", STEP)
        .put("kind", "nonsecretText")
        .put("intendedSlot", "fill.value");
    return new GuidedPromptAssembler(contracts)
        .assemble(
            "synthetic-request",
            attempt,
            kind,
            session,
            progress,
            state,
            safeInputs,
            JSON.createArrayNode(),
            JSON.createArrayNode(),
            attempt == 1 ? List.of() : List.of("INVALID_RESPONSE"),
            1024);
  }

  static ObjectNode answer(GuidedModelRequest request) {
    ObjectNode answer =
        JSON.createObjectNode()
            .put("schemaVersion", 3)
            .put("kind", request.kind().name())
            .put("requestId", request.requestId());
    switch (request.kind()) {
      case SOURCE_PLAN -> {
        answer.putArray("sourceReferences");
        answer.putArray("needs");
        answer
            .putArray("obligations")
            .addObject()
            .put("stepId", STEP)
            .put("occurrence", 0)
            .put("operationKind", "click")
            .put("targetIntent", "Continue")
            .putNull("referenceIndex")
            .putNull("needId")
            .putNull("predicate");
      }
      case NEXT_ACTION ->
          answer
              .put("status", "COMPLETE")
              .putNull("obligationId")
              .putNull("action")
              .putNull("question");
      case VERIFY_STEP -> answer.put("stepId", STEP).put("complete", true);
    }
    return answer;
  }

  static String provider(String text) throws Exception {
    var envelope = JSON.createObjectNode().put("modelVersion", "untrusted-provider-model-canary");
    var candidate = envelope.putArray("candidates").addObject().put("finishReason", "STOP");
    candidate
        .putObject("content")
        .put("role", "model")
        .putArray("parts")
        .addObject()
        .put("text", text);
    envelope.putObject("usageMetadata").put("promptTokenCount", 12).put("candidatesTokenCount", 7);
    return JSON.writeValueAsString(envelope);
  }

  static StudioGatewayProperties properties(String endpoint, int inputBytes, int outputBytes) {
    return new StudioGatewayProperties(
        endpoint,
        "synthetic-project",
        "global",
        "synthetic-model",
        new StudioGatewayProperties.Credentials("none", null),
        Duration.ofSeconds(5),
        1,
        inputBytes,
        outputBytes,
        StudioGatewayProperties.DEFAULT_MAX_OUTPUT_TOKENS,
        StudioGatewayProperties.ThinkingLevel.LOW,
        StudioGatewayProperties.ProviderFeatures.ALL);
  }

  private GenAiGuidedLlmGatewayClient client(GenAiGatewayTransport transport) {
    return new GenAiGuidedLlmGatewayClient(
        transport, new GuidedResponseParser(new GuidedContracts()));
  }

  @ParameterizedTest
  @EnumSource(GuidedModelRequest.Kind.class)
  void sendsExactTypedProjectionWithStaticInstructionsAndSchema(GuidedModelRequest.Kind kind)
      throws Exception {
    GuidedModelRequest request = classifiedRequest(kind, 2);
    ObjectNode context = request.projection().document();
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson(provider(answer(request).toString()))));
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 65536))) {
      var response = client(transport).propose(request, budget(Duration.ofSeconds(5)));
      assertThat(response.code()).isEqualTo(GuidedModelResponse.Code.OK);
      assertThat(response.proposal()).isEqualTo(answer(request));
      assertThat(response.providerModel()).isEqualTo("synthetic-model");
      assertThat(response.inputTokens()).isEqualTo(12);
      assertThat(response.outputTokens()).isEqualTo(7);
    }
    server.verify(1, postRequestedFor(urlPathMatching(".*generateContent")));
    var received = server.getAllServeEvents().getFirst().getRequest();
    assertThat(received.getHeader("Authorization")).isNull();
    JsonNode body = JSON.readTree(received.getBody());
    assertThat(body.at("/systemInstruction/parts/0/text").asText())
        .isEqualTo(request.outputContract());
    JsonNode sent = JSON.readTree(body.at("/contents/0/parts/0/text").asText());
    assertThat(sent.path("kind").asText()).isEqualTo(kind.name());
    assertThat(sent.path("requestId").asText()).isEqualTo(request.requestId());
    assertThat(sent.path("attempt").asInt()).isEqualTo(2);
    assertThat(sent.path("context")).isEqualTo(context);
    assertThat(body.at("/generationConfig/responseJsonSchema")).isEqualTo(request.responseSchema());
    assertLocalSchemaReferences(request.responseSchema(), request.responseSchema());
    assertThat(body.at("/generationConfig/responseJsonSchema").toString())
        .as(
            "Provider schema is self-contained; strict local contract remains separately"
                + " authoritative")
        .doesNotContain("https://checks.citi.example/contracts/", "\"$schema\"", "\"$id\"");
    assertThat(body.at("/generationConfig/maxOutputTokens").asInt()).isEqualTo(1024);
    assertThat(received.getBodyAsString()).contains(AUTHORED);
    for (String forbidden : FORBIDDEN) {
      assertThat(received.getBodyAsString()).doesNotContain(forbidden);
    }
  }

  @Test
  void rejectsPrivateAndRawFieldsBeforeTheyCanBecomeProviderRequests() {
    for (String field :
        List.of(
            "configurationValues",
            "resolvedSecrets",
            "account",
            "storage",
            "rawHtml",
            "rawAria",
            "capturedValues",
            "error",
            "repairText")) {
      ObjectNode invalid = projection();
      invalid.put(field, String.join(" ", FORBIDDEN));
      assertThatThrownBy(() -> request(GuidedModelRequest.Kind.SOURCE_PLAN, invalid, 1))
          .hasMessageNotContaining(FORBIDDEN.getFirst());
    }
    assertThat(server.getAllServeEvents()).isEmpty();
  }

  @Test
  void configuredInstructionFallbackKeepsStaticContractAndSafeProjectionOnWire() throws Exception {
    var base = properties(server.baseUrl(), 262144, 65536);
    var degraded =
        new StudioGatewayProperties(
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
            base.thinkingLevel(),
            new StudioGatewayProperties.ProviderFeatures(false, false));
    var request = classifiedRequest(GuidedModelRequest.Kind.VERIFY_STEP, 1);
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson(provider(answer(request).toString()))));
    try (var transport = new GenAiGatewayTransport(degraded)) {
      assertThat(client(transport).propose(request, budget(Duration.ofSeconds(5))).code())
          .isEqualTo(GuidedModelResponse.Code.OK);
    }
    var wire = JSON.readTree(server.getAllServeEvents().getFirst().getRequest().getBody());
    assertThat(wire.has("systemInstruction")).isFalse();
    assertThat(wire.at("/generationConfig").has("thinkingConfig")).isFalse();
    String content = wire.at("/contents/0/parts/0/text").asText();
    assertThat(content).startsWith(request.outputContract() + "\n\n").contains(AUTHORED);
    assertThat(
            JSON.readTree(content.substring(request.outputContract().length() + 2)).path("context"))
        .isEqualTo(request.projection().document());
    for (String forbidden : FORBIDDEN) {
      assertThat(wire.toString()).doesNotContain(forbidden);
    }
  }

  @ParameterizedTest
  @ValueSource(ints = {401, 429, 500, 503})
  void maliciousErrorsAndRetryAfterNeverReissueOrLeak(int status) throws Exception {
    String canary = "provider-prose-secret-canary";
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(
                aResponse()
                    .withStatus(status)
                    .withHeader("Content-Type", "application/json")
                    .withHeader("Retry-After", "0")
                    .withHeader("X-Untrusted", canary)
                    .withBody(
                        "{\"error\":{\"code\":" + status + ",\"message\":\"" + canary + "\"}}")));
    Logger log = (Logger) LoggerFactory.getLogger("com.citi.put.checks.studio");
    var appender = new ListAppender<ILoggingEvent>();
    appender.start();
    log.addAppender(appender);
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 65536))) {
      var response =
          client(transport)
              .propose(
                  request(GuidedModelRequest.Kind.SOURCE_PLAN, projection(), 1),
                  budget(Duration.ofSeconds(5)));
      assertThat(response.code()).isEqualTo(GuidedModelResponse.Code.TRANSPORT);
      assertThat(response.toString()).doesNotContain(canary);
      assertThat(response.proposal()).isNull();
      assertThat(appender.list)
          .allSatisfy(event -> assertThat(event.getFormattedMessage()).doesNotContain(canary));
    } finally {
      log.detachAppender(appender);
      appender.stop();
    }
    server.verify(1, postRequestedFor(urlPathMatching(".*generateContent")));
  }

  @Test
  void malformedResponseProducesClosedCodeAndNoRawRepairText() throws Exception {
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson(provider("provider-prose-secret-canary"))));
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 65536))) {
      var response =
          client(transport)
              .propose(
                  request(GuidedModelRequest.Kind.SOURCE_PLAN, projection(), 1),
                  budget(Duration.ofSeconds(5)));
      assertThat(response.code()).isEqualTo(GuidedModelResponse.Code.INVALID_RESPONSE);
      assertThat(response.toString())
          .doesNotContain("provider-prose-secret-canary", "untrusted-provider-model-canary");
      assertThat(response.inputTokens()).isEqualTo(12);
    }
  }

  @Test
  void rejectsFinishFailureEvenWhenTextIsValid() throws Exception {
    var request = request(GuidedModelRequest.Kind.VERIFY_STEP, projection(), 1);
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(
                okJson(provider(answer(request).toString()).replace("STOP", "MAX_TOKENS"))));
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 65536))) {
      assertThat(client(transport).propose(request, budget(Duration.ofSeconds(5))).code())
          .isEqualTo(GuidedModelResponse.Code.INVALID_RESPONSE);
    }
  }

  @Test
  void requestLimitIncludesActualSdkSchemaEnvelopeBeforeNetwork() throws Exception {
    var base = request(GuidedModelRequest.Kind.VERIFY_STEP, projection(), 1);
    ObjectNode largeSchema = (ObjectNode) base.responseSchema();
    largeSchema.put("description", "schema-padding-".repeat(500));
    var request =
        new GuidedModelRequest(
            base.requestId(),
            1,
            base.kind(),
            base.projection(),
            base.outputContract(),
            largeSchema,
            base.maxOutputTokens());
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 4096, 65536))) {
      assertThat(client(transport).propose(request, budget(Duration.ofSeconds(5))).code())
          .isEqualTo(GuidedModelResponse.Code.TOO_LARGE);
    }
    assertThat(server.getAllServeEvents()).isEmpty();
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void capsTextAndEntireResponseBodyBeforeRetainingProviderData(boolean giantEnvelope)
      throws Exception {
    String response = giantEnvelope ? "x".repeat(100000) : provider("界".repeat(400));
    server.stubFor(post(urlPathMatching(".*generateContent")).willReturn(okJson(response)));
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 1024))) {
      assertThat(
              client(transport)
                  .propose(
                      request(GuidedModelRequest.Kind.SOURCE_PLAN, projection(), 1),
                      budget(Duration.ofSeconds(5)))
                  .code())
          .isEqualTo(GuidedModelResponse.Code.TOO_LARGE);
    }
  }

  @Test
  void cancellationStopsSocketThenReleasesSharedCapacity() throws Exception {
    var request = request(GuidedModelRequest.Kind.VERIFY_STEP, projection(), 1);
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson(provider(answer(request).toString())).withFixedDelay(10000)));
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 65536))) {
      var client = client(transport);
      var budget = budget(Duration.ofSeconds(20));
      var running = CompletableFuture.supplyAsync(() -> client.propose(request, budget));
      awaitSend();
      assertThat(client.propose(request, budget(Duration.ofSeconds(1))).code())
          .isEqualTo(GuidedModelResponse.Code.BUSY);
      budget.cancel();
      assertThat(running.get(2, TimeUnit.SECONDS).code())
          .isEqualTo(GuidedModelResponse.Code.TIMEOUT);
      server.resetAll();
      server.stubFor(
          post(urlPathMatching(".*generateContent"))
              .willReturn(okJson(provider(answer(request).toString()))));
      assertThat(client.propose(request, budget(Duration.ofSeconds(5))).code())
          .isEqualTo(GuidedModelResponse.Code.OK);
      server.verify(1, postRequestedFor(urlPathMatching(".*generateContent")));
    }
  }

  @Test
  void remainingDeadlineStopsOneAttemptAndExpiredBudgetDoesNotSend() throws Exception {
    var request = request(GuidedModelRequest.Kind.VERIFY_STEP, projection(), 1);
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson(provider(answer(request).toString())).withFixedDelay(5000)));
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 65536))) {
      long start = System.nanoTime();
      assertThat(client(transport).propose(request, budget(Duration.ofMillis(150))).code())
          .isEqualTo(GuidedModelResponse.Code.TIMEOUT);
      assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(2));
      server.verify(1, postRequestedFor(urlPathMatching(".*generateContent")));
      var cancelled = budget(Duration.ofSeconds(5));
      cancelled.cancel();
      assertThat(client(transport).propose(request, cancelled).code())
          .isEqualTo(GuidedModelResponse.Code.TIMEOUT);
      server.verify(1, postRequestedFor(urlPathMatching(".*generateContent")));
    }
  }

  @Test
  void disabledProviderDoesNotPretendToReturnFixturePlan() {
    var disabled = new StudioGatewayConfig().disabledGuidedLlmGatewayClient();
    assertThat(
            disabled
                .propose(
                    request(GuidedModelRequest.Kind.SOURCE_PLAN, projection(), 1),
                    budget(Duration.ofSeconds(5)))
                .code())
        .isEqualTo(GuidedModelResponse.Code.DISABLED);
    assertThat(server.getAllServeEvents()).isEmpty();
  }

  @Test
  void boundedRealCredentialRefreshCancelsBeforeModelAndRecovers() throws Exception {
    var request = request(GuidedModelRequest.Kind.VERIFY_STEP, projection(), 1);
    var keys = java.security.KeyPairGenerator.getInstance("RSA");
    keys.initialize(2048);
    String pem =
        "-----BEGIN PRIVATE KEY-----\n"
            + java.util.Base64.getMimeEncoder(64, new byte[] {'\n'})
                .encodeToString(keys.generateKeyPair().getPrivate().getEncoded())
            + "\n-----END PRIVATE KEY-----\n";
    ObjectNode account =
        JSON.createObjectNode()
            .put("type", "service_account")
            .put("project_id", "synthetic-project")
            .put("client_email", "synthetic@example.invalid")
            .put("client_id", "synthetic-client")
            .put("private_key_id", "synthetic-key")
            .put("private_key", pem)
            .put("token_uri", server.baseUrl() + "/token");
    var file = temporary.resolve("synthetic-account.json");
    java.nio.file.Files.writeString(file, account.toString());
    var base = properties(server.baseUrl(), 65536, 65536);
    var configured =
        new StudioGatewayProperties(
            base.endpoint(),
            base.project(),
            base.location(),
            base.model(),
            new StudioGatewayProperties.Credentials("service-account-file", file.toString()),
            base.requestTimeout(),
            base.maxConcurrency(),
            base.maxInputBytes(),
            base.maxOutputBytes(),
            base.maxOutputTokens(),
            base.thinkingLevel(),
            base.providerFeatures());
    String tokenResponse =
        "{\"access_token\":\"synthetic-service-token\",\"expires_in\":3600,\"token_type\":\"Bearer\"}";
    server.stubFor(
        post(urlPathMatching("/token")).willReturn(okJson(tokenResponse).withFixedDelay(10000)));
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson(provider(answer(request).toString()))));
    try (var transport = new GenAiGatewayTransport(configured)) {
      var budget = budget(Duration.ofSeconds(20));
      var first = CompletableFuture.supplyAsync(() -> client(transport).propose(request, budget));
      awaitSend();
      budget.cancel();
      assertThat(first.get(2, TimeUnit.SECONDS).code()).isEqualTo(GuidedModelResponse.Code.TIMEOUT);
      server.verify(1, postRequestedFor(urlPathMatching("/token")));
      server.verify(0, postRequestedFor(urlPathMatching(".*generateContent")));
      server.resetAll();
      server.stubFor(post(urlPathMatching("/token")).willReturn(okJson(tokenResponse)));
      server.stubFor(
          post(urlPathMatching(".*generateContent"))
              .willReturn(okJson(provider(answer(request).toString()))));
      assertThat(client(transport).propose(request, budget(Duration.ofSeconds(5))).code())
          .isEqualTo(GuidedModelResponse.Code.OK);
      assertThat(client(transport).propose(request, budget(Duration.ofSeconds(5))).code())
          .isEqualTo(GuidedModelResponse.Code.OK);
      server.verify(1, postRequestedFor(urlPathMatching("/token")));
      server.verify(2, postRequestedFor(urlPathMatching(".*generateContent")));
    }
  }

  private void awaitSend() throws InterruptedException {
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
    while (server.getAllServeEvents().isEmpty() && System.nanoTime() < deadline) {
      Thread.sleep(5);
    }
    assertThat(server.getAllServeEvents()).hasSize(1);
  }

  @Test
  void reportsThoughtAndToolTokensWithoutDoubleCountingCachedPromptOrReadingThoughtText()
      throws Exception {
    var request = classifiedRequest(GuidedModelRequest.Kind.SOURCE_PLAN, 1);
    ObjectNode envelope = (ObjectNode) JSON.readTree(provider(answer(request).toString()));
    envelope
        .withObject("/usageMetadata")
        .put("toolUsePromptTokenCount", 3)
        .put("thoughtsTokenCount", 40)
        .put("cachedContentTokenCount", 5)
        .put("totalTokenCount", 62);
    envelope
        .withArray("/candidates/0/content/parts")
        .insert(
            0, JSON.createObjectNode().put("thought", true).put("text", "THOUGHT_CONTENT_CANARY"));
    server.stubFor(
        post(urlPathMatching(".*generateContent")).willReturn(okJson(envelope.toString())));
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 65536))) {
      var response = client(transport).propose(request, budget(Duration.ofSeconds(5)));
      assertThat(response.code()).isEqualTo(GuidedModelResponse.Code.OK);
      assertThat(response.inputTokens()).isEqualTo(15);
      assertThat(response.outputTokens()).isEqualTo(47);
      assertThat(response.proposal().toString()).doesNotContain("THOUGHT_CONTENT_CANARY");
    }
  }

  @Test
  void missingPrimaryUsageStaysUnknownInsteadOfBecomingZero() throws Exception {
    var request = classifiedRequest(GuidedModelRequest.Kind.SOURCE_PLAN, 1);
    ObjectNode envelope = (ObjectNode) JSON.readTree(provider(answer(request).toString()));
    envelope
        .putObject("usageMetadata")
        .put("thoughtsTokenCount", 7)
        .put("toolUsePromptTokenCount", 3);
    server.stubFor(
        post(urlPathMatching(".*generateContent")).willReturn(okJson(envelope.toString())));
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 65536))) {
      var response = client(transport).propose(request, budget(Duration.ofSeconds(5)));
      assertThat(response.code()).isEqualTo(GuidedModelResponse.Code.OK);
      assertThat(response.inputTokens()).isNull();
      assertThat(response.outputTokens()).isNull();
    }
  }

  @Test
  void negativeOverflowAndInconsistentUsageCannotBecomeSuccessfulKnownCounts() throws Exception {
    var request = classifiedRequest(GuidedModelRequest.Kind.SOURCE_PLAN, 1);
    for (ObjectNode invalid :
        java.util.List.of(
            JSON.createObjectNode().put("promptTokenCount", -1).put("candidatesTokenCount", 7),
            JSON.createObjectNode()
                .put("promptTokenCount", 12)
                .put("candidatesTokenCount", Integer.MAX_VALUE)
                .put("thoughtsTokenCount", 1),
            JSON.createObjectNode()
                .put("promptTokenCount", Integer.MAX_VALUE)
                .put("toolUsePromptTokenCount", 1)
                .put("candidatesTokenCount", 7),
            JSON.createObjectNode()
                .put("promptTokenCount", 12)
                .put("candidatesTokenCount", 7)
                .put("thoughtsTokenCount", -1),
            JSON.createObjectNode()
                .put("promptTokenCount", 12)
                .put("candidatesTokenCount", 7)
                .put("totalTokenCount", 1))) {
      server.resetAll();
      ObjectNode envelope = (ObjectNode) JSON.readTree(provider(answer(request).toString()));
      envelope.set("usageMetadata", invalid);
      server.stubFor(
          post(urlPathMatching(".*generateContent")).willReturn(okJson(envelope.toString())));
      try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 65536))) {
        var response = client(transport).propose(request, budget(Duration.ofSeconds(5)));
        assertThat(response.code()).isEqualTo(GuidedModelResponse.Code.TRANSPORT);
        assertThat(response.inputTokens()).isNull();
        assertThat(response.outputTokens()).isNull();
      }
      server.verify(1, postRequestedFor(urlPathMatching(".*generateContent")));
    }
  }

  private static void assertLocalSchemaReferences(
      com.fasterxml.jackson.databind.JsonNode node, com.fasterxml.jackson.databind.JsonNode root) {
    if (node.has("$ref")) {
      String ref = node.path("$ref").asText();
      assertThat(ref).startsWith("#/$defs/");
      assertThat(root.at(ref.substring(1)).isMissingNode()).isFalse();
    }
    node.elements().forEachRemaining(child -> assertLocalSchemaReferences(child, root));
  }
}
