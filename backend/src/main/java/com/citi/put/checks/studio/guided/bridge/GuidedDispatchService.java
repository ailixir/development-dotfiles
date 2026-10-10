package com.citi.put.checks.studio.guided.bridge;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Sole sender of ephemeral post-commit consumption authority; there is deliberately no outbox. */
public final class GuidedDispatchService {
  private final GuidedSessionService sessions;
  private final GuidedMaterializationService materialization;
  private final GuidedRunnerClient runner;

  public GuidedDispatchService(
      GuidedSessionService sessions,
      GuidedMaterializationService materialization,
      GuidedRunnerClient runner) {
    this.sessions = sessions;
    this.materialization = materialization;
    this.runner = runner;
  }

  /** Assignment intent commits before the worker uses its own credential to claim. */
  public JsonNode assign(Authentication controller, String id, String key, String workerId) {
    noTransaction();
    ObjectNode intent = sessions.prepareAssignment(controller, id, key, workerId);
    JsonNode receipt = runner.send("assign", intent, key);
    sessions.acknowledgeAssignment(controller, id, receipt);
    return receipt;
  }

  public JsonNode pushContext(Authentication controller, String id, long fence) {
    noTransaction();
    return runner.send("context", sessions.runnerContext(controller, id, fence));
  }

  public JsonNode observe(
      Authentication controller, String id, long fence, String key, JsonNode request) {
    noTransaction();
    JsonNode committed = sessions.beginObservationRefresh(controller, id, fence, key, request);
    if (committed != null) {
      return committed;
    }
    JsonNode response;
    try {
      response = runner.send("observe", request, key);
    } catch (RuntimeException failure) {
      JsonNode recovered =
          sessions.committedObservationRefresh(controller, id, fence, key, request, null);
      if (recovered != null) {
        return recovered;
      }
      throw failure;
    }
    return sessions.committedObservationRefresh(controller, id, fence, key, request, response);
  }

  public JsonNode prepareAndAdmit(
      Authentication controller, String id, long fence, String key, JsonNode proposal) {
    noTransaction();
    JsonNode existing = sessions.existingAdmission(controller, id, fence, key, proposal);
    if (existing != null) {
      return existing;
    }
    ObjectNode context = sessions.runnerContext(controller, id, fence);
    runner.send("context", context);
    ObjectNode request = materialization.identity(context);
    request.set("proposal", proposal);
    request.put("requestDigest", GuidedContracts.hash(proposal));
    request.set("expiresAt", context.path("leaseExpiresAt"));
    JsonNode proof = runner.send("prepare", request);
    sessions.storePreparation(controller, id, fence, proposal, proof);
    return sessions.admit(controller, id, fence, key, proposal);
  }

  public JsonNode dispatch(
      Authentication controller, String id, long fence, String key, JsonNode request) {
    noTransaction();
    var consumed = sessions.consume(controller, id, fence, key, request);
    if (consumed instanceof GuidedSessionService.AlreadyConsumed prior) {
      return prior.ledger();
    }
    var won = (GuidedSessionService.WonConsumption) consumed;
    ObjectNode payload = materialization.identity(won.context());
    payload.set("proposal", won.proposal());
    payload.set("ledger", won.ledger());
    payload.set("preparationId", won.ledger().path("preparationId"));
    var edges = payload.putArray("consumerEdges");
    for (JsonNode edge : won.context().path("consumerEdges")) {
      if (edge.path("consumerAdmissionId")
          .equals(won.ledger().path("admission").path("admissionId"))) {
        edges.add(edge);
      }
    }
    try {
      runner.send("dispatch", payload);
    } catch (RuntimeException failure) {
      sessions.lostAcknowledgment(id, won.ledger().path("admission").path("admissionId").asText());
      throw failure;
    }
    // HTTP200 does not substitute for an owner-authenticated committed callback.
    sessions.lostAcknowledgment(id, won.ledger().path("admission").path("admissionId").asText());
    // The owner-authenticated callback is commit authority; response is only transport ack.
    return won.ledger();
  }

  public void stop(ObjectNode lastContext, String reason) {
    noTransaction();
    ObjectNode stop;
    if (lastContext.has("assignmentId")) {
      stop = new GuidedContracts().object().put("schemaVersion", 2).put("kind", "assignment");
      stop.set("assignment", lastContext);
    } else {
      stop = materialization.identity(lastContext);
    }
    stop.put("reason", reason);
    runner.send("stop", stop);
  }

  private static void noTransaction() {
    require(
        !TransactionSynchronizationManager.isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
  }
}
