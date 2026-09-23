package com.citi.put.checks.studio.compile.gateway;

import com.google.genai.Client;
import com.google.genai.types.Candidate;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.GenerateContentResponse;
import io.github.resilience4j.bulkhead.Bulkhead;
import io.github.resilience4j.bulkhead.BulkheadConfig;
import io.github.resilience4j.core.IntervalFunction;
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Google Gen AI SDK implementation of {@link LlmGatewayClient} in Vertex AI mode (Story 10.5, AC-2,
 * AC-4, AC-5, AC-8; architecture &sect;4.1).
 *
 * <p>This is the only class in the package that knows the SDK. SDK-level automatic retries are
 * switched off in {@link VertexAiClientFactory}; the bounded retry here is the only one, so total
 * gateway attempts stay inside the compile budget of &sect;4.3.
 *
 * <p>The client uses the current Google Gen AI SDK in Vertex AI mode. Gemini 3.8 sampling controls
 * are deliberately absent from the request; only the structured-response MIME type is supplied.
 */
public class VertexLlmGatewayClient implements LlmGatewayClient {

  /**
   * Recorded in provenance when the SDK jar carries no manifest version, for example on an exploded
   * test classpath. Must match the pin in {@code build.gradle.kts}.
   */
  static final String PINNED_SDK_VERSION = "1.72.0";

  private final StudioGatewayProperties properties;
  private final GatewayResponseParser parser;
  private final GatewayAuditLogger auditLogger;
  private final Client client;
  private final GenerateContentConfig generationConfig;
  private final Bulkhead bulkhead;
  private final Retry retry;
  private final String sdkVersion;

  /**
   * @param properties validated gateway configuration
   * @param client an SDK client in Vertex AI mode with SDK retries disabled
   * @param parser defensive artifact parser
   * @param auditLogger audit sink
   */
  public VertexLlmGatewayClient(
      StudioGatewayProperties properties,
      Client client,
      GatewayResponseParser parser,
      GatewayAuditLogger auditLogger) {
    this.properties = properties;
    this.parser = parser;
    this.auditLogger = auditLogger;
    this.client = client;
    this.generationConfig = generationConfig(properties);
    this.bulkhead =
        Bulkhead.of(
            "studio-compile-gateway",
            BulkheadConfig.custom()
                .maxConcurrentCalls(properties.maxConcurrency())
                .maxWaitDuration(Duration.ZERO)
                .build());
    this.retry = Retry.of("studio-compile-gateway", retryConfig(properties));
    this.sdkVersion =
        Optional.ofNullable(Client.class.getPackage())
            .map(Package::getImplementationVersion)
            .orElse(PINNED_SDK_VERSION);
  }

  @Override
  public CompileResponse propose(CompileRequest request) {
    long startedAt = System.nanoTime();
    String payload = GatewayPayloadSerializer.serialize(request);
    int inputBytes = GatewayPayloadSerializer.utf8Size(payload);

    // Pre-flight: reject before any network call so an oversized draft costs nothing (AC-5).
    if (inputBytes > properties.maxInputBytes()) {
      return finish(
          request,
          CompileResponse.failure(
              GatewayOutcome.TOO_LARGE,
              GatewayErrorCode.COMPILE_INPUT_TOO_LARGE,
              "input is " + inputBytes + " bytes, limit is " + properties.maxInputBytes(),
              null,
              0,
              elapsedMs(startedAt),
              inputBytes,
              0));
    }

    if (!bulkhead.tryAcquirePermission()) {
      return finish(
          request,
          CompileResponse.failure(
              GatewayOutcome.BUSY,
              GatewayErrorCode.GATEWAY_BUSY,
              "bounded concurrency of " + properties.maxConcurrency() + " is saturated",
              null,
              0,
              elapsedMs(startedAt),
              inputBytes,
              0));
    }

    AtomicInteger attempts = new AtomicInteger();
    try {
      Callable<GenerateContentResponse> call =
          Retry.decorateCallable(
              retry,
              () -> {
                attempts.incrementAndGet();
                return client.models.generateContent(properties.model(), payload, generationConfig);
              });
      GenerateContentResponse raw = call.call();
      return finish(request, interpret(request, raw, attempts, startedAt, inputBytes));
    } catch (Exception e) {
      GatewayOutcome outcome = GatewayFailureClassifier.outcomeFor(e);
      CompileResponse response =
          CompileResponse.failure(
              outcome,
              GatewayFailureClassifier.errorCodeFor(outcome),
              GatewayErrorScrubber.scrub(e, request),
              null,
              retriesOf(attempts),
              elapsedMs(startedAt),
              inputBytes,
              0);
      return finish(request, response);
    } finally {
      bulkhead.onComplete();
    }
  }

