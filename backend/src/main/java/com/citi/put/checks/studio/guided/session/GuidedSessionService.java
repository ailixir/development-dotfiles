package com.citi.put.checks.studio.guided.session;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.security.core.Authentication;

/**
 * Durable observed-session transitions. No method invokes a browser, gateway or legacy scheduler.
 */
public final class GuidedSessionService {
  private static final Set<String> TERMINAL =
      Set.of(
          "SUCCEEDED", "PUBLICATION_CONFLICT", "FAILED", "UNKNOWN_OUTCOME", "CANCELLED", "EXPIRED");
  private final GuidedSessionRepository repository;
  private final GuidedContracts contracts;
  private final GuidedSessionAccess access;
  private final GuidedSessionProperties properties;
  private final GuidedActionLedger ledger;
  private final Clock clock;
  private com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService materialization;
  private com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore preparations;
  private com.citi.put.checks.studio.guided.bridge.GuidedBindingStore bindings;
  private com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore assignments;
  private java.util.function.BiConsumer<ObjectNode, String> stopSender;
  private PublicationLifecycle publication;

  /** Transactional original-evidence hooks; implementations cannot perform network I/O. */
  public interface PublicationLifecycle {
    void started(JsonNode session, Instant now);

    void prepared(
        GuidedSessionRepository.Session current, JsonNode proposal, JsonNode proof, Instant now);

    void admitted(JsonNode session, JsonNode action, JsonNode proposal, Instant now);

    default void questioned(
        GuidedSessionRepository.Session current, JsonNode capture, Instant now) {}
  }

  public void installPublication(PublicationLifecycle lifecycle) {
    require(publication == null, "RUNTIME_INCOMPATIBLE", 409);
    publication = java.util.Objects.requireNonNull(lifecycle);
  }

  private com.citi.put.checks.studio.guided.translation.GuidedTranslationStore translation;
  private com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore questions;

  public void installTranslation(
      com.citi.put.checks.studio.guided.translation.GuidedTranslationStore store,
      com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore contexts) {
    require(translation == null, "RUNTIME_INCOMPATIBLE", 409);
    translation = store;
    questions = contexts;
  }

