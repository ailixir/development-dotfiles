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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The real dispatch client, built on the JDK HTTP client precisely because its two dangerous
 * behaviours can be switched off explicitly and demonstrably (AC-15).
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
  private final String runnerBaseUrl;

  public HttpRunnerDispatchClient(
      ObjectMapper objectMapper,
      StudioExecutionProperties properties,
      @Value("${studio.execution.runner-base-url:http://put-checks-studio-runner:8090}")
          String runnerBaseUrl) {
    this.objectMapper = objectMapper;
    this.properties = properties;
    this.runnerBaseUrl = runnerBaseUrl;
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
    HttpRequest request;
    try {
      request =
          HttpRequest.newBuilder(URI.create(runnerBaseUrl + "/v1/runs"))
              .timeout(properties.admissionTimeoutOrDefault())
              .header("Content-Type", "application/json")
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

  /** Declared reference names only. No resolved value is ever serialized into a job body (§9.2). */
  private Map<String, Object> body(RunJob job) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("executionId", job.executionId());
    body.put("attemptId", job.attemptId());
    body.put("testId", job.testId());
    body.put("csiId", job.csiId());
    body.put("revisionId", job.revisionId());
    body.put("environment", job.environment());
    body.put("references", job.references());
    body.put("callbackBaseUrl", job.callbackBaseUrl());
    return body;
  }
}
