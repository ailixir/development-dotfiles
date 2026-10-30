package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.gateway.GenAiGatewayTransport;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.GenerateContentResponse;
import com.google.genai.types.HttpOptions;
import com.google.genai.types.HttpRetryOptions;
import com.google.genai.types.Part;
import com.google.genai.types.ThinkingConfig;
import com.google.genai.types.ThinkingLevel;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.concurrent.TimeUnit;

/** One provider call for an already reserved guided attempt. No retry or allocation authority. */
public final class GenAiGuidedLlmGatewayClient implements GuidedLlmGatewayClient {
  static final String CALL_TIMER = "studio.guided.model.call";
  static final String CACHED_TOKENS = "studio.guided.model.cached.tokens";

  /** Bucket bounds in seconds, spanning the per-send cap and the call budget. */
  private static final long[] CALL_BUCKETS = {1, 5, 10, 20, 30, 45, 50, 60, 90, 120};

  private final GenAiGatewayTransport transport;
  private final GuidedResponseParser parser;
  private final MeterRegistry registry;
  private final DistributionSummary cachedTokens;
  private final ObjectMapper mapper = new ObjectMapper();

  public GenAiGuidedLlmGatewayClient(GenAiGatewayTransport transport, GuidedResponseParser parser) {
    this(transport, parser, new SimpleMeterRegistry());
  }

  public GenAiGuidedLlmGatewayClient(
      GenAiGatewayTransport transport, GuidedResponseParser parser, MeterRegistry registry) {
    this.transport = transport;
    this.parser = parser;
    this.registry = registry;
    cachedTokens =
        DistributionSummary.builder(CACHED_TOKENS)
            .description("Prompt tokens served from the provider cache, per model call")
            .baseUnit("tokens")
            .register(registry);
  }

  @Override
  public GuidedModelResponse propose(GuidedModelRequest request, GuidedCallBudget budget) {
    return propose(request, budget, GuidedRefusalDiagnostics.Capture.NONE);
  }

  @Override
  public GuidedModelResponse propose(
      GuidedModelRequest request,
      GuidedCallBudget budget,
      GuidedRefusalDiagnostics.Capture capture) {
    long entered = System.nanoTime();
    long[] sendStarted = {0};
    GuidedModelResponse response = send(request, budget, capture, sendStarted);
    // Timed from the send itself, so waiting for a permit never inflates the model's latency. A
    // call that never reached the wire (busy, oversized, no credential) is timed from entry.
    long began = sendStarted[0] == 0 ? entered : sendStarted[0];
    Timer.builder(CALL_TIMER)
        .description("One guided model call, by request kind and outcome")
        .tag("kind", request.kind().name())
        .tag("outcome", outcome(response))
        .serviceLevelObjectives(
            java.util.Arrays.stream(CALL_BUCKETS)
                .mapToObj(java.time.Duration::ofSeconds)
                .toArray(Duration[]::new))
        .register(registry)
        .record(System.nanoTime() - began, TimeUnit.NANOSECONDS);
    return response;
  }

  /** A small fixed set: the result code, with the transport reasons that mean something apart. */
  private static String outcome(GuidedModelResponse response) {
    return switch (response.code()) {
      case OK -> "ok";
      case INVALID_RESPONSE -> "invalid_response";
      case TOO_LARGE -> "too_large";
      case BUSY -> "busy";
      case TIMEOUT -> "timeout";
      case DISABLED -> "disabled";
      case TRANSPORT -> transportOutcome(response.reason());
    };
  }

  private static String transportOutcome(GuidedModelResponse.Reason reason) {
    return switch (reason) {
      case TRANSPORT_STALL -> "stall";
      case TRANSPORT_HTTP_429 -> "throttled";
      case TRANSPORT_HTTP_503, TRANSPORT_HTTP_5XX -> "server_error";
      case TRANSPORT_HTTP_400, TRANSPORT_HTTP_401_403, TRANSPORT_HTTP_4XX -> "refused";
      case TRANSPORT_CONNECT -> "connect";
      default -> "error";
    };
  }

