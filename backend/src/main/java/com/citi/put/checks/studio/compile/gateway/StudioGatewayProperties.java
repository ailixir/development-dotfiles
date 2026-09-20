package com.citi.put.checks.studio.compile.gateway;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Deployment configuration for the Citi/R2D2 LLM gateway (Story 10.5, AC-2; architecture
 * &sect;8.5).
 *
 * <p>Nothing here is hardcoded to a Citi environment: endpoint, project, location, model and
 * credentials are supplied per deployment. The gateway is off by default, so a stock build never
 * reaches an LLM.
 *
 * @param enabled master switch; {@code false} selects {@link DisabledLlmGatewayClient}
 * @param endpoint R2D2 base URL used as the Vertex SDK endpoint (scheme optional, https assumed)
 * @param project Vertex project identifier as accepted by R2D2
 * @param location Vertex location identifier as accepted by R2D2
 * @param model model identifier as reachable through R2D2
 * @param credentials how to obtain the Studio compile workload's service credentials
 * @param requestTimeout total deadline for one gateway call, retries excluded
 * @param maxConcurrency size of the bounded-concurrency semaphore
 * @param maxInputBytes pre-flight limit on the UTF-8 transport payload
 * @param maxOutputBytes post-flight limit on the UTF-8 response text
 * @param structuredOutput whether to ask the gateway for a JSON response
 * @param temperature sampling temperature actually sent
 * @param retry bounded transport-retry policy
 * @param artifactSchema Spring resource location of the artifact JSON schema used for validation
 */
