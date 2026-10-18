package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * The real dispatch client, built on the JDK HTTP client precisely because its two dangerous
 * behaviours can be switched off explicitly and demonstrably (10.7 AC-15).
 *
 * <p>Since story 10.17 the body this client serializes carries resolved variable and secret values
 * (§8.4, §9.2), so it is a new persistence surface and is treated as one: the serialized body is
 * never logged at any level, never placed in an exception message or cause chain, and nothing
 * retains it after {@code send} returns. The {@link JsonProcessingException} branch below is the
 * one place a serializer failure could have carried the body into a message, and it deliberately
 * says nothing about what failed to serialize.
 *
 * <p>{@link HttpClient.Redirect#NEVER} means a {@code 3xx} is returned to this code as a response
 * rather than followed, so exactly one request leaves the process. The JDK client performs no
 * automatic retry of a request that failed or timed out, and no retry is added here; there is no
 * interceptor, no {@code RetryTemplate} and no resilience4j instance on this path, and that absence
 * is the policy rather than an oversight.
 *
 * <p><b>Observed jobs only (ADR-SC-005).</b> The runner serves one run family, {@code POST
 * /v2/runs}, and a job that does not carry an observed binding is refused terminally before
 * anything is serialized: there is no second body shape and no second route.
 *
 * <p><b>Service identity (DEF-05).</b> {@code POST /v2/runs} declares {@code serviceIdentity}, and
 * the runner refuses an unauthenticated caller before it parses the body. The base URL and the
 * bearer therefore come from {@link StudioRunnerProperties}, the same source the observed
 * validation client uses, so the runner routes cannot be configured apart. When either is missing
 * this client refuses terminally, with a detail naming the missing key, and sends nothing: an
 * unauthenticated send is a request the runner is certain to refuse and would only hide the
 * misconfiguration behind the runner's {@code 401}.
 */
@Component
public class HttpRunnerDispatchClient implements RunnerDispatchClient {

  /** {@code detail()} of the terminal refusal when no runner base URL is configured. */
  public static final String RUNNER_NOT_CONFIGURED =
      "studio.runner.base-url is not configured; nothing was sent";

  /** {@code detail()} of the terminal refusal for a job without an observed binding. */
  public static final String NOT_OBSERVED =
      "only observed replay jobs are dispatched; nothing was sent";

  /** {@code detail()} of the terminal refusal when no service identity is configured. */
  public static final String SERVICE_IDENTITY_NOT_CONFIGURED =
      "studio.runner.service-identity-token is not configured; nothing was sent";

  private static final Logger LOGGER = LoggerFactory.getLogger(HttpRunnerDispatchClient.class);

  private final HttpClient httpClient;
  private final ObjectMapper objectMapper;
  private final StudioExecutionProperties properties;
  private final StudioRunnerProperties runner;
  private StudioDispatchMetrics metrics;

  /**
   * The client without a configured TLS identity, for tests that talk plain {@code http://} to a
   * local double. The Spring constructor below is the only one a deployed context uses.
   *
   * @param objectMapper serializer of the run body
   * @param properties execution bounds
   * @param runner the runner endpoint and service identity
   */
  public HttpRunnerDispatchClient(
      ObjectMapper objectMapper,
      StudioExecutionProperties properties,
      StudioRunnerProperties runner) {
    this(objectMapper, properties, runner, HttpClient.newBuilder());
  }

  /**
   * The deployed client: TLS comes from {@link StudioRunnerTls} (client certificate, the runner's
   * issuer as the only trust anchor, host-name verification), never from a JVM default
   * (STUDIO-OBS-009 AC-3, ruling A4).
   *
   * @param objectMapper serializer of the run body
   * @param properties execution bounds
   * @param runner the runner endpoint and service identity
   * @param tls the backend's identity on the runner hop
   */
  @Autowired
  public HttpRunnerDispatchClient(
      ObjectMapper objectMapper,
      StudioExecutionProperties properties,
      StudioRunnerProperties runner,
      StudioRunnerTls tls) {
    this(objectMapper, properties, runner, tls.configure(HttpClient.newBuilder()));
  }

  private HttpRunnerDispatchClient(
      ObjectMapper objectMapper,
      StudioExecutionProperties properties,
      StudioRunnerProperties runner,
      HttpClient.Builder builder) {
    this.objectMapper = objectMapper;
    this.properties = properties;
    this.runner = runner;
    this.httpClient =
        builder
            .followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(properties.admissionTimeoutOrDefault())
            .build();
  }

  /** WP7: counts runner {@code 429}s. Absent off the worker profile, where nothing dispatches. */
  @Autowired(required = false)
  void setMetrics(StudioDispatchMetrics metrics) {
    this.metrics = metrics;
  }

  /** Visible so that a test can assert the redirect policy rather than trust this Javadoc. */
  public HttpClient.Redirect redirectPolicy() {
    return httpClient.followRedirects();
  }

  void observeRequestBytes(java.util.function.Consumer<byte[]> observer) {
    this.requestBytesObserver = observer;
  }

  private java.util.function.Consumer<byte[]> requestBytesObserver;

  @Override
  public DispatchOutcome send(RunJob job) {
    String misconfiguration = misconfiguration();
    if (misconfiguration != null) {
      // The execution id is the only job field named: the body carries resolved secrets.
      LOGGER.warn(
          "Dispatch of execution {} refused before sending: {}",
          job.executionId(),
          misconfiguration);
      job.resolvedSecrets().values().forEach(com.citi.put.checks.studio.secrets.SecretValue::close);
      return DispatchOutcome.refusedTerminal(misconfiguration);
    }
    if (job.observed() == null) {
      LOGGER.warn(
          "Dispatch of execution {} refused before sending: {}", job.executionId(), NOT_OBSERVED);
      job.resolvedSecrets().values().forEach(com.citi.put.checks.studio.secrets.SecretValue::close);
      return DispatchOutcome.refusedTerminal(NOT_OBSERVED);
    }
    HttpRequest request;
    byte[] requestBytes = null;
    try {
      requestBytes =
          com.citi.put.checks.studio.secrets.SecretWireWriter.bytes(
              objectMapper, observedBody(job));
      request =
          HttpRequest.newBuilder(URI.create(runner.runsUrl()))
              .timeout(properties.admissionTimeoutOrDefault())
              .header("Content-Type", "application/json")
              .header("Authorization", "Bearer " + runner.serviceIdentityToken())
              .POST(HttpRequest.BodyPublishers.ofByteArray(requestBytes))
              .build();
    } catch (IOException | RuntimeException e) {
      if (requestBytes != null) {
        java.util.Arrays.fill(requestBytes, (byte) 0);
      }
      job.resolvedSecrets().values().forEach(com.citi.put.checks.studio.secrets.SecretValue::close);
      return DispatchOutcome.refusedTerminal("the run job could not be serialized");
    }

    HttpResponse<String> response;
    try {
      if (requestBytesObserver != null) {
        requestBytesObserver.accept(requestBytes);
      }
      response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    } catch (HttpTimeoutException e) {
      return DispatchOutcome.ambiguous("timeout");
    } catch (IOException e) {
      return DispatchOutcome.ambiguous("connection loss");
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return DispatchOutcome.ambiguous("interrupted");
    } finally {
      java.util.Arrays.fill(requestBytes, (byte) 0);
    }
    if (response.statusCode() == 429 && metrics != null) {
      metrics.recordRefusal();
    }
    return classify(
        response.statusCode(), response.headers().firstValue("Retry-After").orElse(null));
  }

  /**
   * {@code DELETE /v2/runs/{executionId}} with the same base URL and the same bearer as {@link
   * #send} (Studio v1 WP4). No body, no redirect followed, no automatic retry: the dispatcher's
   * next pass is the retry, and it happens only for an outcome that did not {@linkplain
   * CancelOutcome#settled() settle}.
   */
  @Override
  public CancelOutcome cancel(UUID executionId) {
    String misconfiguration = misconfiguration();
    if (misconfiguration != null) {
      LOGGER.warn("Cancel of execution {} not relayed: {}", executionId, misconfiguration);
      return CancelOutcome.FAILED;
    }
    HttpRequest request =
        HttpRequest.newBuilder(URI.create(runner.runUrl(executionId)))
            .timeout(properties.admissionTimeoutOrDefault())
            .header("Authorization", "Bearer " + runner.serviceIdentityToken())
            .DELETE()
            .build();
    int status;
    try {
      status = httpClient.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
    } catch (IOException e) {
      LOGGER.warn("Cancel of execution {} not relayed: {}", executionId, e.getClass().getName());
      return CancelOutcome.FAILED;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return CancelOutcome.FAILED;
    }
    return classifyCancel(status);
  }

  /** The cancel classification table, extracted like {@link #classify} so a test can drive it. */
  public static CancelOutcome classifyCancel(int status) {
    return switch (status) {
      case 202 -> CancelOutcome.ACKNOWLEDGED;
      case 409 -> CancelOutcome.ALREADY_FINISHED;
      case 404 -> CancelOutcome.NOT_FOUND;
      default -> CancelOutcome.FAILED;
    };
  }

  private String misconfiguration() {
    if (runner == null || !runner.isConfigured()) {
      return RUNNER_NOT_CONFIGURED;
    }
    if (!runner.hasServiceIdentity()) {
      return SERVICE_IDENTITY_NOT_CONFIGURED;
    }
    return null;
  }

  /** The classification table, extracted so that a unit test can drive every status through it. */
  public static DispatchOutcome classify(int status, String retryAfterHeader) {
    if (status == 202) {
      return DispatchOutcome.accepted();
    }
    if (status == 429) {
      return DispatchOutcome.refusedRetryable(parseRetryAfter(retryAfterHeader));
    }
    if (status >= 300 && status < 400) {
      // A followed redirect is a second dispatch wearing a different name; an unfollowed one is
      // an outcome nobody promised anything about, so it is ambiguous rather than a refusal.
      return DispatchOutcome.ambiguous("redirect " + status);
    }
    if (status >= 500) {
      return DispatchOutcome.ambiguous("runner " + status);
    }
    return DispatchOutcome.refusedTerminal("runner " + status);
  }

  private static Duration parseRetryAfter(String header) {
    if (header == null || header.isBlank()) {
      return null;
    }
    try {
      return Duration.ofSeconds(Long.parseLong(header.trim()));
    } catch (NumberFormatException e) {
      return null;
    }
  }

  /**
   * The observed body: the binding-derived wire document the replay authorization produced, plus
   * the two ephemeral secret maps resolved for this one send. Nothing else is added here.
   */
  private Map<String, Object> observedBody(RunJob job) {
    Map<String, Object> result = new LinkedHashMap<>();
    job.observed().fields().forEachRemaining(entry -> result.put(entry.getKey(), entry.getValue()));
    result.put("secrets", job.resolvedSecrets());
    result.put("secretOrigins", job.secretOrigins());
    return result;
  }
}
