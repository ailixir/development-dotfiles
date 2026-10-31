package com.citi.put.checks.studio.guided.bridge;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
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

  /**
   * The secret inputs a step may use: the secret entries of its server-set {@code uses}, each
   * resolved to the authored input that declares it for this step. At most eight.
   */
  private java.util.List<JsonNode> secretInputs(JsonNode context, JsonNode proposal) {
    var inputs = new java.util.ArrayList<JsonNode>();
    for (JsonNode use : proposal.path("operation").path("uses")) {
      if (!use.path("kind").asText().equals("secret")) {
        continue;
      }
      JsonNode input = null;
      for (JsonNode candidate : context.path("authoredInputs").path("inputs")) {
        if (candidate.path("secretId").asText().equals(use.path("id").asText())) {
          input = candidate;
        }
      }
      require(
          input != null
              && input.path("kind").asText().equals("secretRef")
              && input.path("sourceStepId").equals(proposal.path("coordinate").path("stepId")),
          "REFERENCE_MISMATCH",
          422);
      inputs.add(input);
    }
    require(inputs.size() <= 8, "BUDGET_EXCEEDED", 429);
    return inputs;
  }

  private void preflight(String id, java.util.List<JsonNode> inputs) {
    if (inputs.isEmpty()) {
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
              java.util.List.of(), secretIds(inputs)));
    } catch (UnknownReferenceException failure) {
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          "SECRET_UNAVAILABLE", 404);
    } catch (VaultProviderUnavailableException failure) {
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          "VAULT_UNAVAILABLE", 503);
    }
  }

  private static java.util.List<String> secretIds(java.util.List<JsonNode> inputs) {
    return inputs.stream().map(input -> input.path("secretId").asText()).toList();
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
      if (failure
              instanceof com.citi.put.checks.studio.guided.session.GuidedSessionException refusal
          && (refusal.getMessage().equals("ORIGIN_NOT_ALLOWED")
              || refusal.getMessage().equals("UNSUPPORTED_SURFACE"))) {
        // The learning page left the allowed domains and did not return, or the runner gave up
        // collecting a page it cannot observe at its deadline (ADR-SC-007 D8): the session ends
        // FAILED with that code.
        try {
          sessions.failTranslation(controller, id, fence, refusal.getMessage());
        } catch (com.citi.put.checks.studio.guided.session.GuidedSessionException stale) {
          // Never revive expired or replaced authority.
        }
      }
      throw failure;
    }
    return sessions.committedObservationRefresh(controller, id, fence, key, request, response);
  }

  /** Prepare an already reserved proposal and admit it: the resume path of a crashed advance. */
  public JsonNode prepareAndAdmit(
      Authentication controller, String id, long fence, String key, JsonNode proposal) {
    noTransaction();
    JsonNode existing = sessions.existingAdmission(controller, id, fence, key, proposal);
    if (existing != null) {
      return existing;
    }
    JsonNode proof = prepareStep(controller, id, fence, proposal);
    return admitPrepared(controller, id, fence, key, proposal, proof);
  }

  /**
   * The runner prepare of one step proposal: the syntax admission (the code constructs, its hash
   * matches) and, for learning, a run up to the first effectful call. A repairable refusal is a
   * {@link com.citi.put.checks.studio.guided.session.GuidedSessionException} with messageCode
   * STEP_SYNTAX or STEP_PRE_FENCE. Nothing is stored or reserved here.
   */
  public JsonNode prepareStep(Authentication controller, String id, long fence, JsonNode proposal) {
    noTransaction();
    ObjectNode context = sessions.runnerContext(controller, id, fence);
    preflight(id, secretInputs(context, proposal));
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
    return runner.send("prepare", request);
  }

  /** Stores the preparation proof and admits the reserved proposal under {@code key}. */
  public JsonNode admitPrepared(
      Authentication controller,
      String id,
      long fence,
      String key,
      JsonNode proposal,
      JsonNode proof) {
    noTransaction();
    sessions.storePreparation(controller, id, fence, proposal, proof);
    return sessions.admit(
        controller, id, fence, key, proposal, proof.path("preparationId").asText());
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
      java.util.List<JsonNode> inputs = secretInputs(won.context(), won.proposal());
      if (inputs.isEmpty()) {
        payload.putArray("secrets");
        runner.send(
            "dispatch",
            payload,
            java.util.UUID.randomUUID().toString(),
            java.time.Instant.parse(won.context().path("expiresAt").asText()));
      } else {
        require(references != null, "SECRET_UNAVAILABLE", 404);
        JsonNode session = sessions.secretSession(id), scope = session.path("scope");
        java.util.List<String> secretIds = secretIds(inputs);
        try (var resolved =
            references.resolve(
                scope.path("csiId").asText(),
                scope.path("environmentId").asText(),
                java.util.UUID.fromString(session.path("testId").asText()),
                scope.path("principalId").asText(),
                new com.citi.put.checks.studio.dispatch.ReferenceDeclarations(
                    java.util.List.of(), secretIds))) {
          String origin = won.proposal().path("executionEvidence").path("origin").asText();
          var envelopes =
              new java.util.ArrayList<
                  com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient.SecretEnvelope>();
          for (String secretId : secretIds) {
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
                com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome
                    .RESOLVED);
            // The page the step starts on must be on the deployment's list. Which origin the
            // secret is typed on is judged at the fill, by the runtime form-action and origin
            // checks; a step that navigates and then fills is not refused here.
            if (origins.isEmpty()
                || origins.size() > 16
                || !sessions.allowedDomains().allows(origin)
                || metadata.path("versionId").asText().length() > 256) {
              sessions.refuseResolvedSecret(id, won.ledger());
              throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
                  "ORIGIN_NOT_ALLOWED", 403);
            }
            envelopes.add(
                new com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient.SecretEnvelope(
                    metadata, resolved.secretValues().get(secretId)));
          }
          runner.sendSecrets(
              payload, envelopes, java.time.Instant.parse(session.path("expiresAt").asText()));
        } catch (StudioReferenceResolver.ReferenceUnavailableException failure) {
          recordSecretFailure(
              id,
              won.ledger(),
              secretIds,
              failure.getReferenceName(),
              com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome
                  .UNAVAILABLE,
              null);
          throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
              "SECRET_UNAVAILABLE", 404);
        } catch (VaultProviderUnavailableException failure) {
          // An outage does not say which read failed: every secret still unresolved is affected.
          recordSecretFailure(
              id,
              won.ledger(),
              secretIds,
              null,
              com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome
                  .VAULT_UNAVAILABLE,
              null);
          throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
              "VAULT_UNAVAILABLE", 503);
        } catch (SecretTooLongException failure) {
          recordSecretFailure(
              id,
              won.ledger(),
              secretIds,
              failure.secretId(),
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

  /**
   * Records the failed resolution. When the resolver names the secret that failed only that secret
   * is marked; otherwise (an outage) every secret of the step is.
   */
  void recordSecretFailure(
      String id,
      JsonNode ledger,
      java.util.List<String> secretIds,
      String failedSecretId,
      com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome outcome,
      String code) {
    java.util.List<String> affected =
        failedSecretId != null && secretIds.contains(failedSecretId)
            ? java.util.List.of(failedSecretId)
            : secretIds;
    for (String secretId : affected) {
      if (code == null) {
        sessions.recordSecretDecision(id, ledger, secretId, null, outcome);
      } else {
        sessions.recordSecretDecision(id, ledger, secretId, null, outcome, code);
      }
    }
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
