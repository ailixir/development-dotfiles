package com.citi.put.checks.studio.compile.gateway;

import com.google.cloud.vertexai.VertexAI;
import com.google.cloud.vertexai.api.GenerateContentResponse;
import com.google.cloud.vertexai.api.GenerationConfig;
import com.google.cloud.vertexai.generativeai.GenerativeModel;
import com.google.cloud.vertexai.generativeai.ResponseHandler;
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
 * Vertex AI SDK implementation of {@link LlmGatewayClient} against the Citi/R2D2 proxy (Story 10.5,
 * AC-2, AC-4, AC-5, AC-8; architecture &sect;4.1).
 *
 * <p>This is the only class in the package that knows the SDK. SDK-level automatic retries are
 * switched off in {@link VertexAiClientFactory}; the bounded retry here is the only one, so total
 * gateway attempts stay inside the compile budget of &sect;4.3.
 *
 * <p>{@code GenerativeModel} and {@code ResponseHandler} are deprecated in google-cloud-vertexai
 * 1.52.0: Google is moving the generative-model surface to the separate {@code
 * com.google.genai:google-genai} artifact, and {@code com.google.cloud.vertexai.genai.Client} in
 * this artifact exposes agent engines only, not models. Architecture &sect;4.1 names the Vertex AI
 * SDK generative-model client, so that is what this uses; swapping SDKs is a decision SPK-01 must
 * make once R2D2's supported surface is known (see docs/qa/spikes/SPK-01/).
 */
@SuppressWarnings("deprecation")
public class VertexLlmGatewayClient implements LlmGatewayClient {

  /**
   * Recorded in provenance when the SDK jar carries no manifest version, for example on an exploded
   * test classpath. Must match the pin in {@code build.gradle.kts}.
   */
  static final String PINNED_SDK_VERSION = "1.52.0";

  private final StudioGatewayProperties properties;
  private final GatewayResponseParser parser;
  private final GatewayAuditLogger auditLogger;
  private final GenerativeModel model;
  private final Bulkhead bulkhead;
  private final Retry retry;
  private final String sdkVersion;

  /**
   * @param properties validated gateway configuration
   * @param vertexAi an SDK handle already pointed at R2D2 with auto-retries disabled
   * @param parser defensive artifact parser
   * @param auditLogger audit sink
   */
  public VertexLlmGatewayClient(
      StudioGatewayProperties properties,
      VertexAI vertexAi,
      GatewayResponseParser parser,
      GatewayAuditLogger auditLogger) {
    this.properties = properties;
    this.parser = parser;
    this.auditLogger = auditLogger;
    this.model =
        new GenerativeModel(properties.model(), vertexAi)
            .withGenerationConfig(generationConfig(properties));
    this.bulkhead =
        Bulkhead.of(
            "studio-compile-gateway",
            BulkheadConfig.custom()
                .maxConcurrentCalls(properties.maxConcurrency())
                .maxWaitDuration(Duration.ZERO)
                .build());
    this.retry = Retry.of("studio-compile-gateway", retryConfig(properties));
    this.sdkVersion =
        Optional.ofNullable(VertexAI.class.getPackage())
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
                return model.generateContent(payload);
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
            emptyToNull(raw.getModelVersion()),
            request.promptVersion(),
            sdkVersion,
            properties.structuredOutput(),
            properties.temperature());

    String text;
    try {
      text = ResponseHandler.getText(raw);
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

  private static GenerationConfig generationConfig(StudioGatewayProperties properties) {
    return GenerationConfig.newBuilder()
        .setTemperature((float) properties.temperature())
        .setResponseMimeType(properties.structuredOutput() ? "application/json" : "text/plain")
        .build();
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

  private static String emptyToNull(String value) {
    return value == null || value.isEmpty() ? null : value;
  }
}
