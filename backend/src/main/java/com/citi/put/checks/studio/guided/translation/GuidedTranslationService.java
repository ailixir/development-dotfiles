package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
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
  }

  public JsonNode plan(
      Authentication controller, String id, long fence, String key, JsonNode command) {
    require(
        !org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    contracts.validate("v2/guided-planning-commands", command);
    require(id.equals(command.path("sessionId").asText()), "INVALID_CONTRACT", 422);
    if (fence == 0) {
      JsonNode owned =
          dispatch.assign(controller, id, "translation-assignment", properties.workerId());
      fence = owned.path("ownerFence").asLong();
    }
    final long owner = fence;
    reconcile(controller, id, owner);
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
              (current, response, attemptIdentity) -> {
                if (response.has("question")) {
                  return question(controller, current, response.path("question"), "source");
                }
                ObjectNode admitted = validator.admitPlan(current.document(), response);
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
      dependencies.allocate(controller, state.path("document"), plan);
      sessions.translationTransaction(
          controller,
          id,
          fence,
          current -> {
            checkPins(id);
            checkBootstrapIdentity(current);
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
    JsonNode acknowledgement = dispatch.pushContext(controller, id, fence);
    require(
        finishBootstrap(controller, id, fence, delivery, acknowledgement), "STALE_GENERATION", 409);
    return sessions.translationTransaction(
        controller, id, fence, current -> safe(current.document()));
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
          store.continuation(id, "NEXT");
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
    contracts.validate("v2/guided-planning-commands", command);
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
                  repository.actions(id).stream()
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
            (current, response, attemptIdentity) -> {
              if (response.path("status").asText().equals("CLARIFICATION")) {
                return question(
                    controller, current, response.path("question"), "observed", attemptIdentity);
              }
              if (response.path("status").asText().equals("COMPLETE")) {
                return contracts.object().put("complete", true);
              }
              ObjectNode plan = (ObjectNode) store.state(id).path("plan");
              validator.sourceSelections(current.document(), plan, sourceSelections(current));
              String obligationId = response.path("obligationId").asText();
              JsonNode obligation = validator.remaining(plan, obligationId);
              ObjectNode existing = store.obligation(id, obligationId);
              if (existing != null
                  && !existing.path("admissionId").isNull()
                  && !existing.path("admissionId").asText().isBlank()) {
                return existing;
              }
              ObjectNode context = sessions.runnerContext(controller, id, fence);
              JsonNode proposal =
                  validator.materializeAction(
                      current.document(),
                      current.progress(),
                      obligation,
                      response.path("action"),
                      context,
                      attemptIdentity,
                      store.state(id).path("planRevision").asLong());
              validator.action(
                  current.document(),
                  current.progress(),
                  plan,
                  effectiveObligation(current, obligation, proposal),
                  proposal,
                  context);
              return store.reserveObligation(current.document(), obligationId, proposal);
            });
    if (result.path("complete").asBoolean()) {
      return complete(controller, id, fence, key + "-verify");
    }
    if (result.has("admissionKey")) {
      return admitAndDispatch(controller, id, fence, result);
    }
    return result;
  }

  public JsonNode context(Authentication controller, String id, long fence, JsonNode command) {
    require(
        !org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    contracts.validate("v2/guided-planning-commands", command);
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
    contracts.validate("v2/guided-planning-commands", command);
    reconcile(controller, id, fence);
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
        (current, response, attemptIdentity) -> {
          require(!response.has("question"), "INVALID_CONTRACT", 422);
          ObjectNode state = store.state(id);
          ObjectNode refined =
              validator.refinePlan(
                  current.document(), current.progress(), state.path("plan"), response);
          validator.sourceSelections(current.document(), refined, sourceSelections(current));
          dependencies.validate(current.document(), refined);
          dependencies.allocate(controller, current.document(), refined);
          store.acceptPlan(id, state.path("planRevision").asLong(), refined);
          return refined;
        });
    return safe(
        sessions.translationTransaction(
            controller, id, fence, current -> current.document().deepCopy()));
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
        GuidedSessionRepository.Session current, JsonNode response, JsonNode originalAttempt);
  }

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
                  }
                  GuidedModelRequest request =
                      request(current, effectiveKey, attemptNumber, kind, repairs);
                  ObjectNode payload =
                      contracts
                          .object()
                          .put("kind", request.kind().name())
                          .put("requestId", request.requestId())
                          .put("attempt", request.attempt());
                  payload.set("context", request.projection().document());
                  ObjectNode wireBound =
                      contracts
                          .object()
                          .put("contents", payload.toString())
                          .put("systemInstruction", request.outputContract());
                  wireBound.set("responseJsonSchema", request.responseSchema());
                  // Count escaped content plus actual supplied schema; allowance covers SDK field
                  // wrappers.
                  int bytes = wireBound.toString().getBytes(StandardCharsets.UTF_8).length + 2048;
                  if (bytes > properties.maxInputBytes()) {
                    sessions.failTranslation(controller, id, fence, "BUDGET_EXCEEDED");
                    return null;
                  }
                  if (!store.hasAttempt(id, request.requestId(), attemptNumber)
                      && !sessions.modelReservationFitsLocked(
                          current, bytes, request.maxOutputTokens())) {
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
                  Instant hard = Instant.parse(current.document().path("expiresAt").asText());
                  if (deadline.isAfter(hard)) {
                    deadline = hard;
                  }
                  var attempt =
                      store.reserveAttempt(
                          current.document(),
                          request.requestId(),
                          attemptNumber,
                          kind.name(),
                          GuidedContracts.hash(
                              contracts
                                  .object()
                                  .setAll(
                                      java.util.Map.of(
                                          "context",
                                          request.projection().document(),
                                          "schemaPins",
                                          prompts.schemaProvenance()))),
                          revision,
                          bytes,
                          request.maxOutputTokens(),
                          translator,
                          deadline);
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
        stopRejected(controller, id, fence, failure.getMessage());
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
      GuidedModelResponse response;
      try {
        response =
            gateway.propose(reserved.request(), new GuidedCallBudget(reserved.deadline(), clock));
      } catch (RuntimeException failure) {
        response =
            new GuidedModelResponse(GuidedModelResponse.Code.TRANSPORT, null, null, null, null);
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
                        received.outputTokens());
                    return contracts.object().put("rejected", true);
                  }
                  if (received.proposal().path("status").asText().equals("UNSUPPORTED")) {
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
                  JsonNode result = apply.apply(fresh, received.proposal(), authority);
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
                        received.outputTokens());
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
            && index < 3
            && List.of("INVALID_CONTRACT", "BINDING_ORDER").contains(failure.getMessage())) {
          repairs.add(failure.getMessage());
          continue;
        }
        stopRejected(controller, id, fence, failure.getMessage());
        throw failure;
      }
      if (received.code() != GuidedModelResponse.Code.INVALID_RESPONSE || index == 3) {
        sessions.failTranslation(controller, id, fence, "INVALID_CONTRACT");
        throw new GuidedSessionException("INVALID_CONTRACT", 422);
      }
      repairs.add("INVALID_RESPONSE");
    }
    throw new GuidedSessionException("BUDGET_EXCEEDED", 429);
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

  private void stopRejected(Authentication controller, String id, long fence, String code) {
    String terminalCode = code.equals("EVIDENCE_MISMATCH") ? "INVALID_CONTRACT" : code;
    if (!List.of(
            "BUDGET_EXCEEDED",
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
    List<ObjectNode> actions = repository.actions(id);
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
    progress.put("translationOrdinal", ordinal);
    return prompts.assemble(
        key,
        attempt,
        kind,
        current.document(),
        progress,
        state,
        safeInputs,
        remaining,
        sourceSelections(current),
        repairs,
        properties.maxOutputTokens());
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

  private ObjectNode effectiveObligation(
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
            .put("schemaVersion", 2)
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
        label = "Saved input choice " + (++index);
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
      }
      choices
          .addObject()
          .put("choiceId", choiceId)
          .put("safeLabel", label)
          .setAll(
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
    contracts.validate("v2/clarification", question);
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
    contracts.validate("v2/replay-validation#/definitions/QuestionCapture1", capture);
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
            .put("schemaVersion", 2)
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
        (current, verification, attemptIdentity) -> {
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
    String intent = obligation.path("targetIntent").asText();
    JsonNode selected = obligation.path("selectedLocator");
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

  private ObjectNode acquisitionRequest(GuidedSessionRepository.Session current) {
    ObjectNode result =
        new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(jdbc(), contracts)
            .identity(materialized(current));
    result.set("expectedGeneration", current.progress().path("generation"));
    contracts.validate("v2/observation-refresh", result);
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
                boolean available = acquisitionAvailable(current.progress(), obligation);
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
                    acquisitionAvailable(current.progress(), obligation));
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
    require(remaining > 0, "BUDGET_EXCEEDED", 429);
    var task =
        new java.util.concurrent.FutureTask<JsonNode>(
            () -> dispatch.observe(controller, id, fence, claim.key(), claim.request()));
    Thread.ofVirtual().name("guided-passive-observation").start(task);
    try {
      return task.get(
          Math.min(remaining, java.time.Duration.ofSeconds(15).toNanos()),
          java.util.concurrent.TimeUnit.NANOSECONDS);
    } catch (java.util.concurrent.TimeoutException timeout) {
      throw new GuidedSessionException("BUDGET_EXCEEDED", 429);
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
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

  private ObjectNode safe(JsonNode session) {
    ObjectNode result = contracts.object();
    for (String field :
        List.of("sessionId", "state", "schemaVersion", "testId", "expiresAt", "counters")) {
      result.set(field, session.path(field));
    }
    return result;
  }
}
