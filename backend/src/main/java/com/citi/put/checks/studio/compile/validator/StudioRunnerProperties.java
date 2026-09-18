package com.citi.put.checks.studio.compile.validator;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Deployment configuration for reaching the {@code studio-runner} Service (Story 10.8, AC-12a;
 * architecture &sect;8.4, &sect;8.5).
 *
 * <p>The base URL is <strong>deployment configuration and never job- or user-supplied</strong>.
 * That is a security control, not tidiness: a caller that could name the validator could name any
 * host and have the backend post an artifact to it under the service identity. The same rule
 * governs the dispatch callback destination in &sect;8.4.
 *
 * @param baseUrl the runner Service base URL, for example {@code
 *     http://put-checks-studio-runner:8080}
 * @param serviceIdentityToken the restricted service identity presented as {@code Authorization:
 *     Bearer}; never a platform user session and never carried in a URL or query string
 * @param validateTimeout total wall-clock deadline for the one {@code /v1/validate} call
 * @param connectTimeout TCP connect deadline, inside {@code validateTimeout}
 */
@ConfigurationProperties(prefix = "studio.runner")
public record StudioRunnerProperties(
    String baseUrl,
    String serviceIdentityToken,
    @DefaultValue("10s") Duration validateTimeout,
    @DefaultValue("2s") Duration connectTimeout) {

  /** Path of the browser-free validation route on the runner's own socket. */
  public static final String VALIDATE_PATH = "/v1/validate";

  /** Path of the run admission route the dispatcher posts a {@code RunJob} to. */
  public static final String RUNS_PATH = "/v1/runs";

  /**
   * Whether the runner is configured at all. A deployment without a runner URL compiles nothing
   * silently: the pipeline reports {@code VALIDATOR_UNAVAILABLE} and the draft stays retryable,
   * rather than a candidate being published without ever having been validated.
   *
   * @return true when a base URL is configured
   */
  public boolean isConfigured() {
    return baseUrl != null && !baseUrl.isBlank();
  }

  /**
   * Fails fast with one message listing every unusable value.
   *
   * @throws IllegalStateException when a configured runner is misconfigured
   */
  public void validate() {
    if (!isConfigured()) {
      return;
    }
    List<String> problems = new ArrayList<>();
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      problems.add("studio.runner.base-url must be an absolute http(s) URL but was " + baseUrl);
    }
    if (validateTimeout == null || validateTimeout.toMillis() <= 0) {
      problems.add("studio.runner.validate-timeout must be > 0");
    }
    if (connectTimeout == null || connectTimeout.toMillis() <= 0) {
      problems.add("studio.runner.connect-timeout must be > 0");
    }
    if (!problems.isEmpty()) {
      throw new IllegalStateException(
          "The studio-runner configuration is not usable: " + String.join("; ", problems));
    }
  }

  /**
   * The full validation endpoint.
   *
   * @return {@code baseUrl} + {@value #VALIDATE_PATH}
   */
  public String validateUrl() {
    return trimmedBaseUrl() + VALIDATE_PATH;
  }

  /**
   * The full run admission endpoint.
   *
   * @return {@code baseUrl} + {@value #RUNS_PATH}
   */
  public String runsUrl() {
    return trimmedBaseUrl() + RUNS_PATH;
  }

  /**
   * One admitted run's endpoint, the target of {@code DELETE /v1/runs/{executionId}} (Studio v1
   * WP4). Built from {@link #runsUrl()} so the two run routes cannot be configured apart.
   *
   * @param executionId the execution whose run is addressed
   * @return {@code baseUrl} + {@value #RUNS_PATH} + {@code /} + the execution id
   */
  public String runUrl(java.util.UUID executionId) {
    return runsUrl() + "/" + executionId;
  }

  /**
   * Whether a usable service identity is configured. Both runner routes declare {@code
   * serviceIdentity}, so a caller without one is refused by the runner before it reads the body.
   *
   * @return true when the token is present and not blank
   */
  public boolean hasServiceIdentity() {
    return serviceIdentityToken != null && !serviceIdentityToken.isBlank();
  }

  private String trimmedBaseUrl() {
    return baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
  }
}
