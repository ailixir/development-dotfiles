package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.citi.put.checks.studio.guided.diagnostics.GuidedGuardProvenance;
import com.citi.put.checks.studio.guided.diagnostics.GuidedGuardProvenance.Guard;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;

/** The production model-to-ledger join. All network work occurs outside database transactions. */
public final class GuidedTranslationService {
  private final GuidedSessionService sessions;
  private final GuidedSessionRepository repository;
  private final GuidedTranslationStore store;
  private final GuidedClarificationContextStore questions;
  private final GuidedDispatchService dispatch;
  private final GuidedLlmGatewayClient gateway;
  private final GuidedContracts contracts;
  private final GuidedPromptAssembler prompts;
  private final GuidedSourceInputResolver inputs;
  private final GuidedProposalValidator validator;
  private final GuidedDependencyPlanner dependencies;
  private final GuidedTranslationProperties properties;
  private final Clock clock;
  private final GuidedPromptAssembler.PreparationCapability preparationCapability;
  private GuidedRefusalDiagnostics refusalDiagnostics = GuidedRefusalDiagnostics.configured();
  private BackoffSleeper sleeper = Thread::sleep;

  /** Test seam for the definite-transient backoff; production sleeps on the calling thread. */
  @FunctionalInterface
  public interface BackoffSleeper {
    void sleep(long millis) throws InterruptedException;
  }

  public void useBackoffSleeper(BackoffSleeper replacement) {
    sleeper = java.util.Objects.requireNonNull(replacement);
  }

  public GuidedTranslationService(
      GuidedSessionService sessions,
      GuidedSessionRepository repository,
      GuidedTranslationStore store,
      GuidedClarificationContextStore questions,
      GuidedDispatchService dispatch,
      GuidedLlmGatewayClient gateway,
      GuidedContracts contracts,
      GuidedPromptAssembler prompts,
      GuidedSourceInputResolver inputs,
      GuidedProposalValidator validator,
      GuidedDependencyPlanner dependencies,
      GuidedTranslationProperties properties,
      Clock clock) {
    this(
        sessions,
        repository,
        store,
        questions,
        dispatch,
        gateway,
        contracts,
        prompts,
        inputs,
        validator,
        dependencies,
        properties,
        clock,
        null);
  }

  private GuidedTranslationService(
      GuidedSessionService sessions,
      GuidedSessionRepository repository,
      GuidedTranslationStore store,
      GuidedClarificationContextStore questions,
      GuidedDispatchService dispatch,
      GuidedLlmGatewayClient gateway,
      GuidedContracts contracts,
      GuidedPromptAssembler prompts,
      GuidedSourceInputResolver inputs,
      GuidedProposalValidator validator,
      GuidedDependencyPlanner dependencies,
      GuidedTranslationProperties properties,
      Clock clock,
      GuidedPromptAssembler.PreparationCapability capability) {
    this.sessions = sessions;
    this.repository = repository;
    this.store = store;
    this.questions = questions;
    this.dispatch = dispatch;
    this.gateway = gateway;
    this.contracts = contracts;
    this.prompts = prompts;
    this.inputs = inputs;
    this.validator = validator;
    this.dependencies = dependencies;
    this.properties = properties;
    this.clock = clock;
    preparationCapability = capability != null && capability.ownedBy(prompts) ? capability : null;
  }

  static GuidedTranslationService fromPureAssemblerFactory(
      GuidedSessionService sessions,
      GuidedSessionRepository repository,
      GuidedTranslationStore store,
      GuidedClarificationContextStore questions,
      GuidedDispatchService dispatch,
      GuidedLlmGatewayClient gateway,
      GuidedContracts contracts,
      GuidedPromptAssembler prompts,
      GuidedSourceInputResolver inputs,
      GuidedProposalValidator validator,
      GuidedDependencyPlanner dependencies,
      GuidedTranslationProperties properties,
      Clock clock) {
    return new GuidedTranslationService(
        sessions,
        repository,
        store,
        questions,
        dispatch,
        gateway,
        contracts,
        prompts,
        inputs,
        validator,
        dependencies,
        properties,
        clock,
        prompts.preparationCapability());
  }

