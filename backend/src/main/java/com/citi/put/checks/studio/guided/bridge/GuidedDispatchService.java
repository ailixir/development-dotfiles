package com.citi.put.checks.studio.guided.bridge;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver.SecretUseNotAuthorizedException;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver.SecretUseRevokedException;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver.UnknownReferenceException;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.citi.put.checks.studio.secrets.VaultProviderUnavailableException;
import com.citi.put.checks.studio.secrets.VaultStudioReferenceResolver.SecretTooLongException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Sole sender of ephemeral post-commit consumption authority; there is deliberately no outbox. */
public final class GuidedDispatchService {
  private final GuidedSessionService sessions;
  private final GuidedMaterializationService materialization;
  private final com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient runner;
  private com.citi.put.checks.studio.dispatch.StudioReferenceResolver references;

  public GuidedDispatchService(
      GuidedSessionService sessions,
      GuidedMaterializationService materialization,
      com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient runner) {
    this.sessions = sessions;
    this.materialization = materialization;
    this.runner = runner;
  }

  public void installReferences(
      com.citi.put.checks.studio.dispatch.StudioReferenceResolver references) {
    this.references = references;
  }

  private JsonNode secretInput(JsonNode context, JsonNode proposal) {
    JsonNode value = proposal.path("operation").path("value");
    if (!value.path("kind").asText().equals("secretRef")) {
      return null;
    }
    JsonNode input =
        com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.unique(
            context.path("authoredInputs").path("inputs"),
            "inputId",
            value.path("sourceInputId").asText());
    require(
        input.path("kind").asText().equals("secretRef")
            && input.path("sourceStepId").equals(proposal.path("coordinate").path("stepId"))
            && input.path("intendedSlot").asText().equals("fill.value")
            && proposal.path("target").path("kind").asText().equals("passwordControl"),
        "REFERENCE_MISMATCH",
        422);
    return input;
  }