  /** Fresh authorization/identity checks even when another command has a cached response. */
  public <T> T translationTransaction(
      Authentication controller,
      String id,
      long fence,
      java.util.function.Function<GuidedSessionRepository.Session, T> operation) {
    GuidedInternalSecurity.requireRole(controller, "backend-controller");
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          owner(controller, "backend-controller", session, fence);
          active(session);
          access.checkSourceCurrent(session.document());
          require(
              v2(session.document()) && translation != null && translation.exists(id),
              "RUNTIME_INCOMPATIBLE",
              409);
          return operation.apply(session);
        });
  }

  /** Accounting only: terminal/expired authority may be charged but never revived. */
  public boolean reconcileLateModelUsage(Authentication controller, String id, long fence) {
    GuidedInternalSecurity.requireRole(controller, "backend-controller");
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          require(
              session.document().path("owner").path("fence").asLong() == fence, "STALE_FENCE", 409);
          require(
              v2(session.document()) && translation != null && translation.exists(id),
              "RUNTIME_INCOMPATIBLE",
              409);
          return reconcileLateModelUsageLocked(session);
        });
  }

  /** Caller owns the session lock. A refusal must be returned and committed, not thrown. */
  public boolean reconcileLateModelUsageLocked(GuidedSessionRepository.Session session) {
    require(
        org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    String id = session.document().path("sessionId").asText();
    ObjectNode receipts = session.progress().withObject("/reconciledLateUsage");
    ObjectNode counters = (ObjectNode) session.document().path("counters");
    boolean changed = false;
    for (JsonNode usage : translation.lateUsageAdjustments(id)) {
      String attempt = usage.path("attemptId").asText();
      if (receipts.has(attempt)) {
        continue;
      }
      // The immutable attempt table and existing reservation ceiling bound this receipt set.
      counters.put(
          "modelInputTokens",
          Math.min(
              Integer.MAX_VALUE,
              counters.path("modelInputTokens").asLong() + usage.path("inputExtra").asLong()));
      counters.put(
          "modelOutputTokens",
          Math.min(
              Integer.MAX_VALUE,
              counters.path("modelOutputTokens").asLong() + usage.path("outputExtra").asLong()));
      receipts.put(attempt, true);
      changed = true;
    }
    boolean over =
        counters.path("modelInputTokens").asLong()
                > session.document().path("limits").path("maxModelInputTokensTotal").asLong()
            || counters.path("modelOutputTokens").asLong()
                > session.document().path("limits").path("maxModelOutputTokensTotal").asLong();
    if (over && !terminal(session)) {
      session.progress().put("errorCode", "BUDGET_EXCEEDED");
      stop(session, "FAILED");
      return false;
    }
    if (changed) {
      repository.save(session);
    }
    return !over && !terminal(session);
  }

  /** Capacity refusal shares the accounting transaction; caller returns after this stop commits. */
  public boolean modelReservationFitsLocked(
      GuidedSessionRepository.Session session, int input, int output) {
    require(
        org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    ObjectNode counters = (ObjectNode) session.document().path("counters");
    JsonNode limits = session.document().path("limits");
    if (counters.path("modelProposals").asLong() + 1 > limits.path("maxModelProposals").asLong()
        || counters.path("modelInputTokens").asLong() + input
            > limits.path("maxModelInputTokensTotal").asLong()
        || counters.path("modelOutputTokens").asLong() + output
            > limits.path("maxModelOutputTokensTotal").asLong()) {
      session.progress().put("errorCode", "BUDGET_EXCEEDED");
      stop(session, "FAILED");
      return false;
    }
    return true;
  }

  public JsonNode translationQuestion(
      Authentication controller,
      String id,
      long fence,
      String key,
      JsonNode question,
      JsonNode meanings) {
    return translationQuestion(controller, id, fence, key, question, meanings, null);
  }

  public JsonNode translationQuestion(
      Authentication controller,
      String id,
      long fence,
      String key,
      JsonNode question,
      JsonNode meanings,
      JsonNode capture) {
    return translationTransaction(
        controller,
        id,
        fence,
        session -> {
          questions.create(session.document(), question, meanings, capture);
          if (capture != null && publication != null) {
            publication.questioned(session, capture, clock.instant());
          }
          JsonNode created = clarification(controller, id, fence, key, question);
          translation.continuation(id, "AWAITING_CLARIFICATION");
          return created;
        });
  }

  /**
   * Revocation may stop a frozen run even after its source revision changed; it grants no action.
   */
  public void failTranslation(Authentication controller, String id, long fence, String code) {
    GuidedInternalSecurity.requireRole(controller, "backend-controller");
    require(
        Set.of(
                "BUDGET_EXCEEDED",
                "MISSING_SOURCE",
                "INVALID_CONTRACT",
                "RUNTIME_INCOMPATIBLE",
                "REVISION_CONFLICT",
                "BINDING_ORDER",
                "STALE_GENERATION",
                "UNSUPPORTED_SURFACE")
            .contains(code),
        "INVALID_CONTRACT",
        422);
    repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          owner(controller, "backend-controller", session, fence);
          active(session);
          require(
              v2(session.document()) && translation != null && translation.exists(id),
              "RUNTIME_INCOMPATIBLE",
              409);
          session.progress().put("errorCode", code);
          stop(session, "FAILED");
          return null;
        });
  }

  public List<ObjectNode> translationActions(Authentication controller, String id, long fence) {
    return translationTransaction(controller, id, fence, session -> repository.actions(id));
  }

  public void installStopSender(java.util.function.BiConsumer<ObjectNode, String> sender) {
    this.stopSender = sender;
  }

  public void installBridge(
      com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService materialization,
      com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore preparations,
      com.citi.put.checks.studio.guided.bridge.GuidedBindingStore bindings,
      com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore assignments) {
    require(this.materialization == null, "RUNTIME_INCOMPATIBLE", 409);
    this.materialization = materialization;
    this.preparations = preparations;
    this.bindings = bindings;
    this.assignments = assignments;
  }

  private static boolean v2(JsonNode session) {
    return session.path("schemaVersion").asInt() == 2;
  }

  public GuidedSessionService(
      GuidedSessionRepository repository,
      GuidedContracts contracts,
      GuidedSessionAccess access,
      GuidedSessionProperties properties,
      Clock clock) {
    this.repository = repository;
    this.contracts = contracts;
    this.access = access;
    this.properties = properties;
    this.clock = clock;
    this.ledger = new GuidedActionLedger(contracts);
  }

  public JsonNode start(Authentication user, String key, JsonNode request) {
    contracts.validate("commands#/definitions/start", request);
    key(key);
    require(
        user instanceof BffAuthenticationToken && user.isAuthenticated(), "UNAUTHENTICATED", 401);
    require(properties.enabled(), "RUNTIME_INCOMPATIBLE", 409);
    String principal = ((BffAuthenticationToken) user).getPrincipal().userId();
    ObjectNode identity =
        contracts
            .object()
            .put("principal", principal)
            .put("testId", request.path("testId").asText());
    String namespace = GuidedContracts.hash(identity), digest = GuidedContracts.hash(request);
    return repository.transaction(
        () -> {
          repository.namespaceLock(namespace);
          JsonNode previous = repository.duplicate(namespace, "start", key, digest);
          if (previous != null) {
            var existing = repository.lock(previous.path("sessionId").asText());
            access.checkUser(user, existing.document());
            access.checkCurrent(existing.document());
            return view(existing.document());
          }
          var snapshot = access.resolve(user, request);
          ObjectNode scope = snapshot.scope().deepCopy();
          require(scope.path("principalId").asText().equals(principal), "FORBIDDEN_SCOPE", 403);
          for (String field :
              List.of(
                  "sourceRevision",
                  "configurationRevision",
                  "environmentId",
                  "applicationId",
                  "accountRef")) {
            require(scope.path(field).equals(request.path(field)), "REVISION_CONFLICT", 409);
          }
          for (String field : List.of("approvedOrigins", "capabilities")) {
            var values = new java.util.TreeSet<String>();
            scope.path(field).forEach(n -> values.add(n.asText()));
            var array = scope.putArray(field);
            values.forEach(array::add);
          }
          require(
              !snapshot.authConnection().path("mode").asText().equals("unavailable")
                  && !snapshot.authConnection().path("connectionId").isNull(),
              "AUTH_CONNECTION_REQUIRED",
              409);
          ObjectNode session = contracts.object();
          Instant now = clock.instant();
          session.put("schemaVersion", request.path("schemaVersion").asInt());
          session.put("sessionId", UUID.randomUUID().toString());
          session.set("testId", request.path("testId"));
          session.put("state", "PREPARING");
          session.set("scope", scope);
          session.put("scopeHash", GuidedContracts.hash(scope));
          session
              .putObject("runAuthorization")
              .put("authorizationId", UUID.randomUUID().toString())
              .put("kind", "scopedRun")
              .put("authorizedAt", now.toString())
              .put("principalId", principal)
              .put("scopeHash", GuidedContracts.hash(scope));
          session.set(
              "versions",
              contracts.parse(
                  "{\"contract\":1,\"learnedPlan\":1,\"observation\":1,\"guidedPolicy\":1,"
                      + "\"referencePolicy\":3,\"lowering\":1,\"artifact\":2,"
                      + "\"language\":\"observed-1\",\"executor\":\"observed-1\"}"));
          if (v2(session)) {
            contracts.validate("v2/versions", request.path("versions"));
            session.set("versions", request.path("versions"));
          }
          session
              .putObject("owner")
              .put("workerId", "unclaimed")
              .put("fence", 0)
              .put("leaseExpiresAt", now.toString());
          ObjectNode limits = properties.snapshot(contracts);
          session.put("createdAt", now.toString());
          session.put(
              "expiresAt", now.plusSeconds(limits.path("maxSessionSeconds").asInt()).toString());
          session.set("limits", limits);
          ObjectNode counters = session.putObject("counters");
          for (String field :
              List.of(
                  "actions",
                  "observations",
                  "modelProposals",
                  "modelInputTokens",
                  "modelOutputTokens",
                  "sanitizedEvidenceBytes")) {
            counters.put(field, 0);
          }
          require(
              snapshot.sourceSteps().size() <= limits.path("maxSourceSteps").asInt(),
              "BUDGET_EXCEEDED",
              429);
          session.set("sourceSteps", snapshot.sourceSteps().deepCopy());
          session.set("authConnection", snapshot.authConnection().deepCopy());
          contracts.validate("session", session);
          access.checkCurrent(session);
          access.checkSourceCurrent(session);
          repository.insert(session);
          if (v2(session)
              && access
                  instanceof
                  com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess
                          production) {
            production.initialize(session);
          }
          if (v2(session) && publication != null) {
            publication.started(session, now);
          }
          JsonNode result = view(session);
          repository.command(namespace, "start", key, digest, result);
          return result;
        });
  }

  public JsonNode read(Authentication user, String id, String projection) {
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkUser(user, session.document());
          access.checkCurrent(session.document());
          if (projection.equals("result")) {
            if (!terminal(session)) {
              return view(session.document());
            }
            return result(session);
          }
          if (projection.equals("clarification")) {
            if (!session.progress().has("clarification") || terminal(session)) {
              return null;
            }
            return session.progress().get("clarification").deepCopy();
          }
          return view(session.document());
        });
  }

  public JsonNode cancel(Authentication user, String id, String key, JsonNode request) {
    contracts.validate("commands#/definitions/cancel", request);
    return publicCommand(
        user,
        id,
        "cancel",
        key,
        request,
        session -> {
          if (!terminal(session)) {
            stop(session, "CANCELLED");
          }
          return view(session.document());
        });
  }

  public JsonNode clarify(Authentication user, String id, String key, JsonNode request) {
    contracts.validate("commands#/definitions/clarify", request);
    return publicCommand(
        user,
        id,
        "clarify",
        key,
        request,
        session -> {
          active(session);
          JsonNode question = session.progress().path("clarification");
          boolean sourceQuestion =
              v2(session.document()) && question.path("phase").asText().equals("source");
          require(
              state(session).equals("AWAITING_CLARIFICATION")
                  && question.path("clarificationId").equals(request.path("clarificationId"))
                  && question.path("generation").equals(request.path("generation"))
                  && (sourceQuestion
                      ? question.path("generation").asInt() == 0
                          && question.path("documentId").isNull()
                      : question.path("generation").equals(session.progress().path("generation"))
                          && question
                              .path("documentId")
                              .equals(session.progress().path("documentId")))
                  && Instant.parse(question.path("expiresAt").asText()).isAfter(clock.instant()),
              "STALE_GENERATION",
              409);
          JsonNode selected = null;
          for (JsonNode choice : question.path("choices")) {
            if (choice.path("choiceId").equals(request.path("choiceId"))) {
              selected = choice;
            }
          }
          require(selected != null, "INVALID_CONTRACT", 422);
          ObjectNode answers = session.progress().withObject("/resolvedClarifications");
          String questionId = question.path("clarificationId").asText();
          require(!answers.has(questionId), "IDEMPOTENCY_CONFLICT", 409);
          require(
              answers.size() < session.document().path("limits").path("maxObservations").asInt(),
              "BUDGET_EXCEEDED",
              429);
          // Keep only identities/mapping, never the displayed label or a runtime page value.
          ObjectNode answer = contracts.object();
          for (String field :
              List.of(
                  "sessionId",
                  "scopeHash",
                  "clarificationId",
                  "coordinate",
                  "documentId",
                  "generation")) {
            answer.set(field, question.path(field).deepCopy());
          }
          for (String field : List.of("choiceId", "nodeId", "bindingId")) {
            answer.set(field, selected.path(field).deepCopy());
          }
          answer.set("sourceRevision", session.document().path("scope").path("sourceRevision"));
          answer.set(
              "configurationRevision",
              session.document().path("scope").path("configurationRevision"));
          answer.put("resolvedAt", clock.instant().toString());
          if (translation != null && translation.exists(id)) {
            questions.accept(session.document(), questionId, request.path("choiceId").asText());
            translation.continuation(id, sourceQuestion ? "SOURCE_PLAN" : "REFRESH");
          }
          answers.set(questionId, answer);
          session.progress().remove("clarification");
          session.document().put("state", sourceQuestion ? "PREPARING" : "OBSERVING");
          repository.save(session);
          return view(session.document());
        });
  }

  /**
   * Trusted planning handoff for OBS-005. Returns immutable historical choice metadata, not a
   * current-node execution permit. The planner must revalidate it against the new observation.
   */
  public JsonNode clarificationSelection(
      Authentication controller, String id, long fence, String clarificationId) {
    GuidedInternalSecurity.requireRole(controller, "backend-controller");
    key(clarificationId);
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          owner(controller, "backend-controller", session, fence);
          active(session);
          access.checkSourceCurrent(session.document());
          JsonNode answer = session.progress().path("resolvedClarifications").path(clarificationId);
          require(!answer.isMissingNode(), "MISSING_SOURCE", 409);
          scoped(session, answer);
          return answer.deepCopy();
        });
  }

  private JsonNode publicCommand(
      Authentication user,
      String id,
      String route,
      String key,
      JsonNode request,
      Function<GuidedSessionRepository.Session, JsonNode> operation) {
    key(key);
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkUser(user, session.document());
          access.checkCurrent(session.document());
          if (route.equals("clarify")) {
            require(
                session.document().path("schemaVersion").equals(request.path("schemaVersion")),
                "RUNTIME_INCOMPATIBLE",
                409);
          }
          String digest = GuidedContracts.hash(request);
          JsonNode previous = repository.duplicate(id, route, key, digest);
          if (previous != null) {
            return previous;
          }
          if (route.equals("clarify")) {
            access.checkSourceCurrent(session.document());
          }
          JsonNode response = operation.apply(session);
          repository.command(id, route, key, digest, response);
          return response;
        });
  }

  /**
   * Claim identity is independently authenticated; lease renewal never changes the hard deadline.
   */
  public JsonNode claim(Authentication worker, String id, String key, JsonNode request) {
    contracts.validate("commands#/definitions/claim", request);
    path(id, request);
    key(key);
    GuidedInternalSecurity.requireRole(worker, "owning-worker");
    require(worker.getName().equals(request.path("workerId").asText()), "FORBIDDEN_SCOPE", 403);
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          active(session);
          access.checkSourceCurrent(session.document());
          if (v2(session.document())) {
            require(assignments != null, "RUNTIME_INCOMPATIBLE", 409);
            assignments.authorizeClaim(session.document(), worker.getName(), clock.instant());
          }
          String digest = GuidedContracts.hash(request);
          JsonNode previous = repository.duplicate(id, "claim", key, digest);
          if (previous != null) {
            return session.document().deepCopy();
          }
          require(
              session.document().path("schemaVersion").equals(request.path("schemaVersion")),
              "RUNTIME_INCOMPATIBLE",
              409);
          if (v2(session.document())) {
            require(
                session.document().path("versions").equals(request.path("versions")),
                "RUNTIME_INCOMPATIBLE",
                409);
          }
          JsonNode owner = session.document().path("owner");
          int fence = owner.path("fence").asInt();
          require(
              fence == request.path("expectedFence").asInt()
                  && (fence < Integer.MAX_VALUE || v2(session.document())),
              "STALE_FENCE",
              409);
          boolean same = worker.getName().equals(owner.path("workerId").asText());
          boolean liveLease =
              Instant.parse(owner.path("leaseExpiresAt").asText()).isAfter(clock.instant());
          require(same || !liveLease, "STALE_FENCE", 409);
          Instant deadline = Instant.parse(session.document().path("expiresAt").asText());
          Instant lease = clock.instant().plusSeconds(30);
          if (lease.isAfter(deadline)) {
            lease = deadline;
          }
          if (same && liveLease) {
            // Ownership maintenance is not an acquisition or a workflow transition. Keeping the
            // fence also preserves outstanding admission/callback identities for this live owner.
            ((ObjectNode) owner).put("leaseExpiresAt", lease.toString());
            repository.save(session);
            repository.command(id, "claim", key, digest, session.document());
            return session.document().deepCopy();
          }
          require(fence < Integer.MAX_VALUE, "STALE_FENCE", 409);
          List<ObjectNode> actions = repository.actions(id);
          if (actions.stream().anyMatch(a -> a.path("state").asText().equals("DISPATCHING"))
              || (fence > 0
                  && !(v2(session.document())
                      && owner.path("workerId").asText().equals("unclaimed"))
                  && (actions.stream().anyMatch(a -> a.path("dispatchCount").asInt() > 0)
                      || !access.recoverableContext(id, worker.getName())))) {
            stop(session, "UNKNOWN_OUTCOME");
            repository.command(id, "claim", key, digest, session.document());
            return session.document().deepCopy();
          }
          for (ObjectNode action : actions) {
            if (action.path("state").asText().equals("ADMITTED")) {
              action.put("state", "REVOKED");
              action.put("outcomeCode", "CANCELLED");
              repository.saveAction(action);
            }
          }
          session
              .document()
              .putObject("owner")
              .put("workerId", worker.getName())
              .put("fence", fence + 1)
              .put("leaseExpiresAt", lease.toString());
          if (!Set.of("AWAITING_CLARIFICATION", "AWAITING_AUTH", "FINALIZING")
              .contains(state(session))) {
            session.document().put("state", v2(session.document()) ? "PREPARING" : "OBSERVING");
            session.progress().remove("observationHash");
          }
          repository.save(session);
          repository.command(id, "claim", key, digest, session.document());
          return session.document().deepCopy();
        });
  }

  public JsonNode observe(
      Authentication worker, String id, long fence, String key, JsonNode observation) {
    contracts.validate("observation", observation);
    path(id, observation);
    return internal(
        worker,
        "owning-worker",
        id,
        fence,
        "observations",
        key,
        observation,
        session -> {
          require(
              state(session).equals("OBSERVING")
                  || v2(session.document()) && state(session).equals("PREPARING"),
              "STALE_GENERATION",
              409);
          require(
              session.document().path("schemaVersion").equals(observation.path("schemaVersion")),
              "RUNTIME_INCOMPATIBLE",
              409);
          scoped(session, observation);
          JsonNode limits = session.document().path("limits");
          int bytes =
              GuidedContracts.canonical(observation).getBytes(StandardCharsets.UTF_8).length;
          require(
              bytes <= limits.path("maxObservationBytes").asInt()
                  && observation.path("nodes").size() <= limits.path("maxObservationNodes").asInt(),
              "BUDGET_EXCEEDED",
              429);
          for (JsonNode node : observation.path("nodes")) {
            require(
                node.path("depth").asInt() <= limits.path("maxObservationDepth").asInt(),
                "BUDGET_EXCEEDED",
                429);
          }
          int generation = observation.path("generation").asInt();
          require(
              generation > session.progress().path("generation").asInt(-1),
              "STALE_GENERATION",
              409);
          boolean origin = false;
          for (JsonNode allowed : session.document().path("scope").path("approvedOrigins")) {
            if (allowed.equals(observation.path("origin"))) {
              origin = true;
            }
          }
          require(origin, "ORIGIN_NOT_ALLOWED", 403);
          reserve(session, "observations", 1, "maxObservations");
          reserve(session, "sanitizedEvidenceBytes", bytes, "maxSanitizedEvidenceBytesTotal");
          session
              .progress()
              .put("generation", generation)
              .put("documentId", observation.path("documentId").asText())
              .put("observationHash", GuidedContracts.hash(observation))
              .put("origin", observation.path("origin").asText());
          if (v2(session.document())) {
            ObjectNode evidence =
                contracts
                    .object()
                    .put("kind", "observedDocument")
                    .put("sessionId", id)
                    .put(
                        "contextId",
                        materialization.context(session.document()).path("contextId").asText())
                    .put("documentId", observation.path("documentId").asText())
                    .put("generation", generation)
                    .put("origin", observation.path("origin").asText())
                    .put("observationHash", GuidedContracts.hash(observation));
            session.progress().set("executionEvidence", evidence);
            session.progress().set("observation", observation.deepCopy());
            session.progress().put("evidenceHash", GuidedContracts.hash(evidence));
          }
          session.document().put("state", "PROPOSING");
          repository.save(session);
          return session.document().deepCopy();
        });
  }

  public JsonNode admit(
      Authentication controller, String id, long fence, String key, JsonNode proposal) {
    contracts.validate("action", proposal);
    path(id, proposal);
    return internal(
        controller,
        "backend-controller",
        id,
        fence,
        "admissions",
        key,
        proposal,
        session -> {
          require(state(session).equals("PROPOSING"), "STALE_GENERATION", 409);
          scoped(session, proposal);
          for (String field :
              List.of("generation", v2(session.document()) ? "evidenceHash" : "observationHash")) {
            require(
                proposal.path(field).equals(session.progress().path(field)),
                "STALE_GENERATION",
                409);
          }
          require(
              proposal
                      .path("target")
                      .path("documentId")
                      .equals(session.progress().path("documentId"))
                  && proposal.path("target").path("generation").equals(proposal.path("generation")),
              "STALE_GENERATION",
              409);
          JsonNode coordinate = proposal.path("coordinate");
          List<ObjectNode> actions = repository.actions(id);
          for (ObjectNode action : actions) {
            require(!action.path("coordinate").equals(coordinate), "IDEMPOTENCY_CONFLICT", 409);
          }
          int stepIndex = session.progress().path("stepIndex").asInt(0);
          require(
              stepIndex < session.document().path("sourceSteps").size()
                  && session
                      .document()
                      .path("sourceSteps")
                      .get(stepIndex)
                      .path("stepId")
                      .equals(coordinate.path("stepId")),
              "BINDING_ORDER",
              422);
          long ordinal =
              actions.stream()
                  .filter(
                      a -> a.path("coordinate").path("stepId").equals(coordinate.path("stepId")))
                  .count();
          require(coordinate.path("ordinal").asLong() == ordinal, "BINDING_ORDER", 422);
          require(
              ordinal < session.document().path("limits").path("maxStatementsPerStep").asInt(),
              "BUDGET_EXCEEDED",
              429);
          boolean capability = false;
          for (JsonNode c : session.document().path("scope").path("capabilities")) {
            if (c.equals(proposal.path("operation").path("kind"))) {
              capability = true;
            }
          }
          require(capability, "FORBIDDEN_SCOPE", 403);
          JsonNode proof = null;
          String policyHash;
          if (v2(session.document())) {
            require(
                proposal.path("schemaVersion").asInt() == 2
                    && proposal
                        .path("executionEvidence")
                        .equals(session.progress().path("executionEvidence")),
                "STALE_GENERATION",
                409);
            ObjectNode context = materialization.context(session.document());
            require(
                proposal.path("authoredInputsHash").equals(context.path("authoredInputsHash"))
                    && proposal.path("contextRevision").equals(context.path("contextRevision")),
                "REVISION_CONFLICT",
                409);
            if (proposal.path("executionEvidence").path("kind").asText().equals("initialBlank")) {
              require(
                  actions.isEmpty()
                      && stepIndex == 0
                      && ordinal == 0
                      && proposal.path("operation").path("kind").asText().equals("navigate")
                      && proposal.path("target").path("kind").asText().equals("page"),
                  "INVALID_CONTRACT",
                  422);
            }
            bindings.validateAction(session.document(), proposal, context);
            proof = preparations.authorize(session.document(), proposal, context, clock.instant());
            policyHash = access.authorizeAction(session.document(), proposal, proof);
          } else {
            require(proposal.path("schemaVersion").asInt() == 1, "RUNTIME_INCOMPATIBLE", 409);
            policyHash = access.authorizeAction(session.document(), proposal);
          }

          reserve(session, "actions", 1, "maxActions");
          ObjectNode action =
              ledger.admit(
                  session.document(),
                  proposal,
                  key,
                  policyHash,
                  session.progress().path("origin").asText(),
                  clock.instant());
          if (v2(session.document())) {
            action.put("schemaVersion", 2);
            action.remove("observationHash");
            for (String field :
                List.of(
                    "executionEvidence", "evidenceHash", "authoredInputsHash", "contextRevision")) {
              action.set(field, proposal.path(field));
            }
            action.put("preparationId", proof.path("preparationId").asText());
            ObjectNode operation = contracts.object();
            operation.set("coordinate", proposal.path("coordinate"));
            operation.set("origin", proposal.path("executionEvidence").path("origin"));
            operation.set(
                "locator",
                proposal.path("target").has("locator")
                    ? proposal.path("target").path("locator")
                    : com.fasterxml.jackson.databind.node.NullNode.instance);
            operation.set("operation", proposal.path("operation"));
            action.put("operationHash", GuidedContracts.hash(operation));
          }
          repository.insertAction(action, proposal);
          if (translation != null && translation.exists(id)) {
            translation.attachAdmission(id, key, action);
          }
          if (v2(session.document())) {
            preparations.attach(action);
            bindings.attachConsumer(session.document(), proposal, action);
            if (publication != null) {
              publication.admitted(session.document(), action, proposal, clock.instant());
            }
          }
          session.document().put("state", "ACTING");
          repository.save(session);
          return action.deepCopy();
        });
  }

  /**
   * This transaction is the dispatch permit. A duplicate receives count=1, never a fresh permit.
   */
  public JsonNode advance(
      Authentication controller, String id, long fence, String key, JsonNode request) {
    require(request.path("schemaVersion").asInt() != 2, "RUNTIME_INCOMPATIBLE", 409);
    contracts.validate("commands#/definitions/advance", request);
    path(id, request);
    require(request.path("ownerFence").asLong() == fence, "STALE_FENCE", 409);
    return internal(
        controller,
        "backend-controller",
        id,
        fence,
        "advance",
        key,
        request,
        session -> {
          ObjectNode action = action(id, request.path("admissionId").asText());
          require(
              action.path("operationHash").equals(request.path("operationHash"))
                  && action.path("ownerFence").asLong() == fence,
              "STALE_FENCE",
              409);
          require(state(session).equals("ACTING"), "UNKNOWN_OUTCOME", 409);
          if (action.path("dispatchCount").asInt() == 1) {
            return action.deepCopy();
          }
          require(
              action.path("state").asText().equals("ADMITTED")
                  && action.path("generation").equals(session.progress().path("generation"))
                  && action
                      .path("observationHash")
                      .equals(session.progress().path("observationHash")),
              "STALE_GENERATION",
              409);
          action.put("dispatchCount", 1).put("state", "DISPATCHING");
          repository.saveAction(action);
          return action.deepCopy();
        });
  }

  public JsonNode outcome(
      Authentication worker, String id, long fence, String key, JsonNode request) {
    require(request.path("schemaVersion").asInt() == 1, "RUNTIME_INCOMPATIBLE", 409);
    contracts.validate("commands#/definitions/outcome", request);
    path(id, request.path("ledger"));
    return internal(
        worker,
        "owning-worker",
        id,
        fence,
        "outcomes",
        key,
        request,
        session -> {
          ObjectNode report = (ObjectNode) request.path("ledger");
          ObjectNode stored = action(id, report.path("admission").path("admissionId").asText());
          ledger.verifyReport(stored, report);
          boolean assertion =
              repository
                  .proposal(stored.path("admission").path("admissionId").asText())
                  .path("operation")
                  .path("kind")
                  .asText()
                  .equals("assert");
          require(
              assertion
                  ? (!report.path("state").asText().equals("SUCCEEDED")
                      || report.path("assertionPassed").asBoolean())
                  : report.path("assertionPassed").isNull(),
              "INVALID_CONTRACT",
              422);
          if (stored.equals(report)) {
            return session.document().deepCopy();
          }
          require(
              stored.path("state").asText().equals("DISPATCHING")
                  && stored.path("ownerFence").asLong() == fence,
              "UNKNOWN_OUTCOME",
              409);
          repository.saveAction(report);
          if (report.path("state").asText().equals("SUCCEEDED")) {
            session.document().put("state", "OBSERVING");
          } else {
            session.document().set("state", report.path("state"));
            session
                .progress()
                .put(
                    "errorCode",
                    report.path("outcomeCode").asText().equals("ASSERTION_FAILED")
                        ? "ASSERTION_FAILED"
                        : "UNKNOWN_OUTCOME".equals(report.path("state").asText())
                            ? "UNKNOWN_OUTCOME"
                            : "INVALID_CONTRACT");
          }
          repository.save(session);
          return session.document().deepCopy();
        });
  }

  /**
   * Trusted planner/validator calls this only after independently proving authored step
   * completeness.
   */
  public JsonNode completeStep(
      Authentication controller, String id, long fence, String key, JsonNode completion) {
    return internal(
        controller,
        "backend-controller",
        id,
        fence,
        "step-complete",
        key,
        completion,
        session -> {
          require(
              Set.of("OBSERVING", "PROPOSING").contains(state(session)), "INVALID_CONTRACT", 409);
          int index = session.progress().path("stepIndex").asInt(0);
          JsonNode step = session.document().path("sourceSteps").get(index);
          require(
              step != null && step.path("stepId").equals(completion.path("stepId")),
              "BINDING_ORDER",
              422);
          var actions =
              repository.actions(id).stream()
                  .filter(a -> a.path("coordinate").path("stepId").equals(step.path("stepId")))
                  .toList();
          require(
              !actions.isEmpty()
                  && actions.stream()
                      .allMatch(
                          a ->
                              a.path("state").asText().equals("SUCCEEDED")
                                  && a.path("dispatchCount").asInt() == 1),
              "UNKNOWN_OUTCOME",
              409);
          require(
              !step.path("requiresAssertion").asBoolean()
                  || actions.stream().anyMatch(a -> a.path("assertionPassed").asBoolean()),
              "ASSERTION_FAILED",
              409);
          // Authoritative semantic completeness is OBS-005/006; fail closed until it is installed.
          require(
              access instanceof StepVerifier
                  && ((StepVerifier) access).complete(session.document(), completion, actions),
              "RUNTIME_INCOMPATIBLE",
              409);
          session.progress().put("stepIndex", index + 1);
          session
              .document()
              .put(
                  "state",
                  index + 1 == session.document().path("sourceSteps").size()
                      ? "FINALIZING"
                      : "OBSERVING");
          repository.save(session);
          return view(session.document());
        });
  }

  public interface StepVerifier {
    boolean complete(JsonNode session, JsonNode completion, List<ObjectNode> actions);
  }

  public JsonNode finalizeSession(
      Authentication controller, String id, long fence, String key, JsonNode request) {
    require(request.path("schemaVersion").asInt() != 2, "RUNTIME_INCOMPATIBLE", 409);
    contracts.validate("commands#/definitions/finalize", request);
    path(id, request);
    require(request.path("ownerFence").asLong() == fence, "STALE_FENCE", 409);
    return internal(
        controller,
        "backend-controller",
        id,
        fence,
        "finalize",
        key,
        request,
        session -> {
          require(!v2(session.document()), "RUNTIME_INCOMPATIBLE", 409);
          require(state(session).equals("FINALIZING"), "PUBLICATION_CONFLICT", 409);
          JsonNode scope = session.document().path("scope");
          if (!scope.path("sourceRevision").equals(request.path("expectedSourceRevision"))
              || !scope
                  .path("configurationRevision")
                  .equals(request.path("expectedConfigurationRevision"))) {
            stop(session, "PUBLICATION_CONFLICT");
            return result(session);
          }
          var actions = repository.actions(id);
          require(
              !actions.isEmpty()
                  && actions.stream()
                      .allMatch(
                          a ->
                              a.path("state").asText().equals("SUCCEEDED")
                                  && a.path("dispatchCount").asInt() == 1)
                  && session.progress().path("stepIndex").asInt()
                      == session.document().path("sourceSteps").size(),
              "PUBLICATION_CONFLICT",
              409);
          repository.finalizationIdentity(id, GuidedContracts.hash(request));
          // OBS-006 must reconstruct and verify exact exercised plan/lowering in this transaction.
          // No callback or supplied hash can make a revision ready without that verifier.
          throw new GuidedSessionException("RUNTIME_INCOMPATIBLE", 409);
        });
  }

  /** Reserve before a gateway call. The reservation survives timeouts and missing usage reports. */
  public JsonNode reserveModel(
      Authentication controller, String id, long fence, String key, int input, int output) {
    require(input > 0 && output > 0, "INVALID_CONTRACT", 422);
    ObjectNode request = contracts.object().put("input", input).put("output", output);
    return internal(
        controller,
        "backend-controller",
        id,
        fence,
        "model-reserve",
        key,
        request,
        session -> {
          reserve(session, "modelProposals", 1, "maxModelProposals");
          reserve(session, "modelInputTokens", input, "maxModelInputTokensTotal");
          reserve(session, "modelOutputTokens", output, "maxModelOutputTokensTotal");
          session.progress().withObject("/modelReservations").set(key, request.deepCopy());
          repository.save(session);
          return request;
        });
  }

  /**
   * No refunds: actual usage beyond the reservation is charged; missing usage retains the ceiling.
   */
  public JsonNode settleModel(
      Authentication controller,
      String id,
      long fence,
      String key,
      String reservation,
      Integer input,
      Integer output) {
    ObjectNode request = contracts.object().put("reservation", reservation);
    if (input == null) {
      request.putNull("input");
    } else {
      request.put("input", input);
    }
    if (output == null) {
      request.putNull("output");
    } else {
      request.put("output", output);
    }
    return internal(
        controller,
        "backend-controller",
        id,
        fence,
        "model-settle",
        key,
        request,
        session -> {
          JsonNode reserved = session.progress().path("modelReservations").path(reservation);
          require(!reserved.isMissingNode(), "INVALID_CONTRACT", 422);
          require(
              (input == null || input >= 0) && (output == null || output >= 0),
              "INVALID_CONTRACT",
              422);
          ObjectNode counters = (ObjectNode) session.document().path("counters");
          long chargedInput =
              counters.path("modelInputTokens").asLong()
                  + (input == null ? 0 : Math.max(0, input - reserved.path("input").asInt()));
          long chargedOutput =
              counters.path("modelOutputTokens").asLong()
                  + (output == null ? 0 : Math.max(0, output - reserved.path("output").asInt()));
          counters.put("modelInputTokens", Math.min(Integer.MAX_VALUE, chargedInput));
          counters.put("modelOutputTokens", Math.min(Integer.MAX_VALUE, chargedOutput));
          session.progress().withObject("/modelReservations").remove(reservation);
          if (chargedInput
                  > session.document().path("limits").path("maxModelInputTokensTotal").asLong()
              || chargedOutput
                  > session.document().path("limits").path("maxModelOutputTokensTotal").asLong()) {
            // A gateway that exceeds its reservation cannot be made safe by rolling usage back.
            session.progress().put("errorCode", "BUDGET_EXCEEDED");
            stop(session, "FAILED");
          }
          repository.save(session);
          return session.document().path("counters").deepCopy();
        });
  }

  public void expire() {
    for (String id : repository.expired(clock.instant())) {
      repository.transaction(
          () -> {
            var session = repository.lock(id);
            if (!terminal(session)
                && !Instant.parse(session.document().path("expiresAt").asText())
                    .isAfter(clock.instant())) {
              stop(session, "EXPIRED");
            }
            return null;
          });
    }
  }

  public void lostAcknowledgment(String id) {
    repository.transaction(
        () -> {
          var session = repository.lock(id);
          if (!terminal(session)
              && repository.actions(id).stream()
                  .anyMatch(a -> a.path("state").asText().equals("DISPATCHING"))) {
            stop(session, "UNKNOWN_OUTCOME");
          }
          return null;
        });
  }

  /** A late acknowledgement for one action cannot poison a newer admission. */
  public void lostAcknowledgment(String id, String admissionId) {
    repository.transaction(
        () -> {
          var session = repository.lock(id);
          if (!terminal(session)
              && action(id, admissionId).path("state").asText().equals("DISPATCHING")) {
            stop(session, "UNKNOWN_OUTCOME");
          }
          return null;
        });
  }

  /** Opaque evidence-store identifiers only; the authorized evidence service resolves them. */
  public JsonNode recordEvidence(
      Authentication worker,
      String id,
      long fence,
      String key,
      String evidenceId,
      String reference) {
    require(
        evidenceId != null
            && evidenceId.matches("[A-Za-z0-9_-]{1,256}")
            && reference != null
            && reference.matches("[A-Za-z0-9_-]{1,256}"),
        "INVALID_CONTRACT",
        422);
    ObjectNode request =
        contracts.object().put("evidenceId", evidenceId).put("reference", reference);
    return internal(
        worker,
        "owning-worker",
        id,
        fence,
        "evidence",
        key,
        request,
        session -> {
          repository.evidence(
              id, session.document().path("scopeHash").asText(), evidenceId, reference);
          session.progress().put("evidenceRef", reference);
          repository.save(session);
          return request;
        });
  }

  public JsonNode clarification(
      Authentication controller, String id, long fence, String key, JsonNode question) {
    contracts.validate("clarification", question);
    path(id, question);
    return internal(
        controller,
        "backend-controller",
        id,
        fence,
        "clarification",
        key,
        question,
        session -> {
          require(
              session.document().path("schemaVersion").equals(question.path("schemaVersion")),
              "RUNTIME_INCOMPATIBLE",
              409);
          scoped(session, question);
          require(
              !session
                  .progress()
                  .path("resolvedClarifications")
                  .has(question.path("clarificationId").asText()),
              "IDEMPOTENCY_CONFLICT",
              409);
          require(
              question.path("phase").asText().equals("source")
                  ? v2(session.document())
                      && state(session).equals("PREPARING")
                      && repository.actions(id).isEmpty()
                      && !session.progress().has("documentId")
                      && question.path("generation").asInt() == 0
                      && question.path("documentId").isNull()
                  : state(session).equals("PROPOSING")
                      && question.path("generation").equals(session.progress().path("generation"))
                      && question.path("documentId").equals(session.progress().path("documentId")),
              "STALE_GENERATION",
              409);
          require(
              !Instant.parse(question.path("expiresAt").asText())
                  .isAfter(Instant.parse(session.document().path("expiresAt").asText())),
              "INVALID_CONTRACT",
              422);
          session.progress().set("clarification", question.deepCopy());
          session.document().put("state", "AWAITING_CLARIFICATION");
          repository.save(session);
          return question;
        });
  }

  public ObjectNode prepareAssignment(
      Authentication controller, String id, String key, String workerId) {
    GuidedInternalSecurity.requireRole(controller, "backend-controller");
    key(key);
    ObjectNode request = contracts.object().put("workerId", workerId);
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          active(session);
          access.checkSourceCurrent(session.document());
          require(v2(session.document()) && assignments != null, "RUNTIME_INCOMPATIBLE", 409);
          String digest = GuidedContracts.hash(request);
          JsonNode prior = repository.duplicate(id, "assignment", key, digest);
          if (prior != null) {
            return (ObjectNode) prior;
          }
          ObjectNode intent = assignments.prepare(session.document(), workerId);
          repository.command(id, "assignment", key, digest, intent);
          return intent;
        });
  }

  public void acknowledgeAssignment(Authentication controller, String id, JsonNode receipt) {
    GuidedInternalSecurity.requireRole(controller, "backend-controller");
    repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          active(session);
          access.checkSourceCurrent(session.document());
          assignments.acknowledge(session.document(), receipt, clock.instant());
          return null;
        });
  }

  public JsonNode assignmentLifecycle(
      Authentication worker, String id, String key, JsonNode request) {
    GuidedInternalSecurity.requireRole(worker, "owning-worker");
    key(key);
    contracts.validate("v2/assignment-lifecycle", request);
    path(id, request.path("assignment"));
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          assignments.verifyLifecycle(
              session.document(), worker.getName(), request.path("assignment"));
          String digest = GuidedContracts.hash(request);
          JsonNode prior = repository.duplicate(id, "assignment-lifecycle", key, digest);
          if (prior != null) {
            return session.document().deepCopy();
          }
          if (!terminal(session)) {
            boolean uncertain =
                repository.actions(id).stream()
                    .anyMatch(a -> a.path("state").asText().equals("DISPATCHING"));
            stop(
                session,
                uncertain
                    ? "UNKNOWN_OUTCOME"
                    : request.path("reason").asText().equals("EXPIRED") ? "EXPIRED" : "FAILED");
          }
          repository.command(id, "assignment-lifecycle", key, digest, session.document());
          return session.document().deepCopy();
        });
  }

  public JsonNode existingAdmission(
      Authentication controller, String id, long fence, String key, JsonNode proposal) {
    GuidedInternalSecurity.requireRole(controller, "backend-controller");
    key(key);
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          owner(controller, "backend-controller", session, fence);
          active(session);
          access.checkSourceCurrent(session.document());
          JsonNode previous =
              repository.duplicate(id, "admissions", key, GuidedContracts.hash(proposal));
          return previous == null
              ? null
              : action(id, previous.path("admission").path("admissionId").asText());
        });
  }

  /** A controller port for semantic candidates; no gateway or English parser lives here. */
  public JsonNode materialize(
      Authentication controller, String id, long fence, String key, JsonNode references) {
    return internal(
        controller,
        "backend-controller",
        id,
        fence,
        "materialization",
        key,
        references,
        session -> {
          require(v2(session.document()) && materialization != null, "RUNTIME_INCOMPATIBLE", 409);
          access.checkSourceCurrent(session.document());
          assignments.requireOwned(session.document());
          return materialization.freeze(
              session.document(), access.sources(session.document()), references);
        });
  }

  public JsonNode allocateBinding(
      Authentication controller, String id, long fence, String key, JsonNode request) {
    return internal(
        controller,
        "backend-controller",
        id,
        fence,
        "allocations",
        key,
        request,
        session -> {
          require(
              v2(session.document())
                  && request.isObject()
                  && request.size() == 3
                  && request.has("needId")
                  && request.has("producerStepId")
                  && request.has("consumers"),
              "INVALID_CONTRACT",
              422);
          access.checkSourceCurrent(session.document());
          materialization.context(session.document());
          return bindings.allocate(
              session.document(),
              request.path("needId").asText(),
              request.path("producerStepId").asText(),
              request.path("consumers"));
        });
  }

  public ObjectNode runnerContext(Authentication controller, String id, long fence) {
    GuidedInternalSecurity.requireRole(controller, "backend-controller");
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          owner(controller, "backend-controller", session, fence);
          active(session);
          access.checkSourceCurrent(session.document());
          require(v2(session.document()) && materialization != null, "RUNTIME_INCOMPATIBLE", 409);
          return materialization.context(session.document());
        });
  }

  /**
   * Called by authenticated runner-client transport only; never exposed as a body-trusting route.
   */
  public void storePreparation(
      Authentication controller, String id, long fence, JsonNode proposal, JsonNode proof) {
    GuidedInternalSecurity.requireRole(controller, "backend-controller");
    contracts.validate("v2/action", proposal);
    repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          owner(controller, "backend-controller", session, fence);
          active(session);
          access.checkSourceCurrent(session.document());
          materialization.verify(session.document(), proof);
          require(
              Instant.parse(proof.path("expiresAt").asText())
                      .compareTo(
                          Instant.parse(
                              session.document().path("owner").path("leaseExpiresAt").asText()))
                  <= 0,
              "EXPIRED",
              409);
          preparations.store(proof, proposal, clock.instant());
          if (publication != null) {
            publication.prepared(session, proposal, proof, clock.instant());
          }
          return null;
        });
  }

  public JsonNode bootstrap(
      Authentication worker, String id, long fence, String key, JsonNode request) {
    contracts.validate("v2/bridge#/definitions/bootstrap", request);
    path(id, request);
    return internal(
        worker,
        "owning-worker",
        id,
        fence,
        "bootstrap",
        key,
        request,
        session -> {
          materialization.verify(session.document(), request);
          access.checkSourceCurrent(session.document());
          require(
              state(session).equals("PREPARING")
                  && repository.actions(id).isEmpty()
                  && !session.progress().has("executionEvidence"),
              "STALE_GENERATION",
              409);
          JsonNode evidence = request.path("executionEvidence");
          require(
              evidence.path("sessionId").asText().equals(id)
                  && evidence.path("contextId").equals(request.path("contextId"))
                  && GuidedContracts.hash(evidence).equals(request.path("evidenceHash").asText()),
              "INVALID_CONTRACT",
              422);
          if (translation != null && translation.exists(id)) {
            ObjectNode receipt = contracts.object();
            for (String field :
                List.of(
                    "contextId",
                    "contextRevision",
                    "sourceRevision",
                    "configurationRevision",
                    "scopeHash",
                    "workerId",
                    "ownerFence")) {
              receipt.set(field, request.path(field));
            }
            session.progress().set("translationBootstrapEvidence", receipt);
          }
          session.progress().set("executionEvidence", evidence);
          session.progress().set("evidenceHash", request.path("evidenceHash"));
          session.progress().set("documentId", evidence.path("documentId"));
          session.progress().put("generation", 0).putNull("origin");
          session.document().put("state", "PROPOSING");
          repository.save(session);
          return session.document().deepCopy();
        });
  }

  /** A refresh intent commits before RPC; it never consumes an action or changes bindings. */
  public JsonNode beginObservationRefresh(
      Authentication controller, String id, long fence, String key, JsonNode request) {
    contracts.validate("v2/observation-refresh", request);
    path(id, request);
    key(key);
    GuidedInternalSecurity.requireRole(controller, "backend-controller");
    require(
        !org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          verifyRefreshOwner(controller, session, fence, request);
          String digest = GuidedContracts.hash(request);
          String callbackKey = observationRefreshKey(request, key);
          JsonNode prior = repository.duplicate(id, "observation-refresh", key, digest);
          if (prior != null) {
            JsonNode committed = committedRefresh(session, request, callbackKey);
            if (committed != null) {
              return committed;
            }
            require(
                session
                    .progress()
                    .path("observationRefresh")
                    .path("callbackKey")
                    .asText()
                    .equals(callbackKey),
                "STALE_GENERATION",
                409);
            require(
                state(session).equals("OBSERVING")
                    && request
                        .path("expectedGeneration")
                        .equals(session.progress().path("generation")),
                "STALE_GENERATION",
                409);
            return null;
          }
          require(
              Set.of("OBSERVING", "PROPOSING").contains(state(session)), "STALE_GENERATION", 409);
          require(!session.progress().has("observationRefresh"), "STALE_GENERATION", 409);
          require(
              request.path("expectedGeneration").equals(session.progress().path("generation"))
                  && session
                      .progress()
                      .path("executionEvidence")
                      .path("kind")
                      .asText()
                      .equals("observedDocument"),
              "STALE_GENERATION",
              409);
          require(
              repository.actions(id).stream()
                  .noneMatch(
                      a -> Set.of("ADMITTED", "DISPATCHING").contains(a.path("state").asText())),
              "UNKNOWN_OUTCOME",
              409);
          JsonNode counts = session.document().path("counters"),
              limits = session.document().path("limits");
          require(
              counts.path("observations").asLong() < limits.path("maxObservations").asLong()
                  && counts.path("sanitizedEvidenceBytes").asLong()
                      < limits.path("maxSanitizedEvidenceBytesTotal").asLong(),
              "BUDGET_EXCEEDED",
              429);
          ObjectNode intent = contracts.object().put("callbackKey", callbackKey);
          intent.set("request", request.deepCopy());
          session.progress().set("observationRefresh", intent);
          session.document().put("state", "OBSERVING");
          repository.save(session);
          repository.command(id, "observation-refresh", key, digest, request);
          return null;
        });
  }

  /** HTTP success is usable only when the exact correlated worker callback already committed. */
  public JsonNode committedObservationRefresh(
      Authentication controller,
      String id,
      long fence,
      String key,
      JsonNode request,
      JsonNode response) {
    contracts.validate("v2/observation-refresh", request);
    path(id, request);
    key(key);
    if (response != null) {
      contracts.validate("v2/bridge#/definitions/observation", response);
    }
    GuidedInternalSecurity.requireRole(controller, "backend-controller");
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          verifyRefreshOwner(controller, session, fence, request);
          require(
              repository.duplicate(id, "observation-refresh", key, GuidedContracts.hash(request))
                  != null,
              "STALE_GENERATION",
              409);
          JsonNode committed =
              committedRefresh(session, request, observationRefreshKey(request, key));
          if (response != null) {
            require(committed != null && committed.equals(response), "STALE_GENERATION", 409);
          }
          return committed;
        });
  }

  private void verifyRefreshOwner(
      Authentication controller,
      GuidedSessionRepository.Session session,
      long fence,
      JsonNode request) {
    access.checkCurrent(session.document());
    owner(controller, "backend-controller", session, fence);
    active(session);
    access.checkSourceCurrent(session.document());
    materialization.verify(session.document(), request);
  }

  private JsonNode committedRefresh(
      GuidedSessionRepository.Session session, JsonNode request, String callbackKey) {
    JsonNode result =
        repository.duplicate(
            session.document().path("sessionId").asText(),
            "observation-refresh-result",
            callbackKey,
            GuidedContracts.hash(request));
    if (result == null) {
      return null;
    }
    JsonNode observation = result.path("observation");
    require(
        state(session).equals("PROPOSING")
            && observation.path("generation").asLong() > request.path("expectedGeneration").asLong()
            && observation.path("generation").equals(session.progress().path("generation"))
            && GuidedContracts.hash(observation)
                .equals(session.progress().path("observationHash").asText()),
        "STALE_GENERATION",
        409);
    return result;
  }

  private String observationRefreshKey(JsonNode request, String key) {
    ObjectNode correlation =
        contracts
            .object()
            .put("idempotencyKey", key)
            .put("requestDigest", GuidedContracts.hash(request));
    correlation.set("identity", materialization.identity(request));
    return "oref-" + GuidedContracts.hash(correlation);
  }

  public JsonNode observeV2(
      Authentication worker, String id, long fence, String key, JsonNode request) {
    contracts.validate("v2/bridge#/definitions/observation", request);
    path(id, request);
    // The outer transaction keeps identity verification and the existing collector admission
    // atomic.
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          owner(worker, "owning-worker", session, fence);
          active(session);
          materialization.verify(session.document(), request);
          JsonNode observation = request.path("observation");
          if (repository.duplicate(id, "observations", key, GuidedContracts.hash(observation))
              != null) {
            return session.document().deepCopy();
          }
          JsonNode intent = session.progress().path("observationRefresh");
          boolean refresh = key.equals(intent.path("callbackKey").asText());
          if (key.startsWith("oref-")) {
            require(
                refresh
                    && intent
                        .path("request")
                        .path("expectedGeneration")
                        .equals(session.progress().path("generation"))
                    && observation.path("generation").asLong()
                        > intent.path("request").path("expectedGeneration").asLong(),
                "STALE_GENERATION",
                409);
          }
          JsonNode result = observe(worker, id, fence, key, observation);
          var committed = repository.lock(id);
          if (refresh) {
            repository.command(
                id,
                "observation-refresh-result",
                key,
                GuidedContracts.hash(intent.path("request")),
                request);
          }
          // A legitimate unrelated observation supersedes an outstanding refresh intent.
          committed.progress().remove("observationRefresh");
          repository.save(committed);
          return result;
        });
  }

  public sealed interface Consumption permits WonConsumption, AlreadyConsumed {}

  public record WonConsumption(ObjectNode context, JsonNode proposal, ObjectNode ledger)
      implements Consumption {}

  public record AlreadyConsumed(ObjectNode ledger) implements Consumption {}

  /** No ambient REQUIRED transaction can manufacture post-commit send authority. */
  public Consumption consume(
      Authentication controller, String id, long fence, String key, JsonNode request) {
    require(
        !org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    contracts.validate("v2/commands#/definitions/advance", request);
    path(id, request);
    key(key);
    GuidedInternalSecurity.requireRole(controller, "backend-controller");
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          owner(controller, "backend-controller", session, fence);
          active(session);
          access.checkSourceCurrent(session.document());
          require(
              v2(session.document()) && request.path("ownerFence").asLong() == fence,
              "STALE_FENCE",
              409);
          ObjectNode action = action(id, request.path("admissionId").asText());
          require(
              action.path("ownerFence").asLong() == fence
                  && action.path("operationHash").equals(request.path("operationHash")),
              "STALE_FENCE",
              409);
          String digest = GuidedContracts.hash(request);
          JsonNode duplicate = repository.duplicate(id, "v2-consume", key, digest);
          if (duplicate != null) {
            return new AlreadyConsumed(action.deepCopy());
          }
          if (action.path("dispatchCount").asInt() == 1) {
            repository.command(id, "v2-consume", key, digest, action);
            return new AlreadyConsumed(action.deepCopy());
          }
          require(
              state(session).equals("ACTING")
                  && action.path("state").asText().equals("ADMITTED")
                  && action.path("evidenceHash").equals(session.progress().path("evidenceHash")),
              "STALE_GENERATION",
              409);
          ObjectNode context = materialization.context(session.document());
          preparations.checkUnexpired(action, clock.instant());
          JsonNode proposal =
              repository.proposal(action.path("admission").path("admissionId").asText());
          bindings.validateAction(session.document(), proposal, context);
          action.put("state", "DISPATCHING").put("dispatchCount", 1);
          repository.saveAction(action);
          // Historical ledger only. The WonConsumption discriminator is NEVER cached.
          repository.command(id, "v2-consume", key, digest, action);
          return new WonConsumption(context, proposal, action.deepCopy());
        });
  }

  public JsonNode outcomeV2(
      Authentication worker, String id, long fence, String key, JsonNode request) {
    contracts.validate("v2/bridge#/definitions/outcome", request);
    path(id, request);
    return internal(
        worker,
        "owning-worker",
        id,
        fence,
        "outcomes-v2",
        key,
        request,
        session -> {
          materialization.verify(session.document(), request);
          ObjectNode report = (ObjectNode) request.path("ledger");
          path(id, report);
          ObjectNode stored = action(id, report.path("admission").path("admissionId").asText());
          ledger.verifyReport(stored, report);
          require(stored.path("ownerFence").asLong() == fence, "STALE_FENCE", 409);
          JsonNode proposal =
              repository.proposal(report.path("admission").path("admissionId").asText());
          String kind = proposal.path("operation").path("kind").asText();
          require(
              kind.equals("assert")
                  ? !report.path("state").asText().equals("SUCCEEDED")
                      || report.path("assertionPassed").asBoolean()
                  : report.path("assertionPassed").isNull(),
              "INVALID_CONTRACT",
              422);
          require(
              stored.equals(report) || stored.path("state").asText().equals("DISPATCHING"),
              "UNKNOWN_OUTCOME",
              409);
          if (kind.equals("read") && report.path("state").asText().equals("SUCCEEDED")) {
            bindings.successfulRead(
                session.document(),
                proposal,
                report,
                request.path("availability"),
                materialization.context(session.document()));
          } else {
            require(request.path("availability").isNull(), "INVALID_CONTRACT", 422);
          }
          if (stored.equals(report)) {
            return session.document().deepCopy();
          }
          repository.saveAction(report);
          if (report.path("state").asText().equals("SUCCEEDED")) {
            session.document().put("state", "OBSERVING");
          } else {
            stop(session, report.path("state").asText());
          }
          repository.save(session);
          return session.document().deepCopy();
        });
  }

  public JsonNode lifecycle(
      Authentication worker, String id, long fence, String key, JsonNode request) {
    contracts.validate("v2/bridge#/definitions/lifecycle", request);
    path(id, request);
    return internal(
        worker,
        "owning-worker",
        id,
        fence,
        "lifecycle",
        key,
        request,
        session -> {
          materialization.verify(session.document(), request);
          boolean uncertain =
              repository.actions(id).stream()
                  .anyMatch(a -> a.path("state").asText().equals("DISPATCHING"));
          stop(session, uncertain ? "UNKNOWN_OUTCOME" : "FAILED");
          return session.document().deepCopy();
        });
  }

  private JsonNode internal(
      Authentication caller,
      String role,
      String id,
      long fence,
      String route,
      String key,
      JsonNode request,
      Function<GuidedSessionRepository.Session, JsonNode> transition) {
    GuidedInternalSecurity.requireRole(caller, role);
    key(key);
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          access.checkCurrent(session.document());
          owner(caller, role, session, fence);
          String digest = GuidedContracts.hash(request);
          JsonNode duplicate = repository.duplicate(id, route, key, digest);
          if (duplicate != null) {
            if (route.equals("admissions") || route.equals("advance")) {
              return action(id, duplicate.path("admission").path("admissionId").asText());
            }
            if (route.equals("observations") || route.equals("outcomes")) {
              return session.document().deepCopy();
            }
            return duplicate;
          }
          active(session);
          try {
            if (Set.of(
                    "admissions",
                    "advance",
                    "observations",
                    "model-reserve",
                    "step-complete",
                    "clarification",
                    "finalize")
                .contains(route)) {
              access.checkSourceCurrent(session.document());
            }
          } catch (GuidedSessionException failure) {
            if (!route.equals("finalize")
                || !state(session).equals("FINALIZING")
                || !failure.getMessage().equals("REVISION_CONFLICT")) {
              throw failure;
            }
            stop(session, "PUBLICATION_CONFLICT");
            JsonNode response = result(session);
            repository.command(id, route, key, digest, response);
            return response;
          }
          JsonNode response = transition.apply(session);
          repository.command(id, route, key, digest, response);
          return response;
        });
  }

  private void owner(
      Authentication caller, String role, GuidedSessionRepository.Session session, long fence) {
    JsonNode owner = session.document().path("owner");
    require(
        owner.path("fence").asLong() == fence
            && Instant.parse(owner.path("leaseExpiresAt").asText()).isAfter(clock.instant()),
        "STALE_FENCE",
        409);
    if (role.equals("owning-worker")) {
      require(caller.getName().equals(owner.path("workerId").asText()), "FORBIDDEN_SCOPE", 403);
    }
  }

  private void active(GuidedSessionRepository.Session session) {
    require(
        !terminal(session),
        state(session).equals("UNKNOWN_OUTCOME")
            ? "UNKNOWN_OUTCOME"
            : state(session).equals("CANCELLED")
                ? "CANCELLED"
                : state(session).equals("EXPIRED") ? "EXPIRED" : "PUBLICATION_CONFLICT",
        409);
    require(
        Instant.parse(session.document().path("expiresAt").asText()).isAfter(clock.instant()),
        "EXPIRED",
        409);
  }

  /**
   * Publication owns the ready commit; reuse existing monotone teardown only after that proof
   * exists.
   */
  public void publicationCommitted(String id) {
    require(
        org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    var session = repository.lock(id);
    require(
        state(session).equals("SUCCEEDED")
            && session.progress().path("publicationRevisionId").isTextual(),
        "PUBLICATION_CONFLICT",
        409);
    if (!session.progress().has("teardownStatus")) {
      stop(session, "SUCCEEDED");
    }
  }

  private void stop(GuidedSessionRepository.Session session, String state) {
    ObjectNode stoppedContext = null;
    if (materialization != null && v2(session.document())) {
      try {
        stoppedContext = materialization.context(session.document());
      } catch (GuidedSessionException ignored) {
        /* A pending assignment still needs monotone stop before context/browser creation. */
      }
      if (stoppedContext == null && assignments != null) {
        stoppedContext = assignments.find(session.document().path("sessionId").asText());
      }
    }
    final ObjectNode notifyContext = stoppedContext;
    if (notifyContext != null) {
      session.progress().put("teardownStatus", "PENDING");
      if (stopSender != null) {
        org.springframework.transaction.support.TransactionSynchronizationManager
            .registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                  @Override
                  public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) {
                      return;
                    }
                    java.util.concurrent.CompletableFuture.runAsync(
                        () -> {
                          try {
                            stopSender.accept(
                                notifyContext,
                                java.util.Set.of("CANCELLED", "EXPIRED").contains(state)
                                    ? state
                                    : "UNKNOWN_OUTCOME");
                            repository.transaction(
                                () -> {
                                  var stopped =
                                      repository.lock(notifyContext.path("sessionId").asText());
                                  if (terminal(stopped)) {
                                    stopped.progress().put("teardownStatus", "CONFIRMED");
                                    repository.save(stopped);
                                  }
                                  return null;
                                });
                          } catch (RuntimeException ignored) {
                            /* A lost acknowledgement never confirms teardown. */
                          }
                        });
                  }
                });
      }
    }
    session.document().put("state", state);
    for (ObjectNode action : repository.actions(session.document().path("sessionId").asText())) {
      if (action.path("state").asText().equals("ADMITTED")) {
        action.put("state", "REVOKED").put("outcomeCode", "CANCELLED");
        repository.saveAction(action);
      } else if (action.path("state").asText().equals("DISPATCHING")) {
        action.put("state", "UNKNOWN_OUTCOME").put("outcomeCode", "ACK_LOST");
        repository.saveAction(action);
      }
    }
    if (materialization != null && v2(session.document())) {
      materialization.stop(session.document().path("sessionId").asText());
      assignments.stop(session.document().path("sessionId").asText());
    }
    repository.save(session);
  }

  private ObjectNode action(String id, String admission) {
    return repository.actions(id).stream()
        .filter(a -> a.path("admission").path("admissionId").asText().equals(admission))
        .findFirst()
        .orElseThrow(() -> new GuidedSessionException("FORBIDDEN_SCOPE", 403));
  }

  private static void reserve(
      GuidedSessionRepository.Session session, String counter, int amount, String maximum) {
    ObjectNode counters = (ObjectNode) session.document().path("counters");
    long next = counters.path(counter).asLong() + amount;
    require(
        amount >= 0 && next <= session.document().path("limits").path(maximum).asLong(),
        "BUDGET_EXCEEDED",
        429);
    counters.put(counter, next);
  }

  private static void key(String key) {
    require(key != null && !key.isBlank() && key.length() <= 256, "INVALID_CONTRACT", 422);
  }

  private static void path(String id, JsonNode body) {
    require(id.equals(body.path("sessionId").asText()), "INVALID_CONTRACT", 422);
  }

  private static void scoped(GuidedSessionRepository.Session s, JsonNode body) {
    require(s.document().path("scopeHash").equals(body.path("scopeHash")), "FORBIDDEN_SCOPE", 403);
  }

  private static String state(GuidedSessionRepository.Session s) {
    return s.document().path("state").asText();
  }

  private static boolean terminal(GuidedSessionRepository.Session s) {
    return TERMINAL.contains(state(s));
  }

  private ObjectNode view(JsonNode session) {
    ObjectNode out = contracts.object();
    for (String f :
        List.of("schemaVersion", "sessionId", "testId", "state", "expiresAt", "counters")) {
      out.set(f, session.path(f).deepCopy());
    }
    contracts.validate("session-view", out);
    return out;
  }

  private ObjectNode result(GuidedSessionRepository.Session session) {
    ObjectNode out = contracts.object();
    out.put("schemaVersion", session.document().path("schemaVersion").asInt())
        .put("executionId", session.document().path("sessionId").asText())
        .put("sessionId", session.document().path("sessionId").asText());
    out.set("scopeHash", session.document().path("scopeHash"));
    boolean completed =
        session.progress().path("stepIndex").asInt()
                == session.document().path("sourceSteps").size()
            && repository.actions(session.document().path("sessionId").asText()).stream()
                .allMatch(action -> action.path("state").asText().equals("SUCCEEDED"));
    out.put("assertionsPassed", completed).put("scheduleActivated", false).putNull("evidenceRef");
    if (session.progress().has("evidenceRef")) {
      out.set("evidenceRef", session.progress().path("evidenceRef"));
    }
    out.putArray("actionTimings");
    out.put("mode", "guided")
        .put("outcome", state(session))
        .put("learnedFromThisRun", false)
        .put("replayVerified", false)
        .putNull("readyRevisionId")
        .put(
            "errorCode",
            state(session).equals("FAILED")
                ? session.progress().path("errorCode").asText("INVALID_CONTRACT")
                : state(session));
    contracts.validate("result", out);
    return out;
  }
}