  private GuidedModelResponse send(
      GuidedModelRequest request,
      GuidedCallBudget budget,
      GuidedRefusalDiagnostics.Capture capture,
      long[] sendStarted) {
    var properties = transport.properties();
    Integer inputTokens = null;
    Integer outputTokens = null;
    // Stage flags classify a failure into a closed persisted token; no message is ever read.
    boolean authenticating = false;
    boolean generating = false;
    boolean usageFailed = false;
    // Decided before the send: the per-send cap is strictly the shortest limit on that send.
    boolean capBound = false;
    // Whether the single network send received response headers (closed boolean from the lease).
    boolean responseStarted = false;
    try {
      budget.remaining();
      String payload = payload(request);
      if ((long) bytes(payload) + bytes(request.outputContract()) > properties.maxInputBytes()) {
        return result(GuidedModelResponse.Code.TOO_LARGE, null, null);
      }
      GenAiGatewayTransport.Budget deadline =
          new GenAiGatewayTransport.Budget() {
            @Override
            public Duration remaining() {
              return budget.remaining();
            }

            @Override
            public AutoCloseable onCancel(Runnable action) {
              return budget.onCancel(action);
            }
          };
      try (GenAiGatewayTransport.Lease lease = transport.tryAcquire(deadline)) {
        if (lease == null) {
          return result(GuidedModelResponse.Code.BUSY, null, null);
        }
        authenticating = true;
        lease.authenticate();
        authenticating = false;
        Duration left = budget.remaining();
        long otherLimit = Math.min(left.toMillis(), properties.requestTimeout().toMillis());
        long cap = budget.sendCap() == null ? Long.MAX_VALUE : budget.sendCap().toMillis();
        capBound = cap < otherLimit;
        int timeout = (int) Math.max(1, Math.min(Integer.MAX_VALUE, Math.min(otherLimit, cap)));
        boolean system = properties.providerFeatures().systemInstruction();
        generating = true;
        sendStarted[0] = System.nanoTime();
        GenerateContentResponse raw;
        try {
          raw =
              lease.generate(
                  system ? payload : request.outputContract() + "\n\n" + payload,
                  config(request, timeout, system),
                  true);
        } finally {
          responseStarted = lease.responseStarted();
        }
        generating = false;
        Usage usage;
        try {
          usage = reportedUsage(raw);
        } catch (RuntimeException failure) {
          usageFailed = true;
          GuidedRefusalDiagnostics.record(capture, GuidedRefusalDiagnostics.Gate.ADAPTER_USAGE);
          throw failure;
        }
        inputTokens = usage.input();
        outputTokens = usage.output();
        if (usage.cached() != null) {
          cachedTokens.record(usage.cached());
        }
        if (raw.candidates().isEmpty() || raw.candidates().get().size() != 1) {
          GuidedRefusalDiagnostics.record(capture, GuidedRefusalDiagnostics.Gate.ADAPTER_CANDIDATE);
          return result(GuidedModelResponse.Code.INVALID_RESPONSE, inputTokens, outputTokens);
        }
        var candidate = raw.candidates().get().getFirst();
        if (!candidate.finishReason().map(Object::toString).filter("STOP"::equals).isPresent()) {
          GuidedRefusalDiagnostics.record(capture, GuidedRefusalDiagnostics.Gate.ADAPTER_FINISH);
          return result(GuidedModelResponse.Code.INVALID_RESPONSE, inputTokens, outputTokens);
        }
        List<Part> parts = candidate.content().flatMap(Content::parts).orElse(List.of());
        StringBuilder text = new StringBuilder();
        int outputBytes = 0;
        for (Part part : parts) {
          if (part.thought().orElse(false)) {
            continue;
          }
          if (part.text().isEmpty()
              || part.functionCall().isPresent()
              || part.executableCode().isPresent()
              || part.codeExecutionResult().isPresent()
              || part.inlineData().isPresent()
              || part.fileData().isPresent()) {
            GuidedRefusalDiagnostics.record(capture, GuidedRefusalDiagnostics.Gate.ADAPTER_CONTENT);
            return result(GuidedModelResponse.Code.INVALID_RESPONSE, inputTokens, outputTokens);
          }
          String fragment = part.text().get();
          outputBytes += bytes(fragment);
          if (outputBytes > Math.min(properties.maxOutputBytes(), 65536)) {
            return result(GuidedModelResponse.Code.TOO_LARGE, inputTokens, outputTokens);
          }
          text.append(fragment);
        }
        // Avoid SDK text()/finish helpers: they may log provider prose for unusual responses.
        try {
          byte[] response = text.toString().getBytes(StandardCharsets.UTF_8);
          var proposal =
              capture == GuidedRefusalDiagnostics.Capture.NONE
                  ? parser.parse(request, response)
                  : parser.parse(request, response, capture);
          budget.remaining();
          return new GuidedModelResponse(
              GuidedModelResponse.Code.OK, proposal, inputTokens, outputTokens, properties.model());
        } catch (CancellationException cancelled) {
          return result(GuidedModelResponse.Code.TIMEOUT, inputTokens, outputTokens);
        } catch (RuntimeException invalid) {
          return result(GuidedModelResponse.Code.INVALID_RESPONSE, inputTokens, outputTokens);
        }
      }
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      budget.cancel();
      return result(GuidedModelResponse.Code.TIMEOUT, inputTokens, outputTokens);
    } catch (IOException | RuntimeException failure) {
      // Only closed codes and validated numeric usage cross this boundary. No SDK message/cause,
      // headers, body, response modelVersion or generated prose enters logs or repair channels.
      if (GenAiGatewayTransport.exceedsWireLimit(failure)) {
        return result(GuidedModelResponse.Code.TOO_LARGE, inputTokens, outputTokens);
      }
      boolean timeout =
          failure instanceof CancellationException || GenAiGatewayTransport.isTimeout(failure);
      // Read before remaining(), which itself marks an elapsed deadline as cancelled.
      boolean cancelledEarlier = budget.cancelled();
      boolean deadlineHit = false;
      try {
        budget.remaining();
      } catch (CancellationException cancelled) {
        deadlineHit = true;
      }
      if (timeout && generating && capBound && !responseStarted && !cancelledEarlier) {
        // The cap was the binding limit, it expired, and no response headers had arrived: a
        // pre-response stall. The coordinator may make a fresh, fully charged attempt. A timeout
        // after headers (mid-body), with a non-binding cap, or after a cancellation stays TIMEOUT.
        return new GuidedModelResponse(
            GuidedModelResponse.Code.TRANSPORT,
            null,
            inputTokens,
            outputTokens,
            transport.properties().model(),
            GuidedModelResponse.Reason.TRANSPORT_STALL);
      }
      if (timeout || deadlineHit) {
        return result(GuidedModelResponse.Code.TIMEOUT, inputTokens, outputTokens);
      }
      GuidedModelResponse.Reason reason =
          authenticating
              ? GuidedModelResponse.Reason.TRANSPORT_CREDENTIAL
              : usageFailed
                  ? GuidedModelResponse.Reason.TRANSPORT_USAGE
                  : generating
                      ? transportReason(failure)
                      : GuidedModelResponse.Reason.TRANSPORT_OTHER;
      return new GuidedModelResponse(
          GuidedModelResponse.Code.TRANSPORT,
          null,
          inputTokens,
          outputTokens,
          transport.properties().model(),
          reason);
    }
  }