  public JsonNode plan(
      Authentication controller, String id, long fence, String key, JsonNode command) {
    require(
        !org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    contracts.validate("v3/guided-planning-commands", command);
    require(id.equals(command.path("sessionId").asText()), "INVALID_CONTRACT", 422);
    // ar-2-r14-stops ruling 2 (tests[1]): a continuation of a session that a definite runner
    // refusal of its bootstrap context ended returns that terminal session and makes no runner,
    // model or assignment request. Every other terminal continuation is unchanged.
    JsonNode refused = refusedBootstrapSession(controller, id);
    if (refused != null) {
      return refused;
    }
    JsonNode waiting = prefixWaiting(controller, id, fence, command);
    if (waiting != null) {
      return waiting;
    }
    if (fence == 0) {
      JsonNode owned =
          dispatch.assign(controller, id, "translation-assignment", properties.workerId());
      fence = owned.path("ownerFence").asLong();
    }
    final long owner = fence;
    reconcile(controller, id, owner);
    boolean prefix =
        sessions.translationTransaction(
            controller, id, owner, current -> repository.incremental().pending(id));
    if (prefix) {
      sessions.translationTransaction(
          controller,
          id,
          owner,
          current -> {
            checkCommand(current, command);
            if (store.state(id).path("plan").isNull()
                || store.state(id).path("plan").isMissingNode()) {
              ObjectNode imported = repository.incremental().prefixPlan(current.document());
              store.acceptPlan(id, store.state(id).path("planRevision").asLong(), imported);
              bootstrapStage(current, "PLAN_ACCEPTED", null);
            }
            store.continuation(id, "REPLAYING_PREFIX");
            return null;
          });
      bootstrap(controller, id, owner);
      return advancePrefix(controller, id, owner);
    }
    boolean suffixMaterialize =
        sessions.translationTransaction(
            controller,
            id,
            owner,
            current ->
                repository.incremental().hasBase(id)
                    && bootstrapReady(current)
                    && store.state(id).path("continuation").asText().equals("MATERIALIZE"));
    if (suffixMaterialize) {
      return finishSuffixMaterialization(controller, id, owner);
    }
    boolean planned =
        sessions.translationTransaction(
            controller,
            id,
            owner,
            current -> {
              checkCommand(current, command);
              return !store.state(id).path("plan").isNull()
                  && !store.state(id).path("plan").isMissingNode();
            });
    if (!planned) {
      JsonNode planningResult =
          call(
              controller,
              id,
              owner,
              key,
              GuidedModelRequest.Kind.SOURCE_PLAN,
              (current, response, attemptIdentity, capture) -> {
                if (response.has("question")) {
                  return question(controller, current, response.path("question"), "source");
                }
                ObjectNode admitted =
                    validator.admitPlan(
                        current.document(),
                        response,
                        null,
                        store.state(id).path("manifest").path("sourceSteps"));
                inputs.validate(
                    current.document(),
                    store.state(id).path("manifest"),
                    admitted.path("sourceReferences"));
                dependencies.validate(current.document(), admitted);
                validator.sourceSelections(current.document(), admitted, sourceSelections(current));
                store.acceptPlan(id, store.state(id).path("planRevision").asLong(), admitted);
                bootstrapStage(current, "PLAN_ACCEPTED", null);
                store.continuation(id, "MATERIALIZE");
                return admitted;
              });
      if (planningResult.path("state").asText().equals("FAILED")) {
        return planningResult;
      }
    }
    return bootstrap(controller, id, owner);
  }

  private JsonNode bootstrap(Authentication controller, String id, long fence) {
    ObjectNode state =
        sessions.translationTransaction(
            controller,
            id,
            fence,
            current -> {
              checkPins(id);
              if (current.document().path("state").asText().equals("AWAITING_CLARIFICATION")
                  || bootstrapReady(current)) {
                return contracts.object().set("done", safe(current.document()));
              }
              checkBootstrapIdentity(current);
              require(repository.actions(id).isEmpty(), "UNKNOWN_OUTCOME", 409);
              return contracts
                  .object()
                  .setAll(
                      java.util.Map.of(
                          "document",
                          current.document().deepCopy(),
                          "bootstrap",
                          current.progress().path("translationBootstrap").deepCopy(),
                          "plan",
                          store.state(id).path("plan").deepCopy()));
            });
    if (state.has("done")) {
      return state.path("done");
    }
    String phase = state.path("bootstrap").path("phase").asText();
    ObjectNode plan = (ObjectNode) state.path("plan");
    if (phase.equals("PLAN_ACCEPTED")) {
      sessions.materialize(
          controller, id, fence, "translation-materialize", plan.path("sourceReferences"));
      sessions.translationTransaction(
          controller,
          id,
          fence,
          current -> {
            checkPins(id);
            checkBootstrapIdentity(current);
            bootstrapStage(current, "MATERIALIZED", null);
            return null;
          });
      phase = "MATERIALIZED";
    }
    if (phase.equals("MATERIALIZED")) {
      if (repository.incremental().pending(id)) {
        for (JsonNode need : plan.path("needs")) {
          sessions.importPrefixBinding(controller, id, fence, need);
        }
      } else {
        dependencies.allocate(controller, state.path("document"), plan);
      }
      sessions.translationTransaction(
          controller,
          id,
          fence,
          current -> {
            checkPins(id);
            checkBootstrapIdentity(current);
            GuidedAcceptedPlan.validate(contracts, plan);
            ObjectNode head = store.state(id);
            if (!head.path("plan").equals(plan)) {
              store.acceptPlan(id, head.path("planRevision").asLong(), plan);
            }
            bootstrapStage(current, "ALLOCATED", null);
            return null;
          });
      phase = "ALLOCATED";
    }
    if (phase.equals("ALLOCATED")) {
      sessions.translationTransaction(
          controller,
          id,
          fence,
          current -> {
            checkPins(id);
            checkBootstrapIdentity(current);
            // Fetch the final authoritative context after every dependency allocation committed.
            ObjectNode context = sessions.runnerContext(controller, id, fence);
            bootstrapStage(current, "CONTEXT_PENDING", context);
            return null;
          });
    }
    ObjectNode delivery = beginBootstrapDelivery(controller, id, fence);
    if (delivery.path("ready").asBoolean()) {
      return sessions.translationTransaction(
          controller, id, fence, current -> safe(current.document()));
    }
    require(!delivery.path("exhausted").asBoolean(), "RUNTIME_INCOMPATIBLE", 409);
    // A callback cannot acknowledge allocations. A lost RPC response leaves the same pending
    // context for a bounded idempotent metadata retry on the next continuation.
    final JsonNode acknowledgement;
    try {
      acknowledgement = dispatch.pushContext(controller, id, fence);
    } catch (RuntimeException failure) {
      if (com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient.definiteContextRefusal(
          failure)) {
        // ar-2-r14-stops ruling 2: a definite refusal is terminal on first receipt, in this same
        // continuation, with no further delivery. Uncertain outcomes keep the bounded retry.
        refuseBootstrapDelivery(controller, id, fence, delivery);
        sessions.failTranslation(controller, id, fence, "RUNTIME_INCOMPATIBLE");
      }
      throw failure;
    }
    require(
        finishBootstrap(controller, id, fence, delivery, acknowledgement), "STALE_GENERATION", 409);
    return sessions.translationTransaction(
        controller, id, fence, current -> safe(current.document()));
  }

  /** One prefix coordinate per durable continuation; no gateway capability enters this branch. */
  private JsonNode advancePrefix(Authentication controller, String id, long fence) {
    ObjectNode captured =
        sessions.translationTransaction(
            controller,
            id,
            fence,
            current -> {
              if (!repository.incremental().pending(id) || !bootstrapReady(current)) {
                return contracts.object().set("done", safe(current.document()));
              }
              JsonNode confirmation = current.progress().path("sideEffectConfirmation");
              if (confirmation.path("status").asText().equals("CONFIRMED")
                  && confirmation.has("prefixRequestDigest")) {
                JsonNode confirmed =
                    repository
                        .incremental()
                        .confirmationRequest(current.document(), current.progress(), false);
                if (confirmed
                    .path("evidenceHash")
                    .equals(current.progress().path("evidenceHash"))) {
                  ObjectNode request =
                      new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(
                              jdbc(), contracts)
                          .identity(sessions.runnerContext(controller, id, fence));
                  request.put("expectedGeneration", current.progress().path("generation").asInt());
                  ObjectNode refresh =
                      contracts
                          .object()
                          .put(
                              "refreshKey",
                              "prefix-confirmation-"
                                  + confirmation.path("clarificationId").asText());
                  refresh.set("refresh", request);
                  return refresh;
                }
              }
              JsonNode next = repository.incremental().nextAction(id);
              if (next == null) {
                int boundary = repository.incremental().initialIndex(id);
                repository
                    .incremental()
                    .switchToLearning(current.document(), "BOUNDARY", boundary, 0, null);
                current.progress().put("stepIndex", boundary);
                current.document().put("state", "OBSERVING");
                repository.save(current);
                return contracts.object().set("done", safe(current.document()));
              }
              int index =
                  com.citi.put.checks.studio.guided.session.GuidedIncrementalStore.stepIndex(
                      current.document(), next.path("coordinate").path("stepId").asText());
              current.progress().put("stepIndex", index);
              repository.save(current);
              for (ObjectNode action : repository.actions(id)) {
                if (action.path("coordinate").equals(next.path("coordinate"))) {
                  ObjectNode existing = contracts.object().set("existing", action);
                  return existing;
                }
              }
              ObjectNode context = sessions.runnerContext(controller, id, fence);
              new com.citi.put.checks.studio.guided.publication.GuidedPublicationEvidenceRepository(
                      jdbc(), contracts)
                  .capturePrefixObservation(current, context);
              ObjectNode result = contracts.object().set("action", next);
              result.set(
                  "request",
                  repository
                      .incremental()
                      .issue(
                          current.document(),
                          context,
                          next.path("coordinate"),
                          current.progress().path("evidenceHash")));
              return result;
            });
    if (captured.has("done")) {
      return captured.path("done");
    }
    if (captured.has("refresh")) {
      dispatch.observe(
          controller, id, fence, captured.path("refreshKey").asText(), captured.path("refresh"));
      return repository.transaction(() -> safe(repository.lock(id).document()));
    }
    if (captured.has("existing")) {
      JsonNode action = captured.path("existing");
      if (action.path("state").asText().equals("DISPATCHING")) {
        sessions.lostAcknowledgment(id, action.path("admission").path("admissionId").asText());
      } else if (action.path("state").asText().equals("ADMITTED")) {
        ObjectNode command =
            contracts
                .object()
                .put("schemaVersion", 3)
                .put("sessionId", id)
                .put("admissionId", action.path("admission").path("admissionId").asText())
                .put("ownerFence", fence)
                .put("operationHash", action.path("operationHash").asText());
        dispatch.dispatch(
            controller,
            id,
            fence,
            "prefix-dispatch-" + action.path("idempotencyKey").asText(),
            command);
      }
      return repository.transaction(() -> safe(repository.lock(id).document()));
    }
    // Successful prefix reads persist producer metadata after bootstrap. Apply the current
    // metadata to the same runtime before a new coordinate can resolve that private value.
    try {
      dispatch.pushContext(controller, id, fence);
    } catch (RuntimeException failure) {
      if (com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient.definiteContextRefusal(
          failure)) {
        sessions.failTranslation(controller, id, fence, "RUNTIME_INCOMPATIBLE");
      }
      throw failure;
    }
    sessions.translationTransaction(
        controller,
        id,
        fence,
        current -> {
          require(
              repository.incremental().pending(id)
                  && bootstrapReady(current)
                  && current.document().path("state").asText().equals("REPLAYING_PREFIX"),
              "STALE_GENERATION",
              409);
          JsonNode confirmation = current.progress().path("sideEffectConfirmation");
          if (confirmation.path("status").asText().equals("CONFIRMED")
              && confirmation.has("prefixRequestDigest")) {
            JsonNode confirmed =
                repository
                    .incremental()
                    .confirmationRequest(current.document(), current.progress(), false);
            require(
                !confirmed.path("evidenceHash").equals(current.progress().path("evidenceHash")),
                "STALE_GENERATION",
                409);
          }
          JsonNode next = repository.incremental().nextAction(id);
          JsonNode request = captured.path("request").path("request");
          require(
              next != null
                  && next.equals(captured.path("action"))
                  && next.path("coordinate").equals(request.path("coordinate")),
              "STALE_GENERATION",
              409);
          for (ObjectNode action : repository.actions(id)) {
            require(
                !action.path("coordinate").equals(request.path("coordinate")),
                "STALE_GENERATION",
                409);
          }
          ObjectNode context = sessions.runnerContext(controller, id, fence);
          for (String field :
              List.of(
                  "schemaVersion",
                  "sessionId",
                  "workerId",
                  "ownerFence",
                  "scopeHash",
                  "contextId",
                  "contextRevision",
                  "authoredInputsHash",
                  "sourceRevision",
                  "configurationRevision")) {
            require(request.path(field).equals(context.path(field)), "STALE_GENERATION", 409);
          }
          String programHash = GuidedContracts.hash(repository.incremental().program(id));
          require(
              request.path("prefixProgramHash").asText().equals(programHash)
                  && context.path("prefixProgramHash").asText().equals(programHash)
                  && GuidedContracts.hash(context.path("prefixProgram")).equals(programHash)
                  && request.path("evidenceHash").equals(current.progress().path("evidenceHash"))
                  && GuidedContracts.hash(request)
                      .equals(captured.path("request").path("requestDigest").asText()),
              "STALE_GENERATION",
              409);
          return null;
        });
    JsonNode response = dispatch.preparePrefix(captured.path("request"));
    String kind = response.path("kind").asText();
    // Prepare DRIFT response is never commit authority. Its owning-worker callback has committed
    // the one receipt/switch, or this request cannot make the controller enter learning.
    if (kind.equals("DRIFT")) {
      return sessions.translationTransaction(
          controller,
          id,
          fence,
          current -> {
            require(
                repository.incremental().duplicateReceipt(id, response.path("receipt")),
                "UNKNOWN_OUTCOME",
                409);
            return safe(current.document());
          });
    }
    sessions.translationTransaction(
        controller,
        id,
        fence,
        current -> {
          repository.incremental().verifyPrepared(id, captured.path("request"), response);
          repository
              .incremental()
              .settle(
                  id,
                  captured.path("request").path("requestDigest").asText(),
                  kind.equals("WAIT") ? "WAIT" : "PREPARED");
          return null;
        });
    if (kind.equals("WAIT")) {
      refresh(controller, id, fence);
      return repository.transaction(() -> safe(repository.lock(id).document()));
    }
    JsonNode proposal = response.path("proposal");
    final ObjectNode association;
    try {
      association =
          sessions.translationTransaction(
              controller,
              id,
              fence,
              current -> {
                JsonNode meaning = null;
                for (JsonNode obligation : store.state(id).path("plan").path("obligations")) {
                  if (obligation.path("stepId").equals(proposal.path("coordinate").path("stepId"))
                      && obligation
                          .path("occurrence")
                          .equals(proposal.path("coordinate").path("ordinal"))) {
                    require(meaning == null, "EVIDENCE_MISMATCH", 409);
                    meaning = obligation;
                  }
                }
                require(meaning != null, "EVIDENCE_MISMATCH", 409);
                JsonNode question =
                    guardAction(
                        controller,
                        fence,
                        current,
                        meaning,
                        proposal,
                        null,
                        captured.path("request").path("requestDigest").asText());
                if (question != null) {
                  return contracts.object().put("awaiting", true);
                }
                return store.reserveObligation(
                    current.document(), meaning.path("obligationId").asText(), proposal);
              });
    } catch (GuidedSessionException failure) {
      stopRejected(controller, id, fence, failure);
      return repository.transaction(() -> safe(repository.lock(id).document()));
    }
    if (association.path("awaiting").asBoolean()) {
      return repository.transaction(() -> safe(repository.lock(id).document()));
    }
    sessions.storePreparation(controller, id, fence, proposal, response.path("preparation"));
    JsonNode admitted =
        sessions.admit(controller, id, fence, association.path("admissionKey").asText(), proposal);
    ObjectNode command =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("admissionId", admitted.path("admission").path("admissionId").asText())
            .put("ownerFence", fence)
            .put("operationHash", admitted.path("operationHash").asText());
    dispatch.dispatch(
        controller,
        id,
        fence,
        "prefix-dispatch-" + association.path("admissionKey").asText(),
        command);
    return repository.transaction(() -> safe(repository.lock(id).document()));
  }

  private ObjectNode beginBootstrapDelivery(Authentication controller, String id, long fence) {
    return sessions.translationTransaction(
        controller,
        id,
        fence,
        current -> {
          checkPins(id);
          if (bootstrapReady(current)) {
            return contracts.object().put("ready", true);
          }
          checkBootstrapIdentity(current);
          ObjectNode pending = (ObjectNode) current.progress().path("translationBootstrap");
          require(
              pending.path("phase").asText().equals("CONTEXT_PENDING")
                  && repository.actions(id).isEmpty(),
              "UNKNOWN_OUTCOME",
              409);
          JsonNode context = bootstrapContext(sessions.runnerContext(controller, id, fence));
          require(pending.path("context").equals(context), "REVISION_CONFLICT", 409);
          var attempts = pending.withArray("deliveries");
          if (attempts.size() >= 3) {
            sessions.failTranslation(controller, id, fence, "RUNTIME_INCOMPATIBLE");
            return contracts.object().put("exhausted", true);
          }
          ObjectNode delivery = contracts.object().put("deliveryId", UUID.randomUUID().toString());
          delivery.set("context", context.deepCopy());
          delivery.set("identity", pending.path("identity").deepCopy());
          delivery.set("planRevision", pending.path("planRevision"));
          attempts
              .addObject()
              .put("deliveryId", delivery.path("deliveryId").asText())
              .put("contextHash", GuidedContracts.hash(context));
          repository.save(current);
          return delivery;
        });
  }

  /** Records on the pending delivery that the runner refused it (internal progress only). */
  private void refuseBootstrapDelivery(
      Authentication controller, String id, long fence, JsonNode delivery) {
    sessions.translationTransaction(
        controller,
        id,
        fence,
        current -> {
          for (JsonNode attempt :
              current.progress().path("translationBootstrap").path("deliveries")) {
            if (attempt.path("deliveryId").equals(delivery.path("deliveryId"))) {
              ((ObjectNode) attempt).put("outcome", "REFUSED");
            }
          }
          repository.save(current);
          return null;
        });
  }

  private boolean finishBootstrap(
      Authentication controller,
      String id,
      long fence,
      JsonNode delivery,
      JsonNode acknowledgement) {
    return sessions.translationTransaction(
        controller,
        id,
        fence,
        current -> {
          checkPins(id);
          if (bootstrapReady(current)) {
            return true;
          }
          checkBootstrapIdentity(current);
          JsonNode pending = current.progress().path("translationBootstrap");
          require(
              pending.path("phase").asText().equals("CONTEXT_PENDING")
                  && repository.actions(id).isEmpty(),
              "UNKNOWN_OUTCOME",
              409);
          ObjectNode context = sessions.runnerContext(controller, id, fence);
          require(
              pending.path("context").equals(bootstrapContext(context)), "REVISION_CONFLICT", 409);
          require(
              pending.path("context").equals(delivery.path("context"))
                  && pending.path("identity").equals(delivery.path("identity"))
                  && pending.path("planRevision").asLong()
                      == delivery.path("planRevision").asLong(),
              "REVISION_CONFLICT",
              409);
          boolean claimed = false;
          for (JsonNode attempt : pending.path("deliveries")) {
            claimed |=
                attempt.path("deliveryId").equals(delivery.path("deliveryId"))
                    && attempt
                        .path("contextHash")
                        .asText()
                        .equals(GuidedContracts.hash(delivery.path("context")));
          }
          require(claimed, "IDEMPOTENCY_CONFLICT", 409);
          for (String field :
              List.of(
                  "contextId",
                  "contextRevision",
                  "sourceRevision",
                  "configurationRevision",
                  "scopeHash",
                  "workerId",
                  "ownerFence")) {
            require(
                acknowledgement.path(field).equals(context.path(field)), "STALE_GENERATION", 409);
          }
          JsonNode evidence = current.progress().path("executionEvidence");
          if (evidence.isMissingNode()) {
            return false;
          }
          JsonNode receipt = current.progress().path("translationBootstrapEvidence");
          require(
              evidence.path("kind").asText().equals("initialBlank")
                  && evidence.path("generation").asInt(-1) == 0
                  && evidence.path("contextId").equals(context.path("contextId"))
                  && evidence.path("sessionId").asText().equals(id)
                  && GuidedContracts.hash(evidence)
                      .equals(current.progress().path("evidenceHash").asText()),
              "STALE_GENERATION",
              409);
          for (String field :
              java.util.List.of(
                  "contextId",
                  "contextRevision",
                  "sourceRevision",
                  "configurationRevision",
                  "scopeHash",
                  "workerId",
                  "ownerFence")) {
            require(receipt.path(field).equals(context.path(field)), "STALE_GENERATION", 409);
          }
          bootstrapStage(current, "READY", context);
          ObjectNode proof =
              current
                  .progress()
                  .withObject("/translationBootstrap")
                  .putObject("metadataAcknowledgement")
                  .put("version", 2)
                  .put("deliveryId", delivery.path("deliveryId").asText())
                  .put("contextHash", GuidedContracts.hash(delivery.path("context")))
                  .put("identityHash", GuidedContracts.hash(delivery.path("identity")));
          require(!proof.path("deliveryId").asText().isBlank(), "INVALID_CONTRACT", 422);
          repository.save(current);
          store.continuation(
              id, repository.incremental().pending(id) ? "REPLAYING_PREFIX" : "NEXT");
          return true;
        });
  }

  private void bootstrapStage(
      GuidedSessionRepository.Session current, String phase, JsonNode context) {
    List<String> stages =
        List.of("PLAN_ACCEPTED", "MATERIALIZED", "ALLOCATED", "CONTEXT_PENDING", "READY");
    int prior =
        stages.indexOf(current.progress().path("translationBootstrap").path("phase").asText());
    if (prior >= stages.indexOf(phase)) {
      return;
    }
    ObjectNode marker =
        contracts
            .object()
            .put("phase", phase)
            .put(
                "planRevision",
                store
                    .state(current.document().path("sessionId").asText())
                    .path("planRevision")
                    .asLong());
    marker.set("identity", bootstrapIdentity(current));
    if (context != null) {
      marker.set("context", bootstrapContext(context));
    }
    current.progress().set("translationBootstrap", marker);
    repository.save(current);
  }

  private ObjectNode bootstrapIdentity(GuidedSessionRepository.Session current) {
    ObjectNode identity = contracts.object();
    identity.set("scopeHash", current.document().path("scopeHash"));
    for (String field : List.of("sourceRevision", "configurationRevision")) {
      identity.set(field, current.document().path("scope").path(field));
    }
    for (String field : List.of("workerId", "fence")) {
      identity.set(field, current.document().path("owner").path(field));
    }
    return identity;
  }

  private ObjectNode bootstrapContext(JsonNode context) {
    ObjectNode identity = contracts.object();
    for (String field :
        List.of(
            "contextId",
            "contextRevision",
            "materializationRevision",
            "authoredInputsHash",
            "allocations")) {
      identity.set(field, context.path(field).deepCopy());
    }
    return identity;
  }

  private boolean bootstrapReady(GuidedSessionRepository.Session current) {
    JsonNode marker = current.progress().path("translationBootstrap");
    if (!marker.path("phase").asText().equals("READY")) {
      return false;
    }
    JsonNode proof = marker.path("metadataAcknowledgement");
    // Pre-R2 READY may have been inferred from a delayed older callback. Never rebuild/replay it.
    require(
        proof.path("version").asInt() == 2
            && !proof.path("deliveryId").asText().isBlank()
            && proof
                .path("contextHash")
                .asText()
                .equals(GuidedContracts.hash(marker.path("context")))
            && proof
                .path("identityHash")
                .asText()
                .equals(GuidedContracts.hash(marker.path("identity"))),
        "RUNTIME_INCOMPATIBLE",
        409);
    return true;
  }

  private void checkBootstrapIdentity(GuidedSessionRepository.Session current) {
    JsonNode marker = current.progress().path("translationBootstrap");
    require(
        marker.path("identity").equals(bootstrapIdentity(current))
            && marker.path("planRevision").isIntegralNumber()
            && marker.path("planRevision").asLong()
                == store
                    .state(current.document().path("sessionId").asText())
                    .path("planRevision")
                    .asLong(),
        "REVISION_CONFLICT",
        409);
  }

  private void checkPins(String id) {
    require(
        store.state(id).path("manifest").path("schemaPins").equals(prompts.schemaProvenance()),
        "RUNTIME_INCOMPATIBLE",
        409);
  }

  public JsonNode advance(
      Authentication controller, String id, long fence, String key, JsonNode command) {
    require(
        !org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    contracts.validate("v3/guided-planning-commands", command);
    JsonNode waiting = prefixWaiting(controller, id, fence, command);
    if (waiting != null) {
      return waiting;
    }
    reconcile(controller, id, fence);
    ObjectNode state =
        sessions.translationTransaction(
            controller,
            id,
            fence,
            current -> {
              checkCommand(current, command);
              bootstrapReady(current);
              return contracts
                  .object()
                  .setAll(
                      java.util.Map.of(
                          "document",
                          current.document().deepCopy(),
                          "progress",
                          current.progress().deepCopy(),
                          "translation",
                          store.state(id)));
            });
    if (!state
        .path("progress")
        .path("translationBootstrap")
        .path("phase")
        .asText()
        .equals("READY")) {
      return plan(controller, id, fence, key + "-bootstrap", command);
    }
    String status = state.path("document").path("state").asText();
    if (status.equals("AWAITING_CLARIFICATION") || status.equals("FINALIZING")) {
      return safe(state.path("document"));
    }
    // Recover every durable in-flight association before requesting a new action.
    JsonNode recovered = recover(controller, id, fence);
    if (recovered != null) {
      return recovered;
    }
    boolean pendingAcquisition =
        sessions.translationTransaction(controller, id, fence, store::acquisitionPending);
    if (!pendingAcquisition
        && (state.path("translation").path("continuation").asText().equals("REFRESH")
            || status.equals("OBSERVING"))) {
      refresh(controller, id, fence);
      sessions.translationTransaction(
          controller,
          id,
          fence,
          current -> {
            store.continuation(id, "NEXT");
            return null;
          });
    }
    boolean fulfilled =
        sessions.translationTransaction(
            controller,
            id,
            fence,
            current -> {
              String stepId =
                  current
                      .document()
                      .path("sourceSteps")
                      .get(current.progress().path("stepIndex").asInt())
                      .path("stepId")
                      .asText();
              List<ObjectNode> actions =
                  repository.effectiveActions(id).stream()
                      .filter(
                          action ->
                              action.path("coordinate").path("stepId").asText().equals(stepId))
                      .toList();
              return new GuidedStepVerifier(store)
                  .complete(current.document(), contracts.object().put("stepId", stepId), actions);
            });
    if (fulfilled) {
      return complete(controller, id, fence, key + "-verify");
    }
    if (!acquireBeforeProposal(controller, id, fence)) {
      return safe(
          sessions.translationTransaction(
              controller, id, fence, current -> current.document().deepCopy()));
    }
    JsonNode result =
        call(
            controller,
            id,
            fence,
            key,
            GuidedModelRequest.Kind.NEXT_ACTION,
            (current, response, attemptIdentity, capture) -> {
              return applyNextAction(
                  controller, id, fence, current, response, attemptIdentity, capture);
            });
    if (result.path("complete").asBoolean()) {
      return complete(controller, id, fence, key + "-verify");
    }
    if (result.has("admissionKey")) {
      return admitAndDispatch(controller, id, fence, result);
    }
    return result;
  }

  private JsonNode applyNextAction(
      Authentication controller,
      String id,
      long fence,
      GuidedSessionRepository.Session current,
      JsonNode response,
      JsonNode attemptIdentity,
      GuidedRefusalDiagnostics.Capture capture) {
    if (response.path("status").asText().equals("CLARIFICATION")) {
      return GuidedRefusalDiagnostics.call(
          capture,
          GuidedRefusalDiagnostics.Gate.NEXT_QUESTION_CALL,
          () ->
              question(
                  controller, current, response.path("question"), "observed", attemptIdentity));
    }
    if (response.path("status").asText().equals("COMPLETE")) {
      return contracts.object().put("complete", true);
    }
    ObjectNode plan =
        GuidedRefusalDiagnostics.call(
            capture,
            GuidedRefusalDiagnostics.Gate.NEXT_PLAN_ACCESS_CALL,
            () -> (ObjectNode) store.state(id).path("plan"));
    GuidedRefusalDiagnostics.call(
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_SOURCE_SELECTION_CALL,
        () -> {
          validator.sourceSelections(current.document(), plan, sourceSelections(current));
          return null;
        });
    String obligationId = response.path("obligationId").asText();
    JsonNode obligation =
        GuidedRefusalDiagnostics.call(
            capture,
            GuidedRefusalDiagnostics.Gate.NEXT_OBLIGATION_LOOKUP_CALL,
            () -> validator.remaining(plan, obligationId));
    ObjectNode existing =
        GuidedRefusalDiagnostics.call(
            capture,
            GuidedRefusalDiagnostics.Gate.NEXT_ASSOCIATION_LOOKUP_CALL,
            () -> store.obligation(id, obligationId));
    if (existing != null
        && !existing.path("admissionId").isNull()
        && !existing.path("admissionId").asText().isBlank()) {
      return existing;
    }
    ObjectNode context =
        GuidedRefusalDiagnostics.call(
            capture,
            GuidedRefusalDiagnostics.Gate.NEXT_RUNNER_CONTEXT_CALL,
            () -> sessions.runnerContext(controller, id, fence));
    JsonNode proposal =
        GuidedRefusalDiagnostics.call(
            capture,
            GuidedRefusalDiagnostics.Gate.NEXT_MATERIALIZE_CALL,
            () ->
                capture == GuidedRefusalDiagnostics.Capture.NONE
                    ? validator.materializeAction(
                        current.document(),
                        current.progress(),
                        obligation,
                        response.path("action"),
                        context,
                        attemptIdentity,
                        store.state(id).path("planRevision").asLong())
                    : validator.materializeAction(
                        current.document(),
                        current.progress(),
                        obligation,
                        response.path("action"),
                        context,
                        attemptIdentity,
                        store.state(id).path("planRevision").asLong(),
                        capture));
    GuidedRefusalDiagnostics.call(
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_VALIDATE_ACTION_CALL,
        () -> {
          if (capture == GuidedRefusalDiagnostics.Capture.NONE) {
            validator.action(
                current.document(),
                current.progress(),
                plan,
                GuidedRefusalDiagnostics.call(
                    capture,
                    GuidedRefusalDiagnostics.Gate.NEXT_EFFECTIVE_CHOICE_CALL,
                    () -> effectiveObligation(current, obligation, proposal)),
                proposal,
                context);
          } else {
            validator.action(
                current.document(),
                current.progress(),
                plan,
                GuidedRefusalDiagnostics.call(
                    capture,
                    GuidedRefusalDiagnostics.Gate.NEXT_EFFECTIVE_CHOICE_CALL,
                    () -> effectiveObligation(current, obligation, proposal)),
                proposal,
                context,
                capture);
          }
          return null;
        });
    JsonNode confirmation =
        GuidedRefusalDiagnostics.call(
            capture,
            GuidedRefusalDiagnostics.Gate.NEXT_POLICY_CALL,
            () -> guardAction(controller, fence, current, obligation, proposal, attemptIdentity));
    if (confirmation != null) {
      return confirmation;
    }
    return GuidedRefusalDiagnostics.call(
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_RESERVATION_CALL,
        () -> store.reserveObligation(current.document(), obligationId, proposal));
  }

  public JsonNode context(Authentication controller, String id, long fence, JsonNode command) {
    require(
        !org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    contracts.validate("v3/guided-planning-commands", command);
    return sessions.translationTransaction(
        controller,
        id,
        fence,
        current -> {
          checkCommand(current, command);
          require(bootstrapReady(current), "RUNTIME_INCOMPATIBLE", 409);
          return request(
                  current,
                  UUID.randomUUID().toString(),
                  1,
                  GuidedModelRequest.Kind.NEXT_ACTION,
                  List.of())
              .projection()
              .document();
        });
  }

  public JsonNode replan(
      Authentication controller, String id, long fence, String key, JsonNode command) {
    require(
        !org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    contracts.validate("v3/guided-planning-commands", command);
    JsonNode waiting = prefixWaiting(controller, id, fence, command);
    if (waiting != null) {
      return waiting;
    }
    reconcile(controller, id, fence);
    boolean incremental =
        sessions.translationTransaction(
            controller, id, fence, current -> repository.incremental().hasBase(id));
    if (incremental) {
      return learnSuffix(controller, id, fence, key, command);
    }
    sessions.translationTransaction(
        controller,
        id,
        fence,
        current -> {
          checkCommand(current, command);
          require(bootstrapReady(current), "RUNTIME_INCOMPATIBLE", 409);
          require(!store.acquisitionOpen(current), "STALE_GENERATION", 409);
          require(
              current.document().path("state").asText().equals("PROPOSING"),
              "STALE_GENERATION",
              409);
          return null;
        });
    call(
        controller,
        id,
        fence,
        key,
        GuidedModelRequest.Kind.SOURCE_PLAN,
        (current, response, attemptIdentity, capture) -> {
          require(!response.has("question"), "INVALID_CONTRACT", 422);
          ObjectNode state = store.state(id);
          ObjectNode refined =
              validator.refinePlan(
                  current.document(),
                  current.progress(),
                  state.path("plan"),
                  response,
                  state.path("manifest").path("sourceSteps"));
          validator.sourceSelections(current.document(), refined, sourceSelections(current));
          dependencies.validate(current.document(), refined);
          dependencies.allocate(controller, current.document(), refined);
          GuidedAcceptedPlan.validate(contracts, refined);
          store.acceptPlan(id, state.path("planRevision").asLong(), refined);
          return refined;
        });
    return safe(
        sessions.translationTransaction(
            controller, id, fence, current -> current.document().deepCopy()));
  }

  private JsonNode learnSuffix(
      Authentication controller, String id, long fence, String key, JsonNode command) {
    sessions.translationTransaction(
        controller,
        id,
        fence,
        current -> {
          checkCommand(current, command);
          require(
              !repository.incremental().pending(id) && bootstrapReady(current),
              "REVISION_CONFLICT",
              409);
          return null;
        });
    call(
        controller,
        id,
        fence,
        key,
        GuidedModelRequest.Kind.SOURCE_PLAN,
        (current, response, attemptIdentity, capture) -> {
          if (response.has("question")) {
            return question(controller, current, response.path("question"), "source");
          }
          JsonNode window = repository.incremental().learningWindow(current.document());
          ObjectNode selected =
              validator.admitPlan(
                  current.document(),
                  response,
                  window,
                  store.state(id).path("manifest").path("sourceSteps"));
          inputs.validate(
              current.document(),
              store.state(id).path("manifest"),
              selected.path("sourceReferences"));
          boolean first = repository.incremental().firstSuffixPending(id);
          ObjectNode merged = mergeSuffix(current, selected, first);
          validator.sourceSelections(current.document(), merged, sourceSelections(current));
          dependencies.validate(current.document(), merged);
          // Cumulative allocation intent is established before any appended input creates a pending
          // ACK.
          dependencies.allocate(controller, current.document(), merged);
          GuidedAcceptedPlan.validate(contracts, merged);
          long previous = store.state(id).path("planRevision").asLong();
          store.acceptPlan(id, previous, merged);
          store.continuation(id, "MATERIALIZE");
          return merged;
        });
    boolean pending =
        repository.transaction(
            () -> store.state(id).path("continuation").asText().equals("MATERIALIZE"));
    return pending
        ? finishSuffixMaterialization(controller, id, fence)
        : repository.transaction(() -> safe(repository.lock(id).document()));
  }

  private JsonNode finishSuffixMaterialization(Authentication controller, String id, long fence) {
    ObjectNode state =
        sessions.translationTransaction(controller, id, fence, current -> store.state(id));
    long revision = state.path("planRevision").asLong();
    // OBS-015 B2B-01 P1: admissions, allocations and reads bump materialization_revision after the
    // last push; the runner accepts an append only at runtime+1 (runtime.ts:180).
    if (sessions.contextDeliveryId(controller, id, fence) == null) {
      syncContext(controller, id, fence);
    }
    sessions.materialize(
        controller,
        id,
        fence,
        "suffix-materialize-" + revision,
        state.path("plan").path("sourceReferences"));
    pushMaterializedContext(controller, id, fence);
    return sessions.translationTransaction(
        controller,
        id,
        fence,
        current -> {
          require(
              store.state(id).path("planRevision").asLong() == revision, "REVISION_CONFLICT", 409);
          store.continuation(id, "REFRESH");
          return safe(current.document());
        });
  }

  /** Applies the current same-version head to the runtime; a definite refusal is terminal. */
  private void syncContext(Authentication controller, String id, long fence) {
    try {
      dispatch.pushContext(controller, id, fence);
    } catch (RuntimeException failure) {
      if (com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient.definiteContextRefusal(
          failure)) {
        sessions.failTranslation(controller, id, fence, "RUNTIME_INCOMPATIBLE");
      }
      throw failure;
    }
  }

  /**
   * OBS-015 B2B-01 P2 (A18-4): a keyed append delivery is resent with the same id only after
   * transport uncertainty, at most three sends and never at or after its frozen lease. Any closed
   * runner refusal is final for the delivery and terminal on first receipt. The delivery becomes
   * ACKNOWLEDGED only from a validated runner ACK ({@link GuidedDispatchService#pushContext}).
   */
  private void pushMaterializedContext(Authentication controller, String id, long fence) {
    String delivery = sessions.contextDeliveryId(controller, id, fence);
    if (delivery == null) {
      syncContext(controller, id, fence);
      return;
    }
    boolean send =
        sessions.translationTransaction(
            controller,
            id,
            fence,
            current -> {
              JsonNode recorded = current.progress().path("suffixDelivery");
              ObjectNode counter =
                  recorded.isObject() && recorded.path("deliveryId").asText().equals(delivery)
                      ? (ObjectNode) recorded
                      : current
                          .progress()
                          .putObject("suffixDelivery")
                          .put("deliveryId", delivery)
                          .put("sends", 0);
              Instant lease =
                  Instant.parse(
                      sessions
                          .runnerContext(controller, id, fence)
                          .path("leaseExpiresAt")
                          .asText());
              int sends = counter.path("sends").asInt();
              if (sends >= 3 || !clock.instant().isBefore(lease)) {
                return false;
              }
              counter.put("sends", sends + 1);
              repository.save(current);
              return true;
            });
    if (!send) {
      sessions.failTranslation(controller, id, fence, "RUNTIME_INCOMPATIBLE");
      throw refusedAppend();
    }
    try {
      dispatch.pushContext(controller, id, fence);
    } catch (RuntimeException failure) {
      if (com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient.closedContextRefusal(
          failure)) {
        sessions.translationTransaction(
            controller,
            id,
            fence,
            current -> {
              JsonNode recorded = current.progress().path("suffixDelivery");
              if (recorded.isObject() && recorded.path("deliveryId").asText().equals(delivery)) {
                ((ObjectNode) recorded).put("outcome", "REFUSED");
                repository.save(current);
              }
              return null;
            });
        sessions.failTranslation(controller, id, fence, "RUNTIME_INCOMPATIBLE");
        throw refusedAppend();
      }
      throw failure;
    }
  }

  private static GuidedSessionException refusedAppend() {
    return new GuidedSessionException(
        "RUNTIME_INCOMPATIBLE",
        409,
        com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient.CONTEXT_REFUSED,
        false,
        null);
  }

  private ObjectNode mergeSuffix(
      GuidedSessionRepository.Session current, ObjectNode selected, boolean first) {
    String id = current.document().path("sessionId").asText();
    JsonNode previous = store.state(id).path("plan");
    ObjectNode result = contracts.object();
    var references = result.putArray("sourceReferences");
    previous.path("sourceReferences").forEach(reference -> references.add(reference.deepCopy()));
    java.util.Map<Integer, Integer> referenceIndexes = new java.util.HashMap<>();
    for (int at = 0; at < selected.path("sourceReferences").size(); at++) {
      JsonNode reference = selected.path("sourceReferences").get(at);
      int index = -1;
      for (int existing = 0; existing < references.size(); existing++) {
        if (references.get(existing).equals(reference)) {
          index = existing;
        }
      }
      if (index < 0) {
        index = references.size();
        references.add(reference.deepCopy());
      }
      referenceIndexes.put(at, index);
    }
    var obligations = result.putArray("obligations");
    java.util.Set<String> retained = new java.util.HashSet<>();
    for (ObjectNode action : repository.effectiveActions(id)) {
      if (action.path("state").asText().equals("SUCCEEDED")) {
        retained.add(action.path("admission").path("admissionId").asText());
      }
    }
    for (JsonNode old : previous.path("obligations")) {
      ObjectNode association = store.obligation(id, old.path("obligationId").asText());
      if (association != null && retained.contains(association.path("admissionId").asText())) {
        obligations.add(old.deepCopy());
      }
    }
    java.util.Map<String, String> freshNeeds = new java.util.HashMap<>();
    var needs = result.putArray("needs");
    java.util.Map<String, ObjectNode> needsById = new java.util.LinkedHashMap<>();
    java.util.Set<String> produced = new java.util.HashSet<>();
    for (JsonNode producer : materialized(current).path("producers")) {
      produced.add(producer.path("bindingId").asText());
    }
    for (JsonNode old : previous.path("needs")) {
      if (!first || produced.contains(old.path("bindingId").asText())) {
        ObjectNode kept = old.deepCopy();
        if (first) {
          var consumers = kept.putArray("consumers");
          for (JsonNode oldConsumer : old.path("consumers")) {
            boolean successful = false;
            for (JsonNode edge : materialized(current).path("consumerEdges")) {
              successful |=
                  edge.path("bindingId").equals(old.path("bindingId"))
                      && edge.path("coordinate").path("stepId").equals(oldConsumer.path("stepId"))
                      && edge.path("argumentSlot").equals(oldConsumer.path("argumentSlot"))
                      && retained.contains(edge.path("consumerAdmissionId").asText());
            }
            if (successful) {
              consumers.add(oldConsumer.deepCopy());
            }
          }
        }
        needsById.put(old.path("needId").asText(), kept);
      }
    }
    for (JsonNode candidate : selected.path("needs")) {
      ObjectNode need = candidate.deepCopy();
      need.remove("bindingId");
      String needId = need.path("needId").asText();
      ObjectNode old = needsById.get(needId);
      if (old != null) {
        require(
            old.path("producerStepId").equals(need.path("producerStepId")), "BINDING_ORDER", 422);
        var consumers = (com.fasterxml.jackson.databind.node.ArrayNode) old.path("consumers");
        for (JsonNode consumer : need.path("consumers")) {
          boolean exists = false;
          for (JsonNode previousConsumer : consumers) {
            exists |= previousConsumer.equals(consumer);
          }
          if (!exists) {
            consumers.add(consumer.deepCopy());
          }
        }
      } else {
        boolean imported = false;
        for (JsonNode former : previous.path("needs")) {
          imported |= former.path("needId").asText().equals(needId);
        }
        if (first && imported) {
          String fresh = UUID.randomUUID().toString();
          freshNeeds.put(needId, fresh);
          need.put("needId", fresh);
          needId = fresh;
        }
        needsById.put(needId, need);
      }
    }
    needsById.values().forEach(needs::add);
    for (JsonNode candidate : selected.path("obligations")) {
      ObjectNode obligation = candidate.deepCopy();
      if (!obligation.path("referenceIndex").isNull()) {
        obligation.put(
            "referenceIndex", referenceIndexes.get(obligation.path("referenceIndex").asInt()));
      }
      String needId = obligation.path("needId").asText();
      if (freshNeeds.containsKey(needId)) {
        obligation.put("needId", freshNeeds.get(needId));
      }
      if (!first) {
        for (JsonNode old : previous.path("obligations")) {
          if (GuidedProposalValidator.sameOccurrence(old, obligation)) {
            ObjectNode expected = old.deepCopy(), offered = obligation.deepCopy();
            expected.remove("obligationId");
            offered.remove("obligationId");
            require(expected.equals(offered), "IDEMPOTENCY_CONFLICT", 409);
            obligation.set("obligationId", old.path("obligationId"));
          }
        }
      }
      obligations.add(obligation);
    }
    java.util.List<JsonNode> ordered = new java.util.ArrayList<>();
    obligations.forEach(ordered::add);
    ordered.sort(
        java.util.Comparator.comparingInt(
                (JsonNode obligation) ->
                    com.citi.put.checks.studio.guided.session.GuidedIncrementalStore.stepIndex(
                        current.document(), obligation.path("stepId").asText()))
            .thenComparingInt(obligation -> obligation.path("occurrence").asInt()));
    obligations.removeAll();
    ordered.forEach(obligations::add);
    GuidedAcceptedPlan.validateBeforeAllocation(contracts, result);
    return result;
  }

  private void checkCommand(GuidedSessionRepository.Session current, JsonNode command) {
    checkPins(current.document().path("sessionId").asText());
    require(
        current.document().path("sessionId").equals(command.path("sessionId"))
            && current
                .document()
                .path("scope")
                .path("sourceRevision")
                .equals(command.path("expectedSourceRevision"))
            && current
                .document()
                .path("scope")
                .path("configurationRevision")
                .equals(command.path("expectedConfigurationRevision"))
            && store
                    .state(current.document().path("sessionId").asText())
                    .path("planRevision")
                    .asLong()
                == command.path("expectedPlanRevision").asLong(),
        "REVISION_CONFLICT",
        409);
  }

  @FunctionalInterface
  private interface ModelApplication {
    JsonNode apply(
        GuidedSessionRepository.Session current,
        JsonNode response,
        JsonNode originalAttempt,
        GuidedRefusalDiagnostics.Capture capture);
  }

  /** Fixed settlement margin between a send deadline and its attempt lease. Not configurable. */
  static final java.time.Duration SETTLE_MARGIN = java.time.Duration.ofSeconds(2);

  private record Reserved(
      GuidedModelRequest request,
      GuidedTranslationStore.Attempt attempt,
      long planRevision,
      Instant deadline,
      String translator) {}

  private JsonNode call(
      Authentication controller,
      String id,
      long fence,
      String key,
      GuidedModelRequest.Kind kind,
      ModelApplication apply) {
    List<String> repairs = new ArrayList<>();
    for (int index = 1; index <= 3; index++) {
      final int attemptNumber = index;
      String translator = UUID.randomUUID().toString();
      GuidedPromptAssembler.PreparedProjection prepared = null;
      if (preparationCapability != null) {
        try {
          ObjectNode captured =
              sessions.translationTransaction(
                  controller,
                  id,
                  fence,
                  current ->
                      capturePromptInputsLocked(current, kind).positiveContext(kind, repairs));
          prepared =
              prompts.preparePure(
                  preparationCapability,
                  captured,
                  key,
                  attemptNumber,
                  kind,
                  properties.maxOutputTokens());
        } catch (RuntimeException unavailable) {
          // Preparation is not authority: original actual reservation supplies current refusal.
        }
      }
      final GuidedPromptAssembler.PreparedProjection candidate = prepared;
      Reserved reserved;
      try {
        reserved =
            sessions.translationTransaction(
                controller,
                id,
                fence,
                current -> {
                  if (!sessions.reconcileLateModelUsageLocked(current)) {
                    return null;
                  }
                  require(
                      !current.document().path("state").asText().equals("AWAITING_CLARIFICATION"),
                      "INVALID_CONTRACT",
                      409);
                  require(
                      kind != GuidedModelRequest.Kind.NEXT_ACTION
                          || !store.acquisitionOpen(current),
                      "STALE_GENERATION",
                      409);
                  JsonNode abandoned = store.state(id).path("activeAttempt");
                  String effectiveKey = key;
                  boolean nestedSettlement = false;
                  if (!abandoned.isNull()
                      && !abandoned.isMissingNode()
                      && !Instant.parse(abandoned.path("leaseUntil").asText())
                          .isAfter(clock.instant())) {
                    sessions.settleModel(
                        controller,
                        id,
                        fence,
                        abandoned.path("settlementKey").asText(),
                        abandoned.path("reservationKey").asText(),
                        null,
                        null);
                    store.finishAttempt(
                        id, abandoned.path("attemptId").asText(), "UNKNOWN_CALL", null, null, null);
                    effectiveKey = key + "-recovery-" + UUID.randomUUID();
                    nestedSettlement = true;
                  }
                  // Nested settlement updates a different detached wrapper; never borrow it.
                  var freshInputOwner =
                      nestedSettlement && preparationCapability != null
                          ? repository.lock(id)
                          : current;
                  GuidedModelRequest request =
                      request(
                          freshInputOwner, effectiveKey, attemptNumber, kind, repairs, candidate);
                  ObjectNode projectionDocument;
                  Integer preparedBytes = candidate == null ? null : candidate.bytesFor(request);
                  int bytes;
                  if (preparedBytes != null) {
                    projectionDocument = request.projection().document();
                    bytes = preparedBytes;
                  } else {
                    ObjectNode payload =
                        contracts
                            .object()
                            .put("kind", request.kind().name())
                            .put("requestId", request.requestId())
                            .put("attempt", request.attempt());
                    projectionDocument = request.projection().document();
                    payload.set("context", projectionDocument);
                    ObjectNode wireBound =
                        contracts
                            .object()
                            .put("contents", payload.toString())
                            .put("systemInstruction", request.outputContract());
                    wireBound.set("responseJsonSchema", request.responseSchema());
                    // Count escaped content plus actual supplied schema; allowance covers SDK field
                    // wrappers.
                    bytes = wireBound.toString().getBytes(StandardCharsets.UTF_8).length + 2048;
                  }
                  if (bytes > properties.maxInputBytes()) {
                    GuidedGuardProvenance.observe(Guard.REQUEST_INPUT_SIZE, () -> id);
                    sessions.failTranslation(controller, id, fence, "BUDGET_EXCEEDED");
                    return null;
                  }
                  if (!store.hasAttempt(id, request.requestId(), attemptNumber)
                      && !sessions.modelReservationFitsLocked(
                          freshInputOwner, bytes, request.maxOutputTokens())) {
                    return null;
                  }
                  ObjectNode frozenState = store.state(id);
                  require(
                      frozenState
                          .path("manifest")
                          .path("schemaPins")
                          .equals(prompts.schemaProvenance()),
                      "RUNTIME_INCOMPATIBLE",
                      409);
                  long revision = frozenState.path("planRevision").asLong();
                  Instant deadline = clock.instant().plusSeconds(properties.callSeconds());
                  Instant hard =
                      Instant.parse(freshInputOwner.document().path("expiresAt").asText());
                  // The lease outlives the send deadline by a fixed margin, so a send that reaches
                  // its deadline is still the current attempt when it settles (REJECTED/TIMEOUT,
                  // never SUPERSEDED). Both are clamped to the session's absolute expiry.
                  Instant latestDeadline = hard.minus(SETTLE_MARGIN);
                  if (deadline.isAfter(latestDeadline)) {
                    deadline = latestDeadline;
                  }
                  Instant leaseUntil = deadline.plus(SETTLE_MARGIN);
                  var attempt =
                      store.reserveAttempt(
                          freshInputOwner.document(),
                          request.requestId(),
                          attemptNumber,
                          kind.name(),
                          GuidedContracts.hash(
                              contracts
                                  .object()
                                  .setAll(
                                      java.util.Map.of(
                                          "context",
                                          projectionDocument,
                                          "schemaPins",
                                          prompts.schemaProvenance()))),
                          revision,
                          bytes,
                          request.maxOutputTokens(),
                          translator,
                          leaseUntil);
                  if (attempt.send()) {
                    sessions.reserveModel(
                        controller,
                        id,
                        fence,
                        attempt.reservationKey(),
                        bytes,
                        request.maxOutputTokens());
                  }
                  return new Reserved(request, attempt, revision, deadline, translator);
                });
      } catch (GuidedSessionException failure) {
        // Source/pin/repair refusal may roll back a joined transaction. Preserve any late receipt.
        sessions.reconcileLateModelUsage(controller, id, fence);
        stopRejected(controller, id, fence, failure);
        throw failure;
      }
      // Commit numeric overage/terminal stop before refusal. Never throw inside that transaction.
      require(reserved != null, "BUDGET_EXCEEDED", 429);
      if (!reserved.attempt().send()) {
        JsonNode old = reserved.attempt().identity().path("result");
        require(!old.isMissingNode() && !old.isNull(), "IDEMPOTENCY_CONFLICT", 409);
        return sessions.translationTransaction(
            controller,
            id,
            fence,
            current -> {
              require(
                  reserved.attempt().identity().path("status").asText().equals("APPLIED")
                      && old.path("kind").asText().equals("NEXT_ACTION")
                      && old.path("status").asText().equals("ACTION"),
                  "IDEMPOTENCY_CONFLICT",
                  409);
              ObjectNode prior = store.obligation(id, old.path("obligationId").asText());
              require(prior != null, "IDEMPOTENCY_CONFLICT", 409);
              return prior;
            });
      }
      int send =
          sessions.translationTransaction(
              controller,
              id,
              fence,
              current -> {
                if (!sessions.reconcileLateModelUsageLocked(current)) {
                  return -1;
                }
                if (kind == GuidedModelRequest.Kind.NEXT_ACTION && store.acquisitionOpen(current)) {
                  return 0;
                }
                return store.currentAttempt(
                            current.document(),
                            reserved.attempt().attemptId(),
                            translator,
                            reserved.planRevision(),
                            clock.instant())
                        && store.claimSend(
                            id, reserved.attempt().attemptId(), translator, clock.instant())
                    ? 1
                    : 0;
              });
      require(send != -1, "BUDGET_EXCEEDED", 429);
      require(send == 1, "IDEMPOTENCY_CONFLICT", 409);
      GuidedRefusalDiagnostics.Attempt diagnostic = refusalDiagnostics.attempt(reserved.attempt());
      GuidedModelResponse response;
      try {
        response =
            diagnostic.enabled()
                ? gateway.propose(
                    reserved.request(),
                    new GuidedCallBudget(reserved.deadline(), clock, sendCap()),
                    diagnostic)
                : gateway.propose(
                    reserved.request(),
                    new GuidedCallBudget(reserved.deadline(), clock, sendCap()));
      } catch (RuntimeException failure) {
        response =
            new GuidedModelResponse(
                GuidedModelResponse.Code.TRANSPORT,
                null,
                null,
                null,
                null,
                GuidedModelResponse.Reason.TRANSPORT_ADAPTER_FAULT);
      }
      final GuidedModelResponse received = response;
      try {
        JsonNode applied =
            sessions.translationTransaction(
                controller,
                id,
                fence,
                current -> {
                  sessions.settleModel(
                      controller,
                      id,
                      fence,
                      reserved.attempt().settlementKey(),
                      reserved.attempt().reservationKey(),
                      received.inputTokens(),
                      received.outputTokens());
                  // Re-read because settlement can fail the session on a provider overage.
                  var fresh = repository.lock(id);
                  boolean currentAttempt =
                      store.currentAttempt(
                              fresh.document(),
                              reserved.attempt().attemptId(),
                              translator,
                              reserved.planRevision(),
                              clock.instant())
                          && !List.of("FAILED", "CANCELLED", "EXPIRED", "UNKNOWN_OUTCOME")
                              .contains(fresh.document().path("state").asText());
                  if (!currentAttempt) {
                    store.finishAttempt(
                        id,
                        reserved.attempt().attemptId(),
                        "SUPERSEDED",
                        null,
                        received.inputTokens(),
                        received.outputTokens());
                    return contracts.object().put("superseded", true);
                  }
                  if (received.code() != GuidedModelResponse.Code.OK) {
                    store.finishAttempt(
                        id,
                        reserved.attempt().attemptId(),
                        "REJECTED",
                        null,
                        received.inputTokens(),
                        received.outputTokens(),
                        received.reason().name());
                    diagnostic.rejectedAfterCommit(false);
                    return contracts.object().put("rejected", true);
                  }
                  if (received.proposal().path("status").asText().equals("UNSUPPORTED")) {
                    if (kind == GuidedModelRequest.Kind.NEXT_ACTION
                        && java.util.Set.of("MISSING_SOURCE", "INSUFFICIENT_EVIDENCE")
                            .contains(received.proposal().path("reasonCode").asText())
                        && sessions.annotateLoginFailure(controller, id, fence)) {
                      store.finishAttempt(
                          id,
                          reserved.attempt().attemptId(),
                          "APPLIED",
                          received.proposal(),
                          received.inputTokens(),
                          received.outputTokens());
                      return safe(repository.lock(id).document());
                    }
                    sessions.failTranslation(
                        controller,
                        id,
                        fence,
                        received.proposal().path("reasonCode").asText().equals("MISSING_SOURCE")
                            ? "MISSING_SOURCE"
                            : "RUNTIME_INCOMPATIBLE");
                    store.finishAttempt(
                        id,
                        reserved.attempt().attemptId(),
                        "APPLIED",
                        received.proposal(),
                        received.inputTokens(),
                        received.outputTokens());
                    return safe(repository.lock(id).document());
                  }
                  ObjectNode authority = (ObjectNode) reserved.attempt().identity();
                  authority.set(
                      "expectedContextRevision",
                      reserved.request().projection().document().path("contextRevision"));
                  authority.set(
                      "expectedAuthoredInputsHash",
                      reserved.request().projection().document().path("authoredInputsHash"));
                  diagnostic.enterApplication();
                  JsonNode result =
                      apply.apply(
                          fresh,
                          received.proposal(),
                          authority,
                          kind == GuidedModelRequest.Kind.NEXT_ACTION && diagnostic.enabled()
                              ? diagnostic
                              : GuidedRefusalDiagnostics.Capture.NONE);
                  diagnostic.applicationReturned();
                  store.finishAttempt(
                      id,
                      reserved.attempt().attemptId(),
                      "APPLIED",
                      received.proposal(),
                      received.inputTokens(),
                      received.outputTokens());
                  return result;
                });
        require(!applied.path("superseded").asBoolean(), "STALE_GENERATION", 409);
        if (!applied.path("rejected").asBoolean()) {
          return applied;
        }
      } catch (GuidedSessionException failure) {
        boolean rejected = false;
        try {
          rejected =
              sessions.translationTransaction(
                  controller,
                  id,
                  fence,
                  current -> {
                    JsonNode active = store.state(id).path("activeAttempt");
                    if (!active.path("attemptId").asText().equals(reserved.attempt().attemptId())) {
                      return false;
                    }
                    sessions.settleModel(
                        controller,
                        id,
                        fence,
                        reserved.attempt().settlementKey(),
                        reserved.attempt().reservationKey(),
                        received.inputTokens(),
                        received.outputTokens());
                    store.finishAttempt(
                        id,
                        reserved.attempt().attemptId(),
                        "REJECTED",
                        null,
                        received.inputTokens(),
                        received.outputTokens(),
                        GuidedTranslationStore.applyRejectionReason(failure.getMessage()));
                    diagnostic.rejectedAfterCommit(true);
                    return true;
                  });
        } catch (GuidedSessionException noAuthority) {
          // Accounting-only late receipt cannot revive a cancelled/expired run or authorize a call.
        }
        if (!rejected) {
          repository.transaction(
              () -> {
                repository.lock(id);
                store.recordLateUsage(
                    id,
                    reserved.attempt().attemptId(),
                    received.inputTokens(),
                    received.outputTokens());
                return null;
              });
        }
        if (rejected
            && kind == GuidedModelRequest.Kind.NEXT_ACTION
            && java.util.Set.of(
                    "INVALID_CONTRACT",
                    "POLICY_DENIED",
                    "MISSING_SOURCE",
                    "INSUFFICIENT_EVIDENCE",
                    "REFERENCE_MISMATCH")
                .contains(failure.getMessage())
            && sessions.annotateLoginFailure(controller, id, fence)) {
          return safe(sessions.secretSession(id));
        }
        if (rejected
            && index < 3
            && List.of("INVALID_CONTRACT", "BINDING_ORDER").contains(failure.getMessage())) {
          repairs.add(failure.getMessage());
          continue;
        }
        stopRejected(controller, id, fence, failure);
        throw failure;
      }
      // Round 053 (b), extended by round 067: a definite-transient provider failure (refused/reset,
      // HTTP 429/503, or a pre-response stall at the per-send cap) may be followed by a new
      // persisted, charged attempt in the same three-proposal pool. The
      // REJECTED row above is committed and no transaction is open here; the next iteration
      // re-runs every guard (lock, fence, deadline, source revision, budget fit, reservation).
      if (received.reason().definiteTransient() && index < 3 && backoffBeforeAttempt(index + 1)) {
        continue;
      }
      if (received.code() != GuidedModelResponse.Code.INVALID_RESPONSE || index == 3) {
        sessions.failTranslation(controller, id, fence, "INVALID_CONTRACT");
        throw new GuidedSessionException("INVALID_CONTRACT", 422);
      }
      repairs.add("INVALID_RESPONSE");
    }
    throw new GuidedSessionException("BUDGET_EXCEEDED", 429);
  }

  private java.time.Duration sendCap() {
    return java.time.Duration.ofSeconds(properties.sendTimeoutSeconds());
  }

  /**
   * Waits {@code base << (attempt - 2)} before a definite-transient retry.
   *
   * @return false when the wait was interrupted, so the caller ends in today's terminal branch
   */
  private boolean backoffBeforeAttempt(int attempt) {
    long delay = (long) properties.transientBackoffMillis() << (attempt - 2);
    if (delay <= 0) {
      return true;
    }
    try {
      sleeper.sleep(delay);
      return true;
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      return false;
    }
  }

  private void reconcile(Authentication controller, String id, long fence) {
    if (!sessions.reconcileLateModelUsage(controller, id, fence)) {
      boolean budget =
          repository.transaction(
              () ->
                  repository
                      .lock(id)
                      .progress()
                      .path("errorCode")
                      .asText()
                      .equals("BUDGET_EXCEEDED"));
      throw new GuidedSessionException(
          budget ? "BUDGET_EXCEEDED" : "PUBLICATION_CONFLICT", budget ? 429 : 409);
    }
  }

  /**
   * STUDIO-OBS-014 AC-4/5/6 (AR-2 a, f): the governed action guard on a structurally valid
   * proposal. A refusal is {@code 422 POLICY_DENIED} with the closed {@link
   * com.citi.put.checks.studio.guided.policy.GuidedPolicyReason} as its message code, audited at
   * the decision (AC-10), and goes through the existing rejected-proposal path (login annotation,
   * then the terminal mapping in {@link #stopRejected}). Under {@code CLARIFY_FIRST} the first
   * side-effecting action of the session raises one server-made confirmation instead; the returned
   * node is that question, and nothing is admitted.
   */
  private JsonNode guardAction(
      Authentication controller,
      long fence,
      GuidedSessionRepository.Session current,
      JsonNode obligation,
      JsonNode proposal,
      JsonNode attemptIdentity) {
    return guardAction(controller, fence, current, obligation, proposal, attemptIdentity, null);
  }

  private JsonNode guardAction(
      Authentication controller,
      long fence,
      GuidedSessionRepository.Session current,
      JsonNode obligation,
      JsonNode proposal,
      JsonNode attemptIdentity,
      String prefixRequestDigest) {
    String id = current.document().path("sessionId").asText();
    JsonNode target = proposal.path("target");
    String stepId = obligation.path("stepId").asText();
    JsonNode manifest = store.state(id).path("manifest");
    String authored = "";
    for (JsonNode step : manifest.path("sourceSteps")) {
      if (step.path("stepId").asText().equals(stepId)) {
        authored = step.path("text").asText();
      }
    }
    var decision =
        GuidedActionGuard.evaluateProposal(
            current.progress(), manifest, proposal, store.frozenPolicy(id));
    if (decision.refused()) {
      com.citi.put.checks.studio.guided.audit.StudioActionAudit.guidedActionRefused(
          current.document(),
          attemptIdentity == null ? null : attemptIdentity.path("attemptId").asText(null),
          proposal,
          decision.refusal().name());
      throw new GuidedSessionException(
          "POLICY_DENIED", 422, decision.refusal().name(), false, null);
    }
    if (!decision.confirmFirst()) {
      return null;
    }
    ObjectNode question =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("phase", "observed")
            .put("clarificationId", UUID.randomUUID().toString())
            .put("sessionId", id)
            .put("scopeHash", current.document().path("scopeHash").asText())
            .put("reason", "SIDE_EFFECT_CONFIRMATION")
            .put("promptCode", "CONFIRM_ACTION")
            .put("expiresAt", current.document().path("expiresAt").asText());
    question
        .putObject("coordinate")
        .put("stepId", stepId)
        .set("ordinal", obligation.path("occurrence"));
    question.set("documentId", current.progress().path("documentId"));
    question.put("generation", current.progress().path("generation").asInt());
    String label = authored.isBlank() ? "Confirm this action" : authored;
    question
        .putArray("choices")
        .addObject()
        .put("choiceId", UUID.randomUUID().toString())
        .put(
            "safeLabel",
            label.substring(
                0,
                label.offsetByCodePoints(
                    0, Math.min(256, label.codePointCount(0, label.length())))))
        .put("labelSource", "AUTHORED")
        .setAll(
            java.util.Map.of(
                "nodeId",
                target.has("nodeId")
                    ? target.path("nodeId")
                    : com.fasterxml.jackson.databind.node.NullNode.instance,
                "bindingId",
                com.fasterxml.jackson.databind.node.NullNode.instance));
    contracts.validate("v3/clarification", question);
    return sessions.sideEffectConfirmation(controller, id, fence, question, prefixRequestDigest);
  }

  private void stopRejected(
      Authentication controller, String id, long fence, GuidedSessionException failure) {
    String code = failure.getMessage();
    // AR-2 a: a POLICY_DENIED that carries a governed reason ends FAILED with errorCode
    // POLICY_DENIED. Every other POLICY_DENIED (the password-control refusals) keeps today's
    // mapping to INVALID_CONTRACT, so OBS-007 behaviour is unchanged.
    boolean governed =
        code.equals("POLICY_DENIED")
            && com.citi.put.checks.studio.guided.policy.GuidedPolicyReason.of(failure.messageCode())
                != null;
    String terminalCode =
        governed
            ? "POLICY_DENIED"
            : java.util.Set.of("EVIDENCE_MISMATCH", "POLICY_DENIED", "REFERENCE_MISMATCH")
                    .contains(code)
                ? "INVALID_CONTRACT"
                : code;
    if (!List.of(
            "BUDGET_EXCEEDED",
            "MISSING_SOURCE",
            "INVALID_CONTRACT",
            "RUNTIME_INCOMPATIBLE",
            "REVISION_CONFLICT",
            "BINDING_ORDER",
            "POLICY_DENIED")
        .contains(terminalCode)) {
      return;
    }
    try {
      sessions.failTranslation(controller, id, fence, terminalCode);
    } catch (GuidedSessionException noCurrentAuthority) {
      // An expired/terminal or replaced owner is already unable to continue; never revive it.
    }
  }

  private GuidedModelRequest request(
      GuidedSessionRepository.Session current,
      String key,
      int attempt,
      GuidedModelRequest.Kind kind,
      List<String> repairs) {
    return request(current, key, attempt, kind, repairs, null);
  }

  private GuidedModelRequest request(
      GuidedSessionRepository.Session current,
      String key,
      int attempt,
      GuidedModelRequest.Kind kind,
      List<String> repairs,
      GuidedPromptAssembler.PreparedProjection prepared) {
    return capturePromptInputsLocked(current, kind).complete(key, attempt, kind, repairs, prepared);
  }

  private final class PromptInputs {
    private final JsonNode session, progress, state, safeInputs, remaining, selections;

    private PromptInputs(
        JsonNode session,
        JsonNode progress,
        JsonNode state,
        JsonNode safeInputs,
        JsonNode remaining,
        JsonNode selections) {
      this.session = session;
      this.progress = progress;
      this.state = state;
      this.safeInputs = safeInputs;
      this.remaining = remaining;
      this.selections = selections;
    }

    private ObjectNode positiveContext(GuidedModelRequest.Kind kind, List<String> repairs) {
      return prompts
          .buildPositiveContext(
              kind, session, progress, state, safeInputs, remaining, selections, repairs)
          .deepCopy();
    }

    private GuidedModelRequest complete(
        String key,
        int attempt,
        GuidedModelRequest.Kind kind,
        List<String> repairs,
        GuidedPromptAssembler.PreparedProjection prepared) {
      return prompts.completePreparedOrOriginal(
          preparationCapability,
          prepared,
          key,
          attempt,
          kind,
          session,
          progress,
          state,
          safeInputs,
          remaining,
          selections,
          repairs,
          properties.maxOutputTokens());
    }
  }

  private PromptInputs capturePromptInputsLocked(
      GuidedSessionRepository.Session current, GuidedModelRequest.Kind kind) {
    String id = current.document().path("sessionId").asText();
    JsonNode state = store.state(id);
    var safeInputs = contracts.object().putArray("items");
    ObjectNode progress = current.progress().deepCopy();
    if (!state.path("plan").isNull()
        && !state.path("plan").isMissingNode()
        && !state.path("continuation").asText().equals("MATERIALIZE")) {
      // This method runs under the session/source lock; context retrieval never calls the runner.
      var context = materialized(current);
      for (JsonNode input : context.path("authoredInputs").path("inputs")) {
        ObjectNode safe = contracts.object();
        for (String field : List.of("inputId", "sourceStepId", "kind", "intendedSlot")) {
          safe.set(field, input.path(field));
        }
        safeInputs.add(safe);
      }
      progress.set("authoredInputsHash", context.path("authoredInputsHash"));
      progress.set("contextRevision", context.path("contextRevision"));
    }
    var remaining = contracts.object().putArray("items");
    int ordinal = 0;
    String step =
        current
            .document()
            .path("sourceSteps")
            .get(current.progress().path("stepIndex").asInt())
            .path("stepId")
            .asText();
    List<ObjectNode> actions = repository.effectiveActions(id);
    for (JsonNode obligation : state.path("plan").path("obligations")) {
      if (!obligation.path("stepId").asText().equals(step)) {
        continue;
      }
      boolean done =
          actions.stream()
              .anyMatch(
                  a ->
                      a.path("coordinate").path("stepId").asText().equals(step)
                          && a.path("coordinate")
                              .path("ordinal")
                              .equals(obligation.path("occurrence"))
                          && a.path("state").asText().equals("SUCCEEDED"));
      if (done) {
        ordinal++;
      } else {
        remaining.add(effectiveObligation(current, obligation, null));
      }
    }
    if (kind == GuidedModelRequest.Kind.SOURCE_PLAN
        && state.path("plan").path("obligations").isArray()) {
      remaining.removeAll();
      state.path("plan").path("obligations").forEach(remaining::add);
    }
    if (kind == GuidedModelRequest.Kind.SOURCE_PLAN && repository.incremental().hasBase(id)) {
      progress.set("learningWindow", repository.incremental().learningWindow(current.document()));
    }
    progress.put("translationOrdinal", ordinal);
    return new PromptInputs(
        current.document(), progress, state, safeInputs, remaining, sourceSelections(current));
  }

  private ObjectNode materialized(GuidedSessionRepository.Session current) {
    // The production access still rechecks source on the surrounding transaction.
    return new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(
            jdbc(), contracts)
        .context(current.document());
  }

  private org.springframework.jdbc.core.JdbcTemplate database;

  public void installDatabase(org.springframework.jdbc.core.JdbcTemplate jdbc) {
    this.database = jdbc;
  }

  private org.springframework.jdbc.core.JdbcTemplate jdbc() {
    if (database == null) {
      throw new IllegalStateException("Missing translation persistence");
    }
    return database;
  }

  private JsonNode sourceSelections(GuidedSessionRepository.Session current) {
    var result = contracts.object().putArray("items");
    current
        .progress()
        .path("resolvedClarifications")
        .fieldNames()
        .forEachRemaining(
            question -> {
              JsonNode selected =
                  questions.selected(current.document().path("sessionId").asText(), question);
              if (selected != null && selected.has("need") && selected.has("reference")) {
                result.add(selected);
              }
            });
    return result;
  }

  ObjectNode effectiveObligation(
      GuidedSessionRepository.Session current, JsonNode obligation, JsonNode action) {
    ObjectNode effective = ((ObjectNode) obligation).deepCopy();
    boolean selectedAlready = false;
    for (JsonNode row : questions.acceptedObserved(current.document().path("sessionId").asText())) {
      for (JsonNode mapping : row.path("meanings")) {
        if (!mapping.path("choiceId").equals(row.path("acceptedChoiceId"))) {
          continue;
        }
        JsonNode selected = mapping.path("meaning");
        if (!selected.path("obligationId").equals(obligation.path("obligationId"))) {
          continue;
        }
        require(!selectedAlready, "INVALID_CONTRACT", 422);
        selectedAlready = true;
        require(
            current
                .progress()
                .path("resolvedClarifications")
                .has(row.path("context").path("clarificationId").asText()),
            "INVALID_CONTRACT",
            422);
        JsonNode locator = selected.path("locator");
        if (action != null) {
          require(locator.equals(action.path("target").path("locator")), "STALE_GENERATION", 409);
        }
        effective.put(
            "targetIntent",
            locator.path(locator.path("kind").asText().equals("role") ? "name" : "value").asText());
        effective.set("selectedLocator", locator);
      }
    }
    // Round 057: a qualified label ("Open in Primary workspace") is a second source of the
    // effective obligation. An accepted observed choice wins; otherwise the proposed node must be
    // the only candidate and carry a locator unique in the observation.
    if (!selectedAlready && action != null && obligation.path("scopeIntent").isTextual()) {
      JsonNode progress = current.progress();
      JsonNode locator =
          GuidedQualifiedLabel.qualifiedLocator(
              progress.path("observation"),
              progress.path("documentId"),
              progress.path("generation"),
              obligation,
              action.path("target"),
              "INVALID_CONTRACT",
              422);
      effective.put("targetIntent", GuidedQualifiedLabel.locatorLabel(locator));
      effective.set("selectedLocator", locator.deepCopy());
    }
    return effective;
  }

  private JsonNode question(
      Authentication controller,
      GuidedSessionRepository.Session current,
      JsonNode candidate,
      String phase) {
    return question(controller, current, candidate, phase, null);
  }

  private JsonNode question(
      Authentication controller,
      GuidedSessionRepository.Session current,
      JsonNode candidate,
      String phase,
      JsonNode attemptIdentity) {
    ObjectNode question =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("phase", phase)
            .put("clarificationId", UUID.randomUUID().toString())
            .put("sessionId", current.document().path("sessionId").asText())
            .put("scopeHash", current.document().path("scopeHash").asText())
            .put("reason", candidate.path("reason").asText())
            .put("promptCode", phase.equals("source") ? "CHOOSE_SOURCE" : "CHOOSE_FIELD")
            .put("expiresAt", current.document().path("expiresAt").asText());
    question
        .putObject("coordinate")
        .put(
            "stepId",
            current
                .document()
                .path("sourceSteps")
                .get(current.progress().path("stepIndex").asInt())
                .path("stepId")
                .asText())
        .put("ordinal", 0);
    question.set(
        "documentId",
        phase.equals("source")
            ? com.fasterxml.jackson.databind.node.NullNode.instance
            : current.progress().path("documentId"));
    question.put(
        "generation", phase.equals("source") ? 0 : current.progress().path("generation").asInt());
    var choices = question.putArray("choices");
    var meanings = contracts.object().putArray("items");
    int index = 0;
    var seenMeanings = new java.util.HashSet<String>();
    JsonNode sourceNeed = candidate.path("choices").get(0).path("meaning").path("need");
    String questionObligation =
        candidate.path("choices").get(0).path("meaning").path("obligationId").asText();
    for (JsonNode choice : candidate.path("choices")) {
      String choiceId = UUID.randomUUID().toString();
      JsonNode meaning = choice.path("meaning");
      require(seenMeanings.add(GuidedContracts.hash(meaning)), "INVALID_CONTRACT", 422);
      String label;
      // STUDIO-OBS-014 AC-7: where the label text came from, so the UI can mark page-derived
      // labels untrusted. Secret references name their ID only (I-C11), never a value.
      String labelSource;
      JsonNode pageNode = null;
      if (phase.equals("source")) {
        validator.sourceMeaning(current.document(), meaning);
        require(meaning.path("need").equals(sourceNeed), "INVALID_CONTRACT", 422);
        for (JsonNode prior : sourceSelections(current)) {
          require(
              !GuidedProposalValidator.sameOccurrence(prior.path("need"), sourceNeed),
              "IDEMPOTENCY_CONFLICT",
              409);
        }
        question.withObject("/coordinate").set("stepId", sourceNeed.path("stepId"));
        question.withObject("/coordinate").set("ordinal", sourceNeed.path("occurrence"));
        meaning = meaning.path("reference");
        var refs = contracts.object().putArray("items").add(meaning);
        inputs.validate(
            current.document(),
            store.state(current.document().path("sessionId").asText()).path("manifest"),
            refs);
        JsonNode manifest =
            store.state(current.document().path("sessionId").asText()).path("manifest");
        label =
            meaning.path("kind").asText().equals("secretRef")
                ? meaning.path("referenceName").asText()
                : "Saved input choice " + (++index);
        labelSource = "SAVED_INPUT";
        if (meaning.path("referenceKind").asText().equals("sourceSpan")) {
          for (JsonNode source : manifest.path("sourceSteps")) {
            if (source.path("stepId").equals(meaning.path("stepId"))) {
              String excerpt =
                  source
                      .path("text")
                      .asText()
                      .substring(
                          meaning.path("startUtf16").asInt(), meaning.path("endUtf16").asInt());
              label = "Use authored text: " + excerpt.substring(0, Math.min(200, excerpt.length()));
              labelSource = "AUTHORED";
            }
          }
        }
      } else {
        JsonNode node = null;
        for (JsonNode item : current.progress().path("observation").path("nodes")) {
          if (item.path("nodeId").equals(meaning.path("nodeId"))) {
            node = item;
          }
        }
        require(node != null, "STALE_GENERATION", 409);
        boolean corresponds = false;
        for (JsonNode hint : node.path("locatorHints")) {
          corresponds |= hint.equals(meaning.path("locator"));
        }
        require(corresponds, "STALE_GENERATION", 409);
        JsonNode disputed =
            validator.remaining(
                store.state(current.document().path("sessionId").asText()).path("plan"),
                meaning.path("obligationId").asText());
        GuidedQualifiedLabel.requireQuestionChoice(
            current.progress().path("observation"),
            current.progress().path("documentId"),
            current.progress().path("generation"),
            disputed,
            node.path("nodeId").asText());
        JsonNode currentStep =
            current
                .document()
                .path("sourceSteps")
                .get(current.progress().path("stepIndex").asInt());
        long ordinal =
            repository.actions(current.document().path("sessionId").asText()).stream()
                .filter(
                    existing ->
                        existing
                            .path("coordinate")
                            .path("stepId")
                            .equals(currentStep.path("stepId")))
                .count();
        require(
            meaning.path("obligationId").asText().equals(questionObligation)
                && disputed.path("stepId").equals(currentStep.path("stepId"))
                && disputed.path("occurrence").asLong() == ordinal,
            "BINDING_ORDER",
            422);
        question.withObject("/coordinate").set("stepId", disputed.path("stepId"));
        question.withObject("/coordinate").set("ordinal", disputed.path("occurrence"));
        label = node.path("name").asText(node.path("role").asText());
        if (label.isBlank()) {
          label = "Field " + (++index);
        }
        // Every observed-phase choice names a page node: PAGE, with that node's role and region,
        // taken from the sanitized observation the worker reported (never raw DOM).
        labelSource = "PAGE";
        pageNode = node;
      }
      ObjectNode emitted =
          choices
              .addObject()
              .put("choiceId", choiceId)
              .put("safeLabel", label)
              .put("labelSource", labelSource);
      if (pageNode != null) {
        emitted.put("role", pageNode.path("role").asText());
        // Region IDs are relationships, not display labels. Use only the admitted snapshot's
        // unique eligible region name; it remains untrusted PAGE presentation, never authority.
        emitted.set("region", observedRegionName(current.progress(), pageNode));
      }
      emitted.setAll(
          java.util.Map.of(
              "nodeId",
              phase.equals("source")
                  ? com.fasterxml.jackson.databind.node.NullNode.instance
                  : meaning.path("nodeId"),
              "bindingId",
              phase.equals("source")
                  ? com.fasterxml.jackson.databind.node.NullNode.instance
                  : meaning.path("bindingId")));
      meanings.addObject().put("choiceId", choiceId).set("meaning", choice.path("meaning"));
    }
    contracts.validate("v3/clarification", question);
    JsonNode capture =
        phase.equals("observed")
            ? questionCapture(controller, current, candidate, attemptIdentity)
            : null;
    try {
      return sessions.translationQuestion(
          controller,
          current.document().path("sessionId").asText(),
          current.document().path("owner").path("fence").asLong(),
          question.path("clarificationId").asText(),
          question,
          meanings,
          capture);
    } catch (org.springframework.dao.DataAccessException failure) {
      if (capture == null) {
        throw failure;
      }
      // Propagate through the original apply transaction so PostgreSQL rolls it back. The
      // outer call handler then commits received usage in a separate settlement transaction.
      throw new GuidedSessionException("EVIDENCE_MISMATCH", 422);
    }
  }

  private static JsonNode observedRegionName(JsonNode progress, JsonNode pageNode) {
    if (progress == null || pageNode == null) {
      return com.fasterxml.jackson.databind.node.NullNode.instance;
    }
    return GuidedQualifiedLabel.regionName(
        progress.path("observation"),
        progress.path("documentId"),
        progress.path("generation"),
        pageNode);
  }

  private JsonNode questionCapture(
      Authentication controller,
      GuidedSessionRepository.Session current,
      JsonNode candidate,
      JsonNode attempt) {
    require(attempt != null, "EVIDENCE_MISMATCH", 422);
    String id = current.document().path("sessionId").asText();
    JsonNode state = store.state(id), evidence = attempt.path("executionEvidence");
    JsonNode context =
        sessions.runnerContext(
            controller, id, current.document().path("owner").path("fence").asLong());
    require(
        attempt.path("kind").asText().equals("NEXT_ACTION")
            && attempt.path("scope").equals(current.document().path("scope"))
            && attempt.path("scopeHash").equals(current.document().path("scopeHash"))
            && attempt.path("owner").path("workerId").equals(context.path("workerId"))
            && attempt.path("owner").path("fence").equals(context.path("ownerFence"))
            && attempt.path("planRevision").asLong() == state.path("planRevision").asLong()
            && attempt.path("expectedContextRevision").equals(context.path("contextRevision"))
            && attempt.path("expectedAuthoredInputsHash").equals(context.path("authoredInputsHash"))
            && evidence.equals(current.progress().path("executionEvidence"))
            && evidence.path("kind").asText().equals("observedDocument")
            && evidence.path("contextId").equals(context.path("contextId"))
            && evidence.path("observationHash").equals(current.progress().path("observationHash")),
        "STALE_GENERATION",
        409);
    ObjectNode capture =
        contracts
            .object()
            .put("version", 1)
            .put("planRevision", state.path("planRevision").asText())
            .put("planHash", GuidedContracts.hash(state.path("plan")))
            .put("evidenceHash", GuidedContracts.hash(evidence))
            .put("modelQuestionHash", GuidedContracts.hash(candidate));
    for (String key : List.of("attemptId", "requestId", "attempt", "executionEvidence")) {
      capture.set(key, attempt.path(key));
    }
    capture.set(
        "obligationId", candidate.path("choices").get(0).path("meaning").path("obligationId"));
    for (String key :
        List.of("contextId", "contextRevision", "workerId", "ownerFence", "authoredInputsHash")) {
      capture.set(key, context.path(key));
    }
    capture.set("observationHash", evidence.path("observationHash"));
    contracts.validate("v3/replay-validation#/definitions/QuestionCapture1", capture);
    return capture;
  }

  private JsonNode recover(Authentication controller, String id, long fence) {
    List<ObjectNode> associations =
        sessions.translationTransaction(controller, id, fence, current -> store.obligations(id));
    List<ObjectNode> actions = sessions.translationActions(controller, id, fence);
    for (ObjectNode association : associations) {
      if (association.path("admissionId").isNull()
          || association.path("admissionId").asText().isBlank()) {
        continue;
      }
      for (JsonNode action : actions) {
        if (!action.path("admission").path("admissionId").equals(association.path("admissionId"))) {
          continue;
        }
        if (action.path("state").asText().equals("ADMITTED")) {
          return admitAndDispatch(controller, id, fence, association);
        }
        require(action.path("state").asText().equals("SUCCEEDED"), "UNKNOWN_OUTCOME", 409);
      }
    }
    return null;
  }

  private JsonNode admitAndDispatch(
      Authentication controller, String id, long fence, JsonNode association) {
    JsonNode admission =
        dispatch.prepareAndAdmit(
            controller,
            id,
            fence,
            association.path("admissionKey").asText(),
            association.path("proposal"));
    if (admission.path("dispatchCount").asInt() > 0) {
      return admission;
    }
    ObjectNode request =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("admissionId", admission.path("admission").path("admissionId").asText())
            .put("ownerFence", fence)
            .put("operationHash", admission.path("operationHash").asText());
    return dispatch.dispatch(
        controller, id, fence, association.path("admissionKey").asText() + "-dispatch", request);
  }

  private JsonNode complete(Authentication controller, String id, long fence, String key) {
    if (!properties.verifySteps()) {
      return sessions.translationTransaction(
          controller, id, fence, current -> completeCurrent(controller, id, fence, current));
    }
    return call(
        controller,
        id,
        fence,
        key,
        GuidedModelRequest.Kind.VERIFY_STEP,
        (current, verification, attemptIdentity, capture) -> {
          String step =
              current
                  .document()
                  .path("sourceSteps")
                  .get(current.progress().path("stepIndex").asInt())
                  .path("stepId")
                  .asText();
          require(
              verification.path("complete").asBoolean()
                  && verification.path("stepId").asText().equals(step),
              "INVALID_CONTRACT",
              422);
          return completeCurrent(controller, id, fence, current);
        });
  }

  private JsonNode completeCurrent(
      Authentication controller, String id, long fence, GuidedSessionRepository.Session current) {
    String step =
        current
            .document()
            .path("sourceSteps")
            .get(current.progress().path("stepIndex").asInt())
            .path("stepId")
            .asText();
    JsonNode result =
        sessions.completeStep(
            controller, id, fence, "complete-" + step, contracts.object().put("stepId", step));
    store.continuation(
        id, result.path("state").asText().equals("FINALIZING") ? "FINALIZING" : "REFRESH");
    return result;
  }

  private JsonNode nextAcquisitionObligation(
      GuidedSessionRepository.Session current, JsonNode state) {
    JsonNode step =
        current.document().path("sourceSteps").path(current.progress().path("stepIndex").asInt());
    JsonNode next = null;
    List<ObjectNode> actions = repository.actions(current.document().path("sessionId").asText());
    for (JsonNode obligation : state.path("plan").path("obligations")) {
      if (!obligation.path("stepId").equals(step.path("stepId"))) {
        continue;
      }
      boolean complete =
          actions.stream()
              .anyMatch(
                  a ->
                      a.path("state").asText().equals("SUCCEEDED")
                          && a.path("coordinate").path("stepId").equals(obligation.path("stepId"))
                          && a.path("coordinate")
                              .path("ordinal")
                              .equals(obligation.path("occurrence")));
      if (!complete
          && (next == null
              || obligation.path("occurrence").asLong() < next.path("occurrence").asLong())) {
        next = obligation;
      }
    }
    require(next != null, "BINDING_ORDER", 422);
    return effectiveObligation(current, next, null);
  }

  /** Availability is only a reason to defer inference, never an executable target selection. */
  static boolean acquisitionAvailable(JsonNode progress, JsonNode obligation) {
    return acquisitionAvailable(progress, obligation, null);
  }

  static boolean acquisitionAvailable(
      JsonNode progress, JsonNode obligation, JsonNode acceptedPlan) {
    String operation = obligation.path("operationKind").asText();
    if (operation.equals("navigate")
        || operation.equals("assert")
            && List.of("url", "title").contains(obligation.path("predicate").asText())) {
      return true;
    }
    JsonNode observation = progress.path("observation");
    require(
        observation.isObject()
            && observation.path("nodes").isArray()
            && !observation.path("coverage").path("truncated").asBoolean()
            && !observation.path("coverage").path("reason").asText().equals("unsupportedSurface"),
        "UNSUPPORTED_SURFACE",
        422);
    if (acceptedSecretFill(acceptedPlan, obligation)) {
      JsonNode count = observation.path("coverage").path("passwordControls");
      // This count permits inference only. The live prepare/fill resolver remains authoritative.
      return count.isIntegralNumber() && count.canConvertToInt() && count.intValue() == 1;
    }
    String intent = obligation.path("targetIntent").asText();
    JsonNode selected = obligation.path("selectedLocator");
    if (selected.isMissingNode() && obligation.path("scopeIntent").isTextual()) {
      // Round 057: the author named a region. A region that matches nothing never falls back to
      // the unqualified match; the passive wait ends in the existing acquisition refusal.
      return !GuidedQualifiedLabel.candidates(
              observation,
              progress.path("documentId"),
              progress.path("generation"),
              intent,
              obligation.path("scopeIntent").asText())
          .isEmpty();
    }
    for (JsonNode node : observation.path("nodes")) {
      if (selected.isMissingNode() && intent.equalsIgnoreCase(node.path("name").asText())) {
        return true;
      }
      for (JsonNode locator : node.path("locatorHints")) {
        if (!selected.isMissingNode()) {
          if (selected.equals(locator)) {
            return true;
          }
        } else {
          String name =
              locator.path("kind").asText().equals("role")
                  ? locator.path("name").asText()
                  : locator.path("value").asText();
          if (intent.equalsIgnoreCase(name)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private static boolean acceptedSecretFill(JsonNode plan, JsonNode obligation) {
    if (plan == null
        || !plan.isObject()
        || !obligation.path("operationKind").asText().equals("fill")) {
      return false;
    }
    JsonNode index = obligation.path("referenceIndex"), references = plan.path("sourceReferences");
    if (!index.isIntegralNumber()
        || !index.canConvertToInt()
        || !references.isArray()
        || index.intValue() < 0
        || index.intValue() >= references.size()) {
      return false;
    }
    JsonNode reference = references.get(index.intValue());
    if (!reference.path("referenceKind").asText().equals("configuration")
        || !reference.path("kind").asText().equals("secretRef")
        || !reference.path("stepId").equals(obligation.path("stepId"))
        || !reference.path("intendedSlot").asText().equals("fill.value")) {
      return false;
    }
    for (JsonNode accepted : plan.path("obligations")) {
      if (accepted.path("operationKind").equals(obligation.path("operationKind"))
          && accepted.path("stepId").equals(obligation.path("stepId"))
          && accepted.path("occurrence").equals(obligation.path("occurrence"))
          && accepted.path("referenceIndex").equals(index)
          && accepted.path("obligationId").equals(obligation.path("obligationId"))) {
        return true;
      }
    }
    return false;
  }

  private ObjectNode acquisitionRequest(GuidedSessionRepository.Session current) {
    ObjectNode result =
        new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(jdbc(), contracts)
            .identity(materialized(current));
    result.set("expectedGeneration", current.progress().path("generation"));
    contracts.validate("v3/observation-refresh", result);
    return result;
  }

  private boolean acquireBeforeProposal(Authentication controller, String id, long fence) {
    try {
      long startedNanos = System.nanoTime();
      GuidedTranslationStore.AcquisitionClaim claim =
          sessions.translationTransaction(
              controller,
              id,
              fence,
              current -> {
                checkPins(id);
                require(bootstrapReady(current), "RUNTIME_INCOMPATIBLE", 409);
                JsonNode state = store.state(id),
                    obligation = nextAcquisitionObligation(current, state);
                boolean available =
                    acquisitionAvailable(current.progress(), obligation, state.path("plan"));
                return store.acquire(
                    current,
                    state,
                    obligation,
                    available,
                    available || store.acquisitionPending(current)
                        ? null
                        : acquisitionRequest(current));
              });
      if (claim.disposition() == GuidedTranslationStore.AcquisitionDisposition.REFUSED) {
        sessions.failTranslation(controller, id, fence, claim.errorCode());
        throw new GuidedSessionException(claim.errorCode(), 429);
      }
      if (claim.disposition() == GuidedTranslationStore.AcquisitionDisposition.READY) {
        return true;
      }
      if (claim.disposition() == GuidedTranslationStore.AcquisitionDisposition.WAIT) {
        return false;
      }
      JsonNode response = observeAcquisition(controller, id, fence, claim, startedNanos);
      if (response == null) {
        return false;
      }
      var settled =
          sessions.translationTransaction(
              controller,
              id,
              fence,
              current -> {
                checkPins(id);
                require(bootstrapReady(current), "RUNTIME_INCOMPATIBLE", 409);
                JsonNode state = store.state(id),
                    obligation = nextAcquisitionObligation(current, state);
                return store.settleAcquisition(
                    current,
                    state,
                    obligation,
                    claim,
                    response,
                    acquisitionAvailable(current.progress(), obligation, state.path("plan")));
              });
      if (settled.disposition() == GuidedTranslationStore.AcquisitionDisposition.REFUSED) {
        sessions.failTranslation(controller, id, fence, settled.errorCode());
        throw new GuidedSessionException(settled.errorCode(), 429);
      }
      return settled.disposition() == GuidedTranslationStore.AcquisitionDisposition.READY;
    } catch (GuidedSessionException failure) {
      // A late usage receipt remains durable even when a readiness identity/cap refuses.
      sessions.reconcileLateModelUsage(controller, id, fence);
      if (List.of(
              "BUDGET_EXCEEDED",
              "MISSING_SOURCE",
              "INVALID_CONTRACT",
              "RUNTIME_INCOMPATIBLE",
              "REVISION_CONFLICT",
              "BINDING_ORDER",
              "STALE_GENERATION",
              "UNSUPPORTED_SURFACE")
          .contains(failure.getMessage())) {
        try {
          sessions.failTranslation(controller, id, fence, failure.getMessage());
        } catch (GuidedSessionException stopped) {
          /* Never revive expired/replaced authority. */
        }
      }
      throw failure;
    }
  }

  private JsonNode observeAcquisition(
      Authentication controller,
      String id,
      long fence,
      GuidedTranslationStore.AcquisitionClaim claim,
      long startedNanos) {
    long remaining = claim.remainingMs() * 1_000_000L - (System.nanoTime() - startedNanos);
    require(
        GuidedGuardProvenance.passing(remaining > 0, Guard.PASSIVE_REMAINING, () -> id),
        "BUDGET_EXCEEDED",
        429);
    var task =
        new java.util.concurrent.FutureTask<JsonNode>(
            () -> dispatch.observe(controller, id, fence, claim.key(), claim.request()));
    Thread.ofVirtual().name("guided-passive-observation").start(task);
    try {
      return task.get(
          Math.min(remaining, java.time.Duration.ofSeconds(15).toNanos()),
          java.util.concurrent.TimeUnit.NANOSECONDS);
    } catch (java.util.concurrent.TimeoutException timeout) {
      GuidedGuardProvenance.observe(Guard.PASSIVE_WAIT_TIMEOUT, () -> id);
      throw new GuidedSessionException("BUDGET_EXCEEDED", 429);
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      GuidedGuardProvenance.observe(Guard.PASSIVE_WAIT_INTERRUPTED, () -> id);
      throw new GuidedSessionException("BUDGET_EXCEEDED", 429);
    } catch (java.util.concurrent.ExecutionException failed) {
      if (failed.getCause() instanceof GuidedSessionException refusal) {
        // This read-only refresh remains one durable pending key; never treat it as a new poll.
        if (refusal.getMessage().equals("UNKNOWN_OUTCOME")) {
          return null;
        }
        throw refusal;
      }
      return null;
    } finally {
      // Interruption is best effort. Any late callback still has to pass durable deadline/fences.
      if (!task.isDone()) {
        task.cancel(true);
      }
    }
  }

  private void refresh(Authentication controller, String id, long fence) {
    ObjectNode request = sessions.runnerContext(controller, id, fence);
    ObjectNode identity =
        new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(jdbc(), contracts)
            .identity(request);
    int generation =
        sessions.translationTransaction(
            controller, id, fence, current -> current.progress().path("generation").asInt());
    identity.put("expectedGeneration", generation);
    dispatch.observe(controller, id, fence, "refresh-" + generation, identity);
  }

  /**
   * The safe view of a session that ended FAILED because the runner definitely refused a bootstrap
   * context delivery (outcome REFUSED, recorded by {@link #refuseBootstrapDelivery}), else null.
   */
  private JsonNode prefixWaiting(
      Authentication controller, String id, long fence, JsonNode command) {
    com.citi.put.checks.studio.guided.session.GuidedInternalSecurity.requireRole(
        controller, "backend-controller");
    return repository.transaction(
        () -> {
          var current = repository.lock(id);
          if (!current.document().path("state").asText().equals("AWAITING_CLARIFICATION")
              || !repository.incremental().pending(id)) {
            return null;
          }
          // Waiting blocks inference but does not turn a stale controller/source/lease into valid
          // continuation authority. Reuse the same current checks and immutable command pins.
          return sessions.translationTransaction(
              controller,
              id,
              fence,
              locked -> {
                checkCommand(locked, command);
                return safe(locked.document());
              });
        });
  }

  private JsonNode refusedBootstrapSession(Authentication controller, String id) {
    com.citi.put.checks.studio.guided.session.GuidedInternalSecurity.requireRole(
        controller, "backend-controller");
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          if (!session.document().path("state").asText().equals("FAILED")) {
            return null;
          }
          for (JsonNode delivery :
              session.progress().path("translationBootstrap").path("deliveries")) {
            if (delivery.path("outcome").asText().equals("REFUSED")) {
              return safe(session.document());
            }
          }
          return null;
        });
  }

  private ObjectNode safe(JsonNode session) {
    ObjectNode result = contracts.object();
    for (String field :
        List.of("sessionId", "state", "schemaVersion", "testId", "expiresAt", "counters")) {
      result.set(field, session.path(field));
    }
    return result;
  }
}
