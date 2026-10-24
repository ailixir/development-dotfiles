package com.citi.put.checks.studio.gateway;

import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.genai.Client;
import com.google.genai.types.ClientOptions;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.GenerateContentResponse;
import com.google.genai.types.HttpOptions;
import com.google.genai.types.HttpRetryOptions;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.concurrent.Semaphore;
import okhttp3.OkHttpClient;
import okhttp3.ResponseBody;
import okio.Buffer;
import okio.BufferedSource;
import okio.ForwardingSource;
import okio.Okio;

/** Shared, capacity-bounded SDK transport. Callers own proposal accounting and explicit retries. */
public final class GenAiGatewayTransport implements AutoCloseable {
  public static final String SDK_VERSION = "1.71.0";

  /** Deadline/cancellation only; this seam cannot reserve or repeat a model proposal. */
  public interface Budget {
    Duration remaining();

    AutoCloseable onCancel(Runnable action);
  }

  private final StudioGatewayProperties properties;
  private final Semaphore capacity;
  private final BoundedCredentialProvider credentials;
  private final Client client;
  private final ThreadLocal<Attempt> active = new ThreadLocal<>();

  private static final class Attempt {
    private final Budget budget;
    private final String token;
    private final boolean boundedWire;
    private final List<AutoCloseable> removals = new ArrayList<>();
    private int networkSends;
    private volatile boolean responseStarted;

    private Attempt(Budget budget, String token, boolean boundedWire) {
      this.budget = budget;
      this.token = token;
      this.boundedWire = boundedWire;
    }
  }

  public GenAiGatewayTransport(StudioGatewayProperties properties) throws IOException {
    this(properties, credentialProvider(properties));
  }

  GenAiGatewayTransport(StudioGatewayProperties properties, BoundedCredentialProvider credentials) {
    properties.validateForVertex();
    this.properties = properties;
    this.credentials = credentials;
    capacity = new Semaphore(properties.maxConcurrency());
    OkHttpClient http =
        transportBuilder(properties)
            .addInterceptor(
                chain -> {
                  Attempt attempt = active.get();
                  if (attempt == null) {
                    throw new IOException("Gateway call has no budget");
                  }
                  attempt.budget.remaining();
                  attempt.removals.add(attempt.budget.onCancel(chain.call()::cancel));
                  var outgoing = chain.request().newBuilder().removeHeader("x-goog-api-key");
                  if (attempt.token == null) {
                    outgoing.removeHeader("Authorization");
                  } else {
                    outgoing.header("Authorization", "Bearer " + attempt.token);
                  }
                  var request = outgoing.build();
                  if (attempt.boundedWire && request.body() != null) {
                    long length = request.body().contentLength();
                    if (length < 0 || length > properties.maxInputBytes()) {
                      throw new WireLimitException();
                    }
                  }
                  var response = chain.proceed(request);
                  if (!attempt.boundedWire || response.body() == null) {
                    return response;
                  }
                  // Bound the entire JSON envelope before the SDK parses it, including errors.
                  // Escaping a bounded text response can multiply its wire size by six.
                  long limit = 65536L + 6L * Math.min(properties.maxOutputBytes(), 65536);
                  ResponseBody body = response.body();
                  if (body.contentLength() > limit) {
                    response.close();
                    throw new WireLimitException();
                  }
                  BufferedSource bounded =
                      Okio.buffer(
                          new ForwardingSource(body.source()) {
                            private long read;

                            @Override
                            public long read(Buffer sink, long count) throws IOException {
                              long size = super.read(sink, Math.min(count, limit - read + 1));
                              if (size > 0) {
                                read += size;
                              }
                              if (read > limit) {
                                throw new WireLimitException();
                              }
                              return size;
                            }
                          });
                  return response
                      .newBuilder()
                      .body(
                          new ResponseBody() {
                            @Override
                            public okhttp3.MediaType contentType() {
                              return body.contentType();
                            }

                            @Override
                            public long contentLength() {
                              return body.contentLength();
                            }

                            @Override
                            public BufferedSource source() {
                              return bounded;
                            }
                          })
                      .build();
                })
            .addNetworkInterceptor(
                chain -> {
                  Attempt attempt = active.get();
                  if (attempt == null || attempt.networkSends++ != 0) {
                    // Also blocks OkHttp follow-ups (e.g. 503 Retry-After: 0), not just SDK
                    // retries.
                    throw new IOException("Implicit gateway resend refused");
                  }
                  attempt.budget.remaining();
                  var response = chain.proceed(chain.request());
                  // Response headers arrived: a later timeout is mid-body, not a pre-response
                  // stall.
                  attempt.responseStarted = true;
                  // OkHttp may automatically repeat a 503 carrying Retry-After: 0 even with
                  // retryOnConnectionFailure=false. Return the original status to the caller,
                  // but remove that follow-up trigger; the transport never resends.
                  return response.code() == 503
                      ? response.newBuilder().removeHeader("Retry-After").build()
                      : response;
                })
            .build();
    GoogleCredentials fixed =
        GoogleCredentials.create(new AccessToken("", new Date(Long.MAX_VALUE)));
    if (credentials != null && credentials.quotaProjectId() != null) {
      fixed = fixed.createWithQuotaProject(credentials.quotaProjectId());
    }
    client =
        Client.builder()
            .vertexAI(true)
            .project(properties.project())
            .location(properties.location())
            .credentials(fixed)
            .clientOptions(ClientOptions.builder().customHttpClient(http).build())
            .httpOptions(
                HttpOptions.builder()
                    .baseUrl(properties.endpoint())
                    .apiVersion("v1")
                    .retryOptions(HttpRetryOptions.builder().attempts(1).build())
                    .build())
            .build();
  }

