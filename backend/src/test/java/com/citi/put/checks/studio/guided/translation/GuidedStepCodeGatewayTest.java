package com.citi.put.checks.studio.guided.translation;

import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.gateway.GenAiGatewayTransport;
import com.citi.put.checks.studio.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** A STEP_CODE call on the wire, against a stub of the provider and recorded replies. */
class GuidedStepCodeGatewayTest {
  private static final ObjectMapper JSON = new ObjectMapper();
  private final WireMockServer server =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  GuidedStepCodeGatewayTest() {
    server.start();
  }

  @AfterEach
  void stop() {
    server.stop();
  }

  private static String recorded(String name) throws Exception {
    try (var in =
        GuidedStepCodeGatewayTest.class.getResourceAsStream("/studio/guided/stepcode/" + name)) {
      return new String(in.readAllBytes(), StandardCharsets.UTF_8).strip();
    }
  }

  private static String provider(String text) throws Exception {
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

  private static StudioGatewayProperties properties(
      String endpoint, int inputBytes, int outputBytes) {
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

  private GuidedModelResponse send(GuidedModelRequest request, String reply) throws Exception {
    server.resetAll();
    server.stubFor(post(urlPathMatching(".*generateContent")).willReturn(okJson(provider(reply))));
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 262144, 65536))) {
      return new GenAiGuidedLlmGatewayClient(
              transport, new GuidedResponseParser(new GuidedContracts()))
          .propose(
              request,
              new GuidedCallBudget(Instant.now().plus(Duration.ofSeconds(5)), Clock.systemUTC()));
    }
  }

  @Test
  void aStepCodeRequestIsSentOnResponseJsonSchemaWithTheSystemTextAndLowThinking()
      throws Exception {
    GuidedModelRequest request =
        GuidedStepCodePromptTest.stepCodeRequest(
            "- button \"Save\" [e1]", 0, List.of("script"), null, GuidedStepCodePromptTest.CAP);
    GuidedModelResponse response = send(request, recorded("code-reply.json"));
    assertThat(response.code()).isEqualTo(GuidedModelResponse.Code.OK);
    assertThat(response.proposal()).isEqualTo(JSON.readTree(recorded("code-reply.json")));

    JsonNode body = JSON.readTree(server.getAllServeEvents().getFirst().getRequest().getBody());
    JsonNode config = body.path("generationConfig");
    assertThat(config.path("responseMimeType").asText()).isEqualTo("application/json");
    assertThat(config.path("responseJsonSchema")).isEqualTo(request.responseSchema());
    assertThat(config.has("responseSchema")).isFalse();
    assertThat(config.has("temperature")).isFalse();
    assertThat(config.path("thinkingConfig").path("thinkingLevel").asText()).isEqualTo("LOW");
    assertThat(body.at("/systemInstruction/parts/0/text").asText())
        .isEqualTo(request.outputContract())
        .contains("locator.evaluate(");
    JsonNode sent = JSON.readTree(body.at("/contents/0/parts/0/text").asText());
    assertThat(sent.path("kind").asText()).isEqualTo("STEP_CODE");
    assertThat(sent.path("context")).isEqualTo(request.projection().document());
  }

  @Test
  void aRecordedClarificationIsOkAndAMalformedReplyIsInvalid() throws Exception {
    GuidedModelRequest request =
        GuidedStepCodePromptTest.stepCodeRequest(
            "- button \"Save\" [e1]", 0, List.of(), null, GuidedStepCodePromptTest.CAP);
    GuidedModelResponse clarification = send(request, recorded("clarification-reply.json"));
    assertThat(clarification.code()).isEqualTo(GuidedModelResponse.Code.OK);
    assertThat(clarification.proposal().at("/question/reason").asText())
        .isEqualTo("AMBIGUOUS_TARGET");
    GuidedModelResponse malformed = send(request, recorded("malformed-reply.json"));
    assertThat(malformed.code()).isEqualTo(GuidedModelResponse.Code.INVALID_RESPONSE);
  }
}
