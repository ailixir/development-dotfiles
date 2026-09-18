package com.citi.put.checks.studio.dispatch;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.compile.validator.StudioRunnerProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.github.tomakehurst.wiremock.http.Fault;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Story 10.7 AC-15 — the real dispatch client against a real socket.
 *
 * <p>Two behaviours are the criterion and both are properties of the client rather than of the
 * dispatcher that calls it: <b>automatic retries are disabled</b> and <b>redirects are not
 * followed</b>. A followed redirect is a second dispatch wearing a different name, and neither the
 * dispatcher nor the ledger would ever see that two requests left the process — which is why the
 * count is asserted here, at the only place that can observe it.
 */
class HttpRunnerDispatchClientTest {

  private static WireMockServer wireMock;
  private HttpRunnerDispatchClient client;

  @BeforeAll
  static void startServer() {
    wireMock = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    wireMock.start();
  }

  @AfterAll
  static void stopServer() {
    wireMock.stop();
  }

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    client =
        new HttpRunnerDispatchClient(
            new ObjectMapper(),
            new StudioExecutionProperties(
                true, null, null, null, Duration.ofMillis(500), null, null, null, null, null, null),
            new StudioRunnerProperties(
                "http://localhost:" + wireMock.port(),
                "test-runner-token",
                Duration.ofSeconds(5),
                Duration.ofSeconds(2)));
  }

  @Test
  void redirectsAreNotFollowed() {
    assertThat(client.redirectPolicy()).isEqualTo(HttpClient.Redirect.NEVER);
  }

  @Test
  void exactlyOneRequestLeavesTheProcessForEachOfTheFourAmbiguousCases() {
    assertExactlyOneRequest(
        "timeout",
        aResponse().withStatus(202).withFixedDelay(3000),
        DispatchOutcome.Kind.AMBIGUOUS);
    assertExactlyOneRequest(
        "connection loss",
        aResponse().withFault(Fault.CONNECTION_RESET_BY_PEER),
        DispatchOutcome.Kind.AMBIGUOUS);
    assertExactlyOneRequest("5xx", aResponse().withStatus(503), DispatchOutcome.Kind.AMBIGUOUS);
    assertExactlyOneRequest(
        "redirect",
        aResponse().withStatus(302).withHeader("Location", "/v1/runs-elsewhere"),
        DispatchOutcome.Kind.AMBIGUOUS);
  }

  @Test
  void a202IsTheAdmittedPathAnd429IsDefiniteNonAcceptance() {
    assertExactlyOneRequest("202", aResponse().withStatus(202), DispatchOutcome.Kind.ACCEPTED);
    assertExactlyOneRequest(
        "429",
        aResponse().withStatus(429).withHeader("Retry-After", "3"),
        DispatchOutcome.Kind.DEFINITE_REFUSAL);
  }

  /**
   * DEF-05: {@code POST /v1/runs} declares {@code serviceIdentity}, so the dispatch presents the
   * same bearer the {@code /v1/validate} client presents. Asserted on the request the socket
   * actually received, not on what the client meant to send.
   */
  @Test
  void theDispatchPresentsTheRunnerServiceIdentityAsABearer() {
    wireMock.resetAll();
    wireMock.stubFor(post(urlPathEqualTo("/v1/runs")).willReturn(aResponse().withStatus(202)));

    assertThat(client.send(job()).kind()).isEqualTo(DispatchOutcome.Kind.ACCEPTED);

    var requests = wireMock.findAll(postRequestedFor(urlPathEqualTo("/v1/runs")));
    assertThat(requests).hasSize(1);
    assertThat(requests.get(0).getHeaders().getHeader("Authorization").values())
        .containsExactly("Bearer test-runner-token");
  }

  /**
   * Story 10.35 AC-5 (i): no runner base URL. The refusal is terminal and names the missing key,
   * and nothing is sent — there is no address to send to, and the classification must not fall
   * through to the {@code IOException} branch's {@code AMBIGUOUS}.
   */
  @Test
  void anUnconfiguredRunnerIsATerminalNamedRefusalAndSendsNothing() {
    wireMock.resetAll();
    for (String baseUrl : java.util.Arrays.asList(null, "", "   ")) {
      DispatchOutcome outcome = clientFor(baseUrl, "test-runner-token").send(job());

      assertThat(outcome.kind())
          .as("base URL %s", baseUrl)
          .isEqualTo(DispatchOutcome.Kind.DEFINITE_REFUSAL);
      assertThat(outcome.retryable()).as("base URL %s", baseUrl).isFalse();
      assertThat(outcome.detail())
          .as("base URL %s", baseUrl)
          .isEqualTo(HttpRunnerDispatchClient.RUNNER_NOT_CONFIGURED);
    }
    assertThat(wireMock.getAllServeEvents()).isEmpty();
  }

  /**
   * Story 10.35 AC-5 (ii): a configured base URL but no identity. Two targets: the live stub, where
   * "sent nothing" is the serve-event count, and a closed local port, where a real connection
   * attempt would have produced {@code AMBIGUOUS "connection loss"} instead of this refusal.
   */
  @Test
  void aMissingServiceIdentityIsATerminalNamedRefusalAndSendsNothing() throws Exception {
    wireMock.resetAll();
    String closedPort;
    try (java.net.ServerSocket socket = new java.net.ServerSocket(0)) {
      closedPort = "http://localhost:" + socket.getLocalPort();
    }
    for (String baseUrl : List.of(wireMock.baseUrl(), closedPort)) {
      for (String token : java.util.Arrays.asList(null, "", "  ")) {
        DispatchOutcome outcome = clientFor(baseUrl, token).send(job());

        assertThat(outcome.kind())
            .as("%s with token '%s'", baseUrl, token)
            .isEqualTo(DispatchOutcome.Kind.DEFINITE_REFUSAL);
        assertThat(outcome.retryable()).as("%s with token '%s'", baseUrl, token).isFalse();
        assertThat(outcome.detail())
            .as("%s with token '%s'", baseUrl, token)
            .isEqualTo(HttpRunnerDispatchClient.SERVICE_IDENTITY_NOT_CONFIGURED);
      }
    }
    assertThat(wireMock.getAllServeEvents()).isEmpty();
  }

  @Test
  void theClassificationTableHasNoFourthOutcome() {
    assertThat(HttpRunnerDispatchClient.classify(202, null).kind())
        .isEqualTo(DispatchOutcome.Kind.ACCEPTED);
    assertThat(HttpRunnerDispatchClient.classify(429, "3").kind())
        .isEqualTo(DispatchOutcome.Kind.DEFINITE_REFUSAL);
    assertThat(HttpRunnerDispatchClient.classify(429, "3").retryAfter())
        .isEqualTo(Duration.ofSeconds(3));
    for (int status : List.of(300, 301, 302, 307, 308, 500, 502, 503, 504)) {
      assertThat(HttpRunnerDispatchClient.classify(status, null).kind())
          .as("status %s", status)
          .isEqualTo(DispatchOutcome.Kind.AMBIGUOUS);
    }
    for (int status : List.of(400, 401, 403, 404, 409, 413, 422)) {
      DispatchOutcome outcome = HttpRunnerDispatchClient.classify(status, null);
      assertThat(outcome.kind())
          .as("status %s", status)
          .isEqualTo(DispatchOutcome.Kind.DEFINITE_REFUSAL);
      assertThat(outcome.retryable()).as("status %s is not retryable", status).isFalse();
    }
  }

  private void assertExactlyOneRequest(
      String label,
      com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder response,
      DispatchOutcome.Kind expected) {
    wireMock.resetAll();
    wireMock.stubFor(post(urlPathEqualTo("/v1/runs")).willReturn(response));

    DispatchOutcome outcome = client.send(job());

    assertThat(outcome.kind()).as("%s classifies as %s", label, expected).isEqualTo(expected);
    assertThat(
            wireMock
                .findAll(
                    com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor(
                        urlPathEqualTo("/v1/runs")))
                .size())
        .as("exactly one request left the process for '%s'", label)
        .isEqualTo(1);
  }

  private static HttpRunnerDispatchClient clientFor(String baseUrl, String token) {
    return new HttpRunnerDispatchClient(
        new ObjectMapper(),
        new StudioExecutionProperties(
            true, null, null, null, Duration.ofMillis(500), null, null, null, null, null, null),
        new StudioRunnerProperties(baseUrl, token, Duration.ofSeconds(5), Duration.ofSeconds(2)));
  }

  private static RunJob job() {
    return RunJobFixtures.conformingJob();
  }
}
