package com.citi.put.checks.studio.dispatch;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

/**
 * Deployment configuration for reaching the {@code studio-runner} Service (Story 10.8, AC-12a;
 * architecture &sect;8.4, &sect;8.5; ADR-SC-005).
 *
 * <p>The base URL is <strong>deployment configuration and never job- or user-supplied</strong>.
 * That is a security control, not tidiness: a caller that could name the runner could name any host
 * and have the backend post a job to it under the service identity. The same rule governs the
 * dispatch callback destination in &sect;8.4.
 *
 * @param baseUrl the runner Service base URL, for example {@code
 *     https://put-checks-studio-runner:8080}; {@code http://} is accepted only in the {@code local}
 *     and {@code test} profiles ({@link #validate(Environment)})
 * @param serviceIdentityToken the restricted service identity presented as {@code Authorization:
 *     Bearer}; never a platform user session and never carried in a URL or query string
 * @param connectTimeout TCP connect deadline for the runner's observed routes
 */
@ConfigurationProperties(prefix = "studio.runner")
public record StudioRunnerProperties(
    String baseUrl, String serviceIdentityToken, @DefaultValue("2s") Duration connectTimeout) {

  /** Path of the observed run admission route the dispatcher posts a job to. */
  public static final String RUNS_PATH = "/v2/runs";

  /**
   * The only profiles in which the runner URL may be plain {@code http://} (STUDIO-OBS-009 AC-3).
   * Every other profile, including none, speaks TLS with a client certificate to the runner.
   */
  public static final List<String> PLAINTEXT_PROFILES = List.of("local", "test");

  /**
   * Whether the runner is configured at all. Without a base URL the dispatcher sends nothing and
   * closes the execution {@code DISPATCH_FAILED}.
   *
   * @return true when a base URL is configured
   */
  public boolean isConfigured() {
    return baseUrl != null && !baseUrl.isBlank();
  }

  /**
   * Whether the active profiles allow a plaintext runner URL.
   *
   * @param environment the application environment
   * @return true when {@code local} or {@code test} is active
   */
  public static boolean plaintextAllowed(Environment environment) {
    return environment.acceptsProfiles(Profiles.of(PLAINTEXT_PROFILES.toArray(String[]::new)));
  }

  /**
   * The full startup validation: {@link #validate()} plus the transport rule of the active
   * profiles. This is the check that refuses {@code http://} under {@code prod}, {@code staging},
   * {@code dev} and any profile that is not {@code local} or {@code test}.
   *
   * @param environment the application environment
   * @throws IllegalStateException when the configuration is unusable or not allowed here
   */
  public void validate(Environment environment) {
    validate();
    requireSecureTransport(plaintextAllowed(environment));
  }

  /**
   * Refuses a plaintext runner URL where plaintext is not allowed. A runner that is not configured
   * has no URL to refuse.
   *
   * @param plaintextAllowed true for the {@code local} and {@code test} profiles
   * @throws IllegalStateException when a configured URL is not {@code https://}
   */
  public void requireSecureTransport(boolean plaintextAllowed) {
    if (isConfigured() && !plaintextAllowed && !baseUrl.startsWith("https://")) {
      throw new IllegalStateException(
          "The studio-runner configuration is not usable: studio.runner.base-url must be an https"
              + " URL outside the local and test profiles (the runner has no plaintext listener)");
    }
  }

  /**
   * Fails fast with one message listing every unusable value. This is the shape check; the profile
   * rule is {@link #validate(Environment)}.
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
    if (connectTimeout == null || connectTimeout.toMillis() <= 0) {
      problems.add("studio.runner.connect-timeout must be > 0");
    }
    if (!problems.isEmpty()) {
      throw new IllegalStateException(
          "The studio-runner configuration is not usable: " + String.join("; ", problems));
    }
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
   * One admitted run's endpoint, the target of {@code DELETE /v2/runs/{executionId}}. Built from
   * {@link #runsUrl()} so the two run routes cannot be configured apart.
   *
   * @param executionId the execution whose run is addressed
   * @return {@code baseUrl} + {@value #RUNS_PATH} + {@code /} + the execution id
   */
  public String runUrl(java.util.UUID executionId) {
    return runsUrl() + "/" + executionId;
  }

  /**
   * Whether a usable service identity is configured. The runner refuses a caller without one before
   * it reads the body.
   *
   * @return true when the token is present and not blank
   */
  public boolean hasServiceIdentity() {
    return serviceIdentityToken != null && !serviceIdentityToken.isBlank();
  }

  private String trimmedBaseUrl() {
    return baseUrl.replaceAll("/+$", "");
  }
}
