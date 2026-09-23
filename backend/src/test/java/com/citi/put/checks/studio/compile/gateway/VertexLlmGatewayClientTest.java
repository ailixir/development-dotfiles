package com.citi.put.checks.studio.compile.gateway;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.google.genai.Client;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Story 10.5 AC-12: the gateway client against a WireMock stub of the Vertex REST surface.
 *
 * <p>Every case here is a failure mode the compile pipeline must survive without losing a draft.
 */
class VertexLlmGatewayClientTest {

  private static final String GENERATE_CONTENT_PATH = ".*generateContent";

  private static WireMockServer wireMock;

  private final List<Client> openClients = new ArrayList<>();

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
  void resetWireMock() {
    wireMock.resetAll();
  }

  @AfterEach
  void closeClients() {
    openClients.forEach(Client::close);
    openClients.clear();
  }

  @Test
  void structuredJsonResponseYieldsArtifact() throws Exception {
    stubOk(GatewayTestSupport.VALID_ARTIFACT);

    CompileResponse response = client(properties()).propose(GatewayTestSupport.request());

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.OK);
    assertThat(response.errorCode()).isNull();
    assertThat(response.artifact()).isPresent();
    assertThat(response.artifactJson()).contains("\"stepIndex\":0");
    assertThat(response.retries()).isZero();
    assertThat(response.inputBytes()).isPositive();
    assertThat(response.outputBytes()).isPositive();
    assertThat(wireMock.getAllServeEvents()).hasSize(1);
    assertThat(wireMock.getAllServeEvents().get(0).getRequest().getBodyAsString())
        .doesNotContain("temperature", "topP", "topK", "candidateCount");
  }

  @Test
  void textResponseWithEmbeddedJsonYieldsArtifact() throws Exception {
    stubOk(
        "Here is the artifact you asked for:\n```json\n"
            + GatewayTestSupport.VALID_ARTIFACT
            + "\n```\nHope that helps.");

    CompileResponse response = client(properties()).propose(GatewayTestSupport.request());

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.OK);
    assertThat(response.artifactJson()).contains("\"version\":1");
  }

  @Test
  void malformedJsonYieldsParseFailure() throws Exception {
    stubOk("{\"version\":1,\"steps\":[{\"stepIndex\":0,}]}");

    CompileResponse response = client(properties()).propose(GatewayTestSupport.request());

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.PARSE_FAILURE);
    assertThat(response.errorCode()).isEqualTo(GatewayErrorCode.GATEWAY_PARSE_FAILURE);
    assertThat(response.failureReason()).startsWith("malformed JSON");
    assertThat(response.artifact()).isEmpty();
  }

  @Test
  void schemaInvalidJsonYieldsParseFailureNamingTheSchemaPath() throws Exception {
    stubOk("{\"version\":1,\"steps\":[{\"stepIndex\":0,\"originalText\":\"x\"}]}");

    CompileResponse response = client(properties()).propose(GatewayTestSupport.request());

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.PARSE_FAILURE);
    assertThat(response.failureReason())
        .startsWith("schema violation at ")
        .contains("$.steps[0]")
        .contains("code");
  }

  @Test
  void oversizedResponseIsDiscarded() throws Exception {
    stubOk(GatewayTestSupport.VALID_ARTIFACT);
    StudioGatewayProperties properties =
        GatewayTestSupport.properties(endpoint(), Duration.ofSeconds(10), 4, 262144, 16, 2);

    CompileResponse response = client(properties).propose(GatewayTestSupport.request());

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.TOO_LARGE);
    assertThat(response.errorCode()).isEqualTo(GatewayErrorCode.GATEWAY_OUTPUT_TOO_LARGE);
    assertThat(response.artifact()).isEmpty();
    assertThat(response.outputBytes()).isGreaterThan(16);
  }

  @Test
  void oversizedInputIsRejectedBeforeAnyNetworkCall() throws Exception {
    stubOk(GatewayTestSupport.VALID_ARTIFACT);
    StudioGatewayProperties properties =
        GatewayTestSupport.properties(endpoint(), Duration.ofSeconds(10), 4, 32, 262144, 2);

    CompileResponse response = client(properties).propose(GatewayTestSupport.request());

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.TOO_LARGE);
    assertThat(response.errorCode()).isEqualTo(GatewayErrorCode.COMPILE_INPUT_TOO_LARGE);
    assertThat(response.provenance()).isNull();
    assertThat(wireMock.getAllServeEvents()).isEmpty();
  }

  @Test
  void timeoutIsNotRetried() throws Exception {
    wireMock.stubFor(
        post(urlPathMatching(GENERATE_CONTENT_PATH))
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("Content-Type", "application/json")
                    .withFixedDelay(3000)
                    .withBody(
                        GatewayTestSupport.generateContentBody(
                            GatewayTestSupport.VALID_ARTIFACT))));
    StudioGatewayProperties properties =
        GatewayTestSupport.properties(endpoint(), Duration.ofMillis(400), 4, 262144, 262144, 2);

    CompileResponse response = client(properties).propose(GatewayTestSupport.request());

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.TIMEOUT);
    assertThat(response.errorCode()).isEqualTo(GatewayErrorCode.GATEWAY_TIMEOUT);
    assertThat(response.retries()).isZero();
    assertThat(wireMock.getAllServeEvents()).hasSize(1);
  }

  @Test
  void twoUnavailableResponsesThenSuccessReportsTwoRetries() throws Exception {
    String scenario = "unavailable-twice";
    wireMock.stubFor(
        post(urlPathMatching(GENERATE_CONTENT_PATH))
            .inScenario(scenario)
            .whenScenarioStateIs(com.github.tomakehurst.wiremock.stubbing.Scenario.STARTED)
            .willReturn(aResponse().withStatus(503))
            .willSetStateTo("second"));
    wireMock.stubFor(
        post(urlPathMatching(GENERATE_CONTENT_PATH))
            .inScenario(scenario)
            .whenScenarioStateIs("second")
            .willReturn(aResponse().withStatus(503))
            .willSetStateTo("third"));
    wireMock.stubFor(
        post(urlPathMatching(GENERATE_CONTENT_PATH))
            .inScenario(scenario)
            .whenScenarioStateIs("third")
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("Content-Type", "application/json")
                    .withBody(
                        GatewayTestSupport.generateContentBody(
                            GatewayTestSupport.VALID_ARTIFACT))));

    CompileResponse response = client(properties()).propose(GatewayTestSupport.request());

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.OK);
    assertThat(response.retries()).isEqualTo(2);
    assertThat(wireMock.getAllServeEvents()).hasSize(3);
  }

  @Test
  void threeUnavailableResponsesExhaustTheBoundedRetry() throws Exception {
    wireMock.stubFor(
        post(urlPathMatching(GENERATE_CONTENT_PATH)).willReturn(aResponse().withStatus(503)));

    CompileResponse response = client(properties()).propose(GatewayTestSupport.request());

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.TRANSPORT);
    assertThat(response.errorCode()).isEqualTo(GatewayErrorCode.GATEWAY_TRANSPORT);
    assertThat(response.retries()).isEqualTo(2);
    assertThat(wireMock.getAllServeEvents()).hasSize(3);
  }

  @Test
  void saturatedConcurrencyFailsFast() throws Exception {
    wireMock.stubFor(
        post(urlPathMatching(GENERATE_CONTENT_PATH))
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("Content-Type", "application/json")
                    .withFixedDelay(1500)
                    .withBody(
                        GatewayTestSupport.generateContentBody(
                            GatewayTestSupport.VALID_ARTIFACT))));
    StudioGatewayProperties properties =
        GatewayTestSupport.properties(endpoint(), Duration.ofSeconds(10), 1, 262144, 262144, 0);
    LlmGatewayClient client = client(properties);

    CountDownLatch started = new CountDownLatch(1);
    AtomicReference<CompileResponse> background = new AtomicReference<>();
    Thread holder =
        new Thread(
            () -> {
              started.countDown();
              background.set(client.propose(GatewayTestSupport.request()));
            });
    holder.start();
    assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
    awaitFirstRequestDispatched();

    CompileResponse rejected = client.propose(GatewayTestSupport.request());

    assertThat(rejected.outcome()).isEqualTo(GatewayOutcome.BUSY);
    assertThat(rejected.errorCode()).isEqualTo(GatewayErrorCode.GATEWAY_BUSY);
    holder.join(TimeUnit.SECONDS.toMillis(20));
    assertThat(background.get().outcome()).isEqualTo(GatewayOutcome.OK);
  }

  @Test
  void provenanceRecordsWhatWasSentAndReturned() throws Exception {
    stubOk(GatewayTestSupport.VALID_ARTIFACT);

    CompileResponse response = client(properties()).propose(GatewayTestSupport.request());

    GatewayProvenance provenance = response.provenance();
    assertThat(provenance.model()).isEqualTo(GatewayTestSupport.MODEL);
    assertThat(provenance.modelVersion()).isEqualTo("stub-model-001");
    assertThat(provenance.promptVersion()).isEqualTo("prompt-2026.09.0");
    assertThat(provenance.structuredOutput()).isTrue();
    assertThat(provenance.temperature()).as("legacy marker: temperature was not sent").isZero();
    assertThat(provenance.sdkVersion()).isNotBlank();
  }

  @Test
  void responseWithoutUsableCandidateYieldsParseFailure() throws Exception {
    wireMock.stubFor(
        post(urlPathMatching(GENERATE_CONTENT_PATH))
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("Content-Type", "application/json")
                    .withBody("{\"candidates\":[],\"modelVersion\":\"stub-model-001\"}")));

    CompileResponse response = client(properties()).propose(GatewayTestSupport.request());

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.PARSE_FAILURE);
    assertThat(response.failureReason()).doesNotContain(GatewayTestSupport.SECRET_PLACEHOLDER);
  }

  private void awaitFirstRequestDispatched() throws InterruptedException {
    long deadline = System.currentTimeMillis() + TimeUnit.SECONDS.toMillis(5);
    while (System.currentTimeMillis() < deadline) {
      if (!wireMock.getAllServeEvents().isEmpty()) {
        return;
      }
      Thread.sleep(25);
    }
    throw new AssertionError("the background call never reached the stub");
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

  private StudioGatewayProperties properties() {
    return GatewayTestSupport.properties(endpoint());
  }

  private static String endpoint() {
    return "http://localhost:" + wireMock.port();
  }

  private LlmGatewayClient client(StudioGatewayProperties properties) throws Exception {
    Client vertexAi = GatewayTestSupport.vertexAi(properties);
    openClients.add(vertexAi);
    return new VertexLlmGatewayClient(
        properties, vertexAi, GatewayTestSupport.parser(), new GatewayAuditLogger());
  }
}
