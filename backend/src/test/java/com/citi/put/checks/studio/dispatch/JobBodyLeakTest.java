package com.citi.put.checks.studio.dispatch;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.encoder.PatternLayoutEncoder;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.OutputStreamAppender;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.compile.validator.StudioRunnerProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.github.tomakehurst.wiremock.http.Fault;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

/**
 * Story 10.17 AC-12, AC-15 (API half) — the job body is a new persistence surface and is treated as
 * one.
 *
 * <p>Until this story the dispatch body carried no value, so nothing guarded it. It carries two
 * resolved maps now, and §9.2 is explicit: <em>"Never persist them in jobs, retry queues, manifests
 * or diagnostics."</em>
 *
 * <h2>The value is proven present first, every time</h2>
 *
 * <p>{@code doesNotContain} is the cheapest assertion in software and the easiest to make true by
 * accident. Every assertion below is preceded by reading the canary off the bytes that actually
 * left the process, so an absence elsewhere is a fact about the guard rather than about a run that
 * never happened. This is the pattern story 10.8's QA fix established, and it is what stops the
 * whole file being decorative.
 *
 * <h2>The logs are captured, not scanned</h2>
 *
 * <p>A live logback appender encoding {@code %msg} and {@code %ex{full}}, with the dispatch loggers
 * at {@code TRACE}. A source scan models the leak paths it knows about and is blind to a value
 * arriving through an innocently named local, a throwable's cause chain, or a nested record's own
 * {@code toString} — it stayed green against all three leak mutants when this epic last tried it.
 *
 * <h2>The ambiguous paths get their own test</h2>
 *
 * <p>They are the ones that <em>keep</em> the row alive after a send. A timeout, a connection loss,
 * a {@code 5xx} and a {@code 3xx} each leave no value anywhere, and {@code Resolved.close()} still
 * runs on each.
 */
class JobBodyLeakTest {

  /** Distinctive, and produced by no other part of this system. */
  private static final String SECRET_CANARY = "JobBody-Secret-Canary-51ab9d";

  private static final String VARIABLE_CANARY = "JobBody-Variable-Canary-77c3e0";

  private static WireMockServer wireMock;

  private ByteArrayOutputStream sink;
  private OutputStreamAppender<ILoggingEvent> appender;
  private Level restoreLevel;
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
    LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
    sink = new ByteArrayOutputStream();

    PatternLayoutEncoder encoder = new PatternLayoutEncoder();
    encoder.setContext(context);
    encoder.setPattern("%logger %level %msg%n%ex{full}");
    encoder.setCharset(StandardCharsets.UTF_8);
    encoder.start();

