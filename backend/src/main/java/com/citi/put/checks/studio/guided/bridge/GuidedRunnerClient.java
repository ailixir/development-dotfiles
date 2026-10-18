package com.citi.put.checks.studio.guided.bridge;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;
import java.util.function.Supplier;
import javax.net.ssl.SSLContext;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Single-attempt HTTPS transport. TLS key/trust material and JWT come from deployment identity. */
public final class GuidedRunnerClient {
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
  private static final org.slf4j.Logger LOG =
      org.slf4j.LoggerFactory.getLogger(GuidedRunnerClient.class);

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

  private final URI origin;
  private final HttpClient client;
  private final Supplier<String> token;
  private final GuidedContracts contracts;

  public GuidedRunnerClient(
      URI origin, SSLContext tls, Supplier<String> token, GuidedContracts contracts) {
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
    this.origin = origin;
    this.token = token;
    this.contracts = contracts;
    this.client =
        HttpClient.newBuilder()
            .sslContext(tls)
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .version(HttpClient.Version.HTTP_1_1)
            .build();
  }

  public JsonNode send(String operation, JsonNode body) {
    return send(operation, body, UUID.randomUUID().toString());
  }

  public JsonNode send(String operation, JsonNode body, String key) {
    return send(operation, body, key, null, null, null);
  }

  public JsonNode send(
      String operation, JsonNode body, String key, java.time.Instant callerDeadline) {
    return send(operation, body, key, null, null, callerDeadline);
  }

  private java.util.function.Consumer<byte[]> requestBytesObserver;

  void observeRequestBytes(java.util.function.Consumer<byte[]> observer) {
    this.requestBytesObserver = observer;
  }

  public JsonNode sendSecret(
      JsonNode body, JsonNode metadata, com.citi.put.checks.studio.secrets.SecretValue secret) {
    return sendSecret(body, metadata, secret, null);
  }

  public JsonNode sendSecret(
      JsonNode body,
      JsonNode metadata,
      com.citi.put.checks.studio.secrets.SecretValue secret,
      java.time.Instant callerDeadline) {
    try {
      require(
          body.path("proposal").path("operation").path("kind").asText().equals("fill")
              && body.path("proposal")
                  .path("operation")
                  .path("value")
                  .path("kind")
                  .asText()
                  .equals("secretRef")
              && secret.length() >= 1
              && secret.length() <= 4096,
          "INVALID_CONTRACT",
          422);
      return send("dispatch", body, UUID.randomUUID().toString(), metadata, secret, callerDeadline);
    } finally {
      secret.close();
    }
  }

  private JsonNode send(
      String operation,
      JsonNode body,
      String key,
      JsonNode secretMetadata,
      com.citi.put.checks.studio.secrets.SecretValue secret,
      java.time.Instant callerDeadline) {
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
                origin.resolve("/internal/v2/studio/guided-sessions/" + id + "/" + operation))
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
      if (secret != null) {
        var envelope = new java.util.LinkedHashMap<String, Object>();
        secretMetadata
            .fields()
            .forEachRemaining(entry -> envelope.put(entry.getKey(), entry.getValue()));
        envelope.put("value", secret);
        wire.put("secret", envelope);
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
      exchange =
          client.sendAsync(
              request,
              info -> {
                // A context 409 body is read too (at most 4 KiB): it may be a definite refusal.
                var subscriber =
                    info.statusCode() == 200
                        ? new BoundedResponse(true, BoundedResponse.LIMIT)
                        : new BoundedResponse(context && info.statusCode() == 409, REFUSAL_LIMIT);
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
        if (secret != null) {
          secret.close();
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
    LOG.warn(
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
}