@ConfigurationProperties(prefix = "studio.compile.gateway")
public record StudioGatewayProperties(
    @DefaultValue("false") boolean enabled,
    String endpoint,
    String project,
    String location,
    String model,
    @DefaultValue Credentials credentials,
    @DefaultValue("60s") Duration requestTimeout,
    @DefaultValue("4") int maxConcurrency,
    @DefaultValue("262144") int maxInputBytes,
    @DefaultValue("262144") int maxOutputBytes,
    @DefaultValue("true") boolean structuredOutput,
    @DefaultValue("0") double temperature,
    @DefaultValue TransportRetry retry,
    @DefaultValue("classpath:studio/artifact.schema.json") String artifactSchema,
    @DefaultValue("8192") int maxOutputTokens) {

  @org.springframework.boot.context.properties.bind.ConstructorBinding
  public StudioGatewayProperties {}

  @SuppressWarnings("checkstyle:ParameterNumber")
  public StudioGatewayProperties(
      boolean enabled,
      String endpoint,
      String project,
      String location,
      String model,
      Credentials credentials,
      Duration requestTimeout,
      int maxConcurrency,
      int maxInputBytes,
      int maxOutputBytes,
      boolean structuredOutput,
      double temperature,
      TransportRetry retry,
      String artifactSchema) {
    this(
        enabled,
        endpoint,
        project,
        location,
        model,
        credentials,
        requestTimeout,
        maxConcurrency,
        maxInputBytes,
        maxOutputBytes,
        structuredOutput,
        temperature,
        retry,
        artifactSchema,
        8192);
  }

  /** Credential sourcing modes. A raw key or user token is never accepted as a property value. */
  public static final String MODE_APPLICATION_DEFAULT = "application-default";

  /** Loads a service-account key from {@code service-account-key-file}. */
  public static final String MODE_SERVICE_ACCOUNT_FILE = "service-account-file";

  /** No credentials at all — only legitimate against a local stub. */
  public static final String MODE_NONE = "none";

  private static final Set<String> CREDENTIAL_MODES =
      Set.of(MODE_APPLICATION_DEFAULT, MODE_SERVICE_ACCOUNT_FILE, MODE_NONE);

  /**
   * Service credentials for the Studio compile workload — never a user token (architecture
   * &sect;9.2).
   *
   * @param mode one of {@code application-default}, {@code service-account-file}, {@code none}
   * @param serviceAccountKeyFile filesystem path to the key, required by {@code
   *     service-account-file}
   */
  public record Credentials(
      @DefaultValue(MODE_APPLICATION_DEFAULT) String mode, String serviceAccountKeyFile) {}

  /**
   * Bounded transport retry (Story 10.5, AC-4).
   *
   * @param maxRetries retries after the first attempt; total attempts are {@code maxRetries + 1}
   * @param initialBackoff first backoff interval
   * @param backoffMultiplier exponential growth factor
   * @param jitterFactor randomisation applied to each interval, 0..1
   */
  public record TransportRetry(
      @DefaultValue("2") int maxRetries,
      @DefaultValue("250ms") Duration initialBackoff,
      @DefaultValue("2.0") double backoffMultiplier,
      @DefaultValue("0.5") double jitterFactor) {}

  /**
   * Fails fast with one message listing every missing or invalid value (AC-2).
   *
   * @throws IllegalStateException when {@code enabled} is true and configuration is incomplete
   */
  public void validateForEnabled() {
    if (!enabled) {
      return;
    }
    List<String> problems = new ArrayList<>();
    requireText(problems, "endpoint", endpoint);
    if (!isBlank(endpoint)) {
      try {
        java.net.URI uri = java.net.URI.create(endpoint);
        if (uri.getHost() == null
            || uri.getUserInfo() != null
            || uri.getQuery() != null
            || uri.getFragment() != null
            || !Set.of("https", "http").contains(uri.getScheme() == null ? "" : uri.getScheme())) {
          problems.add(
              "endpoint must be an absolute HTTP(S) URL without credentials, query or fragment");
        }
      } catch (IllegalArgumentException invalid) {
        problems.add("endpoint must be an absolute HTTP(S) URL");
      }
    }
    requireText(problems, "project", project);
    requireText(problems, "location", location);
    requireText(problems, "model", model);
    requireText(problems, "artifact-schema", artifactSchema);

    String mode = credentials == null ? null : credentials.mode();
    if (mode == null || !CREDENTIAL_MODES.contains(mode.toLowerCase(Locale.ROOT))) {
      problems.add("credentials.mode must be one of " + CREDENTIAL_MODES + " but was " + mode);
    } else if (MODE_SERVICE_ACCOUNT_FILE.equalsIgnoreCase(mode)
        && isBlank(credentials.serviceAccountKeyFile())) {
      problems.add(
          "credentials.service-account-key-file is required when credentials.mode is "
              + MODE_SERVICE_ACCOUNT_FILE);
    }

    if (MODE_NONE.equalsIgnoreCase(mode) && !isBlank(endpoint)) {
      try {
        String host = java.net.URI.create(endpoint).getHost();
        if (!Set.of("localhost", "127.0.0.1", "[::1]", "::1").contains(host == null ? "" : host)) {
          problems.add("credentials.mode=none requires a loopback stub endpoint");
        }
      } catch (IllegalArgumentException invalid) {
        problems.add("endpoint must be an absolute URL");
      }
    }

    requirePositive(
        problems, "request-timeout", requestTimeout == null ? 0 : requestTimeout.toMillis());
    requirePositive(problems, "max-concurrency", maxConcurrency);
    requirePositive(problems, "max-input-bytes", maxInputBytes);
    requirePositive(problems, "max-output-bytes", maxOutputBytes);
    requirePositive(problems, "max-output-tokens", maxOutputTokens);
    if (!structuredOutput) {
      problems.add("structured-output must be true");
    }
    if (!Double.isFinite(temperature) || temperature < 0) {
      problems.add("temperature must be >= 0 but was " + temperature);
    }
    if (retry == null || retry.maxRetries() < 0 || retry.maxRetries() > 2) {
      problems.add("retry.max-retries must be between 0 and 2");
    }
    if (retry != null) {
      requirePositive(
          problems,
          "retry.initial-backoff",
          retry.initialBackoff() == null ? 0 : retry.initialBackoff().toMillis());
      if (!Double.isFinite(retry.backoffMultiplier()) || retry.backoffMultiplier() < 1) {
        problems.add("retry.backoff-multiplier must be finite and >= 1");
      }
      if (!Double.isFinite(retry.jitterFactor())
          || retry.jitterFactor() < 0
          || retry.jitterFactor() > 1) {
        problems.add("retry.jitter-factor must be between 0 and 1");
      }
    }

    if (!problems.isEmpty()) {
      throw new IllegalStateException(
          "studio.compile.gateway.enabled=true but the gateway configuration is incomplete: "
              + String.join("; ", problems)
              + ". Set studio.compile.gateway.enabled=false to run without the R2D2 gateway.");
    }
  }

  private static void requireText(List<String> problems, String name, String value) {
    if (isBlank(value)) {
      problems.add("studio.compile.gateway." + name + " is required");
    }
  }

  private static void requirePositive(List<String> problems, String name, long value) {
    if (value <= 0) {
      problems.add("studio.compile.gateway." + name + " must be > 0 but was " + value);
    }
  }

  private static boolean isBlank(String value) {
    return value == null || value.isBlank();
  }
}