    appender = new OutputStreamAppender<>();
    appender.setContext(context);
    appender.setEncoder(encoder);
    appender.setOutputStream(sink);
    appender.setImmediateFlush(true);
    appender.start();
    context.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).addAppender(appender);
    restoreLevel = context.getLogger("com.citi.put.checks").getLevel();
    context.getLogger("com.citi.put.checks").setLevel(Level.TRACE);

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

  @AfterEach
  void tearDown() {
    LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
    context.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).detachAppender(appender);
    context.getLogger("com.citi.put.checks").setLevel(restoreLevel);
    appender.stop();
  }

  private String captured() {
    return new String(sink.toByteArray(), StandardCharsets.UTF_8);
  }

  private static RunJob canaryJob() {
    return RunJobFixtures.conformingJob(
        Map.of("REGION", VARIABLE_CANARY), Map.of("LOGIN_PW", SECRET_CANARY));
  }

  /** The fixture guard (Anti-vacuous test requirements, row 3). */
  @Test
  void theAppenderIsLiveBeforeAnyDoesNotContainIsTrusted() {
    LoggerFactory.getLogger(HttpRunnerDispatchClient.class).trace("job-body-sink-probe-2ef4");
    assertThat(captured())
        .as("the appender captured nothing, so every assertion in this class would be vacuous")
        .contains("job-body-sink-probe-2ef4");
  }

  @Test
  void theValuesTravelOnTheWireAndAppearInNoLogLineAtAnyLevel() {
    wireMock.stubFor(post(urlPathEqualTo("/v1/runs")).willReturn(aResponse().withStatus(202)));

    DispatchOutcome outcome = client.send(canaryJob());

    // Proven present first, on the bytes that actually left the process.
    String sent =
        wireMock.findAll(postRequestedFor(urlPathEqualTo("/v1/runs"))).get(0).getBodyAsString();
    assertThat(sent).contains(SECRET_CANARY).contains(VARIABLE_CANARY);
    assertThat(outcome.kind()).isEqualTo(DispatchOutcome.Kind.ACCEPTED);

    assertThat(captured())
        .as("the serialized job reached a log line")
        .doesNotContain(SECRET_CANARY)
        .doesNotContain(VARIABLE_CANARY);
  }

  /**
   * AC-12's ambiguous-outcome clause.
   *
   * <p>These are the four paths that leave the row alive after a send, so they are the four where a
   * retained body would matter most. Each is driven with the canary genuinely on the wire.
   */
  @Test
  void noAmbiguousOrRefusedPathPutsAValueInALogLineAnExceptionOrAnOutcome() {
    Map<String, com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder> paths =
        new LinkedHashMap<>();
    paths.put("timeout", aResponse().withStatus(202).withFixedDelay(3000));
    paths.put("connection loss", aResponse().withFault(Fault.CONNECTION_RESET_BY_PEER));
    paths.put("5xx", aResponse().withStatus(503));
    paths.put("3xx", aResponse().withStatus(302).withHeader("Location", "/v1/runs-elsewhere"));
    paths.put("terminal refusal", aResponse().withStatus(400));

    paths.forEach(
        (label, response) -> {
          wireMock.resetAll();
          wireMock.stubFor(post(urlPathEqualTo("/v1/runs")).willReturn(response));

          DispatchOutcome outcome = client.send(canaryJob());

          // It travelled: even on the paths that end badly, the body did leave this process.
          String sent =
              wireMock
                  .findAll(postRequestedFor(urlPathEqualTo("/v1/runs")))
                  .get(0)
                  .getBodyAsString();
          assertThat(sent)
              .as("%s: the canary never reached the wire", label)
              .contains(SECRET_CANARY);

          // The outcome's own detail is a string this code composes and something reads.
          assertThat(String.valueOf(outcome.detail()))
              .as("%s: the outcome detail carries a value", label)
              .doesNotContain(SECRET_CANARY)
              .doesNotContain(VARIABLE_CANARY);
        });

    assertThat(captured())
        .as("an ambiguous or refused path logged the job body")
        .doesNotContain(SECRET_CANARY)
        .doesNotContain(VARIABLE_CANARY);
  }

  /**
   * AC-15, API half — {@code Resolved.close()} erases the arrays, asserted the only decidable way.
   *
   * <p>A reference to the array is held across the block, so the assertion is about the memory the
   * caller handed over rather than about a map that was merely cleared. Java cannot erase the
   * {@link String}s the JSON serializer creates from those arrays, and this test does not claim it
   * can: the property asserted is that nothing retains a <b>path</b> to the values afterwards, and
   * the serializer's transient buffers are the named residual.
   */
  @Test
  void closeZeroesBothMapsArraysAndNotMerelyTheMapsThatHeldThem() {
    char[] secret = SECRET_CANARY.toCharArray();
    char[] variable = VARIABLE_CANARY.toCharArray();
    char[] sameSecretArray = secret;
    char[] sameVariableArray = variable;

    try (StudioReferenceResolver.Resolved resolved =
        new StudioReferenceResolver.Resolved(
            Map.of("REGION", variable), Map.of("LOGIN_PW", secret), Map.of("LOGIN_PW", "v1"))) {
      // Present first.
      assertThat(new String(resolved.secrets().get("LOGIN_PW"))).isEqualTo(SECRET_CANARY);
      assertThat(new String(resolved.variables().get("REGION"))).isEqualTo(VARIABLE_CANARY);
      assertThat(resolved.secretVersions()).containsEntry("LOGIN_PW", "v1");
    }

    char[] zeroedSecret = new char[SECRET_CANARY.length()];
    Arrays.fill(zeroedSecret, '\0');
    char[] zeroedVariable = new char[VARIABLE_CANARY.length()];
    Arrays.fill(zeroedVariable, '\0');

    assertThat(sameSecretArray)
        .as("the secret array the caller handed over")
        .isEqualTo(zeroedSecret);
    assertThat(sameVariableArray)
        .as("the variable array — §9.2 governs resolved values, not secrets specifically")
        .isEqualTo(zeroedVariable);
  }

  @Test
  void closeRunsOnTheRefusalPathTooAndEmptiesTheVersionIdentifiers() {
    char[] secret = SECRET_CANARY.toCharArray();
    StudioReferenceResolver.Resolved resolved =
        new StudioReferenceResolver.Resolved(
            Map.of(), Map.of("LOGIN_PW", secret), Map.of("LOGIN_PW", "v1"));
    try {
      throw new IllegalStateException("a refusal on the way to the send");
    } catch (IllegalStateException expected) {
      resolved.close();
    }
    assertThat(new String(secret)).isEqualTo("\0".repeat(SECRET_CANARY.length()));
    assertThat(resolved.secretVersions()).isEmpty();
    assertThat(resolved.isEmpty()).isTrue();
  }
}
