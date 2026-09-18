package com.citi.put.checks.studio.compile.gateway;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.google.genai.Client;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class VertexLlmGatewayClientTest {

  private static WireMockServer server;

  @BeforeAll
  static void start() {
    server = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    server.start();
  }

  @AfterAll
  static void stop() {
    server.stop();
  }

  @Test
  void compilesStructuredArtifactThroughCurrentVertexSdk() throws Exception {
    String artifact =
        "{\"version\":1,\"steps\":[{\"stepIndex\":0,\"originalText\":\"Go to"
            + " https://example.com\",\"code\":\"await page.goto('https://example.com');\"}]}";
    String response =
        "{\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":"
            + jsonString(artifact)
            + "}]},\"finishReason\":\"STOP\"}],\"modelVersion\":\"gemini-3.8-flash\"}";
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("Content-Type", "application/json")
                    .withBody(response)));

    StudioGatewayProperties properties = properties();
    try (Client client = VertexAiClientFactory.create(properties)) {
      CompileResponse result =
          new VertexLlmGatewayClient(
                  properties,
                  client,
                  new GatewayResponseParser(new ClassPathResource("studio/artifact.schema.json")),
                  new GatewayAuditLogger())
              .propose(request());

      assertThat(result.outcome()).isEqualTo(GatewayOutcome.OK);
      assertThat(result.artifactJson()).contains("await page.goto");
      assertThat(result.provenance().model()).isEqualTo("gemini-3.8-flash");
      assertThat(result.provenance().sdkVersion()).isEqualTo("1.72.0");
      assertThat(server.getAllServeEvents())
          .singleElement()
          .satisfies(
              event ->
                  assertThat(event.getRequest().getHeader("x-goog-api-key"))
                      .isEqualTo("test-api-key"));
    }
  }

  private static StudioGatewayProperties properties() {
    return new StudioGatewayProperties(
        true,
        "http://localhost:" + server.port(),
        "",
        "us-central1",
        "gemini-3.8-flash",
        new StudioGatewayProperties.Credentials(
            StudioGatewayProperties.MODE_API_KEY, "", "test-api-key"),
        Duration.ofSeconds(5),
        1,
        8192,
        8192,
        true,
        0,
        new StudioGatewayProperties.TransportRetry(0, Duration.ofMillis(1), 2, 0),
        "classpath:studio/artifact.schema.json");
  }

  private static CompileRequest request() {
    return new CompileRequest(
        UUID.randomUUID(),
        "178672",
        "developer@example.com",
        UUID.randomUUID().toString(),
        1,
        List.of("Go to https://example.com"),
        "Playwright TypeScript",
        "v1",
        "Return the schema",
        "prompt-v1");
  }

  private static String jsonString(String value) throws Exception {
    return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(value);
  }
}
