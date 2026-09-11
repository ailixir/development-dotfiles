package com.citi.put.checks.studio.compile.validator;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
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
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final int MAX_REASON_LENGTH = 200;

  private final RestClient restClient;
  private final StudioRunnerProperties properties;
  private final AtomicLong calls = new AtomicLong();

  public RunnerValidationClient(RestClient restClient, StudioRunnerProperties properties) {
    this.restClient = restClient;
    this.properties = properties;
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
                    return new String(
                        clientResponse.getBody().readAllBytes(),
                        java.nio.charset.StandardCharsets.UTF_8);
                  });
      return parse(response);
    } catch (ValidatorUnavailableException e) {
      LOGGER.warn("studio.validate.unavailable reason={}", e.getMessage());
      return ValidationOutcome.unavailable(e.getMessage());
    } catch (RuntimeException e) {
      String reason = scrub(e.getClass().getSimpleName() + ": " + e.getMessage());
      LOGGER.warn("studio.validate.unavailable reason={}", reason);
      return ValidationOutcome.unavailable(reason);
    }
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

  private static ValidationOutcome parse(String responseBody) {
    JsonNode root;
    try {
      root = MAPPER.readTree(responseBody);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      return ValidationOutcome.unavailable("runner answered a body that is not JSON");
    }
    if (!root.isObject() || !root.path("ok").isBoolean()) {
      return ValidationOutcome.unavailable("runner answered a body without a boolean ok");
    }
    List<RunnerDiagnostic> artifactDiagnostics = diagnostics(root.path("diagnostics"), null);
    List<ValidationOutcome.StepVerdict> steps = new ArrayList<>();
    JsonNode stepNodes = root.path("steps");
    if (stepNodes.isArray()) {
      for (JsonNode step : stepNodes) {
        int stepIndex = step.path("stepIndex").asInt(steps.size());
        steps.add(
            new ValidationOutcome.StepVerdict(
                stepIndex,
                step.path("ok").asBoolean(false),
                diagnostics(step.path("diagnostics"), stepIndex)));
      }
    }
    return ValidationOutcome.verdict(
        root.path("ok").asBoolean(false),
        root.path("validatorSchemaVersion").asText(null),
        artifactDiagnostics,
        steps);
  }

  private static List<RunnerDiagnostic> diagnostics(JsonNode array, Integer defaultStepIndex) {
    List<RunnerDiagnostic> parsed = new ArrayList<>();
    if (!array.isArray()) {
      return parsed;
    }
    for (JsonNode node : array) {
      JsonNode stepIndex = node.path("stepIndex");
      parsed.add(
          new RunnerDiagnostic(
              node.path("code").asText(null),
              stepIndex.isIntegralNumber() ? stepIndex.intValue() : defaultStepIndex,
              node.path("message").asText(null),
              node.path("node").asText(null),
              node.path("excerpt").asText(null)));
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

  /** A validation call that produced no verdict. */
  static final class ValidatorUnavailableException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    ValidatorUnavailableException(String message) {
      super(message);
    }
  }
}