  /** Buckets a send failure by exception type and integer HTTP status only. */
  private static GuidedModelResponse.Reason transportReason(Throwable failure) {
    return switch (GenAiGatewayTransport.transportFailure(failure)) {
      case CONNECT -> GuidedModelResponse.Reason.TRANSPORT_CONNECT;
      case HTTP_429 -> GuidedModelResponse.Reason.TRANSPORT_HTTP_429;
      case HTTP_503 -> GuidedModelResponse.Reason.TRANSPORT_HTTP_503;
      case HTTP_400 -> GuidedModelResponse.Reason.TRANSPORT_HTTP_400;
      case HTTP_401_403 -> GuidedModelResponse.Reason.TRANSPORT_HTTP_401_403;
      case HTTP_4XX -> GuidedModelResponse.Reason.TRANSPORT_HTTP_4XX;
      case HTTP_5XX -> GuidedModelResponse.Reason.TRANSPORT_HTTP_5XX;
      case OTHER -> GuidedModelResponse.Reason.TRANSPORT_OTHER;
    };
  }

  private String payload(GuidedModelRequest request) throws JsonProcessingException {
    var envelope = mapper.createObjectNode();
    envelope.put("kind", request.kind().name());
    envelope.put("requestId", request.requestId());
    envelope.put("attempt", request.attempt());
    envelope.set("context", request.projection().document());
    return mapper.writeValueAsString(envelope);
  }

