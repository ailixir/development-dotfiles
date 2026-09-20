package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.compile.validator.StudioRunnerProperties;
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
 */
@Component
public class HttpRunnerDispatchClient implements RunnerDispatchClient {

  private final HttpClient httpClient;
  private final ObjectMapper objectMapper;
  private final StudioExecutionProperties properties;
  private final StudioRunnerProperties runner;

  public HttpRunnerDispatchClient(
      ObjectMapper objectMapper,
      StudioExecutionProperties properties,
      StudioRunnerProperties runner) {
    this.objectMapper = objectMapper;
    this.properties = properties;
    this.runner = runner;
    this.httpClient =
        HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(properties.admissionTimeoutOrDefault())
            .build();
  }

  /** Visible so that a test can assert the redirect policy rather than trust this Javadoc. */
  public HttpClient.Redirect redirectPolicy() {
    return httpClient.followRedirects();
  }

  @Override
  public DispatchOutcome send(RunJob job) {
    if (!runner.isConfigured()
        || runner.serviceIdentityToken() == null
        || runner.serviceIdentityToken().isBlank()) {
      return DispatchOutcome.refusedTerminal("studio runner URL and service identity are required");
    }
    HttpRequest request;
    try {
      request =
          HttpRequest.newBuilder(URI.create(runner.baseUrl().replaceAll("/+$", "") + "/v1/runs"))
              .timeout(properties.admissionTimeoutOrDefault())
              .header("Content-Type", "application/json")
              .header("Authorization", "Bearer " + runner.serviceIdentityToken())
              .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body(job))))
              .build();
    } catch (JsonProcessingException e) {
      return DispatchOutcome.refusedTerminal("the run job could not be serialized");
    }

    HttpResponse<String> response;
    try {
      response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    } catch (HttpTimeoutException e) {
      return DispatchOutcome.ambiguous("timeout");
    } catch (IOException e) {
      return DispatchOutcome.ambiguous("connection loss");
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return DispatchOutcome.ambiguous("interrupted");
    }
    return classify(
        response.statusCode(), response.headers().firstValue("Retry-After").orElse(null));
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
   * The body, and it is the only place this API decides what {@code POST /v1/runs} looks like.
   *
   * <p>Exactly the fourteen keys the frozen {@code RunJob} declares, and nothing else. The closed
   * key set is a security control rather than tidiness — it is what stops a job naming its own
   * callback destination — and a producer that writes a fifteenth key is refused by the runner
   * before capacity, before admission and before a browser.
   *
   * <p>{@code InternalBodyContractConformanceTest} validates the bytes this method produces against
   * the schema read from {@code docs/specs/studio/openapi.yaml}, off a real socket. That assertion
   * landed red, in its own commit, before this method was corrected.
   */
  private Map<String, Object> body(RunJob job) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("executionId", job.executionId());
    body.put("attemptId", job.attemptId());
    body.put("revisionId", job.revisionId());
    body.put("artifactHash", job.artifactHash());
    body.put("artifact", job.artifact());
    body.put("source", job.source());
    body.put("configuration", job.configuration());
    body.put("csi", job.csi());
    Map<String, Object> references = new LinkedHashMap<>();
    references.put("variables", job.references().variables());
    references.put("secrets", job.references().secrets());
    body.put("references", references);
    body.put("resolvedVars", job.resolvedVars());
    body.put("resolvedSecrets", job.resolvedSecrets());
    Map<String, Object> deadlines = new LinkedHashMap<>();
    deadlines.put("admittedStartMs", job.deadlines().admittedStartMs());
    deadlines.put("totalRuntimeMs", job.deadlines().totalRuntimeMs());
    body.put("deadlines", deadlines);
    body.put("videoKey", job.videoKey());
    body.put("manifestKey", job.manifestKey());
    return body;
  }
}