  private void preflight(String id, JsonNode input) {
    if (input == null) {
      return;
    }
    require(references != null, "SECRET_UNAVAILABLE", 404);
    JsonNode session = sessions.secretSession(id), scope = session.path("scope");
    try {
      references.preflight(
          scope.path("csiId").asText(),
          scope.path("environmentId").asText(),
          java.util.UUID.fromString(session.path("testId").asText()),
          scope.path("principalId").asText(),
          new com.citi.put.checks.studio.dispatch.ReferenceDeclarations(
              java.util.List.of(), java.util.List.of(input.path("secretId").asText())));
    } catch (SecretUseNotAuthorizedException failure) {
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          "SECRET_USE_REVOKED", 409);
    } catch (UnknownReferenceException failure) {
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          "SECRET_UNAVAILABLE", 404);
    } catch (VaultProviderUnavailableException failure) {
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          "VAULT_UNAVAILABLE", 503);
    }
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
    ObjectNode context = sessions.runnerContext(controller, id, fence);
    String delivery = sessions.contextDeliveryId(controller, id, fence);
    // STUDIO-OBS-015 B2B-01 P2: a keyed append delivery is never sent at or after its frozen
    // leaseExpiresAt (the V21 ACK deadline); the caller-deadline overload refuses locally.
    JsonNode acknowledgement =
        delivery == null
            ? runner.send("context", context)
            : runner.send(
                "context",
                context,
                delivery,
                java.time.Instant.parse(context.path("leaseExpiresAt").asText()));
    if (delivery != null) {
      sessions.acknowledgeContext(controller, id, fence, acknowledgement);
    }
    return acknowledgement;
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
    preflight(id, secretInput(context, proposal));
    try {
      runner.send("context", context);
    } catch (RuntimeException failure) {
      if (com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient.definiteContextRefusal(
          failure)) {
        // ar-2-r14-stops ruling 2: the session ends FAILED RUNTIME_INCOMPATIBLE before prepare is
        // sent, so no preparation, admission or ledger row exists.
        sessions.failTranslation(controller, id, fence, "RUNTIME_INCOMPATIBLE");
      }
      throw failure;
    }
    ObjectNode request = materialization.identity(context);
    request.set("proposal", proposal);
    request.put("requestDigest", GuidedContracts.hash(proposal));
    request.set("expiresAt", context.path("leaseExpiresAt"));
    JsonNode proof = runner.send("prepare", request);
    sessions.storePreparation(controller, id, fence, proposal, proof);
    return sessions.admit(controller, id, fence, key, proposal);
  }

  public JsonNode preparePrefix(JsonNode request) {
    noTransaction();
    return runner.send("prepare", request, request.path("requestDigest").asText());
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
      JsonNode input = secretInput(won.context(), won.proposal());
      if (input == null) {
        runner.send(
            "dispatch",
            payload,
            java.util.UUID.randomUUID().toString(),
            java.time.Instant.parse(won.context().path("expiresAt").asText()));
      } else {
        require(references != null, "SECRET_UNAVAILABLE", 404);
        JsonNode session = sessions.secretSession(id), scope = session.path("scope");
        String secretId = input.path("secretId").asText();
        try (var resolved =
            references.resolve(
                scope.path("csiId").asText(),
                scope.path("environmentId").asText(),
                java.util.UUID.fromString(session.path("testId").asText()),
                scope.path("principalId").asText(),
                new com.citi.put.checks.studio.dispatch.ReferenceDeclarations(
                    java.util.List.of(), java.util.List.of(secretId)))) {
          ObjectNode metadata =
              new GuidedContracts()
                  .object()
                  .put("secretId", secretId)
                  .put("versionId", resolved.secretVersions().get(secretId));
          var origins = metadata.putArray("allowedOrigins");
          resolved
              .secretOrigins()
              .getOrDefault(secretId, java.util.List.of())
              .forEach(origins::add);
          sessions.recordSecretDecision(
              id,
              won.ledger(),
              secretId,
              resolved.secretVersions().get(secretId),
              com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome.RESOLVED);
          String origin = won.proposal().path("executionEvidence").path("origin").asText();
          if (origins.isEmpty()
              || origins.size() > 16
              || metadata.path("versionId").asText().length() > 256
              || !resolved
                  .secretOrigins()
                  .getOrDefault(secretId, java.util.List.of())
                  .contains(origin)) {
            sessions.refuseResolvedSecret(id, won.ledger());
            throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
                "ORIGIN_NOT_ALLOWED", 403);
          }
          runner.sendSecret(
              payload,
              metadata,
              resolved.secretValues().get(secretId),
              java.time.Instant.parse(session.path("expiresAt").asText()));
        } catch (SecretUseRevokedException failure) {
          sessions.recordSecretDecision(
              id,
              won.ledger(),
              secretId,
              null,
              com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome.REVOKED);
          throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
              "SECRET_USE_REVOKED", 409);
        } catch (StudioReferenceResolver.ReferenceUnavailableException failure) {
          sessions.recordSecretDecision(
              id,
              won.ledger(),
              secretId,
              null,
              com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome
                  .UNAVAILABLE);
          throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
              "SECRET_UNAVAILABLE", 404);
        } catch (VaultProviderUnavailableException failure) {
          sessions.recordSecretDecision(
              id,
              won.ledger(),
              secretId,
              null,
              com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome
                  .VAULT_UNAVAILABLE);
          throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
              "VAULT_UNAVAILABLE", 503);
        } catch (SecretTooLongException failure) {
          sessions.recordSecretDecision(
              id,
              won.ledger(),
              secretId,
              null,
              com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome
                  .UNAVAILABLE,
              "SECRET_TOO_LONG");
          throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
              "SECRET_TOO_LONG", 422);
        }
      }
    } catch (RuntimeException failure) {
      try {
        reconcileLostAcknowledgment(
            id, won.ledger().path("admission").path("admissionId").asText());
      } catch (RuntimeException reconciliationFailure) {
        if (failure instanceof com.citi.put.checks.studio.guided.session.GuidedSessionException
            && "UNKNOWN_OUTCOME".equals(failure.getMessage())) {
          // Retain only the closed transport code, never a value-bearing provider exception.
          reconciliationFailure.addSuppressed(
              new com.citi.put.checks.studio.guided.session.GuidedSessionException(
                  "UNKNOWN_OUTCOME", 409));
        }
        throw reconciliationFailure;
      }
      throw failure;
    }
    // HTTP200 does not substitute for an owner-authenticated committed callback.
    reconcileLostAcknowledgment(id, won.ledger().path("admission").path("admissionId").asText());
    // The owner-authenticated callback is commit authority; response is only transport ack.
    return won.ledger();
  }

  /** Only terminal reconciliation masks a prior interrupt, after dispatch buffers are erased. */
  private void reconcileLostAcknowledgment(String id, String admissionId) {
    boolean interrupted = Thread.interrupted();
    try {
      sessions.lostAcknowledgment(id, admissionId);
    } finally {
      if (interrupted) {
        Thread.currentThread().interrupt();
      }
    }
  }

  /**
   * STUDIO-OBS-015 H8: the idempotency key is a pure function of the unchanged stop body, so every
   * re-drive of one teardown joins the runner's original stop instead of adding a replay entry.
   */
  public void stop(ObjectNode lastContext, String reason) {
    noTransaction();
    ObjectNode stop;
    if (lastContext.has("assignmentId")) {
      stop = new GuidedContracts().object().put("schemaVersion", 3).put("kind", "assignment");
      stop.set("assignment", lastContext);
    } else {
      stop = materialization.identity(lastContext);
    }
    stop.put("reason", reason);
    runner.send("stop", stop, "teardown-" + GuidedContracts.hash(stop));
  }

  private static void noTransaction() {
    require(
        !TransactionSynchronizationManager.isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
  }
}
