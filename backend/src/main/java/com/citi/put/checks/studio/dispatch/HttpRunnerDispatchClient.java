package com.citi.put.checks.studio.dispatch;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.guided.publication.PublicationBudget;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The real dispatch client, built on the JDK HTTP client precisely because its two dangerous
 * behaviours can be switched off explicitly and demonstrably (10.7 AC-15).
 *
 * <p>Since story 10.17 the body this client serializes carries resolved variable and secret values
 * (§8.4, §9.2), so it is a new persistence surface and is treated as one: the serialized body is
 * never logged at any level, never placed in an exception message or cause chain, and nothing
 * retains it after {@code send} returns. The {@link JsonProcessingException} branch below is the
 * one place a serializer failure could have carried the body into a message, and it deliberately
 * says nothing about what failed to serialize.
 *
 * <p>{@link HttpClient.Redirect#NEVER} means a {@code 3xx} is returned to this code as a response
 * rather than followed, so exactly one request leaves the process. The JDK client performs no
 * automatic retry of a request that failed or timed out, and no retry is added here; there is no
 * interceptor, no {@code RetryTemplate} and no resilience4j instance on this path, and that absence
 * is the policy rather than an oversight.
 *
 * <p><b>Observed jobs only (ADR-SC-005).</b> The runner serves one run family, {@code POST
 * /v2/runs}, and a job that does not carry an observed binding is refused terminally before
 * anything is serialized: there is no second body shape and no second route.
 *
 * <p><b>Service identity (DEF-05).</b> {@code POST /v2/runs} declares {@code serviceIdentity}, and
 * the runner refuses an unauthenticated caller before it parses the body. The base URL and the
 * bearer therefore come from {@link StudioRunnerProperties}, the same source the observed
 * validation client uses, so the runner routes cannot be configured apart. When either is missing
 * this client refuses terminally, with a detail naming the missing key, and sends nothing: an
 * unauthenticated send is a request the runner is certain to refuse and would only hide the
 * misconfiguration behind the runner's {@code 401}.
 */
@Component
public class HttpRunnerDispatchClient implements RunnerDispatchClient {

  /** {@code detail()} of the terminal refusal when no runner base URL is configured. */
  public static final String RUNNER_NOT_CONFIGURED =
      "studio.runner.base-url is not configured; nothing was sent";

  /** {@code detail()} of the terminal refusal for a job without an observed binding. */
  public static final String NOT_OBSERVED =
      "only observed replay jobs are dispatched; nothing was sent";

  /** {@code detail()} of the terminal refusal when no service identity is configured. */
  public static final String SERVICE_IDENTITY_NOT_CONFIGURED =
      "studio.runner.service-identity-token is not configured; nothing was sent";

  private static final Logger LOGGER = LoggerFactory.getLogger(HttpRunnerDispatchClient.class);

  private final HttpClient httpClient;
  private final ObjectMapper objectMapper;
  private final StudioExecutionProperties properties;
  private final StudioRunnerProperties runner;
  private StudioDispatchMetrics metrics;
  private HttpClient validationClient;
  private URI validationOrigin;
  private boolean explicitValidationOrigin;
  private java.util.function.Supplier<String> validationToken;
  private HttpClient guidedClient;
  private URI guidedOrigin;
  private java.util.function.Supplier<String> token;
  private GuidedContracts contracts;

  /**
   * The client without a configured TLS identity, for tests that talk plain {@code http://} to a
   * local double. The Spring constructor below is the only one a deployed context uses.
   *
   * @param objectMapper serializer of the run body
   * @param properties execution bounds
   * @param runner the runner endpoint and service identity
   */
  public HttpRunnerDispatchClient(
      ObjectMapper objectMapper,
      StudioExecutionProperties properties,
      StudioRunnerProperties runner) {
    this(objectMapper, properties, runner, HttpClient.newBuilder());
  }

  /**
   * The deployed client: TLS comes from {@link StudioRunnerTls} (client certificate, the runner's
   * issuer as the only trust anchor, host-name verification), never from a JVM default
   * (STUDIO-OBS-009 AC-3, ruling A4).
   *
   * @param objectMapper serializer of the run body
   * @param properties execution bounds
   * @param runner the runner endpoint and service identity
   * @param tls the backend's identity on the runner hop
   */
  public HttpRunnerDispatchClient(
      ObjectMapper objectMapper,
      StudioExecutionProperties properties,
      StudioRunnerProperties runner,
      StudioRunnerTls tls) {
    this(objectMapper, properties, runner, tls.configure(HttpClient.newBuilder()));
  }

  /**
   * Deployed composition initializes every operation with the one mandatory backend TLS identity.
   * Explicit factory constructors retain their supplied operation configuration.
   */
  @Autowired
  public HttpRunnerDispatchClient(
      ObjectMapper objectMapper,
      StudioExecutionProperties properties,
      StudioRunnerProperties runner,
      StudioRunnerTls tls,
      GuidedContracts contracts,
      org.springframework.core.env.Environment environment) {
    this(objectMapper, properties, runner, tls);
    initializeOperations(tls, contracts, environment);
  }

  private HttpRunnerDispatchClient(
      ObjectMapper objectMapper,
      StudioExecutionProperties properties,
      StudioRunnerProperties runner,
      HttpClient.Builder builder) {
    this.objectMapper = objectMapper;
    this.properties = properties;
    this.runner = runner;
    this.validationToken = () -> runner == null ? null : runner.serviceIdentityToken();
    this.httpClient =
        builder
            .followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(properties.admissionTimeoutOrDefault())
            .build();
    this.validationClient =
        builder
            .connectTimeout(
                runner == null || runner.connectTimeout() == null
                    ? Duration.ofSeconds(2)
                    : runner.connectTimeout())
            .version(HttpClient.Version.HTTP_1_1)
            .build();
  }

  /** WP7: counts runner {@code 429}s. Absent off the worker profile, where nothing dispatches. */
  @Autowired(required = false)
  void setMetrics(StudioDispatchMetrics metrics) {
    this.metrics = metrics;
  }

  /** Visible so that a test can assert the redirect policy rather than trust this Javadoc. */
  public HttpClient.Redirect redirectPolicy() {
    return httpClient.followRedirects();
  }

  void observeRequestBytes(java.util.function.Consumer<byte[]> observer) {
    this.requestBytesObserver = observer;
  }

  private java.util.function.Consumer<byte[]> requestBytesObserver;

  @Override
  public DispatchOutcome send(RunJob job) {
    String misconfiguration = misconfiguration();
    if (misconfiguration != null) {
      // The execution id is the only job field named: the body carries resolved secrets.
      LOGGER.warn(
          "Dispatch of execution {} refused before sending: {}",
          job.executionId(),
          misconfiguration);
      job.resolvedSecrets().values().forEach(com.citi.put.checks.studio.secrets.SecretValue::close);
      return DispatchOutcome.refusedTerminal(misconfiguration);
    }
    if (job.observed() == null) {
      LOGGER.warn(
          "Dispatch of execution {} refused before sending: {}", job.executionId(), NOT_OBSERVED);
      job.resolvedSecrets().values().forEach(com.citi.put.checks.studio.secrets.SecretValue::close);
      return DispatchOutcome.refusedTerminal(NOT_OBSERVED);
    }
    HttpRequest request;
    byte[] requestBytes = null;
    try {
      requestBytes =
          com.citi.put.checks.studio.secrets.SecretWireWriter.bytes(
              objectMapper, observedBody(job));
      request =
          HttpRequest.newBuilder(URI.create(runner.runsUrl()))
              .timeout(properties.admissionTimeoutOrDefault())
              .header("Content-Type", "application/json")
              .header("Authorization", "Bearer " + runner.serviceIdentityToken())
              .POST(HttpRequest.BodyPublishers.ofByteArray(requestBytes))
              .build();
    } catch (IOException | RuntimeException e) {
      if (requestBytes != null) {
        java.util.Arrays.fill(requestBytes, (byte) 0);
      }
      job.resolvedSecrets().values().forEach(com.citi.put.checks.studio.secrets.SecretValue::close);
      return DispatchOutcome.refusedTerminal("the run job could not be serialized");
    }

    HttpResponse<String> response;
    try {
      if (requestBytesObserver != null) {
        requestBytesObserver.accept(requestBytes);
      }
      response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    } catch (HttpTimeoutException e) {
      return DispatchOutcome.ambiguous("timeout");
    } catch (IOException e) {
      return DispatchOutcome.ambiguous("connection loss");
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return DispatchOutcome.ambiguous("interrupted");
    } finally {
      java.util.Arrays.fill(requestBytes, (byte) 0);
    }
    if (response.statusCode() == 429 && metrics != null) {
      metrics.recordRefusal();
    }
    return classify(
        response.statusCode(), response.headers().firstValue("Retry-After").orElse(null));
  }

  /**
   * {@code DELETE /v2/runs/{executionId}} with the same base URL and the same bearer as {@link
   * #send} (Studio v1 WP4). No body, no redirect followed, no automatic retry: the dispatcher's
   * next pass is the retry, and it happens only for an outcome that did not {@linkplain
   * CancelOutcome#settled() settle}.
   */
  @Override
  public CancelOutcome cancel(UUID executionId) {
    String misconfiguration = misconfiguration();
    if (misconfiguration != null) {
      LOGGER.warn("Cancel of execution {} not relayed: {}", executionId, misconfiguration);
      return CancelOutcome.FAILED;
    }
    HttpRequest request =
        HttpRequest.newBuilder(URI.create(runner.runUrl(executionId)))
            .timeout(properties.admissionTimeoutOrDefault())
            .header("Authorization", "Bearer " + runner.serviceIdentityToken())
            .DELETE()
            .build();
    int status;
    try {
      status = httpClient.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
    } catch (IOException e) {
      LOGGER.warn("Cancel of execution {} not relayed: {}", executionId, e.getClass().getName());
      return CancelOutcome.FAILED;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return CancelOutcome.FAILED;
    }
    return classifyCancel(status);
  }

  /** The cancel classification table, extracted like {@link #classify} so a test can drive it. */
  public static CancelOutcome classifyCancel(int status) {
    return switch (status) {
      case 202 -> CancelOutcome.ACKNOWLEDGED;
      case 409 -> CancelOutcome.ALREADY_FINISHED;
      case 404 -> CancelOutcome.NOT_FOUND;
      default -> CancelOutcome.FAILED;
    };
  }

  private String misconfiguration() {
    if (runner == null || !runner.isConfigured()) {
      return RUNNER_NOT_CONFIGURED;
    }
    if (!runner.hasServiceIdentity()) {
      return SERVICE_IDENTITY_NOT_CONFIGURED;
    }
    return null;
  }

  /** The classification table, extracted so that a unit test can drive every status through it. */
  public static DispatchOutcome classify(int status, String retryAfterHeader) {
    if (status == 202) {
      return DispatchOutcome.accepted();
    }
    if (status == 429) {
      return DispatchOutcome.refusedRetryable(parseRetryAfter(retryAfterHeader));
    }
    if (status >= 300 && status < 400) {
      // A followed redirect is a second dispatch wearing a different name; an unfollowed one is
      // an outcome nobody promised anything about, so it is ambiguous rather than a refusal.
      return DispatchOutcome.ambiguous("redirect " + status);
    }
    if (status >= 500) {
      return DispatchOutcome.ambiguous("runner " + status);
    }
    return DispatchOutcome.refusedTerminal("runner " + status);
  }

  private static Duration parseRetryAfter(String header) {
    if (header == null || header.isBlank()) {
      return null;
    }
    try {
      return Duration.ofSeconds(Long.parseLong(header.trim()));
    } catch (NumberFormatException e) {
      return null;
    }
  }

  /**
   * The observed body: the binding-derived wire document the replay authorization produced, plus
   * the two ephemeral secret maps resolved for this one send. Nothing else is added here.
   */
  private Map<String, Object> observedBody(RunJob job) {
    Map<String, Object> result = new LinkedHashMap<>();
    job.observed().fields().forEachRemaining(entry -> result.put(entry.getKey(), entry.getValue()));
    result.put("secrets", job.resolvedSecrets());
    result.put("secretOrigins", job.secretOrigins());
    return result;
  }

  /**
   * STUDIO-OBS-014 (ar-2-r14-stops ruling 2): the {@code messageCode} that marks a definite runner
   * refusal of a context. Publicly it is {@code RUNTIME_INCOMPATIBLE 409}, not retryable.
   */
  public static final String CONTEXT_REFUSED = "RUNNER_CONTEXT_REFUSED";

  /**
   * STUDIO-OBS-015 B2B-01 P2: the {@code messageCode} that marks a closed runner refusal of a
   * context whose code is not definite. Publicly it stays {@code UNKNOWN_OUTCOME 409}, not
   * retryable; only a keyed append delivery treats it as final.
   */
  public static final String CONTEXT_CLOSED_REFUSAL = "RUNNER_CONTEXT_CLOSED_REFUSAL";

  private static final int REFUSAL_LIMIT = 4096;
  private static final java.util.Set<String> DEFINITE_CONTEXT_REFUSALS =
      java.util.Set.of("IDENTITY_MISMATCH", "SCHEMA");
  private static final org.slf4j.Logger GUIDED_LOG =
      org.slf4j.LoggerFactory.getLogger(HttpRunnerDispatchClient.class);

  /** True for the definite context refusal {@link #send} raises; every other failure is not. */
  public static boolean definiteContextRefusal(RuntimeException failure) {
    return failure instanceof GuidedSessionException refusal
        && "RUNTIME_INCOMPATIBLE".equals(refusal.getMessage())
        && CONTEXT_REFUSED.equals(refusal.messageCode());
  }

  /**
   * True for any closed runner refusal of a context: a definite one, or a validated refusal body
   * with another code. Transport uncertainty (timeouts, non-409, unparseable or non-conforming
   * bodies) is not a closed refusal.
   */
  public static boolean closedContextRefusal(RuntimeException failure) {
    return definiteContextRefusal(failure)
        || (failure instanceof GuidedSessionException refusal
            && "UNKNOWN_OUTCOME".equals(refusal.getMessage())
            && CONTEXT_CLOSED_REFUSAL.equals(refusal.messageCode()));
  }

  /** Explicit operation setup for test doubles; deployed setup uses the same TLS identity. */
  public HttpRunnerDispatchClient(
      ObjectMapper mapper,
      StudioExecutionProperties execution,
      StudioRunnerProperties runner,
      StudioRunnerTls tls,
      GuidedContracts contracts,
      URI origin,
      java.util.function.Supplier<String> token) {
    this(mapper, execution, runner, tls);
    initializeGuided(origin, tls, token, contracts);
  }

  void initializeOperations(
      StudioRunnerTls tls,
      GuidedContracts contracts,
      org.springframework.core.env.Environment environment) {
    this.contracts = contracts;
    String origin = environment.getProperty("studio.guided-authoring.runner-origin");
    if (origin == null) {
      initializeGuided(
          URI.create("https://unconfigured.invalid"),
          tls,
          () -> {
            throw new GuidedSessionException("RUNTIME_INCOMPATIBLE", 409);
          },
          contracts);
      return;
    }
    String tokenFile =
        environment.getRequiredProperty("studio.guided-authoring.controller-token-file");
    initializeGuided(
        URI.create(origin),
        tls,
        () -> {
          try {
            return java.nio.file.Files.readString(java.nio.file.Path.of(tokenFile)).strip();
          } catch (IOException failure) {
            throw new GuidedSessionException("UNAUTHENTICATED", 401);
          }
        },
        contracts);
  }

  private void initializeGuided(
      URI origin,
      StudioRunnerTls tls,
      java.util.function.Supplier<String> token,
      GuidedContracts contracts) {
    initializeGuided(origin, tls.sslContext(), token, contracts);
  }

  private void initializeGuided(
      URI origin,
      javax.net.ssl.SSLContext tls,
      java.util.function.Supplier<String> token,
      GuidedContracts contracts) {
    require(
        origin.getScheme().equals("https")
            && origin.getHost() != null
            && origin.getRawUserInfo() == null
            && (origin.getPath().isEmpty() || origin.getPath().equals("/"))
            && origin.getQuery() == null
            && origin.getFragment() == null,
        "RUNTIME_INCOMPATIBLE",
        409);
    require(
        !Boolean.parseBoolean(System.getProperty("jdk.httpclient.enableAllMethodRetry", "false")),
        "RUNTIME_INCOMPATIBLE",
        409);
    this.guidedOrigin = origin;
    this.token = token;
    this.contracts = contracts;
    this.guidedClient =
        HttpClient.newBuilder()
            .sslContext(tls)
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .version(HttpClient.Version.HTTP_1_1)
            .build();
  }

  public JsonNode validate(
      JsonNode request,
      PublicationBudget budget,
      int maxValidationBytes,
      long validationTimeoutMs) {
    require(contracts != null, "RUNTIME_INCOMPATIBLE", 409);
    URI validationOrigin =
        explicitValidationOrigin
            ? this.validationOrigin
            : runner != null && runner.isConfigured() ? URI.create(runner.baseUrl()) : null;
    URI endpoint =
        validationOrigin == null ? null : validationOrigin.resolve("/v2/validate-observed");
    require(
        !Boolean.getBoolean("jdk.httpclient.enableAllMethodRetry"), "RUNTIME_INCOMPATIBLE", 409);
    require(
        !TransactionSynchronizationManager.isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    require(
        endpoint != null
            && endpoint.getHost() != null
            && endpoint.getUserInfo() == null
            && endpoint.getQuery() == null
            && endpoint.getFragment() == null
            && (validationOrigin.getPath().isEmpty() || validationOrigin.getPath().equals("/"))
            && (endpoint.getScheme().equals("http") || endpoint.getScheme().equals("https")),
        "RUNTIME_INCOMPATIBLE",
        409);
    String representation = contracts.validateAndCanonical("v3/replay-validation", request);
    if (representation == null) {
      // Unsupported dependency stubs retain the original strict validation/encoding path.
      contracts.validate("v3/replay-validation", request);
      representation = GuidedContracts.canonical(request);
    }
    byte[] payload = representation.getBytes(StandardCharsets.UTF_8);
    require(payload.length <= maxValidationBytes, "BUDGET_EXCEEDED", 413);
    String credential = validationToken.get();
    require(credential != null && !credential.isBlank(), "UNAUTHENTICATED", 401);
    Duration remaining = budget.remaining();
    if (remaining.compareTo(Duration.ofMillis(validationTimeoutMs)) > 0) {
      remaining = Duration.ofMillis(validationTimeoutMs);
    }
    HttpRequest outbound =
        HttpRequest.newBuilder(endpoint)
            .timeout(remaining)
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer " + credential)
            .POST(HttpRequest.BodyPublishers.ofByteArray(payload))
            .build();
    try {
      HttpResponse<java.io.InputStream> response =
          validationClient.send(outbound, HttpResponse.BodyHandlers.ofInputStream());
      try (var body = response.body()) {
        byte[] bytes;
        java.util.concurrent.FutureTask<byte[]> read =
            new java.util.concurrent.FutureTask<>(() -> body.readNBytes(65537));
        Thread reader = Thread.ofVirtual().name("observed-validator-response").start(read);
        try {
          bytes =
              read.get(
                  Math.max(1L, budget.remaining().toMillis()),
                  java.util.concurrent.TimeUnit.MILLISECONDS);
        } catch (java.util.concurrent.TimeoutException
            | java.util.concurrent.ExecutionException failure) {
          read.cancel(true);
          body.close();
          throw new GuidedSessionException("UNKNOWN_OUTCOME", 409);
        } finally {
          if (!read.isDone()) {
            read.cancel(true);
            reader.interrupt();
          }
        }
        require(bytes.length <= 65536, "UNKNOWN_OUTCOME", 409);
        if (response.statusCode() == 400 || response.statusCode() == 422) {
          throw new GuidedSessionException("INVALID_CONTRACT", 422);
        }
        if (response.statusCode() == 401 || response.statusCode() == 403) {
          throw new GuidedSessionException("FORBIDDEN_SCOPE", 403);
        }
        if (response.statusCode() == 409) {
          throw new GuidedSessionException("RUNTIME_INCOMPATIBLE", 409);
        }
        require(response.statusCode() == 200, "UNKNOWN_OUTCOME", 409);
        JsonNode verdict = contracts.parseWire(bytes);
        contracts.validate("v3/replay-validation#/definitions/ValidationVerdict", verdict);
        for (String field :
            java.util.List.of("attemptId", "claimId", "snapshotHash", "basisHash")) {
          require(verdict.path(field).equals(request.path(field)), "EVIDENCE_MISMATCH", 422);
        }
        require(
            verdict.path("profile").equals(request.path("requiredProfile"))
                && verdict.path("build").equals(request.path("requiredBuild")),
            "RUNTIME_INCOMPATIBLE",
            409);
        budget.remaining();
        return verdict;
      }
    } catch (InterruptedException failure) {
      Thread.currentThread().interrupt();
      throw new GuidedSessionException("UNKNOWN_OUTCOME", 409);
    } catch (java.io.IOException failure) {
      throw new GuidedSessionException("UNKNOWN_OUTCOME", 409);
    }
  }

  public JsonNode send(String operation, JsonNode body) {
    return send(operation, body, UUID.randomUUID().toString());
  }

  public JsonNode send(String operation, JsonNode body, String key) {
    return send(operation, body, key, null, null);
  }

  public JsonNode send(
      String operation, JsonNode body, String key, java.time.Instant callerDeadline) {
    return send(operation, body, key, null, callerDeadline);
  }

  /** One secret of a dispatch: its safe metadata and the owned value, erased once it is sent. */
  public record SecretEnvelope(
      JsonNode metadata, com.citi.put.checks.studio.secrets.SecretValue value) {}

  /** The most secrets one step dispatch carries. */
  private static final int MAX_DISPATCH_SECRETS = 8;

  /**
   * Sends a dispatch that carries 1 to 8 secrets, each {@code {secretId, value, versionId,
   * allowedOrigins}}. Every value is erased on every path, including a refusal made before the
   * send.
   */
  public JsonNode sendSecrets(
      JsonNode body, java.util.List<SecretEnvelope> secrets, java.time.Instant callerDeadline) {
    try {
      var ids = new java.util.HashSet<String>();
      require(
          secrets != null
              && !secrets.isEmpty()
              && secrets.size() <= MAX_DISPATCH_SECRETS
              && secrets.stream()
                  .allMatch(
                      envelope ->
                          envelope.value().length() >= 1
                              && envelope.value().length() <= 4096
                              && ids.add(envelope.metadata().path("secretId").asText())),
          "INVALID_CONTRACT",
          422);
      return send("dispatch", body, UUID.randomUUID().toString(), secrets, callerDeadline);
    } finally {
      if (secrets != null) {
        secrets.forEach(envelope -> envelope.value().close());
      }
    }
  }

  private JsonNode send(
      String operation,
      JsonNode body,
      String key,
      java.util.List<SecretEnvelope> secrets,
      java.time.Instant callerDeadline) {
    require(guidedClient != null && contracts != null, "RUNTIME_INCOMPATIBLE", 409);
    long deadline = transportDeadline(callerDeadline);
    require(key != null && !key.isBlank() && key.length() <= 256, "INVALID_CONTRACT", 422);
    require(
        !TransactionSynchronizationManager.isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    require(
        java.util.Set.of("assign", "context", "prepare", "dispatch", "stop", "observe")
            .contains(operation),
        "INVALID_CONTRACT",
        422);
    boolean assignment =
        operation.equals("assign") || body.path("kind").asText().equals("assignment");
    JsonNode intent = operation.equals("assign") ? body : body.path("assignment");
    boolean prefixPrepare =
        operation.equals("prepare") && body.path("kind").asText().equals("prefix");
    JsonNode transportIdentity = prefixPrepare ? body.path("request") : body;
    String id =
        assignment
            ? intent.path("sessionId").asText()
            : transportIdentity.path("sessionId").asText();
    require(id.matches("[A-Za-z0-9_-]{1,256}"), "INVALID_CONTRACT", 422);
    String credential = token.get();
    require(credential != null && !credential.isBlank(), "UNAUTHENTICATED", 401);
    var builder =
        HttpRequest.newBuilder(
                guidedOrigin.resolve("/internal/v2/studio/guided-sessions/" + id + "/" + operation))
            .timeout(remaining(deadline))
            .header("Authorization", "Bearer " + credential)
            .header("Content-Type", "application/json")
            .header("Idempotency-Key", key);
    if (!assignment) {
      builder.header("X-Owner-Fence", transportIdentity.path("ownerFence").asText());
    }
    byte[] requestBytes;
    try {
      var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
      var wire = new java.util.LinkedHashMap<String, Object>();
      body.fields().forEachRemaining(entry -> wire.put(entry.getKey(), entry.getValue()));
      if (secrets != null) {
        var wired = new java.util.ArrayList<java.util.Map<String, Object>>();
        for (SecretEnvelope secret : secrets) {
          var envelope = new java.util.LinkedHashMap<String, Object>();
          secret
              .metadata()
              .fields()
              .forEachRemaining(entry -> envelope.put(entry.getKey(), entry.getValue()));
          envelope.put("value", secret.value());
          wired.add(envelope);
        }
        wire.put("secrets", wired);
      }
      requestBytes = com.citi.put.checks.studio.secrets.SecretWireWriter.bytes(mapper, wire);
    } catch (java.io.IOException failure) {
      throw new GuidedSessionException("INVALID_CONTRACT", 422);
    }
    OwnedRequestBody owned = new OwnedRequestBody(requestBytes);
    var responseBody = new java.util.concurrent.atomic.AtomicReference<BoundedResponse>();
    var stopped = new java.util.concurrent.atomic.AtomicBoolean();
    java.util.concurrent.CompletableFuture<HttpResponse<byte[]>> exchange = null;
    try {
      if (requestBytesObserver != null) {
        requestBytesObserver.accept(requestBytes);
      }
      remaining(deadline);
      var request = builder.POST(owned.publisher()).build();
      boolean context = operation.equals("context");
      boolean observe = operation.equals("observe");
      // ADR-SC-007 D8: the body of an ORDINARY prepare 409 is read too (at most 4 KiB); the prefix
      // prepare keeps WAIT and DRIFT and is never classified here.
      boolean ordinaryPrepare = operation.equals("prepare") && !prefixPrepare;
      exchange =
          guidedClient.sendAsync(
              request,
              info -> {
                // A context, observe or ordinary prepare 409 body is read too (at most 4 KiB): it
                // may be a closed refusal that decides how the session ends.
                var subscriber =
                    info.statusCode() == 200
                        ? new BoundedResponse(true, BoundedResponse.LIMIT)
                        : new BoundedResponse(
                            (context || observe || ordinaryPrepare) && info.statusCode() == 409,
                            REFUSAL_LIMIT);
                responseBody.set(subscriber);
                if (stopped.get()) {
                  subscriber.close();
                }
                return subscriber;
              });
      HttpResponse<byte[]> response =
          exchange.get(remaining(deadline).toNanos(), java.util.concurrent.TimeUnit.NANOSECONDS);
      if (context && response.statusCode() == 409) {
        throw contextRefusal(id, body, response.body());
      }
      if (observe && response.statusCode() == 409) {
        throw observeRefusal(response.body());
      }
      if (ordinaryPrepare && response.statusCode() == 409) {
        throw prepareRefusal(response.body());
      }
      require(
          response.statusCode() == 200 && response.body().length <= 1048576,
          "UNKNOWN_OUTCOME",
          409);
      JsonNode result = contracts.parseWire(response.body());
      remaining(deadline);
      if (assignment) {
        contracts.validate("v3/assignment-receipt", result);
        require(result.path("assignment").equals(intent), "STALE_FENCE", 409);
        if (!result.path("ownerFence").isNull()) {
          require(
              result.path("ownerFence").asLong() == intent.path("expectedFence").asLong() + 1
                  && !java.time.Instant.parse(result.path("leaseExpiresAt").asText())
                      .isAfter(java.time.Instant.parse(intent.path("expiresAt").asText())),
              "STALE_FENCE",
              409);
        }
        require(
            result.path("status").asText().equals(operation.equals("assign") ? "OWNED" : "STOPPED"),
            "RUNTIME_INCOMPATIBLE",
            409);
        remaining(deadline);
        return result;
      }
      if (prefixPrepare) {
        contracts.validate("v3/bridge#/definitions/PrefixPrepareResult", result);
        require(
            result.path("requestDigest").equals(body.path("requestDigest")),
            "EVIDENCE_MISMATCH",
            409);
        return result;
      }
      if (operation.equals("context") && result.has("deliveryId")) {
        contracts.validate("v3/bridge#/definitions/ContextAcknowledgement", result);
        require(
            result.path("deliveryId").asText().equals(key)
                && result.path("contextHash").asText().equals(GuidedContracts.hash(body)),
            "EVIDENCE_MISMATCH",
            409);
        return result;
      }
      String schema =
          operation.equals("prepare")
              ? "preparation"
              : operation.equals("dispatch")
                  ? "outcome"
                  : operation.equals("observe") ? "observation" : "identity";
      contracts.validate("v3/bridge#/definitions/" + schema, result);
      for (String field :
          java.util.List.of(
              "sessionId",
              "workerId",
              "ownerFence",
              "scopeHash",
              "contextId",
              "contextRevision",
              "sourceRevision",
              "configurationRevision",
              "versions")) {
        require(result.path(field).equals(body.path(field)), "STALE_FENCE", 409);
      }
      remaining(deadline);
      return result;
    } catch (InterruptedException failure) {
      Thread.currentThread().interrupt();
      throw new GuidedSessionException("UNKNOWN_OUTCOME", 409);
    } catch (java.util.concurrent.ExecutionException
        | java.util.concurrent.TimeoutException
        | java.util.concurrent.CancellationException failure) {
      throw new GuidedSessionException("UNKNOWN_OUTCOME", 409);
    } finally {
      stopped.set(true);
      try {
        if (exchange != null && !exchange.isDone()) {
          exchange.cancel(true);
        }
        var subscriber = responseBody.get();
        if (subscriber != null) {
          subscriber.close();
        }
      } finally {
        owned.close();
        if (secrets != null) {
          secrets.forEach(secret -> secret.value().close());
        }
      }
    }
  }

  /**
   * Classifies a runner's 409 to a context push (ar-2-r14-stops ruling 2). Only a body that
   * validates against the closed {@code v3/bridge#/definitions/refusal} and names {@code
   * IDENTITY_MISMATCH} or {@code SCHEMA} is definite: both are deterministic for a byte-identical
   * context, so no retry can succeed. Another closed code stays {@code UNKNOWN_OUTCOME} marked
   * {@link #CONTEXT_CLOSED_REFUSAL} (OBS-015 B2B-01 P2); unparseable or non-conforming bodies stay
   * plain {@code UNKNOWN_OUTCOME} with today's bounded retry. The body is never logged, echoed or
   * stored; only the session id, the context hash and the closed runner code are logged.
   */
  private GuidedSessionException contextRefusal(String sessionId, JsonNode context, byte[] reply) {
    String code;
    try {
      JsonNode refusal = contracts.parseWire(reply);
      contracts.validate("v3/bridge#/definitions/refusal", refusal);
      code = refusal.path("code").asText();
    } catch (RuntimeException unclassified) {
      return new GuidedSessionException("UNKNOWN_OUTCOME", 409);
    } finally {
      java.util.Arrays.fill(reply, (byte) 0);
    }
    // STUDIO-OBS-015 B2B-01 P2: every closed code is logged (value-free), not only definite ones.
    GUIDED_LOG.warn(
        "Guided runner refused the context for session {} (contextHash {}): {}",
        sessionId,
        GuidedContracts.hash(context),
        code);
    if (!DEFINITE_CONTEXT_REFUSALS.contains(code)) {
      return new GuidedSessionException(
          "UNKNOWN_OUTCOME", 409, CONTEXT_CLOSED_REFUSAL, false, null);
    }
    return new GuidedSessionException("RUNTIME_INCOMPATIBLE", 409, CONTEXT_REFUSED, false, null);
  }

  /**
   * Classifies a runner's 409 to an observe (STUDIO-FLEX-001). A validated closed refusal {@code
   * POLICY_DENIED} is the runner saying the page is off the allowed domains and did not come back
   * (an observe is refused for no other policy reason), so it is {@code 403 ORIGIN_NOT_ALLOWED}; a
   * validated {@code BUDGET_EXCEEDED} with reason {@code OBSERVATION_DEADLINE} is the runner giving
   * up collecting a page (ADR-SC-007), a surface Studio cannot work with ({@code
   * UNSUPPORTED_SURFACE 422}); every other body stays {@code UNKNOWN_OUTCOME}. The body is never
   * logged or echoed.
   */
  private GuidedSessionException observeRefusal(byte[] reply) {
    try {
      JsonNode refusal = contracts.parseWire(reply);
      contracts.validate("v3/bridge#/definitions/refusal", refusal);
      if (refusal.path("code").asText().equals("POLICY_DENIED")) {
        return new GuidedSessionException("ORIGIN_NOT_ALLOWED", 403);
      }
      // ADR-SC-007 D8: the runner stopped collecting at its observation deadline.
      if (refusal.path("code").asText().equals("BUDGET_EXCEEDED")
          && refusal.path("reason").asText("").equals("OBSERVATION_DEADLINE")) {
        return new GuidedSessionException(
            "UNSUPPORTED_SURFACE", 422, "OBSERVATION_DEADLINE", false, null);
      }
    } catch (RuntimeException unclassified) {
      // Not a closed refusal: transport uncertainty.
    } finally {
      java.util.Arrays.fill(reply, (byte) 0);
    }
    return new GuidedSessionException("UNKNOWN_OUTCOME", 409);
  }

  /**
   * Classifies a runner's 409 to an ORDINARY prepare. Only a body that validates against the closed
   * {@code v3/bridge#/definitions/refusal} with code {@code PREPARATION_DENIED} and one of two
   * closed reasons is a definite, no-effect refusal the model can repair:
   *
   * <ul>
   *   <li>{@code STEP_SYNTAX} (the step code does not construct) and {@code STEP_PRE_FENCE} (it
   *       failed before its first effectful call): {@code INVALID_CONTRACT} 422 whose {@code
   *       messageCode} is the reason, carrying the position the runner named and, for the pre-fence
   *       refusal, how many elements its locator matched.
   * </ul>
   *
   * {@code SOURCE_HASH_MISMATCH}, every other body, an unknown reason, a non-conforming or oversize
   * body stays {@code UNKNOWN_OUTCOME}. The body is never logged or echoed.
   */
  private GuidedSessionException prepareRefusal(byte[] reply) {
    try {
      JsonNode refusal = contracts.parseWire(reply);
      contracts.validate("v3/bridge#/definitions/refusal", refusal);
      String reason = refusal.path("reason").asText("");
      if (refusal.path("code").asText().equals("PREPARATION_DENIED")
          && (reason.equals("STEP_SYNTAX") || reason.equals("STEP_PRE_FENCE"))) {
        return new GuidedSessionException(
            "INVALID_CONTRACT",
            422,
            reason,
            integer(refusal.path("line")),
            integer(refusal.path("column")),
            integer(refusal.path("matchCount")));
      }
    } catch (RuntimeException unclassified) {
      // Not a closed refusal: transport uncertainty.
    } finally {
      java.util.Arrays.fill(reply, (byte) 0);
    }
    return new GuidedSessionException("UNKNOWN_OUTCOME", 409);
  }

  private static Integer integer(JsonNode value) {
    return value.isInt() ? value.intValue() : null;
  }

  private static long transportDeadline(java.time.Instant callerDeadline) {
    long nanos = Duration.ofSeconds(15).toNanos();
    if (callerDeadline != null) {
      Duration available = Duration.between(java.time.Instant.now(), callerDeadline);
      if (available.isNegative() || available.isZero()) {
        throw new GuidedSessionException("UNKNOWN_OUTCOME", 409);
      }
      if (available.compareTo(Duration.ofSeconds(15)) < 0) {
        nanos = available.toNanos();
      }
    }
    return System.nanoTime() + nanos;
  }

  private static Duration remaining(long deadline) {
    long nanos = deadline - System.nanoTime();
    if (nanos <= 0 || Thread.currentThread().isInterrupted()) {
      throw new GuidedSessionException("UNKNOWN_OUTCOME", 409);
    }
    return Duration.ofNanos(nanos);
  }

  /** Original bytes never escape as a ByteBuffer; JDK buffers receive copies under this lock. */
  private static final class OwnedRequestBody extends java.io.InputStream {
    private final byte[] bytes;
    private int position;
    private boolean closed;

    private OwnedRequestBody(byte[] bytes) {
      this.bytes = bytes;
    }

    private HttpRequest.BodyPublisher publisher() {
      var delegate = HttpRequest.BodyPublishers.ofInputStream(() -> this);
      return new HttpRequest.BodyPublisher() {
        public long contentLength() {
          return bytes.length;
        }

        public void subscribe(
            java.util.concurrent.Flow.Subscriber<? super java.nio.ByteBuffer> subscriber) {
          delegate.subscribe(subscriber);
        }
      };
    }

    @Override
    public synchronized int read() throws java.io.IOException {
      if (closed) {
        throw new java.io.IOException("Guided request body closed");
      }
      return position == bytes.length ? -1 : Byte.toUnsignedInt(bytes[position++]);
    }

    @Override
    public synchronized int read(byte[] target, int offset, int length) throws java.io.IOException {
      java.util.Objects.checkFromIndexSize(offset, length, target.length);
      if (closed) {
        throw new java.io.IOException("Guided request body closed");
      }
      if (length == 0) {
        return 0;
      }
      if (position == bytes.length) {
        return -1;
      }
      int count = Math.min(length, bytes.length - position);
      System.arraycopy(bytes, position, target, offset, count);
      position += count;
      return count;
    }

    @Override
    public synchronized void close() {
      closed = true;
      java.util.Arrays.fill(bytes, (byte) 0);
    }
  }

  /** A finite owned accumulator whose completion includes EOF, never just response headers. */
  private static final class BoundedResponse
      implements HttpResponse.BodySubscriber<byte[]>, AutoCloseable {
    private static final int LIMIT = 1048576;
    private final boolean accepted;
    private final int limit;
    private final java.util.concurrent.CompletableFuture<byte[]> body =
        new java.util.concurrent.CompletableFuture<>();
    private java.util.concurrent.Flow.Subscription subscription;
    private byte[] bytes = new byte[4096];
    private byte[] result;
    private int count;
    private boolean closed;

    private BoundedResponse(boolean accepted, int limit) {
      this.accepted = accepted;
      this.limit = limit;
    }

    @Override
    public java.util.concurrent.CompletionStage<byte[]> getBody() {
      return body;
    }

    @Override
    public synchronized void onSubscribe(java.util.concurrent.Flow.Subscription next) {
      subscription = next;
      if (closed || !accepted) {
        next.cancel();
        body.completeExceptionally(new java.io.IOException("Guided response refused"));
      } else {
        next.request(1);
      }
    }

    @Override
    public synchronized void onNext(java.util.List<java.nio.ByteBuffer> chunks) {
      if (closed) {
        return;
      }
      for (var chunk : chunks) {
        int length = chunk.remaining();
        if (length > limit - count) {
          subscription.cancel();
          body.completeExceptionally(
              new java.io.IOException("Guided response exceeded size bound"));
          return;
        }
        if (bytes.length < count + length) {
          byte[] previous = bytes;
          bytes =
              java.util.Arrays.copyOf(
                  previous, Math.min(limit, Math.max(count + length, bytes.length * 2)));
          java.util.Arrays.fill(previous, (byte) 0);
        }
        chunk.get(bytes, count, length);
        count += length;
      }
      subscription.request(1);
    }

    @Override
    public synchronized void onError(Throwable failure) {
      body.completeExceptionally(new java.io.IOException("Guided response interrupted"));
    }

    @Override
    public synchronized void onComplete() {
      if (!closed) {
        result = java.util.Arrays.copyOf(bytes, count);
        body.complete(result);
      }
    }

    @Override
    public void close() {
      java.util.concurrent.Flow.Subscription stop;
      synchronized (this) {
        closed = true;
        stop = subscription;
        java.util.Arrays.fill(bytes, (byte) 0);
        if (result != null) {
          java.util.Arrays.fill(result, (byte) 0);
        }
      }
      if (stop != null) {
        stop.cancel();
      }
    }
  }

  /** Explicit guided operation setup; deployed composition remains the TLS constructor above. */
  public HttpRunnerDispatchClient(
      URI origin,
      javax.net.ssl.SSLContext tls,
      java.util.function.Supplier<String> token,
      GuidedContracts contracts) {
    this.objectMapper = new ObjectMapper();
    this.properties =
        new StudioExecutionProperties(
            null, null, null, null, null, null, null, null, null, null, null);
    this.runner = new StudioRunnerProperties(null, null, null);
    initializeGuided(origin, tls, token, contracts);
    this.httpClient = guidedClient;
    this.validationClient = guidedClient;
    this.validationToken = () -> null;
  }

  /** Explicit validation operation setup; limits are still supplied on each validate call. */
  public HttpRunnerDispatchClient(
      URI origin,
      HttpClient client,
      java.util.function.Supplier<String> token,
      GuidedContracts contracts) {
    this.objectMapper = new ObjectMapper();
    this.properties =
        new StudioExecutionProperties(
            null, null, null, null, null, null, null, null, null, null, null);
    this.runner = new StudioRunnerProperties(null, null, null);
    this.httpClient = client;
    require(
        origin == null
            || origin.getHost() != null
                && origin.getUserInfo() == null
                && origin.getQuery() == null
                && origin.getFragment() == null
                && (origin.getPath().isEmpty() || origin.getPath().equals("/"))
                && (origin.getScheme().equals("https") || origin.getScheme().equals("http")),
        "RUNTIME_INCOMPATIBLE",
        409);
    require(
        client.followRedirects() == HttpClient.Redirect.NEVER
            && !Boolean.getBoolean("jdk.httpclient.enableAllMethodRetry"),
        "RUNTIME_INCOMPATIBLE",
        409);
    this.validationOrigin = origin;
    this.explicitValidationOrigin = true;
    this.validationClient = client;
    this.validationToken = token;
    this.contracts = contracts;
  }
}
