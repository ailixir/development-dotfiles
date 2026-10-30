package com.citi.put.checks.studio.gateway;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Deployment configuration for the guided-authoring model transport (Story 10.5, AC-2; architecture
 * &sect;8.5; ADR-SC-005).
 *
 * <p>Nothing here is hardcoded to a Citi environment: endpoint, project, location, model and
 * credentials are supplied per deployment. The gateway is off by default, so a stock build never
 * reaches an LLM. Guided authoring owns proposal budgets, retries and wire bounds per attempt; this
 * record only bounds the shared transport.
 *
 * @param endpoint Vertex-compatible SDK endpoint: an absolute HTTP(S) URL without credentials,
 *     query or fragment
 * @param project Vertex AI project identifier
 * @param location Vertex AI location identifier
 * @param model Gemini model identifier
 * @param credentials how to obtain the Studio workload's service credentials
 * @param requestTimeout total deadline for one gateway call
 * @param maxConcurrency size of the bounded-concurrency semaphore; a call waits for a permit,
 *     within its own budget. Matches the runner's guided capacity bound of 8
 * @param maxInputBytes pre-flight limit on the UTF-8 transport payload
 * @param maxOutputBytes post-flight limit on the UTF-8 response text
 * @param maxOutputTokens ceiling on model output tokens, sent explicitly so a silently truncated
 *     answer cannot masquerade as a short one
 * @param thinkingLevel the thinking level sent explicitly on every request. Defaults to {@code LOW}
 *     (VAL-007). Overridable per environment via {@code STUDIO_GATEWAY_THINKING_LEVEL}. {@code
 *     MINIMAL} is not representable, so binding it fails
 * @param providerFeatures request fields the R2D2 proxy is trusted to accept (EC-17 degradation)
 */
@ConfigurationProperties(prefix = "studio.gateway")
public record StudioGatewayProperties(
    String endpoint,
    String project,
    String location,
    String model,
    @DefaultValue Credentials credentials,
    @DefaultValue("150s") Duration requestTimeout,
    @DefaultValue("8") int maxConcurrency,
    @DefaultValue("262144") int maxInputBytes,
    @DefaultValue("65536") int maxOutputBytes,
    @DefaultValue("32768") int maxOutputTokens,
    @DefaultValue("LOW") ThinkingLevel thinkingLevel,
    @DefaultValue ProviderFeatures providerFeatures) {

  public StudioGatewayProperties {
    thinkingLevel = thinkingLevel == null ? DEFAULT_THINKING_LEVEL : thinkingLevel;
    providerFeatures = providerFeatures == null ? ProviderFeatures.ALL : providerFeatures;
  }

  /**
   * The default thinking level (spec &sect;3.2.6). {@code LOW} since VAL-007 (2026-10-04), from the
   * benchmark A/B in {@code docs/stories/UI-STUDIO-VALIDATION-20261004/benchmark/report.md}; it was
   * {@code MEDIUM}.
   */
  public static final ThinkingLevel DEFAULT_THINKING_LEVEL = ThinkingLevel.LOW;

  /**
   * Thinking levels gemini-3.8-flash accepts (research Q1: low, medium and high).
   *
   * <p>{@code MINIMAL} is deliberately absent: gemini-3.8-flash rejects it, so a deployment that
   * configures it fails at property binding rather than on every call. {@code
   * THINKING_LEVEL_UNSPECIFIED} is absent too, because the level is always sent explicitly.
   */
  public enum ThinkingLevel {
    LOW,
    MEDIUM,
    HIGH
  }

  /**
   * EC-17 degradation switches, set by configuration after SPK-01 and never auto-detected at
   * runtime. Both default to {@code true}.
   *
   * @param systemInstruction when {@code false}, the identical static prefix is sent as the leading
   *     text of {@code contents[0]} instead of as {@code systemInstruction}, keeping static-first
   *     order
   * @param thinkingConfig when {@code false}, {@code thinkingConfig} is omitted
   */
  public record ProviderFeatures(
      @DefaultValue("true") boolean systemInstruction,
      @DefaultValue("true") boolean thinkingConfig) {

    /** Both fields sent: the approved request contract. */
    public static final ProviderFeatures ALL = new ProviderFeatures(true, true);
  }

  /** The default output-token ceiling, sized so a maximal artifact fits. */
  public static final int DEFAULT_MAX_OUTPUT_TOKENS = 32768;

  /** Credential sourcing modes. A raw key or user token is never accepted as a property value. */
  public static final String MODE_APPLICATION_DEFAULT = "application-default";

  /** Loads a service-account key from {@code service-account-key-file}. */
  public static final String MODE_SERVICE_ACCOUNT_FILE = "service-account-file";

  /** No credentials at all — only legitimate against a loopback stub endpoint. */
  public static final String MODE_NONE = "none";

  private static final Set<String> CREDENTIAL_MODES =
      Set.of(MODE_APPLICATION_DEFAULT, MODE_SERVICE_ACCOUNT_FILE, MODE_NONE);

  private static final Set<String> LOOPBACK_HOSTS =
      Set.of("localhost", "127.0.0.1", "[::1]", "::1");

  /**
   * Service credentials for the Studio workload — never a user token (architecture &sect;9.2).
   *
   * @param mode one of {@code application-default}, {@code service-account-file}, or {@code none}
   *     (loopback stub endpoints only)
   * @param serviceAccountKeyFile filesystem path to the key, required by {@code
   *     service-account-file}
   */
  public record Credentials(
      @DefaultValue(MODE_APPLICATION_DEFAULT) String mode, String serviceAccountKeyFile) {}

  /** Fails fast with every missing or invalid value when the real Vertex provider is selected. */
  public void validateForVertex() {
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
        if (!LOOPBACK_HOSTS.contains(host == null ? "" : host)) {
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
    if (!problems.isEmpty()) {
      throw new IllegalStateException(
          "studio.gateway.provider=vertex but the gateway configuration is incomplete: "
              + String.join("; ", problems)
              + ". Configure Vertex AI or set studio.gateway.provider=disabled.");
    }
  }

  private static void requireText(List<String> problems, String name, String value) {
    if (isBlank(value)) {
      problems.add("studio.gateway." + name + " is required");
    }
  }

  private static void requirePositive(List<String> problems, String name, long value) {
    if (value <= 0) {
      problems.add("studio.gateway." + name + " must be > 0 but was " + value);
    }
  }

  private static boolean isBlank(String value) {
    return value == null || value.isBlank();
  }
}
