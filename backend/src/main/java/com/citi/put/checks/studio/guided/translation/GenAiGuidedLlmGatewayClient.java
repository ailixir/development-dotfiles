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
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;

/** One provider call for an already reserved guided attempt. No retry or allocation authority. */
public final class GenAiGuidedLlmGatewayClient implements GuidedLlmGatewayClient {
  private final GenAiGatewayTransport transport;
  private final GuidedResponseParser parser;
  private final ObjectMapper mapper = new ObjectMapper();

  public GenAiGuidedLlmGatewayClient(GenAiGatewayTransport transport, GuidedResponseParser parser) {
    this.transport = transport;
    this.parser = parser;
  }

  @Override
  public GuidedModelResponse propose(GuidedModelRequest request, GuidedCallBudget budget) {
    var properties = transport.properties();
    Integer inputTokens = null;
    Integer outputTokens = null;
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
        lease.authenticate();
        Duration left = budget.remaining();
        int timeout =
            (int)
                Math.max(
                    1,
                    Math.min(
                        Integer.MAX_VALUE,
                        Math.min(left.toMillis(), properties.requestTimeout().toMillis())));
        boolean system = properties.providerFeatures().systemInstruction();
        GenerateContentResponse raw =
            lease.generate(
                system ? payload : request.outputContract() + "\n\n" + payload,
                config(request, timeout, system),
                true);
        Usage usage = reportedUsage(raw);
        inputTokens = usage.input();
        outputTokens = usage.output();
        if (raw.candidates().isEmpty() || raw.candidates().get().size() != 1) {
          return result(GuidedModelResponse.Code.INVALID_RESPONSE, inputTokens, outputTokens);
        }
        var candidate = raw.candidates().get().getFirst();
        if (!candidate.finishReason().map(Object::toString).filter("STOP"::equals).isPresent()) {
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
          var proposal = parser.parse(request, text.toString().getBytes(StandardCharsets.UTF_8));
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
      try {
        budget.remaining();
      } catch (CancellationException cancelled) {
        timeout = true;
      }
      return result(
          timeout ? GuidedModelResponse.Code.TIMEOUT : GuidedModelResponse.Code.TRANSPORT,
          inputTokens,
          outputTokens);
    }
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

  private record Usage(Integer input, Integer output) {}

  /**
   * Counts reported supplements without reading thought content or counting cached prompts twice.
   */
  private static Usage reportedUsage(GenerateContentResponse response) {
    var metadata = response.usageMetadata();
    if (metadata.isEmpty()) {
      return new Usage(null, null);
    }
    var usage = metadata.get();
    Integer prompt = nonnegative(usage.promptTokenCount().orElse(null));
    Integer candidates = nonnegative(usage.candidatesTokenCount().orElse(null));
    Integer tools = nonnegative(usage.toolUsePromptTokenCount().orElse(null));
    Integer thoughts = nonnegative(usage.thoughtsTokenCount().orElse(null));
    // Cached content is already included in promptTokenCount. Validate, never add it again.
    nonnegative(usage.cachedContentTokenCount().orElse(null));
    Integer total = nonnegative(usage.totalTokenCount().orElse(null));
    Integer input = sumReported(prompt, tools);
    Integer output = sumReported(candidates, thoughts);
    if (total != null && input != null && output != null && Math.addExact(input, output) != total) {
      throw new IllegalArgumentException("Inconsistent provider usage metadata");
    }
    return new Usage(input, output);
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