  static OkHttpClient.Builder transportBuilder(StudioGatewayProperties properties) {
    Duration timeout = properties.requestTimeout();
    return new OkHttpClient.Builder()
        .retryOnConnectionFailure(false)
        .followRedirects(false)
        .followSslRedirects(false)
        .connectTimeout(timeout)
        .readTimeout(timeout)
        .writeTimeout(timeout)
        .callTimeout(timeout);
  }

  private static BoundedCredentialProvider credentialProvider(StudioGatewayProperties properties)
      throws IOException {
    properties.validateForVertex();
    return StudioGatewayProperties.MODE_NONE.equalsIgnoreCase(properties.credentials().mode())
        ? null
        : new BoundedCredentialProvider(properties);
  }

  public StudioGatewayProperties properties() {
    return properties;
  }

  /** A null lease means capacity is busy; it never waits or starts credentials/model work. */
  public Lease tryAcquire(Budget budget) {
    return capacity.tryAcquire() ? new Lease(budget) : null;
  }

  /** Holds one shared permit until synchronous credential/model work has completely returned. */
  public final class Lease implements AutoCloseable {
    private final Budget budget;
    private String token;
    private boolean authenticated;
    private boolean closed;
    private boolean responseStarted;

    private Lease(Budget budget) {
      this.budget = budget;
    }

    public void authenticate() throws IOException, InterruptedException {
      budget.remaining();
      if (authenticated) {
        return;
      }
      if (credentials != null) {
        CredentialBudget credentialBudget = new CredentialBudget(budget.remaining());
        AutoCloseable remove = budget.onCancel(credentialBudget::cancel);
        try {
          token = credentials.token(credentialBudget);
          budget.remaining();
        } finally {
          unregister(remove);
        }
      }
      authenticated = true;
    }

    /**
     * Whether the last {@link #generate} call received response headers before it ended. A closed
     * boolean only: no header, status or body data is exposed.
     */
    public boolean responseStarted() {
      return responseStarted;
    }

    /** Exactly one SDK invocation; its HTTP layer is independently limited to one network send. */
    public GenerateContentResponse generate(
        String payload, GenerateContentConfig config, boolean boundedWire) {
      if (closed || !authenticated) {
        throw new IllegalStateException("Gateway lease not active");
      }
      budget.remaining();
      Attempt attempt = new Attempt(budget, token, boundedWire);
      active.set(attempt);
      try {
        GenerateContentResponse result =
            client.models.generateContent(properties.model(), payload, config);
        budget.remaining();
        return result;
      } finally {
        responseStarted = attempt.responseStarted;
        attempt.removals.forEach(GenAiGatewayTransport::unregister);
        active.remove();
      }
    }

    @Override
    public void close() {
      if (!closed) {
        closed = true;
        token = null;
        capacity.release();
      }
    }
  }

  private static void unregister(AutoCloseable removal) {
    try {
      removal.close();
    } catch (Exception ignored) {
      /* Registration removal is best effort. */
    }
  }

  /** Closed signal only; request/response bytes never become its message or cause. */
  private static final class WireLimitException extends IOException {
    private WireLimitException() {
      super("Gateway wire byte limit exceeded");
    }
  }

  public static boolean exceedsWireLimit(Throwable error) {
    for (Throwable current = error; current != null; current = current.getCause()) {
      if (current instanceof WireLimitException) {
        return true;
      }
    }
    return false;
  }

  public static boolean isTimeout(Throwable error) {
    return GatewayFailureClassifier.outcomeFor(error) == GatewayOutcome.TIMEOUT;
  }

  /**
   * Closed class of a non-timeout transport failure. {@code CONNECT}, {@code HTTP_429} and {@code
   * HTTP_503} are the Story 10.5 AC-4 definite-transient classes; nothing else may be repeated.
   */
  public enum TransportFailure {
    CONNECT,
    HTTP_429,
    HTTP_503,
    HTTP_400,
    HTTP_401_403,
    HTTP_4XX,
    HTTP_5XX,
    OTHER
  }

  /** Callers must check {@link #isTimeout} first; reads only the integer status and types. */
  public static TransportFailure transportFailure(Throwable error) {
    return GatewayFailureClassifier.transportFailureFor(error);
  }

  @Override
  public void close() {
    client.close();
    if (credentials != null) {
      credentials.close();
    }
  }
}
