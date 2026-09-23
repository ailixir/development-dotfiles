package com.citi.put.checks.studio.compile.gateway;

import com.citi.put.checks.studio.compile.CompileBudget;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.genai.Client;
import com.google.genai.types.ClientOptions;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.GenerateContentResponse;
import com.google.genai.types.HttpOptions;
import com.google.genai.types.HttpRetryOptions;
import com.google.genai.types.Part;
import com.google.genai.types.ThinkingConfig;
import com.google.genai.types.ThinkingLevel;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.concurrent.Semaphore;
import okhttp3.OkHttpClient;

/**
 * Maintained Google Gen AI adapter. Live R2D2 compatibility remains an explicit enablement gate.
 */
public final class GenAiLlmGatewayClient implements LlmGatewayClient, AutoCloseable {
  public static final String SDK_VERSION = "1.71.0";
  private final StudioGatewayProperties properties;
  private final GatewayResponseParser parser;
  private final GatewayAuditLogger audit;
  private final Semaphore capacity;
  private final Client client;
  private final BoundedCredentialProvider credentialProvider;
  private final ThreadLocal<CallContext> active = new ThreadLocal<>();

  private record CallContext(CompileBudget budget, List<Runnable> removals, String token) {}

  public GenAiLlmGatewayClient(
      StudioGatewayProperties properties, GatewayResponseParser parser, GatewayAuditLogger audit)
      throws IOException {
    this(properties, parser, audit, credentialProvider(properties));
  }

  GenAiLlmGatewayClient(
      StudioGatewayProperties properties,
      GatewayResponseParser parser,
      GatewayAuditLogger audit,
      BoundedCredentialProvider credentialProvider)
      throws IOException {
    properties.validateForVertex();
    this.credentialProvider = credentialProvider;
    this.properties = properties;
    this.parser = parser;
    this.audit = audit;
    capacity = new Semaphore(properties.maxConcurrency());
    OkHttpClient http =
        new OkHttpClient.Builder()
            .retryOnConnectionFailure(false)
            .addInterceptor(
                chain -> {
                  CallContext context = active.get();
                  if (context == null) {
                    throw new IllegalStateException("missing compile budget");
                  }
                  context.budget().remaining();
                  context.removals().add(context.budget().onCancel(chain.call()::cancel));
                  okhttp3.Request outgoing = chain.request();
                  if (context.token() == null) {
                    outgoing =
                        outgoing
                            .newBuilder()
                            .removeHeader("Authorization")
                            .removeHeader("x-goog-api-key")
                            .build();
                  } else {
                    outgoing =
                        outgoing
                            .newBuilder()
                            .header("Authorization", "Bearer " + context.token())
                            .build();
                  }
                  return chain.proceed(outgoing);
                })
            .build();
    GoogleCredentials staticCredentials =
        GoogleCredentials.create(
            new com.google.auth.oauth2.AccessToken("", new java.util.Date(Long.MAX_VALUE)));
    if (credentialProvider != null && credentialProvider.quotaProjectId() != null) {
      staticCredentials =
          staticCredentials.createWithQuotaProject(credentialProvider.quotaProjectId());
    }
    Client.Builder builder =
        Client.builder()
            .vertexAI(true)
            .project(properties.project())
            .location(properties.location())
            .credentials(staticCredentials);
    client =
        builder
            .clientOptions(ClientOptions.builder().customHttpClient(http).build())
            .httpOptions(
                HttpOptions.builder()
                    .baseUrl(properties.endpoint())
                    .apiVersion("v1")
                    .retryOptions(HttpRetryOptions.builder().attempts(1).build())
                    .build())
            .build();
  }

  private static BoundedCredentialProvider credentialProvider(StudioGatewayProperties properties)
      throws IOException {
    properties.validateForVertex();
    return StudioGatewayProperties.MODE_NONE.equalsIgnoreCase(properties.credentials().mode())
        ? null
        : new BoundedCredentialProvider(properties);
  }

