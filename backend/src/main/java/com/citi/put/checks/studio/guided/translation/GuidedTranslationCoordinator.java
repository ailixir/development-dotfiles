package com.citi.put.checks.studio.guided.translation;

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
 */
public final class GuidedTranslationCoordinator {
  private final GuidedTranslationStore store;
  private final GuidedSessionRepository sessions;
  private final GuidedContracts contracts;
  private final URI origin;
  private final Path token;
  private final HttpClient http;

  public GuidedTranslationCoordinator(
      GuidedTranslationStore store,
      GuidedSessionRepository sessions,
      GuidedContracts contracts,
      URI origin,
      Path token)
      throws java.security.NoSuchAlgorithmException {
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
    this.http =
        HttpClient.newBuilder()
            .sslContext(javax.net.ssl.SSLContext.getDefault())
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
                        .put("schemaVersion", 2)
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
                            !session
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
