package com.citi.put.checks.studio.compile;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.compile.validator.RunnerValidationClient;
import com.citi.put.checks.studio.compile.validator.StudioRunnerProperties;
import com.citi.put.checks.studio.compile.validator.ValidationOutcome;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.time.Duration;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Story 10.8 AC-12a — the one call to {@code POST /v1/validate}, on the wire.
 *
 * <p>WireMock rather than a stubbed client, because the properties under test are wire properties:
 * how many requests were issued, what the body actually contained, and what happens when the socket
 * does not answer. A stub of the client would have asserted the stub.
 */
class RunnerValidationClientTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String TOKEN = "service-identity-token";
  private static final List<String> SOURCE =
      List.of("Go to \"https://example.com/login\"", "Click the \"Sign in\" button");
  private static final String ARTIFACT =
      "{\"version\":1,\"steps\":[{\"stepIndex\":0,\"originalText\":\"Go to"
          + " \\\"https://example.com/login\\\"\",\"code\":\"await"
          + " page.goto('https://example.com/login');\"}]}";

  private static WireMockServer runner;

  @BeforeAll
  static void startRunner() {
    runner = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    runner.start();
  }

  @AfterAll
  static void stopRunner() {
    runner.stop();
  }

  @BeforeEach
  void resetRunner() {
    runner.resetAll();
  }

  // ── the request conforms to the closed ValidateRequest schema ─────────────

  @Test
  void theRequestCarriesExactlyArtifactSourceAndReferencesUnderTheServiceIdentity()
      throws Exception {
    runner.stubFor(
        post(urlEqualTo("/v1/validate"))
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("content-type", "application/json")
                    .withBody(
                        "{\"ok\":true,\"validatorSchemaVersion\":\"1.0.0\",\"diagnostics\":[],"
                            + "\"steps\":[{\"stepIndex\":0,\"ok\":true,\"diagnostics\":[]},"
                            + "{\"stepIndex\":1,\"ok\":true,\"diagnostics\":[]}]}")));

    ValidationOutcome outcome =
        client(Duration.ofSeconds(5))
            .validate(ARTIFACT, SOURCE, List.of("USERNAME"), List.of("LOGIN_PW"));

    assertThat(outcome.available()).isTrue();
    assertThat(outcome.ok()).isTrue();
    assertThat(outcome.validatorSchemaVersion()).isEqualTo("1.0.0");

    runner.verify(
        1,
        postRequestedFor(urlEqualTo("/v1/validate"))
            .withHeader("Authorization", equalTo("Bearer " + TOKEN)));

    JsonNode body =
        MAPPER.readTree(runner.getAllServeEvents().get(0).getRequest().getBodyAsString());
    assertThat(body.fieldNames())
        .toIterable()
        .as(
            "the runner's key set is closed: an undeclared key is a 400, so a field added here"
                + " without amending the contract must fail loudly rather than be ignored")
        .containsExactlyInAnyOrder("artifact", "source", "references");
    assertThat(body.path("source")).hasSize(2);
    assertThat(body.path("references").path("variables").get(0).asText()).isEqualTo("USERNAME");
    assertThat(body.path("references").path("secrets").get(0).asText()).isEqualTo("LOGIN_PW");
  }

  @Test
  void noResolvedValueTravelsOnTheValidationRequest() {
    runner.stubFor(post(urlEqualTo("/v1/validate")).willReturn(okVerdict(true)));

    client(Duration.ofSeconds(5))
        .validate(ARTIFACT, SOURCE, List.of("USERNAME"), List.of("LOGIN_PW"));

    String wire = runner.getAllServeEvents().get(0).getRequest().getBodyAsString();

    // The canary from the reference corpus: the value behind LOGIN_PW, in every encoding a
    // careless serializer might have reached for.
    assertThat(wire)
        .doesNotContain("s3cr3t-canary")
        .doesNotContain("s3cr3t%2Dcanary")
        .doesNotContain("czNjcjN0LWNhbmFyeQ==");
  }

  // ── exactly one call, and never a retry ───────────────────────────────────

  @Test
  void aFiveHundredIsACompileFailureAndIsNeverRetried() {
    runner.stubFor(post(urlEqualTo("/v1/validate")).willReturn(aResponse().withStatus(500)));

    ValidationOutcome outcome =
        client(Duration.ofSeconds(5)).validate(ARTIFACT, SOURCE, List.of(), List.of());

    assertThat(outcome.available())
        .as("a 5xx is not a verdict; guessing one would be inventing a validation result")
        .isFalse();
    assertThat(outcome.failureReason()).contains("500");
    runner.verify(1, postRequestedFor(urlEqualTo("/v1/validate")));
  }

  @Test
  void aTimeoutIsACompileFailureAndIsNeverRetried() {
    runner.stubFor(
        post(urlEqualTo("/v1/validate")).willReturn(okVerdict(true).withFixedDelay(2_000)));

    ValidationOutcome outcome =
        client(Duration.ofMillis(300)).validate(ARTIFACT, SOURCE, List.of(), List.of());

    assertThat(outcome.available()).isFalse();
    runner.verify(1, postRequestedFor(urlEqualTo("/v1/validate")));
  }

  @Test
  void theClientCountsEveryCallItIssues() {
    runner.stubFor(post(urlEqualTo("/v1/validate")).willReturn(okVerdict(true)));
    RunnerValidationClient client = client(Duration.ofSeconds(5));

    assertThat(client.callCount()).isZero();
    client.validate(ARTIFACT, SOURCE, List.of(), List.of());
    assertThat(client.callCount()).isEqualTo(1);
  }

  // ── ok:false is a verdict, not a transport failure ────────────────────────

  @Test
  void aRejectedArtifactIsStillATwoHundredAndIsReportedAsAVerdict() {
    runner.stubFor(
        post(urlEqualTo("/v1/validate"))
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("content-type", "application/json")
                    .withBody(
                        "{\"ok\":false,\"validatorSchemaVersion\":\"1.0.0\","
                            + "\"diagnostics\":[{\"code\":\"ARTIFACT_STEP_COUNT\",\"stepIndex\":null,"
                            + "\"message\":\"count\",\"node\":null,\"excerpt\":null}],"
                            + "\"steps\":[{\"stepIndex\":0,\"ok\":false,\"diagnostics\":"
                            + "[{\"code\":\"DENIED_NODE\",\"stepIndex\":0,\"message\":\"nope\","
                            + "\"node\":\"ForStatement\",\"excerpt\":\"for(;;)\"}]},"
                            + "{\"stepIndex\":1,\"ok\":false,\"diagnostics\":[]}]}")));

    ValidationOutcome outcome =
        client(Duration.ofSeconds(5)).validate(ARTIFACT, SOURCE, List.of(), List.of());

    assertThat(outcome.available()).as("the validator answered; that is a verdict").isTrue();
    assertThat(outcome.ok()).isFalse();
    assertThat(outcome.failureReason()).as("a verdict carries no failure reason").isNull();
    assertThat(outcome.diagnostics()).hasSize(1);
    assertThat(outcome.diagnostics().get(0).stepIndex())
        .as("artifact-level diagnostics belong to no step")
        .isNull();
    assertThat(outcome.steps()).hasSize(2);
    assertThat(outcome.steps().get(0).diagnostics().get(0).node()).isEqualTo("ForStatement");
  }

  @ParameterizedTest
  @MethodSource("malformedVerdicts")
  void malformedOrContradictoryVerdictsCannotAuthorizePublication(String body) {
    runner.stubFor(
        post(urlEqualTo("/v1/validate")).willReturn(aResponse().withStatus(200).withBody(body)));
    ValidationOutcome outcome =
        client(Duration.ofSeconds(5)).validate(ARTIFACT, SOURCE, List.of(), List.of());
    assertThat(outcome.available()).isFalse();
    runner.verify(1, postRequestedFor(urlEqualTo("/v1/validate")));
  }

  @Test
  void sharedBudgetCancelsSlowValidationAndForbidsCallsAfterExpiry() throws Exception {
    runner.stubFor(
        post(urlEqualTo("/v1/validate")).willReturn(okVerdict(true).withFixedDelay(2_000)));
    RunnerValidationClient client = client(Duration.ofSeconds(5));
    CompileBudget budget = new CompileBudget(Duration.ofMillis(150));
    long started = System.nanoTime();
    assertThat(client.validate(ARTIFACT, SOURCE, List.of(), List.of(), budget).available())
        .isFalse();
    assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(1));
    Thread.sleep(160);
    long calls = client.callCount();
    assertThatThrownBy(() -> client.validate(ARTIFACT, SOURCE, List.of(), List.of(), budget))
        .isInstanceOf(java.util.concurrent.CancellationException.class);
    assertThat(client.callCount()).isEqualTo(calls);
  }

  @Test
  void cancellationReleasesAnActiveValidatorBeforeItsPerCallTimeout() throws Exception {
    runner.stubFor(
        post(urlEqualTo("/v1/validate")).willReturn(okVerdict(true).withFixedDelay(2_000)));
    CompileBudget budget = new CompileBudget(Duration.ofSeconds(5));
    try (var worker = java.util.concurrent.Executors.newSingleThreadExecutor()) {
      var result =
          worker.submit(
              () ->
                  client(Duration.ofSeconds(5))
                      .validate(ARTIFACT, SOURCE, List.of(), List.of(), budget));
      long until = System.nanoTime() + Duration.ofSeconds(2).toNanos();
      while (runner.getAllServeEvents().isEmpty() && System.nanoTime() < until) {
        Thread.sleep(5);
      }
      budget.cancel();
      assertThat(result.get(1, java.util.concurrent.TimeUnit.SECONDS).available()).isFalse();
    }
  }

  @Test
  void oversizedVerdictIsRejectedByBothTransports() {
    runner.stubFor(
        post(urlEqualTo("/v1/validate"))
            .willReturn(aResponse().withStatus(200).withBody(" ".repeat(1_048_577))));
    RunnerValidationClient client = client(Duration.ofSeconds(5));
    assertThat(client.validate(ARTIFACT, SOURCE, List.of(), List.of()).available()).isFalse();
    assertThat(
            client
                .validate(
                    ARTIFACT,
                    SOURCE,
                    List.of(),
                    List.of(),
                    new CompileBudget(Duration.ofSeconds(5)))
                .available())
        .isFalse();
  }

  private static Stream<String> malformedVerdicts() {
    String valid =
        """
        {"ok":true,"validatorSchemaVersion":"1.0.0","diagnostics":[],"steps":[
          {"stepIndex":0,"ok":true,"diagnostics":[]},
          {"stepIndex":1,"ok":true,"diagnostics":[]}]}
        """;
    return Stream.of(
        valid + " {}",
        valid + " false",
        "null",
        "",
        "{}",
        "{\"ok\":true}",
        valid.replace("\"validatorSchemaVersion\":\"1.0.0\",", ""),
        valid.replace("1.0.0", "2.0.0"),
        valid.replace("\"ok\":true", "\"ok\":\"true\""),
        valid.replaceFirst("true", "false"),
        valid.replace("\"stepIndex\":1", "\"stepIndex\":0"),
        valid.replace("\"stepIndex\":1", "\"stepIndex\":1.5"),
        valid.replace("\"stepIndex\":1", "\"stepIndex\":4294967297"),
        valid.replace("\"stepIndex\":1", "\"stepIndex\":1,\"extra\":true"),
        valid.replaceFirst("\\{", "{\"ok\":false,"),
        valid.replaceFirst("\\{", "{\"unknown\":true,"),
        valid.replace("\"stepIndex\":1,\"ok\":true", "\"stepIndex\":1,\"ok\":false"),
        valid.replace("\"diagnostics\":[]", "\"diagnostics\":null"),
        valid.replace("\"diagnostics\":[]", "\"diagnostics\":[{\"code\":\"BAD\"}]"),
        valid.replace(",\n  {\"stepIndex\":1,\"ok\":true,\"diagnostics\":[]}", ""),
        valid.replace("\"stepIndex\":1", "\"stepIndex\":2"));
  }

  // ── the base URL is deployment configuration ──────────────────────────────

  @Test
  void anUnconfiguredRunnerIsUnavailableRatherThanSkipped() {
    RunnerValidationClient client =
        new RunnerValidationClient(
            RestClient.builder().build(),
            new StudioRunnerProperties("", TOKEN, Duration.ofSeconds(10), Duration.ofSeconds(2)));

    ValidationOutcome outcome = client.validate(ARTIFACT, SOURCE, List.of(), List.of());

    assertThat(outcome.available())
        .as(
            "a deployment without a runner URL must not publish an unvalidated candidate; it"
                + " reports the compile as retryable instead")
        .isFalse();
    assertThat(outcome.failureReason()).contains("studio.runner.base-url");
  }

  @Test
  void aRelativeOrNonHttpBaseUrlFailsStartup() {
    assertThatThrownBy(
            () ->
                new StudioRunnerProperties(
                        "put-checks-studio-runner:8080",
                        TOKEN,
                        Duration.ofSeconds(10),
                        Duration.ofSeconds(2))
                    .validate())
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("absolute http(s) URL");
  }

  @Test
  void theValidateUrlIsBuiltFromConfigurationAndNothingElse() {
    StudioRunnerProperties properties =
        new StudioRunnerProperties(
            "http://put-checks-studio-runner:8080/",
            TOKEN,
            Duration.ofSeconds(10),
            Duration.ofSeconds(2));

    assertThat(properties.validateUrl())
        .isEqualTo("http://put-checks-studio-runner:8080/v1/validate");
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private static com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder okVerdict(
      boolean ok) {
    return aResponse()
        .withStatus(200)
        .withHeader("content-type", "application/json")
        .withBody(
            "{\"ok\":"
                + ok
                + ",\"validatorSchemaVersion\":\"1.0.0\",\"diagnostics\":[],\"steps\":[]}");
  }

  private static RunnerValidationClient client(Duration timeout) {
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(1_000);
    factory.setReadTimeout((int) timeout.toMillis());
    return new RunnerValidationClient(
        RestClient.builder().requestFactory(factory).build(),
        new StudioRunnerProperties(
            "http://localhost:" + runner.port(), TOKEN, timeout, Duration.ofSeconds(1)));
  }
}
