package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.dispatch.StudioRunnerTls;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Durable continuation uses the controller's mounted JWT/mTLS, never an invented worker identity.
 *
 * <p>Its HTTP client takes the backend's one TLS identity ({@link StudioRunnerTls}): the client
 * certificate the API pod's guided connector demands, and the private issuer as the only trust
 * anchor. It never reads a JVM default (STUDIO-OBS-009 AC-2, ruling part 2 section 3).
 *
 * <p>It runs on the scheduler role only (STUDIO-OBS-009 AC-5): see {@link
 * GuidedTranslationConfiguration}.
 *
 * <p>The scheduled tick never waits on a send. Every fixed-delay task in the application shares one
 * scheduler thread, so a continuation that blocked there would hold up the others for as long as
 * the model takes. Each runnable session is instead continued on its own virtual thread, at most
 * one at a time per session: a session whose previous POST is still running is skipped, so a later
 * poll cannot start a second request that supersedes the first.
 */
public final class GuidedTranslationCoordinator implements AutoCloseable {
  private static final Logger LOG = LoggerFactory.getLogger(GuidedTranslationCoordinator.class);

  /** The property defaults, for the constructors that take no properties (tests). */
  private static final GuidedTranslationProperties DEFAULTS =
      new GuidedTranslationProperties(true, 98304, 4096, 60, "worker-1");

  private final GuidedTranslationStore store;
  private final GuidedSessionRepository sessions;
  private final GuidedContracts contracts;
  private final URI origin;
  private final Path token;
  private final HttpClient http;
  private final Duration requestTimeout;
  private final Set<String> inFlight = ConcurrentHashMap.newKeySet();
  private final AtomicReference<RuntimeException> firstFailure = new AtomicReference<>();
  private final ExecutorService continuations =
      Executors.newThreadPerTaskExecutor(
          Thread.ofVirtual().name("guided-continuation-", 0).factory());

  /**
   * The coordinator without a configured TLS identity, for tests that install their own JVM-wide
   * context around one call. The Spring bean never uses it: {@link GuidedTranslationConfiguration}
   * passes the backend's {@link StudioRunnerTls}.
   *
   * @param store the durable translation state
   * @param sessions the session repository
   * @param contracts the guided wire contracts
   * @param origin the controller origin, https only
   * @param token the file holding the controller JWT
   */
  public GuidedTranslationCoordinator(
      GuidedTranslationStore store,
      GuidedSessionRepository sessions,
      GuidedContracts contracts,
      URI origin,
      Path token) {
    this(store, sessions, contracts, origin, token, DEFAULTS, client(HttpClient.newBuilder()));
  }

  /**
   * The coordinator with a TLS identity and the default translation bounds, for tests.
   *
   * @param store the durable translation state
   * @param sessions the session repository
   * @param contracts the guided wire contracts
   * @param origin the controller origin, https only
   * @param token the file holding the controller JWT
   * @param tls the backend's identity on the private Studio service plane
   */
  public GuidedTranslationCoordinator(
      GuidedTranslationStore store,
      GuidedSessionRepository sessions,
      GuidedContracts contracts,
      URI origin,
      Path token,
      StudioRunnerTls tls) {
    this(store, sessions, contracts, origin, token, tls, DEFAULTS);
  }

  /**
   * The deployed coordinator.
   *
   * @param store the durable translation state
   * @param sessions the session repository
   * @param contracts the guided wire contracts
   * @param origin the controller origin, https only
   * @param token the file holding the controller JWT
   * @param tls the backend's identity on the private Studio service plane
   * @param properties the translation bounds, which set how long one POST is awaited
   */
  public GuidedTranslationCoordinator(
      GuidedTranslationStore store,
      GuidedSessionRepository sessions,
      GuidedContracts contracts,
      URI origin,
      Path token,
      StudioRunnerTls tls,
      GuidedTranslationProperties properties) {
    this(store, sessions, contracts, origin, token, properties, controllerClient(tls));
  }

  GuidedTranslationCoordinator(
      GuidedTranslationStore store,
      GuidedSessionRepository sessions,
      GuidedContracts contracts,
      URI origin,
      Path token,
      GuidedTranslationProperties properties,
      HttpClient http) {
    if (!"https".equals(origin.getScheme())
        || origin.getHost() == null
        || origin.getUserInfo() != null
        || origin.getQuery() != null
        || origin.getFragment() != null) {
      throw new IllegalArgumentException("Controller origin must be HTTPS");
    }
    this.store = store;
    this.sessions = sessions;
    this.contracts = contracts;
    this.origin = origin;
    this.token = token;
    this.http = http;
    this.requestTimeout = properties.continuationTimeout();
  }

  /**
   * The client the deployed coordinator sends with: mutual TLS from {@code tls}, no redirect
   * followed, a 5 s connect bound. A seam so a handshake test can build exactly this client.
   *
   * @param tls the backend's identity on the private Studio service plane
   * @return the controller-hop client
   */
  public static HttpClient controllerClient(StudioRunnerTls tls) {
    return client(tls.configure(HttpClient.newBuilder()));
  }

