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
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;

/** The production model-to-ledger join. All network work occurs outside database transactions. */
public final class GuidedTranslationService {
  private final GuidedSessionService sessions;

  /** One pool of STEP_CODE requests per step: rejections, retries and prepare refusals share it. */
  static final int STEP_CODE_POOL = 3;

  /**
   * Extra requests one pool may spend on definite-transient no-answer failures (a pre-response
   * stall, a refused or reset connection, HTTP 429/503). They are drawn from here, not from the
   * pool, so a repair keeps its tries; once spent, the next such failure ends the call as before.
   */
  static final int TRANSIENT_ALLOWANCE = 2;

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
                return store.reserveObligation(
                    current.document(), meaning.path("obligationId").asText(), proposal);
              });
    } catch (GuidedSessionException failure) {
      stopRejected(controller, id, fence, failure);
      return repository.transaction(() -> safe(repository.lock(id).document()));
    }
    sessions.storePreparation(controller, id, fence, proposal, response.path("preparation"));
    JsonNode admitted =
        sessions.admit(
            controller,
            id,
            fence,
            association.path("admissionKey").asText(),
            proposal,
            response.path("preparation").path("preparationId").asText());
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
    // Recover every durable in-flight association before requesting a new step.
    JsonNode recovered = recover(controller, id, fence);
    if (recovered != null) {
      return recovered;
    }
    // A session OBSERVING after a successful action is first asked whether that step is fulfilled:
    // completing it needs only the action receipts, never the page. A last step then goes straight
    // to FINALIZING without the observation nothing would read, and a step completed here sets
    // continuation REFRESH, so the next advance observes the page the next step needs.
    boolean observing = status.equals("OBSERVING");
    boolean fulfilled = observing && stepFulfilled(controller, id, fence);
    if (!fulfilled) {
      if (state.path("translation").path("continuation").asText().equals("REFRESH") || observing) {
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
      fulfilled = !observing && stepFulfilled(controller, id, fence);
    }
    if (fulfilled) {
      return sessions.translationTransaction(
          controller, id, fence, current -> completeCurrent(controller, id, fence, current));
    }
    requireWorkableObservation(controller, id, fence);
    StepAttempt attempt = new StepAttempt();
    JsonNode result =
        call(
            controller,
            id,
            fence,
            key,
            GuidedModelRequest.Kind.STEP_CODE,
            (current, response, attemptIdentity, capture) ->
                applyStepCode(
                    controller, id, fence, current, response, attemptIdentity, capture, attempt),
            attempt);
    if (result.has("admissionKey")) {
      return admitStep(controller, id, fence, attempt, result);
    }
    return result;
  }

  /** True when the current step's action succeeded once and carries its reserved proposal. */
  private boolean stepFulfilled(Authentication controller, String id, long fence) {
    return sessions.translationTransaction(
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
                      action -> action.path("coordinate").path("stepId").asText().equals(stepId))
                  .toList();
          return store.stepFulfilled(id, stepId, actions);
        });
  }

  /**
   * One STEP_CODE reply is applied: a clarification becomes a question (or ends the run when the
   * model has nothing to choose from); code becomes the step's proposal. Nothing is reserved here:
   * the runner has not yet admitted the code, and a reservation can never be replaced.
   */
  private JsonNode applyStepCode(
      Authentication controller,
      String id,
      long fence,
      GuidedSessionRepository.Session current,
      JsonNode response,
      JsonNode attemptIdentity,
      GuidedRefusalDiagnostics.Capture capture,
      StepAttempt attempt) {
    ObjectNode plan = (ObjectNode) store.state(id).path("plan");
    String stepId =
        current
            .document()
            .path("sourceSteps")
            .get(current.progress().path("stepIndex").asInt())
            .path("stepId")
            .asText();
    List<JsonNode> obligations = new ArrayList<>();
    for (JsonNode obligation : plan.path("obligations")) {
      if (obligation.path("stepId").asText().equals(stepId)) {
        obligations.add(obligation);
      }
    }
    if (response.path("status").asText().equals("CLARIFICATION")) {
      JsonNode choices = response.path("question").path("choices");
      if (choices.isEmpty()
          && response.path("question").path("reason").asText().equals("INSUFFICIENT_EVIDENCE")) {
        // The model found nothing to choose from: the target is absent. Same end as a refusal.
        if (!sessions.annotateLoginFailure(controller, id, fence)) {
          sessions.failTranslation(controller, id, fence, "MISSING_SOURCE");
        }
        return safe(repository.lock(id).document());
      }
      GuidedRefusalDiagnostics.requireCaptured(
          choices.size() >= 2,
          "INVALID_CONTRACT",
          422,
          capture,
          GuidedRefusalDiagnostics.Gate.STEP_CHOICES);
      attempt.hint = "a clarification needs at least 2 choices";
      return question(
          controller, current, response.path("question"), "observed", attemptIdentity, capture);
    }
    validator.sourceSelections(current.document(), plan, sourceSelections(current));
    ObjectNode context =
        GuidedRefusalDiagnostics.call(
            capture,
            GuidedRefusalDiagnostics.Gate.STEP_CONTRACT,
            () -> sessions.runnerContext(controller, id, fence));
    attempt.hint =
        "expected captures " + GuidedProposalValidator.producedBindings(plan, obligations);
    ObjectNode proposal =
        validator.stepProposal(
            current.document(),
            current.progress(),
            plan,
            obligations,
            response,
            context,
            attemptIdentity,
            store.state(id).path("planRevision").asLong(),
            capture);
    attempt.code = proposal.path("operation").path("code").asText();
    attempt.proposal = proposal;
    return contracts.object().put("admissionKey", "pending").set("proposal", proposal);
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
                  GuidedModelRequest.Kind.STEP_CODE,
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
                  store.state(id).path("manifest").path("sourceSteps"),
                  store.state(id).path("plan"));
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
    var sections = result.putArray("stepSections");
    java.util.Set<String> sectioned = new java.util.HashSet<>();
    for (JsonNode picked : selected.path("stepSections")) {
      sectioned.add(picked.path("stepId").asText());
      sections.add(picked.deepCopy());
    }
    for (JsonNode picked : previous.path("stepSections")) {
      if (sectioned.add(picked.path("stepId").asText())) {
        sections.add(picked.deepCopy());
      }
    }
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

  /** What one STEP_CODE pool carries between its attempts and out to the caller. */
  private static final class StepAttempt {
    /** A short, closed hint for the next repair (the expected capture ids, a count). */
    String hint = "";

    String code;
    JsonNode proposal;
    JsonNode proof;
  }

  private JsonNode call(
      Authentication controller,
      String id,
      long fence,
      String key,
      GuidedModelRequest.Kind kind,
      ModelApplication apply) {
    return call(controller, id, fence, key, kind, apply, null);
  }

  /**
   * One model request pool. SOURCE_PLAN: three attempts, a rejected reply is re-asked with its
   * closed code. STEP_CODE ({@code step} non-null): one pool of {@link #STEP_CODE_POOL} requests
   * per step, shared by validator rejections and runner prepare refusals; the repair carries the
   * closed code, stage, position and a short hint, never page data. Definite-transient no-answer
   * failures are retried from {@link #TRANSIENT_ALLOWANCE} instead: the retry is a new charged
   * request (its own id, the same ordinal and the same repair input) that spends no pool try.
   */
  private JsonNode call(
      Authentication controller,
      String id,
      long fence,
      String key,
      GuidedModelRequest.Kind kind,
      ModelApplication apply,
      StepAttempt step) {
    List<String> repairs = new ArrayList<>();
    JsonNode stepRepair = null;
    int pool = 3;
    if (step != null) {
      int spent =
          sessions.translationTransaction(
              controller,
              id,
              fence,
              current -> store.stepCodeRequests(id, current.progress().path("stepIndex").asInt()));
      if (spent >= STEP_CODE_POOL) {
        sessions.failTranslation(controller, id, fence, "INVALID_CONTRACT", "STEP_SYNTAX");
        throw new GuidedSessionException("INVALID_CONTRACT", 422);
      }
      pool = STEP_CODE_POOL - spent;
    }
    int transientUsed = 0;
    for (int index = 1; index <= pool; index++) {
      final int attemptNumber = index;
      // An ordinal is 1..3 and (request, ordinal) is unique, so a transient retry of the same
      // ordinal carries a derived request id.
      final String sendKey = transientUsed == 0 ? key : key + "-transient-" + transientUsed;
      final JsonNode repairNow = stepRepair;
      String translator = UUID.randomUUID().toString();
      GuidedPromptAssembler.PreparedProjection prepared = null;
      if (preparationCapability != null && kind == GuidedModelRequest.Kind.SOURCE_PLAN) {
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
                  sendKey,
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
                  JsonNode abandoned = store.state(id).path("activeAttempt");
                  String effectiveKey = sendKey;
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
                    effectiveKey = sendKey + "-recovery-" + UUID.randomUUID();
                    nestedSettlement = true;
                  }
                  // Nested settlement updates a different detached wrapper; never borrow it.
                  var freshInputOwner =
                      nestedSettlement && preparationCapability != null
                          ? repository.lock(id)
                          : current;
                  GuidedModelRequest request =
                      request(
                          freshInputOwner,
                          effectiveKey,
                          attemptNumber,
                          kind,
                          repairs,
                          candidate,
                          repairNow);
                  ObjectNode projectionDocument;
                  Integer preparedBytes = candidate == null ? null : candidate.bytesFor(request);
                  int bytes;
                  if (preparedBytes != null) {
                    projectionDocument = request.projection().document();
                    bytes = preparedBytes;
                  } else {
                    projectionDocument = request.projection().document();
                    bytes = prompts.wireBytes(request);
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
        // A replay of an applied attempt cannot rebuild its proposal: the page has moved on. The
        // coordinator re-drives with a new key; recover() resumes whatever was reserved.
        throw new GuidedSessionException("IDEMPOTENCY_CONFLICT", 409);
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
      // ADR-SC-007 D5: one recorder per apply, created outside the apply transaction so what it
      // kept survives a rollback. It chains the opt-in private-diagnostics capture when there is
      // one.
      final GuidedGateRecorder recorder =
          new GuidedGateRecorder(diagnostic.enabled() ? diagnostic : null);
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
                    // The model's closed refusal of the plan: a missing value is MISSING_SOURCE,
                    // anything else is a request Studio cannot plan yet.
                    sessions.failTranslation(
                        controller,
                        id,
                        fence,
                        received.proposal().path("reasonCode").asText().equals("MISSING_SOURCE")
                            ? "MISSING_SOURCE"
                            : "UNSUPPORTED_SURFACE");
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
                          kind == GuidedModelRequest.Kind.STEP_CODE
                              ? recorder
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
          if (step == null || !applied.has("admissionKey")) {
            return applied;
          }
          // The runner's prepare is the syntax admission. It runs outside every transaction and
          // shares this pool: a refusal it can repair is the next attempt's repair input.
          JsonNode refusal = prepareStep(controller, id, fence, applied, step);
          if (refusal == null) {
            return applied;
          }
          stepRepair = refusal;
          if (index == pool) {
            sessions.failTranslation(
                controller, id, fence, "INVALID_CONTRACT", refusal.path("gate").asText());
            throw new GuidedSessionException("INVALID_CONTRACT", 422);
          }
          if (refusal.path("stage").asText().equals("PRE_FENCE")
              && !onBlankDocument(controller, id, fence)) {
            // The prepare ran the step's code, so the page and its certificates are stale. A
            // session still on its initial blank document has no page to observe.
            refresh(controller, id, fence);
          }
          stepRepair = ((ObjectNode) refusal).without(List.of("gate"));
          continue;
        }
      } catch (GuidedSessionException failure) {
        GuidedRejectionDiagnostics.log(kind, index, received.proposal(), failure);
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
                        GuidedTranslationStore.applyRejectionReason(failure.getMessage()),
                        recorder.firstGate() != null
                                && recorder.firstGate().name().startsWith("STEP_")
                            ? recorder.firstGate().name()
                            : null);
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
            && kind == GuidedModelRequest.Kind.STEP_CODE
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
            && index < pool
            && List.of("INVALID_CONTRACT", "BINDING_ORDER").contains(failure.getMessage())) {
          if (step != null) {
            stepRepair =
                repairObject(
                    failure.getMessage(),
                    "SYNTAX",
                    null,
                    null,
                    gateFacts(recorder.firstGate(), step.hint),
                    received.proposal().path("code"));
          } else {
            repairs.add(failure.getMessage());
          }
          continue;
        }
        stopRejected(controller, id, fence, failure, recorder.firstGate());
        throw failure;
      }
      // Round 053 (b), extended by round 067: a definite-transient provider failure (refused/reset,
      // HTTP 429/503, or a pre-response stall at the per-send cap) may be followed by a new
      // persisted, charged attempt, drawn from TRANSIENT_ALLOWANCE and not from the pool. The
      // REJECTED row above is committed and no transaction is open here; the next iteration
      // re-runs every guard (lock, fence, deadline, source revision, budget fit, reservation).
      if (received.reason().definiteTransient()
          && transientUsed < TRANSIENT_ALLOWANCE
          && backoffBeforeAttempt(transientUsed + 2)) {
        transientUsed++;
        index--; // the same ordinal again: no pool try is spent
        continue;
      }
      if (received.code() != GuidedModelResponse.Code.INVALID_RESPONSE || index == pool) {
        String code = received.reason().failureCode();
        sessions.failTranslation(controller, id, fence, code);
        throw modelFailure(code);
      }
      if (step != null) {
        stepRepair =
            repairObject(
                "INVALID_CONTRACT",
                "SYNTAX",
                null,
                null,
                "the reply did not match the schema",
                null);
      } else {
        repairs.add("INVALID_RESPONSE");
      }
    }
    throw new GuidedSessionException("BUDGET_EXCEEDED", 429);
  }

  /**
   * The runner prepare of the proposal that was just applied, run outside every transaction.
   * Returns null when the runner accepted the code (the preparation proof is kept on {@code step});
   * returns the repair input (plus the closed {@code gate}) for a refusal the model can repair; any
   * other failure propagates.
   */
  private JsonNode prepareStep(
      Authentication controller, String id, long fence, JsonNode applied, StepAttempt step) {
    try {
      step.proof = dispatch.prepareStep(controller, id, fence, applied.path("proposal"));
      return null;
    } catch (GuidedSessionException refusal) {
      if (!repairable(refusal)) {
        throw refusal;
      }
      boolean pre = refusal.messageCode().equals("STEP_PRE_FENCE");
      String facts =
          pre
              ? "the code failed before its first action; its target matched "
                  + (refusal.matchCount() == null ? "an unknown number of" : refusal.matchCount())
                  + " elements"
              : "the code does not parse";
      ObjectNode repair =
          repairObject(
              pre ? "TARGET_DRIFT" : "STEP_SYNTAX",
              pre ? "PRE_FENCE" : "SYNTAX",
              refusal.line(),
              refusal.column(),
              facts,
              applied.path("proposal").path("operation").path("code"));
      repair.put("gate", refusal.messageCode());
      return repair;
    }
  }

  private ObjectNode repairObject(
      String closedCode,
      String stage,
      Integer line,
      Integer column,
      String facts,
      JsonNode previousCode) {
    ObjectNode repair = contracts.object().put("closedCode", closedCode).put("stage", stage);
    if (line == null) {
      repair.putNull("line");
    } else {
      repair.put("line", line);
    }
    if (column == null) {
      repair.putNull("column");
    } else {
      repair.put("column", column);
    }
    String bounded = facts == null ? "" : facts;
    repair.put("facts", bounded.length() <= 256 ? bounded : bounded.substring(0, 256));
    String code = previousCode != null && previousCode.isTextual() ? previousCode.asText() : "";
    repair.put("previousCode", code.length() <= 16384 ? code : "");
    return repair;
  }

  private static String gateFacts(GuidedRefusalDiagnostics.Gate gate, String hint) {
    String text = (gate == null ? "REJECTED" : gate.name()) + (hint.isEmpty() ? "" : ": " + hint);
    return text.length() <= 256 ? text : text.substring(0, 256);
  }

  /** MODEL_UNAVAILABLE is a retryable 503, as VAULT_UNAVAILABLE; MODEL_REFUSED a definite 422. */
  private static GuidedSessionException modelFailure(String code) {
    return switch (code) {
      case "MODEL_UNAVAILABLE" -> new GuidedSessionException(code, 503, code, true, null);
      case "MODEL_REFUSED" -> new GuidedSessionException(code, 422);
      default -> new GuidedSessionException("INVALID_CONTRACT", 422);
    };
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

  private void stopRejected(
      Authentication controller, String id, long fence, GuidedSessionException failure) {
    stopRejected(controller, id, fence, failure, null);
  }

  private void stopRejected(
      Authentication controller,
      String id,
      long fence,
      GuidedSessionException failure,
      GuidedRefusalDiagnostics.Gate firstGate) {
    String code = failure.getMessage();
    String terminalCode =
        java.util.Set.of("EVIDENCE_MISMATCH", "POLICY_DENIED", "REFERENCE_MISMATCH").contains(code)
            ? "INVALID_CONTRACT"
            : code;
    if (!List.of(
            "BUDGET_EXCEEDED",
            "UNSUPPORTED_SURFACE",
            "MISSING_SOURCE",
            "INVALID_CONTRACT",
            "RUNTIME_INCOMPATIBLE",
            "REVISION_CONFLICT",
            "BINDING_ORDER")
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
    return request(current, key, attempt, kind, repairs, null, null);
  }

  private GuidedModelRequest request(
      GuidedSessionRepository.Session current,
      String key,
      int attempt,
      GuidedModelRequest.Kind kind,
      List<String> repairs,
      GuidedPromptAssembler.PreparedProjection prepared,
      JsonNode stepRepair) {
    return capturePromptInputsLocked(current, kind)
        .complete(key, attempt, kind, repairs, prepared, stepRepair);
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
        GuidedPromptAssembler.PreparedProjection prepared,
        JsonNode stepRepair) {
      if (kind == GuidedModelRequest.Kind.STEP_CODE) {
        String stepId =
            session
                .path("sourceSteps")
                .get(progress.path("stepIndex").asInt())
                .path("stepId")
                .asText();
        List<String> sections = new ArrayList<>();
        for (JsonNode picked : state.path("plan").path("stepSections")) {
          if (picked.path("stepId").asText().equals(stepId)) {
            picked.path("sections").forEach(section -> sections.add(section.asText()));
          }
        }
        return prompts.assembleStepCode(
            key,
            attempt,
            session,
            progress,
            state,
            safeInputs,
            remaining,
            selections,
            sections,
            stepRepair,
            properties.maxInputBytes(),
            properties.maxOutputTokens());
      }
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

  /**
   * What the model may see of one authored input: its id, step and kind, plus the name the author
   * gave it (the {@code <var NAME>} token, found through the configuration reference the input came
   * from) and, for a secret, its secretId. Never a value. A step with several tokens maps each
   * token to {@code inputs['<inputId>']} through the name; a literal the author typed has no name.
   */
  static ObjectNode projectInput(
      GuidedContracts contracts, JsonNode input, JsonNode configurationReferences) {
    ObjectNode safe = contracts.object();
    for (String field : List.of("inputId", "sourceStepId", "kind")) {
      safe.set(field, input.path(field));
    }
    JsonNode provenance = input.path("provenance");
    if (provenance.path("referenceKind").asText().equals("configuration")) {
      for (JsonNode reference : configurationReferences) {
        if (reference.path("referenceId").equals(provenance.path("referenceId"))
            && reference.path("referenceName").isTextual()) {
          safe.set("name", reference.path("referenceName"));
          break;
        }
      }
    }
    if (input.path("kind").asText().equals("secretRef") && input.path("secretId").isTextual()) {
      safe.set("secretId", input.path("secretId"));
    }
    return safe;
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
        safeInputs.add(
            projectInput(contracts, input, state.path("manifest").path("configurationReferences")));
      }
      progress.set("authoredInputsHash", context.path("authoredInputsHash"));
      progress.set("contextRevision", context.path("contextRevision"));
    }
    var remaining = contracts.object().putArray("items");
    String step =
        current
            .document()
            .path("sourceSteps")
            .get(current.progress().path("stepIndex").asInt())
            .path("stepId")
            .asText();
    for (JsonNode obligation : state.path("plan").path("obligations")) {
      if (obligation.path("stepId").asText().equals(step)) {
        // Only the occurrence-0 anchor carries an accepted choice back to the model.
        remaining.add(
            obligation.path("occurrence").asInt() == 0
                ? effectiveObligation(current, obligation)
                : obligation);
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
    progress.put("translationOrdinal", 0);
    return new PromptInputs(
        current.document(), progress, state, safeInputs, remaining, sourceSelections(current));
  }

  private ObjectNode materialized(GuidedSessionRepository.Session current) {
    // The production access still rechecks source on the surrounding transaction.
    return new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(
            jdbc(), contracts, sessions.allowedDomains())
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

  /**
   * ADR-SC-007 D6: the obligation as the next STEP_CODE request sees it. Where the author has
   * accepted an observed choice for it (the latest accepted answer per obligation), the stored
   * semantic selection is re-established against the current facts by a count: exactly one equal
   * fact makes the obligation carry {@code selectedChoice} {role, name, ref} for the model (the ref
   * is the fresh fact the backend matched); zero or several make it carry {@code reconfirm: true},
   * so only a new question is admissible. The stored triple, evidence included, stays on the
   * internal property {@code selection} that the prompt allow-list does not copy.
   */
  ObjectNode effectiveObligation(GuidedSessionRepository.Session current, JsonNode obligation) {
    ObjectNode effective = ((ObjectNode) obligation).deepCopy();
    for (JsonNode row :
        questions.effectiveObserved(current.document().path("sessionId").asText())) {
      for (JsonNode mapping : row.path("meanings")) {
        if (!mapping.path("choiceId").equals(row.path("acceptedChoiceId"))
            || !mapping
                .path("meaning")
                .path("obligationId")
                .equals(obligation.path("obligationId"))) {
          continue;
        }
        require(
            current
                .progress()
                .path("resolvedClarifications")
                .has(row.path("context").path("clarificationId").asText()),
            "INVALID_CONTRACT",
            422);
        JsonNode selection = mapping.path("selection");
        effective.set("selection", selection.deepCopy());
        List<String> matches =
            GuidedObservationFacts.matchingRefs(
                current.progress().path("observation").path("facts"),
                GuidedObservationFacts.selectionOf(selection));
        if (matches.size() == 1) {
          effective
              .putObject("selectedChoice")
              .put("role", selection.path("role").asText())
              .put(
                  "name",
                  GuidedObservationFacts.bound(
                      selection.path("name").asText(), GuidedObservationFacts.OUTLINE_NAME_CHARS))
              .put("ref", matches.getFirst());
          if (selection.has("ordinal")) {
            effective
                .withObject("/selectedChoice")
                .set("ordinal", selection.path("ordinal").deepCopy());
          }
          if (selection.has("scopeHash")) {
            effective
                .withObject("/selectedChoice")
                .set("scopeHash", selection.path("scopeHash").deepCopy());
          }
        } else {
          effective.put("reconfirm", true);
        }
      }
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
    return question(
        controller,
        current,
        candidate,
        phase,
        attemptIdentity,
        GuidedRefusalDiagnostics.Capture.NONE);
  }

  private JsonNode question(
      Authentication controller,
      GuidedSessionRepository.Session current,
      JsonNode candidate,
      String phase,
      JsonNode attemptIdentity,
      GuidedRefusalDiagnostics.Capture gates) {
    if (phase.equals("observed")) {
      candidate = observedChoices(current, candidate);
    }
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
      ObjectNode selection = null;
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
        // ADR-SC-007 D6: a choice names a ref of the observation the question is asked on, and the
        // element it names must be the only fact with that {role, name, evidence}: two elements
        // that look alike to the backend can never be offered as a choice between them.
        JsonNode facts = current.progress().path("observation").path("facts");
        String ref = meaning.path("ref").asText();
        GuidedRefusalDiagnostics.requireCaptured(
            facts.path(ref).isObject(),
            "INVALID_CONTRACT",
            422,
            gates,
            GuidedRefusalDiagnostics.Gate.STEP_TARGET_REF);
        pageNode = facts.path(ref);
        selection = contracts.object();
        selection.put("role", pageNode.path("role").asText());
        selection.put("name", pageNode.path("name").asText(""));
        selection.put("evidence", pageNode.path("evidence").asText(""));
        if (pageNode.has("ordinal")) {
          selection.set("ordinal", pageNode.path("ordinal").deepCopy());
        }
        String scopeHash = GuidedObservationFacts.scopeHash(facts, pageNode);
        if (scopeHash != null) {
          selection.put("scopeHash", scopeHash);
        }
        GuidedRefusalDiagnostics.requireCaptured(
            GuidedObservationFacts.matchingRefs(
                    facts, GuidedObservationFacts.selectionOf(facts, pageNode))
                .equals(List.of(ref)),
            "INVALID_CONTRACT",
            422,
            gates,
            GuidedRefusalDiagnostics.Gate.STEP_SELECTED_CHOICE);
        JsonNode disputed =
            validator.remaining(
                store.state(current.document().path("sessionId").asText()).path("plan"),
                meaning.path("obligationId").asText());
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
        label = pageNode.path("name").asText(pageNode.path("role").asText());
        if (label.isBlank()) {
          label = "Field " + (++index);
        }
        if (pageNode.has("ordinal")) {
          int indistinguishable = 0;
          JsonNode region = observedRegionName(facts, pageNode);
          for (JsonNode offered : candidate.path("choices")) {
            JsonNode other = facts.path(offered.path("meaning").path("ref").asText());
            if (other.path("name").equals(pageNode.path("name"))
                && observedRegionName(facts, other).equals(region)) {
              indistinguishable++;
            }
          }
          if (indistinguishable > 1) {
            String suffix =
                " ("
                    + pageNode.path("ordinal").path("index").asInt()
                    + " of "
                    + pageNode.path("ordinal").path("count").asInt()
                    + ")";
            label =
                GuidedObservationFacts.bound(label, 256 - suffix.codePointCount(0, suffix.length()))
                    + suffix;
          }
        }
        // Every observed-phase choice names a page element: PAGE, with that element's role and
        // group, taken from the sanitized facts the worker reported (never raw DOM).
        labelSource = "PAGE";
      }
      ObjectNode emitted =
          choices
              .addObject()
              .put("choiceId", choiceId)
              .put("safeLabel", label)
              .put("labelSource", labelSource);
      if (pageNode != null) {
        emitted.put("role", pageNode.path("role").asText());
        // The group the element sits in, as the runner printed it: untrusted PAGE presentation,
        // never authority.
        JsonNode region =
            observedRegionName(current.progress().path("observation").path("facts"), pageNode);
        emitted.set("region", region);
      }
      emitted.set(
          "bindingId",
          phase.equals("source")
              ? com.fasterxml.jackson.databind.node.NullNode.instance
              : meaning.path("bindingId"));
      ObjectNode mapping = meanings.addObject().put("choiceId", choiceId);
      mapping.set("meaning", choice.path("meaning"));
      if (selection != null) {
        mapping.set("selection", selection);
      }
    }
    contracts.validate("v3/clarification", question);
    return sessions.translationQuestion(
        controller,
        current.document().path("sessionId").asText(),
        current.document().path("owner").path("fence").asLong(),
        question.path("clarificationId").asText(),
        question,
        meanings);
  }

  /**
   * The model names only refs and labels. The step's occurrence-0 obligation (and, when it produces
   * a value, that value's binding) is the meaning every choice carries: an accepted choice comes
   * back as the selectedChoice of that obligation.
   */
  private ObjectNode observedChoices(GuidedSessionRepository.Session current, JsonNode candidate) {
    String id = current.document().path("sessionId").asText();
    JsonNode plan = store.state(id).path("plan");
    String stepId =
        current
            .document()
            .path("sourceSteps")
            .get(current.progress().path("stepIndex").asInt())
            .path("stepId")
            .asText();
    JsonNode anchor = GuidedProposalValidator.anchor(plan, stepId);
    require(anchor != null, "BINDING_ORDER", 422);
    List<String> produced = GuidedProposalValidator.producedBindings(plan, List.of(anchor));
    ObjectNode converted = contracts.object().put("reason", candidate.path("reason").asText());
    var choices = converted.putArray("choices");
    for (JsonNode choice : candidate.path("choices")) {
      ObjectNode meaning =
          contracts
              .object()
              .put("obligationId", anchor.path("obligationId").asText())
              .put("ref", choice.path("ref").asText());
      if (produced.isEmpty()) {
        meaning.putNull("bindingId");
      } else {
        meaning.put("bindingId", produced.getFirst());
      }
      choices
          .addObject()
          .put("safeLabel", choice.path("safeLabel").asText())
          .set("meaning", meaning);
    }
    return converted;
  }

  /**
   * The text of the evidence segment of field {@code group} of a fact, else JSON null: the label of
   * the region the runner printed the element in. Presentation only.
   */
  static JsonNode observedRegionName(JsonNode facts, JsonNode fact) {
    for (JsonNode ref : fact.path("scopeRefs")) {
      JsonNode source = facts.path(ref.asText());
      String label = source.path("name").asText("");
      if (source.path("nameComplete").asBoolean(false)
          && !label.isBlank()
          && label.codePointCount(0, label.length()) <= 80) {
        return source.path("name");
      }
    }
    return observedRegionName(fact);
  }

  static JsonNode observedRegionName(JsonNode fact) {
    String evidence = fact == null ? "" : fact.path("evidence").asText("");
    if (fact != null) {
      for (JsonNode segment : fact.path("evidenceSegments")) {
        if (segment.path("field").asText().equals("group")) {
          int start = Math.max(0, Math.min(segment.path("start").asInt(), evidence.length()));
          int end = Math.max(start, Math.min(segment.path("end").asInt(), evidence.length()));
          String text = evidence.substring(start, end);
          return text.isBlank()
              ? com.fasterxml.jackson.databind.node.NullNode.instance
              : com.fasterxml.jackson.databind.node.TextNode.valueOf(text);
        }
      }
    }
    return com.fasterxml.jackson.databind.node.NullNode.instance;
  }

  /**
   * Resumes every durable in-flight association: an ADMITTED action is dispatched; a reservation
   * committed but not admitted (a crash between reserve and admit) is prepared and admitted again
   * from its stored proposal. A prepare refusal of that stored proposal ends the run: it was
   * reserved because the runner had already accepted it.
   */
  private JsonNode recover(Authentication controller, String id, long fence) {
    List<ObjectNode> associations =
        sessions.translationTransaction(controller, id, fence, current -> store.obligations(id));
    List<ObjectNode> actions = sessions.translationActions(controller, id, fence);
    for (ObjectNode association : associations) {
      if (association.path("admissionId").isNull()
          || association.path("admissionId").asText().isBlank()) {
        JsonNode resumed = resumeUnadmitted(controller, id, fence, association);
        if (resumed != null) {
          return resumed;
        }
        continue;
      }
      for (JsonNode action : actions) {
        if (!action.path("admission").path("admissionId").equals(association.path("admissionId"))) {
          continue;
        }
        if (action.path("state").asText().equals("ADMITTED")) {
          return dispatchAdmitted(controller, id, fence, association, action);
        }
        require(action.path("state").asText().equals("SUCCEEDED"), "UNKNOWN_OUTCOME", 409);
      }
    }
    return null;
  }

  private JsonNode resumeUnadmitted(
      Authentication controller, String id, long fence, ObjectNode association) {
    JsonNode proposal = association.path("proposal");
    boolean onThisStep =
        sessions.translationTransaction(
            controller,
            id,
            fence,
            session ->
                proposal
                    .path("coordinate")
                    .path("stepId")
                    .asText()
                    .equals(
                        session
                            .document()
                            .path("sourceSteps")
                            .get(session.progress().path("stepIndex").asInt())
                            .path("stepId")
                            .asText()));
    if (!onThisStep) {
      return null;
    }
    JsonNode admission;
    try {
      admission =
          dispatch.prepareAndAdmit(
              controller, id, fence, association.path("admissionKey").asText(), proposal);
    } catch (GuidedSessionException refusal) {
      if (repairable(refusal)) {
        try {
          sessions.failTranslation(
              controller, id, fence, "INVALID_CONTRACT", refusal.messageCode());
        } catch (GuidedSessionException noCurrentAuthority) {
          // Never revive expired or replaced authority.
        }
      }
      throw refusal;
    }
    return dispatchAdmitted(controller, id, fence, association, admission);
  }

  /** A prepare refusal the model can repair: the code did not construct, or missed its target. */
  private static boolean repairable(GuidedSessionException refusal) {
    return refusal.getMessage().equals("INVALID_CONTRACT")
        && java.util.Set.of("STEP_SYNTAX", "STEP_PRE_FENCE").contains(refusal.messageCode());
  }

  /** Reserves the prepared proposal on the step's anchor obligation, admits it and dispatches. */
  private JsonNode admitStep(
      Authentication controller, String id, long fence, StepAttempt attempt, JsonNode result) {
    JsonNode proposal = result.path("proposal");
    ObjectNode association;
    try {
      association =
          sessions.translationTransaction(
              controller,
              id,
              fence,
              current ->
                  store.reserveObligation(
                      current.document(),
                      GuidedProposalValidator.anchor(
                              store.state(id).path("plan"),
                              proposal.path("coordinate").path("stepId").asText())
                          .path("obligationId")
                          .asText(),
                      proposal));
    } catch (GuidedSessionException failure) {
      stopRejected(controller, id, fence, failure);
      return repository.transaction(() -> safe(repository.lock(id).document()));
    }
    JsonNode admission =
        dispatch.admitPrepared(
            controller,
            id,
            fence,
            association.path("admissionKey").asText(),
            proposal,
            attempt.proof);
    return dispatchAdmitted(controller, id, fence, association, admission);
  }

  private JsonNode dispatchAdmitted(
      Authentication controller, String id, long fence, JsonNode association, JsonNode admission) {
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

  /**
   * The page the runner reported must be one Studio can work with before any model call: an
   * observation with no element the model could name while the runner reported regions it cannot
   * represent is a surface Studio cannot work with.
   */
  private void requireWorkableObservation(Authentication controller, String id, long fence) {
    try {
      sessions.translationTransaction(
          controller,
          id,
          fence,
          current -> {
            checkPins(id);
            require(bootstrapReady(current), "RUNTIME_INCOMPATIBLE", 409);
            JsonNode observation = current.progress().path("observation");
            JsonNode facts = observation.path("facts");
            if (blankDocument(current.progress())) {
              // Turn 0: the page is still the initial blank document, which has no valid
              // observation (a blank page has no http(s) origin). The model gets observation null
              // and writes the first step, typically the navigation.
              return null;
            }
            require(
                observation.isObject()
                    && observation.path("outline").isTextual()
                    && facts.isObject()
                    && !(facts.isEmpty()
                        && observation.path("coverage").path("unsupportedRegions").asInt() > 0),
                "UNSUPPORTED_SURFACE",
                422);
            return null;
          });
    } catch (GuidedSessionException failure) {
      if (List.of(
              "RUNTIME_INCOMPATIBLE",
              "STALE_GENERATION",
              "REVISION_CONFLICT",
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

  /** No observation yet and the execution evidence is still the initial blank document. */
  private static boolean blankDocument(JsonNode progress) {
    return !progress.path("observation").isObject()
        && progress.path("executionEvidence").path("kind").asText().equals("initialBlank");
  }

  private boolean onBlankDocument(Authentication controller, String id, long fence) {
    return sessions.translationTransaction(
        controller, id, fence, current -> blankDocument(current.progress()));
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

  /**
   * ADR-SC-007 D1/D10/D20: what the runner projects the outline on. While the incremental prefix is
   * replayed it is the step and the target intent of the obligation the next prefix action
   * implements; otherwise the current learning step and the intents of its obligations that have no
   * successful action yet.
   */
  private ObjectNode focusFor(GuidedSessionRepository.Session current, JsonNode state) {
    String id = current.document().path("sessionId").asText();
    JsonNode plan = state.path("plan");
    List<JsonNode> chosen = new java.util.ArrayList<>();
    String stepId = null;
    if (current.document().path("state").asText().equals("REPLAYING_PREFIX")
        && repository.incremental().pending(id)) {
      JsonNode next = repository.incremental().nextAction(id);
      if (next != null) {
        stepId = next.path("coordinate").path("stepId").asText();
        for (JsonNode obligation : plan.path("obligations")) {
          if (obligation.path("stepId").asText().equals(stepId)
              && obligation.path("occurrence").equals(next.path("coordinate").path("ordinal"))) {
            chosen.add(obligation);
          }
        }
      }
    }
    if (stepId == null) {
      stepId =
          current
              .document()
              .path("sourceSteps")
              .path(current.progress().path("stepIndex").asInt())
              .path("stepId")
              .asText();
      List<ObjectNode> actions = repository.actions(id);
      for (JsonNode obligation : plan.path("obligations")) {
        if (!obligation.path("stepId").asText().equals(stepId)) {
          continue;
        }
        boolean done =
            actions.stream()
                .anyMatch(
                    a ->
                        a.path("state").asText().equals("SUCCEEDED")
                            && a.path("coordinate")
                                .path("stepId")
                                .asText()
                                .equals(obligation.path("stepId").asText())
                            && a.path("coordinate")
                                .path("ordinal")
                                .equals(obligation.path("occurrence")));
        if (!done) {
          chosen.add(obligation);
        }
      }
    }
    String text = "";
    for (JsonNode step : state.path("manifest").path("sourceSteps")) {
      if (step.path("stepId").asText().equals(stepId)) {
        text = step.path("text").asText("");
      }
    }
    return GuidedObservationFocus.focus(text, GuidedObservationFocus.intentsOf(chosen));
  }

  private void refresh(Authentication controller, String id, long fence) {
    ObjectNode request = sessions.runnerContext(controller, id, fence);
    ObjectNode identity =
        new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(
                jdbc(), contracts, sessions.allowedDomains())
            .identity(request);
    ObjectNode pending =
        sessions.translationTransaction(
            controller,
            id,
            fence,
            current ->
                contracts
                    .object()
                    .put("generation", current.progress().path("generation").asInt())
                    .<ObjectNode>set("focus", focusFor(current, store.state(id))));
    int generation = pending.path("generation").asInt();
    identity.put("expectedGeneration", generation);
    identity.set("focus", pending.path("focus"));
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