  private CompileResponse interpret(
      CompileRequest request,
      GenerateContentResponse raw,
      AtomicInteger attempts,
      long startedAt,
      int inputBytes) {
    int retries = retriesOf(attempts);
    GatewayProvenance provenance =
        new GatewayProvenance(
            properties.model(),
            raw.modelVersion().filter(value -> !value.isEmpty()).orElse(null),
            request.promptVersion(),
            sdkVersion,
            properties.structuredOutput(),
            0d);

    String text;
    try {
      text = raw.text();
    } catch (RuntimeException e) {
      return CompileResponse.parseFailure(
          "no usable candidate text: " + GatewayErrorScrubber.scrub(e, request),
          provenance,
          retries,
          elapsedMs(startedAt),
          inputBytes,
          0);
    }

    int outputBytes = GatewayPayloadSerializer.utf8Size(text);
    if (outputBytes > properties.maxOutputBytes()) {
      // Discard without parsing or logging the body (AC-5).
      return CompileResponse.failure(
          GatewayOutcome.TOO_LARGE,
          GatewayErrorCode.GATEWAY_OUTPUT_TOO_LARGE,
          "response is " + outputBytes + " bytes, limit is " + properties.maxOutputBytes(),
          provenance,
          retries,
          elapsedMs(startedAt),
          inputBytes,
          outputBytes);
    }

    if (truncatedAtTokenLimit(raw)) {
      return CompileResponse.parseFailure(
          "response was truncated at the model output-token limit of "
              + properties.maxOutputTokens(),
          provenance,
          retries,
          elapsedMs(startedAt),
          inputBytes,
          outputBytes);
    }

    GatewayResponseParser.ParseResult parsed = parser.parse(text);
    if (!parsed.isValid()) {
      return CompileResponse.parseFailure(
          parsed.failureReason(),
          provenance,
          retries,
          elapsedMs(startedAt),
          inputBytes,
          outputBytes);
    }
    return CompileResponse.ok(
        parsed.artifactJson(), provenance, retries, elapsedMs(startedAt), inputBytes, outputBytes);
  }

  private CompileResponse finish(CompileRequest request, CompileResponse response) {
    auditLogger.audit(request, properties.model(), response);
    if (response.outcome() != GatewayOutcome.OK) {
      auditLogger.diagnostic(request, response.outcome(), response.failureReason());
    }
    return response;
  }

  private static GenerateContentConfig generationConfig(StudioGatewayProperties properties) {
    return GenerateContentConfig.builder()
        .responseMimeType(properties.structuredOutput() ? "application/json" : "text/plain")
        .maxOutputTokens(properties.maxOutputTokens())
        .build();
  }

  /**
   * Whether the gateway stopped because it hit the output-token ceiling.
   *
   * <p>The SDK's {@code text()} accessor returns a truncated body for this finish reason without
   * signalling it, and a cut JSON document then fails extraction with a generic parse message. The
   * outcome stays {@link GatewayOutcome#PARSE_FAILURE} so the caller-facing code vocabulary does
   * not change, but the recorded reason names truncation so an audit can tell the two apart.
   *
   * @param raw the gateway response
   * @return {@code true} when the first candidate finished at the token limit
   */
  private static boolean truncatedAtTokenLimit(GenerateContentResponse raw) {
    try {
      return raw.candidates()
          .filter(candidates -> !candidates.isEmpty())
          .map(candidates -> candidates.get(0))
          .flatMap(Candidate::finishReason)
          .map(reason -> String.valueOf(reason).contains("MAX_TOKENS"))
          .orElse(false);
    } catch (RuntimeException ignored) {
      return false;
    }
  }

  private static RetryConfig retryConfig(StudioGatewayProperties properties) {
    StudioGatewayProperties.TransportRetry policy = properties.retry();
    return RetryConfig.custom()
        .maxAttempts(policy.maxRetries() + 1)
        .intervalFunction(
            IntervalFunction.ofExponentialRandomBackoff(
                policy.initialBackoff(), policy.backoffMultiplier(), policy.jitterFactor()))
        .retryOnException(GatewayFailureClassifier::isRetryableTransport)
        .build();
  }

  private static int retriesOf(AtomicInteger attempts) {
    return Math.max(0, attempts.get() - 1);
  }

  private static long elapsedMs(long startedAt) {
    return Duration.ofNanos(System.nanoTime() - startedAt).toMillis();
  }
}
