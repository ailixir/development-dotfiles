package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;

import com.citi.put.checks.studio.guided.evidence.GuidedEvidenceProjection;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedPublicPresentationProjector;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
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
  private final com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization;
  private final GuidedContracts contracts;
  private final ExecutionReadinessService readiness;
  private final ObservedReplayProperties replay;
  private final GuidedPublicPresentationProjector presentation;
  private GuidedEvidenceProjection evidence = GuidedEvidenceProjection.NONE;
  private final LearnProofRepository proofs;

  public GuidedPublicationResultProjector(
      GuidedPublicationBaseRepository bases,
      GuidedPublicationRepository publications,
      GuidedSessionRepository sessions,
      GuidedSessionService guided,
      com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization,
      GuidedContracts contracts,
      ExecutionReadinessService readiness,
      ObservedReplayProperties replay,
      GuidedPublicPresentationProjector presentation,
      LearnProofRepository proofs) {
    this.bases = bases;
    this.publications = publications;
    this.sessions = sessions;
    this.guided = guided;
    this.authorization = authorization;
    this.contracts = contracts;
    this.readiness = readiness;
    this.replay = replay;
    this.presentation = presentation;
    this.proofs = proofs;
  }

  /**
   * Installs the recording evidence projection (STUDIO-OBS-013). Until it is installed, results
   * carry today's literals ({@code video null}, {@code actionTimings []}). A second install is
   * refused, as {@code GuidedSessionService.installPublication} refuses one.
   */
  public void installEvidence(GuidedEvidenceProjection projection) {
    GuidedSessionException.require(
        evidence == GuidedEvidenceProjection.NONE && projection != null,
        "RUNTIME_INCOMPATIBLE",
        409);
    evidence = projection;
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
                      "schemaVersion",
                      "sessionId",
                      "testId",
                      "state",
                      "expiresAt",
                      "counters",
                      "baseRevisionId",
                      "firstLearnStepId")) {
                if (session.document().has(key)) {
                  publicSession.set(key, session.document().path(key));
                }
              }
              // P2: the same progress the live session view carries.
              publicSession.set("progress", presentation.progress(session));
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
    String id = text(session, "sessionId");
    ObjectNode result =
        guided.projectResult(current, true, receipt != null, evidence, presentation);
    result.put("learnedFromThisRun", receipt != null);
    ObjectNode publication = (ObjectNode) result.path("publication"),
        ready = (ObjectNode) result.path("currentReadiness");
    if (receipt != null) {
      JsonNode proof = receipt.document();
      publication.put("status", "PUBLISHED").set("receipt", proof.path("publicReceipt"));
      // The proof is the replay execution the publication accepted; a refused proof (or none)
      // stays null and its closed code is never published.
      proofs
          .find(id)
          .map(LearnProofRepository.Link::executionId)
          .ifPresent(
              execution -> result.putObject("proof").put("executionId", execution.toString()));
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
