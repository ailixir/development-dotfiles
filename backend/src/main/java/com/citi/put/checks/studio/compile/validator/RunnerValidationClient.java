package com.citi.put.checks.studio.compile.validator;

import com.citi.put.checks.studio.compile.CompileBudget;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

/**
 * The backend's client for runner {@code POST /v1/validate} (Story 10.8, AC-12a; architecture
 * &sect;8.4).
 *
 * <p>Four properties are load-bearing and each is asserted by a test rather than described:
 *
 * <ol>
 *   <li><b>Exactly one call per compile attempt, with no automatic retry.</b> A timeout, transport
 *       loss or {@code 5xx} is a compile failure, not a reason to ask again — the validator is
 *       deterministic, so a second call either costs the same budget for the same answer or hides
 *       the fact that the runner is unwell.
 *   <li><b>A bounded wall-clock timeout</b> on the request factory, not a hopeful deadline.
 *   <li><b>A closed request body</b> of exactly {@code artifact}, {@code source} and {@code
 *       references}; the runner rejects an undeclared key with a {@code 400}, so a field added here
 *       without amending the contract fails loudly instead of being ignored.
 *   <li><b>Names only in {@code references}.</b> The declared variable and secret names travel so
 *       the validator can check that {@code vars.get}/{@code vars.secret} calls correspond to the
 *       source. A resolved value never does (&sect;4.3, &sect;9.2).
 * </ol>
 *
 * <p>The response is never logged: it can carry bounded source excerpts inside diagnostics, and
 * those belong in {@code compile_diagnostics} after bounding and redaction, not in a log line.
 */
public class RunnerValidationClient {

  private static final Logger LOGGER = LoggerFactory.getLogger(RunnerValidationClient.class);
  private static final ObjectMapper MAPPER =
      new ObjectMapper()
          .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
          .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
  private static final int MAX_REASON_LENGTH = 200;
  private static final int MAX_RESPONSE_BYTES = 1_048_576;

  private final RestClient restClient;
  private final StudioRunnerProperties properties;
  private final String expectedValidatorVersion;
  private final java.net.http.HttpClient boundedHttpClient;
  private final AtomicLong calls = new AtomicLong();

  public RunnerValidationClient(RestClient restClient, StudioRunnerProperties properties) {
    this(restClient, properties, "1.0.0");
  }

  public RunnerValidationClient(
      RestClient restClient, StudioRunnerProperties properties, String expectedValidatorVersion) {
    this.restClient = restClient;
    this.properties = properties;
    this.expectedValidatorVersion = Objects.requireNonNull(expectedValidatorVersion);
    this.boundedHttpClient =
        java.net.http.HttpClient.newBuilder()
            .connectTimeout(
                properties.connectTimeout() == null
                    ? java.time.Duration.ofSeconds(2)
                    : properties.connectTimeout())
            .followRedirects(java.net.http.HttpClient.Redirect.NEVER)
            .build();
    if (expectedValidatorVersion.isBlank()) {
      throw new IllegalArgumentException("Expected validator version must not be blank");
    }
  }

  /**
   * Validates one candidate artifact. Issues at most one HTTP request and never retries.
   *
   * @param artifactJson the candidate artifact document
   * @param orderedSource the ordered original step lines the artifact claims to compile
   * @param variableNames declared variable names, never values
   * @param secretNames declared secret ids, never values
   * @return the verdict, or {@link ValidationOutcome#unavailable(String)} when none was produced
   */
  public ValidationOutcome validate(
      String artifactJson,
      List<String> orderedSource,
      Collection<String> variableNames,
      Collection<String> secretNames) {
    if (!properties.isConfigured()) {
      return ValidationOutcome.unavailable("studio.runner.base-url is not configured");
    }
    String body;
    try {
      body = requestBody(artifactJson, orderedSource, variableNames, secretNames);
    } catch (RuntimeException e) {
      return ValidationOutcome.unavailable("candidate artifact is not a JSON document");
    }

    calls.incrementAndGet();
    try {
      String response =
          restClient
              .post()
              .uri(properties.validateUrl())
              .contentType(MediaType.APPLICATION_JSON)
              .headers(
                  headers -> {
                    if (properties.serviceIdentityToken() != null
                        && !properties.serviceIdentityToken().isBlank()) {
                      headers.setBearerAuth(properties.serviceIdentityToken());
                    }
                  })
              .body(body)
              .exchange(
                  (request, clientResponse) -> {
                    HttpStatusCode status = clientResponse.getStatusCode();
                    if (!status.is2xxSuccessful()) {
                      throw new ValidatorUnavailableException(
                          "runner answered HTTP " + status.value());
                    }
                    byte[] bytes = clientResponse.getBody().readNBytes(MAX_RESPONSE_BYTES + 1);
                    if (bytes.length > MAX_RESPONSE_BYTES) {
                      throw new ValidatorUnavailableException(
                          "runner verdict exceeds response limit");
                    }
                    return new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
                  });
      return parse(response, orderedSource.size(), expectedValidatorVersion);
    } catch (ValidatorUnavailableException e) {
      LOGGER.warn("studio.validate.unavailable reason={}", e.reason());
      return ValidationOutcome.unavailable(e.reason());
    } catch (RuntimeException e) {
      // The exception type only. A transport failure's message is usually harmless, but "usually"
      // is not the standard AC-29 sets: the assertion is on the bytes handed to the log sink.
      String reason = scrub(e.getClass().getSimpleName());
      LOGGER.warn("studio.validate.unavailable reason={}", reason);
      return ValidationOutcome.unavailable(reason);
    }
  }