  private GenerateContentConfig config(GuidedModelRequest request, int timeout, boolean system) {
    var properties = transport.properties();
    Map<String, Object> schema =
        mapper.convertValue(request.responseSchema(), new TypeReference<>() {});
    var config =
        GenerateContentConfig.builder()
            .maxOutputTokens(Math.min(request.maxOutputTokens(), properties.maxOutputTokens()))
            .responseMimeType("application/json")
            .responseJsonSchema(schema)
            .httpOptions(
                HttpOptions.builder()
                    .timeout(timeout)
                    .retryOptions(HttpRetryOptions.builder().attempts(1).build())
                    .build());
    if (system) {
      config.systemInstruction(Content.fromParts(Part.fromText(request.outputContract())));
    }
    if (properties.providerFeatures().thinkingConfig()) {
      config.thinkingConfig(
          ThinkingConfig.builder()
              .thinkingLevel(
                  new ThinkingLevel(ThinkingLevel.Known.valueOf(properties.thinkingLevel().name())))
              .build());
    }
    return config.build();
  }

  private GuidedModelResponse result(GuidedModelResponse.Code code, Integer input, Integer output) {
    return new GuidedModelResponse(code, null, input, output, transport.properties().model());
  }

  private record Usage(Integer input, Integer output, Integer cached) {}

  /**
   * Counts reported supplements without reading thought content or counting cached prompts twice.
   */
  private static Usage reportedUsage(GenerateContentResponse response) {
    var metadata = response.usageMetadata();
    if (metadata.isEmpty()) {
      return new Usage(null, null, null);
    }
    var usage = metadata.get();
    Integer prompt = nonnegative(usage.promptTokenCount().orElse(null));
    Integer candidates = nonnegative(usage.candidatesTokenCount().orElse(null));
    Integer tools = nonnegative(usage.toolUsePromptTokenCount().orElse(null));
    Integer thoughts = nonnegative(usage.thoughtsTokenCount().orElse(null));
    // Cached content is already included in promptTokenCount. Validate, never add it again. The
    // provider omits the field when nothing was cached, so absent beside usage reads as zero.
    Integer cached = nonnegative(usage.cachedContentTokenCount().orElse(0));
    Integer total = nonnegative(usage.totalTokenCount().orElse(null));
    Integer input = sumReported(prompt, tools);
    Integer output = sumReported(candidates, thoughts);
    if (total != null && input != null && output != null && Math.addExact(input, output) != total) {
      throw new IllegalArgumentException("Inconsistent provider usage metadata");
    }
    return new Usage(input, output, cached);
  }

  private static Integer sumReported(Integer required, Integer supplement) {
    // Missing primary counts remain unknown. Optional supplements are counted only when reported.
    return required == null ? null : Math.addExact(required, supplement == null ? 0 : supplement);
  }

  private static Integer nonnegative(Integer value) {
    if (value != null && value < 0) {
      throw new IllegalArgumentException("Negative provider usage metadata");
    }
    return value;
  }

  private static int bytes(String value) {
    return value.getBytes(StandardCharsets.UTF_8).length;
  }
}