  @Override
  public String compilationSettings() {
    var settings = new java.util.TreeMap<String, Object>();
    settings.put("model", properties.model());
    settings.put("endpoint", properties.endpoint());
    settings.put("project", properties.project());
    settings.put("location", properties.location());
    settings.put("sdkVersion", SDK_VERSION);
    settings.put("temperature", properties.temperature());
    settings.put("maxOutputTokens", properties.maxOutputTokens());
    // The level actually requested, or PROVIDER_DEFAULT when thinkingConfig is switched off
    // (Story 10.45 AC 6/7). The systemInstruction switch is deliberately not recorded: it moves
    // the identical static bytes, and the spec's fingerprint inputs do not include it.
    settings.put("thinkingLevel", properties.effectiveThinkingLevel());
    settings.put("envelopeVersion", 1);
    settings.put("providerSchemaVersion", 1);
    try {
      return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(settings);
    } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
      throw new IllegalStateException("Cannot encode gateway settings", error);
    }
  }

  @Override
  public CompileResponse propose(CompileRequest request) {
    return propose(request, new CompileBudget(properties.requestTimeout()));
  }

  @Override
  public CompileResponse propose(CompileRequest request, CompileBudget budget) {
    long start = System.nanoTime();
    boolean systemInstruction = properties.providerFeatures().systemInstruction();
    String staticPrefix = GatewayPayloadSerializer.staticPrefix(request);
    // With systemInstruction the static prefix leaves as its own field; without it (EC-17) the
    // identical bytes lead the single user part. Either way the count is what leaves the process.
    String payload =
        systemInstruction
            ? GatewayPayloadSerializer.requestContents(request)
            : GatewayPayloadSerializer.serialize(request);
    int bytes =
        GatewayPayloadSerializer.utf8Size(payload)
            + (systemInstruction ? GatewayPayloadSerializer.utf8Size(staticPrefix) : 0);
    CompileResponse response;
    if (bytes > properties.maxInputBytes()) {
      response =
          failure(
              GatewayOutcome.TOO_LARGE,
              GatewayErrorCode.COMPILE_INPUT_TOO_LARGE,
              "complete context exceeds input byte limit",
              0,
              start,
              bytes);
    } else if (!capacity.tryAcquire()) {
      response =
          failure(
              GatewayOutcome.BUSY,
              GatewayErrorCode.GATEWAY_BUSY,
              "gateway capacity exhausted",
              0,
              start,
              bytes);
    } else {
      List<Runnable> removals = new ArrayList<>();
      active.set(new CallContext(budget, removals, null));
      int attempts = 0;
      try {
        budget.proposal();
        String token = credentialProvider == null ? null : credentialProvider.token(budget);
        budget.remaining();
        active.set(new CallContext(budget, removals, token));
        while (true) {
          budget.transport();
          budget.accountInput(bytes);
          attempts++;
          try {
            int timeout =
                (int)
                    Math.max(
                        1,
                        Math.min(
                            Integer.MAX_VALUE, budget.cap(properties.requestTimeout()).toMillis()));
            GenerateContentConfig config =
                generationConfig(request, systemInstruction ? staticPrefix : null, timeout);
            GenerateContentResponse raw =
                client.models.generateContent(properties.model(), payload, config);
            budget.remaining();
            response = interpret(request, raw, attempts - 1, start, bytes);
            budget.accountOutput(
                response.outputBytes(),
                response.provenance().inputTokens(),
                response.provenance().outputTokens());
            break;
          } catch (RuntimeException error) {
            if (attempts > properties.retry().maxRetries() || !retryable(error)) {
              throw error;
            }
            double scale = Math.pow(properties.retry().backoffMultiplier(), attempts - 1d);
            double jitter = properties.retry().jitterFactor();
            if (jitter > 0) {
              scale *=
                  java.util.concurrent.ThreadLocalRandom.current()
                      .nextDouble(1 - jitter, 1 + jitter);
            }
            budget.backoff(
                Duration.ofMillis(
                    Math.max(1, (long) (properties.retry().initialBackoff().toMillis() * scale))));
          }
        }
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt();
        budget.cancel();
        response =
            failure(
                GatewayOutcome.TIMEOUT,
                GatewayErrorCode.GATEWAY_TIMEOUT,
                "compile cancelled",
                Math.max(0, attempts - 1),
                start,
                bytes);
      } catch (IOException | RuntimeException error) {
        boolean timeout =
            budget.isCancelled()
                || error instanceof CancellationException
                || GatewayFailureClassifier.outcomeFor(error) == GatewayOutcome.TIMEOUT;
        response =
            failure(
                timeout ? GatewayOutcome.TIMEOUT : GatewayOutcome.TRANSPORT,
                timeout ? GatewayErrorCode.GATEWAY_TIMEOUT : GatewayErrorCode.GATEWAY_TRANSPORT,
                timeout ? "compile deadline or cancellation" : "gateway transport failed",
                Math.max(0, attempts - 1),
                start,
                bytes);
      } finally {
        removals.forEach(Runnable::run);
        active.remove();
        // The synchronous transport has returned before capacity is released.
        capacity.release();
      }
    }
    audit.audit(request, properties.model(), response);
    return response;
  }

  /**
   * The generation config for one transport attempt.
   *
   * <p>No sampling temperature is sent: Gemini 3.x is tuned for its default and the configured
   * value is a legacy bound recorded on provenance only. The thinking level is always sent
   * explicitly unless the EC-17 switch is off, and a thinking budget is never sent, because the
   * provider rejects a request that carries both (Story 10.45 AC 6).
   *
   * @param request the compile request
   * @param staticPrefix the static prefix to send as {@code systemInstruction}, or {@code null}
   *     when it travels inside the user part instead
   * @param timeoutMillis the per-attempt transport timeout
   * @return the config
   */
  GenerateContentConfig generationConfig(
      CompileRequest request, String staticPrefix, int timeoutMillis) {
    GenerateContentConfig.Builder config =
        GenerateContentConfig.builder()
            .maxOutputTokens(properties.maxOutputTokens())
            .responseMimeType("application/json")
            .responseJsonSchema(providerSchema(request))
            .httpOptions(
                HttpOptions.builder()
                    .timeout(timeoutMillis)
                    .retryOptions(HttpRetryOptions.builder().attempts(1).build())
                    .build());
    if (staticPrefix != null) {
      config.systemInstruction(Content.fromParts(Part.fromText(staticPrefix)));
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

  private CompileResponse interpret(
      CompileRequest request,
      GenerateContentResponse raw,
      int retries,
      long start,
      int inputBytes) {
    String finish =
        raw.candidates()
            .filter(c -> c.size() == 1)
            .flatMap(c -> c.getFirst().finishReason())
            .map(Object::toString)
            .map(
                value ->
                    java.util.Set.of(
                                "STOP",
                                "MAX_TOKENS",
                                "SAFETY",
                                "RECITATION",
                                "BLOCKLIST",
                                "PROHIBITED_CONTENT",
                                "SPII",
                                "MALFORMED_FUNCTION_CALL",
                                "OTHER")
                            .contains(value)
                        ? value
                        : "UNKNOWN")
            .orElse("MISSING");
    Integer inputTokens = raw.usageMetadata().flatMap(u -> u.promptTokenCount()).orElse(null);
    Integer outputTokens = raw.usageMetadata().flatMap(u -> u.candidatesTokenCount()).orElse(null);
    GatewayProvenance provenance =
        new GatewayProvenance(
            properties.model(),
            raw.modelVersion().orElse(null),
            request.promptVersion(),
            SDK_VERSION,
            true,
            properties.temperature(),
            properties.maxOutputTokens(),
            finish,
            inputTokens,
            outputTokens,
            inputTokens != null && outputTokens != null);
    if (!"STOP".equals(finish)) {
      return CompileResponse.parseFailure(
          "unusable model finish reason", provenance, retries, elapsed(start), inputBytes, 0);
    }
    String text = raw.text();
    int bytes = GatewayPayloadSerializer.utf8Size(text);
    if (bytes > properties.maxOutputBytes()) {
      return CompileResponse.failure(
          GatewayOutcome.TOO_LARGE,
          GatewayErrorCode.GATEWAY_OUTPUT_TOO_LARGE,
          "model output exceeds byte limit",
          provenance,
          retries,
          elapsed(start),
          inputBytes,
          bytes);
    }
    GatewayResponseParser.ParseResult parsed =
        parser.parseProposal(text, request.proposalKind(), request.writableStepIds());
    if (!parsed.isValid()) {
      return CompileResponse.parseFailure(
          parsed.failureReason(), provenance, retries, elapsed(start), inputBytes, bytes);
    }
    return CompileResponse.ok(
        parsed.artifactJson(), provenance, retries, elapsed(start), inputBytes, bytes);
  }

  /**
   * Provider-supported subset only; the strict local envelope validator is authoritative.
   *
   * <p>Every map is insertion-ordered (Story 10.45 AC 5). {@code Map.of} iterates in an order that
   * depends on a per-JVM random salt, so the serialized schema bytes used to differ between JVMs
   * and replicas. The schema content is unchanged; only its key order is now fixed.
   */
  static Map<String, Object> providerSchema(CompileRequest request) {
    Map<String, Object> stepProperties = new LinkedHashMap<>();
    stepProperties.put(
        "stepId",
        typed("string", "enum", request.writableStepIds().stream().map(Object::toString).toList()));
    stepProperties.put(
        "status", typed("string", "enum", List.of("GENERATED", "UNSUPPORTED", "CLARIFICATION")));
    stepProperties.put("code", typed("string"));
    stepProperties.put(
        "reason", typed("string", "enum", List.of("UNSUPPORTED_CAPABILITY", "AMBIGUOUS_INTENT")));
    stepProperties.put("message", typed("string"));
    Map<String, Object> step = typed("object", "required", List.of("stepId", "status"));
    step.put("properties", stepProperties);

    Map<String, Object> version = typed("integer", "minimum", 1);
    version.put("maximum", 1);
    Map<String, Object> steps = typed("array", "minItems", request.writableStepIds().size());
    steps.put("maxItems", request.writableStepIds().size());
    steps.put("items", step);
    Map<String, Object> envelopeProperties = new LinkedHashMap<>();
    envelopeProperties.put("version", version);
    envelopeProperties.put("kind", typed("string", "enum", List.of(request.proposalKind())));
    envelopeProperties.put("steps", steps);
    Map<String, Object> envelope = typed("object", "required", List.of("version", "kind", "steps"));
    envelope.put("properties", envelopeProperties);
    return envelope;
  }

  private static Map<String, Object> typed(String type) {
    Map<String, Object> node = new LinkedHashMap<>();
    node.put("type", type);
    return node;
  }

  private static Map<String, Object> typed(String type, String key, Object value) {
    Map<String, Object> node = typed(type);
    node.put(key, value);
    return node;
  }

  private static boolean retryable(Throwable error) {
    if (error instanceof com.google.genai.errors.ApiException api) {
      return api.code() == 429 || api.code() == 503;
    }
    return GatewayFailureClassifier.isRetryableTransport(error);
  }

  private static CompileResponse failure(
      GatewayOutcome outcome,
      GatewayErrorCode code,
      String reason,
      int retries,
      long start,
      int bytes) {
    return CompileResponse.failure(outcome, code, reason, null, retries, elapsed(start), bytes, 0);
  }

  private static long elapsed(long start) {
    return Duration.ofNanos(System.nanoTime() - start).toMillis();
  }

  @Override
  public void close() {
    client.close();
    if (credentialProvider != null) {
      credentialProvider.close();
    }
  }
}
