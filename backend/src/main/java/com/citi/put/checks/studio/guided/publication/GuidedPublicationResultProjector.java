package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.citi.put.checks.studio.readiness.ExecutionReadinessService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.core.Authentication;

/**
 * Receipt-backed public truth. A historic publication is distinct from this revision's readiness.
 */
public final class GuidedPublicationResultProjector {
  private final GuidedPublicationBaseRepository bases;
  private final GuidedPublicationRepository publications;
  private final GuidedSessionRepository sessions;
  private final GuidedSessionService guided;
  private final GuidedPublicationAuthorization authorization;
  private final GuidedContracts contracts;
  private final ExecutionReadinessService readiness;
  private final ObservedReplayProperties replay;

  public GuidedPublicationResultProjector(
      GuidedPublicationBaseRepository bases,
      GuidedPublicationRepository publications,
      GuidedSessionRepository sessions,
      GuidedSessionService guided,
      GuidedPublicationAuthorization authorization,
      GuidedContracts contracts,
      ExecutionReadinessService readiness,
      ObservedReplayProperties replay) {
    this.bases = bases;
    this.publications = publications;
    this.sessions = sessions;
    this.guided = guided;
    this.authorization = authorization;
    this.contracts = contracts;
    this.readiness = readiness;
    this.replay = replay;
  }

  public JsonNode started(JsonNode view) {
    return bases.find(text(view, "sessionId")).isPresent() ? view(view, null) : view;
  }

  public Optional<JsonNode> read(
      Authentication user, HttpServletRequest request, String id, boolean resultOnly) {
    var base = bases.find(id);
    if (base.isEmpty()) {
      return Optional.empty();
    }
    var receipt = publications.receipt(id);
    // This must precede all live-session/account/canExecute checks, including legacy read().
    if (receipt.isPresent()) {
      authorization.authorizeReceiptRead(user, request, receipt.get());
    } else {
      guided.read(user, id, "session");
    }
    JsonNode projected =
        sessions.transaction(
            () -> {
              var session = sessions.lock(id);
              ObjectNode result = result(session, receipt.orElse(null));
              if (resultOnly) {
                return result;
              }
              ObjectNode publicSession = contracts.object();
              for (String key :
                  List.of(
                      "schemaVersion", "sessionId", "testId", "state", "expiresAt", "counters")) {
                publicSession.set(key, session.document().path(key));
              }
              return view(publicSession, result);
            });
    return Optional.of(projected);
  }

  private ObjectNode view(JsonNode publicSession, JsonNode result) {
    ObjectNode out = contracts.object().put("schemaVersion", 3);
    out.set("session", publicSession.deepCopy());
    if (result == null) {
      out.putNull("result");
    } else {
      out.set("result", result);
    }
    contracts.validate("v3/session-view", out);
    return out;
  }

  private ObjectNode result(
      GuidedSessionRepository.Session current, PublicationContracts.Receipt receipt) {
    JsonNode session = current.document();
    String id = text(session, "sessionId"), state = text(session, "state");
    ObjectNode result =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("executionId", id)
            .put("scopeHash", text(session, "scopeHash"))
            .put("mode", "guided")
            .put("outcome", state)
            .put("learnedFromThisRun", receipt != null)
            .put("replayVerified", false)
            .put("scheduleActivated", false);
    boolean completed =
        current.progress().path("stepIndex").asInt(-1) == session.path("sourceSteps").size()
            && sessions.actions(id).stream()
                .allMatch(a -> a.path("state").asText().equals("SUCCEEDED"));
    result.put("assertionsPassed", completed);
    result.putArray("actionTimings");
    result.putObject("evidence").put("kind", "guidedLedger").put("ref", id).putNull("video");
    if (current.progress().path("errorCode").isTextual()) {
      result.set("errorCode", current.progress().path("errorCode"));
    } else {
      result.putNull("errorCode");
    }
    ObjectNode publication = result.putObject("publication"),
        ready = result.putObject("currentReadiness");
    if (receipt == null) {
      publication
          .put(
              "status",
              state.equals("PUBLICATION_CONFLICT")
                  ? "CONFLICT"
                  : java.util.Set.of("FAILED", "CANCELLED", "EXPIRED", "UNKNOWN_OUTCOME")
                          .contains(state)
                      ? "REFUSED"
                      : "PENDING")
          .putNull("receipt");
      ready.putNull("revisionId").put("ready", false).put("code", "NOT_PUBLISHED");
    } else {
      JsonNode proof = receipt.document();
      publication.put("status", "PUBLISHED").set("receipt", proof.path("publicReceipt"));
      UUID revisionId = UUID.fromString(text(proof, "revisionId")),
          testId = UUID.fromString(text(proof, "testId"));
      var base = bases.find(id).orElseThrow();
      var source = bases.lockCurrent(testId).document();
      String code =
          !source.path("confirmedRevisionId").asText().equals(revisionId.toString())
              ? "HEAD_CHANGED"
              : !source.path("sourceRevision").equals(base.document().path("sourceRevision"))
                  ? "SOURCE_CHANGED"
                  : !source
                          .path("configurationRevision")
                          .equals(base.document().path("configurationRevision"))
                      ? "CONFIG_CHANGED"
                      : !replay.enabled()
                          ? "REPLAY_DISABLED"
                          : readiness.evaluate(testId).ready() ? "READY" : "RUNTIME_INCOMPATIBLE";
      ready
          .put("revisionId", revisionId.toString())
          .put("ready", code.equals("READY"))
          .put("code", code);
    }
    contracts.validate("v3/result", result);
    return result;
  }
}
