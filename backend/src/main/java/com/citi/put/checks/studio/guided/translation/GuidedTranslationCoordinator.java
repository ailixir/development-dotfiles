package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.dispatch.StudioRunnerTls;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
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
 */
public final class GuidedTranslationCoordinator {
  private final GuidedTranslationStore store;
  private final GuidedSessionRepository sessions;
  private final GuidedContracts contracts;
  private final URI origin;
  private final Path token;
  private final HttpClient http;

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
    this(store, sessions, contracts, origin, token, client(HttpClient.newBuilder()));
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
   */
  public GuidedTranslationCoordinator(
      GuidedTranslationStore store,
      GuidedSessionRepository sessions,
      GuidedContracts contracts,
      URI origin,
      Path token,
      StudioRunnerTls tls) {
    this(store, sessions, contracts, origin, token, controllerClient(tls));
  }

  private GuidedTranslationCoordinator(
      GuidedTranslationStore store,
      GuidedSessionRepository sessions,
      GuidedContracts contracts,
      URI origin,
      Path token,
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

  @Scheduled(fixedDelayString = "${studio.guided-authoring.translation.poll-ms:1000}")
  public void continueRuns() {
    com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
        !org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    for (String id : store.runnable(8)) {
      ObjectNode command =
          sessions.transaction(
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
                    "expectedSourceRevision",
                    session.document().path("scope").path("sourceRevision"));
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
      try {
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
                .timeout(Duration.ofSeconds(65))
                .POST(HttpRequest.BodyPublishers.ofString(command.path("request").toString()))
                .build();
        http.send(request, HttpResponse.BodyHandlers.discarding());
      } catch (java.io.IOException failure) {
        // Durable attempts/obligation admissions recover a missing response on the next poll.
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
        return;
      }
    }
  }
}
