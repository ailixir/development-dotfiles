package com.citi.put.checks.studio.dispatch;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionProperties;
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
                "http://localhost:" + wireMock.port(), "test-runner-token", Duration.ofSeconds(2)));
  }

  @Test
  void ownedBytePublisherAndSecretArraysAreErasedAcrossAcceptedRefusedAndAmbiguousResponses() {
    for (int status : List.of(202, 429, 403, 503)) {
      wireMock.resetAll();
      wireMock.stubFor(post(urlPathEqualTo("/v2/runs")).willReturn(aResponse().withStatus(status)));
      var bytes = new java.util.concurrent.atomic.AtomicReference<byte[]>();
      client.observeRequestBytes(
          value -> {
            assertThat(new String(value, java.nio.charset.StandardCharsets.UTF_8))
                .contains("fixture-password");
            bytes.set(value);
          });
      var job = RunJobFixtures.conformingJob();
      client.send(job);
      assertThat(bytes.get()).as("owned body after status %s", status).containsOnly((byte) 0);
      assertThat(job.resolvedSecrets().get("LOGIN_PW").matches("fixture-password")).isFalse();
      assertThat(job.toString()).doesNotContain("fixture-password");
      assertThat(wireMock.getAllServeEvents()).hasSize(1);
    }
  }

  @Test
  void dispatchCarriesTheRunnerIdentityAndMissingIdentitySendsNothing() {
    wireMock.stubFor(
        post(urlPathEqualTo("/v2/runs"))
            .withHeader(
                "Authorization",
                com.github.tomakehurst.wiremock.client.WireMock.equalTo("Bearer test-runner-token"))
            .willReturn(aResponse().withStatus(202)));
    assertThat(client.send(RunJobFixtures.conformingJob()).kind())
        .isEqualTo(DispatchOutcome.Kind.ACCEPTED);
    wireMock.resetRequests();
    var missingIdentity =
        new HttpRunnerDispatchClient(
            new ObjectMapper(),
            new StudioExecutionProperties(
                true, null, null, null, Duration.ofSeconds(2), null, null, null, null, null, null),
            new StudioRunnerProperties(wireMock.baseUrl(), "", Duration.ofSeconds(2)));
    assertThat(missingIdentity.send(RunJobFixtures.conformingJob()).kind())
        .isEqualTo(DispatchOutcome.Kind.DEFINITE_REFUSAL);
    assertThat(wireMock.getAllServeEvents()).isEmpty();
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
        aResponse().withStatus(302).withHeader("Location", "/v2/runs-elsewhere"),
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
   * DEF-05: {@code POST /v2/runs} declares {@code serviceIdentity}, so the dispatch presents the
   * same bearer the observed validation client presents. Asserted on the request the socket
   * actually received, not on what the client meant to send.
   */
  @Test
  void theDispatchPresentsTheRunnerServiceIdentityAsABearer() {
    wireMock.resetAll();
    wireMock.stubFor(post(urlPathEqualTo("/v2/runs")).willReturn(aResponse().withStatus(202)));

    assertThat(client.send(job()).kind()).isEqualTo(DispatchOutcome.Kind.ACCEPTED);

    var requests = wireMock.findAll(postRequestedFor(urlPathEqualTo("/v2/runs")));
    assertThat(requests).hasSize(1);
    assertThat(requests.get(0).getHeaders().getHeader("Authorization").values())
        .containsExactly("Bearer test-runner-token");
  }

  /**
   * Studio v1 WP4: the cancel relay is {@code DELETE /v2/runs/{executionId}} with the same bearer
   * as the dispatch, sent exactly once, with no body.
   */
  @Test
  void theCancelRelayIsOneDeleteCarryingTheSameBearer() {
    wireMock.resetAll();
    java.util.UUID executionId = java.util.UUID.randomUUID();
    String path = "/v2/runs/" + executionId;
    wireMock.stubFor(
        com.github.tomakehurst.wiremock.client.WireMock.delete(urlPathEqualTo(path))
            .willReturn(aResponse().withStatus(202)));

    assertThat(client.cancel(executionId))
        .isEqualTo(RunnerDispatchClient.CancelOutcome.ACKNOWLEDGED);

    var requests =
        wireMock.findAll(
            com.github.tomakehurst.wiremock.client.WireMock.deleteRequestedFor(
                urlPathEqualTo(path)));
    assertThat(requests).hasSize(1);
    assertThat(requests.get(0).getHeaders().getHeader("Authorization").values())
        .containsExactly("Bearer test-runner-token");
    assertThat(requests.get(0).getBody()).isEmpty();
    assertThat(wireMock.getAllServeEvents()).as("nothing else left the process").hasSize(1);
  }

  @Test
  void theCancelClassificationSettlesOnlyOn202And409() {
    assertThat(HttpRunnerDispatchClient.classifyCancel(202))
        .isEqualTo(RunnerDispatchClient.CancelOutcome.ACKNOWLEDGED);
    assertThat(HttpRunnerDispatchClient.classifyCancel(409))
        .isEqualTo(RunnerDispatchClient.CancelOutcome.ALREADY_FINISHED);
    assertThat(HttpRunnerDispatchClient.classifyCancel(404))
        .isEqualTo(RunnerDispatchClient.CancelOutcome.NOT_FOUND);
    for (int status : List.of(200, 204, 301, 400, 401, 403, 429, 500, 503)) {
      assertThat(HttpRunnerDispatchClient.classifyCancel(status))
          .as("status %s", status)
          .isEqualTo(RunnerDispatchClient.CancelOutcome.FAILED);
    }
    assertThat(RunnerDispatchClient.CancelOutcome.ACKNOWLEDGED.settled()).isTrue();
    assertThat(RunnerDispatchClient.CancelOutcome.ALREADY_FINISHED.settled()).isTrue();
    assertThat(RunnerDispatchClient.CancelOutcome.NOT_FOUND.settled()).isFalse();
    assertThat(RunnerDispatchClient.CancelOutcome.FAILED.settled()).isFalse();
  }

  @Test
  void aCancelWithoutAServiceIdentitySendsNothing() {
    wireMock.resetAll();
    assertThat(clientFor(wireMock.baseUrl(), " ").cancel(java.util.UUID.randomUUID()))
        .isEqualTo(RunnerDispatchClient.CancelOutcome.FAILED);
    assertThat(wireMock.getAllServeEvents()).isEmpty();
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
  void immutableReferencePolicyIsSentWithoutAnyResolvedValueInIt() throws Exception {
    wireMock.stubFor(post(urlPathEqualTo("/v2/runs")).willReturn(aResponse().withStatus(202)));
    RunJob job = job();
    assertThat(client.send(job).kind()).isEqualTo(DispatchOutcome.Kind.ACCEPTED);
    String body =
        wireMock
            .findAll(
                com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor(
                    urlPathEqualTo("/v2/runs")))
            .get(0)
            .getBodyAsString();
    com.fasterxml.jackson.databind.JsonNode policy =
        new ObjectMapper().readTree(body).path("artifact").path("replayPolicy");
    assertThat(policy).isEqualTo(job.referencePolicy());
    assertThat(policy.path("schemaVersion").asInt()).isEqualTo(4);
    assertThat(policy.toString()).doesNotContain("fixture-password", "emea");
  }

  @Test
  void eachSecretsAllowedOriginsAreSentBesideButApartFromItsValue() throws Exception {
    wireMock.stubFor(post(urlPathEqualTo("/v2/runs")).willReturn(aResponse().withStatus(202)));

    assertThat(client.send(job()).kind()).isEqualTo(DispatchOutcome.Kind.ACCEPTED);
    com.fasterxml.jackson.databind.JsonNode body =
        new ObjectMapper()
            .readTree(
                wireMock
                    .findAll(
                        com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor(
                            urlPathEqualTo("/v2/runs")))
                    .get(0)
                    .getBodyAsString());
    assertThat(body.path("secretOrigins").path("LOGIN_PW").isArray()).isTrue();
    assertThat(body.path("secretOrigins").path("LOGIN_PW").get(0).asText())
        .isEqualTo(RunJobFixtures.SECRET_ORIGIN);
    assertThat(body.path("secretOrigins").toString()).doesNotContain("fixture-password");
  }

  @Test
  void aJobWithoutOriginsSendsAnEmptyMapWhichTheRunnerReadsAsBoundToNone() throws Exception {
    wireMock.stubFor(post(urlPathEqualTo("/v2/runs")).willReturn(aResponse().withStatus(202)));
    // A producer that knows nothing about origins.
    RunJob withoutOrigins =
        RunJobFixtures.observedJob(
            java.util.Map.of(),
            java.util.Map.of("LOGIN_PW", "fixture-password"),
            java.util.Map.of());
    assertThat(client.send(withoutOrigins).kind()).isEqualTo(DispatchOutcome.Kind.ACCEPTED);
    String body =
        wireMock
            .findAll(
                com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor(
                    urlPathEqualTo("/v2/runs")))
            .get(0)
            .getBodyAsString();
    com.fasterxml.jackson.databind.JsonNode origins =
        new ObjectMapper().readTree(body).path("secretOrigins");
    assertThat(origins.isObject()).isTrue();
    assertThat(origins.size()).isZero();
  }

  /** ADR-SC-005: one run family. A job without an observed binding never leaves the process. */
  @Test
  void aJobWithoutAnObservedBindingIsATerminalNamedRefusalAndSendsNothing() throws Exception {
    wireMock.resetAll();
    RunJob observed = job();
    RunJob notObserved =
        new RunJob(
            observed.executionId(),
            observed.attemptId(),
            observed.revisionId(),
            observed.artifactHash(),
            observed.artifact(),
            List.of(),
            observed.configuration(),
            observed.csi(),
            observed.references(),
            java.util.Map.of(),
            observed.resolvedSecrets(),
            observed.deadlines(),
            observed.videoKey(),
            observed.manifestKey());

    DispatchOutcome outcome = client.send(notObserved);

    assertThat(outcome.kind()).isEqualTo(DispatchOutcome.Kind.DEFINITE_REFUSAL);
    assertThat(outcome.retryable()).isFalse();
    assertThat(outcome.detail()).isEqualTo(HttpRunnerDispatchClient.NOT_OBSERVED);
    assertThat(notObserved.resolvedSecrets().get("LOGIN_PW").matches("fixture-password")).isFalse();
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
    wireMock.stubFor(post(urlPathEqualTo("/v2/runs")).willReturn(response));

    DispatchOutcome outcome = client.send(job());

    assertThat(outcome.kind()).as("%s classifies as %s", label, expected).isEqualTo(expected);
    assertThat(
            wireMock
                .findAll(
                    com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor(
                        urlPathEqualTo("/v2/runs")))
                .size())
        .as("exactly one request left the process for '%s'", label)
        .isEqualTo(1);
  }

  private static HttpRunnerDispatchClient clientFor(String baseUrl, String token) {
    return new HttpRunnerDispatchClient(
        new ObjectMapper(),
        new StudioExecutionProperties(
            true, null, null, null, Duration.ofMillis(500), null, null, null, null, null, null),
        new StudioRunnerProperties(baseUrl, token, Duration.ofSeconds(2)));
  }

  private static RunJob job() {
    return RunJobFixtures.conformingJob();
  }

  @Test
  void foldedValidationUsesItsOwnEndpointCredentialAndPerCallByteLimit() throws Exception {
    var contracts =
        org.mockito.Mockito.mock(com.citi.put.checks.studio.guided.session.GuidedContracts.class);
    var mapper = new ObjectMapper();
    var request =
        mapper
            .createObjectNode()
            .put("attemptId", "attempt")
            .put("claimId", "claim")
            .put("snapshotHash", "snapshot")
            .put("basisHash", "basis");
    request.putObject("requiredProfile");
    request.putObject("requiredBuild");
    var verdict = request.deepCopy();
    verdict.set("profile", request.path("requiredProfile"));
    verdict.set("build", request.path("requiredBuild"));
    org.mockito.Mockito.when(contracts.validateAndCanonical("v3/replay-validation", request))
        .thenReturn("{}");
    org.mockito.Mockito.when(contracts.parseWire(org.mockito.ArgumentMatchers.any(byte[].class)))
        .thenReturn(verdict);
    client.initializeOperations(
        StudioRunnerTls.unconfigured(),
        contracts,
        new org.springframework.mock.env.MockEnvironment());
    wireMock.stubFor(
        post(urlPathEqualTo("/v2/validate-observed"))
            .willReturn(aResponse().withStatus(200).withBody("{}")));
    var budget =
        new com.citi.put.checks.studio.guided.publication.PublicationBudget(
            java.time.Instant.now().plusSeconds(5), java.time.Clock.systemUTC());
    assertThat(client.validate(request, budget, 2, 500)).isEqualTo(verdict);
    wireMock.verify(
        1,
        postRequestedFor(urlPathEqualTo("/v2/validate-observed"))
            .withHeader(
                "Authorization",
                com.github.tomakehurst.wiremock.client.WireMock.equalTo(
                    "Bearer test-runner-token")));
    org.assertj.core.api.Assertions.assertThatThrownBy(
            () -> client.validate(request, budget, 1, 500))
        .hasMessage("BUDGET_EXCEEDED");
    wireMock.verify(1, postRequestedFor(urlPathEqualTo("/v2/validate-observed")));
  }

  @Test
  void absentRunnerOriginDoesNotBorrowDispatchBaseUrlForGuidedOperations() {
    var contracts = new com.citi.put.checks.studio.guided.session.GuidedContracts();
    client.initializeOperations(
        StudioRunnerTls.unconfigured(),
        contracts,
        new org.springframework.mock.env.MockEnvironment());
    org.assertj.core.api.Assertions.assertThatThrownBy(
            () ->
                client.send(
                    "context", new ObjectMapper().createObjectNode().put("sessionId", "session")))
        .isInstanceOfSatisfying(
            com.citi.put.checks.studio.guided.session.GuidedSessionException.class,
            failure -> {
              assertThat(failure.getMessage()).isEqualTo("RUNTIME_INCOMPATIBLE");
              assertThat(failure.status()).isEqualTo(409);
            });
    assertThat(wireMock.getAllServeEvents()).isEmpty();
  }

  @Test
  void foldedClientPreservesEachTransportConnectTimeoutAndHttpVersion() {
    var contracts = new com.citi.put.checks.studio.guided.session.GuidedContracts();
    var configured =
        new HttpRunnerDispatchClient(
            new ObjectMapper(),
            new StudioExecutionProperties(
                true, null, null, null, Duration.ofMillis(500), null, null, null, null, null, null),
            new StudioRunnerProperties(
                "http://localhost:" + wireMock.port(), "test-runner-token", Duration.ofSeconds(2)),
            StudioRunnerTls.unconfigured(),
            contracts,
            java.net.URI.create("https://unconfigured.invalid"),
            () -> "guided-token");
    var dispatch =
        (HttpClient)
            org.springframework.test.util.ReflectionTestUtils.getField(configured, "httpClient");
    var validation =
        (HttpClient)
            org.springframework.test.util.ReflectionTestUtils.getField(
                configured, "validationClient");
    var guided =
        (HttpClient)
            org.springframework.test.util.ReflectionTestUtils.getField(configured, "guidedClient");
    assertThat(dispatch.connectTimeout()).contains(Duration.ofMillis(500));
    assertThat(dispatch.version()).isEqualTo(HttpClient.newHttpClient().version());
    assertThat(validation.connectTimeout()).contains(Duration.ofSeconds(2));
    assertThat(validation.version()).isEqualTo(HttpClient.Version.HTTP_1_1);
    assertThat(guided.connectTimeout()).contains(Duration.ofSeconds(5));
    assertThat(guided.version()).isEqualTo(HttpClient.Version.HTTP_1_1);
    assertThat(
            List.of(
                dispatch.followRedirects(), validation.followRedirects(), guided.followRedirects()))
        .containsOnly(HttpClient.Redirect.NEVER);
  }
}