  /** Cancellable transport whose complete response consumes the request's remaining budget. */
  public ValidationOutcome validate(
      String artifactJson,
      List<String> orderedSource,
      Collection<String> variableNames,
      Collection<String> secretNames,
      CompileBudget budget) {
    budget.remaining();
    if (!properties.isConfigured()) {
      return ValidationOutcome.unavailable("studio.runner.base-url is not configured");
    }
    String body = requestBody(artifactJson, orderedSource, variableNames, secretNames);
    java.net.http.HttpRequest.Builder builder =
        java.net.http.HttpRequest.newBuilder()
            .uri(java.net.URI.create(properties.validateUrl()))
            .timeout(budget.cap(properties.validateTimeout()))
            .header("Content-Type", "application/json")
            .POST(java.net.http.HttpRequest.BodyPublishers.ofString(body));
    if (properties.serviceIdentityToken() != null && !properties.serviceIdentityToken().isBlank()) {
      builder.header("Authorization", "Bearer " + properties.serviceIdentityToken());
    }
    calls.incrementAndGet();
    var future = boundedHttpClient.sendAsync(builder.build(), ignored -> new BoundedBody());
    Runnable unregister =
        () -> {
          /* No registration exists until onCancel succeeds. */
        };
    try {
      unregister = budget.onCancel(() -> future.cancel(true));
      var response =
          future.get(
              budget.cap(properties.validateTimeout()).toNanos(),
              java.util.concurrent.TimeUnit.NANOSECONDS);
      budget.remaining();
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        return ValidationOutcome.unavailable("runner answered HTTP " + response.statusCode());
      }
      return parse(
          new String(response.body(), java.nio.charset.StandardCharsets.UTF_8),
          orderedSource.size(),
          expectedValidatorVersion);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return ValidationOutcome.unavailable("validator call cancelled");
    } catch (java.util.concurrent.ExecutionException
        | java.util.concurrent.TimeoutException
        | java.util.concurrent.CancellationException e) {
      return ValidationOutcome.unavailable("validator call failed or exceeded budget");
    } finally {
      unregister.run();
      future.cancel(true);
    }
  }

  /** Cancels before retaining more than the closed verdict body cap. */
  private static final class BoundedBody
      implements java.net.http.HttpResponse.BodySubscriber<byte[]> {
    private final java.util.concurrent.CompletableFuture<byte[]> result =
        new java.util.concurrent.CompletableFuture<>();
    private final java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
    private java.util.concurrent.Flow.Subscription subscription;

    @Override
    public java.util.concurrent.CompletionStage<byte[]> getBody() {
      return result;
    }

    @Override
    public void onSubscribe(java.util.concurrent.Flow.Subscription value) {
      subscription = value;
      subscription.request(1);
    }

    @Override
    public void onNext(List<java.nio.ByteBuffer> buffers) {
      for (java.nio.ByteBuffer buffer : buffers) {
        if ((long) bytes.size() + buffer.remaining() > MAX_RESPONSE_BYTES) {
          subscription.cancel();
          result.completeExceptionally(new java.io.IOException("verdict exceeds response limit"));
          return;
        }
        byte[] chunk = new byte[buffer.remaining()];
        buffer.get(chunk);
        bytes.writeBytes(chunk);
      }
      subscription.request(1);
    }

    @Override
    public void onError(Throwable error) {
      result.completeExceptionally(error);
    }

    @Override
    public void onComplete() {
      result.complete(bytes.toByteArray());
    }
  }

  /** Releases the shared validator transport when the application stops. */
  @jakarta.annotation.PreDestroy
  public void close() {
    boundedHttpClient.shutdownNow();
  }

  /**
   * Calls issued by this client since startup, for the one-call assertions of AC-12a and the
   * no-runner-call assertions of AC-27.
   *
   * @return the cumulative count
   */
  public long callCount() {
    return calls.get();
  }

  /**
   * Builds the closed {@code ValidateRequest} body.
   *
   * @param artifactJson the candidate artifact document
   * @param orderedSource the ordered original step lines
   * @param variableNames declared variable names
   * @param secretNames declared secret ids
   * @return the serialized body
   */
  static String requestBody(
      String artifactJson,
      List<String> orderedSource,
      Collection<String> variableNames,
      Collection<String> secretNames) {
    ObjectNode root = MAPPER.createObjectNode();
    try {
      root.set("artifact", MAPPER.readTree(artifactJson));
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalArgumentException("candidate artifact is not a JSON document", e);
    }
    ArrayNode source = root.putArray("source");
    orderedSource.forEach(line -> source.add(line == null ? "" : line));
    ObjectNode references = root.putObject("references");
    ArrayNode variables = references.putArray("variables");
    variableNames.forEach(variables::add);
    ArrayNode secrets = references.putArray("secrets");
    secretNames.forEach(secrets::add);
    return root.toString();
  }

  private static ValidationOutcome parse(
      String responseBody, int sourceCount, String expectedVersion) {
    JsonNode root;
    try {
      root = MAPPER.readTree(responseBody);
    } catch (java.io.IOException | IllegalArgumentException e) {
      return invalidVerdict();
    }
    if (!hasKeys(root, Set.of("ok", "validatorSchemaVersion", "diagnostics", "steps"))
        || !root.path("ok").isBoolean()
        || !root.path("validatorSchemaVersion").isTextual()
        || !expectedVersion.equals(root.path("validatorSchemaVersion").textValue())
        || !validDiagnostics(root.path("diagnostics"), null, sourceCount)
        || !root.path("steps").isArray()
        || root.path("steps").size() != sourceCount) {
      return invalidVerdict();
    }
    List<RunnerDiagnostic> artifactDiagnostics = diagnostics(root.path("diagnostics"));
    List<ValidationOutcome.StepVerdict> steps = new ArrayList<>();
    boolean allStepsOk = true;
    for (int index = 0; index < sourceCount; index++) {
      JsonNode step = root.path("steps").get(index);
      if (!hasKeys(step, Set.of("stepIndex", "ok", "diagnostics"))
          || !step.path("stepIndex").isIntegralNumber()
          || !step.path("stepIndex").canConvertToInt()
          || step.path("stepIndex").intValue() != index
          || !step.path("ok").isBoolean()
          || !validDiagnostics(step.path("diagnostics"), index, sourceCount)
          || (step.path("ok").booleanValue() && !step.path("diagnostics").isEmpty())) {
        return invalidVerdict();
      }
      boolean ok = step.path("ok").booleanValue();
      allStepsOk &= ok;
      steps.add(
          new ValidationOutcome.StepVerdict(index, ok, diagnostics(step.path("diagnostics"))));
    }
    boolean ok = root.path("ok").booleanValue();
    if (ok != (artifactDiagnostics.isEmpty() && allStepsOk)) {
      return invalidVerdict();
    }
    return ValidationOutcome.verdict(ok, expectedVersion, artifactDiagnostics, steps);
  }

  private static ValidationOutcome invalidVerdict() {
    return ValidationOutcome.unavailable("runner answered an invalid or incompatible verdict");
  }

  private static boolean hasKeys(JsonNode node, Set<String> expected) {
    if (node == null || !node.isObject()) {
      return false;
    }
    Set<String> actual = new HashSet<>();
    node.fieldNames().forEachRemaining(actual::add);
    return actual.equals(expected);
  }

  private static boolean validDiagnostics(JsonNode array, Integer containerIndex, int count) {
    if (!array.isArray()) {
      return false;
    }
    for (JsonNode node : array) {
      if (!hasKeys(node, Set.of("code", "stepIndex", "message", "node", "excerpt"))
          || !node.path("code").isTextual()
          || !node.path("message").isTextual()
          || !(node.path("node").isNull() || node.path("node").isTextual())
          || !(node.path("excerpt").isNull() || node.path("excerpt").isTextual())) {
        return false;
      }
      JsonNode index = node.path("stepIndex");
      if (containerIndex != null) {
        if (!index.isIntegralNumber()
            || !index.canConvertToInt()
            || index.intValue() != containerIndex) {
          return false;
        }
      } else if (!index.isNull()
          && (!index.isIntegralNumber()
              || !index.canConvertToInt()
              || index.intValue() < 0
              || index.intValue() >= count)) {
        return false;
      }
    }
    return true;
  }

  private static List<RunnerDiagnostic> diagnostics(JsonNode array) {
    List<RunnerDiagnostic> parsed = new ArrayList<>();
    for (JsonNode node : array) {
      JsonNode index = node.path("stepIndex");
      parsed.add(
          new RunnerDiagnostic(
              node.path("code").textValue(),
              index.isNull() ? null : Integer.valueOf(index.intValue()),
              node.path("message").textValue(),
              node.path("node").textValue(),
              node.path("excerpt").textValue()));
    }
    return parsed;
  }

  private static String scrub(String reason) {
    if (reason == null) {
      return "unknown transport failure";
    }
    String single = reason.replaceAll("\\s+", " ").strip();
    return single.length() <= MAX_REASON_LENGTH
        ? single
        : single.substring(0, MAX_REASON_LENGTH) + "...";
  }

  /**
   * A validation call that produced no verdict.
   *
   * <p>{@link #reason()} exists instead of {@code getMessage()} so the invariant is carried by the
   * type rather than by a habit: this exception is constructed <em>only</em> from string literals
   * declared in this class, never from response content, so its reason is safe to put on a log sink
   * and into {@code compile_error}. {@code getMessage()} carries no such promise, which is why the
   * AC-29 scan refuses it on a log site.
   */
  static final class ValidatorUnavailableException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final String reason;

    ValidatorUnavailableException(String reason) {
      super(reason);
      this.reason = reason;
    }

    String reason() {
      return reason;
    }
  }
}
