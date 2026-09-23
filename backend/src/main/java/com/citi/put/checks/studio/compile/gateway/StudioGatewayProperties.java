package com.citi.put.checks.studio.compile.gateway;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Deployment configuration for Vertex AI translation (Story 10.5, AC-2; architecture &sect;8.5).
 *
 * <p>Nothing here is hardcoded to a Citi environment: endpoint, project, location, model and
 * credentials are supplied per deployment. The gateway is off by default, so a stock build never
 * reaches an LLM.
 *
 * @param endpoint Vertex-compatible SDK endpoint: an absolute HTTP(S) URL without credentials,
 *     query or fragment
 * @param project Vertex AI project identifier
 * @param location Vertex AI location identifier
 * @param model Gemini model identifier
 * @param credentials how to obtain the Studio compile workload's service credentials
 * @param requestTimeout total deadline for one gateway call, retries excluded
 * @param maxConcurrency size of the bounded-concurrency semaphore
 * @param maxInputBytes pre-flight limit on the UTF-8 transport payload
 * @param maxOutputBytes post-flight limit on the UTF-8 response text. Matches the runner's {@code
 *     maxArtifactBytes}, so an over-large proposal is refused here rather than accepted, persisted
 *     and then refused by the validator. Note this byte cap, not the schema's {@code maxItems}
 *     times {@code maxLength}, is the binding limit on artifact size: the schema permits step
 *     counts and line lengths whose product exceeds it
 * @param maxOutputTokens ceiling on model output tokens; sized so a maximal artifact fits, and sent
 *     explicitly so a silently truncated answer cannot masquerade as a short one
 * @param structuredOutput whether to ask the gateway for a JSON response
 * @param temperature legacy bound value; ignored by Gemini 3.8 and never sent
 * @param retry bounded transport-retry policy
 * @param artifactSchema Spring resource location of the artifact JSON schema used for validation
 * @param thinkingLevel the thinking level sent explicitly on every request and recorded in the
 *     compilation settings (Story 10.45 AC 6). Pinned {@code MEDIUM}, inferred to equal the
 *     gemini-3.8-flash default; SPK-01 verifies it for Vertex/R2D2. {@code MINIMAL} is not
 *     representable, so binding it fails
 * @param providerFeatures request fields the R2D2 proxy is trusted to accept (EC-17 degradation)
 */
@ConfigurationProperties(prefix = "studio.compile.gateway")
public record StudioGatewayProperties(
    String endpoint,
    String project,
    String location,
    String model,
    @DefaultValue Credentials credentials,
    @DefaultValue("60s") Duration requestTimeout,
    @DefaultValue("4") int maxConcurrency,
    @DefaultValue("262144") int maxInputBytes,
    @DefaultValue("65536") int maxOutputBytes,
    @DefaultValue("32768") int maxOutputTokens,
    @DefaultValue("true") boolean structuredOutput,
    @DefaultValue("0") double temperature,
    @DefaultValue TransportRetry retry,
    @DefaultValue("classpath:studio/artifact.schema.json") String artifactSchema,
    @DefaultValue("MEDIUM") ThinkingLevel thinkingLevel,
    @DefaultValue ProviderFeatures providerFeatures) {

  /**
   * The binding target.
   *
   * <p>Named explicitly because this record has a second, shorter constructor: with more than one,
   * Spring cannot tell which one property binding should use and fails to construct the record at
   * all. {@code StudioExecutionProperties} carries the same annotation for the same reason.
   */
  @ConstructorBinding
  public StudioGatewayProperties {
    thinkingLevel = thinkingLevel == null ? DEFAULT_THINKING_LEVEL : thinkingLevel;
    providerFeatures = providerFeatures == null ? ProviderFeatures.ALL : providerFeatures;
  }

  /**
   * The twelve-argument form from before {@code max-output-tokens} existed, kept so callers that do
   * not care about the model's output ceiling need not restate it.
   *
   * @param endpoint the Vertex-compatible endpoint
   * @param project the Vertex project
   * @param location the Vertex location
   * @param model the model identifier
   * @param credentials service credentials for the compile workload
   * @param requestTimeout per-call deadline
   * @param maxConcurrency bounded-concurrency permit count
   * @param maxInputBytes pre-flight transport payload limit
   * @param maxOutputBytes post-flight response text limit
   * @param structuredOutput whether to ask for a JSON response
   * @param temperature legacy bound value, never sent
   * @param retry bounded transport-retry policy
   * @param artifactSchema resource location of the artifact schema
   */
  @SuppressWarnings("checkstyle:ParameterNumber")
  public StudioGatewayProperties(
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
        endpoint,
        project,
        location,
        model,
        credentials,
        requestTimeout,
        maxConcurrency,
        maxInputBytes,
        maxOutputBytes,
        DEFAULT_MAX_OUTPUT_TOKENS,
        structuredOutput,
        temperature,
        retry,
        artifactSchema,
        DEFAULT_THINKING_LEVEL,
        ProviderFeatures.ALL);
  }

  /** The pinned thinking level (spec &sect;3.2.6); a harness A/B may later pin {@code LOW}. */
  public static final ThinkingLevel DEFAULT_THINKING_LEVEL = ThinkingLevel.MEDIUM;

  /**
   * Thinking levels gemini-3.8-flash accepts (research Q1: low, medium and high).
   *
   * <p>{@code MINIMAL} is deliberately absent: gemini-3.8-flash rejects it, so a deployment that
   * configures it fails at property binding rather than on every compile. {@code
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
   * @param thinkingConfig when {@code false}, {@code thinkingConfig} is omitted and the compilation
   *     settings record {@code thinkingLevel:"PROVIDER_DEFAULT"}
   */
  public record ProviderFeatures(
      @DefaultValue("true") boolean systemInstruction,
      @DefaultValue("true") boolean thinkingConfig) {

    /** Both fields sent: the approved request contract. */
    public static final ProviderFeatures ALL = new ProviderFeatures(true, true);
  }

  /** The value the compilation settings record when {@code thinkingConfig} is not sent. */
  public static final String PROVIDER_DEFAULT_THINKING_LEVEL = "PROVIDER_DEFAULT";

  /**
   * The thinking level as recorded in the compilation settings.
   *
   * @return the configured level, or {@value #PROVIDER_DEFAULT_THINKING_LEVEL} when {@code
   *     thinkingConfig} is switched off
   */
  public String effectiveThinkingLevel() {
    return providerFeatures.thinkingConfig()
        ? thinkingLevel.name()
        : PROVIDER_DEFAULT_THINKING_LEVEL;
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
   * Service credentials for the Studio compile workload — never a user token (architecture
   * &sect;9.2).
   *
   * @param mode one of {@code application-default}, {@code service-account-file}, or {@code none}
   *     (loopback stub endpoints only)
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
          "studio.compile.gateway.provider=vertex but the gateway configuration is incomplete: "
              + String.join("; ", problems)
              + ". Configure Vertex AI or set studio.compile.gateway.provider=disabled.");
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