  private static HttpClient client(HttpClient.Builder builder) {
    return builder
        .followRedirects(HttpClient.Redirect.NEVER)
        .connectTimeout(Duration.ofSeconds(5))
        .build();
  }

  /** The tick: starts a continuation for each runnable session that has none, then returns. */
  @Scheduled(fixedDelayString = "${studio.guided-authoring.translation.poll-ms:1000}")
  public void continueRuns() {
    com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
        !org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    // Sessions in flight sort first (their updated_at is old), so they must not use up the window.
    for (String id : store.runnable(8 + inFlight.size())) {
      if (!inFlight.add(id)) {
        continue;
      }
      try {
        continuations.execute(() -> continueRun(id));
      } catch (RejectedExecutionException closed) {
        inFlight.remove(id);
        return;
      }
    }
  }

  private void continueRun(String id) {
    try {
      post(id, command(id));
    } catch (HttpTimeoutException timeout) {
      // The derived timeout was shorter than the request: the next poll re-drives over it.
      LOG.warn("Guided continuation of session {} timed out after {}", id, requestTimeout, timeout);
    } catch (java.io.IOException failure) {
      // Durable attempts/obligation admissions recover a missing response on the next poll.
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
    } catch (RuntimeException failure) {
      firstFailure.compareAndSet(null, failure);
      LOG.warn("Guided continuation of session {} failed", id, failure);
    } finally {
      inFlight.remove(id);
    }
  }

  private ObjectNode command(String id) {
    return sessions.transaction(
        () -> {
          var session = sessions.lock(id);
          var state = store.state(id);
          ObjectNode request =
              contracts
                  .object()
                  .put("schemaVersion", 3)
                  .put("sessionId", id)
                  .put("expectedPlanRevision", state.path("planRevision").asLong());
          request.set(
              "expectedSourceRevision", session.document().path("scope").path("sourceRevision"));
          request.set(
              "expectedConfigurationRevision",
              session.document().path("scope").path("configurationRevision"));
          ObjectNode envelope =
              contracts
                  .object()
                  .put("fence", session.document().path("owner").path("fence").asLong())
                  .put(
                      "route",
                      java.util.Set.of("REPLAYING_PREFIX", "MATERIALIZE")
                              .contains(state.path("continuation").asText())
                          ? "plans"
                          : !session
                                  .progress()
                                  .path("translationBootstrap")
                                  .path("phase")
                                  .asText()
                                  .equals("READY")
                              ? "plans"
                              : state.path("continuation").asText().equals("SOURCE_PLAN")
                                  ? "dependency-admissions"
                                  : "proposals")
                  .put(
                      "key",
                      "translation-"
                          + GuidedContracts.hash(
                              contracts
                                  .object()
                                  .setAll(
                                      java.util.Map.of(
                                          "request",
                                          request,
                                          "progress",
                                          session.progress(),
                                          "state",
                                          session.document().path("state"),
                                          "modelProposals",
                                          session
                                              .document()
                                              .path("counters")
                                              .path("modelProposals")))));
          envelope.set("request", request);
          return envelope;
        });
  }

  private void post(String id, ObjectNode command)
      throws java.io.IOException, InterruptedException {
    HttpRequest request =
        HttpRequest.newBuilder(
                origin.resolve(
                    "/internal/v2/studio/guided-sessions/"
                        + id
                        + "/"
                        + command.path("route").asText()))
            .header("Authorization", "Bearer " + Files.readString(token).strip())
            .header("X-Owner-Fence", command.path("fence").asText())
            .header("Idempotency-Key", command.path("key").asText())
            .header("Content-Type", "application/json")
            .timeout(requestTimeout)
            .POST(HttpRequest.BodyPublishers.ofString(command.path("request").toString()))
            .build();
    http.send(request, HttpResponse.BodyHandlers.discarding());
  }

  /**
   * Waits for the continuations already started, and refuses further ticks. For a caller that needs
   * a tick's work finished (tests); the bean itself is stopped by {@link #close()}. The first
   * continuation that failed with a RuntimeException is rethrown here, so a test fails at its
   * cause.
   *
   * @param timeout the longest to wait
   * @throws InterruptedException when the wait is interrupted
   * @throws java.util.concurrent.TimeoutException when a continuation is still running at the end
   */
  public void drain(Duration timeout)
      throws InterruptedException, java.util.concurrent.TimeoutException {
    continuations.shutdown();
    if (!continuations.awaitTermination(timeout.toNanos(), TimeUnit.NANOSECONDS)) {
      throw new java.util.concurrent.TimeoutException("Guided continuations still running");
    }
    RuntimeException failure = firstFailure.get();
    if (failure != null) {
      throw failure;
    }
  }

  /**
   * Stops the coordinator: interrupts the continuations in flight, which the next poll of a
   * restarted coordinator recovers from durable state.
   */
  @Override
  public void close() {
    continuations.shutdownNow();
  }
}
